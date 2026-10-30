import { useCallback, useEffect, useState } from 'react';
import { STORAGE } from '../config/index.js';
import { readStored, writeStored } from '../lib/storage.js';

// Desktop-only concern (see the .sidebar-collapsed CSS, scoped to widths
// above the mobile breakpoint) — the mobile drawer already has its own
// open/close state in App.jsx's navOpen, untouched by this.
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(() => readStored(STORAGE.sidebarCollapsed) === '1');

  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    writeStored(STORAGE.sidebarCollapsed, collapsed ? '1' : '0');
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return { collapsed, toggle };
}
