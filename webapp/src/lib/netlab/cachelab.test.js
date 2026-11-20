import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldXFetchRefresh, simulateCacheTraffic } from './cachelab.js';

test('shouldXFetchRefresh triggers when remaining TTL is zero or negative', () => {
  assert.equal(shouldXFetchRefresh(0), true);
  assert.equal(shouldXFetchRefresh(-5), true);
});

test('shouldXFetchRefresh probabilistically triggers before expiration', () => {
  // With high computeDeltaSeconds, random near 0.001 will easily trigger refresh
  const triggers = shouldXFetchRefresh(1.0, 5.0, 1.0, () => 0.01);
  assert.equal(triggers, true);

  // With plenty of remaining TTL and rand near 0.99, it should not trigger
  const doesNotTrigger = shouldXFetchRefresh(100.0, 0.5, 1.0, () => 0.99);
  assert.equal(doesNotTrigger, false);
});

test('simulateCacheTraffic models stampede catastrophe with mitigation=none', () => {
  const result = simulateCacheTraffic({
    mitigation: 'none',
    reqCount: 1000,
    isHotKeyExpired: true
  });

  assert.equal(result.dbQueries, 1000);
  assert.equal(result.cacheMisses, 1000);
  assert.equal(result.dbLoadScore, 100);
});

test('simulateCacheTraffic prevents stampede with mutexLock and xfetch', () => {
  const mutexResult = simulateCacheTraffic({
    mitigation: 'mutexLock',
    reqCount: 1000,
    isHotKeyExpired: true
  });
  assert.equal(mutexResult.dbQueries, 1);
  assert.equal(mutexResult.cacheHits, 999);

  const xfetchResult = simulateCacheTraffic({
    mitigation: 'xfetch',
    reqCount: 1000,
    isHotKeyExpired: true
  });
  assert.equal(xfetchResult.dbQueries, 1);
  assert.equal(xfetchResult.cacheHits, 1000);
  assert.ok(xfetchResult.avgLatencyMs < 5);
});
