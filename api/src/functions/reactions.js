const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');
const { getSession } = require('../lib/adminAuth');

const TABLE_NAME = 'Reactions';
const ALLOWED_EMOJI = ['👍', '🔥', '🤔'];

app.http('getReactions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reactions/{*path}',
  handler: async (request) => {
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    const session = getSession(request);
    const table = getTable(TABLE_NAME);
    const partitionKey = encodeURIComponent(path);
    const counts = {};
    const mine = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${partitionKey}'` } })) {
      counts[entity.emoji] = (counts[entity.emoji] || 0) + 1;
      if (session && entity.userId === session.sub) mine.push(entity.emoji);
    }
    return { jsonBody: { counts, mine } };
  }
});

// Toggles: posting the same emoji twice removes it.
app.http('toggleReaction', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reactions/{*path}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    const path = request.params.path;
    if (!path) return { status: 400, jsonBody: { error: 'missing path' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    if (!ALLOWED_EMOJI.includes(body.emoji)) return { status: 400, jsonBody: { error: 'unsupported reaction' } };

    const table = getTable(TABLE_NAME);
    const partitionKey = encodeURIComponent(path);
    const rowKey = `${session.sub}_${body.emoji}`;
    try {
      await table.getEntity(partitionKey, rowKey);
      await table.deleteEntity(partitionKey, rowKey);
      return { jsonBody: { active: false } };
    } catch (err) {
      if (err.statusCode !== 404) throw err;
      await table.createEntity({ partitionKey, rowKey, userId: session.sub, emoji: body.emoji, createdAt: new Date().toISOString() });
      return { jsonBody: { active: true } };
    }
  }
});
