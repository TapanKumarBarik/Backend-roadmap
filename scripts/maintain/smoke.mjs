#!/usr/bin/env node
// Checks that a deployed site is really working (see scripts/lib/smoke.mjs for what is checked).
//
//   node scripts/maintain/smoke.mjs [base-url]      default: the site's own address from site.config.json
//
// Run by the deploy workflow after the upload. It tries for about two minutes before it gives up, because a new
// deployment takes a moment to reach every Cloudflare edge. Exit 1, with the problems as annotations, if it never
// looks healthy.
import { SITE_URL } from '../lib/config.mjs';
import { waitForHealthy } from '../lib/smoke.mjs';

const base = process.argv[2] || SITE_URL;
const problems = await waitForHealthy(base, { log: (line) => console.log(`smoke: ${line}`) });

if (problems.length) {
  for (const problem of problems) console.error(`::error title=Deployed site is not healthy::${problem}`);
  console.error(`smoke: ${base} is not healthy (${problems.length} problem(s))`);
  process.exit(1);
}
console.log(`smoke: ${base} is healthy`);
