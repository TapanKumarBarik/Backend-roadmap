import { useCallback, useEffect, useRef, useState } from 'react';
import { getAllLocalStatuses, setLocalStatus, clearAllLocal } from '../lib/indexedDb.js';
import { fetchServerStatus, putServerStatus, resetServerStatus } from '../lib/api.js';

// IndexedDB is the offline/signed-out cache (source of truth until a user
// signs in); the server becomes source of truth for a signed-in user, kept
// in sync in the background. 'todo' is never stored — its absence from the
// map *is* todo, matching the original convention everywhere it's read via
// `statusMap[f] || 'todo'`.
export function useProgressStore(user) {
  const [statusMap, setStatusMap] = useState({});
  const [ready, setReady] = useState(false);
  const statusMapRef = useRef(statusMap);
  statusMapRef.current = statusMap;
  const mergedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getAllLocalStatuses().then((map) => {
      if (cancelled) return;
      setStatusMap(map);
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
        const serverMap = await fetchServerStatus();
        const local = statusMapRef.current;
        const merged = { ...serverMap };
        const pushes = [];
        for (const [path, status] of Object.entries(local)) {
          if (!(path in serverMap)) {
            merged[path] = status;
            pushes.push(putServerStatus(path, status));
          }
        }
        await Promise.all(pushes);
        setStatusMap(merged);
        await Promise.all(Object.entries(merged).map(([p, s]) => setLocalStatus(p, s)));
      } catch {
        // offline or the request failed — keep local-only state, retry on
        // the next mount rather than silently pretending we merged.
        mergedRef.current = false;
      }
    })();
  }, [ready, user]);

  const setStatus = useCallback((path, status) => {
    setStatusMap((prev) => {
      if (status === 'todo') {
        if (!(path in prev)) return prev;
        const next = { ...prev };
        delete next[path];
        return next;
      }
      return { ...prev, [path]: status };
    });
    setLocalStatus(path, status);
    if (user) putServerStatus(path, status).catch(() => {});
  }, [user]);

  const reset = useCallback(async () => {
    await clearAllLocal();
    setStatusMap({});
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

  return { statusMap, ready, setStatus, reset, importStatuses };
}
