import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityTarget, commentAnchor, commentIdFromAnchor, describeActivity } from './comments.js';

test('an anchor names a comment, and only a comment', () => {
  assert.equal(commentAnchor('0001-abc'), 'comment-0001-abc');
  assert.equal(commentIdFromAnchor(commentAnchor('0001-abc')), '0001-abc');
  assert.equal(commentIdFromAnchor('why-jitter-matters'), null, 'a heading is not a comment');
  assert.equal(commentIdFromAnchor('comment-'), null, 'nor is an anchor with no id');
  assert.equal(commentIdFromAnchor(null), null);
  assert.equal(commentIdFromAnchor(undefined), null);
});

const onModule = { id: 'c1', path: 'backend/04-databases/01-indexes/README.md', kind: 'reply', by: 'Grace Hopper', at: '2026-10-02T00:00:00Z' };
const article = { id: 'c2', path: 'blog:a1', kind: 'mention', by: 'Ada Lovelace', at: '2026-10-03T00:00:00Z', title: 'Why retries need idempotency', slug: 'retries' };
const post = { id: 'c3', path: 'feed:p1', kind: 'reply', by: 'Linus T', at: '2026-10-04T00:00:00Z', title: 'A post about queues' };
const problem = { id: 'c4', path: 'code:two-sum', kind: 'reply', by: 'Edsger D', at: '2026-10-05T00:00:00Z', title: 'Two Sum', slug: 'two-sum' };

test('an item of activity leads to its module (and the comment), its article or its post', () => {
  assert.deepEqual(activityTarget(onModule), { type: 'module', path: onModule.path, anchor: 'comment-c1' });
  assert.deepEqual(activityTarget(article), { type: 'article', slug: 'retries' });
  assert.deepEqual(activityTarget(post), { type: 'post', id: 'p1' });
  assert.deepEqual(activityTarget(problem), { type: 'problem', slug: 'two-sum' });
});

test('an item says who did what, and where', () => {
  const title = (path) => (path === onModule.path ? 'Indexes' : path);
  assert.deepEqual(describeActivity(onModule, title), { what: 'Grace Hopper replied', where: 'Indexes' });
  assert.deepEqual(describeActivity(article, title), { what: 'Ada Lovelace mentioned you', where: 'Why retries need idempotency' });
  assert.deepEqual(describeActivity(post, title), { what: 'Linus T replied', where: '“A post about queues”' });
  assert.deepEqual(describeActivity(problem, title), { what: 'Edsger D replied', where: 'Two Sum' });
  assert.equal(describeActivity({ ...onModule, by: '' }, title).what, 'Someone replied');
});
