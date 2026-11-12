import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityByDay, paceEstimate, weeklyCounts } from './progressStats.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12, 12);
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
// Two modules and three pieces of practice, all done within the week.
const statusMap = { 'backend/a/README.md': 'done', 'backend/b/README.md': 'done', 'practice/code/two-sum': 'done', 'practice/code/min-stack': 'done', 'practice/drill/2026-11-12': 'done' };
const timeMap = Object.fromEntries(Object.keys(statusMap).map((k, i) => [k, at(i)]));

test('a solved problem or a finished drill is not a module in the weekly count', () => {
  assert.deepEqual(weeklyCounts(statusMap, timeMap, NOW), { thisWeek: 2, lastWeek: 0, total: 2 });
});

test('practice does not count as modules done when the time left is worked out', () => {
  const pace = paceEstimate(statusMap, timeMap, 10, NOW);
  assert.equal(pace.done, 2);
  assert.equal(pace.remaining, 8, 'ten modules, two done');
  assert.equal(paceEstimate(statusMap, timeMap, 10, NOW, ['backend/a/README.md', 'backend/c/README.md', 'backend/d/README.md']).remaining, 2);
});

test('but a day of practice is a day of work in the activity strip', () => {
  const strip = activityByDay(statusMap, timeMap, 7, NOW);
  assert.equal(strip.reduce((n, d) => n + d.count, 0), 5, 'modules and practice together');
  assert.equal(strip.at(-1).count, 1);
});
