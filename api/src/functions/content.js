const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const { getSession, isAdmin } = require('../lib/adminAuth');

const GITHUB_REPO = 'TapanKumarBarik/Backend-roadmap';
const GITHUB_API = 'https://api.github.com';
const IMAGE_CONTAINER = 'images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'backend-roadmap-editor'
  };
}

function requireAdmin(request) {
  const session = getSession(request);
  if (!session) return { error: { status: 401, jsonBody: { error: 'unauthenticated' } } };
  if (!isAdmin(session)) return { error: { status: 403, jsonBody: { error: 'forbidden' } } };
  return { session };
}

// admin-only, editing is restricted to a single hardcoded identity — commits
// go straight to main with no PR review, which is only an acceptable risk
// because only the site owner can reach this endpoint at all.
app.http('getContent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/content',
  handler: async (request) => {
    const auth = requireAdmin(request);
    if (auth.error) return auth.error;

    const path = request.query.get('path');
    if (!path) return { status: 400, jsonBody: { error: 'path is required' } };

    const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${path}?ref=main`, { headers: githubHeaders() });
    if (!res.ok) return { status: res.status, jsonBody: { error: 'GitHub fetch failed: ' + res.status } };
    const data = await res.json();
    const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
    return { jsonBody: { path, content, sha: data.sha } };
  }
});

app.http('putContent', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'admin/content',
  handler: async (request) => {
    const auth = requireAdmin(request);
    if (auth.error) return auth.error;

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const { path, content, sha } = body;
    if (!path || typeof content !== 'string' || !sha) {
      return { status: 400, jsonBody: { error: 'path, content, and sha are required' } };
    }

    const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: body.message || `Edit ${path} via admin editor`,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha,
        branch: 'main'
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { status: res.status, jsonBody: { error: 'GitHub commit failed', detail: errBody } };
    }
    const data = await res.json();
    return { jsonBody: { path, sha: data.content.sha, commit: data.commit.sha } };
  }
});

app.http('uploadImage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/image',
  handler: async (request) => {
    const auth = requireAdmin(request);
    if (auth.error) return auth.error;

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }
    const { filename, contentType, dataBase64 } = body;
    const ext = ALLOWED_IMAGE_TYPES[contentType];
    if (!ext) return { status: 400, jsonBody: { error: 'unsupported content type' } };
    if (!dataBase64) return { status: 400, jsonBody: { error: 'dataBase64 is required' } };

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) {
      return { status: 400, jsonBody: { error: 'image exceeds 5MB limit' } };
    }

    const safeName = (filename || 'image')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/\.[a-z0-9]+$/, '');
    const blobName = `${Date.now()}-${safeName}.${ext}`;

    const conn = process.env.TABLE_STORAGE_CONNECTION_STRING;
    const blobService = BlobServiceClient.fromConnectionString(conn);
    const container = blobService.getContainerClient(IMAGE_CONTAINER);
    const blockBlob = container.getBlockBlobClient(blobName);
    await blockBlob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });

    return { jsonBody: { url: blockBlob.url } };
  }
});
