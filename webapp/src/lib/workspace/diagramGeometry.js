// Where a box and an arrow are on the canvas, as pure arithmetic over the model ({ nodes: [{ id, label, shape, x, y }],
// edges: [{ id, from, to, label, dashed }] }). A box's x and y are its top-left corner, in canvas units on a grid.
import { DIAGRAM_SHAPE } from './diagramShapes.js';

export const GEOMETRY = Object.freeze({
  /** Boxes snap to this, and are sized in whole steps of it. */
  grid: 20,
  /** Roughly how wide a character of the label is, and how tall a line. */
  charWidth: 7.6,
  lineHeight: 16,
  /** Room between the words and the edge of a box. */
  padX: 18,
  padY: 14,
  /** A label wraps at this many characters, to at most this many lines. */
  wrapAt: 22,
  linesMax: 3,
  /** The smallest a box is: a box, a diamond, a circle. */
  minWidth: 100,
  minHeight: 60,
  decisionMinWidth: 120,
  decisionMinHeight: 80,
  circleMin: 80,
  /** The cap of a cylinder. */
  capHeight: 14,
  /** How far apart arrows are drawn when two boxes have more than one between them. */
  parallelGap: 40,
  /** How high a loop on one box rises above it. */
  loopRise: 46,
  /** A new box looks for a free place along rows of this many. */
  spotColumns: 6,
  /** "Tidy" leaves this much between columns of boxes, and between boxes in a column. */
  tidyColumnGap: 100,
  tidyRowGap: 40,
  tidyMargin: 40
});

const up = (value) => Math.ceil(value / GEOMETRY.grid) * GEOMETRY.grid;

/** A label broken into lines of at most `wrapAt` characters (a long word is cut), the last line ending in "…" if it was cut short. */
export function wrapLabel(label, wrapAt = GEOMETRY.wrapAt, linesMax = GEOMETRY.linesMax) {
  const words = String(label || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    while (word.length > wrapAt) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, wrapAt));
      word = word.slice(wrapAt);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= wrapAt) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length <= linesMax) return lines;
  const kept = lines.slice(0, linesMax);
  kept[linesMax - 1] = `${kept[linesMax - 1].slice(0, wrapAt - 1)}…`;
  return kept;
}

/** The size of a box: wide enough for its longest line, tall enough for its lines, in whole grid steps. */
export function nodeSize(node) {
  const lines = wrapLabel(node.label);
  const count = Math.max(lines.length, 1);
  const text = Math.max(...lines.map((l) => l.length), 1) * GEOMETRY.charWidth;
  const textHeight = count * GEOMETRY.lineHeight;
  if (node.shape === DIAGRAM_SHAPE.decision) {
    return { w: Math.max(GEOMETRY.decisionMinWidth, up(text * 1.5 + 2 * GEOMETRY.padX)), h: Math.max(GEOMETRY.decisionMinHeight, up(textHeight * 1.7 + 2 * GEOMETRY.padY)) };
  }
  if (node.shape === DIAGRAM_SHAPE.circle) {
    const d = Math.max(GEOMETRY.circleMin, up(Math.max(text, textHeight) * 1.3 + 2 * GEOMETRY.padX));
    return { w: d, h: d };
  }
  const cap = node.shape === DIAGRAM_SHAPE.database ? GEOMETRY.capHeight : 0;
  return { w: Math.max(GEOMETRY.minWidth, up(text + 2 * GEOMETRY.padX)), h: Math.max(GEOMETRY.minHeight, up(textHeight + 2 * GEOMETRY.padY + cap)) };
}

/** The box as a rectangle: its corner, its size, its middle. */
export function nodeBox(node) {
  const { w, h } = nodeSize(node);
  return { x: node.x, y: node.y, w, h, cx: node.x + w / 2, cy: node.y + h / 2 };
}

/** Where a line from the middle of `node` towards `toward` leaves the node's outline. */
export function boundaryPoint(node, toward) {
  const b = nodeBox(node);
  const dx = toward.x - b.cx;
  const dy = toward.y - b.cy;
  if (dx === 0 && dy === 0) return { x: b.cx, y: b.cy };
  let t;
  if (node.shape === DIAGRAM_SHAPE.circle) t = (b.w / 2) / Math.hypot(dx, dy);
  else if (node.shape === DIAGRAM_SHAPE.decision) t = 1 / (Math.abs(dx) / (b.w / 2) + Math.abs(dy) / (b.h / 2));
  else t = Math.min(dx === 0 ? Infinity : (b.w / 2) / Math.abs(dx), dy === 0 ? Infinity : (b.h / 2) / Math.abs(dy));
  return { x: b.cx + dx * t, y: b.cy + dy * t };
}

const round = (n) => Math.round(n * 10) / 10;
const pt = (p) => `${round(p.x)} ${round(p.y)}`;

/**
 * How every arrow is drawn: `{ [edge id]: { d, label: { x, y } } }`, `d` being an SVG path. An arrow is a straight line from the outline
 * of one box to the outline of the other; arrows between the same two boxes (either way round) are bent apart so none hides another;
 * an arrow from a box to itself is a loop above it. Boxes drawn on top of each other give a short arrow, never NaN.
 */
export function edgeGeometry(model) {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const groups = new Map();
  for (const edge of model.edges) {
    const key = [edge.from, edge.to].sort().join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  const out = {};
  for (const edges of groups.values()) {
    edges.sort((a, b) => (a.id < b.id ? -1 : 1));
    edges.forEach((edge, slot) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return;
      const a = nodeBox(from);
      const b = nodeBox(to);
      if (from === to) {
        const sx = a.x + a.w * 0.7;
        const ex = a.x + a.w * 0.3;
        const rise = GEOMETRY.loopRise * (slot + 1);
        out[edge.id] = { d: `M ${pt({ x: sx, y: a.y })} C ${pt({ x: sx + 10, y: a.y - rise })} ${pt({ x: ex - 10, y: a.y - rise })} ${pt({ x: ex, y: a.y })}`, label: { x: a.cx, y: a.y - rise * 0.75 - 6 } };
        return;
      }
      // The bend is measured from the same side whichever way an arrow points, so A to B and B to A part company.
      const [p, q] = edge.from < edge.to ? [a, b] : [b, a];
      const len = Math.hypot(q.cx - p.cx, q.cy - p.cy);
      const perp = len === 0 ? { x: 0, y: -1 } : { x: -(q.cy - p.cy) / len, y: (q.cx - p.cx) / len };
      const offset = (slot - (edges.length - 1) / 2) * GEOMETRY.parallelGap;
      const mid = { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 };
      const control = { x: mid.x + perp.x * offset * 2, y: mid.y + perp.y * offset * 2 };
      const start = boundaryPoint(from, control);
      const end = boundaryPoint(to, control);
      if (offset === 0) {
        out[edge.id] = { d: `M ${pt(start)} L ${pt(end)}`, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
      } else {
        out[edge.id] = {
          d: `M ${pt(start)} Q ${pt(control)} ${pt(end)}`,
          label: { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y }
        };
      }
    });
  }
  return out;
}
