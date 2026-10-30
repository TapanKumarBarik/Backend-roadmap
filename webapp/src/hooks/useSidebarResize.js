import { useEffect } from 'react';
import { STORAGE } from '../config/index.js';
import { readStored, writeStored } from '../lib/storage.js';

// Ported from the vanilla initResizer IIFE. Drags --sidebar-w directly as a
// CSS custom property (no React state involved — this is display-only,
// high-frequency, and never needs to trigger a re-render), persisting only
// on mouseup.
//
// The drag handle (#resizer) only exists while a module is open: the landing page and the dashboard have no
// sidebar. So this listens on the document and looks for the handle when the mouse goes down, instead of
// grabbing the element once at start-up, which missed it whenever the app opened on the dashboard.
export function useSidebarResize() {
  useEffect(() => {
    const saved = readStored(STORAGE.sidebarWidth);
    if (saved) document.documentElement.style.setProperty('--sidebar-w', saved + 'px');

    let handle = null;

    function onMouseDown(e) {
      handle = e.target.closest ? e.target.closest('#resizer') : null;
      if (!handle) return;
      handle.classList.add('drag');
      e.preventDefault();
      document.body.style.userSelect = 'none';
    }
    function onMouseMove(e) {
      if (!handle) return;
      const w = Math.min(Math.max(230, e.clientX), Math.min(640, window.innerWidth - 400));
      document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    }
    function onMouseUp() {
      if (!handle) return;
      handle.classList.remove('drag');
      handle = null;
      document.body.style.userSelect = '';
      const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
      if (w) writeStored(STORAGE.sidebarWidth, String(w));
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
}
