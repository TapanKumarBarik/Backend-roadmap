// Where a module sits in the thing it belongs to.
//
// docs-index.json nests curriculum → track → module, except where it
// doesn't: lld puts modules straight under the root with no track layer,
// and genai is empty. So "what is this node's parent, and which number is
// it out of how many" is derived from the tree rather than assumed from
// path depth.

// file -> { index, total, unit, parentTitle, parentPath, curriculumTitle }
// index is 1-based, and counts only siblings that are themselves pages.
export function buildPositions(treeData) {
  const positions = {};

  (function walk(nodes, parent, curriculum) {
    const pages = nodes.filter((n) => n.file);
    pages.forEach((n, i) => {
      positions[n.file] = {
        index: i + 1,
        total: pages.length,
        // A node with children is a container of modules — call it a track.
        // A leaf is a module, whichever depth it happens to sit at.
        unit: n.children && n.children.length ? 'Track' : 'Module',
        parentTitle: parent ? (parent.title || parent.name) : null,
        parentPath: parent ? parent.path : null,
        parentNode: parent,
        curriculumTitle: curriculum ? shortTitle(curriculum) : null,
        curriculumPath: curriculum ? curriculum.path : null
      };
    });
    nodes.forEach((n) => {
      if (n.children && n.children.length) walk(n.children, n, curriculum || n);
    });
  })(treeData, null, null);

  return positions;
}

// Curriculum titles are long ("Backend Engineering: Fundamentals →
// Distributed Systems → System Design") — the part before the colon is the
// name people actually use for it.
export function shortTitle(node) {
  const raw = node.title || node.name || '';
  return raw.includes(':') ? raw.split(':')[0].trim() : raw;
}

// Progress across exactly the set that buildPositions counts: the parent's
// children that are themselves pages. subtreeStats can't be used for this —
// it walks the whole subtree including the parent's own README, so a track
// of 14 modules reported 15, and "Module 2 of 14" ended up sitting next to
// a bar reading 2/15.
export function siblingStats(parentNode, statusMap) {
  if (!parentNode || !parentNode.children) return null;
  const pages = parentNode.children.filter((n) => n.file);
  let done = 0, wip = 0;
  pages.forEach((n) => {
    const s = statusMap[n.file] || 'todo';
    if (s === 'done') done++;
    else if (s === 'wip') wip++;
  });
  return { done, wip, total: pages.length };
}

// Track titles carry an ordinal prefix ("01 - Request/Response Fundamentals")
// which earns its place in the tree, where order is the point, but reads as
// noise inside a sentence like "1 / 14 in 01 - Request/Response Fundamentals".
export function stripOrdinal(title) {
  return (title || '').replace(/^\d+\s*[-–—.)]\s*/, '');
}

// The single module the learner should open next.
//   - whatever they were last reading, if they haven't finished it
//   - otherwise the first thing after it they haven't finished
//   - otherwise anything already in progress, then the first unstarted one
// Returns null only when every module is done.
export function pickContinue(flatFiles, statusMap, lastFile) {
  const unfinished = (f) => (statusMap[f] || 'todo') !== 'done';

  if (lastFile && flatFiles.includes(lastFile)) {
    if (unfinished(lastFile)) return lastFile;
    const after = flatFiles.slice(flatFiles.indexOf(lastFile) + 1).find(unfinished);
    if (after) return after;
  }
  return flatFiles.find((f) => statusMap[f] === 'wip')
    || flatFiles.find(unfinished)
    || null;
}

// The few modules queued behind the current one, in curriculum order.
export function nextUp(flatFiles, statusMap, fromFile, limit = 3) {
  const start = fromFile ? flatFiles.indexOf(fromFile) + 1 : 0;
  const out = [];
  for (let i = start; i < flatFiles.length && out.length < limit; i++) {
    if ((statusMap[flatFiles[i]] || 'todo') !== 'done') out.push(flatFiles[i]);
  }
  return out;
}
