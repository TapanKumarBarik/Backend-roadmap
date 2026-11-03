// The design system and the shell built on it, in a real browser: dialogs, menus, tabs and toasts do what a keyboard and a
// screen reader expect; the rail names every place; the phone bar fits; the skip link stays on the screen; nobody sees
// "Sign in" for a moment while the server is still saying who they are; and no browser confirm() is left.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, answerApiInProcess, launchBrowser, openPage } from './support.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const DESIGN = '/#__design';
// Errors that are the environment's (no API behind a plain preview), not the page's.
const real = (problems) => problems.filter((p) => !/Failed to load resource|\/api\//.test(p));

async function styleGuide(options) {
  const opened = await openPage(browser, DESIGN, options);
  await opened.goto();
  await opened.page.getByRole('heading', { level: 1, name: 'Blueprint' }).waitFor();
  return opened;
}

test('the style guide draws every token from the page itself, with no errors', async () => {
  const { context, page, problems } = await styleGuide();
  assert.ok(await page.locator('.dz-swatch').count() >= 14, 'the colour tokens are listed');
  const first = await page.locator('.dz-swatch').first().textContent();
  assert.match(first, /--bg.*#[0-9a-f]{6}/i, 'with the value read back from the stylesheet');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a dialog takes focus, keeps it, makes the page behind it inert, and gives focus back on Escape', async () => {
  const { context, page } = await styleGuide();
  const opener = page.getByRole('button', { name: 'Open a dialog' });
  await opener.focus();
  await opener.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Publish this article?' });
  await dialog.waitFor();
  assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)), 'focus is inside the dialog');
  assert.equal(await page.evaluate(() => document.getElementById('root').inert), true, 'the app behind it is inert');

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} stays inside`);
  }
  await page.keyboard.press('Shift+Tab');
  assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)), 'and so does Shift+Tab');

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.getElementById('root').inert), false, 'the app is usable again');
  assert.equal(await opener.evaluate((el) => el === document.activeElement), true, 'and focus is back on the button that opened it');
  await context.close();
});

test('confirm() is a dialog: it asks, Cancel has focus, and the answer comes back', async () => {
  const { context, page } = await styleGuide();
  let nativeDialogs = 0;
  page.on('dialog', async (d) => { nativeDialogs++; await d.dismiss(); });

  await page.getByRole('button', { name: 'Confirm (danger)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this draft?' });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Cancel' }).evaluate((el) => el === document.activeElement), true, 'the safe choice is focused');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('status').filter({ hasText: 'Kept' }).waitFor();

  await page.getByRole('button', { name: 'Confirm (danger)' }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Deleted' }).waitFor();
  assert.equal(nativeDialogs, 0, 'no browser confirm() or alert() was shown');
  await context.close();
});

test('a menu opens on the first item, moves with the arrow keys and a letter, and Escape returns focus to its button', async () => {
  const { context, page } = await styleGuide();
  const trigger = page.getByRole('button', { name: 'Open a menu' });
  await trigger.click();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  assert.equal(await page.getByRole('menuitem', { name: 'Bookmark' }).evaluate((el) => el === document.activeElement), true, 'the first item has focus');

  await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByRole('menuitem', { name: 'Copy link' }).evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByRole('menuitem', { name: 'Report' }).evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByRole('menuitem', { name: 'Bookmark' }).evaluate((el) => el === document.activeElement), true, 'it wraps');
  await page.keyboard.press('c');
  assert.equal(await page.getByRole('menuitem', { name: 'Copy link' }).evaluate((el) => el === document.activeElement), true, 'a letter jumps to the item that starts with it');

  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true, 'focus is back on the button');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await context.close();
});

test('tabs: the arrow keys, Home and End move and select, and only the selected tab is in the tab order', async () => {
  const { context, page } = await styleGuide();
  const tabs = page.getByRole('tab');
  await tabs.first().focus();
  assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
  assert.equal(await tabs.nth(1).getAttribute('tabindex'), '-1');

  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
  assert.equal(await tabs.nth(1).evaluate((el) => el === document.activeElement), true);
  await page.getByRole('tabpanel').filter({ hasText: 'Four replies' }).waitFor();
  await page.keyboard.press('End');
  assert.equal(await tabs.last().getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
  await context.close();
});

test('a toast is announced politely, an error at once, and it leaves by itself', async () => {
  const { context, page } = await styleGuide();
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  const toast = page.locator('.ui-toast').first();
  await toast.waitFor();
  assert.equal(await toast.getAttribute('role'), 'status');
  await page.getByRole('button', { name: 'Error toast' }).click();
  assert.equal(await page.locator('.ui-toast--danger').getAttribute('role'), 'alert');
  await page.waitForFunction(() => document.querySelectorAll('.ui-toast').length === 0, null, { timeout: 8000 });
  await context.close();
});

test('for someone who asks for less motion, a screen arrives with none', async () => {
  const { context, page } = await styleGuide({ motion: 'reduce' });
  const duration = await page.locator('main.screen-enter').evaluate((el) => getComputedStyle(el).animationDuration);
  assert.ok(parseFloat(duration) < 0.001 || /e-0[5-9]|^0(\.0+)?m?s$/.test(duration), `animation duration is ${duration}`);
  await context.close();
});

test('the rail names every place and groups them; keyboard focus is visible', async () => {
  const { context, page } = await openPage(browser, '/#__feed', { width: 1440, height: 900 });
  await page.goto(`${BASE}/#__feed`, { waitUntil: 'networkidle' });
  const labels = await page.locator('#destRail .dest-label').allTextContents();
  assert.ok(labels.length >= 2 && labels.every((l) => l.trim().length > 0), `every rail item has a visible name: ${labels.join(', ')}`);
  assert.ok(await page.locator('#destRail .dest-group').count() >= 2, 'in groups');
  const cut = await page.locator('#destRail .dest-label').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent));
  assert.deepEqual(cut, [], 'no name is cut short');
  assert.ok(await page.locator('#destRail .dest-label').first().isVisible());

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.locator('#destRail .dest-btn').first().focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const outline = await page.locator('#destRail .dest-btn').first().evaluate((el) => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth]; });
  assert.deepEqual(outline, ['solid', '2px'], 'keyboard focus draws a ring');
  await context.close();
});

test('on a phone the bottom bar holds five places, and the rest are behind More', async () => {
  const { context, page } = await openPage(browser, '/', { width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const buttons = page.locator('#destRail > .dest-btn');
  assert.ok(await buttons.count() <= 5, `${await buttons.count()} places in the bar`);
  const more = page.locator('#destRail').getByRole('button', { name: 'More' });
  await more.click();
  const sheet = page.getByRole('dialog', { name: 'More places' });
  await sheet.waitFor();
  await sheet.getByRole('button', { name: 'Community' }).click();
  await sheet.waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).hash, '#__community');
  await context.close();
});

test('the skip link moves focus to the page and leaves the screen you are on', async () => {
  const { context, page } = await openPage(browser, '/#__feed');
  await page.goto(`${BASE}/#__feed`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#__feed', 'still on the feed (a "#main" link used to leave for the home page)');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  assert.equal(await page.locator('main#main').count(), 1, 'the page is a main landmark');
  await context.close();
});

test('a signed-in reader never sees "Sign in" while the server is still saying who they are', async () => {
  const { context, page } = await openPage(browser, '/');
  await answerApiInProcess(context, { email: 'reader@example.com' });
  await context.route('**/api/auth/me', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.fallback(); });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.ui-avatar-skeleton').waitFor();
  assert.equal(await page.locator('.gsi-btn').count(), 0, 'no sign-in button while it is not known');
  await page.locator('#authBtn').waitFor();
  assert.equal(await page.locator('.gsi-btn').count(), 0);
  await context.close();
});

test('the account menu opens from the avatar, and "Delete account" asks with a dialog and returns focus to the avatar', async () => {
  const { context, page } = await openPage(browser, '/');
  await answerApiInProcess(context, { email: 'reader@example.com' });
  let nativeDialogs = 0;
  page.on('dialog', async (d) => { nativeDialogs++; await d.dismiss(); });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('#authBtn').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).waitFor();
  await page.getByRole('menuitem', { name: /Delete account/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete your account/ });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#authBtn').evaluate((el) => el === document.activeElement), true, 'focus returns to where the menu was opened');
  assert.equal(nativeDialogs, 0);
  await context.close();
});

test('"Reset all progress" and "Keyboard shortcuts" are dialogs, not browser pop-ups', async () => {
  const { context, page } = await openPage(browser, '/');
  let nativeDialogs = 0;
  page.on('dialog', async (d) => { nativeDialogs++; await d.dismiss(); });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  await page.locator('#menuBtn').click();
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
  const keys = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await keys.waitFor();
  assert.ok(await keys.locator('kbd').count() >= 6);
  await page.keyboard.press('Escape');
  await keys.waitFor({ state: 'detached' });

  await page.locator('#menuBtn').click();
  await page.getByRole('menuitem', { name: 'Reset all progress' }).click();
  const reset = page.getByRole('dialog', { name: 'Reset all progress?' });
  await reset.waitFor();
  await reset.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(nativeDialogs, 0);
  await context.close();
});

test('on a wide screen the six main places are links in the top bar, the rail keeps the others, and below that width they are all in the rail', async () => {
  const wide = await openPage(browser, '/#__feed', { width: 1440, height: 900 });
  await wide.page.goto(`${BASE}/#__feed`, { waitUntil: 'networkidle' });
  const links = wide.page.locator('#mainNav').getByRole('link');
  assert.deepEqual(await links.allTextContents(), ['Learn', 'Explore', 'Practice', 'Design Lab', 'Community', 'My Learning']);
  assert.equal(await wide.page.locator('#mainNav').getAttribute('aria-label'), 'Main');
  assert.equal(await wide.page.locator('#mainNav a[aria-current="page"]').count(), 1, 'one place says it is where you are');
  const railed = await wide.page.locator('#destRail .dest-label').allTextContents();
  for (const name of ['Explore', 'Practice', 'Design Lab', 'Community', 'My Learning']) assert.ok(!railed.includes(name), `${name} is not in the rail as well`);
  assert.ok(railed.includes('Blogs') && railed.includes('Videos'), 'the rail keeps the other places');

  await links.nth(2).focus();
  const outline = await links.nth(2).evaluate((el) => getComputedStyle(el).outlineStyle);
  assert.equal(outline, 'solid', 'keyboard focus draws a ring');
  await links.nth(3).click();
  await wide.page.getByRole('heading', { level: 2, name: 'Design Lab' }).waitFor();
  assert.equal(new URL(wide.page.url()).pathname, '/design-lab/');
  assert.equal(await wide.page.locator('#mainNav a[aria-current="page"]').textContent(), 'Design Lab');
  const fits = await wide.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.equal(fits, true, 'the top bar fits');
  await wide.context.close();

  for (const width of [1280, 1366]) {
    const narrowish = await openPage(browser, '/', { width, height: 800 });
    await narrowish.page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    assert.equal(await narrowish.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `nothing overflows at ${width}px`);
    assert.equal(await narrowish.page.locator('#searchTrigger').isVisible(), true, `search is still there at ${width}px`);
    await narrowish.context.close();
  }

  const narrow = await openPage(browser, '/', { width: 1000, height: 800 });
  await narrow.page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  assert.equal(await narrow.page.locator('#mainNav').count(), 0, 'no room for it: the places are in the rail');
  const inRail = await narrow.page.locator('#destRail .dest-label').allTextContents();
  for (const name of ['Explore', 'Practice', 'Design Lab', 'Community', 'My Learning']) assert.ok(inRail.includes(name), `${name} is in the rail`);
  await narrow.context.close();
});
