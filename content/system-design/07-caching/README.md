# Track: Caching

Where to cache, hit ratio, cache-aside, write-through, TTLs, eviction, stampedes, Redis patterns and the failure modes interviewers probe.

Part of **Phase 3** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLWDD-HPgiAnA). Every lecture already has a video; written short-lecture notes ship per lesson. **Track status: 🟢 Live (19/19).**

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Why Cache and Where: Hit Ratio, Cache Layers & What Not to Cache](01-why-cache-and-where/README.md) | Place caches, reason about hit ratio, and know what not to cache | Live |
| 02 | [Cache-Aside (Lazy Loading): Reads, Writes & Why Delete on Write](02-cache-aside/README.md) | Implement cache-aside reads/writes and delete-on-write | Live |
| 03 | [Read-Through vs Write-Through Caching (vs Cache-Aside, DAX)](03-read-through-vs-write-through-caching/README.md) | Compare read-through, write-through, and cache-aside | Live |
| 04 | [Write-Behind vs Write-Around Caching: Speed vs Durability](04-write-behind-vs-write-around-caching/README.md) | Choose write-behind vs write-around for speed vs durability | Live |
| 05 | [Cache TTL & Expiration: How to Choose a TTL and Why Add Jitter](05-cache-ttl-expiration/README.md) | Choose TTLs and add jitter to avoid expiry walls | Live |
| 06 | [LRU Cache Explained: O(1) Hash Map + Doubly Linked List](06-lru-cache-explained/README.md) | Implement O(1) LRU and size above the working set | Live |
| 07 | [LFU vs LRU vs FIFO Cache Eviction (and TinyLFU) Explained](07-lfu-vs-lru-vs-fifo-cache-eviction-explained/README.md) | Pick eviction policy against scans, crawlers, and pollution | Live |
| 08 | [Cache Invalidation Strategies: TTL, Delete, CDC, Versioned Keys](08-cache-invalidation-strategies/README.md) | Keep many derived copies fresh with TTL, delete, CDC, versions | Live |
| 09 | [Cache Consistency: Stale Sets, Double Delete & Memcache Leases](09-cache-consistency/README.md) | Close stale-set races and state explicit staleness bounds | Live |
| 10 | [Cache Stampede & Thundering Herd: Single-Flight, Locks, SWR](10-cache-stampede-thundering-herd/README.md) | Protect hot-key expiry with coalesce, locks, and SWR | Live |
| 11 | [Cache Penetration & Avalanche: Negative Caching and Bloom Filters](11-cache-penetration-avalanche/README.md) | Stop missing-key floods with negative caching, Bloom filters, and avalanche hardening | Live |
| 12 | [Hot Keys in Redis: Celebrity Problem, L1 Cache & Key Replication](12-hot-keys-in-redis/README.md) | Detect and spread hot keys with L1, suffix copies, and sharded counters | Live |
| 13 | [Redis Fundamentals: Why Single-Threaded Is Fast, RDB vs AOF](13-redis-fundamentals/README.md) | Choose structures, persistence, eviction, and avoid blocking commands | Live |
| 14 | [Redis Replication, Sentinel & Cluster: Hash Slots and Failover](14-redis-replication-sentinel-cluster/README.md) | Pick Sentinel vs Cluster and reason about failover loss windows | Live |
| 15 | [Memcached vs Redis: When the Simple Cache Wins](15-memcached-vs-redis/README.md) | Choose Memcached vs Redis from workload and ops constraints | Live |
| 16 | [Distributed Caching: Sharding, Consistent Hashing & Scaling to 30 Nodes](16-distributed-caching/README.md) | Shard with consistent hashing so topology changes move ~1/N keys | Live |
| 17 | [HTTP Caching & CDNs: Cache-Control, private vs public, ETags, 304](17-http-caching-cdns/README.md) | Configure Cache-Control, ETags, Vary, and safe CDN cache keys | Live |
| 18 | [Multi-Level Caching: In-Process L1 + Redis L2 (and Its Risks)](18-multi-level-caching/README.md) | Stack L1+L2 with explicit staleness bounds and invalidation | Live |
| 19 | [Caching in Python: lru_cache Pitfalls, cachetools, Async Redis, Keys](19-caching-in-python/README.md) | Use Python cache tools safely across workers, Redis, and tenants | Live |

Start here → [Why Cache and Where: Hit Ratio, Cache Layers & What Not to Cache](01-why-cache-and-where/README.md)

Written Live notes (SD-F-001–019) → [Why Cache and Where](01-why-cache-and-where/README.md)

Back to the course index: [../README.md](../README.md)
