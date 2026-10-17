import { beforeEach, describe, expect, it } from 'vitest';
import type { Account, Api } from '../api/client';
import { ApiError } from '../api/errors';
import {
  currentAccount,
  loadAccount,
  onAccountChange,
  setAccount,
  signIn,
  signOut,
} from './session';

const PROFILE = { id: 'u1', displayName: 'Heron', email: 'heron@example.com', avatarUrl: null };

const ACCOUNT: Account = {
  user: PROFILE,
  agents: [
    { id: 'a1', class: 'priest', level: 1, status: 'ready' },
    { id: 'a2', class: 'sniper', level: 1, status: 'ready' },
  ],
  hasPassword: true,
};

/** An API whose eleven routes all answer something harmless, with the ones a case cares about replaced. */
function apiWith(overrides: Partial<Api> = {}): Api {
  return {
    providers: async () => [],
    me: async () => null,
    gameTicket: async () => ({ ticket: 'tkt', expiresAt: '2026-10-17T00:05:00.000Z' }),
    logout: async () => {},
    deleteAccount: async () => {},
    matches: async () => ({ matches: [], nextCursor: null }),
    register: async () => ({ status: 'sent' }),
    verify: async () => ({ verified: true }),
    resend: async () => ({ status: 'sent' }),
    login: async () => ({ user: PROFILE }),
    forgot: async () => ({ status: 'sent' }),
    reset: async () => {},
    ...overrides,
  };
}

describe('loading the account', () => {
  it('answers the guest state, silently, when nobody is signed in', async () => {
    const load = await loadAccount(apiWith({ me: async () => null }));

    expect(load).toEqual({ state: { status: 'guest' }, failure: null });
  });

  it('answers the signed-in state with the squad the platform sent', async () => {
    const load = await loadAccount(apiWith({ me: async () => ACCOUNT }));

    expect(load.state).toEqual({ status: 'signed-in', account: ACCOUNT });
    expect(load.failure).toBeNull();
  });

  it('names a platform that did not answer, and stays a guest', async () => {
    const silent = await loadAccount(
      apiWith({
        me: async () => {
          throw new ApiError('offline', null, null, 'down');
        },
      }),
    );
    const broken = await loadAccount(
      apiWith({
        me: async () => {
          throw new ApiError('unknown', 500, null, 'down');
        },
      }),
    );

    expect(silent).toEqual({ state: { status: 'guest' }, failure: 'offline' });
    expect(broken).toEqual({ state: { status: 'guest' }, failure: 'unknown' });
  });
});

describe('signing in', () => {
  it('reads the squad from /me after the login answered', async () => {
    const state = await signIn(apiWith({ me: async () => ACCOUNT }), { email: 'a@b.c', password: 'password1234' });

    expect(state).toEqual({ status: 'signed-in', account: ACCOUNT });
  });

  it('keeps the player signed in with the login profile when /me fails right after', async () => {
    const state = await signIn(
      apiWith({
        me: async () => {
          throw new ApiError('offline', null, null, 'down');
        },
      }),
      { email: 'a@b.c', password: 'password1234' },
    );

    expect(state).toEqual({
      status: 'signed-in',
      account: { user: PROFILE, agents: [], hasPassword: true },
    });
  });

  it('lets a refused login out for the dialog to name', async () => {
    const refused = new ApiError('refused', 401, 'invalid_credentials', 'no');

    await expect(
      signIn(
        apiWith({
          login: async () => {
            throw refused;
          },
        }),
        { email: 'a@b.c', password: 'wrong' },
      ),
    ).rejects.toBe(refused);
  });
});

describe('signing out', () => {
  it('answers the guest state when the platform took the logout', async () => {
    const outcome = await signOut(apiWith(), { status: 'signed-in', account: ACCOUNT });

    expect(outcome).toEqual({ state: { status: 'guest' }, failure: null });
  });

  it('keeps the session and says so when the logout did not go through', async () => {
    const signedIn = { status: 'signed-in', account: ACCOUNT } as const;
    const outcome = await signOut(
      apiWith({
        logout: async () => {
          throw new ApiError('offline', null, null, 'down');
        },
      }),
      signedIn,
    );

    // The cookie is still alive on the server: calling the player a guest here would be a lie that
    // the next reload would contradict.
    expect(outcome.state).toBe(signedIn);
    expect(outcome.failure).toBe('offline');
  });
});

describe('the account store', () => {
  beforeEach(() => {
    // A fresh object, because `setAccount` ignores the same identity and this is a reset, not a change.
    setAccount({ status: 'guest' });
  });

  it('starts as a guest and follows what is set', () => {
    expect(currentAccount()).toEqual({ status: 'guest' });

    const signedIn = { status: 'signed-in', account: ACCOUNT } as const;
    setAccount(signedIn);

    expect(currentAccount()).toBe(signedIn);
  });

  it('tells a subscriber now, with the state it holds, and again on every change', () => {
    const seen: unknown[] = [];
    const unsubscribe = onAccountChange((state) => seen.push(state));
    const signedIn = { status: 'signed-in', account: ACCOUNT } as const;

    setAccount(signedIn);
    setAccount(signedIn);
    unsubscribe();
    setAccount({ status: 'guest' });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ status: 'guest' });
    expect(seen[1]).toBe(signedIn);
  });
});
