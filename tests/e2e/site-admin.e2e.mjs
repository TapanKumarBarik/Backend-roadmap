// The admin's Site section in a real browser: the learning paths, the video lectures and the search titles are files in git, and an admin
// edits them here. The API behind the page is the real one, answering inside the test process (support.mjs), so GitHub (where the files are
// read and committed) and the site's own list of modules (docs-index.json, which the API reads from the site's address to check a folder or
// a module exists) are answered by this test: the files come from content/, and the commits are recorded, never sent.
//
// Same setup as practice.e2e.mjs: a built site being served (`npm run build && npm run preview`) and a browser.

import test, { before, after } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, answerApiInProcess, launchBrowser, openPage } from './support.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

const content = (name) => fs.readFileSync(new URL(`../../content/${name}`, import.meta.url), 'utf8');
const index = JSON.parse(fs.readFileSync(new URL('../../dist/docs-index.json', import.meta.url), 'utf8'));

/** The site on `url`, signed in as `email`. */
async function open(url, { email = OWNER_EMAIL, ...options } = {}) {
  const opened = await openPage(browser, url, options);
  const env = await answerApiInProcess(opened.context, { email });
  return { ...opened, env };
}

/** Waits until the repository (the mock) has been committed to `n` times: a message from an earlier save may still be on the screen. */
async function commitsReach(repo, n) {
  for (let i = 0; i < 100 && repo.commits().length < n; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(repo.commits().length, n);
}

/**
 * Stands in for GitHub and for the site's module list while the API runs in this process. `files` are the files "in the repository"
 * (by their path under content/); a file not listed answers 404. Every request to GitHub is recorded in `github`, and a commit is
 * answered with a new sha. `state.conflicts` is how many commits GitHub refuses next, as it does when the file changed meanwhile.
 */
function mockRepository(files) {
  const realFetch = globalThis.fetch;
  const github = [];
  const state = { conflicts: 0 };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    // The list the build wrote, not a request to the preview (Node's fetch can fail to reach "localhost" where only one of its two addresses is served).
    if (url === 'http://localhost/docs-index.json') return Response.json(index);
    if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
    const method = init.method || 'GET';
    const file = decodeURIComponent(/\/contents\/content\/([^?]+)/.exec(url)[1]);
    const body = init.body ? JSON.parse(init.body) : null;
    github.push({ method, file, body, text: body ? Buffer.from(body.content, 'base64').toString() : null });
    if (method === 'PUT') {
      if (state.conflicts > 0) { state.conflicts -= 1; return new Response('{"message":"does not match"}', { status: 409 }); }
      return Response.json({ content: { sha: `sha-${github.length}` }, commit: { sha: 'commit-1' } });
    }
    if (!(file in files)) return new Response('{"message":"Not Found"}', { status: 404 });
    return Response.json({ content: Buffer.from(files[file]).toString('base64'), sha: 'sha-read' });
  };
  return { github, state, commits: () => github.filter((call) => call.method === 'PUT'), restore: () => { globalThis.fetch = realFetch; } };
}

/** The admin's Site section, on one of its tabs. */
async function openSite(page, tab) {
  await page.waitForSelector('.admin-dashboard');
  await page.locator('.admin-dashboard .page-tabs button', { hasText: /^Site/ }).click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}

/** Every control in the admin that a screen reader could not name. */
const unnamed = (page) => page.evaluate(() => [...document.querySelectorAll('.admin-dashboard input, .admin-dashboard select, .admin-dashboard textarea, .admin-dashboard button')]
  .filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length) || (el.textContent || '').trim()))
  .map((el) => el.outerHTML.slice(0, 100)));

test('the Site section has Paths, Videos and SEO, and a reader who is not an admin is refused by the server', async () => {
  const repo = mockRepository({});
  const { context, page, goto } = await open('/#__admin');
  try {
    await goto();
    await openSite(page, 'Paths');
    assert.deepEqual((await page.getByRole('tablist', { name: 'Which part of the site' }).getByRole('tab').allTextContents()).map((t) => t.trim()), ['Paths', 'Videos', 'SEO']);
  } finally { repo.restore(); await context.close(); }

  const reader = await open('/#__admin', { email: 'reader@example.com' });
  try {
    await reader.goto();
    const refused = await reader.page.evaluate(async () => (await fetch('/api/manage/content?path=paths.json')).status);
    assert.equal(refused, 403, 'the server decides, not the screen');
  } finally { await reader.context.close(); }
});

test('the admin edits a learning path: steps come from the real folders, a bad one is named, the order changes, and what is committed is the whole file', async () => {
  const repo = mockRepository({ 'paths.json': content('paths.json') });
  const { context, page, problems, goto } = await open('/#__admin');
  try {
    await goto();
    await openSite(page, 'Paths');
    const title = page.getByLabel('Title', { exact: true });
    await title.waitFor();
    const first = JSON.parse(content('paths.json')).paths[0]; // the editor opens on the first path of the file
    assert.equal(await title.inputValue(), first.title);
    assert.equal(await page.getByLabel('Step 1', { exact: true }).inputValue(), first.steps[0]);
    await page.locator('.sa-list .sa-hint', { hasText: /\d+ modules?/ }).first().waitFor();
    assert.deepEqual(await unnamed(page), []);

    // A folder that is not on the site is flagged as it is typed, and the server names it when the file is checked.
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel('Step 5', { exact: true }).fill('backend/09-missing');
    await page.getByText(/Not found on the site as deployed/).waitFor();
    await page.getByRole('button', { name: 'Check it' }).click();
    await page.getByRole('alert').getByText(/step "backend\/09-missing" is not a folder/).waitFor();

    // A real folder, moved up one place.
    await page.getByLabel('Step 5', { exact: true }).fill('backend/05-caching-and-performance');
    await page.getByRole('button', { name: 'Move step 5 up' }).click();
    assert.equal(await page.getByLabel('Step 4', { exact: true }).inputValue(), 'backend/05-caching-and-performance');
    assert.equal(await page.getByLabel('Step 5', { exact: true }).inputValue(), 'backend/04-databases-and-data-layer');
    await page.getByLabel('Goal', { exact: true }).fill('Follow a request from the browser to the database and back.');

    // A new path, filled in from empty.
    await page.getByRole('button', { name: 'Add a path' }).click();
    await page.getByLabel('Title', { exact: true }).fill('A path made in the browser');
    await page.getByLabel('Id', { exact: true }).fill('browser-made');
    await page.getByLabel('Topic (the small label above the title)').fill('Testing');
    await page.getByLabel('Goal', { exact: true }).fill('Check that the editor can add a path.');
    await page.getByLabel('Who it is for').fill('Whoever runs the tests.');
    await page.getByLabel('Prerequisite 1', { exact: true }).fill('A browser');
    await page.getByLabel('Skill 1', { exact: true }).fill('Editing');
    await page.getByLabel('Step 1', { exact: true }).fill('lld');
    await page.getByRole('button', { name: 'Check it' }).click();
    await page.getByText('No problems found').waitFor();

    await page.getByRole('button', { name: 'Save to the repository' }).click();
    await page.getByText(/Saved\. The site will be rebuilt/).waitFor();
    const [commit] = repo.commits();
    assert.equal(commit.file, 'paths.json');
    assert.equal(commit.body.sha, 'sha-read', 'committed against the version that was read');
    const saved = JSON.parse(commit.text);
    assert.equal(saved.paths.length, JSON.parse(content('paths.json')).paths.length + 1);
    assert.deepEqual(saved.paths[0].steps.slice(2), ['backend/03-authentication-and-authorization', 'backend/05-caching-and-performance', 'backend/04-databases-and-data-layer']);
    assert.equal(saved.paths.at(-1).id, 'browser-made');
    assert.ok(saved._about, 'the note at the top of the file is kept');
    assert.equal(commit.text.endsWith('}\n'), true);

    // Removing a path asks first, and saving without a path that was published says which addresses stop working.
    await page.getByRole('button', { name: /A path made in the browser/ }).click();
    await page.getByRole('button', { name: 'Remove this path' }).click();
    await page.getByRole('dialog').getByText('Remove A path made in the browser?').waitFor();
    await page.getByRole('button', { name: 'Remove it' }).click();
    await page.getByRole('button', { name: 'Save to the repository' }).click();
    await page.getByRole('dialog').getByText(/\/paths\/browser-made\/ will no longer exist/).waitFor();
    await page.getByRole('button', { name: 'Save anyway' }).click();
    await page.getByText(/Saved\. The site will be rebuilt/).first().waitFor();
    await commitsReach(repo, 2);
    assert.notEqual(repo.commits()[1].body.sha, 'sha-read', 'the second commit is made against the first');
    assert.equal(JSON.parse(repo.commits()[1].text).paths.length, saved.paths.length - 1);
    assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), []);
  } finally { repo.restore(); await context.close(); }
});

test('the admin gives videos their modules: search, filter, a flag for those with none, a module that is not on the site is refused, and a conflict asks for a reload', async () => {
  const repo = mockRepository({ 'videos.json': content('videos.json') });
  const registry = JSON.parse(content('videos.json'));
  const [first, second] = registry.videos;
  const { context, page, problems, goto } = await open('/#__admin');
  try {
    await goto();
    await openSite(page, 'Videos');
    await page.getByText('Playlists', { exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Remove playlist phase-1' }).isDisabled(), 'a playlist with videos cannot be removed');
    await page.getByText(`${registry.videos.length} of ${registry.videos.length} videos`).waitFor();
    assert.equal(await page.locator('.sa-videos tbody tr').count(), 40, 'the first page of rows; the rest is behind Show more');

    const search = page.getByLabel('Search the videos');
    await search.fill(first.title.slice(0, 20));
    await page.getByText(`1 of ${registry.videos.length} videos`).waitFor();
    const module = page.getByLabel(`Module of ${first.title}`);
    assert.equal(await module.inputValue(), first.module);
    assert.deepEqual(await unnamed(page), []);

    // No module yet: flagged in words, and the filter finds it.
    await module.fill('');
    await page.getByText('No module yet', { exact: true }).waitFor();
    await search.fill('');
    await page.getByRole('button', { name: 'No module yet (1)' }).click();
    await page.getByText(`1 of ${registry.videos.length} videos`).waitFor();
    await page.getByRole('button', { name: 'No module yet (1)' }).click(); // off again, so the row stays once it has a module
    await search.fill(first.title.slice(0, 20));

    // A module the site does not have is flagged, and the server says which video it is on.
    await module.fill('backend/zzz');
    await page.getByText('Not on the site as deployed').waitFor();
    await page.getByRole('button', { name: 'Check it' }).click();
    await page.getByRole('alert').getByText(/there is no module at content\/backend\/zzz\/README\.md/).waitFor();

    // A real one, picked from the same list, and a playlist added beside it.
    await module.fill(second.module);
    await page.getByText(/^Opens /).waitFor();
    await page.getByText('Changed', { exact: true }).waitFor();
    await page.getByLabel('Id (for example phase-4)').fill('added-in-test'); // an id no real playlist has or will have
    await page.getByLabel('Title', { exact: true }).fill('Added in the browser');
    await page.getByLabel(/^Address \(https/).fill('https://www.youtube.com/playlist?list=PLe2eTest123');
    await page.getByRole('button', { name: 'Add playlist' }).click();
    await page.getByRole('button', { name: 'Save to the repository' }).click();
    await page.getByText(/Saved\. The site will be rebuilt/).waitFor();
    const saved = JSON.parse(repo.commits()[0].text);
    assert.equal(saved.videos[0].module, second.module);
    assert.equal(saved.videos.length, registry.videos.length);
    assert.deepEqual(saved.playlists.map((p) => p.id), [...registry.playlists.map((p) => p.id), 'added-in-test']);

    // A playlist with no videos can be removed, after a question.
    await page.getByRole('button', { name: 'Remove playlist added-in-test' }).click();
    await page.getByRole('dialog').getByText('Remove Added in the browser?').waitFor();
    await page.getByRole('button', { name: 'Remove it' }).click();
    assert.equal(await page.getByRole('button', { name: 'Remove playlist added-in-test' }).count(), 0);

    // Someone else saved it first: GitHub refuses, the screen says so, and a reload brings their version back.
    await module.fill(first.module);
    repo.state.conflicts = 1;
    await page.getByRole('button', { name: 'Save to the repository' }).click();
    await page.getByText('Someone saved this file after you opened it.').waitFor();
    await page.getByRole('button', { name: 'Reload the file' }).click();
    await page.getByText('Someone saved this file after you opened it.').waitFor({ state: 'detached' });
    // The mock repository answers with the file as it was first read, so reloading brings back that version (after the fetch: not at once).
    const field = page.getByLabel(`Module of ${first.title}`);
    for (let i = 0; i < 100 && (await field.inputValue()) !== first.module; i++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(await field.inputValue(), first.module, 'the file is the one in the repository again');
    assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), []);
  } finally { repo.restore(); await context.close(); }
});

test('the admin writes a search title and description for a module: the generated ones are shown, the limits are counted, and it is committed to a new seo.json', async () => {
  const repo = mockRepository({}); // seo.json is not in the repository yet
  const file = 'backend/04-databases-and-data-layer/03-schema-design-and-indexing/README.md';
  const node = (function find(nodes) { for (const n of nodes) { if (n.file === file) return n; const hit = find(n.children || []); if (hit) return hit; } return null; })(index.tree);
  const { context, page, problems, goto } = await open('/#__admin');
  try {
    await goto();
    await openSite(page, 'SEO');
    await page.getByText('No page has its own yet.').waitFor();
    await page.getByLabel('Find a module').fill('data-layer/03-schema-design');
    await page.getByRole('button', { name: `Choose ${node.title}` }).click();
    await page.getByText('Title now (generated)').waitFor();
    await page.locator('.sa-generated dd').nth(1).filter({ hasText: /\w/ }).waitFor();
    assert.equal(await page.getByText('Not known until the site has been built').count(), 0, 'the build writes the generated descriptions');
    assert.deepEqual(await unnamed(page), []);

    const title = page.getByLabel('Title for this page');
    const description = page.getByLabel('Description for this page');
    await title.fill('x'.repeat(75));
    await page.getByText(/75 of 70 characters: too long/).waitFor();
    await description.fill('Too short.');
    await page.getByText(/10 characters: too short, at least 50/).waitFor();
    await page.getByRole('button', { name: 'Check it' }).click();
    await page.getByRole('alert').getByText(/the title is 75 characters/).waitFor();

    const goodTitle = 'Schema design and indexing, explained for backend engineers';
    const goodDescription = 'How to design a schema and choose indexes for the queries you really run, with the trade-offs of each choice in practice.';
    await title.fill(goodTitle);
    await description.fill(goodDescription);
    await page.getByText(`${goodTitle.length} of 70 characters`).waitFor();
    assert.equal(await page.locator('.sa-serp__title').textContent(), goodTitle, 'the preview shows what was typed');
    assert.equal(await page.locator('.sa-serp__desc').textContent(), goodDescription);
    await page.getByRole('button', { name: 'Save to the repository' }).click();
    await page.getByText(/Saved\. The site will be rebuilt/).waitFor();
    const [commit] = repo.commits();
    assert.equal(commit.file, 'seo.json');
    assert.equal('sha' in commit.body, false, 'a new file has no sha');
    assert.deepEqual(JSON.parse(commit.text), { [file]: { title: goodTitle, description: goodDescription } });
    await page.getByRole('table').getByText(goodTitle).waitFor();

    // Taking it away asks first, and the next save carries the version the first one made.
    await page.getByRole('button', { name: `Remove the title and description of ${node.title}` }).click();
    await page.getByRole('dialog').getByText(`Remove the title and description for ${node.title}?`).waitFor();
    await page.getByRole('button', { name: 'Remove them' }).click();
    await page.getByText('No page has its own yet.').waitFor();
    await page.getByRole('button', { name: 'Save to the repository' }).click();
    await page.getByText(/Saved\. The site will be rebuilt/).first().waitFor();
    await commitsReach(repo, 2);
    assert.ok(repo.commits()[1].body.sha, 'now it is an existing file');
    assert.deepEqual(JSON.parse(repo.commits()[1].text), {});
    assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), []);
  } finally { repo.restore(); await context.close(); }
});
