// Keeping the Prep Tracker's progress on the reader's account (api/routes/state.js), from the page. It does the talking: ask who is signed in, read the copy on the
// account, merge it with the browser's (lib/tracker/sync.js), give the merged copy back to the page, and write it when it is not what the account already has.
// A write quotes the stamp it is based on, and when another device saved first the answer carries what is there now, so the page merges again and tries once more.
// Everything the page owns (what the copy is, where it is stored, what the clock says, how the screen shows it) is passed in, so this is tested apart from the
// page (syncClient.test.js) with a fake server.
import { SYNC } from '../../config/sync.js';
import { isEmptyState, mergeStates, sameState } from './sync.js';

/** What a status says: `off` (signed in, not syncing), `signedOut`, `syncing`, `synced`, `error`, or `tooLarge` (the copy is more than the server keeps). */
export const STATUS = { off: 'off', signedOut: 'signedOut', syncing: 'syncing', synced: 'synced', error: 'error', tooLarge: 'tooLarge' };

const ATTEMPTS = 4; // reads and writes in one go: the first, and a few more when other devices keep saving in between

/**
 * @param {object} options
 * @param {string} options.name            what is kept (a name in config/sync.js)
 * @param {() => { records: Map<string, any>, removed: Map<string, number> }} options.getState   this browser's copy
 * @param {(state: { records: Map<string, any>, removed: Map<string, number> }) => void} options.setState   take the merged copy as this browser's
 * @param {(data: any) => { records: Map<string, any>, removed: Map<string, number> }} options.parse   the copy on the account, as a copy of this browser's kind
 * @param {(state: { records: Map<string, any>, removed: Map<string, number> }) => any} options.stateData   a copy as the object that is sent
 * @param {() => number} options.now        the second it is
 * @param {() => boolean} options.isEnabled   whether this browser syncs
 * @param {(on: boolean) => void} options.setEnabled
 * @param {(status: string, at: number | null) => void} options.onStatus
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(fn: () => void, ms: number) => any} [options.setTimer]
 * @param {(id: any) => void} [options.clearTimer]
 */
export function createSync({ name, getState, setState, parse, stateData, now, isEnabled, setEnabled, onStatus, fetchImpl = (url, init) => fetch(url, init), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const url = `/api/state/${name}`;
  let signedIn = false;
  let status = STATUS.off;
  let lastAt = null;
  let running = null;
  let again = false;
  let timer = 0;

  const show = (next) => { status = next; onStatus(next, lastAt); };
  const json = (path, init) => fetchImpl(path, { credentials: 'same-origin', ...init });

  /** Who is signed in: true when someone is. */
  async function check() {
    try {
      const res = await json('/api/auth/me');
      const data = res.ok ? await res.json() : null;
      signedIn = !!(data && data.user);
    } catch { signedIn = false; }
    if (!signedIn) { show(STATUS.signedOut); return false; }
    if (!isEnabled()) { show(STATUS.off); return true; }
    await sync();
    return true;
  }

  /** Reads the copy on the account, merges, gives the page the merged copy and writes it when it differs from the account's. False when nobody is signed in or it cannot be kept. */
  async function once() {
    const res = await json(url);
    if (res.status === 401) { signedIn = false; show(STATUS.signedOut); return false; }
    if (!res.ok) throw new Error(`read ${res.status}`);
    let remote = await res.json();
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const remoteState = remote.data ? parse(remote.data) : { records: new Map(), removed: new Map() };
      const local = getState();
      const merged = mergeStates(local, remoteState, now(), SYNC.keepRemovedDays);
      if (!sameState(merged, local)) setState(merged);
      if (sameState(merged, remoteState) || (!remote.data && isEmptyState(merged))) { lastAt = now(); return true; }
      const put = await json(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: stateData(merged), base: remote.updatedAt }) });
      if (put.ok) { lastAt = now(); return true; }
      if (put.status === 409) { remote = await put.json(); continue; } // someone saved first: merge with what is there now
      if (put.status === 401) { signedIn = false; show(STATUS.signedOut); return false; }
      if (put.status === 413) { show(STATUS.tooLarge); return false; }
      throw new Error(`write ${put.status}`);
    }
    throw new Error('other devices kept saving');
  }

  /** One go at a time: a call while one is running makes it go round once more when it is done. */
  function sync() {
    if (running) { again = true; return running; }
    show(STATUS.syncing);
    running = (async () => {
      try {
        const ok = await once();
        if (ok) show(STATUS.synced);
      } catch { show(STATUS.error); } finally {
        running = null;
        if (again) { again = false; if (isEnabled() && signedIn) sync(); }
      }
    })();
    return running;
  }

  return {
    check,
    sync,
    /** Starts syncing in this browser: the first read merges whatever the account already has. */
    async enable() { setEnabled(true); await sync(); },
    /** Stops, and deletes the copy on the account (the browser's own stays). */
    async disable() {
      clearTimer(timer);
      try {
        const res = await json(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 401) throw new Error(String(res.status));
        setEnabled(false);
        show(STATUS.off);
        return true;
      } catch { show(STATUS.error); return false; }
    },
    /** The page changed something: send it after a short pause (a note typed is one save, not one for each key). */
    changed() {
      if (!signedIn || !isEnabled()) return;
      clearTimer(timer);
      timer = setTimer(() => sync(), SYNC.pushAfterMs);
    },
    get status() { return status; },
    get signedIn() { return signedIn; },
    get lastAt() { return lastAt; }
  };
}
