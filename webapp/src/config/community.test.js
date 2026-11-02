import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMUNITY, communityTab } from './community.js';

test('every tab has its own id, label and address, and an address is a hash screen', () => {
  for (const key of ['id', 'route', 'label']) {
    const values = COMMUNITY.tabs.map((tab) => tab[key]);
    assert.equal(new Set(values).size, values.length, `${key} is unique`);
    assert.ok(values.every((v) => typeof v === 'string' && v.length > 0), `${key} is never empty`);
  }
  assert.ok(COMMUNITY.tabs.every((tab) => tab.route.startsWith('__')), 'a hash screen starts with __');
});

test('the addresses the screens had before the tabs still lead to a tab', () => {
  assert.equal(communityTab('__community').id, 'questions');
  assert.equal(communityTab('__feed').id, 'posts');
  assert.equal(communityTab('__books').id, 'resources');
  assert.equal(communityTab('__suggestions').id, 'ideas');
});

test('any other screen is not a tab', () => {
  assert.equal(communityTab('__admin'), null);
  assert.equal(communityTab(null), null);
  assert.equal(communityTab('some/module.md'), null);
});

test('the palette can find a tab by the name it had before', () => {
  const words = (id) => COMMUNITY.tabs.find((tab) => tab.id === id).words;
  assert.match(words('posts'), /\bfeed\b/);
  assert.match(words('resources'), /\bbooks\b/);
  assert.match(words('ideas'), /\bsuggestions\b/);
});
