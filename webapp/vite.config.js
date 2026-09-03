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
