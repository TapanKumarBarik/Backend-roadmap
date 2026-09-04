const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'Comments';
const VOTES_TABLE = 'CommentVotes';
const RATE_LIMIT_TABLE = 'RateLimits';
const MAX_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 5; // comments per window, per user
const ACTIVITY_MAX_SCAN = 3000; // bounds the full-table scan below, same idea as pageviews.js's MAX_SCAN

// Best-effort throttle (like the reactions optimistic-UI comment above,
// this doesn't need to be airtight for a personal-scale site) — a fixed
// window counter in its own table, keyed by user. A concurrent double-post
// from the same user in the same instant could both slip through, which is
// an acceptable trade for staying dependency-free.
async function checkRateLimit(userId) {
  const table = getTable(RATE_LIMIT_TABLE);
  const rowKey = 'comments';
  let entity = null;
  try {
    entity = await table.getEntity(userId, rowKey);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  const now = Date.now();
  if (!entity || now - new Date(entity.windowStart).getTime() > RATE_LIMIT_WINDOW_MS) {
    await table.upsertEntity({ partitionKey: userId, rowKey, windowStart: new Date(now).toISOString(), count: 1 }, 'Replace');
    return true;
  }
  if (entity.count >= RATE_LIMIT_MAX) return false;
  await table.updateEntity({ partitionKey: userId, rowKey, count: entity.count + 1 }, 'Merge');
  return true;
}

// Rendered as plain text on the client, never markdown/HTML — sanitizing
// arbitrary HTML for XSS is a real footgun for a two-person side project;
// plain text (with auto-linked URLs client-side) covers the real use case
// safely without that risk.
function makeRowKey() {
  return String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex');
}

function toClientShape(entity, votes) {
  return {
    id: entity.rowKey,
    userId: entity.userId,
    displayName: entity.displayName,
    text: entity.text,
    parentId: entity.parentId || null,
    createdAt: entity.createdAt,
    editedAt: entity.editedAt || null,
    isAnswer: !!entity.isAnswer,
    upvotes: votes ? (votes.counts[entity.rowKey] || 0) : 0,
    votedByMe: votes ? votes.mine.has(entity.rowKey) : false
  };
}

// CommentVotes is partitioned the same way Comments is (by page path), with
// RowKey `${commentId}_${userId}` — so every vote on every comment on one
// page is a single table scan, not one query per comment.
async function loadVotes(path, userId) {
  const table = getTable(VOTES_TABLE);
  const partitionKey = encodeURIComponent(path);
  const counts = {};
  const mine = new Set();
  for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${partitionKey}'` } })) {
    const idx = entity.rowKey.lastIndexOf('_');
    const commentId = entity.rowKey.slice(0, idx);
    const voterId = entity.rowKey.slice(idx + 1);
    counts[commentId] = (counts[commentId] || 0) + 1;
    if (userId && voterId === userId) mine.add(commentId);
  }
  return { counts, mine };
}

app.http('getComments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'comments/{*path}',
  handler: async (request) => {
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    const session = getSession(request);
    const table = getTable(TABLE_NAME);
    const partitionKey = encodeURIComponent(path);
    const votes = await loadVotes(path, session && session.sub);
    const out = [];
    const entities = table.listEntities({
      queryOptions: { filter: `PartitionKey eq '${partitionKey}' and hidden eq false` }
    });
    for await (const entity of entities) out.push(toClientShape(entity, votes));
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { jsonBody: out };
  }
});

// Upvote-only, toggle on repeat click — same shape as reactions.js.
app.http('voteComment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'comments/vote',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const { path, id } = body;
    if (!path || !id) return { status: 400, jsonBody: { error: 'path and id are required' } };

    const table = getTable(VOTES_TABLE);
    const partitionKey = encodeURIComponent(path);
    const rowKey = `${id}_${session.sub}`;
    try {
      await table.getEntity(partitionKey, rowKey);
      await table.deleteEntity(partitionKey, rowKey);
      return { jsonBody: { voted: false } };
    } catch (err) {
      if (err.statusCode !== 404) throw err;
      await table.createEntity({ partitionKey, rowKey, commentId: id, userId: session.sub, createdAt: new Date().toISOString() });
      return { jsonBody: { voted: true } };
    }
  }
});

app.http('postComment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'comments/{*path}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return { status: 400, jsonBody: { error: 'comment text is required' } };
    if (text.length > MAX_LENGTH) return { status: 400, jsonBody: { error: `comment too long (max ${MAX_LENGTH} chars)` } };
    const parentId = typeof body.parentId === 'string' ? body.parentId : '';

    try {
      if (!(await checkRateLimit(session.sub))) {
        return { status: 429, jsonBody: { error: 'Too many comments — please wait a few minutes before posting again.' } };
      }
    } catch {
      // The rate limiter is a best-effort add-on, not core to commenting —
      // a Table Storage hiccup here shouldn't take down posting entirely.
    }

    const table = getTable(TABLE_NAME);
    const entity = {
      partitionKey: encodeURIComponent(path),
      rowKey: makeRowKey(),
      userId: session.sub,
      displayName: session.name,
      text,
      parentId,
      createdAt: new Date().toISOString(),
      hidden: false
    };
    await table.createEntity(entity);
    return { status: 201, jsonBody: toClientShape(entity) };
  }
});

app.http('deleteComment', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'manage/comments',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const path = request.query.get('path');
    const rowKey = request.query.get('id');
    if (!path || !rowKey) return { status: 400, jsonBody: { error: 'path and id are required' } };

    const table = getTable(TABLE_NAME);
    try {
      await table.deleteEntity(encodeURIComponent(path), rowKey);
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }
    return { status: 204 };
  }
});

// Self-service delete: the comment's own author, or an admin.
app.http('deleteOwnComment', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'comments/own',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const path = request.query.get('path');
    const rowKey = request.query.get('id');
    if (!path || !rowKey) return { status: 400, jsonBody: { error: 'path and id are required' } };

    const table = getTable(TABLE_NAME);
    const partitionKey = encodeURIComponent(path);
    let entity;
    try {
      entity = await table.getEntity(partitionKey, rowKey);
    } catch (err) {
      if (err.statusCode === 404) return { status: 204 };
      throw err;
    }
    if (entity.userId !== session.sub && !isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    await table.deleteEntity(partitionKey, rowKey);
    return { status: 204 };
  }
});

// Self-service edit: the comment's own author, or an admin.
app.http('editComment', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'comments/edit',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const { path, id } = body;
    if (!path || !id) return { status: 400, jsonBody: { error: 'path and id are required' } };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return { status: 400, jsonBody: { error: 'comment text is required' } };
    if (text.length > MAX_LENGTH) return { status: 400, jsonBody: { error: `comment too long (max ${MAX_LENGTH} chars)` } };

    const table = getTable(TABLE_NAME);
    const partitionKey = encodeURIComponent(path);
    let entity;
    try {
      entity = await table.getEntity(partitionKey, id);
    } catch (err) {
      if (err.statusCode === 404) return { status: 404, jsonBody: { error: 'comment not found' } };
      throw err;
    }
    if (entity.userId !== session.sub && !isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const editedAt = new Date().toISOString();
    await table.updateEntity({ partitionKey, rowKey: id, text, editedAt }, 'Merge');
    return { jsonBody: toClientShape({ ...entity, text, editedAt }) };
  }
});

// Admin-only: pin/unpin a comment as the accepted answer in its thread.
app.http('setAnswer', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'manage/comments/answer',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const { path, id } = body;
    if (!path || !id) return { status: 400, jsonBody: { error: 'path and id are required' } };

    const table = getTable(TABLE_NAME);
    await table.updateEntity(
      { partitionKey: encodeURIComponent(path), rowKey: id, isAnswer: !!body.isAnswer },
      'Merge'
    );
    return { status: 204 };
  }
});

// "Pages you've touched" = any page where you have at least one comment
// (root or reply) — new comments from *other* people on those same pages,
// after a client-supplied watermark, count as unread activity. One full
// table scan (bounded, same reasoning as listAllComments below) rather than
// a query per page: personal-site scale makes this the simpler option, and
// there's no per-user partition on Comments to query more narrowly anyway.
app.http('commentActivity', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'comments/activity',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const sinceParam = request.query.get('since');
    const since = sinceParam ? new Date(sinceParam).getTime() : 0;

    const table = getTable(TABLE_NAME);
    const myPaths = new Set();
    const all = [];
    let scanned = 0;
    for await (const entity of table.listEntities()) {
      all.push(entity);
      if (entity.userId === session.sub) myPaths.add(entity.partitionKey);
      if (++scanned >= ACTIVITY_MAX_SCAN) break;
    }

    let count = 0;
    const paths = new Set();
    for (const c of all) {
      if (!myPaths.has(c.partitionKey)) continue;
      if (c.userId === session.sub) continue;
      if (new Date(c.createdAt).getTime() <= since) continue;
      count++;
      paths.add(decodeURIComponent(c.partitionKey));
    }

    return { jsonBody: { count, paths: [...paths].slice(0, 10) } };
  }
});

app.http('listAllComments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/comments',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const table = getTable(TABLE_NAME);
    const out = [];
    for await (const entity of table.listEntities()) {
      out.push({ ...toClientShape(entity), path: decodeURIComponent(entity.partitionKey), hidden: !!entity.hidden });
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { jsonBody: out.slice(0, 500) };
  }
});
