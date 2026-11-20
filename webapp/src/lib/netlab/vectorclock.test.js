import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createClock,
  tick,
  receive,
  compareClocks,
  isConflict,
  formatClock
} from './vectorclock.js';

describe('Vector Clock and Causality Logic', () => {
  it('initializes zeroed vector clocks for all actors', () => {
    const vc = createClock(['A', 'B', 'C']);
    assert.deepEqual(vc, { A: 0, B: 0, C: 0 });
    assert.equal(formatClock(vc), '[A: 0, B: 0, C: 0]');
  });

  it('increments only the local actor clock on tick', () => {
    let vc = createClock(['A', 'B', 'C']);
    vc = tick(vc, 'A');
    assert.equal(vc.A, 1);
    assert.equal(vc.B, 0);
    assert.equal(vc.C, 0);

    vc = tick(vc, 'A');
    assert.equal(vc.A, 2);
  });

  it('merges incoming clock via component-wise max and increments local actor on receive', () => {
    let vA = createClock(['A', 'B', 'C']);
    vA = tick(vA, 'A'); // A:1, B:0, C:0

    let vB = createClock(['A', 'B', 'C']);
    vB = receive(vB, 'B', vA); // max(0,1), max(0,0), max(0,0) + B:1 => A:1, B:1, C:0

    assert.equal(vB.A, 1);
    assert.equal(vB.B, 1);
    assert.equal(vB.C, 0);
  });

  it('identifies strict happens-before causal ordering', () => {
    const v1 = { A: 1, B: 0, C: 0 };
    const v2 = { A: 1, B: 1, C: 0 };
    const v3 = { A: 2, B: 2, C: 1 };

    assert.equal(compareClocks(v1, v2), 'BEFORE');
    assert.equal(compareClocks(v2, v1), 'AFTER');
    assert.equal(compareClocks(v1, v3), 'BEFORE');
    assert.equal(compareClocks(v1, v1), 'EQUAL');
    assert.equal(isConflict(v1, v2), false);
  });

  it('detects concurrent divergent writes (conflicts)', () => {
    // A writes without knowing B, B writes without knowing A
    const vA = { A: 1, B: 0, C: 0 };
    const vB = { A: 0, B: 1, C: 0 };

    assert.equal(compareClocks(vA, vB), 'CONCURRENT');
    assert.equal(compareClocks(vB, vA), 'CONCURRENT');
    assert.equal(isConflict(vA, vB), true);
  });

  it('correctly resolves multi-branch merge (Dynamo reconciliation)', () => {
    const vA = { A: 2, B: 0, C: 0 };
    const vC = { A: 0, B: 0, C: 1 };
    let vB = { A: 0, B: 0, C: 0 };

    // B receives vA
    vB = receive(vB, 'B', vA); // A:2, B:1, C:0
    // B subsequently receives vC
    vB = receive(vB, 'B', vC); // max(2,0)=2, max(1,0)+1=2, max(0,1)=1 => A:2, B:2, C:1

    assert.equal(vB.A, 2);
    assert.equal(vB.B, 2);
    assert.equal(vB.C, 1);
    // Now vB causally succeeds both vA and vC!
    assert.equal(compareClocks(vA, vB), 'BEFORE');
    assert.equal(compareClocks(vC, vB), 'BEFORE');
  });
});
