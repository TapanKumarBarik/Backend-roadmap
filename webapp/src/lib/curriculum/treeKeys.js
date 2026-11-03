// The keyboard for the module tree (components/layout/Tree.jsx). The tree is one Tab stop; inside it the arrow keys move between the rows
// that are showing, Right opens a track (or goes into it) and Left closes it (or goes to the track it is in), Home and End go to the
// first and last row, and Space changes a module's progress. This decides what a key does; the tree does it.

/**
 * @param {string} key  the key pressed
 * @param {{ index: number, count: number, isDir: boolean, isOpen: boolean, hasParent: boolean, isModule: boolean }} at  where focus is
 * @returns {{ do: 'move', to: number } | { do: 'open' } | { do: 'close' } | { do: 'parent' } | { do: 'child' } | { do: 'progress' } | null}
 */
export function treeKey(key, { index, count, isDir, isOpen, hasParent, isModule }) {
  switch (key) {
    case 'ArrowDown': return index < count - 1 ? { do: 'move', to: index + 1 } : null;
    case 'ArrowUp': return index > 0 ? { do: 'move', to: index - 1 } : null;
    case 'Home': return { do: 'move', to: 0 };
    case 'End': return { do: 'move', to: count - 1 };
    case 'ArrowRight': return isDir ? (isOpen ? { do: 'child' } : { do: 'open' }) : null;
    case 'ArrowLeft': return isDir && isOpen ? { do: 'close' } : hasParent ? { do: 'parent' } : null;
    case ' ': return isModule ? { do: 'progress' } : null;
    default: return null;
  }
}
