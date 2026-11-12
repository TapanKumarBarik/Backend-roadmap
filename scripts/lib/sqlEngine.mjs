// Runs SQL problems under Node with the very engine and the very code the browser's worker uses (webapp/public/runner/sql-worker.js): sql.js, which is SQLite
// compiled to WebAssembly, from the folder the site serves, and sql-core.js, which says what a job is. So a problem that is checked here behaves the same
// in a learner's browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ROOT } from './config.mjs';

const RUNNER = path.join(ROOT, 'webapp/public/runner');

/** The folder of the sql.js version the site serves, found the way sql-worker.js names it. */
function sqljsDir() {
  const dirs = fs.readdirSync(RUNNER).filter((d) => /^sqljs-/.test(d)).sort();
  if (!dirs.length) throw new Error('webapp/public/runner has no sqljs-* folder');
  return path.join(RUNNER, dirs.at(-1));
}

/**
 * Starts an engine. `run(job)` does a job of sql-core.js ({ type: 'run', data, setups, query, maxRows } or { type: 'schema', data, sampleRows })
 * and resolves its answer.
 */
export async function createSqlEngine() {
  const dir = sqljsDir();
  const initSqlJs = createRequire(import.meta.url)(path.join(dir, 'sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: (file) => path.join(dir, file) });
  const handle = vm.runInNewContext(`${fs.readFileSync(path.join(RUNNER, 'sql-core.js'), 'utf8')}\nsqlHandle;`, { performance });
  return {
    version: path.basename(dir),
    /** @param {Record<string, any>} job */
    run: (job) => handle(SQL, job)
  };
}
