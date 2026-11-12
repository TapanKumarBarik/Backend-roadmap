// The SQL runner of the practice screens. It lives in a worker of its own, so nothing a learner writes can touch the page or stop it responding, and it is a
// plain file served from this site (never from another): SQLite compiled to WebAssembly (sql.js, MIT, in the versioned folder beside it, see README.txt),
// and sql-core.js, which says what a job is (and is what the checks of the problems run too). Every run builds a fresh in-memory database from the
// problem's data, so a query that changes or drops a table changes nothing for the next run, and nothing a learner writes leaves their machine.
// A run that takes too long is stopped by the page ending the worker (lib/practice/sqlRunner.js), not from in here.
importScripts('./sqljs-1.15.2/sql-wasm.js', './sql-core.js');

const SQLJS_DIR = new URL('./sqljs-1.15.2/', self.location.href).href;
let SQL = null;
const ready = initSqlJs({ locateFile: (file) => SQLJS_DIR + file }).then((module) => {
  SQL = module;
  self.postMessage({ type: 'ready' });
}).catch((error) => {
  self.postMessage({ type: 'broken', message: String((error && error.message) || error) });
  throw error;
});

self.onmessage = async ({ data }) => {
  if (data.type !== 'run' && data.type !== 'schema') return;
  try {
    await ready;
    self.postMessage({ type: 'result', id: data.id, result: sqlHandle(SQL, data) });
  } catch (error) {
    self.postMessage({ type: 'failed', id: data.id, message: String((error && error.message) || error) });
  }
};
