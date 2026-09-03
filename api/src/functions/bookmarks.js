const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');
const { getSession } = require('../lib/adminAuth');

const TABLE_NAME = 'Bookmarks';

app.http('listBookmarks', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bookmarks',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const table = getTable(TABLE_NAME);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${session.sub}'` } })) {
      out.push(decodeURIComponent(entity.rowKey));
    }
    return { jsonBody: out };
  }
});

app.http('addBookmark', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'bookmarks/{*path}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    const table = getTable(TABLE_NAME);
    await table.upsertEntity(
      { partitionKey: session.sub, rowKey: encodeURIComponent(path), createdAt: new Date().toISOString() },
      'Replace'
    );
    return { status: 204 };
  }
});

app.http('removeBookmark', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'bookmarks/{*path}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    const table = getTable(TABLE_NAME);
    try {
      await table.deleteEntity(session.sub, encodeURIComponent(path));
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }
    return { status: 204 };
  }
});
