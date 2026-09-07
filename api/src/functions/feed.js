const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession, isAdmin } = require('../lib/adminAuth');

const TABLE_NAME = 'FeedPosts';
const VOTES_TABLE = 'FeedVotes';
const COMMENTS_TABLE = 'Comments';
const RATE_LIMIT_TABLE = 'RateLimits';
const MAX_TEXT_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 10; // posts per window, per user
const MAX_LIST = 200;

const STORAGE_ACCOUNT = 'stroadmapprogress';
const FEED_CONTAINER = 'feed-uploads';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_OFFICE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_BYTES = 1 * 1024 * 1024;

// 'kind' drives both the icon FeedView renders and whether the blob is
// served inline (image, pdf -- browsers already handle both safely) or
// forced to download (everything else -- see contentDisposition below).
const ALLOWED_TYPES = {
  'image/png': { ext: 'png', kind: 'image', cap: MAX_IMAGE_BYTES },
  'image/jpeg': { ext: 'jpg', kind: 'image', cap: MAX_IMAGE_BYTES },
  'image/webp': { ext: 'webp', kind: 'image', cap: MAX_IMAGE_BYTES },
  'image/gif': { ext: 'gif', kind: 'image', cap: MAX_IMAGE_BYTES },
  'application/pdf': { ext: 'pdf', kind: 'pdf', cap: MAX_PDF_BYTES },
  'text/markdown': { ext: 'md', kind: 'text', cap: MAX_TEXT_BYTES },
  'text/plain': { ext: 'txt', kind: 'text', cap: MAX_TEXT_BYTES },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    { ext: 'docx', kind: 'doc', cap: MAX_OFFICE_BYTES },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    { ext: 'pptx', kind: 'slide', cap: MAX_OFFICE_BYTES },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    { ext: 'xlsx', kind: 'sheet', cap: MAX_OFFICE_BYTES }
};

// Every attachment kind a post can carry, including 'link' -- which has no
// upload step and so isn't in ALLOWED_TYPES above.
const ATTACHMENT_TYPES = new Set([...new Set(Object.values(ALLOWED_TYPES).map((s) => s.kind)), 'link']);

// The upload endpoint trusted the client-supplied contentType completely: it
// went straight into ALLOWED_TYPES' lookup and then onto the blob's own
// Content-Type header, with nothing checking it against the bytes actually
// received. Someone could label an HTML/script payload "image/png" and have
// it hosted, Content-Type and all, on this app's own storage domain --
// different origin from the site itself (no cookie theft), but still an
// attacker using a domain people were told to trust. Now widening the
// allowlist to five more types, this gets checked first rather than after.
//
// docx/pptx/xlsx are all Zip containers, so this only confirms "this is a
// well-formed Zip", not which Office format it claims to be -- accepted
// as enough: the goal is rejecting a non-Zip payload wearing an Office
// extension, not fully parsing OOXML.
const MAGIC = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]]
};

function bytesMatch(buffer, sig) {
  if (buffer.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buffer[i] !== sig[i]) return false;
  return true;
}

function looksLikeClaimedType(buffer, contentType) {
  if (contentType === 'image/webp') {
    // RIFF....WEBP: bytes 0-3 are 'RIFF', bytes 8-11 are 'WEBP'.
    return bytesMatch(buffer, [0x52, 0x49, 0x46, 0x46])
      && buffer.slice(8, 12).toString('ascii') === 'WEBP';
  }
  const sigs = MAGIC[contentType];
  if (sigs) return sigs.some((sig) => bytesMatch(buffer, sig));
  if (contentType === 'text/markdown' || contentType === 'text/plain') {
    // No magic bytes for arbitrary text. A null byte is the cheap signal
    // that this is not actually text, without decoding and scanning the
    // whole buffer as UTF-8 for a file that's capped at 1MB anyway.
    return !buffer.includes(0);
  }
  return false; // an allowlisted type this function doesn't know how to check
}

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

function toClientShape(entity, votes, commentCounts) {
  return {
    id: entity.rowKey,
    userId: entity.userId,
    displayName: entity.displayName,
    text: entity.text,
    attachmentUrl: entity.attachmentUrl || null,
    attachmentType: entity.attachmentType || null,
    // Only meaningful when attachmentType is 'link' -- the poster's own
    // label for the URL, never fetched/derived server-side (see postFeed).
    linkTitle: entity.linkTitle || null,
    createdAt: entity.createdAt,
    upvotes: votes ? (votes.counts[entity.rowKey] || 0) : 0,
    votedByMe: votes ? votes.mine.has(entity.rowKey) : false,
    commentCount: commentCounts ? (commentCounts[entity.rowKey] || 0) : 0
  };
}

// FeedVotes has a single partition ('feed', same constant every row) —
// there's only ever one feed, unlike CommentVotes which is partitioned per
// page path — with RowKey `${postId}_${userId}`, so counting every vote on
// every post is one scan, not one query per post.
//
// Best-effort: FeedVotes is a brand-new table that has to be provisioned in
// the storage account before its first use (same manual step CommentVotes
// needed) — until then this throws TableNotFound, and the public feed listing
// shouldn't 500 just because voting hasn't been set up yet.
async function loadFeedVotes(userId) {
  const counts = {};
  const mine = new Set();
  try {
    const table = getTable(VOTES_TABLE);
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'feed'` } })) {
      const idx = entity.rowKey.lastIndexOf('_');
      const postId = entity.rowKey.slice(0, idx);
      const voterId = entity.rowKey.slice(idx + 1);
      counts[postId] = (counts[postId] || 0) + 1;
      if (userId && voterId === userId) mine.add(postId);
    }
  } catch {
    // table not provisioned yet, or a transient storage hiccup — feed still
    // renders, just with every post at zero votes.
  }
  return { counts, mine };
}

// Feed-post comments share the Comments table with module discussions
// (partitionKey `feed:<postId>`, see comments.js's recentQuestions) — one
// bounded scan for every post's count, rather than a request per post.
async function loadCommentCounts() {
  const counts = {};
  try {
    const table = getTable(COMMENTS_TABLE);
    const prefix = encodeURIComponent('feed:');
    for await (const entity of table.listEntities({
      queryOptions: { filter: `startswith(PartitionKey, '${prefix}') and hidden eq false` }
    })) {
      const postId = decodeURIComponent(entity.partitionKey).slice('feed:'.length);
      counts[postId] = (counts[postId] || 0) + 1;
    }
  } catch {
    // best-effort, same reasoning as loadFeedVotes — a count glitch shouldn't
    // take down the feed listing itself.
  }
  return counts;
}

// Public read, single 'feed' partition (personal-site scale — same "one
// partition, one page an admin/everyone reads newest-first" shape as
// Messages) — anyone can view without signing in, matching the
// "open feed, but posting needs an account" decision this was built under.
app.http('listFeed', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'feed',
  handler: async (request) => {
    const session = getSession(request);
    const table = getTable(TABLE_NAME);
    const [votes, commentCounts] = await Promise.all([
      loadFeedVotes(session && session.sub),
      loadCommentCounts()
    ]);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'feed'` } })) {
      out.push(toClientShape(entity, votes, commentCounts));
      if (out.length >= MAX_LIST) break;
    }
    out.sort((a, b) => (a.id < b.id ? 1 : -1));
    return { jsonBody: out };
  }
});

// Upvote-only, toggle on repeat click — same shape as comments.js's
// voteComment, just against FeedVotes' single 'feed' partition instead of
// one partition per page path.
app.http('voteFeedPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'feed/vote',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const id = typeof body.id === 'string' ? body.id : null;
    if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

    const table = getTable(VOTES_TABLE);
    const rowKey = `${id}_${session.sub}`;
    try {
      await table.getEntity('feed', rowKey);
      await table.deleteEntity('feed', rowKey);
      return { jsonBody: { voted: false } };
    } catch (err) {
      if (err.statusCode !== 404) throw err;
      await table.createEntity({ partitionKey: 'feed', rowKey, postId: id, userId: session.sub, createdAt: new Date().toISOString() });
      return { jsonBody: { voted: true } };
    }
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
    const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl.trim() : null;
    const attachmentType = attachmentUrl && ATTACHMENT_TYPES.has(body.attachmentType) ? body.attachmentType : null;
    let linkTitle = null;
    if (!text && !attachmentUrl) return { status: 400, jsonBody: { error: 'a post needs text or an attachment' } };
    if (text.length > MAX_TEXT_LENGTH) return { status: 400, jsonBody: { error: `too long (max ${MAX_TEXT_LENGTH} chars)` } };

    if (attachmentType === 'link') {
      // A link has no upload step, so it's the one attachment kind not
      // constrained to this app's own storage container -- but it still has
      // to actually be a link. No server-side fetch to unfurl a preview:
      // that would let a public, unauthenticated-write-adjacent endpoint
      // make the server issue a request to any URL a poster supplies,
      // including internal/metadata addresses (SSRF). The poster's own
      // title is stored as typed, nothing derived from the URL's content.
      if (!/^https?:\/\//i.test(attachmentUrl) || attachmentUrl.length > 2000) {
        return { status: 400, jsonBody: { error: 'not a valid link' } };
      }
      linkTitle = typeof body.linkTitle === 'string' ? body.linkTitle.trim().slice(0, 200) : '';
    } else if (attachmentUrl) {
      // Every other kind must be a URL this API itself just handed back from
      // uploadFeedFile -- otherwise a post could hotlink an arbitrary URL and
      // have it rendered as though it were a verified upload of that kind.
      if (!attachmentUrl.startsWith(`https://${STORAGE_ACCOUNT}.blob.core.windows.net/${FEED_CONTAINER}/`)) {
        return { status: 400, jsonBody: { error: 'invalid attachment' } };
      }
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
      linkTitle,
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
    if (!spec) {
      return {
        status: 400,
        jsonBody: { error: 'unsupported file type (images, PDF, Word/PowerPoint/Excel, or markdown/text)' }
      };
    }
    if (!dataBase64) return { status: 400, jsonBody: { error: 'dataBase64 is required' } };

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > spec.cap) {
      return { status: 400, jsonBody: { error: `file exceeds ${Math.round(spec.cap / (1024 * 1024))}MB limit` } };
    }
    if (!looksLikeClaimedType(buffer, contentType)) {
      return { status: 400, jsonBody: { error: "file content doesn't match its declared type" } };
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

    // image and pdf render inline in the feed (a thumbnail, an embedded PDF
    // viewer via <a target=_blank>) -- every other kind has no safe or useful
    // in-browser rendering, so it downloads instead of the browser guessing
    // what to do with a .docx it was served without a disposition.
    const headers = {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-version': '2021-08-06',
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      // blobName is Date.now()-prefixed and never overwritten (a re-upload
      // always gets a new name), so it's safe for browsers/any CDN in front
      // of this origin to cache the bytes forever without ever revalidating
      // -- this is the fix that actually matters for repeat views: without
      // it, every image reload re-downloads the full file from blob storage.
      'x-ms-blob-cache-control': 'public, max-age=31536000, immutable'
    };
    if (spec.kind !== 'image' && spec.kind !== 'pdf') {
      const safeDownloadName = `${safeName}.${spec.ext}`.replace(/"/g, '');
      headers['x-ms-blob-content-disposition'] = `attachment; filename="${safeDownloadName}"`;
    }

    const res = await fetch(`${blobUrl}?${sas}`, {
      method: 'PUT',
      headers,
      body: buffer
    });
    if (!res.ok) {
      const detail = await res.text();
      return { status: 502, jsonBody: { error: 'upload failed', detail } };
    }

    return { jsonBody: { url: blobUrl, type: spec.kind, filename: `${safeName}.${spec.ext}` } };
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
    if (!await isAdmin(session)) return { status: 403, jsonBody: { error: 'forbidden' } };

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
