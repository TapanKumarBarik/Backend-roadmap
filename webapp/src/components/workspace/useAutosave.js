import { useEffect, useRef, useState } from 'react';
import { createAutosave } from '../../lib/studio/autosave.js';
import { WORKSPACE_SAVE } from '../../config/workspace.js';

// The studio's saver (lib/studio/autosave.js) for a page's data: `change(snapshot)` after each edit, one save at a time, a failed
// save kept and tried again, and what is waiting is sent when the page is left. `status` is "saved", "unsaved", "saving",
// "offline" or "error": say it in words (WORKSPACE_SAVE) and only call it saved when the server has everything.
export function useAutosave(save) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const [status, setStatus] = useState('saved');
  const [autosave] = useState(() => createAutosave({
    wait: WORKSPACE_SAVE.waitMs,
    retryAfter: WORKSPACE_SAVE.retryMs,
    isOnline: () => navigator.onLine !== false,
    save: (snapshot) => saveRef.current(snapshot),
    onStatus: setStatus
  }));

  useEffect(() => {
    autosave.start();
    const back = () => { autosave.retry(); };
    window.addEventListener('online', back);
    return () => {
      window.removeEventListener('online', back);
      autosave.flush();
      autosave.dispose();
    };
  }, [autosave]);

  return { change: autosave.change, status };
}
