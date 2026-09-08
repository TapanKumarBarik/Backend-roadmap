const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'Books';
const RATE_LIMIT_TABLE = 'RateLimits';
const MAX_TITLE_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 150;
const MAX_NOTE_LENGTH = 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 10; // entries per window, per user
const MAX_LIST = 500;

// Same trust boundary as feed.js's postFeed: an attachment URL here must be
// something this app's OWN upload endpoint (feed/upload, reused as-is rather
// than duplicated — see ROADMAP.md) just handed back, never an arbitrary
// hotlinked URL presented as a verified upload.
const STORAGE_ACCOUNT = 'stroadmapprogress';
const FEED_CONTAINER = 'feed-uploads';
const ATTACHMENT_TYPES = new Set(['pdf', 'doc', 'image']);

// Same fixed-window pattern as feed.js/comments.js's own checkRateLimit —
// its own RateLimits row ('books'), so a burst here doesn't touch either
// budget.
async function checkRateLimit(userId) {
  const table = getTable(RATE_LIMIT_TABLE);
  const rowKey = 'books';
  let entity = null;
  try {
    entity = await table.getEntity(userId, rowKey);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  const now = Date.now();
  if (!entity || now - new Date(entity.windowStart).getTime() > RATE_LIMIT_WINDOW_MS) {
    await table.upsertEntity({ partitionKey: userId, rowKey, windowStart: new Date(now).toISOString(), count: 1 }, 'Replace');
    return true;
  }
  if (entity.count >= RATE_LIMIT_MAX) return false;
  await table.updateEntity({ partitionKey: userId, rowKey, count: entity.count + 1 }, 'Merge');
  return true;
}

function toClientShape(entity) {
  return {
    id: entity.rowKey,
    userId: entity.userId,
    displayName: entity.displayName,
    title: entity.title,
    author: entity.author || null,
    notes: entity.notes || null,
    linkUrl: entity.linkUrl || null,
    attachmentUrl: entity.attachmentUrl || null,
    attachmentType: entity.attachmentType || null,
    createdAt: entity.createdAt
  };
}

// Public read, single 'books' partition — same personal-site scale shape as
// Messages/FeedPosts: one partition everyone reads newest-first, no signed-in
// requirement to browse the shelf, only to add to it.
app.http('listBooks', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'books',
  handler: async () => {
    const table = getTable(TABLE_NAME);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'books'` } })) {
      out.push(toClientShape(entity));
      if (out.length >= MAX_LIST) break;
    }
    out.sort((a, b) => (a.id < b.id ? 1 : -1));
    return { jsonBody: out };
  }
});

app.http('postBook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'books',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return { status: 400, jsonBody: { error: 'a title is required' } };
    if (title.length > MAX_TITLE_LENGTH) return { status: 400, jsonBody: { error: `title too long (max ${MAX_TITLE_LENGTH} chars)` } };

    const author = typeof body.author === 'string' ? body.author.trim().slice(0, MAX_AUTHOR_LENGTH) : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, MAX_NOTE_LENGTH) : '';

    const linkUrl = typeof body.linkUrl === 'string' ? body.linkUrl.trim() : '';
    if (linkUrl && (!/^https?:\/\//i.test(linkUrl) || linkUrl.length > 2000)) {
      return { status: 400, jsonBody: { error: 'not a valid link' } };
    }

    const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl.trim() : '';
    const attachmentType = attachmentUrl && ATTACHMENT_TYPES.has(body.attachmentType) ? body.attachmentType : null;
    if (attachmentUrl) {
      // Must be a URL this API itself just handed back from feed/upload —
      // otherwise a book entry could hotlink an arbitrary URL and have it
      // rendered as though it were a verified upload. Same check as
      // feed.js's postFeed.
      if (!attachmentType || !attachmentUrl.startsWith(`https://${STORAGE_ACCOUNT}.blob.core.windows.net/${FEED_CONTAINER}/`)) {
        return { status: 400, jsonBody: { error: 'invalid attachment' } };
      }
    }

    try {
      if (!(await checkRateLimit(session.sub))) {
        return { status: 429, jsonBody: { error: 'Too many entries — please wait a bit before adding another.' } };
      }
    } catch {
      // best-effort, same reasoning as feed.js/comments.js
    }

    const table = getTable(TABLE_NAME);
    const entity = {
      partitionKey: 'books',
      rowKey: String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex'),
      userId: session.sub,
      displayName: session.name,
      title,
      author,
      notes,
      linkUrl,
      attachmentUrl: attachmentUrl || null,
      attachmentType,
      createdAt: new Date().toISOString()
    };
    await table.createEntity(entity);
    return { status: 201, jsonBody: toClientShape(entity) };
  }
});

// Admin-only delete — same pattern as feed.js's deleteFeedPost.
app.http('deleteBook', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'manage/books',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!await isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const id = request.query.get('id');
    if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

    const table = getTable(TABLE_NAME);
    try {
      await table.deleteEntity('books', id);
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }
    return { status: 204 };
  }
});
