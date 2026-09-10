#!/usr/bin/env node
// One-time export: dumps every Azure Table Storage table this app uses into
// one JSON file per table, for import into the new Cloudflare D1 database
// (see cloudflare/d1-schema.sql and the Azure->Cloudflare migration plan).
//
// Reuses the exact same TableClient + listEntities() approach as
// api/src/functions/backup.js's dumpTable() — that function only covers the
// 8 tables the *daily* backup cares about; this covers all 17, since a
// one-time migration export needs everything, not just what gets backed up.
//
// Usage:
//   cd api && node ../scripts/export-azure-tables.js
// Reads TABLE_STORAGE_CONNECTION_STRING from api/local.settings.json (same
// connection string the Functions host uses locally) rather than requiring
// it to be re-exported into the shell.

const fs = require('fs');
const path = require('path');
const { TableClient } = require('@azure/data-tables');

const ALL_TABLES = [
  'Admins', 'Users', 'Bookmarks', 'Books', 'FeedPosts', 'FeedVotes',
  'Messages', 'ModuleProgress', 'Notes', 'PageViews', 'RateLimits',
  'Reactions', 'Streaks', 'Suggestions', 'SuggestionVotes', 'Comments',
  'CommentVotes', 'WorkspacePages'
];

function loadConnectionString() {
  const settingsPath = path.join(__dirname, '..', 'api', 'local.settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const conn = settings.Values && settings.Values.TABLE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error('TABLE_STORAGE_CONNECTION_STRING not found in api/local.settings.json');
  return conn;
}

async function dumpTable(conn, name) {
  const table = TableClient.fromConnectionString(conn, name);
  const rows = [];
  try {
    for await (const entity of table.listEntities()) rows.push(entity);
  } catch (err) {
    // 404 == table doesn't exist yet (a feature nobody has used) — an empty
    // export is the correct result, not an error, matching listEntitiesSafe's
    // treatment of the same condition elsewhere in this codebase.
    if (err.statusCode !== 404) throw err;
  }
  return rows;
}

async function main() {
  const conn = loadConnectionString();
  const outDir = path.join(__dirname, '..', 'cloudflare', 'export');
  fs.mkdirSync(outDir, { recursive: true });

  const summary = [];
  for (const name of ALL_TABLES) {
    process.stdout.write(`Exporting ${name}... `);
    const rows = await dumpTable(conn, name);
    const outFile = path.join(outDir, `${name}.json`);
    fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
    console.log(`${rows.length} rows -> ${path.relative(process.cwd(), outFile)}`);
    summary.push({ table: name, rows: rows.length });
  }

  console.log('\nExport complete:');
  console.table(summary);
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
