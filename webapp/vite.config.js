import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');

const MIME_TYPES = {
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp'
};

// `vite dev` only serves webapp/, but the app also fetches the curriculum
// markdown (the backend/genai/learn/lld trees at the repo root) and the two
// generated indexes (dist/docs-index.json, dist/search-index.json — run
// scripts/gen-docs-index.py and gen-search-index.py once). Without this, those
// requests fall through to the SPA's index.html with a 200 and the app renders
// "0 modules" with no visible error. Dev only: configureServer never runs
// during `vite build` or `vite preview`.
function serveRepoContent() {
  const contentRoots = ['backend', 'genai', 'learn', 'lld'];
  const generated = ['docs-index.json', 'search-index.json'];
  return {
    name: 'serve-repo-content',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const first = urlPath.split('/')[1];
        const base = generated.includes(first) ? distDir : contentRoots.includes(first) ? repoRoot : null;
        if (!base) return next();
        const filePath = normalize(join(base, urlPath));
        if (!filePath.startsWith(base) || !existsSync(filePath) || !statSync(filePath).isFile()) return next();
        res.setHeader('Content-Type', MIME_TYPES[extname(filePath)] || 'application/octet-stream');
        res.end(readFileSync(filePath));
      });
    }
  };
}

// The whole deployable site is assembled in dist/ (see the root package.json
// "build" script): this bundle first — it empties dist/ — then the indexes,
// the content trees and a pre-rendered page per module are added to it.
export default defineConfig({
  plugins: [react(), serveRepoContent()],
  // Baked in at build time (CI runs a fresh build on every deploy, so this is
  // effectively "when was this deployed") — read via src/lib/buildInfo.js,
  // never referenced as a bare identifier elsewhere.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
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
