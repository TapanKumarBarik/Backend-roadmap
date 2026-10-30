// Checks paths.json against the content on disk, so a renamed folder or a typo cannot quietly produce an empty
// path. Run it after editing paths.json or moving modules:  npm run check:paths
// (How a step is resolved is in scripts/lib/paths.mjs.)
import { loadCatalogue, resolvePath } from '../lib/paths.mjs';

const paths = loadCatalogue();
const ids = new Set(paths.map((p) => p.id));
const problems = [];
const fail = (message) => problems.push(message);

if (!paths.length) fail('paths.json has no paths');
if (ids.size !== paths.length) fail('paths.json has two paths with the same id');

const rows = [];
for (const p of paths) {
  const who = `path "${p.id}"`;
  for (const field of ['id', 'title', 'topic', 'goal', 'audience']) {
    if (!p[field] || typeof p[field] !== 'string') fail(`${who}: "${field}" is missing`);
  }
  if (!Array.isArray(p.steps) || !p.steps.length) { fail(`${who}: "steps" is empty`); continue; }
  if (p.next && (!ids.has(p.next) || p.next === p.id)) fail(`${who}: next "${p.next}" is not another path in this file`);

  const r = resolvePath(p);
  r.problems.forEach((m) => fail(`${who}: ${m}`));
  rows.push({ id: p.id, ...r });
}

for (const r of rows) {
  console.log(`${r.id.padEnd(28)} ${String(r.steps).padStart(2)} steps  ${String(r.modules).padStart(3)} modules  ${(r.minutes / 60).toFixed(1).padStart(5)} h` + (r.planned ? `   (${r.planned} planned module(s) skipped)` : ''));
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s) in paths.json:`);
  problems.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log(`\nok: ${paths.length} paths`);
