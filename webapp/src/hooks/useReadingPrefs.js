import { useCallback, useEffect, useState } from 'react';
import { STORAGE } from '../config/index.js';
import { READING } from '../config/reading.js';
import { readJson, writeJson } from '../lib/storage.js';

const valid = (key, value) => READING.groups.find((g) => g.key === key).options.some(([id]) => id === value);

/** The options kept in this browser; anything unreadable is the default. */
export function readReadingPrefs() {
  const saved = readJson(STORAGE.readingPrefs, {}) || {};
  return Object.fromEntries(Object.keys(READING.defaults).map((key) => [key, valid(key, saved[key]) ? saved[key] : READING.defaults[key]]));
}

/** Puts the options on <html>, where the styles read them (styles/global.css). Called as the app starts, so a lesson never shows in the wrong size first. */
export function applyReadingPrefs(prefs = readReadingPrefs()) {
  const root = document.documentElement;
  root.dataset.readSize = prefs.size;
  root.dataset.readWidth = prefs.width;
}

/** The reader's size and width options: { prefs, set(key, value), reset() }. */
export function useReadingPrefs() {
  const [prefs, setPrefs] = useState(readReadingPrefs);

  useEffect(() => {
    applyReadingPrefs(prefs);
    writeJson(STORAGE.readingPrefs, prefs);
  }, [prefs]);

  const set = useCallback((key, value) => setPrefs((current) => (valid(key, value) ? { ...current, [key]: value } : current)), []);
  const reset = useCallback(() => setPrefs({ ...READING.defaults }), []);
  return { prefs, set, reset };
}
