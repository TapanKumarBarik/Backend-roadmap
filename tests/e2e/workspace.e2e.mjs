// The private workspace as a personal hub, end to end: folders, study plans, revision lists, saved diagrams, the private notes, and
// copying a page into an article draft, dragging pages in the tree, and drawing a diagram on the visual canvas. Same setup as account.e2e.mjs: a built site being served (`npm run build && npm run preview`),
// a browser, and the real API app answering the page's /api requests inside the test with an in-memory database.

import fs from 'node:fs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { toMermaid } from '../../webapp/src/lib/workspace/diagramMermaid.js';

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
  const box = page.getByLabel('Mermaid source', { exact: true });
  await box.fill('flowchart LR\n  Client --> API');
  await page.locator('.wsx-diagram .pr-diagram svg').waitFor({ timeout: 20000 });

  const saved = await eventually(page, () => JSON.parse(rows(env, "SELECT data FROM workspace_meta WHERE kind = 'diagram'")[0].data), (d) => d.source.includes('Client'));
  assert.equal(saved.source, 'flowchart LR\n  Client --> API');

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ws-title', { hasText: 'New diagram' }).click();
  await page.getByLabel('Mermaid source', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Mermaid source', { exact: true }).inputValue(), 'flowchart LR\n  Client --> API');
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

// ------------------------------------------------------------------------------------------------ dragging pages in the tree
// Pages are put in the database as if the person had made them over time, and the page is loaded again to show them. A drag is a real
// mouse: press on a row's handle (or title), move in steps so the page sees the pointer travel, and let go; the tests wait for what the
// page draws (the drop indicator) before letting go, and check the database for what was saved.
function seedPages(env, rows) {
  const stamp = new Date().toISOString();
  const insert = env.DB.raw.prepare('INSERT INTO workspace_pages (id, user_id, title, parent_id, sort_order, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const kind = env.DB.raw.prepare("INSERT INTO workspace_meta (page_id, user_id, kind, data, created_at) VALUES (?, ?, ?, '{}', ?)");
  for (const [id, title, parentId, order, pageKind] of rows) {
    insert.run(id, USER, title, parentId, order, '', stamp, stamp);
    if (pageKind) kind.run(id, USER, pageKind, stamp);
  }
}

async function openSeeded(rowsToSeed) {
  const opened = await openWorkspace();
  seedPages(opened.env, rowsToSeed);
  await opened.page.reload({ waitUntil: 'networkidle' });
  await opened.page.locator('.ws-row').first().waitFor();
  return opened;
}

const parentOf = (env, id) => rows(env, 'SELECT parent_id, sort_order FROM workspace_pages WHERE id = ?', id)[0];
const said = (page) => page.locator('.ws-tree [role="status"]');

/** The row's box, and the point `fraction` of the way down it (0 is the top edge, 1 the bottom). */
async function pointOn(locator, fraction = 0.5) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height * fraction };
}

/** Presses on `from` and moves to `to` (a row, and how far down it) in steps, without letting go. */
async function dragOnto(page, from, to, fraction = 0.5) {
  const start = await pointOn(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const end = await pointOn(to, fraction);
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
}

test('dragging a page by its handle onto a folder puts it inside, says so for a screen reader, and leaves focus on the page', async () => {
  const { context, page, env, problems } = await openSeeded([
    ['f1', 'Databases', null, 0, 'folder'], ['p1', 'Notes', null, 1], ['p2', 'Archive', null, 2]
  ]);
  const folder = treeRow(page, 'Databases');
  await dragOnto(page, treeRow(page, 'Notes').locator('.ws-grip'), folder);
  await page.locator('.ws-row.is-drop-inside').waitFor();
  assert.equal(await folder.evaluate((el) => el.classList.contains('is-drop-inside')), true, 'the folder is the one outlined');
  assert.match(await page.locator('.ws-ghost').textContent(), /Notes.*Into “Databases”/, 'the label beside the pointer says what a drop does, in words');
  assert.equal(await page.evaluate(() => document.body.classList.contains('ws-dragging')), true);
  await page.mouse.up();

  const saved = await eventually(page, () => parentOf(env, 'p1'), (r) => r && r.parent_id === 'f1');
  assert.equal(saved.parent_id, 'f1');
  assert.match(await said(page).textContent(), /Moved “Notes” into “Databases”/);
  await treeRow(page, 'Notes').waitFor(); // the folder opened, so the page is still in sight
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('ws-title') && document.activeElement.textContent.includes('Notes'));
  assert.equal(await page.locator('.ws-ghost').count(), 0, 'the floating label is gone');
  assert.equal(await page.evaluate(() => document.body.classList.contains('ws-dragging')), false);
  assert.equal(await page.locator('.wsx-panel').count(), 0, 'dragging did not open the page');
  assert.deepEqual(problems, []);
  await context.close();
});

test('dragging a page by its title between two others reorders them, and a plain click on a title still opens the page', async () => {
  const { context, page, env, problems } = await openSeeded([['a', 'Alpha', null, 0], ['b', 'Bravo', null, 1], ['c', 'Charlie', null, 2]]);
  await dragOnto(page, treeRow(page, 'Charlie').locator('.ws-title'), treeRow(page, 'Bravo'), 0.1);
  await page.locator('.ws-row.is-drop-before').waitFor();
  assert.match(await treeRow(page, 'Bravo').evaluate((el) => el.className), /is-drop-before/, 'a line over Bravo');
  assert.match(await page.locator('.ws-ghost').textContent(), /Before “Bravo”/);
  await page.mouse.up();
  await eventually(page, () => parentOf(env, 'c'), (r) => r && r.sort_order > 0 && r.sort_order < 1);
  const order = rows(env, 'SELECT title FROM workspace_pages ORDER BY sort_order').map((r) => r.title);
  assert.deepEqual(order, ['Alpha', 'Charlie', 'Bravo']);
  assert.deepEqual(await page.locator('.ws-title-text').allTextContents(), ['Alpha', 'Charlie', 'Bravo'], 'the tree shows the same order');
  assert.match(await said(page).textContent(), /Moved “Charlie” before “Bravo”/);
  assert.equal(await page.locator('.wsx-panel').count(), 0, 'a drag that started on a title did not open the page');

  await treeRow(page, 'Alpha').locator('.ws-title').click();
  await page.locator('.wsx-panel--page').waitFor();
  assert.deepEqual(problems, []);
  await context.close();
});

test('a drop below the last row or on the top-level strip takes a page out of its folder', async () => {
  const { context, page, env, problems } = await openSeeded([['f1', 'Databases', null, 0, 'folder'], ['p1', 'Indexes', 'f1', 0], ['p2', 'Notes', null, 1]]);
  await page.locator('.ws-expand').first().click();
  await treeRow(page, 'Indexes').waitFor();
  const start = await pointOn(treeRow(page, 'Indexes').locator('.ws-title'));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 20, { steps: 4 });
  const strip = await pointOn(page.locator('.ws-drop-root'));
  await page.mouse.move(strip.x, strip.y, { steps: 10 });
  await page.locator('.ws-drop-root.is-over').waitFor();
  assert.match(await page.locator('.ws-ghost').textContent(), /To the top level/);
  await page.mouse.up();
  await eventually(page, () => parentOf(env, 'p1'), (r) => r && r.parent_id === null);
  assert.equal(parentOf(env, 'p1').parent_id, null);
  assert.ok(parentOf(env, 'p1').sort_order > parentOf(env, 'p2').sort_order, 'last at the top level');
  assert.match(await said(page).textContent(), /Moved “Indexes” to the top level/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('a folder cannot be dropped into itself or what is inside it: the target is marked as refused, in words, and nothing is saved', async () => {
  const { context, page, env, problems } = await openSeeded([['o', 'Outer', null, 0, 'folder'], ['i', 'Inner', 'o', 0, 'folder'], ['p', 'Other', null, 1]]);
  await page.locator('.ws-expand').first().click();
  await treeRow(page, 'Inner').waitFor();
  await dragOnto(page, treeRow(page, 'Outer').locator('.ws-grip'), treeRow(page, 'Inner'));
  await page.locator('.ws-row.is-drop-denied').waitFor();
  assert.equal(await page.locator('.ws-row.is-drop-inside').count(), 0, 'it is not offered as a place');
  assert.match(await page.locator('.ws-ghost').textContent(), /cannot go inside itself or anything inside it/);
  await page.mouse.up();
  assert.match(await said(page).textContent(), /cannot go inside itself or anything inside it/);
  await page.waitForTimeout(500);
  assert.equal(parentOf(env, 'o').parent_id, null, 'nothing was saved');
  assert.equal(parentOf(env, 'o').sort_order, 0);
  assert.deepEqual(problems, []);
  await context.close();
});

test('Escape while dragging puts the page back: nothing is saved and it says so', async () => {
  const { context, page, env, problems } = await openSeeded([['f1', 'Databases', null, 0, 'folder'], ['p1', 'Notes', null, 1]]);
  await dragOnto(page, treeRow(page, 'Notes').locator('.ws-grip'), treeRow(page, 'Databases'));
  await page.locator('.ws-row.is-drop-inside').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.ws-ghost').waitFor({ state: 'detached' });
  assert.match(await said(page).textContent(), /Move cancelled\. “Notes” stays where it was/);
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(parentOf(env, 'p1').parent_id, null);
  assert.equal(await page.locator('.wsx-panel').count(), 0, 'letting go after Escape did not open the page either');
  assert.deepEqual(problems, []);
  await context.close();
});

test('a folder the pointer rests on opens, so a page can be dropped among what is inside it', async () => {
  const { context, page, env, problems } = await openSeeded([['f1', 'Databases', null, 0, 'folder'], ['p1', 'Indexes', 'f1', 0], ['p2', 'Notes', null, 1]]);
  assert.equal(await treeRow(page, 'Indexes').count(), 0, 'the folder starts closed');
  await dragOnto(page, treeRow(page, 'Notes').locator('.ws-grip'), treeRow(page, 'Databases'));
  await treeRow(page, 'Indexes').waitFor({ timeout: 5000 });
  const end = await pointOn(treeRow(page, 'Indexes'), 0.9);
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.locator('.ws-row.is-drop-after').waitFor();
  await page.mouse.up();
  const saved = await eventually(page, () => parentOf(env, 'p2'), (r) => r && r.parent_id === 'f1');
  assert.equal(saved.parent_id, 'f1');
  assert.ok(saved.sort_order > parentOf(env, 'p1').sort_order, 'after Indexes');
  assert.match(await said(page).textContent(), /Moved “Notes” into “Databases”/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('the keyboard way still works beside dragging: "Move up" in a row\'s menu reorders without a pointer drag', async () => {
  const { context, page, env, problems } = await openSeeded([['a', 'Alpha', null, 0], ['b', 'Bravo', null, 1]]);
  await treeRow(page, 'Bravo').hover(); // a row's buttons are shown to the pointer on hover, and to the keyboard once anything in the row has focus
  await page.getByRole('button', { name: 'More actions for Bravo' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Move up', exact: true }).focus();
  await page.keyboard.press('Enter');
  await eventually(page, () => rows(env, 'SELECT title FROM workspace_pages ORDER BY sort_order').map((r) => r.title), (t) => t[0] === 'Bravo');
  assert.deepEqual(rows(env, 'SELECT title FROM workspace_pages ORDER BY sort_order').map((r) => r.title), ['Bravo', 'Alpha']);
  assert.deepEqual(problems, []);
  await context.close();
});

test('a finger takes hold of the handle and not of the title, so the title still scrolls the page', async () => {
  const { context, page, env, problems } = await openSeeded([['f1', 'Databases', null, 0, 'folder'], ['p1', 'Notes', null, 1]]);
  const grip = await pointOn(treeRow(page, 'Notes').locator('.ws-grip'));
  const title = await pointOn(treeRow(page, 'Notes').locator('.ws-title'));
  const folder = await pointOn(treeRow(page, 'Databases'));
  const touch = (type, target, at) => page.evaluate(([kind, selector, point]) => {
    const el = selector ? document.querySelector(selector) : window;
    el.dispatchEvent(new PointerEvent(kind, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: kind === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y }));
  }, [type, target, at]);

  // a touch that starts on the title and moves is not a drag
  await touch('pointerdown', '[data-row="p1"] .ws-title', title);
  for (let i = 1; i <= 6; i++) await touch('pointermove', null, { x: title.x, y: title.y - i * 8 });
  assert.equal(await page.locator('.ws-ghost').count(), 0, 'no drag from the title');
  await touch('pointerup', null, { x: title.x, y: title.y - 48 });

  // a touch that starts on the handle is
  await touch('pointerdown', '[data-row="p1"] .ws-grip', grip);
  for (let i = 1; i <= 8; i++) await touch('pointermove', null, { x: grip.x + ((folder.x - grip.x) * i) / 8, y: grip.y + ((folder.y - grip.y) * i) / 8 });
  await page.locator('.ws-row.is-drop-inside').waitFor();
  await touch('pointerup', null, folder);
  const saved = await eventually(page, () => parentOf(env, 'p1'), (r) => r && r.parent_id === 'f1');
  assert.equal(saved.parent_id, 'f1');
  assert.deepEqual(problems, []);
  await context.close();
});

// ------------------------------------------------------------------------------------------------ the visual diagram editor
const DRAWING = {
  nodes: [
    { id: 'n1', label: 'Client', shape: 'circle', x: 40, y: 40 },
    { id: 'n2', label: 'API', shape: 'rect', x: 300, y: 60 },
    { id: 'n3', label: 'Cache', shape: 'database', x: 300, y: 220 }
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2', label: 'request', dashed: false },
    { id: 'e2', from: 'n2', to: 'n3', label: '', dashed: true }
  ]
};

/** A diagram page that was drawn, as if it had been saved earlier; the page is loaded again and opened. */
async function openDrawn(model = DRAWING, title = 'Drawn diagram') {
  const opened = await openWorkspace();
  const stamp = new Date().toISOString();
  opened.env.DB.raw.prepare('INSERT INTO workspace_pages (id, user_id, title, sort_order, content, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)').run('d1', USER, title, '', stamp, stamp);
  opened.env.DB.raw.prepare("INSERT INTO workspace_meta (page_id, user_id, kind, data, created_at) VALUES ('d1', ?, 'diagram', ?, ?)")
    .run(USER, JSON.stringify({ source: toMermaid(model), mode: 'visual', model }), stamp);
  await opened.page.reload({ waitUntil: 'networkidle' });
  await opened.page.locator('.ws-title', { hasText: title }).click();
  await opened.page.locator('.dg-svg').waitFor();
  await opened.page.locator('[data-node]').first().waitFor();
  return opened;
}

const drawing = (env) => JSON.parse(rows(env, "SELECT data FROM workspace_meta WHERE kind = 'diagram'")[0].data);
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const edgeEl = (page, id) => page.locator(`[data-edge="${id}"]`);
const nodeAt = (data, id) => data.model.nodes.find((n) => n.id === id);
const canvasStatus = (page) => page.locator('.dg-editor [role="status"]');
/** Waits until the canvas shows this many boxes and arrows. */
const shows = (page, boxes, arrows) => page.waitForFunction(([b, a]) => document.querySelectorAll('[data-node]').length === b && document.querySelectorAll('[data-edge]').length === a, [boxes, arrows]);

test('a diagram starts as text; "Visual" draws it instead, and a drawing is boxes and arrows that can be added, labelled, joined and made dashed from the keyboard', async () => {
  const { context, page, env, problems } = await openWorkspace();
  await addKind(page, 'New diagram');
  await page.locator('.wsx-kind', { hasText: 'Diagram' }).waitFor();
  assert.ok(await page.getByLabel('Mermaid source', { exact: true }).isVisible(), 'a new diagram is in text mode, as before');
  await page.getByRole('tab', { name: 'Visual' }).click(); // no text to lose, so no question
  await page.locator('.dg-svg').waitFor();
  assert.equal(await page.getByLabel('Mermaid source', { exact: true }).count(), 0);
  await page.getByText('Nothing drawn yet').waitFor();

  await page.getByRole('button', { name: 'Add box' }).click();
  await page.getByRole('menuitem', { name: 'Rectangle' }).click();
  await page.locator('.dg-edit').fill('Client');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add box' }).click();
  await page.getByRole('menuitem', { name: 'Rounded box' }).click();
  await page.locator('.dg-edit').fill('API');
  await page.keyboard.press('Enter');
  await shows(page, 2, 0);
  assert.match(await node(page, 'n1').getAttribute('aria-label'), /^Client, rectangle, 0 arrows out, 0 in$/, 'a box has a name a screen reader can say');
  assert.equal(await node(page, 'n1').getAttribute('role'), 'button');

  // C, then Tab to the other box and Enter
  await node(page, 'n1').focus();
  await page.keyboard.press('c');
  await page.locator('.dg-connecting').waitFor();
  assert.match(await canvasStatus(page).textContent(), /Connecting from “Client”/);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await edgeEl(page, 'e1').waitFor();
  assert.match(await canvasStatus(page).textContent(), /Connected “Client” to “API”/);
  assert.equal(await page.locator('.dg-connecting').count(), 0);

  // the new arrow has focus: Enter gives it words, D makes it dashed
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset.edge === 'e1');
  await page.keyboard.press('Enter');
  await page.locator('.dg-edit').fill('login');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset.edge === 'e1');
  await page.keyboard.press('d');
  assert.equal(await edgeEl(page, 'e1').getAttribute('aria-label'), 'Arrow from Client to API, labelled login, dashed');

  const saved = await eventually(page, () => drawing(env), (d) => d.model && d.model.edges[0] && d.model.edges[0].dashed);
  assert.equal(saved.mode, 'visual');
  assert.deepEqual(saved.model.edges, [{ id: 'e1', from: 'n1', to: 'n2', label: 'login', dashed: true }]);
  assert.deepEqual(saved.model.nodes.map((n) => [n.label, n.shape]), [['Client', 'rect'], ['API', 'rounded']]);
  assert.equal(saved.source, 'flowchart LR\n  n1["Client"]\n  n2("API")\n  n1 -.->|"login"| n2', 'the Mermaid source is written from the drawing');
  assert.equal(await page.getByLabel('Mermaid source, written from the drawing').inputValue(), saved.source);
  assert.equal(await page.getByLabel('Mermaid source, written from the drawing').getAttribute('readonly'), '', 'read only');
  assert.deepEqual(problems, []);
  await context.close();
});

test('a box is dragged with the mouse and snaps to the grid; an arrow is dragged out of the handle onto another box', async () => {
  const { context, page, env, problems } = await openDrawn();
  const before = nodeAt(drawing(env), 'n3');
  await node(page, 'n3').scrollIntoViewIfNeeded(); // the mouse can only reach what is on screen
  const box = await node(page, 'n3').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 113, box.y + box.height / 2 + 57, { steps: 10 });
  await page.mouse.up();
  const moved = await eventually(page, () => nodeAt(drawing(env), 'n3'), (n) => n.x !== before.x || n.y !== before.y);
  assert.ok(Math.abs(moved.x - before.x - 113) <= 20 && Math.abs(moved.y - before.y - 57) <= 20, 'the box followed the pointer, to the nearest step of the grid');
  assert.equal(moved.x % 20, 0);
  assert.equal(moved.y % 20, 0);

  // select Client and drag its handle onto Cache: an arrow Client -> Cache
  await node(page, 'n1').click();
  const handle = await page.locator('.dg-handle__hit').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const target = await node(page, 'n3').boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.locator('.dg-node.is-target').waitFor();
  await page.mouse.up();
  await edgeEl(page, 'e3').waitFor();
  const data = await eventually(page, () => drawing(env), (d) => d.model.edges.length === 3);
  assert.deepEqual(data.model.edges[2], { id: 'e3', from: 'n1', to: 'n3', label: '', dashed: false });

  // letting go over empty canvas joins nothing
  await node(page, 'n2').click();
  const h2 = await page.locator('.dg-handle__hit').boundingBox();
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x + 200, h2.y + 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  assert.equal(drawing(env).model.edges.length, 3);
  assert.deepEqual(problems, []);
  await context.close();
});

test('the arrow keys move the selected box on the grid, Enter and double click edit its words, Delete removes it, and undo and redo put it all back', async () => {
  const { context, page, env, problems } = await openDrawn();
  await node(page, 'n2').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  assert.match(await canvasStatus(page).textContent(), /“API” moved to column \d+, row \d+/);
  let at = await eventually(page, () => nodeAt(drawing(env), 'n2'), (n) => n.x === 320 && n.y === 180);
  assert.deepEqual([at.x, at.y], [320, 60 + 20 + 100]);

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  at = await eventually(page, () => nodeAt(drawing(env), 'n2'), (n) => n.x === 300 && n.y === 60);
  assert.deepEqual([at.x, at.y], [300, 60], 'three undos put the box back');
  await page.keyboard.press('Control+Shift+Z');
  at = await eventually(page, () => nodeAt(drawing(env), 'n2'), (n) => n.x === 320);
  assert.equal(at.x, 320, 'redo');

  // words, by double click
  await node(page, 'n3').dblclick();
  await page.locator('.dg-edit').fill('Redis');
  await page.keyboard.press('Enter');
  await eventually(page, () => nodeAt(drawing(env), 'n3'), (n) => n.label === 'Redis');
  assert.match(await node(page, 'n3').getAttribute('aria-label'), /^Redis, database/);

  // Escape leaves the words as they were
  await node(page, 'n3').focus();
  await page.keyboard.press('Enter');
  await page.locator('.dg-edit').fill('Never kept');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.dg-edit').count(), 0);
  assert.match(await node(page, 'n3').getAttribute('aria-label'), /^Redis/);

  // Delete takes the box and the arrows that went to it; the Undo button brings them back
  await node(page, 'n3').focus();
  await page.keyboard.press('Delete');
  await shows(page, 2, 1); // the arrow into Redis went with it
  assert.match(await canvasStatus(page).textContent(), /Deleted “Redis” and 1 arrow/);
  const gone = await eventually(page, () => drawing(env), (d) => d.model.nodes.length === 2);
  assert.equal(gone.model.edges.length, 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await shows(page, 3, 2);
  await eventually(page, () => drawing(env), (d) => d.model.nodes.length === 3);
  await page.getByRole('button', { name: 'Redo' }).click();
  await shows(page, 2, 1);

  // the toolbar's Delete does the same for the selection
  await node(page, 'n1').focus();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await shows(page, 1, 0);
  assert.deepEqual(problems, []);
  await context.close();
});

test('the shape of a box is changed from the selection\'s tools, and an arrow is made dashed or solid with a checkbox', async () => {
  const { context, page, env, problems } = await openDrawn();
  await node(page, 'n2').focus();
  await page.getByLabel('Shape').selectOption({ label: 'Decision' });
  await eventually(page, () => nodeAt(drawing(env), 'n2'), (n) => n.shape === 'decision');
  assert.match(await node(page, 'n2').getAttribute('aria-label'), /^API, decision/);
  assert.ok((await drawing(env)).source.includes('n2{"API"}'));

  await edgeEl(page, 'e1').focus();
  const dashed = page.getByLabel('Dashed arrow');
  assert.equal(await dashed.isChecked(), false);
  await dashed.check();
  await eventually(page, () => drawing(env), (d) => d.model.edges[0].dashed);
  assert.match(await edgeEl(page, 'e1').getAttribute('aria-label'), /dashed$/, 'dashed is in the name, not only the look');
  assert.deepEqual(problems, []);
  await context.close();
});

test('Tidy lays the boxes out in columns on the grid, and zoom and fit change the view without changing the drawing', async () => {
  const model = {
    nodes: [
      { id: 'n1', label: 'A', shape: 'rect', x: 600, y: 400 },
      { id: 'n2', label: 'B', shape: 'rect', x: 0, y: 0 },
      { id: 'n3', label: 'C', shape: 'rect', x: 20, y: 400 }
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', label: '', dashed: false }, { id: 'e2', from: 'n2', to: 'n3', label: '', dashed: false }]
  };
  const { context, page, env, problems } = await openDrawn(model);
  await page.getByRole('button', { name: 'Tidy' }).click();
  const tidy = await eventually(page, () => drawing(env), (d) => nodeAt(d, 'n1').x < nodeAt(d, 'n2').x);
  const [a, b, c] = ['n1', 'n2', 'n3'].map((id) => nodeAt(tidy, id));
  assert.ok(a.x < b.x && b.x < c.x, 'in the order of the arrows, left to right');
  for (const n of [a, b, c]) assert.deepEqual([n.x % 20, n.y % 20], [0, 0]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await eventually(page, () => drawing(env), (d) => nodeAt(d, 'n1').x === 600);

  const zoomed = () => page.locator('.dg-zoom').textContent().then((t) => Number.parseInt(t, 10));
  const start = await zoomed();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const closer = await zoomed();
  assert.ok(closer > start, `${start}% then ${closer}%`);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  assert.ok((await zoomed()) < start);
  await page.getByRole('button', { name: 'Fit to view' }).click();
  assert.equal(nodeAt(drawing(env), 'n1').x, 600, 'zooming and fitting changed nothing in the drawing');
  assert.deepEqual(problems, []);
  await context.close();
});

test('the list says in words what the canvas shows, and choosing an item selects it on the canvas', async () => {
  const { context, page, problems } = await openDrawn();
  const region = page.getByRole('application', { name: 'Diagram canvas' });
  assert.ok(await region.isVisible());
  const help = await region.getAttribute('aria-describedby');
  assert.match(await page.locator(`[id="${help}"]`).textContent(), /Tab moves between boxes and arrows/);
  for (const label of await page.locator('[data-node], [data-edge]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))) assert.ok(label && label.length > 3, 'everything on the canvas has a name');

  await page.locator('.dg-list > summary').click();
  assert.deepEqual(await page.locator('.dg-list__item').allTextContents(), ['Client (circle)', 'API (rectangle)', 'Cache (database)', 'Client → API: request', 'API → Cache (dashed)']);
  await page.locator('.dg-list__item', { hasText: 'API → Cache' }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset.edge === 'e2');
  assert.match(await page.locator('.dg-inspector__name').textContent(), /Selected: Arrow from API to Cache, dashed/);
  assert.equal(await page.locator('.dg-list__item[aria-pressed="true"]').count(), 1, 'the chosen item is marked, in a way a screen reader gets');
  assert.deepEqual(problems, []);
  await context.close();
});

test('a drawing is downloaded as an SVG that stands alone, and as a PNG', async () => {
  const { context, page, problems } = await openDrawn();
  const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download SVG' }).click()]);
  assert.equal(svgDownload.suggestedFilename(), 'drawn-diagram.svg');
  const svg = fs.readFileSync(await svgDownload.path(), 'utf8');
  assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  for (const word of ['Client', 'API', 'Cache', 'request']) assert.ok(svg.includes(word), word);
  assert.ok(!svg.includes('var(--'), 'every colour is written out, because a file has no theme');
  assert.ok(!svg.includes('data-export'), 'what only helps editing is left out');
  assert.ok(!svg.includes('dg-handle'), 'so are the handles');

  const [pngDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()]);
  assert.equal(pngDownload.suggestedFilename(), 'drawn-diagram.png');
  assert.deepEqual([...fs.readFileSync(await pngDownload.path()).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'a PNG');
  assert.deepEqual(problems, []);
  await context.close();
});

test('"Convert to text" keeps the generated source as the person\'s own text, which Mermaid draws; the drawing is gone and the page stays in text mode', async () => {
  const { context, page, env, problems } = await openDrawn();
  const written = drawing(env).source;
  await page.getByRole('button', { name: 'Convert to text' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.ok(await page.locator('.dg-svg').isVisible(), 'cancelling changes nothing');

  await page.getByRole('button', { name: 'Convert to text' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Convert to text' }).click();
  const box = page.getByLabel('Mermaid source', { exact: true });
  await box.waitFor();
  assert.equal(await box.inputValue(), written);
  await page.locator('.wsx-diagram .pr-diagram svg').waitFor({ timeout: 20000 });
  const text = await eventually(page, () => drawing(env), (d) => !d.mode);
  assert.deepEqual(text, { source: written }, 'only the text is kept');

  await box.fill(`${written}\n  n1 --> n3`);
  await eventually(page, () => drawing(env).source, (s) => s.endsWith('n1 --> n3'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ws-title', { hasText: 'Drawn diagram' }).click();
  await page.getByLabel('Mermaid source', { exact: true }).waitFor();
  assert.equal(await page.locator('.dg-svg').count(), 0, 'it stays text after a reload, and the hand-written line is kept');
  assert.deepEqual(problems, []);
  await context.close();
});

test('a text diagram is only turned into a drawing after a question, which says the text is replaced; saying no changes nothing', async () => {
  const { context, page, env, problems } = await openWorkspace();
  await addKind(page, 'New diagram');
  await page.getByLabel('Mermaid source', { exact: true }).fill('flowchart LR\n  A --> B');
  await eventually(page, () => drawing(env).source, (s) => s.includes('A --> B'));

  await page.getByRole('tab', { name: 'Visual' }).click();
  const dialog = page.getByRole('dialog');
  assert.match(await dialog.textContent(), /text written here is replaced/);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(await page.getByLabel('Mermaid source', { exact: true }).inputValue(), 'flowchart LR\n  A --> B');
  assert.equal(drawing(env).source, 'flowchart LR\n  A --> B');

  await page.getByRole('tab', { name: 'Visual' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start drawing' }).click();
  await page.locator('.dg-svg').waitFor();
  const saved = await eventually(page, () => drawing(env), (d) => d.mode === 'visual');
  assert.deepEqual(saved, { source: '', mode: 'visual', model: { nodes: [], edges: [] } });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ws-title', { hasText: 'New diagram' }).click();
  await page.locator('.dg-svg').waitFor();
  assert.deepEqual(problems, []);
  await context.close();
});
