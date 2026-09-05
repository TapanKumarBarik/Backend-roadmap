const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'PageViews';
// Bounds the scan cost of the admin listing at this table's current scale
// (a personal-site visitor log) — not a real pagination story, just a cap.
const MAX_SCAN = 2000;
// Days of history the chart draws. Long enough to show a trend, short enough
// that the strip stays readable without scrolling.
const DAILY_WINDOW = 30;

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
    if (!await isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const table = getTable(TABLE_NAME);
    const rows = [];
    for await (const entity of table.listEntities()) {
      rows.push({ path: entity.path, user: entity.user, timestamp: entity.timestamp });
      if (rows.length >= MAX_SCAN) break;
    }
    rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    const byPath = {};
    const uniqueUsers = new Set();
    const byUser = {};
    let signedInViews = 0;
    rows.forEach((r) => {
      byPath[r.path] = (byPath[r.path] || 0) + 1;
      if (r.user !== 'anonymous') {
        uniqueUsers.add(r.user);
        byUser[r.user] = (byUser[r.user] || 0) + 1;
        signedInViews++;
      }
    });

    // A dense day-by-day series, so the chart can draw a real time axis
    // instead of skipping the quiet days and implying activity was continuous.
    // Every view is bucketed by its own local-free ISO date; days with nothing
    // are emitted as zero rather than omitted.
    const perDay = new Map();
    rows.forEach((r) => {
      const day = String(r.timestamp).slice(0, 10);
      if (!perDay.has(day)) perDay.set(day, { views: 0, signedIn: 0, users: new Set() });
      const d = perDay.get(day);
      d.views++;
      if (r.user !== 'anonymous') { d.signedIn++; d.users.add(r.user); }
    });

    const daily = [];
    if (rows.length) {
      const end = new Date(rows[0].timestamp.slice(0, 10) + 'T00:00:00Z');
      const cursor = new Date(end);
      cursor.setUTCDate(cursor.getUTCDate() - (DAILY_WINDOW - 1));
      for (let i = 0; i < DAILY_WINDOW; i++) {
        const key = cursor.toISOString().slice(0, 10);
        const d = perDay.get(key);
        daily.push({
          date: key,
          views: d ? d.views : 0,
          signedIn: d ? d.signedIn : 0,
          visitors: d ? d.users.size : 0
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    return {
      jsonBody: {
        recent: rows.slice(0, 200),
        totalViews: rows.length,
        signedInViews,
        anonymousViews: rows.length - signedInViews,
        uniqueSignedInUsers: uniqueUsers.size,
        capped: rows.length >= MAX_SCAN,
        daily,
        topPaths: Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 20),
        topUsers: Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 10)
      }
    };
  }
});
