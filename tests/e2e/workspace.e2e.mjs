// The private workspace as a personal hub, end to end: folders, study plans, revision lists, saved diagrams, the private notes, and
// copying a page into an article draft. Same setup as account.e2e.mjs: a built site being served (`npm run build && npm run preview`),
// a browser, and the real API app answering the page's /api requests inside the test with an in-memory database.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { answerApiInProcess, launchBrowser, openPage } from './support.mjs';

const EMAIL = 'reader@example.com';
const USER = `user-${EMAIL}`;
const LESSON = '/backend/03-authentication-and-authorization/01-sessions-and-cookies/';
const LESSON_FILE = 'backend/03-authentication-and-authorization/01-sessions-and-cookies/README.md';
const PRIVATE_SENTENCE = 'Private: only you can see this.';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const rows = (env, sql, ...params) => env.DB.raw.prepare(sql).all(...params).map((row) => ({ ...row }));
/** Waits for a database row to show up, for what the page saves a moment after the last change. */
async function eventually(page, read, ok = (value) => !!value) {
  let value;
  for (let i = 0; i < 60; i++) {
    value = read();
    if (ok(value)) return value;
    await page.waitForTimeout(250);
  }
  return value;
}

async function openWorkspace() {
  const opened = await openPage(browser, '/#__workspace');
  const env = await answerApiInProcess(opened.context, { email: EMAIL });
  await opened.goto();
  await opened.page.locator('button.ws-new-page').waitFor();
  return { ...opened, env };
}

/** "Add…" in the tree, then the item named. */
async function addKind(page, itemName) {
  await page.locator('.wsx-tree-add button').click();
  await page.getByRole('menuitem', { name: itemName }).click();
}

const treeRow = (page, name) => page.locator('.ws-row').filter({ has: page.locator('.ws-title', { hasText: name }) });

test('the workspace says it is private, and so does every kind of page', async () => {
  const { context, page, problems } = await openWorkspace();
  assert.ok(await page.locator('.ws-shell > .wsx-private').getByText(PRIVATE_SENTENCE).isVisible(), 'the workspace says so');

  await page.locator('button.ws-new-page').click();
  await page.locator('.wsx-panel .wsx-private').getByText(PRIVATE_SENTENCE).waitFor();

  for (const [item, kind] of [['New folder', 'Folder'], ['New study plan…', 'Study plan'], ['New revision list', 'Revision list'], ['New diagram', 'Diagram']]) {
    await addKind(page, item);
    if (kind === 'Study plan') await page.getByRole('button', { name: 'Create plan' }).click();
    await page.locator('.wsx-kind', { hasText: kind }).waitFor();
    assert.ok(await page.locator('.wsx-panel .wsx-private').getByText(PRIVATE_SENTENCE).isVisible(), `${kind}: private, in words`);
  }
  assert.deepEqual(problems, []);
  await context.close();
});

test('a folder holds pages: a page is made inside it, the folder is renamed, a page is moved into it from the keyboard, and deleting it deletes what is inside', async () => {
  const { context, page, env, problems } = await openWorkspace();

  await addKind(page, 'New folder');
  await page.locator('.wsx-kind', { hasText: 'Folder' }).waitFor();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name').fill('Databases');
  await page.keyboard.press('Enter');
  await treeRow(page, 'Databases').waitFor();

  await page.getByRole('button', { name: 'New page here' }).click();
  await page.locator('.wsx-panel--page').waitFor();
  const folderId = rows(env, "SELECT page_id FROM workspace_meta WHERE kind = 'folder'")[0].page_id;
  assert.equal(rows(env, 'SELECT parent_id FROM workspace_pages WHERE parent_id IS NOT NULL')[0].parent_id, folderId, 'the new page is inside the folder');
  assert.ok(await page.locator('.ws-children .ws-title').first().isVisible(), 'the tree opened the folder to show it');

  // a page at the top level, moved into the folder with the keyboard only
  await page.locator('button.ws-new-page').click();
  await page.locator('.wsx-panel--page').waitFor();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name').fill('Loose notes');
  await page.keyboard.press('Enter');
  const more = page.getByRole('button', { name: 'More actions for Loose notes' });
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Move to…' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByLabel('Move to').selectOption({ label: 'Databases' });
  await dialog.getByRole('button', { name: 'Move', exact: true }).press('Enter');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const moved = await eventually(page, () => rows(env, "SELECT parent_id FROM workspace_pages WHERE title = 'Loose notes'")[0], (r) => r && r.parent_id === folderId);
  assert.equal(moved.parent_id, folderId);

  // the folder's own page lists what is inside, and deleting it asks first, then deletes all of it
  await treeRow(page, 'Databases').locator('.ws-title').click();
  await page.locator('.wsx-contents').waitFor();
  assert.equal(await page.locator('.wsx-contents__item').count(), 2);
  await page.getByRole('button', { name: 'Delete folder' }).click();
  const confirm = page.getByRole('dialog');
  assert.match(await confirm.textContent(), /2 pages inside it are deleted too/);
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await eventually(page, () => rows(env, 'SELECT id FROM workspace_pages').length, (n) => n === 0);
  assert.deepEqual(rows(env, 'SELECT id FROM workspace_pages'), []);
  assert.deepEqual(rows(env, 'SELECT page_id FROM workspace_meta'), []);

  assert.deepEqual(problems, []);
  await context.close();
});

test('a study plan from a learning path lists its lessons as links, grouped by step; ticking one marks the lesson done and a lesson already done shows ticked', async () => {
  const { context, page, env, problems } = await openWorkspace();

  await addKind(page, 'New study plan…');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Based on').selectOption({ index: 0 });
  await dialog.getByLabel('Target date (optional)').fill('2090-01-31');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await page.locator('.wsx-kind', { hasText: 'Study plan' }).waitFor();

  const saved = JSON.parse(rows(env, "SELECT data FROM workspace_meta WHERE kind = 'plan'")[0].data);
  const lessons = saved.steps.flatMap((s) => s.items.map((i) => i.path));
  assert.ok(lessons.length > 5, 'a path has lessons');
  assert.equal(saved.targetDate, '2090-01-31');
  assert.equal(await page.locator('.wsx-step').count(), saved.steps.length, 'one section per step of the path');
  assert.equal(await page.locator('.wsx-item').count(), lessons.length);
  assert.match(await page.locator('.wsx-item a').first().getAttribute('href'), /^\/[a-z-]+\//, 'a lesson is a link to its page');
  assert.match(await page.locator('.wsx-summary').textContent(), new RegExp(`0 of ${lessons.length} done`));
  assert.match(await page.locator('.wsx-summary').textContent(), /days left/);
  assert.match(await page.locator('.wsx-summary').textContent(), /real progress on that lesson/, 'the plan says how its ticks work');

  // ticking a lesson in the plan marks the lesson done
  await page.locator('.wsx-item input[type="checkbox"]').first().check();
  await page.getByText(`1 of ${lessons.length} done`).waitFor();
  const done = await eventually(page, () => rows(env, "SELECT path, status FROM module_progress WHERE user_id = ?", USER), (r) => r.length === 1);
  assert.deepEqual(done, [{ path: lessons[0], status: 'done' }]);

  // un-ticking sets it back to not started
  await page.locator('.wsx-item input[type="checkbox"]').first().uncheck();
  await eventually(page, () => rows(env, 'SELECT path FROM module_progress'), (r) => r.length === 0);
  assert.deepEqual(rows(env, 'SELECT path FROM module_progress'), []);

  // a lesson finished somewhere else (its own page) is ticked in the plan after a reload
  env.DB.raw.prepare('INSERT INTO module_progress (user_id, path, status, updated_at) VALUES (?, ?, ?, ?)').run(USER, lessons[1], 'done', new Date().toISOString());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ws-title').first().click();
  await page.locator('.wsx-item').first().waitFor();
  // (the reader's progress arrives from the server a moment after the page)
  await page.waitForFunction(() => document.querySelectorAll('.wsx-item input[type="checkbox"]')[1]?.checked, null, { timeout: 10000 });
  assert.equal(await page.locator('.wsx-item input[type="checkbox"]').first().isChecked(), false);
  assert.match(await page.locator('.wsx-summary').textContent(), new RegExp(`1 of ${lessons.length} done`));

  assert.deepEqual(problems, []);
  await context.close();
});

test('an own-list plan takes lessons and tasks; a task\'s tick stays in the plan and touches no lesson', async () => {
  const { context, page, env, problems } = await openWorkspace();

  await addKind(page, 'New study plan…');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Based on').selectOption({ label: 'My own list' });
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await page.locator('.wsx-kind', { hasText: 'Study plan' }).waitFor();
  await page.getByText('Nothing here yet.').waitFor();

  await page.getByLabel('Add a task of your own').fill('Build a tiny server');
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByLabel('Find a lesson to add').fill('sessions');
  await page.locator('.wsx-picker__item').first().click();
  assert.equal(await page.locator('.wsx-item').count(), 2);

  await page.locator('.wsx-item', { hasText: 'Build a tiny server' }).locator('input[type="checkbox"]').check();
  const data = await eventually(page, () => JSON.parse(rows(env, "SELECT data FROM workspace_meta WHERE kind = 'plan'")[0].data), (d) => d.steps[0].items.some((i) => i.done));
  const items = data.steps[0].items;
  assert.deepEqual(items.map((i) => [i.type, i.done]), [['task', true], ['lesson', undefined]]);
  assert.equal(rows(env, 'SELECT * FROM module_progress').length, 0, 'ticking a task marks no lesson');
  assert.match(await page.locator('.wsx-summary').textContent(), /1 of 2 done/);

  assert.deepEqual(problems, []);
  await context.close();
});

test('a revision list puts the most overdue lesson first, says so in words, and "Revised today" moves a lesson out', async () => {
  const { context, page, env, problems } = await openWorkspace();

  // a list with three lessons added at different times, set up in the database as if the person had added them over the weeks
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const stamp = daysAgo(0);
  env.DB.raw.prepare('INSERT INTO workspace_pages (id, user_id, title, sort_order, content, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)').run('list1', USER, 'Revise', '', stamp, stamp);
  env.DB.raw.prepare("INSERT INTO workspace_meta (page_id, user_id, kind, data, created_at) VALUES ('list1', ?, 'revision', '{}', ?)").run(USER, stamp);
  const add = env.DB.raw.prepare('INSERT INTO revision_items (id, user_id, page_id, path, title, added_at, last_revised_at, revised_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  add.run('r-fresh', USER, 'list1', 'x/fresh/README.md', 'Fresh lesson', daysAgo(0), null, 0);
  add.run('r-late', USER, 'list1', 'x/late/README.md', 'Very late lesson', daysAgo(40), null, 0);
  add.run('r-mid', USER, 'list1', 'x/mid/README.md', 'Somewhat late lesson', daysAgo(10), daysAgo(9), 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ws-title', { hasText: 'Revise' }).click();
  await page.locator('.wsx-revision__item').first().waitFor();

  assert.deepEqual(await page.locator('.wsx-revision__main a').allTextContents(), ['Very late lesson', 'Somewhat late lesson', 'Fresh lesson']);
  const first = await page.locator('.wsx-revision__item').first().textContent();
  assert.match(first, /\d+ days overdue/, 'overdue in words, not only colour');
  assert.match(first, /Not revised yet/);
  assert.match(await page.locator('.wsx-revision__item').nth(1).textContent(), /Last revised 9 days ago/);
  assert.match(await page.locator('.wsx-revision__item').nth(2).textContent(), /Due (today|in 1 day)/);
  assert.match(await page.locator('[role="status"]', { hasText: 'to revise now' }).textContent(), /2 lessons to revise now, of 3/);

  const button = page.getByRole('button', { name: 'Very late lesson: revised today' });
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
  await button.click();
  await page.waitForFunction(() => document.querySelector('.wsx-revision__item button[aria-pressed="true"]'));
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.wsx-revision__item').first().textContent(), /Revised today ✓/);
  assert.match(await page.locator('.wsx-revision__item').first().textContent(), /Due in 3 days/, 'the next gap is longer');
  const row = await eventually(page, () => rows(env, "SELECT revised_count, last_revised_at FROM revision_items WHERE id = 'r-late'")[0], (r) => r.revised_count === 1);
  assert.equal(row.revised_count, 1);
  assert.ok(row.last_revised_at);

  // a lesson is found by what is typed and added from the list itself
  await page.getByLabel('Add a lesson to this list').fill('sessions');
  await page.locator('.wsx-picker__item').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.wsx-revision__item').length === 4);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM revision_items')[0].n, 4);

  assert.deepEqual(problems, []);
  await context.close();
});

test('on a lesson\'s page, "Add to revision list" puts the lesson on the list in the workspace (made on the spot)', async () => {
  const { context, page, problems, goto } = await openPage(browser, LESSON);
  const env = await answerApiInProcess(context, { email: EMAIL });
  await goto();

  await page.getByRole('button', { name: 'Add to revision list' }).click();
  await page.getByText('Added to your revision list').waitFor();
  assert.deepEqual(rows(env, 'SELECT path, user_id FROM revision_items'), [{ path: LESSON_FILE, user_id: USER }]);
  assert.deepEqual(rows(env, "SELECT p.title FROM workspace_pages p JOIN workspace_meta m ON m.page_id = p.id WHERE m.kind = 'revision'"), [{ title: 'Revision list' }]);
  await page.getByRole('button', { name: 'On your revision list' }).waitFor();

  // pressing it again adds nothing, and says so
  await page.getByRole('button', { name: 'On your revision list' }).click();
  await page.getByText('already on your revision list').waitFor();
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM revision_items')[0].n, 1);

  // and the lesson is on the list in the workspace
  await page.goto(new URL('/#__workspace', page.url()).href, { waitUntil: 'networkidle' });
  await page.locator('.ws-title', { hasText: 'Revision list' }).click();
  await page.locator('.wsx-revision__main a').first().waitFor();
  assert.equal(await page.locator('.wsx-revision__main a').count(), 1);

  assert.deepEqual(problems, []);
  await context.close();
});

test('signed out, a lesson\'s revision button asks to sign in and adds nothing', async () => {
  const { context, page, goto } = await openPage(browser, LESSON);
  const env = await answerApiInProcess(context, { email: null });
  await goto();
  const button = page.getByRole('button', { name: 'Sign in to add this lesson to a revision list' });
  assert.ok(await button.isVisible());
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM revision_items')[0].n, 0);
  await context.close();
});

test('a saved diagram keeps its source, draws it, and has it back after a reload', async () => {
  const { context, page, env, problems } = await openWorkspace();

  await addKind(page, 'New diagram');
  await page.locator('.wsx-kind', { hasText: 'Diagram' }).waitFor();
  const box = page.getByLabel('Mermaid source');
  await box.fill('flowchart LR\n  Client --> API');
  await page.locator('.wsx-diagram .pr-diagram svg').waitFor({ timeout: 20000 });

  const saved = await eventually(page, () => JSON.parse(rows(env, "SELECT data FROM workspace_meta WHERE kind = 'diagram'")[0].data), (d) => d.source.includes('Client'));
  assert.equal(saved.source, 'flowchart LR\n  Client --> API');

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ws-title', { hasText: 'New diagram' }).click();
  await page.getByLabel('Mermaid source').waitFor();
  assert.equal(await page.getByLabel('Mermaid source').inputValue(), 'flowchart LR\n  Client --> API');
  await page.locator('.wsx-diagram .pr-diagram svg').waitFor({ timeout: 20000 });

  assert.deepEqual(problems, []);
  await context.close();
});

test('a page\'s text is copied into a new article draft: the page is unchanged and nothing is published', async () => {
  const { context, page, env, problems } = await openWorkspace();

  await page.locator('button.ws-new-page').click();
  const editor = page.locator('.ws-editor .ProseMirror');
  await editor.waitFor();
  await editor.click();
  await page.keyboard.type('Idempotency keys make retries safe');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name').fill('Retries');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Copy text into a new article draft' }).click();
  await page.getByText('nothing is published').waitFor();
  const post = await eventually(page, () => rows(env, 'SELECT title, status, body_text FROM blog_posts')[0], (p) => p && p.body_text.includes('Idempotency'));
  assert.equal(post.title, 'Retries');
  assert.equal(post.status, 'draft', 'a draft, never published');
  assert.match(post.body_text, /Idempotency keys make retries safe/);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM blog_posts')[0].n, 1);
  const kept = await eventually(page, () => JSON.stringify(rows(env, 'SELECT content FROM workspace_pages')), (c) => c.includes('Idempotency'));
  assert.match(kept, /Idempotency keys make retries safe/, 'the page keeps its text');
  assert.ok(await page.getByRole('button', { name: 'Open the draft' }).isVisible());

  assert.deepEqual(problems, []);
  await context.close();
});

test('a page with no words says there is nothing to copy and makes no draft', async () => {
  const { context, page, env } = await openWorkspace();
  await page.locator('button.ws-new-page').click();
  await page.locator('.ws-editor .ProseMirror').waitFor();
  await page.getByRole('button', { name: 'Copy text into a new article draft' }).click();
  await page.getByText('no text on this page to copy').waitFor();
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM blog_posts')[0].n, 0);
  await context.close();
});
