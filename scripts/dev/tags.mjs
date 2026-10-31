#!/usr/bin/env node
// Shows the tags a lesson would get, to check the vocabulary in scripts/lib/tag-vocabulary.mjs after changing it:
//   node scripts/dev/tags.mjs backend/04-databases-and-data-layer/README.md [more files...]
import path from 'node:path';
import { CONTENT_ROOT } from '../lib/config.mjs';
import { readText, relativePosix } from '../lib/content.mjs';
import { tagsFor } from '../lib/tags.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/dev/tags.mjs <lesson.md> [more lessons...]');
  process.exit(1);
}

for (const file of files) {
  const full = path.resolve(file);
  const rel = relativePosix(CONTENT_ROOT, full);
  console.log(`${rel}\n  ${tagsFor(readText(full), rel).join(', ')}\n`);
}
