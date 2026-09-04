const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');
const { getSession } = require('../lib/adminAuth');

const TABLE_NAME = 'Notes';
const MAX_LENGTH = 10000;

app.http('listNotes', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'notes',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const table = getTable(TABLE_NAME);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${session.sub}'` } })) {
      out.push({ path: decodeURIComponent(entity.rowKey), text: entity.text, updatedAt: entity.updatedAt });
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return { jsonBody: out };
  }
});

app.http('getNote', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'notes/{*path}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    const table = getTable(TABLE_NAME);
    try {
      const entity = await table.getEntity(session.sub, encodeURIComponent(path));
      return { jsonBody: { text: entity.text, updatedAt: entity.updatedAt } };
    } catch (err) {
      if (err.statusCode === 404) return { jsonBody: { text: '', updatedAt: null } };
      throw err;
    }
  }
});

app.http('putNote', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'notes/{*path}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const text = typeof body.text === 'string' ? body.text.slice(0, MAX_LENGTH) : '';

    const table = getTable(TABLE_NAME);
    const rowKey = encodeURIComponent(path);
    if (!text.trim()) {
      try {
        await table.deleteEntity(session.sub, rowKey);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
      return { status: 204 };
    }
    await table.upsertEntity(
      { partitionKey: session.sub, rowKey, text, updatedAt: new Date().toISOString() },
      'Replace'
    );
    return { status: 204 };
  }
});
