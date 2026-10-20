import { defineConfig } from 'vitest/config';

// The only suite that runs both services at once, and the only one that plays a whole match through a
// socket. It needs the same Node 22 the match server needs (`backend/game-server/vitest.config.mts`
// explains why: the Colyseus packages ship `import … with { type: 'json' }`), and it needs a database:
// the platform cannot come up without one, so every case here skips itself when `DATABASE_URL` is unset.
export default defineConfig({
  test: {
    // The match server's own reason, and it applies here for the same reason: the room pulls in
    // @pm2/io, which calls `process.send()` when it finds one, and in vitest's fork pool that channel
    // belongs to the test runner.
    pool: 'threads',
    include: ['src/**/*.test.ts'],
    // A case here creates a database, starts a platform, boots a match server and plays a match to its
    // last unit. The default five seconds is not a timeout, it is a race the case would always lose.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
