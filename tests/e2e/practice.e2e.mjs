// The Practice Center, My Learning, the learning-path pages and the admins' notices, in a real browser. The API behind the
// page is the real one, answering inside the test process (support.mjs), with the real quizzes and sets from content/.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { BASE, OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage, publicVideos } from './support.mjs';
import { moduleUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';
import practiceContent from '../../api/generated/practice-content.json' with { type: 'json' };
import { HERO } from '../../webapp/src/config/landing.js';
import { config } from '../../scripts/lib/config.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));
// On a wide screen the main places are links in the top bar.
const mainLink = (page, name) => page.locator('#mainNav').getByRole('link', { name });

/** Waits for something that happens in the database after a pause (typing is saved a moment after it stops). */
async function until(read, message) {
  for (let i = 0; i < 60; i++) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
  return null;
}

/** The site on `url`, signed in as `email` (or signed out when it is null). */
async function open(url, { email = 'reader@example.com', ...options } = {}) {
  const opened = await openPage(browser, url, options);
  const env = await answerApiInProcess(opened.context, { email });
  return { ...opened, env };
}

test('the top bar has Practice and My Learning, and Practice lists the coding problems, quizzes, coding sets, interview sets and exercises', async () => {
  const { context, page, problems, goto } = await open('/#__practice');
  await goto();
  await page.getByRole('heading', { level: 2, name: 'Practice' }).waitFor();
  const places = await page.locator('#mainNav a').allTextContents();
  for (const name of ['Practice', 'My Learning']) assert.ok(places.includes(name), `the top bar has ${name}`);
  assert.ok(!places.includes('Design Lab'), 'the Design Lab is gone');
  assert.equal(await mainLink(page, 'Practice').getAttribute('aria-current'), 'page');

  const tablist = page.getByRole('tablist', { name: /practice/i });
  assert.deepEqual((await tablist.getByRole('tab').allTextContents()).map((t) => t.replace(/\d+$/, '')), ['Code practice', 'Study plans', 'Quizzes', 'Coding questions', 'Interview prep', 'Exercises']);
  assert.ok(await page.locator('.cm-topic').count() > 0, 'the coding problems are on the first tab, as a map of topics');
  await tablist.getByRole('tab', { name: /^Quizzes/ }).click();
  assert.ok(await page.getByRole('link', { name: /HTTP caching/i }).count() > 0, 'the quizzes are listed');
  await tablist.getByRole('tab', { name: /^Coding questions/ }).click();
  assert.ok(await page.locator('.pr-card').count() > 0, 'and the coding sets');
  await tablist.getByRole('tab', { name: 'Exercises' }).click();
  assert.ok(await page.locator('.pr-card').count() > 0, 'and so are the exercises');
  await tablist.getByRole('tab', { name: 'Interview prep' }).click();
  assert.ok(await page.locator('.pr-card').count() > 0, 'and the interview sets');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a quiz is taken, scored on the server, and kept: the answers are not in the page before the attempt', async () => {
  const { context, page, env, problems, goto } = await open('/#__practice@quiz/http-caching');
  const bodies = [];
  page.on('response', async (res) => { if (/\/api\/practice\/quizzes\/http-caching$/.test(res.url())) bodies.push(await res.text()); });
  await goto();
  await page.getByRole('heading', { level: 2, name: /caching/i }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/practice/quiz/http-caching/', 'a quiz has an address of its own');
  assert.match(await page.title(), /^HTTP caching · /);
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  assert.ok(bodies.length > 0, 'the quiz was fetched');
  assert.doesNotMatch(bodies[0], /"answer"|"correct"|explanation/, 'the quiz sent to the browser carries no answers or explanations');

  const check = page.getByRole('button', { name: 'Check my answers' });
  assert.equal(await check.isDisabled(), true, 'nothing to check until something is answered');
  await page.locator('.pr-questions > li').first().locator('input').first().check();
  await check.click();
  await page.locator('.pr-score').waitFor();
  assert.match(await page.locator('.pr-score').innerText(), /\d+ of \d+\s+correct/);
  assert.match(await page.locator('.pr-score').innerText(), /saved to your account/);
  assert.ok(await page.locator('.pr-explain').count() > 0, 'the explanations come back with the result');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM quiz_attempts').get().n, 1, 'the try is stored');

  await page.getByRole('button', { name: 'Try again' }).click();
  assert.equal(await page.locator('.pr-score').count(), 0);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('signed out, a quiz still works but says the try is not kept', async () => {
  const { context, page, goto } = await open('/#__practice@quiz/http-caching', { email: null });
  await goto();
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  await page.locator('.pr-questions > li').first().locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.locator('.pr-score').waitFor();
  assert.match(await page.locator('.pr-score').innerText(), /Sign in to keep your tries/);
  await context.close();
});

test('an exercise is worked in a place that saves a draft as you type, and is handed in when you submit it', async () => {
  const { context, page, env, problems, goto } = await open('/#__practice@exercise/idempotent-payment-endpoint');
  await goto();
  await page.getByRole('heading', { level: 2, name: /idempotent/i }).waitFor();
  assert.equal(await mainLink(page, 'Practice').getAttribute('aria-current'), 'page');
  assert.equal(await page.getByLabel('Share my solution so others can read it').count(), 0, 'nothing is shared: there is no gallery of other solutions');
  assert.equal(await page.getByLabel('Diagram (Mermaid)').count(), 0, 'an exercise asks for words and code, not a diagram');

  const answer = 'The client sends an Idempotency-Key; the server stores the first response under it and replays it for a retry.';
  await page.getByLabel('Your answer').fill(answer);
  const draft = await until(() => env.DB.raw.prepare("SELECT status, text FROM submissions WHERE kind = 'exercise' AND challenge_id = 'idempotent-payment-endpoint'").get(), 'typed work is saved after a pause');
  assert.equal(draft.status, 'draft', 'typed work is kept as a draft');
  assert.equal(draft.text, answer);

  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByText('Submitted. You can still edit it, and an admin may review it.').waitFor();
  assert.equal(env.DB.raw.prepare("SELECT status FROM submissions WHERE kind = 'exercise'").get().status, 'submitted');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('signed out, the exercise workspace asks for a sign-in instead of showing an editor that cannot save', async () => {
  const { context, page, goto } = await open('/#__practice@exercise/idempotent-payment-endpoint', { email: null });
  await goto();
  await page.getByText('Sign in to keep your work and submit it.').waitFor();
  assert.equal(await page.getByLabel('Your answer').count(), 0);
  await context.close();
});

test('coding questions have their own tab: a set shows its questions, and a worked solution (with code) stays hidden until asked for', async () => {
  const { context, page, problems, goto } = await open('/#__practice', { email: null });
  await goto();
  const tablist = page.getByRole('tablist', { name: /practice/i });
  await tablist.getByRole('tab', { name: /^Coding questions/ }).click();
  const cards = page.locator('.pr-card');
  assert.ok(await cards.count() >= 5, 'there are several coding sets');
  assert.equal(await page.getByRole('link', { name: 'Arrays and hashing' }).count(), 1);
  assert.equal(await page.getByRole('link', { name: /^Caching$/ }).count(), 0, 'a concepts set is on the other tab');

  await page.getByRole('link', { name: 'Arrays and hashing' }).click();
  await page.getByRole('heading', { level: 2, name: 'Arrays and hashing: coding interview questions' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/practice/interview/coding-arrays-and-hashing/');
  const first = page.locator('.pr-qa > li').first();
  await first.getByRole('heading', { level: 3 }).waitFor();
  assert.equal(await first.locator('pre').count(), 0, 'the solution is not shown until it is asked for');
  await first.getByRole('button', { name: 'Show the solution' }).click();
  await first.locator('pre code').first().waitFor();
  assert.match(await first.locator('pre code').first().innerText(), /def two_sum/);
  assert.match(await first.innerText(), /Complexity/);

  await page.getByRole('button', { name: '← All practice' }).click();
  await tablist.getByRole('tab', { name: /^Interview prep/ }).click();
  assert.equal(await page.getByRole('link', { name: /^Caching$/ }).count(), 1, 'the concepts sets are on their own tab');
  assert.equal(await page.getByRole('link', { name: 'Arrays and hashing' }).count(), 0);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('an interview set with short answers can be studied as flash cards: a click turns the card, "Not yet" brings it back, and the deck ends when every card is got', async () => {
  const set = practiceContent.interview.caching;
  const { context, page, problems, goto } = await open('/#__practice@interview/caching', { email: null });
  await goto();
  await page.locator('.pr-qa').first().waitFor();
  const modes = page.getByRole('group', { name: 'How to study this set' });
  assert.equal(await modes.getByRole('button', { name: 'List' }).getAttribute('aria-pressed'), 'true', 'the list is how a set opens');
  assert.equal(await page.locator('.cd').count(), 0);

  await modes.getByRole('button', { name: 'Flash cards' }).click();
  await page.locator('.cd-card').waitFor();
  assert.equal(await page.locator('.pr-qa').count(), 0, 'the list is replaced by the deck');
  assert.equal(await page.locator('.pr-progress__text').innerText(), `${set.questions.length} left · 0 of ${set.questions.length} got`);
  assert.equal(await page.locator('.cd-face--back').getAttribute('aria-hidden'), 'true', 'the answer is hidden from a screen reader until the card is turned');
  assert.equal(await page.locator('.cd-face--back').getAttribute('inert'), '', 'and cannot be reached with the keyboard');

  // A click on the card turns it: the answer is the model answer to that question, and the reader is taken to it.
  const front = await page.locator('.cd-face--front .cd-text').innerText();
  const card = set.questions.find((q) => q.q === front);
  assert.ok(card, 'the card shows one of the questions of the set');
  await page.locator('.cd-card').click();
  await page.locator('.cd-card.is-flipped').waitFor();
  assert.equal((await page.locator('.cd-face--back .cd-answer').innerText()).trim(), card.a);
  assert.equal(await page.evaluate(() => document.activeElement.className), 'cd-answer', 'focus is on the answer so it is read out');
  assert.equal(await page.locator('.cd-face--front').getAttribute('aria-hidden'), 'true', 'the question side is now the hidden one');

  // "Not yet" (the left arrow) sends it to the back: nothing is got, and it is not the next card (the set has more than one).
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((was) => document.querySelector('.cd-face--front .cd-text')?.textContent !== was, front);
  assert.equal(await page.locator('.pr-progress__text').innerText(), `${set.questions.length} left · 0 of ${set.questions.length} got`);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Show the answer', 'focus is on the button for the next card');

  // The rest are got from the keyboard alone: Enter turns the card, the right arrow marks it. The missed one comes back before the end.
  const seen = [];
  for (let i = 0; i < set.questions.length + 2 && !(await page.locator('.cd-done').count()); i++) {
    seen.push(await page.locator('.cd-face--front .cd-text').innerText());
    await page.keyboard.press('Enter');
    await page.locator('.cd-card.is-flipped').waitFor();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.cd-done') || !document.querySelector('.cd-card.is-flipped'));
  }
  assert.ok(seen.includes(front), 'the card that was not got came back');
  assert.equal(seen.length, set.questions.length, 'each of the others was got once, and the missed card came again');
  await page.locator('.cd-done').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.className), 'cd-done', 'focus is on the result');
  assert.equal(await page.locator('.cd-done h3').innerText(), 'You have got every card');
  assert.match(await page.locator('.cd-done').innerText(), /One card needed another go/);
  assert.deepEqual(await page.locator('.cd-done li').allInnerTexts(), [front], 'it names the card that needed another go');

  // Practise the missed one: a deck of one, got at once, with nothing missed this time.
  await page.getByRole('button', { name: 'Practise the one I missed' }).click();
  await page.locator('.cd-card').waitFor();
  assert.equal(await page.locator('.pr-progress__text').innerText(), '1 left · 0 of 1 got');
  assert.equal(await page.locator('.cd-face--front .cd-text').innerText(), front);
  await page.getByRole('button', { name: 'Show the answer' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('.cd-done').waitFor();
  assert.match(await page.locator('.cd-done').innerText(), /did not need a second go/);

  // All of them again starts a whole deck, and the list is one click away.
  await page.getByRole('button', { name: 'Go through all of them again' }).click();
  await page.locator('.cd-card').waitFor();
  assert.equal(await page.locator('.pr-progress__text').innerText(), `${set.questions.length} left · 0 of ${set.questions.length} got`);
  await modes.getByRole('button', { name: 'List' }).click();
  await page.locator('.pr-qa').waitFor();
  assert.equal(await page.locator('.cd').count(), 0);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('flash cards are offered only for a set whose answers fit on a card: a set of coding questions, with worked solutions and code, stays a list', async () => {
  const { context, page, problems, goto } = await open('/#__practice@interview/coding-arrays-and-hashing', { email: null });
  await goto();
  await page.locator('.pr-qa > li').first().waitFor();
  assert.equal(await page.getByRole('group', { name: 'How to study this set' }).count(), 0, 'no switch');
  assert.equal(await page.getByRole('button', { name: 'Flash cards' }).count(), 0);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a deck turns its card with a motion only when the reader has not asked for less', async () => {
  for (const [motion, expectTransition] of [['no-preference', true], ['reduce', false]]) {
    const { context, page, goto } = await open('/#__practice@interview/caching', { email: null, motion });
    await goto();
    await page.getByRole('button', { name: 'Flash cards' }).click();
    await page.locator('.cd-card').waitFor();
    const duration = await page.locator('.cd-face--front').evaluate((el) => getComputedStyle(el).transitionDuration);
    // (the site's own rule for reduced motion makes any transition last a millionth of a second, which is as good as none)
    assert.equal(parseFloat(duration) > 0.1, expectTransition, `with motion "${motion}" the card transition is "${duration}"`);
    await context.close();
  }
});

test('My Learning shows what was done: a quiz try appears there, and a reader with nothing yet is pointed at where to start', async () => {
  const fresh = await open('/#__me');
  await fresh.goto();
  await fresh.page.getByRole('heading', { level: 2, name: 'My learning' }).waitFor();
  assert.equal(await mainLink(fresh.page, 'My Learning').getAttribute('aria-current'), 'page');
  await fresh.page.getByRole('button', { name: 'Choose a path' }).waitFor();
  await fresh.context.close();

  const { context, page, env, goto } = await open('/#__practice@quiz/http-caching');
  await goto();
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  await page.locator('.pr-questions > li').first().locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.locator('.pr-score').waitFor();
  await mainLink(page, 'My Learning').click();
  await page.getByRole('heading', { level: 2, name: 'My learning' }).waitFor();
  await page.getByText(/HTTP caching/i).first().waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM quiz_attempts').get().n, 1);
  await context.close();
});

test('Explore lists the learning paths, and a path has a page of its own with what to know first and what it covers', async () => {
  const { context, page, problems, goto } = await open('/#__explore', { email: null });
  await goto();
  await page.getByRole('heading', { level: 1, name: /^Explore/ }).waitFor();
  const link = page.getByRole('link', { name: 'Backend foundations' }).first();
  await link.waitFor();
  await link.click();
  await page.getByRole('heading', { level: 2, name: 'Backend foundations' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/paths/backend-foundations/', 'a path has an address of its own');
  assert.match(await page.title(), /^Backend foundations · /);
  await page.getByRole('heading', { level: 3, name: 'Before you start' }).waitFor();
  await page.getByRole('heading', { level: 3, name: 'What you will cover' }).waitFor();
  await page.getByRole('heading', { level: 3, name: 'The curriculum' }).waitFor();
  assert.equal(await mainLink(page, 'Explore').getAttribute('aria-current'), 'page', 'a path page belongs to Explore');
  await page.getByRole('button', { name: 'Start this path' }).waitFor();

  await page.evaluate(() => { history.pushState(null, '', '/paths/no-such-path/'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('heading', { level: 2, name: 'That path is not here' }).waitFor();
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a notice from the admins shows above the page, and stays dismissed', async () => {
  const { context, page, env, goto } = await open('/', { email: null });
  const now = Date.now();
  env.DB.raw.prepare('INSERT INTO announcements (id, title, body, starts_at, ends_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('n1', 'New quiz on idempotency', 'Try it in Practice.', new Date(now - 1000).toISOString(), new Date(now + 3600_000).toISOString(), 'admin', new Date(now).toISOString());
  env.DB.raw.prepare('INSERT INTO announcements (id, title, body, starts_at, ends_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('n2', 'An old notice', '', new Date(now - 7200_000).toISOString(), new Date(now - 3600_000).toISOString(), 'admin', new Date(now).toISOString());
  await goto();
  const bar = page.locator('.notice-bar');
  await bar.waitFor();
  assert.match(await bar.innerText(), /New quiz on idempotency/);
  assert.equal(await page.getByText('An old notice').count(), 0, 'a notice past its end is not shown');

  await bar.getByRole('button', { name: 'Dismiss this notice' }).click();
  assert.equal(await page.locator('.notice-bar').count(), 0);
  await page.reload();
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('.notice-bar').count(), 0, 'and it stays gone after a reload');
  await context.close();
});

test('the admin sees practice figures and submissions waiting for review, and a review leaves the queue', async () => {
  const { context, page, env, problems, goto } = await open('/#__admin', { email: OWNER_EMAIL });
  const at = new Date().toISOString();
  env.DB.raw.prepare("INSERT INTO submissions (id, user_id, kind, challenge_id, text, status, created_at, updated_at, submitted_at) VALUES ('s1', 'learner-1', 'exercise', 'idempotent-payment-endpoint', 'My idempotency design', 'submitted', ?, ?, ?)").run(at, at, at);
  await goto();
  await page.waitForSelector('.admin-dashboard');
  const labels = (await page.locator('.admin-dashboard .page-tabs button').allTextContents()).map((l) => l.trim().replace(/\d+$/, ''));
  for (const name of ['Practice', 'Notices', 'Audit log']) assert.ok(labels.includes(name), `the dashboard has ${name}`);

  await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Practice/ }).click();
  await page.getByText('My idempotency design').waitFor();
  const send = page.getByRole('button', { name: 'Send review' });
  assert.equal(await send.isDisabled(), true, 'an empty review cannot be sent');
  await page.getByLabel('Your review').fill('Good start: say who owns the pricing rules.');
  await send.click();
  await page.getByText('Nothing is waiting for review.').waitFor();
  assert.equal(env.DB.raw.prepare("SELECT status FROM submissions WHERE id = 's1'").get().status, 'reviewed');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM submission_reviews').get().n, 1);

  await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Notices/ }).click();
  await page.getByLabel('Title').fill('Maintenance on Sunday');
  await page.getByRole('button', { name: 'Publish the notice' }).click();
  await page.getByText('Maintenance on Sunday').waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM announcements').get().n, 1);

  await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Audit log/ }).click();
  await page.getByText('announcement added').waitFor();
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('the paths and the videos are real pages: a crawler gets their content without running the app, and the sitemap lists them', async () => {
  // The browser's own requests, not Node's fetch (which can fail to reach "localhost" where only one of its two addresses is served).
  const requests = await browser.newContext();
  const get = async (url) => { const res = await requests.request.get(BASE + url); return { status: res.status(), html: await res.text() }; };

  const index = await get('/paths/');
  assert.equal(index.status, 200);
  assert.match(index.html, /<link rel="canonical" href="[^"]*\/paths\/">/);
  assert.match(index.html, /<h1>Learning paths<\/h1>/);
  assert.match(index.html, /href="\/paths\/backend-foundations\/"/, 'it links to each path');

  const one = await get('/paths/backend-foundations/');
  assert.equal(one.status, 200);
  assert.match(one.html, /<title>Backend foundations · [^<]+<\/title>/);
  assert.match(one.html, /<link rel="canonical" href="[^"]*\/paths\/backend-foundations\/">/);
  assert.match(one.html, /<h1>Backend foundations<\/h1>/);
  assert.match(one.html, /Before you start/);
  assert.match(one.html, /href="\/backend\/[^"]+\/"/, 'and it links to the modules, which have addresses of their own');
  assert.match(one.html, /"@type":"Course"/);

  const videos = await get('/videos/');
  assert.equal(videos.status, 200);
  assert.match(videos.html, /<h1>Video lectures<\/h1>/);
  const [playlist] = publicVideos().playlists; // the first playlist with a video already public (a scheduled one is not listed yet)
  assert.ok(videos.html.includes(playlist.title.replace(/&/g, '&amp;')), `the page names the playlist ${playlist.title}`);

  const quiz = await get('/practice/quiz/http-caching/');
  assert.equal(quiz.status, 200);
  assert.match(quiz.html, /<h1>HTTP caching<\/h1>/);
  assert.match(quiz.html, /<ol><li><p>/, 'the questions are on the page');
  assert.doesNotMatch(quiz.html, /"explanation"|Right answer/, 'the answers are not');
  const coding = await get('/practice/interview/coding-arrays-and-hashing/');
  assert.equal(coding.status, 200);
  assert.match(coding.html, /<h1>Arrays and hashing: coding interview questions<\/h1>/);
  assert.match(coding.html, /def two_sum/, 'the worked solutions are on the page: it is a FAQ');
  assert.match(coding.html, /"@type":"FAQPage"/);
  assert.match((await get('/practice/')).html, /href="\/practice\/quiz\/http-caching\/"/);

  const sitemap = (await get('/sitemap.xml')).html;
  for (const url of ['/paths/', '/paths/backend-foundations/', '/videos/', '/practice/', '/practice/quiz/http-caching/', '/practice/interview/coding-arrays-and-hashing/']) assert.ok(sitemap.includes(`${url}</loc>`), `${url} is in the sitemap`);

  const { context, page } = await open('/#__videos', { email: null });
  await page.goto(`${BASE}/#__videos`);
  await page.waitForFunction(() => location.pathname === '/videos/');
  await context.close();
  await requests.close();
});

test('a lesson shows the practice that goes with it, and the dashboard and the palette lead to practice too', async () => {
  const lesson = practiceContent.quizzes['http-caching'].module;
  const { context, page, goto } = await open(moduleUrl(lesson), { email: null });
  await goto();
  const related = page.locator('.related-practice');
  await related.waitFor();
  const link = related.getByRole('link', { name: /^Quiz: HTTP caching/ });
  await link.click();
  await page.getByRole('heading', { level: 2, name: /caching/i }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/practice/quiz/http-caching/');
  await context.close();

  const home = await open('/', { email: null });
  await home.goto();
  const strip = home.page.locator('.practice-strip');
  await strip.waitFor();
  assert.ok(await strip.locator('.pr-card').count() > 0, 'the dashboard offers quizzes');
  await strip.getByRole('link', { name: 'Arrays and hashing' }).click();
  await home.page.getByRole('heading', { level: 2, name: /Arrays and hashing/ }).waitFor();
  assert.equal(new URL(home.page.url()).pathname, '/practice/interview/coding-arrays-and-hashing/');

  await home.page.keyboard.press('Control+k');
  await home.page.getByPlaceholder(/Search modules/).fill('> two pointers');
  await home.page.getByText('Coding questions — Two pointers and sliding window').first().waitFor();
  await home.page.keyboard.press('Enter');
  await home.page.getByRole('heading', { level: 2, name: /Two pointers and sliding window/ }).waitFor();
  assert.equal(new URL(home.page.url()).pathname, '/practice/interview/coding-two-pointers-and-sliding-window/');
  await home.context.close();
});

test('the end of a lesson offers its quiz and its interview questions as flash cards, names the next lesson with its time, and the set opens as cards only just after that click', async () => {
  const lesson = practiceContent.interview.caching.module;
  const { context, page, goto } = await open(moduleUrl(lesson), { email: null });
  await goto();
  const finish = page.locator('.finish-acts');
  await finish.waitFor();
  assert.match(await page.locator('.finish-sub').innerText(), /^Next: .+ · \d+ min$/, 'the next lesson, with how long it takes');
  const link = finish.getByRole('link', { name: /^Flash cards · 4 questions$/ });
  await link.waitFor();
  await link.click();
  await page.locator('.cd-card').waitFor();
  assert.equal(new URL(page.url()).pathname, '/practice/interview/caching/');
  assert.equal(await page.getByRole('group', { name: 'How to study this set' }).getByRole('button', { name: 'Flash cards' }).getAttribute('aria-pressed'), 'true', 'it opens as cards');

  // A visit later on, from Practice or a link, is the list as ever: the mark the lesson left has lapsed.
  const stale = await page.evaluate((key) => { localStorage.setItem(key, 'caching|' + (Date.now() - 120000)); return localStorage.getItem(key); }, config.storage.cardsStart);
  assert.match(stale, /^caching\|\d+$/);
  await page.goto(BASE + '/practice/interview/caching/');
  await page.locator('.pr-qa').waitFor();
  assert.equal(await page.locator('.cd').count(), 0, 'a mark that is old is not followed');
  await context.close();
});

test('Today lists what to do now from what is due and where the reader left off, with a number on the button, and each row does its one thing', async () => {
  const lesson = practiceContent.interview.caching.module;
  const first = await open('/', { email: null });
  await first.context.addInitScript(({ review, tracker, last }) => {
    localStorage.setItem('docs.review', JSON.stringify(review));
    localStorage.setItem('docs.tracker', JSON.stringify(tracker));
    localStorage.setItem('docs.lastFile', last);
  }, {
    review: { 'q:http-caching/q1': { box: 0, due: '2020-01-01' }, 'q:http-caching/q2': { box: 1, due: '2999-01-01' } },
    tracker: { version: 1, items: { 'SD-A-001': { s: 'Needs Revision' }, 'GAI-GF-001': { s: 'Needs Revision' }, 'SD-A-002': { s: 'Completed', c: 5, d: '2026-11-17' } } },
    last: lesson
  });
  await first.goto();
  const button = first.page.getByRole('button', { name: 'Today: 1 to review' });
  await button.waitFor();
  assert.equal(await button.locator('.activity-dot').innerText(), '1', 'what is due for review is on the button');
  await button.click();
  const dialog = first.page.getByRole('dialog', { name: 'Today' });
  await dialog.waitFor();
  const titles = await dialog.locator('.today-row__title').allInnerTexts();
  assert.equal(titles.length, 4);
  assert.deepEqual(titles.slice(0, 2), ['1 question to review', '2 tracker rows to revise'], 'what is due comes first, and only the rows that are due are counted');
  assert.match(titles[2], /^Pick up: .+/);
  assert.equal(titles[3], "Today's drill");
  assert.match(await dialog.locator('.today-row__detail').nth(2).innerText(), /^Not finished( · \d+ min)?$/);
  assert.equal(await dialog.locator('.today-row.is-first').count(), 1, 'the first one is the one to do');

  // The tracker row is a link to the tracker; the review row goes to the review.
  assert.equal(await dialog.getByRole('link', { name: 'Open the tracker' }).getAttribute('href'), '/tracker/');
  await dialog.getByRole('button', { name: 'Review' }).click();
  await first.page.getByRole('heading', { level: 2, name: /review/i }).waitFor();
  assert.equal(new URL(first.page.url()).pathname, '/practice/review/');
  assert.equal(await first.page.getByRole('dialog').count(), 0, 'the dialog closes when a row is used');

  // From the palette too, and the lesson row opens the lesson.
  await first.page.keyboard.press('Control+k');
  await first.page.getByPlaceholder(/Search modules/).fill('> today');
  await first.page.getByText('Today: what to do now').first().waitFor();
  await first.page.keyboard.press('Enter');
  const again = first.page.getByRole('dialog', { name: 'Today' });
  await again.waitFor();
  await again.getByRole('button', { name: 'Continue' }).click();
  await first.page.locator('#content').waitFor();
  assert.equal(new URL(first.page.url()).pathname, moduleUrl(lesson));
  await first.context.close();

  // With nothing due there is no number, and the dialog still says what to do.
  const quiet = await open('/', { email: null });
  await quiet.goto();
  const none = quiet.page.getByRole('button', { name: 'Today: what to do now' });
  await none.waitFor();
  assert.equal(await none.locator('.activity-dot').count(), 0);
  await none.click();
  const only = quiet.page.getByRole('dialog', { name: 'Today' });
  await only.waitFor();
  assert.deepEqual(await only.locator('.today-row__title').allInnerTexts(), ["Today's drill"], 'just the drill');
  await quiet.context.close();
});

test('reading options change the text size and width of a lesson, and are kept', async () => {
  const lesson = practiceContent.quizzes['http-caching'].module;
  const { context, page, goto } = await open(moduleUrl(lesson), { email: null });
  await goto();
  await page.locator('#content').waitFor();
  const size = () => page.locator('#article #content').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  await page.getByRole('button', { name: 'Reading options' }).click();
  await page.getByRole('button', { name: 'Large' }).click();
  assert.ok(await size() > before, 'large text is larger');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Large' }).count(), 0, 'Escape closes the options');

  await page.reload();
  await page.locator('#article #content').waitFor();
  await page.waitForFunction((was) => parseFloat(getComputedStyle(document.querySelector('#article #content')).fontSize) > was, before);
  assert.ok(await size() > before, 'and the choice is kept after a reload');
  await page.getByRole('button', { name: 'Reading options' }).click();
  await page.getByRole('button', { name: 'Back to default' }).click();
  assert.equal(await size(), before);
  await context.close();
});

test('a diagram a little wider than the column fits, and a much wider one scrolls and says so', async () => {
  // The page is served with a diagram of this test's own, not a lesson's (lessons are rewritten, and a diagram in one comes and goes). The line is a
  // little wider than the column on a wide screen (so it is shrunk to fit) and more than 18% wider than it on a narrow one (so it scrolls).
  const lesson = 'backend/01-request-response-fundamentals/00-system-overview-and-request-flow/README.md';
  const { context, page, goto } = await open(moduleUrl(lesson), { email: null, width: 1732, height: 900 });
  const wide = `handshake ${'-'.repeat(84)}`;
  await context.route(`**/${lesson}`, (route) => route.fulfill({ status: 200, contentType: 'text/markdown; charset=utf-8', body: `# A wide diagram

The line below is wider than the column.

\`\`\`
${wide}
\`\`\`
` }));
  await goto();
  const diagram = page.locator('#content .codeblock pre', { hasText: 'handshake' }).first();
  await diagram.waitFor();
  const wrap = diagram.locator('xpath=..');
  const wider = () => diagram.evaluate((el) => el.scrollWidth - el.clientWidth);

  await page.waitForFunction(() => { const pre = [...document.querySelectorAll('#content .codeblock pre')].find((p) => p.textContent.includes('handshake')); return pre.scrollWidth <= pre.clientWidth + 1; });
  assert.equal(await wrap.evaluate((el) => el.classList.contains('is-scrollable')), false, 'on a wide page the diagram is whole');

  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForFunction(() => document.querySelector('#content .codeblock.is-scrollable'));
  assert.ok(await wider() > 1, 'on a narrow page it is wider than its box');
  assert.equal(await wrap.evaluate((el) => el.classList.contains('more-right') && !el.classList.contains('more-left')), true, 'the fade is on the right, where there is more');
  assert.equal(await diagram.getAttribute('tabindex'), '0', 'and the keyboard can scroll it');
  assert.equal(await diagram.getAttribute('role'), 'region');

  await diagram.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.waitForFunction(() => { const w = document.querySelector('#content .codeblock.is-scrollable'); return w.classList.contains('more-left') && !w.classList.contains('more-right'); });
  await context.close();
});

test('the module tree is one Tab stop and works from the keyboard: arrows move, Right and Left open and close a track, Space changes progress', async () => {
  const lesson = practiceContent.quizzes['http-caching'].module;
  const { context, page, goto } = await open(moduleUrl(lesson), { email: null, width: 1400, height: 900 });
  await goto();
  const current = page.locator('#tree a.name[aria-current="page"]');
  await current.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#tree .name[tabindex="0"]').length === 1);
  assert.equal(await page.locator('#tree .name[tabindex="0"]').count(), 1, 'one stop in the tree, not hundreds');

  await current.focus();
  const where = () => page.evaluate(() => { const row = document.activeElement.closest('.row'); return row && row.dataset.file; });
  assert.equal(await where(), lesson);
  await page.keyboard.press('ArrowDown');
  const next = await where();
  assert.ok(next && next !== lesson, 'Down moves to the next row');
  await page.keyboard.press('ArrowUp');
  assert.equal(await where(), lesson, 'and Up comes back');

  const check = (file) => page.locator(`#tree .row[data-file="${file}"] button.check`);
  const before = await check(next).getAttribute('data-s');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.waitForFunction(({ file, was }) => document.querySelector(`#tree .row[data-file="${file}"] button.check`).dataset.s !== was, { file: next, was: before });
  assert.notEqual(await check(next).getAttribute('data-s'), before, 'Space changes the progress of the module the focus is on');

  // A track: Right opens it, Left closes it.
  const track = page.locator('#tree li.node:not(.open) > .row.dir').first();
  const item = await track.locator('xpath=..').elementHandle();
  await track.locator('.name').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((li) => li.classList.contains('open'), item);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((li) => !li.classList.contains('open'), item);
  await context.close();
});

// ---------------------------------------------------------------------------------------------------- the 2.0 additions

test('a timed quiz shows its clock, and the questions that were missed can be tried again without adding to the history', async () => {
  const { context, page, env, goto } = await open('/practice/quiz/http-caching/');
  await goto();
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  const total = practiceContent.quizzes['http-caching'].questions.length; // they come one at a time, so the page shows one

  await page.getByLabel(/^Timed: \d+ min/).check();
  await page.locator('.pr-timer').waitFor();
  assert.match(await page.locator('.pr-timer').innerText(), /^\d+:\d\d$/, 'the time left is counting down');
  await page.getByLabel(/^Timed: \d+ min/).uncheck();
  assert.equal(await page.locator('.pr-timer').count(), 0);

  await page.getByRole('radio', { name: 'ETag and If-None-Match' }).check(); // the right answer to the first question, so the others are the ones missed
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.locator('.pr-score').waitFor();
  const retry = page.getByRole('button', { name: /^Retry the \d+ I missed/ });
  await retry.waitFor();
  await retry.click();
  await page.waitForFunction((n) => document.querySelectorAll('.pr-questions > li').length < n, total);
  assert.ok(await page.locator('.pr-questions > li').count() < total, 'only the questions that were missed');

  await page.locator('.pr-questions > li').first().locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.getByText(/of the missed questions right/).waitFor();
  await page.getByText('A retry is practice').waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM quiz_attempts').get().n, 1, 'the retry is not in the history');
  await page.getByRole('button', { name: 'Try the whole quiz again' }).click();
  await page.getByText(`Question 1 of ${total}`).waitFor();
  await context.close();
});

test('a quiz comes one question at a time, with how far along, and every question on one page if the reader prefers', async () => {
  const { context, page, goto } = await open('/practice/quiz/http-caching/');
  await goto();
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  const total = practiceContent.quizzes['http-caching'].questions.length;
  assert.ok(total > 1);
  assert.equal(await page.locator('.pr-questions > li').count(), 1, 'one question on the page');
  await page.getByText(`Question 1 of ${total}`).waitFor();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '1');
  assert.equal(await page.getByRole('button', { name: 'Back', exact: true }).count(), 0, 'nothing before the first question');

  await page.getByRole('radio', { name: 'ETag and If-None-Match' }).check();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByText(`Question 2 of ${total}`).waitFor();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '2');
  await page.getByText('1 answered').waitFor();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await page.getByRole('radio', { name: 'ETag and If-None-Match' }).isChecked(), true, 'the answer is still there');

  await page.getByLabel('Show all the questions on one page').check();
  assert.equal(await page.locator('.pr-questions > li').count(), total, 'all of them');
  assert.equal(await page.getByRole('progressbar').count(), 0);
  await context.close();
});

test('My Learning says where to practise, from the quizzes that were taken', async () => {
  const { context, page, goto } = await open('/practice/quiz/http-caching/');
  await goto();
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  await page.locator('.pr-questions > li').first().locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.locator('.pr-score').waitFor();
  await mainLink(page, 'My Learning').click();
  await page.getByRole('heading', { level: 3, name: 'Where to practise' }).waitFor();
  await page.getByText(/right \(\d+%\)/).first().waitFor();
  await page.getByRole('heading', { name: 'Questions you missed' }).waitFor();
  await context.close();
});

test('the home page leads with the new promise, sends you to the learning paths, and lists what people read most only when there is enough to list', async () => {
  const quiet = await open('/', { email: null, seenLanding: false });
  await quiet.goto();
  await quiet.page.getByRole('heading', { level: 1, name: 'Build the engineering skills that matter.' }).waitFor();
  assert.equal(await quiet.page.getByRole('heading', { name: 'Popular this month' }).count(), 0, 'nothing is ranked on no readers');
  await quiet.page.getByRole('link', { name: new RegExp(`^${HERO.exploreLabel}`) }).click();
  await quiet.page.getByRole('heading', { level: 2, name: /Flagship Tracks/ }).waitFor();
  assert.equal(new URL(quiet.page.url()).pathname, '/paths/');
  await quiet.context.close();

  const busy = await open('/', { email: null, seenLanding: false });
  const today = new Date().toISOString().slice(0, 10);
  const modules = ['backend/01-request-response-fundamentals/06-http-caching/README.md', 'backend/04-databases-and-data-layer/03-schema-design-and-indexing/README.md', 'backend/01-request-response-fundamentals/01-http-protocol-basics/README.md'];
  let n = 0;
  for (const m of modules) for (let i = 0; i < 4; i++) busy.env.DB.raw.prepare('INSERT INTO page_views (id, date, path, user, referrer, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(`pv${n++}`, today, m, 'anonymous', '', `${today}T00:00:00.000Z`);
  await busy.goto();
  await busy.page.getByRole('heading', { name: 'Popular this month' }).waitFor();
  assert.equal(await busy.page.locator('#lp-popular ~ .lp-fresh .lp-fresh-item').count(), 3);
  await busy.page.getByRole('link', { name: HERO.startLabel }).waitFor();
  await busy.context.close();
});

test('the admin edits a quiz in the browser: it is checked, a problem is named, and a good one is committed to the repository', async () => {
  const { context, page, goto } = await open('/#__admin', { email: OWNER_EMAIL });
  const quiz = fs.readFileSync(new URL('../../content/practice/quizzes/http-caching.json', import.meta.url), 'utf8');
  const realFetch = globalThis.fetch;
  const github = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
    github.push({ method: init.method || 'GET', url });
    if (init.method === 'PUT') return Response.json({ content: { sha: 'sha-2' }, commit: { sha: 'commit-1' } });
    return Response.json({ content: Buffer.from(quiz).toString('base64'), sha: 'sha-1' });
  };
  try {
    await goto();
    await page.waitForSelector('.admin-dashboard');
    await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Practice/ }).click();
    await page.getByText('Edit the content', { exact: true }).waitFor();
    await page.getByLabel('Open one').selectOption('practice/quizzes/http-caching.json');
    const box = page.getByLabel('The file (JSON)');
    await box.waitFor();
    await page.waitForFunction(() => /HTTP caching/.test(document.querySelector('textarea.pr-mono[rows="24"]').value));

    await page.getByRole('button', { name: 'Check it' }).click();
    await page.getByText('No problems found').waitFor();

    const original = await box.inputValue();
    await box.fill(original.replace('"difficulty": "beginner"', '"difficulty": "hard"'));
    await page.getByRole('button', { name: 'Check it' }).click();
    await page.getByRole('alert').getByText(/difficulty must be one of/).waitFor();

    await box.fill(original.replace('The headers that decide', 'The headers that decide, in short,'));
    await page.getByRole('button', { name: 'Save to the repository' }).click();
    await page.getByText(/Saved\. The site will be rebuilt/).waitFor();
    const put = github.find((call) => call.method === 'PUT');
    assert.ok(put && put.url.endsWith('/contents/content/practice/quizzes/http-caching.json'), 'it was committed to the quiz\'s own file');

    await page.getByLabel('A new quiz: its address name').fill('My New Quiz!');
    await page.getByRole('button', { name: 'Start from a template' }).click();
    await page.getByText('Use lower case letters, numbers and hyphens').waitFor();
  } finally {
    globalThis.fetch = realFetch;
  }
  await context.close();
});

test('Practice recommends what to take: the easiest quizzes to a new reader, and the topic that went badly to one who has tried', async () => {
  const fresh = await open('/practice/', { email: null });
  await fresh.goto();
  await fresh.page.getByRole('tab', { name: /^Quizzes/ }).click();
  await fresh.page.locator('.pr-recs .pr-rec').first().waitFor();
  assert.equal(await fresh.page.locator('.pr-recs .pr-rec').count(), 3, 'three suggestions');
  assert.match(await fresh.page.locator('.pr-recs .pr-rec').first().innerText(), /A good place to start/);
  assert.match(await fresh.page.locator('.pr-recs .pr-rec').first().innerText(), /beginner/i, 'the easiest first');
  assert.equal(await fresh.page.getByRole('button', { name: /Sign in and these follow how you do/ }).count(), 1, 'it says why signing in helps');
  await fresh.context.close();

  const { context, page, goto } = await open('/practice/quiz/http-caching/');
  await goto();
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  await page.locator('.pr-questions > li').first().locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.locator('.pr-score').waitFor();
  await page.getByRole('button', { name: '← All practice' }).click();
  await page.getByRole('tab', { name: /^Quizzes/ }).click();
  await page.locator('.pr-recs').waitFor();
  const topic = practiceContent.quizzes['http-caching'].topic;
  await page.locator('.pr-rec__why.is-weak', { hasText: new RegExp(`of the ${topic} questions right`) }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: /Sign in and these follow how you do/ }).count(), 0, 'a signed-in reader is not asked');
  await context.close();
});
