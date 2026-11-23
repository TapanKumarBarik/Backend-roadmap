// An admin copies and edits a lesson from the lesson's own page (components/article/AdminBar.jsx, LessonEditor.jsx), in a real browser. The API behind
// the page is the real one, answering inside the test process (support.mjs); GitHub is a stand-in (as in practice.e2e.mjs), so nothing is committed.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { BASE, OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { ROOT, CONTENT_ROOT, config } from '../../scripts/lib/config.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const URL_PATH = '/backend/05-caching-and-performance/02-cache-eviction-and-invalidation/';
const FILE = `${URL_PATH.slice(1)}README.md`;
const REPO_TEXT = fs.readFileSync(path.join(CONTENT_ROOT, FILE), 'utf8').replace(/\r\n/g, '\n');
const DRAFT_KEY = `${config.storage.lessonDraft}${FILE}`;
const MARKER = 'Edited by the browser test.';

/** The lesson, as `email` (null: signed out). */
async function lessonAs(email) {
  const opened = await openPage(browser, URL_PATH, { withCsp: true });
  await opened.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => { /* not every browser has the permission */ });
  await answerApiInProcess(opened.context, { email });
  await opened.goto();
  await opened.page.locator('#content').waitFor();
  return opened;
}

/** Puts a stand-in for GitHub in the place of the real one, for as long as `body` runs. `put` is what a commit answers. */
async function withGithub(body, { put = () => Response.json({ content: { sha: 'sha-2' }, commit: { sha: 'commit-1' } }) } = {}) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
    const call = { method: init.method || 'GET', url, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    if (call.method === 'PUT') return put(call);
    return Response.json({ content: Buffer.from(REPO_TEXT).toString('base64'), sha: 'sha-1' });
  };
  try { await body(calls); } finally { globalThis.fetch = realFetch; }
}

const openEditor = async (page) => {
  await page.getByRole('button', { name: 'Edit this page' }).click();
  const box = page.getByRole('textbox', { name: `Editing ${FILE}` });
  await page.waitForFunction(() => /Cache Eviction/.test(document.querySelector('textarea.admin-textarea')?.value || ''));
  return box;
};

test('only an admin gets the copy and edit controls on a lesson', async () => {
  for (const email of [null, 'reader@example.com']) {
    const { context, page } = await lessonAs(email);
    assert.equal(await page.locator('.admin-bar').count(), 0, `${email || 'signed out'}: no admin controls`);
    assert.equal(await page.getByRole('button', { name: 'Edit this page' }).count(), 0);
    await context.close();
  }
  const { context, page } = await lessonAs(OWNER_EMAIL);
  await page.locator('.admin-bar').waitFor();
  assert.equal(await page.locator('.admin-bar button').count(), 2, 'Copy markdown and Edit this page');
  await context.close();
});

test('an admin copies the page’s markdown, as it is in the site’s file', async () => {
  const { context, page } = await lessonAs(OWNER_EMAIL);
  await page.getByRole('button', { name: 'Copy markdown' }).click();
  await page.getByText(/Copied this page/).waitFor();
  // Windows hands text back from the clipboard with CRLF line ends and Linux with LF; the words are what is being compared.
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  const served = fs.readFileSync(path.join(ROOT, 'dist', FILE), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(copied, served, 'what is on the clipboard is the lesson’s file');
  await context.close();
});

test('an admin edits the page where it is, saves it to the repository, and sees the new text at once', async () => {
  await withGithub(async (calls) => {
    const { context, page, problems } = await lessonAs(OWNER_EMAIL);
    const box = await openEditor(page);
    assert.equal(await page.locator('#content').count(), 0, 'the editor is where the text was');
    assert.equal(await box.inputValue(), REPO_TEXT, 'it opens on the file in the repository');
    assert.equal(calls.filter((c) => c.method === 'GET').length, 1);

    // What is typed is kept in the browser until it is saved: after a reload it comes back.
    await box.fill(`${REPO_TEXT}\n\n${MARKER}\n`);
    await page.waitForFunction((key) => !!localStorage.getItem(key), DRAFT_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#content').waitFor();
    await openEditor(page);
    await page.getByText(/Restored your unsaved changes/).waitFor();
    assert.match(await box.inputValue(), new RegExp(MARKER));

    // Saved: committed to the lesson's own file, on the sha it was read at, and the page shows the new text without waiting for a deploy.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(/Saved: committed to main/).waitFor();
    const put = calls.find((c) => c.method === 'PUT');
    assert.ok(put.url.endsWith(`/contents/content/${FILE}`), 'the commit is to the lesson’s file');
    assert.equal(put.body.sha, 'sha-1');
    assert.equal(put.body.branch, config.repo.branch);
    assert.match(Buffer.from(put.body.content, 'base64').toString('utf8'), new RegExp(MARKER));
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) || '', DRAFT_KEY), '', 'nothing is left of the draft once it is saved');

    await page.getByRole('button', { name: 'Close the editor' }).click();
    await page.locator('#content').waitFor();
    assert.match(await page.locator('#content').innerText(), new RegExp(MARKER), 'the saved text is on the page');
    assert.ok(await page.locator('#content .anchor, #content pre').count() > 0, 'and the page is enhanced again (anchors, code blocks)');
    assert.equal(await page.locator('.lesson-editor').count(), 0);
    assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), [], 'nothing broke');
    await context.close();
  });
});

test('closing the editor with changes that are not saved asks first, and discarding them leaves the page as it was', async () => {
  await withGithub(async (calls) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    const box = await openEditor(page);
    await box.fill(`${REPO_TEXT}\n\n${MARKER}\n`);
    await page.getByRole('button', { name: 'Close the editor' }).click();
    await page.getByRole('alert').getByText(/changes that are not saved/).waitFor();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    assert.match(await box.inputValue(), new RegExp(MARKER), 'still editing, nothing lost');

    await page.getByRole('button', { name: 'Close the editor' }).click();
    await page.getByRole('button', { name: 'Discard them and close' }).click();
    await page.locator('#content').waitFor();
    assert.doesNotMatch(await page.locator('#content').innerText(), new RegExp(MARKER));
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) || '', DRAFT_KEY), '', 'the discarded draft is gone');
    assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'nothing was committed');
    await context.close();
  });
});

test('if the file changed in the repository since the editor opened, the save says so and overwrites nothing', async () => {
  await withGithub(async () => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    const box = await openEditor(page);
    await box.fill(`${REPO_TEXT}\n\n${MARKER}\n`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').getByText(/changed in the repository since you opened it/).waitFor();
    assert.match(await box.inputValue(), new RegExp(MARKER), 'what was typed is still there');
    await context.close();
  }, { put: () => new Response('conflict', { status: 409 }) });
});
