import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from './recommend.js';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const quizzes = [
  { slug: 'http-adv', topic: 'http', difficulty: 'advanced' },
  { slug: 'http-beg', topic: 'http', difficulty: 'beginner' },
  { slug: 'db-int', topic: 'databases', difficulty: 'intermediate' },
  { slug: 'db-beg', topic: 'databases', difficulty: 'beginner' },
  { slug: 'cache-int', topic: 'caching', difficulty: 'intermediate' }
];
const run = (extra) => recommend({ quizzes, now: NOW, ...extra });
const slugs = (list) => list.map((r) => r.slug);

test('a reader with no history is offered what has not been tried, the easiest first, three of them', () => {
  const list = run({});
  assert.deepEqual(slugs(list), ['http-beg', 'db-beg', 'db-int']);
  assert.ok(list.every((r) => r.kind === 'new'));
  assert.equal(run({ limit: 5 }).length, 5);
  assert.equal(run({ limit: 5 })[4].slug, 'http-adv', 'the hardest last');
});

test('a weak topic comes first, with how much was right, and the quiz done worst in it leads', () => {
  const attempts = [{ quiz: 'db-int', score: 1, max: 5, at: day(1) }, { quiz: 'db-beg', score: 3, max: 5, at: day(2) }];
  const list = run({ attempts, weak: [{ topic: 'databases', percent: 40 }] });
  assert.deepEqual(list[0], { slug: 'db-int', topic: 'databases', kind: 'weak', percent: 40 });
  assert.equal(list[1].slug, 'db-beg');
  assert.equal(list[1].kind, 'weak');
  assert.equal(list[2].kind, 'new', 'then what has not been tried');
});

test('a topic at or above the line is not weak, and the weakest topic is first', () => {
  const attempts = [{ quiz: 'db-int', score: 4, max: 5, at: day(1) }, { quiz: 'http-beg', score: 1, max: 5, at: day(1) }];
  const list = run({ attempts, weak: [{ topic: 'databases', percent: 70 }, { topic: 'http', percent: 20 }] });
  assert.equal(list[0].slug, 'http-beg');
  assert.ok(!slugs(list).includes('db-int') || list.find((r) => r.slug === 'db-int').kind !== 'weak', '70 is not below 70');
  assert.equal(list[0].percent, 20);
});

test('a quiz in a weak topic that was done perfectly is not suggested as weak', () => {
  const attempts = [{ quiz: 'db-beg', score: 5, max: 5, at: day(1) }, { quiz: 'db-int', score: 1, max: 5, at: day(1) }];
  const list = run({ attempts, weak: [{ topic: 'databases', percent: 50 }] });
  assert.equal(list.find((r) => r.slug === 'db-beg'), undefined);
  assert.equal(list[0].slug, 'db-int');
});

test('what was tried long ago and not got perfect comes back, the oldest first, after what is new', () => {
  const attempts = [
    { quiz: 'http-beg', score: 3, max: 5, at: day(30) },
    { quiz: 'db-beg', score: 4, max: 5, at: day(20) },
    { quiz: 'db-int', score: 4, max: 5, at: day(2) },
    { quiz: 'cache-int', score: 5, max: 5, at: day(60) },
    { quiz: 'http-adv', score: 2, max: 5, at: day(5) }
  ];
  const list = run({ attempts, limit: 5 });
  assert.deepEqual(slugs(list), ['http-beg', 'db-beg'], 'nothing is new; a perfect one and a recent one are left alone');
  assert.deepEqual(list.map((r) => [r.kind, r.days]), [['revisit', 30], ['revisit', 20]]);
});

test('the best try counts for revisiting: a perfect one once is done', () => {
  const attempts = [{ quiz: 'http-beg', score: 2, max: 5, at: day(40) }, { quiz: 'http-beg', score: 5, max: 5, at: day(50) }];
  assert.equal(run({ attempts, limit: 9 }).find((r) => r.slug === 'http-beg'), undefined);
});

test('the same quiz is never suggested twice, and nothing is suggested when there is nothing', () => {
  const attempts = [{ quiz: 'http-beg', score: 0, max: 5, at: day(40) }];
  const list = run({ attempts, weak: [{ topic: 'http', percent: 0 }], limit: 9 });
  assert.equal(new Set(slugs(list)).size, list.length);
  assert.deepEqual(recommend({ quizzes: [], now: NOW }), []);
  const all = quizzes.map((q) => ({ quiz: q.slug, score: 5, max: 5, at: day(1) }));
  assert.deepEqual(run({ attempts: all }), [], 'everything done well and recently');
});

test('odd input does not break it: a try with no maximum, a quiz with no level or topic', () => {
  const odd = [{ slug: 'x' }, { slug: 'y', difficulty: 'beginner' }];
  const list = recommend({ quizzes: odd, attempts: [{ quiz: 'x', score: 0, max: 0, at: 'nope' }], weak: [{ topic: undefined, percent: 10 }], now: NOW, limit: 5 });
  assert.deepEqual(slugs(list), ['y', 'x']);
});
