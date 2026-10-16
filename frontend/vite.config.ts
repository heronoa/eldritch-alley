import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    port: 5173,
  },
  // The engine is a workspace package: its `main` is the CommonJS build in `backend/engine/dist`,
  // which lies outside `node_modules`, so Vite would not convert it on its own. Both the dev server
  // (pre-bundling) and the build (CommonJS conversion) are told to take it.
  optimizeDeps: {
    include: ['@eldritch-alley/engine'],
  },
  build: {
    outDir: 'dist',
    // Source maps for every build but production: `npm run build` is production, and a staging build
    // (`vite build --mode staging`) keeps them to read its errors.
    sourcemap: mode !== 'production',
    // Vite would preload the match's chunks from the title page, which is the download this change avoids.
    modulePreload: false,
    commonjsOptions: {
      include: [/node_modules/, /backend\/engine\/dist/],
    },
  },
}));
