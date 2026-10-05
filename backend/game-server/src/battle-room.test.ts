import type { Client } from '@colyseus/core';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { newMatch, type Event, type PublicState, type Team } from '@eldritch-alley/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BattleRoom, resolveHumanAction } from './battle-room';
import { MAPS, MATCH_SEED, createMatchSetup, mapIndex } from './map';
import { MESSAGE, PROTOCOL_VERSION, ROOM_NAME, type StateMessage } from './protocol';

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

    const outcome = resolveHumanAction(state, 'A', { type: 'endTurn' });

    expect(outcome.ok).toBe(true);
  });

  it('answers not-your-turn while a bot unit is on turn', () => {
    const initial = newMatch(createMatchSetup(MATCH_SEED));
    const botOnTurn = {
      ...initial,
      initiative: ['B-sniper', ...initial.initiative.filter((id) => id !== 'B-sniper')],
      currentIndex: 0,
    };

    const outcome = resolveHumanAction(botOnTurn, 'A', { type: 'endTurn' });

    expect(outcome).toEqual({ ok: false, reason: 'not-your-turn' });
  });
});

describe('BattleRoom', () => {
  // The text below is a contract with the client, not just a message: `onJoin` throwing `room full`
  // is how the client learns that another session holds the seat, and `frontend/src/net/join-failure.ts`
  // is the one place that reads it. Rewording the `throw` here without rewording it there makes a
  // second tab report "server unavailable" again, with no test failing on either side. This case is
  // the server half of that pin.
  it('refuses a second human with "room full"', async () => {
    const room = await server.createRoom<BattleRoom>(ROOM_NAME);
    const first = await server.connectTo(room);
    first.reconnection.enabled = false;

    await expect(server.sdk.joinById(room.roomId)).rejects.toThrow(/room full/);
    expect(room.clients).toHaveLength(1);

    await first.leave(true);
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
      human.send(MESSAGE.action, { type: 'endTurn' });
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
    // is sent, so the id has to travel with the state that carries the seed it was drawn from.
    expect(PROTOCOL_VERSION).toBe(3);
    expect(message.version).toBe(3);
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
