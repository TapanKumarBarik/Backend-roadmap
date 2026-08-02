# Module 06: Operating Kafka — Lag, Sizing and Reliability

## Why this matters

Kafka fails quietly. Brokers stay green, dashboards stay flat, and the only
symptom is that events are arriving later and later until someone notices the
business has been running on stale data for six hours. There is no request
returning 500 to alert you.

The signal that actually matters is **consumer lag**, and almost everyone
measures it wrong — as a record count, which tells you nothing actionable.
This module covers the metrics that predict incidents, how to size partitions
before you're stuck with them, what replication does and doesn't guarantee,
and how to stop one malformed record from halting a partition forever.

## Concepts

### Consumer lag, and why the record count misleads

```
partition 0:  [....................................]
              ^committed offset 8,400      ^log end 12,900
                        lag = 4,500 records
```

4,500 records is meaningless on its own. Is that 2 seconds of work or 3
hours? Depends entirely on throughput. **Convert lag to time:**

```
lag_seconds = lag_records / records_processed_per_second
```

That's the number to alert on, because it's the one your business
understands: "the fraud service is 40 minutes behind" is actionable; "the
fraud service is 4.5 million records behind" is not.

Better still, alert on the **derivative**. Steady lag at 500 records is
healthy. Lag growing linearly means consumption is slower than production and
will never recover on its own — that's the incident, and it's visible long
before lag becomes large.

```
# Prometheus-style
kafka_consumergroup_lag                                   # raw
kafka_consumergroup_lag / rate(records_consumed_total[5m]) # seconds behind
deriv(kafka_consumergroup_lag[10m]) > 0                    # falling behind
```

Always measure lag **per partition**, not summed per group. A single stuck
partition is invisible in a group total dominated by 49 healthy ones — and a
single stuck partition is exactly what a poison pill produces.

### Replication and ISR

```
partition 0, replication.factor=3
  leader   broker-1  [====================]  LEO 1000
  follower broker-2  [====================]  LEO 1000   in ISR
  follower broker-3  [==============      ]  LEO  700   lagging

  ISR = {1, 2}          high watermark = 1000 (min LEO across ISR)
  consumers can read up to the high watermark only
```

A follower stays in the ISR while it fetches within
`replica.lag.time.max.ms` (default 30s). Fall behind and it's ejected — which
silently shrinks your durability guarantee, because `acks=all` only waits for
the ISR (module 00).

The settings that make this safe:

| Setting | Recommended | Why |
|---|---|---|
| `replication.factor` | 3 | Survive one broker loss with room to spare |
| `min.insync.replicas` | 2 | Reject writes when durability degrades |
| `unclean.leader.election.enable` | `false` | Never promote an out-of-sync replica |

`unclean.leader.election.enable=true` trades **data loss for
availability**: an out-of-sync replica becomes leader and everything it
hadn't replicated is gone, permanently. It defaults to `false` and should
stay there unless you have an explicit, written decision that availability
matters more than correctness for that topic.

**Alert on ISR shrink.** It's the leading indicator: durability degrades
before data is lost, and that gap is your chance to intervene.

### Partition sizing

Partitions are the unit of parallelism, and module 00 established that
changing the count on a keyed topic breaks ordering — so this is a decision
you largely make once.

```
partitions = max(
    target_throughput / per_partition_throughput,
    target_throughput / per_consumer_throughput,
    peak_consumer_instances
)
```

Then round up for headroom. Practical guidance:

- Aim for **10-30 MB/s per partition** as a working assumption; measure yours.
- Partition count should comfortably exceed your maximum consumer count
  (module 01: extras idle).
- More partitions cost broker file handles, memory, replication traffic, and
  **leader-election time** — a broker failure with 4,000 partitions takes far
  longer to recover than with 400.
- A rough ceiling of a few thousand partitions per broker is sane; tens of
  thousands is a problem.

Over-provision modestly (12 partitions when you need 3, so you can scale to
12) — not wildly.

### Poison pills and dead-letter topics

One unparseable record halts a partition forever if your consumer retries
indefinitely: the offset never advances, lag climbs, and no other record on
that partition is ever processed.

```python
MAX_RETRIES = 3

def handle(msg):
    for attempt in range(MAX_RETRIES):
        try:
            process(msg)
            return True
        except TransientError:
            time.sleep(2 ** attempt)
        except PermanentError:
            break                      # don't retry what can't succeed
    to_dlq(msg)                        # park it, keep the partition moving
    return True

def to_dlq(msg):
    producer.produce(
        "orders.DLQ",
        key=msg.key(),
        value=msg.value(),
        headers=[
            ("original_topic", msg.topic().encode()),
            ("original_partition", str(msg.partition()).encode()),
            ("original_offset", str(msg.offset()).encode()),
            ("error", traceback.format_exc()[:900].encode()),
            ("failed_at", datetime.now(timezone.utc).isoformat().encode()),
        ],
    )
    producer.flush()
```

Two disciplines that make DLQs useful rather than a graveyard:

1. **Distinguish transient from permanent failures.** Retry a database
   timeout; do not retry a schema violation. Retrying permanent errors is
   just a slower way to block the partition.
2. **Alert on DLQ arrivals and have a replay path.** An unmonitored DLQ is a
   place where data goes to be forgotten. Record enough headers to replay the
   record after fixing the bug.

Note the ordering tradeoff: sending a record to a DLQ and continuing means
you have processed later records for that key before this one. If strict
per-key ordering matters more than availability, you must stop the partition
instead — a real decision, not an oversight.

### The metrics that matter

**Broker:** `UnderReplicatedPartitions` (should be 0),
`OfflinePartitionsCount` (should be 0), `ActiveControllerCount` (exactly 1
across the cluster), request handler idle ratio, disk usage per log dir.

**Producer:** `record-error-rate`, `record-retry-rate`, `request-latency-avg`,
`buffer-available-bytes`.

**Consumer:** lag per partition (in time), `records-lag-max`,
`commit-latency-avg`, `rebalance-rate-per-hour` — that last one is how you
detect module 01's rebalance storms.

Alert on: lag *seconds* over threshold, lag *derivative* positive and
sustained, `UnderReplicatedPartitions > 0`, `ActiveControllerCount != 1`,
rebalance rate elevated, and any DLQ traffic.

### Capacity and cost

```
storage_per_day = events_per_day × avg_event_bytes × replication_factor
retained_total  = storage_per_day × retention_days × 1.3   # overhead headroom
```

At 100M events/day × 1 KB × RF 3 = ~300 GB/day; at 7 days retention that's
~2.7 TB before overhead. Compression (module 00) typically cuts this 3-5×,
which is why `compression.type` is a cost decision as much as a throughput
one.

## Command reference

| Concern | Command |
|---|---|
| Group lag per partition | `kafka-consumer-groups.sh --describe --group g --bootstrap-server localhost:9092` |
| All groups | `kafka-consumer-groups.sh --list ...` |
| Under-replicated partitions | `kafka-topics.sh --describe --under-replicated-partitions ...` |
| Unavailable partitions | `kafka-topics.sh --describe --unavailable-partitions ...` |
| Topic detail (ISR) | `kafka-topics.sh --describe --topic t ...` |
| Reassign partitions | `kafka-reassign-partitions.sh --execute --reassignment-json-file plan.json ...` |
| Disable unclean election | `--add-config unclean.leader.election.enable=false` |
| Skip a poison pill (manual) | `kafka-consumer-groups.sh --reset-offsets --shift-by 1 --group g --topic t:0 --execute ...` |
| Reset to a timestamp | `--reset-offsets --to-datetime 2026-08-01T00:00:00.000 --execute` |
| Throughput test | `kafka-producer-perf-test.sh --topic t --num-records 1000000 --record-size 1024 --throughput -1 --producer-props bootstrap.servers=localhost:9092` |
| Log dir sizes | `kafka-log-dirs.sh --describe --bootstrap-server localhost:9092` |

## Hands-on exercises

Use the broker from module 00.

### 1. Create lag and convert it to time

Produce 100,000 records, then start a consumer that sleeps 5 ms per record.

```bash
kg --describe --group slow
```

Expected: a `LAG` column with a large number. Compute
`lag / (1/0.005) = lag / 200` to get seconds behind, and confirm it matches
how long the consumer actually takes to catch up. That conversion is the
whole exercise.

### 2. Distinguish steady from growing lag

Run a consumer slightly *slower* than the producer, then slightly faster.
Sample lag every 10 seconds for two minutes and plot both.

Expected: one line flat, one climbing linearly. Write down which alert you'd
page on and why raw lag magnitude alone would have fired on both or neither.

### 3. Show per-partition lag hides in the total

Run 3 consumers on a 6-partition topic, then `SIGSTOP` one of them.

Expected: group total lag rises slowly while **two specific partitions** grow
without bound. Confirm with `--describe` that the per-partition view makes
the problem obvious and the summed view doesn't.

### 4. Build a poison pill and watch it block

Produce 100 valid JSON records with one `not-json` in the middle. Write a
consumer that retries on exception forever.

Expected: the partition stops at that offset permanently; lag grows; the
remaining valid records are never processed. This is the failure the DLQ
prevents.

### 5. Add a DLQ and recover

Implement `to_dlq()` with headers. Re-run.

Expected: the bad record lands in `orders.DLQ` with diagnostic headers,
processing continues, lag recovers. Then read the DLQ and print the headers —
confirm you have enough information to replay after a fix.

### 6. Observe ISR shrink

(Needs a multi-broker cluster — use a 3-broker compose file.) Create a topic
with RF 3, then stop one broker.

```bash
kt --describe --topic t
```

Expected: `Isr:` shrinks from 3 entries to 2 while `Replicas:` stays at 3.
Then set `min.insync.replicas=3` and confirm producers with `acks=all` now
fail with `NOT_ENOUGH_REPLICAS` — durability is refusing to silently
degrade, which is the behaviour you want.

### 7. Measure per-partition throughput

```bash
docker exec kafka /opt/kafka/bin/kafka-producer-perf-test.sh \
  --topic perf --num-records 500000 --record-size 1024 --throughput -1 \
  --producer-props bootstrap.servers=localhost:9092
```

Run against topics with 1, 3 and 6 partitions.

Expected: throughput scales with partitions up to a point, then plateaus as
the broker (or your client) saturates. Use the number to sanity-check the
sizing formula rather than trusting a rule of thumb.

### 8. Diagnose and fix: the silent six-hour delay

A fraud-detection consumer group reports healthy: all brokers green, no
errors, CPU normal, and the team's dashboard shows "total group lag" hovering
around 2,000 — the same as always. But the business reports fraud alerts
arriving six hours late for a subset of customers.

<details>
<summary>Solution</summary>

**A single partition is stuck, hidden by a group-level total.** With, say, 48
partitions, one partition stalled at six hours of lag while 47 sit near zero
produces a group total that looks normal-ish and barely moves — especially if
the dashboard averages or the healthy partitions absorb the visual range.
Because fraud events are keyed by customer (module 00), the affected
customers are exactly those hashing to that partition — which is why it's "a
subset" rather than everyone.

The likely cause is a poison pill or a permanently-failing record on that
partition, with a consumer retrying forever: the offset never advances, so
lag on that one partition grows linearly while everything else is fine. No
error surfaces because the consumer is functioning correctly by its own
lights — it's retrying, as designed.

Fixes:

1. Alert on **per-partition** lag (max across partitions), never the group
   sum — this is the monitoring bug that allowed six hours to pass.
2. Express lag in **seconds behind**, not records, so "6 hours" is legible.
3. Add retry limits plus a DLQ so a single bad record parks itself instead of
   blocking the partition.
4. Alert on lag *derivative*, which would have fired within minutes of the
   partition stalling rather than when someone noticed downstream.

</details>

### 9. Clean up

```bash
docker rm -f kafka
```

## Independent challenge

No solution given. You're on call for a Kafka platform serving 40 teams:
~800 topics, 12 brokers, ~9,000 partitions. Design the alerting.

Specify every alert with its threshold, severity and rationale, deliberately
keeping the pageable set small enough that on-call is sustainable — then
justify what you consciously chose *not* to alert on. Cover at minimum: lag,
under-replication, controller health, rebalance rate, DLQ traffic and disk.
Then solve the multi-tenant problem: with 800 topics you cannot hand-tune
thresholds per consumer group, so design an approach that produces sensible
alerts for both a group processing 100k records/sec and one processing 5.

<details>
<summary>Stuck? One hint</summary>

The multi-tenant threshold problem is the interesting half, and the answer is
to alert on **relative** rather than absolute quantities: lag expressed in
seconds-behind (which self-normalises across throughput), and lag derivative
or lag-versus-its-own-baseline rather than a fixed record count. That way one
rule covers both groups without per-team configuration. For keeping the
pageable set small, the honest split is that only "data is being lost or will
be soon" pages (offline partitions, controller count wrong, disk near full,
sustained lag growth on a tier-1 topic), while everything else is a ticket or
a dashboard — and saying explicitly that under-replication on a *non-critical*
topic is a ticket, not a page, is exactly the kind of judgement the exercise
is testing.

</details>

## Common mistakes & troubleshooting

- **Alerting on lag in records instead of seconds.** Meaningless across
  services with different throughput.
- **Alerting on group-total lag.** One stuck partition disappears into the
  aggregate.
- **Not alerting on lag derivative.** Growing lag is an incident long before
  it's a large number.
- **Retrying permanent errors forever.** Blocks the partition indefinitely;
  classify errors and use a DLQ.
- **An unmonitored DLQ.** Data goes there to be forgotten; alert on arrivals
  and keep a replay path.
- **`unclean.leader.election.enable=true` by default.** Trades permanent data
  loss for availability, usually without anyone deciding to.
- **`acks=all` with `min.insync.replicas=1`.** ISR can shrink to the leader
  and durability silently degrades (module 00).
- **Ignoring ISR shrink.** It's the leading indicator before actual loss.
- **Massive partition counts "for headroom".** They slow leader election and
  recovery, and consume broker memory and file handles.
- **Not monitoring `ActiveControllerCount`.** Anything other than exactly 1
  across the cluster is a serious problem.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why is consumer lag in records a poor alerting signal, and what should you
   use instead?
2. Why must lag be measured per partition rather than summed per group?
3. What is the ISR, and what does it mean for `acks=all` when it shrinks?
4. What does `unclean.leader.election.enable=true` trade away?
5. Why is partition count effectively a one-time decision on a keyed topic,
   and what does over-provisioning cost?
6. What is a poison pill, and why does an unbounded retry loop make it worse?
7. What must you record when writing to a DLQ, and why?
8. Which three broker metrics would you alert on, and what does each indicate?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because a record count means nothing without throughput — 4,500 records
   could be two seconds or three hours of work. Convert to time
   (`lag / records_per_second`) so the alert reflects how stale the data
   actually is, and alert additionally on the derivative, since sustained
   growth indicates consumption is slower than production and will never
   recover unaided.
2. Because a single stalled partition is invisible in a group total dominated
   by healthy ones — the sum barely moves while one partition falls hours
   behind. Since records are keyed to partitions, that also means a specific
   subset of keys (customers, accounts) is affected while everything else
   looks fine.
3. The in-sync replica set: the replicas currently caught up with the leader
   within `replica.lag.time.max.ms`. When it shrinks, `acks=all` waits only
   for the remaining members — so durability silently degrades, and in the
   worst case (`min.insync.replicas=1`) becomes equivalent to `acks=1`.
4. Data durability, in exchange for availability. It allows an out-of-sync
   replica to become leader, which permanently discards every record the new
   leader hadn't replicated. It should stay `false` unless there's an
   explicit decision that availability outweighs correctness for that topic.
5. Because partition assignment is `hash(key) % partitions`, so changing the
   count re-maps existing keys and breaks per-key ordering across the change
   (module 00) — making it a data migration rather than a scaling knob.
   Over-provisioning costs broker file handles, memory and replication
   traffic, and materially slows leader election and recovery after a broker
   failure.
6. A record that can never be processed successfully — malformed, schema-
   violating, or triggering a deterministic bug. An unbounded retry loop
   means the consumer never advances past its offset, so the entire partition
   stops: lag grows without limit and every subsequent valid record on that
   partition goes unprocessed, while the consumer reports no error because it
   is retrying as designed.
7. The original topic, partition and offset, the error/traceback, and a
   timestamp — enough to locate the record in its source, understand why it
   failed, and replay it deterministically once the bug is fixed. Without
   that context a DLQ is just a bucket of undiagnosable failures.
8. `UnderReplicatedPartitions` (should be 0 — durability is degraded above
   that), `OfflinePartitionsCount` (should be 0 — those partitions are
   unavailable for reads and writes), and `ActiveControllerCount` (must be
   exactly 1 across the cluster — 0 means no controller, more than 1 means
   split brain).

</details>

## Further reading & sources

- [Kafka: Monitoring](https://kafka.apache.org/documentation/#monitoring) - the authoritative list of broker, producer and consumer JMX metrics.
- [Burrow](https://github.com/linkedin/Burrow) - LinkedIn's consumer-lag monitor, built specifically around lag evaluation rather than raw counts.
- [kafka-lag-exporter](https://github.com/seglo/kafka-lag-exporter) - exports lag *in time*, which is the metric this module argues for.
- [Confluent: Optimizing for durability](https://docs.confluent.io/platform/current/kafka/deployment.html) - ISR, unclean leader election and replication guidance.
- [Track 20: SRE practices](../../../learn/20-sre-practices/README.md) - SLOs, error budgets and alerting philosophy behind the "small pageable set" argument.

## Next

[07-project-build-an-event-driven-system](../07-project-build-an-event-driven-system/README.md) —
everything from modules 00-06 assembled into one working event-driven system,
built step by step.
