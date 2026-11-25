# Track: Interview Design Problems

Full mock interviews — URL shortener, rate limiter, chat, feed, search, rides, AI agents, multi-tenant SaaS and more — walked end to end.

Part of **Phase 8** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLCa3R_S2yPGI). Every lecture has a video, and every lesson in this track now has its written notes beneath it.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Each lesson walks **component by component** and **scale by scale** (Stage 1: 100–1K users → Stage 2: 10K–100K users → Stage 3: 1M–10M+ users → Final Full Production Architecture) with LaTeX capacity math, Mermaid diagrams, 4-language implementations (Go, TypeScript, Python, C#), CLI diagnostics, 12 Q&As, and a 1-page cheat sheet.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [URL Shortener: Full System Design Mock Interview, All 9 Steps](01-url-shortener/README.md) | Design a Base62 URL shortener from single DB to range-allocated KGS, Redis/CDN edge caching, and async click analytics | **Live** |
| 02 | [Rate Limiter: Full System Design Mock Interview, All 9 Steps](02-rate-limiter/README.md) | Build an atomic Redis Lua token-bucket/sliding-window rate limiter with local fallback and multi-region quota sync | **Live** |
| 03 | [Pastebin: Full System Design Mock Interview, All 9 Steps](03-pastebin/README.md) | Architect object-storage paste blobs, TTL lifecycle sweepers, CDN caching, and abuse/rate-limit controls | **Live** |
| 04 | [File Storage and Sharing: Full System Design Mock Interview, All 9 …](04-file-storage-and-sharing/README.md) | Design chunked deduplicated uploads, pre-signed S3 URLs, metadata sharding, and differential sync | **Live** |
| 05 | [Notification Service: Full System Design Mock Interview, All 9 Steps](05-notification-service/README.md) | Scale multi-channel APNs/FCM/SMS/Email delivery with priority Kafka queues, user preferences, and retry DLQs | **Live** |
| 06 | [Chat Application: Full System Design Mock Interview, All 9 Steps](06-chat-application/README.md) | Build stateful WebSocket gateways, Redis pub/sub fan-out, presence heartbeats, and Cassandra message history | **Live** |
| 07 | [WhatsApp-like Messaging: Full System Design Mock Interview, All 9 S…](07-whatsapp-like-messaging/README.md) | Architect E2EE Signal-protocol delivery, offline store-and-forward queues, receipts, and media CDN pipelines | **Live** |
| 08 | [News Feed: Full System Design Mock Interview, All 9 Steps](08-news-feed/README.md) | Combine hybrid push/pull fan-out, celebrity read-merge, Redis feed caches, and cursor-based pagination | **Live** |
| 09 | [Social Media Platform: Full System Design Mock Interview, All 9 Steps](09-social-media-platform/README.md) | Scale social graphs, post/media pipelines, engagement counters, and trending feeds across regions | **Live** |
| 10 | [Video Streaming Platform: Full System Design Mock Interview, All 9 …](10-video-streaming-platform/README.md) | Design HLS/DASH ABR transcoding DAGs, multi-CDN edge routing, and low-buffering playback telemetry | **Live** |
| 11 | [YouTube-like Service: Full System Design Mock Interview, All 9 Steps](11-youtube-like-service/README.md) | Architect chunked uploads, parallel GOP transcoding, view-count deduplication, and global CDN distribution | **Live** |
| 12 | [Ride-Hailing Platform: Full System Design Mock Interview, All 9 Steps](12-ride-hailing-platform/README.md) | Build S2/H3 geospatial driver matching, 4s GPS ingestion, surge pricing, and trip state machines | **Live** |
| 13 | [Food Delivery Platform: Full System Design Mock Interview, All 9 Steps](13-food-delivery-platform/README.md) | Coordinate 3-sided marketplace dispatch, ETA prediction, menu/cart consistency, and live courier tracking | **Live** |
| 14 | [Ticket Booking System: Full System Design Mock Interview, All 9 Steps](14-ticket-booking-system/README.md) | Prevent double-booking under flash crowds with Redis TTL seat holds, virtual waiting rooms, and ACID checkout | **Live** |
| 15 | [E-Commerce Platform: Full System Design Mock Interview, All 9 Steps](15-e-commerce-platform/README.md) | Design CQRS catalog search, distributed cart/inventory reservations, saga checkout, and flash-sale shielding | **Live** |
| 16 | [Payment Processing System: Full System Design Mock Interview, 9 Steps](16-payment-processing-system/README.md) | Guarantee exactly-once money movement with idempotency keys, double-entry ledgers, PSP circuit breakers, and reconciliation | **Live** |
| 17 | [Banking Transaction System: Full System Design Mock Interview, 9 Steps](17-banking-transaction-system/README.md) | Architect serializable double-entry core banking, outbox event streaming, fraud scoring, and immutable audit trails | **Live** |
| 18 | [Distributed Task Scheduler: Full System Design Mock Interview, 9 Steps](18-distributed-task-scheduler/README.md) | Schedule millions of delayed/cron jobs using hierarchical timing wheels, partitioned DB leases, and fencing tokens | **Live** |
| 19 | [Job Queue: Full System Design Mock Interview, All 9 Steps](19-job-queue/README.md) | Build multi-tenant priority queues with visibility timeouts, exponential backoff, DLQs, and autoscaling workers | **Live** |
| 20 | [Web Crawler: Full System Design Mock Interview, All 9 Steps](20-web-crawler/README.md) | Scale polite BFS crawling with per-host rate limits, Bloom-filter URL deduplication, and SimHash content checks | **Live** |
| 21 | [Search Engine: Full System Design Mock Interview, All 9 Steps](21-search-engine/README.md) | Design distributed inverted-index sharding, scatter-gather BM25 + vector ranking, and near-real-time indexing | **Live** |
| 22 | [Typeahead / Autocomplete: Full System Design Mock Interview, 9 Steps](22-typeahead-autocomplete/README.md) | Serve sub-30ms prefix suggestions with top-K materialized tries, edge caching, and streaming query aggregation | **Live** |
| 23 | [Hotel Booking System: Full System Design Mock Interview, All 9 Steps](23-hotel-booking-system/README.md) | Handle date-range room-type inventory, optimistic concurrency, dynamic pricing caches, and overbooking guards | **Live** |
| 24 | [Inventory Management System: Full System Design Mock Interview, 9 S…](24-inventory-management-system/README.md) | Track multi-warehouse SKU reservations, hot-SKU sharded counters, TTL expirations, and ERP reconciliation | **Live** |
| 25 | [Logging and Monitoring Platform: Full System Design Mock Interview](25-logging-and-monitoring-platform/README.md) | Ingest millions of log lines/sec via Kafka, columnar/Lucene indexing, hot-warm-cold tiering, and alert evaluation | **Live** |
| 26 | [Metrics Collection System: Full System Design Mock Interview, 9 Steps](26-metrics-collection-system/README.md) | Build high-cardinality time-series ingestion with Gorilla compression, downsampling rollups, and PromQL query fan-out | **Live** |
| 27 | [Distributed Cache: Full System Design Mock Interview, All 9 Steps](27-distributed-cache/README.md) | Design consistent-hashing virtual-node rings, LRU/LFU eviction, singleflight stampede guards, and hot-key replication | **Live** |
| 28 | [API Gateway: Full System Design Mock Interview, All 9 Steps](28-api-gateway/README.md) | Architect sub-millisecond L7 routing, JWT/mTLS auth, token-bucket throttling, circuit breakers, and zero-downtime reloads | **Live** |
| 29 | [Feature Flag Service: Full System Design Mock Interview, All 9 Steps](29-feature-flag-service/README.md) | Evaluate deterministic MurmurHash3 rollouts in-process with SSE/CDN streaming updates and instant kill switches | **Live** |
| 30 | [Design Dropbox / Google Drive: Cloud File Storage Mock Interview](30-design-dropbox-google-drive/README.md) | Design content-defined 4MB chunking, block-level deduplication, long-poll sync notifications, and versioned metadata | **Live** |
| 31 | [Design Google Docs: Real-Time Collaborative Editor Mock Interview](31-design-google-docs/README.md) | Resolve concurrent edits with OT/CRDT sequencers, WebSocket room affinity, snapshot compaction, and presence cursors | **Live** |
| 32 | [Location Tracking System Design: Live Maps, Geohash, 2M Writes/s](32-location-tracking-system-design/README.md) | Ingest 2M GPS pings/s via partitioned spatial grids, ring-buffer trajectories, and WebSocket map viewport streaming | **Live** |
| 33 | [Design a Leaderboard: Redis Sorted Sets, Real-Time Ranks, 50M Players](33-design-a-leaderboard/README.md) | Scale 50M-player leaderboards using sharded Redis Sorted Sets, 53-bit tie-breaker scores, and rank-bucket trees | **Live** |
| 34 | [Design a Recommendation System: Candidate Funnel, Feature Store, Ra…](34-design-a-recommendation-system/README.md) | Build 3-stage ANN retrieval, online/offline feature stores, deep ranking inference, and explore/exploit diversity | **Live** |
| 35 | [Design a RAG Knowledge Assistant: Hybrid Search, Permissions, Citat…](35-design-a-rag-knowledge-assistant/README.md) | Architect ACL-enforced hybrid BM25+vector retrieval, cross-encoder reranking, grounded citations, and semantic caches | **Live** |
| 36 | [Design an Enterprise AI Agent Platform: Harness, Tools, MCP, Multi-…](36-design-an-enterprise-ai-agent-platform/README.md) | Design durable agent state machines, sandboxed MCP tool execution, approval gates, token budgets, and trace replay | **Live** |
| 37 | [Design a Multi-Tenant SaaS Platform: Isolation, Routing, Noisy Neig…](37-design-a-multi-tenant-saas-platform/README.md) | Architect pool/bridge/silo isolation, tenant-aware routing, Postgres RLS, fair-share noisy-neighbor throttling, and metering | **Live** |

Start here → [URL Shortener: Full System Design Mock Interview, All 9 Steps](01-url-shortener/README.md)

Back to the course index: [../README.md](../README.md)
