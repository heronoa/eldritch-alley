// Plays a whole match against the bot through the protocol, with no browser: a scripted human client
// that attacks whenever it can, otherwise closes on the nearest enemy, otherwise ends its turn.
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import {
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
import { MESSAGE, ROOM_NAME, type ClientAction, type EndedMessage, type StateMessage } from './protocol';

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
