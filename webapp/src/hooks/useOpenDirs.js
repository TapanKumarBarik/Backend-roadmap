import { useCallback, useMemo, useState } from 'react';

const NO_CHOICES = new Map();

// Which branches of the module tree are open.
//
// The tree is a "you are here" aid, not a record of everywhere you have been. It used to remember every
// branch you had ever opened (and every branch a status filter had opened), so a returning reader met an
// arbitrary patchwork of open and closed branches that had nothing to do with what they were reading. Now:
//
//   - `defaultOpen` is what the tree shows by itself: the way to the module being read (see lib/curriculum/
//     treePath.js) and, while a status filter is on, every branch with a match. Nothing else is open, so a
//     fresh visit, a reload and the dashboard are all the same few closed rows.
//   - Clicking a caret overrides that for the branch you clicked. Those choices last until `resetKey`
//     changes (another module, another filter), then the tree goes back to the default for the new place.
//   - Nothing is saved between visits: reopening a module reopens its path, which is all there is to restore.
export function useOpenDirs(defaultOpen, resetKey) {
  const [state, setState] = useState({ key: resetKey, choices: NO_CHOICES });
  const choices = state.key === resetKey ? state.choices : NO_CHOICES;

  const openDirs = useMemo(() => {
    if (!choices.size) return defaultOpen;
    const open = new Set(defaultOpen);
    choices.forEach((isOpen, dir) => (isOpen ? open.add(dir) : open.delete(dir)));
    return open;
  }, [defaultOpen, choices]);

  // Applies `decide(currentlyChosen)` -> [dir, isOpen] pairs on top of the choices made for this place.
  const choose = useCallback((decide) => {
    setState((prev) => {
      const current = prev.key === resetKey ? prev.choices : NO_CHOICES;
      const next = new Map(current);
      decide((dir) => (current.has(dir) ? current.get(dir) : defaultOpen.has(dir)))
        .forEach(([dir, isOpen]) => next.set(dir, isOpen));
      return { key: resetKey, choices: next };
    });
  }, [resetKey, defaultOpen]);

  const toggleDir = useCallback((dir) => choose((isOpen) => [[dir, !isOpen(dir)]]), [choose]);
  const expandAll = useCallback((allDirs) => choose(() => allDirs.map((dir) => [dir, true])), [choose]);
  const collapseAll = useCallback(() => choose(() => [...openDirs].map((dir) => [dir, false])), [choose, openDirs]);

  return { openDirs, toggleDir, expandAll, collapseAll };
}
