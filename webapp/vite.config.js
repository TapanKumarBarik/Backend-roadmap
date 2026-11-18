import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorrections, correctionsHtml } from '../scripts/lib/corrections.mjs';
import { bioHtml } from '../scripts/lib/aboutPage.mjs';
import { loadStudyPacks, studyPacksHtml } from '../scripts/lib/studyPacks.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const siteConfig = JSON.parse(readFileSync(join(repoRoot, 'site.config.json'), 'utf8'));
const contentDir = join(repoRoot, siteConfig.content.dir);

const MIME_TYPES = {
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp'
};

// `vite dev` only serves webapp/, but the app also fetches the curriculum
// markdown (the curricula, in the content folder) and the generated files
// (dist/docs-index.json, search-index.json, site-stats.json, videos.json — run
// `npm run index` once, from the repo root). Without this, those
// requests fall through to the SPA's index.html with a 200 and the app renders
// "0 modules" with no visible error. Dev only: configureServer never runs
// during `vite build` or `vite preview`.
function serveRepoContent() {
  const contentRoots = siteConfig.content.curricula;
  const generated = ['docs-index.json', 'search-index.json', 'site-stats.json', 'videos.json', 'tracker.json'];
  return {
    name: 'serve-repo-content',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const first = urlPath.split('/')[1];
        const base = generated.includes(first) ? distDir : contentRoots.includes(first) ? contentDir : null;
        if (!base) return next();
        const filePath = normalize(join(base, urlPath));
        if (!filePath.startsWith(base) || !existsSync(filePath) || !statSync(filePath).isFile()) return next();
        res.setHeader('Content-Type', MIME_TYPES[extname(filePath)] || 'application/octet-stream');
        res.end(readFileSync(filePath));
      });
    }
  };
}

// index.html (and every page of its own under webapp/tools, webapp/about and webapp/corrections) names the site, its title and description once, as %SITE_*% placeholders filled from
// site.config.json, so the page head, the app (which resets the title on the home page) and the pre-render step
// all say the same thing. Runs before Vite's own %ENV% replacement, which would otherwise warn about them.
function siteHead() {
  const { site } = siteConfig;
  const values = {
    SITE_NAME: site.name,
    SITE_TITLE: site.title,
    SITE_DESCRIPTION: site.description,
    SITE_URL: site.url,
    SITE_SOCIAL_IMAGE: site.url + site.socialImage,
    DEVELOPER_NAME: siteConfig.developer.name,
    DEVELOPER_EMAIL: siteConfig.developer.email,
    DEVELOPER_LINKEDIN: siteConfig.developer.linkedin,
    DEVELOPER_GITHUB: siteConfig.developer.github,
    YOUTUBE_CHANNEL: siteConfig.youtube.channel
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'site-head',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/%((?:SITE|DEVELOPER|YOUTUBE)_[A-Z_]+)%/g, (m, key) => (key in values ? esc(values[key]) : m))
    }
  };
}

// The pages that are built from data: /corrections/ carries the log (content/corrections.json), /about/ the developer's own words about themselves
// (site.config.json -> developer.bio and developer.photo, when they are set) and /study-packs/ the downloads (content/study-packs.json, the PDFs in webapp/public/notes).
// Each is a %BLOCK_*% placeholder in the page's HTML replaced with HTML that has no raw percent sign in it, so Vite's own %ENV% replacement has nothing to find.
function trustBlocks() {
  const blocks = () => ({
    BLOCK_CORRECTIONS: correctionsHtml(loadCorrections()),
    BLOCK_ABOUT_BIO: bioHtml(siteConfig.developer),
    BLOCK_STUDY_PACKS: studyPacksHtml(loadStudyPacks())
  });
  return {
    name: 'trust-blocks',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => {
        const values = blocks();
        return html.replace(/%(BLOCK_[A-Z_]+)%/g, (m, key) => (key in values ? values[key] : m));
      }
    }
  };
}

// The whole deployable site is assembled in dist/ (see the root package.json
// "build" script): this bundle first — it empties dist/ — then the indexes,
// the content trees and a pre-rendered page per module are added to it.
export default defineConfig({
  plugins: [react(), serveRepoContent(), siteHead(), trustBlocks()],
  // Baked in at build time (CI runs a fresh build on every deploy, so this is
  // effectively "when was this deployed") — read via src/lib/buildInfo.js,
  // never referenced as a bare identifier elsewhere.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    assetsDir: 'assets',
    // CSP forbids `data:` in `font-src 'self'`, so KaTeX's small (<4 KB) .woff2 fonts must emit as `/assets/*` files instead of inline data URIs.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|eot|otf)(\?.*)?$/i.test(filePath) ? false : undefined),
    // The app, and the small tools that are pages of their own (site.config.json -> tools): each an HTML entry that ends up at its own address in dist/.
    rollupOptions: {
      input: {
        main: resolve(repoRoot, 'webapp/index.html'),
        ...Object.fromEntries([...(siteConfig.tools || []), ...(siteConfig.pages || [])].map((entry) => [`page-${entry.id}`, resolve(repoRoot, 'webapp', entry.entry)]))
      }
    }
  },
  // /api goes to `wrangler pages dev` (see docs/LOCAL-SETUP.md) in both modes.
  server: {
    // site.config.json lives at the repo root, one level above this project; the dev server must be allowed to read it.
    fs: { allow: [repoRoot] },
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
