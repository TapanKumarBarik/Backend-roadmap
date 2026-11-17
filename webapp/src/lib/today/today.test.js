import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToday, isCaughtUp, lessonToResume } from './today.js';

const LESSON = { path: 'backend/a', title: 'A lesson', minutes: 12, status: 'wip' };

test('what is due comes first, then the lesson that was left, then the drill', () => {
  const tasks = buildToday({ reviewDue: 3, trackerDue: 5, drillDone: false, lesson: LESSON });
  assert.deepEqual(tasks.map((t) => t.id), ['review', 'tracker', 'lesson', 'drill']);
  assert.equal(tasks[0].count, 3);
  assert.equal(tasks[1].count, 5);
  assert.equal(tasks[2].lesson, LESSON);
  assert.equal(tasks[3].done, false);
});

test('only what there is to do is listed, and the drill is always there until it is done', () => {
  assert.deepEqual(buildToday({ reviewDue: 0, trackerDue: 0, drillDone: false, lesson: null }).map((t) => t.id), ['drill']);
  assert.deepEqual(buildToday({ reviewDue: 2, trackerDue: 0, drillDone: true, lesson: null }).map((t) => t.id), ['review', 'drill']);
  assert.deepEqual(buildToday({ reviewDue: 0, trackerDue: 0, drillDone: true, lesson: LESSON }).map((t) => [t.id, t.done]), [['lesson', undefined], ['drill', true]]);
});

test('a reader is caught up when nothing is due, no lesson waits and the drill is done', () => {
  assert.equal(isCaughtUp(buildToday({ reviewDue: 0, trackerDue: 0, drillDone: true, lesson: null })), true);
  assert.equal(isCaughtUp(buildToday({ reviewDue: 0, trackerDue: 0, drillDone: false, lesson: null })), false);
  assert.equal(isCaughtUp(buildToday({ reviewDue: 1, trackerDue: 0, drillDone: true, lesson: null })), false);
  assert.equal(isCaughtUp(buildToday({ reviewDue: 0, trackerDue: 0, drillDone: true, lesson: LESSON })), false);
});

test('the lesson to pick up is the last one opened, when it exists and is not finished', () => {
  const nodes = { 'backend/a': { title: 'A lesson', name: 'a', min: 12 }, 'backend/b': { name: 'b-lesson' } };
  const nodeOf = (path) => nodes[path] || null;
  assert.deepEqual(lessonToResume('backend/a', () => 'wip', nodeOf), { path: 'backend/a', title: 'A lesson', minutes: 12, status: 'wip' });
  assert.deepEqual(lessonToResume('backend/a', () => undefined, nodeOf)?.status, 'todo', 'opened, never marked: still to do');
  assert.equal(lessonToResume('backend/a', () => 'done', nodeOf), null, 'a finished lesson is not one to pick up');
  assert.equal(lessonToResume('backend/gone', () => 'wip', nodeOf), null, 'a lesson that is no longer there');
  assert.equal(lessonToResume('', () => 'wip', nodeOf), null);
  assert.deepEqual(lessonToResume('backend/b', () => 'wip', nodeOf), { path: 'backend/b', title: 'b-lesson', minutes: 0, status: 'wip' }, 'no title: its name; no time: 0');
});
