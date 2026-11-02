// The pages the server draws for the community (api/pages/blogPages.js), run against the real API and a stand-in for the
// app's shell: what a crawler or a link preview gets for an article, an author and the listing, and what it does not.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { invalidateAdminCache } from '../lib/admin.js';
import { servePage, serveSitemap } from '../pages/blogPages.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';

// The parts of the built shell the writer rewrites (see lib/seo/shellPage.js), and the headers Cloudflare gives a file.
const SHELL = `<!doctype html><html><head><title>Backend Roadmap</title>
<meta name="description" content="The site"><link rel="canonical" href="https://backendroadmap.com/">
<meta property="og:url" content="https://backendroadmap.com/"><meta property="og:type" content="website">
<meta property="og:title" content="Backend Roadmap"><meta property="og:description" content="The site">
<meta property="og:image" content="https://backendroadmap.com/og-image.png"><meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630"><meta property="og:image:alt" content="The site">
<meta name="twitter:image" content="https://backendroadmap.com/og-image.png"></head><body><div id="root"></div></body></html>`;
const POLICY = "default-src 'self'";

let env;
let ada;
let grace;
let owner;
beforeEach(async () => {
  invalidateAdminCache();
  env = createEnv({ ASSETS: { fetch: async (request) => (new URL(request.url).pathname === '/app-shell' ? new Response(SHELL, { headers: { 'content-security-policy': POLICY, etag: '"abc"', 'content-length': String(SHELL.length) } }) : new Response('missing', { status: 404 })) } });
  ada = await signedInAs('ada@example.com', { name: 'Ada Lovelace' });
  grace = await signedInAs('grace@example.com', { name: 'Grace Hopper' });
  owner = await signedInAs(OWNER_EMAIL);
});

const call = async (cookie, method, path, body) => {
  const res = await app.request(`/api${path}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }, env);
  return res.json();
};
const get = (path, method = 'GET') => servePage({ request: new Request(`https://backendroadmap.com${path}`, { method }), env, params: {} });
const text = async (response) => response.text();

const para = (words) => ({ type: 'paragraph', content: [{ type: 'text', text: words }] });
const body = (extra = []) => ({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'First section' }] }, para(Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')), ...extra] });

async function publish(cookie, title, extra = {}) {
  const { id } = await call(cookie, 'POST', '/blogs', {});
  await call(cookie, 'PUT', `/blogs/${id}`, { title, content: body(), tags: ['reliability'], ...extra });
  const { slug } = await call(cookie, 'POST', `/blogs/${id}/publish`, {});
  return { id, slug };
}
const author = async (cookie, handle) => call(cookie, 'PUT', '/me/profile', { handle, name: handle === 'ada-l' ? 'Ada Lovelace' : 'Grace Hopper', bio: 'I write about retries.' });

test('an article is drawn with its own head, its text and structured data', async () => {
  await author(ada, 'ada-l');
  const { slug } = await publish(ada, 'Why retries need idempotency', { subtitle: 'A short subtitle', excerpt: 'The request that arrives twice.' });
  await call(owner, 'POST', '/manage/authors/ada-l/trust', {});
  const again = await publish(ada, 'Why retries need idempotency, again', { excerpt: 'Approved at once, as the author is trusted.' });

  const res = await get(`/blog/${again.slug}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  const html = await text(res);
  assert.match(html, /<title>Why retries need idempotency, again · Backend Roadmap<\/title>/);
  assert.match(html, /<meta name="description" content="Approved at once, as the author is trusted\.">/);
  assert.match(html, new RegExp(`<link rel="canonical" href="https://backendroadmap\\.com/blog/${again.slug}">`));
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<div id="root"><div class="prerender">.*<h1>Why retries need idempotency, again<\/h1>/s);
  assert.match(html, /<h2 id="first-section">First section<\/h2>/);
  assert.match(html, /By <a href="\/authors\/ada-l">Ada Lovelace<\/a>/);
  assert.doesNotMatch(html, /name="robots"/, 'approved: indexed');
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  const posting = ld['@graph'].find((node) => node['@type'] === 'BlogPosting');
  assert.equal(posting.headline, 'Why retries need idempotency, again');
  assert.equal(posting.author.name, 'Ada Lovelace');
  assert.equal(posting.author.url, 'https://backendroadmap.com/authors/ada-l');
  assert.ok(posting.datePublished && posting.dateModified);
  assert.equal(ld['@graph'].find((node) => node['@type'] === 'BreadcrumbList').itemListElement.length, 3);
  assert.equal(slug.length > 0, true);
});

test('what Cloudflare adds to the shell file (the security policy) is kept, and what describes the file is not', async () => {
  await author(ada, 'ada-l');
  const { slug } = await publish(ada, 'A headers check');
  const res = await get(`/blog/${slug}`);
  assert.equal(res.headers.get('content-security-policy'), POLICY);
  assert.equal(res.headers.get('etag'), null, 'the page is not the file');
  assert.notEqual(res.headers.get('content-length'), String(SHELL.length));
  assert.match(res.headers.get('cache-control'), /max-age=0/);
});

test('an article that is not approved is live but kept out of search results', async () => {
  await author(ada, 'ada-l');
  const { slug } = await publish(ada, 'A new author\'s first article');
  const html = await text(await get(`/blog/${slug}`));
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
});

test('a cover picture is the share picture, with no size claimed for it', async () => {
  await author(ada, 'ada-l');
  const cover = 'https://stroadmapprogress.blob.core.windows.net/feed-uploads/cover.png';
  const { slug } = await publish(ada, 'An article with a cover', { coverUrl: cover });
  const html = await text(await get(`/blog/${slug}`));
  assert.match(html, /<meta property="og:image" content="https:\/\/stroadmapprogress\.blob\.core\.windows\.net\/feed-uploads\/cover\.png">/);
  assert.doesNotMatch(html, /og:image:width/);
});

test('an article that is not there, or is not out yet, is a 404 that is kept out of search results', async () => {
  await author(ada, 'ada-l');
  const { id, slug } = await publish(ada, 'About to be taken down');
  await call(ada, 'POST', `/blogs/${id}/unpublish`);
  for (const path of [`/blog/${slug}`, '/blog/never-existed', '/authors/nobody']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    const html = await text(res);
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.match(html, /<div id="root"><div class="prerender">/, 'the app still starts, and says so itself');
  }
});

test('the listing and an author draw the approved articles, and an author with none is kept out of search', async () => {
  await author(ada, 'ada-l');
  await author(grace, 'grace-h');
  await publish(ada, 'Visible to crawlers', { excerpt: 'Approved.' });
  const hidden = await publish(grace, 'Waiting for approval');
  const first = await publish(ada, 'Also visible');
  await call(owner, 'POST', `/manage/blogs/${first.id}/approve`);
  await call(owner, 'POST', '/manage/authors/ada-l/trust', {});

  const index = await text(await get('/blog/'));
  assert.match(index, /<title>Blogs · Backend Roadmap<\/title>/);
  assert.match(index, /<link rel="canonical" href="https:\/\/backendroadmap\.com\/blog\/">/);
  assert.match(index, /<a href="\/blog\/also-visible">Also visible<\/a>/);
  assert.doesNotMatch(index, new RegExp(hidden.slug), 'an article awaiting approval is not offered to crawlers');
  assert.doesNotMatch(index, /name="robots"/);

  const adaPage = await text(await get('/authors/ada-l'));
  assert.match(adaPage, /<h1>Ada Lovelace<\/h1>/);
  assert.match(adaPage, /<a href="\/blog\/also-visible">/);
  assert.doesNotMatch(adaPage, /name="robots"/);
  const gracePage = await text(await get('/authors/grace-h'));
  assert.match(gracePage, /name="robots" content="noindex, follow"/, 'nothing of hers is approved yet');
  assert.equal((await get('/authors/')).status, 200, 'an author index is the listing');
});

test('the studio is the shell with a title, kept out of search', async () => {
  for (const path of ['/write', '/write/', '/write/17-ab']) {
    const html = await text(await get(path));
    assert.match(html, /<title>Write · Backend Roadmap<\/title>/, path);
    assert.match(html, /name="robots" content="noindex, follow"/, path);
  }
});

test('anything that is not a read is refused, and a HEAD has headers and no body', async () => {
  assert.equal((await get('/blog/', 'POST')).status, 405);
  const head = await get('/blog/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await text(head), '');
  assert.match(head.headers.get('content-type'), /html/);
});

test('a missing shell is a 502, and a failing database is a 503 with the plain shell: temporary, and the app can try for itself', async () => {
  const broken = createEnv({ ASSETS: { fetch: async () => new Response('missing', { status: 404 }) } });
  const noShell = await servePage({ request: new Request('https://backendroadmap.com/blog/'), env: broken, params: {} });
  assert.equal(noShell.status, 502);

  await author(ada, 'ada-l');
  const { slug } = await publish(ada, 'Fine until the database goes');
  env.DB.raw.exec('DROP TABLE blog_posts');
  for (const path of [`/blog/${slug}`, '/blog/', '/authors/ada-l']) {
    const res = await get(path);
    assert.equal(res.status, 503, `${path}: a search engine must not read this as "gone"`);
    assert.equal(res.headers.get('retry-after'), '120');
    assert.match(await text(res), /<div id="root"><\/div>/, 'the plain shell, untouched');
  }
  const sitemap = await serveSitemap({ request: new Request('https://backendroadmap.com/sitemap-blogs.xml'), env, params: {} });
  assert.equal(sitemap.status, 503);
});

test('the sitemap lists the approved articles and their authors, and nothing else', async () => {
  await author(ada, 'ada-l');
  await author(grace, 'grace-h');
  const approved = await publish(ada, 'In the sitemap');
  await publish(grace, 'Not in the sitemap');
  await call(owner, 'POST', `/manage/blogs/${approved.id}/approve`);

  const res = await serveSitemap({ request: new Request('https://backendroadmap.com/sitemap-blogs.xml'), env, params: {} });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /xml/);
  const xml = await text(res);
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ['https://backendroadmap.com/blog/', 'https://backendroadmap.com/blog/in-the-sitemap', 'https://backendroadmap.com/authors/ada-l']);
  assert.match(xml, /<lastmod>\d{4}-\d\d-\d\dT/);
});
