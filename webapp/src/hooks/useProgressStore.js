import { useCallback, useEffect, useRef, useState } from 'react';
import { getAllLocalStatuses, getAllLocalTimes, setLocalStatus, clearAllLocal } from '../lib/indexedDb.js';
import { fetchServerStatus, fetchServerTimes, putServerStatus, resetServerStatus } from '../lib/api.js';

// IndexedDB is the offline/signed-out cache (source of truth until a user
// signs in); the server becomes source of truth for a signed-in user, kept
// in sync in the background. 'todo' is never stored — its absence from the
// map *is* todo, matching the original convention everywhere it's read via
// `statusMap[f] || 'todo'`.
export function useProgressStore(user) {
  const [statusMap, setStatusMap] = useState({});
  // path -> ISO string of when the mark was last changed. Kept beside
  // statusMap rather than folded into it, because every consumer reads
  // `statusMap[f] || 'todo'` and expects a bare string.
  const [timeMap, setTimeMap] = useState({});
  const [ready, setReady] = useState(false);
  const statusMapRef = useRef(statusMap);
  statusMapRef.current = statusMap;
  const timeMapRef = useRef(timeMap);
  timeMapRef.current = timeMap;
  const mergedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAllLocalStatuses(), getAllLocalTimes()]).then(([map, times]) => {
      if (cancelled) return;
      setStatusMap(map);
      setTimeMap(times);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // On the first transition to signed-in, MERGE rather than overwrite: the
  // original app did a wholesale `statusMap = serverMap`, which silently
  // orphaned any progress made while signed out (still physically in
  // IndexedDB, but no longer reflected anywhere and never pushed to the
  // server). Here, local-only entries fill gaps the server doesn't have and
  // get pushed up; the server wins on paths present in both.
  useEffect(() => {
    if (!ready || !user || mergedRef.current) return;
    mergedRef.current = true;
    (async () => {
      try {
        // Times come from a second request that must not sink the merge if it
        // fails — an older API without /progress/times should still sync
        // statuses, just without history.
        const [serverMap, serverTimes] = await Promise.all([
          fetchServerStatus(),
          fetchServerTimes().catch(() => ({}))
        ]);
        const local = statusMapRef.current;
        const localTimes = timeMapRef.current;
        const merged = { ...serverMap };
        // Timestamps follow the same rule as statuses: server wins where both
        // have one, local fills the gaps. Writing the merged value back below
        // is what stops setLocalStatus from restamping everything as "now".
        const mergedTimes = { ...serverTimes };
        const pushes = [];
        for (const [path, status] of Object.entries(local)) {
          if (!(path in serverMap)) {
            merged[path] = status;
            if (localTimes[path]) mergedTimes[path] = localTimes[path];
            pushes.push(putServerStatus(path, status));
          }
        }
        await Promise.all(pushes);
        setStatusMap(merged);
        setTimeMap(mergedTimes);
        await Promise.all(Object.entries(merged).map(([p, s]) => setLocalStatus(p, s, mergedTimes[p])));
      } catch {
        // offline or the request failed — keep local-only state, retry on
        // the next mount rather than silently pretending we merged.
        mergedRef.current = false;
      }
    })();
  }, [ready, user]);

  const setStatus = useCallback((path, status) => {
    // One timestamp shared by the local write and the in-memory map, so the
    // two can't drift by a few milliseconds and show different days.
    const now = new Date().toISOString();
    setStatusMap((prev) => {
      if (status === 'todo') {
        if (!(path in prev)) return prev;
        const next = { ...prev };
        delete next[path];
        return next;
      }
      return { ...prev, [path]: status };
    });
    setTimeMap((prev) => {
      if (status === 'todo') {
        if (!(path in prev)) return prev;
        const next = { ...prev };
        delete next[path];
        return next;
      }
      return { ...prev, [path]: now };
    });
    setLocalStatus(path, status, now);
    if (user) putServerStatus(path, status).catch(() => {});
  }, [user]);

  const reset = useCallback(async () => {
    await clearAllLocal();
    setStatusMap({});
    setTimeMap({});
    if (user) resetServerStatus().catch(() => {});
  }, [user]);

  const importStatuses = useCallback((incoming) => {
    let n = 0;
    for (const [path, status] of Object.entries(incoming)) {
      if (status !== 'wip' && status !== 'done') continue;
      setStatus(path, status);
      n++;
    }
    return n;
  }, [setStatus]);

  return { statusMap, timeMap, ready, setStatus, reset, importStatuses };
}
