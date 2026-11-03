// Reads paths.json and resolves each path's steps against the content on disk. Shared by the checker
// (npm run check:paths) and the build-time stats the landing page uses, so both agree on what a path holds.
//
// A step is a folder: a track (all its written modules, in order), a single module, or a whole flat curriculum
// such as lld/. A module is a folder with a README.md and no module folders inside it, the same rule
// scripts/lib/docsIndex.mjs uses; one that still carries the placeholder sentence is "planned" and is left
// out of a path until someone writes it.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, CURRICULA, isPlaceholderText } from './config.mjs';
import { SKIP_DIRS, readText, readingMinutes } from './content.mjs';
import { stepProblem } from '../../webapp/src/lib/siteContent/paths.js';

export const loadCatalogue = () => JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'paths.json'), 'utf8')).paths || [];

const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name)).map((d) => d.name).sort();

function modulesUnder(dir) {
  const inside = subdirs(dir).flatMap((name) => modulesUnder(path.join(dir, name)));
  if (!inside.length && fs.existsSync(path.join(dir, 'README.md'))) return [dir];
  return inside;
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
    const dir = path.join(CONTENT_ROOT, step);
    const isFolder = CURRICULA.includes(step.split('/')[0]) && fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    const found = isFolder ? modulesUnder(dir) : [];
    let stepWritten = 0;
    for (const m of found) {
      const raw = readText(path.join(m, 'README.md'));
      if (isPlaceholderText(raw)) { planned++; continue; }
      stepWritten++;
      if (!seen.has(m)) { seen.add(m); written.push({ dir: m, minutes: readingMinutes(raw) }); }
    }
    // The words (and the rules) are shared with the admin editor: webapp/src/lib/siteContent/paths.js.
    const problem = stepProblem(step, CURRICULA, isFolder ? { modules: found.length, written: stepWritten } : null);
    if (problem) problems.push(problem);
    else steps++;
  }

  return {
    modules: written.length,
    planned,
    steps,
    minutes: written.reduce((total, m) => total + m.minutes, 0),
    start: written.length ? path.relative(CONTENT_ROOT, path.join(written[0].dir, 'README.md')).split(path.sep).join('/') : null,
    problems
  };
}
