// Who may call what. The failure this guards against is a route that quietly stops requiring a sign-in or admin
// rights, so the checks run over every route the app registers, not a hand-picked few: add a route and it is covered.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { invalidateAdminCache } from '../lib/admin.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';

// The routes anyone may call without signing in. Every other route must refuse an anonymous request with 401.
// Adding a route here is a decision, which is why the list is written out.
const PUBLIC = [
  'GET /api/auth/login',
  'GET /api/auth/callback',
  'GET /api/auth/me',
  'GET /api/auth/logout',
  'GET /api/reactions/:path{.+}',
  'GET /api/feed',
  'GET /api/comments/questions',
  'GET /api/comments/:path{.+}',
  'GET /api/books',
  'GET /api/community/counts',
  'GET /api/blogs',
  'GET /api/blogs/tags',
  'GET /api/blogs/:slug',
  'GET /api/authors/:handle',
  'GET /api/suggestions',
  'POST /api/track'
];

const routes = [...new Map(app.routes.filter((r) => r.method !== 'ALL').map((r) => [`${r.method} ${r.path}`, r])).values()];
const label = (route) => `${route.method} ${route.path}`;
const isAdminRoute = (route) => route.path.startsWith('/api/manage/');

function request(env, route, cookie) {
  const url = route.path.replace(':path{.+}', 'backend/x/README.md').replace(':id', 'abc');
  const hasBody = !['GET', 'DELETE'].includes(route.method);
  return app.request(url, {
    method: route.method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: hasBody ? '{}' : undefined
  }, env);
}

let env;
beforeEach(() => {
  env = createEnv();
  invalidateAdminCache();
});

test('the route list this test relies on is real', () => {
  assert.ok(routes.length >= 50, `only ${routes.length} routes found`);
  const labels = new Set(routes.map(label));
  for (const entry of PUBLIC) assert.ok(labels.has(entry), `"${entry}" is in the public list but is not a route (renamed?)`);
});

test('a route that is not public refuses a visitor who has not signed in', async () => {
  const open = [];
  for (const route of routes.filter((r) => !PUBLIC.includes(label(r)))) {
    const res = await request(env, route);
    if (res.status !== 401) open.push(`${label(route)} answered ${res.status}`);
  }
  assert.deepEqual(open, [], 'routes reachable without signing in; guard them, or add them to PUBLIC on purpose');
});

test('every admin route refuses a signed-in visitor who is not an admin', async () => {
  const cookie = await signedInAs('reader@example.com');
  const adminRoutes = routes.filter(isAdminRoute);
  assert.ok(adminRoutes.length >= 10, `only ${adminRoutes.length} admin routes found`);
  const open = [];
  for (const route of adminRoutes) {
    const res = await request(env, route, cookie);
    if (res.status !== 403) open.push(`${label(route)} answered ${res.status}`);
  }
  assert.deepEqual(open, [], 'admin routes a plain reader can reach');
});

test('the owner gets past the admin guard on every admin route', async () => {
  const cookie = await signedInAs(OWNER_EMAIL);
  const blocked = [];
  for (const route of routes.filter(isAdminRoute)) {
    const res = await request(env, route, cookie);
    if (res.status === 401 || res.status === 403) blocked.push(`${label(route)} answered ${res.status}`);
  }
  assert.deepEqual(blocked, []);
});

test('the owner can make someone an admin and take it away again, and it takes effect straight away', async () => {
  const owner = await signedInAs(OWNER_EMAIL);
  const helper = await signedInAs('helper@example.com');
  const statsRoute = { method: 'GET', path: '/api/manage/usage' };

  assert.equal((await request(env, statsRoute, helper)).status, 403, 'not an admin yet');

  const grant = await app.request('/api/manage/admins', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: owner },
    body: JSON.stringify({ email: 'Helper@Example.com' })
  }, env);
  assert.equal(grant.status, 200);
  assert.notEqual((await request(env, statsRoute, helper)).status, 403, 'an admin now (the address is matched case-insensitively)');

  const revoke = await app.request('/api/manage/admins?email=helper@example.com', { method: 'DELETE', headers: { cookie: owner } }, env);
  assert.equal(revoke.status, 204);
  assert.equal((await request(env, statsRoute, helper)).status, 403, 'not an admin again');
});

test('nobody can remove the owner or themselves from the admins', async () => {
  const owner = await signedInAs(OWNER_EMAIL);
  const removeOwner = await app.request(`/api/manage/admins?email=${OWNER_EMAIL}`, { method: 'DELETE', headers: { cookie: owner } }, env);
  assert.equal(removeOwner.status, 400);

  await app.request('/api/manage/admins', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: owner },
    body: JSON.stringify({ email: 'helper@example.com' })
  }, env);
  const helper = await signedInAs('helper@example.com');
  const removeSelf = await app.request('/api/manage/admins?email=helper@example.com', { method: 'DELETE', headers: { cookie: helper } }, env);
  assert.equal(removeSelf.status, 400);
});

test('a session that is forged, signed with another secret, or expired counts as signed out', async () => {
  const bookmarks = { method: 'GET', path: '/api/bookmarks' };
  assert.equal((await request(env, bookmarks, await signedInAs('a@example.com'))).status, 200, 'the control: a good session works');
  assert.equal((await request(env, bookmarks, await signedInAs('a@example.com', { secret: 'another-secret' }))).status, 401);
  assert.equal((await request(env, bookmarks, await signedInAs('a@example.com', { ttlMs: -1000 }))).status, 401);
  assert.equal((await request(env, bookmarks, 'session=not-a-session')).status, 401);
});

test('an unknown address is a JSON 404, not an HTML page or a crash', async () => {
  const res = await app.request('/api/no-such-thing', {}, env);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not found' });
});
