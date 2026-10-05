import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Source maps for every build but production: `npm run build` is production, and a staging build
    // (`vite build --mode staging`) keeps them to read its errors.
    sourcemap: mode !== 'production',
    // Vite would preload the match's chunks from the title page, which is the download this change avoids.
    modulePreload: false,
  },
}));
