const { TableClient } = require('@azure/data-tables');

const clients = {};

function getTable(name) {
  if (!clients[name]) {
    const conn = process.env.TABLE_STORAGE_CONNECTION_STRING;
    if (!conn) throw new Error('TABLE_STORAGE_CONNECTION_STRING is not configured');
    clients[name] = TableClient.fromConnectionString(conn, name);
  }
  return clients[name];
}

// Creates an entity, creating the table itself first if it doesn't exist yet.
// Table Storage has no "insert, creating the table if needed" write path —
// a brand-new feature's table simply doesn't exist until something actually
// provisions it, and every feature added so far (Feed's voting, then Books,
// Suggestions, Workspace) hit the same 500 the first time someone used it in
// production because of exactly this. This is the fix applied everywhere at
// once: create the table lazily and retry, rather than a manual per-feature
// Azure Portal/CLI step that's easy to forget.
async function createEntitySafe(table, entity) {
  try {
    await table.createEntity(entity);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    try {
      await table.createTable();
    } catch (createTableErr) {
      // 409 = someone else's concurrent first-write already created it a
      // moment ago — fine, the retry below still succeeds either way.
      if (createTableErr.statusCode !== 409) throw createTableErr;
    }
    await table.createEntity(entity);
  }
}

// Lists entities, treating "this table doesn't exist yet" the same as "this
// table is empty" — a read endpoint for a brand-new feature shouldn't 500
// just because nobody has written to it yet.
async function listEntitiesSafe(table, options) {
  const out = [];
  try {
    for await (const entity of table.listEntities(options)) out.push(entity);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  return out;
}

module.exports = { getTable, createEntitySafe, listEntitiesSafe };
