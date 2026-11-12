import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listingPages } from './listingPages.mjs';
import { escapeHtml } from '../../webapp/src/lib/markdown/escapeHtml.js';
import { isCase, testParts } from '../../webapp/src/lib/practice/validate.js';

const practice = JSON.parse(fs.readFileSync(new URL('../../api/generated/practice-content.json', import.meta.url), 'utf8'));
const author = { '@type': 'Person', name: 'A. Author' };
const build = (extra = {}) => listingPages({
  paths: [], videos: [], playlists: [], titles: {}, urlOf: () => null, site: 'https://example.com', siteName: 'Example', author, practice, ...extra
});

test('every quiz, exercise, interview set and coding problem has a page, and so does the list', () => {
  const urls = build().map((p) => p.url);
  assert.ok(urls.includes('/practice/'));
  assert.ok(!urls.some((u) => u.startsWith('/design-lab/')), 'the Design Lab is gone');
  for (const slug of Object.keys(practice.quizzes)) assert.ok(urls.includes(`/practice/quiz/${slug}/`), slug);
  for (const slug of Object.keys(practice.exercises)) assert.ok(urls.includes(`/practice/exercise/${slug}/`), slug);
  for (const slug of Object.keys(practice.interview)) assert.ok(urls.includes(`/practice/interview/${slug}/`), slug);
  for (const slug of Object.keys(practice.code)) assert.ok(urls.includes(`/practice/code/${slug}/`), slug);
  assert.equal(new Set(urls).size, urls.length, 'no two pages share an address');
});

test("today's drill has an address that opens, and is kept out of search results and out of the list of what to index", () => {
  const drill = build().find((p) => p.url === '/practice/drill/');
  assert.ok(drill, 'the drill has a page');
  assert.equal(drill.noindex, true);
  assert.ok(build().filter((p) => p.url !== '/practice/drill/').every((p) => !p.noindex), 'every other page is indexed');
});

test('a coding problem page has the statement and the starting code, and never the solution, the tests or the explanation', () => {
  const pages = new Map(build().map((p) => [p.url, p]));
  for (const [slug, problem] of Object.entries(practice.code)) {
    const page = pages.get(`/practice/code/${slug}/`);
    const everything = page.body + JSON.stringify(page.ld) + page.description;
    assert.ok(page.body.includes(escapeHtml(problem.starter.split('\n')[0])), `${slug}: the starting code is on the page`);
    assert.equal(page.title, `${problem.title}: Python practice problem`);
    // the most telling line of the solution that the starting code does not already have
    const probe = problem.solution.split('\n').map((l) => l.trim()).filter((l) => l.length > 12 && !problem.starter.includes(l)).sort((a, b) => b.length - a.length)[0];
    assert.ok(!probe || !everything.includes(escapeHtml(probe)), `${slug}: the solution is not on the page ("${probe}")`);
    assert.ok(!everything.includes(problem.explanation), `${slug}: the explanation is not on the page`);
    // the checks themselves (the asserts); a line of set-up such as `q.push(3)` may well be in an example of the statement too
    assert.ok(problem.tests.filter(isCase).every((t) => !everything.includes(testParts(t).code)), `${slug}: the tests are not on the page`);
    assert.equal(page.ld['@graph'][0]['@type'], 'LearningResource');
  }
  const index = pages.get('/practice/');
  for (const slug of Object.keys(practice.code)) assert.ok(index.body.includes(`/practice/code/${slug}/`), `${slug}: the list links to it`);
});

test('a public quiz page carries its questions but never an answer or an explanation', () => {
  const pages = new Map(build().map((p) => [p.url, p]));
  for (const [slug, quiz] of Object.entries(practice.quizzes)) {
    const page = pages.get(`/practice/quiz/${slug}/`);
    const everything = page.body + JSON.stringify(page.ld) + page.description;
    for (const q of quiz.questions) {
      assert.ok(page.body.includes(escapeHtml(q.text)), `${slug}: the question is on the page`);
      assert.ok(!everything.includes(q.explanation), `${slug}: the explanation is not on the page`);
    }
  }
});

test('a set of coding questions is titled for what people search, and every one of its answers is on the page', () => {
  const [slug, set] = Object.entries(practice.interview).find(([, s]) => s.section === 'coding');
  const page = build().find((p) => p.url === `/practice/interview/${slug}/`);
  assert.equal(page.title, `${set.title}: coding interview questions`);
  assert.equal(page.ld['@graph'][0].mainEntity.length, set.questions.length);
  assert.match(page.body, /<pre>/, 'the worked solutions have code');
});

test('an interview set is a FAQ page: its model answers are there to be read', () => {
  const [slug, set] = Object.entries(practice.interview)[0];
  const page = build().find((p) => p.url === `/practice/interview/${slug}/`);
  assert.equal(page.ld['@graph'][0]['@type'], 'FAQPage');
  assert.equal(page.ld['@graph'][0].mainEntity.length, set.questions.length);
});

test('without practice content there are no practice pages', () => {
  assert.deepEqual(build({ practice: null }), []);
});
