// "Tidy": lays a drawing out in columns from left to right, the way the Mermaid text is written (flowchart LR). An arrow points from a
// column to a later one. A drawing with a loop (A to B to A) has the arrow that closes the loop ignored for the layout, so it cannot
// go on for ever; boxes that nothing joins go in the first column. The same drawing always gives the same layout.
import { GEOMETRY, nodeSize } from './diagramGeometry.js';
import { snap } from './diagramModel.js';

const SWEEPS = 4;

/** Which column each box is in: the longest run of arrows that leads to it, with the arrows that close a loop left out. */
export function columnsOf(model) {
  const next = new Map(model.nodes.map((n) => [n.id, []]));
  for (const e of model.edges) if (e.from !== e.to && next.has(e.from) && next.has(e.to)) next.get(e.from).push(e.to);

  // Depth-first from each box in turn; an arrow back to a box still being visited closes a loop and is dropped.
  const state = new Map(); // 1 being visited, 2 done
  const forward = new Map(model.nodes.map((n) => [n.id, []]));
  const order = [];
  const visit = (id) => {
    state.set(id, 1);
    for (const to of next.get(id)) {
      if (state.get(to) === 1) continue;
      forward.get(id).push(to);
      if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
    order.push(id);
  };
  for (const n of model.nodes) if (!state.has(n.id)) visit(n.id);

  // `order` is a finishing order, so walking it backwards visits every box after the boxes that lead to it.
  const column = new Map(model.nodes.map((n) => [n.id, 0]));
  for (const id of [...order].reverse()) {
    for (const to of forward.get(id)) column.set(to, Math.max(column.get(to), column.get(id) + 1));
  }
  return column;
}

/** The drawing with every box moved onto the grid in tidy columns. Arrows and labels are untouched. */
export function autoLayout(model) {
  if (!model.nodes.length) return model;
  const column = columnsOf(model);
  const layers = [];
  for (const node of model.nodes) {
    const c = column.get(node.id);
    (layers[c] = layers[c] || []).push(node);
  }
  const rows = layers.map((layer) => layer || []);

  // Order each column by where its neighbours sit in the next one over, a few sweeps each way; ties keep the order they had.
  const rank = new Map();
  const reindex = () => rows.forEach((layer) => layer.forEach((n, i) => rank.set(n.id, i)));
  reindex();
  const average = (n, links) => {
    const ranks = links.map((l) => rank.get(l)).filter((r) => r !== undefined);
    return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : rank.get(n.id);
  };
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const backwards = sweep % 2 === 1;
    const range = rows.map((_, i) => i);
    for (const c of backwards ? range.reverse() : range) {
      const links = (n) => model.edges
        .filter((e) => e.from !== e.to && (backwards ? e.from === n.id : e.to === n.id))
        .map((e) => (backwards ? e.to : e.from))
        .filter((id) => column.get(id) !== c);
      const keyed = rows[c].map((n) => ({ n, key: average(n, links(n)) }));
      rows[c] = keyed.sort((a, b) => (a.key - b.key) || (rank.get(a.n.id) - rank.get(b.n.id))).map((k) => k.n);
      rows[c].forEach((n, i) => rank.set(n.id, i));
    }
  }

  const heights = rows.map((layer) => layer.reduce((sum, n, i) => sum + nodeSize(n).h + (i ? GEOMETRY.tidyRowGap : 0), 0));
  const tallest = Math.max(...heights);
  const placed = new Map();
  let x = GEOMETRY.tidyMargin;
  rows.forEach((layer, c) => {
    let y = GEOMETRY.tidyMargin + snap((tallest - heights[c]) / 2);
    let widest = 0;
    for (const n of layer) {
      const { w, h } = nodeSize(n);
      placed.set(n.id, { x: snap(x), y: snap(y) });
      y += h + GEOMETRY.tidyRowGap;
      widest = Math.max(widest, w);
    }
    x += widest + GEOMETRY.tidyColumnGap;
  });
  const nodes = model.nodes.map((n) => {
    const at = placed.get(n.id);
    return at.x === n.x && at.y === n.y ? n : { ...n, ...at };
  });
  return nodes.every((n, i) => n === model.nodes[i]) ? model : { ...model, nodes };
}
