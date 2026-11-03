import test from 'node:test';
import assert from 'node:assert/strict';
import { GEOMETRY, boundaryPoint, edgeGeometry, nodeBox, nodeSize, wrapLabel } from './diagramGeometry.js';
import { DIAGRAM_SHAPES } from './diagramShapes.js';

const node = (id, x, y, shape = 'rect', label = 'Box') => ({ id, label, shape, x, y });
const edge = (id, from, to) => ({ id, from, to, label: '', dashed: false });
const numbers = (text) => text.match(/-?\d+(\.\d+)?/g).map(Number);

test('a label wraps at word boundaries, cuts a word that is too long, and ends in an ellipsis when it has too many lines', () => {
  assert.deepEqual(wrapLabel('Auth service'), ['Auth service']);
  assert.deepEqual(wrapLabel('The authentication and authorization service'), ['The authentication and', 'authorization service']);
  assert.deepEqual(wrapLabel('x'.repeat(30)), ['x'.repeat(22), 'x'.repeat(8)]);
  const long = wrapLabel('one two three four five six seven eight nine ten eleven twelve thirteen fourteen');
  assert.equal(long.length, GEOMETRY.linesMax);
  assert.ok(long[long.length - 1].endsWith('…'));
  assert.deepEqual(wrapLabel(''), []);
  assert.deepEqual(wrapLabel('   '), []);
});

test('every box is whole grid steps wide and tall, at least the smallest for its shape, and wider for longer words', () => {
  for (const shape of DIAGRAM_SHAPES) {
    for (const label of ['', 'A', 'A fairly long label that wraps onto more than one line of the box']) {
      const { w, h } = nodeSize(node('a', 0, 0, shape, label));
      assert.equal(w % GEOMETRY.grid, 0, `${shape} width`);
      assert.equal(h % GEOMETRY.grid, 0, `${shape} height`);
      assert.ok(w >= GEOMETRY.minWidth || shape === 'circle');
    }
  }
  assert.ok(nodeSize(node('a', 0, 0, 'rect', 'Authentication service')).w > nodeSize(node('a', 0, 0, 'rect', 'API')).w);
  assert.ok(nodeSize(node('a', 0, 0, 'rect', 'one two three four five six seven eight nine ten eleven')).h > nodeSize(node('a', 0, 0, 'rect', 'one')).h);
  const circle = nodeSize(node('a', 0, 0, 'circle', 'Start'));
  assert.equal(circle.w, circle.h);
  assert.ok(nodeSize(node('a', 0, 0, 'decision', 'Is it?')).h >= GEOMETRY.decisionMinHeight);
});

test('a box is its corner, its size and its middle', () => {
  const box = nodeBox(node('a', 40, 60));
  assert.deepEqual(box, { x: 40, y: 60, w: 100, h: 60, cx: 90, cy: 90 });
});

test('a line from the middle of a box leaves it at its outline, whatever the shape', () => {
  const rect = node('a', 0, 0, 'rect');
  assert.deepEqual(boundaryPoint(rect, { x: 500, y: 30 }), { x: 100, y: 30 }, 'straight out of the right side');
  assert.deepEqual(boundaryPoint(rect, { x: 50, y: -500 }), { x: 50, y: 0 }, 'straight out of the top');
  const at = boundaryPoint(rect, { x: 300, y: 330 });
  assert.ok(Math.abs(Math.abs(at.x - 50) / 50 - 1) < 1e-9 || Math.abs(Math.abs(at.y - 30) / 30 - 1) < 1e-9, 'on the edge');
  const decision = node('d', 0, 0, 'decision');
  const { w, h } = nodeSize(decision);
  const out = boundaryPoint(decision, { x: w / 2 + 1000, y: h / 2 });
  assert.ok(Math.abs(out.x - w) < 1e-9 && Math.abs(out.y - h / 2) < 1e-9, 'a diamond is left at its point');
  const circle = node('c', 0, 0, 'circle');
  const c = nodeBox(circle);
  const q = boundaryPoint(circle, { x: c.cx + 300, y: c.cy + 400 });
  assert.ok(Math.abs(Math.hypot(q.x - c.cx, q.y - c.cy) - c.w / 2) < 1e-9, 'a circle is left at its radius');
  assert.deepEqual(boundaryPoint(rect, { x: 50, y: 30 }), { x: 50, y: 30 }, 'towards its own middle: stays put, no NaN');
});

test('an arrow runs from the outline of one box to the outline of the other', () => {
  const model = { nodes: [node('a', 0, 0), node('b', 300, 0)], edges: [edge('e1', 'a', 'b')] };
  const g = edgeGeometry(model).e1;
  assert.deepEqual(numbers(g.d), [100, 30, 300, 30]);
  assert.deepEqual(g.label, { x: 200, y: 30 });
});

test('arrows between the same two boxes are bent apart, whichever way they point', () => {
  const model = { nodes: [node('a', 0, 0), node('b', 300, 0)], edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'a'), edge('e3', 'a', 'b')] };
  const g = edgeGeometry(model);
  const labels = ['e1', 'e2', 'e3'].map((id) => g[id].label.y);
  assert.equal(new Set(labels.map((y) => Math.round(y))).size, 3, 'three different paths');
  for (const id of ['e1', 'e2', 'e3']) assert.ok(numbers(g[id].d).every(Number.isFinite));
  const alone = edgeGeometry({ nodes: model.nodes, edges: [edge('e1', 'a', 'b')] });
  assert.ok(alone.e1.d.includes(' L '), 'one arrow on its own is straight');
  assert.ok(g.e1.d.includes(' Q '), 'two or more are curved');
});

test('an arrow from a box to itself is a loop above it', () => {
  const model = { nodes: [node('a', 100, 200)], edges: [edge('e1', 'a', 'a')] };
  const g = edgeGeometry(model).e1;
  assert.match(g.d, /^M .* C /);
  assert.ok(g.label.y < 200, 'its words are above the box');
  assert.ok(numbers(g.d).every(Number.isFinite));
});

test('boxes drawn on top of each other give an arrow, not NaN, and an arrow to a box that is not there gives nothing', () => {
  const model = { nodes: [node('a', 0, 0), node('b', 0, 0)], edges: [edge('e1', 'a', 'b'), edge('e2', 'a', 'gone')] };
  const g = edgeGeometry(model);
  assert.ok(numbers(g.e1.d).every(Number.isFinite));
  assert.equal(g.e2, undefined);
});
