import { useEffect } from 'react';

// Ctrl/K=palette, Escape=close overlays, /=palette (not while typing),
// T=theme cycle, B=toggle sidebar, J/K=next/prev module, D/W=toggle
// done/wip — all suppressed while typing or with a modifier key held,
// ported verbatim from the vanilla keydown listener.
export function useKeyboardShortcuts({
  onOpenPalette,
  onClosePalette,
  onCloseMenu,
  onCycleTheme,
  onToggleNav,
  onNavigateRelative,
  onToggleDone,
  onToggleWip
}) {
  useEffect(() => {
    function onKeyDown(e) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }
      if (e.key === 'Escape') {
        onClosePalette();
        onCloseMenu();
        onToggleNav(false);
        return;
      }
      if (typing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === '/') { e.preventDefault(); onOpenPalette(); }
      else if (k === 't') onCycleTheme();
      else if (k === 'b') onToggleNav();
      else if (k === 'j') { e.preventDefault(); onNavigateRelative(1); }
      else if (k === 'k') { e.preventDefault(); onNavigateRelative(-1); }
      else if (k === 'd') onToggleDone();
      else if (k === 'w') onToggleWip();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onOpenPalette, onClosePalette, onCloseMenu, onCycleTheme, onToggleNav, onNavigateRelative, onToggleDone, onToggleWip]);
}
