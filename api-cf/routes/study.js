// Ports bookmarks.js, notes.js, progress.js, streaks.js, reactions.js and
// account.js — the private, per-user "study" surface. Every route is keyed by
// the signed-in user's Google `sub` (session.sub).

import { Hono } from 'hono';
import { all, first, run, batch } from '../lib/d1.js';
import { getSession } from '../lib/admin.js';
import { SESSION_COOKIE, cookieAttrs } from '../lib/session.js';

const study = new Hono();

async function requireSession(c) {
  const session = await getSession(c);
  if (!session) return { res: c.json({ error: 'unauthenticated' }, 401) };
  return { session };
}

/* ---------------------------------------------------------------- bookmarks */

study.get('/bookmarks', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const rows = await all(c.env, 'SELECT path FROM bookmarks WHERE user_id = ?1', session.sub);
  return c.json(rows.map((r) => r.path));
});

study.put('/bookmarks/:path{.+}', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);
  await run(
    c.env,
    `INSERT INTO bookmarks (user_id, path, created_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id, path) DO UPDATE SET created_at = ?3`,
    session.sub, path, new Date().toISOString()
  );
  return c.body(null, 204);
});

study.delete('/bookmarks/:path{.+}', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);
  await run(c.env, 'DELETE FROM bookmarks WHERE user_id = ?1 AND path = ?2', session.sub, path);
  return c.body(null, 204);
});

/* -------------------------------------------------------------------- notes */

const MAX_NOTE_LENGTH = 10000;

study.get('/notes', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const rows = await all(
    c.env,
    'SELECT path, text, updated_at FROM notes WHERE user_id = ?1 ORDER BY updated_at DESC',
    session.sub
  );
  return c.json(rows.map((r) => ({ path: r.path, text: r.text, updatedAt: r.updated_at })));
});

study.get('/notes/:path{.+}', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);
  const row = await first(
    c.env, 'SELECT text, updated_at FROM notes WHERE user_id = ?1 AND path = ?2', session.sub, path
  );
  return c.json(row ? { text: row.text, updatedAt: row.updated_at } : { text: '', updatedAt: null });
});

study.put('/notes/:path{.+}', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_NOTE_LENGTH) : '';

  if (!text.trim()) {
    await run(c.env, 'DELETE FROM notes WHERE user_id = ?1 AND path = ?2', session.sub, path);
    return c.body(null, 204);
  }
  await run(
    c.env,
    `INSERT INTO notes (user_id, path, text, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id, path) DO UPDATE SET text = ?3, updated_at = ?4`,
    session.sub, path, text, new Date().toISOString()
  );
  return c.body(null, 204);
});

/* ----------------------------------------------------------------- progress */

const VALID_STATUSES = ['todo', 'wip', 'done'];

study.get('/progress', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const rows = await all(c.env, 'SELECT path, status FROM module_progress WHERE user_id = ?1', session.sub);
  const map = {};
  for (const r of rows) map[r.path] = r.status;
  return c.json(map);
});

study.get('/progress/times', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const rows = await all(c.env, 'SELECT path, updated_at FROM module_progress WHERE user_id = ?1', session.sub);
  const map = {};
  for (const r of rows) if (r.updated_at) map[r.path] = r.updated_at;
  return c.json(map);
});

study.post('/progress/reset', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  await run(c.env, 'DELETE FROM module_progress WHERE user_id = ?1', session.sub);
  return c.body(null, 204);
});

study.put('/progress/:path{.+}', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const status = body && body.status;
  if (!VALID_STATUSES.includes(status)) {
    return c.json({ error: 'status must be todo, wip, or done' }, 400);
  }

  if (status === 'todo') {
    await run(c.env, 'DELETE FROM module_progress WHERE user_id = ?1 AND path = ?2', session.sub, path);
  } else {
    await run(
      c.env,
      `INSERT INTO module_progress (user_id, path, status, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(user_id, path) DO UPDATE SET status = ?3, updated_at = ?4`,
      session.sub, path, status, new Date().toISOString()
    );
  }
  return c.body(null, 204);
});

/* ------------------------------------------------------------------ streak */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

study.get('/streak', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;

  const today = todayStr();
  let row = await first(
    c.env,
    'SELECT current_streak, longest_streak, last_active_date FROM streaks WHERE user_id = ?1',
    session.sub
  );

  if (!row || row.last_active_date !== today) {
    const current = row && daysBetween(row.last_active_date, today) === 1 ? row.current_streak + 1 : 1;
    const longest = Math.max(current, (row && row.longest_streak) || 0);
    await run(
      c.env,
      `INSERT INTO streaks (user_id, current_streak, longest_streak, last_active_date)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(user_id) DO UPDATE SET current_streak = ?2, longest_streak = ?3, last_active_date = ?4`,
      session.sub, current, longest, today
    );
    row = { current_streak: current, longest_streak: longest, last_active_date: today };
  }

  return c.json({
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActiveDate: row.last_active_date
  });
});

/* --------------------------------------------------------------- reactions */

const ALLOWED_EMOJI = ['👍', '🔥', '🤔']; // 👍 🔥 🤔

study.get('/reactions/:path{.+}', async (c) => {
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);
  const session = await getSession(c);

  const rows = await all(c.env, 'SELECT user_id, emoji FROM reactions WHERE path = ?1', path);
  const counts = {};
  const mine = [];
  for (const r of rows) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (session && r.user_id === session.sub) mine.push(r.emoji);
  }
  return c.json({ counts, mine });
});

study.post('/reactions/:path{.+}', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const path = c.req.param('path');
  if (!path) return c.json({ error: 'missing path' }, 400);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  if (!ALLOWED_EMOJI.includes(body.emoji)) return c.json({ error: 'unsupported reaction' }, 400);

  const existing = await first(
    c.env, 'SELECT 1 FROM reactions WHERE path = ?1 AND user_id = ?2 AND emoji = ?3',
    path, session.sub, body.emoji
  );
  if (existing) {
    await run(
      c.env, 'DELETE FROM reactions WHERE path = ?1 AND user_id = ?2 AND emoji = ?3',
      path, session.sub, body.emoji
    );
    return c.json({ active: false });
  }
  await run(
    c.env, 'INSERT INTO reactions (path, user_id, emoji, created_at) VALUES (?1, ?2, ?3, ?4)',
    path, session.sub, body.emoji, new Date().toISOString()
  );
  return c.json({ active: true });
});

/* ------------------------------------------------------------------ account */

// Delete-my-data: hard-delete the private per-user tables, anonymize
// identity on content other people's threads depend on (comments, feed
// posts, messages, page views), then clear the session cookie. Mirrors
// api/src/functions/account.js exactly.
study.delete('/account', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const uid = session.sub;
  const email = session.email;

  await batch(c.env, [
    ['DELETE FROM module_progress WHERE user_id = ?1', uid],
    ['DELETE FROM notes WHERE user_id = ?1', uid],
    ['DELETE FROM bookmarks WHERE user_id = ?1', uid],
    ['DELETE FROM streaks WHERE user_id = ?1', uid],
    ['DELETE FROM rate_limits WHERE user_id = ?1', uid],
    ['DELETE FROM reactions WHERE user_id = ?1', uid],
    ['DELETE FROM comment_votes WHERE voter_id = ?1', uid],
    [`UPDATE comments SET display_name = '[deleted user]', text = '[deleted]', user_id = 'deleted' WHERE user_id = ?1`, uid],
    [`UPDATE feed_posts SET display_name = '[deleted user]', user_id = 'deleted' WHERE user_id = ?1`, uid],
    [`UPDATE messages SET display_name = '[deleted user]', email = 'deleted', user_id = 'deleted' WHERE user_id = ?1`, uid],
    [`UPDATE page_views SET user = 'deleted' WHERE user = ?1`, email]
  ]);

  c.header('Set-Cookie', cookieAttrs(SESSION_COOKIE, '', 0));
  return c.body(null, 204);
});

export default study;
