import { defineConfig } from 'vite';

export default defineConfig({
  // One .env for the repository. Only the VITE_ prefixed keys reach the bundle, so the backend's secrets stay out.
  envDir: '..',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
