import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from '../db/test-database';
import { MatchesService } from '../matches/matches.service';
import { FakeProvider } from './fake.provider';
import type { ProviderProfile } from './provider';
import { DEFAULT_MAX_FAILURES, FAILURE_THROTTLE, type FailureThrottle } from './throttle';
import {
  SESSION_COOKIE,
  cookieValue,
  setCookies,
  signIn,
  startTestApp,
  type TestApp,
} from './test-app';

// The whole route over a real socket and a real database: the real controller, the real guards, the real
// cascade. Nothing is mocked that participates in the decision — the mailer records instead of sending,
// and the SSO provider answers from memory, which is the same replacement every route test makes.
const PASSWORD = 'a password long enough to be a password';
const WRONG_PASSWORD = 'a password nobody chose for this account';
const CONFIRM = { confirm: 'DELETE' } as const;

const PLAYER: ProviderProfile = {
  providerUserId: 'gh-delete',
  email: 'delete.sso@example.com',
  emailVerified: true,
  displayName: 'Delete Player',
  avatarUrl: null,
};

describe.skipIf(!hasDatabase)('DELETE /auth/account', () => {
  let databaseUrl: string;
  let app: TestApp;
  let answering: ProviderProfile;

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    answering = PLAYER;
    app = await startTestApp({
      databaseUrl,
      providers: { github: new FakeProvider('github', () => answering) },
    });
  });

  afterAll(async () => {
    await app?.close();
    await dropScratchDatabase(databaseUrl);
  });

  let sequence = 0;

  /** An address of this case's own, so no case inherits another's account or throttle counter. */
  function anAddress(): string {
    sequence += 1;
    return `delete${sequence}@example.com`;
  }

  function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${app.url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function remove(
    session: string | undefined,
    body: unknown,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
    if (session !== undefined) headers.cookie = `${SESSION_COOKIE}=${session}`;
    return fetch(`${app.url}/auth/account`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify(body),
    });
  }

  async function userWith(session: string): Promise<{ id: string; email: string | null }> {
    const response = await fetch(`${app.url}/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    });
    expect(response.status).toBe(200);
    const { user } = await response.json();
    return user;
  }

  /**
   * An account with a verified address and a password, signed in through the flow the route itself
   * opens: register, follow the mailed link, keep the cookie the verification handed out.
   */
  async function aPasswordAccount(): Promise<{ email: string; userId: string; session: string }> {
    const email = anAddress();
    expect((await post('/auth/password/register', { email, password: PASSWORD })).status).toBe(202);

    const token = app.mailer.lastToken();
    if (token === undefined) throw new Error('no message carried a verification link');

    const verified = await post('/auth/password/verify', { token });
    expect(verified.status).toBe(200);

    const session = cookieValue(setCookies(verified), SESSION_COOKIE) ?? '';
    expect(session).not.toBe('');

    const user = await userWith(session);
    return { email, userId: user.id, session };
  }

  /** An account that has only ever been entered through a provider. */
  async function anSsoAccount(overrides: Partial<ProviderProfile> = {}): Promise<{
    email: string | null;
    userId: string;
    session: string;
  }> {
    // A pair and an address of its own per account: sharing the address with another case's account
    // would make the linking rule attach this sign-in to that one instead of creating a new account.
    answering = { ...PLAYER, email: anAddress(), ...overrides, providerUserId: `gh-${anAddress()}` };

    const { response } = await signIn(app.url, 'github');
    expect(response.status).toBe(302);

    const session = cookieValue(setCookies(response), SESSION_COOKIE) ?? '';
    expect(session).not.toBe('');

    const user = await userWith(session);
    return { email: user.email, userId: user.id, session };
  }

  /**
   * How many rows of every table that belongs to a player the database holds. Read with SQL of the
   * case's own, because the point of the assertion is the cascade and not the ORM's view of it.
   */
  async function rowsFor(userId: string): Promise<Record<string, number>> {
    const tables: [string, string][] = [
      ['users', `select count(*)::int as n from "users" where "id" = $1`],
      ['identities', `select count(*)::int as n from "identities" where "user_id" = $1`],
      [
        'password_credentials',
        `select count(*)::int as n from "password_credentials" pc
           join "identities" i on i."id" = pc."identity_id" where i."user_id" = $1`,
      ],
      [
        'auth_tokens',
        `select count(*)::int as n from "auth_tokens" t
           join "identities" i on i."id" = t."identity_id" where i."user_id" = $1`,
      ],
      ['agents', `select count(*)::int as n from "agents" where "user_id" = $1`],
      ['matches', `select count(*)::int as n from "matches" where "user_id" = $1`],
      [
        'match_agents',
        `select count(*)::int as n from "match_agents" ma
           join "matches" m on m."id" = ma."match_id" where m."user_id" = $1`,
      ],
      [
        'match_events',
        `select count(*)::int as n from "match_events" me
           join "matches" m on m."id" = me."match_id" where m."user_id" = $1`,
      ],
    ];

    return withClient(databaseUrl, async (client) => {
      const counts: Record<string, number> = {};
      for (const [table, sql] of tables) {
        const { rows } = await client.query<{ n: number }>(sql, [userId]);
        counts[table] = rows[0]?.n ?? -1;
      }
      return counts;
    });
  }

  /** A finished match for the account, written through the same service the consumer uses. */
  async function aMatchFor(userId: string, id: string): Promise<void> {
    await app.get(MatchesService).store({
      id,
      userId,
      seed: 4_242,
      mapId: 'overpass',
      protocolVersion: 10,
      units: [
        { unitId: 'A-sniper', class: 'sniper' },
        { unitId: 'A-wizard', class: 'wizard' },
        { unitId: 'A-priest', class: 'priest' },
      ],
      result: 'won',
      rounds: 7,
      startedAt: '2026-10-16T18:00:00.000Z',
      endedAt: '2026-10-16T18:07:30.000Z',
      finalStateHash: 3_000_000_000,
      events: [{ type: 'turn-ended', actor: 'A-sniper', round: 1 }],
    });
  }

  describe('who may ask', () => {
    it('answers 401 without a cookie and for a cookie that verifies to nobody', async () => {
      const response = await remove(undefined, CONFIRM);

      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('unauthenticated');

      const forged = await remove('not.a.signed-session', CONFIRM);
      expect(forged.status).toBe(401);
    });

    it('answers 401 for the cookie of an account that has been deleted', async () => {
      const { session } = await aPasswordAccount();
      expect((await remove(session, { ...CONFIRM, password: PASSWORD })).status).toBe(204);

      // The signature still verifies; there is simply nobody behind it any more.
      const again = await remove(session, { ...CONFIRM, password: PASSWORD });
      expect(again.status).toBe(401);
      expect((await again.json()).code).toBe('unauthenticated');
    });
  });

  describe('the confirmation', () => {
    it('refuses anything but the exact, case-sensitive word, and leaves the account alone', async () => {
      const { session } = await aPasswordAccount();

      for (const confirm of [undefined, 'delete', 'Delete', 'DELETE ', '', 42]) {
        const response = await remove(session, { confirm });

        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('invalid_confirmation');
      }

      // Four refusals and the account still answers: a confirmation is checked before anything is read
      // for deletion.
      await userWith(session);
    });

    it('refuses a body that is not an object, which cannot carry a confirmation', async () => {
      const { session } = await aPasswordAccount();

      // An array is valid JSON and is not a body this route reads, so the refusal is ours and says why.
      const array = await remove(session, []);
      expect(array.status).toBe(400);
      expect((await array.json()).code).toBe('invalid_confirmation');

      // A bare `null` never reaches the handler: the body parser refuses it first, with the same status
      // and a shape that is not this platform's promise.
      expect((await remove(session, null)).status).toBe(400);
    });
  });

  describe('the password proof', () => {
    it('requires the password of an account that has one', async () => {
      const { session } = await aPasswordAccount();

      const missing = await remove(session, CONFIRM);
      expect(missing.status).toBe(403);
      expect((await missing.json()).code).toBe('invalid_password');

      const wrong = await remove(session, { ...CONFIRM, password: WRONG_PASSWORD });
      expect(wrong.status).toBe(403);
      expect((await wrong.json()).code).toBe('invalid_password');

      await userWith(session);
    });

    it('deletes when the password is right, and answers 204 with the cookie cleared', async () => {
      const { email, userId, session } = await aPasswordAccount();
      const sentBefore = app.mailer.sent.length;

      const response = await remove(session, { ...CONFIRM, password: PASSWORD });

      expect(response.status).toBe(204);

      const cleared = setCookies(response).find((one) => one.startsWith(`${SESSION_COOKIE}=`));
      expect(cleared).toBeDefined();
      expect(cleared).toContain('Max-Age=0');

      // One message, to the address as it was before the row holding it disappeared.
      expect(app.mailer.sent.length).toBe(sentBefore + 1);
      expect(app.mailer.sent.at(-1)?.to).toBe(email);
      expect(app.mailer.sent.at(-1)?.subject).toContain('deleted');

      expect(await rowsFor(userId)).toEqual({
        users: 0,
        identities: 0,
        password_credentials: 0,
        auth_tokens: 0,
        agents: 0,
        matches: 0,
        match_agents: 0,
        match_events: 0,
      });
    });

    it('deletes an account without a usable password on the confirmation alone', async () => {
      const { userId, session } = await anSsoAccount();

      const response = await remove(session, CONFIRM);

      expect(response.status).toBe(204);
      expect((await rowsFor(userId)).users).toBe(0);
    });

    it('ignores a password sent for an account that has none', async () => {
      const { userId, session } = await anSsoAccount();

      const response = await remove(session, { ...CONFIRM, password: WRONG_PASSWORD });

      expect(response.status).toBe(204);
      expect((await rowsFor(userId)).users).toBe(0);
    });

    it('refuses after ten wrong passwords, before the hash is checked, and a right one clears the count', async () => {
      const { session } = await aPasswordAccount();

      for (let attempt = 1; attempt <= DEFAULT_MAX_FAILURES; attempt += 1) {
        const response = await remove(session, { ...CONFIRM, password: `${WRONG_PASSWORD} ${attempt}` });
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe('invalid_password');
      }

      // The right password would delete the account — and that is exactly what the answer proves was not
      // tried: the throttle refuses before the hash is computed.
      const throttled = await remove(session, { ...CONFIRM, password: PASSWORD });
      expect(throttled.status).toBe(429);
      expect((await throttled.json()).code).toBe('too_many_attempts');

      // A different account, held one failure short of the limit by the counter itself, is allowed
      // through by the right password — and the proof that it cleared the account's count is the count.
      const other = await aPasswordAccount();
      const throttle = app.get<FailureThrottle>(FAILURE_THROTTLE);
      for (let attempt = 1; attempt < DEFAULT_MAX_FAILURES; attempt += 1) {
        throttle.record(other.email, 'a-test-address');
      }
      expect(throttle.tooMany(other.email, 'a-test-address')).toBe(false);

      const accepted = await remove(other.session, { ...CONFIRM, password: PASSWORD });
      expect(accepted.status).toBe(204);
      expect(throttle.tooMany(other.email, 'a-test-address')).toBe(false);
    });
  });

  describe('what is erased', () => {
    it('erases every row of the account, its squads and its matches, and nobody else’s', async () => {
      const doomed = await aPasswordAccount();
      const survivor = await aPasswordAccount();
      await aMatchFor(doomed.userId, '0f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b');
      await aMatchFor(survivor.userId, '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');

      // Both accounts hold a match, a squad, identities and tokens before the delete.
      expect(await rowsFor(doomed.userId)).toMatchObject({ matches: 1, match_agents: 3, match_events: 1 });
      const survivorsBefore = await rowsFor(survivor.userId);

      expect((await remove(doomed.session, { ...CONFIRM, password: PASSWORD })).status).toBe(204);

      expect(Object.values(await rowsFor(doomed.userId)).every((count) => count === 0)).toBe(true);
      expect(await rowsFor(survivor.userId)).toEqual(survivorsBefore);
      await userWith(survivor.session);
    });

    it('revokes the old cookie on every route that acts for the player, but not on logout', async () => {
      const { session } = await aPasswordAccount();
      expect((await remove(session, { ...CONFIRM, password: PASSWORD })).status).toBe(204);

      const cookie = `${SESSION_COOKIE}=${session}`;
      for (const path of ['/me', '/me/matches']) {
        const response = await fetch(`${app.url}${path}`, { headers: { cookie } });
        expect(response.status).toBe(401);
        expect((await response.json()).code).toBe('unauthenticated');
      }

      const ticket = await fetch(`${app.url}/auth/game-ticket`, { method: 'POST', headers: { cookie } });
      expect(ticket.status).toBe(401);

      // Signing out must still work: the cookie is all there is to clear, and refusing would leave it in
      // the browser until it aged out.
      const logout = await fetch(`${app.url}/auth/logout`, { method: 'POST', headers: { cookie } });
      expect(logout.status).toBe(204);
      const cleared = setCookies(logout).find((one) => one.startsWith(`${SESSION_COOKIE}=`));
      expect(cleared).toContain('Max-Age=0');
    });
  });

  describe('the confirmation of what happened', () => {
    it('writes the record in the language the request asked for', async () => {
      const { email, session } = await aPasswordAccount();

      const response = await remove(
        session,
        { ...CONFIRM, password: PASSWORD },
        { 'accept-language': 'pt-BR' },
      );

      expect(response.status).toBe(204);
      expect(app.mailer.sent.at(-1)?.to).toBe(email);
      expect(app.mailer.sent.at(-1)?.subject).toBe('Sua conta foi excluída — Eldritch Alley: Tactics');
      expect(app.mailer.sent.at(-1)?.text).toContain('foi excluída');
    });

    it('sends no message when the account has no address to send one to', async () => {
      const { session } = await anSsoAccount({ email: null });
      const sentBefore = app.mailer.sent.length;

      expect((await remove(session, CONFIRM)).status).toBe(204);
      expect(app.mailer.sent.length).toBe(sentBefore);
    });
  });

  describe('what the profile tells the client', () => {
    it('answers hasPassword true for an account that chose one, and false for an SSO account', async () => {
      const withPassword = await aPasswordAccount();
      const withoutPassword = await anSsoAccount();

      const passwordMe = await fetch(`${app.url}/me`, {
        headers: { cookie: `${SESSION_COOKIE}=${withPassword.session}` },
      });
      expect((await passwordMe.json()).hasPassword).toBe(true);

      const ssoMe = await fetch(`${app.url}/me`, {
        headers: { cookie: `${SESSION_COOKIE}=${withoutPassword.session}` },
      });
      expect((await ssoMe.json()).hasPassword).toBe(false);
    });
  });
});
