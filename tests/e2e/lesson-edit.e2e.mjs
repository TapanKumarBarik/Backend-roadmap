// An admin copies and edits a lesson from the lesson's own page (components/article/AdminBar.jsx, LessonEditor.jsx), stages the edit, and publishes the staged
// changes from Admin, Changes (components/admin/ChangesPanel.jsx), in a real browser. The API behind the page is the real one, answering inside the test
// process (support.mjs); GitHub is a stand-in that keeps state (api/tests/githubFake.js): branches, files, compare, merge, deploy runs. Nothing is committed.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { BASE, OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { ROOT, CONTENT_ROOT, config } from '../../scripts/lib/config.mjs';
import { createGithubFake } from '../../api/tests/githubFake.js';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const URL_PATH = '/backend/05-caching-and-performance/02-cache-eviction-and-invalidation/';
const FILE = `${URL_PATH.slice(1)}README.md`;
const REPO_FILE = `${config.content.dir}/${FILE}`;
const STAGING = config.repo.stagingBranch;
const REPO_TEXT = fs.readFileSync(path.join(CONTENT_ROOT, FILE), 'utf8').replace(/\r\n/g, '\n');
const DRAFT_KEY = `${config.storage.lessonDraft}${FILE}`;
const MARKER = 'Edited by the browser test.';
const EDITED = `${REPO_TEXT}\n\n${MARKER}\n`;

/** The lesson, as `email` (null: signed out). */
async function lessonAs(email) {
  const opened = await openPage(browser, URL_PATH, { withCsp: true });
  await opened.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => { /* not every browser has the permission */ });
  await answerApiInProcess(opened.context, { email });
  await opened.goto();
  await opened.page.locator('#content').waitFor();
  return opened;
}

/** Puts a stand-in for GitHub (holding this lesson on main) in the place of the real one for as long as `body` runs. */
async function withGithub(body, options = {}) {
  const github = createGithubFake({ files: { [REPO_FILE]: REPO_TEXT }, ...options });
  const restore = github.install();
  try { await body(github); } finally { restore(); }
}

const mainText = (github) => github.main.files.get(REPO_FILE).text;
const stagedText = (github) => (github.branches.get(STAGING) || { files: new Map() }).files.get(REPO_FILE)?.text;

const openEditor = async (page) => {
  await page.getByRole('button', { name: 'Edit this page' }).click();
  const box = page.getByRole('textbox', { name: `Editing ${FILE}` });
  await page.waitForFunction(() => /Cache Eviction/.test(document.querySelector('textarea.admin-textarea')?.value || ''));
  return box;
};

/** Edits the lesson and saves it as a staged change, then closes the editor. */
async function stageAnEdit(page, text = EDITED) {
  const box = await openEditor(page);
  await box.fill(text);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(/Saved to your staged changes/).waitFor();
  await page.getByRole('button', { name: 'Close the editor' }).click();
  await page.locator('#content').waitFor();
}

/** Opens Admin, Changes from the left rail. */
async function openChanges(page) {
  await page.locator('#destRail').getByRole('button', { name: 'Admin' }).click();
  await page.locator('.admin-dashboard').waitFor();
  await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Changes/ }).click();
}

test('only an admin gets the copy and edit controls on a lesson', async () => {
  await withGithub(async () => {
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
});

test('an admin copies the page’s markdown, as it is in the site’s file', async () => {
  await withGithub(async () => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    await page.getByRole('button', { name: 'Copy markdown' }).click();
    await page.getByText(/Copied this page/).waitFor();
    // Windows hands text back from the clipboard with CRLF line ends and Linux with LF; the words are what is being compared.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    const served = fs.readFileSync(path.join(ROOT, 'dist', FILE), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(copied, served, 'what is on the clipboard is the lesson’s file');
    await context.close();
  });
});

test('an admin edits the page where it is and saves it as a staged change: main is untouched, nothing deploys, and the page shows the new text at once', async () => {
  await withGithub(async (github) => {
    const { context, page, problems } = await lessonAs(OWNER_EMAIL);
    const box = await openEditor(page);
    assert.equal(await page.locator('#content').count(), 0, 'the editor is where the text was');
    assert.equal(await box.inputValue(), REPO_TEXT, 'it opens on the file in the repository');

    // What is typed is kept in the browser until it is saved: after a reload it comes back.
    await box.fill(EDITED);
    await page.waitForFunction((key) => !!localStorage.getItem(key), DRAFT_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#content').waitFor();
    await openEditor(page);
    await page.getByText(/Restored your unsaved changes/).waitFor();
    assert.match(await box.inputValue(), new RegExp(MARKER));

    // Saved: a commit on the staging branch, on the sha it was read at. Main has not changed and no deploy has started.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(/Saved to your staged changes\. It is not live yet/).waitFor();
    const put = github.calls.find((c) => c.method === 'PUT');
    assert.ok(put.url.endsWith(`/contents/${REPO_FILE}`), 'the commit is to the lesson’s file');
    assert.equal(put.body.branch, STAGING, 'on the staging branch');
    assert.match(Buffer.from(put.body.content, 'base64').toString('utf8'), new RegExp(MARKER));
    assert.equal(mainText(github), REPO_TEXT, 'main is as it was');
    assert.equal(stagedText(github), EDITED);
    assert.equal(github.runs.length, 0, 'so no deploy has started');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) || '', DRAFT_KEY), '', 'nothing is left of the draft once it is saved');

    await page.getByRole('button', { name: 'Close the editor' }).click();
    await page.locator('#content').waitFor();
    assert.match(await page.locator('#content').innerText(), new RegExp(MARKER), 'the saved text is on the page');
    assert.ok(await page.locator('#content .anchor, #content pre').count() > 0, 'and the page is enhanced again (anchors, code blocks)');
    await page.locator('.admin-bar__staged').waitFor();
    assert.match(await page.locator('.admin-bar__staged').innerText(), /Unpublished changes/);
    assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), [], 'nothing broke');
    await context.close();
  });
});

test('closing the editor with changes that are not saved asks first, and discarding them leaves the page as it was', async () => {
  await withGithub(async (github) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    const box = await openEditor(page);
    await box.fill(EDITED);
    await page.getByRole('button', { name: 'Close the editor' }).click();
    await page.getByRole('alert').getByText(/changes that are not saved/).waitFor();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    assert.match(await box.inputValue(), new RegExp(MARKER), 'still editing, nothing lost');

    await page.getByRole('button', { name: 'Close the editor' }).click();
    await page.getByRole('button', { name: 'Discard them and close' }).click();
    await page.locator('#content').waitFor();
    assert.doesNotMatch(await page.locator('#content').innerText(), new RegExp(MARKER));
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) || '', DRAFT_KEY), '', 'the discarded draft is gone');
    assert.equal(github.calls.filter((c) => c.method === 'PUT').length, 0, 'nothing was committed');
    await context.close();
  });
});

test('if the lesson changed on main since the editor opened, the save says so and overwrites nothing', async () => {
  await withGithub(async (github) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    const box = await openEditor(page);
    await box.fill(EDITED);
    github.main.files.set(REPO_FILE, { text: `${REPO_TEXT}\nSomeone else changed this on main.\n`, sha: 'blob-from-main' }); // a push to main meanwhile
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').getByText(/changed in the repository since you opened it/).waitFor();
    assert.match(await box.inputValue(), new RegExp(MARKER), 'what was typed is still there');
    // The branch may exist by now (it is made before the commit is tried), but it holds no edit: it is what main has.
    assert.doesNotMatch(String(stagedText(github) ?? ''), new RegExp(MARKER), 'and nothing was staged');
    await context.close();
  });
});

test('a lesson the build would reject is refused with the reasons on screen, and nothing is staged', async () => {
  await withGithub(async (github) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    const box = await openEditor(page);
    await box.fill('No title on this one.\n');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.admin-editor-problems').getByText(/first line must be the title/).waitFor();
    assert.equal(await page.getByRole('alert').getByText(/has problems, so it was not saved/).count(), 1);
    assert.equal(github.branches.has(STAGING), false, 'no staging branch was even made');
    await context.close();
  });
});

test('Admin, Changes lists the staged edit with what changed, publishes it as one merge into main, and follows the deploy', async () => {
  await withGithub(async (github) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    await stageAnEdit(page);
    await openChanges(page);

    await page.getByText(/Lessons you edited from their own pages wait here/).waitFor();
    const row = page.locator('.changes-file');
    assert.equal(await row.count(), 1);
    assert.match(await row.innerText(), /02-cache-eviction-and-invalidation/);
    assert.match(await row.locator('.changes-counts').innerText(), /\+\d+/);
    assert.equal(await page.locator('.page-tabs button', { hasText: /^Changes/ }).locator('.tab-badge').innerText(), '1', 'the tab says how many are waiting');
    await row.getByRole('button', { name: 'Show changes' }).click();
    assert.match(await row.locator('.diff-added').first().innerText(), new RegExp(MARKER.slice(0, 12)), 'the diff shows the added line');

    // Publishing asks first, then merges once: main has the text, a deploy has started, and the page says so.
    await page.getByRole('button', { name: 'Publish 1 change' }).click();
    await page.getByRole('alert').getByText(/merged into the main branch/).waitFor();
    assert.equal(mainText(github), REPO_TEXT, 'asking has changed nothing');
    await page.getByRole('button', { name: 'Publish now' }).click();
    await page.getByRole('status').getByText(/Published 1 lesson/).waitFor();
    assert.equal(mainText(github), EDITED, 'main has the edit');
    assert.equal(github.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/merges') && c.body.base === 'main').length, 1, 'by one merge');
    assert.equal(github.runs.length, 1, 'so one deploy started');
    assert.equal(github.branches.has(STAGING), false);
    await page.getByText(/Nothing is waiting/).waitFor();
    assert.match(await page.locator('.changes-deploy .changes-pill').innerText(), /Building/);

    // Opened again later, the page shows how the deploy ended.
    github.finishDeploy('success');
    await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Overview/ }).click();
    await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Changes/ }).click();
    await page.locator('.changes-deploy .changes-pill.is-live').waitFor();
    assert.match(await page.locator('.changes-deploy .changes-pill').innerText(), /Live/);
    await context.close();
  });
});

test('a staged edit can be discarded from Admin, Changes, and the lesson goes back to what the site has', async () => {
  await withGithub(async (github) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    await stageAnEdit(page);
    await openChanges(page);
    await page.locator('.changes-file').getByRole('button', { name: 'Discard' }).click();
    await page.getByRole('alert').getByText(/goes back to what the site has now/).waitFor();
    assert.equal(stagedText(github), EDITED, 'asking has changed nothing');
    await page.getByRole('button', { name: 'Yes, discard' }).click();
    await page.getByText(/Nothing is waiting/).waitFor();
    assert.equal(mainText(github), REPO_TEXT);
    assert.equal(github.runs.length, 0, 'and no deploy was started');
    await context.close();
  });
});

test('a publish that cannot be merged says why and keeps the staged edit', async () => {
  await withGithub(async (github) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    await stageAnEdit(page);
    github.main.files.set(REPO_FILE, { text: `${REPO_TEXT}\nChanged on main by someone else.\n`, sha: 'blob-from-main' });
    await openChanges(page);
    await page.getByRole('button', { name: 'Publish 1 change' }).click();
    await page.getByRole('button', { name: 'Publish now' }).click();
    await page.getByRole('alert').getByText(/changed in the same place as a staged edit/).waitFor();
    assert.equal(await page.locator('.changes-file').count(), 1, 'the staged edit is still listed');
    assert.equal(github.runs.length, 0);
    await context.close();
  });
});

test('the deploy can be started by hand, and a token that may not run workflows is told so', async () => {
  await withGithub(async (github) => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    await openChanges(page);
    await page.getByRole('button', { name: 'Rebuild the site now' }).click();
    await page.getByRole('status').getByText(/A deploy has started/).waitFor();
    assert.equal(github.runs.length, 1);
    await context.close();
  });
  await withGithub(async () => {
    const { context, page } = await lessonAs(OWNER_EMAIL);
    await openChanges(page);
    await page.getByRole('button', { name: 'Rebuild the site now' }).click();
    await page.getByRole('alert').getByText(/Actions: read and write/).waitFor();
    await context.close();
  }, { dispatchStatus: 403 });
});

test('the admin who staged an edit sees it on the lesson with a note, and a reader still sees the published lesson', async () => {
  await withGithub(async () => {
    const admin = await lessonAs(OWNER_EMAIL);
    await stageAnEdit(admin.page);
    await admin.page.reload({ waitUntil: 'networkidle' }); // a fresh page: the staged text is fetched, not remembered
    await admin.page.locator('.admin-bar__staged').waitFor();
    await admin.page.waitForFunction((marker) => (document.querySelector('#content')?.innerText || '').includes(marker), MARKER);
    await admin.context.close();

    const reader = await lessonAs('reader@example.com');
    assert.equal(await reader.page.locator('.admin-bar').count(), 0);
    assert.doesNotMatch(await reader.page.locator('#content').innerText(), new RegExp(MARKER), 'a reader sees what is published');
    await reader.context.close();
  });
});
