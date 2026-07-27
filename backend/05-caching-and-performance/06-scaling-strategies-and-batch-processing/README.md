# Module 06: Scaling Strategies and Batch Processing

## Why this matters

Module 05 taught you to find the bottleneck. This module is a toolbox of fixes
that all share one theme: **do less work, less often, in bigger chunks, and get
non-essential work off the critical path.** These are the techniques you reach
for once the profiler has pointed at a real problem — and they're the ones that
matter most before you spend money scaling *out* (more machines), because a
system riddled with per-item overhead, resource leaks, and bloated payloads just
wastes those extra machines too.

Four concrete disciplines: **batch processing** (the N+1 fix from module 05,
generalized into a way of thinking about I/O), **avoiding resource leaks**
(unclosed connections and file handles that slowly strangle a long-running
process — invisible in a script, fatal in a server), **reducing network
overhead** (payload size, compression, fewer round-trips), and **offloading
non-critical work** off the request path. That last one is the bridge to the rest
of the curriculum: the instinct "this doesn't need to happen *before* I respond
to the user" is exactly what track 06 (background processing) is built on. This
module gives you the reasoning; track 06 gives you the queue.

## Concepts

### Scaling up vs scaling out — and why efficiency comes first

Two ways to handle more load:

- **Scale up (vertical):** a bigger machine — more CPU, RAM, faster disk. Simple,
  no distributed-systems complexity, but bounded (there's a biggest box) and
  increasingly expensive per unit.
- **Scale out (horizontal):** more machines/replicas behind a load balancer.
  Effectively unbounded, but requires your app to be stateless-per-request (or
  externalize state — sessions in Redis, not in-process, echoing module 03's L1
  caveat) and brings coordination costs.

But the theme of this module comes *before* either: **efficiency first.** A
request that does 500 database round-trips (N+1), leaks a connection each time,
and ships a 4MB payload doesn't need a bigger box or more replicas — it needs to
stop wasting the resources it has. Scaling hardware around inefficient code just
multiplies the waste and the bill. The order of operations is: profile (module
05) → remove the inefficiency (this module) → *then* scale the hardware if you
still need to. (Track `learn/03-kubernetes` module 09's HPA/VPA is the "scale the
hardware" half; this module is the "stop wasting it" half.)

### Batch processing: amortizing per-item overhead

Module 05 named the "N+1-shaped" bottleneck: time that scales with item count
because each item pays a fixed *overhead* — a round-trip, a syscall, a handshake,
a transaction commit. **Batching** amortizes that fixed cost across many items by
doing the work in bulk: one request carrying N items instead of N requests
carrying one each.

The overhead being amortized is the whole point. A single round-trip to Postgres
is ~1ms of network+protocol overhead plus the actual query work; do it 1,000
times for 1,000 rows and you pay ~1,000ms of *pure overhead* on top of the work.
Batch it into one statement and you pay ~1ms of overhead total. The work is the
same; the overhead collapses.

Where batching applies (all the same idea):

- **Database writes:** `INSERT ... VALUES (...), (...), (...)` or SQLAlchemy's
  `bulk_insert_mappings` / `execute(insert(T), list_of_dicts)` instead of N
  single-row inserts each in its own round-trip (and often its own transaction).
- **Database reads:** `WHERE id IN (:ids)` or eager loading (`selectinload`,
  track 04) instead of N single-row lookups — the direct N+1 fix.
- **Cache operations:** `MGET`/`MSET`/pipelines instead of N `GET`/`SET` round-
  trips to Redis.
- **External API calls:** a bulk endpoint (send 100 IDs, get 100 results) instead
  of 100 calls; if the API has no bulk endpoint, at least concurrency (module 07)
  to overlap the waits.
- **Processing large datasets:** process in **chunks** (1,000 rows at a time)
  rather than loading everything into memory (the leak/OOM problem below) or one
  row at a time (the overhead problem). Chunking is batching applied to a
  stream — big enough chunks to amortize overhead, small enough to bound memory.

The counter-tension: **bigger batches aren't unboundedly better.** A batch of
1,000 is far better than 1; a batch of 10,000,000 loads everything into memory at
once (defeating the point and risking OOM), holds locks/transactions open too
long, and increases the blast radius if it fails. The sweet spot is "large enough
to make overhead negligible, small enough to bound memory and failure impact" —
typically hundreds to low thousands, tuned by measurement (module 05).

### Avoiding resource leaks: the slow strangulation

A **resource leak** is acquiring a finite resource — a database connection, a
file handle, a socket, a lock — and never releasing it. In a short script it's
harmless (the process exits and the OS reclaims everything). In a **long-running
server** it's fatal-but-slow: each leaked resource is never reclaimed, so they
accumulate over hours or days until you hit a hard limit and the process falls
over — the classic "it works fine, then crashes every 3 days" bug.

The usual suspects and their limits:

- **Database connections.** Leak one per request (a session never closed,
  exactly track 04 module 07's pool-exhaustion exercise) and the connection pool
  drains; new requests block on `pool_timeout` then error. The pool made the leak
  *slower to manifest*, not impossible.
- **File handles / sockets.** Every OS process has a limit on open file
  descriptors (`ulimit -n`, often 1024). Leak file handles (open without close)
  or HTTP connections (an `httpx`/`requests` client never closed) and eventually
  every new `open()`/connection fails with "Too many open files."
- **Memory (via unbounded growth).** Not a classic "handle" leak, but the same
  shape: an ever-growing in-process cache with no eviction (module 03's oversized
  L1), an unbounded list you keep appending to, accumulating references — memory
  climbs until the OOM killer strikes.

The fix is discipline about *release*, and Python gives you the tools:

- **Context managers (`with`)** release deterministically at block exit, even on
  exception — the primary defense. `with open(...) as f:`, `with
  Session() as s:`, `with httpx.Client() as c:`.
- **`try/finally`** when a `with` doesn't fit — release in the `finally` so an
  exception can't skip it.
- **Framework scoping** — FastAPI dependencies with `yield` open a resource
  before the request and close it after, automatically, for every request
  including failed ones (the right place to scope a DB session — track 04 module
  06).
- **Bounded caches** (`maxsize` on `TTLCache`/`LRUCache`) so an in-process cache
  can't grow without limit (module 03).

The mental rule: **every acquire needs a guaranteed release on every path,
including the exception path.** In a server, "I'll close it later" or "the
happy path closes it" is a leak waiting for the error path.

### Reducing network overhead

Between services, and between server and client, the network is often the
dominant cost — and it has three levers:

- **Payload size.** Don't send what the caller doesn't need. Select only the
  columns/fields required (over-fetching a 50-column row to use 3 is waste);
  paginate large collections instead of returning 100,000 rows; strip null/empty
  fields; use `field` selection / sparse responses. Smaller payloads are faster
  to serialize, transmit, and parse — at *both* ends.
- **Compression.** Text payloads (JSON, HTML) compress dramatically (often
  5–10×). `Content-Encoding: gzip`/`br` (Brotli) trades a little CPU for a large
  bytes-on-the-wire reduction — almost always a win for responses over a few KB.
  FastAPI's `GZipMiddleware` does this; most CDNs/proxies can too. (Don't bother
  compressing tiny or already-compressed payloads — images, video — the CPU isn't
  repaid.)
- **Number of round-trips.** Each round-trip pays latency (especially across a
  network or to a distant service). Batching (above) cuts round-trips; so does
  combining several small requests into one, and avoiding chatty back-and-forth
  protocols. This is the same "amortize the fixed per-operation overhead" idea as
  batching, applied to the network specifically.

A related backend-specific overhead: **serialization cost.** Turning objects into
JSON and back is real CPU, and for large payloads it can itself be a bottleneck
(module 05's decomposition sometimes fingers *serialization*, not the DB) — which
is another reason smaller payloads help, and why formats like MessagePack or
Protobuf (track 11's gRPC) exist for hot internal paths.

### Offloading non-critical work off the request path

The highest-leverage scaling move is often not making work faster but **moving it
out of the request entirely.** Ask of every step in a request: *does the user's
response actually depend on this completing first?* If not, it doesn't belong on
the critical path.

Classic examples of work that's usually *not* critical to the response:

- Sending a confirmation/welcome email or push notification.
- Generating a thumbnail, transcoding a video, rendering a PDF.
- Writing an analytics/audit event.
- Warming a cache, updating a search index, syncing to a third party.
- Any slow third-party call whose result the user doesn't immediately need.

For these, the request should do the *minimal* critical work (create the order,
persist the record), enqueue the rest as a **background job**, and return
immediately. The user gets a fast response; the slow work happens asynchronously
by a worker. This does two things at once: it slashes response latency (the user
no longer waits for the email to send) *and* it decouples request throughput from
the slow work's throughput (a spike in orders doesn't back up behind email
sending). The write-behind counter from module 01 was a special case of exactly
this: acknowledge fast, do the durable/expensive part later.

The trade you accept is **eventual completion and its complications** — the work
now happens later (the email arrives in a few seconds, not synchronously), and
you need somewhere reliable to enqueue it and a worker to process it, with retries
for failures. That reliable-queue-plus-worker machinery, and the correctness
issues it raises (at-least-once delivery, idempotency, ordering), is precisely
**track 06 — background processing and realtime.** This module's job is to build
the *instinct*: on the request path, do only what the response depends on; offload
the rest. Recognizing that boundary correctly is a real skill, and it's the
single most effective latency win in many systems.

## Command reference

| Technique / API | Purpose | Example |
|---|---|---|
| `execute(insert(T), rows)` / `bulk_insert_mappings` | Batch INSERT (one round-trip) | SQLAlchemy bulk write |
| `WHERE id IN :ids` / `selectinload` | Batch/eager read (fix N+1) | track 04 module 07 |
| `r.mget(keys)` / `r.mset(map)` | Batch Redis reads/writes | fewer round-trips |
| `pipe = r.pipeline(); ...; pipe.execute()` | Send many Redis commands in one round-trip | pipelining |
| chunked iteration (`yield_per`, `itertools.batched`) | Process large data in bounded chunks | avoid loading all in memory |
| `with open(...) as f:` / `with Session() as s:` | Deterministic resource release | leak prevention |
| FastAPI `Depends` with `yield` | Per-request acquire/release of a resource | session scoping |
| `GZipMiddleware` / `Content-Encoding: gzip` | Compress responses | payload reduction |
| pagination (`LIMIT/OFFSET`, keyset) | Bound response size | large collections |
| enqueue + return (Celery/RQ/queue — track 06) | Offload non-critical work | fast response |

Batching a write, the wrong way then the right way:

```python
# WRONG: N round-trips (and often N transactions) — an N+1 on the write side
for row in rows:                       # 10,000 rows
    session.add(Event(**row))
    session.commit()                   # 10,000 commits/round-trips -> seconds of pure overhead

# RIGHT: one bulk statement, chunked to bound memory
from itertools import batched          # Python 3.12+
for chunk in batched(rows, 1000):      # 1,000 at a time: overhead amortized, memory bounded
    session.execute(insert(Event), list(chunk))
session.commit()                       # one commit
```

Pipelining Redis to collapse round-trips:

```python
# WRONG: 1,000 round-trips
for k, v in items.items():
    r.set(k, v)

# RIGHT: one round-trip
with r.pipeline() as pipe:
    for k, v in items.items():
        pipe.set(k, v)
    pipe.execute()                     # all 1,000 SETs sent and acked together
```

Leak-safe resource handling and payload compression in FastAPI:

```python
from fastapi import FastAPI, Depends
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy.orm import Session

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)   # gzip responses > 1KB

def get_session():                      # per-request acquire/release; closes on every path
    with Session(engine) as s:          # 'with' guarantees release even on exception
        yield s

@app.post("/orders")
def create_order(order: OrderIn, s: Session = Depends(get_session)):
    saved = persist_order(s, order)     # the ONLY critical work
    enqueue_confirmation_email(saved.id)  # offloaded: user doesn't wait for the email
    return {"id": saved.id}             # fast response; email sends in the background
```

## Hands-on exercises

Postgres + Redis running; FastAPI app from earlier modules. `pip install redis
sqlalchemy httpx`. A load tool for the throughput exercises.

### 1. Batch a write and measure the overhead collapse

Insert 10,000 rows two ways: (a) one `add`+`commit` per row, (b) chunked
`execute(insert(...))` of 1,000. Time both.

Expected: the per-row version takes seconds (thousands of round-trips/commits of
pure overhead); the batched version is an order of magnitude faster with
identical results. You've felt overhead amortization directly — the same work,
the overhead collapsed.

### 2. Find the batch-size sweet spot

Repeat exercise 1's batched insert with chunk sizes 1, 10, 100, 1,000, 10,000,
and (if you dare) all 10,000 at once. Time each and watch memory (`docker stats`
or `tracemalloc`).

Expected: time drops steeply from 1→100→1,000 (overhead amortizing), then flattens
— and the very largest chunks stop helping while memory use climbs. You've located
the sweet spot empirically (module 05's "tune by measurement") and seen why
"bigger is always better" is false for batches.

### 3. Pipeline Redis

Set 5,000 keys with a loop of `r.set`, then with a pipeline. Time both.

Expected: the pipelined version is dramatically faster — it collapsed 5,000
network round-trips into one. Same lesson as exercise 1, on the cache layer.

### 4. Reproduce a connection-handle leak in a server

Write a FastAPI endpoint that opens a `Session` (or raw connection) *without*
closing it — no `with`, no dependency `yield`. Hit it repeatedly under load
(`hey -n 100`) with a small pool (`pool_size=5, max_overflow=0, pool_timeout=3`).

Expected: after ~5 requests, subsequent requests block for `pool_timeout` then
error with `QueuePool limit ... timed out` — the pool drained by leaked
connections (track 04 module 07's exercise, now framed as a leak). Confirm the
process doesn't recover: the leak is permanent until restart.

### 5. Fix the leak with a scoped dependency

Convert exercise 4's endpoint to use the `get_session` dependency with `with ...
yield`. Re-run the load, including forcing some requests to raise an exception
mid-handler.

Expected: connections are returned to the pool on *every* path (success and
exception), the pool never drains, and load runs indefinitely without timeouts.
You've seen `with`/`yield` guarantee release even on the error path — the core
leak defense.

### 6. Measure a payload/compression win

Return a large JSON response (say 10,000 rows). Measure bytes-on-the-wire and
latency with and without `GZipMiddleware`, and then with field-selection
(returning only the 3 fields the client needs instead of all 50).

Expected: gzip cuts transfer size several-fold (a little CPU for a lot of bytes);
field-selection cuts it again *and* reduces serialization CPU. Both improve
end-to-end latency for a large payload — often more than you'd guess (serialization
can be a real chunk of the time, per module 05).

### 7. Offload non-critical work off the request path

Build a `POST /signup` that (a) synchronously creates the user *and* sleeps 800ms
to simulate sending a welcome email, then (b) a version that creates the user and
*enqueues* the email work (for now, a `threading`/`asyncio` background task or a
simple in-memory queue), returning immediately. Measure response latency of each.

Expected: version (a) responds in ~810ms (the user waits for the email); version
(b) responds in ~10ms (the email sends after the response). Same user-visible
outcome (account created, email arrives), radically different latency — and under
load, (b)'s throughput no longer bottlenecks on email speed. Note what you gave
up: the email is now eventual, and a robust version needs a real queue with
retries — which is track 06.

### 8. Diagnose and fix: the service that crashes every few days

A report-generation service runs fine, then reliably crashes with "Too many open
files" after 3–4 days of uptime, and sometimes "QueuePool limit ... timed out"
before that. The hot code path, per report, opens a template file and a DB
session, and calls a third-party API with a fresh `httpx.Client()`:

```python
def generate_report(report_id: int):
    f = open(f"templates/{template}.html")      # opened...
    conn = engine.connect()                       # opened...
    client = httpx.Client()                       # opened...
    data = conn.execute(query).fetchall()
    extra = client.get(THIRD_PARTY_URL).json()
    return render(f.read(), data, extra)          # ...and none are ever closed
```

Diagnose and fix, and explain why it took *days* and why dev/tests never caught
it.

<details>
<summary>Answer</summary>

Three simultaneous **resource leaks**: the file handle (`f`), the DB connection
(`conn`), and the HTTP client/socket (`client`) are all acquired per report and
**never closed**. Each report leaks one of each, so open file descriptors climb
monotonically until the process hits its `ulimit -n` (→ "Too many open files")
and the connection pool drains (→ "QueuePool limit ... timed out"), whichever
comes first. It takes *days* because the accumulation is slow — one report leaks a
handful, and it takes thousands of reports to reach the OS/pool limit; the leak is
invisible per-request and only fatal in aggregate over uptime. Dev/tests never
caught it because a test runs a few reports then the *process exits*, and the OS
reclaims everything on exit — a leak is only fatal in a *long-running* process.
Fix: guarantee release on every path with context managers —
`with open(...) as f, engine.connect() as conn, httpx.Client() as client:` (or a
persistent, reused module-level `httpx.Client` rather than one per call, which is
also more efficient). Every acquire needs a guaranteed release on every path,
including exceptions.

</details>

## Independent challenge

No code given. Take a data-heavy operation in your app (a bulk import, a
report, a fan-out to a third party) and make it efficient without adding
hardware. First, find and eliminate an **N+1-shaped** cost by batching — either
DB writes/reads or external calls — and measure the overhead collapse, then find
the batch-size sweet spot empirically rather than guessing. Second, audit the
code path for **resource leaks** (connections, file handles, HTTP clients) and
convert every acquire to a guaranteed-release form (`with`/`yield`/`try-finally`),
proving the fix by exhausting a small pool under load before and not after.
Third, reduce **network overhead** on your largest response with compression
and field-selection, measuring bytes-on-the-wire before and after. Fourth,
identify one piece of work currently on the request path that the response does
*not* depend on, **offload** it (for now to a background task), and show the
response-latency drop — then write two sentences on what you'd need from
**track 06** to make that offload *reliable* (what happens if the worker crashes
mid-job). Keep every before/after number, per module 05's discipline.

<details>
<summary>Hint</summary>

The batching target is anything where you see per-item round-trips scaling with
count (module 05's N+1 shape) — collapse it with a bulk statement / `IN` query /
`MGET`/pipeline / bulk API call, and chunk large data (hundreds to low thousands
per chunk) so you amortize overhead without loading everything into memory. For
leaks, the tell is any `open(...)`, `engine.connect()`, or client constructor
without a matching close on *every* path — reproduce the pool-exhaustion from
exercise 4 to prove it, then wrap in `with`/dependency-`yield` and prove it's
gone. For the offload, pick genuinely non-critical work (email, thumbnail,
analytics event, index update) and enqueue-and-return; the track-06 gap you'll
name is durability and retries — a `threading`/`asyncio` task is lost if the
process dies mid-job and has no retry, whereas a real task queue persists the job
and re-delivers it (with the at-least-once/idempotency concerns track 06 covers).

</details>

## Common mistakes & troubleshooting

- **Scaling hardware around inefficient code.** More machines multiply the waste
  and the bill. Profile and remove the inefficiency (batching, leaks, payloads)
  *before* scaling up/out.
- **Per-item round-trips (N+1 on reads *and* writes).** One commit/query/call per
  item pays fixed overhead N times. Batch into bulk statements / `IN` queries /
  `MGET`/pipelines / bulk endpoints.
- **Unbounded batch sizes.** A batch of everything loads it all into memory (OOM
  risk), holds locks/transactions too long, and widens failure blast radius.
  Chunk to hundreds/low-thousands, tuned by measurement.
- **Resource leaks in long-running servers.** An acquire without a guaranteed
  release accumulates until a hard limit (fd limit, pool) crashes the process —
  slowly, so dev misses it. Use `with`/`yield`/`try-finally` on *every* path.
- **A new HTTP client per call.** Constructing (and leaking) an `httpx`/`requests`
  client per request wastes connections and leaks sockets. Reuse a persistent
  client.
- **Over-fetching and uncompressed large payloads.** Returning 50 columns to use
  3, un-paginated collections, and uncompressed JSON waste bandwidth,
  serialization CPU, and latency at both ends. Select fields, paginate, gzip.
- **Compressing tiny or already-compressed payloads.** gzip on a 200-byte
  response or a JPEG spends CPU for no benefit. Set a `minimum_size` and skip
  binary/compressed content.
- **Doing non-critical work on the request path.** Sending email, transcoding,
  indexing synchronously makes the user wait and couples request throughput to
  slow work. Offload it (→ track 06) — but know you've traded synchronous
  completion for eventual completion and now need a reliable queue and retries.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What fixed cost does batching amortize, and why is a batch of 1,000 far better
   than 1 but a batch of 10,000,000 potentially worse than 1,000?
2. Why is a resource leak harmless in a short script but fatal in a long-running
   server, and what's the general rule that prevents it?
3. Name the three levers for reducing network overhead, and give the one-line
   tradeoff of using compression.
4. What single question decides whether a piece of work belongs on the request
   path, and what two benefits does offloading non-critical work provide at once?
5. Why should efficiency (batching, leak-fixing, payload reduction) come *before*
   scaling hardware up or out?
6. Explain why the exercise-8 "crashes every few days" service took days to fail
   and why tests never caught it — in terms of resource lifetime.

<details>
<summary>Answers</summary>

1. Batching amortizes the fixed *per-operation overhead* — a network round-trip,
   a syscall, a transaction commit, a handshake — across many items, so N items
   pay ~one unit of overhead instead of N. A batch of 1,000 collapses ~1,000×
   overhead into ~1×; but a batch of 10,000,000 loads all of it into memory at
   once (OOM risk), holds locks/transactions open too long, and makes a single
   failure lose everything — so the sweet spot is "large enough to make overhead
   negligible, small enough to bound memory and blast radius."
2. In a short script the process exits quickly and the OS reclaims every
   resource, so an un-released handle never accumulates. In a long-running server
   the process lives for days and each leaked resource is never reclaimed, so they
   accumulate until a hard limit (file-descriptor limit, connection pool) is hit
   and the process crashes. The rule: every acquire needs a guaranteed release on
   *every* path including exceptions — `with`/`try-finally`/dependency-`yield`.
3. **Payload size** (send only needed fields, paginate), **compression**
   (`gzip`/`br`), and **number of round-trips** (batch/combine requests).
   Compression's tradeoff: it spends a little CPU to save a lot of bytes on the
   wire — almost always a win for text payloads over a few KB, not worth it for
   tiny or already-compressed (image/video) content.
4. "Does the user's response actually depend on this completing first?" — if not,
   it's non-critical and should be offloaded. Offloading simultaneously (a) slashes
   response latency (the user no longer waits for the slow work) and (b) decouples
   request throughput from the slow work's throughput (a traffic spike doesn't back
   up behind email/transcoding/indexing).
5. Because scaling hardware around inefficient code just multiplies the waste (and
   the cost) — a request doing 500 round-trips, leaking connections, and shipping
   4MB does the same wasteful thing on a bigger box or across more replicas. The
   order is profile → remove inefficiency → then scale hardware if still needed, so
   the extra capacity goes to real work, not overhead.
6. The service leaked a file handle, a DB connection, and a socket per report and
   never released them; open descriptors/pool connections climbed monotonically
   but *slowly* — thousands of reports were needed to reach the OS `ulimit`/pool
   limit, so it took days of uptime to crash. Tests never caught it because a test
   runs a few reports and then the process exits, at which point the OS reclaims
   everything — a leak is only fatal in a process that stays alive long enough to
   hit the limit.

</details>

## Cumulative review

Closed-book. These mix modules 00–06 (roughly two-thirds of the track). Write
full answers before expanding; if one stumps you, redo that module's exercises.

1. A `GET /feed` endpoint is slow. Walk the module 05 procedure to *find* the
   bottleneck, then, supposing the decomposition shows 70% of the time in "load
   each post's author and comment count in a loop" and 25% in serializing a
   50-field payload, prescribe the specific fixes from modules 04/06 for each and
   predict the approximate speedup ceiling for fixing *only* the serialization
   (invoke the relevant law by name).
2. You cache `/feed`'s result in Redis with a 30s TTL. Under load you see the DB
   spike every 30s. Name the phenomenon (module 04), give two defenses, and
   explain why an L1 in front (module 03) would *not* be an appropriate addition
   here if the feed is per-user.
3. Contrast three ways data can fail to be where you expect it, one from each of
   modules 01, 02, and 06: a write-behind loss, a `volatile-lru`-with-no-TTL
   rejection, and a connection-pool exhaustion from a leak — what triggers each
   and what you'd see.
4. For a value read 5,000×/min, recomputed by a 300ms aggregate, changing hourly:
   choose a caching strategy (module 01), eviction policy + TTL (module 02),
   whether to add an L1 (module 03), and a stampede defense (module 04) — a
   complete design, each choice justified in one clause.
5. A signup endpoint takes 900ms: 40ms to create the user, 60ms for a query that
   turns out to be an N+1, and 800ms sending a welcome email synchronously. Give
   the module-06 fix for *each* of the two non-user-creation costs, state the
   resulting latency, and name what track-06 machinery the email fix will
   eventually need to be reliable.
6. Explain the through-line connecting module 01's write-behind, module 04's
   `stale-while-revalidate`, and module 06's request-path offloading — what single
   idea do all three share?

<details>
<summary>Answers</summary>

1. Procedure: measure p50/p95/p99 + RPS under realistic load to confirm and
   classify the problem; decompose into phases and follow the biggest number;
   confirm with utilization; fix one thing; re-measure. Given 70% in a per-post
   author/comment loop, that's an **N+1** — fix by eager loading / batching (`IN`
   query or `selectinload`, modules 04/06) and/or caching the feed result; given
   25% in serialization, reduce payload (field-selection + gzip, module 06).
   Fixing *only* the serialization can improve total time by at most ~25% —
   **Amdahl's Law** caps the speedup at the component's fraction of total time.
2. A **cache stampede / thundering herd**: at each 30s expiry, all concurrent
   requests miss and recompute at once, spiking the DB. Defenses: single-flight
   **locking** (only one recompute per expiry) and **jittered TTLs** (so keys
   don't expire in lockstep). An L1 would be inappropriate for a *per-user* feed
   because the keyspace has no small hot set — the L1 hit ratio would be near zero
   (module 03, exercise 8), adding per-process staleness risk for no benefit.
3. **Write-behind loss (m01):** writes acked from the cache but not yet flushed
   are lost if the cache dies before the background flush — triggered by a crash
   in the durability window; you'd see counters/writes simply missing from the DB.
   **`volatile-lru` with no TTLs (m02):** nothing is evictable, memory fills to
   `maxmemory`, and Redis *rejects new writes* with OOM — triggered by
   policy/usage mismatch; you'd see `evicted_keys: 0`, memory pinned, OOM errors,
   and new keys never cached. **Pool exhaustion from a leak (m06):** connections
   acquired-not-released accumulate until the pool drains — triggered by a missing
   release path; you'd see requests block then `QueuePool limit ... timed out`.
4. Cacheable (expensive, read-heavy, hourly-changing). **Strategy:** cache-aside/
   read-through — default, DB stays authoritative. **Policy + TTL:** `allkeys-lru`
   (or `-lfu` if a skewed hot set), TTL a few minutes — generous because staleness
   tolerance is high, bounding load massively. **L1:** yes *if* the value is shared
   across users (a small hot set → high L1 ratio); no if per-user. **Stampede
   defense:** single-flight lock (it's a hot key) plus jittered TTL — one recompute
   per expiry, no synchronized herd.
5. The **N+1 query** (60ms): batch/eager-load it into 1–2 queries (module 06). The
   **synchronous email** (800ms): offload it off the request path — enqueue and
   return. Resulting latency ≈ the 40ms user-create plus the now-batched query
   (~a few ms) ≈ ~45ms, since the email no longer blocks the response. To make the
   email offload *reliable* it needs **track 06's** durable task queue with
   retries (so the job survives a worker crash and is re-delivered), with the
   at-least-once/idempotency handling that implies.
6. All three **acknowledge/return fast and defer the expensive-or-non-critical
   part**: write-behind acks the cache write and flushes to the DB later;
   `stale-while-revalidate` serves the stale cached value now and refreshes in the
   background; request-path offloading returns the response now and does the
   non-critical work in a worker. The shared idea: *don't make the caller wait for
   work whose result they don't immediately need* — trading synchronous completion
   for bounded eventual completion to cut latency.

</details>

## Next

[07-concurrency-and-parallelism](../07-concurrency-and-parallelism/README.md) —
offloading work and overlapping I/O both raise a question this module kept
deferring: how do you actually *do more than one thing at once*? Next is the real
difference between concurrency and parallelism, why async/await helps I/O-bound
work and multiprocessing helps CPU-bound work, what Python's GIL does in practice,
and the race conditions concurrency introduces (which you glimpsed in the caching
races of modules 01 and 04).
