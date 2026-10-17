import { EntityManager } from '@mikro-orm/postgresql';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseModule, ENTITY_MANAGER } from '../db/database.module';
import { Agent } from '../db/entities/agent.entity';
import { Identity } from '../db/entities/identity.entity';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
import { FakeProvider } from './fake.provider';
import { MIN_PASSWORD_LENGTH } from './password';
import type { ProviderProfile } from './provider';
import {
  SESSION_COOKIE,
  asRequestCookie,
  cookieValue,
  setCookies,
  signIn,
  startTestApp,
  type TestApp,
} from './test-app';
import { DEFAULT_MAX_FAILURES } from './throttle';

// The whole way in over a real socket, against the PostgreSQL of CI: the real controller, the real
// services, the real migrations. Two things are replaced and only two — the mailer, because no case may
// open a socket to Zoho, and the OAuth providers, because a test cannot talk to Google. What the mailer
// would have sent is read back out of the fake, which is how a case gets hold of a link the way a player
// gets it out of their mailbox.
const PASSWORD = 'a password long enough to be a password';
const WRONG_PASSWORD = 'a password nobody chose for this account';
const NEW_PASSWORD = 'the password this account has afterwards';

describe.skipIf(!hasDatabase)('the password routes', () => {
  let databaseUrl: string;
  let app: TestApp;
  let em: EntityManager;
  let moduleRef: TestingModule;
  const started: TestApp[] = [];

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    app = await startTestApp({ databaseUrl });

    // The scratch database is read directly for the things a response deliberately does not say — how
    // many accounts an address has, how many agents the squad holds, whether the address is verified.
    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    em = moduleRef.get<EntityManager>(ENTITY_MANAGER);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await Promise.all([app, ...started].map((one) => one.close()));
    await dropScratchDatabase(databaseUrl);
  });

  let sequence = 0;

  /** An address of this case's own, so no case can pass on an account another one made. */
  function anAddress(): string {
    sequence += 1;
    return `player${sequence}@example.com`;
  }

  /**
   * An app of its own, for a case that needs one: either it signs in with a provider, or it is made of
   * failed attempts and would otherwise leave the throttle counting against the cases after it.
   */
  async function anApp(respond?: () => ProviderProfile): Promise<TestApp> {
    const own = await startTestApp({
      databaseUrl,
      ...(respond === undefined ? {} : { providers: { google: new FakeProvider('google', respond) } }),
    });
    started.push(own);
    return own;
  }

  function post(one: TestApp, path: string, body: unknown): Promise<Response> {
    return fetch(`${one.url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const register = (one: TestApp, email: string, body: Record<string, unknown> = {}): Promise<Response> =>
    post(one, '/auth/password/register', { email, password: PASSWORD, ...body });

  const login = (one: TestApp, email: string, password = PASSWORD): Promise<Response> =>
    post(one, '/auth/password/login', { email, password });

  const verify = (one: TestApp, token: string): Promise<Response> =>
    post(one, '/auth/password/verify', { token });

  const forgot = (one: TestApp, email: string): Promise<Response> =>
    post(one, '/auth/password/forgot', { email });

  const reset = (one: TestApp, token: string, password: string): Promise<Response> =>
    post(one, '/auth/password/reset', { token, password });

  /**
   * Registers an address and follows the link, which is the state every case about signing in starts
   * from: the account exists, and the address is one we have verified.
   */
  async function aVerifiedAccount(one: TestApp): Promise<string> {
    const email = anAddress();
    expect((await register(one, email)).status).toBe(202);
    expect((await verify(one, requiredToken(one))).status).toBe(200);
    return email;
  }

  function requiredToken(one: TestApp): string {
    const token = one.mailer.lastToken();
    if (token === undefined) throw new Error('no message carried a link, so there is no token to follow');
    return token;
  }

  /** The one `password` way in for an address, or nothing when the address has none. */
  function passwordIdentity(email: string): Promise<Identity | null> {
    return em
      .fork()
      .findOne(Identity, { provider: 'password', providerUserId: email }, { populate: ['user'] });
  }

  /** Every account that can be entered through this address. Two here is a duplicate account. */
  async function accountsFor(email: string): Promise<string[]> {
    const identities = await em.fork().find(Identity, { email });
    return [...new Set(identities.map((one) => one.user.id))];
  }

  function agentsOf(userId: string): Promise<Agent[]> {
    return em.fork().find(Agent, { user: userId });
  }

  /** The user id behind a session cookie, read through the route the client reads it through. */
  async function meWith(one: TestApp, cookies: string[]): Promise<{ status: number; body: any }> {
    const response = await fetch(`${one.url}/me`, {
      headers: { cookie: asRequestCookie(cookies) },
    });
    return { status: response.status, body: await response.json() };
  }

  describe('registering', () => {
    it('creates an account that cannot be used yet, and mails one link to the address', async () => {
      const email = anAddress();
      const sentBefore = app.mailer.sent.length;

      const response = await register(app, email);

      expect(response.status).toBe(202);
      // The same answer whatever happened behind it — taken address included — which is what keeps this
      // route from being a way to ask which addresses have accounts.
      expect(await response.json()).toEqual({ status: 'sent' });

      const identity = await passwordIdentity(email);
      expect(identity).not.toBeNull();
      expect(identity?.emailVerified).toBe(false);
      // `users.display_name` has no null and there is no provider to ask on this path.
      expect(identity?.user.displayName).toBe(email.split('@')[0]);
      expect(await agentsOf(identity!.user.id)).toHaveLength(3);

      expect(app.mailer.sent.length).toBe(sentBefore + 1);
      expect(app.mailer.sent.at(-1)?.to).toBe(email);
    });

    it('answers the same for an address that is already an account, and creates no second one', async () => {
      const email = anAddress();
      expect((await register(app, email)).status).toBe(202);
      expect((await verify(app, requiredToken(app))).status).toBe(200);

      const identity = await passwordIdentity(email);
      const agentsBefore = await agentsOf(identity!.user.id);
      const sentBefore = app.mailer.sent.length;

      const response = await register(app, email);

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ status: 'sent' });
      expect(await accountsFor(email)).toHaveLength(1);
      expect(await agentsOf(identity!.user.id)).toHaveLength(agentsBefore.length);
      // The address is verified already, so there is nothing left to verify and no second link to send.
      expect(app.mailer.sent.length).toBe(sentBefore);
    });

    it('mails a fresh link for an address that registered and never followed the first one', async () => {
      const email = anAddress();
      expect((await register(app, email)).status).toBe(202);
      const first = requiredToken(app);

      expect((await register(app, email)).status).toBe(202);
      const second = requiredToken(app);

      expect(second).not.toBe(first);
      // One live link per mailbox: the fresh one is what works, and the one it replaced is worth nothing.
      expect((await verify(app, first)).status).toBe(400);
      expect((await verify(app, second)).status).toBe(200);
    });

    it('refuses a password below the policy, naming the limit, and writes nothing', async () => {
      const email = anAddress();

      const response = await register(app, email, { password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) });

      expect(response.status).toBe(400);
      expect((await response.json()).message).toContain(String(MIN_PASSWORD_LENGTH));
      expect(await accountsFor(email)).toHaveLength(0);
    });

    it('refuses a body that is not a registration, in the one error shape', async () => {
      const response = await post(app, '/auth/password/register', { email: anAddress() });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(typeof body.code).toBe('string');
      expect(typeof body.message).toBe('string');
    });
  });

  describe('verifying the address', () => {
    it('spends the mailed token, verifies the identity and hands out a session', async () => {
      const email = anAddress();
      await register(app, email);
      expect((await passwordIdentity(email))?.emailVerified).toBe(false);

      const response = await verify(app, requiredToken(app));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ verified: true });
      expect((await passwordIdentity(email))?.emailVerified).toBe(true);
      expect((await meWith(app, setCookies(response))).status).toBe(200);
    });

    it('refuses the same token a second time, and signs nobody in', async () => {
      const email = anAddress();
      await register(app, email);
      const token = requiredToken(app);
      expect((await verify(app, token)).status).toBe(200);

      const again = await verify(app, token);

      expect(again.status).toBe(400);
      expect((await again.json()).code).toBe('invalid_token');
      expect(cookieValue(setCookies(again), SESSION_COOKIE)).toBeUndefined();
    });
  });

  describe('signing in', () => {
    it('refuses the right password while the address is unverified, and sets no cookie', async () => {
      const email = anAddress();
      await register(app, email);

      const response = await login(app, email);

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('email_not_verified');
      expect(cookieValue(setCookies(response), SESSION_COOKIE)).toBeUndefined();
    });

    it('accepts the right password, and the cookie it sets is one /me accepts', async () => {
      const email = await aVerifiedAccount(app);

      const response = await login(app, email);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.user.email).toBe(email);
      expect(body.user.displayName.length).toBeGreaterThan(0);

      const cookies = setCookies(response);
      expect(cookieValue(cookies, SESSION_COOKIE)).toBeDefined();

      const me = await meWith(app, cookies);
      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(body.user.id);
      expect(me.body.agents).toHaveLength(3);
    });

    it('answers the same for a wrong password and for an address with no account, at the same cost', async () => {
      // Its own app: this case is made of failed attempts, and the throttle counts them per IP as well.
      const own = await anApp();
      const email = await aVerifiedAccount(own);

      const wrongStarted = performance.now();
      const wrong = await login(own, email, WRONG_PASSWORD);
      const wrongMs = performance.now() - wrongStarted;

      const unknownStarted = performance.now();
      const unknown = await login(own, anAddress(), PASSWORD);
      const unknownMs = performance.now() - unknownStarted;

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      // One code and one message for both: a message that differs is the same oracle as a status that
      // differs, and it is the one that reaches the browser.
      const wrongBody = await wrong.json();
      expect(wrongBody.code).toBe('invalid_credentials');
      expect(await unknown.json()).toEqual(wrongBody);

      // The unknown address is checked against a hash nobody holds, so that it costs what a real one
      // costs: an address that answers in a millisecond is an address oracle. The bound is deliberately
      // loose — both sides are dominated by one scrypt, and all this has to separate is "did the work"
      // from "returned immediately".
      expect(unknownMs).toBeGreaterThan(wrongMs / 4);
    });

    it('refuses even the right password once an address has failed too often', async () => {
      const own = await anApp();
      const email = await aVerifiedAccount(own);

      for (let attempt = 0; attempt < DEFAULT_MAX_FAILURES; attempt += 1) {
        expect((await login(own, email, WRONG_PASSWORD)).status).toBe(401);
      }

      const response = await login(own, email);

      // Guessing is over for this address, and a correct password does not reopen it: an attacker who
      // has the password does not need the throttle, and one who does not would otherwise be told when
      // they got it right.
      expect(response.status).toBe(429);
      expect((await response.json()).code).toBe('too_many_attempts');
      expect(cookieValue(setCookies(response), SESSION_COOKIE)).toBeUndefined();
    });

    it('forgets the failures of an address that signs in successfully', async () => {
      const own = await anApp();
      const email = await aVerifiedAccount(own);

      for (let attempt = 0; attempt < DEFAULT_MAX_FAILURES - 1; attempt += 1) {
        expect((await login(own, email, WRONG_PASSWORD)).status).toBe(401);
      }
      expect((await login(own, email)).status).toBe(200);

      // Two more failures are still allowed, which they are not if the count survived the sign-in: nine
      // failures and two more are past the limit, and a limit a player carries after signing in is a
      // limit that locks out the person it was protecting.
      expect((await login(own, email, WRONG_PASSWORD)).status).toBe(401);
      expect((await login(own, email, WRONG_PASSWORD)).status).toBe(401);
      expect((await login(own, email)).status).toBe(200);
    });
  });

  describe('resetting', () => {
    it('answers the same for a known and for an unknown address, and mails only the known one', async () => {
      const email = await aVerifiedAccount(app);
      const sentBefore = app.mailer.sent.length;

      const known = await forgot(app, email);
      const unknown = await forgot(app, anAddress());

      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(await unknown.json()).toEqual(await known.json());

      // The mail is the whole difference, and it goes to the mailbox the address belongs to.
      expect(app.mailer.sent.length).toBe(sentBefore + 1);
      expect(app.mailer.sent.at(-1)?.to).toBe(email);
    });

    it('sets the new password, refuses the old one, and ends every outstanding link', async () => {
      const email = await aVerifiedAccount(app);
      await forgot(app, email);
      const token = requiredToken(app);

      expect((await reset(app, token, NEW_PASSWORD)).status).toBe(204);

      expect((await login(app, email, NEW_PASSWORD)).status).toBe(200);
      expect((await login(app, email)).status).toBe(401);
      // Single use, like every other token: the link in the mailbox is worth nothing afterwards.
      const spent = await reset(app, token, NEW_PASSWORD);
      expect(spent.status).toBe(400);
      expect((await spent.json()).code).toBe('invalid_token');

      // A password change ends every link for the account, and not only the one that was followed —
      // otherwise a verification link from three weeks ago survives the moment the account was locked
      // down. The unverified account is what makes two links live at once.
      const other = anAddress();
      await register(app, other);
      const verification = requiredToken(app);
      await forgot(app, other);
      expect((await reset(app, requiredToken(app), NEW_PASSWORD)).status).toBe(204);
      expect((await verify(app, verification)).status).toBe(400);
    });
  });

  describe('the account a password sign-up makes', () => {
    it('is where a later Google sign-in with the same verified address lands, with one squad', async () => {
      const email = anAddress();
      // One app for both ways in, so both are talking to the same database and the same account.
      const own = await anApp(() => ({
        providerUserId: 'google-9001',
        email,
        emailVerified: true,
        displayName: 'Heron Amaral',
        avatarUrl: null,
      }));

      await register(own, email);
      await verify(own, requiredToken(own));
      const signedIn = await login(own, email);
      const passwordUserId = (await signedIn.json()).user.id;

      const { response } = await signIn(own.url, 'google');
      expect(response.status).toBe(302);

      const me = await meWith(own, setCookies(response));
      expect(me.status).toBe(200);
      // The case § 9 exists to close: the address was verified by the mailbox and then by Google, both
      // sides agree, and the existing linking rule adds a way in instead of a second account.
      expect(me.body.user.id).toBe(passwordUserId);
      expect(me.body.agents).toHaveLength(3);

      const identities = await em.fork().find(Identity, { user: passwordUserId });
      expect(identities.map((one) => one.provider).sort()).toEqual(['google', 'password']);
      expect(await agentsOf(passwordUserId)).toHaveLength(3);
    });

    it('never makes the password a provider of the platform', async () => {
      // `identities.provider` holds `password`, and it is not a way in the client can draw a button for:
      // the list is the OAuth ports, and nothing about this amendment adds one.
      expect(await (await fetch(`${app.url}/auth/providers`)).json()).toEqual({
        providers: ['github', 'google'],
      });
    });
  });
});
