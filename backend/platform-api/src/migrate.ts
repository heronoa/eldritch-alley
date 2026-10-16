// The migration step, as docker compose, CI and the deploy run it: a process of its own, before any
// instance of the API starts. Nothing imports this file — the tests reach for `runMigrations`, in
// src/db/migrate.ts, and always as a process for the cases that are about the process itself.

import { readDatabaseUrl } from './config';
import { runMigrations } from './db/migrate';

runMigrations({ databaseUrl: readDatabaseUrl(process.env.DATABASE_URL) }).then(
  ({ applied }) => {
    console.log(
      applied === 0
        ? 'migrate: nothing to apply'
        : `migrate: applied ${applied} migration${applied === 1 ? '' : 's'}`,
    );
    process.exit(0);
  },
  (error: unknown) => {
    console.error('migrate: failed', error);
    process.exit(1);
  },
);
