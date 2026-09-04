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

// Matches "@DisplayName" (case-insensitive, exact) against everyone else
// who's already commented on this page — no global user directory to
// search against, and thread participants is exactly who a mention makes
// sense against anyway.
function parseMentions(text, participants) {
  const lower = text.toLowerCase();
  const mentioned = new Set();
  for (const [userId, displayName] of participants) {
    if (displayName && lower.includes('@' + displayName.toLowerCase())) mentioned.add(userId);
  }
  return [...mentioned];
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
    const partitionKey = encodeURIComponent(path);

    // Same partition scan getComments already does, just to collect
    // {userId, displayName} pairs for @mention matching rather than to
    // return the comments themselves.
    const participants = [];
    for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${partitionKey}'` } })) {
      if (e.userId !== session.sub) participants.push([e.userId, e.displayName]);
    }
    const mentions = parseMentions(text, participants);

    const entity = {
      partitionKey,
      rowKey: makeRowKey(),
      userId: session.sub,
      displayName: session.name,
      text,
      parentId,
      createdAt: new Date().toISOString(),
      hidden: false,
      mentions: JSON.stringify(mentions)
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

// Two things count as activity aimed at you:
//
//   mentions — someone's comment names you with @DisplayName (see
//              parseMentions above; computed once at post time and stored on
//              the entity, because re-deriving it here would mean re-scanning
//              every page's participants per comment).
//   replies  — someone answered a comment you wrote. Previously invisible:
//              ask a question, get an answer, never find out unless the
//              answerer happened to @mention you. That is the single most
//              common way a thread here goes unread.
//
// Still deliberately narrower than "anyone commented on a page you've
// touched", which would fire constantly on popular modules and train you to
// ignore the badge.
//
// One bounded full-table scan, same reasoning as listAllComments below. Your
// own comment ids are collected without a date filter, because a reply today
// to something you wrote last year is still news to you.
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
    const myCommentIds = new Set();
    const candidates = [];
    let scanned = 0;

    for await (const entity of table.listEntities()) {
      if (++scanned > ACTIVITY_MAX_SCAN) break;

      if (entity.userId === session.sub) {
        myCommentIds.add(entity.rowKey);
        continue;
      }
      if (new Date(entity.createdAt).getTime() <= since) continue;

      let mentions = [];
      try { mentions = JSON.parse(entity.mentions || '[]'); } catch { /* older rows predate this field */ }
      const mentionsMe = mentions.includes(session.sub);
      if (!mentionsMe && !entity.parentId) continue;

      candidates.push({
        parentId: entity.parentId || null,
        mentionsMe,
        path: decodeURIComponent(entity.partitionKey)
      });
    }

    // Second pass, because a reply can appear in the scan before the comment
    // it answers — table order is by partition then row key, not by thread.
    let replies = 0;
    let mentions = 0;
    const paths = new Set();
    for (const c of candidates) {
      const isReplyToMe = c.parentId != null && myCommentIds.has(c.parentId);
      if (!isReplyToMe && !c.mentionsMe) continue;
      // A reply that also @mentions you is one notification, not two.
      if (isReplyToMe) replies++;
      else mentions++;
      paths.add(c.path);
    }

    return {
      jsonBody: { count: replies + mentions, replies, mentions, paths: [...paths].slice(0, 10) }
    };
  }
});

// Every question asked across the curriculum, newest first — the public
// half of the Community screen.
//
// A question is a top-level comment; "answered" means it has at least one
// reply or has been marked as the answer. Both are derived here in one
// pass rather than making the client fetch each thread to find out.
//
// This is a full-table scan, bounded the same way commentActivity's is.
// At personal scale that is cheaper than maintaining a secondary index,
// and the cap means a runaway table degrades to "older questions are
// missing" rather than to a slow endpoint.
// Literal sub-route, not a bare 'comments' — getComments is registered as
// 'comments/{*path}' and its catch-all also matches the bare path. The
// siblings above (comments/vote, comments/activity) already rely on
// literal segments winning over the wildcard.
app.http('recentQuestions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'comments/questions',
  handler: async () => {
    const table = getTable(TABLE_NAME);
    const roots = [];
    const replyCounts = new Map();
    let scanned = 0;

    for await (const entity of table.listEntities()) {
      if (++scanned > ACTIVITY_MAX_SCAN) break;
      if (entity.hidden) continue;
      const path = decodeURIComponent(entity.partitionKey);
      if (entity.parentId) {
        const key = path + ' ' + entity.parentId;
        replyCounts.set(key, (replyCounts.get(key) || 0) + 1);
      } else {
        roots.push({
          id: entity.rowKey,
          path,
          displayName: entity.displayName,
          text: entity.text,
          createdAt: entity.createdAt,
          isAnswer: !!entity.isAnswer
        });
      }
    }

    // A root is "answered" if it carries the answer badge itself or any of
    // its replies does; replies were counted above regardless of which.
    const out = roots.map((r) => {
      const replies = replyCounts.get(r.path + ' ' + r.id) || 0;
      return { ...r, replies, answered: r.isAnswer || replies > 0 };
    });
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { jsonBody: out.slice(0, 200) };
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
