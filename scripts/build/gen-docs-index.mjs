#!/usr/bin/env node
// Writes dist/docs-index.json, the module tree the app reads. Part of `npm run build`; run on its own (`npm run index`)
// after adding or renaming a module while working locally. How the tree is built: scripts/lib/docsIndex.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CURRICULA } from '../lib/config.mjs';
import { buildDocsIndex } from '../lib/docsIndex.mjs';

const { index, files, untagged } = buildDocsIndex(ROOT, CURRICULA);

const out = path.join(ROOT, 'dist', 'docs-index.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(index, null, 2));

console.log(`Wrote ${out} (${files} files indexed, ${Object.keys(index.tags).length} distinct tags)`);
if (untagged.length) {
  console.log(`  WARNING: ${untagged.length} file(s) received no tags:`);
  untagged.slice(0, 10).forEach((file) => console.log(`    ${file}`));
}
