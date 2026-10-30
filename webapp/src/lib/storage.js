// The only place the app touches localStorage. Storage can be unavailable in ways that THROW rather than
// return null: a browser set to block site data, a private window, a full quota. None of that may break the
// page, so every access is guarded here and callers get a plain "nothing stored" / "could not save".
// Keys live in site.config.json -> storage (re-exported as STORAGE from config/index.js); never write a
// key as a string literal at the call site.

export function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStored(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

// "Caught up" baselines for read/unread badges: the first time a browser asks, the answer is now (and it is
// remembered), so a first visit never opens with "47 new". Without storage it is simply always now.
export function readOrInitTimestamp(key) {
  const existing = readStored(key);
  if (existing) return existing;
  const now = new Date().toISOString();
  writeStored(key, now);
  return now;
}

// JSON values: a missing, unreadable or wrongly-shaped entry yields the fallback.
export function readJson(key, fallback = null) {
  const raw = readStored(key);
  if (raw === null || raw === '') return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function writeJson(key, value) {
  return writeStored(key, JSON.stringify(value));
}
