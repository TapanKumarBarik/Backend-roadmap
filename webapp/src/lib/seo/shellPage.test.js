import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, jsonLd, shellPage } from './shellPage.js';

// The parts of the built shell this module rewrites (webapp/index.html after Vite has filled in the site's own values).
const SHELL = `<!doctype html><html><head>
<title>Backend Roadmap</title>
<meta name="description" content="The site">
<link rel="canonical" href="https://example.com/">
<meta property="og:url" content="https://example.com/">
<meta property="og:type" content="website">
<meta property="og:title" content="Backend Roadmap">
<meta property="og:description" content="The site">
<meta property="og:image" content="https://example.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The site">
<meta name="twitter:image" content="https://example.com/og-image.png">
</head><body><div id="root"></div></body></html>`;

const PAGE = { title: 'Why "retries" matter', fullTitle: 'Why "retries" matter · Backend Roadmap', description: 'A <b>short</b> description', url: '/blog/why-retries', type: 'article', ld: { '@type': 'BlogPosting', headline: 'Why retries matter' }, body: '<h1>Why retries matter</h1>' };

test('a page gets its own head, and its content inside #root', () => {
  const html = shellPage(SHELL, 'https://example.com', PAGE);
  assert.match(html, /<title>Why &quot;retries&quot; matter · Backend Roadmap<\/title>/);
  assert.match(html, /<meta name="description" content="A &lt;b&gt;short&lt;\/b&gt; description">/, 'text is escaped');
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/blog\/why-retries">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/example\.com\/blog\/why-retries">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<div id="root"><div class="prerender"><h1>Why retries matter<\/h1><\/div><\/div>/);
  assert.match(html, /<script type="application\/ld\+json">\{"@type":"BlogPosting","headline":"Why retries matter"\}<\/script>/);
  assert.match(html, /<style>\.prerender\{display:none\}<\/style>/, 'hidden until the app starts');
  assert.doesNotMatch(html, /name="robots"/, 'an ordinary page is indexed');
});

test('a page can have a picture of its own, and can be kept out of search results', () => {
  const html = shellPage(SHELL, 'https://example.com', { ...PAGE, noindex: true, image: { url: 'https://cdn.example/cover.png?a=1&b=2', width: 800, height: 450, alt: 'A cover' }, preload: ['/docs-index.json'] });
  assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.example\/cover\.png\?a=1&amp;b=2">/);
  assert.match(html, /<meta property="og:image:width" content="800">/);
  assert.match(html, /<meta property="og:image:height" content="450">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/cdn\.example\/cover\.png\?a=1&amp;b=2">/);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /<link rel="preload" href="\/docs-index\.json" as="fetch" crossorigin>/);
});

test('a picture of unknown size does not claim the shell\'s', () => {
  const html = shellPage(SHELL, 'https://example.com', { ...PAGE, image: { url: 'https://cdn.example/cover.png', alt: 'A cover' } });
  assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.example\/cover\.png">/);
  assert.doesNotMatch(html, /og:image:width|og:image:height/);
});

test('nothing in the data can close the script or the attribute it is written into', () => {
  const evil = '</script><script>alert(1)</script>';
  const html = shellPage(SHELL, 'https://example.com', { ...PAGE, title: evil, fullTitle: evil, description: `"><img src=x onerror=alert(1)> ${evil}`, ld: { headline: evil } });
  assert.doesNotMatch(html.replace(/<style>.*?<\/style>/g, ''), /<script>alert|<\/script><script|<img src=x/);
  assert.equal((html.match(/<script/g) || []).length, 1, 'one script, the structured data');
  assert.match(jsonLd({ a: '</script>' }), /\\u003c\/script>/);
});

test('a shell that has changed shape is an error, not a half-written page', () => {
  assert.throws(() => shellPage(SHELL.replace('<title>Backend Roadmap</title>', ''), 'https://example.com', PAGE), /no longer contains/);
  assert.throws(() => shellPage(SHELL.replace('<div id="root"></div>', '<div id="app"></div>'), 'https://example.com', PAGE), /no longer contains/);
});

test('escaping covers the five characters that matter', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
