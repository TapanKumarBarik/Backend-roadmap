import { useCallback, useEffect, useRef, useState } from 'react';
import { readJson, writeJson } from '../lib/storage.js';

// A value kept on this device (localStorage) that every component showing it stays in step with: the study plan someone is following, the review queue, the
// last level check. `set` takes a value or a function from the old value to the new one, saves it, and tells the other components (and other tabs) that
// use the same key. `fallback` is what is there when nothing is stored.
const CHANGED = 'docs-local-json';

export function useLocalJson(key, fallback = null) {
  const keep = useRef(fallback);
  const [value, setValue] = useState(() => readJson(key, keep.current));
  useEffect(() => {
    const reread = () => setValue(readJson(key, keep.current));
    const onChanged = (event) => { if (event.detail === key) reread(); };
    const onStorage = (event) => { if (event.key === key) reread(); };
    window.addEventListener(CHANGED, onChanged);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(CHANGED, onChanged); window.removeEventListener('storage', onStorage); };
  }, [key]);
  const set = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(readJson(key, keep.current)) : next;
    writeJson(key, resolved);
    setValue(resolved);
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: key }));
  }, [key]);
  return [value, set];
}
