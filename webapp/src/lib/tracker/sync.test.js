import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmptyState, mergeStates, sameState, stampOf } from './sync.js';

const state = (items = {}, removed = {}) => ({ records: new Map(Object.entries(items)), removed: new Map(Object.entries(removed)) });
const NOW = 2_000_000_000;
const DAY = 86400;
const merge = (a, b, keepDays = 60) => mergeStates(a, b, NOW, keepDays);

test('a row nobody else knows about is kept, from whichever copy has it', () => {
  const merged = merge(state({ A: { s: 'd', u: 10 } }), state({ B: { s: 'w', u: 20 } }));
  assert.deepEqual([...merged.records.keys()].sort(), ['A', 'B']);
});

test('of two records for the same row the one changed last wins, and on a tie this browser\'s own does', () => {
  const older = { s: 'w', c: 2, u: 100 };
  const newer = { s: 'd', c: 5, u: 200 };
  assert.deepEqual(merge(state({ A: older }), state({ A: newer })).records.get('A'), newer, 'the account\'s is newer');
  assert.deepEqual(merge(state({ A: newer }), state({ A: older })).records.get('A'), newer, 'this browser\'s is newer');
  const here = { s: 'd', u: 300 };
  const there = { s: 'w', u: 300 };
  assert.equal(merge(state({ A: here }), state({ A: there })).records.get('A'), here, 'a tie goes to this browser');
});

test('a record written before there was sync (no stamp) loses to any that has one, and is kept when nothing else knows the row', () => {
  assert.equal(stampOf({ s: 'd' }), 0);
  assert.equal(stampOf({ s: 'd', u: 5 }), 5);
  assert.deepEqual(merge(state({ A: { s: 'd' } }), state({ A: { s: 'w', u: 1 } })).records.get('A'), { s: 'w', u: 1 });
  assert.deepEqual(merge(state({ A: { s: 'd' } }), state()).records.get('A'), { s: 'd' });
});

test('a row that was reset is gone from the other copy too when the reset is later than its last change, and comes back when it was changed after', () => {
  const reset = merge(state({}, { A: NOW - 100 }), state({ A: { s: 'd', u: NOW - 500 } }));
  assert.equal(reset.records.has('A'), false, 'reset after it was last changed');
  assert.equal(reset.removed.get('A'), NOW - 100, 'and it is remembered');
  const changedAfter = merge(state({}, { A: NOW - 500 }), state({ A: { s: 'd', u: NOW - 100 } }));
  assert.deepEqual(changedAfter.records.get('A'), { s: 'd', u: NOW - 100 });
  assert.equal(changedAfter.removed.has('A'), false);
  assert.equal(merge(state({ A: { s: 'd', u: 50 } }, { A: 50 }), state()).records.has('A'), false, 'on a tie a reset beats a record');
});

test('a reset is forgotten after it has been kept for the number of days it is kept for', () => {
  const keep = merge(state({}, { A: NOW - 59 * DAY }), state());
  assert.equal(keep.removed.has('A'), true);
  const forget = merge(state({}, { A: NOW - 61 * DAY }), state());
  assert.equal(forget.removed.has('A'), false);
  assert.equal(forget.records.has('A'), false);
});

test('neither copy given is changed', () => {
  const a = state({ A: { s: 'd', u: 1 } });
  const b = state({ B: { s: 'w', u: 2 } }, { C: 3 });
  const before = JSON.stringify([[...a.records], [...a.removed], [...b.records], [...b.removed]]);
  merge(a, b);
  assert.equal(JSON.stringify([[...a.records], [...a.removed], [...b.records], [...b.removed]]), before);
});

test('merging is the same whichever copy is which, except for a tie', () => {
  const a = state({ A: { s: 'd', u: 5 }, B: { s: 'w', u: 9 } }, { C: 7 });
  const b = state({ A: { s: 'w', u: 8 }, C: { s: 'd', u: 6 } }, { B: 4 });
  assert.ok(sameState(merge(a, b), merge(b, a)));
});

test('two copies are the same when they say the same about every row, whatever the order of a record\'s fields', () => {
  assert.equal(sameState(state({ A: { s: 'd', c: 3 } }), state({ A: { c: 3, s: 'd' } })), true);
  assert.equal(sameState(state({ A: { s: 'd' } }), state({ A: { s: 'w' } })), false);
  assert.equal(sameState(state({ A: { s: 'd' } }), state()), false);
  assert.equal(sameState(state({}, { A: 1 }), state({}, { A: 2 })), false);
  assert.equal(sameState(state(), state()), true);
});

test('a copy with nothing in it is empty', () => {
  assert.equal(isEmptyState(state()), true);
  assert.equal(isEmptyState(state({ A: {} })), false);
  assert.equal(isEmptyState(state({}, { A: 1 })), false);
});
