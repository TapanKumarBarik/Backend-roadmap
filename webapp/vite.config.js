import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const MIME_TYPES = {
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp'
};

// The app's own content — docs-index.json and the backend/genai/learn/lld
// module trees — lives at the REPO ROOT, one level above this project.
// `vite build` writes into that same root (outDir: '../' below), so the
// production bundle sits right next to its content and everything just
// works. `vite dev` has no equivalent: it only ever serves webapp/ and
// webapp/public/, so a request for docs-index.json silently falls through
// to the SPA's index.html (still 200 OK) and the app renders "0 modules"
// with no visible error at all. This closes that gap for dev only —
// configureServer never runs during `vite build` or `vite preview` (preview
// serves the real build output, which already has this content in place).
function serveRepoContent() {
  const roots = ['docs-index.json', 'backend', 'genai', 'learn', 'lld'];
  return {
    name: 'serve-repo-content',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (!roots.includes(urlPath.split('/')[1])) return next();
        const filePath = normalize(join(repoRoot, urlPath));
        if (!filePath.startsWith(repoRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) return next();
        res.setHeader('Content-Type', MIME_TYPES[extname(filePath)] || 'application/octet-stream');
        res.end(readFileSync(filePath));
      });
    }
  };
}

// Builds into the repo root (next to docs-index.json and the content trees);
// scripts/stage-dist.cjs then copies an allowlist of it into dist/ for deploy.
// emptyOutDir is false because the repo root also holds the markdown content
// this app serves — wiping it on every build would be catastrophic. CI is
// responsible for removing stale /assets/* before each build instead.
export default defineConfig({
  plugins: [react(), serveRepoContent()],
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
  // /api goes to `wrangler pages dev` (see LOCAL-SETUP.md) in both modes.
  server: {
    proxy: {
      '/api': 'http://localhost:8788'
    }
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:8788'
    }
  }
});
