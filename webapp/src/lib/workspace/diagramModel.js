// Changing a drawing: every function takes a model ({ nodes, edges }) and gives back a new one, never changing the one it was given. A
// change that changes nothing gives back the very same model, so the undo history can tell it should not record a step.
import { LIMITS } from './kinds.js';
import { GEOMETRY, nodeBox } from './diagramGeometry.js';
import { toMermaid } from './diagramMermaid.js';

export const emptyModel = () => ({ nodes: [], edges: [] });

/** The nearest step of the grid. */
export const snap = (value, grid = GEOMETRY.grid) => Math.round(value / grid) * grid;
const inCanvas = (value) => Math.max(-LIMITS.diagramCoordMax, Math.min(LIMITS.diagramCoordMax, value));

/** The first id of the form `prefix1`, `prefix2`, ... that none of `items` has. */
function freshId(prefix, items) {
  const used = new Set(items.map((item) => item.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
export const NODE_ID_PREFIX = 'n';
export const EDGE_ID_PREFIX = 'e';

/** Can a drawing this big be kept? (The number of boxes and arrows, and the length of the Mermaid text that is written from it.) */
export function fits(model) {
  return model.nodes.length <= LIMITS.diagramNodesMax
    && model.edges.length <= LIMITS.diagramEdgesMax
    && toMermaid(model).length <= LIMITS.diagramSourceMax;
}

/** Adds a box: `{ model, node }`, or null when the drawing is full. */
export function addNode(model, { shape, label, x, y }) {
  if (model.nodes.length >= LIMITS.diagramNodesMax) return null;
  const node = { id: freshId(NODE_ID_PREFIX, model.nodes), label, shape, x: inCanvas(snap(x)), y: inCanvas(snap(y)) };
  return { model: { ...model, nodes: [...model.nodes, node] }, node };
}

/** Puts a box on the grid at (x, y). */
export function moveNode(model, id, x, y) {
  const nx = inCanvas(snap(x));
  const ny = inCanvas(snap(y));
  const node = model.nodes.find((n) => n.id === id);
  if (!node || (node.x === nx && node.y === ny)) return model;
  return { ...model, nodes: model.nodes.map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)) };
}

/** Changes a box's `label` and/or `shape`. */
export function updateNode(model, id, patch) {
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return model;
  const next = { ...node, ...('label' in patch ? { label: patch.label } : {}), ...('shape' in patch ? { shape: patch.shape } : {}) };
  if (next.label === node.label && next.shape === node.shape) return model;
  return { ...model, nodes: model.nodes.map((n) => (n.id === id ? next : n)) };
}

/** Takes a box away, and the arrows that went to or from it. */
export function removeNode(model, id) {
  if (!model.nodes.some((n) => n.id === id)) return model;
  return { nodes: model.nodes.filter((n) => n.id !== id), edges: model.edges.filter((e) => e.from !== id && e.to !== id) };
}

/**
 * Joins two boxes with an arrow: `{ model, edge }`. When they are already joined that way (the same direction) nothing is added and
 * `{ model, edge, existing: true }` names the arrow that is there; null when the boxes are not there or the drawing is full.
 */
export function connect(model, from, to) {
  if (!model.nodes.some((n) => n.id === from) || !model.nodes.some((n) => n.id === to)) return null;
  const there = model.edges.find((e) => e.from === from && e.to === to);
  if (there) return { model, edge: there, existing: true };
  if (model.edges.length >= LIMITS.diagramEdgesMax) return null;
  const edge = { id: freshId(EDGE_ID_PREFIX, model.edges), from, to, label: '', dashed: false };
  return { model: { ...model, edges: [...model.edges, edge] }, edge, existing: false };
}

/** Changes an arrow's `label` and/or `dashed`. */
export function updateEdge(model, id, patch) {
  const edge = model.edges.find((e) => e.id === id);
  if (!edge) return model;
  const next = { ...edge, ...('label' in patch ? { label: patch.label } : {}), ...('dashed' in patch ? { dashed: patch.dashed === true } : {}) };
  if (next.label === edge.label && next.dashed === edge.dashed) return model;
  return { ...model, edges: model.edges.map((e) => (e.id === id ? next : e)) };
}

export function removeEdge(model, id) {
  if (!model.edges.some((e) => e.id === id)) return model;
  return { ...model, edges: model.edges.filter((e) => e.id !== id) };
}

/** The rectangle that holds every box, or null for an empty drawing. */
export function bounds(model) {
  if (!model.nodes.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of model.nodes) {
    const b = nodeBox(node);
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.w);
    bottom = Math.max(bottom, b.y + b.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * A place for a new box that is on the grid and covers no other box, as near (x, y) as a left-to-right, top-to-bottom walk over a
 * lattice of cells gets. `size` is the box that will go there.
 */
export function freeSpot(model, { x, y }, size = { w: GEOMETRY.minWidth, h: GEOMETRY.minHeight }) {
  const stepX = size.w + GEOMETRY.grid * 2;
  const stepY = size.h + GEOMETRY.grid * 2;
  const boxes = model.nodes.map(nodeBox);
  const covers = (px, py) => boxes.some((b) => px < b.x + b.w + GEOMETRY.grid && px + size.w + GEOMETRY.grid > b.x && py < b.y + b.h + GEOMETRY.grid && py + size.h + GEOMETRY.grid > b.y);
  const startX = snap(x);
  const startY = snap(y);
  for (let i = 0; i < LIMITS.diagramNodesMax * 2; i++) {
    const px = startX + (i % GEOMETRY.spotColumns) * stepX;
    const py = startY + Math.floor(i / GEOMETRY.spotColumns) * stepY;
    if (!covers(px, py)) return { x: px, y: py };
  }
  return { x: startX, y: startY };
}
