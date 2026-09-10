// Port of api/src/functions/content.js — the admin-only content editor:
// read/commit a repo file through the GitHub API, and upload a content image
// to the Azure `images` container via SAS. Unchanged apart from Buffer →
// bytes helpers.

import { Hono } from 'hono';
import { requireAdmin } from '../lib/admin.js';
import { IMAGE_CONTAINER, blobBase, bytesFromBase64, putBlob } from '../lib/blob.js';

const content = new Hono();

const GITHUB_REPO = 'TapanKumarBarik/Backend-roadmap';
const GITHUB_API = 'https://api.github.com';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'backend-roadmap-editor'
  };
}

content.get('/manage/content', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const path = c.req.query('path');
  if (!path) return c.json({ error: 'path is required' }, 400);

  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${path}?ref=main`, {
    headers: githubHeaders(c.env)
  });
  if (!res.ok) return c.json({ error: 'GitHub fetch failed: ' + res.status }, res.status);
  const data = await res.json();
  const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
  return c.json({ path, content: decoded, sha: data.sha });
});

content.put('/manage/content', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const { path, content: fileContent, sha } = body;
  if (!path || typeof fileContent !== 'string' || !sha) {
    return c.json({ error: 'path, content, and sha are required' }, 400);
  }

  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...githubHeaders(c.env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: body.message || `Edit ${path} via admin editor`,
      content: Buffer.from(fileContent, 'utf-8').toString('base64'),
      sha,
      branch: 'main'
    })
  });
  if (!res.ok) {
    return c.json({ error: 'GitHub commit failed', detail: await res.text() }, res.status);
  }
  const data = await res.json();
  return c.json({ path, sha: data.content.sha, commit: data.commit.sha });
});

content.post('/manage/image', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const { filename, contentType, dataBase64 } = body;
  const ext = ALLOWED_IMAGE_TYPES[contentType];
  if (!ext) return c.json({ error: 'unsupported content type' }, 400);
  if (!dataBase64) return c.json({ error: 'dataBase64 is required' }, 400);

  const bytes = bytesFromBase64(dataBase64);
  if (bytes.length > MAX_IMAGE_BYTES) return c.json({ error: 'image exceeds 5MB limit' }, 400);

  const sas = c.env.IMAGES_CONTAINER_SAS;
  if (!sas) return c.json({ error: 'image storage is not configured' }, 500);

  const safeName = (filename || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/\.[a-z0-9]+$/, '');
  const blobName = `${Date.now()}-${safeName}.${ext}`;

  const res = await putBlob(IMAGE_CONTAINER, blobName, bytes, sas, {
    'Content-Type': contentType,
    'x-ms-blob-cache-control': 'public, max-age=31536000, immutable'
  });
  if (!res.ok) {
    return c.json({ error: 'blob upload failed', detail: await res.text() }, 502);
  }
  return c.json({ url: `${blobBase(IMAGE_CONTAINER)}/${blobName}` });
});

export default content;
