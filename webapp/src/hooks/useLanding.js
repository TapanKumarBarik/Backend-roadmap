import { useCallback, useState } from 'react';
import { STORAGE } from '../config/index.js';
import { readStored, writeStored } from '../lib/storage.js';

// The front door is for someone who has not started yet. Anyone who has opened a module (STORAGE.lastFile),
// finished one (progress), or already chosen "Browse the curriculum" gets the working dashboard instead,
// so a returning learner is never sent back to a sales page. Storage can be blocked or empty (private
// window, cleared data): then everyone is a first-time visitor, which is the safe default.
export function useLanding({ started, hasOpenFile, isSpecialRoute }) {
  const [seen, setSeen] = useState(() => !!readStored(STORAGE.seenLanding) || !!readStored(STORAGE.lastFile));

  const dismiss = useCallback(() => {
    writeStored(STORAGE.seenLanding, '1');
    setSeen(true);
  }, []);

  const showLanding = !isSpecialRoute && !hasOpenFile && !started && !seen;
  return { showLanding, dismiss };
}
