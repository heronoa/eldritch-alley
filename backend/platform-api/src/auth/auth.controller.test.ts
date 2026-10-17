import { importSPKI, jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
import { FakeProvider } from './fake.provider';
import { GAME_TICKET_ISSUER } from './game-ticket';
import type { ProviderProfile } from './provider';
import { signSession } from './session';
import {
  SESSION_COOKIE,
  asRequestCookie,
  cookieValue,
  setCookies,
  signIn,
  startTestApp,
  testTicketKeys,
  type TestApp,
} from './test-app';

// The two routes that need a session, against a real one obtained the way a player obtains it: through
// the whole callback. Nothing here reaches into the service to mint a cookie.
const PLAYER: ProviderProfile = {
  providerUserId: 'gh-9001',
  email: 'ticket@example.com',
  emailVerified: true,
  displayName: 'Ticket Holder',
  avatarUrl: null,
};

describe.skipIf(!hasDatabase)('the session routes', () => {
  let databaseUrl: string;
  let app: TestApp;
  let session: string;

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    app = await startTestApp({
      databaseUrl,
      providers: {
        github: new FakeProvider('github', () => PLAYER),
        google: new FakeProvider('google', () => PLAYER),
      },
    });

    const { response } = await signIn(app.url, 'github');
    session = cookieValue(setCookies(response), SESSION_COOKIE) ?? '';
    expect(session).not.toBe('');
  });

  afterAll(async () => {
    await app?.close();
    await dropScratchDatabase(databaseUrl);
  });

  function post(path: string, cookie?: string): Promise<Response> {
    return fetch(`${app.url}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: cookie === undefined ? {} : { cookie },
    });
  }

  describe('POST /auth/game-ticket', () => {
    it('answers 401 without a session, in the shape every error has', async () => {
      const response = await post('/auth/game-ticket');

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(typeof body.code).toBe('string');
      expect(typeof body.message).toBe('string');
    });

    it('answers 401 for a cookie signed with another secret', async () => {
      const forged = await signSession(
        { userId: 'someone-else', sessionId: 'not-a-session', issuedAt: Date.now() },
        {
          secret: 'a-secret-the-service-never-saw',
          cookieDomain: 'eldritch.test',
          clientOrigin: 'https://eldritch.test',
          maxAgeSeconds: 2_592_000,
        },
      );

      const response = await post('/auth/game-ticket', `${SESSION_COOKIE}=${forged}`);

      expect(response.status).toBe(401);
    });

    it('issues a ticket the match server can verify with the public key alone', async () => {
      const me = await fetch(`${app.url}/me`, { headers: { cookie: `${SESSION_COOKIE}=${session}` } });
      const { user } = await me.json();

      const response = await post('/auth/game-ticket', `${SESSION_COOKIE}=${session}`);
      expect(response.status).toBe(200);

      const { ticket, expiresAt } = await response.json();
      const { publicKey } = await testTicketKeys();
      const { payload, protectedHeader } = await jwtVerify(ticket, await importSPKI(publicKey, 'EdDSA'));

      expect(protectedHeader.alg).toBe('EdDSA');
      expect(payload.iss).toBe(GAME_TICKET_ISSUER);
      expect(payload.sub).toBe(user.id);
      expect(payload.exp! - payload.iat!).toBe(300);
      expect(new Date(expiresAt).getTime()).toBe(payload.exp! * 1000);
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the cookie, and the cleared cookie is worth nothing afterwards', async () => {
      const before = await fetch(`${app.url}/me`, { headers: { cookie: `${SESSION_COOKIE}=${session}` } });
      expect(before.status).toBe(200);

      const response = await post('/auth/logout', `${SESSION_COOKIE}=${session}`);
      expect(response.status).toBe(204);

      const cleared = setCookies(response).find((one) => one.startsWith(`${SESSION_COOKIE}=`));
      expect(cleared).toBeDefined();
      expect(cleared).toContain('Max-Age=0');

      const after = await fetch(`${app.url}/me`, {
        headers: { cookie: asRequestCookie([cleared!]) },
      });
      expect(after.status).toBe(401);
    });
  });
});
