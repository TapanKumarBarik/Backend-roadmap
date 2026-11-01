// Checks that no curriculum or track overview page carries the "not written yet" sentence, which would make the site treat a
// table of contents as an empty module (not indexed, shown with a "claim this module" box). Run it after editing an overview:
//   npm run check:overviews
// (What the sentence is: site.config.json, content.placeholderMarker. The rule: scripts/lib/overviews.mjs.)
import path from 'node:path';
import { CONTENT_ROOT, CURRICULA, config } from '../lib/config.mjs';
import { readText } from '../lib/content.mjs';
import { buildDocsIndex } from '../lib/docsIndex.mjs';
import { overviewsMarkedUnwritten } from '../lib/overviews.mjs';

const { index } = buildDocsIndex(CONTENT_ROOT, CURRICULA);
const bad = overviewsMarkedUnwritten(index.tree, (file) => readText(path.join(CONTENT_ROOT, file)));

if (bad.length) {
  console.error(`${bad.length} overview page(s) say "${config.content.placeholderMarker}" in their first ${config.content.placeholderScanLines} lines, so the site treats them as unwritten modules:`);
  bad.forEach((file) => console.error(`  - ${config.content.dir}/${file}`));
  console.error('Reword the sentence (an overview is a signpost, not a placeholder).');
  process.exit(1);
}
console.log('ok: no curriculum or track overview is mistaken for an unwritten module');
