import { Client } from 'pg';
import { createOrm, MIGRATION_LOCK_KEY, type DatabaseConfig } from './orm';

/**
 * Takes the repository's advisory lock, applies every pending migration, and releases the lock.
 *
 * A second process started at the same instant waits on the lock and then finds nothing to apply,
 * which is what makes several instances of the step harmless — the property the deploy depends on when
 * a one-off task and a rolling update overlap.
 */
export async function runMigrations(config: DatabaseConfig): Promise<{ applied: number }> {
  // The lock lives on a connection of its own. The ORM's pool hands out a different connection per
  // query, and an advisory lock belongs to the session that took it, so it cannot be released through
  // a connection someone else is using.
  const lock = new Client({ connectionString: config.databaseUrl });
  await lock.connect();

  try {
    await lock.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    const orm = await createOrm(config);
    try {
      const applied = await orm.getMigrator().up();
      return { applied: applied.length };
    } finally {
      await orm.close(true);
    }
  } finally {
    // The lock would die with this session anyway, but releasing it here is what lets the next process
    // start now rather than when this one exits. A failure to release must not mask the failure above.
    await lock.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await lock.end();
  }
}
