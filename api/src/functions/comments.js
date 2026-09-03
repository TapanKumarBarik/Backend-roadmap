const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'Comments';
const MAX_LENGTH = 2000;

// Rendered as plain text on the client, never markdown/HTML — sanitizing
// arbitrary HTML for XSS is a real footgun for a two-person side project;
// plain text (with auto-linked URLs client-side) covers the real use case
// safely without that risk.
function makeRowKey() {
  return String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex');
}

function toClientShape(entity) {
  return {
    id: entity.rowKey,
    userId: entity.userId,
    displayName: entity.displayName,
    text: entity.text,
    parentId: entity.parentId || null,
    createdAt: entity.createdAt
  };
}

app.http('getComments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'comments/{*path}',
  handler: async (request) => {
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    const table = getTable(TABLE_NAME);
    const partitionKey = encodeURIComponent(path);
    const out = [];
    const entities = table.listEntities({
      queryOptions: { filter: `PartitionKey eq '${partitionKey}' and hidden eq false` }
    });
    for await (const entity of entities) out.push(toClientShape(entity));
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { jsonBody: out };
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

    const table = getTable(TABLE_NAME);
    const entity = {
      partitionKey: encodeURIComponent(path),
      rowKey: makeRowKey(),
      userId: session.sub,
      displayName: session.email,
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
  route: 'admin/comments',
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

app.http('listAllComments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/comments',
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
