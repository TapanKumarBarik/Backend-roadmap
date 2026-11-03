// The Practice Center, the Design Lab, My Learning, the learning-path pages and the admins' notices, in a real browser. The API behind the
// page is the real one, answering inside the test process (support.mjs), with the real quizzes and challenges from content/.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));
const railButton = (page, name) => page.locator('#destRail').getByRole('button', { name });

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

test('the rail has Practice, Design Lab and My Learning, and Practice lists the quizzes, exercises and interview sets', async () => {
  const { context, page, problems, goto } = await open('/#__practice');
  await goto();
  await page.getByRole('heading', { level: 2, name: 'Practice' }).waitFor();
  const places = await page.locator('#destRail .dest-label').allTextContents();
  for (const name of ['Practice', 'Design Lab', 'My Learning']) assert.ok(places.includes(name), `the rail has ${name}`);
  assert.equal(await railButton(page, 'Practice').getAttribute('aria-current'), 'page');

  const tablist = page.getByRole('tablist', { name: /practice/i });
  assert.deepEqual((await tablist.getByRole('tab').allTextContents()).map((t) => t.replace(/\d+$/, '')), ['Quizzes', 'Exercises', 'Interview prep']);
  assert.ok(await page.getByRole('link', { name: /HTTP caching/i }).count() > 0, 'the quizzes are listed');
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

test('a design challenge keeps its reference solution back until your own is submitted', async () => {
  const { context, page, env, problems, goto } = await open('/#__lab@lld/parking-lot');
  await goto();
  await page.getByRole('heading', { level: 2, name: /parking/i }).waitFor();
  assert.equal(await railButton(page, 'Design Lab').getAttribute('aria-current'), 'page');
  await page.getByText('The reference solution opens once you have submitted your own').waitFor();

  const answer = 'A ParkingLot owns Levels; each Level owns Spots; a Strategy picks the spot for a vehicle.';
  await page.getByLabel('Your answer').fill(answer);
  const draft = await until(() => env.DB.raw.prepare("SELECT status, text FROM submissions WHERE kind = 'lld' AND challenge_id = 'parking-lot'").get(), 'typed work is saved after a pause');
  assert.equal(draft.status, 'draft', 'typed work is kept as a draft');
  assert.equal(draft.text, answer);

  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.locator('.pr-reference .pr-note').waitFor({ state: 'detached' });
  assert.ok((await page.locator('.pr-reference').innerText()).length > 200, 'the reference solution is shown once you have submitted');
  assert.equal(env.DB.raw.prepare("SELECT status FROM submissions WHERE kind = 'lld'").get().status, 'submitted');

  await page.getByLabel('Share my solution so others can read it').check();
  await until(() => env.DB.raw.prepare("SELECT shared FROM submissions WHERE kind = 'lld'").get().shared === 1, 'sharing is saved');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('signed out, the design workspace asks for a sign-in instead of showing an editor that cannot save', async () => {
  const { context, page, goto } = await open('/#__lab@hld/url-shortener', { email: null });
  await goto();
  await page.getByText('Sign in to keep your work and submit it.').waitFor();
  assert.equal(await page.getByLabel('Your answer').count(), 0);
  await context.close();
});

test('My Learning shows what was done: a quiz try appears there, and a reader with nothing yet is pointed at where to start', async () => {
  const fresh = await open('/#__me');
  await fresh.goto();
  await fresh.page.getByRole('heading', { level: 2, name: 'My learning' }).waitFor();
  assert.equal(await railButton(fresh.page, 'My Learning').getAttribute('aria-current'), 'page');
  await fresh.page.getByRole('button', { name: 'Choose a path' }).waitFor();
  await fresh.context.close();

  const { context, page, env, goto } = await open('/#__practice@quiz/http-caching');
  await goto();
  await page.waitForFunction(() => document.querySelectorAll('.pr-questions > li').length > 0);
  await page.locator('.pr-questions > li').first().locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.locator('.pr-score').waitFor();
  await page.evaluate(() => { location.hash = '#__me'; });
  await page.getByRole('heading', { level: 2, name: 'My learning' }).waitFor();
  await page.getByText(/HTTP caching/i).first().waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM quiz_attempts').get().n, 1);
  await context.close();
});

test('Explore lists the learning paths, and a path has a page of its own with what to know first and what it covers', async () => {
  const { context, page, problems, goto } = await open('/#__explore', { email: null });
  await goto();
  await page.getByRole('heading', { level: 2, name: 'Explore' }).waitFor();
  const link = page.getByRole('link', { name: 'Backend foundations' }).first();
  await link.waitFor();
  await link.click();
  await page.getByRole('heading', { level: 2, name: 'Backend foundations' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#__path@backend-foundations');
  await page.getByRole('heading', { level: 3, name: 'Before you start' }).waitFor();
  await page.getByRole('heading', { level: 3, name: 'What you will cover' }).waitFor();
  await page.getByRole('heading', { level: 3, name: 'The curriculum' }).waitFor();
  assert.equal(await railButton(page, 'Explore').getAttribute('aria-current'), 'page', 'a path page belongs to Explore');
  await page.getByRole('button', { name: 'Start this path' }).waitFor();

  await page.goto(`${new URL(page.url()).origin}/#__path@no-such-path`);
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
  env.DB.raw.prepare("INSERT INTO submissions (id, user_id, kind, challenge_id, text, status, created_at, updated_at, submitted_at) VALUES ('s1', 'learner-1', 'lld', 'parking-lot', 'My parking lot design', 'submitted', ?, ?, ?)").run(at, at, at);
  await goto();
  await page.waitForSelector('.admin-dashboard');
  const labels = (await page.locator('.admin-dashboard .page-tabs button').allTextContents()).map((l) => l.trim().replace(/\d+$/, ''));
  for (const name of ['Practice', 'Notices', 'Audit log']) assert.ok(labels.includes(name), `the dashboard has ${name}`);

  await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Practice/ }).click();
  await page.getByText('My parking lot design').waitFor();
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
