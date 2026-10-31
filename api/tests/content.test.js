// The admin content editor commits to the repository with the site's GitHub token. It works on lessons only, and a
// lesson's path on the site ("learn/01-linux/README.md") is a path inside the content folder of the repository.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { repoPathFor } from '../routes/content.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';

test('a lesson path maps to its place in the content folder', () => {
  assert.equal(repoPathFor('learn/01-linux/README.md'), 'content/learn/01-linux/README.md');
  assert.equal(repoPathFor('genai/02-transformer-architecture/12-the-feed-forward-network/README.md'), 'content/genai/02-transformer-architecture/12-the-feed-forward-network/README.md');
});

test('anything that is not a lesson is refused', () => {
  const refused = [
    '', undefined, null,
    'README.md', // a file of the repository, not of a curriculum
    '.github/workflows/cloudflare-pages.yml',
    'content/learn/01-linux/README.md', // the repository path, not the lesson path
    'api/routes/admin.js',
    '../package.json',
    'learn/../.github/workflows/cloudflare-pages.yml',
    'learn/./01-linux/README.md',
    'learn//01-linux/README.md',
    '/learn/01-linux/README.md'
  ];
  for (const path of refused) assert.equal(repoPathFor(path), null, JSON.stringify(path));
});

const realFetch = globalThis.fetch;
let calls;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
    const content = Buffer.from('# Hello\n').toString('base64');
    return Response.json({ content, sha: 'abc123', commit: { sha: 'def456' } });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

async function asOwner(path, init = {}) {
  const env = createEnv({ GITHUB_PAT: 'test-token' });
  return app.request(path, { ...init, headers: { cookie: await signedInAs(OWNER_EMAIL), 'content-type': 'application/json' } }, env);
}

test('reading a lesson asks GitHub for the file inside the content folder and returns the lesson path', async () => {
  const res = await asOwner('/api/manage/content?path=learn/01-linux/README.md');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { path: 'learn/01-linux/README.md', content: '# Hello\n', sha: 'abc123' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/contents\/content\/learn\/01-linux\/README\.md\?ref=main$/);
});

test('saving a lesson commits to the same place', async () => {
  const res = await asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: 'learn/01-linux/README.md', content: '# Changed\n', sha: 'abc123' }) });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PUT');
  assert.match(calls[0].url, /\/contents\/content\/learn\/01-linux\/README\.md$/);
  assert.equal(Buffer.from(JSON.parse(calls[0].body).content, 'base64').toString(), '# Changed\n');
});

test('a path outside the lessons is refused before GitHub is contacted', async () => {
  const read = await asOwner('/api/manage/content?path=.github/workflows/cloudflare-pages.yml');
  assert.equal(read.status, 400);
  const write = await asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: 'learn/../.github/workflows/cloudflare-pages.yml', content: 'x', sha: 'abc123' }) });
  assert.equal(write.status, 400);
  assert.equal(calls.length, 0, 'GitHub was never called');
});
