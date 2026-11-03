// Checks paths.json against the content on disk, so a renamed folder or a typo cannot quietly produce an empty
// path. Run it after editing paths.json or moving modules:  npm run check:paths
// (How a step is resolved is in scripts/lib/paths.mjs.)
import { loadCatalogue, resolvePath } from '../lib/paths.mjs';
import { pathListProblems } from '../../webapp/src/lib/siteContent/paths.js';

const paths = loadCatalogue();
const problems = [];
const fail = (message) => problems.push(message);

// The shape of the file is the rules the admin editor uses too (webapp/src/lib/siteContent/paths.js); the steps are looked up on disk.
pathListProblems(paths).forEach(fail);

const rows = [];
for (const p of paths) {
  if (!p || !Array.isArray(p.steps) || !p.steps.every((step) => typeof step === 'string')) continue; // the shape check above says what is wrong
  const r = resolvePath(p);
  r.problems.forEach((m) => fail(`path "${p.id}": ${m}`));
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
