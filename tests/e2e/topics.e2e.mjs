// The topic guides and their animated scenes, in a real browser: the list, a guide (what to know first, the route, the practice), progress that turns "Start"
// into "Continue", the scene's steps by button and by keyboard, a scene for someone who asked for less motion, and the pages a reader without JavaScript gets.
// The API behind the page is the real one, answering inside the test process (support.mjs).
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { BASE, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import { ROOT, config } from '../../scripts/lib/config.mjs';
import { loadTopics } from '../../scripts/lib/topics.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const TOPICS = loadTopics();
const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));

/** A page of the site, signed out, with the real API in the test process. */
async function open(url, { motion = 'no-preference', width = 1280, height = 900, seenLanding = true, init } = {}) {
  const opened = await openPage(browser, url, { motion, width, height, seenLanding });
  if (init) await opened.context.addInitScript(init);
  await answerApiInProcess(opened.context, { email: null });
  await opened.goto();
  return opened;
}

test('the list has a card for every guide, and the tab says where you are', async () => {
  const { context, page, problems } = await open('/topics/');
  await page.locator('.tp-card').first().waitFor();
  assert.equal(await page.locator('.tp-card').count(), TOPICS.length);
  assert.equal(await page.title(), `Learn a topic · ${config.site.name}`);
  for (const topic of TOPICS) assert.ok(await page.locator('.tp-card', { hasText: topic.title }).count() >= 1, `${topic.title} is listed`);
  assert.equal(await page.locator('#mainNav a.on').innerText(), 'Explore', 'topics are part of Explore');
  assert.deepEqual(real(problems), []);
  await page.locator('.tp-card', { hasText: 'Docker' }).first().click();
  await page.getByRole('heading', { level: 2, name: 'Docker' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/topics/docker/', 'a card opens the guide at its own address');
  await context.close();
});

test('a guide says what to know first, in the order to learn it, then walks the lessons in stages', async () => {
  const { context, page } = await open('/topics/kubernetes/');
  await page.locator('.tp-stage').first().waitFor();
  const needed = page.locator('.tp-pre__item');
  assert.equal(await needed.count(), 2);
  assert.match(await needed.first().innerText(), /needed/i, 'it says this one is needed');
  assert.match(await needed.first().innerText(), /Docker/);
  assert.equal(await page.locator('.tp-order').innerText(), 'Linux command line → Networking for developers → Docker → Kubernetes', 'the whole way in, in order');
  const kubernetes = TOPICS.find((t) => t.id === 'kubernetes');
  assert.equal(await page.locator('.tp-stage').count(), kubernetes.stages.length);
  assert.equal(await page.locator('.tp-lesson').count(), kubernetes.stages.flatMap((s) => s.lessons).length);
  assert.ok((await page.title()).startsWith('Kubernetes: what to know first'), 'and the tab has the guide’s own title');

  // A prerequisite is a way into that guide; a lesson opens in the app, at its own address.
  await needed.first().getByRole('link', { name: 'Docker' }).click();
  await page.getByRole('heading', { level: 2, name: 'Docker' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/topics/docker/');
  await page.locator('.tp-lesson a').first().click();
  await page.locator('#content').waitFor();
  assert.match(new URL(page.url()).pathname, /^\/learn\/02-docker\//);
  await context.close();
});

test('a guide that needs nothing first says so, and the practice it lists is real and opens', async () => {
  const { context, page } = await open('/topics/linux/');
  await page.getByText('Nothing is needed first. You can start now.').waitFor();
  await context.close();

  const oop = await open('/topics/oop-python/');
  await oop.page.getByRole('heading', { level: 3, name: 'Practise' }).waitFor();
  const movie = oop.page.locator('.tp-items a', { hasText: 'Movie Ticket Booking' });
  await movie.waitFor();
  assert.ok(await oop.page.locator('.tp-items li').count() >= 8, 'the exercises, a quiz and the interview sets');
  await movie.click();
  await oop.page.locator('.ce-input').waitFor();
  assert.equal(new URL(oop.page.url()).pathname, '/practice/code/movie-ticket-booking/', 'an exercise opens in the Practice editor');
  assert.match(await oop.page.locator('body').innerText(), /class Movie/);
  await oop.context.close();
});

test('progress turns Start into Continue, and the lesson you are on is marked', async () => {
  const docker = TOPICS.find((t) => t.id === 'docker');
  const first = docker.stages[0].lessons[0];
  const { context, page } = await open('/topics/docker/');
  await page.locator('.tp-stage').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start', exact: true }).count(), 1, 'a first visit says Start');
  assert.equal(await page.locator('.tp-lesson.is-next').count(), 1, 'the first lesson is the one to do next');

  // Open the first lesson, say you are on it, and come back.
  await page.locator('.tp-lesson a').first().click();
  await page.getByRole('button', { name: 'Still working' }).click();
  await page.getByRole('button', { name: 'In progress' }).first().waitFor();
  await page.goBack();
  await page.locator('.tp-stage').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 1, 'now it says Continue');
  assert.match(await page.locator('.tp-progress').innerText(), /0 of 14 lessons done/);
  assert.equal(await page.locator(`.tp-lesson a[href="/${first.replace(/README\.md$/, '')}"]`).locator('xpath=..').locator('.path-dot').getAttribute('data-s'), 'wip', 'its dot says in progress');
  assert.match(await page.locator('.pr-actions .pr-note').innerText(), /Up next: /);
  await context.close();
});

test('the scene steps by button and by keyboard, and its numbers follow the story', async () => {
  const { context, page, problems } = await open('/topics/caching/');
  const scene = page.locator('.scene');
  await scene.waitFor();
  assert.match(await scene.locator('.scene__caption').innerText(), /Illustrative numbers/, 'it says its numbers are illustrations');
  const numbers = async () => Object.fromEntries((await scene.locator('.scene__number').allInnerTexts()).map((t) => t.split('\n')).map(([k, v]) => [k, v]));
  assert.match(await scene.locator('.scene__step').innerText(), /step 1 of 8/i);
  assert.equal((await numbers())['AVERAGE READ TIME'], '20 ms');
  assert.equal(await scene.locator('.scene__node[data-on="true"]').count(), 3, 'three parts are on stage at first');

  await scene.getByRole('button', { name: /^Next/ }).click();
  assert.match(await scene.locator('.scene__step').innerText(), /step 2 of 8/i);
  assert.equal(await scene.locator('.scene__node[data-on="true"]').count(), 4, 'the cache comes on stage');
  assert.equal((await numbers())['CACHE HIT RATE'], '0%');

  // The keyboard works when the stage has focus: the right arrow steps on, the left arrow back.
  await scene.locator('.scene__stage').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.match(await scene.locator('.scene__step').innerText(), /step 4 of 8/i);
  await page.keyboard.press('ArrowLeft');
  assert.match(await scene.locator('.scene__step').innerText(), /step 3 of 8/i);
  await scene.getByRole('button', { name: 'Hit rate', exact: false }).click(); // the rail jumps to a step
  const hit = await numbers();
  assert.deepEqual([hit['AVERAGE READ TIME'], hit['CACHE HIT RATE'], hit['DATABASE READS']], ['2 ms', '95%', '5%']);
  assert.match(await scene.locator('.scene__changed').innerText(), /Average read time: 11 ms → 2 ms/, 'what changed shows the before and the after');
  assert.ok(await scene.locator('animateMotion').count() >= 1, 'a packet travels');

  await scene.getByRole('button', { name: 'Pause' }).click();
  assert.equal(await scene.getByRole('button', { name: 'Play', exact: true }).count(), 1, 'Pause becomes Play');
  for (let i = 0; i < 3; i++) await scene.getByRole('button', { name: /^Next/ }).click(); // from step 5 to the last, step 8
  assert.match(await scene.locator('.scene__step').innerText(), /step 8 of 8/i);
  assert.equal(await scene.getByRole('button', { name: /^Next/ }).isDisabled(), true, 'the last step has nothing after it');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('for someone who asked for less motion nothing travels, and the story and numbers say it all', async () => {
  const { context, page } = await open('/topics/grafana/', { motion: 'reduce' });
  const scene = page.locator('.scene');
  await scene.waitFor();
  await scene.getByRole('button', { name: /^Next/ }).click();
  assert.equal(await scene.locator('animateMotion').count(), 0, 'no packet moves');
  assert.equal(await scene.getByRole('button', { name: 'Pause' }).count(), 0, 'and there is nothing to pause');
  assert.ok(await scene.locator('.scene__flow').count() >= 1, 'the flows are still drawn, with their arrows');
  assert.match(await scene.locator('.scene__text').innerText(), /Prometheus pulls the numbers/);
  const moving = await page.evaluate(() => [...document.querySelectorAll('.scene *')].filter((el) => { const s = getComputedStyle(el); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0; }).length);
  assert.equal(moving, 0, 'no CSS animation either');
  await context.close();
});

test('the landing page offers the guides in one line, and Explore leads with them', async () => {
  const landing = await open('/', { seenLanding: false });
  const line = landing.page.locator('.lp-topics');
  await line.waitFor();
  const stats = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'site-stats.json'), 'utf8'));
  assert.equal(stats.topics.length, TOPICS.length);
  assert.equal(await line.locator('a:not(.lp-link)').count(), TOPICS.length);
  await line.getByRole('link', { name: 'Docker', exact: true }).click();
  await landing.page.getByRole('heading', { level: 2, name: 'Docker' }).waitFor();
  assert.equal(new URL(landing.page.url()).pathname, '/topics/docker/');
  await landing.context.close();

  const explore = await open('/#__explore');
  await explore.page.locator('.xa-more > summary').click();
  await explore.page.locator('.explore-learn .tp-card').first().waitFor();
  assert.equal(await explore.page.locator('.explore-learn .tp-card').count(), TOPICS.length);
  await explore.context.close();
});

test('a reader without JavaScript gets the guide: headline, what to know first, the lessons as links, and structured data', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'topics', 'docker', 'index.html'), 'utf8');
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<h1>Docker<\/h1>/);
  assert.match(html, /<title>Docker: what to know first and how to learn it/);
  const docker = TOPICS.find((t) => t.id === 'docker');
  assert.match(html, /<meta name="description" content="[^"]*Package an app/);
  assert.ok(html.includes('Before you start') && html.includes('Linux command line'), 'the prerequisites are in the page');
  for (const lesson of docker.stages.flatMap((s) => s.lessons)) assert.ok(html.includes(`href="/${lesson.replace(/README\.md$/, '')}"`), `it links to ${lesson}`);
  assert.match(html, /"@type":"Course"/);
  const sitemap = fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8');
  for (const topic of TOPICS) assert.ok(sitemap.includes(`${config.site.url}/topics/${topic.id}/`), `the sitemap lists ${topic.id}`);
  assert.ok(sitemap.includes(`${config.site.url}/topics/</loc>`));
  assert.ok(BASE.length > 0);
});

test('on Explore every area lists its tracks with something to open: no card says "0 lessons", and a one-lesson track is a link to it', async () => {
  const { context, page } = await open('/#__explore');
  await page.locator('.xa .area-row').waitFor();
  const areas = await page.locator('.xa .area-row .chip').allTextContents();
  assert.ok(areas.length >= 8, 'the area buttons are there');
  for (const name of areas.filter((a) => a !== 'All areas')) {
    await page.locator('.xa .area-row .chip', { hasText: name }).click();
    await page.locator('.xa-track').first().waitFor();
    const counts = await page.locator('.xa-track__count').allTextContents();
    assert.ok(counts.length > 0, `${name} lists tracks`);
    assert.deepEqual(counts.filter((c) => /^0 /.test(c)), [], `${name}: no track says 0 lessons`);
  }
  await page.locator('.xa .area-row .chip', { hasText: 'Low-level design' }).click();
  await page.locator('.xa-track--single').first().waitFor();
  assert.ok(await page.locator('a.xa-track--single[href]').count() > 5, 'single-lesson tracks are links');
  assert.ok(await page.locator('.xa-track', { hasText: 'Python Refresher' }).count() === 1, 'the Python refresher is under low-level design');
  await page.locator('.xa .area-row .chip', { hasText: 'Linux to Cloud' }).click();
  await page.locator('.xa-track').first().waitFor();
  assert.equal(await page.locator('.xa-track', { hasText: 'Python Refresher' }).count(), 0, 'and no longer under Linux to Cloud');
  await context.close();
});
