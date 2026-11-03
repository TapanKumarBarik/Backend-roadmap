#!/usr/bin/env bash
# Lighthouse (performance, accessibility, best practices, SEO; mobile emulation, its default) over a handful of pages of a running copy of the site.
#
#   npm run build && npm run preview          in one terminal (the preview is on port 4180)
#   CHROME_PATH=/path/to/chrome npm run lighthouse [base-url]
#
# It prints the scores and whatever is below perfect. Two things are artefacts of a local preview, not of the site: "errors in console" (there is no API
# behind the preview, so /api/* answers 502) and "uses long cache TTL" (the preview sets no cache headers; Cloudflare does). The largest-contentful-paint
# figure is the throttled mobile simulation of a page that is drawn by script, so it is the number to compare between runs, not to read as absolute.
BASE="${1:-http://localhost:4180}"
OUT="${TMPDIR:-/tmp}/lighthouse"
mkdir -p "$OUT"
run() {
  name="$1"; path="$2"
  npx -y lighthouse@12 "$BASE$path" --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless=new --no-sandbox" --output=json --output-path="$OUT/$name.json" --quiet >/dev/null 2>&1
  node -e "
const r = require('$OUT/$name.json');
console.log('## $name', Object.entries(r.categories).map(([k, v]) => k.slice(0, 4) + ':' + Math.round(v.score * 100)).join(' '), 'LCP', r.audits['largest-contentful-paint'].displayValue, 'TBT', r.audits['total-blocking-time'].displayValue, 'CLS', r.audits['cumulative-layout-shift'].displayValue);
const skip = new Set(['errors-in-console', 'uses-long-cache-ttl', 'cache-insight', 'render-blocking-resources', 'render-blocking-insight', 'network-dependency-tree-insight', 'unused-css-rules', 'unused-javascript', 'largest-contentful-paint-element', 'first-contentful-paint', 'largest-contentful-paint', 'speed-index', 'max-potential-fid', 'interactive', 'total-blocking-time']);
for (const [k, a] of Object.entries(r.audits)) if (a.score !== null && a.score < 1 && !skip.has(k) && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode)) console.log('  -', k, a.score, a.displayValue || '');
"
}
run home "/"
run module "/backend/01-request-response-fundamentals/06-http-caching/"
run path "/paths/backend-foundations/"
run quiz "/practice/quiz/http-caching/"
run design-lab "/design-lab/lld/parking-lot/"
run videos "/videos/"
