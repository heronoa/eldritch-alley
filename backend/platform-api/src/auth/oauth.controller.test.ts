import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
import { FakeProvider } from './fake.provider';
import type { ProviderProfile } from './provider';
import {
  CLIENT_ORIGIN,
  FakeMailer,
  KEYCLOAK_ISSUER,
  SESSION_COOKIE,
  asRequestCookie,
  cookieValue,
  setCookies,
  signIn,
  startTestApp,
  type TestApp,
} from './test-app';

// The flow end to end, over a real socket: the real controller, the real guard and the real cookies.
// The two providers are replaced, because a test cannot talk to GitHub — everything else is what runs
// in production.
const PLAYER: ProviderProfile = {
  providerUserId: 'gh-4242',
  email: 'player@example.com',
  emailVerified: true,
  displayName: 'Heron Amaral',
  avatarUrl: 'https://avatars.example/heron.png',
};

/** A mailer that fails the way an SMTP server does, so a case can watch the callback absorb it. */
class RefusingMailer extends FakeMailer {
  override async send(): Promise<void> {
    throw new Error('the mail server refused the message');
  }
}

describe.skipIf(!hasDatabase)('the OAuth routes', () => {
  let databaseUrl: string;
  let app: TestApp;
  const started: TestApp[] = [];

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    app = await startTestApp({ databaseUrl });
  });

  afterAll(async () => {
    await Promise.all([app, ...started].map((one) => one.close()));
    await dropScratchDatabase(databaseUrl);
  });

  /** An app whose two providers answer from memory, so no case here needs the network. */
  async function appWithProvider(respond: () => ProviderProfile): Promise<TestApp> {
    const withOwnApp = await startTestApp({
      databaseUrl,
      providers: {
        github: new FakeProvider('github', respond),
        google: new FakeProvider('google', respond),
      },
    });
    started.push(withOwnApp);
    return withOwnApp;
  }

  /** An app whose two providers answer with profiles of their own — what a link needs. */
  async function appWithTwoProfiles(
    github: ProviderProfile,
    google: ProviderProfile,
    mailer?: FakeMailer,
  ): Promise<TestApp> {
    const withOwnApp = await startTestApp({
      databaseUrl,
      ...(mailer === undefined ? {} : { mailer }),
      providers: {
        github: new FakeProvider('github', () => github),
        google: new FakeProvider('google', () => google),
      },
    });
    started.push(withOwnApp);
    return withOwnApp;
  }

  /** A first sign-in with GitHub, for the cases about what a second one does. */
  function noticeProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
    return {
      providerUserId: 'gh-notice',
      email: 'notice.player@example.com',
      emailVerified: true,
      displayName: 'Notice Player',
      avatarUrl: null,
      ...overrides,
    };
  }

  describe('starting the flow', () => {
    it('sends the browser to GitHub with an S256 challenge, a state, and one cookie that is not the session', async () => {
      const response = await fetch(`${app.url}/auth/github`, { redirect: 'manual' });

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location') ?? '');
      expect(`${location.origin}${location.pathname}`).toBe('https://github.com/login/oauth/authorize');
      expect(location.searchParams.get('client_id')).toBe('github-client-id');
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');
      expect((location.searchParams.get('code_challenge') ?? '').length).toBeGreaterThan(20);
      expect((location.searchParams.get('state') ?? '').length).toBeGreaterThan(10);

      // No PKCE verifier in the URL: it travels in the cookie, which the callback is the only reader of.
      expect(location.searchParams.get('code_verifier')).toBeNull();

      const cookies = setCookies(response);
      expect(cookies).toHaveLength(1);
      expect(cookies[0].startsWith(`${SESSION_COOKIE}=`)).toBe(false);
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[0]).toContain('Path=/');
      expect(cookies[0].toLowerCase()).toContain('samesite=lax');
    });

    it('answers 404 for a provider it does not have', async () => {
      const response = await fetch(`${app.url}/auth/gitlab`, { redirect: 'manual' });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(typeof body.code).toBe('string');
      expect(typeof body.message).toBe('string');
    });

    it('answers 404 for Keycloak when the deployment has no realm', async () => {
      // The switch is off, so the route the realm would own does not exist — the same refusal an
      // unknown provider has always had, and not a button that leads nowhere.
      const response = await fetch(`${app.url}/auth/keycloak`, { redirect: 'manual' });

      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe('unknown_provider');
    });
  });

  describe('the Keycloak flow', () => {
    it('sends the browser to the realm with the API callback, when the realm is configured', async () => {
      const withRealm = await startTestApp({ databaseUrl, keycloak: true });
      started.push(withRealm);

      const response = await fetch(`${withRealm.url}/auth/keycloak`, { redirect: 'manual' });

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location') ?? '');
      expect(`${location.origin}${location.pathname}`).toBe(
        `${KEYCLOAK_ISSUER}/protocol/openid-connect/auth`,
      );
      expect(location.searchParams.get('client_id')).toBe('keycloak-client-id');
      expect(location.searchParams.get('redirect_uri')).toBe(
        'https://api.eldritch.test/auth/keycloak/callback',
      );
      expect(location.searchParams.get('scope')).toBe('openid profile email');
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');

      const cookies = setCookies(response);
      expect(cookies).toHaveLength(1);
      expect(cookies[0].startsWith(`${SESSION_COOKIE}=`)).toBe(false);
    });

    it('signs the player in through the realm and sets the session', async () => {
      const withRealm = await startTestApp({
        databaseUrl,
        keycloak: true,
        providers: { keycloak: new FakeProvider('keycloak', () => PLAYER) },
      });
      started.push(withRealm);

      const { response } = await signIn(withRealm.url, 'keycloak');

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(CLIENT_ORIGIN);
      expect(cookieValue(setCookies(response), SESSION_COOKIE)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });
  });

  describe('finishing the flow', () => {
    it('refuses a state that does not match the cookie, and signs nobody in', async () => {
      const start = await fetch(`${app.url}/auth/github`, { redirect: 'manual' });
      const cookies = setCookies(start);

      const response = await fetch(`${app.url}/auth/github/callback?code=x&state=not-the-state`, {
        redirect: 'manual',
        headers: { cookie: asRequestCookie(cookies) },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(typeof body.code).toBe('string');
      expect(typeof body.message).toBe('string');
      expect(cookieValue(setCookies(response), SESSION_COOKIE)).toBeUndefined();
    });

    it('refuses a callback with no flow cookie at all', async () => {
      const response = await fetch(`${app.url}/auth/github/callback?code=x&state=whatever`, {
        redirect: 'manual',
      });

      expect(response.status).toBe(400);
      expect(cookieValue(setCookies(response), SESSION_COOKIE)).toBeUndefined();
    });

    it('signs the player in and sends the browser back to the client, with a session cookie', async () => {
      const fake = await appWithProvider(() => PLAYER);

      const { response } = await signIn(fake.url, 'github');

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(CLIENT_ORIGIN);

      const cookie = setCookies(response).find((one) => one.startsWith(`${SESSION_COOKIE}=`));
      expect(cookie).toBeDefined();
      expect(cookieValue(setCookies(response), SESSION_COOKIE)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Secure');
    });

    it('refuses a state that has already been spent', async () => {
      const fake = await appWithProvider(() => PLAYER);

      const start = await fetch(`${fake.url}/auth/github`, { redirect: 'manual' });
      const cookies = setCookies(start);
      const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
      const callback = `${fake.url}/auth/github/callback?code=x&state=${state}`;
      const headers = { cookie: asRequestCookie(cookies) };

      const first = await fetch(callback, { redirect: 'manual', headers });
      const second = await fetch(callback, { redirect: 'manual', headers });

      expect(first.status).toBe(302);
      expect(second.status).toBe(400);
      expect(cookieValue(setCookies(second), SESSION_COOKIE)).toBeUndefined();
    });

    it('answers 502 when the provider refuses the exchange, and never repeats what it said', async () => {
      const fake = await appWithProvider(() => {
        throw new Error('invalid_client: the client secret is hunter2');
      });

      const { response } = await signIn(fake.url, 'github');

      expect(response.status).toBe(502);
      const body = await response.text();
      expect(body).not.toContain('hunter2');
      expect(body).not.toContain('invalid_client');
      const parsed = JSON.parse(body);
      expect(typeof parsed.code).toBe('string');
      expect(typeof parsed.message).toBe('string');
    });
  });

  // A link is a new way into an account that already exists, and the person who owns the address is the
  // only one who can tell whether it was them. The notice is what makes an unwanted way in visible.
  describe('the linked-account notice', () => {
    it('sends one message, to the verified address, when a second provider links', async () => {
      const linked = await appWithTwoProfiles(
        noticeProfile({ providerUserId: 'gh-notice' }),
        // The same address in another spelling and another case: the platform stores one spelling.
        noticeProfile({ providerUserId: 'go-notice', email: 'Notice.Player@Example.COM' }),
      );

      const first = await signIn(linked.url, 'github');
      expect(first.response.status).toBe(302);
      expect(linked.mailer.sent).toHaveLength(0);

      const second = await signIn(linked.url, 'google');
      expect(second.response.status).toBe(302);
      expect(linked.mailer.sent).toHaveLength(1);
      expect(linked.mailer.sent[0].to).toBe('notice.player@example.com');
      expect(linked.mailer.sent[0].subject).toContain('new way in');
      expect(linked.mailer.sent[0].text).toContain('Google');

      // A pair that was already known adds nothing, so a third sign-in is silent.
      await signIn(linked.url, 'google');
      expect(linked.mailer.sent).toHaveLength(1);
    });

    it('sends none when the sign-in is what creates the account', async () => {
      const created = await appWithTwoProfiles(
        noticeProfile({ providerUserId: 'gh-notice-new', email: 'notice.new@example.com' }),
        noticeProfile({ providerUserId: 'go-notice-new', email: 'notice.other@example.com' }),
      );

      await signIn(created.url, 'github');
      expect(created.mailer.sent).toHaveLength(0);
    });

    it('sends none when an unverified address matches, because no link was made', async () => {
      const unverified = await appWithTwoProfiles(
        noticeProfile({ providerUserId: 'gh-notice-unverified', email: 'notice.unverified@example.com' }),
        noticeProfile({
          providerUserId: 'go-notice-unverified',
          email: 'notice.unverified@example.com',
          emailVerified: false,
        }),
      );

      await signIn(unverified.url, 'github');
      const second = await signIn(unverified.url, 'google');

      // A new account, not a link: the rule refuses the match from the side arriving now.
      expect(second.response.status).toBe(302);
      expect(unverified.mailer.sent).toHaveLength(0);
    });

    it('does not turn a successful sign-in into an error when the mailer refuses', async () => {
      const refusing = await appWithTwoProfiles(
        noticeProfile({ providerUserId: 'gh-notice-refused', email: 'notice.refused@example.com' }),
        noticeProfile({ providerUserId: 'go-notice-refused', email: 'notice.refused@example.com' }),
        new RefusingMailer(),
      );

      await signIn(refusing.url, 'github');
      const second = await signIn(refusing.url, 'google');

      // The player is already signed in; a courtesy message that could not be sent is logged and the
      // callback answers exactly as it would have.
      expect(second.response.status).toBe(302);
      expect(second.response.headers.get('location')).toBe(CLIENT_ORIGIN);
      expect(cookieValue(setCookies(second.response), SESSION_COOKIE)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });
  });

  // Which providers exist is a question only the server can answer: the client is published as static
  // assets and cannot read the server's environment, so it asks (§ 8, D8).
  describe('the provider list', () => {
    it('is both providers, in a fixed order, when both are configured', async () => {
      const response = await fetch(`${app.url}/auth/providers`);

      // The 200 is also the assertion that this route is declared before `GET /auth/:provider`:
      // declared after it, `providers` would be read as a provider called `providers` and answer 404.
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ providers: ['github', 'google'] });
    });

    it('is only Keycloak when the realm is configured alongside the direct pairs', async () => {
      const withRealm = await startTestApp({ databaseUrl, keycloak: true });
      started.push(withRealm);

      // The direct credentials are still in the environment (the harness sets them), and they are not
      // built: the realm brokers those providers, and two doors would mean two accounts.
      expect(await (await fetch(`${withRealm.url}/auth/providers`)).json()).toEqual({
        providers: ['keycloak'],
      });

      const direct = await fetch(`${withRealm.url}/auth/github`, { redirect: 'manual' });
      expect(direct.status).toBe(404);
      expect((await direct.json()).code).toBe('unknown_provider');
    });

    it('is only the provider that is configured', async () => {
      const only = await startTestApp({
        databaseUrl,
        providers: { github: new FakeProvider('github', () => PLAYER) },
      });
      started.push(only);

      expect(await (await fetch(`${only.url}/auth/providers`)).json()).toEqual({ providers: ['github'] });
    });

    it('is empty when no provider is configured, and the platform answers everything else', async () => {
      const none = await startTestApp({ databaseUrl, oauth: false });
      started.push(none);

      expect(await (await fetch(`${none.url}/auth/providers`)).json()).toEqual({ providers: [] });

      expect((await fetch(`${none.url}/health`)).status).toBe(200);
      expect((await fetch(`${none.url}/me`)).status).toBe(401);
      expect((await fetch(`${none.url}/auth/game-ticket`, { method: 'POST' })).status).toBe(401);
    });

    it('refuses to start a flow for a provider that is not configured', async () => {
      const none = await startTestApp({ databaseUrl, oauth: false });
      started.push(none);

      // The route dispatch refuses before the handler body runs, so there is no account written and
      // nothing to roll back — the same refusal an unknown provider has always had.
      const response = await fetch(`${none.url}/auth/github`, { redirect: 'manual' });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: 'unknown_provider',
        message: 'There is no provider called github.',
      });
    });
  });

  describe('CORS', () => {
    it('allows the client origin with credentials', async () => {
      const response = await fetch(`${app.url}/me`, {
        method: 'OPTIONS',
        headers: { origin: CLIENT_ORIGIN, 'access-control-request-method': 'GET' },
      });

      expect(response.headers.get('access-control-allow-origin')).toBe(CLIENT_ORIGIN);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('says nothing to any other origin', async () => {
      const response = await fetch(`${app.url}/me`, {
        method: 'OPTIONS',
        headers: { origin: 'https://somewhere-else.test', 'access-control-request-method': 'GET' },
      });

      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});
