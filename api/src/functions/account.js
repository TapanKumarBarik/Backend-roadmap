const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');
const { getSession } = require('../lib/adminAuth');
const { SESSION_COOKIE, cookieAttrs } = require('../lib/session');

// Tables partitioned by userId — a straightforward "delete every row in my
// partition" per table.
const USER_PARTITIONED_TABLES = ['ModuleProgress', 'Notes', 'Bookmarks', 'Streaks'];

async function deleteUserPartition(tableName, userId) {
  const table = getTable(tableName);
  const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
  for await (const e of entities) {
    await table.deleteEntity(e.partitionKey, e.rowKey).catch((err) => { if (err.statusCode !== 404) throw err; });
  }
}

app.http('deleteAccount', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'account',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    const userId = session.sub;

    for (const tableName of USER_PARTITIONED_TABLES) {
      await deleteUserPartition(tableName, userId);
    }
    await getTable('RateLimits').deleteEntity(userId, 'comments').catch((err) => { if (err.statusCode !== 404) throw err; });

    // Reactions and comment votes are both partitioned by page path, not by
    // user, so a per-user delete needs a filtered scan on the userId
    // property instead of a partition lookup. Votes are just removed
    // outright (unlike comments below) — a vote isn't content anyone else's
    // reply depends on.
    const reactions = getTable('Reactions');
    for await (const e of reactions.listEntities({ queryOptions: { filter: `userId eq '${userId}'` } })) {
      await reactions.deleteEntity(e.partitionKey, e.rowKey).catch((err) => { if (err.statusCode !== 404) throw err; });
    }
    const commentVotes = getTable('CommentVotes');
    for await (const e of commentVotes.listEntities({ queryOptions: { filter: `userId eq '${userId}'` } })) {
      await commentVotes.deleteEntity(e.partitionKey, e.rowKey).catch((err) => { if (err.statusCode !== 404) throw err; });
    }

    // Comments are anonymized rather than hard-deleted: the thread structure
    // (replies, "marked as answer") belongs to the conversation, not just
    // this one account, so removing the rows would silently break other
    // people's replies. Scrubbing the identifying fields satisfies "delete
    // my data" without doing that.
    const comments = getTable('Comments');
    for await (const e of comments.listEntities({ queryOptions: { filter: `userId eq '${userId}'` } })) {
      await comments.updateEntity(
        { partitionKey: e.partitionKey, rowKey: e.rowKey, displayName: '[deleted user]', text: '[deleted]', userId: 'deleted' },
        'Merge'
      ).catch((err) => { if (err.statusCode !== 404) throw err; });
    }

    // Pageview log: anonymize this user's entries rather than scanning to
    // delete (the table has no per-user partition, and today's date-only
    // filter for the admin view already caps how much of it is ever read).
    const pageviews = getTable('PageViews');
    for await (const e of pageviews.listEntities({ queryOptions: { filter: `user eq '${session.email}'` } })) {
      await pageviews.updateEntity({ partitionKey: e.partitionKey, rowKey: e.rowKey, user: 'deleted' }, 'Merge')
        .catch((err) => { if (err.statusCode !== 404) throw err; });
    }

    // Messages sent to the admin: same anonymize-identity-keep-text
    // treatment as comments — the admin may still need the message's
    // content, just not who it's tied to any more.
    const messages = getTable('Messages');
    for await (const e of messages.listEntities({ queryOptions: { filter: `userId eq '${userId}'` } })) {
      await messages.updateEntity(
        { partitionKey: e.partitionKey, rowKey: e.rowKey, displayName: '[deleted user]', email: 'deleted', userId: 'deleted' },
        'Merge'
      ).catch((err) => { if (err.statusCode !== 404) throw err; });
    }

    const headers = new Headers();
    headers.set('Set-Cookie', cookieAttrs(SESSION_COOKIE, '', 0));
    return { status: 204, headers };
  }
});
