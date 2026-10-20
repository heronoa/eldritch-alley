/**
 * The config the **CLI** reads — `npm run migrate:create` — and nothing else. The API and the migration
 * step build their options from the same `ormOptions`, so a migration the CLI writes is a migration the
 * runner applies, and the two cannot drift apart.
 *
 * It lives under `src/` because that is where `tsc` can emit it from: the package compiles with
 * `rootDir: "src"`, so the CLI reads `dist/mikro-orm.config.js`, and the script builds first. The CLI
 * would otherwise want `ts-node`, which this package does not carry.
 *
 * The URL is taken as it comes, without the check `readDatabaseUrl` performs: the CLI runs at a desk,
 * with the developer's own DATABASE_URL, and a clear "connection refused" from it says more than a
 * validation message of ours would.
 *
 * `defineConfig` is what names the driver. The application does not need it — `MikroORM.init` comes from
 * the PostgreSQL package and knows its own driver — but the CLI builds its configuration out of the core
 * package, where an options object without a `driver` is not a configuration at all.
 */
import { defineConfig } from '@mikro-orm/postgresql';
import { ormOptions } from './db/orm';

export default defineConfig(
  ormOptions({
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://eldritch:eldritch@localhost:5432/eldritch_alley',
  }),
);
