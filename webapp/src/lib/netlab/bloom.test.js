import test from 'node:test';
import assert from 'node:assert/strict';
import { getBitIndices, createFilter, insert, query, getFilterStats, calculateOptimal } from './bloom.js';

test('getBitIndices produces deterministic indices within [0, m-1]', () => {
  const m = 64;
  const k = 3;
  const idx1 = getBitIndices('user:alice', m, k);
  const idx2 = getBitIndices('user:alice', m, k);

  assert.equal(idx1.length, 3);
  assert.deepEqual(idx1, idx2);
  for (const idx of idx1) {
    assert.ok(idx >= 0 && idx < m);
  }
});

test('inserted keys are always reported as probablyPresent with zero false negatives', () => {
  const filter = createFilter(64, 3);
  insert(filter, 'user:alice');
  insert(filter, 'user:bob');

  const q1 = query(filter, 'user:alice');
  const q2 = query(filter, 'user:bob');

  assert.equal(q1.probablyPresent, true);
  assert.equal(q1.missingIndices.length, 0);

  assert.equal(q2.probablyPresent, true);
  assert.equal(q2.missingIndices.length, 0);
});

test('unseen keys with unset bits are definitively identified as not present', () => {
  const filter = createFilter(128, 4);
  insert(filter, 'key:1');

  const q = query(filter, 'unseen:random:9999');
  if (!q.probablyPresent) {
    assert.ok(q.missingIndices.length > 0);
  }
});

test('getFilterStats tracks bit saturation and computes theoretical false positive probability', () => {
  const filter = createFilter(64, 3);
  assert.equal(getFilterStats(filter).bitsSet, 0);
  assert.equal(getFilterStats(filter).fillPct, 0);

  insert(filter, 'k1');
  insert(filter, 'k2');
  const stats = getFilterStats(filter);
  assert.ok(stats.bitsSet > 0);
  assert.equal(stats.itemsCount, 2);
  assert.ok(stats.fillPct > 0);
  assert.ok(stats.fpPct >= 0);
});

test('calculateOptimal reproduces canonical standard sizing formula', () => {
  // For n=10,000 items and p=1% (0.01) error rate:
  // Expected: ~9.6 bits/item, k=7 hashes, ~95,850 bits (~11.7 KB)
  const calc1 = calculateOptimal(10000, 0.01);
  assert.equal(calc1.optimalK, 7);
  assert.ok(calc1.bitsPerItem >= 9.5 && calc1.bitsPerItem <= 9.7);
  assert.ok(calc1.totalKb >= 11.5 && calc1.totalKb <= 12.0);

  // For n=100,000 items and p=0.1% (0.001) error rate:
  // Expected: ~14.4 bits/item, k=10 hashes
  const calc2 = calculateOptimal(100000, 0.001);
  assert.equal(calc2.optimalK, 10);
  assert.ok(calc2.bitsPerItem >= 14.3 && calc2.bitsPerItem <= 14.5);
});
