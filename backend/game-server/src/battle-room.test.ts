import type { Client } from '@colyseus/core';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { applyEvents, hashState, newMatch, type Event, type PublicState, type Team } from '@eldritch-alley/engine';
import { SignJWT, exportPKCS8, exportSPKI, generateKeyPair, importPKCS8 } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BattleRoom, resolveHumanAction } from './battle-room';
import { MAPS, MATCH_SEED, createMatchSetup, mapIndex } from './map';
import { MESSAGE, PROTOCOL_VERSION, ROOM_NAME, type StateMessage } from './protocol';
import { InMemoryMatchEndedPublisher, type MatchEndedPublisher } from './queue';
import { GAME_TICKET_ISSUER } from './ticket';

/** Every test file boots its own server, so each one needs a port of its own. */
const TEST_PORT = 2568;

let server: ColyseusTestServer;

beforeAll(async () => {
  server = await boot(
    {
      initializeGameServer: (gameServer) => {
        gameServer.define(ROOM_NAME, BattleRoom);
      },
    },
    TEST_PORT,
  );
});

afterAll(async () => {
  await server.cleanup();
  await server.shutdown();
});

function currentTeam(state: PublicState): Team | undefined {
  const id = state.initiative[state.currentIndex];
  return state.units.find((unit) => unit.id === id)?.team;
}

/** The window is 120 s in a live match; a test cannot wait that long. */
function shortenReconnectionWindow(room: BattleRoom, seconds: number): void {
  const allow = room.allowReconnection.bind(room);
  (room as unknown as { allowReconnection: (client: Client, seconds: number) => unknown }).allowReconnection = (
    client: Client,
  ) => allow(client, seconds);
}

describe('resolveHumanAction', () => {
  it('refuses a malformed action with malformed-action, without throwing', () => {
    const state = newMatch(createMatchSetup(MATCH_SEED));

    const outcome = resolveHumanAction(state, 'A', { type: 'move' } as never);

    expect(outcome).toEqual({ ok: false, reason: 'malformed-action' });
  });

  it('accepts an action while a human unit is on turn', () => {
    const state = newMatch(createMatchSetup(MATCH_SEED));

    const outcome = resolveHumanAction(state, 'A', { type: 'endTurn', round: state.round });

    expect(outcome.ok).toBe(true);
  });

  it('answers not-your-turn while a bot unit is on turn', () => {
    const initial = newMatch(createMatchSetup(MATCH_SEED));
    const botOnTurn = {
      ...initial,
      initiative: ['B-sniper', ...initial.initiative.filter((id) => id !== 'B-sniper')],
      currentIndex: 0,
    };

    const outcome = resolveHumanAction(botOnTurn, 'A', {
      type: 'endTurn',
      round: botOnTurn.round,
    });

    expect(outcome).toEqual({ ok: false, reason: 'not-your-turn' });
  });
});

describe('BattleRoom', () => {
  // `maxClients = 1` (set in `onCreate`) is what actually refuses a second human now: Colyseus locks
  // the room once the first one joins, and rejects a further `joinById` before `BattleRoom.onJoin`
  // ever runs, with its own `ServerError` ("room ... is locked"). The client no longer reads this
  // exact wording for the same-browser case — that is now decided before the server is even asked,
  // client-side, by `frontend/src/net/tab-lock.ts` — nor for a second real player, who now gets a
  // room of their own instead of this rejection. The `onJoin` guard below (`humanSessionId`) stays
  // as cheap defense in depth, but is not exercised by this test: it is unreachable through either
  // real join path once `maxClients` is doing its job.
  it('refuses a second human because the room is locked', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const first = await server.connectTo(room);
    first.reconnection.enabled = false;

    await expect(server.sdk.joinById(room.roomId)).rejects.toThrow(/is locked/);
    expect(room.clients).toHaveLength(1);

    await first.leave(true);
  }, 20_000);

  it('refuses a new match once the process-wide cap is reached, and accepts one again once a slot frees up', async () => {
    // `maxConcurrentMatches` here plays the role `main.ts` has `gameServer.define`'s default options
    // play in production: in a real deploy a client cannot raise this, because the server's default
    // always wins the merge (see the comment in `main.ts`). The test harness has no such default, so
    // passing it as "client" options is how a single test keeps the cap small enough to hit.
    const atCapacity = await server.createRoom<BattleRoom>(ROOM_NAME, { maxConcurrentMatches: 1 });

    await expect(server.createRoom<BattleRoom>(ROOM_NAME, { maxConcurrentMatches: 1 })).rejects.toThrow(
      /1 matches open/,
    );

    // Disposing the one open match frees its slot: this is `onDispose` decrementing the module-level
    // counter `onCreate` increments, not a config change, so the cap itself is still 1.
    await atCapacity.disconnect();

    const afterASlotFrees = await server.createRoom<BattleRoom>(ROOM_NAME, { maxConcurrentMatches: 1 });
    expect(afterASlotFrees.roomId).not.toBe(atCapacity.roomId);
  }, 20_000);

  it('lets the bot play until it is the human turn again', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const human = await server.connectTo(room);
    human.reconnection.enabled = false;

    const states: StateMessage[] = [];
    const events: Event[] = [];
    human.onMessage(MESSAGE.state, (message: StateMessage) => states.push(message));
    human.onMessage(MESSAGE.events, (batch: Event[]) => events.push(...batch));

    // The state sent on join proves the handlers are wired before anything else is sent.
    await vi.waitFor(() => expect(states.length).toBeGreaterThan(0));

    const lastState = (): StateMessage => states[states.length - 1];
    const botActed = (): boolean =>
      events.some((event) => {
        if (!('actor' in event)) return false;
        return lastState().state.units.find((unit) => unit.id === event.actor)?.team === 'B';
      });

    /** Hands the turn over and waits for the room to answer with the next state. */
    const endHumanTurn = async (): Promise<void> => {
      const before = states.length;
      human.send(MESSAGE.action, { type: 'endTurn', round: lastState().state.round });
      await vi.waitFor(() => expect(states.length).toBeGreaterThan(before), { timeout: 10_000 });
    };

    // The human's units may be the first three in the initiative, so a single hand-over is not
    // guaranteed to reach the bot: keep ending turns until the bot has played one.
    for (let handovers = 0; handovers < 6 && !botActed(); handovers += 1) {
      await endHumanTurn();
    }

    expect(botActed()).toBe(true);
    expect(currentTeam(lastState().state)).toBe('A');

    await human.leave(true);
  }, 20_000);

  it('sends the state again when the client reconnects inside the window', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const human = await server.connectTo(room);
    human.reconnection.enabled = false;

    await human.waitForMessage(MESSAGE.state, 5_000);
    const token = human.reconnectionToken;

    await human.leave(false);
    const reconnected = await server.sdk.reconnect(token);
    reconnected.reconnection.enabled = false;
    const message = (await reconnected.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;

    expect(message.version).toBe(PROTOCOL_VERSION);
    expect(message.state.initiative.length).toBeGreaterThan(0);

    await reconnected.leave(true);
  }, 20_000);

  it('sends a maximum health for every unit of the state', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const human = await server.connectTo(room);
    human.reconnection.enabled = false;

    const message = (await human.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;

    expect(message.state.units.length).toBeGreaterThan(0);
    for (const unit of message.state.units) {
      expect(unit.maxHealth).toBeGreaterThan(0);
    }

    await human.leave(true);
  }, 20_000);

  it('names the map of the match in every state message', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const human = await server.connectTo(room);
    human.reconnection.enabled = false;

    const message = (await human.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;

    // The board itself is no longer enough to draw a map: the client reads the terrain of the id it
    // is sent, so the id has to travel with the state that carries the seed it was drawn from. The
    // version is the one ADR 0016 §14 fixes for the shape this state now has.
    expect(PROTOCOL_VERSION).toBe(10);
    expect(message.version).toBe(10);
    expect(message.mapId).toBe(MAPS[mapIndex(message.state.seed)].id);

    await human.leave(true);
  }, 20_000);

  it('ends the match for the human when the reconnection window expires', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    shortenReconnectionWindow(room, 0.05);

    const human = await server.connectTo(room);
    human.reconnection.enabled = false;
    await human.waitForMessage(MESSAGE.state, 5_000);

    await human.leave(false);

    await vi.waitFor(() => expect(room.ended).toBe(true), { timeout: 5_000 });
    expect(room.winner).toBe('B');
  }, 20_000);
});

// --- Who is playing, and what a finished match hands over -----------------------------------------
//
// The keys are generated per run, the same arrangement `ticket.test.ts` uses, so no key in the
// repository is load bearing. Only the claim set is shared with the platform's issuer, and that is the
// point of the milestone: the match server checks a ticket without depending on the platform.

const USER_ID = '2d9a5c31-8b7e-4f6a-9c0d-1e2f3a4b5c6d';
const TICKET_ALGORITHM = 'EdDSA';
const TICKET_TTL_SECONDS = 300;

let publicKey: string;
let signingKey: string;
let foreignSigningKey: string;

beforeAll(async () => {
  const pair = await generateKeyPair(TICKET_ALGORITHM, { crv: 'Ed25519', extractable: true });
  publicKey = await exportSPKI(pair.publicKey);
  signingKey = await exportPKCS8(pair.privateKey);

  const foreign = await generateKeyPair(TICKET_ALGORITHM, { crv: 'Ed25519', extractable: true });
  foreignSigningKey = await exportPKCS8(foreign.privateKey);
});

async function ticket(
  overrides: { sub?: string; exp?: number } = {},
  signer = signingKey,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: TICKET_ALGORITHM })
    .setIssuer(GAME_TICKET_ISSUER)
    .setSubject(overrides.sub ?? USER_ID)
    .setIssuedAt(issuedAt)
    .setExpirationTime(overrides.exp ?? issuedAt + TICKET_TTL_SECONDS)
    .sign(await importPKCS8(signer, TICKET_ALGORITHM));
}

describe('BattleRoom — the player, the seed and the queue', () => {
  /** A room wired the way `main.ts` wires it in production, minus the queue's network. */
  async function roomWith(
    options: { publisher?: MatchEndedPublisher; publicKey?: string; seed?: number } = {},
  ): Promise<BattleRoom> {
    return server.createRoom<BattleRoom>(ROOM_NAME, options);
  }

  it('plays a guest match exactly as before, and hands nothing over', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const room = await roomWith({ publisher, publicKey });
    const guest = await server.connectTo(room);
    guest.reconnection.enabled = false;

    // The whole flow of a match with no ticket: the state arrives, the turn can be handed over, and
    // the room ends the match when the player leaves. Nothing about it is refused or degraded.
    const message = (await guest.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;
    expect(message.state.initiative.length).toBeGreaterThan(0);
    guest.send(MESSAGE.action, { type: 'endTurn', round: message.state.round });

    await guest.leave(true);
    await vi.waitFor(() => expect(room.ended).toBe(true), { timeout: 5_000 });

    // `finish` hands the match over before it tells anyone, so a match the room has ended is a match
    // already accounted for — which is what makes this assertion an assertion and not a race.
    expect(publisher.published).toEqual([]);
  }, 20_000);

  it('records the match of a player whose ticket it checked, once, from the player\'s own side', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const room = await roomWith({ publisher, publicKey });
    const human = await server.connectTo(room, { ticket: await ticket() });
    human.reconnection.enabled = false;

    const opened = (await human.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;
    await human.leave(true);
    await vi.waitFor(() => expect(publisher.published).toHaveLength(1), { timeout: 5_000 });

    const [recorded] = publisher.published;
    expect(recorded.userId).toBe(USER_ID);
    expect(recorded.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(recorded.seed).toBe(opened.state.seed);
    expect(recorded.mapId).toBe(opened.mapId);
    expect(recorded.protocolVersion).toBe(PROTOCOL_VERSION);
    // Leaving is a loss for the player who left (decision D8), and the winner is the other side.
    expect(recorded.winner).toBe('B');
    expect(recorded.result).toBe('lost');
    expect(recorded.units.map((unit) => unit.class)).toEqual(['sniper', 'wizard', 'priest']);
    expect(Date.parse(recorded.startedAt)).toBeLessThanOrEqual(Date.parse(recorded.endedAt));
  }, 20_000);

  it('hands the match over only once, however many times the room is told it is over', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const room = await roomWith({ publisher, publicKey });
    const human = await server.connectTo(room, { ticket: await ticket() });
    human.reconnection.enabled = false;

    await human.waitForMessage(MESSAGE.state, 5_000);
    await human.leave(true);
    await vi.waitFor(() => expect(publisher.published).toHaveLength(1), { timeout: 5_000 });

    // The same `ended` flag that stops a finished room from taking actions is what stops it from
    // publishing twice. Disposing the room is the last chance for a second one to slip out.
    await room.disconnect();
    expect(publisher.published).toHaveLength(1);
  }, 20_000);

  /**
   * A room nothing is in is disposed by Colyseus the moment the last seat reservation is dropped, and a
   * refused join drops one. That is housekeeping and not the claim of these cases, which is about the
   * join itself: keeping the room alive is what lets a second attempt be a real second attempt instead
   * of a "room not found" that would pass a `rejects` assertion for the wrong reason.
   */
  async function roomThatSurvivesARefusal(
    options: { publisher?: MatchEndedPublisher; publicKey?: string } = {},
  ): Promise<BattleRoom> {
    const room = await roomWith(options);
    room.autoDispose = false;
    return room;
  }

  it('refuses an expired ticket, and the same client then plays as a guest', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const room = await roomThatSurvivesARefusal({ publisher, publicKey });
    const expired = await ticket({ exp: Math.floor(Date.now() / 1000) - 1 });

    await expect(server.sdk.joinById(room.roomId, { ticket: expired })).rejects.toThrow();
    expect(room.clients).toHaveLength(0);

    // A ticket that does not check out costs the player the ticket and not the match: this is what
    // "signing in is offered, never required" means at the only place it could be enforced.
    const guest = await server.connectTo(room);
    guest.reconnection.enabled = false;
    await guest.waitForMessage(MESSAGE.state, 5_000);
    await guest.leave(true);
    await vi.waitFor(() => expect(room.ended).toBe(true), { timeout: 5_000 });

    expect(publisher.published).toEqual([]);
  }, 20_000);

  it('refuses a ticket signed by another key', async () => {
    const room = await roomThatSurvivesARefusal({ publisher: new InMemoryMatchEndedPublisher(), publicKey });
    const elsewhere = await ticket({}, foreignSigningKey);

    await expect(server.sdk.joinById(room.roomId, { ticket: elsewhere })).rejects.toThrow();
    expect(room.clients).toHaveLength(0);
  }, 20_000);

  /**
   * The fail-safe, and the one that matters most. A server with no public key cannot tell a real ticket
   * from one a player wrote, so it must trust neither — and must not quietly turn the offer of a ticket
   * into an unverified claim of identity. A guest is still welcome.
   */
  it('refuses every ticket when it holds no public key to check one against', async () => {
    const room = await roomThatSurvivesARefusal({ publisher: new InMemoryMatchEndedPublisher() });

    await expect(server.sdk.joinById(room.roomId, { ticket: await ticket() })).rejects.toThrow();
    expect(room.clients).toHaveLength(0);

    const guest = await server.connectTo(room);
    guest.reconnection.enabled = false;
    await guest.waitForMessage(MESSAGE.state, 5_000);
    await guest.leave(true);
  }, 20_000);

  it('refuses a join whose ticket is not a string', async () => {
    const room = await roomThatSurvivesARefusal({ publisher: new InMemoryMatchEndedPublisher(), publicKey });

    // One room for all four, so that each refusal is a refusal and not a room that has already gone.
    for (const notATicket of [42, '', null, { sub: USER_ID }]) {
      await expect(server.sdk.joinById(room.roomId, { ticket: notATicket })).rejects.toThrow();
    }
    expect(room.clients).toHaveLength(0);
  }, 20_000);

  /**
   * The seed decides the whole match — the board, the classes and every roll — so a room handed one
   * plays that match and no other. Production never hands one in (the room draws it); this exists so a
   * test can ask for a match whose outcome it already knows.
   */
  it('plays the match of the seed it was given, and draws one when it is given none', async () => {
    const seeded = await roomWith({ seed: MATCH_SEED });
    const seededClient = await server.connectTo(seeded);
    seededClient.reconnection.enabled = false;
    const message = (await seededClient.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;

    expect(message.state.seed).toBe(MATCH_SEED);
    expect(message.mapId).toBe(MAPS[mapIndex(MATCH_SEED)].id);
    await seededClient.leave(true);

    const drawn = await roomWith({});
    const drawnClient = await server.connectTo(drawn);
    drawnClient.reconnection.enabled = false;
    const drawnMessage = (await drawnClient.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;

    expect(drawnMessage.state.seed).toBeGreaterThanOrEqual(0);
    expect(drawnMessage.state.seed).toBeLessThan(2 ** 32);
    await drawnClient.leave(true);
  }, 20_000);

  /**
   * The spec's case, and the reason the message carries the whole match rather than a summary: the
   * events the room applied are enough to rebuild, from the setup the seed names, the exact state whose
   * hash the message carries. The match server proves it here; the platform proves that the database
   * hands the same events back.
   */
  it('hands over events that rebuild the very state it hashed', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const room = await roomWith({ publisher, publicKey, seed: MATCH_SEED });
    const human = await server.connectTo(room, { ticket: await ticket() });
    human.reconnection.enabled = false;

    const states: StateMessage[] = [];
    human.onMessage(MESSAGE.state, (message: StateMessage) => states.push(message));
    await vi.waitFor(() => expect(states.length).toBeGreaterThan(0));

    // A few turns, so the match has both sides' actions in it and not just the opening state.
    for (let turns = 0; turns < 3; turns += 1) {
      const before = states.length;
      human.send(MESSAGE.action, { type: 'endTurn', round: states[states.length - 1].state.round });
      await vi.waitFor(() => expect(states.length).toBeGreaterThan(before), { timeout: 10_000 });
    }

    await human.leave(true);
    await vi.waitFor(() => expect(publisher.published).toHaveLength(1), { timeout: 5_000 });

    const [recorded] = publisher.published;
    expect(recorded.events.length).toBeGreaterThan(0);
    expect(hashState(applyEvents(createMatchSetup(recorded.seed), recorded.events))).toBe(
      recorded.finalStateHash,
    );
  }, 30_000);

  /**
   * A queue that is away must not fail a match that is over. The player has seen the result and the
   * room has nothing left to decide, so the failure is logged with the match id — where an operator can
   * find it — and nowhere else.
   */
  it('ends the match even when the queue refuses the message', async () => {
    const refusal = new Error('the queue is away');
    const failing: MatchEndedPublisher = { publish: () => Promise.reject(refusal) };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const room = await roomWith({ publisher: failing, publicKey });
      const broadcast = vi.spyOn(room, 'broadcast');
      const human = await server.connectTo(room, { ticket: await ticket() });
      human.reconnection.enabled = false;

      await human.waitForMessage(MESSAGE.state, 5_000);
      await human.leave(true);
      await vi.waitFor(() => expect(room.ended).toBe(true), { timeout: 5_000 });

      expect(room.winner).toBe('B');
      // The client was told the match was over, which is the part the player depends on.
      expect(broadcast.mock.calls.some(([type]) => type === MESSAGE.ended)).toBe(true);
      await vi.waitFor(
        () => expect(logged).toHaveBeenCalledWith(expect.stringContaining(room.matchId), refusal),
        { timeout: 5_000 },
      );
    } finally {
      logged.mockRestore();
    }
  }, 20_000);

  it('keeps a guest\'s match and a signed-in player\'s match apart', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const guestsRoom = await roomWith({ publisher, publicKey });
    const playersRoom = await roomWith({ publisher, publicKey });

    // Each one is awaited on its own state before the next joins: a client drops the state it is not
    // listening for, and the state arrives once, on joining.
    const guest = await server.connectTo(guestsRoom);
    guest.reconnection.enabled = false;
    const guestBoard = (await guest.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;

    const player = await server.connectTo(playersRoom, { ticket: await ticket() });
    player.reconnection.enabled = false;
    const playerBoard = (await player.waitForMessage(MESSAGE.state, 5_000)) as StateMessage;

    // Two separate matches, not one shared board: neither player is in the other's room.
    expect(guestBoard.version).toBe(PROTOCOL_VERSION);
    expect(playerBoard.version).toBe(PROTOCOL_VERSION);
    expect(guestsRoom.roomId).not.toBe(playersRoom.roomId);

    await guest.leave(true);
    await player.leave(true);

    await vi.waitFor(() => expect(publisher.published).toHaveLength(1), { timeout: 5_000 });
    expect(publisher.published[0].userId).toBe(USER_ID);
  }, 20_000);
});
