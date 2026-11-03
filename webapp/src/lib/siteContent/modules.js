// The module index (docs-index.json) read as lists and lookups, for the places that must know which folders and modules exist
// without a file system: the admin editors (a picker over the real modules) and the API (which cannot read the repository, so it
// reads the deployed site's index). Pure.
//
// In the index a folder is a node whose `name` does not end in ".md" (a loose page beside the modules does). A module is a folder
// that has a README (`file`) and no module folders inside it; one with a track's or curriculum's README is a signpost, not a lesson.

const isFolder = (node) => !String(node.name).endsWith('.md');

/**
 * The folder at `folder` (a path under content/, "backend/01-x"), or null.
 * @param {any[]} tree
 * @param {string} folder
 */
export function folderNode(tree, folder) {
  let nodes = tree;
  let found = null;
  for (const name of String(folder).split('/')) {
    found = (nodes || []).find((n) => isFolder(n) && n.name === name) || null;
    if (!found) return null;
    nodes = found.children;
  }
  return found;
}

/**
 * The modules at or under a node, in reading order, as the checker counts them: a folder with a README and no module folders inside.
 * @param {any} node
 * @returns {any[]}
 */
export function modulesUnder(node) {
  const inside = (node.children || []).filter(isFolder).flatMap(modulesUnder);
  if (!inside.length && node.file && isFolder(node)) return [node];
  return inside;
}

/**
 * Every page that has a README, in the index's order: { file, folder, title, planned }. `folder` is the module's folder under content/.
 * @param {any[]} tree
 * @returns {Array<{ file: string, folder: string, title: string, planned: boolean }>}
 */
export function listPages(tree) {
  const pages = [];
  (function walk(nodes) {
    for (const n of nodes) {
      if (n.file && isFolder(n)) pages.push({ file: n.file, folder: n.path, title: n.title || n.name, planned: Boolean(n.planned) });
      if (n.children && n.children.length) walk(n.children);
    }
  })(tree);
  return pages;
}

/** The README of every page, as a set (the keys of seo.json). */
export const pageFiles = (tree) => new Set(listPages(tree).map((p) => p.file));

/** The folder of every page, as a set (a video's `module`). */
export const pageFolders = (tree) => new Set(listPages(tree).map((p) => p.folder));

/**
 * Every folder a path may use as a step, in the index's order: the curricula, the tracks and the modules.
 * @param {any[]} tree
 * @returns {string[]}
 */
export function listFolders(tree) {
  const folders = [];
  (function walk(nodes) {
    for (const n of nodes) {
      if (!isFolder(n)) continue;
      folders.push(n.path);
      if (n.children && n.children.length) walk(n.children);
    }
  })(tree);
  return folders;
}
