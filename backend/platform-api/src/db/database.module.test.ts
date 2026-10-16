import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { setAuthEnvironment } from '../auth/test-app';
import { runMigrations } from './migrate';
import { ENTITY_MANAGER } from './database.module';
import { User } from './entities/user.entity';
import {
  createScratchDatabase,
  databaseUrl,
  dropScratchDatabase,
  hasDatabase,
} from './test-database';

// Two consumers of the manager, to show that the container hands out one instance rather than one per
// injection site. Both carry an explicit `@Inject` because the suite runs through esbuild, which does
// not emit the `design:paramtypes` metadata Nest would otherwise read a type-only constructor from.
@Injectable()
class FirstConsumer {
  constructor(@Inject(ENTITY_MANAGER) readonly em: EntityManager) {}
}

@Injectable()
class SecondConsumer {
  constructor(@Inject(ENTITY_MANAGER) readonly em: EntityManager) {}
}

@Module({ imports: [AppModule], providers: [FirstConsumer, SecondConsumer] })
class ConsumerModule {}

describe('the database gate', () => {
  it('reads an unset and an empty DATABASE_URL as no database at all', () => {
    const previous = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      expect(databaseUrl()).toBeUndefined();

      process.env.DATABASE_URL = '';
      expect(databaseUrl()).toBeUndefined();

      process.env.DATABASE_URL = 'postgres://eldritch@localhost:5432/eldritch_alley';
      expect(databaseUrl()).toBe('postgres://eldritch@localhost:5432/eldritch_alley');
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});

describe.skipIf(!hasDatabase)('DatabaseModule', () => {
  let url: string;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    url = await createScratchDatabase();
    // The whole application is what this case compiles, and since m4-02 that means the secrets a
    // session and a ticket need as well as the database.
    await setAuthEnvironment(url);
    await runMigrations({ databaseUrl: url });
    moduleRef = await Test.createTestingModule({ imports: [ConsumerModule] }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await dropScratchDatabase(url);
  });

  it('writes a user through the injected manager and reads it back with the same values', async () => {
    const em = moduleRef.get<EntityManager>(ENTITY_MANAGER);
    const lastLoginAt = new Date('2026-10-16T12:00:00.000Z');

    const user = em.create(User, {
      displayName: 'Heron Amaral',
      email: 'heron@example.com',
      lastLoginAt,
    });
    await em.persistAndFlush(user);

    // The id and the timestamp come from the database, so a row written by anything other than the ORM
    // is still a complete one.
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(user.createdAt).toBeInstanceOf(Date);

    // A fork is an identity map of its own, so this is a read through the database and not a cache hit.
    const stored = await em.fork().findOneOrFail(User, { id: user.id });
    expect(stored.displayName).toBe('Heron Amaral');
    expect(stored.email).toBe('heron@example.com');
    expect(stored.avatarUrl).toBeNull();
    expect(stored.privacyVersionSeen).toBeNull();
    expect(stored.lastLoginAt?.toISOString()).toBe(lastLoginAt.toISOString());
    expect(stored.createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(stored.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('hands the same manager to every consumer', () => {
    const fromContainer = moduleRef.get<EntityManager>(ENTITY_MANAGER);
    expect(moduleRef.get(FirstConsumer).em).toBe(fromContainer);
    expect(moduleRef.get(SecondConsumer).em).toBe(fromContainer);
  });
});
