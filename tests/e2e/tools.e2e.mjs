// The subnet page (/tools/subnet/): a real address with its text in the HTML, a calculator, drills and the puzzle of the day, under the real
// Content-Security-Policy. The puzzle is the same for everyone on a given day, so the test works out its answers the same way the page does.
//
//   npm run build && npm run preview, then  npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from '../../scripts/lib/config.mjs';
import { dailyRound, dailySeed } from '../../webapp/src/lib/netlab/questions.js';
import { launchBrowser, openPage } from './support.mjs';

const URL = '/tools/subnet/';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });
const open = (url, options) => openPage(browser, url, options);

test('the page is a real address: its title, description, canonical address and explanation are in the HTML, and the sitemap lists it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'tools', 'subnet', 'index.html'), 'utf8');
  assert.match(html, /<title>Subnet Calculator and CIDR Practice · [^<]+<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${config.site.url}/tools/subnet/">`));
  assert.match(html, /<meta name="description" content="[^"]{80,200}">/);
  assert.match(html, /<h1>Subnet calculator and CIDR practice<\/h1>/);
  assert.match(html, /block size in the last octet is 256 &minus; 192 = 64/, 'the working by hand is on the page before any script runs');
  assert.match(html, /"@type":"WebApplication"/);
  assert.doesNotMatch(html, /noindex/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8').includes(`${config.site.url}${URL}</loc>`), 'it is in the sitemap');
});

test('the calculator shows the block, in binary, with the working, and says what is wrong with an input that is not a block', async () => {
  const { context, page, problems, goto } = await open(URL, { withCsp: true });
  await goto();
  const value = (label) => page.locator('#calc-out dt', { hasText: label }).locator('xpath=following-sibling::dd[1]').textContent();
  assert.equal(await value('Network address'), '192.168.1.128', 'it starts with an example already worked');

  await page.fill('#cidr', '10.0.5.40/29');
  assert.equal(await value('Network address'), '10.0.5.40');
  assert.equal(await value('Broadcast address'), '10.0.5.47');
  assert.equal(await value('First usable host'), '10.0.5.41');
  assert.equal(await value('Last usable host'), '10.0.5.46');
  assert.equal(await value('Usable hosts'), '6');
  assert.equal(await value('Subnet mask'), '255.255.255.248');
  assert.match(await value('Range'), /^Private \(10\.0\.0\.0\/8\)$/);
  assert.equal(await page.locator('.bit-n').count(), 29, 'the 29 network bits are marked');
  assert.equal(await page.locator('.bit-h').count(), 3);

  await page.locator('.tool-details summary').click();
  assert.match(await page.locator('.tool-steps').first().innerText(), /block size is 256 - 248 = 8/);
  await page.selectOption('#calc-out select', '30');
  await page.getByText('2 subnets of /30').waitFor();

  await page.fill('#cidr', '10.0.5.40/33');
  await page.locator('#calc-problem').waitFor({ state: 'visible' });
  assert.match(await page.locator('#calc-problem').innerText(), /not a block/);
  assert.equal(await page.locator('#calc-out dl').count(), 0, 'nothing is shown for it');
  await page.fill('#cidr', '8.8.8.8/32');
  assert.equal(await value('Range'), 'Public');
  assert.deepEqual(problems.filter((p) => /Content Security Policy|page error/i.test(p)), [], 'nothing is blocked and nothing throws');
  await context.close();
});

test('the puzzle of the day: ten questions, each with its working, a score, a streak that is kept, and a result to share', async () => {
  const { context, page, goto } = await open(URL, { withCsp: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await goto();
  assert.match(await page.locator('#streak').innerText(), /Play today.s puzzle to start a streak/);
  await page.getByRole('button', { name: /today.s puzzle/i }).click();

  const questions = dailyRound(dailySeed());
  for (const [i, q] of questions.entries()) {
    assert.equal(await page.locator('#prompt').innerText(), q.prompt, `question ${i + 1} is the one for today`);
    assert.equal(await page.locator('#progress').innerText(), `Question ${i + 1} of 10`);
    // Get the first one wrong on purpose, so the working and the right answer are shown.
    await page.fill('#answer', i === 0 ? 'banana' : q.answer);
    await page.getByRole('button', { name: 'Check' }).click();
    if (i === 0) {
      assert.match(await page.locator('#feedback').innerText(), new RegExp(`Not quite. The answer is ${q.answer.replace(/\./g, '\\.')}\\.`));
      assert.ok(await page.locator('#feedback li').count() >= 2, 'with its working');
    } else {
      assert.match(await page.locator('#feedback').innerText(), /^Correct\./);
    }
    await page.getByRole('button', { name: i === 9 ? 'See the result' : 'Next question' }).click();
  }
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#score').innerText(), '9 of 10');
  assert.match(await page.locator('#share-text').innerText(), /^Subnet puzzle \d{4}-\d{2}-\d{2}: 9\/10\n.*\/tools\/subnet\/$/);
  assert.equal(await page.locator('#drill').isVisible(), false);
  assert.equal(await page.locator('#menu').isVisible(), false, 'the menu is out of the way while playing');

  await page.reload({ waitUntil: 'networkidle' });
  assert.match(await page.locator('#streak').innerText(), /Streak: 1 day/);
  assert.match(await page.locator('#daily-note').innerText(), /played today.s puzzle: 9 of 10/);
  await context.close();
});

test('a free round at a level: a wrong answer says the right one, a right one is marked, the round ends in a score and goes up a level', async () => {
  const { context, page, goto } = await open(URL, { withCsp: true });
  await goto();
  await page.selectOption('#level', '1');
  await page.getByRole('button', { name: 'Start a round' }).click();
  await page.locator('#prompt').waitFor();
  await page.fill('#answer', 'nope');
  await page.getByRole('button', { name: 'Check' }).click();
  assert.match(await page.locator('#feedback').innerText(), /^Not quite\. The answer is /);
  assert.equal(await page.locator('#answer').isEditable(), false, 'it cannot be changed after it is checked');
  for (let i = 1; i < 10; i++) {
    await page.getByRole('button', { name: 'Next question' }).click();
    await page.fill('#answer', 'nope');
    await page.getByRole('button', { name: 'Check' }).click();
  }
  await page.getByRole('button', { name: 'See the result' }).click();
  assert.equal(await page.locator('#score').innerText(), '0 of 10');
  await page.getByRole('button', { name: 'Try the next level' }).click();
  await page.locator('#prompt').waitFor();
  assert.equal(await page.locator('#level').inputValue(), '2');
  await context.close();
});
