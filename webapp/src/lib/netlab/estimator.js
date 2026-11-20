// Core mathematical capacity estimation and hardware sizing arithmetic for system design interviews.
// Plain JS, zero external dependencies.

import { ESTIMATOR_CONFIG } from '../../config/estimatorlab.js';

const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;

/** Formats byte counts into human-readable strings (KB, MB, GB, TB, PB) */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/** Formats bit-per-second rates into human-readable network units (Kbps, Mbps, Gbps) */
export function formatBitsPerSec(bps) {
  if (bps === 0) return '0 bps';
  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return `${(bps / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/** Formats integer counts with commas or SI suffixes */
export function formatCount(num) {
  return Math.round(num).toLocaleString('en-US');
}

/**
 * Calculates complete capacity estimations from raw interview parameters.
 */
export function estimateCapacity(params) {
  const dau = Number(params.dau) || 100_000_000;
  const readsPerUser = Number(params.readsPerUser) || 10;
  const writesPerUser = Number(params.writesPerUser) || 1;
  const readSizeKb = Number(params.readSizeKb) || 1;
  const writeSizeKb = Number(params.writeSizeKb) || 1;
  const retentionYears = Number(params.retentionYears) || 5;
  const replicationFactor = Number(params.replicationFactor) || 3;
  const peakMultiplier = Number(params.peakMultiplier) || 3;
  const cacheRatio = Number(params.cacheRatio) || 0.2; // 80/20 rule

  // Daily operations
  const dailyWrites = dau * writesPerUser;
  const dailyReads = dau * readsPerUser;

  // QPS
  const avgWriteQps = dailyWrites / SECONDS_PER_DAY;
  const peakWriteQps = avgWriteQps * peakMultiplier;
  const avgReadQps = dailyReads / SECONDS_PER_DAY;
  const peakReadQps = avgReadQps * peakMultiplier;
  const totalPeakQps = peakWriteQps + peakReadQps;

  // Bandwidth (KB -> bytes -> bits)
  const writeBytesPerSec = peakWriteQps * writeSizeKb * 1024;
  const readBytesPerSec = peakReadQps * readSizeKb * 1024;
  const writeBandwidthBps = writeBytesPerSec * 8;
  const readBandwidthBps = readBytesPerSec * 8;
  const totalBandwidthBps = writeBandwidthBps + readBandwidthBps;

  // Storage growth
  const dailyWriteBytes = dailyWrites * writeSizeKb * 1024;
  const storage1YearRawBytes = dailyWriteBytes * DAYS_PER_YEAR;
  const storageTotalRawBytes = storage1YearRawBytes * retentionYears;
  const storageTotalReplicatedBytes = storageTotalRawBytes * replicationFactor;

  // Cache Memory (Pareto 80/20 rule: 20% of daily read data in RAM)
  const dailyReadBytes = dailyReads * readSizeKb * 1024;
  const cacheRamBytes = dailyReadBytes * cacheRatio;

  // Hardware provisioning estimation
  const diskPerShardBytes = ESTIMATOR_CONFIG.hardwareDefaults.dbDiskPerShardGb * 1024 * 1024 * 1024;
  const dbShardsByStorage = Math.ceil(storageTotalReplicatedBytes / diskPerShardBytes) || 1;
  const dbShardsByIops = Math.ceil(peakWriteQps / ESTIMATOR_CONFIG.hardwareDefaults.dbIopsPerShard) || 1;
  const recommendedDbShards = Math.max(dbShardsByStorage, dbShardsByIops);

  const cacheNodeRamBytes = ESTIMATOR_CONFIG.hardwareDefaults.cacheNodeRamGb * 1024 * 1024 * 1024;
  const recommendedCacheNodes = Math.ceil(cacheRamBytes / cacheNodeRamBytes) || 1;

  return {
    qps: {
      avgWriteQps,
      peakWriteQps,
      avgReadQps,
      peakReadQps,
      totalPeakQps
    },
    bandwidth: {
      writeBytesPerSec,
      readBytesPerSec,
      writeBandwidthBps,
      readBandwidthBps,
      totalBandwidthBps
    },
    storage: {
      dailyWriteBytes,
      storage1YearRawBytes,
      storageTotalRawBytes,
      storageTotalReplicatedBytes
    },
    cache: {
      dailyReadBytes,
      cacheRamBytes
    },
    hardware: {
      recommendedDbShards,
      recommendedCacheNodes
    }
  };
}

/**
 * Generates ready-to-copy Markdown table for system design interview notes.
 */
export function generateMarkdownReport(presetName, params, results) {
  return `# System Design Capacity Estimation: ${presetName}

## 1. Core Assumptions
- **Daily Active Users (DAU):** ${formatCount(params.dau)}
- **Read/Write Ratio:** ${params.readsPerUser}:${params.writesPerUser} (Reads: ${params.readsPerUser}/user/day, Writes: ${params.writesPerUser}/user/day)
- **Payload Sizes:** Read = ${params.readSizeKb} KB, Write = ${params.writeSizeKb} KB
- **Retention & Replication:** ${params.retentionYears} Years, ${params.replicationFactor}x Replication
- **Peak Multiplier:** ${params.peakMultiplier}x

## 2. Traffic & QPS
| Metric | Average | Peak (${params.peakMultiplier}x) |
|---|---|---|
| **Write QPS** | ${formatCount(results.qps.avgWriteQps)} req/sec | ${formatCount(results.qps.peakWriteQps)} req/sec |
| **Read QPS** | ${formatCount(results.qps.avgReadQps)} req/sec | ${formatCount(results.qps.peakReadQps)} req/sec |
| **Total Peak QPS** | - | **${formatCount(results.qps.totalPeakQps)} req/sec** |

## 3. Network Bandwidth
- **Ingress (Writes @ Peak):** ${formatBytes(results.bandwidth.writeBytesPerSec)}/s (${formatBitsPerSec(results.bandwidth.writeBandwidthBps)})
- **Egress (Reads @ Peak):** ${formatBytes(results.bandwidth.readBytesPerSec)}/s (${formatBitsPerSec(results.bandwidth.readBandwidthBps)})
- **Total Network Bandwidth:** **${formatBitsPerSec(results.bandwidth.totalBandwidthBps)}**

## 4. Storage & Memory Sizing
- **Daily Storage Growth:** ${formatBytes(results.storage.dailyWriteBytes)} / day
- **${params.retentionYears}-Year Raw Storage:** ${formatBytes(results.storage.storageTotalRawBytes)}
- **${params.retentionYears}-Year Replicated Storage (${params.replicationFactor}x):** **${formatBytes(results.storage.storageTotalReplicatedBytes)}**
- **RAM Cache (80/20 Pareto Rule):** **${formatBytes(results.cache.cacheRamBytes)}**

## 5. Infrastructure Sizing
- **Database Shards (2TB NVMe SSD):** ~${results.hardware.recommendedDbShards} shards
- **Redis Cache Nodes (64GB RAM):** ~${results.hardware.recommendedCacheNodes} instances
`;
}
