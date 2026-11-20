// Presets and system defaults for the System Design Capacity Estimator (/tools/system-design-estimator/).

export const ESTIMATOR_CONFIG = {
  presets: {
    urlShortener: {
      name: 'URL Shortener (Bitly/TinyURL)',
      description: 'High read-to-write ratio (100:1) with compact records (URL + 7-character hash).',
      dau: 100_000_000,
      readsPerUser: 10,
      writesPerUser: 0.1,
      readSizeKb: 0.5,
      writeSizeKb: 0.5,
      retentionYears: 5,
      replicationFactor: 3,
      peakMultiplier: 2.5
    },
    socialTimeline: {
      name: 'Social Network / Feed (Twitter/X)',
      description: 'Heavy fan-out reads with short posts and image/metadata references.',
      dau: 250_000_000,
      readsPerUser: 60,
      writesPerUser: 4,
      readSizeKb: 2.0,
      writeSizeKb: 1.0,
      retentionYears: 5,
      replicationFactor: 3,
      peakMultiplier: 3.0
    },
    chatMessaging: {
      name: 'Chat & Direct Messaging (WhatsApp/Slack)',
      description: 'Balanced read/write traffic with rapid message streams and push delivery.',
      dau: 300_000_000,
      readsPerUser: 40,
      writesPerUser: 40,
      readSizeKb: 1.0,
      writeSizeKb: 1.0,
      retentionYears: 2,
      replicationFactor: 3,
      peakMultiplier: 4.0
    },
    videoCatalog: {
      name: 'Video Streaming Metadata (YouTube/Netflix)',
      description: 'Extreme read-heavy metadata lookups and catalog queries with massive retention.',
      dau: 100_000_000,
      readsPerUser: 25,
      writesPerUser: 0.05,
      readSizeKb: 4.0,
      writeSizeKb: 8.0,
      retentionYears: 10,
      replicationFactor: 3,
      peakMultiplier: 3.0
    }
  },
  hardwareDefaults: {
    dbDiskPerShardGb: 2000, // 2 TB NVMe SSD per shard
    dbIopsPerShard: 25000,
    cacheNodeRamGb: 64 // 64 GB RAM per Redis node
  }
};
