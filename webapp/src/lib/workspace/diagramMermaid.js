// A drawn diagram as Mermaid `flowchart` text. The text is derived from the drawing, never the other way round: every box gets an id of
// its own (n1, n2, ... so no label or stored id can be a Mermaid keyword, or start with the "o" or "x" that would turn an arrow into a
// circle or a cross) and every label is written inside quotes with anything Mermaid could read as syntax written as an entity code.
import { DIAGRAM_DIRECTION, DIAGRAM_LABEL_FALLBACK, DIAGRAM_SHAPE } from './diagramShapes.js';

// How each shape is written around its label.
const WRAP = {
  [DIAGRAM_SHAPE.rect]: ['[', ']'],
  [DIAGRAM_SHAPE.rounded]: ['(', ')'],
  [DIAGRAM_SHAPE.decision]: ['{', '}'],
  [DIAGRAM_SHAPE.database]: ['[(', ')]'],
  [DIAGRAM_SHAPE.circle]: ['((', '))']
};
const ARROW = { solid: '-->', dashed: '-.->' };

// What cannot be written as it is inside a quoted label. "#" goes first because every entity starts with one.
const ENTITY = { '#': '#35;', '"': '#quot;', '<': '#lt;', '>': '#gt;', '&': '#amp;', '`': '#96;', '%': '#37;', '\\': '#92;' };

/** A label made safe to put between double quotes: one line, with every character Mermaid reads as syntax written as an entity. */
export function escapeLabel(text) {
  return [...String(text ?? '')]
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[#"<>&`%\\]/g, (ch) => ENTITY[ch]);
}

/** The flowchart text for a drawing, or an empty string for a drawing with nothing in it. Arrows to a box that is not there are left out. */
export function toMermaid(model) {
  if (!model.nodes.length) return '';
  const ids = new Map(model.nodes.map((node, i) => [node.id, `n${i + 1}`]));
  const lines = [`flowchart ${DIAGRAM_DIRECTION}`];
  for (const node of model.nodes) {
    const [open, close] = WRAP[node.shape] || WRAP[DIAGRAM_SHAPE.rect];
    lines.push(`  ${ids.get(node.id)}${open}"${escapeLabel(node.label) || DIAGRAM_LABEL_FALLBACK}"${close}`);
  }
  for (const edge of model.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    const label = escapeLabel(edge.label);
    const arrow = edge.dashed ? ARROW.dashed : ARROW.solid;
    lines.push(`  ${ids.get(edge.from)} ${arrow}${label ? `|"${label}"|` : ''} ${ids.get(edge.to)}`);
  }
  return lines.join('\n');
}
