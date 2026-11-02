import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLOG_ROUTE, AUTHOR_ROUTE, PAGES, WRITE_ROUTE, authorUrl, pageFromPathname, pageUrl, postUrl, writeUrl } from './appPages.js';
import { routeUrl } from './curriculum/moduleUrl.js';
import site from '../../../site.config.json' with { type: 'json' };

test('an address is read as the screen it opens, with the slot after the prefix as its heading', () => {
  assert.deepEqual(pageFromPathname('/blog/'), { path: BLOG_ROUTE, heading: null });
  assert.deepEqual(pageFromPathname('/blog'), { path: BLOG_ROUTE, heading: null });
  assert.deepEqual(pageFromPathname('/blog/why-retries-need-idempotency'), { path: BLOG_ROUTE, heading: 'why-retries-need-idempotency' });
  assert.deepEqual(pageFromPathname('/authors/ada-l'), { path: AUTHOR_ROUTE, heading: 'ada-l' });
  assert.deepEqual(pageFromPathname('/write'), { path: WRITE_ROUTE, heading: null });
  assert.deepEqual(pageFromPathname('/write/1730000000000-abcd1234'), { path: WRITE_ROUTE, heading: '1730000000000-abcd1234' });
  assert.deepEqual(pageFromPathname('/blog/a%20b'), { path: BLOG_ROUTE, heading: 'a b' }, 'decoded');
  assert.deepEqual(pageFromPathname('/blog/a/b'), { path: BLOG_ROUTE, heading: 'a/b' }, 'not a real post, but still this screen');
  assert.deepEqual(pageFromPathname('/blog/%E0%A4%A'), { path: BLOG_ROUTE, heading: '%E0%A4%A' }, 'an address that does not decode is kept as it is');
});

test('anything else is not one of these pages', () => {
  for (const pathname of ['/', '/backend/01-intro/01-first/', '/blogger/', '/authors-guide/', '/b/log', '']) {
    assert.equal(pageFromPathname(pathname), null, pathname);
  }
});

test('a route is turned back into its address, and the two agree', () => {
  assert.equal(pageUrl(BLOG_ROUTE), '/blog/');
  assert.equal(postUrl('why-retries'), '/blog/why-retries');
  assert.equal(authorUrl('ada-l'), '/authors/ada-l');
  assert.equal(writeUrl(), '/write/');
  assert.equal(writeUrl('17-ab'), '/write/17-ab');
  assert.equal(pageUrl('__feed'), null, 'a hash screen has no path');
  assert.equal(pageUrl('backend/01-intro/README.md'), null, 'nor has a module here');
  for (const { route } of PAGES) {
    for (const heading of [null, 'x', 'a b', 'ünï']) {
      const round = pageFromPathname(pageUrl(route, heading));
      assert.deepEqual(round, { path: route, heading }, `${route} ${heading}`);
    }
  }
});

test('the router gives these routes their addresses, and still gives a module its own', () => {
  assert.equal(routeUrl(BLOG_ROUTE, 'x'), '/blog/x');
  assert.equal(routeUrl(AUTHOR_ROUTE, 'ada-l'), '/authors/ada-l');
  assert.equal(routeUrl('__feed', 'post-1'), '/#__feed@post-1');
  assert.equal(routeUrl('backend/01-intro/README.md', null), '/backend/01-intro/');
});

test('no curriculum has a folder named like a page, so an address is never both', () => {
  const taken = new Set(PAGES.map((page) => page.prefix));
  for (const curriculum of site.content.curricula) assert.ok(!taken.has(curriculum), `${curriculum} is also a page prefix`);
  const content = fileURLToPath(new URL(`../../../${site.content.dir}/`, import.meta.url));
  for (const entry of fs.readdirSync(content)) assert.ok(!taken.has(entry), `${site.content.dir}/${entry} is also a page prefix`);
});

test('the server is told which addresses the pages live at', () => {
  const routes = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../public/_routes.json', import.meta.url)), 'utf8'));
  for (const { prefix } of PAGES) {
    assert.ok(routes.include.includes(`/${prefix}`) && routes.include.includes(`/${prefix}/*`), `_routes.json must run Functions for /${prefix} and /${prefix}/*`);
  }
});
