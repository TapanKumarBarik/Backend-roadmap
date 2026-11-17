import { useCallback, useEffect } from 'react';
import { useLocalJson } from './useLocalJson.js';
import { STORAGE } from '../config/index.js';
import { FOCUS } from '../config/focus.js';
import { writeStored } from '../lib/storage.js';

// Focus mode on a lesson: whether it is on (kept in this browser, so it holds from one lesson to the next and after a reload), a way to flip it, and the F key while
// a lesson is open. While it is on and a lesson is showing, <html> has data-focus="1", which is what the styles hide everything but the lesson for (styles/global.css);
// it comes off when the lesson is left, so no other screen is ever without its navigation. Turning it off also ends a focus session that was running.
export function useFocusMode() {
  const [on, setOn] = useLocalJson(STORAGE.focusMode, false);
  const toggle = useCallback(() => setOn((value) => !value), [setOn]);

  useEffect(() => {
    const root = document.documentElement;
    if (on) root.dataset.focus = '1';
    else { delete root.dataset.focus; writeStored(STORAGE.focusSession, ''); }
    return () => { delete root.dataset.focus; };
  }, [on]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== FOCUS.key) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
      toggle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return { on: !!on, toggle };
}
