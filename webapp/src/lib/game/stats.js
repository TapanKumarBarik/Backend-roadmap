// What a reader has achieved, counted from the progress they already have (a status for each module and each piece of practice).
// Pure: the tree and the statuses come in, numbers go out. The rules (how much each thing is worth) are in game.config.json.
import { isModule } from '../curriculum/nodeKind.js';

/**
 * The modules and the tracks of the library, found once from the tree (docs-index.json), so that counting what a reader has done is a pass over
 * two short lists, not a walk of 900 nodes. A track is a node that holds modules of its own (a curriculum whose modules sit straight under it, like
 * low-level design, is one track). A capstone is a module whose folder name matches `capstonePattern`.
 */
export function buildIndex(treeData, capstonePattern) {
  const capstone = new RegExp(capstonePattern, 'i');
  const modules = [];
  const tracks = [];
  (function walk(nodes) {
    for (const node of nodes) {
      const children = node.children || [];
      const direct = children.filter(isModule);
      if (direct.length) tracks.push({ dir: node.path, files: direct.map((m) => m.file) });
      if (isModule(node)) modules.push({ file: node.file, capstone: capstone.test(node.name || '') });
      walk(children);
    }
  })(treeData);
  return { modules, tracks };
}

/**
 * Counts of what is done: modules, capstones, whole tracks, whole learning paths, and the pieces of practice (a solved coding problem and a finished
 * daily drill are saved like a module, under the keys in `keys`). `paths` are the resolved learning paths (each with its `files`).
 */
export function libraryStats(index, statusMap, paths, keys) {
  const done = (file) => statusMap[file] === 'done';
  let modules = 0;
  let capstones = 0;
  for (const m of index.modules) {
    if (!done(m.file)) continue;
    modules += 1;
    if (m.capstone) capstones += 1;
  }
  const tracks = index.tracks.filter((t) => t.files.every(done)).length;
  const finishedPaths = paths.filter((p) => p.files.length > 0 && p.files.every(done)).length;
  let problems = 0;
  let drills = 0;
  for (const [key, status] of Object.entries(statusMap)) {
    if (status !== 'done') continue;
    if (key.startsWith(keys.code)) problems += 1;
    else if (key.startsWith(keys.drill)) drills += 1;
  }
  return { modules, capstones, tracks, paths: finishedPaths, problems, drills };
}

/** The XP those counts are worth, by the table in game.config.json.xp. */
export function xpOf(stats, xp) {
  return stats.modules * xp.module + stats.capstones * xp.capstone + stats.tracks * xp.track + stats.paths * xp.path
    + stats.problems * xp.problem + stats.drills * xp.drill;
}

/** The level an amount of XP is, with how far through it the reader is: `levels` is [{ xp, name }] by the XP needed to reach each. */
export function levelOf(xp, levels) {
  let at = 0;
  while (at + 1 < levels.length && xp >= levels[at + 1].xp) at += 1;
  const current = levels[at];
  const next = levels[at + 1] || null;
  const into = xp - current.xp;
  const span = next ? next.xp - current.xp : 0;
  return {
    n: at + 1,
    name: current.name,
    xp,
    into,
    span,
    next: next ? { n: at + 2, name: next.name, xp: next.xp } : null,
    toNext: next ? next.xp - xp : 0,
    ratio: next ? into / span : 1
  };
}
