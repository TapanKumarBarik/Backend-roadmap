import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listingPages } from './listingPages.mjs';
import { escapeHtml } from '../../webapp/src/lib/markdown/escapeHtml.js';

const practice = JSON.parse(fs.readFileSync(new URL('../../api/generated/practice-content.json', import.meta.url), 'utf8'));
const author = { '@type': 'Person', name: 'A. Author' };
const build = (extra = {}) => listingPages({
  paths: [], videos: [], playlists: [], titles: {}, urlOf: () => null, site: 'https://example.com', siteName: 'Example', author, practice, ...extra
});

test('every quiz, exercise and interview set has a page, and so does the list', () => {
  const urls = build().map((p) => p.url);
  assert.ok(urls.includes('/practice/'));
  assert.ok(!urls.some((u) => u.startsWith('/design-lab/')), 'the Design Lab is gone');
  for (const slug of Object.keys(practice.quizzes)) assert.ok(urls.includes(`/practice/quiz/${slug}/`), slug);
  for (const slug of Object.keys(practice.exercises)) assert.ok(urls.includes(`/practice/exercise/${slug}/`), slug);
  for (const slug of Object.keys(practice.interview)) assert.ok(urls.includes(`/practice/interview/${slug}/`), slug);
  assert.equal(new Set(urls).size, urls.length, 'no two pages share an address');
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
