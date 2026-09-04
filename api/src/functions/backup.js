const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');

// Every user-data table gets dumped into one JSON blob per day. Deliberately
// plain fetch() against a SAS URL, not the @azure/storage-blob SDK — that
// package is what broke Azure's content-distribution deploy step earlier in
// this project (see content.js's image upload for the same pattern).
const STORAGE_ACCOUNT = 'stroadmapprogress';
const CONTAINER = 'backups';
const RETENTION_DAYS = 14;
const TABLES_TO_BACKUP = ['ModuleProgress', 'Notes', 'Bookmarks', 'Streaks', 'Reactions', 'Comments', 'PageViews', 'RateLimits'];

async function dumpTable(name) {
  const table = getTable(name);
  const rows = [];
  for await (const entity of table.listEntities()) rows.push(entity);
  return rows;
}

async function pruneOldSnapshots(sas, context) {
  const listUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER}?restype=container&comp=list&${sas}`;
  const res = await fetch(listUrl);
  if (!res.ok) { context.warn(`backup: could not list old snapshots (${res.status})`); return; }
  const xml = await res.text();
  const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  for (const name of names) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m || new Date(m[1] + 'T00:00:00Z').getTime() >= cutoff) continue;
    await fetch(`https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER}/${name}?${sas}`, { method: 'DELETE' })
      .catch((err) => context.warn(`backup: failed to prune ${name}: ${err.message}`));
  }
}

app.timer('dailyBackup', {
  schedule: '0 0 3 * * *', // 03:00 UTC daily
  handler: async (myTimer, context) => {
    const sas = process.env.BACKUPS_CONTAINER_SAS;
    if (!sas) { context.error('backup: BACKUPS_CONTAINER_SAS is not configured — skipping'); return; }

    const snapshot = {};
    let totalRows = 0;
    for (const tableName of TABLES_TO_BACKUP) {
      try {
        snapshot[tableName] = await dumpTable(tableName);
        totalRows += snapshot[tableName].length;
      } catch (err) {
        snapshot[tableName] = { error: String(err) };
        context.warn(`backup: failed to dump ${tableName}: ${err.message}`);
      }
    }

    const blobName = `${new Date().toISOString().slice(0, 10)}.json`;
    const body = JSON.stringify({ generatedAt: new Date().toISOString(), tables: snapshot });
    const uploadUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER}/${blobName}?${sas}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/json' },
      body
    });
    if (!uploadRes.ok) {
      context.error(`backup: upload failed (${uploadRes.status})`);
      return;
    }

    await pruneOldSnapshots(sas, context);
    context.log(`backup: wrote ${blobName}, ${totalRows} rows across ${TABLES_TO_BACKUP.length} tables`);
  }
});
