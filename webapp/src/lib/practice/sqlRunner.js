// Runs a learner's SQL in the browser. SQLite (sql.js, compiled to WebAssembly) lives in a worker of its own (public/runner/sql-worker.js), so nothing a learner
// writes can touch the page or freeze it, and nothing they write leaves their machine. Like the Python runner it is shared by every coding screen
// (lib/practice/workerClient.js), and a query that takes longer than SQL_RUNNER.timeoutMs is stopped by ending the worker.
import { SQL_RUNNER } from '../../config/code.js';
import { RunnerError, createWorkerClient, isSupported } from './workerClient.js';

export { RunnerError, isSupported };

const client = createWorkerClient({ url: SQL_RUNNER.worker, idleStopMs: SQL_RUNNER.idleStopMs });

/** Starts the worker if there is none. Resolves when SQL can run; rejects with a RunnerError('broken') when it cannot load. */
export const warm = client.warm;

/** A coding screen opened: keep the worker, and start it. Returns a function for when the screen closes. */
export const acquire = client.acquire;

/** @typedef {{ columns?: string[], rows?: any[][], truncated?: boolean, error?: string }} QueryResult  one run of a query: its table ({ columns, rows, truncated }), or { error } when the SQL is wrong or gives no table */

/**
 * Runs `query` once on each of `setups`: every run is a fresh database holding `data` (SQL that creates and fills the tables) with the statements of that
 * setup applied after it ([] is the data as it is). Resolves { runs: QueryResult[], ms }. Rejects with a RunnerError.
 * @param {{ data: string, setups: string[][], query: string, timeoutMs?: number }} job
 * @returns {Promise<{ runs: QueryResult[], ms: number }>}
 */
export function runSql({ data, setups, query, timeoutMs = SQL_RUNNER.timeoutMs }) {
  return client.call({ type: 'run', data, setups, query, maxRows: SQL_RUNNER.maxRows }, { timeoutMs });
}

/**
 * The tables of a problem's data: [{ name, columns: [{ name, type, primary }], rows, sample }], for the panel beside the statement.
 * @param {string} data
 * @returns {Promise<{ tables: { name: string, columns: { name: string, type: string, primary: boolean }[], rows: number, sample: any[][] }[] }>}
 */
export function loadSchema(data) {
  return client.call({ type: 'schema', data, sampleRows: SQL_RUNNER.sampleRows }, { timeoutMs: SQL_RUNNER.timeoutMs });
}
