// Reads paths.json and resolves each path's steps against the content on disk. Shared by the checker
// (npm run check:paths) and the build-time stats the landing page uses, so both agree on what a path holds.
//
// A step is a folder: a track (all its written modules, in order), a single module, or a whole flat curriculum
// such as lld/. A module is a folder with a README.md and no module folders inside it, the same rule
// scripts/build/gen-docs-index.py uses; one that still carries the placeholder sentence is "planned" and is left
// out of a path until someone writes it.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, CURRICULA, isPlaceholderText } from './config.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__']);

export const loadCatalogue = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'paths.json'), 'utf8')).paths || [];

const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name)).map((d) => d.name).sort();

function modulesUnder(dir) {
  const inside = subdirs(dir).flatMap((name) => modulesUnder(path.join(dir, name)));
  if (!inside.length && fs.existsSync(path.join(dir, 'README.md'))) return [dir];
  return inside;
}

// The reading time the module page shows: code blocks are not read, so they are not counted.
function readingMinutes(raw) {
  const words = raw.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / config.content.wordsPerMinute));
}

// What one path comes to on disk: its written modules (each counted once, in reading order), how many planned
// modules it had to skip, the reading time, the first module to open, and anything wrong with its steps.
export function resolvePath(p) {
  const problems = [];
  const seen = new Set();
  const written = [];
  let planned = 0;
  let steps = 0;

  for (const step of p.steps || []) {
    if (!CURRICULA.includes(step.split('/')[0])) { problems.push(`step "${step}" is not inside a curriculum (${CURRICULA.join(', ')})`); continue; }
    const dir = path.join(ROOT, step);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { problems.push(`step "${step}" is not a folder`); continue; }
    const found = modulesUnder(dir);
    if (!found.length) { problems.push(`step "${step}" has no modules in it`); continue; }
    let stepWritten = 0;
    for (const m of found) {
      const raw = fs.readFileSync(path.join(m, 'README.md'), 'utf8');
      if (isPlaceholderText(raw)) { planned++; continue; }
      stepWritten++;
      if (!seen.has(m)) { seen.add(m); written.push({ dir: m, minutes: readingMinutes(raw) }); }
    }
    if (!stepWritten) problems.push(`step "${step}" has only planned modules, so it adds nothing yet`);
    else steps++;
  }

  return {
    modules: written.length,
    planned,
    steps,
    minutes: written.reduce((total, m) => total + m.minutes, 0),
    start: written.length ? path.relative(ROOT, path.join(written[0].dir, 'README.md')).split(path.sep).join('/') : null,
    problems
  };
}
