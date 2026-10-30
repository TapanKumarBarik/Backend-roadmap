#!/usr/bin/env node
// Adds the curriculum to dist/, after the webapp build has put the app (and the Cloudflare config in
// webapp/public/: _headers, _routes.json) there, then refuses to continue if anything secret-shaped
// ended up in dist/.
//
// dist/ is the only thing ever deployed. The repo root holds local secrets
// (.dev.vars, .env) next to the content, and `wrangler pages deploy` does not
// honor .assetsignore — deploying the root once published them. So this copies
// an explicit allowlist rather than excluding things.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

const CONTENT_DIRS = require(path.join(ROOT, 'site.config.json')).content.curricula;
// Shipped by Vite from webapp/public/. Deploying without them silently drops the security headers and the
// /api routing, so a build that lost one must fail here rather than deploy.
const REQUIRED_CONFIG = ['_headers', '_routes.json'];

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  throw new Error('copy-content: dist/index.html missing — build the webapp first');
}

for (const name of REQUIRED_CONFIG) {
  if (!fs.existsSync(path.join(DIST, name))) throw new Error(`copy-content: dist/${name} missing (expected from webapp/public/)`);
}
for (const name of CONTENT_DIRS) {
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

console.log(`copy-content: added ${CONTENT_DIRS.length} content trees to dist/ (Cloudflare config present)`);
