import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
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

// What the profile panel draws, and the one thing it must never draw: somebody else's squad. The two
// sign-ins below are two different people, and each request carries only its own cookie.
const FIRST: ProviderProfile = {
  providerUserId: 'gh-first',
  email: 'first@example.com',
  emailVerified: true,
  displayName: 'First Player',
  avatarUrl: 'https://avatars.example/first.png',
};

const SECOND: ProviderProfile = {
  providerUserId: 'gh-second',
  email: 'second@example.com',
  emailVerified: true,
  displayName: 'Second Player',
  avatarUrl: null,
};

describe.skipIf(!hasDatabase)('GET /me', () => {
  let databaseUrl: string;
  let app: TestApp;
  let firstSession: string;
  let secondSession: string;

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    let answering: ProviderProfile = FIRST;
    app = await startTestApp({
      databaseUrl,
      providers: {
        github: new FakeProvider('github', () => answering),
        google: new FakeProvider('google', () => answering),
      },
    });

    const first = await signIn(app.url, 'github');
    firstSession = cookieValue(setCookies(first.response), SESSION_COOKIE) ?? '';

    answering = SECOND;
    const second = await signIn(app.url, 'github');
    secondSession = cookieValue(setCookies(second.response), SESSION_COOKIE) ?? '';

    expect(firstSession).not.toBe('');
    expect(secondSession).not.toBe('');
    expect(firstSession).not.toBe(secondSession);
  });

  afterAll(async () => {
    await app?.close();
    await dropScratchDatabase(databaseUrl);
  });

  function me(session?: string): Promise<Response> {
    return fetch(`${app.url}/me`, {
      redirect: 'manual',
      headers: session === undefined ? {} : { cookie: `${SESSION_COOKIE}=${session}` },
    });
  }

  it('answers 401 without a session, in the shape every error has', async () => {
    const response = await me();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
  });

  it('answers with the profile and the three agents of the starter squad', async () => {
    const response = await me(firstSession);
    expect(response.status).toBe(200);

    const { user, agents, hasPassword } = await response.json();
    expect(user.displayName).toBe('First Player');
    expect(user.email).toBe('first@example.com');
    expect(user.avatarUrl).toBe('https://avatars.example/first.png');
    expect(typeof user.id).toBe('string');

    // Signed in through GitHub only: there is no password to prove, so the deletion dialog will not ask.
    expect(hasPassword).toBe(false);

    expect(agents).toHaveLength(3);
    expect(agents.map((agent: { class: string }) => agent.class).sort()).toEqual([
      'priest',
      'sniper',
      'wizard',
    ]);
    for (const agent of agents) {
      expect(typeof agent.id).toBe('string');
      expect(agent.level).toBe(1);
      expect(agent.status).toBe('active');
    }
  });

  it('never answers with another player’s agents', async () => {
    const first = await (await me(firstSession)).json();
    const second = await (await me(secondSession)).json();

    expect(first.user.id).not.toBe(second.user.id);
    expect(first.agents).toHaveLength(3);
    expect(second.agents).toHaveLength(3);

    const mine = new Set(first.agents.map((agent: { id: string }) => agent.id));
    const theirs = second.agents.map((agent: { id: string }) => agent.id);
    expect(theirs.some((id: string) => mine.has(id))).toBe(false);
  });
});
