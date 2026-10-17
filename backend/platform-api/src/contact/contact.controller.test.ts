import type { EntityManager } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeProvider } from '../auth/fake.provider';
import type { ProviderProfile } from '../auth/provider';
import {
  SESSION_COOKIE,
  cookieValue,
  setCookies,
  signIn,
  startTestApp,
  type TestApp,
} from '../auth/test-app';
import { ENTITY_MANAGER } from '../db/database.module';
import { ContactMessage } from '../db/entities/contact-message.entity';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
import { InMemoryCounterStore, RateLimiter } from './rate-limit';
import { FakeTurnstile } from './turnstile';

// `POST /contact` over the wire: the status and the body the client renders, and the row the platform
// left behind. The order of the checks is asserted in `contact.service.test.ts`; here the point is that
// the route is open to a guest, reads a session when there is one, and never answers with a message it
// did not store.
const GOOD_TOKEN = 'the-token';

const PROFILE: ProviderProfile = {
  providerUserId: 'gh-contact',
  email: 'sender@example.com',
  emailVerified: true,
  displayName: 'Signed-in Sender',
  avatarUrl: null,
};

const BODY = {
  name: 'Ana Ribeiro',
  email: 'ana@example.com',
  message: 'Preciso de ajuda com a minha conta.',
  turnstileToken: GOOD_TOKEN,
  locale: 'pt-BR',
};

describe.skipIf(!hasDatabase)('POST /contact', () => {
  let databaseUrl: string;
  let app: TestApp;

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    app = await startTestApp({
      databaseUrl,
      providers: { github: new FakeProvider('github', () => PROFILE) },
      turnstile: new FakeTurnstile((token) => token === GOOD_TOKEN),
      rateLimiter: new RateLimiter(new InMemoryCounterStore(), {
        limit: 1_000,
        windowSeconds: 600,
      }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await dropScratchDatabase(databaseUrl);
  });

  beforeEach(async () => {
    await app.get<EntityManager>(ENTITY_MANAGER).fork().nativeDelete(ContactMessage, {});
    app.mailer.sent.splice(0);
  });

  function contact(body: unknown, session?: string): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (session !== undefined) headers.cookie = `${SESSION_COOKIE}=${session}`;
    return fetch(`${app.url}/contact`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  function messages(): Promise<ContactMessage[]> {
    return app.get<EntityManager>(ENTITY_MANAGER).fork().find(ContactMessage, {});
  }

  it('answers 201, stores one row, and notifies the owner', async () => {
    const response = await contact(BODY);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(await messages()).toHaveLength(1);
    expect(app.mailer.sent).toHaveLength(1);
    expect(app.mailer.sent[0]?.to).toBe(process.env.CONTACT_NOTIFY_TO);
  });

  it.each([
    ['no token', undefined],
    ['an empty token', '   '],
    ['a token the verifier refuses', 'a-bad-token'],
  ])('answers 403 for %s and stores nothing', async (_label, token) => {
    const response = await contact({ ...BODY, turnstileToken: token });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('challenge_failed');
    expect(await messages()).toHaveLength(0);
  });

  it.each([
    ['a missing name', { ...BODY, name: undefined }, 'name'],
    ['a missing email', { ...BODY, email: undefined }, 'email'],
    ['an empty message', { ...BODY, message: '   ' }, 'message'],
    ['an over-long message', { ...BODY, message: 'x'.repeat(5_001) }, 'message'],
  ])('answers 400 for %s, naming the field', async (_label, body, field) => {
    const response = await contact(body);

    expect(response.status).toBe(400);
    const answer = await response.json();
    expect(answer.code).toBe('invalid_body');
    expect(answer.message).toContain(field);
    expect(await messages()).toHaveLength(0);
  });

  it('stores the sender’s account when the request carries a session', async () => {
    const signed = await signIn(app.url, 'github');
    const session = cookieValue(setCookies(signed.response), SESSION_COOKIE) ?? '';
    const me = await fetch(`${app.url}/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    }).then((response) => response.json());

    const response = await contact(BODY, session);

    expect(response.status).toBe(201);
    const [stored] = await messages();
    expect(stored?.user?.id).toBe(me.user.id);
  });

  it('stores a guest with no account at all', async () => {
    await contact(BODY);

    const [stored] = await messages();
    expect(stored?.user ?? null).toBeNull();
  });
});
