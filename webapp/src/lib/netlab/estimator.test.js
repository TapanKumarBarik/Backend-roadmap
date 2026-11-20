import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  formatBitsPerSec,
  formatCount,
  estimateCapacity,
  generateMarkdownReport
} from './estimator.js';

test('format utilities format bytes and bit rates accurately', () => {
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(1024 * 1024 * 1024), '1.00 GB');
  assert.equal(formatBitsPerSec(1_000_000_000), '1.00 Gbps');
  assert.equal(formatCount(1000000), '1,000,000');
});

test('estimateCapacity calculates standard URL shortener metrics correctly', () => {
  const params = {
    dau: 100_000_000,
    readsPerUser: 10,
    writesPerUser: 0.1,
    readSizeKb: 0.5,
    writeSizeKb: 0.5,
    retentionYears: 5,
    replicationFactor: 3,
    peakMultiplier: 2.0,
    cacheRatio: 0.2
  };

  const results = estimateCapacity(params);

  // Writes: 10M writes / 86400s = ~115.74 QPS avg, 231.48 peak
  assert.equal(Math.round(results.qps.avgWriteQps), 116);
  assert.equal(Math.round(results.qps.peakWriteQps), 231);

  // Reads: 1B reads / 86400s = ~11,574 QPS avg, 23,148 peak
  assert.equal(Math.round(results.qps.avgReadQps), 11574);
  assert.equal(Math.round(results.qps.peakReadQps), 23148);

  // Storage: 10M * 0.5KB = 5 GB/day -> 5 * 365 * 5 = 9,125 GB raw (~8.9 TB)
  // Replicated (3x) = ~27,375 GB (~26.7 TB)
  assert.ok(results.storage.storageTotalReplicatedBytes > 25 * 1024 * 1024 * 1024 * 1024);
  assert.ok(results.hardware.recommendedDbShards >= 1);
  assert.ok(results.hardware.recommendedCacheNodes >= 1);
});

test('generateMarkdownReport produces markdown document with all key sections', () => {
  const params = {
    dau: 100_000_000,
    readsPerUser: 10,
    writesPerUser: 1,
    readSizeKb: 1,
    writeSizeKb: 1,
    retentionYears: 5,
    replicationFactor: 3,
    peakMultiplier: 3
  };
  const results = estimateCapacity(params);
  const md = generateMarkdownReport('Test Service', params, results);

  assert.ok(md.includes('# System Design Capacity Estimation: Test Service'));
  assert.ok(md.includes('Write QPS'));
  assert.ok(md.includes('Read QPS'));
  assert.ok(md.includes('Network Bandwidth'));
  assert.ok(md.includes('Database Shards'));
});
