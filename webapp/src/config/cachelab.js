// Configuration and presets for Cache Strategies & Stampede Protection Lab (/tools/caching-strategies/).

export const CACHE_LAB_CONFIG = {
  strategies: {
    cacheAside: {
      name: 'Cache-Aside (Lazy Loading)',
      description: 'Application reads from cache first. On cache miss, it reads from the database and writes back to cache. On database update, application explicitly invalidates or evicts the cache entry.'
    },
    writeThrough: {
      name: 'Write-Through',
      description: 'Application writes exclusively to the cache layer. The cache synchronously writes through to the underlying database before acknowledging success, ensuring zero stale reads.'
    },
    writeBehind: {
      name: 'Write-Behind (Write-Back)',
      description: 'Application writes to cache and receives immediate acknowledgment. The cache buffers dirty entries in memory and asynchronously flushes them to the database in micro-batches.'
    },
    refreshAhead: {
      name: 'Refresh-Ahead',
      description: 'Cache monitors access patterns and proactively refreshes frequently read entries from the database right before their TTL expires, preventing cold-cache latency spikes.'
    }
  },
  mitigations: {
    none: {
      name: 'No Protection (Naive)',
      description: 'When a popular key expires, all incoming concurrent requests encounter a cache miss and simultaneously query the database (Cache Stampede / Thundering Herd).'
    },
    mutexLock: {
      name: 'Distributed Mutex (SETNX Lock)',
      description: 'The first request to miss acquires an exclusive distributed mutex lock (Redis SETNX). Only this single worker queries the DB and repopulates the cache; others wait or retry.'
    },
    xfetch: {
      name: 'Probabilistic Early Expiration (XFetch)',
      description: 'Uses Vattani et al. formula: -beta * delta * ln(random()) > remaining_ttl. Proactively launches an async background DB refresh before TTL expires, eliminating wait stalls completely.'
    }
  },
  scenarios: {
    steadyTraffic: {
      name: 'Steady State (Warm Cache)',
      description: '500 requests to warm cache entries. Cache hit rate ~95%, low database load.',
      reqCount: 500,
      isHotKeyExpired: false
    },
    stampedeEvent: {
      name: 'Hot Key Expiration Stampede',
      description: 'A key accessed by 1,000 concurrent requests abruptly expires. Observe database load spikes under different mitigation algorithms.',
      reqCount: 1000,
      isHotKeyExpired: true
    }
  }
};
