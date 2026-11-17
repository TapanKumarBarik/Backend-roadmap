import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsStartMark, cardsStartWanted } from './cardsStart.js';

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
