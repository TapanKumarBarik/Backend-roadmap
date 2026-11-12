import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandOf, percentOf, scoreAreas, scoreTopics, toggled, weakestArea } from './questions.js';

test('a question with one answer takes the option picked, one with several adds or removes it', () => {
  assert.deepEqual(toggled({ choose: 'one' }, ['a'], 'b'), ['b']);
  assert.deepEqual(toggled({ choose: 'any' }, ['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggled({ choose: 'any' }, ['a', 'b'], 'a'), ['b']);
});

test('a percent is a whole number, and 0 for nothing', () => {
  assert.deepEqual([percentOf(1, 3), percentOf(2, 3), percentOf(0, 0), percentOf(5, 5)], [33, 67, 0, 100]);
});

const areas = [
  { id: 'backend', label: 'Backend', questions: [{ key: 'a/1' }, { key: 'a/2' }, { key: 'b/1' }] },
  { id: 'genai', label: 'GenAI', questions: [{ key: 'g/1' }, { key: 'g/2' }] }
];

test('each area is scored by its own questions, and a question with no result is a miss', () => {
  const results = [{ key: 'a/1', correct: true }, { key: 'a/2', correct: false }, { key: 'g/1', correct: true }, { key: 'g/2', correct: true }, { key: 'x/1', correct: true }];
  assert.deepEqual(scoreAreas(areas, results), [
    { id: 'backend', label: 'Backend', right: 1, total: 3, percent: 33 },
    { id: 'genai', label: 'GenAI', right: 2, total: 2, percent: 100 }
  ]);
  assert.deepEqual(scoreAreas(areas, []).map((a) => a.percent), [0, 0], 'nothing answered');
});

test('the weakest area is the lowest, the first on a tie', () => {
  assert.equal(weakestArea([{ id: 'a', percent: 60 }, { id: 'b', percent: 40 }, { id: 'c', percent: 40 }]).id, 'b');
  assert.equal(weakestArea([]), null);
});

test('a percent is in the band that starts at or below it', () => {
  const from = [0, 50, 80];
  assert.deepEqual([0, 49, 50, 79, 80, 100].map((p) => bandOf(p, from)), [0, 0, 1, 1, 2, 2]);
});

test('topics are scored across the questions, the weakest first', () => {
  const questions = [{ key: '1', topic: 'sql' }, { key: '2', topic: 'sql' }, { key: '3', topic: 'http' }, { key: '4', topic: 'auth' }];
  const results = [{ key: '1', correct: true }, { key: '2', correct: false }, { key: '3', correct: true }];
  assert.deepEqual(scoreTopics(questions, results), [
    { topic: 'auth', right: 0, total: 1, percent: 0 },
    { topic: 'sql', right: 1, total: 2, percent: 50 },
    { topic: 'http', right: 1, total: 1, percent: 100 }
  ]);
});
