import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsOf, suitsCards } from './cards.js';

const QUESTIONS = [
  { q: 'What is a cache stampede?', a: 'Many requests miss at once.' },
  { q: 'When is caching wrong?', a: 'When the data must always be current.' },
  { q: 'What is cache-aside?', a: 'Check the cache, then the database.' },
  { q: 'How do you invalidate?', a: 'Delete after the write commits.' }
];

test('a question becomes a card with its place in the set as its key', () => {
  assert.deepEqual(cardsOf(QUESTIONS).map((c) => [c.key, c.front, c.back]), QUESTIONS.map((q, i) => [String(i), q.q, q.a]));
});

test('a set suits cards when it has questions and every answer is short enough', () => {
  assert.equal(suitsCards(QUESTIONS, 100), true);
  assert.equal(suitsCards(QUESTIONS, 30), false, 'one answer is longer than the limit');
  assert.equal(suitsCards([], 100), false, 'an empty set has nothing to flip');
  assert.equal(suitsCards([{ q: 'q', a: undefined }], 100), false, 'a question without an answer is not a card');
});
