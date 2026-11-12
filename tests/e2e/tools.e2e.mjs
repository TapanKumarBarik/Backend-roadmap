// The screens around practice, in a real browser: study plans, the level check, a mock interview, the review of what was missed, and a quiz passed as progress.
// The API behind the page is the real one, answering inside the test process (support.mjs), with the real content.
//
// Same setup as code.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, answerApiInProcess, launchBrowser, openPage } from './support.mjs';
import practiceContent from '../../api/generated/practice-content.json' with { type: 'json' };
import game from '../../game.config.json' with { type: 'json' };
import site from '../../site.config.json' with { type: 'json' };

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const KEYS = site.storage;
const MARKS = site.progressKeys;
const READY = { timeout: 90000 };
const real = (problems) => problems.filter((p) => !/Failed to load resource/.test(p));

async function open(url, { email = null, sharing, ...options } = {}) {
  const opened = await openPage(browser, url, { withCsp: !process.env.E2E_NO_CSP, ...options });
  const env = await answerApiInProcess(opened.context, { email, ...(sharing ? { env: sharing } : {}) }); // `sharing`: the database of another reader of the same site
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

const savedMarks = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('docs-progress');
  req.onsuccess = () => {
    const all = req.result.transaction('status').objectStore('status').getAll();
    all.onsuccess = () => { req.result.close(); resolve(Object.fromEntries(all.result.map((r) => [r.path, r.status]))); };
  };
}));
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
async function until(read, message) {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
  return null;
}
const today = () => new Date().toISOString().slice(0, 10);

/** The mark that says a plan's item is done. */
const markOf = (item) => (item.kind === 'lesson' ? item.ref : item.kind === 'code' ? `${MARKS.code}${item.ref}` : item.kind === 'quiz' ? `${MARKS.quiz}${item.ref}` : `${MARKS.mock}${item.ref}/2026-01-01T00:00:00.000Z`);

const PLAN = 'sql-for-developers-14';
const plan = practiceContent.plans[PLAN];

test('a study plan is on the Practice page, is followed from today, and ticks off what the reader has done', async () => {
  const { context, page, problems, goto } = await open('/practice/');
  const day1 = plan.days[0].items;
  await seed(page, { [markOf(day1[0])]: 'done', [markOf(day1[1])]: 'done' });
  await goto();
  await page.getByRole('tab', { name: /Study plans/ }).click();
  await page.getByRole('link', { name: plan.title }).click();
  await page.getByRole('heading', { level: 2, name: plan.title }).waitFor();
  assert.equal(new URL(page.url()).pathname, `/practice/plan/${PLAN}/`, 'a plan has an address of its own');
  const total = plan.days.reduce((n, d) => n + d.items.length, 0);
  assert.match(await page.locator('.pl-status').innerText(), new RegExp(`2 of ${total} done`), 'two things are done before the plan is started: they count');
  assert.equal(await page.locator('.pl-day').count(), plan.days.length);
  assert.equal(await page.locator('.pl-item.is-done').count(), 2);

  await page.getByRole('button', { name: 'Start this plan' }).click();
  await page.getByText('You are following this plan').waitFor();
  assert.deepEqual(await stored(page, KEYS.plan), { id: PLAN, start: today() }, 'the start is kept on this device');
  assert.match(await page.locator('.pl-status').innerText(), /Day 1 of 14\. On schedule\./);
  assert.equal(await page.locator('.pl-day.is-today').count(), 1);
  assert.match(await page.locator('.pl-day.is-today').innerText(), new RegExp(plan.days[0].title));

  // back on the Practice page the plan is the first thing, with today's progress
  await page.getByRole('button', { name: '← All practice' }).click();
  await page.locator('.tl-plan').waitFor();
  assert.match(await page.locator('.tl-plan').innerText(), new RegExp(`${plan.title}[\\s\\S]*Day 1 of 14`));
  await page.locator('.tl-plan').click();
  await page.getByRole('heading', { level: 2, name: plan.title }).waitFor();

  // finish a day, then the whole plan: the plan is saved as progress and earns its XP
  await context.close();
  const again = await open(`/practice/plan/${PLAN}/`);
  const everything = Object.fromEntries(plan.days.flatMap((d) => d.items).map((item) => [markOf(item), 'done']));
  await seed(again.page, everything);
  await again.page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEYS.plan, { id: PLAN, start: today() }]);
  await again.goto();
  await again.page.locator('.pl-finished').waitFor();
  await until(async () => (await savedMarks(again.page))[`${MARKS.plan}${PLAN}`] === 'done', 'a finished plan is saved as progress');
  assert.match(await again.page.locator('.pl-finished').innerText(), new RegExp(`${game.xp.plan} XP`));
  assert.deepEqual(real(problems).concat(real(again.problems)), [], 'nothing was blocked by the policy');
  await again.context.close();
});

test('a quiz passed is progress, and the questions missed go to the review', async () => {
  const slug = 'http-caching';
  const quiz = practiceContent.quizzes[slug];
  const { context, page, goto } = await open(`/practice/quiz/${slug}/`);
  await goto();
  await page.getByText('Show all the questions on one page').click();
  quiz.questions.forEach(() => {});
  // answer every question right except the first: by clicking the text of each right option
  for (const [i, question] of quiz.questions.entries()) {
    const wanted = i === 0 ? question.options.filter((o) => !question.answer.includes(o.id)).slice(0, 1) : question.options.filter((o) => question.answer.includes(o.id));
    for (const option of wanted) await page.locator('.pr-option', { hasText: option.text }).first().click();
  }
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.locator('.pr-score').waitFor();
  const passed = quiz.questions.length > 1 && (quiz.questions.length - 1) / quiz.questions.length * 100 >= game.quiz.passPercent;
  if (passed) await until(async () => (await savedMarks(page))[`${MARKS.quiz}${slug}`] === 'done', 'a passed quiz is progress');
  else await until(async () => (await savedMarks(page))[`${MARKS.quiz}${slug}`] === 'wip', 'a try below the pass mark is "tried"');
  const review = await until(async () => stored(page, KEYS.review), 'the question that was missed is in the review queue');
  assert.deepEqual(Object.keys(review), [`q:${slug}/${quiz.questions[0].id}`]);
  assert.equal(review[`q:${slug}/${quiz.questions[0].id}`].box, 0);
  await context.close();
});

test('the level check asks a few questions in each area with no feedback, then says where the reader is and what to start with', async () => {
  const { context, page, problems, goto } = await open('/practice/level/');
  await goto();
  await page.getByRole('button', { name: 'Start the test' }).click();
  const total = game.levelCheck.areas.reduce((n, a) => n + a.questions, 0);
  for (let i = 1; i <= total; i++) {
    await page.getByText(`Question ${i} of ${total}`).waitFor();
    assert.equal(await page.locator('.pr-option.is-answer').count(), 0, 'no answer is shown while the test goes on');
    await page.locator('.pr-option').first().click();
    await page.getByRole('button', { name: i === total ? 'See my level' : 'Next' }).click();
  }
  await page.getByRole('heading', { name: 'Where you are' }).waitFor();
  assert.equal(await page.locator('.lv-areas li').count(), game.levelCheck.areas.length);
  const saved = await stored(page, KEYS.levelCheck);
  assert.deepEqual(saved.areas.map((a) => a.id), game.levelCheck.areas.map((a) => a.id));
  assert.ok(saved.areas.every((a) => a.percent >= 0 && a.percent <= 100));
  await page.locator('.lv-next').waitFor();
  assert.ok(await page.getByRole('button', { name: /^Study plan:/ }).count() > 0, 'it recommends a plan');
  assert.ok(await page.getByRole('button', { name: 'Open the path' }).count() > 0, 'and a path');
  await page.getByRole('button', { name: /^Study plan:/ }).click();
  await page.getByRole('heading', { level: 2 }).first().waitFor();
  assert.match(new URL(page.url()).pathname, /^\/practice\/plan\/[a-z0-9-]+\/$/, 'the plan opens');
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('the review brings back what is due: a question is answered and checked, a problem is remembered or not, and each moves on in its box', async () => {
  const quizSlug = 'sessions-and-cookies';
  const question = practiceContent.quizzes[quizSlug].questions[0];
  const { context, page, goto } = await open('/practice/review/');
  await page.goto(`${BASE}/robots.txt`);
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEYS.review, {
    [`q:${quizSlug}/${question.id}`]: { box: 1, due: '2020-01-01' },
    'c:two-sum': { box: 0, due: '2020-01-02' },
    'q:nosuchquiz/q1': { box: 0, due: '2020-01-03' },
    'c:later': { box: 0, due: '2999-01-01' }
  }]);
  await goto();
  await page.getByText('Item 1 of 2').waitFor();
  assert.ok((await page.locator('.dr-from').innerText()).includes(practiceContent.quizzes[quizSlug].title));
  for (const option of question.options.filter((o) => question.answer.includes(o.id))) await page.locator('.pr-option', { hasText: option.text }).first().click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByText('Correct. ').waitFor();
  assert.equal(await page.locator('.pr-option.is-answer').count(), question.answer.length);
  await page.getByRole('button', { name: 'Next item' }).click();
  await page.getByText('Item 2 of 2').waitFor();
  assert.equal(await page.getByRole('heading', { level: 3, name: practiceContent.code['two-sum'].title }).count(), 1);
  await page.getByRole('button', { name: 'I need more practice' }).click();
  await page.getByText('Review done').waitFor();
  const state = await stored(page, KEYS.review);
  assert.equal(state[`q:${quizSlug}/${question.id}`].box, 2, 'a right answer moves it one box on');
  assert.deepEqual([state['c:two-sum'].box, state['c:two-sum'].due > today()], [0, true], 'not remembered: back to the first box, due after today');
  assert.equal(state['q:nosuchquiz/q1'], undefined, 'a question that is not in the content any more is taken out');
  assert.equal(state['c:later'].due, '2999-01-01', 'what is not due is left alone');
  await context.close();
});

test('a mock interview is timed, has no hints or solutions, scores the questions on the server and the problems by their checks, and is saved as progress', async () => {
  const { context, page, problems, goto } = await open('/practice/mock/sql/');
  await goto();
  await page.getByRole('radio', { name: /SQL and data/ }).waitFor();
  await page.getByRole('button', { name: 'Start the interview' }).click();
  const track = game.mock.tracks.find((t) => t.id === 'sql');
  await page.locator('.mk-questions li').first().waitFor();
  assert.equal(await page.locator('.mk-questions li').count(), track.questions);
  assert.equal(await page.locator('.mk-problem').count(), track.problems);
  assert.match(await page.locator('.mk-clock').innerText(), /^\d+:\d\d left$/);
  const run = await stored(page, KEYS.mockRun);
  assert.equal(run.track, 'sql');
  assert.match(run.seed, /^[a-z0-9]{4,40}$/);

  // answer two questions, then reload: the interview in progress is still there
  await page.locator('.mk-questions li').nth(0).locator('.pr-option').first().click();
  await page.locator('.mk-questions li').nth(1).locator('.pr-option').first().click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.mk-questions li').first().waitFor();
  assert.match(await page.locator('h3', { hasText: 'Questions' }).innerText(), /2 of \d+ answered/, 'the answers were kept');

  // solve one problem: no hints, no solution, no discussion; its checks are counted in the interview
  const title = await page.locator('.mk-problem').first().locator('span').nth(1).innerText();
  const slug = Object.keys(practiceContent.code).find((s) => title.startsWith(practiceContent.code[s].title));
  await page.locator('.mk-problem').first().getByRole('button', { name: 'Open the problem' }).click();
  await page.getByRole('button', { name: 'Run query' }).waitFor(READY);
  assert.equal(await page.getByText('Show hint 1 of').count(), 0, 'no hints in a mock');
  assert.equal(await page.getByRole('button', { name: 'Show the solution' }).count(), 0, 'no solution');
  assert.equal(await page.locator('.cp-discuss').count(), 0, 'no discussion');
  assert.ok(await page.locator('.mk-bar').count() > 0, 'the clock is still there');
  await page.locator('.ce-input').fill(practiceContent.code[slug].solution);
  await page.getByRole('button', { name: 'Run query' }).click();
  await page.getByText('All checks pass').waitFor();
  await page.getByRole('button', { name: '← Back to the interview' }).click();
  await page.locator('.mk-problem.is-solved').waitFor();

  await page.getByRole('button', { name: 'Finish the interview' }).click();
  await page.getByRole('button', { name: 'Yes, finish' }).click();
  await page.locator('.mk-result').waitFor();
  assert.match(await page.locator('.mk-facts').innerText(), new RegExp(`Coding problems: 1 of ${track.problems} solved`));
  assert.match(await page.locator('.mk-facts').innerText(), new RegExp(`Questions: \\d+ of ${track.questions} right`));
  assert.ok(await page.locator('.mk-topics li').count() > 0, 'it says how each topic went');
  const marks = await until(async () => { const m = await savedMarks(page); return Object.keys(m).some((k) => k.startsWith(`${MARKS.mock}sql/`)) ? m : null; }, 'a finished mock is saved as progress');
  assert.ok(Object.entries(marks).some(([k, v]) => k.startsWith(`${MARKS.mock}sql/`) && v === 'done'));
  assert.equal(await stored(page, KEYS.mockRun), null, 'the interview in progress is cleared');
  const history = await stored(page, KEYS.mockHistory);
  assert.equal(history.length, 1);
  assert.equal(history[0].track, 'sql');
  const review = await stored(page, KEYS.review);
  assert.ok(Object.keys(review).some((k) => k.startsWith('q:')), 'the questions that were missed are in the review queue');
  // another interview: the track shows the best so far, and the history lists this one
  await page.getByRole('button', { name: 'Take another interview' }).click();
  await page.getByRole('button', { name: 'Start the interview' }).waitFor();
  assert.match(await page.locator('.mk-track.is-on').innerText(), new RegExp(`Best so far: ${history[0].percent}%`));
  assert.match(await page.locator('.mk-history').innerText(), new RegExp(`SQL and data: ${history[0].percent}%`));
  assert.deepEqual(real(problems), []);
  await context.close();
});

test('the Practice page shows what is due for review, the level check and the mock interview, and the screens have addresses that open', async () => {
  const { context, page, goto } = await open('/practice/');
  await page.goto(`${BASE}/robots.txt`);
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEYS.review, { 'c:two-sum': { box: 0, due: '2020-01-01' }, 'c:lru-cache': { box: 0, due: '2020-01-02' } }]);
  await goto();
  await page.locator('.tl-tools').waitFor();
  assert.match(await page.locator('.tl-card.is-due').innerText(), /Review[\s\S]*2 items are due/);
  assert.match(await page.locator('.tl-tools').innerText(), /Find your level[\s\S]*Take the test/);
  assert.match(await page.locator('.tl-tools').innerText(), /Mock interview[\s\S]*Start one/);
  for (const [name, heading] of [['Start the review', 'Review'], ['Take the test', 'Find your level'], ['Start one', 'Mock interview']]) {
    await page.getByRole('button', { name }).click();
    await page.getByRole('heading', { level: 2, name: heading }).waitFor();
    await page.goto(`${BASE}/practice/`, { waitUntil: 'networkidle' });
  }
  for (const url of ['/practice/level/', '/practice/review/', '/practice/mock/', '/practice/mock/genai/', `/practice/plan/${PLAN}/`]) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 2 }).first().waitFor();
  }
  await context.close();
});

test('a reader shares their progress as a picture, and may publish a public profile that anyone can open and that they can take down', async () => {
  const { context, page, env, goto } = await open('/', { email: 'reader@example.com' });
  const modules = plan.days.flatMap((d) => d.items).filter((i) => i.kind === 'lesson').slice(0, 3).map((i) => i.ref);
  await seed(page, { ...Object.fromEntries(modules.map((m) => [m, 'done'])), [`${MARKS.code}two-sum`]: 'done' });
  await goto();
  await page.getByRole('button', { name: 'Share my progress' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const canvas = dialog.locator('canvas');
  assert.equal(await canvas.evaluate((c) => c.width), 1200, 'the picture is the size link previews use');
  assert.ok(await canvas.evaluate((c) => c.toDataURL('image/png').length) > 20000, 'something is drawn on it');
  await until(async () => (await dialog.getByLabel('Name on the card').inputValue()) !== '', 'the name of the signed-in reader is offered for the card');
  const withName = await canvas.evaluate((c) => c.toDataURL('image/png'));
  await dialog.getByLabel('Put my name on it').uncheck();
  assert.notEqual(await canvas.evaluate((c) => c.toDataURL('image/png')), withName, 'the name is on the picture only when asked for');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download the picture' }).click();
  assert.equal((await download).suggestedFilename(), 'backend-roadmap-progress.png');

  // a public profile: not before it is asked for, then at an address, with only what the card has
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM public_profiles').get().n, 0, 'nothing is public yet');
  await dialog.getByLabel('Handle').fill('Not A Handle');
  await dialog.getByRole('button', { name: 'Publish my profile' }).click();
  await dialog.getByText(/A handle is 3 to 30/).waitFor();
  await dialog.getByLabel('Handle').fill('reader-one');
  await dialog.getByLabel('Name shown').fill('Reader One');
  await dialog.getByRole('button', { name: 'Publish my profile' }).click();
  await dialog.getByText('Your profile is public:').waitFor();
  const row = env.DB.raw.prepare('SELECT handle, display_name, snapshot FROM public_profiles').get();
  assert.deepEqual([row.handle, row.display_name], ['reader-one', 'Reader One']);
  const snapshot = JSON.parse(row.snapshot);
  assert.equal(snapshot.problems, 1);
  assert.equal(snapshot.modules, modules.length);
  const link = await dialog.locator('.gm-share-profile a').getAttribute('href');
  assert.equal(link, '/#__profile%40reader-one'.replace('%40', '@'));

  // anyone, signed out, opens it
  const visitor = await open('/', { sharing: env });
  await visitor.page.goto(`${BASE}${link}`, { waitUntil: 'networkidle' });
  await visitor.page.getByRole('heading', { level: 2, name: 'Reader One' }).waitFor();
  assert.match(await visitor.page.locator('.gm-profile__stats').innerText(), /problems solved\s*1/i);
  assert.match(await visitor.page.locator('.gm-profile').innerText(), /reported by their owner/);
  await visitor.context.close();

  // and takes it down
  await dialog.getByRole('button', { name: 'Take it down' }).click();
  await dialog.getByRole('button', { name: 'Publish my profile' }).waitFor();
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM public_profiles').get().n, 0);
  const gone = await open('/', { sharing: env });
  await gone.page.goto(`${BASE}${link}`, { waitUntil: 'networkidle' });
  await gone.page.getByText(/There is no profile at that address/).waitFor();
  await gone.context.close();
  await context.close();
});

test('the command palette leads to a study plan, the mock interview, the level check and the review', async () => {
  const { context, page, goto } = await open('/');
  await goto();
  for (const [query, label, heading] of [
    ['> sql for developers', `Study plan — ${practiceContent.plans[PLAN].title}`, practiceContent.plans[PLAN].title],
    ['> mock interview', 'Mock interview', 'Mock interview'],
    ['> find your level', 'Find your level', 'Find your level'],
    ['> review what you missed', 'Review what you missed', 'Review']
  ]) {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/Search modules/).fill(query);
    await page.locator('#palList').getByText(label).first().waitFor();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { level: 2, name: heading }).waitFor();
  }
  await context.close();
});
