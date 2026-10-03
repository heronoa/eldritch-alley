import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A stand-in for the SDK, so the reconnection behaviour is tested without a server. It records what
 * the session subscribes to on each room, which is what the re-attachment after a reconnection is
 * about. `vi.hoisted` is needed because `vi.mock` runs before the imports.
 */
const fake = vi.hoisted(() => {
  type PayloadHandler = (payload: unknown) => void;
  type DropHandler = () => void;

  class FakeRoom {
    reconnectionToken = '';
    readonly reconnection = { enabled: true };
    readonly sent: { type: string; payload: unknown }[] = [];
    private readonly handlers = new Map<string, Set<PayloadHandler>>();
    private readonly drops = new Set<DropHandler>();

    onMessage(type: string, handler: PayloadHandler): () => void {
      const set = this.handlers.get(type) ?? new Set<PayloadHandler>();
      this.handlers.set(type, set);
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    }

    // The SDK's `onDrop` is a signal: callable, with a `remove`.
    readonly onDrop = Object.assign(
      (handler: DropHandler) => {
        this.drops.add(handler);
      },
      {
        remove: (handler: DropHandler) => {
          this.drops.delete(handler);
        },
      },
    );

    send(type: string, payload: unknown): void {
      this.sent.push({ type, payload });
    }

    emit(type: string, payload: unknown): void {
      for (const handler of this.handlers.get(type) ?? []) handler(payload);
    }

    drop(): void {
      for (const handler of this.drops) handler();
    }

    subscribedTo(type: string): boolean {
      return (this.handlers.get(type)?.size ?? 0) > 0;
    }
  }

  const rooms: FakeRoom[] = [];

  function makeRoom(): FakeRoom {
    const room = new FakeRoom();
    room.reconnectionToken = `room-${rooms.length}:token-${rooms.length}`;
    rooms.push(room);
    return room;
  }

  class FakeClient {
    async joinOrCreate(): Promise<FakeRoom> {
      return makeRoom();
    }

    async reconnect(): Promise<FakeRoom> {
      return makeRoom();
    }
  }

  return { rooms, FakeClient };
});

vi.mock('@colyseus/sdk', () => ({ Client: fake.FakeClient }));

const { Session } = await import('./session');
const { MESSAGE, PROTOCOL_VERSION } = await import('../protocol');

describe('Session without a server', () => {
  it('is constructed and refuses to send before connect, without touching the storage', () => {
    const session = new Session('ws://localhost:2567');

    expect(() => session.send({ type: 'endTurn' })).not.toThrow();
  });

  it('offers a way to reconnect when the storage is unavailable', async () => {
    const session = new Session('ws://localhost:2567');

    await expect(session.reconnect()).resolves.toBe(false);
  });
});

describe('Session against a room', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    fake.rooms.length = 0;
    store.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drives the reconnection itself instead of letting the SDK retry', async () => {
    const session = new Session('ws://localhost:2567');

    await session.connect();

    expect(fake.rooms[0].reconnection.enabled).toBe(false);
  });

  it('tells the subscriber when the room drops', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    let drops = 0;
    session.onDrop(() => {
      drops += 1;
    });

    fake.rooms[0].drop();

    expect(drops).toBe(1);
  });

  it('stops calling a subscriber that unsubscribed', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    let states = 0;
    const unsubscribe = session.onState(() => {
      states += 1;
    });

    unsubscribe();
    fake.rooms[0].emit(MESSAGE.state, { version: PROTOCOL_VERSION, state: null });

    expect(states).toBe(0);
  });

  it('hands the state of the room to a subscriber that arrives late', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    // The room sends the state on join, before the scene that draws it exists.
    fake.rooms[0].emit(MESSAGE.state, { version: PROTOCOL_VERSION, state: null });

    const states: unknown[] = [];
    session.onState((message) => states.push(message));

    expect(states).toEqual([{ version: PROTOCOL_VERSION, state: null }]);
  });

  it('hands over the last state, not the first', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    fake.rooms[0].emit(MESSAGE.state, { version: PROTOCOL_VERSION, state: 'primeiro' });
    fake.rooms[0].emit(MESSAGE.state, { version: PROTOCOL_VERSION, state: 'segundo' });

    const states: unknown[] = [];
    session.onState((message) => states.push(message));

    expect(states).toEqual([{ version: PROTOCOL_VERSION, state: 'segundo' }]);
  });

  it('forgets the state of the room it leaves, so a new match is not drawn with the old board', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    fake.rooms[0].emit(MESSAGE.state, { version: PROTOCOL_VERSION, state: null });

    await session.connect();

    const states: unknown[] = [];
    session.onState((message) => states.push(message));

    expect(states).toEqual([]);
  });

  it('keeps the subscriptions when it reconnects into a new room', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    const states: unknown[] = [];
    session.onState((message) => states.push(message));
    session.onDrop(() => states.push('drop'));

    await expect(session.reconnect()).resolves.toBe(true);

    const reconnected = fake.rooms[1];
    expect(reconnected).toBeDefined();
    expect(reconnected.subscribedTo(MESSAGE.state)).toBe(true);
    reconnected.emit(MESSAGE.state, { version: PROTOCOL_VERSION, state: null });
    reconnected.drop();

    expect(states).toHaveLength(2);
  });
});
