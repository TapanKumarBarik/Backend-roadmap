import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickProblems, pickQuestions } from './picks.js';
import { seedOf } from './seeded.js';

const quiz = (topic, n) => ({ topic, questions: Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` })) });
const quizzes = { a: quiz('http', 6), b: quiz('http', 6), c: quiz('databases', 6), d: quiz('security', 6), e: quiz('genai', 6) };

test('the same seed asks the same questions, another seed asks others, and the input is not changed', () => {
  const options = { topics: ['http', 'databases', 'security'], count: 6, maxPerQuiz: 2 };
  const first = pickQuestions(quizzes, { ...options, seed: 'level-check-1' });
  assert.deepEqual(pickQuestions(quizzes, { ...options, seed: 'level-check-1' }), first);
  assert.notDeepEqual(pickQuestions(quizzes, { ...options, seed: 'another' }), first);
  assert.equal(first.length, 6);
  assert.equal(Object.keys(quizzes).length, 5);
});

test('only the topics asked for, and a mix of quizzes: at most so many from any one', () => {
  const picked = pickQuestions(quizzes, { topics: ['http', 'databases', 'security'], count: 6, seed: 'x', maxPerQuiz: 2 });
  assert.ok(picked.every((p) => ['a', 'b', 'c', 'd'].includes(p.quiz)), 'nothing from a quiz of another topic');
  for (const name of ['a', 'b', 'c', 'd']) assert.ok(picked.filter((p) => p.quiz === name).length <= 2, `${name}: at most two`);
});

test('when the topics have too few quizzes to mix, the limit gives way, and a topic with no quiz gives nothing', () => {
  const picked = pickQuestions(quizzes, { topics: ['genai'], count: 5, seed: 'x', maxPerQuiz: 2 });
  assert.equal(picked.length, 5, 'one quiz of six questions has to give five');
  assert.deepEqual(pickQuestions(quizzes, { topics: ['nothing'], count: 5, seed: 'x', maxPerQuiz: 2 }), []);
});

test('a seed is a whole number that depends on the text and only on it', () => {
  assert.equal(seedOf('backend'), seedOf('backend'));
  assert.notEqual(seedOf('backend'), seedOf('backend2'));
  assert.ok(Number.isInteger(seedOf('')) && seedOf('') >= 0);
});

const problems = [
  { slug: 'a', topic: 'arrays', difficulty: 'beginner' }, { slug: 'b', topic: 'arrays', difficulty: 'intermediate' }, { slug: 'c', topic: 'caching', difficulty: 'intermediate' },
  { slug: 'd', topic: 'caching', difficulty: 'advanced' }, { slug: 'e', topic: 'sql', difficulty: 'advanced' }, { slug: 'f', topic: 'other', difficulty: 'beginner' }
];

test('problems come from the topics asked for, one of each level asked for, in different topics where it can be', () => {
  const picked = pickProblems(problems, { topics: ['arrays', 'caching', 'sql'], count: 3, seed: 's', levels: ['intermediate', 'advanced'] });
  assert.equal(picked.length, 3);
  assert.deepEqual(picked.map((p) => p.difficulty).slice(0, 2), ['intermediate', 'advanced']);
  assert.ok(picked.every((p) => p.topic !== 'other'));
  assert.equal(new Set(picked.map((p) => p.topic)).size, 3, 'three topics');
  assert.deepEqual(pickProblems(problems, { topics: ['arrays', 'caching', 'sql'], count: 3, seed: 's', levels: ['intermediate', 'advanced'] }), picked, 'the same seed, the same problems');
});

test('a level with no problem left falls back to what there is, and there are never more than there are problems', () => {
  const picked = pickProblems(problems, { topics: ['sql'], count: 3, seed: 's', levels: ['beginner'] });
  assert.deepEqual(picked.map((p) => p.slug), ['e'], 'only one problem of that topic');
  assert.deepEqual(pickProblems(problems, { topics: ['none'], count: 2, seed: 's', levels: ['beginner'] }), []);
});
