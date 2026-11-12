// Fails when a coding problem cannot be solved as written. Each problem in content/practice/code is run with the very harness the browser uses
// (webapp/public/runner/harness.py): its model solution must pass every test, and its starting code must run and fail some (or there is nothing to
// solve). That is done twice: with ordinary Python (quick; needs Python 3 on the PATH, PYTHON overrides which), and in Pyodide, the Python the browser
// runs, which is slower and has less stack and fewer modules (so a problem that only works on a desktop Python is found here). `node
// scripts/check/check-code-problems.mjs [slug ...] [--pyodide]` checks just the ones named (with --pyodide, in the browser's Python as well); with none
// named every problem is checked both ways. It is slower than the other checks, so CI runs it as a step of its own (`npm run check:code`).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { CONTENT_ROOT, ROOT } from '../lib/config.mjs';
import { loadPractice } from '../lib/practice.mjs';
import { createPyodideJudge } from '../lib/pyodideJudge.mjs';
import { CODE_RULES, testParts } from '../../webapp/src/lib/practice/validate.js';

const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const JUDGE = path.join(ROOT, 'scripts/lib/judge_problem.py');
const TIMEOUT_MS = 30000;
const SLOW_SECONDS = 1.5; // the browser runs Python a few times slower than this, and gives a run a few seconds
const SLOW_MS_BROWSER = 2500; // what the solution may take in Pyodide: a run is stopped after RUNNER.timeoutMs (6 s), and a phone is slower than this machine
const WORKERS = 6;

/** Runs `code` against `tests` and resolves the harness's result (plus `seconds`), or { crashed } when Python itself failed or hung. */
function judge(code, tests) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ['-I', '-B', JUDGE], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); resolve({ crashed: `no answer in ${TIMEOUT_MS / 1000} s (an infinite loop?)` }); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ crashed: `could not start ${PYTHON}: ${e.message}` }); });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out)); } catch { resolve({ crashed: (err || out || 'no output').trim().split('\n').slice(-3).join(' | ') }); }
    });
    child.stdin.end(JSON.stringify({ code, tests: tests.map(testParts) }));
  });
}

/** What is wrong with one problem, as lines; an empty list is a problem that can be solved and is not already solved. */
async function check(slug, problem) {
  const found = [];
  const at = `code ${slug}`;
  const solved = await judge(problem.solution, problem.tests);
  if (solved.crashed) return [`${at}: the solution crashed Python: ${solved.crashed}`];
  if (solved.loaded) found.push(`${at}: the solution does not load: ${solved.loaded}${solved.line ? ` (line ${solved.line})` : ''}`);
  for (const r of solved.results.filter((x) => !x.ok)) found.push(`${at}: the solution fails "${r.name}": ${r.message}`);
  if (!solved.loaded && solved.results.length < CODE_RULES.minCases) found.push(`${at}: only ${solved.results.length} test(s) have an assert`);
  if (solved.seconds > SLOW_SECONDS) found.push(`${at}: the solution takes ${solved.seconds} s to pass its tests (over ${SLOW_SECONDS}); make the tests smaller`);

  const started = await judge(problem.starter, problem.tests);
  if (started.crashed) found.push(`${at}: the starting code crashed Python: ${started.crashed}`);
  else if (started.loaded) found.push(`${at}: the starting code does not load: ${started.loaded}`);
  else if (started.results.length && started.results.every((r) => r.ok)) found.push(`${at}: the starting code already passes every test; there is nothing to solve`);
  else if (started.seconds > SLOW_SECONDS * 2) found.push(`${at}: the starting code takes ${started.seconds} s; it should fail at once`);
  return found;
}

const { content, problems: loaded } = loadPractice(CONTENT_ROOT);
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const slugs = Object.keys(content.code).filter((s) => !wanted.length || wanted.includes(s));
// Named problems: report only what concerns them (someone else's half-written file is not their problem).
const problems = wanted.length ? loaded.filter((p) => wanted.some((w) => p.startsWith(`code ${w}:`) || p.includes(`/code/${w}.json`))) : loaded;
for (const w of wanted) if (!content.code[w]) problems.push(`code ${w}: there is no such problem`);

let next = 0;
await Promise.all(Array.from({ length: Math.min(WORKERS, slugs.length) }, async () => {
  while (next < slugs.length) {
    const slug = slugs[next++];
    problems.push(...await check(slug, content.code[slug]));
  }
}));

/** The same two checks in Pyodide: the solution passes every test in good time, and the starting code runs and fails without crashing the interpreter. */
async function checkInBrowserPython(judge, slug, problem) {
  const found = [];
  const at = `code ${slug} (in Pyodide)`;
  const solved = await judge.run(problem.solution, problem.tests);
  if (solved.crashed) found.push(`${at}: the solution crashed the interpreter: ${solved.crashed}`);
  else {
    if (solved.loaded) found.push(`${at}: the solution does not load: ${solved.loaded}`);
    for (const r of solved.results.filter((x) => !x.ok)) found.push(`${at}: the solution fails "${r.name}": ${r.message}`);
    if (solved.ms > SLOW_MS_BROWSER) found.push(`${at}: the solution takes ${solved.ms} ms (over ${SLOW_MS_BROWSER}); make the tests smaller`);
  }
  const started = await judge.run(problem.starter, problem.tests);
  if (started.crashed) found.push(`${at}: the starting code crashed the interpreter: ${started.crashed}`);
  else if (started.ms > SLOW_MS_BROWSER * 2) found.push(`${at}: the starting code takes ${started.ms} ms; it should fail at once`);
  return found;
}

if (flags.includes('--pyodide') || !wanted.length) {
  const judge = await createPyodideJudge();
  for (const slug of slugs) problems.push(...await checkInBrowserPython(judge, slug, content.code[slug]));
}

if (problems.length) {
  console.error(`check-code-problems: ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`ok: ${slugs.length} coding problem(s) can be solved as written (the solution passes every test, the starting code fails)`);
