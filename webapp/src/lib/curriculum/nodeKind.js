// What a node is, as the index (scripts/build/gen-docs-index.py) describes it. A curriculum or track README has
// children: a signpost. A module is a leaf with a reading time (`min`). A module nobody has written yet is `planned`,
// a promise. Progress counts modules only: counting signposts and promises as well made "797 to go" out of the
// 570 modules a reader can actually open.
export const isModule = (node) => !!node && node.min != null;
