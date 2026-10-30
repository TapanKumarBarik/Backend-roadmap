import { isModule } from './nodeKind.js';

// Functional re-expression of the vanilla applyFilter()'s two-pass DOM walk: a module is visible if its own status
// matches, and a directory is visible if any module under it is, and gets auto-opened when a descendant match caused
// it to show. Only modules have a status of their own (a track's tick is derived from its modules, and a planned
// module has none), so a status filter never matches anything else. Every emitted tree node has a `file` (its own
// doc, leaf or a dir's README), so visibility is keyed uniformly by `file`; `autoOpenDirs` is keyed by `path` to
// match how directory open/closed state is tracked elsewhere.
export function computeTreeVisibility(nodes, statusMap, filter) {
  const visibleFiles = new Set();
  const autoOpenDirs = new Set();

  function walk(node) {
    const hasKids = node.children && node.children.length > 0;

    if (!hasKids) {
      const match = filter === 'all' || (isModule(node) && ((statusMap[node.file] || 'todo') === filter));
      if (match) visibleFiles.add(node.file);
      return match;
    }

    let anyVisible = false;
    node.children.forEach((child) => {
      if (walk(child)) anyVisible = true;
    });
    const show = filter === 'all' || anyVisible;
    if (show) visibleFiles.add(node.file);
    if (anyVisible) autoOpenDirs.add(node.path);
    return show;
  }

  nodes.forEach(walk);
  return { visibleFiles, autoOpenDirs };
}
