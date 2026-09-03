const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');
const { getSession } = require('../lib/adminAuth');

const TABLE_NAME = 'Streaks';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

app.http('getStreak', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'streak',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const table = getTable(TABLE_NAME);
    const today = todayStr();
    let entity = null;
    try {
      entity = await table.getEntity(session.sub, 'streak');
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }

    if (!entity || entity.lastActiveDate !== today) {
      const current = entity && daysBetween(entity.lastActiveDate, today) === 1
        ? entity.currentStreak + 1
        : 1;
      const longest = Math.max(current, (entity && entity.longestStreak) || 0);
      entity = { partitionKey: session.sub, rowKey: 'streak', currentStreak: current, longestStreak: longest, lastActiveDate: today };
      await table.upsertEntity(entity, 'Replace');
    }

    return { jsonBody: { currentStreak: entity.currentStreak, longestStreak: entity.longestStreak, lastActiveDate: entity.lastActiveDate } };
  }
});
