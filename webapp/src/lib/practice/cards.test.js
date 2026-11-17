import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsOf, isFinished, mark, missedCards, progressOf, startDeck, suitsCards, topCard } from './cards.js';

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

test('a deck holds every card once, in an order that depends only on the seed', () => {
  const cards = cardsOf(QUESTIONS);
  const a = startDeck(cards, 7);
  assert.deepEqual([...a.queue].sort(), ['0', '1', '2', '3']);
  assert.deepEqual(startDeck(cards, 7).queue, a.queue, 'the same seed gives the same order');
  assert.notDeepEqual(startDeck(cards, 8).queue, a.queue, 'another seed another order');
  assert.deepEqual(startDeck(cards).queue, ['0', '1', '2', '3'], 'without a seed the cards come as they are');
  assert.deepEqual(a.done, []);
  assert.deepEqual(a.missed, []);
});

test('the card on top is the first of the queue, and an empty deck has none', () => {
  const deck = startDeck(cardsOf(QUESTIONS));
  assert.equal(topCard(deck).front, 'What is a cache stampede?');
  assert.equal(topCard(startDeck([])), null);
});

test('a card that is got is done and the next one comes up', () => {
  const deck = mark(startDeck(cardsOf(QUESTIONS)), true);
  assert.deepEqual(deck.queue, ['1', '2', '3']);
  assert.deepEqual(deck.done, ['0']);
  assert.equal(topCard(deck).key, '1');
  assert.deepEqual(progressOf(deck), { done: 1, left: 3, total: 4 });
});

test('a card that is not got goes to the back, is remembered as missed, and comes again', () => {
  const deck = mark(startDeck(cardsOf(QUESTIONS)), false);
  assert.deepEqual(deck.queue, ['1', '2', '3', '0']);
  assert.deepEqual(deck.done, []);
  assert.deepEqual(deck.missed, ['0']);
  assert.deepEqual(progressOf(deck), { done: 0, left: 4, total: 4 }, 'a card that is not got does not count as done');
});

test('a card missed twice is remembered once, and the last card left comes straight back', () => {
  let deck = startDeck(cardsOf(QUESTIONS.slice(0, 2)));
  deck = mark(deck, false); // 0 to the back: [1, 0]
  deck = mark(deck, true); // 1 got: [0]
  deck = mark(deck, false); // 0 again: it is the only one, so it is on top again
  assert.equal(topCard(deck).key, '0');
  deck = mark(deck, false);
  assert.deepEqual(deck.missed, ['0']);
});

test('the deck is finished when every card is got, and what needed another go can be listed', () => {
  let deck = startDeck(cardsOf(QUESTIONS));
  deck = mark(deck, false); // 0 missed
  deck = mark(deck, true); // 1
  deck = mark(deck, false); // 2 missed
  assert.equal(isFinished(deck), false);
  for (let i = 0; i < 6 && !isFinished(deck); i++) deck = mark(deck, true);
  assert.equal(isFinished(deck), true);
  assert.equal(topCard(deck), null);
  assert.deepEqual(progressOf(deck), { done: 4, left: 0, total: 4 });
  assert.deepEqual(missedCards(deck).map((c) => c.key), ['0', '2']);
  assert.deepEqual(startDeck(missedCards(deck)).queue, ['0', '2'], 'a deck of just the missed ones');
});

test('marking a finished deck changes nothing, and the deck given is never changed', () => {
  const finished = startDeck([]);
  assert.equal(mark(finished, true), finished);
  const deck = startDeck(cardsOf(QUESTIONS));
  const before = JSON.stringify(deck);
  mark(deck, false);
  mark(deck, true);
  assert.equal(JSON.stringify(deck), before);
});
