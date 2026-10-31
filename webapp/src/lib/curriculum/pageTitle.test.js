import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageTitles, TITLE_MAX_LENGTH } from './pageTitle.js';

const page = (dir, title, children = []) => ({ name: dir.split('/').pop(), path: dir, file: `${dir}/README.md`, title, children });

const tree = [
  page('backend', 'Backend Engineering: Fundamentals → Distributed Systems → System Design', [
    page('backend/01-auth', '01 - Authentication and Authorization', [
      page('backend/01-auth/00-fundamentals', 'Module 00: Auth Fundamentals'),
      page('backend/01-auth/08-capstone-project', 'Module 08: Capstone Project')
    ]),
    page('backend/02-testing', '02 - Testing and Code Quality', [
      page('backend/02-testing/00-the-pyramid', 'Module 00: The Testing Pyramid'),
      page('backend/02-testing/08-capstone-project', 'Module 08: Capstone Project')
    ]),
    page('backend/09-security', '09 - Security Deep Dive')
  ]),
  page('learn', 'Learn: Linux → Docker → Kubernetes', [
    page('learn/11-security', 'Track 11: Security Deep Dive', [
      page('learn/11-security/07-capstone-project', '07 - Capstone Project')
    ]),
    page('learn/03-docker', 'Track 3: Docker With `docker compose` and **friends**')
  ])
];
const titles = buildPageTitles(tree, 'Backend Roadmap');
const t = (dir) => titles[`${dir}/README.md`];

test('a page opens with its topic, not its number', () => {
  assert.equal(t('backend/01-auth/00-fundamentals').title, 'Auth Fundamentals');
  assert.equal(t('backend/01-auth').title, 'Authentication and Authorization');
  assert.equal(t('learn/11-security/07-capstone-project').title.startsWith('Capstone Project'), true);
});

test('a lesson of a lecture course is named without its number too', () => {
  const lectures = buildPageTitles([
    page('system-design', 'System Design Interview Prep: From Requirements to Distributed Systems', [
      page('system-design/01-core', 'Track 01: Core Fundamentals', [page('system-design/01-core/08-latency', 'Lesson 08: Latency')])
    ])
  ], 'Backend Roadmap');
  assert.equal(lectures['system-design/01-core/08-latency/README.md'].title, 'Latency');
});

test('no two pages share a title', () => {
  const all = Object.values(titles).map((x) => x.title.toLowerCase());
  assert.equal(new Set(all).size, all.length);
});

test('a topic that is not unique is qualified by where it lives, nearest place first', () => {
  assert.equal(t('backend/01-auth/08-capstone-project').title, 'Capstone Project — Authentication and Authorization');
  assert.equal(t('backend/02-testing/08-capstone-project').title, 'Capstone Project — Testing and Code Quality');
});

test('the same track name in two curricula is told apart by the curriculum', () => {
  assert.equal(t('backend/09-security').title, 'Security Deep Dive — Backend Engineering');
  assert.equal(t('learn/11-security').title, 'Security Deep Dive — Learn');
});

test('the site name follows the title only when the whole thing fits', () => {
  assert.equal(t('backend/01-auth/00-fundamentals').full, 'Auth Fundamentals · Backend Roadmap');
  const long = buildPageTitles([page('x', 'A title that is long enough to leave no room for the brand')], 'Backend Roadmap');
  assert.equal(long['x/README.md'].full, 'A title that is long enough to leave no room for the brand');
  for (const { full } of Object.values(titles)) assert.ok(full.length <= TITLE_MAX_LENGTH || !full.endsWith('Backend Roadmap'));
});

test('inline markdown in a heading does not leak into the title', () => {
  assert.equal(t('learn/03-docker').title, 'Docker With docker compose and friends');
});

test('a curriculum keeps its whole title', () => {
  assert.equal(t('backend').title, 'Backend Engineering: Fundamentals → Distributed Systems → System Design');
});
