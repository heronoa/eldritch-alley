import type { EntityManager } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseModule, ENTITY_MANAGER } from '../db/database.module';
import { Agent } from '../db/entities/agent.entity';
import { User } from '../db/entities/user.entity';
import { runMigrations } from '../db/migrate';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from '../db/test-database';
import { InMemoryMatchEndedQueue } from '../queue/queue';
import type { MatchEndedMessage } from './match-ended';
import { MatchEndedConsumer } from './match-ended.consumer';
import { MatchesService } from './matches.service';

describe.skipIf(!hasDatabase)('MatchEndedConsumer', () => {
  let url: string;
  let moduleRef: TestingModule;
  let em: EntityManager;
  let matches: MatchesService;

  beforeAll(async () => {
    url = await createScratchDatabase();
    process.env.DATABASE_URL = url;
    await runMigrations({ databaseUrl: url });
    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    em = moduleRef.get<EntityManager>(ENTITY_MANAGER);
    matches = new MatchesService(em);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await dropScratchDatabase(url);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  let sequence = 0;

  async function aPlayer(): Promise<User> {
    sequence += 1;
    const fork = em.fork();
    const user = fork.create(User, {
      displayName: `Player ${sequence}`,
      email: `consumer${sequence}@example.com`,
    });
    fork.create(Agent, { user, class: 'sniper' });
    await fork.flush();
    return user;
  }

  /** The body the match server would have published, as a string on the queue. */
  function bodyFor(userId: string, id: string): string {
    const message: MatchEndedMessage = {
      id,
      userId,
      seed: 4_242,
      mapId: 'overpass',
      protocolVersion: 10,
      units: [{ unitId: 'A-sniper', class: 'sniper' }],
      result: 'won',
      rounds: 7,
      startedAt: '2026-10-16T18:00:00.000Z',
      endedAt: '2026-10-16T18:07:30.000Z',
      finalStateHash: 3_000_000_000,
      events: [{ type: 'turn-ended', actor: 'A-sniper', round: 1 }],
    };
    return JSON.stringify(message);
  }

  /** A consumer over a queue of the case's own, with a poll interval it never waits for. */
  function consumerOver(queue: InMemoryMatchEndedQueue): MatchEndedConsumer {
    return new MatchEndedConsumer(queue, matches, 1_000);
  }

  async function storedMatch(id: string): Promise<number> {
    return withClient(url, async (client) => {
      const { rows } = await client.query(`select 1 from "matches" where id = $1`, [id]);
      return rows.length;
    });
  }

  it('stores a message and deletes it, so the queue does not hand it over again', async () => {
    const user = await aPlayer();
    const id = '5a2b8c1d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
    const queue = new InMemoryMatchEndedQueue();
    queue.deliver(bodyFor(user.id, id));

    await consumerOver(queue).drain();

    expect(await storedMatch(id)).toBe(1);

    // The proof that it was deleted and not merely processed: the next pass finds nothing and the match
    // server's message is not on its way to the dead-letter queue.
    await consumerOver(queue).drain();
    expect(queue.deadLettered).toEqual([]);
  });

  /**
   * A message that parses and cannot be stored is left where it is. That is the whole of the redelivery
   * contract: the consumer does not decide how many times a message is worth trying, it only declines to
   * say it is done — and the queue's redrive policy is what eventually gives up and puts it somewhere a
   * person can see it.
   */
  it('leaves a message it could not store, and the queue gives up on it after the redrive count', async () => {
    // Silenced and kept: a failure that is deliberately left for the queue is still a failure somebody
    // has to be able to find, and the log naming the match is the half of it that is not the queue.
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const id = '6b3c9d2e-4f5a-4b6c-9d7e-8f9a0b1c2d3e';
    const queue = new InMemoryMatchEndedQueue();
    // Well-formed and undeliverable: the account is one this platform does not have.
    const body = bodyFor('00000000-0000-4000-8000-000000000000', id);
    queue.deliver(body);

    const consumer = consumerOver(queue);
    for (let attempt = 1; attempt <= InMemoryMatchEndedQueue.DEFAULT_MAX_RECEIVE_COUNT; attempt += 1) {
      await consumer.drain();
      expect(await storedMatch(id)).toBe(0);
    }
    expect(error).toHaveBeenCalledTimes(InMemoryMatchEndedQueue.DEFAULT_MAX_RECEIVE_COUNT);
    expect(error.mock.calls[0][0]).toContain(id);

    // The one after that: the queue has stopped handing it over, and recorded it where a person looks.
    await consumer.drain();
    expect(queue.deadLettered).toEqual([body]);

    // And from then on the consumer is not given it at all, which is the queue's business and not the
    // consumer's — it never tried to bring the message back itself.
    await consumer.drain();
    expect(queue.deadLettered).toEqual([body]);
  });

  it('discards a body that is not a match-ended message, without throwing out of the pass', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const queue = new InMemoryMatchEndedQueue();
    // Three ways of never being a message: not JSON, JSON that is not an object, and an object missing
    // what the store writes. None of them can be fixed by another attempt.
    for (const body of ['not json at all', '[]', '{"id":"7c4d0e3f"}']) queue.deliver(body);

    await expect(consumerOver(queue).drain()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(3);
    expect(queue.deadLettered).toEqual([]);

    // And deleted, so the queue is empty: a second pass has nothing to discard and says nothing, rather
    // than the three bodies coming round again for the rest of the deployment's life.
    await consumerOver(queue).drain();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('deals with a whole batch in one pass', async () => {
    const user = await aPlayer();
    const queue = new InMemoryMatchEndedQueue();
    const ids = [
      '8d5e1f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a',
      '9e6f2a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
      'af7a3b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c',
    ];
    for (const id of ids) queue.deliver(bodyFor(user.id, id));

    await consumerOver(queue).drain();

    for (const id of ids) expect(await storedMatch(id)).toBe(1);
    // One look, and every message in it accounted for.
    expect(queue.receives).toBe(1);
  });

  /**
   * The poll itself. The interval is the consumer's clock and the queue is what it looks at, so the case
   * fakes the clock and counts the queue's side: while the module is up the consumer keeps looking, and
   * once it is shut down it stops — which is what makes a deployment free of a timer left running
   * against a database it no longer has.
   */
  it('polls while the module is up and stops when it goes down', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const queue = new InMemoryMatchEndedQueue();
    const consumer = consumerOver(queue);

    consumer.onModuleInit();
    await vi.advanceTimersByTimeAsync(3_000);
    const whileUp = queue.receives;
    expect(whileUp).toBeGreaterThanOrEqual(3);

    await consumer.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(queue.receives).toBe(whileUp);
  });
});
