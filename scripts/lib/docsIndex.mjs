// Builds the module tree the app reads (dist/docs-index.json): one node per folder, with its README as the page,
// the lessons as leaves, and each page's title, tags and reading time. The writer is scripts/build/gen-docs-index.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { IGNORED_FILES, SKIP_DIRS, extractTitle, humanize, isDirectory, isFile, readText, readingFacts, relativePosix } from './content.mjs';
import { tagsFor } from './tags.mjs';

/**
 * @param {string} root the folder the curricula sit in; every `file` and `path` in the result is relative to it
 * @param {string[]} curricula the curriculum folder names, in the order the site lists them
 * @param {{ videoCounts?: Map<string, number> }} [options] videoCounts: how many videos each module has (its README.md
 *   as the key), so the sidebar can mark the modules that can be watched
 */
export function buildDocsIndex(root, curricula, { videoCounts = new Map() } = {}) {
  const rel = (p) => relativePosix(root, p);

  function buildNode(dir) {
    const name = path.basename(dir);
    const relDir = rel(dir);
    const readmePath = path.join(dir, 'README.md');

    let file = null;
    let title = humanize(name);
    let tags = [];
    let readme = '';
    if (isFile(readmePath)) {
      readme = readText(readmePath);
      file = rel(readmePath);
      title = extractTitle(readme, title);
      tags = tagsFor(readme, file);
    }

    const children = [];
    for (const entry of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (isDirectory(full) && !SKIP_DIRS.has(entry)) {
        const child = buildNode(full);
        if (child) children.push(child);
      } else if (entry.endsWith('.md') && entry !== 'README.md' && !IGNORED_FILES.has(entry)) {
        // A loose page beside the modules: listed, but not a lesson, so no reading time and no progress.
        const text = readText(full);
        children.push({ name: entry, path: relDir, file: rel(full), title: extractTitle(text, entry), tags: tagsFor(text, rel(full)), children: [] });
      }
    }

    if (file === null && !children.length) return null;

    const node = { name, path: relDir, file, title, tags, children };
    // A lesson (a leaf) is either still planned or has a reading time. A track or curriculum README is a signpost,
    // not a lesson, so it carries neither: the app counts progress over lessons only.
    if (file && !children.length) {
      const { planned, minutes } = readingFacts(readme);
      if (planned) node.planned = true;
      else node.min = minutes;
    }
    if (file && videoCounts.has(file)) node.videos = videoCounts.get(file);
    return node;
  }

  const tree = curricula.map((c) => path.join(root, c)).filter(isDirectory).map(buildNode).filter(Boolean);

  // The global tag catalogue, so the app can offer tags without walking the tree.
  const counts = new Map();
  const untagged = [];
  let files = 0;
  (function collect(nodes) {
    for (const node of nodes) {
      if (node.file) {
        files += 1;
        if (!node.tags.length) untagged.push(node.file);
        for (const tag of node.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      collect(node.children);
    }
  })(tree);

  const tags = Object.fromEntries([...counts].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)));
  return { index: { tree, tags }, files, untagged };
}
