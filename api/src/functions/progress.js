const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'ModuleProgress';
const VALID_STATUSES = ['todo', 'wip', 'done'];

let tableClient;
function getTableClient() {
  if (!tableClient) {
    const conn = process.env.TABLE_STORAGE_CONNECTION_STRING;
    if (!conn) throw new Error('TABLE_STORAGE_CONNECTION_STRING is not configured');
    tableClient = TableClient.fromConnectionString(conn, TABLE_NAME);
  }
  return tableClient;
}

// SWA injects this header (and strips any client-supplied copy) only for
// requests it has authenticated itself, so it cannot be spoofed by a caller.
function getUserId(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const principal = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    return principal && principal.userId ? principal.userId : null;
  } catch {
    return null;
  }
}

app.http('getProgress', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'progress',
  handler: async (request) => {
    const userId = getUserId(request);
    if (!userId) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const client = getTableClient();
    const map = {};
    const entities = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
    for await (const entity of entities) {
      map[decodeURIComponent(entity.rowKey)] = entity.status;
    }
    return { jsonBody: map };
  }
});

app.http('putProgress', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'progress/{*path}',
  handler: async (request) => {
    const userId = getUserId(request);
    if (!userId) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'invalid body' } };
    }
    const status = body && body.status;
    if (!VALID_STATUSES.includes(status)) {
      return { status: 400, jsonBody: { error: 'status must be todo, wip, or done' } };
    }

    const client = getTableClient();
    const rowKey = encodeURIComponent(path);
    if (status === 'todo') {
      try {
        await client.deleteEntity(userId, rowKey);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    } else {
      await client.upsertEntity(
        { partitionKey: userId, rowKey, status, updatedAt: new Date().toISOString() },
        'Replace'
      );
    }
    return { status: 204 };
  }
});

app.http('resetProgress', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'progress/reset',
  handler: async (request) => {
    const userId = getUserId(request);
    if (!userId) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const client = getTableClient();
    const entities = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
    const deletions = [];
    for await (const entity of entities) {
      deletions.push(client.deleteEntity(entity.partitionKey, entity.rowKey));
    }
    await Promise.all(deletions);
    return { status: 204 };
  }
});
