const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'FeedPosts';
const RATE_LIMIT_TABLE = 'RateLimits';
const MAX_TEXT_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 10; // posts per window, per user
const MAX_LIST = 200;

const STORAGE_ACCOUNT = 'stroadmapprogress';
const FEED_CONTAINER = 'feed-uploads';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = {
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'pdf' }
};

// Same fixed-window pattern as comments.js's checkRateLimit — its own
// RateLimits row (rowKey 'feed'), so a burst on one doesn't affect the
// other's budget.
async function checkRateLimit(userId) {
  const table = getTable(RATE_LIMIT_TABLE);
  const rowKey = 'feed';
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
    text: entity.text,
    attachmentUrl: entity.attachmentUrl || null,
    attachmentType: entity.attachmentType || null,
    createdAt: entity.createdAt
  };
}

// Public read, single 'feed' partition (personal-site scale — same "one
// partition, one page an admin/everyone reads newest-first" shape as
// Messages) — anyone can view without signing in, matching the
// "open feed, but posting needs an account" decision this was built under.
app.http('listFeed', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'feed',
  handler: async () => {
    const table = getTable(TABLE_NAME);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'feed'` } })) {
      out.push(toClientShape(entity));
      if (out.length >= MAX_LIST) break;
    }
    out.sort((a, b) => (a.id < b.id ? 1 : -1));
    return { jsonBody: out };
  }
});

app.http('postFeed', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'feed',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl : null;
    const attachmentType = attachmentUrl && (body.attachmentType === 'image' || body.attachmentType === 'pdf') ? body.attachmentType : null;
    if (!text && !attachmentUrl) return { status: 400, jsonBody: { error: 'a post needs text or an attachment' } };
    if (text.length > MAX_TEXT_LENGTH) return { status: 400, jsonBody: { error: `too long (max ${MAX_TEXT_LENGTH} chars)` } };
    // an attachment URL not actually pointing at our own feed-uploads
    // container would mean someone's hotlinking arbitrary URLs as "verified
    // uploads" — only trust ones this API itself just handed back.
    if (attachmentUrl && !attachmentUrl.startsWith(`https://${STORAGE_ACCOUNT}.blob.core.windows.net/${FEED_CONTAINER}/`)) {
      return { status: 400, jsonBody: { error: 'invalid attachment' } };
    }

    try {
      if (!(await checkRateLimit(session.sub))) {
        return { status: 429, jsonBody: { error: 'Too many posts — please wait a bit before posting again.' } };
      }
    } catch {
      // best-effort, same reasoning as comments.js
    }

    const table = getTable(TABLE_NAME);
    const entity = {
      partitionKey: 'feed',
      rowKey: String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex'),
      userId: session.sub,
      displayName: session.name,
      text,
      attachmentUrl,
      attachmentType,
      createdAt: new Date().toISOString()
    };
    await table.createEntity(entity);
    return { status: 201, jsonBody: toClientShape(entity) };
  }
});

// Signed-in (not admin-only, unlike the content editor's image upload) —
// same SAS + plain fetch pattern as content.js's uploadImage, expanded to
// also accept PDFs, into their own container so a bad file here can't
// touch the images the curriculum content itself relies on.
app.http('uploadFeedFile', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'feed/upload',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const { filename, contentType, dataBase64 } = body;
    const spec = ALLOWED_TYPES[contentType];
    if (!spec) return { status: 400, jsonBody: { error: 'unsupported file type (images or PDF only)' } };
    if (!dataBase64) return { status: 400, jsonBody: { error: 'dataBase64 is required' } };

    const buffer = Buffer.from(dataBase64, 'base64');
    const cap = spec.kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    if (buffer.length > cap) {
      return { status: 400, jsonBody: { error: `file exceeds ${Math.round(cap / (1024 * 1024))}MB limit` } };
    }

    try {
      if (!(await checkRateLimit(session.sub))) {
        return { status: 429, jsonBody: { error: 'Too many posts — please wait a bit before posting again.' } };
      }
    } catch {
      // best-effort
    }

    const sas = process.env.FEED_CONTAINER_SAS;
    if (!sas) return { status: 500, jsonBody: { error: 'feed storage is not configured' } };

    const safeName = (filename || 'file')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/\.[a-z0-9]+$/, '');
    const blobName = `${Date.now()}-${safeName}.${spec.ext}`;
    const blobUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${FEED_CONTAINER}/${blobName}`;

    const res = await fetch(`${blobUrl}?${sas}`, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-version': '2021-08-06',
        'Content-Type': contentType,
        'Content-Length': String(buffer.length)
      },
      body: buffer
    });
    if (!res.ok) {
      const detail = await res.text();
      return { status: 502, jsonBody: { error: 'upload failed', detail } };
    }

    return { jsonBody: { url: blobUrl, type: spec.kind } };
  }
});

// Admin-only delete — same pattern as comments.js's deleteComment.
app.http('deleteFeedPost', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'manage/feed',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };
    if (!isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

    const id = request.query.get('id');
    if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

    const table = getTable(TABLE_NAME);
    try {
      await table.deleteEntity('feed', id);
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }
    return { status: 204 };
  }
});
