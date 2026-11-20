import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, simulate, toQuery, fromQuery } from './congestion.js';

test('normalize clamps input values safely within spec limits', () => {
  const norm = normalize({
    bdp: 9999,
    buffer: -5,
    rwnd: 1000,
    lossPct: 99,
    rounds: 2,
    algorithm: 'invalid-algo'
  });

  assert.equal(norm.bdp, 60);
  assert.equal(norm.buffer, 2);
  assert.equal(norm.rwnd, 80);
  assert.equal(norm.lossPct, 8);
  assert.equal(norm.rounds, 15);
  assert.equal(norm.algorithm, 'reno');
});

test('slow start doubles cwnd every RTT up to ssthresh', () => {
  const res = simulate({
    bdp: 50,
    buffer: 30,
    rwnd: 80,
    lossPct: 0,
    rounds: 8,
    algorithm: 'reno'
  });

  const cwnds = res.rounds.map((r) => r.cwnd);
  // Initial cwnd starts at 2, doubles: 2 -> 4 -> 8 -> 16 -> 32 (default ssthresh is 32)
  assert.equal(cwnds[0], 2);
  assert.equal(cwnds[1], 4);
  assert.equal(cwnds[2], 8);
  assert.equal(cwnds[3], 16);
  assert.equal(cwnds[4], 32);

  // Once reaching ssthresh (32), switches to linear additive increase (+1 per RTT)
  assert.equal(cwnds[5], 33);
  assert.equal(cwnds[6], 34);
  assert.equal(cwnds[7], 35);
});

test('buffer overflow triggers tail drop and AIMD Reno halving', () => {
  // Capacity ceiling is bdp (10) + buffer (5) = 15 segments
  const res = simulate({
    bdp: 10,
    buffer: 5,
    rwnd: 50,
    lossPct: 0,
    rounds: 10,
    algorithm: 'reno'
  });

  // Slow start: RTT 1: 2, RTT 2: 4, RTT 3: 8, RTT 4: 16 (overflows 15!)
  const r4 = res.rounds[3];
  assert.equal(r4.cwnd, 16);
  assert.equal(r4.event, 'buffer-overflow');
  assert.equal(r4.dropped, 1); // 16 - 15 = 1 dropped
  assert.equal(r4.delivered, 15);
  assert.equal(r4.queue, 5); // buffer is full

  // RTT 5: Reno cuts cwnd to floor(16 / 2) = 8
  const r5 = res.rounds[4];
  assert.equal(r5.cwnd, 8);
  assert.equal(r5.ssthresh, 8);
  assert.equal(r5.phase, 'congestion-avoidance');

  // Next round increases linearly (+1): 8 -> 9
  const r6 = res.rounds[5];
  assert.equal(r6.cwnd, 9);
});

test('TCP Tahoe resets cwnd to 1 upon loss instead of halving', () => {
  const res = simulate({
    bdp: 10,
    buffer: 5,
    rwnd: 50,
    lossPct: 0,
    rounds: 6,
    algorithm: 'tahoe'
  });

  // RTT 4 overflows 15
  assert.equal(res.rounds[3].event, 'buffer-overflow');

  // RTT 5: Tahoe collapses to 1 MSS
  assert.equal(res.rounds[4].cwnd, 1);
  assert.equal(res.rounds[4].ssthresh, 8);
  assert.equal(res.rounds[4].phase, 'slow-start');

  // RTT 6: Doubles in slow start: 1 -> 2
  assert.equal(res.rounds[5].cwnd, 2);
});

test('flow control limits in-flight segments when rwnd is smaller than cwnd', () => {
  const res = simulate({
    bdp: 30,
    buffer: 20,
    rwnd: 12,
    lossPct: 0,
    rounds: 8,
    algorithm: 'reno'
  });

  // By round 5, cwnd reaches 32, but inFlight is strictly capped at rwnd (12)
  const r5 = res.rounds[4];
  assert.equal(r5.cwnd, 32);
  assert.equal(r5.inFlight, 12);
  assert.equal(r5.event, 'rwnd-limit');
  assert.equal(r5.phase, 'flow-capped');
  assert.equal(r5.dropped, 0); // No congestion drop happens because sender is throttled by receiver
});

test('URL query parameter encoding and decoding preserves configuration', () => {
  const state = {
    algorithm: 'tahoe',
    bdp: 35,
    buffer: 18,
    rwnd: 40,
    lossPct: 3.5,
    rounds: 25
  };

  const query = toQuery(state);
  assert.ok(query.includes('algo=tahoe'));
  assert.ok(query.includes('bdp=35'));
  assert.ok(query.includes('buf=18'));
  assert.ok(query.includes('rwnd=40'));
  assert.ok(query.includes('loss=3.5'));
  assert.ok(query.includes('r=25'));

  const parsed = fromQuery(`?${query}`);
  assert.deepEqual(parsed, state);
});
