// The arithmetic of a scene (components/topics/SceneStage.jsx; the data is content/scenes/*.json, the rules webapp/src/lib/siteContent/scenes.js).
// A scene is a story told in steps over a fixed picture: each step says which parts are on stage, what moves between them, and which numbers
// change. A number set in one step stays until a later step sets it again, so a step only says what is new. Pure, so it is tested without a browser.

/**
 * The numbers on show at a step: every `set` up to and including it, later ones winning. A number not set yet is absent.
 * @param {{ steps: { set?: Record<string, number | string> }[] }} scene
 * @param {number} index
 * @returns {Record<string, number | string>}
 */
export function metricsAt(scene, index) {
  const values = {};
  for (let i = 0; i <= Math.min(index, scene.steps.length - 1); i++) Object.assign(values, scene.steps[i].set || {});
  return values;
}

/**
 * What this step changed: each number that has a different value than at the step before, with both (`from` is undefined the first time it appears).
 * @returns {{ id: string, from: number | string | undefined, to: number | string }[]}
 */
export function changesAt(scene, index) {
  const now = metricsAt(scene, index);
  const before = index > 0 ? metricsAt(scene, index - 1) : {};
  return Object.keys(now).filter((id) => now[id] !== before[id]).map((id) => ({ id, from: before[id], to: now[id] }));
}

/** The parts that are on stage at a step (a step that does not say keeps the parts of the one before). */
export function shownAt(scene, index) {
  let shown = scene.nodes.map((n) => n.id);
  for (let i = 0; i <= Math.min(index, scene.steps.length - 1); i++) if (scene.steps[i].show) shown = scene.steps[i].show;
  return shown;
}

/**
 * Where a flow runs, in the scene's own units: the line from one part to the other, stopped at the edge of each part's card (`half` is the card's
 * half width and half height) so the arrowhead is not hidden behind it, nudged sideways for a reply so a request and its answer do not lie on top
 * of each other, and the point on it where the label sits.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {string} [kind]
 * @param {{ w: number, h: number }} [half]
 * @returns {{ x1: number, y1: number, x2: number, y2: number, mx: number, my: number, lx: number, ly: number, align: 'start' | 'center' | 'end', d: string }}
 */
export function flowGeometry(a, b, kind, half = { w: 0, h: 0 }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const side = kind === 'response' || kind === 'hit' || kind === 'miss' || kind === 'stale' ? 1.8 : 0; // replies run beside the request, not on it
  const ox = (-dy / length) * side;
  const oy = (dx / length) * side;
  // The fraction of the way from one centre to the other at which the line leaves the card (the card is a rectangle, so the nearer edge wins).
  const cut = half.w || half.h ? Math.min(1, Math.min(half.w / (Math.abs(dx) || 1e-9), half.h / (Math.abs(dy) || 1e-9)) + 0.015) : 0; // no card, no trimming
  const x1 = a.x + dx * cut + ox;
  const y1 = a.y + dy * cut + oy;
  const x2 = b.x - dx * cut + ox;
  const y2 = b.y - dy * cut + oy;
  const round = (n) => Math.round(n * 100) / 100;
  // The label sits beside its line, on the side the line was nudged to (a request, not nudged, takes the side the reply is not on), so a request and its
  // reply never put their labels on the same spot. On a mostly vertical line the label hangs off the side of it (its edge, not its middle, at the point).
  const nx = -dy / length;
  const ny = dx / length;
  const vertical = Math.abs(nx) > Math.abs(ny);
  const away = side + (vertical ? 1.6 : 3.1);
  const lx = (x1 + x2) / 2 + nx * away;
  const ly = (y1 + y2) / 2 + ny * away;
  const align = vertical ? (nx > 0 ? 'start' : 'end') : 'center';
  return { x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), mx: round((x1 + x2) / 2), my: round((y1 + y2) / 2), lx: round(lx), ly: round(ly), align, d: `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}` };
}

/** The little triangle at the end of a flow, as a path: its tip at (x2, y2), pointing away from (x1, y1). */
export function arrowHead(x1, y1, x2, y2, size = 1.7) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const round = (n) => Math.round(n * 100) / 100;
  const wing = (turn) => `${round(x2 - size * Math.cos(angle + turn))} ${round(y2 - size * Math.sin(angle + turn))}`;
  return `M ${round(x2)} ${round(y2)} L ${wing(-0.45)} L ${wing(0.45)} Z`;
}

/** A number as the tiles show it: whole numbers as they are, others to at most 2 decimals, text as it is, and a dash for a number not set yet. */
export function formatMetric(value, unit = '') {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  const text = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return `${text}${unit}`;
}
