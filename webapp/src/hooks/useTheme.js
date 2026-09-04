import { useCallback, useEffect, useState } from 'react';

const ORDER = ['auto', 'light', 'dark'];
const KEY = 'docs.theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(KEY) || 'auto');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  // Returns the theme it moved to, so the caller can say so out loud.
  // Two of these three states always render identically (on a light OS,
  // "auto" and "light" are the same picture), so a press can legitimately
  // change nothing on screen — which read as a broken button. Rather than
  // drop a state to force a visible change, the caller announces the mode.
  const cycleTheme = useCallback(() => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    return next;
  }, [theme]);

  return { theme, cycleTheme };
}
