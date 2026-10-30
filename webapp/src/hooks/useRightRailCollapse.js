import { useCallback, useEffect, useState } from 'react';
import { STORAGE } from '../config/index.js';
import { readStored, writeStored } from '../lib/storage.js';

// Mirrors useSidebarCollapse.js — same localStorage-backed, body-class
// toggle pattern, applied to the right rail (TOC/Notes) instead of the
// left tree. Desktop-only; below the 1180px breakpoint the rail is
// already display:none via its own responsive rule.
export function useRightRailCollapse() {
  const [collapsed, setCollapsed] = useState(() => readStored(STORAGE.rightRailCollapsed) === '1');

  useEffect(() => {
    document.body.classList.toggle('right-rail-collapsed', collapsed);
    writeStored(STORAGE.rightRailCollapsed, collapsed ? '1' : '0');
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return { collapsed, toggle };
}
