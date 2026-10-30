// The directories that have to be open for `node`'s row to be visible in the module tree: every directory from
// its curriculum down to it, and, when the node is itself a directory (a track, a curriculum), its own, so that
// the modules it lists show too.
//
// Node.path has a split meaning in docs-index.json (see gen-docs-index.py): for a directory node it is the
// directory's own path, for a plain leaf file it is already the PARENT directory's path. Either way every
// prefix of it is a directory on the way down, which is what makes one rule serve both. (A module's own
// folder is in the result too; it is not a tree branch, so it is harmless.)
export function dirsOnPath(node) {
  const segments = node && node.path ? node.path.split('/') : [];
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'));
}
