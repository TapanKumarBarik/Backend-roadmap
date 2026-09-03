// Ported from the vanilla openDb/getAllStatuses/setLocalStatus/clearAll.
// Schema unchanged: db 'docs-progress', store 'status', keyPath 'path',
// rows {path, status}; 'todo' is never stored (row absence = todo).
const DB_NAME = 'docs-progress';
const STORE = 'status';

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'path' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function getAllLocalStatuses() {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => {
      const map = {};
      req.result.forEach((r) => { map[r.path] = r.status; });
      resolve(map);
    };
    req.onerror = () => resolve({});
  });
}

export async function setLocalStatus(path, status) {
  const db = await openDb();
  return new Promise((resolve) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const req = status === 'todo' ? store.delete(path) : store.put({ path, status });
    req.onsuccess = resolve;
    req.onerror = resolve;
  });
}

export async function clearAllLocal() {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    req.onsuccess = resolve;
    req.onerror = resolve;
  });
}
