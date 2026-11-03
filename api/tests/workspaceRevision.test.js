// Revision lists in the private workspace: adding a lesson (from a list or from a lesson page), "revised today", removing it, and
// that all of it is the owner's alone.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { LIMITS } from '../../webapp/src/lib/workspace/kinds.js';
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
let grace;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com');
  grace = await signedInAs('grace@example.com');
});

const call = (cookie, method, path, body) => app.request(`/api${path}`, {
  method,
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined
}, env);
const json = async (res) => res.json();
const raw = (sql, ...params) => env.DB.raw.prepare(sql).all(...params).map((row) => ({ ...row }));

const LESSON = { path: 'backend/03-auth/01-sessions/README.md', title: 'Sessions and cookies' };

async function newList(cookie, title = 'Revise') {
  const res = await call(cookie, 'POST', '/workspace/pages', { kind: 'revision', title });
  assert.equal(res.status, 201);
  return (await json(res)).id;
}

test('every revision route answers a visitor who has not signed in with 401', async () => {
  for (const [method, path, body] of [
    ['GET', '/workspace/pages/x/revision'], ['POST', '/workspace/pages/x/revision', LESSON], ['POST', '/workspace/revision', LESSON],
    ['POST', '/workspace/revision-items/x/revised', {}], ['DELETE', '/workspace/revision-items/x']
  ]) {
    assert.equal((await call(null, method, path, body)).status, 401, `${method} ${path}`);
  }
});

test('a lesson is added to a list once, with its title, and comes back with the list', async () => {
  const list = await newList(ada);
  const first = await call(ada, 'POST', `/workspace/pages/${list}/revision`, LESSON);
  assert.equal(first.status, 201);
  const { item, added } = await json(first);
  assert.equal(added, true);
  assert.deepEqual({ ...item, id: undefined, addedAt: undefined }, { id: undefined, pageId: list, path: LESSON.path, title: LESSON.title, addedAt: undefined, lastRevisedAt: null, revisedCount: 0 });

  const again = await call(ada, 'POST', `/workspace/pages/${list}/revision`, LESSON);
  assert.equal(again.status, 200, 'adding it again is not an error');
  assert.equal((await json(again)).added, false);

  const items = await json(await call(ada, 'GET', `/workspace/pages/${list}/revision`));
  assert.deepEqual(items.map((i) => i.path), [LESSON.path]);
});

test('a lesson needs a usable path, and a missing title falls back to the path', async () => {
  const list = await newList(ada);
  for (const body of [{}, { path: '' }, { path: 5 }, { path: 'x'.repeat(LIMITS.lessonPathMax + 1) }, { path: 'a\u0000b' }]) {
    assert.equal((await call(ada, 'POST', `/workspace/pages/${list}/revision`, body)).status, 400, JSON.stringify(body).slice(0, 40));
  }
  const res = await call(ada, 'POST', `/workspace/pages/${list}/revision`, { path: 'a/README.md' });
  assert.equal((await json(res)).item.title, 'a/README.md');
  const long = await call(ada, 'POST', `/workspace/pages/${list}/revision`, { path: 'b/README.md', title: 't'.repeat(LIMITS.itemTitleMax + 40) });
  assert.equal((await json(long)).item.title.length, LIMITS.itemTitleMax);
});

test('a list holds only so many lessons', async () => {
  const list = await newList(ada);
  const insert = env.DB.raw.prepare('INSERT INTO revision_items (id, user_id, page_id, path, title, added_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < LIMITS.revisionItemsMax; i++) insert.run(`r${i}`, 'user-ada@example.com', list, `p${i}/README.md`, 't', new Date().toISOString());
  assert.equal((await call(ada, 'POST', `/workspace/pages/${list}/revision`, LESSON)).status, 400);
  const other = await newList(ada, 'Another list');
  assert.equal((await call(ada, 'POST', `/workspace/pages/${other}/revision`, LESSON)).status, 201, 'the limit is per list');
});

test('only a revision list takes lessons: a text page, a folder or a missing page is "not found"', async () => {
  const page = (await json(await call(ada, 'POST', '/workspace/pages', { title: 'Notes' }))).id;
  const folder = (await json(await call(ada, 'POST', '/workspace/pages', { title: 'F', kind: 'folder' }))).id;
  for (const id of [page, folder, 'missing']) {
    assert.equal((await call(ada, 'GET', `/workspace/pages/${id}/revision`)).status, 404);
    assert.equal((await call(ada, 'POST', `/workspace/pages/${id}/revision`, LESSON)).status, 404);
  }
  assert.equal(raw('SELECT COUNT(*) AS n FROM revision_items')[0].n, 0);
});

test('"revised today" records the day and counts once a day, however often it is pressed', async () => {
  const list = await newList(ada);
  const { item } = await json(await call(ada, 'POST', `/workspace/pages/${list}/revision`, LESSON));

  const first = await json(await call(ada, 'POST', `/workspace/revision-items/${item.id}/revised`, {}));
  assert.equal(first.revisedCount, 1);
  assert.match(first.lastRevisedAt, /^\d{4}-\d\d-\d\dT/);
  const second = await json(await call(ada, 'POST', `/workspace/revision-items/${item.id}/revised`, {}));
  assert.equal(second.revisedCount, 1, 'a second press on the same day changes nothing');

  // revised on an earlier day: pressing it now counts again
  env.DB.raw.prepare('UPDATE revision_items SET last_revised_at = ? WHERE id = ?').run('2020-01-01T10:00:00.000Z', item.id);
  assert.equal((await json(await call(ada, 'POST', `/workspace/revision-items/${item.id}/revised`, {}))).revisedCount, 2);
});

test('a lesson can be taken off the list', async () => {
  const list = await newList(ada);
  const { item } = await json(await call(ada, 'POST', `/workspace/pages/${list}/revision`, LESSON));
  assert.equal((await call(ada, 'DELETE', `/workspace/revision-items/${item.id}`)).status, 204);
  assert.deepEqual(await json(await call(ada, 'GET', `/workspace/pages/${list}/revision`)), []);
  assert.equal((await call(ada, 'DELETE', `/workspace/revision-items/${item.id}`)).status, 404);
});

test('another account\'s list and lessons are "not found" and stay as they were', async () => {
  const list = await newList(ada);
  const { item } = await json(await call(ada, 'POST', `/workspace/pages/${list}/revision`, LESSON));

  assert.equal((await call(grace, 'GET', `/workspace/pages/${list}/revision`)).status, 404);
  assert.equal((await call(grace, 'POST', `/workspace/pages/${list}/revision`, { path: 'x/README.md', title: 'X' })).status, 404);
  assert.equal((await call(grace, 'POST', `/workspace/revision-items/${item.id}/revised`, {})).status, 404);
  assert.equal((await call(grace, 'DELETE', `/workspace/revision-items/${item.id}`)).status, 404);
  assert.deepEqual(raw('SELECT path, revised_count FROM revision_items'), [{ path: LESSON.path, revised_count: 0 }]);
});

test('from a lesson page, the lesson goes on the first list, which is made if there is none', async () => {
  const first = await call(ada, 'POST', '/workspace/revision', LESSON);
  assert.equal(first.status, 201);
  const made = await json(first);
  assert.equal(made.added, true);
  assert.equal(made.listCreated, true);
  const lists = raw("SELECT p.id, p.title FROM workspace_pages p JOIN workspace_meta m ON m.page_id = p.id WHERE m.kind = 'revision'");
  assert.deepEqual(lists, [{ id: made.item.pageId, title: 'Revision list' }]);

  const second = await json(await call(ada, 'POST', '/workspace/revision', { path: 'other/README.md', title: 'Other' }));
  assert.equal(second.listCreated, false, 'the list is made once');
  assert.equal(second.item.pageId, made.item.pageId);

  const repeat = await call(ada, 'POST', '/workspace/revision', LESSON);
  assert.equal(repeat.status, 200);
  assert.equal((await json(repeat)).added, false);
  assert.equal(raw('SELECT COUNT(*) AS n FROM revision_items')[0].n, 2);
});

test('from a lesson page, a person with an older list of their own adds to that one, and never to anyone else\'s', async () => {
  const hers = await newList(grace, 'Hers');
  const mine = await newList(ada, 'Mine');
  const res = await json(await call(ada, 'POST', '/workspace/revision', LESSON));
  assert.equal(res.item.pageId, mine);
  assert.equal(res.listCreated, false);
  assert.equal(raw('SELECT COUNT(*) AS n FROM revision_items WHERE page_id = ?', hers)[0].n, 0);
});

test('from a lesson page, a lesson without a path is refused and makes no list', async () => {
  assert.equal((await call(ada, 'POST', '/workspace/revision', {})).status, 400);
  assert.equal((await call(ada, 'POST', '/workspace/revision', { path: 5 })).status, 400);
  assert.equal(raw('SELECT COUNT(*) AS n FROM workspace_pages')[0].n, 0);
});
