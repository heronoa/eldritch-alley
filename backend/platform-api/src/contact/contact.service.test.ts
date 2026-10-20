import type { EntityManager } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestApp, type TestApp } from '../auth/test-app';
import { ENTITY_MANAGER } from '../db/database.module';
import { ContactMessage } from '../db/entities/contact-message.entity';
import { User } from '../db/entities/user.entity';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from '../db/test-database';
import type { EmailMessage, Mailer } from '../email/mailer';
import { ContactService } from './contact.service';
import { hashIp } from './ip-hash';
import { contactRateLimitKey, InMemoryCounterStore, RateLimiter } from './rate-limit';
import { FakeTurnstile, type TurnstileVerifier } from './turnstile';

// The contact form is the one unauthenticated write in the system, so the order of its checks is part
// of the contract: the shape of the body, then the per-IP counter, then Cloudflare. These cases pin
// each step's refusal and, just as importantly, what each refusal left behind — nothing, except for a
// message that reached the database.
const SALT = 'a-test-contact-salt';
const NOTIFY_TO = 'owner@eldritch.test';
const GOOD_TOKEN = 'the-token';

const BODY = {
  name: 'Ana Ribeiro',
  email: 'ana@example.com',
  message: 'Preciso de ajuda com a minha conta.',
  turnstileToken: GOOD_TOKEN,
  locale: 'pt-BR' as const,
};

interface ServiceOptions {
  turnstile?: TurnstileVerifier;
  counters?: InMemoryCounterStore;
  limit?: number;
  windowSeconds?: number;
  mailer?: Mailer;
}

/** A call the platform was expected to refuse, read back as the `{ code, message }` it answers with. */
async function refusal(
  promise: Promise<unknown>,
): Promise<{ status: number; code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const http = error as { getStatus?: () => number; getResponse?: () => unknown };
    const body = (http.getResponse?.() ?? {}) as { code?: string; message?: string };
    return { status: http.getStatus?.() ?? 0, code: body.code ?? '', message: body.message ?? '' };
  }
  throw new Error('the call was expected to refuse');
}

describe('hashIp', () => {
  it('is stable for one address and salt, different for another salt, and never the address', () => {
    const first = hashIp('203.0.113.7', 'salt');

    expect(first).toBe(hashIp('203.0.113.7', 'salt'));
    expect(first).not.toBe(hashIp('203.0.113.7', 'another-salt'));
    expect(first).toMatch(/^[0-9a-f]{32,64}$/);
    expect(first).not.toContain('203.0.113.7');
  });
});

describe.skipIf(!hasDatabase)('ContactService', () => {
  let databaseUrl: string;
  let app: TestApp;

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    app = await startTestApp({ databaseUrl });
  });

  afterAll(async () => {
    await app?.close();
    await dropScratchDatabase(databaseUrl);
  });

  beforeEach(async () => {
    await withClient(databaseUrl, (client) => client.query('truncate "contact_messages" cascade'));
    app.mailer.sent.splice(0);
  });

  function makeService(options: ServiceOptions = {}): {
    service: ContactService;
    counters: InMemoryCounterStore;
    turnstile: TurnstileVerifier;
  } {
    const counters = options.counters ?? new InMemoryCounterStore();
    const turnstile = options.turnstile ?? new FakeTurnstile((token) => token === GOOD_TOKEN);
    const service = new ContactService(
      app.get<EntityManager>(ENTITY_MANAGER),
      options.mailer ?? app.mailer,
      turnstile,
      new RateLimiter(counters, {
        limit: options.limit ?? 100,
        windowSeconds: options.windowSeconds ?? 600,
      }),
      SALT,
      NOTIFY_TO,
    );
    return { service, counters, turnstile };
  }

  function countMessages(): Promise<number> {
    return app.get<EntityManager>(ENTITY_MANAGER).fork().count(ContactMessage, {});
  }

  it('stores a message and sends one notification to the owner', async () => {
    const { service } = makeService();

    await expect(service.receive(BODY, { userId: null, ip: '203.0.113.7' })).resolves.toEqual({
      received: true,
    });

    const row = await app
      .get<EntityManager>(ENTITY_MANAGER)
      .fork()
      .findOne(ContactMessage, { email: BODY.email });
    expect(row?.name).toBe(BODY.name);
    expect(row?.message).toBe(BODY.message);
    expect(app.mailer.sent).toHaveLength(1);
    expect(app.mailer.sent[0]?.to).toBe(NOTIFY_TO);
  });

  it.each([
    ['no token', undefined],
    ['an empty token', '   '],
    ['a token the verifier refuses', 'a-bad-token'],
  ])('answers 403 for %s and stores nothing', async (_label, token) => {
    const { service } = makeService();

    const answer = await refusal(
      service.receive({ ...BODY, turnstileToken: token }, { userId: null, ip: '203.0.113.7' }),
    );

    expect(answer.status).toBe(403);
    expect(answer.code).toBe('challenge_failed');
    expect(await countMessages()).toBe(0);
  });

  it('fails closed when the verifier cannot be reached', async () => {
    const turnstile = new FakeTurnstile((token) => token === GOOD_TOKEN);
    turnstile.unreachable = true;
    const { service } = makeService({ turnstile });

    const answer = await refusal(service.receive(BODY, { userId: null, ip: '203.0.113.7' }));

    expect(answer.status).toBe(403);
    expect(answer.code).toBe('challenge_failed');
    expect(await countMessages()).toBe(0);
  });

  it('refuses one request past the limit with 429, stores nothing, and does not ask Turnstile', async () => {
    const turnstile = new FakeTurnstile((token) => token === GOOD_TOKEN);
    const verify = vi.spyOn(turnstile, 'verify');
    const { service } = makeService({ turnstile, limit: 1 });

    await service.receive(BODY, { userId: null, ip: '203.0.113.7' });
    const answer = await refusal(service.receive(BODY, { userId: null, ip: '203.0.113.7' }));

    expect(answer.status).toBe(429);
    expect(answer.code).toBe('rate_limited');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(await countMessages()).toBe(1);
  });

  it('counts the limit per address: one that spent its own does not spend another', async () => {
    const { service } = makeService({ limit: 1 });

    await service.receive(BODY, { userId: null, ip: '203.0.113.7' });
    const spent = await refusal(service.receive(BODY, { userId: null, ip: '203.0.113.7' }));
    const other = await service.receive(BODY, { userId: null, ip: '198.51.100.23' });

    expect(spent.status).toBe(429);
    expect(other).toEqual({ received: true });
    expect(await countMessages()).toBe(2);
  });

  it('gives the recorded count a TTL of the configured window', async () => {
    const counters = new InMemoryCounterStore();
    const { service } = makeService({ counters, windowSeconds: 600 });
    const ip = '203.0.113.7';

    await service.receive(BODY, { userId: null, ip });

    const ttl = await counters.ttl(contactRateLimitKey(hashIp(ip, SALT)));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('stores the hashed address, never the raw one', async () => {
    const ip = '198.51.100.23';
    const { service } = makeService();

    await service.receive(BODY, { userId: null, ip });

    const stored = await withClient(databaseUrl, (client) =>
      client.query('select * from "contact_messages"'),
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].ip_hash).toBe(hashIp(ip, SALT));
    expect(JSON.stringify(stored.rows)).not.toContain(ip);
  });

  it('stores the sender with a session, and null without one', async () => {
    const em = app.get<EntityManager>(ENTITY_MANAGER).fork();
    const user = em.create(User, { displayName: 'Ana Ribeiro' });
    await em.flush();
    const { service } = makeService();

    await service.receive(BODY, { userId: user.id, ip: '203.0.113.7' });
    await service.receive(
      { ...BODY, email: 'guest@example.com' },
      { userId: null, ip: '203.0.113.7' },
    );

    const rows = await em
      .fork()
      .find(ContactMessage, {}, { orderBy: { createdAt: 'asc' } });
    expect(rows.find((row) => row.email === BODY.email)?.user?.id).toBe(user.id);
    expect(rows.find((row) => row.email === 'guest@example.com')?.user ?? null).toBeNull();
  });

  it('answers 201 when the notification fails, keeps the row, and logs its id', async () => {
    const mailer: Mailer = {
      send: (_message: EmailMessage) => Promise.reject(new Error('the mail server is down')),
    };
    const logged: string[] = [];
    const spy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });

    try {
      const { service } = makeService({ mailer });

      await expect(service.receive(BODY, { userId: null, ip: '203.0.113.7' })).resolves.toEqual({
        received: true,
      });

      const row = await app
        .get<EntityManager>(ENTITY_MANAGER)
        .fork()
        .findOne(ContactMessage, { email: BODY.email });
      expect(row).not.toBeNull();
      expect(logged.join('\n')).toContain(row?.id);
    } finally {
      spy.mockRestore();
    }
  });
});
