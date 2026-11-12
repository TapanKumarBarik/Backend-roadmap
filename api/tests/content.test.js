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

// ------------------------------------------------------------------------------------------------ practice files

const QUIZ_FILE = 'practice/quizzes/new-quiz.json';
const goodQuiz = () => ({
  title: 'A new quiz', topic: 'http', difficulty: 'beginner', module: 'backend/01-request-response-fundamentals/06-http-caching/README.md', description: 'A quiz.',
  questions: [{ id: 'q1', type: 'single', text: 'Which?', options: [{ id: 'a', text: 'This' }, { id: 'b', text: 'That' }], answer: ['a'], explanation: 'Because.' }]
});

test('practice files map into the content folder, and nothing else that looks like one does', () => {
  assert.equal(repoPathFor('practice/quizzes/http-caching.json'), 'content/practice/quizzes/http-caching.json');
  assert.equal(repoPathFor('practice/interview/caching.json'), 'content/practice/interview/caching.json');
  for (const path of ['practice/quizzes/../../api/app.js', 'practice/quizzes/a.js', 'practice/other/a.json', 'design-lab/lld/atm.json', 'practice/quizzes/A B.json', 'content/practice/quizzes/a.json', 'practice/quizzes/.json']) {
    assert.equal(repoPathFor(path), null, path);
  }
});

test('a practice file is checked without being committed, and the problems are named', async () => {
  const bad = goodQuiz();
  bad.questions[0].answer = ['z'];
  const res = await asOwner('/api/manage/content/check', { method: 'POST', body: JSON.stringify({ path: QUIZ_FILE, content: JSON.stringify(bad) }) });
  assert.equal(res.status, 200);
  assert.match((await res.json()).problems.join(' '), /answer must be option ids/);
  assert.deepEqual((await (await asOwner('/api/manage/content/check', { method: 'POST', body: JSON.stringify({ path: QUIZ_FILE, content: JSON.stringify(goodQuiz()) }) })).json()).problems, [], 'a good quiz has none (the lesson it names exists)');
  assert.ok(calls.every((call) => call.method === 'GET'), 'nothing was committed');
  assert.match((await (await asOwner('/api/manage/content/check', { method: 'POST', body: JSON.stringify({ path: QUIZ_FILE, content: '{ nope' }) })).json()).problems[0], /not valid JSON/);
  assert.equal((await asOwner('/api/manage/content/check', { method: 'POST', body: JSON.stringify({ path: 'learn/01-linux/README.md', content: '#' }) })).status, 400, 'only practice files');
});

test('a quiz is committed only when it is good, and a new one needs no sha', async () => {
  const bad = { ...goodQuiz(), difficulty: 'hard' };
  const refused = await asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: QUIZ_FILE, content: JSON.stringify(bad), create: true }) });
  assert.equal(refused.status, 400);
  assert.ok((await refused.json()).problems.length > 0);
  assert.ok(!calls.some((call) => call.method === 'PUT'), 'nothing reached the repository');

  const made = await asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: QUIZ_FILE, content: JSON.stringify(goodQuiz()), create: true }) });
  assert.equal(made.status, 200);
  const put = calls.find((call) => call.method === 'PUT');
  assert.match(put.url, /\/contents\/content\/practice\/quizzes\/new-quiz\.json$/);
  const sent = JSON.parse(put.body);
  assert.equal('sha' in sent, false, 'a new file has none');
  assert.equal(JSON.parse(Buffer.from(sent.content, 'base64').toString()).title, 'A new quiz');
  assert.match(Buffer.from(sent.content, 'base64').toString(), /^\{\n {2}"title"/, 'written in one layout');

  assert.equal((await asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: 'learn/01-linux/README.md', content: '# x', create: true }) })).status, 400, 'a lesson still needs its sha');
});

test('a quiz about a lesson that does not exist is not committed', async () => {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
    return String(url).includes('/contents/content/backend/') ? new Response('{}', { status: 404 }) : Response.json({ sha: 's', commit: { sha: 'c' } });
  };
  const res = await asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: QUIZ_FILE, content: JSON.stringify(goodQuiz()), create: true }) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).problems[0], /is not a lesson/);
});

test('only an admin can check or commit a practice file', async () => {
  const env = createEnv({ GITHUB_PAT: 'test-token' });
  const reader = await signedInAs('reader@example.com');
  for (const [method, path] of [['POST', '/api/manage/content/check'], ['PUT', '/api/manage/content']]) {
    const res = await app.request(path, { method, headers: { cookie: reader, 'content-type': 'application/json' }, body: JSON.stringify({ path: QUIZ_FILE, content: '{}', create: true }) }, env);
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  assert.equal(calls.length, 0);
});
