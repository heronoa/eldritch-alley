import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n/translate';
import { createApi, oauthStart, type Api } from './client';
import { ApiError, failureOf, isRefused } from './errors';

interface Answer {
  status?: number;
  body?: unknown;
  /** A body that does not parse, as a proxy's HTML page would answer. */
  unreadable?: boolean;
}

interface Call {
  url: string;
  init: RequestInit;
}

/** An API over a fake `fetch` that records every call and answers from a handler. */
function apiOver(handler: (url: string, init: RequestInit) => Answer | Promise<Answer>): {
  api: Api;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = await handler(url, init);
    const status = answer.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (answer.unreadable === true) throw new SyntaxError('not json');
        return answer.body;
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { api: createApi('https://api.test/', fetchImpl), calls };
}

const PROFILE = { id: 'u1', displayName: 'Heron', email: 'heron@example.com', avatarUrl: null };

describe('the platform client', () => {
  it('asks for the player and answers null when the platform says nobody is signed in', async () => {
    const { api, calls } = apiOver(() => ({ status: 401, body: { code: 'unauthenticated', message: 'no' } }));

    await expect(api.me()).resolves.toBeNull();
    expect(calls[0].url).toBe('https://api.test/me');
  });

  it('reads the profile and the squad in the order the platform sent them', async () => {
    const agents = [
      { id: 'a1', class: 'priest', level: 1, status: 'ready' },
      { id: 'a2', class: 'sniper', level: 1, status: 'ready' },
      { id: 'a3', class: 'wizard', level: 1, status: 'ready' },
    ];
    const { api } = apiOver(() => ({ body: { user: PROFILE, agents } }));

    await expect(api.me()).resolves.toEqual({ user: PROFILE, agents, hasPassword: false });
  });

  it('reads whether the account has a password, and calls an answer without the fact false', async () => {
    const withPassword = apiOver(() => ({ body: { user: PROFILE, agents: [], hasPassword: true } }));
    const without = apiOver(() => ({ body: { user: PROFILE, agents: [] } }));

    await expect(withPassword.api.me()).resolves.toMatchObject({ hasPassword: true });
    await expect(without.api.me()).resolves.toMatchObject({ hasPassword: false });
  });

  it('tells a refusal from a server fault and from a platform that never answered', async () => {
    const refused = apiOver(() => ({ status: 403, body: { code: 'email_not_verified', message: 'verify' } }));
    const faulted = apiOver(() => ({ status: 500, body: { code: 'oops', message: 'down' } }));
    const silent = apiOver(() => {
      throw new TypeError('fetch failed');
    });

    await expect(refused.api.me()).rejects.toMatchObject({ kind: 'refused', status: 403, code: 'email_not_verified' });
    await expect(faulted.api.me()).rejects.toMatchObject({ kind: 'unknown', status: 500 });
    await expect(silent.api.me()).rejects.toMatchObject({ kind: 'offline', status: null });
  });

  it('treats a body that is not the contract as unknown, so no panel draws it', async () => {
    const html = apiOver(() => ({ unreadable: true }));
    const wrong = apiOver(() => ({ body: { hello: 'world' } }));

    await expect(html.api.me()).rejects.toMatchObject({ kind: 'unknown' });
    await expect(wrong.api.me()).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('carries the session cookie and no referrer on every call it makes', async () => {
    const { api, calls } = apiOver((url) => {
      if (url.endsWith('/me')) return { body: { user: PROFILE, agents: [] } };
      if (url.endsWith('/matches')) return { body: { matches: [], nextCursor: null } };
      if (url.endsWith('/providers')) return { body: { providers: [] } };
      return { status: 204 };
    });

    await api.me();
    await api.providers();
    await api.logout();
    await api.matches();

    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call.init.credentials).toBe('include');
      expect(call.init.referrerPolicy).toBe('no-referrer');
    }
  });

  it('tells the platform which language to write its mail in, on every call', async () => {
    const { api, calls } = apiOver((url) =>
      url.endsWith('/me') ? { body: { user: PROFILE, agents: [] } } : { status: 204 },
    );

    setLocale('pt-BR');
    try {
      await api.me();
      // A request with a body carries the header too: a password reset is exactly the call whose mail
      // has to be written in the language the player is reading.
      await api.deleteAccount({ confirm: 'DELETE' });
    } finally {
      setLocale('en-US');
    }

    for (const call of calls) {
      expect(new Headers(call.init.headers).get('accept-language')).toBe('pt-BR');
    }
  });

  it('joins a route to the base URL whether or not the build wrote the trailing slash', async () => {
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => ({ status: 'sent' }) }) as unknown as Response) as unknown as typeof fetch;
    const withoutSlash = createApi('https://api.test', fetchImpl);
    const recorded: string[] = [];
    const recording = (async (url: string) => {
      recorded.push(url);
      return { ok: true, status: 202, json: async () => ({ status: 'sent' }) } as unknown as Response;
    }) as unknown as typeof fetch;

    await createApi('https://api.test/', recording).register({ email: 'a@b.c', password: 'password1234' });
    await withoutSlash.logout();

    expect(recorded[0]).toBe('https://api.test/auth/password/register');
  });
});

describe('the provider list', () => {
  it('keeps the names this client can draw and drops the rest', async () => {
    const { api } = apiOver(() => ({ body: { providers: ['keycloak', 'github', 'bitbucket'] } }));

    await expect(api.providers()).resolves.toEqual(['keycloak', 'github']);
  });

  it('answers an empty list for a platform with no OAuth app, and for one that did not answer', async () => {
    const empty = apiOver(() => ({ body: { providers: [] } }));
    const silent = apiOver(() => {
      throw new TypeError('fetch failed');
    });
    const broken = apiOver(() => ({ status: 500, body: { code: 'oops', message: 'down' } }));

    await expect(empty.api.providers()).resolves.toEqual([]);
    await expect(silent.api.providers()).resolves.toEqual([]);
    await expect(broken.api.providers()).resolves.toEqual([]);
  });

  it('navigates to a provider instead of fetching it, with the language in the query', () => {
    expect(oauthStart('https://api.test/', 'github', 'pt-BR')).toBe(
      'https://api.test/auth/github?locale=pt-BR',
    );
    expect(oauthStart('https://api.test', 'goo gle', 'en-US')).toBe(
      'https://api.test/auth/goo%20gle?locale=en-US',
    );
  });
});

describe('the session routes', () => {
  it('asks for the ticket with a POST and reads the two fields', async () => {
    const { api, calls } = apiOver(() => ({ body: { ticket: 'tkt', expiresAt: '2026-10-17T00:05:00.000Z' } }));

    await expect(api.gameTicket()).resolves.toEqual({ ticket: 'tkt', expiresAt: '2026-10-17T00:05:00.000Z' });
    expect(calls[0].url).toBe('https://api.test/auth/game-ticket');
    expect(calls[0].init.method).toBe('POST');
  });

  it('counts a logout without a session as the state the caller wanted', async () => {
    const { api } = apiOver(() => ({ status: 401, body: { code: 'unauthenticated', message: 'no' } }));

    await expect(api.logout()).resolves.toBeUndefined();
  });

  it('reports a logout the platform could not take', async () => {
    const { api } = apiOver(() => ({ status: 503, body: { code: 'unavailable', message: 'try later' } }));

    await expect(api.logout()).rejects.toMatchObject({ kind: 'unknown', status: 503 });
  });

  it('asks for the history with the cursor it was given, encoded', async () => {
    const { api, calls } = apiOver(() => ({
      body: {
        matches: [{ id: 'm1', mapId: 'alley', result: 'won', rounds: 7, endedAt: '2026-10-16T10:00:00.000Z' }],
        nextCursor: 'abc=',
      },
    }));

    const page = await api.matches('a b+c');

    expect(calls[0].url).toBe('https://api.test/me/matches?cursor=a%20b%2Bc');
    expect(page.nextCursor).toBe('abc=');
    expect(page.matches).toHaveLength(1);
  });

  it('answers the first page with no query at all', async () => {
    const { api, calls } = apiOver(() => ({ body: { matches: [], nextCursor: null } }));

    await expect(api.matches()).resolves.toEqual({ matches: [], nextCursor: null });
    expect(calls[0].url).toBe('https://api.test/me/matches');
  });
});

describe('deleting the account', () => {
  it('sends the word and the password to the deletion route, and reads no body from the 204', async () => {
    const { api, calls } = apiOver(() => ({ status: 204, unreadable: true }));

    await expect(api.deleteAccount({ confirm: 'DELETE', password: 'password1234' })).resolves.toBeUndefined();

    expect(calls[0].url).toBe('https://api.test/auth/account');
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].init.credentials).toBe('include');
    expect(new Headers(calls[0].init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      confirm: 'DELETE',
      password: 'password1234',
    });
  });

  it('leaves the password out of the body when the account has none', async () => {
    const { api, calls } = apiOver(() => ({ status: 204, unreadable: true }));

    await api.deleteAccount({ confirm: 'DELETE' });

    expect(JSON.parse(String(calls[0].init.body))).toEqual({ confirm: 'DELETE' });
  });

  it('throws every refusal intact, a 401 included', async () => {
    const refusals = [
      [400, 'invalid_confirmation'],
      [403, 'invalid_password'],
      [429, 'too_many_attempts'],
      [401, 'unauthenticated'],
    ] as const;

    for (const [status, code] of refusals) {
      const { api } = apiOver(() => ({ status, body: { code, message: 'no' } }));

      await expect(api.deleteAccount({ confirm: 'DELETE' })).rejects.toMatchObject({
        kind: 'refused',
        status,
        code,
      });
    }
  });

  it('answers a platform that did not answer as offline', async () => {
    const silent = apiOver(() => {
      throw new TypeError('fetch failed');
    });

    await expect(silent.api.deleteAccount({ confirm: 'DELETE' })).rejects.toMatchObject({
      kind: 'offline',
      status: null,
    });
  });
});

describe('the password routes', () => {
  it('registers with the name when there is one and without the field when there is not', async () => {
    const { api, calls } = apiOver(() => ({ status: 202, body: { status: 'sent' } }));

    await api.register({ email: 'a@b.c', password: 'password1234', displayName: 'Heron' });
    await api.register({ email: 'a@b.c', password: 'password1234' });

    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      email: 'a@b.c',
      password: 'password1234',
      displayName: 'Heron',
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ email: 'a@b.c', password: 'password1234' });
  });

  it('verifies a token and refuses one the platform calls invalid', async () => {
    const good = apiOver(() => ({ body: { verified: true } }));
    const spent = apiOver(() => ({ status: 400, body: { code: 'invalid_token', message: 'spent' } }));

    await expect(good.api.verify('tok')).resolves.toEqual({ verified: true });
    await expect(spent.api.verify('tok')).rejects.toMatchObject({ kind: 'refused', code: 'invalid_token' });
  });

  it('signs in with the profile the login answers', async () => {
    const { api, calls } = apiOver(() => ({ body: { user: PROFILE } }));

    await expect(api.login({ email: 'a@b.c', password: 'x' })).resolves.toEqual({ user: PROFILE });
    expect(calls[0].url).toBe('https://api.test/auth/password/login');
  });

  it('names the login refusals the screens act on', async () => {
    const credentials = apiOver(() => ({ status: 401, body: { code: 'invalid_credentials', message: 'no' } }));
    const unverified = apiOver(() => ({ status: 403, body: { code: 'email_not_verified', message: 'verify' } }));
    const throttled = apiOver(() => ({ status: 429, body: { code: 'too_many_attempts', message: 'slow' } }));

    const caught = async (api: Api) => {
      try {
        await api.login({ email: 'a@b.c', password: 'x' });
      } catch (error) {
        return error;
      }
      throw new Error('the login was expected to fail');
    };

    expect(isRefused(await caught(credentials.api), 'invalid_credentials')).toBe(true);
    expect(isRefused(await caught(unverified.api), 'email_not_verified')).toBe(true);
    expect(isRefused(await caught(throttled.api), 'too_many_attempts')).toBe(true);
  });

  it('resets a password and reads no body from the 204', async () => {
    const { api } = apiOver(() => ({ status: 204, unreadable: true }));

    await expect(api.reset({ token: 'tok', password: 'password1234' })).resolves.toBeUndefined();
  });

  it('sends the two routes that must not say whether an address exists and asks nothing of the body', async () => {
    const { api, calls } = apiOver(() => ({ status: 202, body: { status: 'sent' } }));

    await expect(api.resend('a@b.c')).resolves.toEqual({ status: 'sent' });
    await expect(api.forgot('a@b.c')).resolves.toEqual({ status: 'sent' });
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.test/auth/password/verify/resend',
      'https://api.test/auth/password/forgot',
    ]);
  });

  it('maps a caught value that is not an ApiError to unknown', () => {
    expect(failureOf(new Error('boom'))).toBe('unknown');
    expect(failureOf(new ApiError('offline', null, null, 'x'))).toBe('offline');
    expect(isRefused(new Error('boom'), 'invalid_token')).toBe(false);
  });
});
