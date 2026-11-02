// The community hub in a real browser: one place in the rail, four tabs (questions, posts, resources, ideas), every address the screens
// had before the tabs still opening the right one, the keyboard staying on the tab that was chosen, and the dots that say what is new.
// The API behind the page is the real one, answering inside the test process.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { config } from '../../scripts/lib/config.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));
const hashOf = (page) => new URL(page.url()).hash;
const tablist = (page) => page.getByRole('tablist', { name: 'Community' });
const tabs = (page) => tablist(page).getByRole('tab');
const selectedTab = (page) => tablist(page).locator('[role="tab"][aria-selected="true"]');
const railButton = (page, name) => page.locator('#destRail').getByRole('button', { name });

/** The community, signed in as a reader (or signed out when `email` is null), opened on `url`. */
async function openCommunity(url = '/#__community', { email = 'reader@example.com', ...options } = {}) {
  const opened = await openPage(browser, url, options);
  const env = await answerApiInProcess(opened.context, { email });
  return { ...opened, env };
}

function addPost(env, id, text, createdAt = new Date().toISOString()) {
  env.DB.raw.prepare('INSERT INTO feed_posts (id, user_id, display_name, text, created_at) VALUES (?, ?, ?, ?, ?)').run(id, 'someone-else', 'Grace Hopper', text, createdAt);
}

test('Community is one place in the rail, and its tabs are questions, posts, resources and ideas', async () => {
  const { context, page, problems, goto } = await openCommunity();
  await goto();
  await page.getByRole('heading', { level: 2, name: 'Community' }).waitFor();
  assert.deepEqual(await tabs(page).allTextContents(), ['Questions', 'Posts', 'Resources', 'Ideas']);
  assert.equal(await selectedTab(page).textContent(), 'Questions');

  const places = await page.locator('#destRail .dest-label').allTextContents();
  assert.ok(places.includes('Community'), 'the rail has Community');
  assert.deepEqual(places.filter((p) => ['Feed', 'Posts', 'Books', 'Suggestions', 'Ideas'].includes(p)), [], 'and not the places that are its tabs now');
  assert.equal(await railButton(page, 'Community').getAttribute('aria-current'), 'page');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('each tab opens its own screen under the address it always had, and the tab strip stays where it is', async () => {
  const { context, page, goto } = await openCommunity();
  await goto();
  await tablist(page).waitFor();
  await tablist(page).evaluate((el) => { el.dataset.kept = 'yes'; });

  const steps = [
    ['Posts', '#__feed', page.getByPlaceholder('Share something…')],
    ['Resources', '#__books', page.getByText('A shared shelf')],
    ['Ideas', '#__suggestions', page.getByPlaceholder('What should this app do better?')],
    ['Questions', '#__community', page.getByText('Questions asked on the modules themselves')]
  ];
  for (const [name, hash, content] of steps) {
    await tabs(page).filter({ hasText: new RegExp(`^${name}`) }).click();
    await content.waitFor();
    assert.equal(hashOf(page), hash);
    assert.equal(await selectedTab(page).textContent(), name);
    assert.equal(await railButton(page, 'Community').getAttribute('aria-current'), 'page', 'the rail still says where you are');
  }
  assert.equal(await tablist(page).getAttribute('data-kept'), 'yes', 'the tabs were not drawn again');

  await page.goBack();
  await page.getByPlaceholder('What should this app do better?').waitFor();
  assert.equal(await selectedTab(page).textContent(), 'Ideas', 'Back walks the tabs that were opened');
  await context.close();
});

test('the addresses the screens had before the tabs open the right tab', async () => {
  const { context, page } = await openCommunity();
  for (const [hash, name] of [['#__feed', 'Posts'], ['#__books', 'Resources'], ['#__suggestions', 'Ideas'], ['#__community', 'Questions']]) {
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' });
    await tablist(page).waitFor();
    assert.equal(await selectedTab(page).textContent(), name, `${hash} opens ${name}`);
    await page.reload({ waitUntil: 'networkidle' });
    await tablist(page).waitFor();
    assert.equal(await selectedTab(page).textContent(), name, `and still does after a reload`);
  }
  await context.close();
});

test('the arrow keys, Home and End move between the tabs, and the focus stays on the tab', async () => {
  const { context, page, goto } = await openCommunity();
  await goto();
  await tablist(page).waitFor();
  const focused = () => page.evaluate(() => `${document.activeElement.getAttribute('role')}:${document.activeElement.textContent}`);

  await tabs(page).first().focus();
  await page.keyboard.press('ArrowRight');
  await page.getByPlaceholder('Share something…').waitFor();
  assert.equal(await focused(), 'tab:Posts');
  assert.equal(hashOf(page), '#__feed');

  await page.keyboard.press('End');
  await page.getByPlaceholder('What should this app do better?').waitFor();
  assert.equal(await focused(), 'tab:Ideas');

  await page.keyboard.press('Home');
  await page.getByText('Questions asked on the modules themselves').waitFor();
  assert.equal(await focused(), 'tab:Questions');
  await context.close();
});

test('a tab with something new says so, and opening it clears the dot on the tab and on the rail', async () => {
  const { context, page, env, goto } = await openCommunity();
  // A reader who last looked a long time ago (only until they look: the script must not undo that on a reload), and a post made since.
  await context.addInitScript(([key]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, '2020-01-01T00:00:00.000Z'); }, [config.storage.feedLastSeen]);
  addPost(env, 'post-new', 'A post nobody has read yet');
  await goto();
  await tablist(page).waitFor();

  await railButton(page, 'Community — new activity').waitFor();
  await tabs(page).filter({ hasText: /^Posts\s*new$/ }).waitFor();
  assert.equal(await selectedTab(page).textContent(), 'Questions', 'the tab that was asked for is open, not the one with news');

  await tabs(page).filter({ hasText: /^Posts/ }).click();
  await page.getByText('A post nobody has read yet').waitFor();
  await tabs(page).filter({ hasText: /^Posts$/ }).waitFor();
  await railButton(page, 'Community').waitFor();
  assert.equal(await page.locator('#destRail .activity-dot').count(), 0, 'nothing is new any more');

  await page.reload({ waitUntil: 'networkidle' });
  await tablist(page).waitFor();
  assert.equal(await page.locator('#destRail .activity-dot').count(), 0, 'and it stays that way');
  await context.close();
});

test('a post has a page of its own that is not a tab, and Back to Posts returns to the tab', async () => {
  const { context, page, env, goto } = await openCommunity('/#__feed@post-1');
  addPost(env, 'post-1', 'A post with a thread');
  await goto();
  await page.getByText('A post with a thread').waitFor();
  assert.equal(await tablist(page).count(), 0, 'a post is not drawn inside the tabs');
  assert.equal(await railButton(page, 'Community').getAttribute('aria-current'), 'page');

  await page.getByRole('button', { name: '← Back to Posts' }).click();
  await tablist(page).waitFor();
  assert.equal(hashOf(page), '#__feed');
  assert.equal(await selectedTab(page).textContent(), 'Posts');
  await context.close();
});

test('the command palette finds a tab by the name it had before', async () => {
  const { context, page, goto } = await openCommunity('/#__saved');
  await goto();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search modules/).fill('>feed');
  await page.locator('.pal-item', { hasText: 'Community — posts' }).waitFor();
  await page.keyboard.press('Enter');
  await tablist(page).waitFor();
  assert.equal(hashOf(page), '#__feed');
  assert.equal(await selectedTab(page).textContent(), 'Posts');
  await context.close();
});

test('on a phone Community is behind More, and its four tabs fit the screen', async () => {
  const { context, page, goto } = await openCommunity('/', { width: 390, height: 844 });
  await goto();
  await railButton(page, 'More').click();
  const sheet = page.getByRole('dialog', { name: 'More places' });
  await sheet.getByRole('button', { name: 'Community' }).click();
  await sheet.waitFor({ state: 'detached' });
  await tablist(page).waitFor();
  assert.equal(hashOf(page), '#__community');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'nothing makes the page wider than the screen');
  for (const box of await tabs(page).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }))) {
    assert.ok(box.left >= 0 && box.right <= 390, `a tab is inside the screen (${box.left}..${box.right})`);
  }
  await context.close();
});
