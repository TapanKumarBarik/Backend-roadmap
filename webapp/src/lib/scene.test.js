import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrowHead, changesAt, flowGeometry, formatMetric, metricsAt, shownAt } from './scene.js';
import { sceneProblems } from './siteContent/scenes.js';

const scene = {
  id: 'demo', title: 'A demo scene', caption: 'Illustrative numbers for the demo.',
  nodes: [
    { id: 'a', label: 'Alpha', icon: 'server', x: 20, y: 50 },
    { id: 'b', label: 'Beta', icon: 'database', x: 70, y: 50 },
    { id: 'c', label: 'Gamma', icon: 'bolt', x: 45, y: 20 }
  ],
  metrics: [{ id: 'ms', label: 'Time', unit: ' ms' }, { id: 'fresh', label: 'Data' }],
  steps: [
    { title: 'First step', text: 'The first step of the demo says something long enough to count.', show: ['a', 'b'], flows: [{ from: 'a', to: 'b', kind: 'request', label: 'ask' }], set: { ms: 20 } },
    { title: 'Second step', text: 'The second step brings a new part on stage and changes a number.', show: ['a', 'b', 'c'], flows: [{ from: 'a', to: 'c' }], set: { ms: 5, fresh: 'fresh' } },
    { title: 'Third step', text: 'The third step changes nothing about the numbers or the parts shown.', flows: [{ from: 'c', to: 'a', kind: 'response' }] }
  ]
};

test('a number set in a step stays until a later step sets it again', () => {
  assert.deepEqual(metricsAt(scene, 0), { ms: 20 });
  assert.deepEqual(metricsAt(scene, 1), { ms: 5, fresh: 'fresh' });
  assert.deepEqual(metricsAt(scene, 2), { ms: 5, fresh: 'fresh' });
  assert.deepEqual(metricsAt(scene, 99), { ms: 5, fresh: 'fresh' }, 'past the end is the end');
});

test('what a step changed is each number that differs from the step before, with both values', () => {
  assert.deepEqual(changesAt(scene, 0), [{ id: 'ms', from: undefined, to: 20 }]);
  assert.deepEqual(changesAt(scene, 1), [{ id: 'ms', from: 20, to: 5 }, { id: 'fresh', from: undefined, to: 'fresh' }]);
  assert.deepEqual(changesAt(scene, 2), []);
});

test('the parts on stage are those of the latest step that says, and all of them before any does', () => {
  assert.deepEqual(shownAt(scene, 0), ['a', 'b']);
  assert.deepEqual(shownAt(scene, 1), ['a', 'b', 'c']);
  assert.deepEqual(shownAt(scene, 2), ['a', 'b', 'c'], 'a step that does not say keeps the parts of the one before');
  assert.deepEqual(shownAt({ ...scene, steps: [{ ...scene.steps[2] }] }, 0), ['a', 'b', 'c']);
});

test('a request runs between the parts, and a reply runs beside it so the two do not overlap', () => {
  const a = { x: 10, y: 30 };
  const b = { x: 50, y: 30 };
  const request = flowGeometry(a, b, 'request');
  assert.deepEqual([request.x1, request.y1, request.x2, request.y2], [10, 30, 50, 30]);
  assert.deepEqual([request.mx, request.my], [30, 30]);
  assert.equal(request.d, 'M 10 30 L 50 30');
  const reply = flowGeometry(b, a, 'response');
  assert.notEqual(reply.y1, request.y1, 'the reply is nudged sideways');
  assert.ok(Math.abs(reply.y1 - 30) > 1 && Math.abs(reply.y1 - 30) < 3);
  assert.deepEqual(flowGeometry(a, a, 'request').d, 'M 10 30 L 10 30', 'a flow to the same place does not divide by zero');
});

test('a flow stops at the edge of each part’s card, whichever edge the line meets first', () => {
  const half = { w: 8, h: 6 };
  const across = flowGeometry({ x: 10, y: 30 }, { x: 60, y: 30 }, 'request', half);
  assert.ok(across.x1 > 17.9 && across.x1 < 19.5 && across.x2 > 50.5 && across.x2 < 52.1, `it starts at the right edge of the first card and ends at the left edge of the second: ${across.x1}, ${across.x2}`);
  const down = flowGeometry({ x: 40, y: 10 }, { x: 40, y: 50 }, 'request', half);
  assert.ok(down.y1 > 15.9 && down.y1 < 17.5 && down.y2 > 43 && down.y2 < 44.5, `a vertical line leaves by the bottom edge: ${down.y1}, ${down.y2}`);
  const close = flowGeometry({ x: 10, y: 30 }, { x: 20, y: 30 }, 'request', half);
  assert.ok(close.x1 <= close.x2 || Math.abs(close.x1 - close.x2) < 12, 'two parts closer than their cards do not make a line that runs backwards by much');
});

test('a request and its reply put their labels on different sides of the line, and a vertical line\u2019s labels hang off its sides', () => {
  const a = { x: 10, y: 30 };
  const b = { x: 60, y: 30 };
  const request = flowGeometry(a, b, 'request');
  const reply = flowGeometry(b, a, 'response');
  assert.ok(request.ly > 30 && reply.ly < 30, `across: the request label is below (${request.ly}) and the reply label above (${reply.ly})`);
  assert.equal(request.align, 'center');
  const up = flowGeometry({ x: 40, y: 50 }, { x: 40, y: 10 }, 'request');
  const down = flowGeometry({ x: 40, y: 10 }, { x: 40, y: 50 }, 'response');
  assert.ok(up.lx > 40 && down.lx < 40, `along: one label is to the right (${up.lx}) and the other to the left (${down.lx})`);
  assert.deepEqual([up.align, down.align], ['start', 'end']);
});

test('an arrowhead has its tip at the end of the line and two wings behind it', () => {
  const head = arrowHead(0, 0, 10, 0, 2);
  assert.match(head, /^M 10 0 L /);
  const points = head.replace(/[MLZ]/g, '').trim().split(/\s+/).map(Number);
  assert.equal(points.length, 6);
  assert.ok(points[2] < 10 && points[4] < 10, 'the wings are behind the tip');
  assert.ok(Math.abs(points[3] + points[5]) < 1e-9, 'and on either side of the line');
});

test('numbers are shown as they are, to at most two decimals, with a dash until they are set', () => {
  assert.equal(formatMetric(20, ' ms'), '20 ms');
  assert.equal(formatMetric(1.95, ' ms'), '1.95 ms');
  assert.equal(formatMetric(0.30000000000000004, '%'), '0.3%');
  assert.equal(formatMetric('stale'), 'stale');
  assert.equal(formatMetric(undefined, '%'), '—');
});

test('a scene that hangs together has nothing wrong with it', () => {
  assert.deepEqual(sceneProblems(scene, 'demo'), []);
});

test('a scene is checked part by part, and each message says where', () => {
  const bad = structuredClone(scene);
  bad.id = 'other';
  bad.nodes[1].icon = 'sparkles';
  bad.nodes[2].x = 200;
  bad.nodes.push({ id: 'a', label: 'Again', icon: 'server', x: 30, y: 30 });
  bad.metrics.push({ id: 'ms', label: 'Twice' });
  const text = sceneProblems(bad, 'demo').join('\n');
  assert.match(text, /"id" must be "demo"/);
  assert.match(text, /part "b": "icon" must be one of/);
  assert.match(text, /part "c": "x" must be 8 to 92/);
  assert.match(text, /part "a" is listed twice/);
  assert.match(text, /number "ms" is listed twice/);
});

test('a step may only move things between parts that are on stage, and set numbers that have a tile', () => {
  const bad = structuredClone(scene);
  bad.steps[0].flows.push({ from: 'a', to: 'c' });            // c is not on stage in step 1
  bad.steps[1].flows.push({ from: 'a', to: 'ghost' });
  bad.steps[1].flows.push({ from: 'a', to: 'a' });
  bad.steps[1].flows.push({ from: 'a', to: 'b', kind: 'teleport' });
  bad.steps[1].set.volume = 11;
  bad.steps[2].set = { ms: { nested: true } };
  const text = sceneProblems(bad, 'demo').join('\n');
  assert.match(text, /step 1: the flow a → c touches a part that is not on stage/);
  assert.match(text, /step 2: a flow must go from one part to another part/);
  assert.match(text, /a flow's "kind" must be one of/);
  assert.match(text, /sets the number "volume", which has no tile/);
  assert.match(text, /step 3: "ms" must be a number or a short word/);
});

test('too few steps, an empty file and a missing caption are named', () => {
  assert.match(sceneProblems({ ...scene, steps: scene.steps.slice(0, 2) }, 'demo').join(' '), /"steps" must list 3 to 14/);
  assert.match(sceneProblems(null, 'demo')[0], /must be an object/);
  assert.match(sceneProblems({ ...scene, caption: '' }, 'demo').join(' '), /"caption" must be one line/);
});
