import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds into the repo root (not a nested dist/) so staticwebapp.config.json's
// existing app_location:"/" / output_location:"" keep working unchanged, and
// docs-index.json / the content trees / scripts/gen-docs-index.py stay put.
// emptyOutDir is false because the repo root also holds the markdown content
// this app serves — wiping it on every build would be catastrophic. CI is
// responsible for removing stale /assets/* before each build instead.
export default defineConfig({
  plugins: [react()],
  // Baked in at build time (CI runs a fresh `npm run build` on every deploy,
  // so this is effectively "when was this deployed") — read via
  // src/lib/buildInfo.js, never referenced as a bare identifier elsewhere.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: '../',
    emptyOutDir: false,
    assetsDir: 'assets'
  },
  server: {
    proxy: {
      '/api': 'http://localhost:7071'
    }
  }
});
