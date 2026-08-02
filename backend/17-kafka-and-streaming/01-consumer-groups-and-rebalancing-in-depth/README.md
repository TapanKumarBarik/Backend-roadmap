# Module 01: Consumer Groups and Rebalancing in Depth

## Why this matters

You already know consumer groups share partitions and that adding a consumer
triggers a rebalance. What that description hides is the cost: with the
default protocol, a rebalance is a **stop-the-world event across the entire
group**. Every consumer gives up every partition, waits, and gets a new
assignment. During a rolling deploy of ten instances, you don't get one
rebalance — you get up to twenty, each pausing all consumption.

Worse is the failure mode teams actually hit: a consumer that takes slightly
too long to process a batch gets ejected from the group, which triggers a
rebalance, which delays everyone, which makes the next batch bigger, which
takes longer to process, which ejects another consumer. That's a rebalance
storm, and it looks exactly like "Kafka is down" while every broker is
perfectly healthy.

## Concepts

### What a rebalance actually is

Partition assignment is negotiated, not assigned by the broker. One broker
acts as **group coordinator**; one consumer is elected **group leader** and
computes the assignment.

```
1. member joins/leaves/times out
2. coordinator marks the group REBALANCING
3. every member sends JoinGroup      ─┐  all consumption stopped
4. leader computes assignment         │  (eager protocol)
5. every member sends SyncGroup      ─┘
6. members receive partitions, resume
```

Steps 3-5 are the stall. With the eager protocol, **all** members revoke
**all** partitions before step 3, so the group processes nothing until step 6
completes — for every member, even those whose assignment doesn't change.

### The four timeouts, and which one bites

| Setting | Default | Meaning | Exceeded ⇒ |
|---|---|---|---|
| `session.timeout.ms` | 45000 | Coordinator declares a member dead if no heartbeat within this | Rebalance |
| `heartbeat.interval.ms` | 3000 | How often the background thread heartbeats | — (keep ≤ ⅓ session) |
| `max.poll.interval.ms` | 300000 | Max time *between `poll()` calls* | Member leaves group |
| `max.poll.records` | 500 | Records returned per `poll()` | — |

The distinction that matters: heartbeats come from a **background thread**,
so a consumer stuck processing records still looks alive to the coordinator.
`max.poll.interval.ms` is what catches it — it measures the gap between
`poll()` calls, which only advances when you finish processing the previous
batch.

So the equation you must satisfy is:

```
max.poll.records × per-record processing time  <  max.poll.interval.ms
```

500 records × 700 ms each = 350 s, against a 300 s default. That consumer
gets ejected mid-batch, its partitions get reassigned, the records are
reprocessed by someone else, and — because the ejected consumer is still
working — you now have two consumers processing the same partition. This is
the single most common Kafka consumer bug in production.

The fix is almost always **lower `max.poll.records`**, not raise the timeout.
Smaller batches poll more often, which both keeps you in the group and makes
each rebalance cheaper.

### Eager vs cooperative-sticky

```
EAGER (default, RangeAssignor/RoundRobinAssignor)
  before:  C1[p0,p1]  C2[p2,p3]
  C3 joins ──▶ ALL revoke everything ──▶ full stop ──▶ reassign
  after:   C1[p0]  C2[p2]  C3[p1,p3]      every consumer was paused

COOPERATIVE STICKY
  before:  C1[p0,p1]  C2[p2,p3]
  C3 joins ──▶ only p1 and p3 revoked ──▶ C1 keeps p0, C2 keeps p2 throughout
  after:   C1[p0]  C2[p2]  C3[p1,p3]      only moved partitions paused
```

```python
{"partition.assignment.strategy": "cooperative-sticky"}
```

Cooperative rebalancing (KIP-429) revokes only the partitions that must move,
in two rounds, so consumers keep processing everything they retain. On a
large group this is the difference between a multi-second full stop and a
barely-visible blip.

Two caveats worth knowing before you switch it on:

- **You cannot mix strategies within a group.** Migrating a running group
  requires a two-step rolling deploy (first deploy supporting both, then
  switch), or a full stop. Changing it in one rolling deploy will fail the
  group.
- Your `on_revoke` handler must not assume it's losing everything — with
  cooperative it receives only the revoked subset.

### Static membership: stop rebalancing on restarts

By default, a restarting consumer is a *new* member with a new ID, so a
rolling restart triggers a rebalance per instance — twice, once for the leave
and once for the join.

```python
{"group.instance.id": "consumer-3"}      # stable, unique per instance
```

With a `group.instance.id` (KIP-345), the member keeps its identity and its
partition assignment across a restart. If it comes back within
`session.timeout.ms`, **no rebalance happens at all**. In Kubernetes this
maps naturally onto a StatefulSet's ordinal pod name.

The tradeoff: a genuinely dead static member isn't detected until
`session.timeout.ms` expires, so its partitions stall for that long. Static
membership trades faster failure detection for far fewer rebalances — usually
a good trade for large groups doing frequent deploys.

### Rebalance listeners: where you commit

```python
from confluent_kafka import Consumer

def on_assign(consumer, partitions):
    log.info("assigned: %s", [(p.topic, p.partition) for p in partitions])

def on_revoke(consumer, partitions):
    # last chance to commit — after this we no longer own these partitions
    try:
        consumer.commit(asynchronous=False)
    except Exception as e:
        log.warning("commit on revoke failed: %s", e)

consumer.subscribe(["orders"], on_assign=on_assign, on_revoke=on_revoke)
```

`on_revoke` fires *before* partitions are taken away — it is the only safe
place to flush in-progress work and commit offsets. Skipping it means the
next owner restarts from the last committed offset and reprocesses
everything since.

### `subscribe()` vs `assign()`

```python
consumer.subscribe(["orders"])                        # group-managed, rebalances
consumer.assign([TopicPartition("orders", 0)])        # manual, no group, no rebalance
```

`assign()` opts out of group management entirely: no rebalances, no automatic
failover, and you own partition distribution. It's right for single-instance
tools, replaying a specific partition, or systems with their own assignment
logic — and wrong for anything that needs to scale elastically.

### Partition count is your parallelism ceiling

```
6 partitions, 3 consumers  ->  2 each                      ✓
6 partitions, 6 consumers  ->  1 each                      ✓
6 partitions, 8 consumers  ->  6 working, 2 idle forever   ✗
```

Extra consumers beyond the partition count do nothing — they sit idle holding
a group slot. Since module 00 established that adding partitions to a keyed
topic breaks per-key ordering, partition count is effectively a capacity
decision you make **up front**. Over-provision modestly (a topic with 12
partitions and 3 consumers scales to 12 later); don't over-provision wildly,
since every partition costs broker file handles, memory and replication
traffic.

## Command reference

| Concern | Setting / command |
|---|---|
| Avoid stop-the-world rebalances | `partition.assignment.strategy=cooperative-sticky` |
| Survive restarts without rebalancing | `group.instance.id=<stable-unique-id>` |
| Prevent ejection while processing | lower `max.poll.records`, not raise `max.poll.interval.ms` |
| Liveness detection window | `session.timeout.ms` (heartbeat ≤ ⅓ of it) |
| Commit before losing partitions | `on_revoke` callback → `commit(asynchronous=False)` |
| Manual partitions, no group | `consumer.assign([...])` |
| List groups | `kafka-consumer-groups.sh --list --bootstrap-server localhost:9092` |
| Describe group + lag | `kafka-consumer-groups.sh --describe --group g --bootstrap-server localhost:9092` |
| Show group members | `kafka-consumer-groups.sh --describe --group g --members --verbose ...` |
| Reset offsets | `kafka-consumer-groups.sh --reset-offsets --to-earliest --group g --topic t --execute ...` |

## Hands-on exercises

Use the KRaft broker from module 00, and:

```bash
kt --create --topic rebal --partitions 6
kg() { docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 "$@"; }
```

A reusable consumer script, `consumer.py`:

```python
import sys, time, logging
from confluent_kafka import Consumer

logging.basicConfig(level=logging.INFO, format=f"[{sys.argv[1]}] %(message)s")
log = logging.getLogger()

conf = {
    "bootstrap.servers": "localhost:9092",
    "group.id": "demo",
    "auto.offset.reset": "earliest",
    "enable.auto.commit": True,
}
if len(sys.argv) > 2 and sys.argv[2] == "coop":
    conf["partition.assignment.strategy"] = "cooperative-sticky"
if len(sys.argv) > 3:
    conf["group.instance.id"] = sys.argv[3]

c = Consumer(conf)
c.subscribe(["rebal"],
            on_assign=lambda _, ps: log.info("ASSIGNED %s", sorted(p.partition for p in ps)),
            on_revoke=lambda _, ps: log.info("REVOKED  %s", sorted(p.partition for p in ps)))
try:
    while True:
        msg = c.poll(1.0)
        if msg and not msg.error():
            log.info("p%d @%d", msg.partition(), msg.offset())
except KeyboardInterrupt:
    pass
finally:
    c.close()
```

### 1. Watch an eager rebalance revoke everything

Start one consumer, wait for assignment, then start a second, then a third:

```bash
python consumer.py C1 &
sleep 5 && python consumer.py C2 &
sleep 5 && python consumer.py C3 &
```

Expected — C1 gives up **all six** partitions, then gets three back:

```
C1  ASSIGNED  [0, 1, 2, 3, 4, 5]
--  C2 JOINS
C1  REVOKED   [0, 1, 2, 3, 4, 5]     <-- all six, including ones it keeps
C1  ASSIGNED  [1, 3, 5]
C2  ASSIGNED  [0, 2, 4]
```

C1 surrendered partitions 1, 3 and 5 only to be handed them straight back.
The gap between `REVOKED` and `ASSIGNED` is dead time for the whole group —
and it scales with group size, because every member does this.

### 2. Compare with cooperative-sticky

Kill everything, then repeat with the `coop` argument.

Expected — C1 revokes only the half that actually moves:

```
C1  ASSIGNED  [0, 1, 2, 3, 4, 5]
--  C2 JOINS
C1  REVOKED   [0, 1, 2]      <-- only what moves; C1 keeps 3,4,5 the whole time
C1  ASSIGNED  []             <-- round 2 of the protocol: nothing new for C1
C2  ASSIGNED  []
C2  ASSIGNED  [0, 1, 2]
```

Two things to notice. C1 never stopped serving partitions 3, 4 and 5 —
compare that to exercise 1, where it dropped all six. And the empty
`ASSIGNED []` callbacks are normal: cooperative rebalancing runs in two
rounds, so you'll see callbacks that convey no change. Handlers must
tolerate an empty partition list rather than assuming every callback is
meaningful.

### 3. Prove you can't mix strategies

With a cooperative consumer running, start an eager one in the same group.

Expected: the group fails to stabilise, with an inconsistent-protocol error.
Write down the error — it's what a careless rolling deploy produces.

### 4. Show extra consumers sit idle

Start 8 consumers against the 6-partition topic.

Expected: exactly 2 log an empty assignment. Confirm with:

```bash
kg --describe --group demo --members
```

### 5. Trigger ejection with slow processing

Run one consumer with:

```python
{"max.poll.interval.ms": 10000, "max.poll.records": 500}
```

and a handler that sleeps 50 ms per record. Produce 1000 records.

Expected: after ~10 s the consumer is kicked out mid-batch
(`MaxPollExceeded` / the group rebalances), then rejoins, and **reprocesses
records it had already handled**. Log a set of processed IDs and confirm
duplicates. Then fix it by setting `max.poll.records=20` and confirm the
ejection stops — without touching `max.poll.interval.ms`.

### 6. Static membership eliminates restart rebalances

Run three consumers with `group.instance.id` values `c1`, `c2`, `c3`. Wait
for a stable assignment, then kill `c2` and restart it within
`session.timeout.ms`.

Expected: **no REVOKED/ASSIGNED lines on c1 and c3** — they never noticed.
Repeat without `group.instance.id` and observe two full rebalances.

### 7. Commit on revoke, or reprocess

Disable auto-commit, commit only in `on_revoke`, and process records with a
visible counter. Trigger a rebalance by starting a second consumer.

Expected: no reprocessing. Now remove the commit from `on_revoke` and repeat.

Expected: the new owner replays from the last committed offset, reprocessing
records the first consumer had already handled.

### 8. Diagnose and fix: the consumer group that never caught up

A team's `payments` consumer group has 12 instances against a 12-partition
topic. Lag grows steadily during business hours and never recovers. Logs show
constant `ASSIGNED`/`REVOKED` cycling. Their config:

```python
{"group.id": "payments", "max.poll.records": 500,
 "max.poll.interval.ms": 300000, "session.timeout.ms": 45000,
 "enable.auto.commit": True, "auto.commit.interval.ms": 5000}
```

Each record makes a ~400 ms external payment-API call. Scaling to 24
instances made it worse.

<details>
<summary>Solution</summary>

**The primary bug is the arithmetic:** 500 records × 400 ms = 200 s per
batch, against `max.poll.interval.ms=300000` (300 s). That's within budget on
average — but any slowness in the payment API (say 700 ms/record) pushes it
to 350 s and the consumer is ejected. Ejection triggers a rebalance, the
partitions move, the new owner reprocesses from the last commit, and the
ejected consumer is *still* processing — so throughput drops precisely when
the system is already struggling. Each rebalance makes the backlog worse,
which makes the next batch slower: a rebalance storm.

**Scaling to 24 made it worse** for two reasons: 12 of the 24 sit idle (12
partitions is the ceiling), and doubling the members doubles rebalance
participation cost while adding zero throughput.

**Auto-commit compounds it.** With `enable.auto.commit=True`, offsets are
committed on a timer for records that may still be in flight, so an ejection
mid-batch can lose records *and* reprocess others.

The fix, in order of impact: drop `max.poll.records` to ~20 so a batch takes
~8 s; switch to `cooperative-sticky` so rebalances stop being stop-the-world;
add `group.instance.id` so deploys don't rebalance; move to manual commits
after processing (module 02); and if more throughput is genuinely needed,
increase *partitions*, not consumers — accepting module 00's warning about
what that does to key ordering.

</details>

### 9. Clean up

```bash
kg --delete --group demo
```

## Independent challenge

No solution given. You run a consumer group processing image-thumbnail jobs:
30 partitions, 30 instances on Kubernetes, each record takes 2-45 seconds
(highly variable — small photos vs. large RAW files). Deploys happen 5-10
times a day and currently cause a 4-6 minute processing stall. Occasionally a
single enormous file takes 8 minutes and ejects its consumer.

Design a configuration and deployment strategy that keeps deploys under 30
seconds of disruption and stops the ejections, **without** losing at-least-
once delivery. Then address the harder question: `max.poll.records=1` still
doesn't help the 8-minute record, so what do you actually do about work items
whose duration exceeds any reasonable poll interval?

<details>
<summary>Stuck? One hint</summary>

The config half is cooperative-sticky plus `group.instance.id` from the
StatefulSet pod ordinal, plus `max.poll.records=1` given the per-record cost.
The 8-minute record is the interesting half, and no timeout tuning fixes it
properly — raising `max.poll.interval.ms` to 15 minutes means a genuinely
dead consumer isn't detected for 15 minutes. The standard answer is to
decouple *receiving* the work from *doing* it: hand the record to a worker
thread/pool, keep calling `poll()` on the consumer thread to stay in the
group, and pause the partition (`consumer.pause()`) so no new records arrive
while the long job runs — committing only when it completes. That turns an
unbounded processing time into a bounded poll loop, at the cost of managing
the pause/resume and commit lifecycle yourself.

</details>

## Common mistakes & troubleshooting

- **Raising `max.poll.interval.ms` instead of lowering `max.poll.records`.**
  It masks the symptom and delays detection of genuinely dead consumers.
- **Assuming heartbeats prove liveness.** They come from a background thread;
  a consumer stuck in processing still heartbeats. `max.poll.interval.ms` is
  the setting that catches it.
- **Mixing assignment strategies in one group.** The group won't stabilise —
  migrating to cooperative needs a two-phase rollout.
- **More consumers than partitions.** The extras idle forever and add
  rebalance cost.
- **No `on_revoke` commit.** Every rebalance reprocesses everything since the
  last commit.
- **Assuming `on_revoke` means "all partitions"** — under cooperative it's
  only the moved subset.
- **Auto-commit with slow or fallible processing.** Offsets advance on a
  timer regardless of whether the work succeeded.
- **Not using `group.instance.id`** on a frequently-deployed service, paying
  two rebalances per instance per deploy.
- **Trying to scale throughput by adding consumers** when the partition count
  is the actual ceiling.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why can a consumer be evicted from its group while still heartbeating
   normally?
2. Give the arithmetic relationship that must hold between
   `max.poll.records`, per-record processing time and `max.poll.interval.ms`.
3. What does eager rebalancing revoke, and how does cooperative-sticky
   differ?
4. What does `group.instance.id` change, and what does it cost you?
5. Why does adding consumers beyond the partition count not increase
   throughput?
6. Where is the correct place to commit offsets before losing a partition,
   and what happens if you skip it?
7. When would you use `assign()` instead of `subscribe()`?
8. How would you handle a single record whose processing time exceeds any
   sensible `max.poll.interval.ms`?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because heartbeats are sent by a background thread and only prove the
   process is alive, not that it's making progress. Eviction in that case
   comes from `max.poll.interval.ms`, which measures the gap between
   successive `poll()` calls — a consumer stuck processing a large batch
   stops polling while continuing to heartbeat.
2. `max.poll.records × per-record processing time < max.poll.interval.ms`.
   If the product exceeds the interval, the consumer is ejected mid-batch,
   its partitions are reassigned, and the records get reprocessed by another
   member while the ejected one is still working on them.
3. Eager revokes *every* partition from *every* member before the new
   assignment is computed, so the whole group stops consuming even for
   partitions that aren't moving. Cooperative-sticky revokes only the
   partitions that actually need to change owner, in two rounds, so
   consumers keep processing everything they retain.
4. It gives the consumer a stable identity across restarts, so a member that
   restarts and rejoins within `session.timeout.ms` keeps its previous
   assignment and triggers no rebalance at all. The cost is slower failure
   detection: a genuinely dead static member's partitions stall until
   `session.timeout.ms` expires.
5. Because a partition is assigned to at most one consumer in a group, so the
   partition count is a hard ceiling on group parallelism. Extra consumers
   receive no partitions, sit idle, and still participate in (and slow down)
   every rebalance.
6. In the `on_revoke` rebalance listener, which fires before the partitions
   are actually taken away — it's the last point at which you still own them.
   Skipping it means the next owner resumes from the last committed offset
   and reprocesses everything handled since that commit.
7. When you want to bypass group management entirely: single-instance tools,
   replaying or inspecting one specific partition, or systems that implement
   their own partition-assignment logic. `assign()` gives no rebalances and
   no automatic failover, so it's wrong for anything needing elastic scaling.
8. Decouple receiving from processing: hand the record to a worker
   thread/pool, keep calling `poll()` on the consumer thread so the member
   stays alive in the group, and `pause()` the partition so no new records
   arrive until the long job finishes — then commit and `resume()`. Raising
   the timeout instead would delay detection of genuinely dead consumers by
   the same amount.

</details>

## Further reading & sources

- [KIP-429: Incremental cooperative rebalancing](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol) - the design and migration path for cooperative-sticky.
- [KIP-345: Static membership](https://cwiki.apache.org/confluence/display/KAFKA/KIP-345%3A+Introduce+static+membership+protocol+to+reduce+consumer+rebalances) - why `group.instance.id` removes restart rebalances.
- [Kafka: Consumer configuration reference](https://kafka.apache.org/documentation/#consumerconfigs) - defaults and semantics for every timeout discussed here.
- [Confluent: Consumer group protocol](https://developer.confluent.io/courses/architecture/consumer-group-protocol/) - the JoinGroup/SyncGroup sequence walked through visually.
- [confluent-kafka-python: Consumer](https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html#consumer) - `subscribe`, `assign`, `pause`, and the rebalance callbacks.

## Next

[02-delivery-semantics-and-exactly-once](../02-delivery-semantics-and-exactly-once/README.md) —
you can now keep a group stable. Module 02 addresses what those consumers
actually guarantee about processing each record once.
