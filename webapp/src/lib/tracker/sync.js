// Merging two copies of a reader's Prep Tracker progress: the browser's and the one kept on their account (api/routes/state.js). Pure: copies in, copy out.
//
// A copy is { records: Map<id, record>, removed: Map<id, second> }. Each row is decided on its own: of everything the two copies know about a row, a record (its `u` is
// the second it was last changed, 0 for one written before there was sync) or a note that it was reset (`removed`), the latest wins. On a tie this browser's own copy
// wins, and a reset beats a record. A reset is remembered for `keepRemovedDays` so that a device that has not synced for a while cannot bring a row back, and then
// forgotten. The clocks are the devices' own: a device whose clock is wrong will win or lose by that much.

/** The second a record was last changed, 0 when it does not say. */
export const stampOf = (record) => (record && Number.isInteger(record.u) ? record.u : 0);

/** Everything the two copies know about one row, this browser's first (that is the order a tie is settled in). */
function candidates(id, local, remote) {
  const list = [];
  if (local.records.has(id)) list.push({ record: local.records.get(id), at: stampOf(local.records.get(id)) });
  if (local.removed.has(id)) list.push({ record: null, at: local.removed.get(id) });
  if (remote.records.has(id)) list.push({ record: remote.records.get(id), at: stampOf(remote.records.get(id)) });
  if (remote.removed.has(id)) list.push({ record: null, at: remote.removed.get(id) });
  return list;
}

/**
 * The two copies as one. `now` is the second it is, `keepRemovedDays` how long a reset is remembered. Neither copy given is changed.
 * @param {{ records: Map<string, any>, removed: Map<string, number> }} local
 * @param {{ records: Map<string, any>, removed: Map<string, number> }} remote
 */
export function mergeStates(local, remote, now, keepRemovedDays) {
  const records = new Map();
  const removed = new Map();
  const horizon = now - keepRemovedDays * 86400;
  const ids = new Set([...local.records.keys(), ...local.removed.keys(), ...remote.records.keys(), ...remote.removed.keys()]);
  for (const id of ids) {
    let best = null;
    // the later wins; at the same second a reset beats a record, and otherwise the first listed (this browser's) stays
    for (const candidate of candidates(id, local, remote)) if (!best || candidate.at > best.at || (candidate.at === best.at && !candidate.record && best.record)) best = candidate;
    if (!best) continue;
    if (best.record) records.set(id, best.record);
    else if (best.at >= horizon) removed.set(id, best.at);
  }
  return { records, removed };
}

const same = (a, b) => JSON.stringify(Object.keys(a).sort().map((key) => [key, a[key]])) === JSON.stringify(Object.keys(b).sort().map((key) => [key, b[key]]));

/** Whether two copies say the same thing about every row. */
export function sameState(a, b) {
  if (a.records.size !== b.records.size || a.removed.size !== b.removed.size) return false;
  for (const [id, record] of a.records) if (!b.records.has(id) || !same(record, b.records.get(id))) return false;
  for (const [id, at] of a.removed) if (b.removed.get(id) !== at) return false;
  return true;
}

/** Nothing in it: no row has been touched, and none was reset. */
export const isEmptyState = (state) => state.records.size === 0 && state.removed.size === 0;
