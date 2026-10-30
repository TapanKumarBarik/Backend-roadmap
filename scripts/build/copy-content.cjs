#!/usr/bin/env node
// Adds the curriculum and the Cloudflare config to dist/, after the webapp
// build has put the app there, then refuses to continue if anything
// secret-shaped ended up in dist/.
//
// dist/ is the only thing ever deployed. The repo root holds local secrets
// (.dev.vars, .env) next to the content, and `wrangler pages deploy` does not
// honor .assetsignore — deploying the root once published them. So this copies
// an explicit allowlist rather than excluding things.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const CONTENT_DIRS = ['backend', 'genai', 'learn', 'lld'];
const CF_CONFIG = ['_headers', '_routes.json'];

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  throw new Error('copy-content: dist/index.html missing — build the webapp first');
}

for (const name of [...CONTENT_DIRS, ...CF_CONFIG]) {
  fs.cpSync(path.join(ROOT, name), path.join(DIST, name), { recursive: true });
}

const FORBIDDEN = /(^|[\\/])(\.env|\.dev\.vars|local\.settings\.json|.*\.sql)$/i;
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (FORBIDDEN.test(p)) throw new Error(`copy-content: refusing to ship ${path.relative(ROOT, p)}`);
  }
})(DIST);

console.log(`copy-content: added ${CONTENT_DIRS.length} content trees and Cloudflare config to dist/`);
