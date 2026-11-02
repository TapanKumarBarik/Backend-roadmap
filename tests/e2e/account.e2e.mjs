// Signed-in behaviour, end to end: the real page, the real API app and a real (in-memory) database. The browser's
// /api requests are answered inside the test by api/app.js, the same code Cloudflare runs, so these tests cover the
// contract between the two as well as each side: a button press becomes a row, and the row comes back after a reload.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';

const LESSON = '/backend/03-authentication-and-authorization/01-sessions-and-cookies/';
const LESSON_FILE = 'backend/03-authentication-and-authorization/01-sessions-and-cookies/README.md';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const rows = (env, sql, ...params) => env.DB.raw.prepare(sql).all(...params);

test('a signed-in reader bookmarks a lesson and marks it complete, and both are still there after a reload', async () => {
  const { context, page, problems, goto } = await openPage(browser, LESSON);
  const env = await answerApiInProcess(context, { email: 'reader@example.com' });
  await goto();

  const bookmark = page.locator('button.bookmark-btn');
  await bookmark.waitFor();
  assert.equal(await bookmark.getAttribute('aria-pressed'), 'false');
  await bookmark.click();
  await page.waitForSelector('button.bookmark-btn[aria-pressed="true"]');
  assert.deepEqual(rows(env, 'SELECT path FROM bookmarks').map((r) => r.path), [LESSON_FILE]);

  await page.getByRole('button', { name: /Mark complete/ }).click();
  await page.waitForFunction(() => location.pathname.includes('02-jwt-deep-dive'), null, { timeout: 10000 });
  assert.deepEqual(rows(env, 'SELECT path, status FROM module_progress').map((r) => [r.path, r.status]), [[LESSON_FILE, 'done']]);

  await page.goto(new URL(LESSON, page.url()).href, { waitUntil: 'networkidle' });
  await page.waitForSelector('button.bookmark-btn[aria-pressed="true"]');
  assert.ok(await page.getByRole('button', { name: 'Mark not complete' }).isVisible(), 'the lesson still shows as done');

  assert.deepEqual(problems, []);
  await context.close();
});

test('the workspace: a page is created, typed into, saved, and its text is there after a reload', async () => {
  const { context, page, problems, goto } = await openPage(browser, '/#__workspace');
  const env = await answerApiInProcess(context, { email: 'reader@example.com' });
  await goto();

  await page.locator('button.ws-new-page').click();
  const editor = page.locator('.ws-editor .ProseMirror');
  await editor.waitFor();
  await editor.click();
  await page.keyboard.type('Remember the idempotency key');
  await page.waitForFunction(() => document.querySelector('.ws-editor .ProseMirror')?.textContent.includes('idempotency'));

  // The editor saves a moment after the last keystroke.
  for (let i = 0; i < 40 && !JSON.stringify(rows(env, 'SELECT content FROM workspace_pages')).includes('idempotency'); i++) {
    await page.waitForTimeout(250);
  }
  assert.match(JSON.stringify(rows(env, 'SELECT content FROM workspace_pages')), /Remember the idempotency key/);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ws-title').first().click();
  await page.waitForFunction(() => document.querySelector('.ws-editor .ProseMirror')?.textContent.includes('idempotency'));

  assert.deepEqual(problems, []);
  await context.close();
});

test('the admin dashboard opens for the owner with its seven sections, and tells a reader it is not for them', async () => {
  const owner = await openPage(browser, '/#__admin');
  await answerApiInProcess(owner.context, { email: OWNER_EMAIL });
  await owner.goto();
  await owner.page.waitForSelector('.admin-dashboard');
  assert.deepEqual(
    await owner.page.locator('.admin-dashboard .page-tabs button').allTextContents().then((labels) => labels.map((l) => l.trim().replace(/\d+$/, ''))),
    ['Overview', 'Content', 'Community', 'Articles', 'People', 'Analytics', 'System']
  );
  await owner.page.getByRole('button', { name: 'People' }).click();
  await owner.page.locator('.admin-chip.is-root', { hasText: OWNER_EMAIL }).waitFor();
  assert.deepEqual(owner.problems, []);
  await owner.context.close();

  const reader = await openPage(browser, '/#__admin');
  await answerApiInProcess(reader.context, { email: 'reader@example.com' });
  await reader.goto();
  await reader.page.waitForSelector('text=Not authorized');
  assert.equal(await reader.page.locator('.admin-dashboard').count(), 0);
  await reader.context.close();
});
