#!/usr/bin/env node
// Tells Bing, Yandex and the other IndexNow search engines which pages just changed, so they fetch them now
// instead of whenever they next happen to visit. Google does not take part in IndexNow; it learns about changes
// from sitemap.xml (submit that once in Search Console).
//
// The key is proved by the file webapp/public/<key>.txt, which the site serves at the root; the key and the
// endpoint are in site.config.json ("seo").
//
//   node scripts/maintain/indexnow.mjs <commit before the deploy> [--dry-run]
//
// Run by the deploy workflow after a successful deploy, with the commit the push replaced. Only modules whose
// README changed in that range are sent (unwritten placeholders are not: they are not in the index). With nothing
// to compare against, or nothing changed, it sends nothing and succeeds.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { moduleUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';
import { ROOT, CONTENT_ROOT, CONTENT_DIR, config, SITE_URL, CURRICULA, isPlaceholderText } from '../lib/config.mjs';

const BATCH = 1000; // the protocol allows 10,000 per request
const [since, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

if (!since || /^0+$/.test(since)) {
  console.log('indexnow: no earlier commit to compare with, nothing to send');
  process.exit(0);
}

// Files added, changed or renamed-with-changes since then, as paths from the content folder. A pure rename (R100) is
// not a change: it is how moving the curricula into content/ shows up, and none of those pages changed.
let changed;
try {
  const prefix = CONTENT_DIR + '/';
  changed = execFileSync('git', ['diff', '-M', '--name-status', '--diff-filter=AMR', since, 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .map((line) => line.split('\t'))
    .filter(([status]) => status !== 'R100')
    .map((columns) => columns[columns.length - 1])
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((file) => CURRICULA.includes(file.split('/')[0]));
} catch {
  console.log(`indexnow: could not compare ${since.slice(0, 7)} with HEAD (not in this clone's history), nothing to send`);
  process.exit(0);
}

const urls = changed
  .filter((file) => file.endsWith('/README.md'))
  .filter((file) => fs.existsSync(path.join(CONTENT_ROOT, file)) && !isPlaceholderText(fs.readFileSync(path.join(CONTENT_ROOT, file), 'utf8')))
  .map((file) => moduleUrl(file))
  .filter(Boolean)
  .map((url) => SITE_URL + url);

if (!urls.length) {
  console.log('indexnow: no module pages changed, nothing to send');
  process.exit(0);
}

const { indexNowKey: key, indexNowEndpoint: endpoint } = config.seo;
const host = new URL(SITE_URL).host;
let failed = false;
for (let i = 0; i < urls.length; i += BATCH) {
  const body = { host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: urls.slice(i, i + BATCH) };
  if (dryRun) {
    console.log(`indexnow (dry run): would send ${body.urlList.length} URL(s) to ${endpoint}:\n  ${body.urlList.join('\n  ')}`);
    continue;
  }
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  console.log(`indexnow: sent ${body.urlList.length} URL(s), answer ${res.status}`);
  if (!res.ok) failed = true; // 200 and 202 are success
}
process.exit(failed ? 1 : 0);
