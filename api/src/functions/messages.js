const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'Messages';
const RATE_LIMIT_TABLE = 'RateLimits';
const MAX_LENGTH = 4000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 3; // messages per window, per user — same best-effort
                          // fixed-window pattern as comments.js's checkRateLimit

async function checkRateLimit(userId) {
  const table = getTable(RATE_LIMIT_TABLE);
  const rowKey = 'messages';
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

// A single inbox, not one partition per sender — the admin is the only
// reader and always wants "everything, newest first", so one partition
// (small volume, personal-site scale) keeps that a plain listEntities().
app.http('sendMessage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'messages',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return { status: 400, jsonBody: { error: 'message text is required' } };
    if (text.length > MAX_LENGTH) return { status: 400, jsonBody: { error: `message too long (max ${MAX_LENGTH} chars)` } };

    try {
      if (!(await checkRateLimit(session.sub))) {
        return { status: 429, jsonBody: { error: 'Too many messages — please wait a bit before sending another.' } };
      }
    } catch {
      // best-effort, same reasoning as comments.js
    }

    const table = getTable(TABLE_NAME);
    await table.createEntity({
      partitionKey: 'inbox',
      rowKey: String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex'),
      userId: session.sub,
      displayName: session.name,
      email: session.email,
      text,
      createdAt: new Date().toISOString()
    });
    return { status: 204 };
  }
});

app.http('listMessages', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/messages',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const table = getTable(TABLE_NAME);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'inbox'` } })) {
      out.push({
        id: entity.rowKey,
        displayName: entity.displayName,
        email: entity.email,
        text: entity.text,
        createdAt: entity.createdAt
      });
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { jsonBody: out.slice(0, 500) };
  }
});
