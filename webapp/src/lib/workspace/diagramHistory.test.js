import test from 'node:test';
import assert from 'node:assert/strict';
import { canRedo, canUndo, createHistory, record, redo, undo } from './diagramHistory.js';

const drawing = (name) => ({ nodes: [{ id: name }], edges: [] });
const [A, B, C, D] = ['a', 'b', 'c', 'd'].map(drawing);

test('a new history shows its drawing and has nothing to undo or redo', () => {
  const h = createHistory(A, 10);
  assert.equal(h.present, A);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
  assert.equal(undo(h), h);
  assert.equal(redo(h), h);
});

test('each recorded drawing is one step back, and redo goes forward again', () => {
  let h = createHistory(A, 10);
  h = record(record(h, B), C);
  assert.equal(h.present, C);
  h = undo(h);
  assert.equal(h.present, B);
  h = undo(h);
  assert.equal(h.present, A);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), true);
  h = redo(redo(h));
  assert.equal(h.present, C);
  assert.equal(canRedo(h), false);
});

test('recording the drawing already shown records nothing', () => {
  const h = record(createHistory(A, 10), B);
  assert.equal(record(h, B), h);
  assert.equal(undo(record(h, B)).present, A, 'one step back, not two');
});

test('a new change after an undo clears what could have been redone', () => {
  let h = record(record(createHistory(A, 10), B), C);
  h = undo(h);
  h = record(h, D);
  assert.equal(canRedo(h), false);
  assert.deepEqual([undo(h).present, undo(undo(h)).present], [B, A]);
});

test('only the last steps are kept', () => {
  let h = createHistory(A, 3);
  for (const next of [drawing('1'), drawing('2'), drawing('3'), drawing('4'), drawing('5')]) h = record(h, next);
  assert.equal(h.past.length, 3);
  let back = h;
  while (canUndo(back)) back = undo(back);
  assert.equal(back.present.nodes[0].id, '2', 'three steps back from 5 is 2; A, 1 are forgotten');
});

test('undo and redo never change the history they were given', () => {
  const h = record(createHistory(A, 10), B);
  const snapshot = JSON.stringify(h);
  undo(h);
  redo(undo(h));
  assert.equal(JSON.stringify(h), snapshot);
});
