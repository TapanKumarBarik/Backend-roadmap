// A reader's own state kept for them (routes/state.js, migration 0009), end to end on the real app and an in-memory database: it is private to the reader, only the names
// the config lists are kept, a write that is based on an old copy is refused with what is there now, a copy too large is refused, and it goes when the reader stops syncing
// or deletes the account.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { SYNC } from '../../webapp/src/config/sync.js';
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
let grace;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com', { name: 'Ada Lovelace' });
  grace = await signedInAs('grace@example.com', { name: 'Grace Hopper' });
});

async function call(cookie, method, path, body) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, env);
  const raw = await res.text();
  return { status: res.status, json: raw ? JSON.parse(raw) : null };
}

const COPY = { version: 1, items: { 'SD-U-001': { s: 'd', c: 4, d: '2026-11-17', u: 1000 } } };

test('nothing is kept for anyone who is not signed in, and a reader with nothing kept gets nothing back', async () => {
  for (const [method, body] of [['GET'], ['PUT', { data: COPY, base: null }], ['DELETE']]) assert.equal((await call(null, method, '/state/tracker', body)).status, 401, `${method} signed out`);
  assert.deepEqual((await call(ada, 'GET', '/state/tracker')).json, { updatedAt: null, data: null });
});

test('the first save is kept as sent, and the reader reads it back; another reader sees nothing of it', async () => {
  const saved = await call(ada, 'PUT', '/state/tracker', { data: COPY, base: null });
  assert.equal(saved.status, 200);
  assert.match(saved.json.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(await call(ada, 'GET', '/state/tracker').then((r) => r.json), { updatedAt: saved.json.updatedAt, data: COPY });
  assert.deepEqual((await call(grace, 'GET', '/state/tracker')).json, { updatedAt: null, data: null }, 'it is private to Ada');
});

test('a save quotes the copy it was based on: one based on an old copy is refused with what is there now, and nothing is overwritten', async () => {
  const first = (await call(ada, 'PUT', '/state/tracker', { data: COPY, base: null })).json.updatedAt;
  const second = await call(ada, 'PUT', '/state/tracker', { data: { ...COPY, items: {} }, base: first });
  assert.equal(second.status, 200, 'a save based on the current copy goes through');

  const late = await call(ada, 'PUT', '/state/tracker', { data: { version: 1, items: { 'SD-U-002': { s: 'd' } } }, base: first });
  assert.equal(late.status, 409, 'another device saved since');
  assert.equal(late.json.updatedAt, second.json.updatedAt);
  assert.deepEqual(late.json.data, { ...COPY, items: {} }, 'it says what is there now, so the browser can merge and try again');
  assert.deepEqual((await call(ada, 'GET', '/state/tracker')).json.data, { ...COPY, items: {} });

  const again = await call(ada, 'PUT', '/state/tracker', { data: COPY, base: null });
  assert.equal(again.status, 409, 'a first save is refused when something is already kept');
});

test('only the names the config lists are kept, and only a JSON object that fits', async () => {
  assert.equal((await call(ada, 'GET', '/state/secrets')).status, 404);
  assert.equal((await call(ada, 'PUT', '/state/secrets', { data: COPY, base: null })).status, 404);
  assert.equal((await call(ada, 'PUT', '/state/toString', { data: COPY, base: null })).status, 404, 'a name from the object prototype is not one');
  for (const bad of [{ data: [1], base: null }, { data: 'text', base: null }, { data: COPY }, { data: COPY, base: 5 }, {}]) assert.equal((await call(ada, 'PUT', '/state/tracker', bad)).status, 400, JSON.stringify(bad).slice(0, 40));
  const big = { version: 1, items: { 'SD-U-001': { n: 'x'.repeat(SYNC.names.tracker.maxChars) } } };
  assert.equal((await call(ada, 'PUT', '/state/tracker', { data: big, base: null })).status, 413, 'too large to keep');
  assert.deepEqual((await call(ada, 'GET', '/state/tracker')).json, { updatedAt: null, data: null }, 'none of those left anything behind');
});

test('saving is limited to so many times an hour', async () => {
  let base = null;
  for (let i = 0; i < SYNC.writesPerHour; i++) {
    const res = await call(ada, 'PUT', '/state/tracker', { data: { version: 1, items: {}, n: i }, base });
    assert.equal(res.status, 200, `save ${i + 1}`);
    base = res.json.updatedAt;
  }
  assert.equal((await call(ada, 'PUT', '/state/tracker', { data: COPY, base })).status, 429);
  assert.equal((await call(grace, 'PUT', '/state/tracker', { data: COPY, base: null })).status, 200, 'another reader is not held up');
});

test('a reader can stop syncing: what is kept is deleted, and another reader\'s copy is not touched', async () => {
  await call(ada, 'PUT', '/state/tracker', { data: COPY, base: null });
  await call(grace, 'PUT', '/state/tracker', { data: COPY, base: null });
  assert.equal((await call(ada, 'DELETE', '/state/tracker')).status, 204);
  assert.deepEqual((await call(ada, 'GET', '/state/tracker')).json, { updatedAt: null, data: null });
  assert.deepEqual((await call(grace, 'GET', '/state/tracker')).json.data, COPY);
  assert.equal((await call(ada, 'DELETE', '/state/secrets')).status, 404);
});

test('deleting the account deletes what was kept', async () => {
  await call(ada, 'PUT', '/state/tracker', { data: COPY, base: null });
  await call(grace, 'PUT', '/state/tracker', { data: COPY, base: null });
  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);
  const rows = env.DB.raw.prepare('SELECT user_id FROM user_state').all().map((row) => row.user_id);
  assert.deepEqual(rows, ['user-grace@example.com'], 'only Grace\'s copy is left');
});
