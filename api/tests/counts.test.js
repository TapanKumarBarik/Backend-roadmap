// What is new in the community, as two numbers: the dots on the tabs ask this instead of downloading the feed and every question.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { DELETED } from '../lib/deleted.js';
import { createEnv } from './helpers.js';

let env;
beforeEach(() => { env = createEnv(); });

const counts = async (query = '') => {
  const res = await app.request(`/api/community/counts${query}`, {}, env);
  return { status: res.status, json: await res.json() };
};
const db = () => env.DB.raw;
const post = (id, at) => db().prepare('INSERT INTO feed_posts (id, user_id, display_name, text, created_at) VALUES (?, ?, ?, ?, ?)').run(id, 'u', 'Someone', 'text', at);
function comment(id, at, { path = 'backend/a/README.md', parent = '', user = 'u', hidden = 0 } = {}) {
  db().prepare('INSERT INTO comments (id, path, user_id, display_name, text, parent_id, is_answer, hidden, created_at, mentions) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')
    .run(id, path, user, 'Someone', 'text', parent, hidden, at, '[]');
}

test('it counts the posts and the questions newer than the time each was last looked at, and needs no sign-in', async () => {
  post('p1', '2026-10-01T00:00:00.000Z');
  post('p2', '2026-10-03T00:00:00.000Z');
  post('p3', '2026-10-05T00:00:00.000Z');
  comment('q1', '2026-10-02T00:00:00.000Z');
  comment('q2', '2026-10-04T00:00:00.000Z');

  assert.deepEqual(await counts('?posts=2026-10-02T00:00:00.000Z&questions=2026-10-03T00:00:00.000Z'), { status: 200, json: { posts: 2, questions: 1 } });
  assert.deepEqual((await counts('?posts=2026-10-05T00:00:00.000Z&questions=2026-10-05T00:00:00.000Z')).json, { posts: 0, questions: 0 }, 'nothing is newer than the latest');
  assert.deepEqual((await counts()).json, { posts: 3, questions: 2 }, 'without a time everything is new');
});

test('a question is a comment on a module that starts a thread: replies, posts, articles, hidden and deleted ones are not', async () => {
  const at = '2026-10-02T00:00:00.000Z';
  comment('q', at);
  comment('reply', at, { parent: 'q' });
  comment('on-a-post', at, { path: 'feed:p1' });
  comment('on-an-article', at, { path: 'blog:a1' });
  comment('hidden', at, { hidden: 1 });
  comment('gone', at, { user: DELETED.userId });
  assert.equal((await counts('?questions=2026-10-01T00:00:00.000Z')).json.questions, 1);
});

test('a time that is not a time is refused', async () => {
  assert.equal((await counts('?posts=yesterday')).status, 400);
  assert.equal((await counts('?questions=%20')).status, 200, 'a blank one is the same as none');
});
