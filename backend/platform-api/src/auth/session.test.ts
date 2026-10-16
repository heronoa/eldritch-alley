import { describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  readSession,
  sessionCookie,
  signSession,
  type SessionConfig,
} from './session';

// The session is a signed cookie and nothing else: there is no server-side store to consult, so every
// property here is a property of the value itself (index decision D3).
const config: SessionConfig = {
  secret: 'a-development-session-secret-of-32-characters',
  cookieDomain: '.eldritch.heronoa.com.br',
  clientOrigin: 'https://eldritch.heronoa.com.br',
  maxAgeSeconds: 2_592_000,
};

const localhost: SessionConfig = {
  ...config,
  clientOrigin: 'http://localhost:5173',
  cookieDomain: 'localhost',
};

const USER_ID = '6f1c1f4e-6a1e-4a3f-9d0e-2f9a7c5b1d33';
const SESSION_ID = 'b7c1c0de-9f2a-4a5e-8f1b-3c4d5e6f7a8b';

function payload(overrides: Partial<{ issuedAt: number }> = {}) {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    issuedAt: overrides.issuedAt ?? Date.now(),
  };
}

/** The `Set-Cookie` header as attributes, so a case can ask about one flag by name. */
function attributes(header: string): Map<string, string> {
  const [, ...rest] = header.split(';');
  return new Map(
    rest.map((part) => {
      const [name, value = ''] = part.trim().split('=');
      return [name.toLowerCase(), value];
    }),
  );
}

describe('the session value', () => {
  it('verifies with the same secret and carries the user id, the session id and when it was issued', async () => {
    const issuedAt = Date.now();
    const value = await signSession(payload({ issuedAt }), config);

    const session = await readSession(value, config);
    expect(session?.userId).toBe(USER_ID);
    expect(session?.sessionId).toBe(SESSION_ID);
    expect(session?.issuedAt).toBe(issuedAt);
  });

  it('is refused when one character of it is changed', async () => {
    const value = await signSession(payload(), config);
    const middle = Math.floor(value.length / 2);
    const flipped = value[middle] === 'a' ? 'b' : 'a';
    const tampered = value.slice(0, middle) + flipped + value.slice(middle + 1);

    expect(tampered).not.toBe(value);
    expect(await readSession(tampered, config)).toBeNull();
  });

  it('is refused when it was signed with another secret', async () => {
    const value = await signSession(payload(), config);

    expect(await readSession(value, { ...config, secret: 'another-secret-of-the-same-length-here' })).toBeNull();
  });

  it('is refused once it is older than the maximum age', async () => {
    const stale = payload({ issuedAt: Date.now() - (config.maxAgeSeconds + 60) * 1000 });

    expect(await readSession(await signSession(stale, config), config)).toBeNull();
  });

  it('is refused when it is not a signed value at all', async () => {
    expect(await readSession('', config)).toBeNull();
    expect(await readSession('not.a.jwt', config)).toBeNull();
  });
});

describe('the cookie the service sets', () => {
  it('is HttpOnly, SameSite=Lax, Path=/, on the configured domain, and Secure away from localhost', async () => {
    const header = sessionCookie(await signSession(payload(), config), config);
    const parts = attributes(header);

    expect(header.startsWith('ea_session=')).toBe(true);
    expect(parts.has('httponly')).toBe(true);
    expect(parts.get('samesite')).toBe('Lax');
    expect(parts.get('path')).toBe('/');
    expect(parts.get('domain')).toBe('.eldritch.heronoa.com.br');
    expect(parts.has('secure')).toBe(true);
    expect(Number(parts.get('max-age'))).toBe(config.maxAgeSeconds);
  });

  // The local flow runs over plain HTTP with no certificate. `Secure` is dropped for a localhost
  // origin and for nothing else — the rule reads the origin, not NODE_ENV (plan D6).
  it('drops Secure on a localhost origin and keeps every other flag', async () => {
    const header = sessionCookie(await signSession(payload(), localhost), localhost);
    const parts = attributes(header);

    expect(parts.has('secure')).toBe(false);
    expect(parts.has('httponly')).toBe(true);
    expect(parts.get('samesite')).toBe('Lax');
    expect(parts.get('domain')).toBe('localhost');
  });

  it('is cleared by an empty value that expires at once', () => {
    const header = clearSessionCookie(config);
    const parts = attributes(header);

    expect(header.startsWith('ea_session=;')).toBe(true);
    expect(parts.get('max-age')).toBe('0');
    expect(parts.has('httponly')).toBe(true);
    expect(attributes(clearSessionCookie(localhost)).has('secure')).toBe(false);
  });
});
