import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_ID_PREFIX, NODE_ID_PREFIX, addNode, bounds, connect, emptyModel, fits, freeSpot, moveNode, removeEdge, removeNode, snap, updateEdge, updateNode } from './diagramModel.js';
import { GEOMETRY, nodeBox } from './diagramGeometry.js';
import { LIMITS } from './kinds.js';

const NEW = { shape: 'rect', label: 'Box', x: 0, y: 0 };
const withBoxes = (n) => {
  let model = emptyModel();
  for (let i = 0; i < n; i++) model = addNode(model, { ...NEW, label: `Box ${i + 1}`, x: i * 200 }).model;
  return model;
};

test('a box is put on the grid, and gets an id nothing else in the drawing has', () => {
  const first = addNode(emptyModel(), { shape: 'circle', label: 'Start', x: 33, y: 47 });
  assert.deepEqual(first.node, { id: `${NODE_ID_PREFIX}1`, label: 'Start', shape: 'circle', x: 40, y: 40 });
  const second = addNode(first.model, NEW);
  assert.equal(second.node.id, `${NODE_ID_PREFIX}2`);
  const gone = removeNode(second.model, 'n1');
  assert.equal(addNode(gone, NEW).node.id, 'n1', 'the first id that is free is used again');
  assert.deepEqual(emptyModel(), { nodes: [], edges: [] });
});

test('a drawing is full at the limit, and gives back nothing to add to', () => {
  const full = withBoxes(LIMITS.diagramNodesMax);
  assert.equal(addNode(full, NEW), null);
  assert.equal(fits(full), true);
  assert.equal(fits({ ...full, nodes: [...full.nodes, { ...NEW, id: 'extra' }] }), false);
});

test('a box snaps to the grid when it is moved, stays in the canvas, and a move that changes nothing returns the very same drawing', () => {
  const model = withBoxes(1);
  const moved = moveNode(model, 'n1', 51, 29);
  assert.deepEqual([moved.nodes[0].x, moved.nodes[0].y], [60, 20]);
  assert.equal(moveNode(moved, 'n1', 59, 21), moved, 'the same grid point: no change');
  assert.equal(moveNode(moved, 'nope', 1, 1), moved);
  assert.equal(moveNode(model, 'n1', 1e9, -1e9).nodes[0].x, LIMITS.diagramCoordMax);
  assert.equal(moveNode(model, 'n1', 1e9, -1e9).nodes[0].y, -LIMITS.diagramCoordMax);
  assert.equal(snap(30), 40, 'half way rounds up');
  assert.equal(snap(29), 20);
  assert.equal(model.nodes[0].x, 0, 'the drawing it was given is untouched');
});

test('words and shape are changed one box at a time, and changing nothing returns the same drawing', () => {
  const model = withBoxes(2);
  const renamed = updateNode(model, 'n2', { label: 'Gateway', shape: 'decision' });
  assert.deepEqual([renamed.nodes[1].label, renamed.nodes[1].shape, renamed.nodes[0].label], ['Gateway', 'decision', 'Box 1']);
  assert.equal(updateNode(renamed, 'n2', { label: 'Gateway' }), renamed);
  assert.equal(updateNode(renamed, 'nope', { label: 'x' }), renamed);
});

test('joining two boxes makes one arrow, and joining them again names the arrow that is there', () => {
  const model = withBoxes(2);
  const joined = connect(model, 'n1', 'n2');
  assert.deepEqual(joined.edge, { id: `${EDGE_ID_PREFIX}1`, from: 'n1', to: 'n2', label: '', dashed: false });
  assert.equal(joined.existing, false);
  const again = connect(joined.model, 'n1', 'n2');
  assert.equal(again.existing, true);
  assert.equal(again.model, joined.model);
  assert.equal(again.edge.id, 'e1');
  assert.equal(connect(joined.model, 'n2', 'n1').existing, false, 'the other way round is another arrow');
  assert.equal(connect(model, 'n1', 'missing'), null);
  assert.equal(connect(joined.model, 'n1', 'n1').edge.to, 'n1', 'a box can be joined to itself');
});

test('arrows are limited in number', () => {
  let drawn = withBoxes(12);
  let count = 0;
  for (let a = 1; a <= 12 && count < LIMITS.diagramEdgesMax; a++) {
    for (let b = 1; b <= 12 && count < LIMITS.diagramEdgesMax; b++) {
      if (a === b) continue;
      drawn = connect(drawn, `n${a}`, `n${b}`).model;
      count++;
    }
  }
  assert.equal(drawn.edges.length, LIMITS.diagramEdgesMax);
  assert.equal(connect(drawn, 'n1', 'n1'), null, 'full');
  assert.equal(connect(drawn, 'n1', 'n2').existing, true, 'but an arrow that is there is still found');
});

test('an arrow\'s words and dashes are changed, and nothing else about it', () => {
  const { model } = connect(withBoxes(2), 'n1', 'n2');
  const labelled = updateEdge(model, 'e1', { label: 'yes', dashed: true });
  assert.deepEqual(labelled.edges[0], { id: 'e1', from: 'n1', to: 'n2', label: 'yes', dashed: true });
  assert.equal(updateEdge(labelled, 'e1', { label: 'yes', dashed: true }), labelled);
  assert.equal(updateEdge(labelled, 'e1', { dashed: 'yes' }).edges[0].dashed, false, 'only true is dashed');
});

test('deleting a box deletes the arrows that went to or from it; deleting an arrow leaves the boxes', () => {
  let model = withBoxes(3);
  model = connect(model, 'n1', 'n2').model;
  model = connect(model, 'n2', 'n3').model;
  model = connect(model, 'n3', 'n1').model;
  const without = removeNode(model, 'n2');
  assert.deepEqual(without.nodes.map((n) => n.id), ['n1', 'n3']);
  assert.deepEqual(without.edges.map((e) => `${e.from}>${e.to}`), ['n3>n1']);
  assert.equal(removeNode(model, 'nope'), model);
  const unlinked = removeEdge(model, 'e1');
  assert.equal(unlinked.nodes.length, 3);
  assert.equal(unlinked.edges.length, 2);
  assert.equal(removeEdge(model, 'nope'), model);
});

test('the rectangle round every box', () => {
  assert.equal(bounds(emptyModel()), null);
  const model = addNode(addNode(emptyModel(), { ...NEW, x: 20, y: 40 }).model, { ...NEW, x: 300, y: 200 }).model;
  const far = nodeBox(model.nodes[1]);
  assert.deepEqual(bounds(model), { x: 20, y: 40, w: 300 + far.w - 20, h: 200 + far.h - 40 });
});

test('a new box goes on a free place on the grid, as near as there is room', () => {
  assert.deepEqual(freeSpot(emptyModel(), { x: 33, y: 47 }), { x: 40, y: 40 });
  const model = addNode(emptyModel(), { ...NEW, x: 40, y: 40 }).model;
  const spot = freeSpot(model, { x: 40, y: 40 });
  assert.notDeepEqual(spot, { x: 40, y: 40 });
  assert.equal(spot.x % GEOMETRY.grid, 0);
  assert.equal(spot.y % GEOMETRY.grid, 0);
  const a = nodeBox(model.nodes[0]);
  const overlaps = spot.x < a.x + a.w && spot.x + GEOMETRY.minWidth > a.x && spot.y < a.y + a.h && spot.y + GEOMETRY.minHeight > a.y;
  assert.equal(overlaps, false);
  // a crowded canvas still finds a place for every box, and none covers another
  let crowded = emptyModel();
  for (let i = 0; i < 30; i++) {
    const at = freeSpot(crowded, { x: 40, y: 40 });
    crowded = addNode(crowded, { ...NEW, x: at.x, y: at.y }).model;
  }
  const boxes = crowded.nodes.map(nodeBox);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i];
      const q = boxes[j];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `box ${i} and ${j} do not overlap`);
    }
  }
});

test('a drawing whose text would be too long to keep does not fit', () => {
  const long = 'x'.repeat(LIMITS.diagramNodeLabelMax);
  let model = emptyModel();
  for (let i = 0; i < LIMITS.diagramNodesMax; i++) model = addNode(model, { ...NEW, label: long.replace(/x/g, '"') }).model;
  assert.equal(model.nodes.length, LIMITS.diagramNodesMax);
  assert.equal(fits(model), false, 'sixty boxes of sixty quotes each are written as far more than the source may hold');
});
