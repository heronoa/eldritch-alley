import { EntityManager } from '@mikro-orm/postgresql';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseModule, ENTITY_MANAGER } from '../db/database.module';
import { Identity } from '../db/entities/identity.entity';
import { User } from '../db/entities/user.entity';
import { runMigrations } from '../db/migrate';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
import { AuthToken, consumeAuthToken, hashToken, issueAuthToken } from './auth-token';

// A token is a bearer credential for an account, so the database holds a hash of it and never the value
// that was mailed — the same reasoning the spec applies to storing a hash of the contact form's IP. It
// is single use, it expires, and it only works for the purpose it was minted for.
describe.skipIf(!hasDatabase)('the auth tokens', () => {
  let url: string;
  let moduleRef: TestingModule;
  let em: EntityManager;

  beforeAll(async () => {
    url = await createScratchDatabase();
    process.env.DATABASE_URL = url;
    await runMigrations({ databaseUrl: url });
    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    em = moduleRef.get<EntityManager>(ENTITY_MANAGER);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await dropScratchDatabase(url);
  });

  // A password identity to hang tokens on, with its own address so a case cannot pass on another's row.
  let sequence = 0;
  async function anIdentity(): Promise<Identity> {
    sequence += 1;
    const fork = em.fork();
    const user = fork.create(User, { displayName: `Player ${sequence}`, email: `token${sequence}@example.com` });
    const identity = fork.create(Identity, {
      user,
      provider: 'password',
      providerUserId: `token${sequence}@example.com`,
      email: `token${sequence}@example.com`,
      emailVerified: false,
    });
    await fork.flush();
    return identity;
  }

  async function tokenRow(token: string): Promise<AuthToken | null> {
    return em.fork().findOne(AuthToken, { tokenHash: hashToken(token) });
  }

  it('stores a hash of the token and never the value that was mailed', async () => {
    const identity = await anIdentity();
    const token = await issueAuthToken(em, identity, 'verify_email');

    const row = await tokenRow(token);
    expect(row).not.toBeNull();
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.tokenHash).toBe(hashToken(token));
  });

  it('answers the identity it was minted for, and refuses a second use', async () => {
    const identity = await anIdentity();
    const token = await issueAuthToken(em, identity, 'verify_email');

    const spent = await consumeAuthToken(em, token, 'verify_email');
    expect(spent?.id).toBe(identity.id);

    // The whole point of single use: the same link in the same mailbox is worth nothing a second time.
    await expect(consumeAuthToken(em, token, 'verify_email')).resolves.toBeNull();
  });

  it('refuses a token whose deadline has passed', async () => {
    const identity = await anIdentity();
    const token = await issueAuthToken(em, identity, 'reset_password');

    // Moved back rather than waited out: an expiry nobody can reach is an expiry nobody has tested.
    await em.fork().nativeUpdate(AuthToken, { tokenHash: hashToken(token) }, {
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(consumeAuthToken(em, token, 'reset_password')).resolves.toBeNull();
  });

  it('refuses a token presented for a purpose that is not its own', async () => {
    const identity = await anIdentity();
    // A reset link must not be able to verify an address, and the other way round: they are different
    // amounts of proof about the same mailbox.
    const token = await issueAuthToken(em, identity, 'reset_password');

    await expect(consumeAuthToken(em, token, 'verify_email')).resolves.toBeNull();
  });

  it('refuses a token that was never issued', async () => {
    await expect(consumeAuthToken(em, 'a-token-nobody-minted', 'verify_email')).resolves.toBeNull();
  });

  it('spends the previous token when a new one is issued, instead of leaving two live links', async () => {
    const identity = await anIdentity();
    const first = await issueAuthToken(em, identity, 'verify_email');
    const second = await issueAuthToken(em, identity, 'verify_email');

    await expect(consumeAuthToken(em, first, 'verify_email')).resolves.toBeNull();
    await expect(consumeAuthToken(em, second, 'verify_email')).resolves.not.toBeNull();
  });
});
