// Checks paths.json against the content on disk, so a renamed folder or a typo cannot quietly produce an empty
// path. Run it after editing paths.json or moving modules:  npm run check:paths
//
// A step is a folder: a track (all its written modules, in order), a single module, or a whole flat curriculum
// such as lld/. A module is a folder with a README.md and no module folders inside it, the same rule
// scripts/build/gen-docs-index.py uses; one that still carries the placeholder sentence is "planned" and is
// left out of a path until someone writes it.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, CURRICULA, isPlaceholderText } from '../lib/config.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__']);
const WORDS_PER_MINUTE = config.content.wordsPerMinute;

const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name)).map((d) => d.name).sort();

function modulesUnder(dir) {
  const inside = subdirs(dir).flatMap((name) => modulesUnder(path.join(dir, name)));
  if (!inside.length && fs.existsSync(path.join(dir, 'README.md'))) return [dir];
  return inside;
}

function readingMinutes(raw) {
  const words = raw.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

const problems = [];
const fail = (message) => problems.push(message);

const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'paths.json'), 'utf8'));
const paths = catalogue.paths || [];
const ids = new Set(paths.map((p) => p.id));
if (!paths.length) fail('paths.json has no paths');
if (ids.size !== paths.length) fail('paths.json has two paths with the same id');

const rows = [];
for (const p of paths) {
  const who = `path "${p.id}"`;
  for (const field of ['id', 'title', 'goal', 'audience']) {
    if (!p[field] || typeof p[field] !== 'string') fail(`${who}: "${field}" is missing`);
  }
  if (!Array.isArray(p.steps) || !p.steps.length) { fail(`${who}: "steps" is empty`); continue; }
  if (p.next && (!ids.has(p.next) || p.next === p.id)) fail(`${who}: next "${p.next}" is not another path in this file`);

  const seen = new Set();
  let modules = 0;
  let planned = 0;
  let minutes = 0;
  for (const step of p.steps) {
    const root = step.split('/')[0];
    if (!CURRICULA.includes(root)) { fail(`${who}: step "${step}" is not inside a curriculum (${CURRICULA.join(', ')})`); continue; }
    const dir = path.join(ROOT, step);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { fail(`${who}: step "${step}" is not a folder`); continue; }
    const found = modulesUnder(dir);
    if (!found.length) { fail(`${who}: step "${step}" has no modules in it`); continue; }
    let written = 0;
    for (const m of found) {
      const raw = fs.readFileSync(path.join(m, 'README.md'), 'utf8');
      if (isPlaceholderText(raw)) { planned++; continue; }
      written++;
      if (!seen.has(m)) { seen.add(m); modules++; minutes += readingMinutes(raw); }
    }
    if (!written) fail(`${who}: step "${step}" has only planned modules, so it adds nothing yet`);
  }
  rows.push({ id: p.id, steps: p.steps.length, modules, planned, hours: (minutes / 60).toFixed(1) });
}

for (const r of rows) {
  console.log(`${r.id.padEnd(28)} ${String(r.steps).padStart(2)} steps  ${String(r.modules).padStart(3)} modules  ${r.hours.padStart(5)} h` + (r.planned ? `   (${r.planned} planned module(s) skipped)` : ''));
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s) in paths.json:`);
  problems.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log(`\nok: ${paths.length} paths`);
