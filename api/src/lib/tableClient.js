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

module.exports = { getTable };
