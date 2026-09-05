const { app } = require('@azure/functions');
const { getTable } = require('../lib/tableClient');
const {
  getSession, isAdmin, listAdmins, grantAdmin, revokeAdmin, normalize, ADMIN_EMAIL
} = require('../lib/adminAuth');

const USERS_TABLE = 'Users';
// Same bounded-scan approach as pageviews.js and comments.js: at this site's
// scale a cap degrades to "the longest tail is missing" rather than to a slow
// endpoint, and avoids pretending to a pagination story nothing needs yet.
const MAX_SCAN = 5000;

async function guard(request) {
  const session = getSession(request);
  if (!session) return { error: { status: 401, jsonBody: { error: 'unauthenticated' } } };
  if (!await isAdmin(session)) return { error: { status: 403, jsonBody: { error: 'forbidden' } } };
  return { session };
}

// Counts one column of activity, keyed by whatever that table partitions on.
async function countByPartition(tableName) {
  const counts = {};
  try {
    const table = getTable(tableName);
    let n = 0;
    for await (const entity of table.listEntities()) {
      counts[entity.partitionKey] = (counts[entity.partitionKey] || 0) + 1;
      if (++n >= MAX_SCAN) break;
    }
  } catch { /* table may not exist yet */ }
  return counts;
}

app.http('listPeople', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/users',
  handler: async (request) => {
    const g = await guard(request);
    if (g.error) return g.error;

    // Progress, notes and bookmarks partition by Google `sub`; comments store
    // it as a userId column; page views only ever recorded an email. So the
    // directory is joined on sub, and views are matched on email afterwards.
    const [progress, notes, bookmarks] = await Promise.all([
      countByPartition('ModuleProgress'),
      countByPartition('Notes'),
      countByPartition('Bookmarks')
    ]);

    const comments = {};
    try {
      const table = getTable('Comments');
      let n = 0;
      for await (const e of table.listEntities()) {
        if (e.userId) comments[e.userId] = (comments[e.userId] || 0) + 1;
        if (++n >= MAX_SCAN) break;
      }
    } catch { /* ignore */ }

    const viewsByEmail = {};
    const lastViewByEmail = {};
    try {
      const table = getTable('PageViews');
      let n = 0;
      for await (const e of table.listEntities()) {
        const who = normalize(e.user);
        if (who && who !== 'anonymous') {
          viewsByEmail[who] = (viewsByEmail[who] || 0) + 1;
          if (!lastViewByEmail[who] || e.timestamp > lastViewByEmail[who]) {
            lastViewByEmail[who] = e.timestamp;
          }
        }
        if (++n >= MAX_SCAN) break;
      }
    } catch { /* ignore */ }

    const streaks = {};
    try {
      const table = getTable('Streaks');
      for await (const e of table.listEntities()) {
        streaks[e.partitionKey] = { current: e.currentStreak || 0, longest: e.longestStreak || 0 };
      }
    } catch { /* ignore */ }

    const admins = await listAdmins();
    const adminEmails = new Set(admins.map((a) => a.email));

    const users = [];
    const seenEmails = new Set();
    try {
      const table = getTable(USERS_TABLE);
      for await (const e of table.listEntities({ queryOptions: { filter: "PartitionKey eq 'user'" } })) {
        const email = normalize(e.email);
        seenEmails.add(email);
        users.push({
          userId: e.rowKey,
          email,
          name: e.name || email,
          picture: e.picture || null,
          firstSeen: e.firstSeen || null,
          lastSeen: e.lastSeen || null,
          isAdmin: adminEmails.has(email),
          isRoot: email === ADMIN_EMAIL,
          progress: progress[e.rowKey] || 0,
          notes: notes[e.rowKey] || 0,
          bookmarks: bookmarks[e.rowKey] || 0,
          comments: comments[e.rowKey] || 0,
          views: viewsByEmail[email] || 0,
          streak: streaks[e.rowKey] || null
        });
      }
    } catch { /* no Users table yet */ }

    // The Users table only started being written at this deploy, so anyone who
    // hasn't signed in since then is invisible to it. Page views know their
    // email, which is enough to list them as a known-but-unenriched user
    // rather than silently omitting them. They fill in on next sign-in.
    for (const [email, count] of Object.entries(viewsByEmail)) {
      if (seenEmails.has(email)) continue;
      users.push({
        userId: null,
        email,
        name: email,
        picture: null,
        firstSeen: null,
        lastSeen: lastViewByEmail[email] || null,
        isAdmin: adminEmails.has(email),
        isRoot: email === ADMIN_EMAIL,
        progress: 0, notes: 0, bookmarks: 0, comments: 0,
        views: count,
        streak: null,
        // Flagged so the UI can say why the row is thin, instead of implying
        // this person has done nothing.
        partial: true
      });
    }

    // An admin who has never signed in since the directory existed still has
    // to appear, or you cannot see (or revoke) someone you granted.
    for (const a of admins) {
      if (seenEmails.has(a.email) || viewsByEmail[a.email]) continue;
      users.push({
        userId: null, email: a.email, name: a.email, picture: null,
        firstSeen: null, lastSeen: null,
        isAdmin: true, isRoot: a.root,
        progress: 0, notes: 0, bookmarks: 0, comments: 0, views: 0,
        streak: null, partial: true
      });
    }

    users.sort((a, b) => {
      if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''));
    });

    return { jsonBody: { users, admins, rootEmail: ADMIN_EMAIL } };
  }
});

app.http('grantAdminRole', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'manage/admins',
  handler: async (request) => {
    const g = await guard(request);
    if (g.error) return g.error;

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const email = normalize(body && body.email);
    // Not full RFC validation — just enough that a typo doesn't create a row
    // no session will ever match against.
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { status: 400, jsonBody: { error: 'a valid email address is required' } };
    }
    if (email === ADMIN_EMAIL) {
      return { status: 400, jsonBody: { error: 'That address is already the owner.' } };
    }

    await grantAdmin(email, g.session.email);
    return { jsonBody: { email, granted: true } };
  }
});

app.http('revokeAdminRole', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'manage/admins',
  handler: async (request) => {
    const g = await guard(request);
    if (g.error) return g.error;

    const email = normalize(request.query.get('email'));
    if (!email) return { status: 400, jsonBody: { error: 'email is required' } };

    // Two locks, both about not being able to click your way out of your own
    // site: the owner is defined in code and has no row to delete, and nobody
    // can drop their own access by accident. Another admin can still revoke
    // you, which keeps the owner able to undo any grant.
    if (email === ADMIN_EMAIL) {
      return { status: 400, jsonBody: { error: 'The owner cannot be removed.' } };
    }
    if (email === normalize(g.session.email)) {
      return { status: 400, jsonBody: { error: 'You cannot remove your own admin access.' } };
    }

    await revokeAdmin(email);
    return { status: 204 };
  }
});
