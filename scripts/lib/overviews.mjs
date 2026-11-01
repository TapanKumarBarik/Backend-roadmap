// A curriculum's or a track's own page (the README with modules under it) is a signpost, never a placeholder. A module counts
// as unwritten when the marker sentence is in its first lines (site.config.json, content.placeholderMarker); the build and the
// app both read that off the text. So an overview that says the sentence in passing ("a lecture that has not been written yet
// still has its video") would be treated as an empty module: kept out of search results and the sitemap, and shown with a
// "claim this module" box instead of its table of contents. This finds those pages.
import { isPlaceholderText } from './config.mjs';

/**
 * The overview pages of a tree (nodes with modules under them) whose text carries the placeholder marker.
 * @param {any[]} tree  docs-index.json's tree
 * @param {(file: string) => string} read  a page's text, by the file the index knows it by
 * @returns {string[]}
 */
export function overviewsMarkedUnwritten(tree, read) {
  const found = [];
  (function walk(nodes) {
    for (const node of nodes) {
      if (!node.children?.length) continue;
      if (node.file && isPlaceholderText(read(node.file))) found.push(node.file);
      walk(node.children);
    }
  })(tree);
  return found;
}
