// Whether the table a learner's query returned is the table the problem expects. Pure, so it is tested without a browser, and the same rules judge a
// problem in the page and check its model solution in scripts/check/check-sql-problems.mjs.
import { SQL_MESSAGES, SQL_RUNNER } from '../../config/code.js';

/** A value as it is compared: a number to a fixed number of places (so 0.1 + 0.2 is 0.3), NULL as null, anything else as the text it is. */
function normal(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    const scale = 10 ** SQL_RUNNER.floatPlaces;
    return Math.round(value * scale) / scale + 0; // + 0 turns a -0 into 0
  }
  return String(value);
}

const keyOf = (row) => JSON.stringify(row.map(normal));

/** A value as it is shown in a message: text in quotes, NULL as NULL. */
const shown = (value) => (value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : `'${value}'`);
/** A row as it is shown in a message: (1, 'Ada', NULL). */
export const showRow = (row) => `(${row.map(shown).join(', ')})`;

/**
 * Compares what a query returned (`got`, a QueryResult of lib/practice/sqlRunner.js) with what it should return ({ columns, rows }).
 * Column names must be the same (in the same order, whatever their case) and so must the rows. Without `orderMatters` the rows may come in any order
 * (but each one the same number of times); with it they must come in the same order. Returns { ok, message }; the message says what is wrong, and is empty when nothing is.
 * @param {{ columns?: string[], rows?: any[][], truncated?: boolean, error?: string }} got
 * @param {{ columns: string[], rows: any[][] }} expected
 * @param {{ orderMatters?: boolean }} [options]
 */
export function compareResults(got, expected, { orderMatters = false } = {}) {
  const fail = (message) => ({ ok: false, message });
  if (got.error) return fail(got.error);
  if (got.truncated) return fail(SQL_MESSAGES.tooMany(SQL_RUNNER.maxRows));
  const gotColumns = got.columns || [];
  if (gotColumns.length !== expected.columns.length) return fail(SQL_MESSAGES.columnCount(gotColumns, expected.columns));
  if (gotColumns.some((name, i) => name.toLowerCase() !== expected.columns[i].toLowerCase())) return fail(SQL_MESSAGES.columnNames(gotColumns, expected.columns));
  const rows = got.rows || [];
  if (rows.length !== expected.rows.length) return fail(SQL_MESSAGES.rowCount(rows.length, expected.rows.length));

  if (orderMatters) {
    const at = rows.findIndex((row, i) => keyOf(row) !== keyOf(expected.rows[i]));
    return at === -1 ? { ok: true, message: '' } : fail(SQL_MESSAGES.rowDiffers(at + 1, showRow(rows[at]), showRow(expected.rows[at])));
  }

  // any order: every expected row must be matched by one of the rows returned, each used once
  const unmatched = new Map();
  for (const row of expected.rows) unmatched.set(keyOf(row), (unmatched.get(keyOf(row)) || 0) + 1);
  for (const row of rows) {
    const key = keyOf(row);
    const left = unmatched.get(key) || 0;
    if (!left) return fail(SQL_MESSAGES.extraRow(showRow(row)));
    unmatched.set(key, left - 1);
  }
  const missing = expected.rows.find((row) => unmatched.get(keyOf(row)) > 0);
  return missing ? fail(SQL_MESSAGES.missingRow(showRow(missing))) : { ok: true, message: '' };
}
