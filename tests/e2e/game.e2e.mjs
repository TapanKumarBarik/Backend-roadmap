// The learning game on the Learn page, in a real browser and under the real Content-Security-Policy: choosing a path, the quest and its route, the
// player card (level, streak, today's goal, badges), and what finishing a module pays. Progress is the reader's own (IndexedDB), seeded before the page
// opens, so every number the test expects is worked out from the same rules the page uses (game.config.json), not typed in.
//
//   npm run build && npm run preview, then  npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, config, isPlaceholderText } from '../../scripts/lib/config.mjs';
import { BASE, launchBrowser, openPage } from './support.mjs';
import { GAME } from '../../webapp/src/config/game.js';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });
const open = (url, options) => openPage(browser, url, { withCsp: true, ...options });
const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));

const PATH_ID = 'production-core';
const catalogue = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'paths.json'), 'utf8')).paths;
const quest = catalogue.find((p) => p.id === PATH_ID);

// The written modules of a folder, in order, as the page lists them (a placeholder is "coming soon", not a module).
function modulesOf(dir) {
  const here = path.join(CONTENT_ROOT, dir);
  return fs.readdirSync(here, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort()
    .filter((name) => fs.existsSync(path.join(here, name, 'README.md')) && !isPlaceholderText(fs.readFileSync(path.join(here, name, 'README.md'), 'utf8')))
    .map((name) => `${dir}/${name}/README.md`);
}
const questFiles = quest.steps.flatMap(modulesOf);
const firstStep = modulesOf(quest.steps[0]);
const urlOf = (file) => `/${file.replace(/README\.md$/, '')}`;

/** Opens the app with this progress already saved in the browser: `done` modules finished today, an optional module in progress, and a picked path. */
async function openWith({ done = 0, files = questFiles, picked = PATH_ID, ago = [], url = '/', ...options } = {}) {
  const opened = await open(url, options);
  const { page } = opened;
  await page.goto(`${BASE}/robots.txt`);
  const rows = files.slice(0, done).map((file, i) => ({ path: file, status: 'done', updatedAt: new Date(Date.now() - (ago[i] ?? 0) * 86400000 - 60000).toISOString() }));
  await page.evaluate(async ({ rows, picked, pathKey }) => {
    if (picked) localStorage.setItem(pathKey, picked); else localStorage.removeItem(pathKey);
    await new Promise((resolve) => {
      const req = indexedDB.open('docs-progress', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('status', { keyPath: 'path' });
      req.onsuccess = () => {
        const tx = req.result.transaction('status', 'readwrite');
        tx.objectStore('status').clear();
        rows.forEach((r) => tx.objectStore('status').put(r));
        tx.oncomplete = () => { req.result.close(); resolve(); };
      };
    });
  }, { rows, picked, pathKey: config.storage.activePath });
  return opened;
}

test('a reader on a path sees the quest, the route and the player card, worked out from their progress', async () => {
  const { context, page, problems } = await openWith({ done: 3 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const hero = page.locator('.gm-hero');
  await hero.waitFor();
  assert.equal(await hero.getByRole('heading', { level: 2 }).textContent(), quest.title);
  assert.match(await hero.innerText(), new RegExp(`3 of ${questFiles.length} modules done`));

  // the one button opens the next module: the fourth of the path
  const next = hero.locator('a.gm-cta');
  assert.equal(await next.getAttribute('href'), urlOf(questFiles[3]));
  assert.match(await next.innerText(), new RegExp(`\\+${GAME.xp.module} XP`));

  // the route: the first step is open and marked, with its next module flagged
  const step = page.locator('.gm-step').first();
  assert.equal(await step.getByRole('button', { expanded: true }).count(), 1, 'the step you are on is open');
  await step.getByText('You are here').waitFor();
  assert.equal(await step.locator('.gm-mod').count(), firstStep.length, 'every module of the step is listed');
  assert.equal(await step.locator('.gm-mod.is-done').count(), 3);
  assert.equal(await step.locator('.gm-mod.is-next a').getAttribute('href'), urlOf(questFiles[3]));
  assert.ok(!(await step.innerText()).includes('Module 00:'), 'the number is a column, not part of every title');
  assert.equal(await page.locator('.gm-step').count(), quest.steps.length + 1, 'the steps, and the finish line');
  assert.ok((await page.locator('.gm-finish').innerText()).includes(quest.milestone.title), 'the project the path builds is the finish line');

  // the player card: three modules is 30 XP, the first level, a one-day streak, today's goal reached, and the first badge
  const player = page.locator('.gm-player');
  assert.match(await player.innerText(), new RegExp(`Level 1[\\s\\S]*${GAME.levels[0].name}`, "i"));
  assert.match(await player.innerText(), new RegExp(`${3 * GAME.xp.module} XP`));
  assert.match(await player.innerText(), /1-day streak/);
  assert.match(await player.innerText(), /Goal reached/);
  assert.equal(await player.locator('.gm-week .gm-day.is-active').count(), 1, 'one day of the week is marked');
  assert.equal(await player.locator('.gm-week .gm-day.is-today').count(), 1);
  await player.getByText('First step: Earned').waitFor();
  assert.equal(await player.locator('.gm-badge').count(), GAME.badges.length);
  assert.equal(await player.locator('.gm-badge.is-earned').count(), 1);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a streak is the days in a row, and the daily goal is the reader\'s own choice and is kept', async () => {
  const { context, page, problems } = await openWith({ done: 4, ago: [0, 1, 2, 4] });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const player = page.locator('.gm-player');
  await player.waitFor();
  assert.match(await player.innerText(), /5-day streak/, 'today, yesterday and the day before, then one missed day that the weekly streak freeze covers, then the fourth mark');
  assert.match(await player.innerText(), /covered by a streak freeze/, 'the strip says which day was covered');
  assert.match(await player.innerText(), /Goal reached/);

  const two = player.getByRole('button', { name: '2 things' });
  await two.click();
  assert.equal(await two.getAttribute('aria-pressed'), 'true');
  assert.match(await player.innerText(), /1 more to reach today's goal/);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.gm-player').getByRole('button', { name: '2 things' }).getAttribute('aria-pressed'), 'true', 'the choice is kept');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('the quest card keeps its room: the player card goes beside it only when the dashboard is wide enough, and nothing sticks out of the card', async () => {
  // The curriculum tree takes a third of a laptop screen, so a window of 1075px leaves the dashboard about 580px. When the columns followed the window the quest
  // card got 230px beside the player card, and its buttons were cut off. They follow the dashboard's own width now.
  const READABLE = 380; // the least the quest card may have: its ring, the title and the one button still fit
  for (const { width, beside } of [{ width: 1075, beside: false }, { width: 1440, beside: true }]) {
    const { context, page, problems } = await openWith({ done: 1, width, height: 800 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.locator('.gm-hero').waitFor();
    const found = await page.evaluate(() => {
      const hero = document.querySelector('.gm-hero').getBoundingClientRect();
      const player = document.querySelector('.gm-player').getBoundingClientRect();
      const out = [...document.querySelectorAll('.gm-hero *')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.right > hero.right + 1 || r.left < hero.left - 1); })
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
      return { width: hero.width, beside: player.left >= hero.right, below: player.top >= hero.bottom - 1, out };
    });
    assert.ok(found.width >= READABLE, `at ${width}px the quest card is ${Math.round(found.width)}px wide`);
    assert.equal(found.beside, beside, `at ${width}px the player card is ${beside ? 'beside' : 'not beside'} the quest card`);
    if (!beside) assert.ok(found.below, `at ${width}px the player card is under the quest card`);
    assert.deepEqual(found.out, [], `at ${width}px something sticks out of the quest card`);
    assert.deepEqual(real(problems), []);
    await context.close();
  }
});

test('a streak freeze covers one missed day a week, so a longer gap still ends the streak', async () => {
  const { context, page } = await openWith({ done: 4, ago: [0, 1, 2, 6] });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const player = page.locator('.gm-player');
  await player.waitFor();
  assert.match(await player.innerText(), /3-day streak/, 'three days missed in a row: the freeze covers one of them at most, and the streak ends at the next');
  await context.close();
});

test('a step can be opened and closed, and a capstone is drawn as the boss at the end of its track', async () => {
  const { context, page } = await openWith({ done: 1 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const second = page.locator('.gm-step').nth(1);
  await second.waitFor();
  assert.equal(await second.locator('.gm-mod').count(), 0, 'a step you are not on is closed');
  const head = second.getByRole('button').first();
  assert.equal(await head.getAttribute('aria-expanded'), 'false');
  await head.click();
  assert.equal(await head.getAttribute('aria-expanded'), 'true');
  assert.equal(await second.locator('.gm-mod').count(), modulesOf(quest.steps[1]).length);
  await head.click();
  assert.equal(await second.locator('.gm-mod').count(), 0);

  const boss = page.locator('.gm-step').first().locator('.gm-mod.is-boss');
  assert.equal(await boss.count(), 1, 'the capstone of the first track');
  assert.match(await boss.innerText(), /Capstone/);
  assert.match(await boss.innerText(), new RegExp(`\\+${GAME.xp.module + GAME.xp.capstone} XP`));
  await context.close();
});

test('finishing a module pays out: XP and the way to the next level, and a badge is a bigger moment', async () => {
  // nine modules done, none today: the tenth earns the "Warming up" badge
  const { context, page, problems } = await openWith({ done: 9, ago: Array(9).fill(2) });
  await page.goto(`${BASE}${urlOf(questFiles[9])}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Mark complete/ }).click();
  const reward = page.locator('.ui-toast--reward');
  await reward.waitFor();
  assert.match(await reward.innerText(), new RegExp(`\\+${GAME.xp.module} XP`));
  assert.match(await reward.innerText(), /Badge unlocked: Warming up/);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('an ordinary module pays XP and says how far it is to the next level, without a fuss', async () => {
  const { context, page } = await openWith({ done: 4, ago: [1, 1, 1, 1] });
  await page.goto(`${BASE}${urlOf(questFiles[4])}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Mark complete/ }).click();
  const reward = page.locator('.ui-toast--reward');
  await reward.waitFor();
  const text = await reward.innerText();
  assert.match(text, new RegExp(`\\+${GAME.xp.module} XP`));
  assert.match(text, /XP to Junior/, 'the way to the next level');
  assert.ok(!/Badge unlocked/.test(text), 'five modules and a two-day streak earn no badge: it is not announced');
  await context.close();
});

test('with no path, the reader chooses one from cards that show what it is, the route it takes, what it pays and what it builds', async () => {
  const { context, page, problems } = await openWith({ done: 0, picked: null });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 2, name: 'Pick a path' }).waitFor();
  const cards = page.locator('.gm-quest');
  assert.equal(await cards.count(), catalogue.length, 'every path is a card');
  const card = cards.filter({ hasText: quest.title }).first();
  assert.match(await card.innerText(), new RegExp(`Final project:\\s*${quest.milestone.title}`));
  assert.match(await card.innerText(), /\+\d+ XP/);
  assert.equal(await card.locator('.gm-quest-route li').count(), quest.steps.length, 'an icon for each step of the route');
  assert.ok(await page.locator('.gm-quests.is-feature .gm-quest').count() >= 1, 'the paths that end in a project come first');

  // the level filter
  await page.getByRole('button', { name: 'Beginner' }).click();
  const beginner = catalogue.filter((p) => p.difficulty === 'beginner').length;
  assert.equal(await cards.count(), beginner);
  await page.getByRole('button', { name: 'All levels' }).click();

  // choosing starts the quest, and it is remembered
  await card.getByRole('button', { name: 'Start this path' }).click();
  await page.locator('.gm-hero').waitFor();
  assert.equal(await page.locator('.gm-hero').getByRole('heading', { level: 2 }).textContent(), quest.title);
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), config.storage.activePath), PATH_ID);
  assert.match(await page.locator('.gm-hero').innerText(), new RegExp(`0 of ${questFiles.length} modules done`));
  assert.match(await page.locator('.gm-hero a.gm-cta').innerText(), /start/i, 'nothing is done yet: it says Start, not Continue');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('progress without a path: where they left off, the player card, what is next, and a way to give it a finish line', async () => {
  const { context, page, problems } = await openWith({ done: 2, picked: null });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const hero = page.locator('.gm-hero');
  await hero.waitFor();
  assert.match(await hero.innerText(), /2 of \d+ modules done/);
  assert.equal(await hero.locator('a.gm-cta').count(), 1);
  assert.equal(await page.locator('.gm-player').count(), 1);
  assert.equal(await page.locator('.gm-queue .gm-mod').count(), 3, 'the next three modules');
  await page.getByRole('heading', { level: 2, name: 'Or follow a path' }).waitFor();
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a path that is finished is a send-off: the XP it paid, a next path, and every step cleared', async () => {
  const { context, page } = await openWith({ done: questFiles.length });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const done = page.locator('.gm-done');
  await done.waitFor();
  assert.match(await done.innerText(), new RegExp(`You finished ${quest.title}`));
  assert.match(await done.innerText(), /You earned \d+ XP on this path/);
  assert.equal(await done.getByRole('button', { name: /^Next:/ }).count(), 1, 'the next path is offered');
  assert.equal(await page.locator('.gm-step.is-cleared').count(), quest.steps.length);
  assert.match(await page.locator('.gm-player').innerText(), /Path finisher/);
  await context.close();
});

test('on a phone the dashboard fits the screen, the badges fold away, and the route is still what you reach first after the player card', async () => {
  const { context, page, problems } = await openWith({ done: 3, width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('.gm-hero').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'nothing makes the page wider than the screen');
  const player = page.locator('.gm-player');
  assert.equal(await player.locator('.gm-badges').isVisible(), false, 'the badge grid is folded on a narrow screen');
  await player.getByRole('button', { name: 'Show all' }).click();
  assert.equal(await player.locator('.gm-badges').isVisible(), true);
  assert.equal(await player.locator('.gm-nextbadge').isVisible(), true, 'the next badge to earn is always shown');
  const heroBottom = await page.locator('.gm-hero').evaluate((el) => el.getBoundingClientRect().bottom);
  const playerTop = await player.evaluate((el) => el.getBoundingClientRect().top);
  const routeTop = await page.locator('.gm-route-wrap').evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(heroBottom <= playerTop + 1 && playerTop < routeTop, 'quest, then the player card, then the route');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('every control on the dashboard has a name, and nothing on it shares an id', async () => {
  const { context, page } = await openWith({ done: 5 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('.gm-hero').waitFor();
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('.gm-dash button, .gm-dash a, .gm-dash [role="progressbar"]')]
    .filter((el) => !(el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('title'))).map((el) => el.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.gm-dash [id]')].map((el) => el.id));
  assert.equal(new Set(ids).size, ids.length, 'no id is used twice');
  await context.close();
});
