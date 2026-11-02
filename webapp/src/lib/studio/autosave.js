// Saving what is being written without losing any of it, and without lying about it.
//
// The author types; `change(snapshot)` is called with everything that is written so far. A save is made when the typing has
// paused. Only one save is on its way at a time, and what is typed while it is sent is sent next (the newest snapshot, not a
// queue of old ones). A save that fails keeps the snapshot and is tried again, a little later each time, and at once when
// `retry()` is called (the browser coming back online). `flush()` saves now, for leaving the page.
//
// `status` is what the author is told, and it is only "saved" when the server has everything:
//
//   saved      everything written has reached the server
//   unsaved    there are changes the server does not have yet, and a save is waiting for the typing to pause
//   saving     a save is on its way
//   offline    the last save did not get through and the browser says there is no connection
//   error      the last save did not get through for another reason; it will be tried again
//   conflict   the article was changed somewhere else: nothing more is sent until `resume()` (the author has decided)
//
// Nothing here knows what a snapshot is or where it goes: `save(snapshot)` is given by the caller, and `isConflict(error)` says
// which failure means a conflict.

/**
 * @template T
 * @param {object} options
 * @param {(snapshot: T) => Promise<any>} options.save
 * @param {(status: string, detail?: any) => void} [options.onStatus]
 * @param {number} [options.wait]            how long the typing must pause before a save, in milliseconds
 * @param {number[]} [options.retryAfter]    how long to wait after the first failure, the second, ... the last is repeated
 * @param {() => boolean} [options.isOnline]
 * @param {(error: any) => boolean} [options.isConflict]
 */
export function createAutosave({ save, onStatus = () => {}, wait = 1200, retryAfter = [2000, 5000, 15000, 30000], isOnline = () => true, isConflict = () => false }) {
  /** @type {T | undefined} */
  let latest;
  let dirty = false;
  /** @type {Promise<void> | null} */
  let inFlight = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let failures = 0;
  let status = 'saved';
  let stopped = false;

  const set = (next, detail) => {
    if (stopped || (next === status && detail === undefined)) return; // a status that has not changed is not news
    status = next;
    onStatus(next, detail);
  };
  const stopTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  const schedule = (ms) => { stopTimer(); timer = setTimeout(run, ms); };

  async function run() {
    stopTimer();
    while (inFlight) await inFlight;
    if (stopped || !dirty || status === 'conflict') return;
    const snapshot = /** @type {T} */ (latest);
    dirty = false;
    set('saving');
    inFlight = (async () => {
      try {
        const result = await save(snapshot);
        failures = 0;
        if (dirty) { set('unsaved'); schedule(wait); } else set('saved', result);
      } catch (error) {
        dirty = true; // not lost: `latest` holds at least what this save was sending
        if (isConflict(error)) { set('conflict', error); return; }
        failures++;
        set(isOnline() ? 'error' : 'offline', error);
        schedule(retryAfter[Math.min(failures, retryAfter.length) - 1]);
      }
    })();
    try { await inFlight; } finally { inFlight = null; }
  }

  return {
    get status() { return status; },
    /** Something was written. */
    change(snapshot) {
      latest = snapshot;
      dirty = true;
      if (status === 'conflict' || status === 'error' || status === 'offline') return; // a retry is already waiting, or the author must decide first
      if (!inFlight) set('unsaved');
      schedule(wait);
    },
    /** Saves what is waiting now; resolves with the status once it has been tried. */
    async flush() {
      if (dirty && status !== 'conflict') await run();
      else while (inFlight) await inFlight;
      return status;
    },
    /** Tries again now (the connection is back, or the author asked). */
    async retry() {
      if (status === 'conflict') return status;
      await run();
      return status;
    },
    /** The author has decided what to do about a conflict: carry on saving. */
    resume() {
      if (status !== 'conflict') return;
      failures = 0;
      set(dirty ? 'unsaved' : 'saved');
      if (dirty) schedule(0);
    },
    /** Allows saving again after `dispose()`: a screen that was "unmounted" and mounted again (React does so in development). */
    start() {
      stopped = false;
    },
    dispose() {
      stopped = true;
      stopTimer();
    }
  };
}
