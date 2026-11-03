// The community's articles in a real browser: the list and its filters, an article drawn like a module, liking, saving and
// reporting, the discussion, an author's page, what a hostile article cannot do, and the phone. The API behind the page is
// the real one, answering inside the test process with a small seeded blog (blogSeed.mjs).
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { coverUrl, seedBlog } from './blogSeed.mjs';
import app from '../../api/app.js';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const SLUG = 'why-retries-need-idempotency';
const COVER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="#7a5a2b"/></svg>';
// Errors that are the environment's, not the page's.
const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));

/** A page on a seeded blog, with the site's own content security policy applied, and the covers "uploaded". */
async function openBlog(url, { email = 'reader@example.com', width = 1280, height = 900, motion, seenLanding } = {}) {
  const opened = await openPage(browser, url, { width, height, withCsp: true, motion, seenLanding });
  await opened.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => { /* not every browser has the permission */ });
  await opened.context.route('**/stroadmapprogress.blob.core.windows.net/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: COVER_SVG }));
  const env = await answerApiInProcess(opened.context, { email });
  const seeded = await seedBlog(env);
  await opened.goto();
  return { ...opened, env, seeded };
}

/** Writes and publishes an article as `cookie`, straight through the API (for what the screens could not write themselves). */
async function writeAs(env, cookie, fields) {
  const call = async (method, path, body) => (await app.request(`/api${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }, env)).json();
  const { id } = await call('POST', '/blogs', {});
  await call('PUT', `/blogs/${id}`, fields);
  return { id, ...(await call('POST', `/blogs/${id}/publish`, {})) };
}

const cards = (page) => page.locator('.blog-list .post-card');
const rows = (env, sql, ...params) => env.DB.raw.prepare(sql).all(...params);

test('the list shows the community\'s articles, newest first, with the first one large, and nothing breaks', async () => {
  const { context, page, problems } = await openBlog('/blog/');
  await page.getByRole('heading', { level: 1, name: 'Blogs' }).waitFor();
  await cards(page).first().waitFor();
  assert.equal(await cards(page).count(), 5);
  const titles = await cards(page).locator('.post-card__title').allTextContents();
  assert.deepEqual(titles, ['Why retries need idempotency', 'Designing a cache you can trust', 'What a queue is not', 'A postmortem on a Tuesday outage', 'Reading EXPLAIN without fear']);
  assert.ok(await cards(page).first().evaluate((el) => el.classList.contains('post-card--lead')), 'the newest article with a picture opens the list');
  assert.equal(await page.locator('.post-card--lead .post-card__cover img').count(), 1);
  const topics = await page.getByRole('group', { name: 'Topics' }).textContent();
  assert.match(topics, /reliability\s*3/);
  assert.equal(await page.getByRole('button', { name: /^Blogs$/ }).count() + await page.locator('#destRail .dest-btn.on').filter({ hasText: 'Blogs' }).count() > 0, true, 'the rail says where you are');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('opening an article draws it as a module is drawn, under its own address, and Back returns to the list', async () => {
  const { context, page, problems } = await openBlog('/blog/');
  await page.getByRole('link', { name: 'Why retries need idempotency' }).click();
  await page.getByRole('heading', { level: 1, name: 'Why retries need idempotency' }).waitFor();
  assert.equal(new URL(page.url()).pathname, `/blog/${SLUG}`);
  assert.match(await page.title(), /Why retries need idempotency · Backend Roadmap/);

  assert.equal(await page.locator('#content .codeblock').count(), 1, 'the code block is wrapped as in a module');
  assert.equal(await page.locator('#content .codeblock .cb-copy').count(), 1, 'with a copy button');
  await page.locator('#content .codeblock .hljs-keyword').first().waitFor({ timeout: 10000 }); // the colours load after the text
  assert.ok(await page.locator('#content .codeblock .hljs-keyword').count() > 0, 'and highlighted');
  assert.equal(await page.locator('#content .cblock-key').count(), 1, 'a callout is a content block');
  assert.equal(await page.locator('#content table thead th').count(), 2, 'a table has its head');
  assert.equal(await page.locator('#content h2 .anchor').count() >= 3, true, 'headings have their links');

  const toc = page.getByRole('navigation', { name: 'In this article' });
  assert.ok(await toc.getByRole('link').count() >= 4, 'an outline');
  await toc.getByRole('link', { name: 'Where it still goes wrong' }).click();
  assert.match(page.url(), new RegExp(`/blog/${SLUG}#where-it-still-goes-wrong$`), 'a section link keeps the article\'s address');

  await page.locator('#content .codeblock .cb-copy').click();
  await page.locator('#content .cb-copy.ok').waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /def charge\(key, amount\)/, 'the copy button copies the code');

  await page.goBack(); // a section link does not add a history entry: one Back leaves the article
  await page.getByRole('heading', { level: 1, name: 'Blogs' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/blog/');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('an article\'s address works when it is opened directly, with a section in it, and an unknown one says so', async () => {
  const { context, page } = await openBlog(`/blog/${SLUG}#before-you-ship`);
  await page.getByRole('heading', { level: 1, name: 'Why retries need idempotency' }).waitFor();
  await page.waitForFunction(() => document.getElementById('main').scrollTop > 400);
  assert.match(page.url(), /#before-you-ship$/, 'the section stays in the address');
  await context.close();

  const missing = await openBlog('/blog/there-is-no-such-article');
  await missing.page.getByRole('heading', { name: /couldn.t find this article/i }).waitFor();
  await missing.context.close();
});

test('a topic, a search and the sort narrow the list, and they are in the address so a reload keeps them', async () => {
  const { context, page } = await openBlog('/blog/');
  await cards(page).first().waitFor();

  await page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: /performance/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.blog-list .post-card').length === 2);
  assert.equal(new URL(page.url()).search, '?tag=performance');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('.blog-list .post-card').length === 2);
  assert.equal(await page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: /^performance/ }).getAttribute('aria-pressed'), 'true', 'the topic is still selected after a reload');

  await page.getByRole('button', { name: 'All topics' }).click();
  await page.getByRole('searchbox', { name: 'Search articles' }).fill('cache');
  await page.waitForFunction(() => document.querySelectorAll('.blog-list .post-card').length === 1);
  assert.equal(new URL(page.url()).search, '?q=cache');
  assert.equal(await cards(page).first().locator('.post-card__title').textContent(), 'Designing a cache you can trust');

  await page.getByRole('searchbox', { name: 'Search articles' }).fill('nothing-like-this');
  await page.getByRole('heading', { name: 'Nothing matches that' }).waitFor();
  await page.getByRole('button', { name: 'Show everything' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.blog-list .post-card').length === 5);
  assert.equal(new URL(page.url()).search, '', 'cleared');

  await page.getByRole('button', { name: 'Most liked' }).click();
  await page.waitForFunction(() => document.querySelector('.blog-list .post-card .post-card__title')?.textContent === 'Why retries need idempotency');
  assert.equal(new URL(page.url()).search, '?sort=popular');
  await context.close();
});

test('a signed-in reader can like and save an article, and the saved one is in Saved; it is theirs only', async () => {
  const { context, page, env, seeded } = await openBlog(`/blog/${SLUG}`);
  const like = page.getByRole('button', { name: /^Like this article/ });
  await like.waitFor();
  assert.equal(await like.getAttribute('aria-pressed'), 'true', 'the seed has this reader liking it');
  assert.match(await like.textContent(), /2/);

  await like.click();
  await page.waitForFunction(() => document.querySelector('.post-actions [aria-pressed]')?.getAttribute('aria-pressed') === 'false');
  assert.match(await like.textContent(), /1/, 'one like now: the other reader\'s');
  assert.equal(rows(env, 'SELECT * FROM blog_likes WHERE post_id = ?', seeded.posts[0].id).length, 1, 'and the server agrees');

  await page.locator('.post-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.post-actions').getByRole('button', { name: 'Saved', exact: true }).waitFor();
  assert.equal(rows(env, 'SELECT * FROM blog_bookmarks').length, 1);

  await page.locator('#destRail').getByRole('button', { name: 'Saved' }).click();
  await page.getByRole('button', { name: /^Articles/ }).click();
  await page.getByRole('link', { name: 'Why retries need idempotency' }).waitFor();
  await page.getByRole('button', { name: 'Remove from saved: Why retries need idempotency' }).click();
  await page.getByText('No articles saved yet').waitFor();
  assert.equal(rows(env, 'SELECT * FROM blog_bookmarks').length, 0, 'removed on the server too');
  await context.close();
});

test('signed out, liking sends the reader to sign in and brings them back to this article', async () => {
  const { context, page } = await openBlog(`/blog/${SLUG}`, { email: null });
  const signedInAt = [];
  await context.route('**/api/auth/login**', async (route) => {
    signedInAt.push(new URL(route.request().url()).searchParams.get('redirect'));
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'sign-in page' });
  });
  await page.getByRole('button', { name: /^Like this article/ }).click();
  await page.waitForFunction(() => document.body.textContent.includes('sign-in page'));
  assert.deepEqual(signedInAt, [`/blog/${SLUG}`]);
  await context.close();
});

test('an article can be reported, and the discussion under it takes a comment', async () => {
  const { context, page, env, seeded } = await openBlog(`/blog/${SLUG}`);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Report this article' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report this article' });
  await dialog.getByLabel('What is wrong?').fill('This looks like an advert');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await page.getByRole('status').filter({ hasText: 'Thanks' }).waitFor();
  assert.equal(rows(env, 'SELECT reason FROM blog_reports')[0].reason, 'This looks like an advert');

  await page.getByText('The unique constraint on the key is the part people skip').waitFor();
  await page.getByPlaceholder('Write a comment…').fill('Does the key need to be a UUID?');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await page.getByText('Does the key need to be a UUID?').waitFor();
  assert.equal(rows(env, 'SELECT path FROM comments ORDER BY created_at DESC')[0].path, `blog:${seeded.posts[0].id}`);
  await context.close();
});

test('an author\'s page has who they are and their articles, without repeating their name on every one', async () => {
  const { context, page } = await openBlog('/authors/ada-l');
  await page.getByRole('heading', { level: 1, name: 'Ada Lovelace' }).waitFor();
  await page.getByText('@ada-l').waitFor();
  await cards(page).first().waitFor();
  assert.equal(await cards(page).count(), 3);
  assert.equal(await page.locator('.blog-list .post-card__author').count(), 0);
  assert.match(await page.locator('.author-head__facts').textContent(), /3 articles/);
  assert.equal(await page.locator('.author-head__facts a').getAttribute('rel'), 'nofollow ugc noopener noreferrer', 'a link an author gave is not an endorsement');

  await page.getByRole('link', { name: 'All articles' }).click();
  await page.getByRole('heading', { level: 1, name: 'Blogs' }).waitFor();
  await context.close();
});

test('an article that tries to run script or load something it should not cannot', async () => {
  const { context, page, env, seeded, problems } = await openBlog('/blog/');
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
  const { slug } = await writeAs(env, seeded.cookies.ada, {
    title: '<img src=x onerror="window.__pwned=1">',
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: `<script>window.__pwned=2</script> ${words}` }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'a link', marks: [{ type: 'link', attrs: { href: 'javascript:window.__pwned=3' } }] }] },
        { type: 'image', attrs: { src: '/api/auth/logout', alt: 'x' } },
        { type: 'image', attrs: { src: 'https://tracker.example/pixel.png', alt: 'x' } },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '"><img src=x onerror=window.__pwned=4>' }] }
      ]
    }
  });
  await page.goto(`${BASE}/blog/${slug}`, { waitUntil: 'networkidle' });
  await page.locator('#content').waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__pwned), undefined, 'nothing ran');
  assert.deepEqual(dialogs, []);
  assert.equal(await page.locator('#content script, #content img[onerror], #content a[href^="javascript"]').count(), 0);
  assert.equal(await page.locator('#content img').count(), 0, 'neither a same-site address nor a stranger\'s picture is drawn');
  assert.match(await page.locator('#content').textContent(), /<script>window\.__pwned=2<\/script>/, 'the markup is shown as text');
  assert.equal(await page.locator('.post-title').textContent(), '<img src=x onerror="window.__pwned=1">', 'so is the title');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('on a phone the list and an article fit the screen, and Blogs is in the bottom bar', async () => {
  const { context, page } = await openBlog('/blog/', { width: 390, height: 844 });
  await cards(page).first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the list does not scroll sideways');
  await page.locator('#destRail').getByRole('button', { name: 'Blogs' }).waitFor();

  await page.getByRole('link', { name: 'Why retries need idempotency' }).click();
  await page.getByRole('heading', { level: 1, name: 'Why retries need idempotency' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'nor does the article, with its code and its table');
  const bodyWidth = await page.locator('#content').evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(bodyWidth <= 390 - 24, `the text column is ${bodyWidth}px wide`);
  await context.close();
});

test('the covers are only ever the site\'s own uploads (the seed uses them, and nothing else is fetched from elsewhere)', async () => {
  const { context, page } = await openBlog('/blog/');
  const hosts = new Set();
  page.on('request', (req) => hosts.add(new URL(req.url()).host));
  await page.reload({ waitUntil: 'networkidle' });
  await cards(page).first().waitFor();
  assert.ok([...hosts].every((h) => h === new URL(BASE).host || h === new URL(coverUrl(1)).host), `requests went to ${[...hosts].join(', ')}`);
  await context.close();
});

test('the command palette finds an article by its words or by its author, and "@" asks for articles alone', async () => {
  const { context, page, problems } = await openBlog('/blog/');
  await page.keyboard.press('Control+k');
  const search = page.getByPlaceholder(/Search modules/);
  const found = page.locator('.pal-item');

  // Among the modules, after them: the words of an article.
  await search.fill('idempotency');
  const retries = page.locator('.pal-item', { hasText: 'Why retries need idempotency' });
  await retries.waitFor();
  assert.match(await page.locator('.pal-sect', { hasText: 'Articles' }).textContent(), /Articles · 1/);
  assert.match(await retries.textContent(), /by Ada Lovelace/);

  // Alone, with "@": the newest, then the words, then an author by name or handle, and nothing but articles in the list.
  const listed = async (count) => {
    await page.waitForFunction((n) => document.querySelectorAll('.pal-item').length === n, count);
    return found.locator('.t').allTextContents();
  };
  await search.fill('@');
  const newest = await listed(5);
  assert.equal(newest[0], 'Why retries need idempotency', 'every article, newest first');
  await search.fill('@grace');
  assert.deepEqual((await listed(2)).sort(), ['A postmortem on a Tuesday outage', 'Designing a cache you can trust']);
  await search.fill('@ada-l');
  assert.equal((await listed(3)).length, 3, "an author's articles, by handle");
  await search.fill('@nothing-like-this');
  await page.getByText('No article or author matches that.').waitFor();

  await search.fill('@postmortem');
  await found.first().waitFor();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { level: 1, name: 'A postmortem on a Tuesday outage' }).waitFor();
  assert.match(new URL(page.url()).pathname, /^\/blog\/a-postmortem-on-a-tuesday-outage/);

  await page.keyboard.press('Control+k');
  await search.fill('>blogs');
  assert.equal(await page.locator('.pal-sect', { hasText: 'Articles' }).count(), 0, 'actions only, in that mode');
  assert.deepEqual(real(problems), []);
  await page.waitForLoadState('networkidle'); // closing while the article's pictures are still on their way fails the run, not this test
  await context.close();
});

test('the articles settle into place a beat at a time, and for someone who asked for less motion they are simply there', async () => {
  const animation = (page) => cards(page).evaluateAll((els) => els.map((el) => { const s = getComputedStyle(el); return { name: s.animationName, delay: s.animationDelay, duration: s.animationDuration }; }));

  const normal = await openBlog('/blog/');
  await cards(normal.page).first().waitFor();
  const arriving = await animation(normal.page);
  assert.ok(arriving.every((a) => a.name === 'card-in'), 'each card arrives');
  assert.deepEqual(arriving.slice(0, 3).map((a) => a.delay), ['0s', '0.04s', '0.08s'], 'a beat apart');
  assert.ok(parseFloat(arriving[0].duration) > 0.1, 'for a moment');
  await normal.context.close();

  const still = await openBlog('/blog/', { motion: 'reduce' });
  await cards(still.page).first().waitFor();
  for (const a of await animation(still.page)) {
    assert.ok(parseFloat(a.duration) < 0.001 && parseFloat(a.delay) === 0, `no motion and no waiting: ${a.duration} after ${a.delay}`);
  }
  await still.context.close();
});

test('a like pops its icon when it is given, and the icon is still when the page opens with it already there', async () => {
  const motion = (page) => page.locator('.post-actions .ui-btn__icon svg').first().evaluate((el) => getComputedStyle(el).animationName);

  // The seeded reader liked this article before the page opened.
  const before = await openBlog(`/blog/${SLUG}`);
  await before.page.locator('.post-actions .is-on').first().waitFor();
  assert.equal(await motion(before.page), 'none', 'a like that was already there does not pop');
  await before.context.close();

  const { context, page } = await openBlog(`/blog/${SLUG}`, { email: 'newcomer@example.com' });
  const like = page.getByRole('button', { name: /^Like this article/ });
  await like.waitFor();
  assert.equal(await like.getAttribute('aria-pressed'), 'false');
  assert.equal(await motion(page), 'none', 'nothing is moving');
  await like.click();
  await page.locator('.post-actions .is-on.just-set').waitFor();
  assert.equal(await motion(page), 'icon-pop', 'the answer to the click');
  await page.locator('.post-actions .just-set').waitFor({ state: 'detached' });
  assert.equal(await motion(page), 'none', 'and it is over');
  assert.equal(await like.getAttribute('aria-pressed'), 'true');
  await context.close();
});

test('the front door and the dashboard show the newest articles, and a way in to all of them', async () => {
  // The landing page, for someone who has not started: the newest three, and no way to write while signed out.
  const door = await openBlog('/', { email: null, seenLanding: false });
  const strip = door.page.locator('section.community-strip');
  await strip.waitFor();
  assert.equal(await strip.getByRole('heading', { level: 2, name: 'From the community' }).count(), 1);
  assert.deepEqual(await strip.locator('.post-card__title').allTextContents(), ['Why retries need idempotency', 'Designing a cache you can trust', 'What a queue is not']);
  assert.equal(await strip.getByRole('link', { name: /Write an article/ }).count() + await strip.getByRole('button', { name: /Write an article/ }).count(), 0, 'signed out, there is nothing to write with');
  await strip.getByRole('link', { name: 'Designing a cache you can trust' }).click();
  await door.page.getByRole('heading', { level: 1, name: 'Designing a cache you can trust' }).waitFor();
  assert.match(new URL(door.page.url()).pathname, /^\/blog\/designing-a-cache-you-can-trust/);
  await door.page.waitForLoadState('networkidle');
  await door.context.close();

  // The dashboard of a signed-in reader: the same, with a way to write, and "All articles" leads to the list.
  const home = await openBlog('/');
  const mine = home.page.locator('section.community-strip');
  await mine.waitFor();
  assert.equal(await mine.locator('.post-card').count(), 3);
  await mine.getByRole('link', { name: /Write an article/ }).waitFor();
  await mine.getByRole('link', { name: /All articles/ }).click();
  await home.page.getByRole('heading', { level: 1, name: 'Blogs' }).waitFor();
  assert.equal(new URL(home.page.url()).pathname, '/blog/');
  await home.page.waitForLoadState('networkidle');
  await home.context.close();
});

test('with no article yet, a signed-in reader is invited to write the first, and a visitor sees nothing', async () => {
  for (const [email, expectation] of [['reader@example.com', true], [null, false]]) {
    const opened = await openPage(browser, '/', { withCsp: true });
    await answerApiInProcess(opened.context, { email }); // an empty blog
    await opened.goto();
    await opened.page.locator('#empty').waitFor();
    await opened.page.waitForTimeout(600);
    const strip = opened.page.locator('section.community-strip');
    assert.equal(await strip.count(), expectation ? 1 : 0, expectation ? 'the invitation' : 'no empty section');
    if (expectation) {
      assert.match(await strip.textContent(), /The first article is yours to write/);
      await strip.getByRole('link', { name: /Write an article/ }).click();
      await opened.page.getByRole('button', { name: 'New article' }).first().waitFor();
      assert.equal(new URL(opened.page.url()).pathname, '/write/');
    }
    await opened.page.waitForLoadState('networkidle');
    await opened.context.close();
  }
});

test('an admin approves, takes down, puts back and trusts from the Articles section, and the number on its tab follows', async () => {
  const { context, page, env, seeded } = await openBlog('/#__admin', { email: OWNER_EMAIL });
  await page.getByRole('button', { name: /^Articles 5$/ }).click();
  const rows = page.locator('.admin-row');
  await rows.first().waitFor();
  assert.equal(await rows.count(), 5, 'every article is waiting: nobody is trusted yet');
  const read = await rows.first().getByRole('button', { name: 'Read' }).boundingBox();
  const approve = await rows.first().getByRole('button', { name: 'Approve' }).boundingBox();
  assert.ok(approve.x - (read.x + read.width) >= 4, 'the buttons are apart from each other');

  await rows.first().getByRole('button', { name: 'Approve' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-row').length === 4);
  await page.getByRole('button', { name: /^Articles 4$/ }).waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM blog_posts WHERE approved = 1').get().n, 1);

  await rows.first().getByRole('button', { name: /^Trust / }).click();
  await rows.first().getByText('Trusted author').waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM author_profiles WHERE trusted = 1').get().n, 1);

  const takenDown = await rows.first().locator('strong').textContent();
  await rows.first().getByRole('button', { name: 'Take down' }).click();
  await rows.first().getByLabel('Reason (the author is shown it)').fill('Not a lesson: it is an advert.');
  await rows.first().locator('.admin-reject').getByRole('button', { name: 'Take down' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-row').length === 3);
  assert.equal(env.DB.raw.prepare('SELECT note FROM post_moderation').get().note, 'Not a lesson: it is an advert.', 'the reason is kept for the author');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM blog_posts WHERE hidden = 1').get().n, 1);
  assert.equal(await page.evaluate(async () => (await (await fetch('/api/blogs')).json()).posts.length), 4, 'it is off the site at once');

  await page.getByRole('tab', { name: 'Taken down' }).click();
  await rows.first().getByText(takenDown).waitFor();
  await rows.first().getByRole('button', { name: 'Put back' }).click();
  await page.getByText('No article is taken down.').waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM blog_posts WHERE hidden = 1').get().n, 0);
  assert.ok(seeded.posts.length === 5);
  await context.close();
});
