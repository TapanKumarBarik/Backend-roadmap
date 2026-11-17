import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, createSync } from './syncClient.js';

const NOW = 1_800_000_000;

/** A server with the account's routes: who is signed in, and one copy with a stamp that changes on every save. `hooks.beforePut` lets a test play another device. */
function fakeServer({ user = { email: 'ada@example.com' }, remote = null, hooks = {} } = {}) {
  const server = { data: remote, updatedAt: remote ? 'v0' : null, version: 0, calls: [], user, down: false };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  server.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    server.calls.push(`${method} ${url}`);
    if (server.down) throw new TypeError('network down');
    if (url === '/api/auth/me') return reply(200, { user: server.user });
    if (!server.user) return reply(401, { error: 'unauthenticated' });
    if (method === 'GET') return reply(200, { updatedAt: server.updatedAt, data: server.data });
    if (method === 'DELETE') { server.data = null; server.updatedAt = null; return reply(204, null); }
    const body = JSON.parse(init.body);
    if (hooks.tooLarge) return reply(413, { error: 'too large' });
    if (hooks.beforePut) { hooks.beforePut(server); hooks.beforePut = null; }
    if (body.base !== server.updatedAt) return reply(409, { error: 'Another device saved first.', updatedAt: server.updatedAt, data: server.data });
    server.data = body.data;
    server.updatedAt = `v${++server.version}`;
    return reply(200, { updatedAt: server.updatedAt });
  };
  return server;
}

const parse = (data) => ({ records: new Map(Object.entries(data.items || {})), removed: new Map(Object.entries(data.removed || {})) });
const stateData = (s) => ({ version: 1, items: Object.fromEntries(s.records), ...(s.removed.size ? { removed: Object.fromEntries(s.removed) } : {}) });

/** A page: a copy of its own, a flag that says whether it syncs, a list of what was shown, and timers that wait for the test to run them. */
function page(server, { items = {}, removed = {}, enabled = false } = {}) {
  const p = { state: parse({ items, removed }), enabled, shown: [], timers: [] };
  p.sync = createSync({
    name: 'tracker',
    getState: () => p.state,
    setState: (s) => { p.state = s; },
    parse,
    stateData,
    now: () => NOW,
    isEnabled: () => p.enabled,
    setEnabled: (on) => { p.enabled = on; },
    onStatus: (status) => p.shown.push(status),
    fetchImpl: server.fetch,
    setTimer: (fn) => { p.timers.push(fn); return p.timers.length; },
    clearTimer: (id) => { if (id) p.timers[id - 1] = null; }
  });
  return p;
}
const items = (p) => Object.fromEntries(p.state.records);

test('nobody signed in: it says so and asks the server for nothing else', async () => {
  const server = fakeServer({ user: null });
  const p = page(server, { enabled: true });
  assert.equal(await p.sync.check(), false);
  assert.equal(p.sync.status, STATUS.signedOut);
  assert.deepEqual(server.calls, ['GET /api/auth/me']);
});

test('signed in and not syncing: it offers to, and does not read or write anything', async () => {
  const server = fakeServer({ remote: { version: 1, items: { A: { s: 'd', u: 1 } } } });
  const p = page(server, { items: { B: { s: 'w', u: 2 } } });
  assert.equal(await p.sync.check(), true);
  assert.equal(p.sync.status, STATUS.off);
  assert.deepEqual(server.calls, ['GET /api/auth/me']);
  p.sync.changed();
  assert.equal(p.timers.length, 0, 'a change is not sent when this browser is not syncing');
});

test('turning it on in the browser with the progress sends it, and the account then has exactly that', async () => {
  const server = fakeServer();
  const p = page(server, { items: { A: { s: 'd', c: 4, u: 100 } } });
  await p.sync.check();
  await p.sync.enable();
  assert.equal(p.enabled, true);
  assert.equal(p.sync.status, STATUS.synced);
  assert.equal(p.sync.lastAt, NOW);
  assert.deepEqual(server.data, { version: 1, items: { A: { s: 'd', c: 4, u: 100 } } });
  assert.deepEqual(server.calls.slice(1), ['GET /api/state/tracker', 'PUT /api/state/tracker']);
});

test('turning it on with nothing here and nothing on the account writes nothing', async () => {
  const server = fakeServer();
  const p = page(server);
  await p.sync.check();
  await p.sync.enable();
  assert.equal(p.sync.status, STATUS.synced);
  assert.equal(server.data, null);
  assert.equal(server.calls.includes('PUT /api/state/tracker'), false);
});

test('a second device that turns it on takes what the account has and writes nothing back', async () => {
  const server = fakeServer({ remote: { version: 1, items: { A: { s: 'd', u: 100 }, B: { s: 'w', u: 90 } } } });
  const p = page(server);
  await p.sync.check();
  await p.sync.enable();
  assert.deepEqual(items(p), { A: { s: 'd', u: 100 }, B: { s: 'w', u: 90 } });
  assert.equal(server.calls.includes('PUT /api/state/tracker'), false);
});

test('a device with progress of its own and an account with some: both are kept, and the later change to a row wins', async () => {
  const server = fakeServer({ remote: { version: 1, items: { A: { s: 'd', u: 100 }, B: { s: 'w', u: 50 } } } });
  const p = page(server, { items: { B: { s: 'd', u: 70 }, C: { s: 'w', u: 10 } } });
  await p.sync.check();
  await p.sync.enable();
  const want = { A: { s: 'd', u: 100 }, B: { s: 'd', u: 70 }, C: { s: 'w', u: 10 } };
  assert.deepEqual(items(p), want);
  assert.deepEqual(server.data.items, want, 'and the account has the merged copy');
});

test('a change is sent after a pause, and an already-synced page that is signed in picks up what another device did when it checks', async () => {
  const server = fakeServer();
  const p = page(server, { enabled: true, items: { A: { s: 'd', u: 5 } } });
  await p.sync.check(); // signed in and syncing: it reads and writes at once
  assert.deepEqual(server.data.items, { A: { s: 'd', u: 5 } });

  p.state = parse({ items: { A: { s: 'd', u: 5 }, B: { s: 'w', u: 6 } } });
  p.sync.changed();
  p.sync.changed();
  assert.equal(p.timers.filter(Boolean).length, 1, 'two changes in a row are one save: the first wait is cancelled');
  await p.timers.filter(Boolean)[0]();
  assert.deepEqual(server.data.items, { A: { s: 'd', u: 5 }, B: { s: 'w', u: 6 } });

  server.data = { version: 1, items: { A: { s: 'd', u: 5 }, B: { s: 'w', u: 6 }, C: { s: 'd', u: 9 } } };
  server.updatedAt = 'other';
  await p.sync.sync();
  assert.deepEqual(Object.keys(items(p)).sort(), ['A', 'B', 'C'], 'what another device did arrives');
});

test('another device saves between the read and the write: the page merges with what is there and writes again, and nothing is lost', async () => {
  const server = fakeServer({
    remote: { version: 1, items: { A: { s: 'd', u: 100 } } },
    hooks: { beforePut: (s) => { s.data = { version: 1, items: { A: { s: 'd', u: 100 }, X: { s: 'd', u: 120 } } }; s.updatedAt = 'raced'; } }
  });
  const p = page(server, { enabled: true, items: { B: { s: 'w', u: 110 } } });
  await p.sync.check();
  assert.equal(p.sync.status, STATUS.synced);
  const want = { A: { s: 'd', u: 100 }, B: { s: 'w', u: 110 }, X: { s: 'd', u: 120 } };
  assert.deepEqual(server.data.items, want);
  assert.deepEqual(items(p), want);
  assert.equal(server.calls.filter((c) => c.startsWith('PUT')).length, 2, 'the first save was refused, the second went through');
});

test('a row reset on one device is reset on the other', async () => {
  const server = fakeServer({ remote: { version: 1, items: { A: { s: 'd', u: 100 } } } });
  const p = page(server, { enabled: true, items: { A: { s: 'd', u: 100 } } });
  p.state = parse({ items: {}, removed: { A: NOW - 10 } });
  await p.sync.check();
  assert.deepEqual(server.data, { version: 1, items: {}, removed: { A: NOW - 10 } });
  const other = page(server, { enabled: true, items: { A: { s: 'd', u: 100 } } });
  await other.sync.check();
  assert.equal(other.state.records.has('A'), false, 'it is gone from the other device');
});

test('when the server cannot be reached, the page keeps its own copy, says it could not sync, and sends it when the server is back', async () => {
  const server = fakeServer();
  const p = page(server, { enabled: true, items: { A: { s: 'd', u: 5 } } });
  await p.sync.check();
  assert.equal(p.sync.status, STATUS.synced);

  server.down = true;
  p.state = parse({ items: { A: { s: 'd', u: 5 }, B: { s: 'w', u: 6 } } });
  await p.sync.sync();
  assert.equal(p.sync.status, STATUS.error);
  assert.deepEqual(Object.keys(items(p)), ['A', 'B'], 'its own copy is untouched');

  server.down = false;
  await p.sync.sync();
  assert.equal(p.sync.status, STATUS.synced);
  assert.deepEqual(Object.keys(server.data.items), ['A', 'B'], 'what was waiting is sent');

  server.down = true;
  const fresh = page(server);
  assert.equal(await fresh.sync.check(), false, 'with the server out of reach it cannot tell who is signed in');
  assert.equal(fresh.sync.status, STATUS.signedOut);
});

test('a copy that is too large for the account is said to be, and is not retried in a loop', async () => {
  const server = fakeServer({ hooks: { tooLarge: true } });
  const p = page(server, { enabled: true, items: { A: { s: 'd', u: 5 } } });
  await p.sync.check();
  assert.equal(p.sync.status, STATUS.tooLarge);
  assert.equal(server.calls.filter((c) => c.startsWith('PUT')).length, 1);
});

test('stopping deletes the copy on the account and turns it off here, and keeps the progress in the browser', async () => {
  const server = fakeServer();
  const p = page(server, { enabled: true, items: { A: { s: 'd', u: 5 } } });
  await p.sync.check();
  assert.ok(server.data);
  assert.equal(await p.sync.disable(), true);
  assert.equal(server.data, null);
  assert.equal(p.enabled, false);
  assert.equal(p.sync.status, STATUS.off);
  assert.deepEqual(items(p), { A: { s: 'd', u: 5 } });
});

test('being signed out by the server in the middle of syncing is reported as signed out, not as an error', async () => {
  const server = fakeServer();
  const p = page(server, { enabled: true, items: { A: { s: 'd', u: 5 } } });
  await p.sync.check();
  server.user = null;
  await p.sync.sync();
  assert.equal(p.sync.status, STATUS.signedOut);
  assert.equal(p.sync.signedIn, false);
});
