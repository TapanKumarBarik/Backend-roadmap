// The admin's staged changes: a lesson edit waits on a staging branch, is listed with its diff, and is published together with the others as one
// merge into main (which is what starts the deploy). GitHub is a stand-in that keeps state (githubFake.js), so each test runs the real routes
// against branches, files and conflicts, and looks at what main and the staging branch hold afterwards.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';
import { createGithubFake } from './githubFake.js';

const A = 'learn/01-linux/README.md';
const B = 'learn/02-docker/README.md';
const repo = (path) => `content/${path}`;

let github;
let restore;
let env;
beforeEach(() => {
  github = createGithubFake({ files: { [repo(A)]: '# Linux\n\nOld text.\n', [repo(B)]: '# Docker\n\nOld text.\n' } });
  restore = github.install();
  env = createEnv({ GITHUB_PAT: 'test-token' });
});
afterEach(() => restore());

async function as(email, path, init = {}) {
  const cookie = email ? await signedInAs(email) : '';
  return app.request(path, { ...init, headers: { cookie, 'content-type': 'application/json' } }, env);
}
const owner = (path, body, method = 'POST') => as(OWNER_EMAIL, path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const shaOf = (branch, path) => github.branches.get(branch).files.get(repo(path)).sha;
const textOn = (branch, path) => github.branches.get(branch).files.get(repo(path)).text;

/** Saves `text` as a staged edit of `path`, on the version main (or the staging branch) has now. */
async function stage(path, text, branch = 'main') {
  return owner('/api/manage/content', { path, content: text, sha: shaOf(branch, path), stage: true }, 'PUT');
}

test('saving with `stage` commits to the staging branch and leaves main as it was', async () => {
  const res = await stage(A, '# Linux\n\nNew text.\n');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).staged, true);
  assert.equal(textOn('main', A), '# Linux\n\nOld text.\n', 'main is untouched');
  assert.equal(textOn('admin-edits', A), '# Linux\n\nNew text.\n');
  assert.deepEqual(github.calls.filter((c) => c.method === 'PUT').map((c) => c.body.branch), ['admin-edits'], 'the commit went to the staging branch only');
  assert.equal(github.runs.length, 0, 'and nothing is deployed');
});

test('the staged version is what the editor reads for that lesson; every other read is main’s', async () => {
  await stage(A, '# Linux\n\nNew text.\n');
  const staged = await (await owner(`/api/manage/content?path=${A}&staged=1`, undefined, 'GET')).json();
  assert.deepEqual({ content: staged.content, staged: staged.staged }, { content: '# Linux\n\nNew text.\n', staged: true });
  assert.equal(staged.sha, shaOf('admin-edits', A));
  const other = await (await owner(`/api/manage/content?path=${B}&staged=1`, undefined, 'GET')).json();
  assert.deepEqual({ content: other.content, staged: other.staged }, { content: '# Docker\n\nOld text.\n', staged: false });
  const plain = await (await owner(`/api/manage/content?path=${A}`, undefined, 'GET')).json();
  assert.equal(plain.content, '# Linux\n\nOld text.\n', 'a read without `staged` is main’s, and says nothing about staging');
  assert.equal('staged' in plain, false);
});

test('the changes list names each staged lesson with its diff, and the latest deploy', async () => {
  await stage(A, '# Linux\n\nNew text.\n');
  await stage(B, '# Docker\n\nOther new text.\n');
  const list = await (await owner('/api/manage/changes', undefined, 'GET')).json();
  assert.equal(list.branch, 'admin-edits');
  assert.deepEqual(list.staged.map((f) => f.path).sort(), [A, B]);
  const a = list.staged.find((f) => f.path === A);
  assert.equal(a.status, 'modified');
  assert.equal(a.additions, 1);
  assert.equal(a.deletions, 1);
  assert.match(a.patch, /\+New text\./);
  assert.match(a.patch, /-Old text\./);
  assert.equal(list.deploy, null, 'no deploy has run');
});

test('a second edit to a staged lesson is made on the staged version, and is still one change', async () => {
  await stage(A, '# Linux\n\nFirst.\n');
  const second = await stage(A, '# Linux\n\nSecond.\n', 'admin-edits');
  assert.equal(second.status, 200);
  const list = await (await owner('/api/manage/changes', undefined, 'GET')).json();
  assert.equal(list.staged.length, 1);
  assert.equal(textOn('admin-edits', A), '# Linux\n\nSecond.\n');
});

test('a new edit is made on top of what main has gained since the staging branch was made', async () => {
  await stage(A, '# Linux\n\nStaged.\n');
  github.main.files.set(repo(B), { text: '# Docker\n\nChanged on main by someone else.\n', sha: 'blob-from-main' }); // a push to main meanwhile
  const res = await stage(B, '# Docker\n\nMy edit on top.\n'); // read from main, so on main's sha
  assert.equal(res.status, 200);
  assert.equal(textOn('admin-edits', B), '# Docker\n\nMy edit on top.\n');
  assert.equal(textOn('admin-edits', A), '# Linux\n\nStaged.\n', 'and the earlier staged edit is still there');
});

test('a lesson the build would reject is refused, staged or not, and the reasons are named', async () => {
  const noTitle = await stage(A, 'No title here.\n');
  assert.equal(noTitle.status, 400);
  const body = await noTitle.json();
  assert.match(body.error, /problems/);
  assert.match(body.problems.join(' '), /first line must be the title/);
  assert.equal(github.branches.has('admin-edits'), false, 'nothing was staged');
  const direct = await owner('/api/manage/content', { path: A, content: '', sha: shaOf('main', A) }, 'PUT');
  assert.equal(direct.status, 400);
  assert.match((await direct.json()).problems.join(' '), /empty/);
  assert.equal(github.calls.filter((c) => c.method === 'PUT').length, 0, 'no commit was made');
});

test('only a lesson can be staged', async () => {
  const res = await owner('/api/manage/content', { path: 'practice/quizzes/http-caching.json', content: '{}', sha: 'x', stage: true }, 'PUT');
  assert.equal(res.status, 400);
  assert.equal(github.branches.has('admin-edits'), false);
});

test('publishing merges everything staged into main once, starts the deploy, clears the staging branch and is logged', async () => {
  await stage(A, '# Linux\n\nNew text.\n');
  await stage(B, '# Docker\n\nNew docker.\n');
  const res = await owner('/api/manage/changes/publish');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).published, 2);
  assert.equal(textOn('main', A), '# Linux\n\nNew text.\n');
  assert.equal(textOn('main', B), '# Docker\n\nNew docker.\n');
  assert.equal(github.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/merges') && c.body.base === 'main').length, 1, 'one merge, so one deploy');
  assert.equal(github.runs.length, 1, 'the push started a deploy');
  assert.equal(github.branches.has('admin-edits'), false);
  const logged = env.DB.raw.prepare("SELECT actor, action, target FROM audit_log WHERE action = 'changes published'").all();
  assert.equal(logged.length, 1);
  assert.equal(logged[0].target, '2 lessons');
  const after = await (await owner('/api/manage/changes', undefined, 'GET')).json();
  assert.deepEqual(after.staged, []);
  assert.equal(after.deploy.status, 'queued', 'and the list shows the deploy that is starting');
  github.finishDeploy('success');
  assert.equal((await (await owner('/api/manage/changes', undefined, 'GET')).json()).deploy.conclusion, 'success');
});

test('publishing with nothing staged says so', async () => {
  const res = await owner('/api/manage/changes/publish');
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /nothing staged/);
});

test('a staged lesson that was changed outside the editor into a bad one stops the publish, and main is untouched', async () => {
  await stage(A, '# Linux\n\nFine.\n');
  github.branches.get('admin-edits').files.set(repo(A), { text: 'broken, no title\n', sha: 'blob-bad' }); // someone committed to the branch by hand
  const res = await owner('/api/manage/changes/publish');
  assert.equal(res.status, 400);
  assert.match((await res.json()).problems.join(' '), /first line must be the title/);
  assert.equal(textOn('main', A), '# Linux\n\nOld text.\n');
  assert.equal(github.runs.length, 0);
});

test('if main changed the same lesson after it was staged, the publish says so and changes nothing', async () => {
  await stage(A, '# Linux\n\nMy edit.\n');
  github.main.files.set(repo(A), { text: '# Linux\n\nSomeone else, on main.\n', sha: 'blob-from-main' });
  const res = await owner('/api/manage/changes/publish');
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /changed in the same place/);
  assert.equal(textOn('main', A), '# Linux\n\nSomeone else, on main.\n');
  assert.equal(github.branches.has('admin-edits'), true, 'the staged edit is kept, to discard or redo');
  assert.equal(github.runs.length, 0);
});

test('one staged edit can be discarded, and the lesson goes back to main’s; the others stay', async () => {
  await stage(A, '# Linux\n\nA.\n');
  await stage(B, '# Docker\n\nB.\n');
  const res = await owner('/api/manage/changes/discard', { path: A });
  assert.equal(res.status, 200);
  const list = await (await owner('/api/manage/changes', undefined, 'GET')).json();
  assert.deepEqual(list.staged.map((f) => f.path), [B]);
  assert.equal(textOn('main', A), '# Linux\n\nOld text.\n', 'main was never touched');
  const missing = await owner('/api/manage/changes/discard', { path: A });
  assert.equal(missing.status, 404, 'there is no staged edit left to discard');
  const notALesson = await owner('/api/manage/changes/discard', { path: 'practice/quizzes/http-caching.json' });
  assert.equal(notALesson.status, 400);
});

test('discarding all deletes the staging branch, and a branch that is not there is not an error', async () => {
  await stage(A, '# Linux\n\nA.\n');
  assert.equal((await owner('/api/manage/changes/discard', {})).status, 200);
  assert.equal(github.branches.has('admin-edits'), false);
  assert.equal((await owner('/api/manage/changes/discard', {})).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'staged changes discarded'").get().n, 2);
});

test('a deploy can be started by hand, and a token that may not run workflows is told so in words', async () => {
  const ok = await owner('/api/manage/deploy');
  assert.equal(ok.status, 200);
  assert.equal(github.runs.length, 1);
  assert.equal(github.runs[0].event, 'workflow_dispatch');
  restore();
  github = createGithubFake({ files: {}, dispatchStatus: 403 });
  restore = github.install();
  const refused = await owner('/api/manage/deploy');
  assert.equal(refused.status, 502, 'GitHub’s 403 is the site’s token, not the admin’s session');
  assert.match((await refused.json()).error, /Actions: read and write/);
});

test('every one of these is for an admin only, and GitHub is not contacted for anyone else', async () => {
  const requests = [['/api/manage/changes', 'GET'], ['/api/manage/changes/publish', 'POST'], ['/api/manage/changes/discard', 'POST'], ['/api/manage/deploy', 'POST']];
  for (const [path, method] of requests) {
    assert.equal((await as(null, path, { method })).status, 401, `${method} ${path}, signed out`);
    assert.equal((await as('reader@example.com', path, { method })).status, 403, `${method} ${path}, a reader`);
  }
  const stagedByReader = await as('reader@example.com', '/api/manage/content', { method: 'PUT', body: JSON.stringify({ path: A, content: '# x\n', sha: 'x', stage: true }) });
  assert.equal(stagedByReader.status, 403);
  assert.equal(github.calls.length, 0, 'GitHub was never asked');
});
