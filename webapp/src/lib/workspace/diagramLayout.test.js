import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout, columnsOf } from './diagramLayout.js';
import { GEOMETRY, nodeBox } from './diagramGeometry.js';

const node = (id, label = id, shape = 'rect') => ({ id, label, shape, x: 0, y: 0 });
const edge = (from, to) => ({ id: `${from}-${to}`, from, to, label: '', dashed: false });
const model = (ids, links) => ({ nodes: ids.map((id) => node(id)), edges: links.map(([a, b]) => edge(a, b)) });
const at = (laid, id) => laid.nodes.find((n) => n.id === id);

function overlaps(laid) {
  const boxes = laid.nodes.map(nodeBox);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i];
      const q = boxes[j];
      if (!(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y)) return [i, j];
    }
  }
  return null;
}

test('a chain runs from left to right, one column each', () => {
  const laid = autoLayout(model(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]));
  assert.ok(at(laid, 'a').x < at(laid, 'b').x && at(laid, 'b').x < at(laid, 'c').x);
  assert.equal(at(laid, 'a').y, at(laid, 'b').y, 'one row, so a straight line');
});

test('a box is in the column after the longest run of arrows that leads to it', () => {
  const columns = columnsOf(model(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['a', 'c'], ['a', 'd']]));
  assert.deepEqual([...columns.entries()], [['a', 0], ['b', 1], ['c', 2], ['d', 1]]);
});

test('a loop does not make the layout go on for ever: the arrow that closes it is ignored', () => {
  const columns = columnsOf(model(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]));
  assert.deepEqual([...columns.entries()], [['a', 0], ['b', 1], ['c', 2]]);
  const twoWay = columnsOf(model(['a', 'b'], [['a', 'b'], ['b', 'a']]));
  assert.deepEqual([...twoWay.entries()], [['a', 0], ['b', 1]]);
  const self = columnsOf(model(['a'], [['a', 'a']]));
  assert.equal(self.get('a'), 0);
  const laid = autoLayout(model(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['b', 'b']]));
  assert.equal(overlaps(laid), null);
});

test('boxes that nothing joins are laid out too, in the first column', () => {
  const laid = autoLayout(model(['a', 'b', 'lonely', 'also'], [['a', 'b']]));
  assert.equal(at(laid, 'lonely').x, at(laid, 'a').x);
  assert.equal(at(laid, 'also').x, at(laid, 'a').x);
  assert.equal(overlaps(laid), null);
});

test('boxes fan out in a column without touching, and sit on the grid', () => {
  const ids = ['root', 'a', 'b', 'c', 'd', 'e'];
  const laid = autoLayout(model(ids, ids.slice(1).map((id) => ['root', id])));
  assert.equal(overlaps(laid), null);
  for (const n of laid.nodes) {
    assert.equal(n.x % GEOMETRY.grid, 0);
    assert.equal(n.y % GEOMETRY.grid, 0);
  }
  const ys = ['a', 'b', 'c', 'd', 'e'].map((id) => at(laid, id).y);
  assert.deepEqual([...ys].sort((p, q) => p - q), ys, 'in the order they were drawn');
});

test('a column of different sized boxes keeps the gap between them, and the columns the gap between them', () => {
  const laid = autoLayout({
    nodes: [node('a'), node('b', 'a long long label that takes a second line', 'decision'), node('c', 'C', 'circle')],
    edges: [edge('a', 'b'), edge('a', 'c')]
  });
  const b = nodeBox(at(laid, 'b'));
  const c = nodeBox(at(laid, 'c'));
  const [upper, lower] = b.y < c.y ? [b, c] : [c, b];
  assert.ok(lower.y - (upper.y + upper.h) >= GEOMETRY.tidyRowGap);
  const a = nodeBox(at(laid, 'a'));
  assert.ok(Math.min(b.x, c.x) - (a.x + a.w) >= GEOMETRY.tidyColumnGap);
});

test('the same drawing always gives the same layout, a layout is its own fixed point, and the words and arrows are untouched', () => {
  const start = model(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e'], ['e', 'a']]);
  const once = autoLayout(start);
  assert.deepEqual(autoLayout(structuredClone(start)), once);
  assert.equal(autoLayout(once), once, 'tidying a tidy drawing changes nothing, and says so by returning it');
  assert.deepEqual(once.edges, start.edges);
  assert.deepEqual(once.nodes.map((n) => [n.id, n.label, n.shape]), start.nodes.map((n) => [n.id, n.label, n.shape]));
  assert.equal(start.nodes[0].x, 0, 'the drawing it was given is untouched');
});

test('an empty drawing, and one box, are laid out without trouble', () => {
  const empty = { nodes: [], edges: [] };
  assert.equal(autoLayout(empty), empty);
  const one = autoLayout(model(['a'], []));
  assert.deepEqual([at(one, 'a').x, at(one, 'a').y], [GEOMETRY.tidyMargin, GEOMETRY.tidyMargin]);
});

test('a crossing is untangled by ordering each column by where its neighbours are', () => {
  // a -> d and b -> c would cross if c and d were in the order they were drawn
  const laid = autoLayout(model(['a', 'b', 'd', 'c'], [['a', 'd'], ['b', 'c']]));
  assert.ok(at(laid, 'a').y < at(laid, 'b').y);
  assert.ok(at(laid, 'd').y < at(laid, 'c').y, 'd follows a, c follows b');
});

test('a big drawing is laid out without overlap', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `n${i}`);
  const links = ids.slice(1).map((id, i) => [ids[Math.floor(i / 2)], id]);
  assert.equal(overlaps(autoLayout(model(ids, links))), null);
});
