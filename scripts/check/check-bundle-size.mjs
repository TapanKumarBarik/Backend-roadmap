// Fails when the built site asks a visitor to download more than the budgets in site.config.json (budgets) allow: what the first
// page needs, and what opening each heavy screen adds. The weight is in gzip, measured on dist/, so run it after `npm run build`.
// It is what stops an editor, a diagram library or a whole icon set from slipping into the first download unnoticed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from '../lib/config.mjs';
import { checkBudgets, measureBuild } from '../lib/bundleSize.mjs';

const dist = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('check-bundle-size: there is no dist/ to measure. Run `npm run build` first.');
  process.exit(1);
}

const { lines, ok } = checkBudgets(measureBuild(dist), config.budgets);
const width = Math.max(...lines.map((line) => line.what.length));
for (const line of lines) {
  const used = line.used == null ? 'no such chunk' : `${line.used.toFixed(1)} KB`;
  console.log(`${line.over ? 'OVER' : 'ok  '}  ${line.what.padEnd(width)}  ${used} of ${line.limit} KB`);
}
if (!ok) {
  console.error('\ncheck-bundle-size: over budget. Find what grew (`npx vite-bundle-visualizer` or the build output), load it lazily, or raise the budget in site.config.json on purpose.');
  process.exit(1);
}
