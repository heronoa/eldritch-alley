import type { EntityManager } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../auth/test-app';
import { ENTITY_MANAGER } from '../db/database.module';
import { ReleaseSubscription } from '../db/entities/release-subscription.entity';
import { User } from '../db/entities/user.entity';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from '../db/test-database';
import { ReleaseService } from './release.service';

// The consent record and the token: one row per account, a token that is created once and never
// changes, and a consent date that records the latest yes. Opting out is not an erasure — the record
// still says when the player consented.
async function refusal(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    const http = error as { getStatus?: () => number; getResponse?: () => unknown };
    const body = (http.getResponse?.() ?? {}) as { code?: string };
    return { status: http.getStatus?.() ?? 0, code: body.code ?? '' };
  }
  throw new Error('the call was expected to refuse');
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe.skipIf(!hasDatabase)('ReleaseService', () => {
  let databaseUrl: string;
  let app: TestApp;
  let em: EntityManager;

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    app = await startTestApp({ databaseUrl });
    em = app.get<EntityManager>(ENTITY_MANAGER);
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

  async function newUser(name: string): Promise<User> {
    const fork = em.fork();
    const user = fork.create(User, { displayName: name });
    await fork.flush();
    return user;
  }

  function service(): ReleaseService {
    return app.get(ReleaseService);
  }

  function subscriptionOf(userId: string): Promise<ReleaseSubscription | null> {
    return em
      .fork()
      .findOne(ReleaseSubscription, { user: { id: userId } }, { populate: ['user'] });
  }

  it('starts with no subscription, so the consent is off by default', async () => {
    const user = await newUser('Consent Default');

    await expect(service().state(user.id)).resolves.toBeNull();
  });

  it('records the opt-in, the date and a token', async () => {
    const user = await newUser('Opts In');

    const subscription = await service().set(user.id, true, 'pt-BR');

    expect(subscription.optedIn).toBe(true);
    expect(subscription.consentedAt).toBeInstanceOf(Date);
    expect(subscription.unsubscribedAt).toBeNull();
    expect(subscription.locale).toBe('pt-BR');
    expect(subscription.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  it('keeps one row and one token when opting in twice, and moves the consent date', async () => {
    const user = await newUser('Opts In Twice');

    const first = await service().set(user.id, true, 'pt-BR');
    await pause();
    const second = await service().set(user.id, true, 'en-US');

    expect(second.id).toBe(first.id);
    expect(second.token).toBe(first.token);
    expect(second.consentedAt!.getTime()).toBeGreaterThan(first.consentedAt!.getTime());
    expect(await em.fork().count(ReleaseSubscription, { user: { id: user.id } })).toBe(1);
  });

  it('opts out and keeps the consent date that happened', async () => {
    const user = await newUser('Opts Out');
    const before = await service().set(user.id, true, 'pt-BR');

    const after = await service().set(user.id, false, 'pt-BR');

    expect(after.optedIn).toBe(false);
    expect(after.consentedAt?.getTime()).toBe(before.consentedAt?.getTime());
  });

  it('opts out by token and back in, clearing the unsubscribe date and keeping the token', async () => {
    const user = await newUser('Clicks The Link');
    const before = await service().set(user.id, true, 'pt-BR');

    const unsubscribed = await service().unsubscribe(before.token);
    expect(unsubscribed.optedIn).toBe(false);
    expect(unsubscribed.unsubscribedAt).toBeInstanceOf(Date);

    const back = await service().set(user.id, true, 'pt-BR');
    expect(back.token).toBe(before.token);
    expect(back.optedIn).toBe(true);
    expect(back.unsubscribedAt).toBeNull();
  });

  it('answers 404 for an unknown token and writes nothing', async () => {
    const before = await em.fork().count(ReleaseSubscription, {});

    const answer = await refusal(service().unsubscribe('not-a-token'));

    expect(answer.status).toBe(404);
    expect(await em.fork().count(ReleaseSubscription, {})).toBe(before);
  });

  it('unsubscribes once, and a second use changes nothing further', async () => {
    const user = await newUser('Two Old E-mails');
    const { token } = await service().set(user.id, true, 'pt-BR');

    const first = await service().unsubscribe(token);
    const firstDate = first.unsubscribedAt?.getTime();
    await pause();
    const second = await service().unsubscribe(token);

    expect(second.optedIn).toBe(false);
    expect(second.unsubscribedAt?.getTime()).toBe(firstDate);
    expect(await em.fork().count(ReleaseSubscription, { user: { id: user.id } })).toBe(1);
    expect((await subscriptionOf(user.id))?.token).toBe(token);
  });
});
