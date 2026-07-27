# 05 - Caching and Performance

This track is about making backends *fast* — and, just as importantly, knowing
*where* they're slow so you fix the thing that matters instead of guessing. It has
two halves that meet in the middle: **caching** (the single highest-leverage tool
for read-heavy load — what to cache, which strategy, how entries expire and get
invalidated, and how to stack caches into a hierarchy), and **general
performance and concurrency** (finding real bottlenecks by measurement, batching
and offloading work, the concurrency-vs-parallelism distinction and Python's GIL,
and the profilers and load tests that turn "it feels slow" into a number).

## How this track works

- It assumes you finished **04-databases-and-data-layer**. That track ended on
  query optimization, connection pooling, and a first taste of caching query
  results in Redis; this track picks up exactly there and builds the full caching
  and performance discipline on top of it. `EXPLAIN ANALYZE`, the N+1 problem,
  and connection pooling from track 04 are assumed knowledge and are revisited
  here from a caching/performance angle.
- All hands-on work uses **FastAPI + Redis (redis-py) + Postgres**, with
  **Docker** standing up Redis and Postgres. The caching modules use real Redis
  commands; the performance modules use real profilers (`cProfile`, `py-spy`) and
  load tools (`hey`/`wrk`/`locust`).
- Every standard module README has the same shape: why it matters, concepts,
  a command/code reference, hands-on exercises (do them — including at least one
  "diagnose and fix" scenario each), an independent challenge with no code given,
  common mistakes, and a checkpoint quiz. Two **cumulative reviews** (after
  modules 02 and 06) mix everything so far — take them closed-book.
- Go in order. The track is cumulative: strategies (01) build on fundamentals
  (00); eviction/invalidation (02) and multi-level caching (03) build on
  strategies; the web/DB application module (04) uses all of it; the performance
  half (05–08) generalizes from caching to bottleneck-hunting, scaling,
  concurrency, and profiling; and the capstone (09) requires the whole track at
  once.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Caching fundamentals](00-caching-fundamentals/README.md) | Explain what a cache is, the latency ladder, client vs server vs DB caching layers, and what belongs in a cache vs what doesn't | 60-90 min |
| 01 | [Caching strategies](01-caching-strategies/README.md) | Choose between cache-aside, read-through, write-through, and write-behind by their consistency/latency/complexity tradeoffs | 60-90 min |
| 02 | [Cache eviction and invalidation](02-cache-eviction-and-invalidation/README.md) | Pick an eviction policy (LRU/LFU/TTL/FIFO) for an access pattern and design manual/TTL/event-based invalidation | 75-105 min |
| 03 | [Multi-level caching](03-multi-level-caching/README.md) | Stack an in-process L1 over a distributed L2 (Redis), avoid the stale-L1 bug, and measure hit ratio per level | 60-90 min |
| 04 | [Caching for web apps and databases](04-caching-for-web-apps-and-databases/README.md) | Cache static assets/API responses via HTTP/CDN headers and expensive queries in Redis, and defend against cache stampedes | 75-105 min |
| 05 | [Performance bottlenecks and identifying them](05-performance-bottlenecks-and-identifying-them/README.md) | Systematically find the real bottleneck using response time/throughput/utilization instead of guessing | 60-90 min |
| 06 | [Scaling strategies and batch processing](06-scaling-strategies-and-batch-processing/README.md) | Batch to cut per-item overhead, avoid resource leaks, reduce network overhead, and offload non-critical work | 60-90 min |
| 07 | [Concurrency and parallelism](07-concurrency-and-parallelism/README.md) | Pick async (I/O-bound) vs multiprocessing (CPU-bound), reason about the GIL, and avoid race conditions | 75-105 min |
| 08 | [Profiling and performance testing](08-profiling-and-performance-testing/README.md) | Profile with cProfile/py-spy, read a flame graph, load-test, and find the actual bottleneck (not the assumed one) | 75-105 min |
| 09 | [Capstone project](09-capstone-project/README.md) | Profile a deliberately slow FastAPI+Postgres+Redis service, find the top 3 bottlenecks, and fix them with before/after numbers | 4-6 hrs |

Start here → [00-caching-fundamentals/README.md](00-caching-fundamentals/README.md)

Back to main curriculum: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**06-background-processing-and-realtime**. It's the natural sequel: the recurring
move of this track — "this work doesn't need to finish before I respond to the
user; offload it" (write-behind caching, request-path offloading, keeping blocking
work off the event loop) — becomes that track's entire premise, turned into real
infrastructure: durable task queues, scheduled jobs, retries and idempotency,
webhooks, and realtime websocket/SSE features.
