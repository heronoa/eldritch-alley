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
    leaves = 0;
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

    leave(): void {
      this.leaves += 1;
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

  /**
   * How often each call was made, and whether the fake server refuses it. A refusal is what a token
   * the room no longer knows looks like from the client: the SDK throws.
   */
  const calls = { joinOrCreate: 0, reconnect: 0 };
  const refuse: { join: boolean; reconnect: Error | null } = { join: false, reconnect: null };

  class FakeClient {
    async joinOrCreate(): Promise<FakeRoom> {
      calls.joinOrCreate += 1;
      if (refuse.join) throw new Error('the room refused the seat');
      return makeRoom();
    }

    async reconnect(): Promise<FakeRoom> {
      calls.reconnect += 1;
      if (refuse.reconnect !== null) throw refuse.reconnect;
      return makeRoom();
    }
  }

  return { rooms, calls, refuse, FakeClient };
});

vi.mock('@colyseus/sdk', () => ({ Client: fake.FakeClient }));

const { Session } = await import('./session');
const { MESSAGE, PROTOCOL_VERSION } = await import('../protocol');

/** The key `session.ts` keeps the reconnection token under, so a test can seed and read it. */
const TOKEN_KEY = 'ea.reconnect';

/** An error shaped like the SDK's `MatchMakeError`: a numeric code, and the words the server sent with it. */
function matchMakeError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** The server's refusal of a resume: the room's message for an expired seat. */
const EXPIRED_SEAT = (): Error => matchMakeError(524, 'reconnection token invalid or expired.');

describe('Session without a server', () => {
  it('is constructed and refuses to send before connect, without touching the storage', () => {
    const session = new Session('ws://localhost:2567');

    expect(() => session.send({ type: 'endTurn', round: 1 })).not.toThrow();
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
    fake.calls.joinOrCreate = 0;
    fake.calls.reconnect = 0;
    fake.refuse.join = false;
    fake.refuse.reconnect = null;
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

  // A reload during a match builds a new Session over the same storage. `open()` is what it calls,
  // and it has to land on the seat the token names instead of opening a second room.
  describe('opening a session', () => {
    it('resumes the match when a token is stored', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      const stored = store.get(TOKEN_KEY);
      fake.calls.joinOrCreate = 0;

      const afterReload = new Session('ws://localhost:2567');
      await afterReload.open();

      expect(fake.calls.reconnect).toBe(1);
      expect(fake.calls.joinOrCreate).toBe(0);
      expect(store.get(TOKEN_KEY)).not.toBe(stored);
    });

    it('joins a new room when no token is stored', async () => {
      const session = new Session('ws://localhost:2567');

      await session.open();

      expect(fake.calls.joinOrCreate).toBe(1);
      expect(fake.calls.reconnect).toBe(0);
    });

    it('joins a new room when the stored token is refused, and the new token replaces the old one', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      const stale = store.get(TOKEN_KEY);
      fake.calls.joinOrCreate = 0;
      fake.refuse.reconnect = EXPIRED_SEAT();

      const afterReload = new Session('ws://localhost:2567');
      await afterReload.open();

      expect(fake.calls.reconnect).toBe(1);
      expect(fake.calls.joinOrCreate).toBe(1);
      expect(store.get(TOKEN_KEY)).not.toBe(stale);
    });

    it('throws the join error when the resumption fails and the new room does too', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      fake.refuse.reconnect = EXPIRED_SEAT();
      fake.refuse.join = true;

      const afterReload = new Session('ws://localhost:2567');

      await expect(afterReload.open()).rejects.toThrow('the room refused the seat');
    });

    it('falls back to a new room when the storage is unavailable', async () => {
      vi.stubGlobal('sessionStorage', undefined);
      const session = new Session('ws://localhost:2567');

      await expect(session.open()).resolves.toBeUndefined();

      expect(fake.calls.joinOrCreate).toBe(1);
    });

    it('removes the stored token when the server refuses the resume with an expired seat', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      fake.refuse.reconnect = EXPIRED_SEAT();

      await expect(playing.reconnect()).resolves.toBe(false);

      expect(store.has(TOKEN_KEY)).toBe(false);
    });

    it('removes the stored token when the room is gone', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      fake.refuse.reconnect = matchMakeError(522, 'room "abc" has been disposed.');

      await expect(playing.reconnect()).resolves.toBe(false);

      expect(store.has(TOKEN_KEY)).toBe(false);
    });

    // A tunnel timeout also arrives as 522 or 524, but with the proxy's words. The seat may still be held,
    // so the token must stay.
    it('keeps the stored token when a tunnel timeout looks like a refusal by its code only', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      const stored = store.get(TOKEN_KEY);
      fake.refuse.reconnect = matchMakeError(522, 'Origin Connection Time-out');

      await expect(playing.reconnect()).resolves.toBe(false);

      expect(store.get(TOKEN_KEY)).toBe(stored);
    });

    it('keeps the stored token when a 524 carries words that are not the server refusal', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      const stored = store.get(TOKEN_KEY);
      fake.refuse.reconnect = matchMakeError(524, 'A timeout occurred');

      await expect(playing.reconnect()).resolves.toBe(false);

      expect(store.get(TOKEN_KEY)).toBe(stored);
    });

    it('keeps the stored token when the connection drops during the resume', async () => {
      const playing = new Session('ws://localhost:2567');
      await playing.connect();
      const stored = store.get(TOKEN_KEY);
      fake.refuse.reconnect = new TypeError('Failed to fetch');

      await expect(playing.reconnect()).resolves.toBe(false);

      expect(store.get(TOKEN_KEY)).toBe(stored);
    });

    it('refuses to reconnect, without calling the server, when no token is stored', async () => {
      const session = new Session('ws://localhost:2567');

      await expect(session.reconnect()).resolves.toBe(false);

      expect(fake.calls.reconnect).toBe(0);
    });
  });

  it('leaves the room when it is closed', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();

    session.close();

    expect(fake.rooms[0].leaves).toBe(1);
  });

  it('does not report the leave as a drop', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    let drops = 0;
    session.onDrop(() => {
      drops += 1;
    });

    session.close();
    fake.rooms[0].drop();

    expect(drops).toBe(0);
  });

  it('does nothing when it is closed twice, and sends nothing after it is closed', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();

    session.close();
    session.close();
    session.send({ type: 'endTurn', round: 1 });

    expect(fake.rooms[0].leaves).toBe(1);
    expect(fake.rooms[0].sent).toEqual([]);
  });

  it('carries the map id of the match with the state, so the board can be built from it', async () => {
    const session = new Session('ws://localhost:2567');
    await session.connect();
    fake.rooms[0].emit(MESSAGE.state, { version: PROTOCOL_VERSION, mapId: 'roof', state: null });

    // The client draws the terrain of the id, so a late subscriber needs the id the state came with,
    // not only the state.
    const handed: { mapId: string }[] = [];
    session.onState((message) => handed.push(message));

    expect(PROTOCOL_VERSION).toBe(7);
    expect(handed).toEqual([{ version: PROTOCOL_VERSION, mapId: 'roof', state: null }]);
  });
});
