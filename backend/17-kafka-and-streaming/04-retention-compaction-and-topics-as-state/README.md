# Module 04: Retention, Compaction and Topics as State

## Why this matters

Every topic silently answers a question you may never have asked: how long
does this data live? Get it wrong in one direction and you delete the events
a new consumer needed to bootstrap. Get it wrong in the other and you pay to
store terabytes nobody reads.

But the more interesting idea in this module is the second one. A **compacted
topic** retains the latest value per key indefinitely — which turns a Kafka
topic into a durable, replayable key-value store. That single property is
what makes event sourcing, CQRS read models, and stream-table joins possible,
and it's why "Kafka as a database" is a defensible claim in narrow
circumstances rather than pure hype.

## Concepts

### Two cleanup policies

```
cleanup.policy=delete    (default)  — drop whole segments once they age out
cleanup.policy=compact              — keep the latest record per key, forever
cleanup.policy=compact,delete       — compact, and also drop very old segments
```

```
DELETE                           COMPACT
offset  key    value             offset  key    value
0       A      1                 (0 A=1 removed — superseded)
1       B      2                 (1 B=2 removed — superseded)
2       A      3                 3       C      4
3       C      4                 5       A      5
4       B      6         ──▶     4       B      6
5       A      5
                                 latest value per key survives; offsets
older segments deleted           are NOT renumbered — gaps are normal
by time or size
```

Compaction never renumbers offsets. Consumers must tolerate gaps — which they
do naturally, since they always read forward from wherever they are.

### Retention settings

| Setting | Default | Meaning |
|---|---|---|
| `retention.ms` | 604800000 (7d) | Delete segments older than this |
| `retention.bytes` | -1 (unlimited) | Delete oldest segments beyond this size **per partition** |
| `segment.ms` | 604800000 | Roll a new segment after this long |
| `segment.bytes` | 1073741824 (1 GB) | Roll a new segment at this size |

The trap: **retention is enforced per segment, and only on closed segments.**
The active segment is never deleted, so a topic with `retention.ms=60000` and
a 1 GB `segment.bytes` will happily hold data for days — because the segment
hasn't rolled yet. If you want fine-grained retention, you must lower
`segment.ms`/`segment.bytes` too. This is the single most common "retention
isn't working" support question.

Also note `retention.bytes` is **per partition**, not per topic. Setting 10 GB
on a 50-partition topic budgets 500 GB.

### Compaction mechanics

Compaction runs in the background on **closed** segments only, so the most
recent records always have duplicates by key. Relevant knobs:

| Setting | Meaning |
|---|---|
| `min.cleanable.dirty.ratio` (0.5) | Only compact when ≥50% of the log is "dirty" (superseded) |
| `min.compaction.lag.ms` (0) | Don't compact a record until it's this old |
| `max.compaction.lag.ms` | Force compaction even if the dirty ratio isn't met |
| `delete.retention.ms` (86400000) | How long tombstones survive after compaction |

Consequences worth internalising: compaction is **eventual**, never
immediate; you cannot rely on "one record per key" being true at any given
moment; and a low dirty ratio (e.g. 0.1) compacts more aggressively at the
cost of more I/O.

### Tombstones: deletion in a compacted topic

To delete a key, produce a record with that key and a **null value**:

```python
producer.produce("user-profiles", key=b"user-42", value=None)   # tombstone
```

The tombstone marks the key deleted. Consumers see it and remove the key from
their local state. After `delete.retention.ms`, compaction removes both the
tombstone and the key's history.

That window exists for a reason: a consumer that was offline must still see
the tombstone when it comes back, or it will keep a key that everyone else
has deleted. Set `delete.retention.ms` longer than your worst realistic
consumer downtime — the default 24 hours is often too short for a service
that can be down over a weekend.

**A null value is never "just an empty message" on a compacted topic.** If
your serializer emits null for an empty object, you will delete keys by
accident.

### Compacted topics as state

This is the pattern that matters:

```
user-profiles (compacted, keyed by user_id)
    ↓ consumer reads from offset 0 on startup
    ↓ builds an in-memory dict / local RocksDB
    ↓ then follows the tail for live updates
in-process materialised view — no database required
```

Properties you get for free:

- **Rebuildable.** Lose the local state, replay the topic, get it back.
- **Bounded.** Size is proportional to the number of *keys*, not events.
- **Shareable.** Any number of services can build their own view.
- **Ordered per key.** The last write per key wins, deterministically.

This is exactly the "changelog" mechanism Kafka Streams uses internally for
state stores (module 05), and the log side of CQRS (track 10).

The limits, which matter just as much: you can only look up **by key**
(no queries, no secondary indexes, no aggregation without doing it yourself),
bootstrapping is O(number of keys) so a huge topic means slow startup, and
there are no transactions across keys.

### Choosing a policy

| Topic contains | Policy | Why |
|---|---|---|
| Business events (`OrderPlaced`) | `delete`, long retention | History is the point; every event matters |
| Current state (`user-profiles`) | `compact` | Only the latest value per key matters |
| Metrics / logs | `delete`, short retention | High volume, low individual value |
| Audit trail | `delete`, very long / infinite | Regulatory; nothing may be lost |
| CDC from a database | `compact` | Mirrors current rows, keyed by PK |
| State + bounded history | `compact,delete` | Latest per key, but drop ancient tombstones |

The question that decides it: **would a new consumer need every record, or
only the latest per key?** Events → delete. State → compact.

### Infinite retention and tiered storage

`retention.ms=-1` keeps data forever. That's legitimate for event sourcing
and audit, but expensive on broker disks. Tiered storage (KIP-405, GA in
Kafka 3.9+) offloads older segments to object storage, so brokers keep only
recent data locally while historical reads still work — transparently, at
higher latency. It's the feature that makes "keep everything" affordable.

## Command reference

| Concern | Command |
|---|---|
| Create compacted topic | `kafka-topics.sh --create --topic t --config cleanup.policy=compact ...` |
| Change policy | `kafka-configs.sh --alter --entity-type topics --entity-name t --add-config cleanup.policy=compact` |
| Set retention | `--add-config retention.ms=604800000` |
| Force small segments (for testing) | `--add-config segment.ms=1000,segment.bytes=1024` |
| Aggressive compaction | `--add-config min.cleanable.dirty.ratio=0.01` |
| Tombstone lifetime | `--add-config delete.retention.ms=604800000` |
| Show effective config | `kafka-configs.sh --describe --entity-type topics --entity-name t` |
| Infinite retention | `--add-config retention.ms=-1` |
| Produce a tombstone | `producer.produce(topic, key=k, value=None)` |
| Inspect a segment | `kafka-dump-log.sh --files /var/lib/kafka/data/t-0/00000000000000000000.log --print-data-log` |

## Hands-on exercises

Use the broker from module 00.

### 1. Prove retention doesn't apply to the active segment

```bash
kt --create --topic ret-test --partitions 1 \
   --config retention.ms=10000            # 10 seconds
```

Produce 100 records, wait 60 seconds, then count them.

Expected: **all 100 are still there.** Retention only removes closed
segments, and the active one hasn't rolled. Now:

```bash
kc --alter --entity-type topics --entity-name ret-test \
   --add-config segment.ms=5000
```

Produce a few more records to force a roll, wait, and re-count.

Expected: the old records finally disappear. Write down why "set
`retention.ms` and nothing happened" is one of the most common Kafka
questions.

### 2. Build a compacted topic and watch it compact

```bash
kt --create --topic profiles --partitions 1 \
   --config cleanup.policy=compact \
   --config segment.ms=1000 \
   --config min.cleanable.dirty.ratio=0.01 \
   --config delete.retention.ms=10000
```

Produce many updates for a few keys:

```python
for i in range(500):
    p.produce("profiles", key=f"user-{i % 5}".encode(), value=f"v{i}".encode())
p.flush()
```

Count records immediately, then again after ~45 seconds of idle time (produce
one extra record to force a segment roll).

Expected — and read this carefully, because it's the point of the exercise:

```
log end offset before compaction:  500
records still in log:              303      <-- NOT 5
distinct keys:                     5
latest per key: {'SKU-0': 1, 'SKU-1': 504, 'SKU-2': 503, ...}
```

Compaction reduced the log, but **303 records remain, not 5**. That is
correct behaviour, not a misconfiguration: compaction only processes closed
segments, runs in the background, and never touches the active segment. What
you *are* guaranteed is that reading the whole topic yields the correct
latest value for every key — which is exactly what a materialised view needs.

The lesson: never write code that assumes a compacted topic contains one
record per key. Assume instead that replaying it converges to one value per
key, with the last write winning.

### 3. Confirm offsets are not renumbered

Read the compacted topic with `print.offset=true`.

Expected: offsets have large gaps (e.g. 495, 496, 497, 498, 499) rather than
0-4. Explain in one sentence why this is harmless for consumers.

### 4. Delete a key with a tombstone

```python
p.produce("profiles", key=b"user-3", value=None)
p.flush()
```

Consume from the beginning.

Expected: `user-3` appears with a null value. After compaction plus
`delete.retention.ms`, both the tombstone and its history vanish. Confirm by
re-reading later.

### 5. Build a materialised view

Write a consumer that reads `profiles` from offset 0 into a dict, deleting
keys on null values, then follows the tail:

```python
state = {}
while True:
    msg = c.poll(1.0)
    if msg is None or msg.error():
        continue
    k = msg.key().decode()
    if msg.value() is None:
        state.pop(k, None)          # tombstone
    else:
        state[k] = msg.value().decode()
```

Kill and restart it.

Expected: the state rebuilds identically from the log, with no database
involved. That's the whole "topic as state" idea in fifteen lines.

### 6. Prove an empty value deletes a key by accident

Produce `value=b""` (empty bytes) and then `value=None` for two different
keys.

Expected: only the `None` one is a tombstone; the empty-bytes one is a normal
record with an empty payload. Then check what *your* serializer does with an
empty object — if it produces `None`, you have an accidental-deletion bug
waiting.

### 7. Diagnose and fix: the disk that filled up

A team's `events` topic has `retention.ms=86400000` (1 day) and 200
partitions. Disk usage grows without bound and hits 90%. `kafka-configs.sh
--describe` confirms the retention setting is applied. Some partitions hold
30 days of data; others hold hours.

<details>
<summary>Solution</summary>

Two causes, both segment-related.

**Low-traffic partitions never roll their segment.** Retention only deletes
*closed* segments, and with the default `segment.bytes=1 GB` and
`segment.ms=7 days`, a partition receiving little traffic keeps writing to
the same active segment for a week or more — so its data long outlives the
1-day retention. That's why some partitions hold 30 days: they're the quiet
ones. Fix: lower `segment.ms` (e.g. 1 hour) so segments roll on time
regardless of volume.

**`retention.bytes` was never set, and per-partition accounting was
misunderstood.** Even once fixed, a size cap must account for 200 partitions
— any value set is multiplied by the partition count, so "100 GB" is
20 TB across the topic.

Worth adding: the fix is a config change, but the *detection* should have
been a per-partition log-size metric with an alert, since the aggregate disk
graph hides that a minority of partitions are the problem.

</details>

### 8. Clean up

```bash
kt --delete --topic ret-test; kt --delete --topic profiles
```

## Independent challenge

No solution given. Design the topic configuration for a system with four
topics: `orders` (business events, must be replayable for 2 years for
audit), `inventory-levels` (current stock per SKU, ~500k SKUs, updated
constantly), `user-sessions` (session state, expires after 30 days of
inactivity), and `debug-traces` (very high volume, only useful for 6 hours).

Specify `cleanup.policy`, retention, segment settings, and estimated storage
for each, stating your assumptions about event size and rate. Then solve the
hard one: `user-sessions` needs *both* latest-value-per-key semantics **and**
automatic expiry after 30 days of inactivity — explain why
`cleanup.policy=compact,delete` alone doesn't quite give you that, and what
you'd do instead.

<details>
<summary>Stuck? One hint</summary>

`compact,delete` applies time-based deletion to segments *and* compacts by
key, but the deletion is based on when the record was **written**, not on
when the key was last **active** — so an actively-updated session whose old
records age out is fine, while the "expire after 30 days of inactivity"
requirement is really about the absence of new records, which retention
can't observe. The usual answers are to emit an explicit tombstone from the
application when a session expires (a scheduled sweeper reading the
materialised view), or to let a stream processor with windowed state emit the
tombstones for you (module 05). Either way, expiry becomes something you
*publish*, not something you configure.

</details>

## Common mistakes & troubleshooting

- **Expecting retention to apply immediately.** It only removes closed
  segments; the active segment is never deleted, so `segment.ms` gates
  everything.
- **Forgetting `retention.bytes` is per partition.** Multiply by the
  partition count before sizing disks.
- **Assuming a compacted topic has exactly one record per key.** Compaction
  is a background process and the head of the log always has duplicates.
- **Serializers that emit null for empty objects.** On a compacted topic,
  that's an accidental tombstone deleting real keys.
- **`delete.retention.ms` shorter than your consumer downtime.** Offline
  consumers miss the tombstone and keep deleted keys forever.
- **Compacting a topic of business events.** You lose history that consumers
  needed; events want `delete` with long retention.
- **Using a compacted topic as a general database.** Key lookups only; no
  queries, no secondary indexes, no cross-key transactions.
- **Very large compacted topics with slow bootstrap.** Startup is O(number of
  keys); plan for it or use a local checkpoint.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why can a topic with `retention.ms=10000` still hold data hours later?
2. What does compaction guarantee, and what does it *not* guarantee at any
   given moment?
3. Why aren't offsets renumbered after compaction, and why is that fine?
4. How do you delete a key from a compacted topic, and what governs how long
   that marker survives?
5. What breaks if `delete.retention.ms` is shorter than a consumer's
   downtime?
6. What four properties make a compacted topic usable as state, and what are
   its three main limits?
7. When would you choose `delete` over `compact`?
8. Why is `retention.bytes` easy to under-provision?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because retention is enforced per *segment* and only on closed ones — the
   active segment is never eligible for deletion. With a large
   `segment.bytes` or long `segment.ms`, the segment may not roll for hours
   or days, so records outlive the nominal retention until it does.
2. It guarantees that, eventually, the latest value for each key is retained
   and superseded values are removed. It does not guarantee that at any given
   moment there is only one record per key — compaction runs in the
   background, only on closed segments, and only when the dirty ratio
   threshold is met, so the head of the log always contains duplicates.
3. Because offsets are immutable positions in the log; rewriting them would
   invalidate every stored consumer offset. It's fine because consumers only
   ever read forward from their current position, so gaps in the sequence are
   invisible to them.
4. By producing a record with that key and a **null value** (a tombstone).
   `delete.retention.ms` governs how long the tombstone is retained after
   compaction before it too is removed along with the key's history.
5. A consumer that was offline for longer than that window never sees the
   tombstone, so it retains a key in its local state that has been deleted
   everywhere else — permanent, silent state divergence that only a full
   rebuild fixes.
6. Properties: rebuildable from the log, bounded by key count rather than
   event count, shareable by any number of independent consumers, and ordered
   per key with last-write-wins. Limits: lookups by key only (no queries or
   secondary indexes), bootstrap time proportional to the number of keys, and
   no transactions across keys.
7. When the history itself is the value — business events, audit trails,
   anything a new consumer must replay in full to be correct. Compaction
   deliberately destroys history, keeping only the latest value per key, so
   it's only appropriate when the current state is all anyone needs.
8. Because it applies **per partition**, not per topic, so the effective
   total is the configured value multiplied by the partition count — a
   setting that looks like a modest cap can authorise orders of magnitude
   more storage than intended on a high-partition topic.

</details>

## Further reading & sources

- [Kafka: Log compaction](https://kafka.apache.org/documentation/#compaction) - the authoritative description of the cleaner, dirty ratio and tombstones.
- [Kafka: Topic-level configs](https://kafka.apache.org/documentation/#topicconfigs) - every retention, segment and compaction setting.
- [Jay Kreps: The Log](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying-abstraction) - the original argument for the log as a unifying data abstraction.
- [KIP-405: Tiered storage](https://cwiki.apache.org/confluence/display/KAFKA/KIP-405%3A+Kafka+Tiered+Storage) - offloading old segments to object storage.
- [Track 10: Event sourcing](../../10-distributed-systems-patterns/06-event-sourcing/README.md) - the pattern compacted topics and long retention support.

## Next

[05-stream-processing-windows-joins-and-state](../05-stream-processing-windows-joins-and-state/README.md) —
you can now store state in a topic. Module 05 computes over it: windows,
joins, and what a stream processor gives you beyond a consumer loop.
