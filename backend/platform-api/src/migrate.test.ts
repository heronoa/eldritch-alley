import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Migration } from '@mikro-orm/migrations';
import { describe, expect, it } from 'vitest';
import { createOrm } from './db/orm';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from './db/test-database';
import { runMigrations } from './db/migrate';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * How many migrations the repository has. Counted from the directory rather than written down, so that
 * a case about the runner keeps meaning "every migration, once" — m4-02's second migration is what a
 * number here would have cost, and every migration after it would cost again.
 */
const MIGRATIONS_ON_DISK = readdirSync(new URL('./migrations', import.meta.url)).filter((name) =>
  name.endsWith('.ts'),
).length;

/** The runner counts in words: `applied 1 migration`, `applied 2 migrations`. */
const APPLIED_EVERY_MIGRATION = new RegExp(`migrate: applied ${MIGRATIONS_ON_DISK} migrations?`);

// A migration that writes something and then fails. It is what proves the two properties the plan asks
// for: nothing it wrote survives, and the run is over rather than stuck.
class ExplodingMigration extends Migration {
  override async up(): Promise<void> {
    this.addSql('create table "exploding" ("id" uuid primary key)');
    throw new Error('this migration exploded');
  }
}

/** Runs the entry point as the compose file and the deploy will: a process, not an imported module. */
function runMigrateProcess(
  databaseUrl: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', join(PACKAGE_ROOT, 'src', 'migrate.ts')],
      { cwd: PACKAGE_ROOT, env: { ...process.env, DATABASE_URL: databaseUrl } },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

/** What the migration table holds, read through the migrator rather than through SQL of our own. */
async function executedMigrations(url: string): Promise<string[]> {
  const orm = await createOrm({ databaseUrl: url });
  try {
    return (await orm.getMigrator().getExecutedMigrations()).map((row) => row.name);
  } finally {
    await orm.close(true);
  }
}

async function tableNames(url: string): Promise<string[]> {
  const { rows } = await withClient(url, (client) =>
    client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' order by table_name`,
    ),
  );
  return rows.map((row) => row.table_name);
}

describe.skipIf(!hasDatabase)('migrate', () => {
  it('applies the migrations and creates users with the columns of the spec', async () => {
    const url = await createScratchDatabase();
    try {
      const run = await runMigrateProcess(url);
      expect(run.code, run.stderr).toBe(0);
      expect(run.stdout).toMatch(APPLIED_EVERY_MIGRATION);

      const { rows } = await withClient(url, (client) =>
        client.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
          `select column_name, data_type, is_nullable, column_default
             from information_schema.columns
            where table_schema = 'public' and table_name = 'users'
            order by ordinal_position`,
        ),
      );

      expect(rows.map((row) => [row.column_name, row.data_type, row.is_nullable])).toEqual([
        ['id', 'uuid', 'NO'],
        ['display_name', 'text', 'NO'],
        ['email', 'text', 'YES'],
        ['avatar_url', 'text', 'YES'],
        ['privacy_version_seen', 'text', 'YES'],
        ['created_at', 'timestamp with time zone', 'NO'],
        ['last_login_at', 'timestamp with time zone', 'YES'],
      ]);

      // The two timestamps and the id are the database's to fill, so that a user written by anything
      // other than the ORM — a psql session, a future job — is still a complete row.
      const defaults = new Map(rows.map((row) => [row.column_name, row.column_default]));
      expect(defaults.get('id')).toMatch(/gen_random_uuid\(\)/);
      expect(defaults.get('created_at')).toMatch(/now\(\)/);
    } finally {
      await dropScratchDatabase(url);
    }
  });

  it('applies nothing the second time and records one row per migration', async () => {
    const url = await createScratchDatabase();
    try {
      expect((await runMigrateProcess(url)).code).toBe(0);

      const second = await runMigrateProcess(url);
      expect(second.code, second.stderr).toBe(0);
      expect(second.stdout).toMatch(/migrate: nothing to apply/);

      expect(await executedMigrations(url)).toHaveLength(MIGRATIONS_ON_DISK);
    } finally {
      await dropScratchDatabase(url);
    }
  });

  it('lets two processes start at once and applies the migration exactly once', async () => {
    const url = await createScratchDatabase();
    try {
      const [first, second] = await Promise.all([runMigrateProcess(url), runMigrateProcess(url)]);

      expect(first.code, first.stderr).toBe(0);
      expect(second.code, second.stderr).toBe(0);
      const applied = [first, second].filter((run) => APPLIED_EVERY_MIGRATION.test(run.stdout));
      const skipped = [first, second].filter((run) => /migrate: nothing to apply/.test(run.stdout));
      expect(applied).toHaveLength(1);
      expect(skipped).toHaveLength(1);

      expect(await executedMigrations(url)).toHaveLength(MIGRATIONS_ON_DISK);
    } finally {
      await dropScratchDatabase(url);
    }
  });

  it('leaves nothing behind when a migration fails, and the next run still applies', async () => {
    const url = await createScratchDatabase();
    try {
      await expect(
        runMigrations({ databaseUrl: url, migrationsList: [ExplodingMigration] }),
      ).rejects.toThrow(/this migration exploded/);

      // The migration's own transaction is what makes this true rather than the migration being empty.
      expect(await tableNames(url)).not.toContain('exploding');
      expect(await executedMigrations(url)).toHaveLength(0);

      // And a run that follows starts straight away and does its work: the failed one left no lock
      // held and no half-applied state for the migrator to trip over.
      const after = await runMigrateProcess(url);
      expect(after.code, after.stderr).toBe(0);
      expect(after.stdout).toMatch(APPLIED_EVERY_MIGRATION);
      expect(await tableNames(url)).toContain('users');
    } finally {
      await dropScratchDatabase(url);
    }
  });

  // For the first migration this was the only reading the case could have: there was no earlier version
  // of the schema for it to be additive to. From m4-02's second migration on it is load-bearing — the
  // schema is already there when the next one runs.
  it('adds tables and drops none when it runs over an already migrated database', async () => {
    const url = await createScratchDatabase();
    try {
      expect((await runMigrations({ databaseUrl: url })).applied).toBe(MIGRATIONS_ON_DISK);
      const before = await tableNames(url);

      expect((await runMigrations({ databaseUrl: url })).applied).toBe(0);

      expect(await tableNames(url)).toEqual(before);
      expect(before).toContain('users');
      expect(before).toContain('identities');
      expect(before).toContain('agents');
    } finally {
      await dropScratchDatabase(url);
    }
  });
});
