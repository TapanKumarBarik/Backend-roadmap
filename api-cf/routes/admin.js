// Ports people.js, pageviews.js and usage.js — the admin dashboard's data
// endpoints. The bounded full-table scans the Table Storage versions used for
// per-user activity counts become GROUP BY aggregates.

import { Hono } from 'hono';
import { all, first, run } from '../lib/d1.js';
import {
  getSession, isAdmin, requireAdmin, listAdmins, grantAdmin, revokeAdmin, normalize, adminEmail
} from '../lib/admin.js';
import { timeId } from '../lib/util.js';
import { STORAGE_ACCOUNT } from '../lib/blob.js';

const admin = new Hono();

const DAILY_WINDOW = 30;
const RECENT_SCAN = 2000;

/* ---------------------------------------------------------------- track */

admin.post('/track', async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const path = typeof body.path === 'string' ? body.path.slice(0, 500) : null;
  if (!path) return c.json({ error: 'path is required' }, 400);

  const session = await getSession(c);
  const now = new Date();
  await run(
    c.env,
    'INSERT INTO page_views (id, date, path, user, referrer, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    timeId(3),
    now.toISOString().slice(0, 10),
    path,
    session ? session.email : 'anonymous',
    (c.req.header('referer') || '').slice(0, 500),
    now.toISOString()
  );
  return c.body(null, 204);
});

/* ------------------------------------------------------------- manage/users */

admin.get('/manage/users', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const groupCount = async (sql) => {
    const map = {};
    for (const r of await all(c.env, sql)) map[r.k] = r.n;
    return map;
  };

  const [progress, notes, bookmarks, commentCounts] = await Promise.all([
    groupCount('SELECT user_id AS k, COUNT(*) AS n FROM module_progress GROUP BY user_id'),
    groupCount('SELECT user_id AS k, COUNT(*) AS n FROM notes GROUP BY user_id'),
    groupCount('SELECT user_id AS k, COUNT(*) AS n FROM bookmarks GROUP BY user_id'),
    groupCount(`SELECT user_id AS k, COUNT(*) AS n FROM comments WHERE user_id IS NOT NULL AND user_id != '' GROUP BY user_id`)
  ]);

  const viewsByEmail = {};
  const lastViewByEmail = {};
  for (const r of await all(
    c.env,
    `SELECT user AS k, COUNT(*) AS n, MAX(timestamp) AS last
       FROM page_views WHERE user IS NOT NULL AND user != 'anonymous' AND user != 'deleted'
      GROUP BY user`
  )) {
    const who = normalize(r.k);
    if (!who) continue;
    viewsByEmail[who] = r.n;
    lastViewByEmail[who] = r.last;
  }

  const streaks = {};
  for (const r of await all(c.env, 'SELECT user_id, current_streak, longest_streak FROM streaks')) {
    streaks[r.user_id] = { current: r.current_streak || 0, longest: r.longest_streak || 0 };
  }

  const admins = await listAdmins(c.env);
  const adminEmails = new Set(admins.map((a) => a.email));
  const rootEmail = adminEmail(c.env);

  const users = [];
  const seenEmails = new Set();
  for (const e of await all(c.env, 'SELECT * FROM users')) {
    const email = normalize(e.email);
    seenEmails.add(email);
    users.push({
      userId: e.user_id,
      email,
      name: e.name || email,
      picture: e.picture || null,
      firstSeen: e.first_seen || null,
      lastSeen: e.last_seen || null,
      isAdmin: adminEmails.has(email),
      isRoot: email === rootEmail,
      progress: progress[e.user_id] || 0,
      notes: notes[e.user_id] || 0,
      bookmarks: bookmarks[e.user_id] || 0,
      comments: commentCounts[e.user_id] || 0,
      views: viewsByEmail[email] || 0,
      streak: streaks[e.user_id] || null
    });
  }

  for (const [email, count] of Object.entries(viewsByEmail)) {
    if (seenEmails.has(email)) continue;
    users.push({
      userId: null, email, name: email, picture: null,
      firstSeen: null, lastSeen: lastViewByEmail[email] || null,
      isAdmin: adminEmails.has(email), isRoot: email === rootEmail,
      progress: 0, notes: 0, bookmarks: 0, comments: 0, views: count, streak: null, partial: true
    });
  }

  for (const a of admins) {
    if (seenEmails.has(a.email) || viewsByEmail[a.email]) continue;
    users.push({
      userId: null, email: a.email, name: a.email, picture: null,
      firstSeen: null, lastSeen: null,
      isAdmin: true, isRoot: a.root,
      progress: 0, notes: 0, bookmarks: 0, comments: 0, views: 0, streak: null, partial: true
    });
  }

  users.sort((a, b) => {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''));
  });

  return c.json({ users, admins, rootEmail });
});

admin.put('/manage/admins', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);
  if (!(await isAdmin(c.env, session))) return c.json({ error: 'forbidden' }, 403);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const email = normalize(body && body.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: 'a valid email address is required' }, 400);
  }
  if (email === adminEmail(c.env)) {
    return c.json({ error: 'That address is already the owner.' }, 400);
  }
  await grantAdmin(c.env, email, session.email);
  return c.json({ email, granted: true });
});

admin.delete('/manage/admins', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);
  if (!(await isAdmin(c.env, session))) return c.json({ error: 'forbidden' }, 403);

  const email = normalize(c.req.query('email'));
  if (!email) return c.json({ error: 'email is required' }, 400);
  if (email === adminEmail(c.env)) return c.json({ error: 'The owner cannot be removed.' }, 400);
  if (email === normalize(session.email)) {
    return c.json({ error: 'You cannot remove your own admin access.' }, 400);
  }
  await revokeAdmin(c.env, email);
  return c.body(null, 204);
});

/* --------------------------------------------------------- manage/pageviews */

admin.get('/manage/pageviews', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const rows = await all(
    c.env,
    'SELECT path, user, timestamp FROM page_views ORDER BY timestamp DESC LIMIT ?1',
    RECENT_SCAN
  );

  const byPath = {};
  const uniqueUsers = new Set();
  const byUser = {};
  let signedInViews = 0;
  rows.forEach((r) => {
    byPath[r.path] = (byPath[r.path] || 0) + 1;
    if (r.user && r.user !== 'anonymous') {
      uniqueUsers.add(r.user);
      byUser[r.user] = (byUser[r.user] || 0) + 1;
      signedInViews++;
    }
  });

  const perDay = new Map();
  rows.forEach((r) => {
    const day = String(r.timestamp).slice(0, 10);
    if (!perDay.has(day)) perDay.set(day, { views: 0, signedIn: 0, users: new Set() });
    const d = perDay.get(day);
    d.views++;
    if (r.user && r.user !== 'anonymous') { d.signedIn++; d.users.add(r.user); }
  });

  const daily = [];
  if (rows.length) {
    const end = new Date(rows[0].timestamp.slice(0, 10) + 'T00:00:00Z');
    const cursor = new Date(end);
    cursor.setUTCDate(cursor.getUTCDate() - (DAILY_WINDOW - 1));
    for (let i = 0; i < DAILY_WINDOW; i++) {
      const key = cursor.toISOString().slice(0, 10);
      const d = perDay.get(key);
      daily.push({
        date: key,
        views: d ? d.views : 0,
        signedIn: d ? d.signedIn : 0,
        visitors: d ? d.users.size : 0
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return c.json({
    recent: rows.slice(0, 200),
    totalViews: rows.length,
    signedInViews,
    anonymousViews: rows.length - signedInViews,
    uniqueSignedInUsers: uniqueUsers.size,
    capped: rows.length >= RECENT_SCAN,
    daily,
    topPaths: Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 20),
    topUsers: Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 10)
  });
});

/* ------------------------------------------------------------ manage/usage */

const USAGE_TABLES = {
  ModuleProgress: 'module_progress',
  Notes: 'notes',
  Bookmarks: 'bookmarks',
  Streaks: 'streaks',
  Reactions: 'reactions',
  Comments: 'comments',
  CommentVotes: 'comment_votes',
  PageViews: 'page_views',
  Messages: 'messages',
  RateLimits: 'rate_limits'
};

async function containerUsage(containerName, sas) {
  if (!sas) return null;
  let marker = '';
  let blobCount = 0;
  let totalBytes = 0;
  do {
    const url = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${containerName}?restype=container&comp=list&${sas}${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const xml = await res.text();
    blobCount += (xml.match(/<Blob>/g) || []).length;
    for (const m of xml.matchAll(/<Content-Length>(\d+)<\/Content-Length>/g)) totalBytes += Number(m[1]);
    const markerMatch = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
    marker = markerMatch ? markerMatch[1] : '';
  } while (marker);
  return { blobCount, totalBytes };
}

admin.get('/manage/usage', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const tables = {};
  for (const [label, table] of Object.entries(USAGE_TABLES)) {
    try {
      const row = await first(c.env, `SELECT COUNT(*) AS n FROM ${table}`);
      tables[label] = { count: row.n, capped: false };
    } catch (err) {
      tables[label] = { error: String(err) };
    }
  }

  const containers = {
    images: await containerUsage('images', c.env.IMAGES_CONTAINER_SAS),
    backups: await containerUsage('backups', c.env.BACKUPS_CONTAINER_SAS)
  };

  return c.json({ tables, containers });
});

export default admin;
