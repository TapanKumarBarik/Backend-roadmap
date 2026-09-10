// Port of api/src/functions/comments.js. The comments table is indexed on
// `path` (idx_comments_path), so the per-page reads are a real index lookup
// now instead of a partition scan; the cross-curriculum "questions" and
// "activity" views become GROUP BY / JOIN queries instead of bounded
// full-table scans. CommentVotes' `${commentId}_${userId}` row key becomes
// real comment_id / voter_id columns.

import { Hono } from 'hono';
import { all, first, run } from '../lib/d1.js';
import { getSession, isAdmin, requireAdmin } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { timeId } from '../lib/util.js';

const comments = new Hono();

const MAX_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const LIST_LIMIT = 200;
const ADMIN_LIMIT = 500;

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
    upvotes: votes ? (votes.counts[e.id] || 0) : 0,
    votedByMe: votes ? votes.mine.has(e.id) : false
  };
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
      WHERE hidden = 0 AND (parent_id IS NULL OR parent_id = '') AND path NOT LIKE 'feed:%'
      ORDER BY created_at DESC LIMIT ?1`,
    LIST_LIMIT
  );
  const replyRows = await all(
    c.env,
    `SELECT parent_id, COUNT(*) AS n
       FROM comments
      WHERE hidden = 0 AND parent_id IS NOT NULL AND parent_id != '' AND path NOT LIKE 'feed:%'
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
    `SELECT parent_id, mentions, path
       FROM comments
      WHERE user_id != ?1 AND created_at > ?2
        AND ((parent_id IS NOT NULL AND parent_id != '') OR mentions LIKE ?3)`,
    session.sub, sinceIso, `%"${session.sub}"%`
  );

  let replies = 0;
  let mentions = 0;
  const paths = new Set();
  for (const cand of cands) {
    let mentionList = [];
    try { mentionList = JSON.parse(cand.mentions || '[]'); } catch { /* older rows */ }
    const mentionsMe = mentionList.includes(session.sub);
    const isReplyToMe = !!cand.parent_id && myIds.has(cand.parent_id);
    if (!isReplyToMe && !mentionsMe) continue;
    if (isReplyToMe) replies++;
    else mentions++;
    paths.add(cand.path);
  }

  return c.json({ count: replies + mentions, replies, mentions, paths: [...paths].slice(0, 10) });
});

comments.post('/comments/vote', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const { path, id } = body;
  if (!path || !id) return c.json({ error: 'path and id are required' }, 400);

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
  if (!entity) return c.json({ error: 'comment not found' }, 404);
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
  await run(c.env, 'DELETE FROM comments WHERE path = ?1 AND id = ?2', path, id);
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
    c.env, 'UPDATE comments SET is_answer = ?1 WHERE path = ?2 AND id = ?3',
    body.isAnswer ? 1 : 0, path, id
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
  await run(c.env, 'DELETE FROM comments WHERE path = ?1 AND id = ?2', path, id);
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
