import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressOf, pageFacts, readRedirects, readRegistry, sitemapPaths, writeRegistry } from './publicUrls.mjs';
import { checkAddresses, reportOf } from './urlCheck.mjs';

const SITE = 'https://example.org';
const page = (over = {}) => ({ canonical: null, indexable: true, textLength: 100, ...over });
const registry = readRegistry([
  '# a note',
  '/\t1\t1\t1',
  '/a/\t1\t1\t1',
  '/draft/\t0\t1\t1',
  '/privacy.html\t1\t1\t0',
  '/videos.json\tfile'
].join('\n'));
const good = () => ({
  registry,
  pages: { '/': page({ canonical: `${SITE}/` }), '/a/': page({ canonical: `${SITE}/a/` }), '/draft/': page({ canonical: `${SITE}/draft/`, indexable: false }), '/privacy.html': page({ canonical: `${SITE}/privacy.html`, textLength: 0 }) },
  files: { '/videos.json': true },
  sitemap: ['/', '/a/'],
  redirects: [],
  siteUrl: SITE
});
const problemsOf = (change) => { const site = good(); change(site); return checkAddresses(site).problems; };

test('a site that keeps every registered address has no problems, and says what is new', () => {
  const verdict = checkAddresses({ ...good(), pages: { ...good().pages, '/blog/': page({ canonical: `${SITE}/blog/` }) } });
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.checked, 5);
  assert.deepEqual(verdict.added, ['/blog/']);
});

test('an address that is gone is a problem, whether it was a page or a file', () => {
  assert.deepEqual(problemsOf((s) => { delete s.pages['/a/']; }), ['/a/: gone (no page, no file, no redirect)']);
  assert.deepEqual(problemsOf((s) => { delete s.files['/videos.json']; }), ['/videos.json: gone (no page, no file, no redirect)']);
});

test('a page that moved is fine with a permanent redirect to a place that answers, and nothing else is', () => {
  const moved = (redirect) => problemsOf((s) => { delete s.pages['/a/']; s.pages['/b/'] = page({ canonical: `${SITE}/b/` }); s.redirects = [redirect]; });
  assert.deepEqual(moved({ from: '/a/', to: '/b/', status: 301 }), []);
  assert.deepEqual(moved({ from: '/a/', to: '/b/', status: 308 }), []);
  assert.match(moved({ from: '/a/', to: '/b/', status: 302 })[0], /not permanently/);
  assert.match(moved({ from: '/a/', to: '/', status: 301 })[0], /home page/);
  assert.match(moved({ from: '/a/', to: '/nowhere/', status: 301 })[0], /nothing answers/);
});

test('redirects that go round in a circle are caught', () => {
  const problems = problemsOf((s) => { s.redirects = [{ from: '/x/', to: '/y/', status: 301 }, { from: '/y/', to: '/x/', status: 301 }]; });
  assert.ok(problems.some((p) => /in a circle/.test(p)), problems.join('; '));
});

test('what a search engine reads is held: the canonical is the page itself, an indexed page stays indexed, text and sitemap stay', () => {
  assert.match(problemsOf((s) => { s.pages['/a/'].canonical = `${SITE}/other/`; })[0], /not itself/);
  assert.match(problemsOf((s) => { s.pages['/a/'].canonical = null; })[0], /lost its canonical/);
  assert.match(problemsOf((s) => { s.pages['/a/'].indexable = false; })[0], /noindex/);
  assert.match(problemsOf((s) => { s.pages['/a/'].textLength = 0; })[0], /no text/);
  assert.match(problemsOf((s) => { s.sitemap = ['/']; })[0], /missing from the sitemap/);
  assert.deepEqual(problemsOf((s) => { s.pages['/draft/'].indexable = true; s.sitemap.push('/draft/'); }), [], 'a page may become indexable; it may not stop being');
});

test('the registry round-trips, and reads addresses from their files and sitemaps', () => {
  const text = writeRegistry({ '/b/': page({ canonical: 'x' }), '/a/': page({ indexable: false, textLength: 0 }) }, { '/robots.txt': true }, '# header');
  assert.equal(text, '# header\n/a/\t0\t0\t0\n/b/\t1\t1\t1\n/robots.txt\tfile\n');
  assert.deepEqual(readRegistry(text)['/a/'], { kind: 'page', indexable: false, canonical: false, text: false });
  assert.equal(readRegistry(text)['/robots.txt'].kind, 'file');
  assert.equal(addressOf('index.html'), '/');
  assert.equal(addressOf('a/b/index.html'), '/a/b/');
  assert.equal(addressOf('privacy.html'), '/privacy.html');
  assert.deepEqual(sitemapPaths(`<loc>${SITE}/a/</loc><loc>https://other.org/x/</loc><loc>${SITE}/</loc>`, SITE), ['/a/', '/']);
  assert.deepEqual(readRedirects('# note\n/old/ /new/ 301\n\n/x /y'), [{ from: '/old/', to: '/new/', status: 301 }, { from: '/x', to: '/y', status: 302 }]);
});

test('a page tells what it says to a search engine', () => {
  const html = '<title> A page </title><link rel="canonical" href="https://example.org/a/"><meta name="robots" content="noindex"><body><div class="prerender">Some <b>text</b></div></body>';
  assert.deepEqual(pageFacts(html), { canonical: 'https://example.org/a/', indexable: false, title: 'A page', textLength: 9 });
});

test('a script the host adds after the page (an analytics beacon) is not counted as the page, and does not hide it', () => {
  const html = '<body><div id="root"><div class="prerender">Some text</div></div><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="x"></script></body>';
  assert.equal(pageFacts(html).textLength, 9);
  assert.equal(pageFacts('<body><script>var a = 1;</script></body>').textLength, 0, 'no pre-rendered copy, no text');
});

test('the report names the verdict and what is new', () => {
  const text = reportOf({ problems: ['/a/: gone'], checked: 3, redirected: 1, added: ['/blog/'] }, { commit: 'commit abc', when: '2026-11-03' });
  assert.match(text, /1 problem\(s\)/);
  assert.match(text, /- \/a\/: gone/);
  assert.match(text, /- \/blog\//);
});
