import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeSql } from './sqlJudge.js';
import { SQL } from '../../config/code.js';

const problem = {
  data: 'CREATE TABLE t (a);',
  variants: [['DELETE FROM t']],
  expected: [{ columns: ['a'], rows: [[1], [2]] }, { columns: ['a'], rows: [] }],
  orderMatters: false
};

/** A fake runner that answers `runs` and remembers the job it was given. */
function answering(runs) {
  const run = async (job) => { run.seen = job; return { runs, ms: 7 }; };
  return run;
}

test('the query runs on the data as it is, and once more for each variant of it', async () => {
  const run = answering([{ columns: ['a'], rows: [[2], [1]], truncated: false }, { columns: ['a'], rows: [], truncated: false }]);
  const result = await judgeSql({ problem, query: 'SELECT a FROM t', run });
  assert.deepEqual(run.seen, { data: 'CREATE TABLE t (a);', setups: [[], ['DELETE FROM t']], query: 'SELECT a FROM t' });
  assert.deepEqual(result.results, [{ name: SQL.onExample, ok: true, message: '' }, { name: SQL.onOther(1), ok: true, message: '' }]);
  assert.equal(result.loaded, null);
  assert.deepEqual(result.table, { columns: ['a'], rows: [[2], [1]], truncated: false });
  assert.equal(result.ms, 7);
});

test('a query that is right on the example data but not on other data says so', async () => {
  const run = answering([{ columns: ['a'], rows: [[1], [2]], truncated: false }, { columns: ['a'], rows: [[0]], truncated: false }]);
  const { results } = await judgeSql({ problem, query: 'SELECT 1', run });
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].message, /^Your query returned 1 row; it should return 0\. It works on the example data but not on this other data/);
});

test('SQL that is wrong on the example data has nothing to compare: its error is the answer', async () => {
  const run = answering([{ error: 'no such table: users' }, { error: 'no such table: users' }]);
  const result = await judgeSql({ problem, query: 'SELECT * FROM users', run });
  assert.deepEqual(result, { loaded: 'no such table: users', line: null, stdout: '', results: [], ms: 7, table: null });
});

test('an error only on the other data is a failed check with the error as its message', async () => {
  const run = answering([{ columns: ['a'], rows: [[1], [2]], truncated: false }, { error: 'division by zero' }]);
  const { results } = await judgeSql({ problem, query: 'SELECT 1', run });
  assert.deepEqual(results[1], { name: SQL.onOther(1), ok: false, message: 'division by zero' });
});

test('a problem with no variants is checked on its data alone, and its order can matter', async () => {
  const run = answering([{ columns: ['a'], rows: [[2], [1]], truncated: false }]);
  const { results } = await judgeSql({ problem: { ...problem, variants: undefined, orderMatters: true, expected: [problem.expected[0]] }, query: 'SELECT 1', run });
  assert.equal(run.seen.setups.length, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.match(results[0].message, /^Row 1 is \(2\), but it should be \(1\)\./);
});
