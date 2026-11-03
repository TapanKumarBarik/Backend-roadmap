// Fails when the built site (dist/) loses a public address that docs/url-registry.tsv promises, or changes what a search engine
// reads at one: a page that is gone or moved without a permanent redirect, a canonical that is not the page itself, an indexed page
// that now says noindex, a page with no text, an indexed page missing from the sitemap. Run it after `npm run build`.
//   --report   also write docs/URL_TEST_REPORT.md
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, SITE_URL } from '../lib/config.mjs';
import { filesOf, pagesOf, readRedirects, readRegistry, sitemapPaths } from '../lib/publicUrls.mjs';
import { checkAddresses, reportOf } from '../lib/urlCheck.mjs';

const dist = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('check-urls: there is no dist/ to check. Run `npm run build` first.');
  process.exit(1);
}
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const verdict = checkAddresses({
  registry: readRegistry(read(path.join(ROOT, 'docs/url-registry.tsv'))),
  pages: pagesOf(dist),
  files: filesOf(dist),
  sitemap: sitemapPaths(read(path.join(dist, 'sitemap.xml')), SITE_URL),
  redirects: readRedirects(read(path.join(dist, '_redirects'))),
  siteUrl: SITE_URL
});

console.log(`check-urls: ${verdict.checked} registered addresses, ${verdict.redirected} redirected, ${verdict.added.length} new`);
if (process.argv.includes('--report')) {
  let commit = 'an unknown commit';
  try { commit = `commit ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim()}`; } catch { /* no git */ }
  fs.writeFileSync(path.join(ROOT, 'docs/URL_TEST_REPORT.md'), reportOf(verdict, { commit, when: new Date().toISOString().slice(0, 10) }));
  console.log('check-urls: wrote docs/URL_TEST_REPORT.md');
}
if (verdict.problems.length) {
  console.error(`\ncheck-urls: ${verdict.problems.length} problem(s):\n${verdict.problems.slice(0, 40).map((p) => `  ${p}`).join('\n')}`);
  console.error('\nA published address is a promise (docs/URL_MIGRATION_REGISTRY.md). Restore it, or move it with a permanent redirect in webapp/public/_redirects.');
  process.exit(1);
}
