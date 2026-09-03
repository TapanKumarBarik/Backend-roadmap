const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'PageViews';
// Bounds the scan cost of the admin listing at this table's current scale
// (a personal-site visitor log) — not a real pagination story, just a cap.
const MAX_SCAN = 2000;

app.http('trackPageView', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'track',
  handler: async (request) => {
    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const path = typeof body.path === 'string' ? body.path.slice(0, 500) : null;
    if (!path) return { status: 400, jsonBody: { error: 'path is required' } };

    const session = getSession(request);
    const now = new Date();
    const table = getTable(TABLE_NAME);
    await table.createEntity({
      partitionKey: now.toISOString().slice(0, 10),
      rowKey: String(now.getTime()).padStart(13, '0') + '-' + crypto.randomBytes(3).toString('hex'),
      path,
      user: session ? session.email : 'anonymous',
      referrer: (request.headers.get('referer') || '').slice(0, 500),
      timestamp: now.toISOString()
    });
    return { status: 204 };
  }
});

app.http('listPageViews', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/pageviews',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const table = getTable(TABLE_NAME);
    const rows = [];
    for await (const entity of table.listEntities()) {
      rows.push({ path: entity.path, user: entity.user, timestamp: entity.timestamp });
      if (rows.length >= MAX_SCAN) break;
    }
    rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    const byPath = {};
    const uniqueUsers = new Set();
    rows.forEach((r) => {
      byPath[r.path] = (byPath[r.path] || 0) + 1;
      if (r.user !== 'anonymous') uniqueUsers.add(r.user);
    });

    return {
      jsonBody: {
        recent: rows.slice(0, 200),
        totalViews: rows.length,
        uniqueSignedInUsers: uniqueUsers.size,
        topPaths: Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 20)
      }
    };
  }
});
