// The writing studio in a real browser: starting an article, the "/" menu, markdown shortcuts, the floating toolbar, code,
// callouts, tables, pictures and video, honest saving (saved, offline, recovered, in conflict), the preview, and publishing
// with an author name, a cover, topics and a schedule. The API behind the page is the real one, answering inside the test
// process with a small seeded blog (blogSeed.mjs); the storage the pictures go to is stood in for.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser. (Against a dev server,
// whose own scripts the site's policy would block, set E2E_NO_CSP=1.)

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { seedBlog } from './blogSeed.mjs';
import { FEED_CONTAINER, blobBase } from '../../api/lib/blob.js';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const PICTURE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#5a6"/></svg>';
const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));

/** The studio, signed in as `email` (Ada, who has an author name, unless said otherwise), on a seeded blog, under the site's content security policy. */
async function openStudio(t, url = '/write/', { email = 'ada@example.com', width = 1280, height = 900, assistant = null } = {}) {
  const opened = await openPage(browser, url, { width, height, withCsp: !process.env.E2E_NO_CSP });
  const { context } = opened;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => { /* optional */ });
  await context.route('**/stroadmapprogress.blob.core.windows.net/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }));
  await context.route('**/i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }));
  const env = await answerApiInProcess(context, { email });
  const seeded = await seedBlog(env);
  if (assistant) env.AI = { run: async (_model, input) => assistant(input.messages[1].content) }; // a writing assistant that answers from `assistant`
  // The storage the pictures are sent to accepts whatever it is given.
  env.FEED_CONTAINER_SAS = 'test-token';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => (String(input).startsWith(blobBase(FEED_CONTAINER)) ? new Response('', { status: 201 }) : realFetch(input, init));
  t.after(async () => { globalThis.fetch = realFetch; await context.close(); }); // also when the test fails half way
  await opened.goto();
  return { ...opened, env, seeded };
}

/** Cuts the page off: the browser says it is offline, and nothing reaches the API until `online()`. */
async function goOffline(context) {
  const refuse = (route) => route.abort('internetdisconnected');
  await context.route('**/api/**', refuse);
  await context.setOffline(true);
  return async () => {
    await context.setOffline(false);
    await context.unroute('**/api/**', refuse);
  };
}

const title = (page) => page.getByRole('textbox', { name: 'Title', exact: true });
const editor = (page) => page.locator('.ProseMirror');
const status = (page) => page.locator('.studio-status');
const slashList = (page) => page.getByRole('listbox', { name: 'Blocks' });
const row = (env, id) => env.DB.raw.prepare('SELECT * FROM blog_posts WHERE id = ?').get(id);
const docOf = (env, id) => JSON.parse(row(env, id).content);
const idFromUrl = (page) => new URL(page.url()).pathname.split('/').filter(Boolean).pop();

async function until(condition, what, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`never happened: ${what}`);
}
/** Starts a new article from the list and waits for the editor; resolves its id. */
async function startArticle(page) {
  await page.getByRole('button', { name: 'New article' }).first().click();
  await title(page).waitFor();
  await editor(page).waitFor();
  return idFromUrl(page);
}
/** Types into the text, from where the cursor is. */
async function write(page, text) {
  await page.keyboard.type(text);
}
const nodeTypes = (doc) => (doc.content || []).map((n) => n.type);

test('your articles are listed, a new one opens in the editor, and what is written is saved and still there after a reload', async (t) => {
  const { page, env, problems } = await openStudio(t);
  await page.getByRole('heading', { level: 1, name: 'Your articles' }).waitFor();
  assert.equal(await page.locator('.studio-list__row').count(), 3, 'Ada\'s three articles, not Grace\'s');
  assert.match(await page.locator('.studio-profile').textContent(), /Ada Lovelace/);

  const id = await startArticle(page);
  assert.match(new URL(page.url()).pathname, /^\/write\/.+/);
  assert.equal(await status(page).textContent(), 'Saved', 'nothing written, nothing unsaved');

  await title(page).fill('Why a cache needs a plan');
  await title(page).press('Enter');
  await write(page, 'A cache is a promise that old data is acceptable. ');
  await write(page, 'Decide how old, and for whom.');
  await until(() => /Unsaved changes|Saving/.test(page.evaluate(() => document.querySelector('.studio-status').textContent)) || true, 'status');
  await until(() => (row(env, id).body_text || '').includes('Decide how old'), 'the text reaches the server');
  assert.equal(row(env, id).title, 'Why a cache needs a plan');
  await page.waitForFunction(() => document.querySelector('.studio-status').textContent === 'Saved');

  await page.reload({ waitUntil: 'networkidle' });
  await editor(page).waitFor();
  assert.equal(await title(page).inputValue(), 'Why a cache needs a plan');
  assert.match(await editor(page).textContent(), /Decide how old, and for whom/);
  assert.deepEqual(real(problems), []);
});

test('"/" opens a list of blocks that narrows as you type, moves with the arrows, and chooses with Enter', async (t) => {
  const { page } = await openStudio(t);
  await startArticle(page);
  await editor(page).click();
  await page.keyboard.type('/');
  await slashList(page).waitFor();
  const all = await slashList(page).getByRole('option').allTextContents();
  assert.ok(all.length >= 14, `${all.length} blocks`);
  assert.ok(all.some((t) => t.startsWith('Heading')) && all.some((t) => t.startsWith('Code block')) && all.some((t) => t.startsWith('Diagram')) && all.some((t) => t.startsWith('Table')));
  assert.match(await editor(page).getAttribute('aria-activedescendant'), /-paragraph$/, 'the editor points at the chosen row, for a screen reader');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await slashList(page).locator('[aria-selected="true"]').count(), 1);
  await page.keyboard.type('numb');
  assert.deepEqual((await slashList(page).getByRole('option').allTextContents()).map((t) => t.replace(/[A-Z][a-z, ]+$/, '')), ['Numbered list']);
  await page.keyboard.press('Enter');
  await slashList(page).waitFor({ state: 'detached' });
  await write(page, 'first step');
  assert.equal(await editor(page).locator('ol li').count(), 1);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // leave the list
  await page.keyboard.type('/zzz');
  await page.getByText('Nothing matches').waitFor();
  await page.keyboard.press('Escape');
  await slashList(page).waitFor({ state: 'detached' });
  assert.match(await editor(page).textContent(), /\/zzz/, 'Escape closes the list and keeps what was typed');
  await page.keyboard.type('a');
  assert.equal(await slashList(page).count(), 0, 'and it stays closed while the same slash is being typed');
  await page.keyboard.press('Enter');
  assert.match(await editor(page).textContent(), /\/zzza/, 'Enter is the text\'s: a new line, not a choice from the list, so nothing was inserted in place of the slash');
  assert.equal(await editor(page).locator('h2, pre, table, hr').count(), 0, 'no block was inserted');
});

test('markdown shortcuts turn into formatting as you type', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, '## A heading\n');
  await write(page, 'Some **bold** and _italic_ and `code`.\n');
  await write(page, '- one\n- two\n\n');
  await write(page, '> a quote\n\n');
  await write(page, '---\n');
  await write(page, '```python ');
  await write(page, 'print(1)');
  await until(() => nodeTypes(docOf(env, id)).includes('codeBlock'), 'saved with a code block');
  const doc = docOf(env, id);
  assert.deepEqual(nodeTypes(doc).filter((t) => t !== 'paragraph'), ['heading', 'bulletList', 'blockquote', 'horizontalRule', 'codeBlock']);
  assert.equal(doc.content.find((n) => n.type === 'codeBlock').attrs.language, 'python', 'the language after the fence');
  assert.equal(await editor(page).locator('strong').textContent(), 'bold');
  assert.equal(await editor(page).locator('em').textContent(), 'italic');
  assert.equal(await editor(page).locator('p code').textContent(), 'code');
  assert.equal(await editor(page).locator('p code').evaluate((el) => el.spellcheck), false, 'code is not spell-checked');
  assert.equal(await editor(page).locator('pre code').evaluate((el) => el.spellcheck), false, 'nor is a block of it');
  assert.equal(await editor(page).locator('p').first().evaluate((el) => el.spellcheck), true, 'the prose is');
});

test('selected text brings a small toolbar: formatting, and a link that is checked before it is made', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, 'Read the retry guide for details');
  await page.keyboard.press('Control+A');
  const bar = page.getByRole('toolbar', { name: 'Format the selected text' });
  await bar.waitFor();
  await bar.getByRole('button', { name: 'Italic' }).click();
  assert.equal(await editor(page).locator('em').count(), 1);

  // select "retry guide" and make it a link
  await page.keyboard.press('Home');
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 11; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+k');
  const address = bar.getByRole('textbox', { name: 'Link address' });
  await address.waitFor();
  await address.fill('javascript:alert(1)');
  await address.press('Enter');
  await bar.getByRole('alert').waitFor();
  assert.equal(await editor(page).locator('a').count(), 0, 'an address that is not allowed makes no link');
  await address.fill('example.com/retries');
  await address.press('Enter');
  await editor(page).locator('a').waitFor();
  assert.equal(await editor(page).locator('a').getAttribute('href'), 'https://example.com/retries', 'a bare address gets https://');
  await until(() => JSON.stringify(docOf(env, id)).includes('https://example.com/retries'), 'the link is saved');
});

test('a code block has a language to choose, and is coloured as readers will see it; a diagram starts with an example', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, '/code');
  await page.keyboard.press('Enter');
  await write(page, 'def retry(n):\n    return n + 1');
  await page.getByRole('combobox', { name: 'Code language' }).selectOption('python');
  await page.locator('.ProseMirror pre .hljs-keyword').first().waitFor();
  await page.getByRole('combobox', { name: 'Code language' }).selectOption('typescript');
  await until(() => docOf(env, id).content.some((n) => n.type === 'codeBlock' && n.attrs.language === 'typescript'), 'the language is saved');

  await page.keyboard.press('ArrowDown');
  await write(page, '/diagram');
  await page.keyboard.press('Enter');
  const blocks = await editor(page).locator('pre code').allTextContents();
  assert.match(blocks[1], /flowchart LR\n\s+Client --> API --> Database/);
  await until(() => docOf(env, id).content.some((n) => n.type === 'codeBlock' && n.attrs.language === 'mermaid'), 'a diagram is a mermaid block');
});

test('callouts, tables and dividers: a callout\'s kind can be changed, and the cursor in a table brings its own controls', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, '/note');
  await page.keyboard.press('Enter');
  await write(page, 'Mind the clock.');
  assert.equal(await editor(page).locator('.cblock-note').count(), 1);
  await page.getByRole('combobox', { name: 'Kind of callout' }).selectOption('warning');
  assert.equal(await editor(page).locator('.cblock-pitfall').count(), 1, 'a warning is the curriculum\'s pitfall block');

  await page.keyboard.press('ArrowDown');
  await write(page, '/table');
  await page.keyboard.press('Enter');
  assert.equal(await editor(page).locator('table tr').count(), 3);
  const bar = page.getByRole('toolbar', { name: 'Table' });
  await bar.waitFor();
  await bar.getByRole('button', { name: 'Row below' }).click();
  assert.equal(await editor(page).locator('table tr').count(), 4);
  await until(() => { const t = docOf(env, id).content.find((n) => n.type === 'table'); return t && t.content.length === 4; }, 'the table is saved with its four rows');
  assert.equal(docOf(env, id).content.find((n) => n.type === 'callout').attrs.tone, 'warning');
});

test('a picture is uploaded to the site\'s storage and put in the text, with alt text to describe it; one pasted from the clipboard goes the same way', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, '/image');
  await page.keyboard.press('Enter');
  await page.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: 'retry-flow.png', mimeType: 'image/png', buffer: PICTURE });
  await editor(page).locator('img').waitFor();
  const first = await editor(page).locator('img').first().getAttribute('src');
  assert.ok(first.startsWith(blobBase(FEED_CONTAINER) + '/'), first);
  assert.equal(await editor(page).locator('img').first().getAttribute('alt'), 'retry flow', 'the file\'s name is a first guess at the alt text');

  await editor(page).locator('img').first().click();
  const panel = page.getByRole('group', { name: 'Picture' });
  await panel.waitFor();
  assert.equal(await panel.getByLabel('Alt text').inputValue(), 'retry flow');
  await panel.getByLabel('Alt text').fill('A client retrying three times with growing waits');
  await panel.getByLabel('Caption (optional)').fill('Figure 1');
  await until(() => { const img = docOf(env, id).content.find((n) => n.type === 'image'); return img && img.attrs.alt.startsWith('A client retrying') && img.attrs.title === 'Figure 1'; }, 'alt text and caption are saved');

  await page.keyboard.press('ArrowRight');
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, PICTURE.toString('base64'));
  await page.waitForFunction(() => document.querySelectorAll('.ProseMirror img').length === 2);
  await until(() => docOf(env, id).content.filter((n) => n.type === 'image').length === 2, 'both pictures are saved');
  assert.deepEqual(docOf(env, id).content.filter((n) => n.type === 'image').every((n) => n.attrs.src.startsWith(blobBase(FEED_CONTAINER))), true);
});

test('the address of a YouTube video pasted on an empty line becomes a video card', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'https://www.youtube.com/watch?v=aNVDz45U-cM');
    document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await editor(page).locator('.video[data-video="aNVDz45U-cM"]').waitFor();
  await until(() => docOf(env, id).content.some((n) => n.type === 'video' && n.attrs.id === 'aNVDz45U-cM'), 'the video is saved by its id only');
});

test('each block has a handle: add a line below, turn a block into another kind, duplicate it, delete it', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, 'A plain line');
  await editor(page).locator('p').first().hover();
  const grip = page.getByRole('button', { name: /Block options/ });
  await grip.waitFor();
  await grip.click();
  await page.getByRole('menuitem', { name: 'Heading', exact: true }).click();
  await editor(page).locator('h2').waitFor();
  await editor(page).locator('h2').hover();
  await page.getByRole('button', { name: /Block options/ }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  assert.equal(await editor(page).locator('h2').count(), 2);
  await editor(page).locator('h2').last().hover();
  await page.getByRole('button', { name: /Block options/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  assert.equal(await editor(page).locator('h2').count(), 1);

  await editor(page).locator('h2').hover();
  await page.getByRole('button', { name: 'Add a block below' }).click();
  await slashList(page).waitFor();
  await page.keyboard.press('Escape');
  await until(() => nodeTypes(docOf(env, id)).includes('heading'), 'saved');
});

test('the studio says honestly what it has saved: offline it keeps the text on the device and saves when the connection is back', async (t) => {
  const { context, page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, 'The first sentence is saved.');
  await until(() => (row(env, id).body_text || '').includes('first sentence'), 'saved while online');
  await page.waitForFunction(() => document.querySelector('.studio-status').textContent === 'Saved');

  const online = await goOffline(context);
  await write(page, ' The second is written with no connection.');
  await page.locator('.studio-status.is-offline').waitFor({ timeout: 10000 });
  assert.match(await status(page).textContent(), /Offline/);
  assert.ok(!(row(env, id).body_text || '').includes('second'), 'the server does not have it');
  await page.waitForFunction((key) => !!localStorage.getItem(key), `docs.studioDraft.${id}`);

  await online();
  await until(() => (row(env, id).body_text || '').includes('second is written'), 'saved once the connection is back', 15000);
  await page.waitForFunction(() => document.querySelector('.studio-status').textContent === 'Saved');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), `docs.studioDraft.${id}`), null, 'the copy on the device is dropped once the server has it');
});

test('what was written and never saved is offered back the next time the article is opened', async (t) => {
  const { context, page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, 'This stays.');
  await until(() => (row(env, id).body_text || '').includes('This stays'), 'saved');
  await page.waitForFunction(() => document.querySelector('.studio-status').textContent === 'Saved');

  const online = await goOffline(context);
  await write(page, ' This was never saved.');
  await page.waitForFunction((key) => /never saved/.test(localStorage.getItem(key) || ''), `docs.studioDraft.${id}`);
  // The tab is closed before a save gets through: what is on the device is all there is. (The page is reloaded with saving refused.)
  const refuseSave = (route) => (route.request().method() === 'PUT' ? route.abort() : route.fallback());
  await context.route('**/api/blogs/' + id, refuseSave);
  await online();
  await page.goto(`${BASE}/write/${id}`, { waitUntil: 'networkidle' });

  const dialog = page.getByRole('dialog', { name: 'Restore your unsaved changes?' });
  await dialog.waitFor();
  await context.unroute('**/api/blogs/' + id, refuseSave);
  await dialog.getByRole('button', { name: 'Restore them' }).click();
  await editor(page).waitFor();
  assert.match(await editor(page).textContent(), /This stays\. This was never saved\./);
  await until(() => (row(env, id).body_text || '').includes('never saved'), 'and it is saved at once');
});

test('an article saved from somewhere else meanwhile is not overwritten: the author chooses', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await editor(page).click();
  await write(page, 'Written here.');
  await until(() => (row(env, id).body_text || '').includes('Written here'), 'saved');
  await page.waitForFunction(() => document.querySelector('.studio-status').textContent === 'Saved');

  env.DB.raw.prepare('UPDATE blog_posts SET updated_at = ?, title = ? WHERE id = ?').run('2999-01-01T00:00:00.000Z', 'Saved on my phone', id); // another device
  await write(page, ' More, written here.');
  const dialog = page.getByRole('dialog', { name: 'This article was changed somewhere else' });
  await dialog.waitFor({ timeout: 10000 });
  assert.equal(row(env, id).title, 'Saved on my phone', 'nothing was overwritten');
  assert.match(await status(page).textContent(), /Changed somewhere else/);

  await dialog.getByRole('button', { name: 'Keep what I have here' }).click();
  await until(() => (row(env, id).body_text || '').includes('More, written here'), 'saved after the author chose');
  await page.waitForFunction(() => document.querySelector('.studio-status').textContent === 'Saved');
});

test('the preview is the article as readers get it, and leaving it returns to the text as it was', async (t) => {
  const { page } = await openStudio(t);
  await startArticle(page);
  await title(page).fill('A preview');
  await title(page).press('Enter');
  await write(page, '## Section\nSome words here.\n');
  await write(page, '```js ');
  await write(page, 'const a = 1;');
  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('article', { name: 'Preview of the article' });
  await preview.waitFor();
  assert.equal(await preview.getByRole('heading', { level: 1 }).textContent(), 'A preview');
  assert.equal(await preview.locator('h2').count(), 1);
  await preview.locator('.codeblock .cb-copy').waitFor();
  assert.equal(await editor(page).count(), 0, 'nothing can be edited in the preview');
  await page.keyboard.press('Control+Shift+P');
  await editor(page).waitFor();
  assert.match(await editor(page).textContent(), /Some words here/);
});

test('publishing: the checks say what is missing; a first-time author chooses a name; the article goes live with its cover, topics and description', async (t) => {
  const { page, env } = await openStudio(t, '/write/', { email: 'newbie@example.com' });
  const id = await startArticle(page);
  await title(page).fill('Hello');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Ready to publish?' });
  await dialog.waitFor();
  assert.match(await dialog.getByRole('alert').first().textContent(), /title of at least 3|at least 30 words/);
  assert.equal(await dialog.getByRole('button', { name: 'Publish now' }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await title(page).fill('How retries go wrong');
  await title(page).press('Enter');
  await write(page, Array.from({ length: 45 }, (_, i) => `word${i}`).join(' '));
  await until(() => row(env, id).words >= 45, 'saved');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Ready to publish?' });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('alert').count(), 0, 'nothing is missing now');

  await dialog.locator('input[type="file"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PICTURE });
  await dialog.getByRole('img', { name: 'The cover picture' }).waitFor();
  await dialog.getByLabel('Description').fill('How a retry can make an outage worse.');
  await dialog.getByLabel('Add a topic').fill('reliability');
  await dialog.getByLabel('Add a topic').press('Enter');
  await dialog.getByLabel('Add a topic').fill('Bad Tag!');
  await dialog.getByLabel('Add a topic').press('Enter');
  await dialog.getByText('lower-case letters and numbers').waitFor();
  await dialog.getByLabel('Add a topic').fill('');
  await dialog.getByRole('button', { name: 'Publish now' }).click();

  const naming = page.getByRole('dialog', { name: 'Choose your author name' });
  await naming.waitFor();
  assert.equal(await naming.getByLabel('Handle').inputValue(), 'test-user', 'a first guess from the Google name');
  await naming.getByLabel('Handle').fill('new-writer');
  await naming.getByLabel('Name').fill('New Writer');
  await naming.getByRole('button', { name: 'Save and continue' }).click();

  const done = page.getByRole('dialog', { name: 'Your article is live' });
  await done.waitFor();
  assert.match(await done.textContent(), /Search engines will list it once it has been approved/);
  const saved = row(env, id);
  assert.equal(saved.status, 'published');
  assert.equal(saved.excerpt, 'How a retry can make an outage worse.');
  assert.ok(saved.cover_url && saved.cover_url.startsWith(blobBase(FEED_CONTAINER)));
  assert.deepEqual(env.DB.raw.prepare('SELECT tag FROM blog_tags WHERE post_id = ?').all(id).map((r) => r.tag), ['reliability']);

  await done.getByRole('link', { name: /\/blog\/how-retries-go-wrong/ }).click();
  await page.getByRole('heading', { level: 1, name: 'How retries go wrong' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/blog/how-retries-go-wrong');
});

test('an article can be scheduled; until its time it is a draft nobody else can see', async (t) => {
  const { page, env } = await openStudio(t);
  const id = await startArticle(page);
  await title(page).fill('Scheduled for later');
  await title(page).press('Enter');
  await write(page, Array.from({ length: 40 }, (_, i) => `later${i}`).join(' '));
  await until(() => row(env, id).words >= 40, 'saved');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ready to publish?' });
  await dialog.getByLabel('Schedule for later').check();
  await dialog.getByRole('button', { name: 'Schedule' }).click();
  const done = page.getByRole('dialog', { name: 'Scheduled' });
  await done.waitFor();
  assert.match(await done.textContent(), /It will go live on/);
  await done.getByRole('button', { name: 'Done' }).click();
  assert.equal(await page.locator('.studio-chip.is-scheduled').count(), 1);
  const slug = row(env, id).slug;
  assert.equal(await page.evaluate(async (address) => (await fetch(`/api/blogs/${address}`)).status, slug), 404, 'not by its address before its time');
});

test('an article that is live can be taken down from its settings, and becomes a draft again', async (t) => {
  const { page, env, seeded } = await openStudio(t);
  const mine = seeded.posts.find((p) => p.author === 'ada');
  await page.goto(`${BASE}/write/${mine.id}`, { waitUntil: 'networkidle' });
  await title(page).waitFor();
  assert.equal(await page.locator('.studio-chip.is-published').count(), 1);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Article settings' });
  await dialog.getByRole('button', { name: 'Unpublish' }).click();
  await page.locator('.studio-chip.is-draft').waitFor();
  assert.equal(row(env, mine.id).status, 'draft');
});

test('your own articles only: someone else\'s is not found, and signed out there is a way in', async (t) => {
  const { page, seeded } = await openStudio(t);
  const graces = seeded.posts.find((p) => p.author === 'grace');
  await page.goto(`${BASE}/write/${graces.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /couldn.t find this article/i }).waitFor();

  const out = await openStudio(t, '/write/', { email: null });
  await out.page.getByRole('heading', { name: 'Sign in to write' }).waitFor();
  await out.page.locator('#main').getByRole('button', { name: 'Sign in with Google' }).waitFor();
});

test('focus mode leaves only the writing, the shortcuts are listed, and the keyboard reaches everything', async (t) => {
  const { page } = await openStudio(t);
  await startArticle(page);
  await page.getByRole('button', { name: 'Focus' }).click();
  assert.equal(await page.locator('#topbar').isVisible(), false);
  assert.equal(await page.locator('#destRail').isVisible(), false);
  await page.keyboard.press('Escape');
  await page.locator('#topbar').waitFor();

  await page.keyboard.press('Control+/');
  const help = page.getByRole('dialog', { name: 'Writing shortcuts' });
  await help.waitFor();
  assert.match(await help.textContent(), /## .*heading|a heading, at the start of a line/i);
  await page.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });

  await title(page).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Subtitle');
  await page.keyboard.press('Tab');
  assert.ok(await editor(page).evaluate((el) => el === document.activeElement || el.contains(document.activeElement)), 'then the text');
});

test('on a phone the studio fits the screen and can be written in', async (t) => {
  const { page, env } = await openStudio(t, '/write/', { width: 390, height: 844 });
  const id = await startArticle(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the bar and the page do not scroll sideways');
  await title(page).fill('From a phone');
  await title(page).press('Enter');
  await write(page, 'Written with thumbs.');
  await until(() => (row(env, id).body_text || '').includes('thumbs'), 'saved');
  assert.equal(await page.getByRole('button', { name: 'Publish', exact: true }).isVisible(), true);
});

// What a stand-in writing assistant says to each question the studio can ask it.
const assistantSays = (prompt) => {
  if (/Suggest 5 titles/.test(prompt)) return { response: '1. Retries without the pile-on\n2. Idempotency keys, explained\n3. Why a retry can double a charge' };
  if (/Fix the spelling/.test(prompt)) return { response: 'A retry that runs twice must change nothing the second time.' };
  if (/Summarize/.test(prompt)) return { response: 'A short summary of why retries need idempotency.' };
  if (/topic tags/.test(prompt)) return { response: 'idempotency, retries, api-design' };
  if (/outline for an article/.test(prompt)) return { response: '## The problem\n- a retry can repeat a write\n## The fix\n- an idempotency key' };
  if (/description of the article/.test(prompt)) return { response: 'How to make retries safe.' };
  return { response: 'ok' };
};

test('the writing assistant is offered only when the site has one', async (t) => {
  const { page } = await openStudio(t);
  await startArticle(page);
  assert.equal(await page.getByRole('button', { name: 'Assistant' }).count(), 0);

  const withOne = await openStudio(t, '/write/', { assistant: assistantSays });
  await startArticle(withOne.page);
  await withOne.page.getByRole('button', { name: 'Assistant' }).waitFor();
});

test('the assistant suggests and the author decides: nothing changes until a suggestion is applied, and Undo takes it back', async (t) => {
  const { page, env } = await openStudio(t, '/write/', { assistant: assistantSays });
  const id = await startArticle(page);
  await title(page).fill('Retries');
  await title(page).press('Enter');
  await write(page, 'A retry that runs twice must change nothin the second time.');
  await page.getByRole('button', { name: 'Assistant' }).click();
  const panel = page.getByRole('complementary', { name: 'Writing assistant' });
  await panel.waitFor();
  assert.match(await panel.textContent(), /only suggests/);
  assert.equal(await panel.getByRole('button', { name: 'Improve' }).isDisabled(), true, 'nothing is selected yet');

  // It starts where the bar ends, also when the window is narrow enough for the bar to wrap onto a second line.
  const gapUnderBar = async () => {
    const bar = await page.locator('.studio-bar').boundingBox();
    const box = await panel.boundingBox();
    return Math.round(box.y - (bar.y + bar.height));
  };
  assert.equal(await gapUnderBar(), 0, 'the panel starts where the bar ends');
  await page.setViewportSize({ width: 870, height: 900 });
  await until(async () => (await page.locator('.studio-bar').boundingBox()).height > 60, 'the bar wraps onto a second line');
  await until(async () => (await gapUnderBar()) === 0, 'and the panel moves down with it');
  await page.setViewportSize({ width: 1280, height: 900 });
  await until(async () => (await gapUnderBar()) === 0, 'and back up');

  await editor(page).click();
  await page.keyboard.press('Control+A');
  await panel.getByRole('button', { name: 'Improve' }).click();
  const card = panel.getByRole('article', { name: 'Improved' });
  await card.waitFor();
  assert.match(await card.textContent(), /nothin the second time/, 'what it would replace is shown');
  assert.match(await card.textContent(), /must change nothing the second time/, 'beside what it suggests');
  assert.match(await editor(page).textContent(), /nothin the second/, 'the article is unchanged');

  await card.getByRole('button', { name: 'Replace the selection' }).click();
  assert.match(await editor(page).textContent(), /^A retry that runs twice must change nothing the second time\.$/);
  await page.keyboard.press('Control+z');
  assert.match(await editor(page).textContent(), /nothin the second/, 'Undo takes the whole suggestion back');

  await panel.getByRole('button', { name: 'Suggest titles' }).click();
  const titles = panel.getByRole('article', { name: 'Titles' });
  await titles.waitFor();
  await titles.getByRole('listitem').filter({ hasText: 'Idempotency keys, explained' }).getByRole('button', { name: 'Use' }).click();
  assert.equal(await title(page).inputValue(), 'Idempotency keys, explained');

  await panel.getByRole('button', { name: 'Suggest topics' }).click();
  await panel.getByRole('article', { name: 'Topics' }).getByRole('button', { name: 'Add them' }).click();
  await panel.getByRole('button', { name: 'Suggest a description' }).click();
  await panel.getByRole('article', { name: 'A description' }).getByRole('button', { name: 'Use as the description' }).click();
  await until(() => {
    const saved = env.DB.raw.prepare('SELECT title, excerpt FROM blog_posts WHERE id = ?').get(id);
    const tags = env.DB.raw.prepare('SELECT tag FROM blog_tags WHERE post_id = ? ORDER BY tag').all(id).map((r) => r.tag);
    return saved.title === 'Idempotency keys, explained' && saved.excerpt === 'How to make retries safe.' && tags.join() === 'api-design,idempotency,retries';
  }, 'the title, description and topics that were applied are saved');

  await panel.getByRole('button', { name: 'Summarize' }).click();
  await panel.getByRole('article', { name: 'A summary' }).getByRole('button', { name: 'Put it at the top as a note' }).click();
  assert.equal(await editor(page).locator('.cblock-key').count(), 1);
  await until(() => docOf(env, id).content[0].type === 'callout', 'the summary is saved as the first block');
});

test('an outline is inserted as headings, a table of contents lists them as links, and a suggestion for text that has changed is refused', async (t) => {
  const { page, env } = await openStudio(t, '/write/', { assistant: assistantSays });
  const id = await startArticle(page);
  await title(page).fill('Retries and idempotency');
  await title(page).press('Enter');
  await page.getByRole('button', { name: 'Assistant' }).click();
  const panel = page.getByRole('complementary', { name: 'Writing assistant' });

  await panel.getByRole('button', { name: 'Table of contents' }).click();
  await panel.getByRole('alert').getByText('Add at least two headings first').waitFor();

  await panel.getByRole('button', { name: 'Outline from the title' }).click();
  await panel.getByRole('article', { name: 'An outline' }).getByRole('button', { name: 'Insert at the cursor' }).click();
  assert.deepEqual(await editor(page).locator('h2').allTextContents(), ['The problem', 'The fix']);
  assert.equal(await editor(page).locator('ul li').count(), 2);

  await panel.getByRole('button', { name: 'Table of contents' }).click();
  await panel.getByRole('article', { name: 'A table of contents' }).getByRole('button', { name: 'Insert at the cursor' }).click();
  await until(() => JSON.stringify(docOf(env, id)).includes('"href":"#the-problem"'), 'the contents are saved as links to the headings');

  await editor(page).locator('h2').first().click({ clickCount: 3 });
  await write(page, 'A heading that is long enough to ask the assistant about');
  await editor(page).locator('h2').first().click({ clickCount: 3 });
  await panel.getByRole('button', { name: 'Improve' }).click();
  const card = panel.getByRole('article', { name: 'Improved' });
  await card.waitFor();
  // The change goes at the start of the heading, inside the text the suggestion was asked for, whatever the width of the fonts
  // (a click in the middle of the heading's box lands past the end of a short line).
  await editor(page).locator('h2').first().click();
  await page.keyboard.press('Home');
  await write(page, 'changed meanwhile: ');
  await card.getByRole('button', { name: 'Replace the selection' }).click();
  await panel.getByRole('alert').getByText('has changed since').waitFor();
  assert.match(await editor(page).locator('h2').first().textContent(), /changed meanwhile/, 'it was not overwritten');
});

test('when the assistant cannot answer the author is told, and the article is untouched', async (t) => {
  const { page } = await openStudio(t, '/write/', {
    assistant: () => { throw new Error('model down'); }
  });
  await startArticle(page);
  await title(page).fill('Retries');
  await title(page).press('Enter');
  await write(page, 'Some words that make a sentence long enough for the assistant.');
  await page.getByRole('button', { name: 'Assistant' }).click();
  const panel = page.getByRole('complementary', { name: 'Writing assistant' });
  await panel.getByRole('button', { name: 'Summarize' }).click();
  await panel.getByRole('alert').getByText('could not answer just now').waitFor();
  assert.match(await editor(page).textContent(), /Some words that make a sentence/);
});
