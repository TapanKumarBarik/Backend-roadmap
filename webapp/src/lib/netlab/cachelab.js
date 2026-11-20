// Cache simulation arithmetic and stampede protection algorithms.
// Plain JS, zero external dependencies.

/**
 * Evaluates whether XFetch probabilistic early expiration should trigger a refresh.
 * Formula: -(beta * delta * Math.log(random)) > remainingTtlSeconds
 */
export function shouldXFetchRefresh(remainingTtlSeconds, computeDeltaSeconds = 0.5, beta = 1.0, randFn = Math.random) {
  if (remainingTtlSeconds <= 0) return true;
  const rand = Math.max(0.0001, randFn());
  const probExpiry = -beta * computeDeltaSeconds * Math.log(rand);
  return probExpiry > remainingTtlSeconds;
}

/**
 * Simulates cache behavior and stampede resistance over a batch of concurrent requests.
 */
export function simulateCacheTraffic({
  strategy = 'cacheAside',
  mitigation = 'none',
  reqCount = 1000,
  isHotKeyExpired = true
}) {
  let cacheHits = 0;
  let cacheMisses = 0;
  let dbQueries = 0;
  let totalLatencyMs = 0;
  const log = [];

  const CACHE_LATENCY_MS = 2; // in-memory RAM lookup
  const DB_LATENCY_MS = 65;   // relational disk query

  if (!isHotKeyExpired) {
    // Warm cache steady state: ~95% hits
    for (let i = 0; i < reqCount; i++) {
      if (Math.random() < 0.95) {
        cacheHits += 1;
        totalLatencyMs += CACHE_LATENCY_MS;
      } else {
        cacheMisses += 1;
        dbQueries += 1;
        totalLatencyMs += DB_LATENCY_MS;
      }
    }
    log.push(`Processed ${reqCount} requests: ${cacheHits} cache hits, ${dbQueries} DB queries.`);
  } else {
    // Stampede Event on Hot Key
    log.push(`Hot key expired! ${reqCount} concurrent incoming requests hit the cache.`);

    if (mitigation === 'none') {
      // Every request misses and hammers DB
      cacheMisses = reqCount;
      dbQueries = reqCount;
      totalLatencyMs = reqCount * DB_LATENCY_MS;
      log.push(`⚠️ Stampede Thundering Herd: All ${reqCount} requests bypassed cache and hit database directly!`);
    } else if (mitigation === 'mutexLock') {
      // 1 request acquires lock and queries DB; remaining requests wait and read from cache
      cacheMisses = 1;
      dbQueries = 1;
      cacheHits = reqCount - 1;
      // 1 DB query, others wait for lock (~8ms wait + 2ms cache read)
      totalLatencyMs = DB_LATENCY_MS + (reqCount - 1) * 10;
      log.push(`✓ Mutex Lock Acquired: Exactly 1 DB query made. ${reqCount - 1} requests waited and read newly warmed cache.`);
    } else if (mitigation === 'xfetch') {
      // Probabilistic early expiration detected approaching TTL and refreshed in background
      cacheHits = reqCount;
      dbQueries = 1; // background refresh
      totalLatencyMs = reqCount * CACHE_LATENCY_MS;
      log.push(`✓ XFetch Probabilistic Refresh: Key pre-warmed in background! 0 requests blocked. 100% cache hits.`);
    }
  }

  const avgLatencyMs = Number((totalLatencyMs / reqCount).toFixed(2));
  const hitRatePct = Number(((cacheHits / reqCount) * 100).toFixed(1));
  const dbLoadScore = Math.min(100, Math.round((dbQueries / Math.max(1, reqCount)) * 100));

  return {
    reqCount,
    cacheHits,
    cacheMisses,
    dbQueries,
    hitRatePct,
    avgLatencyMs,
    dbLoadScore,
    strategy,
    mitigation,
    log
  };
}
