import test from 'node:test';
import assert from 'node:assert/strict';
import { dropDraft, findDraft, keepDraft } from './recovery.js';

// localStorage's shape, in memory.
const memory = () => {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => { items.set(k, String(v)); }, removeItem: (k) => { items.delete(k); }, items };
};
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

test('what was written and not saved is offered back when it is newer than the server\'s version', () => {
  const store = memory();
  assert.equal(keepDraft(store, 'draft-1', { title: 'T', subtitle: '', content: doc('words') }, new Date('2026-11-02T10:05:00Z')), true);
  const found = findDraft(store, 'draft-1', '2026-11-02T10:00:00.000Z');
  assert.equal(found.title, 'T');
  assert.deepEqual(found.content, doc('words'));
  assert.equal(found.at, '2026-11-02T10:05:00.000Z');
  assert.ok(store.items.has('draft-1'), 'it stays until it is dropped');
});

test('a copy the server has already caught up with is not offered, and is removed', () => {
  const store = memory();
  keepDraft(store, 'draft-1', { title: 'T', subtitle: '', content: doc('words') }, new Date('2026-11-02T10:05:00Z'));
  assert.equal(findDraft(store, 'draft-1', '2026-11-02T10:06:00.000Z'), null);
  assert.equal(store.items.has('draft-1'), false);
});

test('nothing kept, a broken copy and a copy without a document all mean "nothing to offer"', () => {
  const store = memory();
  assert.equal(findDraft(store, 'none', '2026-11-02T10:00:00.000Z'), null);
  store.setItem('broken', '{not json');
  assert.equal(findDraft(store, 'broken', '2026-11-02T10:00:00.000Z'), null);
  store.setItem('empty', JSON.stringify({ at: '2030-01-01T00:00:00.000Z', title: 'x' }));
  assert.equal(findDraft(store, 'empty', '2026-11-02T10:00:00.000Z'), null);
});

test('dropping forgets the copy', () => {
  const store = memory();
  keepDraft(store, 'draft-1', { title: 'T', subtitle: '', content: doc('words') });
  dropDraft(store, 'draft-1');
  assert.equal(store.items.has('draft-1'), false);
  dropDraft(store, 'never-kept'); // no harm
});

test('a store that is full, blocked or not there is not an error, and a very large draft is not kept', () => {
  const full = { setItem() { throw new Error('QuotaExceededError'); }, getItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
  assert.equal(keepDraft(full, 'k', { title: 'T', subtitle: '', content: doc('x') }), false);
  assert.equal(findDraft(full, 'k', '2026-11-02T10:00:00.000Z'), null);
  assert.doesNotThrow(() => dropDraft(full, 'k'));
  assert.equal(keepDraft(memory(), 'k', { title: 'T', subtitle: '', content: doc('x'.repeat(1_100_000)) }), false);
});
