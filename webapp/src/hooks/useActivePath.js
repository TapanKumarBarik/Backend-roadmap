import { useCallback, useMemo, useState } from 'react';
import { STORAGE } from '../config/index.js';
import { readStored, writeStored } from '../lib/storage.js';

// The path the reader has picked: just its id, in the browser. Progress is kept per module, so the id is all a
// path needs: switching paths loses nothing. An id that no longer matches a path (paths.json changed) simply means
// no path is picked.
export function useActivePath(paths) {
  const [id, setId] = useState(() => readStored(STORAGE.activePath) || null);
  const active = useMemo(() => paths.find((p) => p.id === id) || null, [paths, id]);

  const pick = useCallback((pathId) => {
    writeStored(STORAGE.activePath, pathId);
    setId(pathId);
  }, []);

  return { active, pick };
}
