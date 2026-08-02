# Module 05: Stream Processing — Windows, Joins and State

## Why this matters

A consumer loop handles one record at a time, statelessly. That covers a lot
of work — but not "how many failed logins per user in the last 5 minutes",
"enrich each order with the customer's current tier", or "alert when a
payment isn't confirmed within 30 seconds of being initiated". Those need
**state across records** and **a notion of time**, and both are much harder
than they look once records arrive late, out of order, or twice.

This module covers the concepts that stream-processing frameworks exist to
provide, and — importantly — when you should just write a consumer loop
instead, because most teams reach for a framework earlier than they need to.

## Concepts

### Streams and tables are the same data, viewed differently

```
STREAM (append-only facts)          TABLE (latest value per key)
  user-1  login   09:00               user-1  →  logout  (09:05)
  user-2  login   09:01               user-2  →  login   (09:01)
  user-1  logout  09:05

  every event matters                 only the current value matters
  = a `delete` topic (module 04)      = a `compact` topic (module 04)
```

**Stream → Table:** aggregate by key, keeping the latest.
**Table → Stream:** emit each change as an event (a changelog).

This duality is the core abstraction. A compacted topic *is* a table; a
normal topic *is* a stream; and most stream processing is converting between
them.

### Event time vs processing time

The distinction that makes windowing hard:

| | Meaning | Problem |
|---|---|---|
| **Event time** | When it happened (in the payload) | Records arrive late and out of order |
| **Ingestion time** | When Kafka received it | Approximation; loses original ordering |
| **Processing time** | When your code saw it | Non-deterministic; replays give different answers |

Use **event time** for anything whose answer must be stable. A replay of
yesterday's data must produce yesterday's numbers, and only event time gives
you that — processing-time windows would re-bucket everything by when the
replay happened.

### Window types

```
TUMBLING (fixed, non-overlapping) — "orders per minute"
  |--- 10:00 ---|--- 10:01 ---|--- 10:02 ---|

HOPPING (fixed, overlapping) — "5-min count, updated every minute"
  |------- 10:00-10:05 -------|
        |------- 10:01-10:06 -------|

SESSION (activity-gap driven) — "one user's browsing session"
  ●● ●  ●        [gap > 30min]        ● ●●
  |--- session 1 ---|                 |-- session 2 --|

SLIDING (window per event pair) — "events within 10s of each other"
```

Tumbling is the default and covers most reporting. Session windows are the
right tool whenever the boundary is defined by *inactivity* rather than the
clock — user sessions, device connectivity, and the `user-sessions` expiry
problem from module 04's challenge.

### Late data and grace periods

```
window [10:00, 10:01)
  ├─ 10:00:30  event A  ✓ on time
  ├─ 10:01:20  event B  ← event-time 10:00:45, arrived late but within grace
  └─ 10:06:00  event C  ← event-time 10:00:10, beyond grace: DROPPED
```

A **grace period** is how long you keep a window open for stragglers after
its end. It's a direct trade: longer grace means more correct results but
more memory and later finality. There is no correct universal value —
it depends on how late your data actually is, which you should *measure*
(`processing_time - event_time`) rather than guess.

Whatever you choose, some data is dropped. Emit a metric for late-and-dropped
records; a silent drop is a silent wrong number.

### Joins

| Join | Left | Right | Semantics |
|---|---|---|---|
| Stream-Stream | stream | stream | Must be **windowed** — both sides are unbounded |
| Stream-Table | stream | table | Enrichment; looks up current table value |
| Table-Table | table | table | Materialised view; updates on either side |

**Stream-stream joins require a window** because you can't buffer two
infinite streams. "Join a click to the impression that preceded it" only
makes sense within a bounded time.

**Stream-table joins are the workhorse** — enriching an order event with the
customer's current tier from a compacted topic. Note the subtlety: the result
depends on *when* the join ran, because the table changes. Replaying an old
stream against today's table gives different answers than it did originally.
If that matters, you need a versioned/temporal join or you must carry the
enrichment in the event itself.

**Co-partitioning is required.** For any keyed join, both topics must have
the same partition count and the same key, so matching keys live on the same
partition and therefore the same task. Violating this is the most common
cause of "my join returns nothing" — and the framework often can't tell you
why.

### Do you actually need a framework?

Plain consumer loop is enough when:

- Processing is per-record and stateless (transform, filter, route)
- State is small and you can hold it in memory or a local dict
- You can tolerate rebuilding state on restart by replaying a compacted topic

Reach for a framework when you need:

- Windowed aggregation with event time and grace periods
- Stream-stream joins
- Large state that must survive restarts without full replay
- Exactly-once across a multi-stage topology

The honest guidance: **most "stream processing" in production is a consumer
loop plus a compacted topic**, and that's a good thing — it's simpler to
operate and debug. Frameworks earn their complexity at genuine scale or
genuine analytical complexity.

### The Python landscape

Kafka Streams is a Java library with no real Python equivalent. Python
options:

| Tool | Model | Notes |
|---|---|---|
| **Faust / faust-streaming** | Kafka Streams-like, asyncio | Tables, windows; original project unmaintained, fork active |
| **Quix Streams** | DataFrame-like | Actively developed, state stores, windows |
| **Bytewax** | Dataflow (Rust core) | Good performance, stateful operators |
| **Apache Flink** (PyFlink) | Full stream processor | Most powerful, heaviest to operate |
| **Plain `confluent-kafka`** | Manual | Best for simple stateful work |

This module uses **plain `confluent-kafka`** for the exercises, because the
concepts transfer and hand-rolling a windowed aggregate teaches you what a
framework is actually doing.

### Hand-rolled tumbling window

```python
import time, json
from collections import defaultdict

WINDOW_MS = 60_000
GRACE_MS  = 10_000

windows = defaultdict(lambda: defaultdict(int))   # window_start -> key -> count
watermark = 0                                      # highest event time seen

def window_start(event_time_ms):
    return (event_time_ms // WINDOW_MS) * WINDOW_MS

for msg in consume():
    event = json.loads(msg.value())
    et = event["timestamp_ms"]
    watermark = max(watermark, et)

    ws = window_start(et)
    if ws + WINDOW_MS + GRACE_MS < watermark:
        late_dropped.inc()          # too late — count it, never drop silently
        continue
    windows[ws][event["user_id"]] += 1

    # emit and close any window fully past its grace period
    for w in sorted(list(windows)):
        if w + WINDOW_MS + GRACE_MS < watermark:
            emit(w, windows.pop(w))
```

The **watermark** — the highest event time seen — is what lets you decide a
window is complete. Note it advances only when records arrive: a quiet
partition never closes its windows, which is why real frameworks also emit
periodic punctuations based on wall clock.

## Command reference

| Concern | Approach |
|---|---|
| Window start | `(event_time // window_ms) * window_ms` |
| Watermark | `max(seen_event_times)` per partition |
| Close a window | `window_end + grace < watermark` |
| Table from topic | consume compacted topic into a dict (module 04) |
| Stream-table join | look up the dict per incoming record |
| Co-partitioning | same key **and** same partition count on both topics |
| Read record timestamp | `msg.timestamp()` → `(type, ms)` |
| Pause a partition | `consumer.pause([TopicPartition(...)])` |
| Local state that survives restart | RocksDB / SQLite + a changelog topic |

## Hands-on exercises

Use the broker from module 00.

```bash
kt --create --topic clicks --partitions 3
kt --create --topic users --partitions 3 --config cleanup.policy=compact
```

### 1. Tumbling count by event time

Produce click events carrying their own `timestamp_ms`, deliberately shuffled
so they arrive out of order. Implement the tumbling window above with a
1-minute window.

Expected: counts bucket by *event* time, not arrival order — so shuffling the
input doesn't change the output. Verify by running twice with different
shuffles and diffing the results.

### 2. Show processing time is not replayable

Rewrite the same aggregation keyed on `time.time()` instead of the event's
timestamp. Replay the identical input.

Expected: completely different bucket boundaries each run. This is the
argument for event time in one experiment.

### 3. Measure your actual lateness

For each record, compute `processing_time - event_time` and record a
histogram (p50/p95/p99/max).

Expected: a long tail. Use the p99 to choose a grace period, and note how
badly a guessed value would have performed compared to the measured one.

### 4. Drop late data — visibly

Produce a record whose event time falls in a window closed long ago.

Expected: it's dropped and your `late_dropped` counter increments. Then
remove the counter and observe how invisible the loss becomes — that's the
mistake being demonstrated.

### 5. Build a stream-table join

Populate `users` (compacted, keyed by `user_id`) with tier data. Build the
table in memory (module 04, exercise 5), then enrich each `clicks` record
with the user's tier.

Expected: enriched output. Now update a user's tier mid-stream and confirm
subsequent clicks pick up the new value — demonstrating that the join result
depends on *when* it ran.

### 6. Break the join with wrong partitioning

Recreate `users` with **6** partitions while `clicks` has 3, and run a
partitioned (not broadcast) join — i.e. each consumer instance builds only
its assigned partitions of the table.

Expected: many lookups miss, because a user's click and that user's profile
land on different partitions handled by different instances. Fix by making
partition counts equal and confirm the misses vanish. Write one sentence on
why a single-instance in-memory table hides this bug entirely — and why that
makes it a nasty production-only failure.

### 7. Session windows

Implement session windowing with a 30-second inactivity gap over the click
stream.

Expected: sessions close only after the gap elapses, and a burst of activity
extends the current session rather than starting a new one. Compare to a
tumbling window over the same data and note how differently they segment it.

### 8. Diagnose and fix: the dashboard that undercounts

An analytics consumer computes 1-minute order counts and writes them to a
dashboard. Numbers look right during the day but are consistently ~15% low
for the last hour, and the shortfall "fills in" later. The consumer uses a
tumbling window on event time with no grace period, emitting each window as
soon as it sees an event with a later timestamp.

<details>
<summary>Solution</summary>

**No grace period, combined with out-of-order arrival.** The window is closed
and emitted the instant a single event with a later timestamp appears — but
other events belonging to that window are still in flight (different
partitions, producer batching, retries, mobile clients with poor
connectivity). Every one of those arrives after the window was emitted and is
discarded, so recent windows are systematically undercounted.

It "fills in later" because the dashboard is presumably re-reading or
recomputing older windows from a different path — which masks the bug for
historical data and leaves it visible only at the head.

Fixes:

1. Add a grace period based on the *measured* lateness distribution
   (exercise 3), not a guess — p99 of `processing_time - event_time`.
2. Emit windows as **updates rather than final values** so a late arrival
   corrects the published number, instead of treating first emission as
   final.
3. Count and alert on late-dropped records; the absence of this metric is why
   a 15% error went unexplained.

A subtler contributor: closing windows on "an event with a later timestamp"
uses a per-record watermark that jumps around across partitions. The
watermark should be the minimum across assigned partitions, not the maximum
of whatever arrived last, or one fast partition prematurely closes windows
for all the others.

</details>

### 9. Clean up

```bash
kt --delete --topic clicks; kt --delete --topic users
```

## Independent challenge

No solution given. Build a real-time fraud signal: emit an alert when a
single card is used in **3 or more distinct countries within 10 minutes**.
Transactions arrive on a partitioned topic with event timestamps, can be up
to 2 minutes late, and volume is 20,000/sec.

Decide the window type and size, the partition key, and how you hold state
without unbounded memory growth. Then handle the parts that make this
genuinely hard: what happens when a card's transactions span a partition
rebalance mid-window; whether an alert should fire again if a 4th country
appears; and how you avoid alerting twice for the same card when the consumer
restarts and replays.

<details>
<summary>Stuck? One hint</summary>

Key by card number so all of one card's transactions land on one partition —
that makes the state local and the window computable without cross-partition
coordination, and it's the same "your key is your ordering and locality
guarantee" point from module 00. A hopping or sliding window fits better than
tumbling here, because a fixed 10-minute boundary would miss three countries
spanning two adjacent buckets. For the restart/replay duplicate-alert
problem, the alert itself needs an idempotency key derived deterministically
from the card plus window (module 02) — so re-emitting it after a replay is a
no-op downstream rather than a second phone call to the customer.

</details>

## Common mistakes & troubleshooting

- **Using processing time when results must be reproducible.** Replays
  produce different numbers.
- **No grace period.** Systematically undercounts recent windows as late
  data is discarded.
- **Dropping late records silently.** Always emit a metric; a silent drop is
  a silently wrong answer.
- **Treating the first window emission as final.** Publish updates so late
  arrivals can correct the value.
- **Watermark as max across all partitions.** One fast partition closes
  windows prematurely for the slow ones; use the minimum across assigned
  partitions.
- **Joining topics that aren't co-partitioned.** Different partition counts
  or different keys means matching records never meet — and the join just
  silently returns nothing.
- **Unbounded state.** Windows and session state must be evicted once closed,
  or memory grows forever.
- **Assuming a stream-table join is reproducible.** The table's value changes
  over time, so replays enrich differently.
- **Reaching for a framework too early.** A consumer loop plus a compacted
  topic covers a surprising amount, with far less to operate.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Explain the stream/table duality and which Kafka cleanup policy
   corresponds to each.
2. Why must reproducible aggregations use event time rather than processing
   time?
3. What is a watermark, and why should it be the minimum across assigned
   partitions rather than the maximum?
4. What does a grace period trade off, and how should you choose its value?
5. Why must a stream-stream join be windowed, while a stream-table join need
   not be?
6. What is co-partitioning, why is it required for joins, and what's the
   symptom when it's violated?
7. Why is a stream-table join not reproducible on replay?
8. Name three situations where a plain consumer loop is sufficient and a
   framework isn't warranted.

</summary>
</details>

<details>
<summary>Show answers</summary>

1. A stream is an append-only sequence of facts; a table is the latest value
   per key. Aggregating a stream by key produces a table, and emitting a
   table's changes produces a stream — they're two views of the same data. A
   `cleanup.policy=delete` topic corresponds to a stream, and a
   `cleanup.policy=compact` topic corresponds to a table.
2. Because processing time depends on when your code happened to see the
   record, so a replay buckets everything by the replay's clock rather than
   the original one and produces different results. Event time is carried in
   the record, so the same input always yields the same output regardless of
   when it's processed.
3. The watermark is the system's estimate of how far event time has
   progressed — typically the highest event time seen — and it's what decides
   a window is complete. It should be the minimum across assigned partitions
   because taking the maximum lets one fast or clock-skewed partition advance
   the watermark past windows whose data is still arriving on slower
   partitions, closing them prematurely and dropping valid records.
4. It trades result completeness against latency and memory: a longer grace
   period captures more late-arriving records but delays finality and keeps
   more windows in memory. Choose it by measuring the actual distribution of
   `processing_time - event_time` and picking something like the p99, rather
   than guessing.
5. Because both sides of a stream-stream join are unbounded, so without a
   window you'd have to buffer infinite data to check for future matches. A
   stream-table join only needs the table's *current* value for the incoming
   record's key, which is bounded by the number of keys, not by time.
6. Co-partitioning means both topics use the same key and have the same
   partition count, so records with matching keys land on the same partition
   number and are therefore handled by the same task. It's required because a
   join task only sees its own partitions. When violated, matching records
   are processed by different instances and the join silently produces no
   output rather than raising an error.
7. Because the table is mutable: the value looked up depends on the table's
   state at the moment the join executed. Replaying an old stream against
   today's table enriches records with today's values rather than the ones
   that were current when the events originally occurred.
8. When processing is per-record and stateless (transform, filter, route);
   when state is small enough to hold in memory or a local dict; and when you
   can afford to rebuild state on restart by replaying a compacted topic.

</details>

## Further reading & sources

- [Confluent: Streams and tables](https://developer.confluent.io/courses/kafka-streams/streams-and-tables/) - the duality, explained with Kafka Streams semantics.
- [Kafka Streams: Windowing](https://kafka.apache.org/documentation/streams/developer-guide/dsl-api.html#windowing) - tumbling, hopping, session and sliding windows with grace periods.
- [Tyler Akidau: Streaming 101 / 102](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/) - the canonical treatment of event time, watermarks and late data.
- [Quix Streams](https://quix.io/docs/quix-streams/introduction.html) and [Bytewax](https://bytewax.io/docs) - the actively-maintained Python stream-processing options.
- [Module 04](../04-retention-compaction-and-topics-as-state/README.md) - compacted topics, which are the table half of this module.

## Next

[06-operating-kafka-lag-sizing-and-reliability](../06-operating-kafka-lag-sizing-and-reliability/README.md) —
the system now computes the right answers. Module 06 is about knowing, in
production, whether it still is.
