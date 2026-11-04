import test from 'node:test';
import assert from 'node:assert/strict';
import { homePage } from './homePage.mjs';
import { HERO, INSIDE, LIBRARY, OPEN_SOURCE, PICK, VIDEO } from '../../webapp/src/config/landing.js';

const config = {
  site: { name: 'Backend Roadmap', license: 'MIT' },
  youtube: { channel: 'https://www.youtube.com/@channel' },
  developer: { name: 'Ada & Co', email: 'ada@example.com', linkedin: 'https://www.linkedin.com/in/ada/', github: 'https://github.com/ada' }
};
const stats = {
  modules: { total: 40, written: 31, planned: 9 },
  curricula: { backend: { tracks: 2, modules: 20, written: 20 }, genai: { tracks: 1, modules: 20, written: 11 } },
  paths: [{ id: 'foundations', title: 'Backend foundations', goal: 'Follow a request from the browser to the database & back.', modules: 12, minutes: 180, tracks: 2, start: 'backend/01-a/00-x/README.md' }]
};
const tree = [
  { path: 'backend', file: 'backend/README.md', title: 'Backend', children: [{ file: 'backend/01-a/README.md' }, { file: 'backend/02-b/README.md' }] },
  { path: 'genai', file: 'genai/README.md', title: 'GenAI', children: [] }
];
const titles = { 'backend/01-a/README.md': { title: 'Requests & responses' }, 'backend/02-b/README.md': { title: 'APIs' } };
const urlOf = (file) => '/' + file.replace(/README\.md$/, '');
const videos = [
  { id: 'aaaaaaaaaaa', title: 'Older video', published: '2026-10-01T00:00:00Z', file: null, seconds: 60 },
  { id: 'bbbbbbbbbbb', title: 'Newer video', published: '2026-10-30T00:00:00Z', file: 'backend/01-a/00-x/README.md', seconds: 120 }
];
const input = { stats, videos, tree, titles, config, urlOf };

const headings = (html, tag) => [...html.matchAll(new RegExp(`<${tag}>(.*?)</${tag}>`, 'g'))].map((m) => m[1].replace(/<[^>]+>/g, ''));

test('the home page has one h1 and a headed section for everything the landing page offers', () => {
  const { body } = homePage(input);
  assert.deepEqual(headings(body, 'h1'), [`Backend Roadmap: ${HERO.headline}`]);
  assert.deepEqual(headings(body, 'h2'), [PICK.heading, LIBRARY.heading, INSIDE.heading, VIDEO.heading, OPEN_SOURCE.heading]);
  assert.match(body, new RegExp(HERO.lead(stats.modules).slice(0, 30)));
});

test('it links into the curriculum: the path, each curriculum and its tracks, and the newest video first', () => {
  const { body } = homePage(input);
  assert.match(body, /<a href="\/backend\/01-a\/00-x\/">Backend foundations<\/a>: Follow a request from the browser to the database &amp; back\./);
  assert.match(body, /<h3><a href="\/backend\/">Backend Engineering<\/a><\/h3>/);
  assert.match(body, /<a href="\/backend\/01-a\/">Requests &amp; responses<\/a>/);
  const clips = body.match(/<li><a href="[^"]+">(?:Newer|Older) video<\/a><\/li>/g);
  assert.deepEqual(clips, ['<li><a href="/backend/01-a/00-x/">Newer video</a></li>', '<li><a href="https://www.youtube.com/watch?v=aaaaaaaaaaa">Older video</a></li>']);
});

test('names and titles are escaped, and nothing is left undefined', () => {
  const { body } = homePage(input);
  assert.match(body, /Created and maintained by Ada &amp; Co\./);
  assert.doesNotMatch(body, /undefined|null|NaN/);
});

test('the description carries the real count and fits a search result', () => {
  const { description } = homePage(input);
  assert.match(description, /31 modules/);
  assert.ok(description.length <= 160, `${description.length} characters`);
});

test('a curriculum with no numbers in the stats is left out, and no videos means no video section', () => {
  const { body } = homePage({ ...input, videos: [], stats: { ...stats, curricula: { backend: stats.curricula.backend }, paths: [] } });
  assert.deepEqual(headings(body, 'h2'), [LIBRARY.heading, INSIDE.heading, OPEN_SOURCE.heading]);
  assert.deepEqual(headings(body, 'h3'), ['Backend Engineering']);
});
