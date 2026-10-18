import { defineConfig } from 'vitest/config';

// The unit tests need nothing running. The integration tests — the migration runner and the ORM —
// skip themselves when DATABASE_URL is absent, which is what keeps `npm test` working on a machine
// with no database. See src/db/test-database.ts.
//
// The timeout is the suite's, not the default 5s: a case here creates and drops a database and may
// start the migrate entry point as a process of its own, which is seconds of work per case on a cold
// connection pool.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
