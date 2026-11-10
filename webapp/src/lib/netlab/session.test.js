import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, readState, recordDay, liveStreak, shareText } from './session.js';
import { dailyRound, dailySeed, check } from './questions.js';

test('a first day starts a streak of one, the next day makes two, a gap starts again', () => {
  let s = recordDay(emptyState(), '2026-11-10', 7);
  assert.deepEqual([s.streak, s.best, s.last, s.scores['2026-11-10']], [1, 1, '2026-11-10', 7]);
  s = recordDay(s, '2026-11-11', 9);
  assert.deepEqual([s.streak, s.best], [2, 2]);
  s = recordDay(s, '2026-11-14', 4);
  assert.deepEqual([s.streak, s.best], [1, 2], 'the best is kept');
  s = recordDay(s, '2026-11-15', 10);
  assert.deepEqual([s.streak, s.best], [2, 2]);
});

test('the streak counts across a month and a year end, and a leap day is a day', () => {
  let s = recordDay(emptyState(), '2026-12-31', 5);
  s = recordDay(s, '2027-01-01', 5);
  s = recordDay(s, '2027-01-02', 5);
  assert.equal(s.streak, 3);
  s = recordDay(emptyState(), '2028-02-28', 5);
  s = recordDay(s, '2028-02-29', 5);
  s = recordDay(s, '2028-03-01', 5);
  assert.equal(s.streak, 3);
});

test('the same day again keeps the streak and the better score, and does not change the earlier state', () => {
  const first = recordDay(emptyState(), '2026-11-10', 6);
  const again = recordDay(first, '2026-11-10', 9);
  assert.deepEqual([again.streak, again.scores['2026-11-10']], [1, 9]);
  assert.equal(recordDay(first, '2026-11-10', 3).scores['2026-11-10'], 6, 'a worse second go does not lower it');
  assert.equal(first.scores['2026-11-10'], 6);
});

test('a streak whose last day is before yesterday has ended', () => {
  const s = recordDay(recordDay(emptyState(), '2026-11-09', 5), '2026-11-10', 5);
  assert.equal(liveStreak(s, '2026-11-10'), 2);
  assert.equal(liveStreak(s, '2026-11-11'), 2, 'today is still to be played');
  assert.equal(liveStreak(s, '2026-11-12'), 0);
  assert.equal(liveStreak(emptyState(), '2026-11-12'), 0);
  assert.equal(liveStreak(s, '2026-11-01'), 0, 'a clock set back is not a streak');
});

test('whatever is in storage, the state that comes out is safe', () => {
  for (const bad of [null, undefined, 'x', 7, [], { streak: -1, best: 'a', last: 'nope', scores: 5 }]) {
    const s = readState(bad);
    assert.ok(Number.isInteger(s.streak) && s.streak >= 0);
    assert.ok(s.last === null || typeof s.last === 'string');
    assert.equal(typeof s.scores, 'object');
  }
  const good = readState({ streak: 3, best: 5, last: '2026-11-10', scores: { '2026-11-10': 8, 'bad-day': 3, '2026-11-09': 500 } });
  assert.deepEqual(good, { streak: 3, best: 5, last: '2026-11-10', scores: { '2026-11-10': 8 } });
  const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 5]));
  assert.equal(Object.keys(readState({ streak: 1, best: 1, last: '2026-04-10', scores: many }).scores).length, 60);
});

test('the text to share', () => {
  const url = 'https://example.com/tools/subnet/';
  assert.equal(shareText({ day: 'daily-2026-11-10', score: 8, total: 10, streak: 1, url }), `Subnet puzzle 2026-11-10: 8/10\n${url}`);
  assert.equal(shareText({ day: '2026-11-10', score: 10, total: 10, streak: 4, url }), `Subnet puzzle 2026-11-10: 10/10 · 4 days in a row\n${url}`);
});

test('the puzzle of the day is ten questions climbing in level, the same all day, and every answer checks', () => {
  const seed = dailySeed(new Date('2026-11-10T08:00:00Z'));
  const a = dailyRound(seed);
  assert.equal(a.length, 10);
  assert.deepEqual(a.map((q) => q.level), [1, 1, 1, 2, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(a.map((q) => q.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(a.map((q) => q.prompt), dailyRound(dailySeed(new Date('2026-11-10T22:00:00Z'))).map((q) => q.prompt), 'later the same day');
  assert.notDeepEqual(a.map((q) => q.prompt), dailyRound(dailySeed(new Date('2026-11-11T08:00:00Z'))).map((q) => q.prompt), 'another day');
  for (const q of a) assert.equal(check(q, q.answer), true);
});
