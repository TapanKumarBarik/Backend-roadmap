// Judges a learner's SQL against a problem: the query runs once on the problem's data as it is, and once on each of the problem's variants of it (the same
// tables with rows changed: a NULL where there was none, a tie, a group with nothing in it), and each result is compared with the one expected.
// It answers in the shape of the Python harness's (lib/practice/pyRunner.js), so the coding screen shows both the same way, plus `table`, the result on the data as it is.
import { SQL } from '../../config/code.js';
import { compareResults } from './sqlCompare.js';
import { runSql } from './sqlRunner.js';

/**
 * @param {{ problem: { data: string, variants?: string[][], expected: { columns: string[], rows: any[][] }[], orderMatters?: boolean }, query: string, run?: typeof runSql }} job
 * @returns {Promise<{ loaded: string | null, line: null, stdout: string, results: { name: string, ok: boolean, message: string }[], ms: number, table: any }>}
 */
export async function judgeSql({ problem, query, run = runSql }) {
  const setups = [[], ...(problem.variants || [])];
  const { runs, ms } = await run({ data: problem.data, setups, query });
  const base = runs[0];
  // SQL that is wrong on the data as it is has nothing to compare: its error is the answer (the screen shows it as the program that did not load)
  if (base.error) return { loaded: base.error, line: null, stdout: '', results: [], ms, table: null };
  const results = runs.map((got, i) => {
    const verdict = compareResults(got, problem.expected[i], { orderMatters: !!problem.orderMatters });
    const message = !verdict.ok && i > 0 && !got.error ? `${verdict.message} ${SQL.otherData}` : verdict.message;
    return { name: i === 0 ? SQL.onExample : SQL.onOther(i), ok: verdict.ok, message };
  });
  return { loaded: null, line: null, stdout: '', results, ms, table: base };
}
