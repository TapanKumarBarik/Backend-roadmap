import test from 'node:test';
import assert from 'node:assert/strict';
import { DocError, isEmptyDoc, safeHref, safeImageSrc, sanitizeDoc } from './sanitizeDoc.js';
import { renderDoc } from './renderDoc.js';
import { anchorOf, headingAnchor, plainText, readingStats, tocOf } from './docText.js';
import { handleProblem, slugify, uniqueSlug } from './slug.js';
import { BLOG, CALLOUTS } from './limits.js';
import { slugify as moduleSlugify } from '../markdown/markdown.js';

const IMAGES = ['https://uploads.example.net/feed-uploads/', 'https://uploads.example.net/images/'];
const OPTIONS = { imageOrigins: IMAGES };
const GOOD_IMAGE = 'https://uploads.example.net/feed-uploads/1700000000000-diagram.png';

const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const doc = (...content) => ({ type: 'doc', content });
const clean = (input) => sanitizeDoc(input, OPTIONS);
const html = (input) => renderDoc(clean(input).doc, OPTIONS);
// The tags of a page with every quoted attribute value blanked: the markup itself, where an injected tag or attribute would
// show. (Text that merely says "onerror", or an escaped quote inside a value, is not markup and is not in it.)
const markupOnly = (page) => (page.match(/<[^>]*>/g) || []).map((tag) => tag.replace(/"[^"]*"/g, '""')).join('');

// ---------------------------------------------------------------------------------------------------- a good document

const GOOD = doc(
  { type: 'heading', attrs: { level: 2 }, content: [t('Why retries need idempotency')] },
  p(t('A retry that runs twice must '), t('change nothing', [{ type: 'bold' }, { type: 'italic' }]), t(' the second time. See '), t('the RFC', [{ type: 'link', attrs: { href: 'https://www.rfc-editor.org/rfc/rfc9110' } }]), t('.')),
  { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('keys'))] }, { type: 'listItem', content: [p(t('constraints'))] }] },
  { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('third'))] }] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] }] },
  { type: 'blockquote', content: [p(t('A quote.'))] },
  { type: 'callout', attrs: { tone: 'warning' }, content: [p(t('Careful.'))] },
  { type: 'codeBlock', attrs: { language: 'python' }, content: [t('def charge(key):\n    return store.get(key)')] },
  { type: 'image', attrs: { src: GOOD_IMAGE, alt: 'A diagram', title: 'Figure 1' } },
  { type: 'video', attrs: { provider: 'youtube', id: 'aNVDz45U-cM' } },
  { type: 'horizontalRule' },
  { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [p(t('Method'))] }, { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [p(t('Safe'))] }] }, { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p(t('GET'))] }, { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p(t('yes'))] }] }] }
);

test('a document the editor could have produced comes back unchanged, with nothing dropped', () => {
  const { doc: out, dropped } = clean(GOOD);
  assert.deepEqual(out, GOOD);
  assert.deepEqual(dropped, []);
});

test('it is drawn as the HTML a reader and a crawler get', () => {
  const out = html(GOOD);
  assert.match(out, /<h2 id="why-retries-need-idempotency">Why retries need idempotency<\/h2>/);
  assert.match(out, /<strong><em>change nothing<\/em><\/strong>|<em><strong>change nothing<\/strong><\/em>/);
  assert.match(out, /<a href="https:\/\/www\.rfc-editor\.org\/rfc\/rfc9110" rel="nofollow ugc noopener noreferrer" target="_blank">the RFC<\/a>/);
  assert.match(out, /<ol start="3"><li><p>third<\/p><\/li><\/ol>/);
  assert.match(out, /<pre><code class="language-python">def charge\(key\):\n {4}return store\.get\(key\)<\/code><\/pre>/);
  assert.match(out, new RegExp(`<figure><img src="${GOOD_IMAGE}" alt="A diagram" loading="lazy" decoding="async"><figcaption>Figure 1</figcaption></figure>`));
  assert.match(out, /<figure class="video" data-video="aNVDz45U-cM"><a class="video-link" href="https:\/\/www\.youtube\.com\/watch\?v=aNVDz45U-cM" target="_blank" rel="noopener noreferrer"><img src="https:\/\/i\.ytimg\.com\/vi\/aNVDz45U-cM\/hqdefault\.jpg"/);
  assert.match(out, /<div class="cblock cblock-pitfall"><div class="cblock-h">Warning<\/div><div class="cblock-b"><p>Careful\.<\/p><\/div><\/div>/);
  assert.match(out, /<table><thead><tr><th><p>Method<\/p><\/th><th><p>Safe<\/p><\/th><\/tr><\/thead><tbody><tr><td><p>GET<\/p><\/td><td><p>yes<\/p><\/td><\/tr><\/tbody><\/table>/);
});

// ------------------------------------------------------------------------------------------------- hostile documents

test('markup in text is text: it is escaped, never HTML', () => {
  const out = html(doc(p(t('<script>alert(1)</script> & <img src=x onerror=alert(1)>'))));
  assert.doesNotMatch(out, /<script|<img/);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &lt;img src=x onerror=alert\(1\)&gt;/);
});

test('a link may only go to the web, an e-mail address, a path on this site or a fragment', () => {
  for (const href of ['https://example.org/a?b=1#c', 'http://example.org/', 'mailto:ada@example.org', '/blog/a-post', '#intro']) {
    assert.equal(safeHref(href), href, href);
  }
  const tab = String.fromCharCode(9);
  const hostile = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ` javascript:alert(1)`, `java${tab}script:alert(1)`, 'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)', 'file:///etc/passwd', '//evil.example/x', `/${String.fromCharCode(92)}evil.example`, 'ftp://example.org', '', '   ',
    'https://' + 'a'.repeat(BLOG.hrefMax), 42, null, undefined, {}
  ];
  for (const href of hostile) assert.equal(safeHref(href), null, String(href).slice(0, 40));
});

test('an unsafe link loses its link and keeps its words', () => {
  const { doc: out, dropped } = clean(doc(p(t('click me', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))));
  assert.deepEqual(out.content[0].content, [{ type: 'text', text: 'click me' }]);
  assert.deepEqual(dropped, ['link:unsafe']);
  assert.doesNotMatch(renderDoc(out, OPTIONS), /javascript|<a /);
});

test('an image must be one of our own uploads: nothing from the site itself, a look-alike host or another place', () => {
  assert.equal(safeImageSrc(GOOD_IMAGE, IMAGES), GOOD_IMAGE);
  const hostile = [
    '/api/auth/logout', '/api/streak', 'https://uploads.example.net/other/x.png', 'https://evil.example/feed-uploads/x.png',
    'https://uploads.example.net@evil.example/feed-uploads/x.png', 'https://user:pw@uploads.example.net/feed-uploads/x.png',
    'https://uploads.example.net/feed-uploads/../secrets/x.png', 'https://uploads.example.net/feed-uploads/', 'http://uploads.example.net/feed-uploads/x.png',
    'data:image/svg+xml,<svg onload=alert(1)>', 'javascript:alert(1)', '//uploads.example.net/feed-uploads/x.png', null, 7
  ];
  for (const src of hostile) assert.equal(safeImageSrc(src, IMAGES), null, String(src));
  assert.equal(safeImageSrc(GOOD_IMAGE, []), null, 'with no upload location configured no image is accepted');
});

test('a bad image is dropped and reported; a good one next to it stays', () => {
  const { doc: out, dropped } = clean(doc(
    { type: 'image', attrs: { src: '/api/auth/logout', alt: 'x' } },
    { type: 'image', attrs: { src: GOOD_IMAGE, alt: 'ok' } }
  ));
  assert.equal(out.content.length, 1);
  assert.equal(out.content[0].attrs.src, GOOD_IMAGE);
  assert.deepEqual(dropped, ['image:unsafe']);
});

test('quotes in alt text, a caption or a language cannot break out of an attribute', () => {
  const evil = '" onerror="alert(1)';
  const out = html(doc(
    { type: 'image', attrs: { src: GOOD_IMAGE, alt: evil, title: evil } },
    { type: 'codeBlock', attrs: { language: `js${evil}` }, content: [t('x')] },
    { type: 'video', attrs: { provider: 'youtube', id: 'abc"><script>alert(1)</script>' } },
    p(t('text', [{ type: 'link', attrs: { href: `https://example.org/"${evil}` } }]))
  ));
  assert.doesNotMatch(markupOnly(out), /<script|onerror|onmouseover/, 'no injected attribute, and no tag');
  assert.match(out, /alt="&quot; onerror=&quot;alert\(1\)"/);
  assert.doesNotMatch(out, /class="video"/, 'a video with a bad id is not drawn');
  assert.match(out, /<code>x<\/code>/, 'a language that is not a language name is not used');
});

test('node types that are not in the allow-list are dropped, and the kinds are reported', () => {
  const { doc: out, dropped } = clean(doc(
    { type: 'script', content: [t('alert(1)')] },
    { type: 'iframe', attrs: { src: 'https://evil.example' } },
    { type: 'html', attrs: { value: '<b>x</b>' } },
    p(t('kept'))
  ));
  assert.deepEqual(out.content, [p(t('kept'))]);
  assert.deepEqual(dropped, ['node:html', 'node:iframe', 'node:script']);
});

test('attributes that were not asked for are not kept, whatever they say', () => {
  const { doc: out } = clean(doc({ type: 'paragraph', attrs: { onclick: 'alert(1)', id: 'x', style: 'display:none' }, content: [{ type: 'text', text: 'hi', attrs: { onclick: 'x' }, marks: [{ type: 'bold', attrs: { onclick: 'x' } }] }] }));
  assert.deepEqual(out, doc(p(t('hi', [{ type: 'bold' }]))));
});

test('a code block holds plain text only, and an unknown mark is dropped', () => {
  const { doc: out, dropped } = clean(doc(
    { type: 'codeBlock', content: [t('x', [{ type: 'link', attrs: { href: 'https://example.org' } }])] },
    p(t('y', [{ type: 'highlight' }]))
  ));
  assert.deepEqual(out.content[0], { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'x' }] });
  assert.deepEqual(dropped, ['mark:highlight']);
});

test('values are coerced to what they must be', () => {
  const { doc: out } = clean(doc(
    { type: 'heading', attrs: { level: 1 }, content: [t('a')] },
    { type: 'heading', attrs: { level: 99 }, content: [t('b')] },
    { type: 'heading', attrs: { level: 'x' }, content: [t('c')] },
    { type: 'callout', attrs: { tone: 'explode' }, content: [p(t('d'))] },
    { type: 'orderedList', attrs: { start: -5 }, content: [{ type: 'listItem', content: [p(t('e'))] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: 'yes' }, content: [p(t('f'))] }] }
  ));
  assert.deepEqual(out.content.slice(0, 3).map((n) => n.attrs.level), [2, 4, 2]);
  assert.equal(out.content[3].attrs.tone, 'note');
  assert.equal(out.content[4].attrs.start, 1);
  assert.equal(out.content[5].content[0].attrs.checked, false, 'only true is true');
});

test('control characters are removed from text and attributes', () => {
  const nul = String.fromCharCode(0);
  const { doc: out } = clean(doc(p(t(`a${nul}b${String.fromCharCode(7)}c`)), { type: 'image', attrs: { src: GOOD_IMAGE, alt: `x${nul}y` } }));
  assert.equal(out.content[0].content[0].text, 'abc');
  assert.equal(out.content[1].attrs.alt, 'xy');
});

test('a document built to exhaust the server is refused, not truncated', () => {
  let nested = p(t('x'));
  for (let i = 0; i < BLOG.depthMax + 4; i++) nested = { type: 'blockquote', content: [nested] };
  assert.throws(() => clean(doc(nested)), DocError);

  assert.throws(() => clean(doc(...Array.from({ length: BLOG.nodesMax + 1 }, () => p()))), DocError);
  for (const bad of [null, undefined, 'doc', 5, [], {}, { type: 'paragraph' }]) assert.throws(() => sanitizeDoc(bad, OPTIONS), DocError);
});

test('empty and structurally empty documents are made valid', () => {
  assert.deepEqual(clean(doc()).doc, doc(p()));
  const { doc: out } = clean(doc({ type: 'bulletList', content: [] }, { type: 'table', content: [{ type: 'tableRow', content: [] }] }, { type: 'blockquote', content: [] }));
  assert.deepEqual(out, doc({ type: 'blockquote', content: [p()] }), 'empty lists and tables go; an empty quote gets a paragraph');
  assert.equal(isEmptyDoc(clean(doc(p(), p(t('   ')))).doc), true);
  assert.equal(isEmptyDoc(clean(GOOD).doc), false);
  assert.equal(isEmptyDoc(clean(doc({ type: 'image', attrs: { src: GOOD_IMAGE } })).doc), false, 'a picture is something');
});

test('drawing a document that skipped the sanitiser still writes nothing dangerous', () => {
  const raw = doc(
    p(t('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    { type: 'image', attrs: { src: '/api/auth/logout', alt: 'x' } },
    { type: 'script', content: [t('alert(1)')] },
    { type: 'codeBlock', attrs: { language: 'js" onmouseover="x' }, content: [t('<b>')] },
    { type: 'callout', attrs: { tone: '"><script>' }, content: [p(t('c'))] }
  );
  const out = renderDoc(raw, OPTIONS);
  assert.doesNotMatch(out, /javascript:|<script|\/api\/auth|onmouseover|<img|<b>/);
  assert.match(out, /cblock-note/);
});

// ------------------------------------------------------------------------------------------- what is read off a document

test('plain text, reading time (code is not read) and the table of contents', () => {
  const d = clean(doc(
    { type: 'heading', attrs: { level: 2 }, content: [t('Intro')] }, p(t('one two three')),
    { type: 'heading', attrs: { level: 3 }, content: [t('Intro')] }, p(t('four five')),
    { type: 'codeBlock', content: [t('a b c d e f g h i j')] }
  )).doc;
  assert.match(plainText(d), /^Intro\n\none two three\n\nIntro\n\nfour five\n\na b c d e f g h i j$/);
  assert.deepEqual(readingStats(d), { words: 7, minutes: 1 });
  assert.deepEqual(readingStats(clean(doc(p(t('word '.repeat(2100))))).doc, 210), { words: 2100, minutes: 10 });
  assert.deepEqual(tocOf(d), [{ id: 'intro', text: 'Intro', level: 2 }, { id: 'intro-1', text: 'Intro', level: 3 }]);
  assert.match(renderDoc(d, OPTIONS), /<h2 id="intro">Intro<\/h2>.*<h3 id="intro-1">Intro<\/h3>/s, 'the page uses the same ids as the contents');
  assert.equal(anchorOf('Caching & TTLs: what to expect'), 'caching-ttls-what-to-expect');
  assert.equal(anchorOf('Résumé naïve café'), 'resume-naive-cafe');
});

test('a heading gets the id the curriculum pages would give it, so a link works before and after the app starts', () => {
  for (const heading of ['Caching & TTLs: what to expect', 'snake_case names', "What's new?", 'C++ basics', 'Résumé café', '  padded  ', '日本語', 'a'.repeat(100), 'HTTP/2 and 3']) {
    assert.equal(headingAnchor(heading), moduleSlugify(heading) || 'section', JSON.stringify(heading));
  }
});

test('every callout an author can pick is a content block of the curriculum, and a table without a header row has no head', () => {
  for (const [tone, { label, cls }] of Object.entries(CALLOUTS)) {
    assert.match(html(doc({ type: 'callout', attrs: { tone }, content: [p(t('x'))] })), new RegExp(`<div class="cblock cblock-${cls}"><div class="cblock-h">${label}</div>`), tone);
  }
  const cell = (text) => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p(t(text))] });
  const table = html(doc({ type: 'table', content: [{ type: 'tableRow', content: [cell('a'), cell('b')] }] }));
  assert.equal(table, '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>');
});

// ----------------------------------------------------------------------------------------------------- slugs and handles

test('a title becomes a path segment, and a taken one gets a number', async () => {
  assert.equal(slugify('Why Retries Need Idempotency!'), 'why-retries-need-idempotency');
  assert.equal(slugify('   '), 'post');
  assert.equal(slugify('日本語'), 'post');
  assert.equal(slugify('a'.repeat(100)).length, 60);
  const taken = new Set(['why-retries', 'why-retries-2']);
  assert.equal(await uniqueSlug('Why retries', async (s) => taken.has(s)), 'why-retries-3');
  assert.equal(await uniqueSlug('New', async () => false), 'new-post', 'a word the app uses as an address is not used bare');
});

test('which handles are allowed', () => {
  for (const ok of ['ada', 'tapan-barik', 'a1b', 'x'.repeat(30)]) assert.equal(handleProblem(ok), null, ok);
  for (const bad of ['', 'ab', 'x'.repeat(31), '-ada', 'ada-', 'a--b', 'Ada', 'a b', 'ada_lovelace', 'admin', 'write', 'authors', 5, null]) assert.ok(handleProblem(bad), String(bad));
});
