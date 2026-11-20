import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, simulate, getTrafficPattern, toQuery, fromQuery } from './ratelimit.js';

test('normalize clamps rate and burst to valid bounds', () => {
  const norm = normalize({ rate: 999, burst: -10, algorithm: 'unknown' });
  assert.equal(norm.rate, 20); // max rate
  assert.equal(norm.burst, 2); // min burst
  assert.equal(norm.algorithm, 'token-bucket');
});

test('traffic patterns generate expected duration and positive request volumes', () => {
  for (const p of ['bursty-spikes', 'sustained-overload', 'steady-flow']) {
    const pattern = getTrafficPattern(p);
    assert.equal(pattern.length, 20);
    assert.ok(pattern.every((n) => typeof n === 'number' && n > 0));
  }
});

test('token bucket accommodates traffic bursts up to full burst capacity', () => {
  const res = simulate({
    algorithm: 'token-bucket',
    rate: 5,
    burst: 15,
    profile: 'bursty-spikes'
  });

  assert.equal(res.timeline.length, 20);
  // Under bursty-spikes with burst=15 and rate=5, total accepted should exceed sustained rate
  assert.ok(res.summary.totalAccepted > 0);
  assert.ok(res.summary.acceptancePct >= 80);
});

test('leaky bucket enforces constant drain rate on queued bursts', () => {
  const res = simulate({
    algorithm: 'leaky-bucket',
    rate: 4,
    burst: 10,
    profile: 'bursty-spikes'
  });

  // Outflow per second in leaky bucket is strictly bounded by rate (4)
  for (const step of res.timeline) {
    assert.ok(step.accepted <= 4);
  }
  assert.ok(res.summary.totalRejected > 0);
});

test('query parameter serialization preserves state round-trip', () => {
  const state = {
    algorithm: 'leaky-bucket',
    rate: 8,
    burst: 16,
    profile: 'sustained-overload'
  };

  const query = toQuery(state);
  assert.ok(query.includes('algo=leaky-bucket'));
  assert.ok(query.includes('r=8'));
  assert.ok(query.includes('b=16'));
  assert.ok(query.includes('p=sustained-overload'));

  const parsed = fromQuery(`?${query}`);
  assert.deepEqual(parsed, state);
});
