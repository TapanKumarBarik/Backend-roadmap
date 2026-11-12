// The Python runner of the practice screens. It lives in a worker of its own, so nothing a learner writes can touch the page or stop it responding, and
// it is a plain file served from this site (never from another): Pyodide, which is CPython compiled to WebAssembly, is in the versioned folder beside it
// (MPL-2.0, see README.txt), and the rules for judging a solution are in harness.py. It starts loading when it is created and says "ready" when it can
// run; a run that is taking too long is stopped by the page ending the worker (lib/practice/pyRunner.js), not from in here.
import { loadPyodide } from './pyodide-314.0.7/pyodide.mjs';

const PYODIDE_DIR = new URL('./pyodide-314.0.7/', import.meta.url).href;
let runAll = null;
let toPy = null;
let dead = false; // Pyodide hit a fatal error (the stack ran out): it cannot run anything more, and the page starts a fresh worker

const ready = (async () => {
  const [pyodide, harness] = await Promise.all([
    loadPyodide({ indexURL: PYODIDE_DIR }),
    fetch(new URL('./harness.py', import.meta.url)).then((res) => {
      if (!res.ok) throw new Error(`harness.py: ${res.status}`);
      return res.text();
    })
  ]);
  pyodide.runPython(harness);
  runAll = pyodide.globals.get('run_all');
  toPy = (value) => pyodide.toPy(value);
  self.postMessage({ type: 'ready' });
})().catch((error) => {
  self.postMessage({ type: 'broken', message: String((error && error.message) || error) });
  throw error;
});

self.onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  if (dead) { self.postMessage({ type: 'failed', id: data.id, fatal: true, message: 'Python stopped after a fatal error' }); return; }
  try {
    await ready;
    const codes = toPy(data.codes);
    const names = toPy(data.names);
    // before each test the harness says which one it is on, so a run that never comes back can say where it was
    const progress = (index, name) => self.postMessage({ type: 'progress', id: data.id, index, name });
    const started = performance.now();
    const out = runAll(data.code, codes, names, progress);
    const result = out.toJs({ dict_converter: Object.fromEntries });
    result.ms = Math.round(performance.now() - started); // how long the learner's code and the tests took
    result.loaded = result.loaded ?? null; // Python's None arrives as undefined
    result.line = result.line ?? null;
    out.destroy();
    codes.destroy();
    names.destroy();
    self.postMessage({ type: 'result', id: data.id, result });
  } catch (error) {
    // A fatal error is what the interpreter reports when the stack ran out, which a very deep recursion, or a very long chain of linked objects
    // being freed at once, can do in WebAssembly even when Python's own recursion limit was not reached.
    const fatal = !!(error && error.pyodide_fatal_error) || /call stack/i.test(String(error && error.message));
    if (fatal) dead = true;
    self.postMessage({ type: 'failed', id: data.id, fatal, message: String((error && error.message) || error) });
  }
};
