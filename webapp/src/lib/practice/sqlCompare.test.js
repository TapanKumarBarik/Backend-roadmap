import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareResults, showRow } from './sqlCompare.js';
import { SQL_RUNNER } from '../../config/code.js';

const table = (columns, rows) => ({ columns, rows, truncated: false });
const expected = { columns: ['name', 'total'], rows: [['Ada', 30], ['Grace', 20.5], ['Linus', null]] };

test('the same table passes, whatever the case of the column names', () => {
  assert.deepEqual(compareResults(table(['name', 'total'], expected.rows), expected), { ok: true, message: '' });
  assert.equal(compareResults(table(['NAME', 'Total'], expected.rows), expected).ok, true);
});

test('rows may come in any order unless the order matters', () => {
  const shuffled = [expected.rows[2], expected.rows[0], expected.rows[1]];
  assert.equal(compareResults(table(['name', 'total'], shuffled), expected).ok, true);
  const strict = compareResults(table(['name', 'total'], shuffled), expected, { orderMatters: true });
  assert.equal(strict.ok, false);
  assert.equal(strict.message, "Row 1 is ('Linus', NULL), but it should be ('Ada', 30).");
});

test('numbers are compared to a few places, so floating point noise does not fail a query', () => {
  assert.equal(compareResults(table(['a'], [[0.1 + 0.2]]), { columns: ['a'], rows: [[0.3]] }).ok, true);
  assert.equal(compareResults(table(['a'], [[1]]), { columns: ['a'], rows: [[1.0000000001]] }).ok, true);
  assert.equal(compareResults(table(['a'], [[1]]), { columns: ['a'], rows: [[1.001]] }).ok, false);
  assert.equal(compareResults(table(['a'], [[-0]]), { columns: ['a'], rows: [[0]] }).ok, true, 'minus zero is zero');
});

test('NULL is not the same as 0, an empty string or the word NULL', () => {
  for (const other of [0, '', 'NULL']) assert.equal(compareResults(table(['a'], [[other]]), { columns: ['a'], rows: [[null]] }).ok, false, String(other));
  assert.equal(compareResults(table(['a'], [[null]]), { columns: ['a'], rows: [[null]] }).ok, true);
});

test('a wrong table says what is wrong with it: the columns, the number of rows, then the rows', () => {
  assert.equal(compareResults(table(['name'], []), expected).message, 'Your query returns 1 column (name); it should return 2 (name, total).');
  assert.equal(compareResults(table(['name', 'sum'], expected.rows), expected).message, 'The columns should be named name, total, in that order. Yours are name, sum.');
  assert.equal(compareResults(table(['name', 'total'], expected.rows.slice(0, 2)), expected).message, 'Your query returned 2 rows; it should return 3.');
  assert.equal(compareResults(table(['name', 'total'], [['Ada', 30]]), { columns: ['name', 'total'], rows: [['Ada', 30], ['Bo', 1]] }).message, 'Your query returned 1 row; it should return 2.');
  const changed = [['Ada', 30], ['Grace', 21], ['Linus', null]];
  assert.equal(compareResults(table(['name', 'total'], changed), expected).message, "This row should not be in the result: ('Grace', 21).");
});

test('without an order, a repeated row counts as many times as it should', () => {
  const twice = { columns: ['a'], rows: [[1], [1], [2]] };
  assert.equal(compareResults(table(['a'], [[1], [2], [2]]), twice).ok, false);
  assert.equal(compareResults(table(['a'], [[1], [2], [2]]), twice).message, 'This row should not be in the result: (2).');
  assert.equal(compareResults(table(['a'], [[2], [1], [1]]), twice).ok, true);
});

test('an error, or a result cut short, fails with its own message', () => {
  assert.deepEqual(compareResults({ error: 'near "FORM": syntax error' }, expected), { ok: false, message: 'near "FORM": syntax error' });
  const cut = compareResults({ columns: ['a'], rows: [], truncated: true }, { columns: ['a'], rows: [] });
  assert.equal(cut.ok, false);
  assert.match(cut.message, new RegExp(`more than ${SQL_RUNNER.maxRows} rows`));
});

test('a row is shown as a person would write it', () => {
  assert.equal(showRow([1, 'Ada', null, 2.5]), "(1, 'Ada', NULL, 2.5)");
});
