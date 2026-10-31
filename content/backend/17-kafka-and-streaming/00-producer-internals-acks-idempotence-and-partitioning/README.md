# Module 00: Producer Internals — Acks, Idempotence and Partitioning

## Why this matters

A default Kafka producer will lose your messages. Not under exotic
conditions — under an ordinary broker restart, which is a thing that happens
every time someone patches a cluster. And a naively "safe" producer that
retries on failure will silently *duplicate* messages instead, because a
retry can't tell "the write failed" from "the write succeeded but the
acknowledgement was lost."

Both problems are solved by configuration you have to opt into. This module
is about the handful of producer settings that decide whether your event
backbone actually delivers what you sent, exactly once, in order — and what
each of them costs in throughput.

## Concepts

### The write path, and where messages go missing

```
producer.produce()
      │
      ▼
  ┌────────────────┐   messages accumulate per-partition,
  │ record         │   flushed when batch.size is full OR
  │ accumulator    │   linger.ms elapses — whichever first
  └───────┬────────┘
          │  (in memory! not sent yet)
          ▼
     network send  ──▶  leader broker  ──▶  replicated to followers (ISR)
          ▲                                          │
          └──────────── ack, per `acks` setting ◀────┘
```

Two distinct loss windows, and people usually only think about the second:

1. **In the accumulator.** `produce()` is *asynchronous* — it returns as soon
   as the record is buffered locally. If the process dies before the batch is
   sent, those records never existed. This is why `flush()` before shutdown
   is mandatory, not optional.
2. **Between leader and replicas.** If the leader acknowledges before
   followers have the data and the leader then fails, the data is gone.
   That's what `acks` controls.

### `acks`: the single most important setting

| `acks` | Leader waits for | Loses data when | Throughput |
|---|---|---|---|
| `0` | nothing — fire and forget | almost anything | highest |
| `1` | leader's own log write | leader fails before replication | high |
| `all` (`-1`) | all in-sync replicas | only if *all* ISR fail | lower |

`acks=all` alone is **not** sufficient. It means "all replicas currently in
sync", and if replicas have fallen out of the ISR, that set can shrink to
just the leader — at which point `acks=all` is `acks=1` wearing a disguise.
The setting that closes this is on the *topic/broker*:

```
min.insync.replicas=2      # refuse writes unless >= 2 replicas are in sync
```

With `replication.factor=3, min.insync.replicas=2, acks=all` you can lose one
broker and keep serving; lose two and producers get
`NOT_ENOUGH_REPLICAS` rather than silently accepting data they'll lose.
Durability is that triple, not any one of its parts.

### Retries, ordering, and the duplicate problem

```python
# The naive "safe" producer — and why it's still wrong
{
    "acks": "all",
    "retries": 2147483647,
    "max.in.flight.requests.per.connection": 5,   # default
}
```

This produces duplicates and can reorder. Consider batches B1 and B2 sent
back to back: B1 fails transiently and is retried, B2 succeeded already — now
B2 is in the log before B1. Ordering broken. And if B1 actually *did* reach
the log but the ack was lost, the retry writes it twice. Duplicated.

Historically you fixed ordering by setting
`max.in.flight.requests.per.connection=1`, at a large throughput cost. You no
longer need to.

### The idempotent producer

```python
{"enable.idempotence": True}
```

This is the fix, and it's cheap. The producer gets a Producer ID (PID) and
attaches a monotonic sequence number per partition; the broker tracks the
last sequence it saw and discards duplicates. It gives you, per partition,
for the lifetime of the producer session:

- **exactly-once delivery** (retries are de-duplicated by the broker), and
- **ordering preserved** even with up to 5 in-flight requests.

Setting `enable.idempotence=True` implicitly requires and sets:

```
acks=all
retries=INT_MAX
max.in.flight.requests.per.connection <= 5
```

If you explicitly set a conflicting value (say `acks=1`), the client raises a
configuration error rather than quietly downgrading — which is the correct
behaviour, and worth knowing so the error isn't a surprise.

**What it does not give you:** exactly-once across a producer *restart* (a
new session gets a new PID), and nothing at all about the consumer side.
Those need transactions — module 02.

The modern default: **turn idempotence on and leave it on.** In recent Kafka
client versions it is the default; set it explicitly anyway, so your
guarantees are visible in the config rather than dependent on a version.

### Batching: `linger.ms` and `batch.size`

Kafka's throughput comes from batching. The two knobs interact:

- `batch.size` (bytes, default 16 KB) — per-partition batch capacity.
- `linger.ms` (default 0) — how long to wait for more records before sending
  a partial batch.

`linger.ms=0` does **not** mean "no batching" — it means "send as soon as the
sender thread is free", so under load, batches still form naturally. But
raising it to even 5-20 ms typically improves throughput and compression
ratio dramatically, at the cost of that much added latency. For an
event-streaming workload that's usually a good trade; for a
request/response-shaped one it isn't.

```python
{
    "linger.ms": 10,
    "batch.size": 65536,          # 64 KB
    "compression.type": "lz4",    # compresses the batch, not each record
}
```

Compression is applied per *batch*, so bigger batches compress far better —
`linger.ms` and `compression.type` reinforce each other. `lz4` and `zstd` are
the usual choices; `zstd` compresses harder for more CPU. `snappy` is the
legacy default choice and is now rarely the best one.

### Delivery callbacks: `produce()` does not mean "delivered"

```python
def on_delivery(err, msg):
    if err is not None:
        log.error("DELIVERY FAILED %s: %s", msg.key(), err)   # you MUST handle this
    else:
        log.debug("ok %s[%d]@%d", msg.topic(), msg.partition(), msg.offset())

producer.produce(topic="orders", key=b"A-1", value=payload, on_delivery=on_delivery)
producer.poll(0)        # serves delivery callbacks
...
producer.flush()        # blocks until every buffered record is acked or failed
```

Three things people get wrong here:

- **Not passing a callback at all**, so failures after the retry budget is
  exhausted vanish silently. `produce()` succeeding tells you only that the
  record was *buffered*.
- **Never calling `poll()`**, so callbacks never fire and the buffer grows
  until `produce()` raises `BufferError`.
- **Not calling `flush()` on shutdown**, losing whatever is still buffered.

### Partitioning: how ordering actually gets decided

Kafka guarantees order **within a partition**, and the key decides the
partition:

| Key | Behaviour |
|---|---|
| `None` | Sticky partitioning — batches fill one partition at a time, then switch. No ordering guarantee across records. |
| set | `hash(key) % num_partitions` — same key always lands in the same partition, so same-key records are ordered. |

This is the whole design decision: **your partition key is your ordering
guarantee, and also your parallelism limit.** Key by `order_id` and all
events for one order are ordered but different orders spread across
partitions — usually right. Key by `country` and you get ordering per country
plus a hot partition for your largest market — usually wrong.

The critical caveat: `hash(key) % num_partitions` means **adding partitions
re-maps existing keys**. A key that used to go to partition 2 may now go to
partition 5, and records already in partition 2 stay there — so per-key
ordering is broken across the change. Repartitioning a keyed topic is a
migration, not a scaling operation.

```python
# a custom partitioner — e.g. isolating a noisy tenant onto dedicated partitions
def partitioner(key: bytes, all_partitions, available):
    if key and key.startswith(b"tenant-huge:"):
        return all_partitions[0]           # dedicated
    return all_partitions[hash(key) % (len(all_partitions) - 1) + 1]
```

(`confluent-kafka` exposes this via the `partitioner` config for built-in
strategies — `random`, `consistent`, `consistent_random`, `murmur2`,
`murmur2_random`. Use `murmur2_random` when you need to match Java clients'
default hashing, which is a real interop trap.)

### A production-safe producer config

```python
from confluent_kafka import Producer

producer = Producer({
    "bootstrap.servers": "localhost:9092",
    # correctness
    "enable.idempotence": True,        # implies acks=all, retries=max, in-flight<=5
    "max.in.flight.requests.per.connection": 5,
    # throughput
    "linger.ms": 10,
    "batch.size": 65536,
    "compression.type": "lz4",
    # resilience
    "delivery.timeout.ms": 120000,     # total budget: buffering + retries
    "request.timeout.ms": 30000,
    # visibility
    "enable.metrics.push": False,
})
```

`delivery.timeout.ms` is the one that actually bounds how long a record can
take end to end; `retries` alone doesn't, because retries are also bounded by
this timeout. If a record can't be delivered inside it, the delivery callback
fires with an error — which is exactly why the callback must be handled.

## Command reference

| Concern | Setting / command |
|---|---|
| Durability | `acks=all` + topic `min.insync.replicas=2` + `replication.factor=3` |
| No duplicates, ordered | `enable.idempotence=True` |
| Throughput | `linger.ms=10-50`, `batch.size=64KB`, `compression.type=lz4` |
| Total delivery budget | `delivery.timeout.ms` |
| Serve delivery callbacks | `producer.poll(0)` |
| Drain before exit | `producer.flush(timeout)` |
| Java-compatible key hashing | `partitioner=murmur2_random` |
| Create topic | `kafka-topics.sh --create --topic t --partitions 3 --bootstrap-server localhost:9092` |
| Describe topic | `kafka-topics.sh --describe --topic t --bootstrap-server localhost:9092` |
| Set min ISR | `kafka-configs.sh --alter --entity-type topics --entity-name t --add-config min.insync.replicas=2` |
| Console produce | `kafka-console-producer.sh --topic t --bootstrap-server localhost:9092` |
| Read with partition/offset | `kafka-console-consumer.sh --topic t --from-beginning --property print.partition=true --bootstrap-server localhost:9092` |

## Hands-on exercises

Start a single-broker Kafka in KRaft mode (no ZooKeeper):

```bash
docker run -d --name kafka -p 9092:9092 \
  -e KAFKA_NODE_ID=1 \
  -e KAFKA_PROCESS_ROLES=broker,controller \
  -e KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
  -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 \
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 \
  -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
  apache/kafka:3.9.0

pip install confluent-kafka
```

A shell alias makes the CLI bearable:

```bash
kt() { docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 "$@"; }
kc() { docker exec kafka /opt/kafka/bin/kafka-configs.sh --bootstrap-server localhost:9092 "$@"; }
```

### 1. Prove `produce()` is asynchronous

```python
from confluent_kafka import Producer
p = Producer({"bootstrap.servers": "localhost:9092"})
for i in range(1000):
    p.produce("test-async", value=f"m{i}".encode())
print("produce() returned for all 1000")
# deliberately NO flush() — then exit immediately
```

Run it, then count what actually arrived:

```bash
kt --create --topic test-async --partitions 1 2>/dev/null
docker exec kafka /opt/kafka/bin/kafka-get-offsets.sh \
  --bootstrap-server localhost:9092 --topic test-async
```

Expected — the client itself warns you on exit:

```
%4|...|TERMINATE|rdkafka#producer-1| [thrd:app]: Producer terminating with
1000 messages (3890 bytes) still in queue or transit: use flush() to wait
for outstanding message delivery
```

```
test-async:0:0          <-- zero messages actually reached the log
```

Add `p.flush()` and re-run against a fresh topic:

```
test-async2:0:1000
```

All 1000 arrive. That's loss window #1, reproduced in ten lines — and note
that the *only* signal was a warning on stderr that an unattended service
would never surface.

### 2. Watch delivery callbacks fire

Add an `on_delivery` callback that counts successes and failures, call
`p.poll(0)` in the loop, and `p.flush()` at the end. Print both counters.

Expected: 1000 successes, 0 failures, and the offsets are contiguous. Then
stop the broker mid-run (`docker stop kafka`) and observe the failures
arriving through the callback rather than as exceptions from `produce()`.

### 3. Prove keys control partitioning and ordering

```python
p = Producer({"bootstrap.servers": "localhost:9092"})
for i in range(9):
    key = f"order-{i % 3}".encode()
    p.produce("test-keys", key=key, value=f"event-{i}".encode())
p.flush()
```

```bash
kt --create --topic test-keys --partitions 3 2>/dev/null
docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic test-keys --from-beginning \
  --property print.key=true --property print.partition=true --timeout-ms 5000
```

Expected — each key's events are together and in order:

```
Partition:0	order-0	event-0
Partition:0	order-0	event-3
Partition:0	order-0	event-6
Partition:0	order-2	event-2
Partition:0	order-2	event-5
Partition:0	order-2	event-8
Partition:1	order-1	event-1
Partition:1	order-1	event-4
Partition:1	order-1	event-7
```

Note `order-0` and `order-2` both landed in partition 0, and partition 2 got
nothing. That's correct, not a bug: hashing three keys over three partitions
does not distribute them evenly, and Kafka never promises it will. The
guarantee is only "same key → same partition", which is exactly what you
need for ordering — even distribution is a separate concern that emerges
from having many more keys than partitions.

Then re-run producing with `key=None` and confirm the records scatter with
no ordering guarantee.

### 4. Break ordering by adding partitions

With `test-keys` from exercise 3, record which partition `order-1` lands in.
Then:

```bash
kt --alter --topic test-keys --partitions 6
```

Produce the `order-1` key again and check its partition.

Expected: it may now land in a *different* partition, while its earlier
records remain in the old one — per-key ordering is permanently broken across
that boundary. Write one sentence on why this makes repartitioning a keyed
topic a migration rather than a scaling knob.

### 5. Measure what `linger.ms` and compression buy you

Produce 200,000 small JSON-ish records under four configs and time each:

| Config | `linger.ms` | `compression.type` |
|---|---|---|
| A | 0 | none |
| B | 20 | none |
| C | 0 | lz4 |
| D | 20 | lz4 |

Also record the resulting log size:

```bash
docker exec kafka du -sh /var/lib/kafka/data/<topic>-0
```

Expected: D is the fastest and smallest by a wide margin; C compresses far
less than D because with `linger.ms=0` there is less in each batch to
compress. That interaction is the point of the exercise.

### 6. Force `BufferError` by never polling

Produce in a tight loop with a small `queue.buffering.max.messages` (e.g.
1000) and never call `poll()`.

Expected: `BufferError: Local: Queue full`. Add `p.poll(0)` in the loop and
confirm it disappears. This is the failure mode behind "our producer randomly
throws under load."

### 7. Prove idempotence deduplicates retries

Set `enable.idempotence=True` and confirm the client rejects a conflicting
config:

```python
Producer({"bootstrap.servers": "localhost:9092",
          "enable.idempotence": True, "acks": "1"})
```

Expected — a hard error at construction, not a silent downgrade:

```
KafkaException: KafkaError{code=_INVALID_ARG,val=-186,
  str="Failed to create producer: `acks` must be set to `all`
       when `enable.idempotence` is true"}
```

Then confirm the
implied settings are in force by producing with idempotence on and checking
that offsets are contiguous with no gaps or repeats after a forced
reconnection (`docker restart kafka` mid-run).

### 8. Diagnose and fix: the topic that lost a day of orders

A team runs a 3-broker cluster. Their producer config:

```python
{"bootstrap.servers": "...", "acks": "1", "retries": 5,
 "compression.type": "snappy", "linger.ms": 100}
```

Their `orders` topic: `replication.factor=3`, `min.insync.replicas=1`.
During a rolling broker upgrade, ~40,000 order events disappeared. The
producer logged no errors. Find every contributing cause.

<details>
<summary>Solution</summary>

Four, compounding:

1. **`acks=1`.** The leader acknowledged writes it hadn't replicated. When
   that broker was restarted for the upgrade, everything not yet replicated
   was lost — and the producer had already been told it succeeded.
2. **`min.insync.replicas=1`.** Even had they set `acks=all`, this would have
   permitted a single in-sync replica to satisfy it, which is `acks=1` again.
   The durable combination is `acks=all` + `min.insync.replicas=2` +
   `replication.factor=3`.
3. **`retries=5` with no idempotence.** Retries during leader elections
   either duplicated records or reordered them; with `acks=1` some retries
   also "succeeded" against a leader about to be replaced.
4. **No delivery callback.** Every failure after the retry budget was
   exhausted was discarded silently, which is why the producer "logged no
   errors" — nothing was listening. `linger.ms=100` widened the in-memory
   window too, so a producer restart lost up to 100 ms of buffered records
   on top.

Fix: `enable.idempotence=True` (which forces `acks=all` and effectively
unlimited retries), `min.insync.replicas=2` on the topic, a delivery callback
that logs and alerts, and `flush()` on shutdown. Note that only the last two
would have made the loss *visible* — the first two prevent it.

</details>

### 9. Clean up

```bash
docker rm -f kafka
```

## Independent challenge

No solution given. Design the producer configuration and partitioning
strategy for a payments event stream with these requirements: events for the
same `account_id` must be strictly ordered; no event may ever be lost; the
system handles 50,000 events/sec at peak; one enterprise customer generates
30% of all traffic on a single account; and end-to-end latency must stay
under 200 ms at p99.

Give the full config with a justification per setting, choose a partition
count and key, and resolve the direct conflict between the hot-account
requirement and the per-account ordering requirement. Then state what you'd
monitor to know the durability guarantee is actually holding rather than
merely configured.

<details>
<summary>Stuck? One hint</summary>

The conflict is genuine and cannot be fully resolved by configuration:
strict per-account ordering means one account maps to exactly one partition,
so a 30% account *is* a hot partition by construction. The realistic options
are to accept it and size that partition's broker accordingly, to split the
key into `account_id + sub-stream` where the business can tolerate ordering
only within a sub-stream, or to negotiate the ordering requirement down to
something weaker (per-account-per-instrument, say). Choosing which is a
product conversation, not a Kafka one — and saying so explicitly is part of
the answer. For monitoring, "configured" and "holding" differ: watch ISR
shrink events and `min.insync.replicas` violations, not just producer error
rates.

</details>

## Common mistakes & troubleshooting

- **Treating `produce()` as "sent".** It buffers. Without `flush()` on
  shutdown you lose whatever is in memory.
- **No delivery callback.** Failures after the retry budget are silent; you
  find out from a downstream data gap days later.
- **Never calling `poll()`.** Callbacks never fire and you eventually get
  `BufferError: Local: Queue full`.
- **`acks=all` without `min.insync.replicas>=2`.** The ISR can shrink to the
  leader alone, silently degrading to `acks=1`.
- **Retries without idempotence.** Produces duplicates and can reorder within
  a partition.
- **Assuming `linger.ms=0` means no batching.** It means "send when the
  sender is free"; batches still form under load, and raising it usually
  helps throughput a lot.
- **Adding partitions to a keyed topic.** It re-maps keys and breaks per-key
  ordering across the change.
- **Keying by something low-cardinality or skewed** (country, tenant,
  status), producing hot partitions and capping parallelism.
- **Mismatched hashing with Java producers.** Use `murmur2_random` when both
  clients write the same keyed topic, or the same key lands in different
  partitions depending on which client wrote it.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Name the two windows in which a producer can lose messages, and the
   setting that closes each.
2. Why is `acks=all` insufficient on its own, and what must accompany it?
3. What does `enable.idempotence=True` guarantee, what does it implicitly
   set, and what does it *not* cover?
4. Why can retries reorder messages without idempotence, and what was the old
   fix?
5. What does `linger.ms=0` actually mean, and why does raising it improve
   compression?
6. How does a producer decide a record's partition with and without a key?
7. Why is adding partitions to a keyed topic a breaking change?
8. What does `delivery.timeout.ms` bound that `retries` doesn't?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. (a) In the local record accumulator — `produce()` buffers asynchronously,
   so a crash before the batch is sent loses those records; closed by calling
   `flush()` before shutdown (and by keeping `linger.ms` modest). (b) Between
   leader and replicas — the leader can ack before followers have the data;
   closed by `acks=all` together with `min.insync.replicas`.
2. Because `acks=all` means "all *currently in-sync* replicas", and the ISR
   can shrink — potentially to just the leader — at which point it provides
   the same guarantee as `acks=1`. It must be accompanied by
   `min.insync.replicas=2` (with `replication.factor=3`), so the broker
   rejects writes when too few replicas are in sync rather than accepting
   data it may lose.
3. It guarantees, per partition and per producer session, that retries are
   de-duplicated by the broker and ordering is preserved even with up to 5
   in-flight requests. It implicitly requires `acks=all`, effectively
   unlimited retries, and `max.in.flight.requests.per.connection <= 5`. It
   does **not** cover exactly-once across a producer restart (a new session
   gets a new PID), nor anything on the consumer side — those need
   transactions.
4. Because multiple batches can be in flight at once: if an earlier batch
   fails and is retried while a later batch already succeeded, the retried
   batch is appended after the later one, inverting their order. The old fix
   was `max.in.flight.requests.per.connection=1`, which serialises sends at a
   significant throughput cost.
5. It means "send as soon as the sender thread is available" — not "disable
   batching"; under load, batches still form. Raising it lets more records
   accumulate per batch, and since compression is applied per batch rather
   than per record, bigger batches compress substantially better.
6. With a key, the partition is `hash(key) % num_partitions`, so the same key
   always maps to the same partition (giving per-key ordering). Without a
   key, the client uses sticky partitioning — filling one partition's batch
   at a time before switching — which maximises batching but provides no
   ordering guarantee across records.
7. Because partition assignment is `hash(key) % num_partitions`; changing the
   partition count changes the modulus, so existing keys can map to different
   partitions while their historical records remain in the old ones. Per-key
   ordering is therefore broken across the change, making it a data migration
   rather than a scaling operation.
8. It bounds the *total* time from `produce()` to final success or failure —
   including time spent buffering in the accumulator, all retries, and
   waiting for acknowledgement. `retries` only bounds the number of attempts,
   and attempts are themselves capped by this timeout, so it's the setting
   that actually determines when the delivery callback fires with an error.

</details>

## Further reading & sources

- [Kafka: Producer configuration reference](https://kafka.apache.org/documentation/#producerconfigs) - authoritative defaults and semantics for every setting used here.
- [KIP-98: Exactly-once delivery and transactional messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging) - the design behind the idempotent producer's PID/sequence-number mechanism.
- [confluent-kafka-python: Producer](https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html#producer) - the client API used in this track, including `poll`/`flush` semantics.
- [Confluent: Producer configurations for durability](https://developer.confluent.io/courses/architecture/producer-hands-on/) - the acks / min.insync.replicas interaction explained with failure scenarios.
- [Module 10, backend/06](../../06-background-processing-and-realtime/10-message-brokers-kafka/README.md) - the Kafka fundamentals this track assumes.

## Next

[01-consumer-groups-and-rebalancing-in-depth](../01-consumer-groups-and-rebalancing-in-depth/README.md) —
messages are now reliably in the log. Module 01 covers the harder half:
getting them out again without stalling your consumer fleet every time an
instance restarts.
