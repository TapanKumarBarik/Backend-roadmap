// Asks a running site for every registered address (docs/url-registry.tsv), the way a visitor or a crawler does: before production
// traffic moves to a new build, run it against the staging deploy.
//   node scripts/maintain/check-urls-live.mjs <base url> [--sample N] [--no-slashless]
//   e.g.  node scripts/maintain/check-urls-live.mjs https://abc123.backend-roadmap.pages.dev
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE_URL } from '../lib/config.mjs';
import { readRegistry } from '../lib/publicUrls.mjs';
import { checkLive } from '../lib/urlLive.mjs';

const args = process.argv.slice(2);
const base = args.find((arg) => /^https?:/.test(arg));
if (!base) {
  console.error('usage: node scripts/maintain/check-urls-live.mjs <base url> [--sample N] [--no-slashless]');
  process.exit(1);
}
const registry = readRegistry(fs.readFileSync(path.join(ROOT, 'docs/url-registry.tsv'), 'utf8'));
let addresses = Object.keys(registry);
const sample = Number(args[args.indexOf('--sample') + 1]);
if (args.includes('--sample') && sample > 0) {
  const every = Math.max(1, Math.floor(addresses.length / sample));
  addresses = addresses.filter((_, i) => i % every === 0).slice(0, sample);
}
const { problems, checked } = await checkLive({ base, siteUrl: SITE_URL, registry, addresses, slashless: !args.includes('--no-slashless') });
console.log(`check-urls-live: ${checked} addresses asked of ${base}, ${problems.length} problem(s)`);
if (problems.length) {
  console.error(problems.slice(0, 60).map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
