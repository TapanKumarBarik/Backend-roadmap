// Runs coding problems in Pyodide itself, under Node, the way the browser's worker does (webapp/public/runner/py-worker.js): the same Python
// (CPython compiled to WebAssembly) and the very same harness. The ordinary-Python check (scripts/lib/judge_problem.py) is quick and is what an author
// iterates with; this one catches what only the browser's Python does: a module that is not there (threads, sockets), a stack that is smaller, a
// deep structure that cannot be freed, and a slower interpreter. One interpreter is kept for all the problems, and a fresh one is started when a
// problem kills it.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './config.mjs';
import { testParts } from '../../webapp/src/lib/practice/validate.js';

const RUNNER = path.join(ROOT, 'webapp/public/runner');

/** The folder of the Pyodide version the site serves, found the way py-worker.js names it. */
function pyodideDir() {
  const dirs = fs.readdirSync(RUNNER).filter((d) => /^pyodide-/.test(d)).sort();
  if (!dirs.length) throw new Error('webapp/public/runner has no pyodide-* folder');
  return path.join(RUNNER, dirs.at(-1));
}

/**
 * Starts a judge. `run(code, tests)` resolves what the harness answers ({ loaded, line, stdout, results }) plus `ms`, or { crashed } when the
 * interpreter died; `close()` is not needed (the process ends), it is there for tidiness.
 */
export async function createPyodideJudge() {
  const dir = pyodideDir();
  const { loadPyodide } = await import(pathToFileURL(path.join(dir, 'pyodide.mjs')).href);
  const harness = fs.readFileSync(path.join(RUNNER, 'harness.py'), 'utf8');
  let pyodide = null;
  let runAll = null;

  async function boot() {
    pyodide = await loadPyodide({ indexURL: `${dir}${path.sep}`, stdout: () => {}, stderr: () => {} });
    pyodide.runPython(harness);
    runAll = pyodide.globals.get('run_all');
  }
  await boot();

  return {
    version: path.basename(dir),
    async run(code, tests) {
      const parts = tests.map(testParts);
      const started = performance.now();
      try {
        const codes = pyodide.toPy(parts.map((t) => t.code));
        const names = pyodide.toPy(parts.map((t) => t.name));
        const out = runAll(code, codes, names);
        const result = out.toJs({ dict_converter: Object.fromEntries });
        out.destroy();
        codes.destroy();
        names.destroy();
        return { ...result, loaded: result.loaded ?? null, line: result.line ?? null, ms: Math.round(performance.now() - started) };
      } catch (error) {
        // a fatal error (the stack ran out) leaves the interpreter unusable: start another for the next problem
        const message = String((error && error.message) || error).split('\n')[0];
        await boot();
        return { crashed: message };
      }
    }
  };
}
