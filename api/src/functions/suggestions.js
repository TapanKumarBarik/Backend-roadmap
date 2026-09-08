const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'Suggestions';
const VOTES_TABLE = 'SuggestionVotes';
const RATE_LIMIT_TABLE = 'RateLimits';
const MAX_TEXT_LENGTH = 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 10; // suggestions per window, per user
const MAX_LIST = 500;

// Same fixed-window pattern as feed.js/comments.js's own checkRateLimit.
async function checkRateLimit(userId) {
  const table = getTable(RATE_LIMIT_TABLE);
  const rowKey = 'suggestions';
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

function toClientShape(entity, votes) {
  return {
    id: entity.rowKey,
    userId: entity.userId,
    displayName: entity.displayName,
    text: entity.text,
    createdAt: entity.createdAt,
    upvotes: votes ? (votes.counts[entity.rowKey] || 0) : 0,
    votedByMe: votes ? votes.mine.has(entity.rowKey) : false
  };
}

// SuggestionVotes has a single partition ('suggestions', same constant every
// row) — one board, not one per page path — RowKey `${suggestionId}_${userId}`,
// so counting every vote on every suggestion is one scan, not one per row.
// Best-effort: voteSuggestion creates this table lazily on first use (see its
// own comment) — until the first-ever vote, it simply doesn't exist yet, and
// the public board listing shouldn't 500 just because nobody has voted yet.
async function loadVotes(userId) {
  const counts = {};
  const mine = new Set();
  try {
    const table = getTable(VOTES_TABLE);
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'suggestions'` } })) {
      const idx = entity.rowKey.lastIndexOf('_');
      const suggestionId = entity.rowKey.slice(0, idx);
      const voterId = entity.rowKey.slice(idx + 1);
      counts[suggestionId] = (counts[suggestionId] || 0) + 1;
      if (userId && voterId === userId) mine.add(suggestionId);
    }
  } catch {
    // table not provisioned yet, or a transient storage hiccup
  }
  return { counts, mine };
}

// Public read — anyone can see and be persuaded by what others have asked
// for, unlike the private admin-only Messages inbox (messages.js) this board
// exists alongside.
app.http('listSuggestions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'suggestions',
  handler: async (request) => {
    const session = getSession(request);
    const table = getTable(TABLE_NAME);
    const votes = await loadVotes(session && session.sub);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'suggestions'` } })) {
      out.push(toClientShape(entity, votes));
      if (out.length >= MAX_LIST) break;
    }
    // Most-upvoted first, newest-first within a tie — a suggestions board is
    // read to see what people want most, not strictly chronologically.
    out.sort((a, b) => (b.upvotes - a.upvotes) || (a.id < b.id ? 1 : -1));
    return { jsonBody: out };
  }
});

app.http('postSuggestion', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'suggestions',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return { status: 400, jsonBody: { error: 'a suggestion needs some text' } };
    if (text.length > MAX_TEXT_LENGTH) return { status: 400, jsonBody: { error: `too long (max ${MAX_TEXT_LENGTH} chars)` } };

    try {
      if (!(await checkRateLimit(session.sub))) {
        return { status: 429, jsonBody: { error: 'Too many suggestions — please wait a bit before posting another.' } };
      }
    } catch {
      // best-effort
    }

    const table = getTable(TABLE_NAME);
    const entity = {
      partitionKey: 'suggestions',
      rowKey: String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex'),
      userId: session.sub,
      displayName: session.name,
      text,
      createdAt: new Date().toISOString()
    };
    await table.createEntity(entity);
    return { status: 201, jsonBody: toClientShape(entity) };
  }
});

// Upvote-only, toggle on repeat click — same shape as feed.js's
// voteFeedPost, including the lazy table-creation fix that endpoint needed
// after shipping without it: SuggestionVotes is a brand-new table, and
// Table Storage returns the same 404 for "entity not found" and "table
// doesn't exist", so this creates the table on first use rather than
// requiring a manual provisioning step that's easy to forget.
app.http('voteSuggestion', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'suggestions/vote',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const id = typeof body.id === 'string' ? body.id : null;
    if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

    const table = getTable(VOTES_TABLE);
    const rowKey = `${id}_${session.sub}`;
    try {
      await table.getEntity('suggestions', rowKey);
      await table.deleteEntity('suggestions', rowKey);
      return { jsonBody: { voted: false } };
    } catch (err) {
      if (err.statusCode !== 404) throw err;
      try {
        await table.createEntity({ partitionKey: 'suggestions', rowKey, suggestionId: id, userId: session.sub, createdAt: new Date().toISOString() });
      } catch (createErr) {
        if (createErr.statusCode !== 404) throw createErr;
        try {
          await table.createTable();
        } catch (createTableErr) {
          if (createTableErr.statusCode !== 409) throw createTableErr;
        }
        await table.createEntity({ partitionKey: 'suggestions', rowKey, suggestionId: id, userId: session.sub, createdAt: new Date().toISOString() });
      }
      return { jsonBody: { voted: true } };
    }
  }
});

// Admin-only delete — same pattern as feed.js's deleteFeedPost.
app.http('deleteSuggestion', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'manage/suggestions',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!await isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const id = request.query.get('id');
    if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

    const table = getTable(TABLE_NAME);
    try {
      await table.deleteEntity('suggestions', id);
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }
    return { status: 204 };
  }
});
