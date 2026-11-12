import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBehind, daysBetween, itemDone, planProgress, scheduledDay } from './plans.js';

const plan = {
  days: [
    { title: 'One', items: [{ kind: 'lesson', ref: 'backend/01/README.md' }, { kind: 'code', ref: 'two-sum' }] },
    { title: 'Two', items: [{ kind: 'quiz', ref: 'http-caching' }] },
    { title: 'Three', items: [{ kind: 'mock', ref: 'backend' }, { kind: 'code', ref: 'lru-cache' }] }
  ]
};

test('each kind of item is done by its own mark, and a wip mark is not done', () => {
  const marks = { 'backend/01/README.md': 'done', 'practice/code/two-sum': 'wip', 'practice/quiz/http-caching': 'done', 'practice/mock/backend/2026-11-12T10:00:00.000Z': 'done' };
  assert.equal(itemDone(plan.days[0].items[0], marks), true);
  assert.equal(itemDone(plan.days[0].items[1], marks), false, 'tried, not solved');
  assert.equal(itemDone(plan.days[1].items[0], marks), true);
  assert.equal(itemDone(plan.days[2].items[0], marks), true, 'a mock of that track');
  assert.equal(itemDone({ kind: 'mock', ref: 'genai' }, marks), false, 'a mock of another track does not count');
  assert.equal(itemDone({ kind: 'mock', ref: 'back' }, marks), false, 'and the track is the whole name');
  assert.equal(itemDone({ kind: 'what', ref: 'x' }, marks), false);
});

test('progress is counted by day and in all, and says which day is the first not finished', () => {
  const marks = { 'backend/01/README.md': 'done', 'practice/code/two-sum': 'done', 'practice/quiz/http-caching': 'wip', 'practice/code/lru-cache': 'done' };
  const progress = planProgress(plan, marks);
  assert.deepEqual(progress.days, [{ done: 2, total: 2, complete: true }, { done: 0, total: 1, complete: false }, { done: 1, total: 2, complete: false }]);
  assert.deepEqual([progress.done, progress.total, progress.completeDays, progress.percent, progress.firstOpen, progress.complete], [3, 5, 1, 60, 1, false]);
  const all = planProgress(plan, { ...marks, 'practice/quiz/http-caching': 'done', 'practice/mock/backend/x': 'done' });
  assert.deepEqual([all.complete, all.firstOpen, all.percent], [true, -1, 100]);
  assert.equal(planProgress({ days: [{ title: 'Empty', items: [] }] }, {}).days[0].complete, false, 'a day with nothing in it is never complete');
});

test('the schedule is the days since the start, from the first to the last', () => {
  assert.equal(daysBetween('2026-11-10', '2026-11-12'), 2);
  assert.equal(scheduledDay(plan, '2026-11-12', '2026-11-12'), 1, 'the day it was started is day 1');
  assert.equal(scheduledDay(plan, '2026-11-12', '2026-11-13'), 2);
  assert.equal(scheduledDay(plan, '2026-11-12', '2026-12-30'), 3, 'after the end: the last day');
  assert.equal(scheduledDay(plan, '2026-11-12', '2026-11-01'), 1, 'a start in the future (a clock change) is day 1');
});

test('behind the schedule is the days the schedule has passed that are not finished', () => {
  const progress = planProgress(plan, { 'backend/01/README.md': 'done', 'practice/code/two-sum': 'done' });
  assert.equal(daysBehind(plan, progress, '2026-11-12', '2026-11-12'), 0, 'on day 1 nothing has been passed');
  assert.equal(daysBehind(plan, progress, '2026-11-12', '2026-11-13'), 0, 'day 1 is finished');
  assert.equal(daysBehind(plan, progress, '2026-11-12', '2026-11-14'), 1, 'day 2 has been passed and is not finished');
  assert.equal(daysBehind(plan, planProgress(plan, {}), '2026-11-12', '2026-11-14'), 2);
});
