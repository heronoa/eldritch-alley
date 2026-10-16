import { defineConfig } from 'vitest/config';

// The frontend behaviour that can be tested without a browser: coordinates, the protocol, the
// click-to-intent logic, the event log text and the network client. Rendering is not tested here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
