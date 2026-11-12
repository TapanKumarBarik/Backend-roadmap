// Coding practice, in a real browser: a problem's Python is run in the page (Pyodide, in a worker) under the site's real Content-Security-Policy,
// the results say which tests fail and why, a solved problem is saved as progress and earns XP, and the practice hub and the daily drill around it
// work. The API behind the page is the real one, answering inside the test process (support.mjs), with the real problems and quizzes from content/.
//
// Same setup as site.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import practiceContent from '../../api/generated/practice-content.json' with { type: 'json' };
import game from '../../game.config.json' with { type: 'json' };
import site from '../../site.config.json' with { type: 'json' };

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));
const SLUG = 'two-sum';
const PROBLEM = practiceContent.code[SLUG];
const READY = { timeout: 90000 }; // Python is downloaded and started the first time

/** The page on `url`, with the real Content-Security-Policy applied (Python must start under it), signed out. */
async function open(url, options = {}) {
  const opened = await openPage(browser, url, { withCsp: true, ...options });
  const env = await answerApiInProcess(opened.context, { email: null });
  return { ...opened, env };
}

/** Puts progress marks into the page's own storage before the app is opened, as a reader who has done some work. */
async function seed(page, marks) {
  await page.goto(`${BASE}/robots.txt`);
  await page.evaluate(async (rows) => {
    await new Promise((resolve) => {
      const req = indexedDB.open('docs-progress', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('status', { keyPath: 'path' });
      req.onsuccess = () => {
        const tx = req.result.transaction('status', 'readwrite');
        rows.forEach(([path, status]) => tx.objectStore('status').put({ path, status, updatedAt: new Date().toISOString() }));
        tx.oncomplete = () => { req.result.close(); resolve(); };
      };
    });
  }, Object.entries(marks));
}

/** What the page has saved as progress: { path: status }. */
const savedMarks = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('docs-progress');
  req.onsuccess = () => {
    const all = req.result.transaction('status').objectStore('status').getAll();
    all.onsuccess = () => { req.result.close(); resolve(Object.fromEntries(all.result.map((r) => [r.path, r.status]))); };
  };
}));

async function until(read, message) {
  for (let i = 0; i < 80; i++) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
  return null;
}

const runButton = (page) => page.getByRole('button', { name: 'Run tests' });

test('a coding problem runs the learner\'s Python in the page under the real Content-Security-Policy, says which tests fail and why, and is solved when they all pass', async () => {
  const { context, page, problems, goto } = await open(`/practice/code/${SLUG}/`);
  await goto();
  await page.getByRole('heading', { level: 2, name: PROBLEM.title }).waitFor();
  assert.match(await page.locator('.cp-statement').innerText(), /indices of the two numbers/);
  assert.equal(await page.locator('.ce-input').inputValue(), PROBLEM.starter, 'the editor starts with the starting code');
  assert.doesNotMatch(await page.locator('body').innerText(), /seen\[target - x\]/, 'the solution is not on the page before it is asked for');

  await runButton(page).waitFor(READY);
  await runButton(page).click();
  await page.locator('.cp-test.is-fail').first().waitFor();
  assert.match(await page.locator('.cp-summary').innerText(), /\d+ of \d+ tests pass/);
  assert.match(await page.locator('.cp-test.is-fail .cp-test__msg').first().innerText(), /got None, expected \[0, 1\]/, 'a failure says what came back and what was expected');
  assert.equal(await page.locator('.cp-solved').count(), 0, 'not solved yet');
  await until(async () => (await savedMarks(page))[`practice/code/${SLUG}`] === 'wip', 'trying it is kept as "tried"');

  await page.locator('.ce-input').fill(PROBLEM.solution);
  await runButton(page).click();
  await page.getByText('All tests pass').waitFor();
  assert.equal(await page.locator('.cp-test.is-fail').count(), 0);
  await page.locator('.cp-solved').waitFor();
  await until(async () => (await savedMarks(page))[`practice/code/${SLUG}`] === 'done', 'a solved problem is saved as progress');
  await page.getByText(`+${game.xp.problem} XP`).first().waitFor();
  assert.ok(await page.getByRole('button', { name: /^Next problem/ }).count() > 0, 'it offers the next problem');
  assert.ok(await page.locator('.cp-state.is-done').count() > 0, 'the title says it is solved');

  await page.getByRole('button', { name: 'Compare yours with the model solution' }).click();
  await page.locator('.cp-panel', { hasText: 'Model solution' }).locator('pre').waitFor();
  assert.match(await page.locator('.cp-panel', { hasText: 'Model solution' }).innerText(), /seen\[x\] = i/, 'after solving, the model solution can be read');
  assert.deepEqual(real(problems), [], 'nothing was blocked by the policy');
  await context.close();
});

test('a loop that never ends is stopped and said so, and Python is ready again for the next run', async () => {
  const { context, page, problems, goto } = await open(`/practice/code/${SLUG}/`);
  await goto();
  await runButton(page).waitFor(READY);
  await page.locator('.ce-input').fill('def two_sum(nums, target):\n    while True:\n        pass\n');
  await runButton(page).click();
  await page.locator('.cp-problem').waitFor({ timeout: 30000 });
  assert.match(await page.locator('.cp-problem').innerText(), /ran for more than \d+ seconds and was stopped/);
  await page.locator('.ce-input').fill(PROBLEM.solution);
  await runButton(page).waitFor(READY);
  await runButton(page).click();
  await page.getByText('All tests pass').waitFor(READY);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a syntax error is reported with its line, and the line is marked in the editor', async () => {
  const { context, page, problems, goto } = await open(`/practice/code/${SLUG}/`);
  await goto();
  await runButton(page).waitFor(READY);
  await page.locator('.ce-input').fill('def two_sum(nums, target)\n    return []\n');
  await runButton(page).click();
  await page.locator('.cp-problem').waitFor();
  assert.match(await page.locator('.cp-problem').innerText(), /SyntaxError.*line 1/);
  assert.equal(await page.locator('.ce-gutter .is-error').innerText(), '1');
  assert.equal(await page.locator('.ce-band').count(), 1);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('the editor indents, keeps the indentation, undoes, comments, runs on Ctrl+Enter and can be left with Esc then Tab', async () => {
  const { context, page, problems, goto } = await open(`/practice/code/${SLUG}/`);
  await goto();
  await runButton(page).waitFor(READY);
  const editor = page.locator('.ce-input');
  await editor.fill('');
  await editor.click();
  await page.keyboard.type('def f(x):');
  await page.keyboard.press('Enter');
  assert.equal(await editor.inputValue(), 'def f(x):\n    ', 'Enter goes in after a colon');
  await page.keyboard.type('if x:');
  await page.keyboard.press('Enter');
  assert.equal(await editor.inputValue(), 'def f(x):\n    if x:\n        ');
  await page.keyboard.press('Backspace');
  assert.equal(await editor.inputValue(), 'def f(x):\n    if x:\n    ', 'Backspace in the indentation removes a whole step');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await editor.inputValue(), 'def f(x):\n    if x:\n');
  await page.keyboard.press('Tab');
  await page.keyboard.type('return x');
  assert.equal(await editor.inputValue(), 'def f(x):\n    if x:\n    return x');
  await page.keyboard.press('Control+/');
  assert.equal(await editor.inputValue(), 'def f(x):\n    if x:\n    # return x');
  await page.keyboard.press('Control+/');
  assert.equal(await editor.inputValue(), 'def f(x):\n    if x:\n    return x');
  assert.ok(await page.locator('.ce-hl .hljs-keyword').count() > 0, 'the code is coloured');

  await page.keyboard.press('Control+Enter');
  await page.locator('.cp-problem').waitFor(); // it ran (and the code is not valid Python)
  await editor.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('ce-input')), false, 'Esc then Tab leaves the editor');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('a long program scrolls inside the editor, the line numbers go with it, and the caret stays in view while typing at the end', async () => {
  const { context, page, problems, goto } = await open(`/practice/code/${SLUG}/`);
  await goto();
  await runButton(page).waitFor(READY);
  const editor = page.locator('.ce-input');
  await editor.fill(Array.from({ length: 90 }, (_, i) => `x${i} = ${i}`).join('\n'));
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('y = 1');
  const view = await page.locator('.ce-scroll').evaluate((el) => ({ top: el.scrollTop, bottom: el.scrollTop + el.clientHeight, height: el.scrollHeight }));
  assert.ok(view.top > 0, 'the editor scrolled');
  assert.ok(view.bottom >= view.height - 40, 'to the line being typed');
  assert.equal(await page.locator('.ce-gutter span').count(), 90, 'one line number for each line');
  const lastNumber = await page.locator('.ce-gutter span').last().boundingBox();
  const editorBox = await page.locator('.ce-scroll').boundingBox();
  assert.ok(lastNumber.y + lastNumber.height <= editorBox.y + editorBox.height + 12, 'and the line being typed is in view with it');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the page does not scroll sideways');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('what is typed is kept for next time, and Reset code asks before it puts the starting code back', async () => {
  const { context, page, goto } = await open(`/practice/code/${SLUG}/`);
  await goto();
  await runButton(page).waitFor(READY);
  const mine = `${PROBLEM.starter}# my own note\n`;
  await page.locator('.ce-input').fill(mine);
  await new Promise((resolve) => setTimeout(resolve, 700)); // it is saved a moment after typing stops
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ce-input').waitFor();
  assert.equal(await page.locator('.ce-input').inputValue(), mine, 'the code is there after a reload');

  await page.getByRole('button', { name: 'Reset code' }).click();
  await page.getByRole('button', { name: 'Keep my code' }).click();
  assert.equal(await page.locator('.ce-input').inputValue(), mine, 'keeping it changes nothing');
  await page.getByRole('button', { name: 'Reset code' }).click();
  await page.getByRole('button', { name: 'Yes, reset' }).click();
  assert.equal(await page.locator('.ce-input').inputValue(), PROBLEM.starter);
  assert.equal(await page.getByRole('button', { name: 'Reset code' }).isDisabled(), true, 'nothing left to reset');
  await context.close();
});

test('the solution stays hidden until the reader has tried, and then asks once more before it shows', async () => {
  const { context, page, goto } = await open(`/practice/code/${SLUG}/`);
  await goto();
  await runButton(page).waitFor(READY);
  assert.equal(await page.getByRole('button', { name: 'Show the solution' }).count(), 0, 'not offered before a try');
  await runButton(page).click();
  await page.locator('.cp-test.is-fail').first().waitFor();
  await page.getByRole('button', { name: 'Show the solution' }).click();
  assert.ok(await page.getByText(/You can still solve it yourself/).count() > 0, 'it asks first');
  assert.equal(await page.locator('.cp-panel', { hasText: 'Model solution' }).locator('pre').count(), 0);
  await page.getByRole('button', { name: 'Show it anyway' }).click();
  await page.locator('.cp-panel', { hasText: 'Model solution' }).locator('pre').waitFor();

  await page.getByRole('button', { name: 'Show hint 1 of 3' }).click();
  assert.equal(await page.locator('.cp-hint').count(), 1);
  await page.getByRole('button', { name: 'Show hint 2 of 3' }).click();
  assert.equal(await page.locator('.cp-hint').count(), 2);
  await context.close();
});

test('the Practice hub shows today\'s drill and problem, the problems as a map of topics with the reader\'s progress, and can be searched and narrowed', async () => {
  const { context, page, goto } = await open('/practice/');
  await seed(page, { [`practice/code/${SLUG}`]: 'done', 'practice/code/min-stack': 'wip' });
  await goto();
  await page.locator('.cm-topic').first().waitFor();
  assert.match(await page.locator('.hub-today').innerText(), /Today's drill[\s\S]*Problem of the day/i);
  assert.ok(await page.getByRole('button', { name: 'Start the drill' }).count() > 0);
  const total = practiceContent.code ? Object.keys(practiceContent.code).length : 0;
  assert.ok(total >= 3, 'there are coding problems');
  await page.locator('.hub-progress').first().waitFor();
  assert.match(await page.locator('.hub-progress').first().innerText(), new RegExp(`1 of ${total} problems solved`));
  assert.equal(await page.locator('.cm-row.is-done').count(), 1, 'the solved one is marked');
  assert.equal(await page.locator('.cm-row.is-wip').count(), 1, 'and the one that was tried');
  assert.match(await page.locator('.hub-continue').innerText(), /Pick up where you left off\s*Min Stack/i, 'it offers to pick up where the reader left off');

  await page.getByRole('button', { name: 'Unsolved only' }).click();
  assert.equal(await page.locator('.cm-row.is-done').count(), 0, 'solved problems are left out');
  await page.getByRole('button', { name: 'Unsolved only' }).click();
  await page.getByLabel('Search the problems by name').fill('min stack');
  assert.equal(await page.locator('.cm-row').count(), 1);
  await page.getByLabel('Search the problems by name').fill('zzzz-no-such-problem');
  await page.getByText('No problem matches those filters.').waitFor();
  await page.getByLabel('Search the problems by name').fill('');
  await page.getByRole('button', { name: 'Beginner', exact: true }).click();
  assert.ok(await page.locator('.cm-row').count() > 0);
  assert.equal(await page.locator('.cm-row', { hasText: 'Min Stack' }).count(), 0, 'Min Stack is not a beginner problem');
  await page.getByRole('button', { name: 'All levels' }).click();

  await page.locator('.cm-row', { hasText: 'Min Stack' }).click();
  await page.getByRole('heading', { level: 2, name: 'Min Stack' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/practice/code/min-stack/', 'a problem has an address of its own');
  await context.close();
});

test('the daily drill is five questions, each answered and explained on the spot, and finishing it is saved as progress and earns XP', async () => {
  const { context, page, problems, goto } = await open('/practice/');
  await goto();
  await page.getByRole('button', { name: 'Start the drill' }).click();
  await page.locator('.dr-question').waitFor();
  assert.equal(new URL(page.url()).pathname, '/practice/drill/');
  const quizzes = Object.values(practiceContent.quizzes);
  let wrongOn = null;

  for (let n = 1; n <= game.drill.questions; n += 1) {
    await page.getByText(`Question ${n} of ${game.drill.questions}`).waitFor();
    const text = await page.locator('.dr-question legend').innerText();
    const question = quizzes.flatMap((q) => q.questions).find((q) => text.startsWith(q.text));
    assert.ok(question, `the question is one of the quizzes': ${text}`);
    const deliberately = n === 2; // one answer is wrong on purpose
    const options = deliberately
      ? [question.options.find((o) => !question.answer.includes(o.id))]
      : question.options.filter((o) => question.answer.includes(o.id));
    for (const o of options) await page.locator('.dr-question label', { hasText: o.text }).first().click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.locator('.pr-explain').waitFor();
    assert.match(await page.locator('.pr-explain').innerText(), deliberately ? /^Not quite\./ : /^Correct\./);
    if (deliberately) { wrongOn = question.text; assert.ok(await page.locator('.pr-option.is-miss').count() > 0, 'the wrong choice is marked'); }
    assert.ok(await page.locator('.pr-option.is-answer').count() > 0, 'and the right one is shown');
    await page.getByRole('button', { name: n === game.drill.questions ? 'Finish the drill' : 'Next question' }).click();
  }

  await page.getByText('Drill complete').waitFor();
  assert.match(await page.locator('.pr-score').innerText(), new RegExp(`${game.drill.questions - 1} of ${game.drill.questions} right`));
  assert.ok((await page.locator('.dr-review').innerText()).includes(wrongOn.slice(0, 30)), 'the one that was missed is reviewed');
  await until(async () => Object.entries(await savedMarks(page)).some(([path, status]) => path.startsWith(site.progressKeys.drill) && status === 'done'), 'a finished drill is saved as progress');
  await page.getByText(`+${game.xp.drill} XP`).first().waitFor();

  await page.getByRole('button', { name: 'More practice' }).click();
  await page.locator('.hub-quest.is-done').waitFor();
  assert.match(await page.locator('.hub-quest.is-done').innerText(), /Done today/);
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('the pages a search engine or a reader without JavaScript gets: a problem has its statement and starting code but never its solution, and the drill is not indexed', async () => {
  const get = async (path) => { const res = await fetch(`${BASE}${path}`); return { status: res.status, html: await res.text() }; };
  const page = await get(`/practice/code/${SLUG}/`);
  assert.equal(page.status, 200);
  assert.match(page.html, /<h1>Two Sum: Python practice problem<\/h1>/);
  assert.match(page.html, /indices of the two numbers/);
  assert.ok(page.html.includes('def two_sum(nums, target):'), 'the starting code is on the page');
  assert.ok(!page.html.includes('seen[target - x]'), 'the solution is not');
  assert.ok(!page.html.includes('accepts('), 'and neither are the tests');
  assert.match(page.html, /"@type":\s*"LearningResource"/);

  const drill = await get('/practice/drill/');
  assert.equal(drill.status, 200, 'opening the drill directly works');
  assert.match(drill.html, /<meta name="robots" content="[^"]*noindex/);
  const sitemap = (await get('/sitemap.xml')).html;
  assert.ok(sitemap.includes(`/practice/code/${SLUG}/</loc>`), 'a problem is in the sitemap');
  assert.ok(!sitemap.includes('/practice/drill/'), 'the drill is not');
  assert.match((await get('/practice/')).html, new RegExp(`href="/practice/code/${SLUG}/"`), 'and the list of practice links to it');
});
