// Browser checks for the parts of the site that have to keep working: a lesson opens with its heading, its text and a
// real link for every module; videos play under the real Content-Security-Policy; the landing page's animation is
// off for people who ask for less motion; and the built pages carry what search engines read.
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
import { chromium } from 'playwright-core';
import { ROOT, config } from '../../scripts/lib/config.mjs';

const BASE = process.env.BASE || 'http://localhost:4180';
const LESSON = '/backend/03-authentication-and-authorization/01-sessions-and-cookies/';
const NEXT_LESSON = '/backend/03-authentication-and-authorization/02-jwt-deep-dive/';
const VIDEO_ID = 'jNQXAC9IVRw';
const SEEN = config.storage.seenLanding;

// The policy the site is served with (Cloudflare applies webapp/public/_headers); the local server does not, so the
// tests apply it themselves to find out whether anything the page needs is blocked.
const headersFile = fs.readFileSync(path.join(ROOT, 'webapp/public/_headers'), 'utf8');
const CSP = /Content-Security-Policy:\s*(.+)/.exec(headersFile)[1].trim();

let browser;
before(async () => {
  browser = await chromium.launch(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : { channel: config.screenshots.browserChannel });
});
after(async () => { await browser.close(); });

async function open(url, { motion = 'no-preference', seenLanding = true, withCsp = false, width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: motion });
  if (seenLanding) await context.addInitScript(([k]) => { try { localStorage.setItem(k, '1'); } catch { /* blocked */ } }, [SEEN]);
  if (withCsp) {
    await context.route('**/*', async (route) => {
      if (!route.request().url().startsWith(BASE)) return route.continue(); // the policy is ours; other sites send their own
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': CSP } });
    });
  }
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  return { context, page, problems, goto: () => page.goto(BASE + url, { waitUntil: 'networkidle' }) };
}

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
  assert.equal(await moving.page.locator('.lp-video a[href*="youtube.com/@"]').count(), 1);
  assert.ok(await moving.page.locator('.site-footer a[href*="youtube.com/@"]').count() >= 1);
  await moving.context.close();

  const still = await open('/', { seenLanding: false, motion: 'reduce' });
  await still.goto();
  await still.page.waitForSelector('.lp-route li');
  const state = await still.page.evaluate(() => [...document.querySelectorAll('.lp-route li')].map((li) => ({ opacity: getComputedStyle(li).opacity, name: getComputedStyle(li).animationName })));
  assert.ok(state.every((s) => s.opacity === '1' && s.name === 'none'), 'every stop is simply there: ' + JSON.stringify(state));
  assert.equal(await still.page.evaluate(() => getComputedStyle(document.querySelector('#main') || document.body).scrollBehavior), 'auto');
  await still.context.close();
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
  assert.match(headersFile, /\/\*\.md\s+X-Robots-Tag: noindex/);
});
