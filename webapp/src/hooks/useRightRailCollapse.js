import { useCallback, useEffect, useState } from 'react';

const LS_KEY = 'docs.rightRailCollapsed';

// Mirrors useSidebarCollapse.js — same localStorage-backed, body-class
// toggle pattern, applied to the right rail (TOC/Notes) instead of the
// left tree. Desktop-only; below the 1180px breakpoint the rail is
// already display:none via its own responsive rule.
export function useRightRailCollapse() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    document.body.classList.toggle('right-rail-collapsed', collapsed);
    try { localStorage.setItem(LS_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return { collapsed, toggle };
}
