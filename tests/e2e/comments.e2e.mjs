// The discussions in a real browser: the order they are read in, what is left when a comment with replies is deleted, a link
// that goes to one comment, and the account menu that says who replied and where. The API behind the page is the real one,
// answering inside the test process; the rows a thread needs are put in the table (posting is rate limited).
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { seedBlog } from './blogSeed.mjs';
import { config } from '../../scripts/lib/config.mjs';

const LESSON = '/backend/03-authentication-and-authorization/01-sessions-and-cookies/';
const MODULE = 'backend/03-authentication-and-authorization/01-sessions-and-cookies/README.md';
const ADA = 'user-ada@example.com';
const GRACE = 'user-grace@example.com';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));
let clock = Date.parse('2026-10-01T00:00:00Z');
/** A comment in the table: `by` is a user id, `parent` the id of the comment it replies to. */
function comment(env, id, { path = MODULE, by = ADA, name = 'Ada Lovelace', parent = '', answer = 0, at = new Date((clock += 60000)).toISOString() } = {}) {
  env.DB.raw.prepare('INSERT INTO comments (id, path, user_id, display_name, text, parent_id, is_answer, hidden, created_at, mentions) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .run(id, path, by, name, `text of ${id}`, parent, answer, at, '[]');
}
const vote = (env, id, voter) => env.DB.raw.prepare('INSERT INTO comment_votes (path, comment_id, voter_id) VALUES (?, ?, ?)').run(MODULE, id, voter);
const thread = (page) => page.locator('section.comments .comment .comment-text').allTextContents();

/** The lesson (or `url`), signed in as `email`, with `seed(env)` run on the database first. `lastLooked` names the storage keys of readers who last looked long ago. */
async function openLesson({ email = 'reader@example.com', seed, url = LESSON, lastLooked = [] } = {}) {
  const opened = await openPage(browser, url);
  const env = await answerApiInProcess(opened.context, { email });
  for (const key of lastLooked) await opened.context.addInitScript(([k]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, '2020-01-01T00:00:00.000Z'); }, [key]);
  if (seed) await seed(env);
  await opened.goto();
  return { ...opened, env };
}

test('a discussion is read oldest first, newest first or most helpful first, and an answer always leads', async () => {
  const { context, page, problems } = await openLesson({
    seed: (env) => {
      comment(env, 'c1');
      comment(env, 'c2');
      comment(env, 'c3');
      vote(env, 'c2', GRACE);
      vote(env, 'c2', 'someone-else');
      vote(env, 'c3', GRACE);
    }
  });
  await page.locator('section.comments .comment').first().waitFor();
  const order = page.getByRole('group', { name: 'Order of the discussion' });

  assert.deepEqual(await thread(page), ['text of c1', 'text of c2', 'text of c3'], 'oldest first is how a conversation reads');
  await order.getByRole('button', { name: 'Newest' }).click();
  assert.deepEqual(await thread(page), ['text of c3', 'text of c2', 'text of c1']);
  await order.getByRole('button', { name: 'Most helpful' }).click();
  assert.deepEqual(await thread(page), ['text of c2', 'text of c3', 'text of c1']);
  assert.equal(await order.getByRole('button', { name: 'Most helpful' }).getAttribute('aria-pressed'), 'true');

  // The same discussion with an answer: it comes first in every order.
  const answered = await openLesson({ seed: (env) => { comment(env, 'c1'); comment(env, 'c2'); comment(env, 'c3', { answer: 1 }); } });
  await answered.page.locator('section.comments .comment').first().waitFor();
  for (const name of ['Oldest', 'Newest', 'Most helpful']) {
    await answered.page.getByRole('group', { name: 'Order of the discussion' }).getByRole('button', { name }).click();
    assert.equal((await thread(answered.page))[0], 'text of c3', `the answer leads in "${name}"`);
  }
  assert.deepEqual(real(problems).concat(real(answered.problems)), []);
  await answered.context.close();
  await context.close();
});

test('a comment deleted while it has replies stays as a stand-in with nothing to do but reply, and goes when its last reply does', async () => {
  const { context, page, problems } = await openLesson({
    email: OWNER_EMAIL,
    seed: (env) => { comment(env, 'c1'); comment(env, 'r1', { by: GRACE, name: 'Grace Hopper', parent: 'c1' }); vote(env, 'c1', GRACE); }
  });
  const remove = async (text) => {
    await page.locator('section.comments .comment', { hasText: text }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  };
  await page.locator('section.comments .comment').first().waitFor();

  await remove('text of c1');
  await page.locator('#comment-c1.is-deleted').waitFor();
  assert.deepEqual(await thread(page), ['[deleted]', 'text of r1'], 'the reply keeps its place');
  assert.deepEqual(await page.locator('#comment-c1').getByRole('button').allTextContents(), ['Reply'], 'nothing else can be done with it');
  assert.equal(await page.locator('#comment-c1 strong').count(), 0, 'and it has no author');

  await remove('text of r1');
  await page.waitForFunction(() => document.querySelectorAll('section.comments .comment').length === 0);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a question in Community leads to the question itself: the module opens scrolled to it, with it marked and focused', async () => {
  const { context, page, problems } = await openLesson({ url: '/#__community', seed: (env) => { comment(env, 'q1'); comment(env, 'q2'); } });
  await page.getByRole('button', { name: 'text of q1' }).click();

  const target = page.locator('#comment-q1');
  await target.waitFor();
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).hash, `${LESSON}#comment-q1`);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'comment-q1');
  assert.match(await target.getAttribute('class'), /is-linked/, 'it is marked');
  // The page above it is still settling (diagrams, pictures); the comment is held in view while it does.
  const inView = (id) => page.waitForFunction((anchor) => { const r = document.getElementById(anchor).getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }, id, { timeout: 6000 });
  await inView('comment-q1');
  assert.equal(await page.locator('#comment-q2.is-linked').count(), 0, 'and the other is not');

  // The same address, opened cold, does the same.
  await page.goto(`${BASE}${LESSON}#comment-q2`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'comment-q2');
  await inView('comment-q2');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('the account menu says who replied or mentioned you and where, and each item leads there', async () => {
  const { context, page, problems } = await openLesson({
    email: 'ada@example.com',
    lastLooked: [config.storage.activityLastSeen],
    seed: async (env) => {
      const { posts } = await seedBlog(env);
      const article = posts.find((p) => p.author === 'ada');
      env.DB.raw.prepare('INSERT INTO feed_posts (id, user_id, display_name, text, created_at) VALUES (?, ?, ?, ?, ?)').run('p1', ADA, 'Ada Lovelace', 'A post about queues', '2026-10-01T00:00:00Z');
      comment(env, 'mine', { at: '2026-09-01T00:00:00Z' });
      comment(env, 'r-module', { by: GRACE, name: 'Grace Hopper', parent: 'mine', at: '2026-10-02T00:00:00Z' });
      comment(env, 'mine-post', { path: 'feed:p1', at: '2026-09-02T00:00:00Z' });
      comment(env, 'r-post', { path: 'feed:p1', by: GRACE, name: 'Grace Hopper', parent: 'mine-post', at: '2026-10-03T00:00:00Z' });
      comment(env, 'mine-article', { path: `blog:${article.id}`, at: '2026-09-03T00:00:00Z' });
      comment(env, 'r-article', { path: `blog:${article.id}`, by: GRACE, name: 'Grace Hopper', parent: 'mine-article', at: '2026-10-04T00:00:00Z' });
    }
  });
  const openMenu = async () => {
    await page.locator('#authBtn').click();
    return page.getByRole('menu');
  };
  const replies = (menu) => menu.getByRole('menuitem').filter({ hasText: 'Grace Hopper replied' });

  let menu = await openMenu();
  const where = await replies(menu).locator('.ui-menu__sub').allTextContents();
  assert.equal(where.length, 3, 'one item for each reply');
  assert.deepEqual(where.slice(0, 2), ['Why retries need idempotency', '“A post about queues”'], 'newest first: the article, the post');
  assert.match(where[2], /session/i, 'and the module, by its title');

  await replies(menu).filter({ hasText: 'A post about queues' }).click();
  await page.getByRole('button', { name: '← Back to Posts' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#__feed@p1');

  menu = await openMenu();
  await replies(menu).filter({ hasText: 'Why retries need idempotency' }).click();
  await page.waitForFunction(() => location.pathname.startsWith('/blog/'));

  menu = await openMenu();
  await replies(menu).last().click();
  await page.locator('#comment-r-module').waitFor();
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).hash, `${LESSON}#comment-r-module`);
  assert.deepEqual(real(problems), []);
  await context.close();
});
