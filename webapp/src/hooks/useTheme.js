import { useCallback, useEffect, useState } from 'react';
import { STORAGE } from '../config/index.js';
import { readStored, writeStored } from '../lib/storage.js';

const ORDER = ['auto', 'light', 'dark'];

export function useTheme() {
  // This runs while the app starts: an unguarded read here used to take the whole page down in a browser
  // that blocks site data. readStored never throws.
  const [theme, setTheme] = useState(() => {
    const saved = readStored(STORAGE.theme);
    return ORDER.includes(saved) ? saved : 'auto';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStored(STORAGE.theme, theme);
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
