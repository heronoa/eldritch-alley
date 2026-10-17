import { EntityManager } from '@mikro-orm/postgresql';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseModule, ENTITY_MANAGER } from '../db/database.module';
import { Agent } from '../db/entities/agent.entity';
import { Identity } from '../db/entities/identity.entity';
import { User } from '../db/entities/user.entity';
import { runMigrations } from '../db/migrate';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
import { AuthService } from './auth.service';
import type { ProviderProfile } from './provider';

// The linking rule is the account-takeover boundary of this milestone (the spec calls it out): the
// (provider, provider_user_id) pair is the only key that decides, and an address only ever *adds* a way
// in, and only when both sides verified it. Every case below is one row of section 3 of the plan.
//
// These cases run against a real PostgreSQL, because the uniqueness the rule leans on is a constraint
// in the schema and not something a mock can be wrong about in the same way.
describe.skipIf(!hasDatabase)('AuthService', () => {
  let url: string;
  let moduleRef: TestingModule;
  let service: AuthService;
  let em: EntityManager;

  beforeAll(async () => {
    url = await createScratchDatabase();
    process.env.DATABASE_URL = url;
    await runMigrations({ databaseUrl: url });
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [AuthService],
    }).compile();
    service = moduleRef.get(AuthService);
    em = moduleRef.get<EntityManager>(ENTITY_MANAGER);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await dropScratchDatabase(url);
  });

  // Every case gets its own pair and address, so a case cannot pass on what another one left behind.
  let sequence = 0;
  function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
    sequence += 1;
    return {
      providerUserId: `gh-${sequence}`,
      email: `player${sequence}@example.com`,
      emailVerified: true,
      displayName: `Player ${sequence}`,
      avatarUrl: null,
      ...overrides,
    };
  }

  async function agentsOf(userId: string): Promise<Agent[]> {
    return em.fork().find(Agent, { user: userId }, { orderBy: { class: 'asc' } });
  }

  async function identitiesOf(userId: string): Promise<Identity[]> {
    return em.fork().find(Identity, { user: userId }, { orderBy: { provider: 'asc' } });
  }

  describe('the linking rule', () => {
    it('signs in to the same user for a pair it has seen before, whatever address it now reports', async () => {
      const first = await service.signIn('github', profile({ providerUserId: 'gh-seen' }));
      const again = await service.signIn(
        'github',
        profile({ providerUserId: 'gh-seen', email: 'moved@example.com', emailVerified: false }),
      );

      expect(again.user.id).toBe(first.user.id);
      expect(again.created).toBe(false);
      expect(await identitiesOf(first.user.id)).toHaveLength(1);
    });

    it('links a second provider when both sides report the address as verified, and adds no second squad', async () => {
      const first = await service.signIn(
        'github',
        profile({ providerUserId: 'gh-link', email: 'linked@example.com' }),
      );
      const second = await service.signIn(
        'google',
        profile({ providerUserId: 'go-link', email: 'linked@example.com' }),
      );

      expect(second.user.id).toBe(first.user.id);
      expect(second.created).toBe(false);
      expect(await identitiesOf(first.user.id)).toHaveLength(2);
      expect(await agentsOf(first.user.id)).toHaveLength(3);
    });

    it('creates a new user when the address is unverified on the side already stored', async () => {
      const first = await service.signIn(
        'github',
        profile({ providerUserId: 'gh-old-unverified', email: 'old-unverified@example.com', emailVerified: false }),
      );
      const second = await service.signIn(
        'google',
        profile({ providerUserId: 'go-old-unverified', email: 'old-unverified@example.com', emailVerified: true }),
      );

      expect(second.user.id).not.toBe(first.user.id);
      expect(second.created).toBe(true);
    });

    it('creates a new user when the address is unverified on the side arriving now', async () => {
      const first = await service.signIn(
        'github',
        profile({ providerUserId: 'gh-new-unverified', email: 'new-unverified@example.com', emailVerified: true }),
      );
      const second = await service.signIn(
        'google',
        profile({ providerUserId: 'go-new-unverified', email: 'new-unverified@example.com', emailVerified: false }),
      );

      expect(second.user.id).not.toBe(first.user.id);
      expect(second.created).toBe(true);
    });

    it('creates a new user, and never links, when the provider reports no address at all', async () => {
      const first = await service.signIn('github', profile({ providerUserId: 'gh-no-email', email: null }));
      const second = await service.signIn('google', profile({ providerUserId: 'go-no-email', email: null }));

      expect(first.created).toBe(true);
      expect(second.user.id).not.toBe(first.user.id);
      expect(await identitiesOf(first.user.id)).toHaveLength(1);
    });

    it('keeps two people who report the same unverified address apart', async () => {
      const address = 'shared-unverified@example.com';
      const one = await service.signIn(
        'github',
        profile({ providerUserId: 'gh-takeover-1', email: address, emailVerified: false }),
      );
      const two = await service.signIn(
        'google',
        profile({ providerUserId: 'go-takeover-2', email: address, emailVerified: false }),
      );

      expect(two.user.id).not.toBe(one.user.id);
      expect(await identitiesOf(one.user.id)).toHaveLength(1);
      expect(await identitiesOf(two.user.id)).toHaveLength(1);
    });

    it('treats two addresses that differ only in case as the same address', async () => {
      const first = await service.signIn(
        'github',
        profile({ providerUserId: 'gh-case', email: 'Player.Case@Example.COM' }),
      );
      const second = await service.signIn(
        'google',
        profile({ providerUserId: 'go-case', email: 'player.case@example.com' }),
      );

      expect(second.user.id).toBe(first.user.id);
      expect(await identitiesOf(first.user.id)).toHaveLength(2);
    });
  });

  describe('the starter squad', () => {
    it('gives a new player one sniper, one wizard and one priest, all level 1 and active', async () => {
      const { user, created } = await service.signIn('github', profile({ providerUserId: 'gh-squad' }));

      expect(created).toBe(true);
      const agents = await agentsOf(user.id);
      expect(agents.map((agent) => agent.class)).toEqual(['priest', 'sniper', 'wizard']);
      expect(agents.map((agent) => agent.level)).toEqual([1, 1, 1]);
      expect(agents.map((agent) => agent.status)).toEqual(['active', 'active', 'active']);
      expect(agents.every((agent) => typeof agent.id === 'string' && agent.id.length > 0)).toBe(true);
    });

    it('creates none on a later sign-in, and the three keep their ids', async () => {
      const first = await service.signIn('github', profile({ providerUserId: 'gh-squad-again' }));
      const before = (await agentsOf(first.user.id)).map((agent) => agent.id);

      const again = await service.signIn('github', profile({ providerUserId: 'gh-squad-again' }));

      expect(again.created).toBe(false);
      expect((await agentsOf(first.user.id)).map((agent) => agent.id)).toEqual(before);
    });

    it('gives the squad to a user that was created because the address did not qualify to link', async () => {
      await service.signIn(
        'github',
        profile({ providerUserId: 'gh-squad-linked', email: 'squad-linked@example.com', emailVerified: false }),
      );
      const second = await service.signIn(
        'google',
        profile({ providerUserId: 'go-squad-linked', email: 'squad-linked@example.com', emailVerified: true }),
      );

      expect(second.created).toBe(true);
      expect(await agentsOf(second.user.id)).toHaveLength(3);
    });

    // The user and its three agents are written in one transaction, so a failure half way through
    // leaves nothing to be found by the retry. The failure is injected at the manager's own `persist`,
    // which is the boundary the transaction is drawn around: the last agent is refused, after the user
    // and two of the agents have already been handed to the unit of work.
    it('leaves neither the user nor its agents behind when a write fails half way, and a retry creates both once', async () => {
      const original = EntityManager.prototype.persist;
      const refuses = (entity: unknown): boolean =>
        Array.isArray(entity)
          ? entity.some(refuses)
          : entity instanceof Agent && entity.class === 'priest';

      const spy = vi
        .spyOn(EntityManager.prototype, 'persist')
        .mockImplementation(function (this: EntityManager, entity: unknown) {
          if (refuses(entity)) throw new Error('the database refused the priest');
          return original.call(this, entity);
        });

      const attempt = profile({ providerUserId: 'gh-half-way', email: 'half-way@example.com' });
      try {
        await expect(service.signIn('github', attempt)).rejects.toThrow(/refused the priest/);
      } finally {
        spy.mockRestore();
      }

      const reader = em.fork();
      expect(await reader.count(Identity, { providerUserId: 'gh-half-way' })).toBe(0);
      expect(await reader.count(User, { email: 'half-way@example.com' })).toBe(0);
      expect(await reader.count(Agent, { user: { email: 'half-way@example.com' } })).toBe(0);

      const retry = await service.signIn('github', attempt);
      expect(retry.created).toBe(true);
      expect(await identitiesOf(retry.user.id)).toHaveLength(1);
      expect(await agentsOf(retry.user.id)).toHaveLength(3);
    });
  });
});
