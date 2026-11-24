// Tests must be able to FAIL. For a coding problem, break the model solution on purpose in the ways a learner gets it wrong, and require that at least
// one test notices. A mutant that still passes every test means the tests do not guard that rule (docs/PRACTICE.md, "LLD problems").
//
//   node scripts/dev/problem-mutants.mjs [slug ...]      (or: npm run problems:mutants -- lld-tic-tac-toe)
//
// The mutants live in scripts/dev/problem-mutants/*.mjs. Each file exports default { slug: [ [name, oldText, newText], ... ] }: oldText must occur in the
// solution EXACTLY ONCE (so a mutant is a precise edit, not a guess) and newText is what replaces it. Run with the very judge the checker and the browser
// use (scripts/lib/judge_problem.py + webapp/public/runner/harness.py). Exit code 1 when a mutant is not caught or a mutant text does not match.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTENT_ROOT, ROOT } from '../lib/config.mjs';
import { testParts } from '../../webapp/src/lib/practice/validate.js';

const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const JUDGE = path.join(ROOT, 'scripts/lib/judge_problem.py');
const MUTANTS = path.join(ROOT, 'scripts/dev/problem-mutants');
const TIMEOUT_MS = 30000; // a mutant that is too slow is caught too: it never answers

/**
 * Runs `code` against `tests` with the harness and resolves its result, or { crashed } when Python itself failed or hung.
 * @param {string} code
 * @param {any[]} tests
 * @returns {Promise<any>}
 */
function judge(code, tests) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ['-I', '-B', JUDGE], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); resolve({ crashed: `no answer in ${TIMEOUT_MS / 1000} s (too slow, or an infinite loop)` }); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ crashed: `could not start ${PYTHON}: ${e.message}` }); });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out)); } catch { resolve({ crashed: (err || out || 'no output').trim().split('\n').slice(-2).join(' | ') }); }
    });
    child.stdin.end(JSON.stringify({ code, tests: tests.map(testParts) }));
  });
}

const only = process.argv.slice(2);
/** @type {Record<string, [string, string, string][]>} */
const all = {};
for (const file of fs.readdirSync(MUTANTS).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(pathToFileURL(path.join(MUTANTS, file)).href)).default);
}

let total = 0;
let escaped = 0;
for (const [slug, list] of Object.entries(all)) {
  if (only.length && !only.includes(slug)) continue;
  const file = path.join(CONTENT_ROOT, 'practice/code', `${slug}.json`);
  if (!fs.existsSync(file)) { console.log(`MISSING     ${slug}: there is no such problem`); escaped++; continue; }
  const problem = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [name, from, to] of list) {
    total++;
    const count = problem.solution.split(from).length - 1;
    if (count !== 1) { console.log(`BAD MUTANT  ${slug}: "${name}": the text to replace occurs ${count} times (it must occur exactly once)`); escaped++; continue; }
    const result = await judge(problem.solution.replace(from, () => to), problem.tests);
    const failing = result.results ? result.results.filter((/** @type {any} */ x) => !x.ok)[0] : null;
    const caught = result.crashed ? `crashed (${result.crashed})` : result.loaded ? `does not load (${result.loaded})` : failing && failing.name;
    if (caught) console.log(`caught      ${slug}: ${name}  <- ${String(caught).slice(0, 70)}`);
    else { escaped++; console.log(`ESCAPED     ${slug}: ${name}  (every test still passes)`); }
  }
}
console.log(`\n${total - escaped} of ${total} mutants caught${escaped ? `, ${escaped} not caught or not matching` : ''}`);
process.exit(escaped ? 1 : 0);
