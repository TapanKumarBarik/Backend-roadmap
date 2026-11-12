import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDLE, handleProblem, shareText, snapshotOf } from './profile.js';

test('a handle is 3 to 30 lower-case letters, digits and hyphens, not starting or ending with a hyphen, and not a word the site keeps', () => {
  for (const good of ['ada', 'a1b', 'ada-lovelace', 'x'.repeat(30), '007']) assert.equal(handleProblem(good), null, good);
  for (const bad of ['', 'ab', 'x'.repeat(31), 'Ada', 'ada lovelace', '-ada', 'ada-', 'a--b', 'ada_l', 'adä', null, 5, undefined]) assert.equal(handleProblem(bad), 'format', String(bad));
  for (const reserved of ['admin', 'api', 'me', 'support']) assert.equal(handleProblem(reserved), reserved.length < 3 ? 'format' : 'reserved', reserved);
  assert.equal(HANDLE.test('ada'), true);
});

const game = {
  level: { n: 4, name: 'Engineer' }, xp: 320, streak: 5, longest: 9,
  stats: { problems: 12, modules: 30, quizzes: 3, drills: 7, mocks: 1, plans: 0, tracks: 1 },
  badges: [{ id: 'first-step', earned: true }, { id: 'warming-up', earned: false }, { id: 'problem-solver', earned: true }]
};

test('a snapshot is the numbers of the game and the ids of the badges earned, and nothing else', () => {
  assert.deepEqual(snapshotOf(game), { level: 4, xp: 320, streak: 5, longest: 9, problems: 12, modules: 30, quizzes: 3, drills: 7, mocks: 1, plans: 0, badges: ['first-step', 'problem-solver'] });
});

test('the line to share says who, the level, the numbers and where', () => {
  const site = { name: 'Backend Roadmap', url: 'https://backendroadmap.com' };
  const parts = { levelName: 'Engineer', xp: 320, streak: 5, problems: 12 };
  assert.equal(shareText({ ...parts, name: '' }, site), "I'm an Engineer on Backend Roadmap: 320 XP, 5-day streak, 12 coding problems solved. https://backendroadmap.com");
  assert.ok(shareText({ ...parts, levelName: 'Senior', name: '' }, site).startsWith("I'm a Senior on Backend"), 'a before a consonant');
  assert.equal(shareText({ ...parts, name: 'Ada' }, site), 'Ada is an Engineer on Backend Roadmap: 320 XP, 5-day streak, 12 coding problems solved. https://backendroadmap.com');
});
