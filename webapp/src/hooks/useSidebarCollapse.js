import { useCallback, useEffect, useState } from 'react';

const LS_KEY = 'docs.sidebarCollapsed';

// Desktop-only concern (see the .sidebar-collapsed CSS, scoped to widths
// above the mobile breakpoint) — the mobile drawer already has its own
// open/close state in App.jsx's navOpen, untouched by this.
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    try { localStorage.setItem(LS_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return { collapsed, toggle };
}
