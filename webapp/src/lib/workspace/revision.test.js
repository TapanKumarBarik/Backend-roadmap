import test from 'node:test';
import assert from 'node:assert/strict';
import { REVISION } from '../../config/workspace.js';
import { STATE, dayNumber, daysLate, dueCount, dueDay, markRevised, revisedToday, sortByOverdue, stateOf } from './revision.js';

// Local noon, so the calendar day is the same wherever the tests run.
const day = (n) => new Date(2030, 0, n, 12);
const item = (id, addedDay, lastRevisedDay = null, revisedCount = 0) => ({
  id, path: `${id}/README.md`, title: id,
  addedAt: day(addedDay).toISOString(), lastRevisedAt: lastRevisedDay ? day(lastRevisedDay).toISOString() : null, revisedCount
});

test('a lesson never revised is due after the first gap from the day it was added', () => {
  const [first] = REVISION.intervalsDays;
  const a = item('a', 5);
  assert.equal(dueDay(a), dayNumber(day(5)) + first);
  assert.equal(stateOf(a, day(5)), STATE.later);
  assert.equal(stateOf(a, day(5 + first)), STATE.today);
  assert.equal(stateOf(a, day(5 + first + 1)), STATE.overdue);
});

test('each revision pushes the next one further out, up to the longest gap, which then repeats', () => {
  const gaps = REVISION.intervalsDays;
  gaps.forEach((gap, count) => assert.equal(dueDay(item('a', 1, 1, count)) - dayNumber(day(1)), gap));
  assert.equal(dueDay(item('a', 1, 1, 99)) - dayNumber(day(1)), gaps.at(-1));
  assert.ok(gaps.every((gap, i) => i === 0 || gap > gaps[i - 1]), 'the gaps only grow');
});

test('the gap runs from the last revision, not from when the lesson was added', () => {
  const a = item('a', 1, 20, 1);
  assert.equal(dueDay(a), dayNumber(day(20)) + REVISION.intervalsDays[1]);
});

test('days late is zero on the due day, positive after, negative before', () => {
  const a = item('a', 10, 10, 1); // due 10 + the second gap
  const due = 10 + REVISION.intervalsDays[1];
  assert.equal(daysLate(a, day(due)), 0);
  assert.equal(daysLate(a, day(due + 4)), 4);
  assert.equal(daysLate(a, day(due - 2)), -2);
});

test('the most overdue lesson comes first, then those due today, then those not yet due, the soonest first', () => {
  const now = day(30);
  const veryLate = item('very-late', 1);             // due day 2: 28 late
  const late = item('late', 20);                      // due day 21: 9 late
  const today = item('today', 29);                    // due day 30
  const soon = item('soon', 30);                      // due day 31
  const far = item('far', 30, 30, 4);                 // due 30 + the fifth gap
  const sorted = sortByOverdue([far, today, veryLate, soon, late], now).map((i) => i.id);
  assert.deepEqual(sorted, ['very-late', 'late', 'today', 'soon', 'far']);
});

test('lessons equally overdue: the one waiting longest first, then by title', () => {
  const now = day(30);
  const older = item('b-older', 10, 20, 1);
  const newer = item('a-newer', 12, 20, 1);
  assert.deepEqual(sortByOverdue([newer, older], now).map((i) => i.id), ['b-older', 'a-newer']);
  const same = [{ ...item('b', 10), title: 'B' }, { ...item('a', 10), title: 'A' }];
  assert.deepEqual(sortByOverdue(same, now).map((i) => i.title), ['A', 'B']);
});

test('sorting does not change the list it is given', () => {
  const list = [item('a', 25), item('b', 1)];
  sortByOverdue(list, day(30));
  assert.deepEqual(list.map((i) => i.id), ['a', 'b']);
});

test('"revised today" is the calendar day, however late or early in it', () => {
  const a = { ...item('a', 1), lastRevisedAt: new Date(2030, 0, 15, 0, 5).toISOString() };
  assert.equal(revisedToday(a, new Date(2030, 0, 15, 23, 55)), true);
  assert.equal(revisedToday(a, new Date(2030, 0, 16, 0, 5)), false);
  assert.equal(revisedToday(item('b', 1), day(15)), false);
});

test('revising counts once a day, like the server', () => {
  const a = item('a', 1);
  const once = markRevised(a, day(15));
  assert.equal(once.revisedCount, 1);
  assert.equal(revisedToday(once, day(15)), true);
  assert.equal(markRevised(once, day(15)), once, 'the same day changes nothing');
  assert.equal(markRevised(once, day(16)).revisedCount, 2);
  assert.equal(stateOf(once, day(15)), STATE.later, 'and it is not due again straight away');
});

test('the count of lessons to revise includes those due today and not those to come', () => {
  const now = day(30);
  assert.equal(dueCount([item('late', 1), item('today', 29), item('soon', 30)], now), 2);
  assert.equal(dueCount([], now), 0);
});
