import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listingPages } from './listingPages.mjs';

const practice = JSON.parse(fs.readFileSync(new URL('../../api/generated/practice-content.json', import.meta.url), 'utf8'));
const author = { '@type': 'Person', name: 'A. Author' };
const build = (extra = {}) => listingPages({
  paths: [], videos: [], playlists: [], titles: {}, urlOf: () => null, site: 'https://example.com', siteName: 'Example', author, practice, ...extra
});

test('every quiz, exercise, interview set and design challenge has a page, and so do the two lists', () => {
  const urls = build().map((p) => p.url);
  assert.ok(urls.includes('/practice/') && urls.includes('/lab/'));
  for (const slug of Object.keys(practice.quizzes)) assert.ok(urls.includes(`/practice/quiz/${slug}/`), slug);
  for (const slug of Object.keys(practice.exercises)) assert.ok(urls.includes(`/practice/exercise/${slug}/`), slug);
  for (const slug of Object.keys(practice.interview)) assert.ok(urls.includes(`/practice/interview/${slug}/`), slug);
  for (const key of Object.keys(practice.challenges)) assert.ok(urls.includes(`/lab/${key}/`), key);
  assert.equal(new Set(urls).size, urls.length, 'no two pages share an address');
});

test('a public quiz page carries its questions but never an answer or an explanation, and a challenge never its reference solution', () => {
  const pages = new Map(build().map((p) => [p.url, p]));
  for (const [slug, quiz] of Object.entries(practice.quizzes)) {
    const page = pages.get(`/practice/quiz/${slug}/`);
    const everything = page.body + JSON.stringify(page.ld) + page.description;
    for (const q of quiz.questions) {
      assert.ok(page.body.includes(q.text.replace(/&/g, '&amp;')) || page.body.includes(q.text), `${slug}: the question is on the page`);
      assert.ok(!everything.includes(q.explanation), `${slug}: the explanation is not on the page`);
    }
  }
  for (const [key, challenge] of Object.entries(practice.challenges)) {
    const page = pages.get(`/lab/${key}/`);
    const everything = page.body + JSON.stringify(page.ld);
    const probe = challenge.reference.split('\n').map((l) => l.trim()).filter((l) => l.length > 40)[0];
    assert.ok(!everything.includes(probe), `${key}: the reference solution is not on the page`);
  }
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
