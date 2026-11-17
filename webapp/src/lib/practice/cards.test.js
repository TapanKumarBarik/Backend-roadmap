import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsOf, cardsStartMark, cardsStartWanted, suitsCards } from './cards.js';

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

test('a lesson\'s Flash cards button asks for a set to open as cards, for a short while and for that set only', () => {
  const mark = cardsStartMark('caching', 1_000_000);
  assert.equal(mark, 'caching|1000000');
  assert.equal(cardsStartWanted(mark, 'caching', 1_000_000 + 29_000, 30_000), true);
  assert.equal(cardsStartWanted(mark, 'caching', 1_000_000 + 31_000, 30_000), false, 'it lapses');
  assert.equal(cardsStartWanted(mark, 'rest-and-api-design', 1_000_100, 30_000), false, 'another set is not asked for');
  assert.equal(cardsStartWanted(mark, 'caching', 999_000, 30_000), false, 'a mark from the future is not trusted');
  for (const bad of [null, undefined, '', 'caching', 'caching|', 'caching|abc', '|123', 5]) assert.equal(cardsStartWanted(bad, 'caching', 1_000_000, 30_000), false, String(bad));
  assert.equal(cardsStartWanted(cardsStartMark('a|b', 5), 'a|b', 10, 30_000), true, 'a name with a bar in it still works');
});
