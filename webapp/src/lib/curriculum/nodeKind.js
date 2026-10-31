// What a node is, as the index (scripts/lib/docsIndex.mjs) describes it. A curriculum or track README has
// children: a signpost. A module is a leaf with a reading time (`min`). A module nobody has written yet is `planned`,
// a promise. Progress counts modules only: counting signposts and promises as well made "797 to go" out of the
// 570 modules a reader can actually open.
export const isModule = (node) => !!node && node.min != null;

// The modules at or under a node, in reading order.
export function modulesUnder(node) {
  const modules = [];
  (function walk(n) {
    if (isModule(n)) modules.push(n);
    (n.children || []).forEach(walk);
  })(node);
  return modules;
}
