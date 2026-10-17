import { describe, expect, it } from 'vitest';
import { isTicketRefusal } from './join-failure';
import { joinWithTicket, type Openable } from './join-with-ticket';
import type { JoinOptions } from './session';

/** A session that records what it was opened with, when it was closed, and how it fails. */
class FakeSession implements Openable {
  readonly opened: (JoinOptions | undefined)[] = [];
  closes = 0;

  constructor(private readonly failure: (attempt: number) => unknown = () => null) {}

  async open(options?: JoinOptions): Promise<void> {
    this.opened.push(options);
    const failure = this.failure(this.opened.length);
    if (failure !== null) throw failure;
  }

  close(): void {
    this.closes += 1;
  }
}

/** The room's refusal of `onAuth`, as the SDK hands it back. */
function authFailed(): Error {
  return Object.assign(new Error('onAuth failed'), { code: 525 });
}

/** Cloudflare's own 525, which is not the room refusing anything. */
function tunnelTimeout(): Error {
  return Object.assign(new Error('SSL handshake failed'), { code: 525 });
}

describe('joining as a guest', () => {
  it('asks the platform nothing and joins with no options', async () => {
    let asked = 0;
    const session = new FakeSession();

    const joined = await joinWithTicket({
      signedIn: false,
      create: () => session,
      ticket: async () => {
        asked += 1;
        return 'unused';
      },
    });

    expect(asked).toBe(0);
    expect(joined).toBe(session);
    expect(session.opened).toEqual([{}]);
  });
});

describe('joining signed in', () => {
  it('fetches a ticket at press time and hands it to the join', async () => {
    const session = new FakeSession();

    await joinWithTicket({ signedIn: true, create: () => session, ticket: async () => 'tkt' });

    expect(session.opened).toEqual([{ ticket: 'tkt' }]);
    expect(session.closes).toBe(0);
  });

  it('joins as a guest when the ticket could not be fetched, because playing comes first', async () => {
    const session = new FakeSession();

    await joinWithTicket({
      signedIn: true,
      create: () => session,
      ticket: async () => {
        throw new Error('the platform did not answer');
      },
    });

    expect(session.opened).toEqual([{}]);
  });

  it('joins as a guest when the platform answered no ticket', async () => {
    const session = new FakeSession();

    await joinWithTicket({ signedIn: true, create: () => session, ticket: async () => null });

    expect(session.opened).toEqual([{}]);
  });
});

describe('a ticket the room refuses', () => {
  it('is retried exactly once, without the ticket, on a new session', async () => {
    const sessions: FakeSession[] = [];
    let tickets = 0;

    const joined = await joinWithTicket({
      signedIn: true,
      create: () => {
        // The first session is the one the ticket arrives with, and the only one that is refused.
        const index = sessions.length;
        const session = new FakeSession((attempt) => (index === 0 && attempt === 1 ? authFailed() : null));
        sessions.push(session);
        return session;
      },
      ticket: async () => {
        tickets += 1;
        return 'stale';
      },
    });

    expect(tickets).toBe(1);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].opened).toEqual([{ ticket: 'stale' }]);
    expect(sessions[0].closes).toBe(1);
    expect(sessions[1].opened).toEqual([{}]);
    expect(joined).toBe(sessions[1]);
  });

  it('is not asked for a ticket twice', async () => {
    let tickets = 0;
    const sessions: FakeSession[] = [];

    await joinWithTicket({
      signedIn: true,
      create: () => {
        const index = sessions.length;
        const session = new FakeSession((attempt) => (index === 0 && attempt === 1 ? authFailed() : null));
        sessions.push(session);
        return session;
      },
      ticket: async () => {
        tickets += 1;
        return 'stale';
      },
    });

    expect(tickets).toBe(1);
  });
});

describe('a failure that is not the ticket', () => {
  it('does not retry a guest join the room refused for being full', async () => {
    const session = new FakeSession(() => new Error('room full'));

    await expect(
      joinWithTicket({ signedIn: false, create: () => session, ticket: async () => null }),
    ).rejects.toThrow('room full');
    expect(session.closes).toBe(1);
  });

  it('does not retry a 525 that is not the room’s words', async () => {
    const session = new FakeSession(() => tunnelTimeout());

    await expect(
      joinWithTicket({ signedIn: true, create: () => session, ticket: async () => 'tkt' }),
    ).rejects.toMatchObject({ code: 525 });
    expect(session.closes).toBe(1);
  });

  it('does not retry a dropped network', async () => {
    const session = new FakeSession(() => new TypeError('fetch failed'));

    await expect(
      joinWithTicket({ signedIn: true, create: () => session, ticket: async () => 'tkt' }),
    ).rejects.toThrow('fetch failed');
    expect(session.closes).toBe(1);
  });

  it('does not retry a second refusal of the guest join', async () => {
    const sessions: FakeSession[] = [];
    const error = authFailed();

    await expect(
      joinWithTicket({
        signedIn: true,
        create: () => {
          const session = new FakeSession(() => error);
          sessions.push(session);
          return session;
        },
        ticket: async () => 'tkt',
      }),
    ).rejects.toBe(error);

    // The first attempt carried the ticket and the second did not: one retry, and no third.
    expect(sessions).toHaveLength(2);
    expect(sessions[0].opened).toEqual([{ ticket: 'tkt' }]);
    expect(sessions[1].opened).toEqual([{}]);
    expect(sessions.every((session) => session.closes === 1)).toBe(true);
  });
});

describe('the ticket refusal', () => {
  it('needs the code and the words together', () => {
    expect(isTicketRefusal(authFailed())).toBe(true);
    expect(isTicketRefusal(tunnelTimeout())).toBe(false);
    expect(isTicketRefusal(Object.assign(new Error('room full'), { code: 525 }))).toBe(false);
    expect(isTicketRefusal(Object.assign(new Error('onAuth failed'), { code: 525 + 1 }))).toBe(false);
    expect(isTicketRefusal(null)).toBe(false);
    expect(isTicketRefusal('onAuth failed')).toBe(false);
  });
});
