#!/usr/bin/env node
// Checks content/corrections.json: every entry has a date, the lesson it is about (which must exist), what was wrong and what changed, newest first
// (the rules are in scripts/lib/corrections.mjs). Part of `npm run check`, so a mistake in the public log fails the pull request.
import { loadCorrections, validateAgainstContent } from '../lib/corrections.mjs';

const entries = loadCorrections();
const problems = validateAgainstContent(entries);
if (problems.length) {
  console.error(`check-corrections: ${problems.length} problem(s) in content/corrections.json:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-corrections: ${entries.length} correction${entries.length === 1 ? '' : 's'} OK`);
