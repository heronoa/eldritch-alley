import { defineConfig } from 'vitest/config';

// The Colyseus packages ship JSON imports written as `import x from '...json' with { type: 'json' }`.
// Node reads that syntax from 22 on; Node 18 fails at load with `Unexpected token 'with'`, which looks
// like a broken test instead of a wrong runtime. Say so before any suite runs.
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  throw new Error(`game-server tests need Node 22 or later (running ${process.version}).`);
}

export default defineConfig({
  test: {
    // Colyseus pulls in @pm2/io, which calls process.send() when it finds one. In vitest's
    // fork pool that channel belongs to the test runner, so the object it sends breaks it.
    // Worker threads have no process.send, which keeps @pm2/io quiet.
    pool: 'threads',
    include: ['src/**/*.test.ts'],
  },
});
