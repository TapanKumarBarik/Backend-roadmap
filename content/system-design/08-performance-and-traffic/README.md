# Track: Performance and Traffic

Stateless design, scaling stateful services, database bottlenecks, async processing, Python concurrency, batching, compression, serialization, profiling, queueing, and backpressure.

Part of **Phase 3** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLWDD-HPgiAnA). Every lecture already has a video; **all 15 written lectures are Live**.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

**Status:** Lessons **01–15** are **Live** (full 16-point rubric).

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Stateless Service Design: What Makes a Service Stateless (12-Factor)](01-stateless-service-design/README.md) | Design 12-factor stateless services that scale horizontally | **Live** |
| 02 | [Scaling Stateful Services: Partitions, Ownership & Rebalancing](02-scaling-stateful-services/README.md) | Partition stateful services and rebalance ownership safely | **Live** |
| 03 | [Database Bottlenecks: Hot Rows and the Scaling Ladder](03-database-bottlenecks/README.md) | Diagnose hot rows and climb the DB scaling ladder | **Live** |
| 04 | [Asynchronous Processing: Queues, Workers & 202 Accepted (Celery)](04-asynchronous-processing/README.md) | Offload work with queues, workers, and 202 Accepted | **Live** |
| 05 | [Python Concurrency: GIL, asyncio, Threads vs Processes Explained](05-python-concurrency/README.md) | Choose threads, processes, or asyncio under the GIL | **Live** |
| 06 | [Batching: Bulk Inserts, Micro-Batching & the Latency Trade-off](06-batching/README.md) | Batch writes and calls without blowing latency SLOs | **Live** |
| 07 | [Compression: gzip vs Brotli vs zstd — and When It's Not Worth It](07-compression/README.md) | Pick compression codecs and know when to skip them | **Live** |
| 08 | [Serialization Formats: JSON vs Protobuf vs Avro vs MessagePack](08-serialization-formats/README.md) | Choose serialization formats for APIs and streams | **Live** |
| 09 | [The USE Method: Find the Bottleneck (Utilization, Saturation, Errors)](09-the-use-method/README.md) | Walk utilization, saturation, and errors to find bottlenecks | **Live** |
| 10 | [Profiling Python: py-spy, cProfile, Scalene & Flame Graphs](10-profiling-python/README.md) | Profile under load and read flame graphs for hot frames | **Live** |
| 11 | [Load Testing vs Stress, Soak & Spike Tests (Locust, k6)](11-load-testing-vs-stress-soak-spike-tests/README.md) | Design honest load/stress/soak/spike tests without coordinated omission | **Live** |
| 12 | [Queueing Theory: Little's Law & Why Not to Run at 95% CPU](12-queueing-theory/README.md) | Apply Little's Law and keep 60–80% headroom | **Live** |
| 13 | [Tail Latency at Scale: Fan-Out, p99 & Hedged Requests](13-tail-latency-at-scale/README.md) | Fight fan-out tails with hedging, deadlines, and merged histograms | **Live** |
| 14 | [Make It Faster: A Performance Optimization Strategy (2 s → 400 ms)](14-make-it-faster/README.md) | Run a measure–fix–verify loop from 2 s down to ~400 ms | **Live** |
| 15 | [Backpressure: Bounded Queues, 429/503 & Retry-After Explained](15-backpressure/README.md) | Bound queues and shed with 429/503 + Retry-After end to end | **Live** |

Start here → [Stateless Service Design: What Makes a Service Stateless (12-Factor)](01-stateless-service-design/README.md)

Back to the course index: [../README.md](../README.md)
