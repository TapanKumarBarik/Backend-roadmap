// A person's own posts, books and ideas: they can change them and take them back, nobody else can, and taking one back takes its
// upvotes and discussion with it. And the feed can be read a page at a time.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
let grace;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com', { name: 'Ada Lovelace' });
  grace = await signedInAs('grace@example.com', { name: 'Grace Hopper' });
});

async function call(cookie, method, path, body) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, env);
  const raw = await res.text();
  return { status: res.status, json: raw ? JSON.parse(raw) : null };
}
const rows = (sql, ...params) => env.DB.raw.prepare(sql).all(...params).map((row) => ({ ...row }));

test('a feed post can be changed and taken back by its author alone, and taking it back takes its upvotes and comments', async () => {
  const mine = (await call(ada, 'POST', '/feed', { text: 'First thoughts on retries' })).json;
  assert.equal((await call(null, 'PATCH', `/feed/${mine.id}`, { text: 'x' })).status, 401);
  assert.equal((await call(grace, 'PATCH', `/feed/${mine.id}`, { text: 'hijacked' })).status, 404, 'not theirs');
  assert.equal((await call(grace, 'DELETE', `/feed/${mine.id}`)).status, 404);

  const changed = await call(ada, 'PATCH', `/feed/${mine.id}`, { text: 'Second thoughts on retries' });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.text, 'Second thoughts on retries');
  assert.equal(rows('SELECT text FROM feed_posts WHERE id = ?', mine.id)[0].text, 'Second thoughts on retries');
  assert.equal((await call(ada, 'PATCH', `/feed/${mine.id}`, { text: '   ' })).status, 400, 'a post with nothing in it is not a post');
  assert.equal((await call(ada, 'PATCH', `/feed/${mine.id}`, { text: 'x'.repeat(20001) })).status, 400);

  await call(grace, 'POST', '/feed/vote', { id: mine.id });
  await call(grace, 'POST', `/comments/feed:${mine.id}`, { text: 'A reply under the post' });
  assert.equal((await call(ada, 'DELETE', `/feed/${mine.id}`)).status, 204);
  assert.deepEqual([rows('SELECT * FROM feed_posts').length, rows('SELECT * FROM feed_votes').length, rows('SELECT * FROM comments').length], [0, 0, 0]);
});

test('the feed is read a page at a time: the newest first, then those before the last one received, and without a page size it is as it was', async () => {
  const ids = [];
  for (let i = 0; i < 7; i++) {
    ids.push((await call(ada, 'POST', '/feed', { text: `post ${i}` })).json.id);
    await new Promise((resolve) => setTimeout(resolve, 3)); // ids sort by the millisecond they were made in
  }
  const page1 = (await call(null, 'GET', '/feed?limit=3')).json;
  assert.deepEqual(page1.map((p) => p.text), ['post 6', 'post 5', 'post 4']);
  const page2 = (await call(null, 'GET', `/feed?limit=3&before=${page1[2].id}`)).json;
  assert.deepEqual(page2.map((p) => p.text), ['post 3', 'post 2', 'post 1']);
  const page3 = (await call(null, 'GET', `/feed?limit=3&before=${page2[2].id}`)).json;
  assert.deepEqual(page3.map((p) => p.text), ['post 0'], 'the last page is short');
  assert.equal((await call(null, 'GET', '/feed')).json.length, 7, 'with no page size it is the whole list, as before');
  assert.equal((await call(null, 'GET', '/feed?limit=1000')).json.length, 7, 'a page is at most fifty');
  assert.equal((await call(null, 'GET', '/feed?limit=abc')).json.length, 7);
  assert.equal(ids.length, 7);
});

test('a book recommendation can be changed and taken back by its author alone', async () => {
  const book = (await call(ada, 'POST', '/books', { title: 'Designing Data-Intensive Applications', tag: 'databases', linkUrl: 'https://example.com/ddia' })).json;
  assert.equal((await call(grace, 'PATCH', `/books/${book.id}`, { title: 'Hijacked' })).status, 404);
  assert.equal((await call(grace, 'DELETE', `/books/${book.id}`)).status, 404);
  assert.equal((await call(null, 'PATCH', `/books/${book.id}`, { title: 'x' })).status, 401);

  const changed = (await call(ada, 'PATCH', `/books/${book.id}`, { title: 'DDIA, 2nd edition', tag: 'storage' })).json;
  assert.deepEqual([changed.title, changed.tag, changed.linkUrl], ['DDIA, 2nd edition', 'storage', 'https://example.com/ddia'], 'what was not sent is kept');
  assert.equal((await call(ada, 'PATCH', `/books/${book.id}`, { title: '' })).status, 400);
  assert.equal((await call(ada, 'PATCH', `/books/${book.id}`, { linkUrl: 'javascript:alert(1)' })).status, 400, 'a link is a web address');
  assert.equal((await call(ada, 'PATCH', `/books/${book.id}`, { linkUrl: '' })).status, 400, 'an entry with no link and no PDF is nothing');

  assert.equal((await call(ada, 'DELETE', `/books/${book.id}`)).status, 204);
  assert.equal(rows('SELECT * FROM books').length, 0);
});

test('an idea can be changed and taken back by its author alone, and its votes go with it', async () => {
  const idea = (await call(ada, 'POST', '/suggestions', { text: 'Add dark mode' })).json;
  await call(grace, 'POST', '/suggestions/vote', { id: idea.id });
  assert.equal((await call(grace, 'PATCH', `/suggestions/${idea.id}`, { text: 'Hijacked' })).status, 404);
  assert.equal((await call(grace, 'DELETE', `/suggestions/${idea.id}`)).status, 404);

  assert.equal((await call(ada, 'PATCH', `/suggestions/${idea.id}`, { text: 'Add a dark mode, please' })).json.text, 'Add a dark mode, please');
  assert.equal((await call(ada, 'PATCH', `/suggestions/${idea.id}`, { text: ' ' })).status, 400);
  assert.equal((await call(ada, 'PATCH', `/suggestions/${idea.id}`, { text: 'x'.repeat(1001) })).status, 400);

  assert.equal((await call(ada, 'DELETE', `/suggestions/${idea.id}`)).status, 204);
  assert.deepEqual([rows('SELECT * FROM suggestions').length, rows('SELECT * FROM suggestion_votes').length], [0, 0]);
});
