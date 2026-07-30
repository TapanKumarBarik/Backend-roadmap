# Module 10: Message Brokers — Kafka

## Why this matters

Both brokers you've used so far — Redis-as-broker and RabbitMQ — share
one property: once a message is consumed (Redis) or acked (RabbitMQ),
it's gone. That's exactly right for "do this piece of work exactly once."
It's exactly wrong for a different, very common need: **several
independent systems each need to read the same stream of events, at
their own pace, and sometimes replay history** — analytics reprocessing
last week's orders after a bug fix, a new service backfilling from
events that happened before it existed, an audit system needing every
event ever emitted. Kafka's model is a durable, ordered, replayable
**log**, not a queue that empties as it's consumed. This module builds
that mental model and the concrete mechanics (topics, partitions,
consumer groups, offsets) that make replay and independent consumption
possible at once.

## Concepts

### A topic is a log, not a queue

RabbitMQ's queue holds messages until *a* consumer acks them, then
they're gone. A Kafka **topic** instead appends every message to the end
of a log and keeps them for a configured **retention period** (or
forever, with unlimited retention) — regardless of whether anyone has
read them yet. Consuming a message doesn't remove it. Multiple consumers
can read the same topic from different positions, and one consumer can
re-read from an earlier position later.

```
  RabbitMQ queue: consumed message is gone
    [msg1][msg2][msg3] ──consume msg1──► [msg2][msg3]

  Kafka topic: consumed message stays; consumers track their own position
    [msg1][msg2][msg3][msg4][msg5]  ← the log, unchanged by reading
           ▲              ▲
      consumer A      consumer B
      (read up to 2)  (read up to 4, independently)
```

### Partitions: how a topic scales and how ordering actually works

A topic is split into **partitions** — independent, ordered logs that
together make up the topic. Kafka guarantees order **within** a
partition, never across the whole topic. Each message is assigned a
partition based on its **key** (same key → same partition, always,
via a hash), so "all events for order 42" land in the same partition and
are read in the order they were produced — but "all events across every
order" have no guaranteed cross-partition ordering.

```
  topic: orders (3 partitions)

  partition 0: [order 42 created][order 42 paid][order 88 created]
  partition 1: [order 17 created][order 17 cancelled]
  partition 2: [order 55 created][order 55 paid][order 55 shipped]

  key = order_id  →  same order_id always hashes to the same partition
  → per-order event order is guaranteed; cross-order order is not
```

This is the practical reason to pick a message's **key** deliberately:
key by the entity whose event order actually matters to you (order ID,
user ID, device ID), not by something arbitrary — otherwise related
events can land in different partitions and be processed out of order
relative to each other.

### Offsets: each consumer tracks its own position in the log

An **offset** is a message's position within its partition (0, 1, 2,
...). A consumer doesn't ack individual messages the way RabbitMQ does —
it periodically **commits** the offset up to which it has processed,
recording "I'm caught up through message N in this partition." On
restart, it resumes from its last committed offset, not from the
beginning and not from whatever's newest. This is what makes replay
possible: manually resetting a consumer's committed offset backward
makes it re-read everything from that point forward, on demand.

```
  partition 0: [0][1][2][3][4][5][6][7]
                           ▲
                  committed offset = 4
                  (consumer has processed 0-4; resumes at 5 next)

  replay: reset committed offset to 0 → re-reads 0-7 from the start
```

### Consumer groups: how Kafka gives you both fan-out and work-sharing

This is the piece that resolves module 08's "fan-out vs. competing
consumers" tension instead of forcing a choice between them. A
**consumer group** is a named set of consumer instances that *share* the
partitions of a topic — each partition is read by exactly one consumer
*within* that group (competing-consumers, work-sharing). But a
**different** consumer group reading the same topic gets its own
complete, independent copy of every partition (fan-out, the pub/sub
property). Put together: multiple groups get fan-out; consumers *within*
one group split the work.

```
  topic: orders (3 partitions)

  consumer group "billing"          consumer group "analytics"
    consumer 1 ← partition 0          consumer A ← partition 0
    consumer 2 ← partition 1            (analytics reads ALL partitions
    consumer 3 ← partition 2             independently of billing's group,
    (work SPLIT across 3 consumers)      on its own offsets)
```

If a consumer group has *fewer* consumers than partitions, one consumer
reads multiple partitions. If it has *more* consumers than partitions,
the extra consumers sit idle — a partition can only be assigned to one
consumer within a group at a time, which is also the hard ceiling on how
much you can parallelize consumption of a single topic within one group
(add partitions, not just consumers, to raise that ceiling).

### Delivery semantics and idempotency, once more

Kafka gives **at-least-once** delivery by default (like RabbitMQ's
manual-ack mode, like Celery): a consumer that crashes after processing
a message but before committing its offset will reprocess that message
on restart. The fix is the same idempotency discipline from module 02
and module 09 — nothing about Kafka removes the need for it. (Kafka also
supports an opt-in "exactly-once" processing mode for
Kafka-to-Kafka pipelines specifically; it doesn't extend to arbitrary
external side effects like charging a card, so idempotent handling still
matters for those regardless.)

### Kafka vs. RabbitMQ vs. Redis, revisited

| | Redis (as broker) | RabbitMQ | Kafka |
|---|---|---|---|
| Storage model | Ephemeral list/pub-sub | Queue, emptied on ack | Log, retained regardless of consumption |
| Replay | No | No | Yes — reset offset, re-read |
| Ordering guarantee | None | Per-queue (roughly FIFO) | Per-partition only |
| Fan-out + work-sharing together | Pick one | Pick one (per queue) | Both — different consumer groups |
| Best fit | Simple queues, ephemeral signals | Routing rules, per-message reliability | High-volume streams, multiple independent readers, replay/reprocessing |

The decision that actually matters in practice: if you're asking "how do
I make sure this one piece of work happens," you want a queue
(Redis/RabbitMQ). If you're asking "how do multiple, independent,
possibly-not-yet-built systems each get their own complete view of
everything that happened, including things that happened before they
existed," you want a log (Kafka).

## Command reference

| Concern | kafka-python API / CLI |
|---|---|
| Producer | `KafkaProducer(bootstrap_servers="localhost:9092")` |
| Produce with a key | `producer.send("orders", key=b"42", value=b'{"event":"created"}')` |
| Consumer in a group | `KafkaConsumer("orders", group_id="billing", bootstrap_servers=..., auto_offset_reset="earliest")` |
| Manual offset commit | `consumer.commit()` (after `enable_auto_commit=False`) |
| List topics | `docker exec kafka kafka-topics.sh --bootstrap-server localhost:9092 --list` |
| Describe a topic (partitions) | `docker exec kafka kafka-topics.sh --describe --topic orders --bootstrap-server localhost:9092` |
| Reset a group's offset to earliest | `docker exec kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group billing --topic orders --reset-offsets --to-earliest --execute` |
| Check consumer group lag | `docker exec kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group billing` |

A keyed producer — `producer.py`:

```python
import json
from kafka import KafkaProducer

producer = KafkaProducer(
    bootstrap_servers="localhost:9092",
    value_serializer=lambda v: json.dumps(v).encode(),
    key_serializer=lambda k: k.encode(),
)

def publish_order_event(order_id: int, event_type: str, **fields):
    producer.send("orders", key=str(order_id), value={"order_id": order_id, "type": event_type, **fields})

publish_order_event(42, "created", total=99.00)
publish_order_event(42, "paid")
publish_order_event(17, "created", total=15.00)
producer.flush()
```

A consumer in the `billing` group with manual offset commit —
`billing_consumer.py`:

```python
import json
from kafka import KafkaConsumer

consumer = KafkaConsumer(
    "orders",
    bootstrap_servers="localhost:9092",
    group_id="billing",
    value_deserializer=lambda v: json.loads(v.decode()),
    enable_auto_commit=False,
    auto_offset_reset="earliest",
)

for message in consumer:
    event = json.loads(json.dumps(message.value))  # already a dict via deserializer
    print(f"partition={message.partition} offset={message.offset} event={event}")
    process_billing_event(event)          # your idempotent handler
    consumer.commit()                     # only advance after success

def process_billing_event(event):
    print(f"billing processed order {event['order_id']} ({event['type']})")
```

## Hands-on exercises

Run a single-node Kafka broker with Docker Compose (KRaft mode, no
separate Zookeeper needed):

```bash
mkdir -p ~/learn-backend/kafka-lab && cd ~/learn-backend/kafka-lab
cat > compose.yaml <<'EOF'
services:
  kafka:
    image: apache/kafka:3.7.0
    container_name: kafka
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
EOF
docker compose up -d
```

`pip install kafka-python`.

### 1. Create a topic with multiple partitions and inspect it

```bash
docker exec kafka /opt/kafka/bin/kafka-topics.sh --create --topic orders \
  --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
docker exec kafka /opt/kafka/bin/kafka-topics.sh --describe --topic orders \
  --bootstrap-server localhost:9092
```

Expected: output listing `PartitionCount: 3` and each partition's leader
— confirming the topic is actually split into 3 independent logs, not
one.

### 2. Prove same-key messages land in the same partition, in order

Run the `producer.py` pattern from the Concepts section, publishing
several events for `order_id=42` and a few for `order_id=17`. Then read
raw partition assignments:

```bash
docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh --topic orders \
  --bootstrap-server localhost:9092 --from-beginning \
  --property print.partition=true --property print.key=true --timeout-ms 5000
```

Expected: every message with key `42` shows the *same* partition number,
in the order they were sent; every message with key `17` shows its own
(possibly different) partition, also in order. This is the "same key,
same partition, ordered within it" guarantee, made visible.

### 3. Consumer group work-sharing: two consumers split three partitions

Start two instances of `billing_consumer.py` (same `group_id="billing"`)
in two terminals, then publish several keyed events spread across
different order IDs so they land on different partitions. Expected: the
two consumer processes each print messages from a *different subset* of
partitions — they split the 3 partitions between them (one gets 2
partitions, the other gets 1, or similar), never both printing the exact
same message. Check the assignment explicitly:

```bash
docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group billing
```

Expected: the `CONSUMER-ID` column shows each partition assigned to
exactly one of your two running consumer processes.

### 4. Consumer group fan-out: a second group reads everything independently

With `billing`'s consumers still running (or stopped, doesn't matter),
start a *new* consumer using `group_id="analytics"` instead, reading the
same `orders` topic from `auto_offset_reset="earliest"`. Expected: the
analytics consumer reads **every** message ever published to the topic
(not just new ones), completely independently of whatever offset
`billing`'s group had already committed — proving one topic serves both
groups' full, independent views at once.

### 5. Replay: reset a consumer group's offset backward

Let `billing`'s consumer fully catch up (no more new messages arriving),
then stop it (`Ctrl+C`, or let the script exit) and reset its offset:

```bash
docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group billing --topic orders --reset-offsets --to-earliest --execute
```

Expect this to **fail the first few times** with `Error: Assignments can
only be reset if the group 'billing' is inactive, but the current state
is Stable` (or `PreparingRebalance`). A consumer group isn't
"gone" the instant your script exits — Kafka only considers it inactive
after the group's session timeout expires (tens of seconds by default),
so retry the same command every few seconds until it prints a
`NEW-OFFSET` table instead of an error. This lag between "my script
stopped" and "the broker agrees this consumer is gone" is a real
operational quirk, not a mistake in the command.

Once the reset succeeds, restart `billing_consumer.py`. Expected: it
reprocesses every message from the beginning of the topic, even ones it
had already committed past before — this is the capability RabbitMQ and
Redis fundamentally cannot give you once a message has been
acked/consumed.

### 6. Diagnose and fix: a new service can't see historical events

A team adds a new `fraud-detection` consumer group to an existing
`orders` topic that's been running for months. On first run it sees
*nothing* — no historical orders, only events published after it
started — even though the retention period is long enough to have kept
everything.

<details>
<summary>Solution</summary>

Root cause: a brand-new consumer group with no previously committed
offset defaults to Kafka's `auto_offset_reset` policy, and the common
default is `"latest"` — meaning "start reading from whatever's newest
right now," skipping everything already in the log even though it's
still there and readable.

Fix: set `auto_offset_reset="earliest"` for the new consumer group
before its first run (as this module's `billing_consumer.py` does) so it
starts from the beginning of the retained log instead of only new
messages. This only affects a group with *no* committed offset yet —
once it has committed at least once, subsequent restarts resume from
that committed position regardless of this setting.

</details>

### 7. Clean up

```bash
docker compose down
cd ~ && rm -rf ~/learn-backend/kafka-lab
```

## Independent challenge

No code given. Design a Kafka setup for an `orders` topic that three
independent teams read from: **billing** must process every order
exactly once per order lifecycle stage in the correct per-order
sequence (never a `paid` event processed before that same order's
`created` event); **fraud-detection** is a brand-new service that must
be able to scan the *entire* history of orders from day one, independent
of what billing has already consumed; **a load test** needs to
temporarily replay last week's traffic through fraud-detection again
without touching billing's position at all. Decide the partition key,
the topic's partition count, and each consumer's group ID and
`auto_offset_reset` setting, and justify each choice. Prove the
isolation: show that resetting fraud-detection's offset for the replay
does not change billing's committed position or cause billing to
reprocess anything.

<details>
<summary>Stuck? One hint</summary>

Key every message by `order_id` (guarantees per-order ordering within a
partition, satisfying billing's requirement). Give billing and
fraud-detection separate `group_id`s so their offsets are tracked
completely independently — resetting one's offset via
`kafka-consumer-groups.sh --group fraud-detection ...` never touches
`--group billing`'s committed position, because consumer group offsets
are stored per-group. `fraud-detection`'s first run needs
`auto_offset_reset="earliest"` to see history; billing likely also wants
`earliest` so a first deploy doesn't skip pre-existing orders, but
that's a one-time concern since its offset persists after that.

</details>

## Common mistakes & troubleshooting

- **Assuming ordering holds across an entire topic.** Kafka only
  guarantees order *within* a partition. Two events for different keys
  can be processed in either order relative to each other, even if they
  were published moments apart — design around per-key ordering, not
  global ordering.
- **Picking a partition key that doesn't match what actually needs
  ordering.** Keying by something arbitrary (a random UUID per message,
  say) defeats the purpose — related events for the same entity can land
  in different partitions and be processed out of order relative to each
  other.
- **Leaving `auto_offset_reset` at its default for a brand-new consumer
  group and expecting history.** As exercise 6 showed, a fresh group
  with no committed offset and a `"latest"` default only sees messages
  produced after it starts, even though older messages are still
  retained and readable with `"earliest"`.
- **Adding more consumers than partitions and expecting more
  parallelism.** A partition is assigned to exactly one consumer within
  a group at a time; consumers beyond the partition count sit idle.
  Raise the partition count to raise the real ceiling on parallel
  consumption within one group.
- **Confusing "Kafka retains messages" with "Kafka is a substitute for a
  database."** Retention has a configured period (or is unlimited, but
  that's a deliberate choice, not automatic) — it's a durable log for
  streaming and replay, not a query-friendly datastore; don't design
  around "query Kafka for the current state of an order" the way you'd
  query a database.
- **Trying to reset a consumer group's offset immediately after stopping
  its consumer.** As exercise 5 showed, the broker keeps a group
  "Stable" or "PreparingRebalance" for a while after its last member
  disconnects (governed by the session timeout) — `--reset-offsets`
  refuses to run until the group is fully inactive. Retry after a short
  wait rather than assuming the command itself is broken.
- **Committing an offset before processing succeeds.** The same mistake
  as RabbitMQ's `auto_ack=True` problem (module 09) — commit only after
  the work is actually done, or a crash between commit and completion
  silently loses that message's processing.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the core difference between how RabbitMQ/Redis treat a
   consumed message and how Kafka treats one?
2. What determines which partition a message is written to, and what
   ordering guarantee does that give you (and not give you)?
3. What is an offset, and how does it differ from RabbitMQ's per-message
   acknowledgment?
4. How do consumer groups let Kafka provide both work-sharing (like a
   queue) and fan-out (like pub/sub) from the same topic at once?
5. What happens if a consumer group has more consumer instances than the
   topic has partitions?
6. A brand-new consumer group sees no historical messages on its first
   run despite a long retention period. What setting controls this, and
   what should it be set to instead?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. RabbitMQ and Redis both remove or stop tracking a message once it's
   handled (acked or delivered) — it's gone for future consumers. Kafka
   appends messages to a retained log and consuming one doesn't remove
   it; other consumers, including ones that don't exist yet, can still
   read it later, and the same consumer can re-read it by resetting its
   offset.
2. The message's key (hashed) determines its partition — the same key
   always maps to the same partition. This guarantees ordering *within*
   that partition (all events for that key arrive in send order) but
   gives no ordering guarantee *across* different partitions/keys.
3. An offset is a message's position within its partition; a consumer
   periodically commits how far it's processed, and resumes from that
   committed position on restart. Unlike RabbitMQ's per-message ack,
   it's a single running position per partition, not an individual flag
   per message — and unlike an ack, committing doesn't remove anything
   from the log.
4. Consumers *within* the same group split a topic's partitions among
   themselves (each partition read by exactly one consumer in that
   group), giving work-sharing. A *different* consumer group reading the
   same topic gets its own independent, complete copy of every
   partition, tracked with its own offsets — giving fan-out across
   groups while still sharing work within each one.
5. The extra consumer instances beyond the partition count sit idle —
   a single partition can only be assigned to one consumer within a
   group at any given time, so consumer count beyond partition count
   adds no additional parallelism for that group.
6. The consumer's `auto_offset_reset` setting, which only applies when a
   group has no previously committed offset. It commonly defaults to
   `"latest"` (skip straight to new messages); setting it to
   `"earliest"` makes a brand-new group start from the beginning of the
   retained log instead.

</details>

## Further reading & sources

- [Apache Kafka: Introduction](https://kafka.apache.org/documentation/#gettingStarted) - the official conceptual overview of topics, partitions, and the log model.
- [Confluent: Consumer groups explained](https://developer.confluent.io/courses/architecture/consumer-group-protocol/) - a deeper look at partition assignment and rebalancing within a group.
- [Apache Kafka: Offset management](https://kafka.apache.org/documentation/#semantics) - delivery-semantics reference, including at-least-once and the opt-in exactly-once mode.
- [kafka-python documentation](https://kafka-python.readthedocs.io/) - the Python client used throughout this module's code.
- [Confluent: Kafka vs. traditional messaging systems](https://developer.confluent.io/learn-more/podcasts/apache-kafka-vs-traditional-messaging-technology/) - a direct comparison covering the same RabbitMQ-vs-Kafka tradeoffs discussed in this module.

## Next

[11-mobile-push-notifications](../11-mobile-push-notifications/README.md) —
one more outbound channel this track hasn't covered yet: reaching a user's
phone even when your app isn't open, via a push provider (APNs/FCM)
instead of a broker you run yourself.
</content>
