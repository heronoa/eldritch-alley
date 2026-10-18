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
import { ReleaseSubscription } from '../db/entities/release-subscription.entity';
import { User } from '../db/entities/user.entity';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from '../db/test-database';
import { PRIVACY_VERSION } from '../privacy';

// `GET /me` grows the release-e-mail field, `PATCH` changes it, and the link in a message is a route
// of its own: no session, HTML, and one click that a second click cannot make wrong.
const PROFILE: ProviderProfile = {
  providerUserId: 'gh-release',
  email: 'release@example.com',
  emailVerified: true,
  displayName: 'Release Reader',
  avatarUrl: null,
};

describe.skipIf(!hasDatabase)('the release e-mail routes', () => {
  let databaseUrl: string;
  let app: TestApp;
  let em: EntityManager;
  let session: string;
  let userId: string;

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    app = await startTestApp({
      databaseUrl,
      providers: { github: new FakeProvider('github', () => PROFILE) },
    });
    em = app.get(ENTITY_MANAGER);

    const signed = await signIn(app.url, 'github');
    session = cookieValue(setCookies(signed.response), SESSION_COOKIE) ?? '';
    const me = await fetch(`${app.url}/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    }).then((response) => response.json());
    userId = me.user.id;
  });

  afterAll(async () => {
    await app?.close();
    await dropScratchDatabase(databaseUrl);
  });

  beforeEach(async () => {
    await withClient(databaseUrl, (client) =>
      client.query('truncate "release_subscriptions" cascade'),
    );
  });

  function me(): Promise<Response> {
    return fetch(`${app.url}/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    });
  }

  function patch(body: unknown, acceptLanguage = 'pt-BR'): Promise<Response> {
    return fetch(`${app.url}/me/release-emails`, {
      method: 'PATCH',
      headers: {
        cookie: `${SESSION_COOKIE}=${session}`,
        'content-type': 'application/json',
        'accept-language': acceptLanguage,
      },
      body: JSON.stringify(body),
    });
  }

  function subscription(): Promise<ReleaseSubscription | null> {
    return em.fork().findOne(ReleaseSubscription, { user: { id: userId } });
  }

  it('reports the consent off, with no date, before anybody opts in', async () => {
    const body = await (await me()).json();

    expect(body.releaseEmails).toEqual({ optedIn: false, consentedAt: null });
  });

  it('opts in and then reports it from GET /me', async () => {
    const response = await patch({ optedIn: true });

    expect(response.status).toBe(200);
    const answer = await response.json();
    expect(answer.optedIn).toBe(true);
    expect(typeof answer.consentedAt).toBe('string');

    const body = await (await me()).json();
    expect(body.releaseEmails.optedIn).toBe(true);
    expect(body.releaseEmails.consentedAt).toBe(answer.consentedAt);

    const stored = await subscription();
    expect(stored?.optedIn).toBe(true);
    expect(stored?.locale).toBe('pt-BR');
  });

  it('answers 401 to a PATCH with no session', async () => {
    const response = await fetch(`${app.url}/me/release-emails`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ optedIn: true }),
    });

    expect(response.status).toBe(401);
    expect(await em.fork().count(ReleaseSubscription, {})).toBe(0);
  });

  it('records the policy version the player was shown when GET /me answers', async () => {
    await me();

    const user = await em.fork().findOne(User, { id: userId });
    expect(user?.privacyVersionSeen).toBe(PRIVACY_VERSION);
  });

  it('answers 404 for an unknown unsubscribe token and writes nothing', async () => {
    await patch({ optedIn: true });
    const before = await em.fork().count(ReleaseSubscription, {});

    const response = await fetch(`${app.url}/unsubscribe/not-a-token`);

    expect(response.status).toBe(404);
    expect(await em.fork().count(ReleaseSubscription, {})).toBe(before);
    expect((await subscription())?.optedIn).toBe(true);
  });

  it('unsubscribes with the token, in the language of the message, and a second use is still 200', async () => {
    await patch({ optedIn: true });
    const token = (await subscription())?.token ?? '';
    expect(token).not.toBe('');

    const first = await fetch(`${app.url}/unsubscribe/${encodeURIComponent(token)}`);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toContain('text/html');
    const html = await first.text();
    expect(html).toContain('lançamento');

    const stored = await subscription();
    expect(stored?.optedIn).toBe(false);
    expect(stored?.unsubscribedAt).toBeInstanceOf(Date);
    const when = stored?.unsubscribedAt?.getTime();

    const second = await fetch(`${app.url}/unsubscribe/${encodeURIComponent(token)}`);
    expect(second.status).toBe(200);
    expect((await subscription())?.unsubscribedAt?.getTime()).toBe(when);
  });

  it('writes the unsubscribe page in the language the player reads', async () => {
    await patch({ optedIn: true }, 'en-US');
    const token = (await subscription())?.token ?? '';

    const response = await fetch(`${app.url}/unsubscribe/${encodeURIComponent(token)}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('release');
    expect(html).not.toContain('lançamento');
  });
});
