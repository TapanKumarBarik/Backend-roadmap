import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLive } from './urlLive.mjs';

const SITE = 'https://example.org';
const BASE = 'https://staging.example.net';
const page = (path) => `<title>x</title><link rel="canonical" href="${SITE}${path}"><body><div class="prerender">Text</div></body>`;
const registry = { '/a/': { kind: 'page', canonical: true, text: true }, '/videos.json': { kind: 'file' } };

/** A fake site: `routes` maps a path to { status, headers?, body? }. */
const siteOf = (routes) => async (url) => {
  const { pathname } = new URL(url);
  const route = routes[pathname] || { status: 404 };
  return { status: route.status, headers: new Headers({ 'content-type': 'text/html', ...(route.headers || {}) }), text: async () => route.body ?? '' };
};
const ok = { '/a/': { status: 200, body: page('/a/') }, '/a': { status: 301, headers: { location: '/a/' } }, '/videos.json': { status: 200, headers: { 'content-type': 'application/json' }, body: '[]' } };
const verdict = (routes, options = {}) => checkLive({ base: BASE, siteUrl: SITE, registry, fetchImpl: siteOf(routes), ...options });

test('a site that answers every address, with or without the slash, has no problems', async () => {
  assert.deepEqual(await verdict(ok), { problems: [], checked: 2 });
});

test('a 404, a missing canonical and an empty page are each reported', async () => {
  assert.deepEqual((await verdict({ ...ok, '/videos.json': { status: 404 } })).problems, ['/videos.json: answers 404']);
  assert.match((await verdict({ ...ok, '/a/': { status: 200, body: page('/other/') } })).problems[0], /canonical is/);
  assert.match((await verdict({ ...ok, '/a/': { status: 200, body: '<link rel="canonical" href="https://example.org/a/"><body><div class="prerender"></div></body>' } })).problems[0], /no text/);
});

test('a permanent redirect to a page that answers is accepted; a temporary one, a loop and a dead end are not', async () => {
  const moved = (status, to = '/b/') => verdict({ ...ok, '/a/': { status, headers: { location: to } }, '/b/': { status: 200, body: page('/b/') } }, { slashless: false });
  assert.deepEqual((await moved(301)).problems, [], 'the canonical is the page it ended on');
  assert.match((await moved(302)).problems[0], /temporary redirect/);
  assert.match((await moved(301, '/a/')).problems[0], /loop/);
  assert.match((await moved(301, '/gone/')).problems[0], /answers 404 after 1 redirect/);
});

test('the address without its slash must reach the page', async () => {
  const broken = { ...ok };
  delete broken['/a'];
  assert.deepEqual((await verdict(broken)).problems, ['/a: without its slash answers 404']);
  assert.deepEqual((await verdict(broken, { slashless: false })).problems, []);
  assert.match((await verdict({ ...ok, '/a': { status: 302, headers: { location: '/a/' } } })).problems[0], /redirected temporarily/);
});

test('a sample of the addresses can be asked instead of all', async () => {
  assert.deepEqual(await verdict(ok, { addresses: ['/videos.json'] }), { problems: [], checked: 1 });
});
