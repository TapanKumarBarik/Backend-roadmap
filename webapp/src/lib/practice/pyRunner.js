// Runs a learner's Python against a problem's tests, in the browser. The work is done by a web worker that holds Pyodide (public/runner/py-worker.js),
// so nothing a learner writes can touch the page or freeze it, and nothing they write leaves their machine. One worker is shared by every coding screen
// (lib/practice/workerClient.js): it is started when the first one opens (so Python is ready by the time the statement has been read), and ended a minute
// after the last one closes.
//
// A run that takes longer than RUNNER.timeoutMs is stopped by ending the worker, which is the only way to stop Python that never returns; a fresh
// worker is started at once for the next run.
import { RUN, RUNNER } from '../../config/code.js';
import { RunnerError, createWorkerClient, isSupported } from './workerClient.js';

export { RunnerError, isSupported };

const client = createWorkerClient({ url: RUNNER.worker, module: true, idleStopMs: RUNNER.idleStopMs });

/** Starts the worker if there is none. Resolves when Python can run; rejects with a RunnerError('broken') when it cannot load. */
export const warm = client.warm;

/** A coding screen opened: keep the worker, and start it. Returns a function for when the screen closes. */
export const acquire = client.acquire;

/**
 * Runs `code` and then each of `tests` ({ name, code }) in one namespace. Resolves the harness's answer:
 * { loaded, line, stdout, results: [{ name, ok, message }], ms } (public/runner/harness.py; `ms` is how long it took). `onProgress({ index, name })` says which test is running.
 * Rejects with a RunnerError.
 * @param {{ code: string, tests: { name: string | null, code: string }[], onProgress?: (p: { index: number, name: string }) => void, timeoutMs?: number }} job
 * @returns {Promise<{ loaded: string | null, line: number | null, stdout: string, results: { name: string, ok: boolean, message: string }[], ms: number }>}
 */
export function runTests({ code, tests, onProgress, timeoutMs = RUNNER.timeoutMs }) {
  return client.call({ type: 'run', code, codes: tests.map((t) => t.code), names: tests.map((t) => t.name) }, { onProgress, timeoutMs });
}

/**
 * Runs a piece of code from a lesson on its own: { stdout, error, line } (public/runner/harness.py run_snippet; `error` is null when it ran to the end).
 * The worker is kept for the run and, as for a coding screen, ended a minute after the last one. Rejects with a RunnerError.
 * @param {{ code: string, timeoutMs?: number }} job
 * @returns {Promise<{ stdout: string, error: string | null, line: number | null }>}
 */
export async function runSnippet({ code, timeoutMs = RUN.timeoutMs }) {
  const release = client.acquire();
  try {
    return await client.call({ type: 'snippet', code }, { timeoutMs });
  } finally {
    release();
  }
}
