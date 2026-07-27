# Module 00: Capacity Estimation and Back-of-Envelope Math

## Why this matters

Every system-design answer is secretly a *sizing* argument. "We'll cache it"
means nothing until you can say *how much* — 10 GB fits in one Redis node's
memory, 10 TB does not and forces you to shard. "We'll just query the database"
is fine at 100 writes/second and a disaster at 100,000. The entire reason
interviewers ask you to estimate capacity up front is that the numbers *decide
the architecture*: they tell you whether one machine is enough or you need a
fleet, whether data fits in RAM or must live on disk, whether a single region
works or you're forced into geo-distribution. Skip the math and every later
decision is a guess.

The good news is that nobody expects precision. This is **back-of-envelope**
estimation — you want the right *order of magnitude*, the right power of ten, not
a spreadsheet. Is peak QPS in the hundreds, the thousands, or the millions? Is
five-year storage measured in gigabytes, terabytes, or petabytes? Getting that
power of ten right is the difference between a design that holds up and one that
falls apart the moment the interviewer probes it. This module gives you the
handful of numbers worth memorizing, a repeatable estimation recipe (users →
requests → bandwidth → storage → memory), and enough practice that you can do it
out loud, on a whiteboard, without a calculator.

## Concepts

### The estimation recipe: from users to infrastructure

Almost every capacity estimate follows the same chain, and doing it in this
fixed order keeps you from skipping a step under pressure:

1. **Users → actions.** Start from a given user count (DAU — daily active users)
   and an assumed action rate. "200M DAU, each posts 2 tweets/day" → 400M
   writes/day.
2. **Actions/day → average QPS.** Divide by the seconds in a day. The number to
   memorize: **~100,000 seconds/day** (86,400, round to 10⁵). So 400M/day ÷ 10⁵
   ≈ **4,000 writes/second average**.
3. **Average → peak QPS.** Real traffic is bursty; multiply average by a **peak
   factor** of 2–10× (use ~3× unless told otherwise). 4,000 × 3 ≈ **12,000
   writes/second peak**.
4. **Reads vs. writes.** Most systems are read-heavy. Apply a **read:write
   ratio** (100:1 for a social feed, 10:1 for many apps). 4,000 writes → 400,000
   reads/second average.
5. **QPS → bandwidth.** Multiply request rate by average payload size.
6. **Data/day → storage over N years.** Multiply per-item size by item rate by
   the retention window, then add a replication factor.
7. **Hot set → memory.** Estimate what fraction of data is "hot" (often via the
   80/20 rule) to size your cache.

Every one of those steps is a single multiply or divide. The skill is doing them
in order and not dropping a factor of ten.

### The numbers worth memorizing

You can't estimate if you have to derive every constant. Memorize this short
list; everything else you compute from it.

- **Seconds in a day ≈ 86,400 ≈ 10⁵** (the single most useful one).
- **Powers of two → data sizes:** 2¹⁰ = 1 thousand (KB), 2²⁰ = 1 million (MB),
  2³⁰ = 1 billion (GB), 2⁴⁰ = 1 trillion (TB), 2⁵⁰ = PB. Each step is ~×1000.
- **Typical payload sizes:** a short text record (tweet, chat message) ~ hundreds
  of bytes to ~1 KB; a JSON API response ~ 1–10 KB; a photo ~ 200 KB–1 MB; a
  minute of video ~ tens of MB.
- **Char = 1 byte** (ASCII/UTF-8 common case); a UUID ~ 16 bytes raw, 36 as a
  string; a timestamp ~ 8 bytes; a 64-bit id ~ 8 bytes.
- **One commodity server**, ballpark: tens of thousands of simple requests/sec if
  CPU-bound and cached; a single SQL database comfortably does *thousands* of
  writes/sec, not hundreds of thousands.
- **Latency ladder (Jeff Dean's numbers, rounded):** L1/L2 cache ~ 1 ns, main
  memory ~ 100 ns, SSD random read ~ 100 µs (100,000 ns), rotational disk seek ~
  10 ms, same-datacenter round trip ~ 0.5 ms, cross-continent round trip ~ 100+
  ms. The load-bearing takeaways: **memory is ~1000× faster than SSD, SSD is
  ~100× faster than a disk seek, and a network hop across the world costs more
  than a million memory accesses.**

### Estimating storage and bandwidth

Storage is a rate times a retention window. Write down the per-item size, the
items-per-second (or per-day), the retention period, and the replication factor,
then multiply:

```
storage = item_size × item_rate × retention_window × replication_factor
```

Worked example — a URL shortener storing 100M new URLs/day, each row ~500 bytes,
kept 5 years, replicated 3×:

```
per day    = 100M × 500 B          = 5 × 10^10 B  = 50 GB/day
per 5 yr   = 50 GB × 365 × 5       ≈ 91 TB
replicated = 91 TB × 3             ≈ 274 TB  → call it ~300 TB
```

Bandwidth is QPS times payload:

```
bandwidth = qps × avg_payload_size
```

If that same shortener serves 400K redirects/sec at ~500 bytes each: 400,000 ×
500 B = 2 × 10⁸ B/s = **200 MB/s ≈ 1.6 Gbps** of egress. That single number tells
you whether one server's NIC can cope (no) and that you need a CDN or load-
balanced fleet.

### Estimating QPS, servers, and memory

Turn a peak QPS into a server count by dividing by *what one server can handle*:

```
servers ≈ peak_qps / per_server_capacity   (then add headroom + redundancy)
```

If peak read QPS is 400,000 and one cache-backed app server does ~20,000
req/sec, you need ~20 servers for load — round *up*, add redundancy (N+2), and
you're provisioning ~24. Never provision for exactly peak: leave headroom for
growth, deploys, and failures.

For **memory / cache sizing**, apply the 80/20 rule — roughly 20% of data serves
80% of requests, so cache the hot 20%:

```
cache_size ≈ 0.2 × daily_data_touched
```

If a service reads 100 GB of distinct data per day, caching the hot ~20 GB
captures most requests and fits comfortably in a single large Redis node's RAM —
recall the cache-aside pattern and hot-key thinking from **05-caching-and-
performance**. If the hot set were 2 TB instead, no single node holds it and
you're into a *distributed* cache (module 04 of this track).

### Sanity checks and orders of magnitude

The point of the exercise isn't the final digit — it's the *shape*. After every
estimate, sanity-check it:

- **Does the power of ten feel right?** 12,000 writes/sec for a global social
  network — plausible. 12 writes/sec — too low, you dropped a factor. 12M/sec —
  too high, that's more than Twitter's real peak; recheck.
- **Does it change the architecture?** If your storage estimate is 50 GB, a
  single database is fine and sharding is over-engineering. If it's 500 TB, one
  box is impossible and sharding is mandatory. State that conclusion — the number
  exists to drive a decision.
- **State your assumptions out loud.** "Assuming 200M DAU, 2 posts each, 100:1
  read:write, 3× peak" — the interviewer cares far more that your assumptions are
  explicit and your arithmetic is consistent than whether DAU is really 180M or
  220M. Wrong-but-stated beats right-but-hidden.

## Command reference

Numbers and formulas to memorize. This is your whiteboard cheat sheet.

| Quantity | Value to use | Note |
|---|---|---|
| Seconds per day | ~86,400 ≈ **10⁵** | The single most useful constant |
| Seconds per month | ~2.5 × 10⁶ | 30 × 86,400 |
| KB / MB / GB / TB / PB | 10³ / 10⁶ / 10⁹ / 10¹² / 10¹⁵ | Decimal approx of 2¹⁰·ⁿ |
| Peak factor | **2–10×** average (default ~3×) | Traffic is bursty |
| Read:write ratio | 10:1 typical, **100:1** social feed | Most systems read-heavy |
| Char / ASCII byte | 1 byte | |
| 64-bit id / timestamp | 8 bytes | |
| UUID | 16 B raw, 36 B as string | |
| Short text record | ~0.1–1 KB | tweet, chat message |
| Photo / minute of video | ~0.2–1 MB / ~tens of MB | |
| Single SQL DB write ceiling | ~**thousands**/sec | not hundreds of thousands |
| Cached app server | ~10⁴–10⁵ req/sec | order of magnitude |
| Hot-set fraction (80/20) | ~20% of data serves ~80% of reads | cache sizing |

Latency ladder (rounded, memorize the *ratios* not the digits):

| Operation | Time | Relative |
|---|---|---|
| L1 cache reference | ~1 ns | 1× |
| Main memory reference | ~100 ns | 100× |
| SSD random read | ~100 µs (10⁵ ns) | ~1,000× memory |
| Same-datacenter round trip | ~0.5 ms | |
| Rotational disk seek | ~10 ms | |
| Cross-continent round trip | ~100+ ms | ~10⁶× memory |

The four formulas:

```
avg_qps    = actions_per_day / 10^5
peak_qps   = avg_qps × peak_factor            (2–10, default 3)
storage    = item_size × item_rate × retention × replication_factor
bandwidth  = qps × avg_payload_size
servers    = peak_qps / per_server_capacity   (round up, add N+2 redundancy)
cache_size = 0.2 × daily_distinct_data_touched
```

## Hands-on exercises

Do these on paper (or a whiteboard) with no calculator — that's the skill. Write
your assumptions first, then the arithmetic, then a one-line sanity check.

### 1. Warm up: QPS from DAU

A photo-sharing app has **500M DAU**, and each user uploads **1 photo/day** on
average. Compute the average upload QPS, then apply a 3× peak factor for peak
upload QPS. Then, given a **100:1** read:write (view:upload) ratio, compute peak
*view* QPS. Expected order of magnitude: uploads in the thousands/sec, views in
the hundreds-of-thousands/sec.

### 2. Storage over five years

Each of those photos averages **400 KB**, plus a **1 KB** metadata row, kept for
**5 years**, replicated **3×**. Estimate total storage. State it in TB or PB and
then answer the architectural question: does this fit on one machine, and what
does that imply?

### 3. Bandwidth and the NIC

Using your peak *view* QPS from exercise 1 and the 400 KB photo size, estimate
peak egress bandwidth in GB/s and Gbps. A single server NIC is ~10–25 Gbps.
Conclude, in one sentence, what infrastructure this forces (hint: recall CDNs and
edge caching from **05-caching-and-performance**).

### 4. Memory / cache sizing

The app serves **100 TB** of distinct photos over a typical day but requests
follow an 80/20 distribution. Estimate the hot-set size to cache. A large cache
node holds ~256 GB RAM. Does the hot set fit in one node, and if not, roughly how
many nodes — and what does that tell you about needing module 04's distributed
cache?

### 5. Server count from QPS

Peak view QPS is ~1.5M/sec (use your own number if different). One CDN/cache-
backed edge server sustains ~50,000 req/sec. How many edge servers do you need
for load alone, and how many after adding N+2 redundancy and 30% growth
headroom? Round sensibly.

### 6. The latency-ladder decision

You have a read path that currently does one **rotational-disk seek** per
request. You're considering moving the hot data to (a) SSD or (b) RAM. Using the
latency ladder, state the *approximate* speedup of each move, and explain which
one turns a 10 ms read into a sub-millisecond read. Tie it back to *why* caching
in memory is the highest-leverage change.

### 7. A write-heavy twist

An IoT platform ingests telemetry from **10M devices**, each sending **1
reading every 10 seconds**, each reading **100 bytes**. Compute sustained write
QPS and daily write volume. Then answer: can a single SQL primary absorb this
write rate (recall the DB write ceiling), and if not, name the technique from
**04-databases-and-data-layer** you'd reach for.

### 8. Diagnose and fix a flawed estimate

A candidate presents this estimate for a chat app. Find **every** error and
redo it correctly.

> "We have 50M daily users sending 40 messages each. That's 50M × 40 = 2
> *billion* messages a day. Dividing by the 3,600 seconds in a day gives about
> 550,000 messages/second average. Peak is the same since chat is steady. Each
> message is 1 KB, so storage per day is 2 billion × 1 KB = 2 GB. Over 5 years
> that's about 3.6 TB, so a single database is clearly fine."

<details>
<summary>Solution</summary>

Three concrete errors, one questionable assumption, and a wrong conclusion:

1. **Wrong seconds/day.** They used 3,600 (that's seconds in an *hour*). It's
   ~86,400 ≈ 10⁵. Correct average QPS = 2 × 10⁹ / 10⁵ = **20,000 msg/sec**, not
   550,000. (They were off by ~24× — exactly the hour/day confusion.)
2. **No peak factor.** "Peak is the same since chat is steady" is wrong — chat is
   *very* bursty (evenings, events). Apply ~3×: peak ≈ **60,000 msg/sec**.
3. **Storage arithmetic is off by 10⁶.** 2 × 10⁹ messages × 1 KB (10³ B) = 2 ×
   10¹² B = **2 TB/day**, not 2 GB. They dropped the KB→byte factor entirely.
4. **Five-year storage.** 2 TB/day × 365 × 5 ≈ **3.65 PB**, not 3.6 TB — again
   off by ~1000 because of the per-day error. With 3× replication, ~11 PB.
5. **Wrong conclusion.** "A single database is clearly fine" follows only from
   the broken 3.6 TB number. The real ~3.65 PB (11 PB replicated) *mandates*
   sharding and tiered/cold storage — the exact opposite decision.

Lesson: a single dropped factor of ten (or here, several) doesn't just make the
number wrong — it flips the architecture. Always sanity-check the power of ten
against reality before drawing a conclusion.

</details>

## Independent challenge

No solution given. Using only the recipe and the memorized numbers, produce a
complete capacity estimate for a **global ride-hailing app** — the kind of
back-of-envelope pass you'd open a **01-the-system-design-interview-framework**
session with. Assume 100M DAU, each taking 2 rides/day, and that an active ride
sends a GPS location update every 4 seconds for an average 15-minute trip.
Estimate: (a) ride-request write QPS and peak; (b) sustained location-update
write QPS (this is the scary number — it's not driven by ride count but by
*concurrent active trips*); (c) storage per day if each location point is ~100
bytes and each ride record ~2 KB; (d) five-year storage with 3× replication; and
(e) one sentence per number on what architectural decision it forces. Write every
assumption down first.

<details>
<summary>Hint</summary>

The location-update rate is the trap and the whole point. Don't multiply total
daily rides by updates-per-ride and divide by seconds — that under-counts the
sustained load because trips overlap. Instead compute the number of *concurrent
active trips* at peak (rides/day × trip_duration / seconds_in_day, times your
peak factor) and multiply by the per-trip update frequency (one every 4 s =
0.25/sec). That concurrent-trips number is what actually hammers your ingestion
pipeline, and it's why real systems put location updates on a streaming/queue
path (recall background processing from **06-background-processing-and-
realtime**) instead of straight into a SQL primary.

</details>

## Common mistakes & troubleshooting

- **Seconds-per-day errors.** Using 3,600 (an hour) or 24 instead of ~86,400 ≈
  10⁵. This single mistake is the most common source of a 24× or 3,600× error.
  Memorize 10⁵ and never derive it under pressure.
- **Dropping the KB→byte (or MB→byte) factor.** "2 billion × 1 KB = 2 GB" — no,
  it's 2 TB. Track your units explicitly; write the exponent every time.
- **Forgetting the peak factor.** Provisioning for *average* QPS guarantees you
  fall over during the daily peak. Always multiply by 2–10×.
- **Ignoring replication and overhead.** Raw data × replication factor (usually
  3×), plus index/overhead, is the real storage bill — not the raw number.
- **Chasing false precision.** Grinding out 86,400 × 365 × 4.7 by hand wastes
  whiteboard time and impresses no one. Round aggressively (10⁵, ×400, ×1000) and
  keep moving; the order of magnitude is the deliverable.
- **Not converting the number into a decision.** An estimate that just sits there
  is useless. Every number must end in "...therefore [one DB is fine / we must
  shard / we need a CDN / it fits in one cache node]."
- **Concurrent-vs-total confusion.** For streaming loads (locations, live video,
  websockets), the load is driven by *concurrent* sessions, not total daily
  count. Compute concurrency, not throughput-over-a-day.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the approximate number of seconds in a day, rounded to a power of ten,
   and why is it the single most useful constant in capacity estimation?
2. State the full recipe, in order, for going from a DAU figure to a peak read
   QPS number. Name every step.
3. A service does 8.6 billion writes per day. Without a calculator, what's the
   average write QPS, and what's a reasonable peak?
4. Give the storage formula, and explain why leaving out the replication factor
   understates your real storage bill.
5. On the latency ladder, roughly how much faster is a main-memory reference than
   an SSD random read, and than a rotational-disk seek? Why does that make
   in-memory caching the highest-leverage optimization?
6. Why is stating your assumptions out loud more important than getting DAU
   exactly right?
7. For a live-video or GPS-tracking system, why is *concurrent sessions* the
   right load driver rather than total daily sessions?

<details>
<summary>Answers</summary>

1. ~86,400, rounded to **10⁵**. It converts any per-day action count into an
   average per-second rate with a single division, which is the backbone of
   every QPS estimate.
2. DAU → actions/day (× actions per user) → average QPS (÷ 10⁵) → peak QPS
   (× peak factor 2–10) → reads (× read:write ratio). Five steps: users, actions,
   average, peak, read multiplier.
3. 8.6 × 10⁹ / 10⁵ = **~86,000 writes/sec average** (≈10⁵). Peak at ~3× ≈
   **~250,000–300,000 writes/sec**. (This is genuinely large — it implies
   sharding and a write-optimized path.)
4. `storage = item_size × item_rate × retention_window × replication_factor`.
   Omitting replication (typically ×3) understates the bill by that factor, plus
   you'd also miss index/overhead — so you'd under-provision disk by 3× or more.
5. Memory (~100 ns) is **~1,000× faster than SSD** (~100 µs) and **~100,000×
   faster than a disk seek** (~10 ms). Moving the hot set from disk/SSD into RAM
   collapses a multi-millisecond read into a sub-microsecond one, which is why
   caching in memory beats almost every other single optimization.
6. Because the interviewer is evaluating your *reasoning*, and the arithmetic is
   only consistent (and checkable) if the assumptions are explicit. A stated
   assumption that's slightly off still yields a defensible, correct-shaped
   answer; a hidden one makes the whole estimate unauditable.
7. Because those loads are sustained by sessions that overlap in time — the
   pressure on the system at any instant is the number of sessions *currently
   active*, each emitting a steady stream, not the total that started that day.
   Total-per-day divided by seconds under-counts the real concurrent throughput.

</details>

## Next

[01-the-system-design-interview-framework](../01-the-system-design-interview-framework/README.md)
— you can now put numbers on a system; next you'll learn the *structure* that
wraps those numbers into a complete whiteboard answer: how to scope the problem
with requirements, when to drop in your capacity estimate, how to move from a
high-level diagram to a deep-dive, and how to talk through tradeoffs the way
interviewers actually score.
