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
import { plan } from '../../webapp/src/lib/netlab/pageload.js';
import { LOADLAB } from '../../webapp/src/config/loadlab.js';

const SUBNET = '/tools/subnet/';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });
const open = (url, options) => openPage(browser, url, options);
const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));

test('the page is a real address: its title, description, canonical address and explanation are in the HTML, and the sitemap lists it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'tools', 'subnet', 'index.html'), 'utf8');
  assert.match(html, /<title>Subnet Calculator and CIDR Practice · [^<]+<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${config.site.url}/tools/subnet/">`));
  assert.match(html, /<meta name="description" content="[^"]{80,200}">/);
  assert.match(html, /<h1>Subnet calculator and CIDR practice<\/h1>/);
  assert.match(html, /block size in the last octet is 256 &minus; 192 = 64/, 'the working by hand is on the page before any script runs');
  assert.match(html, /"@type":"WebApplication"/);
  assert.doesNotMatch(html, /noindex/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8').includes(`${config.site.url}${SUBNET}</loc>`), 'it is in the sitemap');
});

test('the calculator shows the block, in binary, with the working, and says what is wrong with an input that is not a block', async () => {
  const { context, page, problems, goto } = await open(SUBNET, { withCsp: true });
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
  const { context, page, goto } = await open(SUBNET, { withCsp: true });
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
  const { context, page, goto } = await open(SUBNET, { withCsp: true });
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

// Every tool page keeps its own look, and this is the test that notices when it does not. A stylesheet that is shared with the app, renamed or rewritten for another
// screen leaves a page in the browser's default serif with grey buttons, and nothing else in the suite looks at that (it happened once: the subnet page's stylesheet was
// replaced by the Practice screens' rules, and the page went out unstyled). So each page in site.config.json -> tools is measured, under the real policy, for the
// site's font and ground, a column of its own, a bordered card and a button that is not the browser's.
for (const tool of [...config.tools, ...config.pages]) {
  test(`the ${tool.id} tool page is dressed: the site's font and ground, a column, a bordered card, a button of the site's making`, async () => {
    const { context, page, problems, goto } = await open(tool.url, { withCsp: true });
    await goto();
    const look = await page.evaluate(() => {
      const style = (selector) => { const el = document.querySelector(selector); return el ? getComputedStyle(el) : null; };
      const body = style('body.tool');
      const column = style('.tool-main');
      const card = style('.tool-card');
      const button = style('.tool-btn');
      return {
        font: body && body.fontFamily,
        ground: body && body.backgroundColor,
        column: column && column.maxWidth,
        card: card && { border: card.borderTopWidth, padding: card.paddingTop },
        button: button && button.borderTopStyle
      };
    });
    assert.ok(look.font, 'the page is a tool page (body.tool)');
    assert.doesNotMatch(look.font, /Times/, 'not the browser\'s default serif');
    assert.notEqual(look.ground, 'rgba(0, 0, 0, 0)', 'a ground of its own, not the browser\'s transparent one');
    assert.notEqual(look.column, 'none', 'a column of limited width');
    assert.ok(look.card && look.card.border !== '0px' && look.card.padding !== '0px', 'a card with a border and padding');
    assert.equal(look.button, 'solid', "buttons with the site's edge, not the browser's raised one");
    assert.deepEqual(real(problems), [], 'nothing is blocked or broken on the page');
    await context.close();
  });
}

// ------------------------------------------------------------------------------------------------ every tool page

const sitemap = () => fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8');
const serves = (href) => {
  const clean = href.split('#')[0].split('?')[0];
  const target = path.join(ROOT, 'dist', clean);
  return fs.existsSync(path.join(target, 'index.html')) || (fs.existsSync(target) && fs.statSync(target).isFile()) || sitemap().includes(`${config.site.url}${clean}</loc>`);
};

test('every address a tool page links to is one the site serves, so a lesson that moves cannot leave a tool pointing at nothing', () => {
  for (const tool of [...config.tools, ...config.pages]) {
    const html = fs.readFileSync(path.join(ROOT, 'dist', tool.url, 'index.html'), 'utf8');
    const links = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    assert.ok(links.length > 3, `${tool.url} has links`);
    for (const href of links) assert.ok(serves(href), `${tool.url} links to ${href}, which the site does not serve`);
  }
});

test('the Network Lab front page lists each tool, in the HTML, and is in the sitemap', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'tools', 'index.html'), 'utf8');
  assert.match(html, /<title>Network Lab[^<]*· [^<]+<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${config.site.url}/tools/">`));
  assert.match(html, /<h1>Network Lab<\/h1>/);
  for (const tool of config.tools.filter((t) => t.id !== 'hub')) assert.ok(html.includes(`href="${tool.url}"`), `it links to ${tool.url}`);
  assert.doesNotMatch(html, /noindex/);
  assert.ok(sitemap().includes(`${config.site.url}/tools/</loc>`));
});

// ------------------------------------------------------------------------------------------------ the page load lab

const LOAD = '/tools/page-load-latency/';

test('the page load calculator is a real address: its title, description, explanation and sources are in the HTML, and the sitemap lists it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'tools', 'page-load-latency', 'index.html'), 'utf8');
  assert.match(html, /<title>Page Load Latency Calculator \(DNS, TCP, TLS\) · [^<]+<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${config.site.url}${LOAD}">`));
  assert.match(html, /<meta name="description" content="[^"]{80,200}">/);
  assert.match(html, /<h1>Page load latency calculator<\/h1>/);
  assert.match(html, /ten segments, about 14\.6 kB \(RFC 6928\)/, 'the explanation is on the page before any script runs');
  assert.match(html, /rfc-editor\.org\/rfc\/rfc8446/, 'it names its sources');
  assert.match(html, /"@type":"WebApplication"/);
  assert.doesNotMatch(html, /noindex/);
  assert.ok(sitemap().includes(`${config.site.url}${LOAD}</loc>`), 'it is in the sitemap');
});

test('the calculator draws what the arithmetic says: the numbers, the messages, a stack that saves round trips, and a link that holds the scenario', async () => {
  const { context, page, problems, goto } = await open(LOAD, { withCsp: true });
  await goto();
  const ms = LOADLAB.ui.ms;
  const text = async (selector) => (await page.locator(selector).innerText()).trim();
  const messageCount = (p) => p.events.filter((e) => e.kind === 'message').length;

  // The starting scenario.
  let expected = plan({});
  assert.equal(await text('#ll-first'), ms(expected.firstByteMs));
  assert.equal(await text('#ll-loaded'), ms(expected.loadedMs));
  assert.equal(await text('#ll-trips'), String(expected.tripsToFirstByte));
  assert.equal(await page.locator('.ll-msg').count(), messageCount(expected), 'one arrow for each message');
  assert.equal(await page.locator('#ll-compare tbody tr').count(), 4, 'a row for each stack');
  assert.equal(await page.locator('#ll-compare tr[aria-current="true"]').count(), 1, 'the stack in use is marked');

  // TLS 1.2 is exactly one round trip slower than TLS 1.3, and the page says so.
  await page.selectOption('#ll-stack', 'tls12');
  expected = plan({ stack: 'tls12' });
  assert.equal(expected.firstByteMs - plan({}).firstByteMs, 80, 'one round trip of 80 ms');
  assert.equal(await text('#ll-first'), ms(expected.firstByteMs));
  assert.equal(await page.locator('.ll-msg').count(), messageCount(expected));

  // A connection that is already open skips everything but the request.
  await page.selectOption('#ll-conn', 'open');
  expected = plan({ stack: 'tls12', connection: 'open' });
  assert.equal(await text('#ll-first'), ms(expected.firstByteMs));
  assert.equal(await page.locator('.ll-msg').count(), 2, 'a request and the first bytes');

  // A start from the presets moves the distance, and the address holds the whole scenario.
  await page.getByRole('button', { name: 'Across an ocean' }).click();
  assert.equal(await text('#ll-rtt-out'), ms(150));
  assert.equal(await page.getByRole('button', { name: 'Across an ocean' }).getAttribute('aria-pressed'), 'true');
  const query = new URL(page.url()).searchParams;
  assert.equal(query.get('rtt'), '150');
  assert.equal(query.get('stack'), 'tls12');
  assert.equal(query.get('conn'), 'open');
  const link = page.url();

  // Opening that link in a new visit shows the same scenario.
  await page.goto(link, { waitUntil: 'networkidle' });
  expected = plan({ rttMs: 150, resolverRttMs: 15, bandwidthMbps: 100, stack: 'tls12', connection: 'open' });
  assert.equal(await page.locator('#ll-stack').inputValue(), 'tls12');
  assert.equal(await page.locator('#ll-conn').inputValue(), 'open');
  assert.equal(await text('#ll-first'), ms(expected.firstByteMs));
  assert.deepEqual(real(problems), [], 'nothing is blocked by the policy or fails');
  await context.close();
});

test('on a long round trip the protocol that asks for fewer of them is the one the page says would save time, and the table agrees', async () => {
  const { context, page, goto } = await open(`${LOAD}?rtt=300&stack=tls12`, { withCsp: true });
  await goto();
  const advice = await page.locator('#ll-advice').innerText();
  assert.match(advice, /HTTP\/3 over QUIC would save 600 ms to the first byte compared with HTTPS, TLS 1\.2/, 'two round trips of 300 ms');
  const best = await page.locator('#ll-compare td.is-best').allInnerTexts();
  assert.equal(best.length, 2, 'QUIC and plain HTTP both take two round trips, and are marked as the fastest');
  await context.close();
});

// ------------------------------------------------------------------------------------------------ the trust pages

test('the corrections page carries the whole log in its HTML: each fix, its lesson as a link that exists, and its date', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'corrections', 'index.html'), 'utf8');
  assert.match(html, /<title>Corrections · [^<]+<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${config.site.url}/corrections/">`));
  assert.match(html, /<h1>Corrections<\/h1>/);
  assert.doesNotMatch(html, /noindex/);
  assert.doesNotMatch(html, /%BLOCK_|%DEVELOPER_|%SITE_/, 'no placeholder is left in the page');
  const log = JSON.parse(fs.readFileSync(path.join(ROOT, config.content.dir, 'corrections.json'), 'utf8')).corrections;
  assert.ok(log.length >= 1);
  assert.equal((html.match(/<article class="tool-card correction"/g) || []).length, log.length, 'one card for each entry');
  for (const entry of log) {
    assert.ok(html.includes(`<a href="/${entry.page}/">`), `it links to ${entry.page}`);
    assert.ok(serves(`/${entry.page}/`), `${entry.page} is a page the site serves`);
    assert.ok(html.includes(`datetime="${entry.date}"`), 'it carries the date');
  }
  assert.ok(sitemap().includes(`${config.site.url}/corrections/</loc>`), 'it is in the sitemap');
});

test('the about page names who writes the site from the site config, says how the lessons are made and links the corrections, and carries a Person record', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'about', 'index.html'), 'utf8');
  assert.match(html, /<title>About · [^<]+<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${config.site.url}/about/">`));
  assert.doesNotMatch(html, /noindex/);
  assert.doesNotMatch(html, /%BLOCK_|%DEVELOPER_|%SITE_|%YOUTUBE_/, 'no placeholder is left in the page');
  assert.ok(html.includes(`<strong>${config.developer.name}</strong>`), 'the name is the one in the site config');
  assert.ok(html.includes(`href="${config.developer.linkedin}"`) && html.includes(`href="${config.developer.github}"`) && html.includes(`href="${config.youtube.channel}"`), 'its links are the config\'s');
  assert.match(html, /was drafted with the help of AI tools/, 'it says how the lessons are made');
  assert.ok(html.includes('href="/corrections/"'), 'it points at the corrections');
  assert.match(html, /"@type":"Person","name":"[^"]+","sameAs":\["https:/, 'a Person record');
  assert.ok(sitemap().includes(`${config.site.url}/about/</loc>`), 'it is in the sitemap');
});

test('the footer and the foot of a lesson lead to the about page and the corrections', async () => {
  const { context, page, goto } = await open('/system-design/01-core-fundamentals/08-latency/', { withCsp: true });
  await goto();
  const lessonFoot = page.locator('.edit-on-github');
  await lessonFoot.waitFor({ timeout: 90000 });
  assert.equal(await lessonFoot.getByRole('link', { name: 'See the corrections' }).getAttribute('href'), '/corrections/');
  await context.close();
});
