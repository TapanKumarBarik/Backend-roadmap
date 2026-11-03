// The admin editors for the learning paths, the videos and the SEO overrides commit three files of the repository with the site's GitHub
// token. Only those three; each is checked first (the same rules as `npm run check`), against the module list of the deployed site, which
// is read from the site's own address because this Function cannot read the repository. GitHub and that list are mocked here.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { repoPathFor } from '../routes/content.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';
import { TREE } from '../../webapp/src/lib/siteContent/fixtures.js';

const realFetch = globalThis.fetch;
let calls;
let github; // how the mocked GitHub answers: the file it holds, and whether a commit is refused
let index; // how the site's module list answers

const PATHS = {
  _about: 'Notes.',
  paths: [{
    id: 'http-basics', title: 'HTTP basics', topic: 'Backend', difficulty: 'beginner', goal: 'Learn HTTP.', audience: 'Beginners.',
    prerequisites: ['Programming'], skills: ['HTTP'], steps: ['backend/01-http'], next: 'lld-start'
  }, {
    id: 'lld-start', title: 'Low-level design', topic: 'LLD', difficulty: 'intermediate', goal: 'Design classes.', audience: 'Developers.',
    prerequisites: ['A language'], skills: ['OOP'], steps: ['lld']
  }]
};
const PLAYLIST = { id: 'phase-1', title: 'Phase 1', url: 'https://www.youtube.com/playlist?list=PLdZs-f1PXX48' };
const VIDEOS = {
  playlists: [PLAYLIST],
  videos: [{ id: 'aNVDz45U-cM', title: 'What Is HTTP?', playlist: 'phase-1', number: 1, published: '2026-10-28T06:20:22Z', module: 'backend/01-http/01-requests' }]
};
const KEY = 'backend/01-http/02-caching/README.md';
const SEO = { [KEY]: { title: 'HTTP caching explained', description: 'How HTTP caching decides what a browser may reuse, with the headers that control it and the mistakes to avoid.' } };

beforeEach(() => {
  calls = [];
  github = { content: JSON.stringify(PATHS), sha: 'sha-1', commit: 'accepted' };
  index = { status: 200, body: { tree: TREE } };
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    calls.push({ url: address, method: init.method || 'GET', body: init.body });
    if (address.endsWith('/docs-index.json')) {
      if (index.fail) throw new Error('network down');
      return Response.json(index.body, { status: index.status });
    }
    if ((init.method || 'GET') === 'PUT') {
      if (github.commit === 'conflict') return new Response('{"message":"sha does not match"}', { status: 409 });
      return Response.json({ content: { sha: 'sha-2' }, commit: { sha: 'commit-1' } });
    }
    if (github.missing) return new Response('{"message":"Not Found"}', { status: 404 });
    return Response.json({ content: Buffer.from(github.content).toString('base64'), sha: github.sha });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

async function asOwner(path, init = {}) {
  const env = createEnv({ GITHUB_PAT: 'test-token' });
  return app.request(path, { ...init, headers: { cookie: await signedInAs(OWNER_EMAIL), 'content-type': 'application/json' } }, env);
}
const check = async (path, value) => (await (await asOwner('/api/manage/content/check', { method: 'POST', body: JSON.stringify({ path, content: typeof value === 'string' ? value : JSON.stringify(value) }) })).json()).problems;
const put = (path, value, extra = {}) => asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path, content: JSON.stringify(value), ...extra }) });
const commits = () => calls.filter((call) => call.method === 'PUT');

// ------------------------------------------------------------------------------------------------------ the allow-list

test('exactly the three site files map into the content folder, and nothing that looks like one does', () => {
  assert.equal(repoPathFor('paths.json'), 'content/paths.json');
  assert.equal(repoPathFor('videos.json'), 'content/videos.json');
  assert.equal(repoPathFor('seo.json'), 'content/seo.json');
  const refused = [
    'package.json', 'site.config.json', 'paths.json.bak', 'Paths.json', 'paths.JSON', ' paths.json', 'paths.json ', 'paths.json/', '/paths.json',
    'content/paths.json', '../paths.json', 'a/../paths.json', 'practice/paths.json', 'seo.json/../../package.json', 'videos.json?x=1', 'seo'
  ];
  for (const path of refused) assert.equal(repoPathFor(path), null, JSON.stringify(path));
});

test('a file that is not a lesson, a practice file or one of the three is refused before GitHub is contacted', async () => {
  for (const path of ['package.json', '.github/workflows/cloudflare-pages.yml', 'site.config.json', 'paths.json.bak', 'api/routes/admin.js']) {
    assert.equal((await asOwner(`/api/manage/content?path=${encodeURIComponent(path)}`)).status, 400, `read ${path}`);
    assert.equal((await put(path, {}, { sha: 'x' })).status, 400, `write ${path}`);
    assert.equal((await put(path, {}, { create: true })).status, 400, `create ${path}`);
    assert.equal((await asOwner('/api/manage/content/check', { method: 'POST', body: JSON.stringify({ path, content: '{}' }) })).status, 400, `check ${path}`);
  }
  assert.equal(calls.length, 0, 'GitHub and the module list were never called');
});

test('only an admin can read, check or commit a site file', async () => {
  const env = createEnv({ GITHUB_PAT: 'test-token' });
  const reader = await signedInAs('reader@example.com');
  const request = (path, init = {}) => app.request(path, { ...init, headers: { cookie: reader, 'content-type': 'application/json' } }, env);
  assert.equal((await request('/api/manage/content?path=paths.json')).status, 403);
  for (const name of ['paths.json', 'videos.json', 'seo.json']) {
    assert.equal((await request('/api/manage/content/check', { method: 'POST', body: JSON.stringify({ path: name, content: '{}' }) })).status, 403, `check ${name}`);
    assert.equal((await request('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: name, content: '{}', sha: 'x', create: true }) })).status, 403, `commit ${name}`);
  }
  const anonymous = await app.request('/api/manage/content?path=paths.json', {}, env);
  assert.equal(anonymous.status, 401);
  assert.equal(calls.length, 0);
});

// ------------------------------------------------------------------------------------------------------------ reading

test('a site file is read from the content folder with its sha', async () => {
  const res = await asOwner('/api/manage/content?path=paths.json');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sha, 'sha-1');
  assert.deepEqual(JSON.parse(body.content), PATHS);
  assert.match(calls[0].url, /\/contents\/content\/paths\.json\?ref=main$/);
});

test('a file that is not in the repository yet answers 404, which the editor reads as "nothing yet"', async () => {
  github.missing = true;
  assert.equal((await asOwner('/api/manage/content?path=seo.json')).status, 404);
});

// ------------------------------------------------------------------------------------------------------------ checking

test('the module list is read from the site\'s own address, and nothing is committed by a check', async () => {
  assert.deepEqual(await check('paths.json', PATHS), []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost/docs-index.json');
  assert.equal(commits().length, 0);
});

test('the learning paths are checked: the shape, and that every step is a folder of the deployed site', async () => {
  const broken = structuredClone(PATHS);
  broken.paths[0].difficulty = 'hard';
  broken.paths[0].steps = ['backend/01-http', 'backend/09-missing', 'backend/02-planned-only'];
  broken.paths[1].next = 'nowhere';
  const problems = (await check('paths.json', broken)).join('\n');
  assert.match(problems, /"difficulty" must be beginner, intermediate or advanced/);
  assert.match(problems, /next "nowhere" is not another path/);
  const stepProblems = (await check('paths.json', { paths: [{ ...PATHS.paths[0], next: undefined, steps: ['backend/09-missing', 'backend/02-planned-only', 'elsewhere/x'] }] })).join('\n');
  assert.match(stepProblems, /step "backend\/09-missing" is not a folder/);
  assert.match(stepProblems, /step "backend\/02-planned-only" has only planned modules/);
  assert.match(stepProblems, /step "elsewhere\/x" is not inside a curriculum \(backend, /);
});

test('the videos are checked: each module must exist on the deployed site', async () => {
  assert.deepEqual(await check('videos.json', VIDEOS), []);
  const lost = structuredClone(VIDEOS);
  lost.videos[0].module = 'backend/01-http/09-gone';
  lost.videos.push({ ...lost.videos[0], module: undefined, id: 'ccccccccccc', number: 1 }); // the same number twice
  const problems = (await check('videos.json', lost)).join('\n');
  assert.match(problems, /there is no module at content\/backend\/01-http\/09-gone\/README\.md/);
  assert.match(problems, /number 1 is already used in playlist "phase-1"/);
});

test('the SEO overrides are checked: real module files, limits, no unknown field', async () => {
  assert.deepEqual(await check('seo.json', SEO), []);
  assert.deepEqual(await check('seo.json', {}), []);
  const problems = (await check('seo.json', {
    'backend/01-http/09-gone/README.md': { title: 'x' },
    [KEY]: { title: 'x'.repeat(71), description: 'short', robots: 'noindex' }
  })).join('\n');
  assert.match(problems, /"backend\/01-http\/09-gone\/README\.md" is not a module of the site/);
  assert.match(problems, /the title is 71 characters/);
  assert.match(problems, /the description is 5 characters; it needs 50 to 160/);
  assert.match(problems, /unknown field "robots"/);
});

test('text that is not JSON is a problem, not a crash', async () => {
  assert.match((await check('paths.json', '{ nope'))[0], /not valid JSON/);
});

test('when the module list cannot be read nothing is checked as good, and nothing is committed', async () => {
  for (const broken of [{ status: 503, body: {} }, { status: 200, body: { nothing: true } }, { fail: true }]) {
    index = broken;
    const problems = await check('paths.json', PATHS);
    assert.match(problems.join(), /module list \(\/docs-index\.json\) could not be read/);
    const res = await put('paths.json', PATHS, { sha: 'sha-1' });
    assert.equal(res.status, 400);
    assert.equal(commits().length, 0);
  }
});

// ------------------------------------------------------------------------------------------------------------ committing

test('a good paths file is committed to its own place, in one layout, with the sha it was read at', async () => {
  const res = await put('paths.json', PATHS, { sha: 'sha-1' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { path: 'paths.json', sha: 'sha-2', commit: 'commit-1' });
  const [commit] = commits();
  assert.match(commit.url, /\/contents\/content\/paths\.json$/);
  const sent = JSON.parse(commit.body);
  assert.equal(sent.sha, 'sha-1');
  assert.equal(sent.branch, 'main');
  const text = Buffer.from(sent.content, 'base64').toString();
  assert.equal(text, `${JSON.stringify(PATHS, null, 2)}\n`);
});

test('a file with problems is not committed, and the problems are named', async () => {
  const bad = structuredClone(PATHS);
  bad.paths[0].steps = ['backend/09-missing'];
  const res = await put('paths.json', bad, { sha: 'sha-1' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.problems.join(), /step "backend\/09-missing" is not a folder/);
  assert.equal(commits().length, 0, 'nothing reached the repository');
});

test('the videos are committed in playlist order, and a video with no module is allowed', async () => {
  const second = { ...VIDEOS.videos[0], id: 'ccccccccccc', number: 2, module: undefined };
  const earlier = { ...VIDEOS.videos[0], id: 'bbbbbbbbbbb', number: 1 };
  const res = await put('videos.json', { playlists: [PLAYLIST], videos: [second, { ...earlier, number: 3 }] }, { sha: 'sha-1' });
  assert.equal(res.status, 200);
  const saved = JSON.parse(Buffer.from(JSON.parse(commits()[0].body).content, 'base64').toString());
  assert.deepEqual(saved.videos.map((v) => v.number), [2, 3]);
  assert.equal('module' in saved.videos[0], false);
});

test('a module the deployed site does not have cannot be given to a video', async () => {
  const res = await put('videos.json', { playlists: [PLAYLIST], videos: [{ ...VIDEOS.videos[0], module: 'backend/01-http/09-gone' }] }, { sha: 'sha-1' });
  assert.equal(res.status, 400);
  assert.equal(commits().length, 0);
});

test('seo.json is optional: it is created without a sha, the modules sorted, and an existing file still needs its sha', async () => {
  const other = 'backend/01-http/01-requests/README.md';
  const res = await put('seo.json', { [KEY]: SEO[KEY], [other]: { title: 'Requests, in detail' } }, { create: true });
  assert.equal(res.status, 200);
  const sent = JSON.parse(commits()[0].body);
  assert.equal('sha' in sent, false);
  const text = Buffer.from(sent.content, 'base64').toString();
  assert.ok(text.indexOf(other) < text.indexOf(KEY), 'in alphabetical order');
  assert.equal((await put('seo.json', SEO, {})).status, 400, 'neither a sha nor create');
  assert.equal((await put('seo.json', { 'backend/x/README.md': { title: 'x' } }, { create: true })).status, 400, 'a key that is not a module');
  assert.equal(commits().length, 1);
});

test('a lesson still needs its sha, whatever create says', async () => {
  const res = await asOwner('/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: 'learn/01-linux/README.md', content: '# x', create: true }) });
  assert.equal(res.status, 400);
});

test('when the file changed since it was read the commit is refused with 409 and a message that says so', async () => {
  github.commit = 'conflict';
  const res = await put('videos.json', VIDEOS, { sha: 'old-sha' });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /changed in the repository since you opened it/);
});
