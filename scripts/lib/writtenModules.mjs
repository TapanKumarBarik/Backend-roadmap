// The modules of the docs index (dist/docs-index.json -> tree) that have been written: a page with a README that is not a placeholder. A track's or a curriculum's
// own page counts (it is never a placeholder). Used by the Prep Tracker's lesson matching and by the build that checks every lesson it links to is one of these.

/**
 * @param {any} tree the `tree` of the docs index
 * @returns {Array<{ path: string, file: string, title?: string, tags?: string[] }>}
 */
export function writtenModules(tree) {
  const found = [];
  (function walk(/** @type {any} */ node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.file && !node.planned && /README\.md$/.test(node.file)) found.push(node);
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  })(tree);
  return found;
}
