// The private, per-user surface: bookmarks, notes and progress. What matters most is that one reader never sees or
// changes another reader's data, and that deleting an account really deletes it.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
let grace;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com');
  grace = await signedInAs('grace@example.com');
});

const MODULE = 'backend/01-intro/01-first/README.md';
const call = (cookie, method, path, body) => app.request(`/api${path}`, {
  method,
  headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined
}, env);

test('a bookmark is saved, listed, and removed, for its owner only', async () => {
  assert.equal((await call(ada, 'PUT', `/bookmarks/${MODULE}`)).status, 204);
  assert.deepEqual(await (await call(ada, 'GET', '/bookmarks')).json(), [MODULE]);
  assert.deepEqual(await (await call(grace, 'GET', '/bookmarks')).json(), [], 'another reader sees none of it');

  assert.equal((await call(grace, 'DELETE', `/bookmarks/${MODULE}`)).status, 204);
  assert.deepEqual(await (await call(ada, 'GET', '/bookmarks')).json(), [MODULE], 'and cannot remove it');

  await call(ada, 'DELETE', `/bookmarks/${MODULE}`);
  assert.deepEqual(await (await call(ada, 'GET', '/bookmarks')).json(), []);
});

test('saving a bookmark twice keeps one', async () => {
  await call(ada, 'PUT', `/bookmarks/${MODULE}`);
  await call(ada, 'PUT', `/bookmarks/${MODULE}`);
  assert.equal((await (await call(ada, 'GET', '/bookmarks')).json()).length, 1);
});

test('a note is private, can be changed, and is deleted by saving it empty', async () => {
  await call(ada, 'PUT', `/notes/${MODULE}`, { text: 'remember the idempotency key' });
  assert.equal((await (await call(ada, 'GET', `/notes/${MODULE}`)).json()).text, 'remember the idempotency key');
  assert.equal((await (await call(grace, 'GET', `/notes/${MODULE}`)).json()).text, '', 'not visible to another reader');

  await call(ada, 'PUT', `/notes/${MODULE}`, { text: 'changed' });
  assert.equal((await (await call(ada, 'GET', '/notes')).json()).length, 1, 'still one note for the module');

  await call(ada, 'PUT', `/notes/${MODULE}`, { text: '   ' });
  assert.deepEqual(await (await call(ada, 'GET', '/notes')).json(), []);
});

test('a note is cut to its maximum length rather than refused', async () => {
  await call(ada, 'PUT', `/notes/${MODULE}`, { text: 'x'.repeat(20000) });
  assert.equal((await (await call(ada, 'GET', `/notes/${MODULE}`)).json()).text.length, 10000);
});

test('progress accepts the three statuses and refuses anything else', async () => {
  for (const status of ['todo', 'wip', 'done']) {
    assert.equal((await call(ada, 'PUT', `/progress/${MODULE}`, { status })).status, 204, status);
  }
  assert.equal((await call(ada, 'PUT', `/progress/${MODULE}`, { status: 'finished' })).status, 400);
  assert.equal((await call(ada, 'PUT', `/progress/${MODULE}`, {})).status, 400);

  await call(ada, 'PUT', `/progress/${MODULE}`, { status: 'done' });
  assert.deepEqual(await (await call(ada, 'GET', '/progress')).json(), { [MODULE]: 'done' });
  assert.deepEqual(await (await call(grace, 'GET', '/progress')).json(), {}, 'progress is per reader');
});

test('resetting progress clears the reader\'s own and nobody else\'s', async () => {
  await call(ada, 'PUT', `/progress/${MODULE}`, { status: 'done' });
  await call(grace, 'PUT', `/progress/${MODULE}`, { status: 'done' });
  assert.equal((await call(ada, 'POST', '/progress/reset')).status, 204);
  assert.deepEqual(await (await call(ada, 'GET', '/progress')).json(), {});
  assert.deepEqual(await (await call(grace, 'GET', '/progress')).json(), { [MODULE]: 'done' });
});

test('deleting an account removes that reader\'s data and leaves everyone else\'s', async () => {
  for (const cookie of [ada, grace]) {
    await call(cookie, 'PUT', `/bookmarks/${MODULE}`);
    await call(cookie, 'PUT', `/notes/${MODULE}`, { text: 'mine' });
    await call(cookie, 'PUT', `/progress/${MODULE}`, { status: 'done' });
  }

  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);

  const left = async (cookie) => ({
    bookmarks: (await (await call(cookie, 'GET', '/bookmarks')).json()).length,
    notes: (await (await call(cookie, 'GET', '/notes')).json()).length,
    progress: Object.keys(await (await call(cookie, 'GET', '/progress')).json()).length
  });
  assert.deepEqual(await left(ada), { bookmarks: 0, notes: 0, progress: 0 });
  assert.deepEqual(await left(grace), { bookmarks: 1, notes: 1, progress: 1 });
});
