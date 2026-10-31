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
import { ROOT, config } from '../../scripts/lib/config.mjs';
import { parseClock } from '../../webapp/src/lib/curriculum/videos.js';
import { BASE, launchBrowser, openPage } from './support.mjs';

const LESSON = '/backend/03-authentication-and-authorization/01-sessions-and-cookies/';
const NEXT_LESSON = '/backend/03-authentication-and-authorization/02-jwt-deep-dive/';
const VIDEO_ID = 'jNQXAC9IVRw';
// A module with a video of its own in content/videos.json, a written lecture, and a lecture whose text is still to come.
const VIDEO_LESSON = '/backend/10-distributed-systems-patterns/01-idempotency-in-practice/';
const VIDEO_LESSON_ID = 'UQ_2Fuc3QmE';
const LECTURE = '/system-design/01-core-fundamentals/01-what-is-system-design/';
const SOON_LECTURE = '/system-design/01-core-fundamentals/02-client-server-and-multi-tier-architecture/';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const open = (url, options) => openPage(browser, url, options);

test('a lesson opens with a topic-first title, its heading, its text and real links in the sidebar', async () => {
  const { context, page, problems, goto } = await open(LESSON);
  await goto();
  await page.waitForSelector('#content p');
  assert.equal(await page.title(), 'Sessions and Cookies · Backend Roadmap');
  assert.match(await page.textContent('h1.doc-title'), /Sessions and Cookies/);
  assert.ok(await page.locator('#sidebar a.name[href]').count() > 700, 'every module row is a link');
  assert.equal(await page.locator('.content-skeleton').count(), 0, 'the skeleton is gone once the text is there');
  assert.ok(await page.locator('#pager').count() === 1);
  // nothing makes the reading column scroll sideways
  assert.ok(await page.evaluate(() => document.querySelector('#main').scrollWidth <= document.querySelector('#main').clientWidth + 1));
  assert.deepEqual(problems.filter((p) => !/Content Security Policy|cloudflareinsights/.test(p) && !/\/api\//.test(p) && !/Failed to load resource/.test(p)), []);
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
  assert.equal(await page.title(), 'JWT Deep Dive · Backend Roadmap');
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
  assert.equal(new URL(moving.page.url()).hash, '#__videos', 'the way to all of them opens the Videos screen');
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

test('a written lecture has its video and its text; one still to come has the video and says so', async () => {
  const written = await open(LECTURE);
  await written.goto();
  await written.page.waitForSelector('#content p');
  assert.equal(await written.page.title(), 'What Is System Design? HLD vs LLD · Backend Roadmap');
  assert.equal(await written.page.locator('.lecture .video').count(), 1);
  assert.ok(await written.page.locator('.lecture-chapter').count() >= 3);
  assert.ok(await written.page.locator('#content .codeblock').count() >= 4, 'the lecture has its code');
  assert.equal(await written.page.locator('.help-write').count(), 0, 'a written lecture does not ask for an author');
  await written.context.close();

  const soon = await open(SOON_LECTURE);
  await soon.goto();
  await soon.page.waitForSelector('.help-write');
  assert.equal(await soon.page.locator('.lecture .video').count(), 1, 'the video plays even though the text is not written yet');
  assert.ok(await soon.page.locator('.lecture-chapter').count() >= 3);
  await soon.context.close();
});

test('the Videos screen lists every video, filters them, and a card opens its module with the video at the top', async () => {
  const { videos } = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'videos.json'), 'utf8'));
  const { context, page } = await open('/#__videos');
  await page.goto(BASE + '/#__videos', { waitUntil: 'networkidle' });
  await page.waitForSelector('.vid-card');
  assert.equal(await page.locator('.vid-card').count(), videos.length, 'every video is listed');

  await page.click('.vid-chip:has-text("Phase 1")');
  assert.equal(await page.locator('.vid-card').count(), videos.filter((v) => v.playlist === 'phase-1').length);
  await page.click('.vid-chip:has-text("All")');
  assert.equal(await page.locator('.vid-card').count(), videos.length);

  await page.fill('.vid-filter input', 'Why Deep Pages Are Slow');
  await page.waitForFunction(() => document.querySelectorAll('.vid-card').length === 1);
  await page.click('.vid-card');
  await page.waitForSelector('.lecture .video');
  assert.equal(new URL(page.url()).pathname, '/backend/02-api-layer-and-request-handling/07-crud-deep-dive/');
  await context.close();
});

test('the built pages carry what search engines read', () => {
  const dist = path.join(ROOT, 'dist');
  assert.ok(fs.existsSync(dist), 'run `npm run build` first');
  const html = fs.readFileSync(path.join(dist, ...LESSON.split('/').filter(Boolean), 'index.html'), 'utf8');
  assert.match(html, /<title>Sessions and Cookies · Backend Roadmap<\/title>/);
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
  assert.match(html, new RegExp(`<meta property="og:image" content="${config.site.url}${config.site.socialImage}">`), 'and shares the site picture');
});

test('a module with a video carries it in its built page: structured data, a plain link and its thumbnail as the preview', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', ...VIDEO_LESSON.split('/').filter(Boolean), 'index.html'), 'utf8');
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  const video = ld['@graph'].find((x) => x['@type'] === 'VideoObject');
  assert.equal(video.embedUrl, `https://www.youtube-nocookie.com/embed/${VIDEO_LESSON_ID}`);
  assert.equal(video.thumbnailUrl, `https://i.ytimg.com/vi/${VIDEO_LESSON_ID}/hqdefault.jpg`);
  assert.match(video.uploadDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(video.duration, /^PT\d+M\d+S$/);
  assert.ok(video.name && video.description);
  assert.match(html, new RegExp(`<meta property="og:image" content="https://i\\.ytimg\\.com/vi/${VIDEO_LESSON_ID}/hqdefault\\.jpg">`));
  assert.match(html, new RegExp(`<section aria-label="Video"><p><a href="https://www\\.youtube\\.com/watch\\?v=${VIDEO_LESSON_ID}">`));
  const { tree } = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'docs-index.json'), 'utf8'));
  const marked = [];
  (function walk(nodes) { for (const n of nodes) { if (n.videos) marked.push(n.file); walk(n.children || []); } })(tree);
  assert.ok(marked.includes(`${VIDEO_LESSON.slice(1)}README.md`), 'the module index records which modules have a video');
});
