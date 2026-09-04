import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'docs.openDirs';

// Set<dirPath> of expanded directories, debounced (150ms, matching the
// vanilla saveOpenDirs) to localStorage.
//
// First visit starts fully collapsed — four curriculum rows. Opening every
// root by default put 70 rows on screen before you'd asked for anything,
// which is what made the tree read as a wall rather than a way in.
// Navigating to a module still auto-expands its ancestors (see App's
// openMany(ancestorDirPaths)), so the tree opens around wherever you are.
export function useOpenDirs(treeData) {
  const [openDirs, setOpenDirs] = useState(() => new Set());
  const initializedRef = useRef(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (initializedRef.current || !treeData.length) return;
    initializedRef.current = true;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { /* ignore */ }
    setOpenDirs(new Set(saved));
  }, [treeData]);

  const persist = useCallback((set) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
    }, 150);
  }, []);

  const toggleDir = useCallback((path, force) => {
    setOpenDirs((prev) => {
      const isOpen = prev.has(path);
      const nextOpen = force !== undefined ? force : !isOpen;
      if (nextOpen === isOpen) return prev;
      const next = new Set(prev);
      if (nextOpen) next.add(path); else next.delete(path);
      persist(next);
      return next;
    });
  }, [persist]);

  // Opens every path in `paths` that isn't already open, in one update —
  // used for expand-ancestors-on-navigate and filter-driven auto-expand.
  const openMany = useCallback((paths) => {
    setOpenDirs((prev) => {
      let changed = false;
      const next = new Set(prev);
      paths.forEach((p) => { if (!next.has(p)) { next.add(p); changed = true; } });
      if (!changed) return prev;
      persist(next);
      return next;
    });
  }, [persist]);

  const expandAll = useCallback((allDirPaths) => {
    const next = new Set(allDirPaths);
    setOpenDirs(next);
    persist(next);
  }, [persist]);

  const collapseAll = useCallback(() => {
    const next = new Set();
    setOpenDirs(next);
    persist(next);
  }, [persist]);

  return { openDirs, toggleDir, openMany, expandAll, collapseAll };
}
