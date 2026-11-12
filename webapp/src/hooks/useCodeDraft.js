import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE } from '../config/index.js';
import { RUNNER } from '../config/code.js';
import { readStored, writeStored } from '../lib/storage.js';

/**
 * The code a learner is writing for one problem, kept in this browser as they type and put back when they return. `starter` is null until the problem has
 * loaded; `code` is null until it is known what to start from, and again for a moment when another problem opens in the same screen (it is never another
 * problem's code). An empty saved value means "nothing saved" (the code is the starter).
 */
export function useCodeDraft(slug, starter) {
  const key = STORAGE.codeDraft + slug;
  const [draft, setDraft] = useState({ key: null, code: null });
  const timer = useRef(null);
  const pending = useRef(null);

  useEffect(() => {
    if (starter == null) return;
    setDraft({ key, code: readStored(key) || starter });
  }, [key, starter]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) { writeStored(key, pending.current === starter ? '' : pending.current); pending.current = null; }
  }, [key, starter]);

  const setCode = useCallback((next) => {
    setDraft({ key, code: next });
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, RUNNER.draftSaveMs);
  }, [key, flush]);

  // leaving the screen (or opening another problem) keeps what was typed in the last moments
  useEffect(() => flush, [flush]);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = null;
    writeStored(key, '');
    setDraft({ key, code: starter });
  }, [key, starter]);

  const code = draft.key === key ? draft.code : null;
  return { code, setCode, reset, changed: code !== null && code !== starter };
}
