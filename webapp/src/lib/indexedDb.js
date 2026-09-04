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

// Same rows, but keeping when each mark was made. Rows written before
// updatedAt was stored have none, so they're simply absent here rather than
// guessed at — "unknown when", not "never".
export async function getAllLocalTimes() {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => {
      const map = {};
      req.result.forEach((r) => { if (r.updatedAt) map[r.path] = r.updatedAt; });
      resolve(map);
    };
    req.onerror = () => resolve({});
  });
}

// updatedAt is a new field on an existing keyPath:'path' store, so this needs
// no version bump or migration — old rows just gain the field next time
// they're written.
export async function setLocalStatus(path, status, updatedAt) {
  const db = await openDb();
  return new Promise((resolve) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const req = status === 'todo'
      ? store.delete(path)
      : store.put({ path, status, updatedAt: updatedAt || new Date().toISOString() });
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
