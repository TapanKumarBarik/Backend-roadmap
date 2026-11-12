// What runs a coding problem: a Python problem runs its tests in Pyodide (lib/practice/pyRunner.js), a SQL one runs the learner's query on SQLite
// (lib/practice/sqlJudge.js). Each engine starts its runner while the screen is open, and answers a run in the shape of the Python harness's, so one
// screen shows both: { loaded, line, stdout, results: [{ name, ok, message }], ms } (and, for SQL, `table`, the result on the example data).
import { acquire as acquirePython, runTests, warm as warmPython } from './pyRunner.js';
import { acquire as acquireSql, warm as warmSql } from './sqlRunner.js';
import { judgeSql } from './sqlJudge.js';
import { testParts } from './validate.js';

/** @typedef {{ acquire: () => () => void, warm: () => Promise<void>, run: (job: { problem: any, code: string, onProgress?: (p: { index: number, name: string }) => void }) => Promise<any> }} Engine */

/** @type {Engine} */
export const PYTHON = { acquire: acquirePython, warm: warmPython, run: ({ problem, code, onProgress }) => runTests({ code, tests: problem.tests.map(testParts), onProgress }) };

/** @type {Engine} */
export const SQL_ENGINE = { acquire: acquireSql, warm: warmSql, run: ({ problem, code }) => judgeSql({ problem, query: code }) };

/** The engine that runs `problem` (Python unless the problem says it is SQL). */
export const engineOf = (problem) => (problem && problem.language === 'sql' ? SQL_ENGINE : PYTHON);
