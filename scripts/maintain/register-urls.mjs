// Rewrites docs/url-registry.tsv from a built site: `npm run urls:register -- <dist of the site as it is live>`. The registry is a
// promise to everyone who linked to the site, so regenerate it only on purpose, from the build that is live, never to make a check pass.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/config.mjs';
import { filesOf, pagesOf, writeRegistry } from '../lib/publicUrls.mjs';

const dist = process.argv[2] && path.resolve(process.argv[2]);
if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('usage: npm run urls:register -- <a dist/ folder built from what is live>');
  process.exit(1);
}
const file = path.join(ROOT, 'docs/url-registry.tsv');
const header = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.startsWith('#')).join('\n');
fs.writeFileSync(file, writeRegistry(pagesOf(dist), filesOf(dist), header));
console.log(`wrote ${file}`);
