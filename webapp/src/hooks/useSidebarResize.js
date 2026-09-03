import { useEffect, useRef } from 'react';

const LS_KEY = 'docs.sidebarW';

// Ported from the vanilla initResizer IIFE. Drags --sidebar-w directly as a
// CSS custom property (no React state involved — this is display-only,
// high-frequency, and never needs to trigger a re-render), persisting only
// on mouseup.
export function useSidebarResize(resizerRef) {
  const draggingRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) document.documentElement.style.setProperty('--sidebar-w', saved + 'px');

    const resizer = resizerRef.current;
    if (!resizer) return;

    function onMouseDown(e) {
      draggingRef.current = true;
      resizer.classList.add('drag');
      e.preventDefault();
      document.body.style.userSelect = 'none';
    }
    function onMouseMove(e) {
      if (!draggingRef.current) return;
      const w = Math.min(Math.max(230, e.clientX), Math.min(640, window.innerWidth - 400));
      document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    }
    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      resizer.classList.remove('drag');
      document.body.style.userSelect = '';
      const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
      if (w) localStorage.setItem(LS_KEY, String(w));
    }

    resizer.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      resizer.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizerRef]);
}
