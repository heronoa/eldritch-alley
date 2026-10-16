import type { Constructor } from '@mikro-orm/core';
import type { Migration } from '@mikro-orm/migrations';
import { MikroORM, type Options } from '@mikro-orm/postgresql';
import { Agent } from './entities/agent.entity';
import { AuthToken } from './entities/auth-token.entity';
import { Identity } from './entities/identity.entity';
import { PasswordCredential } from './entities/password-credential.entity';
import { User } from './entities/user.entity';

/**
 * The key this repository's migration step takes on the PostgreSQL advisory lock. A constant rather
 * than a hash of the database name, so that two applications sharing one database cannot collide, and
 * so that a reader can find it with a grep.
 */
export const MIGRATION_LOCK_KEY = 8_170_001;

export interface DatabaseConfig {
  databaseUrl: string;
  /**
   * The migrations to run, instead of the ones found on disk. Only the migration tests pass it: a
   * migration that fails has to be a migration of the test's own, and there is no other way to arrange
   * that without writing a broken file into the repository.
   */
  migrationsList?: Constructor<Migration>[];
}

/**
 * The ORM's options, built in one place. The entities are listed by class rather than by a path: the
 * list is what `dist` and `tsx` then agree on, with no glob to resolve and no guess about which of the
 * two folders this process is running from.
 */
export function ormOptions(config: DatabaseConfig): Options {
  return {
    clientUrl: config.databaseUrl,
    entities: [User, Identity, Agent, PasswordCredential, AuthToken],
    migrations: {
      // The compiled migrations in a built image, the sources under tsx. Both are derived from the
      // entities, so the schema cannot drift from them without a file in this repository changing.
      path: 'dist/migrations',
      pathTs: 'src/migrations',
      // Each migration in its own transaction. PostgreSQL has transactional DDL, so a migration that
      // fails half way through leaves nothing behind for the next run to trip over.
      transactional: true,
      // No snapshot files. Left on — MikroORM's default — the migrator writes one `.snapshot-<database>.json`
      // per database it touches, next to the migrations: the test suite's scratch databases each leave one
      // behind, and a running container writes into its own filesystem. The snapshot exists so that a diff
      // can be taken with no database in reach, which is not a problem this repository has: `migrate:create`
      // compares the entities against the database the developer is already pointed at.
      snapshot: false,
      migrationsList: config.migrationsList,
    },
    // `synchronize` is never enabled, in any environment: the schema is a file in this repository, and
    // letting the ORM create tables from the entities is exactly the drift the migrations prevent.
  };
}

/** Connects. The caller owns the instance and has to close it. */
export async function createOrm(config: DatabaseConfig): Promise<MikroORM> {
  return MikroORM.init(ormOptions(config));
}
