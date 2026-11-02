// Deleting an account: everything private to it goes, public contributions lose the name, and nothing of anyone else's is touched.
// (Blog data is covered in blogs.test.js; this is the rest of what an account holds.)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { DELETED } from '../lib/deleted.js';
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com');
});

const raw = (sql, ...params) => env.DB.raw.prepare(sql).all(...params).map((row) => ({ ...row }));
const count = (table, where = '1 = 1', ...params) => raw(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...params)[0].n;
const call = (cookie, method, path, body) => app.request(`/api${path}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }, env);

/** What an account holds, for `sub`: rows in the directory, the workspace, votes, and public contributions. */
function seed(sub, email, name) {
  const now = new Date().toISOString();
  env.DB.raw.prepare('INSERT INTO users (user_id, email, name, picture, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)').run(sub, email, name, 'https://lh3.googleusercontent.com/a/x', now, now);
  env.DB.raw.prepare('INSERT INTO workspace_pages (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(`page-${sub}`, sub, `${name}'s private page`, '{"type":"doc"}', now, now);
  env.DB.raw.prepare('INSERT INTO books (id, user_id, display_name, title, created_at) VALUES (?, ?, ?, ?, ?)').run(`book-${sub}`, sub, name, `A book by ${name}`, now);
  env.DB.raw.prepare('INSERT INTO suggestions (id, user_id, display_name, text, created_at) VALUES (?, ?, ?, ?, ?)').run(`idea-${sub}`, sub, name, `An idea from ${name}`, now);
  env.DB.raw.prepare('INSERT INTO feed_posts (id, user_id, display_name, text, created_at) VALUES (?, ?, ?, ?, ?)').run(`post-${sub}`, sub, name, `A post by ${name}`, now);
}

test('deleting an account removes the directory row, the workspace and the votes, and anonymizes what it contributed in public', async () => {
  seed('user-ada@example.com', 'ada@example.com', 'Ada Lovelace');
  seed('user-grace@example.com', 'grace@example.com', 'Grace Hopper');
  env.DB.raw.prepare('INSERT INTO feed_votes (post_id, voter_id) VALUES (?, ?)').run('post-user-grace@example.com', 'user-ada@example.com');
  env.DB.raw.prepare('INSERT INTO suggestion_votes (suggestion_id, voter_id) VALUES (?, ?)').run('idea-user-grace@example.com', 'user-ada@example.com');

  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);

  assert.equal(count('users', 'user_id = ?', 'user-ada@example.com'), 0, 'the e-mail address, name and picture are gone');
  assert.equal(count('workspace_pages', 'user_id = ?', 'user-ada@example.com'), 0, 'her private pages are gone');
  assert.equal(count('feed_votes', 'voter_id = ?', 'user-ada@example.com'), 0);
  assert.equal(count('suggestion_votes', 'voter_id = ?', 'user-ada@example.com'), 0);

  for (const table of ['books', 'suggestions', 'feed_posts']) {
    assert.deepEqual(raw(`SELECT user_id, display_name FROM ${table} WHERE id LIKE '%ada@example.com'`)[0], { user_id: DELETED.userId, display_name: DELETED.name }, `${table}: the contribution stays, without her name`);
  }
  assert.equal(count('books', "title = 'A book by Ada Lovelace'"), 1, 'the title of what she added is public content and stays');

  // nothing of anyone else's was touched
  assert.equal(count('users', 'user_id = ?', 'user-grace@example.com'), 1);
  assert.equal(count('workspace_pages', 'user_id = ?', 'user-grace@example.com'), 1);
  assert.deepEqual(raw("SELECT display_name FROM books WHERE id LIKE '%grace@example.com'")[0], { display_name: 'Grace Hopper' });
  assert.equal(count('feed_votes', 'post_id = ?', 'post-user-grace@example.com'), 0, 'only her vote was removed from Grace\'s post');
});

test('deleting an account deletes the comments nobody replied to, and keeps the start of a thread others took part in', async () => {
  const comment = (id, userId, name, parent = '', path = 'a/module.md') => env.DB.raw.prepare(
    'INSERT INTO comments (id, path, user_id, display_name, text, parent_id, is_answer, hidden, created_at, mentions) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)'
  ).run(id, path, userId, name, `text of ${id}`, parent, new Date().toISOString(), '["someone"]');
  const adaId = 'user-ada@example.com';
  const graceId = 'user-grace@example.com';
  comment('ada-asked', adaId, 'Ada Lovelace');               // Grace replied: the thread keeps its start
  comment('grace-replied', graceId, 'Grace Hopper', 'ada-asked');
  comment('ada-alone', adaId, 'Ada Lovelace', '', 'b/other.md'); // nobody replied
  comment('grace-asked', graceId, 'Grace Hopper');           // Ada replied to Grace's question
  comment('ada-replied', adaId, 'Ada Lovelace', 'grace-asked');
  comment('stand-in', DELETED.userId, DELETED.name, '', 'c/third.md'); // from an earlier deletion; its only reply is Ada's
  comment('ada-last-reply', adaId, 'Ada Lovelace', 'stand-in', 'c/third.md');
  env.DB.raw.prepare('INSERT INTO comment_votes (path, comment_id, voter_id) VALUES (?, ?, ?)').run('a/module.md', 'ada-asked', graceId);
  env.DB.raw.prepare('INSERT INTO comment_votes (path, comment_id, voter_id) VALUES (?, ?, ?)').run('b/other.md', 'ada-alone', graceId);

  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);

  assert.deepEqual(raw('SELECT id, user_id, display_name, text, is_answer, mentions FROM comments ORDER BY id'), [
    { id: 'ada-asked', user_id: DELETED.userId, display_name: DELETED.name, text: DELETED.text, is_answer: 0, mentions: DELETED.mentions },
    { id: 'grace-asked', user_id: graceId, display_name: 'Grace Hopper', text: 'text of grace-asked', is_answer: 1, mentions: '["someone"]' },
    { id: 'grace-replied', user_id: graceId, display_name: 'Grace Hopper', text: 'text of grace-replied', is_answer: 1, mentions: '["someone"]' }
  ], 'her replies and her unanswered comments are gone, and so is the stand-in that only her reply held up');
  assert.equal(count('comment_votes'), 0, 'and the votes on what was removed');
});
