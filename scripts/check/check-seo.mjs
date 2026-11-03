#!/usr/bin/env node
// Checks content/seo.json (optional): every key is a real module's README, every title and description is within the limits, nothing
// is repeated (the rules are in webapp/src/lib/siteContent/seo.js). Part of `npm run check`, so a mistake fails the pull request.
import { loadSeo, validateSeoAgainstContent } from '../lib/seo.mjs';

const seo = loadSeo();
const problems = validateSeoAgainstContent(seo);
if (problems.length) {
  console.error(`check-seo: ${problems.length} problem(s) in content/seo.json:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-seo: ${Object.keys(seo).length} page(s) with their own title or description OK`);
