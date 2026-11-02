// A copy of what an author is writing, kept on their own device until the server has it. If the tab is closed, the browser
// crashes or the connection is gone for good before the last words were saved, the copy is what lets the studio offer them
// back. It is written as they type and removed as soon as a save succeeds, so it exists only while something is unsaved.
//
// `store` is localStorage (or anything with getItem, setItem and removeItem). Every call is safe to make when storage is
// full, blocked or off: the studio then simply has no safety net, and says nothing about it.

const MAX_CHARACTERS = 1_000_000;

/**
 * Keeps the newest unsaved version of a draft. Returns false when it could not be kept.
 * @param {{ setItem(key: string, value: string): void }} store
 * @param {string} key
 * @param {{ title: string, subtitle: string, content: any }} draft
 * @param {Date} [at]
 */
export function keepDraft(store, key, draft, at = new Date()) {
  try {
    const text = JSON.stringify({ at: at.toISOString(), ...draft });
    if (text.length > MAX_CHARACTERS) return false;
    store.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The copy kept for a draft, when it is newer than the version the server holds (so it has something the server lacks), else
 * null. A copy the server has already caught up with is removed.
 * @param {{ getItem(key: string): string | null, removeItem(key: string): void }} store
 * @param {string} key
 * @param {string} serverUpdatedAt  when the server's version was last saved (ISO)
 * @returns {{ at: string, title: string, subtitle: string, content: any } | null}
 */
export function findDraft(store, key, serverUpdatedAt) {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const copy = JSON.parse(raw);
    if (copy && typeof copy.at === 'string' && Date.parse(copy.at) > Date.parse(serverUpdatedAt) && copy.content && typeof copy.content === 'object') return copy;
    store.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

/**
 * Forgets the copy: the server has it, or the author does not want it.
 * @param {{ removeItem(key: string): void }} store
 * @param {string} key
 */
export function dropDraft(store, key) {
  try { store.removeItem(key); } catch { /* nothing to forget */ }
}
