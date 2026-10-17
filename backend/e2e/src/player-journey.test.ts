// One player's whole journey, through both backends and inside one process: they register, follow the
// link out of their mailbox, take a ticket, start a match, win it, and end up back where they started
// with the battle in their history.
//
// This is the only suite in the repository that may know both services at once. It lives in a workspace
// of its own that depends on the other two and is depended on by nobody, so neither backend learns
// about the other by having this file: the platform never imports the match server (m4-03 plan § 6) and
// the match server never imports the platform.
//
// What is real here: the real `AppModule` over a listening port, a real PostgreSQL, a real Colyseus
// server with the real room, and real sockets between the two. What is not: the mailer (a fake, or no
// case could read a link), the OAuth providers (a fake, because a test cannot reach GitHub), and the
// queue (one object, `./shared-queue`, which is both the room's publisher and the consumer's queue).
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import {
  abilityById,
  applyAction,
  applyEvents,
  type Action,
  type Event,
  type MatchSetup,
  type MatchState,
  type Position,
  type UnitState,
} from '@eldritch-alley/engine';
import { SignJWT, exportPKCS8, generateKeyPair, importPKCS8 } from 'jose';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BattleRoom } from '../../game-server/src/battle-room';
import { createMatchSetup } from '../../game-server/src/map';
import { type MatchEndedMessage } from '../../game-server/src/match-ended';
import {
  MESSAGE,
  ROOM_NAME,
  type ClientAction,
  type EndedMessage,
  type RejectedMessage,
  type StateMessage,
} from '../../game-server/src/protocol';
import { GAME_TICKET_ISSUER } from '../../game-server/src/ticket';
import { FakeProvider } from '../../platform-api/src/auth/fake.provider';
import { type ProviderProfile } from '../../platform-api/src/auth/provider';
import { SESSION_MAX_AGE_SECONDS, signSession } from '../../platform-api/src/auth/session';
import {
  CLIENT_ORIGIN,
  SESSION_COOKIE,
  cookieValue,
  setCookies,
  signIn,
  startTestApp,
  testTicketKeys,
  type TestApp,
} from '../../platform-api/src/auth/test-app';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from '../../platform-api/src/db/test-database';
import { encodeCursor } from '../../platform-api/src/matches/matches.service';
import { SharedMatchEndedQueue } from './shared-queue';

/** Every suite boots its own match server, so each one needs a port of its own. */
const TEST_PORT = 2570;

/**
 * The board the journey is played on, and the reason the win can be asserted rather than accepted.
 *
 * The room draws its seed from the clock, so a match is reproducible only when it is handed one. This
 * number was found by playing the scripted human against the bot over the engine alone, for every seed
 * from 1 to 60, and keeping the smallest one the human wins: 7, in 86 actions and 13 rounds. Nothing in
 * production passes a seed — the room draws one, and this is a default option like `maxConcurrentMatches`.
 */
const SEED = 7;

const PASSWORD = 'a password long enough to be a password';
/** The scripted human gives up after this many actions; a match that needs more has stalled. */
const ACTION_LIMIT = 500;
const MATCH_TIMEOUT_MS = 60_000;

/** The account a GitHub sign-in makes, which is how a case gets a player who has no password at all. */
const GITHUB_PROFILE: ProviderProfile = {
  providerUserId: 'gh-1',
  email: 'someone@github.test',
  emailVerified: true,
  displayName: 'Someone Elsewhere',
  avatarUrl: null,
};

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

// ── The scripted human, copied from `backend/game-server/src/integration.test.ts`: it casts a damage
// ability whenever it can, otherwise attacks, otherwise closes on the nearest enemy, otherwise ends its
// turn. Heals are deliberately left out — a heal in this catalog mends the enemy it is aimed at too, so
// a script that always cast it would spend the match undoing its own damage. It is copied rather than
// exported because that file is a suite and not a library.

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
    const distance = Math.max(
      Math.abs(enemy.position.x - position.x),
      Math.abs(enemy.position.y - position.y),
    );
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/** Steps that close on the nearest enemy; never steps away from it. */
function approachAction(
  state: MatchState,
  actor: UnitState,
  enemies: readonly UnitState[],
): Action | null {
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

function chooseHumanAction(state: MatchState, actor: UnitState): Action {
  const enemies = livingEnemies(state, actor);

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
      return { type: 'useAbility', abilityId: action.abilityId, to: action.to };
    case 'reload':
      return { type: 'reload' };
    case 'endTurn':
      return { type: 'endTurn', round: action.round };
  }
}

/** What the profile panel draws, which is all this suite reads out of `GET /me`. */
interface Me {
  user: { id: string; displayName: string; email: string | null; avatarUrl: string | null };
  agents: { id: string; class: string; level: number; status: string }[];
}

interface History {
  matches: { id: string; mapId: string; result: string; rounds: number; endedAt: string }[];
  nextCursor: string | null;
}

/** What a played match looked like from the client's side of the socket. */
interface Played {
  winner: string;
  events: Event[];
  lastState: StateMessage | null;
  actions: number;
  rejections: RejectedMessage[];
  failure: Error | null;
}

/** The client of a joined room, narrowed to what playing needs. */
interface MatchClient {
  onMessage(type: string, handler: (message: never) => void): void;
  send(type: string, message: unknown): void;
}

describe.skipIf(!hasDatabase)('the player’s journey', () => {
  let databaseUrl: string;
  let app: TestApp;
  let queue: SharedMatchEndedQueue;
  let server: ColyseusTestServer;

  let sequence = 0;

  beforeAll(async () => {
    // The match server's client warns with a line of its own when a refused join closes the socket under it.
    // A case below refuses a join on purpose, and the line is the refusal working rather than a case going
    // wrong, so that one line is dropped. Only that one: everything else still reaches the console, so this
    // cannot hide a warning either service prints.
    const warn = console.warn.bind(console);
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('Room connection was closed unexpectedly')) return;
      warn(...args);
    });

    databaseUrl = await createScratchDatabase();
    queue = new SharedMatchEndedQueue();

    // The provider is the one thing a test cannot have for real, and this is the profile it answers with:
    // an address the provider vouches for, and an account that holds no password (ADR 0021 § 9).
    app = await startTestApp({
      databaseUrl,
      queue,
      providers: { github: new FakeProvider('github', () => GITHUB_PROFILE) },
    });

    // The room is wired the way `main.ts` wires it: the publisher, the public key and the seed arrive as
    // the room's own default options, which Colyseus merges *over* whatever a client sends. A client
    // therefore cannot hand the room a key of its own, and cannot pick the board it plays on.
    const { publicKey } = await testTicketKeys();
    server = await boot(
      {
        initializeGameServer: (gameServer) => {
          gameServer.define(ROOM_NAME, BattleRoom, { publisher: queue, publicKey, seed: SEED });
        },
      },
      TEST_PORT,
    );
  });

  afterAll(async () => {
    await server?.cleanup();
    await server?.shutdown();
    await app?.close();
    await dropScratchDatabase(databaseUrl);
  });

  /** An address of this case's own, so no case can ride on an account another one made. */
  function anAddress(): string {
    sequence += 1;
    return `journey${sequence}@example.com`;
  }

  function post(path: string, body: unknown, cookie?: string): Promise<Response> {
    return fetch(`${app.url}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie === undefined ? {} : { cookie: `${SESSION_COOKIE}=${cookie}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
  }

  function get(path: string, cookie?: string): Promise<Response> {
    return fetch(`${app.url}${path}`, {
      redirect: 'manual',
      headers: cookie === undefined ? {} : { cookie: `${SESSION_COOKIE}=${cookie}` },
    });
  }

  /** The token carried by the link of the last message, the way a player reads it out of their mailbox. */
  function requiredToken(): string {
    const token = app.mailer.lastToken();
    if (token === undefined) throw new Error('no message carried a link, so there is no token to follow');
    return token;
  }

  /** Registers an address, follows the link, and answers the session the verification opened. */
  async function signUp(email: string, displayName?: string): Promise<string> {
    const registered = await post('/auth/password/register', {
      email,
      password: PASSWORD,
      ...(displayName === undefined ? {} : { displayName }),
    });
    expect(registered.status).toBe(202);

    const verified = await post('/auth/password/verify', { token: requiredToken() });
    expect(verified.status).toBe(200);

    const session = cookieValue(setCookies(verified), SESSION_COOKIE);
    expect(session).toBeDefined();
    return session ?? '';
  }

  /** The ticket the match server checks, asked for by a signed-in player. */
  async function ticketFor(session: string): Promise<string> {
    const response = await post('/auth/game-ticket', undefined, session);
    expect(response.status).toBe(200);
    const { ticket } = await response.json();
    return ticket as string;
  }

  async function me(session: string): Promise<Me> {
    const response = await get('/me', session);
    expect(response.status).toBe(200);
    return response.json();
  }

  async function historyOf(session: string, query = ''): Promise<History> {
    const response = await get(`/me/matches${query}`, session);
    expect(response.status).toBe(200);
    return response.json();
  }

  /** The rows the platform wrote for one match, read from the database rather than through a route. */
  async function storedMatch(matchId: string): Promise<{
    result: string;
    rounds: number;
    mapId: string;
    seed: string;
    finalStateHash: string;
    classes: string[];
    events: unknown[];
  }> {
    return withClient(databaseUrl, async (client) => {
      // One at a time: `pg` warns about a second query on a connection that is still running one, and a
      // case that made the suite's output noisy would hide a real warning on the day there is one.
      const match = await client.query(
        'select result, rounds, map_id, seed, final_state_hash from matches where id = $1',
        [matchId],
      );
      const agents = await client.query(
        `select a.class from match_agents ma
           join agents a on a.id = ma.agent_id
          where ma.match_id = $1`,
        [matchId],
      );
      const events = await client.query('select event from match_events where match_id = $1 order by seq', [
        matchId,
      ]);

      const [row] = match.rows;
      if (row === undefined) throw new Error(`match ${matchId} was not stored`);
      return {
        result: row.result,
        rounds: row.rounds,
        mapId: row.map_id,
        // `seed` and `final_state_hash` are bigint columns, so the driver hands them over as strings.
        seed: String(row.seed),
        finalStateHash: String(row.final_state_hash),
        classes: agents.rows.map((agent) => agent.class),
        events: events.rows.map((stored) => stored.event),
      };
    });
  }

  /**
   * Plays a match against the bot through the protocol, to its end, and answers what the client saw.
   *
   * The board is known only from the seed the first state carries, so every later state is rebuilt by
   * replaying the events that arrived onto that setup — the same reading of the protocol the match client
   * makes, and the reason a case can tell whose turn it is without asking the server.
   */
  async function play(client: MatchClient): Promise<Played> {
    let setup: MatchSetup | null = null;
    let latest: StateMessage | null = null;
    const events: Event[] = [];
    const rejections: RejectedMessage[] = [];
    let ended = false;
    let sent = 0;
    let failure: Error | null = null;

    const replay = (): MatchState => {
      if (setup === null) throw new Error('no state has arrived yet');
      return applyEvents(setup, events);
    };

    const finished = new Promise<EndedMessage>((resolve) => {
      client.onMessage(MESSAGE.ended, (message: EndedMessage) => {
        ended = true;
        resolve(message);
      });
    });

    const act = (): void => {
      if (ended || failure !== null || latest === null) return;
      if (sent >= ACTION_LIMIT) {
        failure = new Error(`the match did not end within ${ACTION_LIMIT} actions`);
        return;
      }

      const state = replay();
      // A side with nobody left standing has already lost, and the room has already ended the match: the
      // state in hand is the last one, broadcast just before the `ended` message. An action sent in the
      // meantime comes back as `game-over` — the room is right to refuse it, and a player's last screen is
      // the result rather than a move, so the script stops at the same place the room does.
      for (const team of ['A', 'B'] as const) {
        if (!state.units.some((unit) => unit.team === team && !unit.defeated)) return;
      }

      const actor = unitOnTurn(state);
      if (!actor || actor.team !== 'A') return;

      sent += 1;
      client.send(MESSAGE.action, toClientAction(chooseHumanAction(state, actor)));
    };

    client.onMessage(MESSAGE.events, (batch: Event[]) => events.push(...batch));
    client.onMessage(MESSAGE.state, (message: StateMessage) => {
      setup ??= createMatchSetup(message.state.seed);
      latest = message;
      act();
    });
    client.onMessage(MESSAGE.rejected, (message: RejectedMessage) => rejections.push(message));

    const ended_ = await Promise.race([
      finished,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(failure ?? new Error('the match never reached ended')), MATCH_TIMEOUT_MS),
      ),
    ]);

    return { winner: ended_.winner, events, lastState: latest, actions: sent, rejections, failure };
  }

  /**
   * A whole match for a signed-in player: take a ticket, join a room with it, play to the end, wait for
   * the room to hand the match over, and let the platform's own consumer read it.
   *
   * The wait is on the queue and not on a clock: the room hands the match over in a `then` that nothing
   * awaits, so "the room has ended" is not the same instant as "the queue has it". Asking the consumer
   * for one pass is the other half — the poll interval is an hour, so a message is stored during a test
   * only because a test asked for it.
   */
  async function playAMatch(session: string): Promise<{ message: MatchEndedMessage; played: Played }> {
    const before = queue.published.length;
    const ticket = await ticketFor(session);

    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const client = await server.connectTo(room, { ticket });
    client.reconnection.enabled = false;

    const played = await play(client as unknown as MatchClient);

    await vi.waitFor(() => expect(queue.published.length).toBe(before + 1), { timeout: 15_000 });
    const message: MatchEndedMessage = JSON.parse(queue.published[before]);

    await app.drain();

    // Back to where the session started: the client closes the match, and the room is empty. A second
    // hand-over is impossible rather than unlikely — the same `ended` flag that stops a finished room
    // taking actions is what stops it publishing again.
    await client.leave(true);
    expect(room.clients).toHaveLength(0);
    expect(queue.published.length).toBe(before + 1);

    return { message, played };
  }

  describe('from the title screen and back again', () => {
    it('registers, takes the field, wins, and comes back to a recorded battle', async () => {
      // 1. The account, verified through the link that arrived by mail. Everything after this carries the
      //    session that link opened: the verification is the end of signing up, not a step before it.
      const session = await signUp(anAddress(), 'Journey');

      // 2. Who the platform says the player is, and the squad every new account gets: one of each class.
      const profile = await me(session);
      expect(profile.user.displayName).toBe('Journey');
      expect(profile.agents.map((agent) => agent.class)).toEqual(['priest', 'sniper', 'wizard']);

      // 3. The match. The room is the server's, the board is the seed the server was given, and the only
      //    thing the client brings is the ticket — no user id, no squad, no map.
      const { message, played } = await playAMatch(session);

      // 4. What the player saw. The seed was chosen so that this is a win and not whatever happened: the
      //    scripted human beats the bot on this board, and the script is deterministic, so a `lost` here
      //    is a change in the engine or in the bot and not a bad day.
      expect(played.failure).toBeNull();
      expect(played.rejections).toEqual([]);
      expect(played.actions).toBeLessThanOrEqual(ACTION_LIMIT);
      expect(played.winner).toBe('A');

      const finalState = played.lastState;
      expect(finalState).not.toBeNull();

      // 5. The one message the room sends to the platform, and it is about this player: the ticket was
      //    checked at the join, and who they are travelled with the match.
      expect(message.userId).toBe(profile.user.id);
      expect(message.seed).toBe(SEED);
      expect(message.mapId).toBe(finalState?.mapId);
      expect(message.winner).toBe('A');
      expect(message.result).toBe('won');
      expect(message.rounds).toBe(finalState?.state.round);
      // The events a replay is made of are the ones the client was sent, event for event.
      expect(message.events).toEqual(played.events);
      // The player's own three units, named by class: the match server has never heard of an agent.
      expect(message.units.map((unit) => unit.class)).toEqual(['sniper', 'wizard', 'priest']);

      // 6. The battle, in the player's own history — and the row is that same match.
      const history = await historyOf(session);
      expect(history.matches).toHaveLength(1);
      expect(history.matches[0]).toEqual({
        id: message.id,
        mapId: finalState?.mapId,
        result: 'won',
        rounds: finalState?.state.round,
        endedAt: expect.any(String),
      });
      expect(history.nextCursor).toBeNull();

      const stored = await storedMatch(message.id);
      expect(stored).toMatchObject({
        result: 'won',
        mapId: finalState?.mapId,
        rounds: finalState?.state.round,
        seed: String(SEED),
      });
      // The database hands back the events the client received, in the order it received them: the queue
      // and the two writes in between did not touch them.
      expect(stored.events).toEqual(played.events);
      // And the squad rows resolved by class, which is the only identifier the two sides share (D9).
      expect([...stored.classes].sort()).toEqual(['priest', 'sniper', 'wizard']);

      // 7. Back to the title. In the browser this is the client closing the match and the screen coming
      //    back; here it is every signal that transition is made of, because this repository has no DOM in
      //    any test. The client left the room above, and the room is empty.
      const loggedOut = await post('/auth/logout', undefined, session);
      expect(loggedOut.status).toBe(204);
      // The cookie is dropped by the answer, and a client that honours it is signed out.
      expect(setCookies(loggedOut).join('; ')).toMatch(/Max-Age=0/);
      expect((await get('/me')).status).toBe(401);

      // What a logout does *not* do, recorded rather than assumed (ADR 0018, decision D3): the session is
      // stateless, so nothing was revoked and the very cookie value taken above is still good until it
      // ages out. `Max-Age=0` is the whole of the mechanism, and this is what it is worth.
      expect((await get('/me', session)).status).toBe(200);
      expect(SESSION_MAX_AGE_SECONDS).toBeGreaterThan(0);
    }, 120_000);
  });

  describe('what the ticket is not', () => {
    it('opens no route when it is put where a session belongs, because it is not one', async () => {
      const session = await signUp(anAddress());
      const ticket = await ticketFor(session);

      // The two routes a cookie opens, asked with the ticket in the cookie's place. Both refuse: a session
      // is a value this platform signed for itself, and a ticket is a different value signed differently.
      expect((await get('/me', ticket)).status).toBe(401);
      expect((await post('/auth/game-ticket', undefined, ticket)).status).toBe(401);
    });

    it('is refused by the room when it is signed with a key the platform does not hold', async () => {
      // A pair of this case's own, and a ticket that claims everything the real one claims — the issuer, a
      // real player's id, five minutes. The only difference is the half of the pair it was signed with,
      // which is the whole of what the match server checks.
      const session = await signUp(anAddress());
      const { user } = await me(session);

      const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
      const forged = await new SignJWT({})
        .setProtectedHeader({ alg: 'EdDSA' })
        .setIssuer(GAME_TICKET_ISSUER)
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(await importPKCS8(await exportPKCS8(pair.privateKey), 'EdDSA'));

      const before = queue.published.length;
      const room = await server.createRoom<BattleRoom>(ROOM_NAME);
      // A room nothing is in is disposed the moment a seat reservation is dropped, and a refused join
      // drops one — which would make the refusal below a "room not found" instead.
      room.autoDispose = false;

      // The SDK warns with a line of its own when a refused join closes the socket under it, and that is one
      // case below doing exactly what it set out to do. It is dropped in `beforeAll` so the output stays
      // readable; the assertions here are what say the refusal is real.
      await expect(server.sdk.joinById(room.roomId, { ticket: forged })).rejects.toThrow();
      expect(room.clients).toHaveLength(0);
      expect(queue.published.length).toBe(before);
    });

    it('cannot be issued by the match server, whose sources hold nothing that could sign one', () => {
      // Unusual, and the only way to assert an absence of capability instead of inferring it: read the
      // match server's own sources and check that the private half is not there. The suites are left out
      // on purpose — `battle-room.test.ts` mints tickets to test the room, and a test may do what the code
      // it tests may not.
      const sources = productionSources();
      expect(sources.length).toBeGreaterThan(10);

      for (const { file, text } of sources) {
        for (const forbidden of ['GAME_TICKET_PRIVATE_KEY', 'importPKCS8', 'SignJWT']) {
          expect(text, `${file} must not mention ${forbidden}`).not.toContain(forbidden);
        }
      }

      // And the other half of it: the match server has no way to write on the platform. Its only outbound
      // integration is the queue port — no HTTP client, no second AWS service — so the one thing it can do
      // with a finished match is publish a message the platform is free to ignore.
      const outbound = sources.filter(({ text }) => /fetch\(|axios|@aws-sdk\/client-(?!sqs)/.test(text));
      expect(outbound.map(({ file }) => file)).toEqual([]);
    });
  });

  describe('the branches the route suites leave to this one', () => {
    it('uses the display name a registration carries, and falls back only when it carries none', async () => {
      expect((await me(await signUp(anAddress(), 'Named Player'))).user.displayName).toBe('Named Player');

      // The local part of the address, which is all the platform knows about a player who did not say who
      // they are.
      expect((await me(await signUp(anAddress()))).user.displayName).toMatch(/^journey\d+$/);
    });

    it('refuses a registration with no address, with one that is not an address, and one that is not an object', async () => {
      for (const body of [{ password: PASSWORD }, { email: 'not-an-address', password: PASSWORD }]) {
        const response = await post('/auth/password/register', body);
        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('invalid_body');
      }

      // An array is valid JSON and is not a registration, so the route itself refuses it and says why.
      const array = await post('/auth/password/register', []);
      expect(array.status).toBe(400);
      expect((await array.json()).code).toBe('invalid_body');

      // A bare scalar is refused one layer earlier and by something that is not this platform: the body
      // parser rejects `0`, and every other non-object, before a handler runs. The status is the same and
      // the shape is not, so asserting our error shape here would be asserting a promise nobody made.
      expect((await post('/auth/password/register', 0)).status).toBe(400);
    });

    it('refuses a sign-in that is missing its address or its password, and does not apply the length policy to it', async () => {
      const email = anAddress();
      await signUp(email);

      for (const body of [{ password: PASSWORD }, { email: 'not-an-address', password: PASSWORD }, { email }]) {
        const response = await post('/auth/password/login', body);
        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('invalid_body');
      }

      // A short password is a *wrong* password here and not a malformed one. The policy is a rule about
      // choosing one; answering 400 on a sign-in would tell a guesser which strings are worth trying.
      const tooShort = await post('/auth/password/login', { email, password: 'short' });
      expect(tooShort.status).toBe(401);
      expect((await tooShort.json()).code).toBe('invalid_credentials');
    });

    it('refuses to sign in with a password on an account that has none, saying nothing about why', async () => {
      // The account a GitHub sign-in makes: a verified address and no credential. The answer is the one a
      // wrong password gets, so the route cannot be asked which accounts hold a password (ADR 0021 § 9).
      const { response } = await signIn(app.url, 'github');
      expect(response.status).toBe(302);

      const session = cookieValue(setCookies(response), SESSION_COOKIE) ?? '';
      expect((await me(session)).user.email).toBe(GITHUB_PROFILE.email);

      const attempt = await post('/auth/password/login', {
        email: GITHUB_PROFILE.email,
        password: PASSWORD,
      });
      expect(attempt.status).toBe(401);
      expect((await attempt.json()).code).toBe('invalid_credentials');
      expect(setCookies(attempt)).toEqual([]);
    });

    it('signs a player in through a configured realm, and offers no direct provider', async () => {
      // The switch the deployment owns: when the realm is configured it is the only door, and the direct
      // providers are not built even though their credentials are in the same environment. The realm is a
      // fake here, because a test cannot run Keycloak; everything around it is the real platform.
      const realmProfile: ProviderProfile = {
        providerUserId: 'kc-1',
        email: 'someone@sso.test',
        emailVerified: true,
        displayName: 'Someone Through SSO',
        avatarUrl: null,
      };
      const withRealm = await startTestApp({
        databaseUrl,
        keycloak: true,
        // The override is the set the factory produced: Keycloak alone. A `github` entry here would be
        // the state the factory exists to prevent, because the harness also leaves the direct
        // credentials in the environment — and `keycloak: true` is what proves they produce no button.
        providers: { keycloak: new FakeProvider('keycloak', () => realmProfile) },
      });

      try {
        expect(await (await fetch(`${withRealm.url}/auth/providers`)).json()).toEqual({
          providers: ['keycloak'],
        });
        expect((await fetch(`${withRealm.url}/auth/github`, { redirect: 'manual' })).status).toBe(404);

        const first = await signIn(withRealm.url, 'keycloak');
        expect(first.response.status).toBe(302);
        const firstSession = cookieValue(setCookies(first.response), SESSION_COOKIE) ?? '';
        const firstMe = await fetch(`${withRealm.url}/me`, {
          headers: { cookie: `${SESSION_COOKIE}=${firstSession}` },
        });
        expect(firstMe.status).toBe(200);
        const firstUser = (await firstMe.json()) as Me;

        const second = await signIn(withRealm.url, 'keycloak');
        expect(second.response.status).toBe(302);
        const secondSession = cookieValue(setCookies(second.response), SESSION_COOKIE) ?? '';
        const secondMe = await fetch(`${withRealm.url}/me`, {
          headers: { cookie: `${SESSION_COOKIE}=${secondSession}` },
        });
        expect(secondMe.status).toBe(200);

        // The second callback found the account the first one made: one pair, one account.
        expect(((await secondMe.json()) as Me).user.id).toBe(firstUser.user.id);
      } finally {
        await withRealm.close();
      }
    });

    it('refuses a logout with no cookie and one signed with a secret that is not ours', async () => {
      expect((await post('/auth/logout')).status).toBe(401);

      // A session this platform could have issued, signed with somebody else's secret — the whole of what a
      // forged cookie is, and the key is the only difference.
      const foreign = await signSession(
        { userId: randomUUID(), sessionId: randomUUID(), issuedAt: Date.now() },
        {
          secret: 'a secret that is not this platform’s own, and long enough to be one',
          cookieDomain: 'eldritch.test',
          clientOrigin: CLIENT_ORIGIN,
          maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
        },
      );
      expect((await post('/auth/logout', undefined, foreign)).status).toBe(401);

      // And the same route is worth a 204 for a cookie that is ours, so the two refusals above are about
      // the value and not about the route.
      const session = await signUp(anAddress());
      expect((await post('/auth/logout', undefined, session)).status).toBe(204);
    });
  });

  describe('one account cannot read what belongs to another', () => {
    it('answers a history only for the account the session names, whatever the request asks for', async () => {
      // Two players, one match each: the first one's battle is the row the second one must never reach.
      const first = await signUp(anAddress());
      const second = await signUp(anAddress());
      const { message: firstMatch } = await playAMatch(first);
      const { message: secondMatch } = await playAMatch(second);

      expect((await historyOf(first)).matches.map((match) => match.id)).toEqual([firstMatch.id]);
      expect((await historyOf(second)).matches.map((match) => match.id)).toEqual([secondMatch.id]);

      // A parameter naming the other player is not read at all, so it is a no-op rather than something
      // that has to be refused — which is a stronger property, and the reason the route has no such field.
      const asked = await historyOf(second, `?userId=${firstMatch.userId}&limit=100`);
      expect(asked.matches.map((match) => match.id)).toEqual([secondMatch.id]);

      // A page marker taken from the other player's history is a *position*, and the position is read
      // against the caller's own matches. Built with the platform's own encoder, because a case cannot
      // otherwise obtain one: a page holds twenty matches and a case will not play twenty-one.
      const borrowed = encodeCursor({ endedAt: new Date(secondMatch.endedAt), id: secondMatch.id });
      const page = await historyOf(first, `?cursor=${encodeURIComponent(borrowed)}`);
      const ids = page.matches.map((match) => match.id);
      expect(ids).not.toContain(secondMatch.id);
      for (const id of ids) expect([firstMatch.id]).toContain(id);

      // Past the end of the caller's own history: an empty page and no next one, rather than a first page
      // that would make a broken marker look like a working one for exactly one request.
      const end = encodeCursor({ endedAt: new Date(0), id: randomUUID() });
      expect(await historyOf(first, `?cursor=${encodeURIComponent(end)}`)).toEqual({
        matches: [],
        nextCursor: null,
      });
    });

    it('refuses a page marker it did not hand out', async () => {
      const session = await signUp(anAddress());

      for (const cursor of ['nonsense', 'Zm9vfGJhcg', 'fHw', 'MjAyNi0xMC0xNnwwMDAw']) {
        const response = await get(`/me/matches?cursor=${encodeURIComponent(cursor)}`, session);
        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('invalid_cursor');
      }
    });

    it('answers 401 to a cookie whose account is gone, in the shape every error has', async () => {
      const session = await signUp(anAddress());
      const { user } = await me(session);

      // Deleted behind the session's back, which is what the account-deletion flow will do. The cookie is
      // still a perfectly good signature; there is simply nobody left that it names.
      await withClient(databaseUrl, (client) => client.query('delete from users where id = $1', [user.id]));

      const profile = await get('/me', session);
      expect(profile.status).toBe(401);
      const body = await profile.json();
      expect(body.code).toBe('unauthenticated');
      expect(typeof body.message).toBe('string');

      // The history answers 200 with an empty page instead, and that difference is deliberate here rather
      // than an oversight: this route never reads a user row — it reads `matches` by the id the session
      // names — and the cascade took the matches with the account, so there is nothing left to hand over.
      // It is not a leak: the id comes from the cookie, and a cookie is not something a case can forge.
      // The client calls `/me` first and signs out on the 401 it gets, so a player never sees this page.
      expect(await historyOf(session)).toEqual({ matches: [], nextCursor: null });
    });
  });

  describe('what no response carries', () => {
    it('never carries the password hash, and never the token that was mailed', async () => {
      const email = anAddress();

      const registered = await post('/auth/password/register', { email, password: PASSWORD });
      const registration = requiredToken();
      const verified = await post('/auth/password/verify', { token: registration });
      const session = cookieValue(setCookies(verified), SESSION_COOKIE) ?? '';
      const loggedIn = await post('/auth/password/login', { email, password: PASSWORD });
      const forgot = await post('/auth/password/forgot', { email });
      const resetToken = requiredToken();
      const reset = await post('/auth/password/reset', { token: resetToken, password: PASSWORD });

      const bodies = await Promise.all(
        [registered, verified, loggedIn, forgot, reset, await get('/me', session)].map((response) =>
          response.text(),
        ),
      );
      const everything = bodies.join('\n');

      // The credential itself never leaves the database, in any spelling.
      expect(everything).not.toMatch(/passwordHash|password_hash|\$argon2/);
      // And neither does a token: the link belongs in the mailbox and in the log, and those are the only
      // two places it goes. Both tokens of this case are searched for, so neither route can be the one.
      expect(registration).not.toBe(resetToken);
      expect(everything).not.toContain(registration);
      expect(everything).not.toContain(resetToken);

      // The routes that must not say whether an address has an account answer one fixed body, without any
      // token in it, and the reset answers nothing at all.
      expect(JSON.parse(bodies[0])).toEqual({ status: 'sent' });
      expect(JSON.parse(bodies[1])).toEqual({ verified: true });
      expect(JSON.parse(bodies[3])).toEqual({ status: 'sent' });
      expect(bodies[4]).toBe('');

      // A known and an unknown address ask the same question and get the same answer.
      const unknown = await post('/auth/password/forgot', { email: anAddress() });
      expect(unknown.status).toBe(forgot.status);
      expect(await unknown.json()).toEqual(JSON.parse(bodies[3]));
    });
  });
});

/**
 * Every TypeScript file the match server runs, with its text, read from disk. The suites are left out: a
 * test may mint a ticket to test the room, and this is about what the code may do.
 */
function productionSources(): { file: string; text: string }[] {
  const root = fileURLToPath(new URL('../../game-server/src', import.meta.url));
  const files: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(path);
    }
  };
  walk(root);

  return files.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}
