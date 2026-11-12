// Runs a learner's Python against a problem's tests, in the browser. The work is done by a web worker that holds Pyodide (public/runner/py-worker.js),
// so nothing a learner writes can touch the page or freeze it, and nothing they write leaves their machine. One worker is shared by every coding screen:
// it is started when the first one opens (so Python is ready by the time the statement has been read), and ended a minute after the last one closes.
//
// A run that takes longer than RUNNER.timeoutMs is stopped by ending the worker, which is the only way to stop Python that never returns; a fresh
// worker is started at once for the next run.
import { RUN, RUNNER } from '../../config/code.js';

/** Why a run did not produce results: 'unsupported' (no WebAssembly or workers), 'broken' (the runner would not load), 'timeout', 'stack' (Python ran out of stack), or 'failed' (the harness crashed). */
export class RunnerError extends Error {
  /** @param {'unsupported' | 'broken' | 'timeout' | 'stack' | 'failed'} kind  @param {string} [detail]  what was running (timeout) or the underlying message */
  constructor(kind, detail = '') {
    super(detail || kind);
    this.kind = kind;
    this.detail = detail;
  }
}

/** @type {Worker | null} */
let worker = null;
/** @type {Promise<void> | null} */
let ready = null;
let nextRun = 1;
/** @type {ReturnType<typeof setTimeout> | null} */
let idleTimer = null;
let users = 0;

export const isSupported = () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';

function stop() {
  if (worker) worker.terminate();
  worker = null;
  ready = null;
}

/** Starts the worker if there is none. Resolves when Python can run; rejects with a RunnerError('broken') when it cannot load. */
export function warm() {
  if (!isSupported()) return Promise.reject(new RunnerError('unsupported'));
  if (ready) return ready;
  const mine = new Worker(RUNNER.worker, { type: 'module' });
  worker = mine;
  ready = new Promise((resolve, reject) => {
    const fail = (message) => {
      if (worker === mine) stop();
      else mine.terminate();
      reject(new RunnerError('broken', message));
    };
    mine.addEventListener('message', function onMessage({ data }) {
      if (data.type === 'ready') { mine.removeEventListener('message', onMessage); resolve(); }
      else if (data.type === 'broken') { mine.removeEventListener('message', onMessage); fail(data.message); }
    });
    mine.addEventListener('error', (event) => fail(event.message || 'the worker failed'));
  });
  ready.catch(() => {}); // a caller that only warms up has nothing to do with the failure; run() reports it
  return ready;
}

/** A coding screen opened: keep the worker, and start it. Returns a function for when the screen closes. */
export function acquire() {
  users += 1;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  warm().catch(() => {});
  return () => {
    users = Math.max(0, users - 1);
    if (users === 0 && !idleTimer) idleTimer = setTimeout(() => { idleTimer = null; if (users === 0) stop(); }, RUNNER.idleStopMs);
  };
}

/**
 * Runs `code` and then each of `tests` ({ name, code }) in one namespace. Resolves the harness's answer:
 * { loaded, line, stdout, results: [{ name, ok, message }], ms } (public/runner/harness.py; `ms` is how long it took). `onProgress({ index, name })` says which test is running.
 * Rejects with a RunnerError.
 * @param {{ code: string, tests: { name: string | null, code: string }[], onProgress?: (p: { index: number, name: string }) => void, timeoutMs?: number }} job
 * @returns {Promise<{ loaded: string | null, line: number | null, stdout: string, results: { name: string, ok: boolean, message: string }[], ms: number }>}
 */
export function runTests({ code, tests, onProgress, timeoutMs = RUNNER.timeoutMs }) {
  return call({ type: 'run', code, codes: tests.map((t) => t.code), names: tests.map((t) => t.name) }, { onProgress, timeoutMs });
}

/**
 * Runs a piece of code from a lesson on its own: { stdout, error, line } (public/runner/harness.py run_snippet; `error` is null when it ran to the end).
 * The worker is kept for the run and, as for a coding screen, ended a minute after the last one. Rejects with a RunnerError.
 * @param {{ code: string, timeoutMs?: number }} job
 * @returns {Promise<{ stdout: string, error: string | null, line: number | null }>}
 */
export async function runSnippet({ code, timeoutMs = RUN.timeoutMs }) {
  const release = acquire();
  try {
    return await call({ type: 'snippet', code }, { timeoutMs });
  } finally {
    release();
  }
}

/**
 * Sends one job to the worker and resolves its answer; ends the worker if it takes longer than `timeoutMs`.
 * @param {Record<string, any>} message
 * @param {{ onProgress?: (p: { index: number, name: string }) => void, timeoutMs: number }} options
 */
async function call(message, { onProgress, timeoutMs }) {
  await warm();
  const running = worker;
  if (!running) throw new RunnerError('broken');
  const id = nextRun++;
  return new Promise((resolve, reject) => {
    let last = '';
    const done = () => { clearTimeout(timer); running.removeEventListener('message', onMessage); };
    const timer = setTimeout(() => {
      done();
      stop();
      warm().catch(() => {}); // the next run should not have to wait for a cold start
      reject(new RunnerError('timeout', last));
    }, timeoutMs);
    function onMessage({ data }) {
      if (data.id !== id) return;
      if (data.type === 'progress') { last = data.name; if (onProgress) onProgress({ index: data.index, name: data.name }); return; }
      done();
      if (data.type === 'result') { resolve(data.result); return; }
      if (data.fatal) { stop(); warm().catch(() => {}); } // a worker whose Python died is of no use again
      reject(new RunnerError(data.fatal ? 'stack' : 'failed', data.message));
    }
    running.addEventListener('message', onMessage);
    running.postMessage({ ...message, id });
  });
}
