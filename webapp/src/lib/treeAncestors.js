// Computes which directory paths to force-open when navigating to `node`,
// replicating expandAncestors()'s DOM-walk (which deliberately starts at the
// PARENT, never the node's own li, so opening a directory's own README
// doesn't undo a collapse the user just performed on that same directory)
// using the tree's path strings instead of a live DOM.
//
// Node.path has a split meaning in docs-index.json: for a directory node
// it's the directory's own path; for a plain leaf .md file it's already the
// PARENT directory's path (see gen-docs-index.py). So:
//  - opening a directory's own README (node has children): start one level
//    above node.path (skip the node's own path).
//  - opening a plain leaf file (no children): node.path already IS its
//    immediate parent dir, so start there.
// Either way, the result is every ancestor directory path, nearest first,
// never including the directory whose own open/closed state should be
// left alone.
export function ancestorDirPaths(node) {
  const hasKids = node.children && node.children.length > 0;
  const startDir = hasKids
    ? (node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '')
    : node.path;
  if (!startDir) return [];
  const segments = startDir.split('/');
  const paths = [];
  for (let i = segments.length; i >= 1; i--) paths.push(segments.slice(0, i).join('/'));
  return paths;
}
