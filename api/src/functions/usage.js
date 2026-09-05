const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

// Deliberately NOT real Azure billing/cost data — that needs an Azure
// Resource Manager credential (a service principal with Reader role), which
// this Function app has never had; it only ever holds a Table Storage
// connection string and a couple of container-scoped SAS tokens. This is
// the honest, zero-new-infrastructure version: row counts per table (a
// real proxy for "is this growing unexpectedly", not a cost figure) plus
// blob counts/bytes for the two containers this app already has SAS access
// to, via the plain List Blobs REST API — same fetch-based pattern as
// content.js's image upload and backup.js's export, no SDK.
const TABLE_NAMES = [
  'ModuleProgress', 'Notes', 'Bookmarks', 'Streaks', 'Reactions', 'Comments',
  'CommentVotes', 'PageViews', 'Messages', 'RateLimits'
];
const MAX_SCAN_PER_TABLE = 5000;
const STORAGE_ACCOUNT = 'stroadmapprogress';

async function countTable(name) {
  const table = getTable(name);
  let count = 0;
  for await (const _ of table.listEntities()) {
    count++;
    if (count >= MAX_SCAN_PER_TABLE) return { count, capped: true };
  }
  return { count, capped: false };
}

async function containerUsage(containerName, sas) {
  if (!sas) return null;
  let marker = '';
  let blobCount = 0;
  let totalBytes = 0;
  do {
    const url = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${containerName}?restype=container&comp=list&${sas}${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const xml = await res.text();
    blobCount += (xml.match(/<Blob>/g) || []).length;
    for (const m of xml.matchAll(/<Content-Length>(\d+)<\/Content-Length>/g)) totalBytes += Number(m[1]);
    const markerMatch = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
    marker = markerMatch ? markerMatch[1] : '';
  } while (marker);
  return { blobCount, totalBytes };
}

app.http('usageStats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/usage',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!await isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const tables = {};
    for (const name of TABLE_NAMES) {
      try {
        tables[name] = await countTable(name);
      } catch (err) {
        tables[name] = { error: String(err) };
      }
    }

    const containers = {
      images: await containerUsage('images', process.env.IMAGES_CONTAINER_SAS),
      backups: await containerUsage('backups', process.env.BACKUPS_CONTAINER_SAS)
    };

    return { jsonBody: { tables, containers } };
  }
});
