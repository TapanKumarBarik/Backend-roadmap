import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

/** The port a server listening on port 0 was given. */
const portOf = (server) => /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
import { checkSite, waitForHealthy } from './smoke.mjs';

const LESSON = 'backend/01-intro/01-first/README.md';

// A small stand-in for the deployed site. `broken` names the parts that are wrong, so each test can break one thing.
async function serve(broken = new Set()) {
  const loc = Array.from({ length: 400 }, (_, i) => `<url><loc>https://example.com/p${i}/</loc></url>`).join('');
  const routes = {
    '/': () => ['<!doctype html><div id="root"></div>', { 'content-type': 'text/html', ...(broken.has('csp') ? {} : { 'content-security-policy': "default-src 'self'" }) }],
    '/site-stats.json': () => [JSON.stringify({ modules: { written: 570 }, curricula: { backend: { start: LESSON } } }), { 'content-type': 'application/json' }],
    '/docs-index.json': () => [JSON.stringify({ tree: [{}, {}, {}, {}] }), { 'content-type': 'application/json' }],
    '/backend/01-intro/01-first/': () => ['<link rel="canonical" href="x"><h1>First</h1>', { 'content-type': 'text/html' }],
    '/backend/01-intro/01-first/README.md': () => ['# First', { 'content-type': 'text/markdown', ...(broken.has('noindex') ? {} : { 'x-robots-tag': 'noindex' }) }],
    '/sitemap.xml': () => [broken.has('sitemap') ? '<urlset></urlset>' : `<urlset>${loc}</urlset>`, { 'content-type': 'application/xml' }],
    '/api/auth/me': () => (broken.has('api') ? ['boom', { 'content-type': 'text/plain' }, 500] : [JSON.stringify({ user: null }), { 'content-type': 'application/json' }]),
    // Broken: the app's plain shell, as an address with no Function behind it would answer (it has the policy, nothing else).
    '/blog/': () => [broken.has('pages') ? '<div id="root"></div>' : '<link rel="canonical" href="https://example.com/blog/"><div id="root"></div>', { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'" }],
    '/sitemap-blogs.xml': () => (broken.has('blogSitemap') ? ['not found', { 'content-type': 'text/plain' }, 404] : ['<urlset></urlset>', { 'content-type': 'application/xml' }]),
    '/api/blogs?limit=1': () => (broken.has('blogs') ? ['no such table: blog_posts', { 'content-type': 'text/plain' }, 500] : [JSON.stringify({ posts: [], next: null }), { 'content-type': 'application/json' }]),
    '/api/announcements': () => (broken.has('notices') ? ['no such table: announcements', { 'content-type': 'text/plain' }, 500] : ['[]', { 'content-type': 'application/json' }]),
    '/api/practice/catalog': () => (broken.has('practice') ? ['not found', { 'content-type': 'text/plain' }, 404] : [JSON.stringify({ quizzes: [] }), { 'content-type': 'application/json' }])
  };
  const server = http.createServer((req, res) => {
    const route = routes[req.url];
    if (!route) { res.writeHead(404); res.end('not found'); return; }
    const [body, headers, status = 200] = route();
    res.writeHead(status, headers);
    res.end(body);
  });
  await listen(server);
  return { base: `http://127.0.0.1:${portOf(server)}`, close: () => { server.close(); server.closeAllConnections(); }, broken };
}

test('a healthy site has no problems', async () => {
  const site = await serve();
  assert.deepEqual(await checkSite(site.base), []);
  site.close();
});

test('each way a deploy can go wrong is reported by name', async () => {
  /** @type {[string, RegExp][]} */
  const cases = [
    ['csp', /Content-Security-Policy/],
    ['noindex', /noindex/],
    ['sitemap', /sitemap\.xml/],
    ['api', /\/api\/auth\/me answered 500/],
    ['pages', /\/blog\/ is not drawn by the server/],
    ['blogSitemap', /sitemap-blogs\.xml answered 404/],
    ['blogs', /\/api\/blogs answered 500 \(was the database migration applied\?/],
    ['notices', /\/api\/announcements answered 500 \(was the database migration applied\?/],
    ['practice', /\/api\/practice\/catalog answered 404/]
  ];
  for (const [what, expected] of cases) {
    const site = await serve(new Set([what]));
    try {
      const problems = await checkSite(site.base);
      assert.equal(problems.length, 1, `${what}: ${problems.join('; ')}`);
      assert.match(problems[0], expected);
    } finally {
      site.close(); // a failed check must not leave the server open: the run would never end
    }
  }
});

test('a site that cannot be reached is reported, not thrown', async () => {
  const probe = http.createServer();
  await listen(probe);
  const port = portOf(probe);
  await new Promise((resolve) => probe.close(resolve));
  const problems = await checkSite(`http://127.0.0.1:${port}`);
  assert.ok(problems.length > 0);
  assert.match(problems[0], /could not be fetched/);
});

test('it keeps trying while a new deployment spreads, and stops as soon as the site is healthy', async () => {
  const site = await serve(new Set(['api']));
  let attempts = 0;
  const problems = await waitForHealthy(site.base, { attempts: 5, delayMs: 5, log: () => { attempts++; if (attempts === 2) site.broken.delete('api'); } });
  assert.deepEqual(problems, []);
  assert.equal(attempts, 2, 'two failed attempts, then a healthy one');
  site.close();
});

test('it gives up after the attempts it was given and returns what was wrong', async () => {
  const site = await serve(new Set(['sitemap']));
  const problems = await waitForHealthy(site.base, { attempts: 3, delayMs: 1 });
  assert.equal(problems.length, 1);
  site.close();
});
