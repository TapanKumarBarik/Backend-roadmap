#!/usr/bin/env node
// Checks content/study-packs.json against webapp/public/<folder>: every entry has its PDF, every PDF has an entry, names are unique and safe for an address, and every
// title, summary and count is there (the rules are in scripts/lib/studyPacks.mjs). Part of `npm run check`, so a book that the page would not offer, or a link that
// would 404, fails the pull request.
import { loadStudyPacks, validateStudyPacks, diskSizeOf, diskFolderListing, allPacks } from '../lib/studyPacks.mjs';

const data = loadStudyPacks();
const problems = validateStudyPacks(data, { sizeOf: diskSizeOf(data), listing: diskFolderListing(data) });
if (problems.length) {
  console.error(`check-study-packs: ${problems.length} problem(s) in content/study-packs.json:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const files = allPacks(data).reduce((sum, pack) => sum + pack.files.length, 0);
console.log(`check-study-packs: ${allPacks(data).length} packs, ${files} PDFs OK`);
