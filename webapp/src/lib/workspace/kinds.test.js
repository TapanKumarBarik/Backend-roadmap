import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND, KINDS, LIMITS, cleanData, cleanDiagramData, cleanDiagramModel, cleanItemTitle, isCalendarDate, isKind, isLessonPath, kindOf } from './kinds.js';

test('there are five kinds, and a page with no kind is a plain page', () => {
  assert.deepEqual([...KINDS].sort(), ['diagram', 'folder', 'page', 'plan', 'revision']);
  assert.equal(kindOf({ id: 'old' }), KIND.page);
  assert.equal(kindOf({ kind: 'folder' }), KIND.folder);
  assert.equal(kindOf({ kind: 'spreadsheet' }), KIND.page);
  assert.equal(kindOf(null), KIND.page);
  assert.equal(isKind('plan'), true);
  assert.equal(isKind('Plan'), false);
  assert.equal(isKind(5), false);
});

test('a date is a real day, written year-month-day', () => {
  for (const ok of ['2030-01-31', '2028-02-29']) assert.equal(isCalendarDate(ok), true, ok);
  for (const bad of ['2030-02-30', '2029-02-29', '2030-13-01', '30-01-2030', '2030-1-1', '', null, 20300101]) assert.equal(isCalendarDate(bad), false, String(bad));
});

test('a lesson path is short plain text', () => {
  assert.equal(isLessonPath('backend/01/README.md'), true);
  for (const bad of ['', 'a\nb', 'x'.repeat(LIMITS.lessonPathMax + 1), null, 5]) assert.equal(isLessonPath(bad), false);
});

test('control characters are taken out of what is kept, and an empty title falls back', () => {
  assert.equal(cleanItemTitle('  Sessions\u0000 and cookies  '), 'Sessions and cookies');
  assert.equal(cleanItemTitle('   ', 'x/README.md'), 'x/README.md');
  assert.equal(cleanItemTitle('t'.repeat(500)).length, LIMITS.itemTitleMax);
});

test('a diagram keeps its text and line endings are made plain', () => {
  assert.deepEqual(cleanDiagramData({ source: 'a\r\nb\rc' }).data, { source: 'a\nb\nc' });
  assert.ok(cleanDiagramData({ source: 5 }).problem);
  assert.ok(cleanDiagramData(null).problem);
  assert.ok(cleanDiagramData({ source: 'x'.repeat(LIMITS.diagramSourceMax + 1) }).problem);
});

test('a kind with no data of its own keeps an empty object whatever is sent', () => {
  for (const kind of [KIND.page, KIND.folder, KIND.revision]) assert.deepEqual(cleanData(kind, { anything: 1 }).data, {});
});

// ------------------------------------------------------------------------------------------------ a drawn diagram
const DRAWING = {
  nodes: [
    { id: 'n1', label: 'Client', shape: 'circle', x: 40, y: 40 },
    { id: 'n2', label: 'API', shape: 'rect', x: 240, y: 40 }
  ],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'POST /login', dashed: true }]
};

test('a drawn diagram keeps its boxes and arrows, and its source is written from them, whatever source was sent', () => {
  const { data } = cleanDiagramData({ mode: 'visual', model: DRAWING, source: 'flowchart LR\n  evil --> sent' });
  assert.deepEqual(data.model, DRAWING);
  assert.equal(data.mode, 'visual');
  assert.equal(data.source, 'flowchart LR\n  n1(("Client"))\n  n2["API"]\n  n1 -.->|"POST /login"| n2');
  assert.deepEqual(cleanDiagramData({ mode: 'visual', model: { nodes: [], edges: [] } }).data, { source: '', mode: 'visual', model: { nodes: [], edges: [] } });
});

test('a diagram with no mode, or the text mode, is exactly what it was before drawing existed', () => {
  assert.deepEqual(cleanDiagramData({ source: 'flowchart LR\n  A --> B' }).data, { source: 'flowchart LR\n  A --> B' });
  assert.deepEqual(cleanDiagramData({ mode: 'text', source: 'x', model: DRAWING }).data, { source: 'x' }, 'a drawing sent with text is dropped');
  assert.ok(cleanDiagramData({ mode: 'text' }).problem, 'text needs its source');
  assert.ok(cleanDiagramData({ mode: 'sketch', source: 'x' }).problem);
  assert.ok(cleanDiagramData({ mode: null, source: 'x' }).problem);
});

test('a drawing is rebuilt from an allow-list: unknown keys go, words are cleaned and cut, positions are whole numbers', () => {
  const { model } = cleanDiagramModel({
    extra: 'dropped',
    nodes: [{ id: 'n1', label: `  Long\u0000 ${'x'.repeat(100)}`, shape: 'rounded', x: 10.6, y: -3.2, color: 'red', __proto__: { polluted: true } }, { id: 'n2', label: '  ', shape: 'database', x: 0, y: 0 }],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'y'.repeat(100), dashed: 'yes', style: 'bold' }]
  });
  assert.deepEqual(Object.keys(model), ['nodes', 'edges']);
  assert.deepEqual(Object.keys(model.nodes[0]), ['id', 'label', 'shape', 'x', 'y']);
  assert.equal(model.nodes[0].label.length, LIMITS.diagramNodeLabelMax);
  assert.ok(model.nodes[0].label.startsWith('Long xxx') || model.nodes[0].label.startsWith('Longxxx'), 'the control character is gone');
  assert.deepEqual([model.nodes[0].x, model.nodes[0].y], [11, -3]);
  assert.equal(model.nodes[1].label, 'Box', 'a box with no words is called Box');
  assert.deepEqual(Object.keys(model.edges[0]), ['id', 'from', 'to', 'label', 'dashed']);
  assert.equal(model.edges[0].label.length, LIMITS.diagramEdgeLabelMax);
  assert.equal(model.edges[0].dashed, false, 'only true is dashed');
});

test('a drawing that is malformed is refused with a sentence', () => {
  const refused = (model) => cleanDiagramModel(model).problem;
  const node = (over = {}) => ({ id: 'n1', label: 'A', shape: 'rect', x: 0, y: 0, ...over });
  assert.ok(refused(null));
  assert.ok(refused({ nodes: 'x', edges: [] }));
  assert.ok(refused({ nodes: [] }));
  assert.ok(refused({ nodes: [null], edges: [] }));
  assert.ok(refused({ nodes: [node({ id: 'has space' })], edges: [] }), 'ids are short and plain');
  assert.ok(refused({ nodes: [node({ id: 'x'.repeat(41) })], edges: [] }));
  assert.ok(refused({ nodes: [node({ id: 5 })], edges: [] }));
  assert.ok(refused({ nodes: [node(), node()], edges: [] }), 'two boxes with one id');
  assert.ok(refused({ nodes: [node({ shape: 'star' })], edges: [] }), 'a shape that is not known');
  assert.ok(refused({ nodes: [node({ shape: undefined })], edges: [] }));
  assert.ok(refused({ nodes: [node({ x: '5' })], edges: [] }));
  assert.ok(refused({ nodes: [node({ x: Number.NaN })], edges: [] }));
  assert.ok(refused({ nodes: [node({ y: Infinity })], edges: [] }));
  assert.ok(refused({ nodes: [node({ x: LIMITS.diagramCoordMax + 1 })], edges: [] }), 'off the canvas');
  assert.equal(refused({ nodes: [node({ x: LIMITS.diagramCoordMax, y: -LIMITS.diagramCoordMax })], edges: [] }), undefined, 'the edge of the canvas is on it');
  const two = [node(), node({ id: 'n2' })];
  assert.ok(refused({ nodes: two, edges: [{ id: 'e1', from: 'n1', to: 'gone' }] }), 'an arrow to a box that is not there');
  assert.ok(refused({ nodes: two, edges: [{ id: 'e1', from: 'gone', to: 'n1' }] }));
  assert.ok(refused({ nodes: two, edges: [{ id: 'e1', from: 'n1', to: 'n2' }, { id: 'e1', from: 'n2', to: 'n1' }] }), 'two arrows with one id');
  assert.ok(refused({ nodes: two, edges: [{ id: 'bad id', from: 'n1', to: 'n2' }] }));
  assert.equal(refused({ nodes: two, edges: [{ id: 'e1', from: 'n1', to: 'n1' }] }), undefined, 'an arrow from a box to itself is fine');
});

test('a drawing is limited in boxes, arrows and the text written from it', () => {
  const boxes = (n) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: 'A', shape: 'rect', x: 0, y: 0 }));
  assert.equal(cleanDiagramModel({ nodes: boxes(LIMITS.diagramNodesMax), edges: [] }).problem, undefined);
  assert.ok(cleanDiagramModel({ nodes: boxes(LIMITS.diagramNodesMax + 1), edges: [] }).problem);
  const arrows = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, from: 'n0', to: 'n1' }));
  assert.equal(cleanDiagramModel({ nodes: boxes(2), edges: arrows(LIMITS.diagramEdgesMax) }).problem, undefined);
  assert.ok(cleanDiagramModel({ nodes: boxes(2), edges: arrows(LIMITS.diagramEdgesMax + 1) }).problem);
  // every character of these labels is written as a six character entity, so the text is longer than the labels
  const quoted = boxes(LIMITS.diagramNodesMax).map((n) => ({ ...n, label: '"'.repeat(LIMITS.diagramNodeLabelMax) }));
  assert.match(cleanDiagramData({ mode: 'visual', model: { nodes: quoted, edges: [] } }).problem, /too large/);
});
