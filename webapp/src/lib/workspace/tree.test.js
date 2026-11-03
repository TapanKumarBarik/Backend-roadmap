import test from 'node:test';
import assert from 'node:assert/strict';
import { canHold, childrenOf, descendantCount, descendantIds, lastOrder, moveTargets, trail } from './tree.js';

const page = (id, parentId, title, order = 0, kind = 'page') => ({ id, parentId, title, order, kind });
// Top level: Databases (folder), Notes (page), Plan (plan).
//   Databases: Indexes (page), Deep (folder: Deeper page), Archive (folder)
const pages = [
  page('db', null, 'Databases', 0, 'folder'),
  page('notes', null, 'Notes', 1),
  page('plan', null, 'Plan', 2, 'plan'),
  page('idx', 'db', 'Indexes', 0),
  page('deep', 'db', 'Deep', 1, 'folder'),
  page('deeper', 'deep', 'Deeper', 0),
  page('arch', 'db', 'Archive', 2, 'folder'),
  page('arch2', null, 'Archive', 3, 'folder')
];

test('the pages under a parent come in their order, the top level for null', () => {
  assert.deepEqual(childrenOf(pages, null).map((p) => p.id), ['db', 'notes', 'plan', 'arch2']);
  assert.deepEqual(childrenOf(pages, 'db').map((p) => p.id), ['idx', 'deep', 'arch']);
  assert.deepEqual(childrenOf(pages, 'idx'), []);
  const tied = [page('b', null, 'B', 1), page('a', null, 'A', 1)];
  assert.deepEqual(childrenOf(tied, null).map((p) => p.id), ['a', 'b'], 'equal orders: by id, so the order is stable');
});

test('a page and everything below it, at any depth', () => {
  assert.deepEqual([...descendantIds(pages, 'db')].sort(), ['arch', 'db', 'deep', 'deeper', 'idx']);
  assert.equal(descendantCount(pages, 'db'), 4);
  assert.equal(descendantCount(pages, 'notes'), 0);
});

test('a bad tree with a loop does not hang', () => {
  const loop = [page('a', 'b', 'A'), page('b', 'a', 'B')];
  assert.deepEqual([...descendantIds(loop, 'a')].sort(), ['a', 'b']);
  assert.deepEqual(trail(loop, 'a').map((p) => p.id), ['b', 'a']);
});

test('a trail runs from the top level down to the page', () => {
  assert.deepEqual(trail(pages, 'deeper').map((p) => p.title), ['Databases', 'Deep', 'Deeper']);
  assert.deepEqual(trail(pages, 'notes').map((p) => p.title), ['Notes']);
  assert.deepEqual(trail(pages, null), []);
  assert.deepEqual(trail(pages, 'missing'), []);
});

test('a page can be moved to the top level or any folder, with the whole trail to tell two "Archive" folders apart', () => {
  const targets = moveTargets(pages, 'notes', 'Top level');
  assert.deepEqual(targets.map((t) => t.label), ['Top level', 'Databases', 'Databases / Deep', 'Databases / Archive', 'Archive']);
  assert.equal(targets[0].id, null);
  assert.deepEqual(targets.map((t) => t.depth), [0, 1, 2, 2, 1]);
});

test('a folder cannot be moved into itself or into anything inside it', () => {
  const targets = moveTargets(pages, 'db', 'Top level').map((t) => t.id);
  assert.deepEqual(targets, [null, 'arch2']);
  assert.ok(!moveTargets(pages, 'deep', 'Top level').some((t) => t.id === 'deep' || t.id === 'deeper'));
});

test('pages, plans, revision lists and diagrams are never offered as places to move to', () => {
  const ids = moveTargets(pages, 'idx', 'Top level').map((t) => t.id);
  assert.ok(!ids.includes('notes') && !ids.includes('plan') && !ids.includes('idx'));
});

test('a moved page goes last among its new siblings', () => {
  assert.equal(lastOrder(pages, 'db'), 3);
  assert.equal(lastOrder(pages, null), 4);
  assert.equal(lastOrder(pages, 'idx'), 0, 'an empty parent starts at 0');
});

test('only pages and folders hold pages', () => {
  assert.deepEqual(['db', 'notes', 'plan'].map((id) => canHold(pages.find((p) => p.id === id))), [true, true, false]);
  assert.equal(canHold({ id: 'old', title: 'no kind' }), true, 'a page made before kinds existed is a page');
  assert.equal(canHold(undefined), false);
  for (const kind of ['revision', 'diagram']) assert.equal(canHold(page('x', null, 'x', 0, kind)), false);
});
