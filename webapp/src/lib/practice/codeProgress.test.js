import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continueProblem, drillsDone, filterGroups, groupByTopic, nextProblem, problemOfTheDay, statusOf, tally } from './codeProgress.js';
import { dayName, dayNumber } from './days.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const TOPICS = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
const p = (slug, topic, difficulty = 'beginner') => ({ slug, title: slug.toUpperCase(), topic, difficulty });
const PROBLEMS = [p('x2', 'b', 'advanced'), p('a1', 'a', 'intermediate'), p('a0', 'a'), p('z9', 'zeta'), p('x1', 'b')];

test('a problem is solved, tried or untouched by its mark', () => {
  const marks = { 'practice/code/a0': 'done', 'practice/code/a1': 'wip', 'curriculum/other.md': 'done' };
  assert.equal(statusOf('a0', marks), 'done');
  assert.equal(statusOf('a1', marks), 'wip');
  assert.equal(statusOf('x1', marks), 'todo');
  assert.deepEqual(tally(PROBLEMS, marks), { solved: 1, tried: 1, total: 5 });
});

test('problems are grouped in the order of the topics, easiest first, and unknown topics come last', () => {
  const groups = groupByTopic(PROBLEMS, { 'practice/code/a0': 'done' }, TOPICS, LEVELS);
  assert.deepEqual(groups.map((g) => g.id), ['a', 'b', 'zeta']);
  assert.deepEqual(groups.map((g) => g.label), ['Alpha', 'Beta', 'Zeta']);
  assert.deepEqual(groups[0].problems.map((x) => x.slug), ['a0', 'a1']);
  assert.deepEqual(groups[1].problems.map((x) => x.slug), ['x1', 'x2']);
  assert.deepEqual([groups[0].solved, groups[0].total], [1, 2]);
});

test('the next problem is the next unsolved one in the same topic, then any topic, then none', () => {
  const groups = (marks) => groupByTopic(PROBLEMS, marks, TOPICS, LEVELS);
  assert.equal(nextProblem(groups({}), {}, 'a0').slug, 'a1');
  assert.equal(nextProblem(groups({ 'practice/code/a1': 'done' }), { 'practice/code/a1': 'done' }, 'a0').slug, 'x1', 'the topic is done: on to the next');
  const all = Object.fromEntries(PROBLEMS.map((x) => [`practice/code/${x.slug}`, 'done']));
  assert.equal(nextProblem(groups(all), all, 'a0'), null);
  assert.equal(nextProblem(groups({}), {}, 'a1').slug, 'a0', 'wraps round to an unsolved one earlier in the topic');
});

test("today's problem is the same all day, comes round in a shuffled order without repeats, and is never the same two days running", () => {
  const pool = Array.from({ length: 12 }, (_, i) => p(`s${String(i).padStart(2, '0')}`, 'a'));
  const pick = (day) => problemOfTheDay(pool, day).slug;
  assert.equal(pick(20000), pick(20000));
  for (const start of [0, 12, 24000, 24012]) {
    const cycle = Array.from({ length: 12 }, (_, i) => pick(start + i));
    assert.equal(new Set(cycle).size, 12, 'every problem once per cycle');
  }
  for (let day = 20000; day < 20400; day++) assert.notEqual(pick(day), pick(day + 1), `day ${day}`);
  assert.equal(problemOfTheDay([], 5), null);
  assert.equal(problemOfTheDay([p('only', 'a')], 5).slug, 'only');
});

test('a day is a UTC calendar day', () => {
  const noon = Date.UTC(2026, 10, 12, 12);
  assert.equal(dayName(noon), '2026-11-12');
  assert.equal(dayNumber(noon), dayNumber(Date.UTC(2026, 10, 12, 0, 0, 1)));
  assert.equal(dayNumber(Date.UTC(2026, 10, 13)) - dayNumber(noon), 1);
});

test('groups can be narrowed by words, level and what is unsolved, and keep their totals', () => {
  const marks = { 'practice/code/a0': 'done' };
  const groups = groupByTopic(PROBLEMS.map((x) => ({ ...x, description: `About ${x.slug}.` })), marks, TOPICS, LEVELS);
  assert.deepEqual(filterGroups(groups, marks).map((g) => g.problems.length), [2, 2, 1]);
  assert.deepEqual(filterGroups(groups, marks, { level: 'beginner' }).flatMap((g) => g.problems.map((x) => x.slug)), ['a0', 'x1', 'z9']);
  const unsolved = filterGroups(groups, marks, { unsolved: true });
  assert.deepEqual(unsolved.flatMap((g) => g.problems.map((x) => x.slug)), ['a1', 'x1', 'x2', 'z9']);
  assert.equal(unsolved[0].total, 2, 'the group still counts all its problems');
  assert.equal(unsolved[0].solved, 1);
  assert.deepEqual(filterGroups(groups, marks, { query: ' BETA ' }).map((g) => g.id), ['b'], 'the topic name matches');
  assert.deepEqual(filterGroups(groups, marks, { query: 'about a1' }).flatMap((g) => g.problems.map((x) => x.slug)), ['a1'], 'the description matches');
  assert.deepEqual(filterGroups(groups, marks, { query: 'nothing like it' }), []);
});

test('what to pick up is a problem that was tried, else the first not started, and drills are counted from their marks', () => {
  const groups = (marks) => groupByTopic(PROBLEMS, marks, TOPICS, LEVELS);
  assert.equal(continueProblem(groups({}), {}).slug, 'a0');
  const tried = { 'practice/code/a0': 'done', 'practice/code/x1': 'wip' };
  assert.equal(continueProblem(groups(tried), tried).slug, 'x1', 'a tried one comes before a new one');
  const all = Object.fromEntries(PROBLEMS.map((x) => [`practice/code/${x.slug}`, 'done']));
  assert.equal(continueProblem(groups(all), all), null);
  assert.equal(drillsDone({ 'practice/drill/2026-11-12': 'done', 'practice/drill/2026-11-11': 'wip', 'practice/drill/2026-11-10': 'done', 'practice/code/a0': 'done', 'backend/x.md': 'done' }), 2);
});
