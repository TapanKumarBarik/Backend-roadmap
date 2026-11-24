# System Design Curriculum Rewrite & PDF Standardization Tracker

This tracker monitors the modernization of all Backend Roadmap System Design lectures to match the high-fidelity study pack notes (`webapp/public/notes/system-design/SD-*.pdf`).

> **Governing Skill:** [`lecture-pdf-standardizer`](../.gemini/skills/lecture-pdf-standardizer/SKILL.md)  
> **Source PDF Notes Directory:** `webapp/public/notes/system-design/`  
> **Target Markdown Modules Directory:** `content/system-design/`

---

## The 16-Point Quality Rubric

Every module must fulfill all 16 canonical components before being marked as **Completed**:

1. [x] **Metadata & Free PDF Links:** Links to `SD-X-YYY.pdf`, estimated reading time, prerequisites, target audience.
2. [x] **In-One-Line & Golden Rule Alert:** Punchy summary with `[!NOTE]` and `[!TIP]` alerts.
3. [x] **What It Is vs. What It Isn't Table:** 3-4 related concepts contrasted (`Term`, `Precise Meaning`, `Production Example`).
4. [x] **Physical Decomposition / Taxonomy:** Breakdown of parts (e.g. 4 parts of latency, throughput units).
5. [x] **The Observability Gap:** Clarifies where metrics are captured (client vs. load balancer vs. server handler).
6. [x] **Mathematical Model & Saturation Curves:** Formal equations, $M/M/1$ queueing behavior, utilization vs. latency multipliers.
7. [x] **Percentiles & Statistical Distributions:** $p_{50}, p_{95}, p_{99}, p_{99.9}$ breakdown and worked mathematical counter-examples.
8. [x] **Compounding Scale Mathematics:** Compounding formulas (e.g. $P(\text{Slow Page}) = 1 - 0.99^N$).
9. [x] **Numbers Every Engineer Must Know:** Log-scale comparisons and relative hardware multipliers.
10. [x] **Protocol & Network Deep Dive:** Sequence diagrams of connection lifecycles (cold setup vs. persistent connection reuse).
11. [x] **Hierarchical Budgets & Sizing:** Splitting targets across components with derived timeouts.
12. [x] **Top Engineering Mitigations:** 4-5 actionable architectural solutions.
13. [x] **Production War Story (SEV-1 Post-Mortem):** Concrete incident with code, impact, Mermaid sequence diagram, RCA, and 3-step fix.
14. [x] **Multi-Language Production Code Tabs:** ````carousel with Go, TypeScript, Python, and Java/C#.
15. [x] **Complete 12 Interview Questions & Answers:** Categorized into `[BASIC]`, `[SCENARIO]`, and `[TRICKY]` with collapsible `<details>` tags.
16. [x] **One-Page Master Cheat Sheet:** Monospaced ASCII summary card.

---

## Phase 1: Core Fundamentals Tracking Table

Path: `content/system-design/01-core-fundamentals/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-what-is-system-design` | What is System Design? | `SD-A-001.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `02-client-server-and-multi-tier-architecture` | Client-Server & Multi-Tier Architecture | `SD-A-002.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `03-functional-requirements` | Functional Requirements | `SD-A-003.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `04-non-functional-requirements` | Non-Functional Requirements | `SD-A-004.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `05-trade-offs-and-how-to-justify-a-design` | Trade-offs & Design Justification | `SD-A-005.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `06-vertical-scaling` | Vertical Scaling | `SD-A-006.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `07-horizontal-scaling` | Horizontal Scaling | `SD-A-007.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `08-latency` | Latency: Anatomy, Budgets, and Mitigation | `SD-A-008.pdf` | 🟢 **Completed** | Commit `2f00d41` (All 16 points implemented) |
| `09-throughput-and-littles-law` | Throughput & Little's Law | `SD-A-009.pdf` | 🟢 **Completed** | Commit `2f00d41` (All 16 points implemented) |
| `10-availability` | Availability: Nines, MTBF vs MTTR, and Redundancy | `SD-A-010.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `0be2f1a`) |
| `11-reliability-availability-and-durability` | Reliability, Availability, and Durability | `SD-A-011.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `0be2f1a`) |
| `12-scalability` | Scalability Dimensions | `SD-A-012.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `0be2f1a`) |
| `13-cap-theorem` | CAP Theorem in Practice | `SD-A-013.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `847452d`) |
| `14-pacelc-theorem` | PACELC Theorem | `SD-A-014.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `847452d`) |
| `15-consistency-models` | Consistency Models: Strong to Eventual | `SD-A-015.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `847452d`) |
| `16-fault-tolerance` | Fault Tolerance & Blast Radius | `SD-A-016.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `17-single-point-of-failure` | Single Points of Failure (SPOF) | `SD-A-017.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `18-simple-beats-clever` | Simple Beats Clever | `SD-A-018.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `19-stateless-vs-stateful` | Stateless vs. Stateful Architecture | `SD-A-019.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |

---

## Phase 2: Networking From Zero Tracking Table

Path: `content/system-design/02-networking-from-zero/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-what-is-a-network` | What is a Network? | `SD-N-001.pdf` | 🟢 **Completed** | Full 16-point rubric, waterfall math & 12 Q&As |
| `02-packets` | Packets: Small Pieces on the Wire | `SD-N-002.pdf` | 🟢 **Completed** | Full 16-point rubric, MTU/MSS math & 12 Q&As |
| `03-ip-addresses` | IP Addresses | `SD-N-003.pdf` | 🟢 **Completed** | Full 16-point rubric, capacity math & 12 Q&As |
| `04-ports-and-sockets` | Ports and Sockets | `SD-N-004.pdf` | 🟢 **Completed** | Full 16-point rubric, ephemeral-port & 4-tuple capacity math, observability gap & 12 Q&As |
| `05-protocols-and-layers` | Protocols and Layers | `SD-N-005.pdf` | 🟢 **Completed** | Full 16-point rubric, header-overhead/serialization math, per-layer observability & 12 Q&As |
| `06-osi-model` | The OSI Model Made Simple | `SD-N-006.pdf` | 🟢 **Completed** | Full 16-point rubric, L2/L3/L4/L7 cost & health-check math, L4-vs-L7 observability gap & 12 Q&As |
| `07-what-happens-when-you-type-a-url` | What Happens When You Type a URL | `SD-N-007.pdf` | 🟢 **Completed** | Full 16-point rubric, RTT/TTFB & slow-start math, RUM-vs-server observability & 12 Q&As |
| `08-tcp-sequence-numbers-and-acks` | TCP: Sequence Numbers & ACKs | `SD-N-008.pdf` | 🟢 **Completed** | Full 16-point rubric, RTO/backoff, seq-wrap & Mathis loss math, ACK-ladder observability & 12 Q&As |
| `09-tcp-three-way-handshake` | TCP: The Three-Way Handshake | `SD-N-009.pdf` | 🟢 **Completed** | Full 16-point rubric, SYN-retry/flood/accept-queue math, handshake observability gap & 12 Q&As |
| `10-tcp-flow-and-congestion-control` | TCP: Flow & Congestion Control | `SD-N-010.pdf` | 🟢 **Completed** | Full 16-point rubric, BDP/slow-start/Mathis loss math, window-health observability & 12 Q&As |
| `11-tcp-closing-time-wait-and-ports` | TCP: Closing, TIME_WAIT & Port Exhaustion | `SD-N-011.pdf` | 🟢 **Completed** | Full 16-point rubric, port-budget/TIME_WAIT/pool-sizing math, socket-state observability & 12 Q&As |
| `12-udp-vs-tcp` | UDP vs. TCP | `SD-N-012.pdf` | 🟢 **Completed** | Full 16-point rubric, header-efficiency/fragmentation-loss/jitter & keepalive math, UDP observability & 12 Q&As |
| `13-subnets-and-cidr` | IP Addresses, Subnets & CIDR | `SD-N-013.pdf` | 🟢 **Completed** | Full 16-point rubric, mask/alignment/overlap & subnet-sizing math, VPC address-plan observability & 12 Q&As |
| `14-routing-and-nat` | Ports, Sockets & Routing | `SD-N-014.pdf` | 🟢 **Completed** | Full 16-point rubric, 5-tuple/SNAT-port/conntrack/asymmetry math, NAT observability & 12 Q&As |
| `15-dns-lookup-step-by-step` | DNS Resolution: Resolvers, Records & TTL | `SD-N-015.pdf` | 🟢 **Completed** | Full 16-point rubric, cache-hit/TTL-staleness/ndots math, CoreDNS observability & 12 Q&As |
| `16-dns-records-ttl-and-migrations` | DNS Records, TTL & Migrations | `SD-N-016.pdf` | 🟢 **Completed** | Full 16-point rubric, TTL/cache-hit & cutover math & 12 Q&As |
| `17-dns-traffic-management` | DNS Traffic: GeoDNS, Weighted, Anycast | `SD-N-017.pdf` | 🟢 **Completed** | Full 16-point rubric, failover budget & canary-skew math & 12 Q&As |
| `18-http-requests-responses-and-methods` | HTTP: Methods, Status Codes & ETags | `SD-N-018.pdf` | 🟢 **Completed** | Full 16-point rubric, retry/idempotency & framing math & 12 Q&As |
| `19-http-status-codes-and-caching` | HTTP Status Codes & Caching | `SD-N-019.pdf` | 🟢 **Completed** | Full 16-point rubric, freshness/ETag savings & backoff math & 12 Q&As |
| `20-why-encryption-public-and-private-keys` | Why Encryption: Public & Private Keys | `SD-N-020.pdf` | 🟢 **Completed** | Full 16-point rubric, key-strength/speed & DH math & 12 Q&As |
| `21-tls-1-3-handshake` | HTTPS & TLS 1.3 Handshake | `SD-N-021.pdf` | 🟢 **Completed** | Full 16-point rubric, RTT/CPU/replay math & 12 Q&As |
| `22-certificates-and-pki` | Certificates & PKI | `SD-N-022.pdf` | 🟢 **Completed** | Full 16-point rubric, renewal/exposure math & 12 Q&As |
| `23-http-1-1-vs-http-2-vs-http-3` | HTTP/1.1 vs. HTTP/2 vs. HTTP/3 | `SD-N-023.pdf` | 🟢 **Completed** | Full 16-point rubric, HOL/loss multiplexing math & 12 Q&As |
| `24-websockets` | WebSockets | `SD-N-024.pdf` | 🟢 **Completed** | Full 16-point rubric, fan-out/heartbeat math & 12 Q&As |
| `25-sse-vs-long-polling-vs-websockets` | SSE vs. Long Polling vs. WebSockets | `SD-N-025.pdf` | 🟢 **Completed** | Full 16-point rubric, poll-waste/SSE math & 12 Q&As |
| `26-http-streaming-and-backpressure` | HTTP Streaming & Backpressure | `SD-N-026.pdf` | 🟢 **Completed** | Full 16-point rubric, chunked/OOM backpressure math & 12 Q&As |
| `27-forward-and-reverse-proxies` | Forward vs. Reverse Proxy | `SD-N-027.pdf` | 🟢 **Completed** | Full 16-point rubric, worker-pin/XFF hop math & 12 Q&As |
| `28-cdns` | CDNs Explained | `SD-N-028.pdf` | 🟢 **Completed** | Full 16-point rubric, hit-ratio/compounding math & 12 Q&As |
| `29-connection-pooling-and-keep-alive` | Connection Pooling & Keep-Alive | `SD-N-029.pdf` | 🟢 **Completed** | Full 16-point rubric, Little's Law/idle-race math & 12 Q&As |
| `30-timeouts-and-502s` | Network Timeouts & 502s | `SD-N-030.pdf` | 🟢 **Completed** | Full 16-point rubric, deadline/retry-amplification math & 12 Q&As |

---

## Phase 2: API Design Tracking Table

Path: `content/system-design/03-api-design/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-rest-principles` | REST Principles | `SD-C-001.pdf` | 🟢 **Completed** | Full 16-point rubric, cancel/idempotency math & 12 Q&As |
| `02-graphql-for-system-design` | GraphQL for System Design | `SD-C-002.pdf` | 🟢 **Completed** | Full 16-point rubric, N+1/cost math & 12 Q&As |
| `03-grpc-protocol-buffers` | gRPC & Protocol Buffers | `SD-C-003.pdf` | 🟢 **Completed** | Full 16-point rubric, protobuf/deadline math & 12 Q&As |
| `04-rest-vs-graphql-vs-grpc` | REST vs GraphQL vs gRPC | `SD-C-004.pdf` | 🟢 **Completed** | Full 16-point rubric, caller-choice scorecard & 12 Q&As |
| `05-api-resource-modeling-uri-design` | API Resource Modeling & URI Design | `SD-C-005.pdf` | 🟢 **Completed** | Full 16-point rubric, bulk/nesting math & 12 Q&As |
| `06-api-versioning-without-breaking-clients` | API Versioning Without Breaking Clients | `SD-C-006.pdf` | 🟢 **Completed** | Full 16-point rubric, adapter/deprecation math & 12 Q&As |
| `07-api-pagination` | API Pagination | `SD-C-007.pdf` | 🟢 **Completed** | Full 16-point rubric, offset-vs-cursor math & 12 Q&As |
| `08-api-filtering-sorting-field-selection-without-table-scans` | Filtering, Sorting & Field Selection | `SD-C-008.pdf` | 🟢 **Completed** | Full 16-point rubric, allow-list/index math & 12 Q&As |
| `09-idempotency-keys` | Idempotency Keys | `SD-C-009.pdf` | 🟢 **Completed** | Full 16-point rubric, storage/retry math & 12 Q&As |
| `10-api-request-validation` | API Request Validation | `SD-C-010.pdf` | 🟢 **Completed** | Full 16-point rubric, layered 413/422 math & 12 Q&As |
| `11-api-error-handling` | API Error Handling | `SD-C-011.pdf` | 🟢 **Completed** | Full 16-point rubric, Problem Details/retry math & 12 Q&As |
| `12-rate-limiting-algorithms` | Rate Limiting Algorithms | `SD-C-012.pdf` | 🟢 **Completed** | Full 16-point rubric, token-bucket/sliding math & 12 Q&As |
| `13-distributed-rate-limiting` | Distributed Rate Limiting | `SD-C-013.pdf` | 🟢 **Completed** | Full 16-point rubric, Redis Lua/hybrid math & 12 Q&As |
| `14-throttling-vs-rate-limiting-vs-quotas` | Throttling vs Rate Limiting vs Quotas | `SD-C-014.pdf` | 🟢 **Completed** | Full 16-point rubric, quota/tier math & 12 Q&As |
| `15-api-authentication` | API Authentication | `SD-C-015.pdf` | 🟢 **Completed** | Full 16-point rubric, JWT/HMAC/mTLS & 12 Q&As |
| `16-api-authorization-bola` | API Authorization & BOLA | `SD-C-016.pdf` | 🟢 **Completed** | Full 16-point rubric, ownership/BOLA & 12 Q&As |
| `17-api-gateway-explained` | API Gateway Explained | `SD-C-017.pdf` | 🟢 **Completed** | Full 16-point rubric, SPOF math & 12 Q&As |
| `18-retries-exponential-backoff-jitter` | Retries, Backoff & Jitter | `SD-C-018.pdf` | 🟢 **Completed** | Full 16-point rubric, amplification math & 12 Q&As |
| `19-api-timeouts-deadline-propagation` | API Timeouts & Deadline Propagation | `SD-C-019.pdf` | 🟢 **Completed** | Full 16-point rubric, budget math & 12 Q&As |
| `20-webhooks` | Webhooks | `SD-C-020.pdf` | 🟢 **Completed** | Full 16-point rubric, HMAC/outbox & 12 Q&As |
| `21-async-apis-for-long-jobs` | Async APIs for Long Jobs | `SD-C-021.pdf` | 🟢 **Completed** | Full 16-point rubric, poll QPS math & 12 Q&As |
| `22-api-contracts-openapi` | API Contracts & OpenAPI | `SD-C-022.pdf` | 🟢 **Completed** | Full 16-point rubric, oasdiff/Pact & 12 Q&As |
| `23-api-backward-compatibility` | API Backward Compatibility | `SD-C-023.pdf` | 🟢 **Completed** | Full 16-point rubric, expand-contract & 12 Q&As |

---

## Phase 2: Databases Tracking Table

Path: `content/system-design/04-databases/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-relational-model-sql-basics` | Relational Model & SQL Basics | `SD-E-001.pdf` | 🟢 **Completed** | Full 16-point rubric, join/constraint math & 12 Q&As |
| `02-database-normalization` | Database Normalization | `SD-E-002.pdf` | 🟢 **Completed** | Full 16-point rubric, 1NF–3NF/anomaly math & 12 Q&As |
| `03-denormalization` | Denormalization | `SD-E-003.pdf` | 🟢 **Completed** | Full 16-point rubric, counter/hot-row math & 12 Q&As |
| `04-b-tree-indexes-explained` | B-Tree Indexes Explained | `SD-E-004.pdf` | 🟢 **Completed** | Full 16-point rubric, fan-out/UUIDv4 math & 12 Q&As |
| `05-composite-covering-partial-indexes` | Composite, Covering & Partial Indexes | `SD-E-005.pdf` | 🟢 **Completed** | Full 16-point rubric, leftmost-prefix math & 12 Q&As |
| `06-lsm-trees-sstables` | LSM Trees & SSTables | `SD-E-006.pdf` | 🟢 **Completed** | Full 16-point rubric, bloom/compaction math & 12 Q&As |
| `07-sql-query-optimization` | SQL Query Optimization | `SD-E-007.pdf` | 🟢 **Completed** | Full 16-point rubric, EXPLAIN/N+1 math & 12 Q&As |
| `08-acid-explained` | ACID Explained | `SD-E-008.pdf` | 🟢 **Completed** | Full 16-point rubric, WAL/fsync math & 12 Q&As |
| `09-isolation-levels-write-skew` | Isolation Levels & Write Skew | `SD-E-009.pdf` | 🟢 **Completed** | Full 16-point rubric, SSI/write-skew math & 12 Q&As |
| `10-mvcc-explained` | MVCC Explained | `SD-E-010.pdf` | 🟢 **Completed** | Full 16-point rubric, xmin/VACUUM/bloat math & 12 Q&As |
| `11-database-locks-deadlocks` | Database Locks & Deadlocks | `SD-E-011.pdf` | 🟢 **Completed** | Full 16-point rubric, lock-order/deadlock math & 12 Q&As |
| `12-optimistic-vs-pessimistic-locking` | Optimistic vs Pessimistic Locking | `SD-E-012.pdf` | 🟢 **Completed** | Full 16-point rubric, CAS/retry math & 12 Q&As |
| `13-nosql-explained` | NoSQL Explained | `SD-E-013.pdf` | 🟢 **Completed** | Full 16-point rubric, BASE/partition math & 12 Q&As |
| `14-key-value-stores-explained` | Key-Value Stores Explained | `SD-E-014.pdf` | 🟢 **Completed** | Full 16-point rubric, hot-key/hash math & 12 Q&As |
| `15-document-databases-explained` | Document Databases Explained | `SD-E-015.pdf` | 🟢 **Completed** | Full 16-point rubric, embed/size-cap math & 12 Q&As |
| `16-wide-column-stores` | Wide-Column Stores | `SD-E-016.pdf` | 🟢 **Completed** | Full 16-point rubric, bucket/tombstone math & 12 Q&As |
| `17-graph-databases-explained` | Graph Databases Explained | `SD-E-017.pdf` | 🟢 **Completed** | Full 16-point rubric, hop-explosion math & 12 Q&As |
| `18-time-series-databases` | Time-Series Databases | `SD-E-018.pdf` | 🟢 **Completed** | Full 16-point rubric, cardinality/retention math & 12 Q&As |
| `19-leader-follower-replication` | Leader-Follower Replication | `SD-E-019.pdf` | 🟢 **Completed** | Full 16-point rubric, lag-loss/semi-sync math & 12 Q&As |
| `20-read-replicas-replication-lag` | Read Replicas & Replication Lag | `SD-E-020.pdf` | 🟢 **Completed** | Full 16-point rubric, LSN/sticky math & 12 Q&As |
| `21-multi-leader-leaderless-replication` | Multi-Leader & Leaderless Replication | `SD-E-021.pdf` | 🟢 **Completed** | Full 16-point rubric, W+R>N/CRDT math & 12 Q&As |
| `22-database-sharding-fundamentals` | Database Sharding Fundamentals | `SD-E-022.pdf` | 🟢 **Completed** | Full 16-point rubric, remap/hotspot math & 12 Q&As |
| `23-range-vs-hash-partitioning` | Range vs Hash Partitioning | `SD-E-023.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `24-rebalancing-hot-partitions` | Rebalancing & Hot Partitions | `SD-E-024.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `25-secondary-indexes-in-partitioned-data` | Secondary Indexes in Partitioned Data | `SD-E-025.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `26-postgres-table-partitioning` | Postgres Table Partitioning | `SD-E-026.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `27-distributed-id-generation` | Distributed ID Generation | `SD-E-027.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `28-zero-downtime-database-migrations` | Zero-Downtime Database Migrations | `SD-E-028.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `29-database-connection-pooling` | Database Connection Pooling | `SD-E-029.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `30-oltp-vs-olap` | OLTP vs OLAP | `SD-E-030.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `31-change-data-capture` | Change Data Capture (CDC) | `SD-E-031.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `32-distributed-sql-explained` | Distributed SQL Explained | `SD-E-032.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `33-how-to-choose-a-database` | How to Choose a Database | `SD-E-033.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |

---

## Phase 2: Estimation Tracking Table

Path: `content/system-design/05-estimation-and-numbers/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-back-of-the-envelope-estimation` | Back-of-the-Envelope Estimation: Which Numbers to Ask First | `SD-D-001.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `02-latency-numbers-powers-of-two-every-engineer-should-know` | Latency Numbers & Powers of Two | `SD-D-002.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `03-how-to-estimate-rps` | How to Estimate RPS | `SD-D-003.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `04-peak-vs-average-traffic` | Peak vs Average Traffic | `SD-D-004.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `05-read-write-ratio` | Read/Write Ratio | `SD-D-005.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `06-storage-estimation` | Storage Estimation | `SD-D-006.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `07-bandwidth-estimation` | Bandwidth Estimation | `SD-D-007.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `08-cache-sizing` | Cache Sizing | `SD-D-008.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `09-how-many-servers-do-you-need-capacity-60-target-n-2` | How Many Servers Do You Need? | `SD-D-009.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `10-growth-projections` | Growth Projections | `SD-D-010.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `11-back-of-the-envelope-estimation` | Full URL Shortener Drill | `SD-D-011.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `12-architecture-diagrams` | Architecture Diagrams | `SD-D-012.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `13-identifying-bottlenecks` | Identifying Bottlenecks | `SD-D-013.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |
| `14-identifying-spofs` | Identifying SPOFs | `SD-D-014.pdf` | 🟢 **Live** | Full 16-point rubric from PDF |

---

## Phase 3: Load Balancing Tracking Table

Path: `content/system-design/06-load-balancing/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-load-balancer-fundamentals` | Load Balancer Fundamentals | `SD-G-001.pdf` | 🟢 **Completed** | Full 16-point rubric, HA/VIP math & 12 Q&As |
| `02-layer-4-vs-layer-7-load-balancing` | Layer 4 vs Layer 7 Load Balancing | `SD-G-002.pdf` | 🟢 **Completed** | Full 16-point rubric, HTTP/2 skew math & 12 Q&As |
| `03-round-robin-vs-weighted-round-robin` | Round Robin vs Weighted Round Robin | `SD-G-003.pdf` | 🟢 **Completed** | Full 16-point rubric, smooth WRR math & 12 Q&As |
| `04-least-connections-ewma-power-of-two-choices-explained` | Least Connections, EWMA & P2C | `SD-G-004.pdf` | 🟢 **Completed** | Full 16-point rubric, herd/P2C math & 12 Q&As |
| `05-consistent-hashing-explained` | Consistent Hashing Explained | `SD-G-005.pdf` | 🟢 **Completed** | Full 16-point rubric, 1/N remap math & 12 Q&As |
| `06-sticky-sessions-ip-hash` | Sticky Sessions & IP Hash | `SD-G-006.pdf` | 🟢 **Completed** | Full 16-point rubric, NAT/affinity math & 12 Q&As |
| `07-health-checks` | Health Checks | `SD-G-007.pdf` | 🟢 **Completed** | Full 16-point rubric, probe/cascade math & 12 Q&As |
| `08-service-discovery` | Service Discovery | `SD-G-008.pdf` | 🟢 **Completed** | Full 16-point rubric (2026-11-24) |
| `09-reverse-proxy-config-in-production` | Reverse Proxy Config in Production | `SD-G-009.pdf` | 🟢 **Completed** | Full 16-point rubric (2026-11-24) |
| `10-load-shedding-traffic-shaping` | Load Shedding & Traffic Shaping | `SD-G-010.pdf` | 🟢 **Completed** | Full 16-point rubric (2026-11-24) |
| `11-global-server-load-balancing` | Global Server Load Balancing | `SD-G-011.pdf` | 🟢 **Completed** | Full 16-point rubric (2026-11-24) |
| `12-failover-strategies` | Failover Strategies | `SD-G-012.pdf` | 🟢 **Completed** | Full 16-point rubric (2026-11-24) |
| `13-blue-green-deployments-canary-releases-with-weighted-traffic` | Blue-Green & Canary Releases | `SD-G-013.pdf` | 🟢 **Completed** | Full 16-point rubric (2026-11-24) |
| `14-autoscaling-explained` | Autoscaling Explained | `SD-G-014.pdf` | 🟢 **Completed** | Full 16-point rubric (2026-11-24) |

---

## Phase 3: Performance and Traffic Tracking Table

Path: `content/system-design/08-performance-and-traffic/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-stateless-service-design` | Stateless Service Design | `SD-J-001.pdf` | 🟢 **Completed** | Full 16-point rubric, SIGTERM/idempotency math & 12 Q&As |
| `02-scaling-stateful-services` | Scaling Stateful Services | `SD-J-002.pdf` | 🟢 **Completed** | Full 16-point rubric, partition/fencing math & 12 Q&As |
| `03-database-bottlenecks` | Database Bottlenecks | `SD-J-003.pdf` | 🟢 **Completed** | Full 16-point rubric, hot-row/ladder math & 12 Q&As |
| `04-asynchronous-processing` | Asynchronous Processing | `SD-J-004.pdf` | 🟢 **Completed** | Full 16-point rubric, queue-age/Little's Law & 12 Q&As |
| `05-python-concurrency` | Python Concurrency Models | `SD-J-005.pdf` | 🟢 **Completed** | Full 16-point rubric, GIL/loop-lag math & 12 Q&As |
| `06-batching` | Batching | `SD-J-006.pdf` | 🟢 **Completed** | Full 16-point rubric, amortization math & 12 Q&As |
| `07-compression` | Compression | `SD-J-007.pdf` | 🟢 **Completed** | Full 16-point rubric, CPU-for-bytes math & 12 Q&As |
| `08-serialization-formats` | Serialization Formats | `SD-J-008.pdf` | 🟢 **Completed** | Full 16-point rubric, bytes/s & schema evolution & 12 Q&As |
| `09-the-use-method` | The USE Method | `SD-J-009.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `10-profiling-python` | Profiling Python | `SD-J-010.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `11-load-testing-vs-stress-soak-spike-tests` | Load / Stress / Soak / Spike Tests | `SD-J-011.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `12-queueing-theory` | Queueing Theory | `SD-J-012.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `13-tail-latency-at-scale` | Tail Latency at Scale | `SD-J-013.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `14-make-it-faster` | Make It Faster | `SD-J-014.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |
| `15-backpressure` | Backpressure | `SD-J-015.pdf` | 🟢 **Completed** | Full 16-point rubric (parallel rewrite) |

---

## Phase Roadmap Overview

Aligned with the YouTube playlists in `content/videos.json` and `C:\Users\tapan\Videos\System Design Videos`. Tracks **03–23** are scaffolded as planned (*Coming soon*) stubs; rewrite them with the 16-point rubric when ready. Videos may still play on related `backend/` / `learn/` / `genai/` modules until remounted here.

| Phase | Lesson prefixes | Tracks | Status |
| :--- | :--- | :--- | :---: |
| **1 Core Fundamentals** | `SD-A-*` (19) | `01-core-fundamentals` | 🟢 Live (19/19) |
| **2 Networking** | `SD-N-*` (30) | `02-networking-from-zero` | 🟢 Live (30/30) |
| **2 API Design** | `SD-C-*` (23) | `03-api-design` | 🟢 Live (23/23) |
| **2 Databases** | `SD-E-*` (33) | `04-databases` | 🟢 Live (33/33) |
| **2 Estimation** | `SD-D-*` (14) | `05-estimation-and-numbers` | 🟢 Live (14/14) |
| **3 Load balancing** | `SD-G-*` (14) | `06-load-balancing` | 🟢 Live (14/14) |
| **3 Caching** | `SD-F-*` (19) | `07-caching` | 🟢 Live (19/19) |
| **3 Performance** | `SD-J-*` (15) | `08-performance-and-traffic` | 🟢 Live (15/15) |
| **4 Distributed systems** | `SD-H-*` (22) | `09-distributed-systems` | 🟡 Coming soon (scaffolded) |
| **4 Messaging** | `SD-I-*` (20) | `10-messaging` | 🟡 Coming soon (scaffolded) |
| **5 Reliability / SRE** | `SD-K-*` (18) | `11-reliability-and-sre` | 🟡 Coming soon (scaffolded) |
| **5 Architecture** | `SD-L-*` (20) | `12-architecture-patterns` | 🟡 Coming soon (scaffolded) |
| **5 Security** | `SD-M-*` (20) | `13-security` | 🟡 Coming soon (scaffolded) |
| **5 Observability & delivery** | `P5-SD-N-*` (18) | `14-observability-and-delivery` | 🟡 Coming soon (scaffolded) |
| **6 Storage** | `SD-O-*` (13) | `15-storage` | 🟡 Coming soon (scaffolded) |
| **6 Search** | `SD-P-*` (12) | `16-search` | 🟡 Coming soon (scaffolded) |
| **6 Real-time & data** | `SD-Q-*` (15) | `17-realtime-and-data` | 🟡 Coming soon (scaffolded) |
| **6 Multi-tenant SaaS** | `SD-R-*` (10) | `18-multi-tenant-saas` | 🟡 Coming soon (scaffolded) |
| **6 Cloud & platform** | `SD-V-*` (23) | `19-cloud-and-platform` | 🟡 Coming soon (scaffolded) |
| **7 AI & GenAI SD** | `SD-S-*` (39) | `20-ai-and-genai-system-design` | 🟡 Coming soon (scaffolded) |
| **8 Interview framework** | `SD-T-*` (15) | `21-interview-framework` | 🟡 Coming soon (scaffolded) |
| **8 Design problems** | `SD-U-*` (37) | `22-interview-design-problems` | 🟡 Coming soon (scaffolded) |
| **9 Revision & mocks** | `SD-W-*` (13) | `23-revision-and-mock-interviews` | 🟡 Coming soon (scaffolded) |

Re-scaffold stubs (never overwrites written lessons): `node scripts/scaffold-sd-coming-soon.mjs`

---

## How to Execute the Next Module Rewrite

1. **Extract PDF Data:**
   ```bash
   python -c "
   import pypdf
   reader = pypdf.PdfReader('webapp/public/notes/system-design/SD-A-010.pdf')
   for i, page in enumerate(reader.pages):
       print(f'=== Page {i+1} ===\n', page.extract_text())
   "
   ```
2. **Draft / Enhance `README.md`:**
   Adhere strictly to the 16-point anatomy in [`lecture-pdf-standardizer`](../.gemini/skills/lecture-pdf-standardizer/SKILL.md).
3. **Verify Integrity:**
   ```bash
   npm run check; npm run lint
   ```
4. **Update This Tracker:**
   Change status to `🟢 Completed` and log commit hash.
