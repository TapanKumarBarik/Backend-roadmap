# Track: Caching

Where to cache, hit ratio, cache-aside, write-through, TTLs, eviction, stampedes, Redis patterns and the failure modes interviewers probe.

Part of **Phase 3** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLWDD-HPgiAnA). Every lecture already has a video; the written short-lecture notes for this track are being published one at a time. Until then each lesson is marked *Soon* in the sidebar — open it to see what it will cover.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Why Cache and Where: Hit Ratio, Cache Layers & What Not to Cache](01-why-cache-and-where/README.md) | Why Cache and Where: Hit Ratio, Cache Layers & What Not to Cache | *Soon* |
| 02 | [Cache-Aside (Lazy Loading): Reads, Writes & Why Delete on Write](02-cache-aside/README.md) | Cache-Aside (Lazy Loading): Reads, Writes & Why Delete on Write | *Soon* |
| 03 | [Read-Through vs Write-Through Caching (vs Cache-Aside, DAX)](03-read-through-vs-write-through-caching/README.md) | Read-Through vs Write-Through Caching (vs Cache-Aside, DAX) | *Soon* |
| 04 | [Write-Behind vs Write-Around Caching: Speed vs Durability](04-write-behind-vs-write-around-caching/README.md) | Write-Behind vs Write-Around Caching: Speed vs Durability | *Soon* |
| 05 | [Cache TTL & Expiration: How to Choose a TTL and Why Add Jitter](05-cache-ttl-expiration/README.md) | Cache TTL & Expiration: How to Choose a TTL and Why Add Jitter | *Soon* |
| 06 | [LRU Cache Explained: O(1) Hash Map + Doubly Linked List (Python)](06-lru-cache-explained/README.md) | LRU Cache Explained: O(1) Hash Map + Doubly Linked List (Python) | *Soon* |
| 07 | [LFU vs LRU vs FIFO Cache Eviction (and TinyLFU) Explained](07-lfu-vs-lru-vs-fifo-cache-eviction-explained/README.md) | LFU vs LRU vs FIFO Cache Eviction (and TinyLFU) Explained | *Soon* |
| 08 | [Cache Invalidation Strategies: TTL, Delete, CDC, Versioned Keys](08-cache-invalidation-strategies/README.md) | Cache Invalidation Strategies: TTL, Delete, CDC, Versioned Keys | *Soon* |
| 09 | [Cache Consistency: Stale Sets, Double Delete & Memcache Leases](09-cache-consistency/README.md) | Cache Consistency: Stale Sets, Double Delete & Memcache Leases | *Soon* |
| 10 | [Cache Stampede & Thundering Herd: Single-Flight, Locks, SWR](10-cache-stampede-thundering-herd/README.md) | Cache Stampede & Thundering Herd: Single-Flight, Locks, SWR | *Soon* |
| 11 | [Cache Penetration & Avalanche: Negative Caching and Bloom Filters](11-cache-penetration-avalanche/README.md) | Cache Penetration & Avalanche: Negative Caching and Bloom Filters | *Soon* |
| 12 | [Hot Keys in Redis: Celebrity Problem, L1 Cache & Key Replication](12-hot-keys-in-redis/README.md) | Hot Keys in Redis: Celebrity Problem, L1 Cache & Key Replication | *Soon* |
| 13 | [Redis Fundamentals: Why Single-Threaded Is Fast, RDB vs AOF](13-redis-fundamentals/README.md) | Redis Fundamentals: Why Single-Threaded Is Fast, RDB vs AOF | *Soon* |
| 14 | [Redis Replication, Sentinel & Cluster: Hash Slots and Failover](14-redis-replication-sentinel-cluster/README.md) | Redis Replication, Sentinel & Cluster: Hash Slots and Failover | *Soon* |
| 15 | [Memcached vs Redis: When the Simple Cache Wins](15-memcached-vs-redis/README.md) | Memcached vs Redis: When the Simple Cache Wins | *Soon* |
| 16 | [Distributed Caching: Sharding, Consistent Hashing & Scaling to 30 N…](16-distributed-caching/README.md) | Distributed Caching: Sharding, Consistent Hashing & Scaling to 30 Nodes | *Soon* |
| 17 | [HTTP Caching & CDNs: Cache-Control, private vs public, ETags, 304](17-http-caching-cdns/README.md) | HTTP Caching & CDNs: Cache-Control, private vs public, ETags, 304 | *Soon* |
| 18 | [Multi-Level Caching: In-Process L1 + Redis L2 (and Its Risks)](18-multi-level-caching/README.md) | Multi-Level Caching: In-Process L1 + Redis L2 (and Its Risks) | *Soon* |
| 19 | [Caching in Python: lru_cache Pitfalls, cachetools, Async Redis, Keys](19-caching-in-python/README.md) | Caching in Python: lru_cache Pitfalls, cachetools, Async Redis, Keys | *Soon* |

Start here → [Why Cache and Where: Hit Ratio, Cache Layers & What Not to Cache](01-why-cache-and-where/README.md)

Back to the course index: [../README.md](../README.md)
