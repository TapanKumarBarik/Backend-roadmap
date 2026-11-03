import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPlanData } from './kinds.js';
import {
  addLesson, addTask, buildOwnPlan, buildPathPlan, daysUntil, itemStatus, nextItem, nextLessonStatus, nextItemId, pace, planProgress, removeItem, setTargetDate, setTaskDone
} from './plan.js';

const node = (title, min = 5) => ({ title, name: title, min });
const nodeByFile = {
  'backend/01-http/01-requests/README.md': node('Module 01: HTTP Requests'),
  'backend/01-http/02-responses/README.md': node('Module 02: HTTP Responses'),
  'backend/02-auth/01-sessions/README.md': node('Module 01: Sessions and Cookies')
};
const path = {
  id: 'foundations',
  title: 'Backend foundations',
  steps: [
    { title: 'HTTP', files: ['backend/01-http/01-requests/README.md', 'backend/01-http/02-responses/README.md'] },
    { title: 'Authentication', files: ['backend/02-auth/01-sessions/README.md'] }
  ]
};

test('a plan made from a path keeps its steps and lessons in the path\'s order, named by topic', () => {
  const plan = buildPathPlan(path, nodeByFile, '2030-05-01');
  assert.equal(plan.source, 'path');
  assert.equal(plan.pathId, 'foundations');
  assert.equal(plan.targetDate, '2030-05-01');
  assert.deepEqual(plan.steps.map((s) => s.title), ['HTTP', 'Authentication']);
  assert.deepEqual(plan.steps.flatMap((s) => s.items.map((i) => [i.id, i.title])), [['i1', 'HTTP Requests'], ['i2', 'HTTP Responses'], ['i3', 'Sessions and Cookies']]);
  assert.ok(plan.steps.every((s) => s.items.every((i) => i.type === 'lesson' && i.path.endsWith('README.md'))));
});

test('a lesson the library no longer knows is named by its path', () => {
  const plan = buildPathPlan({ id: 'p', title: 'P', steps: [{ title: 'S', files: ['gone/README.md'] }] }, {});
  assert.equal(plan.steps[0].items[0].title, 'gone/README.md');
});

test('what a plan builds is what the server accepts, unchanged', () => {
  for (const plan of [buildPathPlan(path, nodeByFile, null), buildOwnPlan('My list', '2030-01-01')]) {
    assert.deepEqual(cleanPlanData(plan).data, plan);
  }
});

test('an own list starts with one empty step and can be filled with lessons and tasks, without repeats', () => {
  let plan = buildOwnPlan('My list');
  assert.deepEqual(plan, { source: 'own', pathId: null, targetDate: null, steps: [{ title: 'My list', items: [] }] });
  plan = addLesson(plan, 'a/README.md', 'A');
  plan = addLesson(plan, 'a/README.md', 'A again');
  plan = addTask(plan, 'Build a server');
  assert.deepEqual(plan.steps[0].items.map((i) => [i.id, i.type, i.title]), [['i1', 'lesson', 'A'], ['i2', 'task', 'Build a server']]);
  assert.equal(plan.steps[0].items[1].done, false);
  assert.deepEqual(cleanPlanData(plan).data, plan);
});

test('a line goes into the step asked for, and a step that does not exist is the nearest one', () => {
  const plan = buildPathPlan(path, nodeByFile);
  assert.equal(addTask(plan, 'x', 1).steps[1].items.at(-1).title, 'x');
  assert.equal(addTask(plan, 'x', 9).steps[1].items.at(-1).title, 'x');
  assert.equal(addTask(plan, 'x', -3).steps[0].items.at(-1).title, 'x');
});

test('new ids never reuse one in the plan, even after a line was removed', () => {
  let plan = buildOwnPlan('S');
  plan = addTask(plan, 'one');
  plan = addTask(plan, 'two');
  plan = removeItem(plan, 'i1');
  assert.equal(nextItemId(plan), 'i3');
  assert.equal(addTask(plan, 'three').steps[0].items.at(-1).id, 'i3');
});

test('a lesson\'s tick is its real progress: done in the reader\'s progress is done in the plan, whatever the plan says', () => {
  const plan = buildPathPlan(path, nodeByFile);
  const progress = planProgress(plan, { 'backend/01-http/01-requests/README.md': 'done', 'backend/01-http/02-responses/README.md': 'wip' });
  assert.deepEqual(progress.steps.map((s) => [s.done, s.total]), [[1, 2], [0, 1]]);
  assert.equal(progress.done, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.percent, 33);
  assert.deepEqual(progress.steps[0].items.map((i) => i.status), ['done', 'wip']);
});

test('ticking a lesson in the plan flips the lesson: not started or in progress becomes done, done goes back to not started', () => {
  assert.equal(nextLessonStatus('todo'), 'done');
  assert.equal(nextLessonStatus('wip'), 'done');
  assert.equal(nextLessonStatus('done'), 'todo');
  assert.equal(nextLessonStatus(undefined), 'done');

  // and the round trip through the progress store the app uses leaves the plan and the lesson agreeing
  const plan = buildPathPlan(path, nodeByFile);
  const file = 'backend/02-auth/01-sessions/README.md';
  let statusMap = {};
  statusMap = { ...statusMap, [file]: nextLessonStatus(statusMap[file]) };
  assert.equal(planProgress(plan, statusMap).steps[1].items[0].status, 'done');
  statusMap = { ...statusMap, [file]: nextLessonStatus(statusMap[file]) };
  assert.equal(planProgress(plan, statusMap).steps[1].items[0].status, 'todo');
});

test('a task\'s tick is the plan\'s own, and the progress store does not touch it', () => {
  let plan = addTask(buildOwnPlan('S'), 'Build a server');
  assert.equal(itemStatus(plan.steps[0].items[0], { 'Build a server': 'done' }), 'todo');
  plan = setTaskDone(plan, 'i1', true);
  assert.equal(itemStatus(plan.steps[0].items[0], {}), 'done');
  assert.equal(planProgress(plan, {}).finished, true);
});

test('a lesson line cannot be ticked inside the plan itself', () => {
  const plan = buildPathPlan(path, nodeByFile);
  assert.deepEqual(setTaskDone(plan, 'i1', true), plan);
});

test('an empty plan is not finished and is at 0 percent', () => {
  const progress = planProgress(buildOwnPlan('S'), {});
  assert.deepEqual([progress.done, progress.total, progress.percent, progress.finished], [0, 0, 0, false]);
});

test('next up is a lesson already started, else the first not done, else nothing', () => {
  const plan = buildPathPlan(path, nodeByFile);
  const files = plan.steps.flatMap((s) => s.items.map((i) => i.path));
  assert.equal(nextItem(planProgress(plan, {})).path, files[0]);
  assert.equal(nextItem(planProgress(plan, { [files[0]]: 'done' })).path, files[1]);
  assert.equal(nextItem(planProgress(plan, { [files[0]]: 'done', [files[2]]: 'wip' })).path, files[2]);
  assert.equal(nextItem(planProgress(plan, Object.fromEntries(files.map((f) => [f, 'done'])))), null);
});

test('days to the target count calendar days, today as 0 and a day gone as negative', () => {
  const today = new Date(2030, 0, 10, 23, 30);
  assert.equal(daysUntil('2030-01-10', today), 0);
  assert.equal(daysUntil('2030-01-11', today), 1);
  assert.equal(daysUntil('2030-01-01', today), -9);
  assert.equal(daysUntil('2030-03-01', today), 50);
});

test('the pace says how many a week finish the plan on time, never more than what is left', () => {
  const plan = setTargetDate(buildPathPlan(path, nodeByFile), '2030-01-31');
  const progress = planProgress(plan, {});
  assert.deepEqual(pace(plan, progress, new Date(2030, 0, 10)), { daysLeft: 21, remaining: 3, perWeek: 1, late: false });
  assert.equal(pace(plan, progress, new Date(2030, 0, 30)).perWeek, 3, 'two days left: all of it this week');
  assert.deepEqual(pace(plan, progress, new Date(2030, 1, 5)), { daysLeft: -5, remaining: 3, perWeek: null, late: true });
  const done = planProgress(plan, Object.fromEntries(plan.steps.flatMap((s) => s.items.map((i) => [i.path, 'done']))));
  assert.deepEqual(pace(plan, done, new Date(2030, 1, 5)), { daysLeft: -5, remaining: 0, perWeek: null, late: false }, 'a finished plan is never late');
  assert.equal(pace(setTargetDate(plan, ''), progress, new Date()), null, 'no target date, no pace');
});
