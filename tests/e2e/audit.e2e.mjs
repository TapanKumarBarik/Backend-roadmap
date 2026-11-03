// Every screen, held to the rules a machine can check, so a screen added later is held to them too: no two elements share an id,
// every button, link and field has a name, every picture says what it is (or that it is decoration), there is one main landmark,
// nothing is hidden from a screen reader and still reachable by keyboard, no tabindex is positive, and the screen fits every width from a 360px phone to a 1920px monitor
// without a sideways scroll. (What the rules cannot say, whether a name is a good one, stays a human's judgement.)
// The API behind the pages is the real one, answering inside the test process with a small seeded blog.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { seedBlog } from './blogSeed.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const LESSON = '/backend/03-authentication-and-authorization/01-sessions-and-cookies/';
// From the smallest phone to a large monitor: no screen may scroll sideways at any of these.
const WIDTHS = [360, 600, 768, 1024, 1440, 1920];
const COVER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="#7a5a2b"/></svg>';

/** Runs in the page: every broken rule, as a short line naming the element. */
function audit() {
  const issues = [];
  const shown = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && (el.offsetParent !== null || s.position === 'fixed'); };
  // What a screen reader is offered: on the page, and not hidden from it on purpose (a decorative duplicate link, say).
  const exposed = (el) => shown(el) && !el.closest('[aria-hidden="true"]');
  const label = (el) => `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}>`;
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const byId = (id) => document.getElementById(id);
  const nameOf = (el) => {
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) return labelled.split(/\s+/).map((id) => (byId(id) ? textOf(byId(id)) : '')).join(' ').trim();
    return (el.getAttribute('aria-label') || textOf(el) || el.getAttribute('title') || [...el.querySelectorAll('img[alt], svg[aria-label]')].map((i) => i.getAttribute('alt') || i.getAttribute('aria-label')).join(' ')).trim();
  };

  const seen = new Map();
  document.querySelectorAll('[id]').forEach((el) => seen.set(el.id, (seen.get(el.id) || 0) + 1));
  seen.forEach((n, id) => { if (n > 1) issues.push(`the id "${id}" is on ${n} elements`); });

  document.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="tab"], summary').forEach((el) => {
    if (exposed(el) && !nameOf(el)) issues.push(`${label(el)} has no name`);
  });

  document.querySelectorAll('img').forEach((img) => {
    if (exposed(img) && !img.hasAttribute('alt')) issues.push(`${label(img)} has no alt attribute`);
  });

  document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').forEach((el) => {
    if (!exposed(el) || el.closest('.ProseMirror')) return;
    const labelled = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
    if (!labelled) issues.push(`${label(el)} has no label`);
  });

  document.querySelectorAll('iframe').forEach((el) => { if (!el.getAttribute('title')) issues.push(`${label(el)} has no title`); });
  document.querySelectorAll('[tabindex]').forEach((el) => { if (Number(el.getAttribute('tabindex')) > 0) issues.push(`${label(el)} has a positive tabindex`); });
  if (document.querySelectorAll('main, [role="main"]').length !== 1) issues.push(`there are ${document.querySelectorAll('main, [role="main"]').length} main landmarks`);
  if (!document.documentElement.lang) issues.push('the page has no language');

  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    const reachable = el.matches('a[href], button, input, select, textarea, [tabindex]') ? [el] : [];
    el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').forEach((inner) => reachable.push(inner));
    reachable.filter((inner) => inner.getAttribute('tabindex') !== '-1' && !inner.disabled && shown(inner)).forEach((inner) => issues.push(`${label(inner)} can be reached by keyboard inside aria-hidden`));
  });
  return issues;
}

/** The screens, each with what it needs: who is signed in, and what to do before it is looked at. */
const SCREENS = [
  { name: 'the first-visit landing page', url: '/', visit: true },
  { name: 'the dashboard', url: '/' },
  { name: 'a module', url: LESSON },
  { name: 'Explore', url: '/#__explore' },
  { name: 'Videos', url: '/#__videos' },
  { name: 'Community: questions', url: '/#__community' },
  { name: 'Community: posts', url: '/#__feed' },
  { name: 'Community: resources', url: '/#__books' },
  { name: 'Community: ideas', url: '/#__suggestions' },
  { name: 'Blogs', url: '/blog/' },
  { name: 'an article', url: '/blog/why-retries-need-idempotency' },
  { name: 'an author', url: '/authors/ada-l' },
  { name: 'Saved', url: '/#__saved', email: 'ada@example.com' },
  { name: 'the workspace', url: '/#__workspace', email: 'ada@example.com' },
  { name: 'your articles', url: '/write/', email: 'ada@example.com' },
  { name: 'the editor', url: '/write/', email: 'ada@example.com', before: async (page) => { await page.getByRole('button', { name: 'New article' }).first().click(); await page.locator('.ProseMirror').waitFor(); } },
  { name: 'the admin dashboard', url: '/#__admin', email: OWNER_EMAIL },
  { name: 'the learning paths', url: '/paths/', before: (page) => page.locator('.pr-card').first().waitFor() },
  { name: 'a learning path', url: '/paths/backend-foundations/', before: (page) => page.getByRole('heading', { level: 3, name: 'The curriculum' }).waitFor() },
  { name: 'Practice', url: '/practice/', before: (page) => page.locator('.pr-card').first().waitFor() },
  { name: 'a quiz', url: '/practice/quiz/http-caching/', before: (page) => page.locator('.pr-questions > li').first().waitFor() },
  { name: 'an interview set', url: '/practice/interview/caching/', before: (page) => page.locator('.pr-qa').first().waitFor() },
  { name: 'the Design Lab', url: '/design-lab/', before: (page) => page.locator('.pr-card').first().waitFor() },
  { name: 'a design challenge', url: '/design-lab/lld/parking-lot/', email: 'ada@example.com', before: (page) => page.getByLabel('Your answer').waitFor() },
  { name: 'My Learning', url: '/#__me', email: 'ada@example.com', before: (page) => page.getByRole('heading', { level: 2, name: 'My learning' }).waitFor() },
  { name: 'the admin practice section', url: '/#__admin', email: OWNER_EMAIL, before: async (page) => { await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Practice/ }).click(); await page.getByText('Submissions').first().waitFor(); } },
  { name: 'the style guide', url: '/#__design' }
];

for (const screen of SCREENS) {
  test(`${screen.name}: every control has a name, nothing shares an id, and it fits every width`, async (t) => {
    const opened = await openPage(browser, screen.url, { seenLanding: !screen.visit, width: 1280, height: 900 });
    const { context, page } = opened;
    t.after(() => context.close());
    await context.route('**/stroadmapprogress.blob.core.windows.net/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: COVER_SVG }));
    await context.route('**/i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: COVER_SVG }));
    const env = await answerApiInProcess(context, { email: screen.email ?? null });
    await seedBlog(env);
    await opened.goto();
    if (screen.before) await screen.before(page);
    await page.waitForTimeout(300);

    const issues = await page.evaluate(audit);
    assert.deepEqual(issues, [], `${screen.name}: ${issues.join('; ')}`);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - window.innerWidth, wide: [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 && r.width > 0 && !el.closest('pre, table, .scroll-x, .mermaid-diagram, .ui-tabs, .codeblock'); }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`) }));
      assert.ok(overflow.page <= 0, `${screen.name}: the page scrolls sideways by ${overflow.page}px at ${width}px wide (${overflow.wide.join(', ')})`);
    }
  });
}

test('the audit is not blind: a page with the faults it looks for is reported for each of them', async (t) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><body>
    <div id="twice"></div><div id="twice"></div>
    <button></button><a href="/x"></a><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
    <input type="text"><iframe src="about:blank"></iframe><div tabindex="3">x</div>
    <div aria-hidden="true"><button>inside</button></div>
    <button aria-label="fine">ok</button><label>Named <input type="text"></label>
  </body></html>`);
  const issues = await page.evaluate(audit);
  const text = issues.join('\n');
  for (const expected of [/id "twice" is on 2/, /<button> has no name/, /<a> has no name/, /<img> has no alt/, /<input> has no label/, /<iframe> has no title/, /positive tabindex/, /0 main landmarks/, /no language/, /inside aria-hidden/]) {
    assert.match(text, expected);
  }
  assert.equal(issues.filter((line) => /has no label/.test(line)).length, 1, 'the field with a label around it is fine');
});
