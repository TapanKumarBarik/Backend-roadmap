// Browser checks for the parts of the site that have to keep working: a lesson opens with its heading, its text and a
// real link for every module; videos (one written into a module's text, and a module's own from content/videos.json,
// with its chapters) play under the real Content-Security-Policy and the Videos screen lists them; the landing page's
// animation is off for people who ask for less motion; and the built pages carry what search engines read.
//
// Needs a built site being served and a browser:
//
//   npm run build && npm run preview          (serves dist/ on http://localhost:4180)
//   npm run test:e2e
//
// BASE points it elsewhere (a deployed preview); E2E_EXECUTABLE names a Chromium binary, otherwise the installed
// browser channel from site.config.json (screenshots.browserChannel) is used.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CONTENT_ROOT, config, isPlaceholderText } from '../../scripts/lib/config.mjs';
import { parseClock } from '../../webapp/src/lib/curriculum/videos.js';
import { BASE, launchBrowser, openPage, publicVideos, aVideoLesson } from './support.mjs';

const LESSON = '/backend/03-authentication-and-authorization/01-sessions-and-cookies/';
const NEXT_LESSON = '/backend/03-authentication-and-authorization/02-jwt-deep-dive/';
const VIDEO_ID = 'jNQXAC9IVRw';
// A module with a public video of its own in content/videos.json (found there, so a video going public or private does not break the tests),
// a written lecture, and a lecture whose text is still to come.
const { url: VIDEO_LESSON, id: VIDEO_LESSON_ID } = aVideoLesson();
const LECTURE = '/system-design/01-core-fundamentals/01-what-is-system-design/';

// A lecture whose video is published but whose text is not written yet: found in the content, so writing the last of them does not
// break the tests. When there is none left, the checks about such a lecture are skipped (the unit tests keep the rule itself).
function findSoonLecture() {
  const { videos } = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'videos.json'), 'utf8'));
  for (const video of videos) {
    const file = path.join(CONTENT_ROOT, video.file);
    if (video.chapters?.length >= 3 && fs.existsSync(file) && isPlaceholderText(fs.readFileSync(file, 'utf8'))) {
      return { url: `/${video.file.replace(/README\.md$/, '')}`, summary: video.summary };
    }
  }
  return null;
}
const SOON = findSoonLecture();
const SOON_LECTURE = SOON?.url;
const NO_SOON = { skip: SOON ? false : 'every lecture with a video has its text now' };

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const open = (url, options) => openPage(browser, url, options);

// The built pages are read straight off disk (dist/), the way a crawler gets them, with no browser involved.
const builtPage = (url) => fs.readFileSync(path.join(ROOT, 'dist', ...url.split('/').filter(Boolean), 'index.html'), 'utf8');
// The title the build wrote into a page, as text. A lesson's title is its own heading, which its author changes, so a test compares the live page with
// the built one instead of naming a title; what it asserts about the title itself is the rule (topic first, no "Module 01:").
const unescapeHtml = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const builtTitle = (url) => unescapeHtml(/<title>([^<]*)<\/title>/.exec(builtPage(url))[1]);
const ldOf = (html) => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
// A PNG's size, read from its header (the 8-byte signature, then the IHDR chunk: width and height as 32-bit numbers).
function pngSize(file) {
  const png = fs.readFileSync(file);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${file} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('a lesson opens with a topic-first title, its heading, its text and real links in the sidebar', async () => {
  const { context, page, problems, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content p');
  assert.equal(await page.title(), builtTitle(LESSON), 'the live page says what the built page says');
  assert.doesNotMatch(await page.title(), /^(Module|Lesson) \d+/, 'topic first, not the number');
  assert.match(await page.textContent('h1.doc-title'), /Sessions and Cookies/);
  // Only the open tracks draw their rows (a closed one is none of the page's elements), and every row that is drawn is a real link.
  const rows = await page.locator('#sidebar .row[data-file]').count();
  assert.ok(rows >= 5 && rows < 300, `${rows} rows are drawn, not the whole curriculum`);
  assert.equal(await page.locator('#sidebar .row[data-file] a.name[href]').count(), rows, 'every module row is a link');
  assert.equal(await page.locator('.content-skeleton').count(), 0, 'the skeleton is gone once the text is there');
  assert.ok(await page.locator('#pager').count() === 1);
  // nothing makes the reading column scroll sideways
  assert.ok(await page.evaluate(() => document.querySelector('#main').scrollWidth <= document.querySelector('#main').clientWidth + 1));
  assert.deepEqual(problems.filter((p) => !/Content Security Policy|cloudflareinsights/.test(p) && !/\/api\//.test(p) && !/Failed to load resource/.test(p)), []);
  await context.close();
});

test('a line along the top fills as a lesson is read, and is empty at its start', async () => {
  const { context, page, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content p');
  const filled = () => page.locator('.read-progress i').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  assert.equal(await page.locator('.read-progress').count(), 1, 'one line, not two');
  assert.equal(await filled(), 0);
  await page.evaluate(() => { const m = document.querySelector('#main'); m.scrollTop = (m.scrollHeight - m.clientHeight) / 2; });
  await page.waitForFunction(() => Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.read-progress i')).transform).a - 0.5) < 0.05);
  await page.evaluate(() => { const m = document.querySelector('#main'); m.scrollTop = m.scrollHeight; });
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.read-progress i')).transform).a > 0.98);
  assert.equal(await page.locator('.read-progress').getAttribute('aria-hidden'), 'true', 'it says nothing a scrollbar does not');
  await context.close();
});

test('code is highlighted after the text, from its own chunk', async () => {
  const { context, page, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content .codeblock code.hljs', { timeout: 10000 });
  await context.close();
});

test('the heading is on screen before the text arrives, and nothing moves when it does', async () => {
  const { context, page } = await open(LESSON);
  await context.route('**/README.md', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  const loading = page.goto(BASE + LESSON, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1.doc-title');
  assert.equal(await page.locator('.content-skeleton').count(), 1, 'a skeleton holds the place of the text');
  assert.equal(await page.locator('#pager').count(), 0, 'the previous/next cards wait for the text');
  await loading;
  await page.waitForSelector('#content p');
  await page.waitForTimeout(800);
  assert.ok(await page.evaluate(() => window.__cls) < 0.05, 'layout shift stays well under the "good" limit of 0.1');
  await context.close();
});

test('a sidebar link opens the module in place; a click meant for a new tab is left to the browser', async () => {
  const { context, page, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content p');
  await page.evaluate(() => { window.__stillHere = true; document.addEventListener('click', (e) => { window.__defaultPrevented = e.defaultPrevented; }); });
  const link = page.locator(`#sidebar a.name[href="${NEXT_LESSON}"]`);
  await link.scrollIntoViewIfNeeded();
  await link.click({ modifiers: ['Control'] });
  assert.equal(await page.evaluate(() => window.__defaultPrevented), false, 'ctrl+click is not intercepted');
  for (const extra of context.pages()) if (extra !== page) await extra.close();
  await link.click();
  await page.waitForURL('**' + NEXT_LESSON);
  await page.waitForSelector('h1.doc-title');
  assert.equal(await page.evaluate(() => window.__stillHere), true, 'the page was not reloaded');
  assert.equal(await page.title(), builtTitle(NEXT_LESSON));
  await context.close();
});

test("the browser's Back and Forward buttons walk the pages you have read, and the page you are on adds nothing", async () => {
  const { context, page, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content p');
  await page.evaluate(() => { window.__stillHere = true; });
  await page.locator(`#sidebar a.name[href="${NEXT_LESSON}"]`).click();
  await page.waitForURL('**' + NEXT_LESSON);
  await page.waitForFunction((title) => document.title === title, builtTitle(NEXT_LESSON));

  await page.goBack();
  await page.waitForURL('**' + LESSON);
  await page.waitForFunction((title) => document.title === title, builtTitle(LESSON));
  assert.match(await page.textContent('h1.doc-title'), /Sessions and Cookies/);
  assert.equal(await page.evaluate(() => window.__stillHere), true, 'Back stayed on the site, without a reload');

  await page.goForward();
  await page.waitForURL('**' + NEXT_LESSON);
  await page.waitForFunction((title) => document.title === title, builtTitle(NEXT_LESSON));

  const entries = await page.evaluate(() => history.length);
  await page.locator(`#sidebar a.name[href="${NEXT_LESSON}"]`).click();
  assert.equal(await page.evaluate(() => history.length), entries, 'a click on the page you are already on adds no history entry');
  await context.close();
});

test('a YouTube link on a line of its own becomes a player that works under the real CSP', async () => {
  const { context, page, problems } = await open(LESSON, { withCsp: true });
  await context.route('**/01-sessions-and-cookies/README.md', async (route) => {
    const response = await route.fetch();
    // (the first line may end in \r\n, which `.` does not match)
    const text = (await response.text()).replace(/^(# [^\r\n]*\r?\n)/, `$1\n[Watch the walkthrough](https://youtu.be/${VIDEO_ID})\n`);
    await route.fulfill({ response, body: text });
  });
  await page.goto(BASE + LESSON, { waitUntil: 'networkidle' });
  await page.waitForSelector('#content .video');
  assert.equal(await page.locator('#content .video iframe').count(), 0, 'nothing is embedded until play is pressed');
  const loaded = await page.evaluate(async () => {
    const img = document.querySelector('#content .video img');
    if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
    return img.naturalWidth;
  });
  assert.ok(loaded > 0, 'the thumbnail is allowed by the policy and loads');
  assert.equal(await page.locator('#content .video .video-link').getAttribute('href'), `https://www.youtube.com/watch?v=${VIDEO_ID}`, 'it is still a link to the video');
  await page.click('#content .video .video-link');
  const frame = page.locator('#content .video iframe');
  await frame.waitFor();
  assert.match(await frame.getAttribute('src'), new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${VIDEO_ID}`));
  await page.waitForTimeout(1500);
  assert.deepEqual(problems.filter((p) => /Content Security Policy/i.test(p)), [], 'the policy blocks nothing the video needs');
  await context.close();
});

test('the landing page: a route that draws itself, a YouTube link, and none of the motion for anyone who opted out', async () => {
  const moving = await open('/', { seenLanding: false });
  await moving.goto();
  await moving.page.waitForSelector('.lp-route li');
  const animations = await moving.page.evaluate(() => [...document.querySelectorAll('.lp-route li')].map((li) => getComputedStyle(li).animationName));
  assert.ok(animations.every((name) => name === 'lp-stop'), 'each stop is animated');
  assert.equal(await moving.page.locator('.lp-video-acts a[href*="youtube.com/@"]').count(), 1);
  assert.equal(await moving.page.locator('.lp-video-strip .vid-card').count(), 4, 'the newest videos are shown');
  assert.ok(await moving.page.locator('.site-footer a[href*="youtube.com/@"]').count() >= 1);
  await moving.page.click('.lp-video-acts button');
  await moving.page.waitForSelector('.vid-screen');
  assert.equal(new URL(moving.page.url()).pathname, '/videos/', 'the way to all of them opens the Videos page, at its own address');
  await moving.context.close();

  const still = await open('/', { seenLanding: false, motion: 'reduce' });
  await still.goto();
  await still.page.waitForSelector('.lp-route li');
  const state = await still.page.evaluate(() => [...document.querySelectorAll('.lp-route li')].map((li) => ({ opacity: getComputedStyle(li).opacity, name: getComputedStyle(li).animationName })));
  assert.ok(state.every((s) => s.opacity === '1' && s.name === 'none'), 'every stop is simply there: ' + JSON.stringify(state));
  assert.equal(await still.page.evaluate(() => getComputedStyle(document.querySelector('#main') || document.body).scrollBehavior), 'auto');
  await still.context.close();
});

test('a module with a video shows it under the title, and a chapter starts the player there under the real CSP', async () => {
  const { context, page, problems } = await open(VIDEO_LESSON, { withCsp: true });
  await page.goto(BASE + VIDEO_LESSON, { waitUntil: 'networkidle' });
  await page.waitForSelector('.lecture .video');
  assert.equal(await page.locator('.lecture .video iframe').count(), 0, 'nothing is embedded until play is pressed');
  assert.equal(await page.locator('.lecture .video .video-link').getAttribute('href'), `https://www.youtube.com/watch?v=${VIDEO_LESSON_ID}`, 'it is still a link to the video');
  assert.ok(await page.locator('.lecture-chapter').count() >= 3, 'the chapters are listed');
  assert.equal(await page.locator(`#sidebar .row[data-file="${VIDEO_LESSON.slice(1)}README.md"] .vid-tag`).count(), 1, 'the sidebar marks a module that has a video');

  const chapter = page.locator('.lecture-chapter').nth(2);
  const second = parseClock(await chapter.locator('.ts').textContent());
  assert.ok(second > 0);
  await chapter.click();
  await page.locator('.lecture .video iframe').waitFor();
  const src = await page.locator('.lecture .video iframe').getAttribute('src');
  assert.match(src, new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${VIDEO_LESSON_ID}\\?`));
  assert.ok(src.includes(`start=${second}`), 'the player starts at the chapter: ' + src);
  assert.equal(await chapter.getAttribute('aria-current'), 'true');

  await page.locator('.lecture-chapter').nth(0).click(); // back to the beginning: the player restarts without an offset
  await page.waitForFunction(() => !/start=/.test(document.querySelector('.lecture .video iframe')?.getAttribute('src') || 'start='));
  await page.waitForTimeout(1500);
  assert.deepEqual(problems.filter((p) => /Content Security Policy/i.test(p)), [], 'the policy blocks nothing the video needs');
  await context.close();
});

test('a written lecture has its video and its text', async () => {
  const written = await open(LECTURE);
  await written.goto();
  await written.page.waitForSelector('#content p');
  assert.equal(await written.page.title(), 'What Is System Design? HLD vs LLD · Backend Roadmap');
  assert.equal(await written.page.locator('.lecture .video').count(), 1);
  assert.ok(await written.page.locator('.lecture-chapter').count() >= 3);
  assert.ok(await written.page.locator('#content .codeblock').count() >= 4, 'the lecture has its code');
  assert.equal(await written.page.locator('.help-write').count(), 0, 'a written lecture does not ask for an author');
  await written.context.close();
});

test('a lecture whose text is still to come has the video and says so', NO_SOON, async () => {
  const soon = await open(SOON_LECTURE);
  await soon.goto();
  await soon.page.waitForSelector('.help-write');
  assert.equal(await soon.page.locator('.lecture .video').count(), 1, 'the video plays even though the text is not written yet');
  assert.ok(await soon.page.locator('.lecture-chapter').count() >= 3);
  await soon.context.close();
});

test('the Videos screen lists every video, filters them, and a card opens its module with the video at the top', async () => {
  const { videos } = publicVideos();
  const { context, page } = await open('/videos/');
  await page.goto(BASE + '/videos/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.vid-card');
  assert.equal(await page.locator('.vid-card').count(), videos.length, 'every public video is listed, and none that is still scheduled');

  await page.click('.vid-chip:has-text("Phase 1")');
  assert.equal(await page.locator('.vid-card').count(), videos.filter((v) => v.playlist === 'phase-1').length);
  await page.click('.vid-chip:has-text("All")');
  assert.equal(await page.locator('.vid-card').count(), videos.length);

  // A video with a title of its own among the public ones, that belongs to a module: search for it, open its card.
  const one = videos.find((v) => v.file && videos.filter((w) => w.title.toLowerCase().includes(v.title.toLowerCase())).length === 1);
  await page.fill('.vid-filter input', one.title);
  await page.waitForFunction(() => document.querySelectorAll('.vid-card').length === 1);
  await page.click('.vid-card');
  await page.waitForSelector('.lecture .video');
  assert.equal(new URL(page.url()).pathname, `/${one.file.replace(/README\.md$/, '')}`);
  await context.close();
});

test('the built pages carry what search engines read', () => {
  const dist = path.join(ROOT, 'dist');
  assert.ok(fs.existsSync(dist), 'run `npm run build` first');
  const html = fs.readFileSync(path.join(dist, ...LESSON.split('/').filter(Boolean), 'index.html'), 'utf8');
  assert.match(html, /<title>[^<]{8,}<\/title>/);
  assert.doesNotMatch(builtTitle(LESSON), /^(Module|Lesson) \d+/, 'topic first');
  assert.match(html, new RegExp(`<link rel="canonical" href="${config.site.url}${LESSON}">`));
  assert.match(html, /<link rel="preload" href="\/backend\/03-authentication-and-authorization\/01-sessions-and-cookies\/README\.md" as="fetch" crossorigin>/);
  assert.match(html, /<link rel="preload" href="\/docs-index\.json" as="fetch" crossorigin>/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  const article = ld['@graph'].find((x) => x['@type'] === 'TechArticle');
  assert.equal(article.author.name, config.developer.name);
  assert.ok(article.author.sameAs.includes(config.youtube.channel));
  assert.match(article.dateModified, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(html, /<nav aria-label="Previous and next">.*02-jwt-deep-dive/s);
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  assert.ok((sitemap.match(/<lastmod>/g) || []).length > 500, 'the sitemap carries dates');
  const titles = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].length;
  assert.ok(titles > 600);
  assert.match(fs.readFileSync(path.join(ROOT, 'webapp/public/_headers'), 'utf8'), /\/\*\.md\s+X-Robots-Tag: noindex/);
  assert.ok(!/VideoObject/.test(html), 'a module without a video has no video data');
  const card = `${config.shareImage.dir}${LESSON.replace(/\/$/, '')}.png`;
  assert.match(html, new RegExp(`<meta property="og:image" content="${config.site.url}/${card}">`), 'and shares a card of its own');
  assert.match(html, new RegExp(`<meta property="og:image:width" content="${config.shareImage.width}">`));
  assert.match(html, new RegExp(`<meta name="twitter:image" content="${config.site.url}/${card}">`));
  assert.deepEqual(pngSize(path.join(dist, card)), { width: config.shareImage.width, height: config.shareImage.height }, 'and the card is a PNG of the size the page says');
  assert.equal(article.image, `${config.site.url}/${card}`, 'which the structured data names too');
});

test('a module with a video carries it in its built page: structured data, a plain link and a card for the preview', () => {
  const html = builtPage(VIDEO_LESSON);
  const video = ldOf(html)['@graph'].find((x) => x['@type'] === 'VideoObject');
  assert.equal(video.embedUrl, `https://www.youtube-nocookie.com/embed/${VIDEO_LESSON_ID}`);
  assert.equal(video.thumbnailUrl, `https://i.ytimg.com/vi/${VIDEO_LESSON_ID}/hqdefault.jpg`);
  assert.match(video.uploadDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(video.duration, /^PT\d+M\d+S$/);
  assert.ok(video.name && video.description);
  assert.match(html, new RegExp(`<meta property="og:image" content="${config.site.url}/${config.shareImage.dir}${VIDEO_LESSON.replace(/\/$/, '')}\\.png">`));
  assert.match(html, new RegExp(`<section aria-label="Video"><p><a href="https://www\\.youtube\\.com/watch\\?v=${VIDEO_LESSON_ID}">`));
  const { tree } = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'docs-index.json'), 'utf8'));
  const marked = [];
  (function walk(nodes) { for (const n of nodes) { if (n.videos) marked.push(n.file); walk(n.children || []); } })(tree);
  assert.ok(marked.includes(`${VIDEO_LESSON.slice(1)}README.md`), 'the module index records which modules have a video');
});

test('a lecture whose text is not written yet is a page about its video: indexed, in the sitemap, described by the video', NO_SOON, () => {
  const html = builtPage(SOON_LECTURE);
  assert.doesNotMatch(html, /<meta name="robots"/, 'it is not kept out of search results');
  assert.match(fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8'), new RegExp(`<loc>${config.site.url}${SOON_LECTURE}</loc>`));
  const graph = ldOf(html)['@graph'];
  assert.ok(graph.some((x) => x['@type'] === 'WebPage') && !graph.some((x) => x['@type'] === 'TechArticle'), 'it is a page, not an article');
  assert.ok(graph.some((x) => x['@type'] === 'VideoObject'));
  const description = /<meta name="description" content="([^"]*)">/.exec(html)[1];
  assert.ok(description.length > 40, 'described by what the video says about itself');
  assert.match(html, new RegExp(`<meta property="og:image" content="${config.site.url}/${config.shareImage.dir}${SOON_LECTURE.replace(/\/$/, '')}\\.png">`));
  const track = `/${SOON_LECTURE.split('/').filter(Boolean).slice(0, 2).join('/')}/`;
  assert.match(builtPage(track), new RegExp(`<a href="${SOON_LECTURE}">`), 'and its track links to it, so a crawler can find it');
});

test('an unwritten module with no video stays out of search results and keeps the site picture', () => {
  const unwritten = '/genai/09-retrieval-augmented-generation/00-why-rag-exists/';
  const html = builtPage(unwritten);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8'), new RegExp(`<loc>${config.site.url}${unwritten}</loc>`));
  assert.match(html, new RegExp(`<meta property="og:image" content="${config.site.url}${config.site.socialImage}">`));
  assert.ok(!fs.existsSync(path.join(ROOT, 'dist', config.shareImage.dir, ...unwritten.split('/').filter(Boolean)) + '.png'));
});

test('every curriculum\'s own page is indexed and in the sitemap (an overview is not mistaken for an unwritten module)', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8');
  for (const curriculum of config.content.curricula) {
    assert.doesNotMatch(builtPage(`/${curriculum}/`), /<meta name="robots"/, `/${curriculum}/ is not kept out of search results`);
    assert.match(sitemap, new RegExp(`<loc>${config.site.url}/${curriculum}/</loc>`), `/${curriculum}/ is in the sitemap`);
  }
});

test('the home page has something to read without JavaScript: a headline, sections, the real count and links in', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  const stats = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'site-stats.json'), 'utf8'));
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.ok((html.match(/<h2>/g) || []).length >= 4, 'it has sections');
  const description = /<meta name="description" content="([^"]*)">/.exec(html)[1];
  assert.ok(description.includes(`${stats.modules.written} modules`), 'the description carries the real number of modules');
  assert.ok(description.length <= 160);
  for (const curriculum of config.content.curricula) assert.match(html, new RegExp(`<a href="/${curriculum}/">`), `it links to ${curriculum}`);
  assert.match(html, /<a href="\/backend\/[^"]+">[^<]+<\/a>: /, 'and to the first modules of the learning paths');
  const site = ldOf(html)['@graph'].find((x) => x['@type'] === 'WebSite');
  assert.equal(site.description, description);
  assert.match(html, new RegExp(`<meta property="og:image" content="${config.site.url}${config.site.socialImage}">`), 'it keeps the site\'s own picture');
});

test('the sidebar shows one area of the library at a time: its header, its tracks under headings, and a switcher that follows what is read', async () => {
  const { context, page, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content p');
  const pressed = () => page.locator('#areaRow button[aria-pressed="true"]').allTextContents();
  assert.deepEqual(await pressed(), ['Backend'], 'a lesson opens in its own area');
  assert.equal((await page.locator('.area-head__name').textContent()).trim(), 'Backend Engineering');
  assert.match(await page.locator('.area-head__count').textContent(), /^\d+ of \d+ modules done$/);
  const headings = await page.locator('#tree .tree-group__label').allTextContents();
  assert.ok(headings.includes('The request path') && headings.includes('Data and speed'), 'the tracks are grouped under headings: ' + headings.join(', '));
  assert.equal(await page.locator(`#tree a.name[href="${LESSON}"]`).count(), 1, 'the lesson being read is in the tree');
  assert.equal(await page.locator('#tree a.name[href^="/genai/"]').count(), 0, 'another area is not');

  await page.locator('#areaRow button', { hasText: 'GenAI' }).click();
  await page.waitForFunction(() => document.querySelector('.area-head__name')?.textContent.trim() === 'GenAI Engineering');
  assert.deepEqual(await pressed(), ['GenAI']);
  assert.ok((await page.locator('#tree .tree-group__label').allTextContents()).includes('Agents'), 'each area has its own headings');

  await page.locator('#areaRow button', { hasText: 'All areas' }).click();
  await page.waitForFunction(() => !document.querySelector('.area-head'));
  assert.equal(await page.locator('#tree > li.node').count(), config.content.curricula.length, 'every area is one row');
  assert.equal((await page.locator('#tree > li.node .name').first().textContent()).replace(/\s+/g, ' ').trim(), config.content.areas[config.content.curricula[0]].label, 'named as the config says');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#content p');
  assert.deepEqual(await pressed(), ['All areas'], 'what the reader picked is remembered');
  await context.close();
});

test('opening a lesson of another area moves the switcher there, so the lesson never vanishes from the tree', async () => {
  const { context, page, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content p');
  await page.locator('#areaRow button', { hasText: 'Backend' }).click(); // a pick of its own, not just the default
  await page.evaluate(() => { location.assign('/genai/05-gpus-and-genai-hardware/05-calculating-a-models-memory-requirements/'); });
  await page.waitForSelector('#content p');
  assert.deepEqual(await page.locator('#areaRow button[aria-pressed="true"]').allTextContents(), ['GenAI']);
  assert.equal(await page.locator('#tree a.name[aria-current="page"]').count(), 1, 'the open lesson is in the tree');
  await context.close();
});
