#!/usr/bin/env node
// Assembles the deployable site into dist/ from an explicit allowlist.
//
// The repo root mixes the built site with source, tooling, local secrets
// (.dev.vars, .env) and exported user data (cloudflare/export/). Deploying the
// root directly relied on .assetsignore, which `wrangler pages deploy` does NOT
// honor — it published those files. Deny-by-default: only what is listed here
// is ever uploaded.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const CONTENT_DIRS = ['backend', 'genai', 'learn', 'lld'];
const GENERATED = ['index.html', 'assets', 'docs-index.json', 'search-index.json'];
const CF_CONFIG = ['_headers', '_routes.json'];
const PUBLIC_FILES = fs.readdirSync(path.join(ROOT, 'webapp', 'public'));

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);

for (const name of [...GENERATED, ...PUBLIC_FILES, ...CF_CONFIG, ...CONTENT_DIRS]) {
  const src = path.join(ROOT, name);
  if (!fs.existsSync(src)) throw new Error(`stage-dist: missing ${name} (did the build run?)`);
  fs.cpSync(src, path.join(DIST, name), { recursive: true });
}

// Content trees hold markdown + images only; refuse to ship anything that
// looks like a secret or data dump if one ever lands in them.
const FORBIDDEN = /(^|[\\/])(\.env|\.dev\.vars|local\.settings\.json|.*\.sql)$/i;
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (FORBIDDEN.test(p)) throw new Error(`stage-dist: refusing to ship ${path.relative(ROOT, p)}`);
  }
})(DIST);

console.log(`stage-dist: dist/ ready (${CONTENT_DIRS.length} content trees, ${PUBLIC_FILES.length} public files)`);
