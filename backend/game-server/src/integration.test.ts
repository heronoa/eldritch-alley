// Plays a whole match against the bot through the protocol, with no browser: a scripted human client
// that attacks whenever it can, otherwise closes on the nearest enemy, otherwise ends its turn.
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import {
  abilityById,
  applyAction,
  applyEvents,
  publicState,
  type Action,
  type Event,
  type MatchSetup,
  type MatchState,
  type Position,
  type UnitState,
} from '@eldritch-alley/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BattleRoom } from './battle-room';
import { createMatchSetup } from './map';
import {
  MESSAGE,
  ROOM_NAME,
  type ClientAction,
  type EndedMessage,
  type RejectedMessage,
  type StateMessage,
} from './protocol';

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

function chooseHumanAction(state: MatchState, actor: UnitState): Action {
  const enemies = livingEnemies(state, actor);

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
      return { type: 'useAbility', abilityId: action.abilityId, to: action.to };
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
