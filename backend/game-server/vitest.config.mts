import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Colyseus pulls in @pm2/io, which calls process.send() when it finds one. In vitest's
    // fork pool that channel belongs to the test runner, so the object it sends breaks it.
    // Worker threads have no process.send, which keeps @pm2/io quiet.
    pool: 'threads',
    include: ['src/**/*.test.ts'],
  },
});
