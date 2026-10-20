// Plays a whole match against the bot through the protocol, with no browser: a scripted human client
// that attacks whenever it can, otherwise closes on the nearest enemy, otherwise ends its turn.
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import {
  abilityById,
  applyAction,
  applyEvents,
  hashState,
  publicState,
  type AbilityDefinition,
  type Action,
  type Event,
  type MatchSetup,
  type MatchState,
  type Position,
  type UnitState,
} from '@eldritch-alley/engine';
import { SignJWT, exportPKCS8, exportSPKI, generateKeyPair, importPKCS8 } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BattleRoom } from './battle-room';
import { MATCH_SEED, createMatchSetup } from './map';
import {
  MESSAGE,
  ROOM_NAME,
  type ClientAction,
  type EndedMessage,
  type RejectedMessage,
  type StateMessage,
} from './protocol';
import { InMemoryMatchEndedPublisher } from './queue';
import { GAME_TICKET_ISSUER } from './ticket';

/** Every test file boots its own server, so each one needs a port of its own. */
const TEST_PORT = 2569;

/** The scripted human gives up after this many actions; a match that needs more has stalled. */
const ACTION_LIMIT = 500;
const MATCH_TIMEOUT_MS = 60_000;

const NEIGHBOUR_OFFSETS: readonly { x: number; y: number }[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

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

// The keys are generated per run, as in `battle-room.test.ts`: no key in the repository is load bearing.
const USER_ID = '2d9a5c31-8b7e-4f6a-9c0d-1e2f3a4b5c6d';
const TICKET_ALGORITHM = 'EdDSA';
const TICKET_TTL_SECONDS = 300;

let publicKey: string;
let signingKey: string;

beforeAll(async () => {
  const pair = await generateKeyPair(TICKET_ALGORITHM, { crv: 'Ed25519', extractable: true });
  publicKey = await exportSPKI(pair.publicKey);
  signingKey = await exportPKCS8(pair.privateKey);
});

async function ticket(): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: TICKET_ALGORITHM })
    .setIssuer(GAME_TICKET_ISSUER)
    .setSubject(USER_ID)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TICKET_TTL_SECONDS)
    .sign(await importPKCS8(signingKey, TICKET_ALGORITHM));
}

function unitOnTurn(state: MatchState): UnitState | undefined {
  return state.units.find((unit) => unit.id === state.initiative[state.currentIndex]);
}

function livingEnemies(state: MatchState, actor: UnitState): UnitState[] {
  return state.units.filter((unit) => unit.team !== actor.team && !unit.defeated);
}

/** Chebyshev distance to the closest enemy, or Infinity when none is left. */
function distanceToNearest(position: Position, enemies: readonly UnitState[]): number {
  let nearest = Infinity;
  for (const enemy of enemies) {
    const distance = Math.max(Math.abs(enemy.position.x - position.x), Math.abs(enemy.position.y - position.y));
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/** Steps that close on the nearest enemy; never steps away from it. */
function approachAction(state: MatchState, actor: UnitState, enemies: readonly UnitState[]): Action | null {
  const current = distanceToNearest(actor.position, enemies);
  let best: { action: Action; distance: number; level: number } | null = null;

  for (const offset of NEIGHBOUR_OFFSETS) {
    const to = { x: actor.position.x + offset.x, y: actor.position.y + offset.y };
    const action: Action = { type: 'move', actor: actor.id, to };
    if (!applyAction(state, action).ok) continue;

    const distance = distanceToNearest(to, enemies);
    if (distance > current) continue;

    const level = state.board.levels[to.y * state.board.width + to.x];
    if (!best || distance < best.distance || (distance === best.distance && level > best.level)) {
      best = { action, distance, level };
    }
  }

  return best?.action ?? null;
}

/**
 * The first complete cast of `ability` the engine accepts, scanned in reading order. `target` names a
 * fallen ally for a revive. The scan is a test's stand-in for a player's aim: every cell is offered to
 * the engine, and the engine alone decides which one the rules allow.
 */
function firstLegalCast(
  state: MatchState,
  actor: UnitState,
  ability: AbilityDefinition,
  target?: string,
): Action | null {
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) {
      const cast: Action = {
        type: 'useAbility',
        actor: actor.id,
        abilityId: ability.id,
        to: { x, y },
        ...(target === undefined ? {} : { target }),
      };
      if (applyAction(state, cast).ok) return cast;
    }
  }
  return null;
}

/**
 * The scripted human's action. `once` is the set of the new kinds it has already tried, so a whole match
 * casts each of them exactly once: without it a revive loop would never let the match end, and the full
 * match above keeps its old, faster script by passing no set at all.
 */
function chooseHumanAction(
  state: MatchState,
  actor: UnitState,
  once: Set<string> | null = null,
): Action {
  const enemies = livingEnemies(state, actor);

  if (once !== null) {
    for (const abilityId of actor.abilities.activeSets) {
      if (abilityId === null || once.has(abilityId)) continue;
      const ability = abilityById(state.catalog, abilityId);
      if (!ability) continue;

      // Camouflage is cast on the caster's own cell and mud at its feet: both are legal wherever it
      // stands, and both prove a cast of their kind crosses the protocol and reaches the engine.
      if (ability.effect.kind === 'camouflage' || ability.effect.kind === 'terrain') {
        const cast = firstLegalCast(state, actor, ability);
        if (cast) {
          once.add(abilityId);
          return cast;
        }
      }

      if (ability.effect.kind === 'revive') {
        const fallen = state.units.find(
          (unit) => unit.team === actor.team && unit.defeated && !unit.permanentlyDead,
        );
        if (fallen) {
          const cast = firstLegalCast(state, actor, ability, fallen.id);
          if (cast) {
            once.add(abilityId);
            return cast;
          }
        }
      }
    }
  }

  // A damage ability first, aimed at the cell of an enemy the script can see: the human casts whenever
  // the server accepts the cast, so a whole match walks through the new action as well.
  //
  // A heal is deliberately left out. It heals every living unit standing in its area, the enemy it is
  // aimed at included (ADR 0016 §12), so a script that always cast it would spend the match undoing its
  // own damage and never reach `ended`.
  for (const abilityId of actor.abilities.activeSets) {
    const ability = abilityId === null ? undefined : abilityById(state.catalog, abilityId);
    if (!ability || ability.effect.kind !== 'damage') continue;

    for (const enemy of enemies) {
      const cast: Action = {
        type: 'useAbility',
        actor: actor.id,
        abilityId: ability.id,
        to: enemy.position,
      };
      if (applyAction(state, cast).ok) return cast;
    }
  }

  for (const enemy of enemies) {
    const attack: Action = { type: 'attack', actor: actor.id, target: enemy.id };
    if (applyAction(state, attack).ok) return attack;
  }

  return approachAction(state, actor, enemies) ?? { type: 'endTurn', actor: actor.id, round: state.round };
}

function toClientAction(action: Action): ClientAction {
  switch (action.type) {
    case 'move':
      return { type: 'move', to: action.to };
    case 'attack':
      return { type: 'attack', target: action.target };
    case 'useAbility':
      return {
        type: 'useAbility',
        abilityId: action.abilityId,
        to: action.to,
        // Absent, not undefined-valued: the protocol's spelling of "this cast names no unit".
        ...(action.target === undefined ? {} : { target: action.target }),
      };
    case 'reload':
      return { type: 'reload' };
    case 'endTurn':
      return { type: 'endTurn', round: action.round };
  }
}

describe('a full match against the bot', () => {
  it('reaches ended, and the events replay to the last state', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const client = await server.connectTo(room);
    client.reconnection.enabled = false;

    // The room draws the map at random, so the setup is only known from the seed the first state carries.
    // Every later state is then rebuilt by replaying the events onto that setup.
    let setup: MatchSetup | null = null;
    const events: Event[] = [];
    const replay = (): MatchState => {
      if (setup === null) throw new Error('no state has arrived yet');
      return applyEvents(setup, events);
    };
    let latest: StateMessage | null = null;
    let ended = false;
    let sent = 0;
    let failure: Error | null = null;

    const finished = new Promise<EndedMessage>((resolve) => {
      client.onMessage(MESSAGE.ended, (message: EndedMessage) => {
        ended = true;
        resolve(message);
      });
    });

    const act = (): void => {
      if (ended || failure || latest === null) return;
      if (sent >= ACTION_LIMIT) {
        failure = new Error(`the match did not end within ${ACTION_LIMIT} actions`);
        return;
      }

      const actor = unitOnTurn(replay());
      if (!actor || actor.team !== 'A') return;

      sent += 1;
      client.send(MESSAGE.action, toClientAction(chooseHumanAction(replay(), actor)));
    };

    client.onMessage(MESSAGE.events, (batch: Event[]) => events.push(...batch));
    client.onMessage(MESSAGE.state, (message: StateMessage) => {
      setup ??= createMatchSetup(message.state.seed);
      latest = message;
      act();
    });
    client.onMessage(MESSAGE.rejected, () => {
      // The scripted action was refused: hand the turn over instead of stalling.
      const state = replay();
      const actor = unitOnTurn(state);
      if (actor?.team === 'A') {
        client.send(MESSAGE.action, { type: 'endTurn', round: state.round });
      }
    });

    const result = await Promise.race([
      finished,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(failure ?? new Error('the match never reached ended')), MATCH_TIMEOUT_MS),
      ),
    ]);

    expect(failure).toBeNull();
    expect(['A', 'B']).toContain(result.winner);
    expect(sent).toBeLessThanOrEqual(ACTION_LIMIT);
    expect(events.some((event) => event.type === 'unit-defeated')).toBe(true);

    const last = latest as StateMessage | null;
    expect(last).not.toBeNull();
    expect(publicState(replay())).toEqual((last as StateMessage).state);

    await client.leave(true);
  }, 90_000);

  it('records a match whose events carry every new ability, and the replay hashes the same state', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const room = await server.createRoom<BattleRoom>(ROOM_NAME, {
      publisher,
      publicKey,
      seed: MATCH_SEED,
    });
    const client = await server.connectTo(room, { ticket: await ticket() });
    client.reconnection.enabled = false;

    let setup: MatchSetup | null = null;
    const events: Event[] = [];
    const replay = (): MatchState => {
      if (setup === null) throw new Error('no state has arrived yet');
      return applyEvents(setup, events);
    };
    let latest: StateMessage | null = null;
    let ended = false;
    let sent = 0;
    let failure: Error | null = null;
    // The new kinds are cast once each, so the match is bounded and still carries all three.
    const once = new Set<string>();

    const finished = new Promise<EndedMessage>((resolve) => {
      client.onMessage(MESSAGE.ended, (message: EndedMessage) => {
        ended = true;
        resolve(message);
      });
    });

    const act = (): void => {
      if (ended || failure || latest === null) return;
      if (sent >= ACTION_LIMIT) {
        failure = new Error(`the match did not end within ${ACTION_LIMIT} actions`);
        return;
      }

      const actor = unitOnTurn(replay());
      if (!actor || actor.team !== 'A') return;

      sent += 1;
      client.send(MESSAGE.action, toClientAction(chooseHumanAction(replay(), actor, once)));
    };

    client.onMessage(MESSAGE.events, (batch: Event[]) => events.push(...batch));
    client.onMessage(MESSAGE.state, (message: StateMessage) => {
      setup ??= createMatchSetup(message.state.seed);
      latest = message;
      act();
    });
    client.onMessage(MESSAGE.rejected, () => {
      const state = replay();
      const actor = unitOnTurn(state);
      if (actor?.team === 'A') {
        client.send(MESSAGE.action, { type: 'endTurn', round: state.round });
      }
    });

    await Promise.race([
      finished,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(failure ?? new Error('the match never reached ended')), MATCH_TIMEOUT_MS),
      ),
    ]);

    expect(failure).toBeNull();
    await vi.waitFor(() => expect(publisher.published).toHaveLength(1), { timeout: 5_000 });

    // The record the platform would store: the three new abilities are in its history, and replaying
    // that history lands on the state the room hashed.
    const [recorded] = publisher.published;
    const cast = recorded.events
      .filter((event) => event.type === 'ability-used')
      .map((event) => event.abilityId);
    expect(cast).toContain('camouflage');
    expect(cast).toContain('mud');
    expect(cast).toContain('resurrection');
    expect(hashState(applyEvents(createMatchSetup(recorded.seed), recorded.events))).toBe(
      recorded.finalStateHash,
    );
    expect(publicState(replay())).toEqual((latest as StateMessage).state);

    await client.leave(true);
  }, 90_000);
});

/**
 * The new action on the wire, on its own: a room, a connected client and one cast, so the path from the
 * socket through `isClientAction` and the engine is read without a whole match around it.
 */
describe('a cast through the protocol', () => {
  /**
   * A client on a fresh room, with everything the room sends collected as it arrives. `send` resolves
   * once the room has answered with the next state or with a refusal, so a test never waits blind.
   */
  async function connect() {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const client = await server.connectTo(room);
    client.reconnection.enabled = false;

    const states: StateMessage[] = [];
    const events: Event[] = [];
    const rejections: RejectedMessage[] = [];
    const waiters: (() => void)[] = [];
    const wake = (): void => {
      for (const resolve of waiters.splice(0)) resolve();
    };
    const next = (): Promise<void> => new Promise<void>((resolve) => waiters.push(resolve));

    client.onMessage(MESSAGE.state, (message: StateMessage) => {
      states.push(message);
      wake();
    });
    client.onMessage(MESSAGE.events, (batch: Event[]) => events.push(...batch));
    client.onMessage(MESSAGE.rejected, (message: RejectedMessage) => {
      rejections.push(message);
      wake();
    });

    // One state arrives on join, before anything is sent.
    while (states.length === 0) await next();

    const send = async (action: unknown): Promise<void> => {
      const before = states.length + rejections.length;
      client.send(MESSAGE.action, action);
      while (states.length + rejections.length === before) await next();
    };

    return { client, states, events, rejections, send };
  }

  /** The unit the room put on turn, read from the first state, which is the only unit a client may act with. */
  function unitOnTurnOf(state: StateMessage): UnitState {
    const id = state.state.initiative[state.state.currentIndex];
    const unit = state.state.units.find((candidate) => candidate.id === id);
    if (!unit) throw new Error(`no unit on turn: ${id}`);
    return unit;
  }

  it('accepts a cast, and the events sent with it replay to the state that follows', async () => {
    const { client, states, events, rejections, send } = await connect();
    const joined = states[0];
    const setup = createMatchSetup(joined.state.seed);
    const actor = unitOnTurnOf(joined);

    // Team A opens on its sniper, whatever map the room drew (the class order of the roster).
    expect(actor.team).toBe('A');
    expect(actor.abilities.activeSets[0]).toBe('piercing-shot');

    // Aimed at the caster's own cell. The radius of the shot is zero, so the caster is the only unit the
    // effect can reach and the cast is legal on whatever board the room picked.
    await send({ type: 'useAbility', abilityId: 'piercing-shot', to: actor.position });

    expect(rejections).toEqual([]);
    expect(states).toHaveLength(2);
    expect(events).toEqual([
      {
        type: 'ability-used',
        actor: actor.id,
        abilityId: 'piercing-shot',
        to: actor.position,
        rngState: expect.any(Number),
        resource: 'ammo',
      },
      // One target inside the effect, so one roll, and the shot is spent whether it lands or not.
      expect.objectContaining({ type: 'damaged', target: actor.id }),
    ]);

    // What the server was the authority over: the events it sent rebuild the state it sent afterwards.
    expect(publicState(applyEvents(setup, events))).toEqual(states[1].state);

    await client.leave(true);
  }, 30_000);

  it('refuses an id the caster does not carry, with the engine reason and no state', async () => {
    const { client, states, rejections, send } = await connect();
    const actor = unitOnTurnOf(states[0]);

    await send({ type: 'useAbility', abilityId: 'meteor', to: actor.position });

    expect(rejections).toEqual([{ reason: 'ability-unknown' }]);
    // A refusal changes nothing and sends nothing: the client keeps drawing the state it already had.
    expect(states).toHaveLength(1);

    await client.leave(true);
  }, 30_000);

  it('refuses a cast with no aim as malformed, before the engine ever sees it', async () => {
    const { client, states, rejections, send } = await connect();

    await send({ type: 'useAbility', abilityId: 'piercing-shot' });

    expect(rejections).toEqual([{ reason: 'malformed-action' }]);
    expect(states).toHaveLength(1);

    await client.leave(true);
  }, 30_000);
});
