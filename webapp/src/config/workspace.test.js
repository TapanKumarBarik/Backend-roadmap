import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../lib/workspace/kinds.js';
import { DELETE, KIND_LABEL, NEW_MENU, NEW_TITLE, PRIVATE, REVISION, REVISION_COPY, PLAN } from './workspace.js';

test('every kind of page has a name, a first title, a place in the Add menu, a delete warning and a sentence about being private', () => {
  for (const kind of KINDS) {
    assert.ok(KIND_LABEL[kind], `${kind}: name`);
    assert.ok(NEW_TITLE[kind], `${kind}: first title`);
    assert.ok(NEW_MENU.item[kind], `${kind}: menu item`);
    assert.ok(PRIVATE.byKind[kind], `${kind}: private note`);
    assert.match(DELETE.body(kind, 0), /cannot be undone/, `${kind}: delete warning`);
  }
  assert.match(PRIVATE.label, /^Private: only you can see this\.$/);
});

test('the Add menu offers each kind that is not a plain page once', () => {
  assert.deepEqual([...NEW_MENU.kinds].sort(), KINDS.filter((k) => k !== 'page').sort());
});

test('deleting something with pages inside says how many, in the right number', () => {
  assert.match(DELETE.body('folder', 1), /1 page inside it is deleted too/);
  assert.match(DELETE.body('folder', 4), /4 pages inside it are deleted too/);
  assert.doesNotMatch(DELETE.body('folder', 0), /inside it/);
});

test('revision gaps are whole days that only grow', () => {
  assert.ok(REVISION.intervalsDays.length >= 3);
  assert.ok(REVISION.intervalsDays.every((d, i) => Number.isInteger(d) && d >= 1 && (i === 0 || d > REVISION.intervalsDays[i - 1])));
});

test('when something is due is said in words, whatever the colour', () => {
  assert.equal(REVISION_COPY.state.overdue(1), '1 day overdue');
  assert.equal(REVISION_COPY.state.overdue(3), '3 days overdue');
  assert.equal(REVISION_COPY.state.today(), 'Due today');
  assert.equal(REVISION_COPY.state.later(2), 'Due in 2 days');
  assert.equal(REVISION_COPY.lastRevised(0, new Date()), 'Last revised today');
  assert.equal(REVISION_COPY.lastRevised(1, new Date()), 'Last revised yesterday');
});

test('the plan says what its target date means', () => {
  assert.match(PLAN.pace({ daysLeft: 14, remaining: 6, perWeek: 3, late: false }), /14 days left.*3 a week/);
  assert.match(PLAN.pace({ daysLeft: -2, remaining: 6, perWeek: null, late: true }), /has passed/);
  assert.match(PLAN.pace({ daysLeft: 0, remaining: 2, perWeek: 2, late: false }), /today/);
  assert.match(PLAN.pace({ daysLeft: 5, remaining: 0, perWeek: null, late: false }), /Nothing left/);
});
