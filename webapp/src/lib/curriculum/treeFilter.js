// Functional re-expression of the vanilla applyFilter()'s two-pass DOM walk:
// a leaf is visible if its own status matches; a directory is visible if any
// descendant is visible OR its own status (its README's status) matches, and
// gets auto-opened when a descendant match caused it to show. Every emitted
// tree node has a `file` (its own doc, leaf or a dir's README), so visibility
// is keyed uniformly by `file`; `autoOpenDirs` is keyed by `path` to match
// how directory open/closed state is tracked elsewhere.
export function computeTreeVisibility(nodes, statusMap, filter) {
  const visibleFiles = new Set();
  const autoOpenDirs = new Set();

  function walk(node) {
    const hasKids = node.children && node.children.length > 0;
    const ownStatus = (node.file && statusMap[node.file]) || 'todo';
    const ownMatch = filter === 'all' || ownStatus === filter;

    if (!hasKids) {
      if (ownMatch) visibleFiles.add(node.file);
      return ownMatch;
    }

    let anyVisible = false;
    node.children.forEach((child) => {
      if (walk(child)) anyVisible = true;
    });
    const show = filter === 'all' || anyVisible || ownMatch;
    if (show) visibleFiles.add(node.file);
    if (anyVisible) autoOpenDirs.add(node.path);
    return show;
  }

  nodes.forEach(walk);
  return { visibleFiles, autoOpenDirs };
}
