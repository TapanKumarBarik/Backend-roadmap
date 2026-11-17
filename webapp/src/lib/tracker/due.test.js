import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKER as C } from '../../config/tracker.js';
import { dueCount, tabOfId } from './due.js';

test('a row\'s sheet is told from its id', () => {
  assert.equal(tabOfId('SD-U-316', C), 'sd');
  assert.equal(tabOfId('GAI-GF-001', C), 'gai');
  assert.equal(tabOfId('Q-GAI-GF-001', C), 'qa', 'a question is not a GenAI item, though it has GAI in it');
  assert.equal(tabOfId('PR-04', C), 'pr');
  assert.equal(tabOfId('XX-1', C), null);
  assert.equal(tabOfId(undefined, C), null);
});

test('the rows that are due are counted from the saved copy alone: called back by their status, or past the day their confidence earned', () => {
  const items = {
    'SD-A-001': { s: 'Needs Revision' }, // called back
    'SD-A-002': { s: 'Completed', c: 1, d: '2026-11-15' }, // confidence 1: back after 1 day, so due on the 16th
    'SD-A-003': { s: 'Completed', c: 5, d: '2026-11-15' }, // confidence 5: back after 30 days
    'GAI-GF-001': { s: 'In Progress', c: 2, d: '2026-11-10' }, // 3 days: due on the 13th
    'Q-GAI-GF-001': { s: 'Needs Practice' }, // a question called back
    'Q-GAI-GF-002': { s: 'Reviewed' }, // nothing to come back to
    'PR-01': { p: '2222222', c: 1, d: '2026-01-01' } // a design problem: not counted here
  };
  assert.equal(dueCount(items, '2026-11-17', C), 4);
  assert.equal(dueCount(items, '2026-11-15', C), 3, 'a day earlier the confidence 1 row is not due yet');
  assert.equal(dueCount({}, '2026-11-17', C), 0);
});

test('anything that is not a saved row is not counted, and nothing saved is zero', () => {
  assert.equal(dueCount(null, '2026-11-17', C), 0);
  assert.equal(dueCount(undefined, '2026-11-17', C), 0);
  assert.equal(dueCount([], '2026-11-17', C), 0);
  assert.equal(dueCount({ 'SD-A-001': { s: 'Finished' }, 'SD-A-002': 'text', 'SD-A-003': null, 'ZZ-1': { s: 'Needs Revision' } }, '2026-11-17', C), 0);
});
