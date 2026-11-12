import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, counts, dueItems, forget, problemItem, questionItem, record } from './review.js';

const RULES = { intervals: [1, 3, 7, 14, 30] };
const TODAY = '2026-11-12';

test('days are added to a day name, across months and years', () => {
  assert.equal(addDays('2026-11-12', 1), '2026-11-13');
  assert.equal(addDays('2026-11-30', 3), '2026-12-03');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', 0), '2026-03-01');
});

test('a question that was missed comes back after the first interval, and a right answer to one that never was does nothing', () => {
  const missed = record({}, questionItem('http-caching/q1'), false, TODAY, RULES);
  assert.deepEqual(missed, { 'q:http-caching/q1': { box: 0, due: '2026-11-13' } });
  const state = {};
  assert.equal(record(state, questionItem('http-caching/q2'), true, TODAY, RULES), state, 'the same state: nothing was missed');
});

test('each right answer moves an item one box on, so it comes back later, and the last box stays', () => {
  let state = record({}, questionItem('x/q1'), false, TODAY, RULES);
  const gaps = [];
  let day = TODAY;
  for (let i = 0; i < 6; i += 1) {
    day = state['q:x/q1'].due;
    state = record(state, questionItem('x/q1'), true, day, RULES);
    gaps.push(state['q:x/q1'].due);
  }
  assert.deepEqual(gaps, ['2026-11-16', '2026-11-23', '2026-12-07', '2027-01-06', '2027-02-05', '2027-03-07'], '3, 7, 14, 30 days, then 30 again');
  assert.equal(state['q:x/q1'].box, 4);
});

test('a wrong answer starts the item again from the first box', () => {
  const far = { 'q:x/q1': { box: 3, due: '2026-12-01' } };
  assert.deepEqual(record(far, 'q:x/q1', false, '2026-12-01', RULES), { 'q:x/q1': { box: 0, due: '2026-12-02' } });
});

test('a coding problem that was just solved is added, and solving it again later moves it on', () => {
  const rules = { ...RULES, addIfNew: true };
  const added = record({}, problemItem('two-sum'), true, TODAY, rules);
  assert.deepEqual(added, { 'c:two-sum': { box: 0, due: '2026-11-13' } });
  assert.deepEqual(record(added, problemItem('two-sum'), true, '2026-11-13', rules), { 'c:two-sum': { box: 1, due: '2026-11-16' } });
});

test('what is due is what has waited longest, the lower box first, and the state is not changed by asking', () => {
  const state = { 'c:b': { box: 2, due: '2026-11-10' }, 'q:a/1': { box: 0, due: '2026-11-10' }, 'q:a/2': { box: 0, due: '2026-11-12' }, 'q:a/3': { box: 0, due: '2026-11-13' } };
  const before = JSON.stringify(state);
  assert.deepEqual(dueItems(state, TODAY), ['q:a/1', 'c:b', 'q:a/2']);
  assert.deepEqual(counts(state, TODAY), { total: 4, due: 3 });
  assert.deepEqual(dueItems({}, TODAY), []);
  assert.equal(JSON.stringify(state), before);
});

test('an item can be taken out of the queue', () => {
  const state = { 'c:a': { box: 0, due: TODAY }, 'c:b': { box: 0, due: TODAY } };
  assert.deepEqual(forget(state, 'c:a'), { 'c:b': { box: 0, due: TODAY } });
  assert.deepEqual(forget(state, 'c:none'), state);
  assert.equal(Object.keys(state).length, 2, 'the state given is not changed');
});
