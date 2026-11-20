import test from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a32, normalize, buildRing, routeKey, analyzeDistribution, calculateMigration, toQuery, fromQuery } from './hashring.js';

test('fnv1a32 produces deterministic 32-bit unsigned hashes', () => {
  const h1 = fnv1a32('user:1001');
  const h2 = fnv1a32('user:1001');
  const h3 = fnv1a32('user:1002');

  assert.equal(typeof h1, 'number');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.ok(h1 >= 0 && h1 < 4294967296);
});

test('normalize validates active nodes and clamps vnode limits', () => {
  const norm = normalize({
    nodes: ['node-a', 'invalid-node', 'node-b'],
    vnodes: 999
  });

  assert.deepEqual(norm.nodes, ['node-a', 'node-b']);
  assert.equal(norm.vnodes, 30); // max is 30
});

test('buildRing creates a sorted circular ring of virtual tokens', () => {
  const ring = buildRing(['node-a', 'node-b'], 3);
  assert.equal(ring.length, 6);

  // Verify tokens are sorted in ascending order
  for (let i = 1; i < ring.length; i++) {
    assert.ok(ring[i].token >= ring[i - 1].token);
    assert.ok(ring[i].angle >= ring[i - 1].angle);
  }
});

test('routeKey assigns keys clockwise to successor tokens and wraps circularly', () => {
  const ring = buildRing(['node-a', 'node-b', 'node-c'], 5);
  const route = routeKey('user:1001', ring);

  assert.ok(['node-a', 'node-b', 'node-c'].includes(route.assignedNodeId));
  assert.ok(route.angle >= 0 && route.angle <= 360);

  // Wrap around test: key larger than the highest token maps to index 0
  const maxTokenKey = 4294967295; // 2^32 - 1
  const wrapRoute = routeKey(maxTokenKey, ring);
  assert.equal(wrapRoute.assignedVnodeId, ring[0].vnodeId);
});

test('calculateMigration demonstrates that adding a 4th node moves only a small fraction of keys', () => {
  const keys = Array.from({ length: 40 }, (_, i) => `key:${i}`);
  const ring3 = buildRing(['node-a', 'node-b', 'node-c'], 10);
  const ring4 = buildRing(['node-a', 'node-b', 'node-c', 'node-d'], 10);

  const migration = calculateMigration(keys, ring3, ring4);

  // In consistent hashing with 3 -> 4 nodes, roughly 25% of keys move (certainly less than 50%)
  assert.ok(migration.moved > 0);
  assert.ok(migration.movedPct <= 50, `Expected <= 50% moved, got ${migration.movedPct}%`);
});

test('analyzeDistribution calculates counts, mean, and stdDev across nodes', () => {
  const ring = buildRing(['node-a', 'node-b'], 5);
  const dist = analyzeDistribution(['k1', 'k2', 'k3', 'k4'], ring, ['node-a', 'node-b']);
  assert.equal(dist.totalKeys, 4);
  assert.equal(dist.tokensTotal, 10);
  assert.equal(dist.nodeStats.length, 2);
  assert.equal(dist.nodeStats[0].count + dist.nodeStats[1].count, 4);
  assert.ok(dist.stdDev >= 0);
});

test('URL query serialization round-trip maintains node list and vnodes', () => {
  const state = {
    nodes: ['node-a', 'node-b', 'node-d'],
    vnodes: 12
  };

  const query = toQuery(state);
  assert.ok(query.includes('v=12'));
  assert.ok(query.includes('n=node-a%2Cnode-b%2Cnode-d') || query.includes('n=node-a,node-b,node-d'));

  const parsed = fromQuery(`?${query}`);
  assert.deepEqual(parsed, state);
});
