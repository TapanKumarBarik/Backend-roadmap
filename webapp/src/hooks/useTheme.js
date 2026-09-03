import { useCallback, useEffect, useState } from 'react';

const ORDER = ['auto', 'light', 'dark'];
const KEY = 'docs.theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(KEY) || 'auto');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme((cur) => ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]);
  }, []);

  return { theme, cycleTheme };
}
