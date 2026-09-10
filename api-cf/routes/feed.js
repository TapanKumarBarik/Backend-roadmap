// Port of api/src/functions/feed.js. Table Storage's single 'feed' partition
// becomes plain rows in feed_posts; the manually-concatenated
// `${postId}_${userId}` FeedVotes row key becomes real post_id / voter_id
// columns. File uploads still PUT to the Azure feed-uploads container via SAS.

import { Hono } from 'hono';
import { all, first, run } from '../lib/d1.js';
import { getSession, requireAdmin } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { timeId } from '../lib/util.js';
import { FEED_CONTAINER, blobBase, bytesFromBase64, bytesMatch, putBlob } from '../lib/blob.js';

const feed = new Hono();

const MAX_TEXT_LENGTH = 20000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const MAX_LIST = 200;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_OFFICE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_BYTES = 1 * 1024 * 1024;

const ALLOWED_TYPES = {
  'image/png': { ext: 'png', kind: 'image', cap: MAX_IMAGE_BYTES },
  'image/jpeg': { ext: 'jpg', kind: 'image', cap: MAX_IMAGE_BYTES },
  'image/webp': { ext: 'webp', kind: 'image', cap: MAX_IMAGE_BYTES },
  'image/gif': { ext: 'gif', kind: 'image', cap: MAX_IMAGE_BYTES },
  'application/pdf': { ext: 'pdf', kind: 'pdf', cap: MAX_PDF_BYTES },
  'text/markdown': { ext: 'md', kind: 'text', cap: MAX_TEXT_BYTES },
  'text/plain': { ext: 'txt', kind: 'text', cap: MAX_TEXT_BYTES },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'doc', cap: MAX_OFFICE_BYTES },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', kind: 'slide', cap: MAX_OFFICE_BYTES },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'sheet', cap: MAX_OFFICE_BYTES }
};
const ATTACHMENT_TYPES = new Set([...new Set(Object.values(ALLOWED_TYPES).map((s) => s.kind)), 'link']);

const MAGIC = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]]
};

function looksLikeClaimedType(buffer, contentType) {
  if (contentType === 'image/webp') {
    return bytesMatch(buffer, [0x52, 0x49, 0x46, 0x46])
      && String.fromCharCode(...buffer.slice(8, 12)) === 'WEBP';
  }
  const sigs = MAGIC[contentType];
  if (sigs) return sigs.some((sig) => bytesMatch(buffer, sig));
  if (contentType === 'text/markdown' || contentType === 'text/plain') return !buffer.includes(0);
  return false;
}

function toClientShape(e, votes, commentCounts) {
  return {
    id: e.id,
    userId: e.user_id,
    displayName: e.display_name,
    text: e.text,
    attachmentUrl: e.attachment_url || null,
    attachmentType: e.attachment_type || null,
    linkTitle: e.link_title || null,
    createdAt: e.created_at,
    upvotes: votes ? (votes.counts[e.id] || 0) : 0,
    votedByMe: votes ? votes.mine.has(e.id) : false,
    commentCount: commentCounts ? (commentCounts[e.id] || 0) : 0
  };
}

async function loadFeedVotes(env, userId) {
  const counts = {};
  const mine = new Set();
  for (const r of await all(env, 'SELECT post_id, voter_id FROM feed_votes')) {
    counts[r.post_id] = (counts[r.post_id] || 0) + 1;
    if (userId && r.voter_id === userId) mine.add(r.post_id);
  }
  return { counts, mine };
}

// Feed-post comments share the comments table with module discussions
// (path = 'feed:<postId>'). One indexed prefix scan for every post's count.
async function loadCommentCounts(env) {
  const counts = {};
  for (const r of await all(env, `SELECT path FROM comments WHERE path LIKE 'feed:%' AND hidden = 0`)) {
    const postId = r.path.slice('feed:'.length);
    counts[postId] = (counts[postId] || 0) + 1;
  }
  return counts;
}

feed.get('/feed', async (c) => {
  const session = await getSession(c);
  const [votes, commentCounts, posts] = await Promise.all([
    loadFeedVotes(c.env, session && session.sub),
    loadCommentCounts(c.env),
    all(c.env, 'SELECT * FROM feed_posts ORDER BY id DESC LIMIT ?1', MAX_LIST)
  ]);
  return c.json(posts.map((e) => toClientShape(e, votes, commentCounts)));
});

feed.post('/feed/vote', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return c.json({ error: 'id is required' }, 400);

  const existing = await first(
    c.env, 'SELECT 1 FROM feed_votes WHERE post_id = ?1 AND voter_id = ?2', id, session.sub
  );
  if (existing) {
    await run(c.env, 'DELETE FROM feed_votes WHERE post_id = ?1 AND voter_id = ?2', id, session.sub);
    return c.json({ voted: false });
  }
  await run(
    c.env, 'INSERT INTO feed_votes (post_id, voter_id, created_at) VALUES (?1, ?2, ?3)',
    id, session.sub, new Date().toISOString()
  );
  return c.json({ voted: true });
});

feed.post('/feed', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl.trim() : null;
  const attachmentType = attachmentUrl && ATTACHMENT_TYPES.has(body.attachmentType) ? body.attachmentType : null;
  let linkTitle = null;
  if (!text && !attachmentUrl) return c.json({ error: 'a post needs text or an attachment' }, 400);
  if (text.length > MAX_TEXT_LENGTH) return c.json({ error: `too long (max ${MAX_TEXT_LENGTH} chars)` }, 400);

  if (attachmentType === 'link') {
    if (!/^https?:\/\//i.test(attachmentUrl) || attachmentUrl.length > 2000) {
      return c.json({ error: 'not a valid link' }, 400);
    }
    linkTitle = typeof body.linkTitle === 'string' ? body.linkTitle.trim().slice(0, 200) : '';
  } else if (attachmentUrl) {
    if (!attachmentUrl.startsWith(`${blobBase(FEED_CONTAINER)}/`)) {
      return c.json({ error: 'invalid attachment' }, 400);
    }
  }

  try {
    if (!(await checkRateLimit(c.env, session.sub, 'feed', RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX))) {
      return c.json({ error: 'Too many posts — please wait a bit before posting again.' }, 429);
    }
  } catch { /* best-effort */ }

  const row = {
    id: timeId(4),
    user_id: session.sub,
    display_name: session.name,
    text,
    attachment_url: attachmentUrl,
    attachment_type: attachmentType,
    link_title: linkTitle,
    created_at: new Date().toISOString()
  };
  await run(
    c.env,
    `INSERT INTO feed_posts (id, user_id, display_name, text, attachment_url, attachment_type, link_title, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    row.id, row.user_id, row.display_name, row.text, row.attachment_url, row.attachment_type, row.link_title, row.created_at
  );
  return c.json(toClientShape(row), 201);
});

feed.post('/feed/upload', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const { filename, contentType, dataBase64 } = body;
  const spec = ALLOWED_TYPES[contentType];
  if (!spec) {
    return c.json({ error: 'unsupported file type (images, PDF, Word/PowerPoint/Excel, or markdown/text)' }, 400);
  }
  if (!dataBase64) return c.json({ error: 'dataBase64 is required' }, 400);

  const buffer = bytesFromBase64(dataBase64);
  if (buffer.length > spec.cap) {
    return c.json({ error: `file exceeds ${Math.round(spec.cap / (1024 * 1024))}MB limit` }, 400);
  }
  if (!looksLikeClaimedType(buffer, contentType)) {
    return c.json({ error: "file content doesn't match its declared type" }, 400);
  }

  try {
    if (!(await checkRateLimit(c.env, session.sub, 'feed', RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX))) {
      return c.json({ error: 'Too many posts — please wait a bit before posting again.' }, 429);
    }
  } catch { /* best-effort */ }

  const sas = c.env.FEED_CONTAINER_SAS;
  if (!sas) return c.json({ error: 'feed storage is not configured' }, 500);

  const safeName = (filename || 'file').toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/\.[a-z0-9]+$/, '');
  const blobName = `${Date.now()}-${safeName}.${spec.ext}`;

  const headers = {
    'Content-Type': contentType,
    'x-ms-blob-cache-control': 'public, max-age=31536000, immutable'
  };
  if (spec.kind !== 'image' && spec.kind !== 'pdf') {
    headers['x-ms-blob-content-disposition'] = `attachment; filename="${`${safeName}.${spec.ext}`.replace(/"/g, '')}"`;
  }

  const res = await putBlob(FEED_CONTAINER, blobName, buffer, sas, headers);
  if (!res.ok) {
    return c.json({ error: 'upload failed', detail: await res.text() }, 502);
  }
  return c.json({ url: `${blobBase(FEED_CONTAINER)}/${blobName}`, type: spec.kind, filename: `${safeName}.${spec.ext}` });
});

feed.delete('/manage/feed', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id is required' }, 400);
  await run(c.env, 'DELETE FROM feed_posts WHERE id = ?1', id);
  return c.body(null, 204);
});

export default feed;
