// Ports books.js, suggestions.js and messages.js — the shared community
// surface. Books and Suggestions are public reads (anyone can browse, only
// signed-in users can add); Messages is a private admin-only inbox. The
// `${id}_${userId}` SuggestionVotes row key becomes real columns.

import { Hono } from 'hono';
import { all, first, run } from '../lib/d1.js';
import { getSession, requireAdmin } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { timeId } from '../lib/util.js';
import { FEED_CONTAINER, blobBase } from '../lib/blob.js';

const community = new Hono();

const LIST_LIMIT = 500;

async function requireSession(c) {
  const session = await getSession(c);
  if (!session) return { res: c.json({ error: 'unauthenticated' }, 401) };
  return { session };
}

/* -------------------------------------------------------------------- books */

const MAX_TITLE_LENGTH = 200;
const MAX_TAG_LENGTH = 40;

function bookShape(e) {
  return {
    id: e.id,
    userId: e.user_id,
    displayName: e.display_name,
    title: e.title,
    tag: e.tag || null,
    linkUrl: e.link_url || null,
    attachmentUrl: e.attachment_url || null,
    createdAt: e.created_at
  };
}

community.get('/books', async (c) => {
  const rows = await all(c.env, 'SELECT * FROM books ORDER BY id DESC LIMIT ?1', LIST_LIMIT);
  return c.json(rows.map(bookShape));
});

community.post('/books', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return c.json({ error: 'a title is required' }, 400);
  if (title.length > MAX_TITLE_LENGTH) return c.json({ error: `title too long (max ${MAX_TITLE_LENGTH} chars)` }, 400);

  const tag = typeof body.tag === 'string' ? body.tag.trim().slice(0, MAX_TAG_LENGTH) : '';

  const linkUrl = typeof body.linkUrl === 'string' ? body.linkUrl.trim() : '';
  if (linkUrl && (!/^https?:\/\//i.test(linkUrl) || linkUrl.length > 2000)) {
    return c.json({ error: 'not a valid link' }, 400);
  }

  const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl.trim() : '';
  if (attachmentUrl) {
    if (!attachmentUrl.startsWith(`${blobBase(FEED_CONTAINER)}/`) || !attachmentUrl.endsWith('.pdf')) {
      return c.json({ error: 'invalid attachment' }, 400);
    }
  }
  if (!linkUrl && !attachmentUrl) return c.json({ error: 'add a link or a PDF' }, 400);

  try {
    if (!(await checkRateLimit(c.env, session.sub, 'books', 10 * 60 * 1000, 10))) {
      return c.json({ error: 'Too many entries — please wait a bit before adding another.' }, 429);
    }
  } catch { /* best-effort */ }

  const row = {
    id: timeId(4),
    user_id: session.sub,
    display_name: session.name,
    title,
    tag: tag || null,
    link_url: linkUrl || null,
    attachment_url: attachmentUrl || null,
    created_at: new Date().toISOString()
  };
  await run(
    c.env,
    `INSERT INTO books (id, user_id, display_name, title, tag, link_url, attachment_url, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    row.id, row.user_id, row.display_name, row.title, row.tag, row.link_url, row.attachment_url, row.created_at
  );
  return c.json(bookShape(row), 201);
});

community.delete('/manage/books', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id is required' }, 400);
  await run(c.env, 'DELETE FROM books WHERE id = ?1', id);
  return c.body(null, 204);
});

/* -------------------------------------------------------------- suggestions */

const MAX_SUGGESTION_LENGTH = 1000;

function suggestionShape(e, votes) {
  return {
    id: e.id,
    userId: e.user_id,
    displayName: e.display_name,
    text: e.text,
    createdAt: e.created_at,
    upvotes: votes ? (votes.counts[e.id] || 0) : 0,
    votedByMe: votes ? votes.mine.has(e.id) : false
  };
}

async function loadSuggestionVotes(env, userId) {
  const counts = {};
  const mine = new Set();
  for (const r of await all(env, 'SELECT suggestion_id, voter_id FROM suggestion_votes')) {
    counts[r.suggestion_id] = (counts[r.suggestion_id] || 0) + 1;
    if (userId && r.voter_id === userId) mine.add(r.suggestion_id);
  }
  return { counts, mine };
}

community.get('/suggestions', async (c) => {
  const session = await getSession(c);
  const [votes, rows] = await Promise.all([
    loadSuggestionVotes(c.env, session && session.sub),
    all(c.env, 'SELECT * FROM suggestions LIMIT ?1', LIST_LIMIT)
  ]);
  const out = rows.map((e) => suggestionShape(e, votes));
  out.sort((a, b) => (b.upvotes - a.upvotes) || (a.id < b.id ? 1 : -1));
  return c.json(out);
});

community.post('/suggestions/vote', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return c.json({ error: 'id is required' }, 400);

  const existing = await first(
    c.env, 'SELECT 1 FROM suggestion_votes WHERE suggestion_id = ?1 AND voter_id = ?2', id, session.sub
  );
  if (existing) {
    await run(c.env, 'DELETE FROM suggestion_votes WHERE suggestion_id = ?1 AND voter_id = ?2', id, session.sub);
    return c.json({ voted: false });
  }
  await run(
    c.env, 'INSERT INTO suggestion_votes (suggestion_id, voter_id, created_at) VALUES (?1, ?2, ?3)',
    id, session.sub, new Date().toISOString()
  );
  return c.json({ voted: true });
});

community.post('/suggestions', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ error: 'a suggestion needs some text' }, 400);
  if (text.length > MAX_SUGGESTION_LENGTH) return c.json({ error: `too long (max ${MAX_SUGGESTION_LENGTH} chars)` }, 400);

  try {
    if (!(await checkRateLimit(c.env, session.sub, 'suggestions', 10 * 60 * 1000, 10))) {
      return c.json({ error: 'Too many suggestions — please wait a bit before posting another.' }, 429);
    }
  } catch { /* best-effort */ }

  const row = {
    id: timeId(4),
    user_id: session.sub,
    display_name: session.name,
    text,
    created_at: new Date().toISOString()
  };
  await run(
    c.env,
    'INSERT INTO suggestions (id, user_id, display_name, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
    row.id, row.user_id, row.display_name, row.text, row.created_at
  );
  return c.json(suggestionShape(row), 201);
});

community.delete('/manage/suggestions', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id is required' }, 400);
  await run(c.env, 'DELETE FROM suggestions WHERE id = ?1', id);
  return c.body(null, 204);
});

/* ---------------------------------------------------------------- messages */

const MAX_MESSAGE_LENGTH = 4000;

community.post('/messages', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ error: 'message text is required' }, 400);
  if (text.length > MAX_MESSAGE_LENGTH) return c.json({ error: `message too long (max ${MAX_MESSAGE_LENGTH} chars)` }, 400);

  try {
    if (!(await checkRateLimit(c.env, session.sub, 'messages', 10 * 60 * 1000, 3))) {
      return c.json({ error: 'Too many messages — please wait a bit before sending another.' }, 429);
    }
  } catch { /* best-effort */ }

  await run(
    c.env,
    'INSERT INTO messages (id, user_id, display_name, email, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    timeId(4), session.sub, session.name, session.email, text, new Date().toISOString()
  );
  return c.body(null, 204);
});

community.get('/manage/messages', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const rows = await all(c.env, 'SELECT * FROM messages ORDER BY created_at DESC LIMIT ?1', LIST_LIMIT);
  return c.json(rows.map((e) => ({
    id: e.id,
    displayName: e.display_name,
    email: e.email,
    text: e.text,
    createdAt: e.created_at
  })));
});

export default community;
