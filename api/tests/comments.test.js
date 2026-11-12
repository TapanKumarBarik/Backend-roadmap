// The comments, end to end on the real app and an in-memory database: who may change a comment, what happens to the replies
// under a comment that is deleted, and what the account menu is told about replies and mentions. (Posting is rate limited,
// so a test that needs a thread puts its rows in the table and tests what the API does with them.)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { invalidateAdminCache } from '../lib/admin.js';
import { DELETED } from '../lib/deleted.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';
import practice from '../generated/practice-content.json' with { type: 'json' };

const MODULE = 'backend/04-databases/01-indexes/README.md';
const ADA = 'user-ada@example.com';
const GRACE = 'user-grace@example.com';

let env;
let ada;
let grace;
let owner;
beforeEach(async () => {
  env = createEnv();
  invalidateAdminCache();
  ada = await signedInAs('ada@example.com', { name: 'Ada Lovelace' });
  grace = await signedInAs('grace@example.com', { name: 'Grace Hopper' });
  owner = await signedInAs(OWNER_EMAIL);
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

const db = () => env.DB.raw;
const rows = (sql, ...params) => db().prepare(sql).all(...params).map((row) => ({ ...row }));
let clock = Date.parse('2026-10-01T00:00:00Z');
/** A comment in the table: `by` is a user id, `parent` the id of the comment it replies to. */
function comment(id, { path = MODULE, by = ADA, name = 'Ada Lovelace', parent = '', answer = 0, mentions = [], at = new Date((clock += 60000)).toISOString() } = {}) {
  db().prepare('INSERT INTO comments (id, path, user_id, display_name, text, parent_id, is_answer, hidden, created_at, mentions) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .run(id, path, by, name, `text of ${id}`, parent, answer, at, JSON.stringify(mentions));
}
const vote = (path, commentId, voter) => db().prepare('INSERT INTO comment_votes (path, comment_id, voter_id) VALUES (?, ?, ?)').run(path, commentId, voter);
const listed = async (path = MODULE) => (await call(null, 'GET', `/comments/${path}`)).json;
const del = (cookie, id, path = MODULE) => call(cookie, 'DELETE', `/comments/own?path=${encodeURIComponent(path)}&id=${id}`);

test('a thread is listed oldest first, and nobody is told it has been deleted', async () => {
  comment('c1');
  comment('c2', { by: GRACE, name: 'Grace Hopper', parent: 'c1' });
  const thread = await listed();
  assert.deepEqual(thread.map((c) => c.id), ['c1', 'c2']);
  assert.deepEqual(thread.map((c) => c.deleted), [false, false]);
});

test('only the author or an admin deletes a comment', async () => {
  comment('c1');
  assert.equal((await del(grace, 'c1')).status, 403);
  assert.equal((await del(null, 'c1')).status, 401);
  assert.equal((await listed()).length, 1);
  assert.equal((await del(owner, 'c1')).status, 204, 'an admin may');
  assert.equal((await listed()).length, 0);
  comment('c2');
  assert.equal((await del(ada, 'c2')).status, 204, 'and so may its author');
});

test('a comment with replies under it stays as a stand-in, without its author or its words, and the replies keep their place', async () => {
  comment('c1', { answer: 1 });
  comment('c2', { by: GRACE, name: 'Grace Hopper', parent: 'c1' });
  vote(MODULE, 'c1', GRACE);

  assert.equal((await del(ada, 'c1')).status, 204);
  const thread = await listed();
  assert.deepEqual(thread.map((c) => c.id), ['c1', 'c2'], 'both are still there');
  const [standIn, reply] = thread;
  assert.equal(standIn.deleted, true);
  assert.equal(standIn.text, DELETED.text);
  assert.equal(standIn.displayName, DELETED.name);
  assert.equal(standIn.isAnswer, false, 'a deleted comment is no answer');
  assert.equal(standIn.upvotes, 0);
  assert.equal(reply.text, 'text of c2');
  assert.equal(reply.deleted, false);
  assert.equal(rows('SELECT * FROM comment_votes').length, 0, 'its votes went with it');
});

test('nothing can be done with a stand-in: no edit, no vote, no answer, and it is not the author\'s to delete again', async () => {
  comment('c1');
  comment('c2', { by: GRACE, name: 'Grace Hopper', parent: 'c1' });
  await del(ada, 'c1');

  assert.equal((await call(owner, 'PUT', '/comments/edit', { path: MODULE, id: 'c1', text: 'back from the dead' })).status, 404);
  assert.equal((await call(grace, 'POST', '/comments/vote', { path: MODULE, id: 'c1' })).status, 404);
  await call(owner, 'PUT', '/manage/comments/answer', { path: MODULE, id: 'c1', isAnswer: true });
  const [standIn] = await listed();
  assert.equal(standIn.text, DELETED.text);
  assert.equal(standIn.isAnswer, false);
  assert.equal((await del(ada, 'c1')).status, 403, 'it is nobody\'s comment now');
});

test('a comment without replies is removed, and so is a stand-in when its last reply goes', async () => {
  comment('c1');
  comment('c2', { by: GRACE, name: 'Grace Hopper', parent: 'c1' });
  comment('c3', { by: GRACE, name: 'Grace Hopper', parent: 'c1' });
  await del(ada, 'c1');
  assert.equal((await listed()).length, 3, 'the stand-in and two replies');

  await del(grace, 'c2');
  assert.deepEqual((await listed()).map((c) => c.id), ['c1', 'c3'], 'one reply is gone, the stand-in is still needed');
  await del(grace, 'c3');
  assert.deepEqual(await listed(), [], 'the last reply took the stand-in with it');
  assert.equal(rows('SELECT * FROM comments').length, 0);
});

test('an admin deleting from the moderation list does the same', async () => {
  comment('c1');
  comment('c2', { by: GRACE, name: 'Grace Hopper', parent: 'c1' });
  assert.equal((await call(owner, 'DELETE', `/manage/comments?path=${encodeURIComponent(MODULE)}&id=c1`)).status, 204);
  assert.equal((await listed())[0].deleted, true);
  assert.equal((await call(owner, 'DELETE', `/manage/comments?path=${encodeURIComponent(MODULE)}&id=c2`)).status, 204);
  assert.deepEqual(await listed(), []);
});

test('a vote needs a comment that is there', async () => {
  comment('c1');
  assert.equal((await call(grace, 'POST', '/comments/vote', { path: MODULE, id: 'nope' })).status, 404);
  assert.deepEqual((await call(grace, 'POST', '/comments/vote', { path: MODULE, id: 'c1' })).json, { voted: true });
  assert.deepEqual((await call(grace, 'POST', '/comments/vote', { path: MODULE, id: 'c1' })).json, { voted: false });
});

test('the list of questions is the comments on modules, newest first, and not what is said under a post or an article', async () => {
  comment('q1');
  comment('q2', { by: GRACE, name: 'Grace Hopper' });
  comment('f1', { path: 'feed:post-1' });
  comment('b1', { path: 'blog:article-1' });
  comment('p1', { path: 'code:two-sum' });
  const { json } = await call(null, 'GET', '/comments/questions');
  assert.deepEqual(json.map((q) => q.id), ['q2', 'q1'], 'what is said under a coding problem is not a question about a module either');
});

test('a question that was deleted while it had replies is no longer listed as a question', async () => {
  comment('q1');
  comment('q2', { by: GRACE, name: 'Grace Hopper' });
  comment('r1', { by: GRACE, name: 'Grace Hopper', parent: 'q1' });
  await del(ada, 'q1');
  assert.equal((await listed()).length, 3, 'it is still in its thread');
  const { json } = await call(null, 'GET', '/comments/questions');
  assert.deepEqual(json.map((q) => q.id), ['q2']);
});

/* ------------------------------------------------------------------------------------------------------- activity */

function article(id, slug, title, { hidden = 0 } = {}) {
  const now = new Date().toISOString();
  db().prepare('INSERT INTO blog_posts (id, author_id, slug, title, content, status, publish_at, hidden, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ADA, slug, title, '{}', 'published', '2026-01-01T00:00:00Z', hidden, now, now);
}

test('the account menu is told what happened, by whom and where: a reply or a mention, on a module, a post or an article', async () => {
  article('a1', 'retries', 'Why retries need idempotency');
  article('a2', 'taken-down', 'A post that was taken down', { hidden: 1 });
  db().prepare('INSERT INTO feed_posts (id, user_id, display_name, text, created_at) VALUES (?, ?, ?, ?, ?)').run('p1', ADA, 'Ada Lovelace', '  A long\n\n post   about queues  ', '2026-10-01T00:00:00Z');

  comment('mine', { at: '2026-09-01T00:00:00Z' });
  comment('r1', { by: GRACE, name: 'Grace Hopper', parent: 'mine', at: '2026-10-02T00:00:00Z' });
  comment('m1', { by: GRACE, name: 'Grace Hopper', path: 'feed:p1', mentions: [ADA], at: '2026-10-03T00:00:00Z' });
  comment('mine2', { path: 'blog:a1', at: '2026-09-02T00:00:00Z' });
  comment('r2', { by: GRACE, name: 'Grace Hopper', path: 'blog:a1', parent: 'mine2', at: '2026-10-04T00:00:00Z' });
  comment('mine3', { path: 'blog:a2', at: '2026-09-03T00:00:00Z' });
  comment('r3', { by: GRACE, name: 'Grace Hopper', path: 'blog:a2', parent: 'mine3', at: '2026-10-05T00:00:00Z' });
  comment('nobody', { by: GRACE, name: 'Grace Hopper', at: '2026-10-06T00:00:00Z' }); // not a reply to Ada, and does not mention her

  const { status, json } = await call(ada, 'GET', '/comments/activity?since=2026-09-15T00:00:00Z');
  assert.equal(status, 200);
  assert.equal(json.replies, 3);
  assert.equal(json.mentions, 1);
  assert.equal(json.count, 4);
  assert.deepEqual(json.items, [
    { id: 'r2', path: 'blog:a1', kind: 'reply', by: 'Grace Hopper', at: '2026-10-04T00:00:00Z', title: 'Why retries need idempotency', slug: 'retries' },
    { id: 'm1', path: 'feed:p1', kind: 'mention', by: 'Grace Hopper', at: '2026-10-03T00:00:00Z', title: 'A long post about queues' },
    { id: 'r1', path: MODULE, kind: 'reply', by: 'Grace Hopper', at: '2026-10-02T00:00:00Z' }
  ], 'newest first; the reply under an article that was taken down is counted but not linked');
  assert.deepEqual(json.paths.sort(), ['blog:a1', 'blog:a2', 'feed:p1', MODULE].sort());
});

test('what happened before the reader last looked is not new, and the activity is the reader\'s own', async () => {
  comment('mine');
  comment('r1', { by: GRACE, name: 'Grace Hopper', parent: 'mine', at: '2026-10-02T00:00:00Z' });
  assert.equal((await call(ada, 'GET', '/comments/activity?since=2026-10-03T00:00:00Z')).json.count, 0);
  assert.equal((await call(grace, 'GET', '/comments/activity')).json.count, 0, 'Grace wrote the reply; nothing happened to her');
  assert.equal((await call(null, 'GET', '/comments/activity')).status, 401);
});

/* ------------------------------------------------------------------------------------------------ a coding problem's discussion */

const [PROBLEM] = Object.keys(practice.code);
const PROBLEM_PATH = `code:${PROBLEM}`;

test('a coding problem has a discussion of its own: it is read by anyone, written by the signed in, and kept apart from the modules', async () => {
  assert.deepEqual((await call(null, 'GET', `/comments/${PROBLEM_PATH}`)).json, []);
  assert.equal((await call(null, 'POST', `/comments/${PROBLEM_PATH}`, { text: 'hello' })).status, 401);

  const code = 'My solution:\n```python\ndef add(a, b):\n    return a + b\n```';
  const posted = await call(ada, 'POST', `/comments/${PROBLEM_PATH}`, { text: code });
  assert.equal(posted.status, 201);
  assert.equal(posted.json.text, code, 'the code is kept as it was written, line breaks and all');
  assert.deepEqual((await call(null, 'GET', `/comments/${PROBLEM_PATH}`)).json.map((c) => c.text), [code]);
  assert.deepEqual(await listed(), [], 'the discussion of a module is not touched');
  assert.equal((await call(ada, 'POST', `/comments/${PROBLEM_PATH}`, { text: 'x'.repeat(2001) })).status, 400, 'a comment has the same limit here as anywhere');
});

test('a reply under a coding problem leads back to the problem, by its title; one under a problem that has been taken out is counted, not linked', async () => {
  comment('mine', { path: PROBLEM_PATH, at: '2026-09-01T00:00:00Z' });
  comment('r1', { by: GRACE, name: 'Grace Hopper', path: PROBLEM_PATH, parent: 'mine', at: '2026-10-02T00:00:00Z' });
  comment('mine2', { path: 'code:no-such-problem', at: '2026-09-02T00:00:00Z' });
  comment('r2', { by: GRACE, name: 'Grace Hopper', path: 'code:no-such-problem', parent: 'mine2', at: '2026-10-03T00:00:00Z' });

  const { json } = await call(ada, 'GET', '/comments/activity?since=2026-09-15T00:00:00Z');
  assert.equal(json.count, 2);
  assert.deepEqual(json.items, [
    { id: 'r1', path: PROBLEM_PATH, kind: 'reply', by: 'Grace Hopper', at: '2026-10-02T00:00:00Z', title: practice.code[PROBLEM].title, slug: PROBLEM }
  ]);
});
