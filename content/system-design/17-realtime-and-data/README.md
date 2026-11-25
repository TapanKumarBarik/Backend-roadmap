# Track: Real-Time and Data

Chat routing, presence, notifications, feeds, top-K and the real-time patterns interviewers love.

Part of **Phase 6** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLbu9hGadb_zQ). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Try the [Real-Time Connection & WebSocket Scaling Lab](/tools/websocket-scaling/) and [Bloom Filter Simulator](/tools/bloom-filter/) alongside these lessons.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Real-Time Messaging: Routing Chat Across WebSocket Servers](01-real-time-messaging/README.md) | Route chat messages across stateful WebSocket gateways using Redis Pub/Sub or Kafka | **Live** |
| 02 | [Presence & Online Status: Heartbeats, TTL Keys & Fan-Out](02-presence-online-status/README.md) | Design heartbeat-driven presence with Redis TTL keys and bounded friend-list fan-out | **Live** |
| 03 | [Notification Systems: Preferences, Templates & No Duplicates](03-notification-systems/README.md) | Architect multi-channel notification pipelines with user preferences, rate limits, and deduplication | **Live** |
| 04 | [Feed Generation: Candidates, Ranking, Blending & Cursors](04-feed-generation/README.md) | Build multi-stage feed pipelines with cursor pagination, ranking, and diversity blending | **Live** |
| 05 | [Fan-Out on Write vs Read: Push, Pull & the Celebrity Problem](05-fan-out-on-write-vs-read/README.md) | Combine push fan-out for normal users with pull-on-read for high-follower celebrities | **Live** |
| 06 | [Batch Processing: MapReduce, Spark, Airflow & Safe Reruns](06-batch-processing/README.md) | Design idempotent, partition-aware batch DAGs and backfill pipelines in Spark and Airflow | **Live** |
| 07 | [Stream Processing: Event Time, Windows & Watermarks](07-stream-processing/README.md) | Handle out-of-order events with event time, tumbling/sliding windows, and watermarks | **Live** |
| 08 | [Lambda vs Kappa Architecture: Batch + Speed Layers or Replay](08-lambda-vs-kappa-architecture/README.md) | Trade dual-codebase Lambda complexity against Kafka-replayable Kappa pipelines | **Live** |
| 09 | [Data Pipelines: ETL vs ELT, Lakehouse & Medallion Layers](09-data-pipelines/README.md) | Structure Bronze/Silver/Gold Lakehouse pipelines with Iceberg/Delta and schema enforcement | **Live** |
| 10 | [Time-Series Data: Rollups, Retention & Cardinality at 1M pts/s](10-time-series-data/README.md) | Compress 1M+ pts/sec with Gorilla delta-of-delta encoding, rollups, and cardinality bounds | **Live** |
| 11 | [Geospatial Indexing: Geohash, Quadtree, S2 & H3](11-geospatial-indexing/README.md) | Index moving coordinates with Geohash, Quadtrees, Google S2, and Uber H3 hexagons | **Live** |
| 12 | [Leaderboards & Ranking: Redis Sorted Sets for 100M Players](12-leaderboards-ranking/README.md) | Scale real-time O(log N) leaderboards to 100M players using Redis Sorted Sets and sharding | **Live** |
| 13 | [Counting at Scale: Sharded Counters, Write-Behind & HyperLogLog](13-counting-at-scale/README.md) | Eliminate hot-row lock contention with sharded counters, write-behind batching, and HLL | **Live** |
| 14 | [Probabilistic Data Structures: Bloom, Cuckoo, HLL & Count-Min](14-probabilistic-data-structures/README.md) | Size Bloom/Cuckoo filters, HyperLogLog, and Count-Min Sketches for sub-MB memory budgets | **Live** |
| 15 | [Top-K & Heavy Hitters: Designing Trending Hashtags](15-top-k-heavy-hitters/README.md) | Compute streaming Top-K heavy hitters with Space-Saving, Count-Min, and time-decay windows | **Live** |

Start here → [Real-Time Messaging: Routing Chat Across WebSocket Servers](01-real-time-messaging/README.md)

Back to the course index: [../README.md](../README.md)
