// Comments on modules, feed posts and blog articles (ported from the retired Azure API). Indexed on
// `path` (idx_comments_path), so the per-page reads are a real index lookup
// now instead of a partition scan; the cross-curriculum "questions" and
// "activity" views become GROUP BY / JOIN queries instead of bounded
// full-table scans. CommentVotes' `${commentId}_${userId}` row key becomes
// real comment_id / voter_id columns.

import { createRouter } from '../lib/router.js';
import { all, batch, first, run } from '../lib/d1.js';
import { getSession, isAdmin, requireAdmin } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { timeId } from '../lib/util.js';
import { BLOG_PREFIX, CHALLENGE_PREFIX, FEED_PREFIX, ON_A_MODULE, PROBLEM_PREFIX } from '../lib/commentPaths.js';
import { COMMENT_MAX_CHARS } from '../../webapp/src/lib/blog/limits.js';
import practice from '../generated/practice-content.json' with { type: 'json' };
import { VISIBLE } from '../lib/blogData.js';
import { DELETED } from '../lib/deleted.js';

const comments = createRouter();

const MAX_LENGTH = COMMENT_MAX_CHARS;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const LIST_LIMIT = 200;
const ADMIN_LIMIT = 500;
const ACTIVITY_ITEMS = 10;
const SNIPPET_CHARS = 80;

function toClientShape(e, votes) {
  return {
    id: e.id,
    userId: e.user_id,
    displayName: e.display_name,
    text: e.text,
    parentId: e.parent_id || null,
    createdAt: e.created_at,
    editedAt: e.edited_at || null,
    isAnswer: !!e.is_answer,
    // Deleted, with replies still under it: the app draws it as gone and offers nothing to do with it.
    deleted: e.user_id === DELETED.userId,
    upvotes: votes ? (votes.counts[e.id] || 0) : 0,
    votedByMe: votes ? votes.mine.has(e.id) : false
  };
}

/**
 * Takes a comment away. One with replies stays as a stand-in (no name, no text) so the replies keep their place; one without
 * is deleted, and so is a stand-in whose last reply that was. Its votes go either way.
 */
async function removeComment(env, path, id) {
  const hasReplies = (parentId) => first(env, 'SELECT 1 AS n FROM comments WHERE path = ?1 AND parent_id = ?2 LIMIT 1', path, parentId);
  const dropVotes = ['DELETE FROM comment_votes WHERE path = ?1 AND comment_id = ?2', path, id];

  if (await hasReplies(id)) {
    await batch(env, [
      ['UPDATE comments SET text = ?3, display_name = ?4, user_id = ?5, is_answer = 0, mentions = ?6 WHERE path = ?1 AND id = ?2', path, id, DELETED.text, DELETED.name, DELETED.userId, DELETED.mentions],
      dropVotes
    ]);
    return;
  }
  const row = await first(env, 'SELECT parent_id FROM comments WHERE path = ?1 AND id = ?2', path, id);
  await batch(env, [['DELETE FROM comments WHERE path = ?1 AND id = ?2', path, id], dropVotes]);
  const parentId = row && row.parent_id;
  if (!parentId) return;
  const parent = await first(env, 'SELECT user_id FROM comments WHERE path = ?1 AND id = ?2', path, parentId);
  if (parent && parent.user_id === DELETED.userId && !(await hasReplies(parentId))) await removeComment(env, path, parentId);
}

function parseMentions(text, participants) {
  const lower = text.toLowerCase();
  const mentioned = new Set();
  for (const [userId, displayName] of participants) {
    if (displayName && lower.includes('@' + displayName.toLowerCase())) mentioned.add(userId);
  }
  return [...mentioned];
}

async function loadVotes(env, path, userId) {
  const counts = {};
  const mine = new Set();
  for (const r of await all(env, 'SELECT comment_id, voter_id FROM comment_votes WHERE path = ?1', path)) {
    counts[r.comment_id] = (counts[r.comment_id] || 0) + 1;
    if (userId && r.voter_id === userId) mine.add(r.comment_id);
  }
  return { counts, mine };
}

/* --------------------------------------------- literal routes (before :path) */

comments.get('/comments/questions', async (c) => {
  const roots = await all(
    c.env,
    `SELECT id, path, display_name, text, created_at, is_answer
       FROM comments
      WHERE hidden = 0 AND (parent_id IS NULL OR parent_id = '') AND ${ON_A_MODULE} AND user_id != ?2
      ORDER BY created_at DESC LIMIT ?1`,
    LIST_LIMIT, DELETED.userId
  );
  const replyRows = await all(
    c.env,
    `SELECT parent_id, COUNT(*) AS n
       FROM comments
      WHERE hidden = 0 AND parent_id IS NOT NULL AND parent_id != '' AND ${ON_A_MODULE}
      GROUP BY parent_id`
  );
  const repliesByParent = {};
  for (const r of replyRows) repliesByParent[r.parent_id] = r.n;

  return c.json(roots.map((r) => {
    const replies = repliesByParent[r.id] || 0;
    return {
      id: r.id,
      path: r.path,
      displayName: r.display_name,
      text: r.text,
      createdAt: r.created_at,
      isAnswer: !!r.is_answer,
      replies,
      answered: !!r.is_answer || replies > 0
    };
  }));
});

comments.get('/comments/activity', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  const sinceParam = c.req.query('since');
  const sinceIso = sinceParam ? new Date(sinceParam).toISOString() : '1970-01-01T00:00:00.000Z';

  const myIdRows = await all(c.env, 'SELECT id FROM comments WHERE user_id = ?1', session.sub);
  const myIds = new Set(myIdRows.map((r) => r.id));

  const cands = await all(
    c.env,
    `SELECT id, parent_id, mentions, path, display_name, created_at
       FROM comments
      WHERE user_id != ?1 AND created_at > ?2
        AND ((parent_id IS NOT NULL AND parent_id != '') OR mentions LIKE ?3)
      ORDER BY created_at DESC`,
    session.sub, sinceIso, `%"${session.sub}"%`
  );

  let replies = 0;
  let mentions = 0;
  const found = [];
  for (const cand of cands) {
    let mentionList = [];
    try { mentionList = JSON.parse(cand.mentions || '[]'); } catch { /* older rows */ }
    const mentionsMe = mentionList.includes(session.sub);
    const isReplyToMe = !!cand.parent_id && myIds.has(cand.parent_id);
    if (!isReplyToMe && !mentionsMe) continue;
    if (isReplyToMe) replies++;
    else mentions++;
    found.push({ id: cand.id, path: cand.path, kind: isReplyToMe ? 'reply' : 'mention', by: cand.display_name, at: cand.created_at });
  }

  const paths = [...new Set(found.map((f) => f.path))].slice(0, ACTIVITY_ITEMS);
  return c.json({ count: replies + mentions, replies, mentions, paths, items: await withTitles(c.env, found.slice(0, ACTIVITY_ITEMS)) });
});

/**
 * What the app needs to link to each item of activity: on a module, its path is enough; on a feed post, the start of the post;
 * on an article or a coding problem, its title and address. An item on a post, article or problem that is gone is left out.
 */
async function withTitles(env, items) {
  const idsOn = (prefix) => [...new Set(items.filter((i) => i.path.startsWith(prefix)).map((i) => i.path.slice(prefix.length)))];
  const marks = (list, from) => list.map((_, i) => `?${i + from}`).join(', ');
  const feedIds = idsOn(FEED_PREFIX);
  const blogIds = idsOn(BLOG_PREFIX);
  const feed = feedIds.length ? await all(env, `SELECT id, text FROM feed_posts WHERE id IN (${marks(feedIds, 1)})`, ...feedIds) : [];
  const posts = blogIds.length
    ? await all(env, `SELECT p.id, p.slug, p.title FROM blog_posts p WHERE ${VISIBLE} AND p.id IN (${marks(blogIds, 2)})`, new Date().toISOString(), ...blogIds)
    : [];
  const feedText = new Map(feed.map((p) => [p.id, p.text]));
  const post = new Map(posts.map((p) => [p.id, p]));

  return items.flatMap((item) => {
    if (item.path.startsWith(FEED_PREFIX)) {
      const text = feedText.get(item.path.slice(FEED_PREFIX.length));
      return text == null ? [] : [{ ...item, title: String(text).replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS) }];
    }
    if (item.path.startsWith(CHALLENGE_PREFIX)) return []; // a comment on a Design Lab challenge: the page is gone, the comment stays in the table
    if (item.path.startsWith(PROBLEM_PREFIX)) {
      const slug = item.path.slice(PROBLEM_PREFIX.length);
      const problem = /** @type {Record<string, any>} */ (practice.code || {})[slug];
      return problem ? [{ ...item, title: problem.title, slug }] : []; // a problem that was taken out of the set: the comment stays in the table
    }
    if (item.path.startsWith(BLOG_PREFIX)) {
      const found = post.get(item.path.slice(BLOG_PREFIX.length));
      return found ? [{ ...item, title: found.title, slug: found.slug }] : [];
    }
    return [item];
  });
}

comments.post('/comments/vote', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const { path, id } = body;
  if (!path || !id) return c.json({ error: 'path and id are required' }, 400);
  const target = await first(c.env, 'SELECT user_id FROM comments WHERE path = ?1 AND id = ?2', path, id);
  if (!target || target.user_id === DELETED.userId) return c.json({ error: 'comment not found' }, 404);

  const existing = await first(
    c.env, 'SELECT 1 FROM comment_votes WHERE path = ?1 AND comment_id = ?2 AND voter_id = ?3',
    path, id, session.sub
  );
  if (existing) {
    await run(
      c.env, 'DELETE FROM comment_votes WHERE path = ?1 AND comment_id = ?2 AND voter_id = ?3',
      path, id, session.sub
    );
    return c.json({ voted: false });
  }
  await run(
    c.env, 'INSERT INTO comment_votes (path, comment_id, voter_id) VALUES (?1, ?2, ?3)',
    path, id, session.sub
  );
  return c.json({ voted: true });
});

comments.put('/comments/edit', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const { path, id } = body;
  if (!path || !id) return c.json({ error: 'path and id are required' }, 400);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ error: 'comment text is required' }, 400);
  if (text.length > MAX_LENGTH) return c.json({ error: `comment too long (max ${MAX_LENGTH} chars)` }, 400);

  const entity = await first(c.env, 'SELECT * FROM comments WHERE path = ?1 AND id = ?2', path, id);
  if (!entity || entity.user_id === DELETED.userId) return c.json({ error: 'comment not found' }, 404);
  if (entity.user_id !== session.sub && !(await isAdmin(c.env, session))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const editedAt = new Date().toISOString();
  await run(c.env, 'UPDATE comments SET text = ?1, edited_at = ?2 WHERE path = ?3 AND id = ?4', text, editedAt, path, id);
  return c.json(toClientShape({ ...entity, text, edited_at: editedAt }));
});

comments.delete('/comments/own', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  const path = c.req.query('path');
  const id = c.req.query('id');
  if (!path || !id) return c.json({ error: 'path and id are required' }, 400);

  const entity = await first(c.env, 'SELECT user_id FROM comments WHERE path = ?1 AND id = ?2', path, id);
  if (!entity) return c.body(null, 204);
  if (entity.user_id !== session.sub && !(await isAdmin(c.env, session))) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await removeComment(c.env, path, id);
  return c.body(null, 204);
});

comments.put('/manage/comments/answer', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const { path, id } = body;
  if (!path || !id) return c.json({ error: 'path and id are required' }, 400);

  await run(
    c.env, 'UPDATE comments SET is_answer = ?1 WHERE path = ?2 AND id = ?3 AND user_id != ?4',
    body.isAnswer ? 1 : 0, path, id, DELETED.userId
  );
  return c.body(null, 204);
});

comments.get('/manage/comments', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const rows = await all(
    c.env, 'SELECT * FROM comments ORDER BY created_at DESC LIMIT ?1', ADMIN_LIMIT
  );
  return c.json(rows.map((e) => ({ ...toClientShape(e), path: e.path, hidden: !!e.hidden })));
});

comments.delete('/manage/comments', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const path = c.req.query('path');
  const id = c.req.query('id');
  if (!path || !id) return c.json({ error: 'path and id are required' }, 400);
  await removeComment(c.env, path, id);
  return c.body(null, 204);
});

/* -------------------------------------------------------- wildcard per-page */

comments.get('/comments/:path{.+}', async (c) => {
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);

  const session = await getSession(c);
  const votes = await loadVotes(c.env, path, session && session.sub);
  const rows = await all(
    c.env, 'SELECT * FROM comments WHERE path = ?1 AND hidden = 0 ORDER BY id ASC', path
  );
  return c.json(rows.map((e) => toClientShape(e, votes)));
});

comments.post('/comments/:path{.+}', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ error: 'comment text is required' }, 400);
  if (text.length > MAX_LENGTH) return c.json({ error: `comment too long (max ${MAX_LENGTH} chars)` }, 400);
  const parentId = typeof body.parentId === 'string' ? body.parentId : '';

  try {
    if (!(await checkRateLimit(c.env, session.sub, 'comments', RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX))) {
      return c.json({ error: 'Too many comments — please wait a few minutes before posting again.' }, 429);
    }
  } catch { /* best-effort */ }

  const participantRows = await all(
    c.env, 'SELECT DISTINCT user_id, display_name FROM comments WHERE path = ?1 AND user_id != ?2',
    path, session.sub
  );
  const mentions = parseMentions(text, participantRows.map((r) => [r.user_id, r.display_name]));

  const row = {
    id: timeId(4),
    path,
    user_id: session.sub,
    display_name: session.name,
    text,
    parent_id: parentId,
    is_answer: 0,
    hidden: 0,
    edited_at: null,
    created_at: new Date().toISOString(),
    mentions: JSON.stringify(mentions)
  };
  await run(
    c.env,
    `INSERT INTO comments (id, path, user_id, display_name, text, parent_id, is_answer, hidden, created_at, mentions)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?8)`,
    row.id, row.path, row.user_id, row.display_name, row.text, row.parent_id, row.created_at, row.mentions
  );
  return c.json(toClientShape(row), 201);
});

export default comments;
