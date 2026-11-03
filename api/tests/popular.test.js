// The lessons read most, for the home page: aggregated, public, and honest about a quiet week.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { createEnv } from './helpers.js';

let env;
beforeEach(() => { env = createEnv(); });

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);
let n = 0;
function view(path, date = today(), user = 'anonymous') {
  env.DB.raw.prepare('INSERT INTO page_views (id, date, path, user, referrer, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(`v${++n}`, date, path, user, '', `${date}T00:00:00.000Z`);
}
const popular = async (query = '') => { const res = await app.request(`/api/popular${query}`, {}, env); return { status: res.status, cache: res.headers.get('cache-control'), json: await res.json() }; };

test('it ranks lessons by views in the window, needs no sign-in, and is cacheable', async () => {
  for (let i = 0; i < 5; i++) view('backend/a/README.md');
  for (let i = 0; i < 3; i++) view('backend/b/README.md', daysAgo(2), 'someone@example.com');
  const { status, cache, json } = await popular();
  assert.equal(status, 200);
  assert.match(cache, /public, max-age=\d+/);
  assert.deepEqual(json.lessons, [{ path: 'backend/a/README.md', views: 5 }, { path: 'backend/b/README.md', views: 3 }]);
  assert.ok(!JSON.stringify(json).includes('someone@example.com'), 'who read what is never in the answer');
});

test('a lesson with only a view or two is not listed, and neither is one outside the window or a page that is not a lesson', async () => {
  view('backend/few/README.md'); view('backend/few/README.md');
  for (let i = 0; i < 4; i++) view('backend/old/README.md', daysAgo(60));
  for (let i = 0; i < 4; i++) view('__admin');
  assert.deepEqual((await popular()).json.lessons, [], 'a quiet week is an empty list');
  assert.deepEqual((await popular('?days=90')).json.lessons.map((l) => l.path), ['backend/old/README.md'], 'a longer window finds the older lesson');
});

test('the window and the length are bounded, and nonsense falls back to the defaults', async () => {
  for (let i = 0; i < 3; i++) for (const p of ['a', 'b', 'c']) view(`backend/${p}/README.md`);
  assert.equal((await popular('?limit=2')).json.lessons.length, 2);
  assert.equal((await popular('?limit=abc&days=-5')).json.days, 30);
  assert.equal((await popular('?days=100000')).json.days, 90);
});
