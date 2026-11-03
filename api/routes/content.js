// The admin-only content editor:
// read/commit a repo file through the GitHub API, and upload a content image
// to the Azure `images` container via SAS. Unchanged apart from Buffer →
// bytes helpers.

import { createRouter } from '../lib/router.js';
import site from '../../site.config.json' with { type: 'json' };
import { requireAdmin } from '../lib/admin.js';
import { upstreamStatus } from '../lib/util.js';
import { IMAGE_CONTAINER, blobBase, bytesFromBase64, putBlob } from '../lib/blob.js';
import { isPracticePath, practiceFileProblems } from '../../webapp/src/lib/practice/validate.js';

const content = createRouter();

const GITHUB_REPO = `${site.repo.owner}/${site.repo.name}`;
const GITHUB_BRANCH = site.repo.branch;
const GITHUB_API = 'https://api.github.com';
const CONTENT_DIR = site.content.dir;
const CURRICULA = site.content.curricula;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

// The editor works on lessons, so a path is a lesson's path from the content folder ("learn/01-linux/README.md") and
// becomes content/learn/01-linux/README.md in the repository. The practice content is the other thing it may edit: the quizzes,
// exercises, interview sets and design challenges ("practice/quizzes/http-caching.json", "design-lab/lld/atm.json"), which are
// checked before they are committed (a bad one would stop the next deploy). Anything else (another folder of the repository, a
// path that climbs out with "..") is refused: this endpoint commits with the site's GitHub token, and it should not
// be a way to change workflows or code. Returns null for a path it will not touch.
export function repoPathFor(path) {
  if (isPracticePath(path)) return `${CONTENT_DIR}/${path}`;
  const parts = String(path || '').split('/');
  if (!CURRICULA.includes(parts[0]) || parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  return CONTENT_DIR + '/' + parts.map(encodeURIComponent).join('/');
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'backend-roadmap-editor'
  };
}

/**
 * What is wrong with a practice file's text, or [] when it can be committed: it is valid JSON of the right shape, and the lesson
 * it names (its `module`) exists in the repository. Returns { problems, item }.
 */
async function practiceProblems(env, path, text) {
  let item;
  try { item = JSON.parse(text); } catch (err) { return { problems: [`${path}: not valid JSON (${err.message})`], item: null }; }
  const problems = practiceFileProblems(path, item);
  if (!problems.length && item.module) {
    const lesson = repoPathFor(item.module);
    if (!lesson) problems.push(`${path}: module "${item.module}" is not a lesson`);
    else {
      const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${lesson}?ref=${GITHUB_BRANCH}`, { headers: githubHeaders(env) });
      if (!res.ok) problems.push(`${path}: module "${item.module}" is not a lesson`);
    }
  }
  return { problems, item };
}

// Checks a practice file without committing it: the problems, or an empty list.
content.post('/manage/content/check', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  if (!isPracticePath(body.path) || typeof body.content !== 'string') return c.json({ error: 'path must be a practice file, and content its text' }, 400);
  return c.json({ problems: (await practiceProblems(c.env, body.path, body.content)).problems });
});

content.get('/manage/content', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const path = c.req.query('path');
  if (!path) return c.json({ error: 'path is required' }, 400);
  const repoPath = repoPathFor(path);
  if (!repoPath) return c.json({ error: 'path must be a lesson inside a curriculum folder' }, 400);

  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${repoPath}?ref=${GITHUB_BRANCH}`, {
    headers: githubHeaders(c.env)
  });
  if (!res.ok) return c.json({ error: 'GitHub fetch failed: ' + res.status }, upstreamStatus(res));
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
  const practice = isPracticePath(path);
  // A new practice file has no sha yet: it is created, when `create` says so.
  if (!path || typeof fileContent !== 'string' || (!sha && !(practice && body.create === true))) {
    return c.json({ error: 'path, content, and sha are required' }, 400);
  }
  const repoPath = repoPathFor(path);
  if (!repoPath) return c.json({ error: 'path must be a lesson inside a curriculum folder' }, 400);
  let text = fileContent;
  if (practice) {
    const checked = await practiceProblems(c.env, path, fileContent);
    if (checked.problems.length) return c.json({ error: 'this file has problems, so it was not saved', problems: checked.problems }, 400);
    text = `${JSON.stringify(checked.item, null, 2)}\n`; // one layout, so a change shows as a change in the history
  }

  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: { ...githubHeaders(c.env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: body.message || `Edit ${path} via admin editor`,
      content: Buffer.from(text, 'utf-8').toString('base64'),
      ...(sha ? { sha } : {}),
      branch: GITHUB_BRANCH
    })
  });
  if (!res.ok) {
    return c.json({ error: 'GitHub commit failed', detail: await res.text() }, upstreamStatus(res));
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
