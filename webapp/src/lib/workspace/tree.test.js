import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP, DROP_REFUSAL, ORDER_GAP_MIN, canHold, childrenOf, descendantCount, descendantIds, dropPosition, lastOrder, moveTargets, planDrop, trail } from './tree.js';

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

// ------------------------------------------------------------------------------------------------ dragging a page
test('over a row that can hold pages, the edges are before and after and the middle is inside; a row that cannot is split in two', () => {
  const over = (at, holds) => dropPosition({ y: at, top: 100, height: 40, canHold: holds });
  assert.equal(over(102, true), DROP.before);
  assert.equal(over(120, true), DROP.inside);
  assert.equal(over(138, true), DROP.after);
  assert.equal(over(111, true), DROP.inside, 'the edge is a quarter of the row');
  assert.equal(over(105, false), DROP.before);
  assert.equal(over(125, false), DROP.after);
  assert.equal(dropPosition({ y: 5, top: 0, height: 0, canHold: true }), DROP.inside, 'a row with no height does not divide by zero');
});

test('dropping on a folder puts the page last inside it', () => {
  const plan = planDrop(pages, 'notes', 'db', DROP.inside);
  assert.equal(plan.ok, true);
  assert.equal(plan.parentId, 'db');
  assert.equal(plan.order, 3, 'after Archive, the last of the three');
  assert.equal(plan.renumber, null);
  assert.deepEqual(plan.indicator, { id: 'db', position: DROP.inside });
  assert.equal(plan.relativeTo, null);
});

test('dropping between two rows puts the page between them, in their parent', () => {
  const before = planDrop(pages, 'notes', 'deep', DROP.before);
  assert.deepEqual([before.ok, before.parentId, before.order], [true, 'db', 0.5], 'between Indexes (0) and Deep (1)');
  assert.deepEqual(before.relativeTo, { id: 'deep', position: DROP.before });
  const after = planDrop(pages, 'notes', 'arch', DROP.after);
  assert.deepEqual([after.parentId, after.order], ['db', 3], 'after the last one');
  const first = planDrop(pages, 'notes', 'idx', DROP.before);
  assert.deepEqual([first.parentId, first.order], ['db', -1], 'before the first one');
});

test('a page moved down the same list lands after the one it is dropped on, whatever its own order was', () => {
  const plan = planDrop(pages, 'db', 'notes', DROP.after);
  assert.deepEqual([plan.ok, plan.parentId, plan.order], [true, null, 1.5], 'between Notes (1) and Plan (2); Databases itself is not a neighbour');
});

test('below an open folder, "after" its row is the first place inside it', () => {
  const plan = planDrop(pages, 'notes', 'db', DROP.after, new Set(['db']));
  assert.deepEqual([plan.ok, plan.parentId, plan.order], [true, 'db', -1]);
  assert.deepEqual(plan.indicator, { id: 'idx', position: DROP.before }, 'the line is drawn where it will land');
  const shut = planDrop(pages, 'idx', 'db', DROP.after);
  assert.equal(shut.parentId, null, 'a folder that is closed shows nothing inside, so after is after');
  const alone = planDrop(pages, 'deeper', 'deep', DROP.after, new Set(['deep']));
  assert.equal(alone.parentId, 'db', 'the only page inside a folder, dropped under it, leaves the folder');
});

test('dropping on the top level puts the page last there', () => {
  const plan = planDrop(pages, 'idx', null, DROP.inside);
  assert.deepEqual([plan.ok, plan.parentId, plan.order], [true, null, 4]);
  assert.deepEqual(plan.indicator, { id: null, position: DROP.inside });
});

test('a page is not dropped on itself, a folder not into itself or anything inside it, and nothing goes inside a plan', () => {
  assert.deepEqual(planDrop(pages, 'db', 'db', DROP.inside), { ok: false, reason: DROP_REFUSAL.itself });
  assert.equal(planDrop(pages, 'db', 'deep', DROP.inside).reason, DROP_REFUSAL.ownDescendant);
  assert.equal(planDrop(pages, 'db', 'deeper', DROP.inside).reason, DROP_REFUSAL.ownDescendant);
  assert.equal(planDrop(pages, 'db', 'deeper', DROP.before).reason, DROP_REFUSAL.ownDescendant, 'between two rows inside it is inside it too');
  assert.equal(planDrop(pages, 'db', 'idx', DROP.after).reason, DROP_REFUSAL.ownDescendant);
  assert.equal(planDrop(pages, 'notes', 'plan', DROP.inside).reason, DROP_REFUSAL.notContainer);
  assert.equal(planDrop(pages, 'notes', 'missing', DROP.inside).reason, DROP_REFUSAL.unknown);
  assert.equal(planDrop(pages, 'missing', 'db', DROP.inside).reason, DROP_REFUSAL.unknown);
});

test('a drop that would leave a page where it is is not a move', () => {
  assert.equal(planDrop(pages, 'notes', 'plan', DROP.before).reason, DROP_REFUSAL.samePlace, 'already just before Plan');
  assert.equal(planDrop(pages, 'notes', 'db', DROP.after).reason, DROP_REFUSAL.samePlace, 'already just after Databases');
  assert.equal(planDrop(pages, 'arch2', null, DROP.inside).reason, DROP_REFUSAL.samePlace, 'already last at the top');
  assert.equal(planDrop(pages, 'arch', 'db', DROP.inside).reason, DROP_REFUSAL.samePlace, 'already last in Databases');
});

test('a drop into a folder is allowed exactly where "Move to…" offers the folder', () => {
  for (const [dragged, hint] of [['notes', 'a page'], ['db', 'a folder'], ['deeper', 'a page deep down']]) {
    const offered = new Set(moveTargets(pages, dragged, 'Top').map((t) => t.id));
    for (const folder of pages.filter((p) => p.kind === 'folder')) {
      const plan = planDrop(pages, dragged, folder.id, DROP.inside);
      const allowed = plan.ok || plan.reason === DROP_REFUSAL.samePlace;
      assert.equal(allowed, offered.has(folder.id), `${hint} into ${folder.title}`);
    }
  }
});

test('when two neighbours have no room between them the siblings are numbered again, the page taking its place in the line', () => {
  const crowded = [
    page('f', null, 'F', 0, 'folder'),
    page('a', 'f', 'A', 1),
    page('b', 'f', 'B', 1 + ORDER_GAP_MIN / 10),
    page('x', null, 'X', 5)
  ];
  const plan = planDrop(crowded, 'x', 'b', DROP.before);
  assert.equal(plan.ok, true);
  assert.equal(plan.parentId, 'f');
  assert.equal(plan.order, 1, 'second in line');
  assert.deepEqual(plan.renumber, [{ id: 'a', order: 0 }, { id: 'b', order: 2 }]);
  const tied = [page('f', null, 'F', 0, 'folder'), page('a', 'f', 'A', 1), page('b', 'f', 'B', 1), page('x', null, 'X', 5)];
  assert.ok(planDrop(tied, 'x', 'b', DROP.before).renumber, 'equal orders have no room either');
});

test('a plan is only a plan: the pages it was made from are not changed', () => {
  const before = JSON.stringify(pages);
  planDrop(pages, 'notes', 'db', DROP.inside);
  planDrop(pages, 'notes', 'deep', DROP.before);
  assert.equal(JSON.stringify(pages), before);
});
