import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWebSocketScaling } from './websocketlab.js';

test('calculateWebSocketScaling sizes live chat preset correctly', () => {
  const result = calculateWebSocketScaling({
    connections: 200_000,
    bufferSizeKb: 8,
    fdLimitPerNode: 65_535,
    nodeRamGb: 16
  });

  // 200,000 * 8KB = 1,600,000 KB = ~1.53 GB socket RAM
  assert.ok(result.totalSocketRamBytes > 1.5 * 1024 * 1024 * 1024);
  // With 65k FD limit (usable ~55k), needs ~4 nodes for FD
  assert.ok(result.recommendedNodes >= 4);
  assert.equal(result.limitingFactor, 'File Descriptors (ulimit -n)');
});

test('calculateWebSocketScaling identifies RAM as limiting factor when buffer is high', () => {
  const result = calculateWebSocketScaling({
    connections: 100_000,
    bufferSizeKb: 128, // high memory per socket
    fdLimitPerNode: 1_000_000, // very high FD limit
    nodeRamGb: 8
  });

  assert.equal(result.limitingFactor, 'Socket Buffer RAM');
  assert.ok(result.recommendedNodes > 1);
});
