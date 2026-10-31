# Module 02: Delivery Semantics and Exactly-Once

## Why this matters

"Exactly-once" is the most misunderstood phrase in streaming. It's often
dismissed as impossible (true, for *delivery* over an unreliable network) and
just as often assumed to be a checkbox (false). Kafka does provide genuine
exactly-once **processing** — but only within a specific boundary, and only
if you use the right API. Outside that boundary, the honest answer is
at-least-once plus idempotent handlers, and knowing which situation you're in
is the actual skill.

Getting this wrong is expensive in a way that's specific to money: a payment
consumer that reprocesses a batch after a rebalance charges customers twice.

## Concepts

### The three semantics, and where they come from

| Semantic | Mechanism | Failure result |
|---|---|---|
| At-most-once | Commit offset *before* processing | Records lost on crash |
| At-least-once | Commit offset *after* processing | Records reprocessed on crash |
| Exactly-once | Offset commit and output in one transaction | Neither |

The first two are decided by one line of ordering:

```python
# AT-MOST-ONCE — do not do this unless loss is genuinely acceptable
msg = consumer.poll(1.0)
consumer.commit(msg)          # committed first
process(msg)                  # crash here -> record never processed, never retried

# AT-LEAST-ONCE — the correct default
msg = consumer.poll(1.0)
process(msg)                  # crash here -> record redelivered to the next owner
consumer.commit(msg)          # committed only after success
```

### Auto-commit is neither, reliably

```python
{"enable.auto.commit": True, "auto.commit.interval.ms": 5000}
```

Auto-commit fires on a **timer**, during `poll()`, for everything returned by
the *previous* poll — whether or not you finished processing it. So it's
at-least-once when your batch completes faster than the interval, and
at-most-once when it doesn't. You don't get to choose which, and it varies
with load.

Auto-commit is fine for genuinely idempotent, loss-tolerant work (metrics,
logs, cache warming). For anything else, turn it off:

```python
{"enable.auto.commit": False}
```

### At-least-once, done properly

```python
from confluent_kafka import Consumer, KafkaError

consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "payments",
    "enable.auto.commit": False,
    "auto.offset.reset": "earliest",
    "max.poll.records": 20,           # module 01: keep batches small
    "partition.assignment.strategy": "cooperative-sticky",
})
consumer.subscribe(["orders"])

try:
    while True:
        msg = consumer.poll(1.0)
        if msg is None:
            continue
        if msg.error():
            if msg.error().code() == KafkaError._PARTITION_EOF:
                continue
            raise KafkaException(msg.error())

        process(msg)                              # must be idempotent
        consumer.commit(msg, asynchronous=False)  # synchronous: know it landed
finally:
    consumer.close()                              # commits + leaves group cleanly
```

Committing synchronously per record is the safest and slowest option.
Committing per *batch* is the usual compromise — you narrow the reprocessing
window to one batch rather than one record, which is why small
`max.poll.records` helps twice.

### The offset you commit is `offset + 1`

This trips people up constantly. A committed offset means "the next record I
want", not "the last record I processed":

```python
from confluent_kafka import TopicPartition

# commit position AFTER msg
consumer.commit(offsets=[TopicPartition(msg.topic(), msg.partition(), msg.offset() + 1)])
```

`consumer.commit(message=msg)` does the `+1` for you. Doing it manually and
forgetting the `+1` means every restart reprocesses one record per partition
— a subtle, low-grade duplicate source that's hard to spot.

### Idempotent processing beats clever delivery

For most systems, the right answer is **at-least-once delivery + an
idempotent handler**, not transactions. Track 10's idempotency-key pattern
applies directly:

```python
def process(msg):
    event = json.loads(msg.value())
    key = event["event_id"]                      # producer-assigned, stable
    with db.transaction():
        # UNIQUE(event_id) makes the second attempt a no-op
        inserted = db.execute(
            "INSERT INTO processed_events (event_id) VALUES (%s) "
            "ON CONFLICT (event_id) DO NOTHING RETURNING event_id", (key,))
        if not inserted:
            return                               # already handled; skip silently
        apply_business_effect(event)
```

This works regardless of Kafka's guarantees, survives consumer restarts and
rebalances, and — crucially — extends to side effects Kafka transactions
can't cover at all, like charging a card or sending an email.

### Kafka transactions: exactly-once *within Kafka*

Transactions solve one specific shape: **consume from Kafka, process, produce
to Kafka** — atomically, including the offset commit.

```python
from confluent_kafka import Producer, Consumer, TopicPartition

producer = Producer({
    "bootstrap.servers": "localhost:9092",
    "transactional.id": "payment-processor-1",   # MUST be stable per instance
    "enable.idempotence": True,                  # implied, but be explicit
})
producer.init_transactions()

consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "payments",
    "enable.auto.commit": False,                 # transaction owns the offsets
    "isolation.level": "read_committed",         # don't read aborted data
})
consumer.subscribe(["orders"])

while True:
    msgs = consumer.consume(num_messages=100, timeout=1.0)
    if not msgs:
        continue

    producer.begin_transaction()
    try:
        for msg in msgs:
            if msg.error():
                continue
            producer.produce("payments", key=msg.key(), value=transform(msg.value()))

        # the offsets become part of the transaction — this is the whole trick
        producer.send_offsets_to_transaction(
            consumer.position(consumer.assignment()),
            consumer.consumer_group_metadata(),
        )
        producer.commit_transaction()
    except Exception:
        producer.abort_transaction()
        raise
```

Three settings carry the guarantee:

- **`transactional.id`** — stable per logical instance. On restart, Kafka
  fences the previous session (zombie fencing), so a hung old instance can't
  write. If two live instances share one `transactional.id`, they fence each
  other in a loop.
- **`send_offsets_to_transaction`** — makes the consumer's offset commit part
  of the producer transaction. Without it you have atomic *output* but a
  separate offset commit, which is just at-least-once again.
- **`isolation.level=read_committed`** on downstream consumers — otherwise
  they read records from aborted transactions.

### What transactions do *not* cover

This is the part people miss. The atomicity is **Kafka-to-Kafka only**:

```python
producer.begin_transaction()
charge_credit_card(order)              # ← NOT part of the transaction
producer.produce("payments", ...)
producer.commit_transaction()          # if this aborts, the card is still charged
```

Any external side effect — a database write, an HTTP call, an email — is
outside the transaction boundary. If you need atomicity across Kafka *and* a
database, you need the transactional-outbox pattern (track 10) or an
idempotent handler, not Kafka transactions.

### The cost

Transactions add latency (each commit is a two-phase round trip through the
transaction coordinator), reduce throughput meaningfully, require
`read_committed` consumers to wait for the LSO (last stable offset) — so a
long-running transaction blocks downstream reads — and add operational
surface via `transactional.id` lifecycle management.

**Decision rule:** use transactions when the work is genuinely Kafka-to-Kafka
(stream processing, enrichment, routing) and duplicates are unacceptable. Use
at-least-once with idempotent handlers for everything that touches the
outside world. Most services are the second case.

## Command reference

| Concern | Setting / API |
|---|---|
| Disable auto-commit | `enable.auto.commit=False` |
| Commit after processing | `consumer.commit(msg, asynchronous=False)` |
| Manual offset (note the +1) | `TopicPartition(t, p, msg.offset() + 1)` |
| Enable transactions | `transactional.id=<stable-id>` + `producer.init_transactions()` |
| Transaction lifecycle | `begin_transaction()` / `commit_transaction()` / `abort_transaction()` |
| Atomic offsets | `producer.send_offsets_to_transaction(positions, group_metadata)` |
| Hide aborted records | consumer `isolation.level=read_committed` |
| Inspect committed offsets | `kafka-consumer-groups.sh --describe --group g ...` |
| Reset to reprocess | `kafka-consumer-groups.sh --reset-offsets --to-earliest --execute ...` |

## Hands-on exercises

Use the broker from module 00.

```bash
kt --create --topic tx-in --partitions 2
kt --create --topic tx-out --partitions 2
```

### 1. Produce at-most-once loss

Commit before processing, then `kill -9` the consumer mid-batch. Restart it.

Expected: records that were in flight are never processed and never
redelivered — the offset moved past them. Count what you processed vs. what
was produced and confirm the gap.

### 2. Produce at-least-once duplicates

Move the commit after processing and repeat the kill.

Expected: on restart, records already processed are delivered again. Log
processed IDs to a set and count duplicates.

### 3. Show auto-commit is neither

Set `enable.auto.commit=True`, `auto.commit.interval.ms=5000`, and make
processing take 8 seconds per batch. Kill mid-batch.

Expected: some records both committed *and* unprocessed (loss), depending on
where the timer fell. Then make processing take 1 second and repeat —
now you get duplicates instead. Same config, opposite semantics, decided by
timing.

### 4. Prove the `+1` matters

Commit `msg.offset()` instead of `msg.offset() + 1`, restart the consumer,
and observe.

Expected: exactly one record per partition is reprocessed every restart.
Small, permanent, easy to miss in testing.

### 5. Build an idempotent handler

Add a SQLite (or Postgres) `processed_events(event_id PRIMARY KEY)` table and
the `ON CONFLICT DO NOTHING` guard. Re-run exercise 2's kill test.

Expected: duplicates are still *delivered*, but the business effect happens
once. Confirm by counting rows in your effect table, not messages consumed.

### 6. Run a real transactional consume-process-produce

Implement the transaction loop above. Verify it works, then introduce a
deliberate failure after `produce()` but before `commit_transaction()` (raise
an exception so `abort_transaction()` runs).

Expected: with a `read_committed` consumer on `tx-out`, the aborted records
are **not** visible, and the offsets weren't committed either — so on restart
the input is reprocessed cleanly. Now read `tx-out` with
`isolation.level=read_uncommitted` and confirm you *can* see the aborted
records. That contrast is the whole point of `isolation.level`.

### 7. Watch zombie fencing

Start two processes with the **same** `transactional.id`. Have both attempt
transactions.

Expected: one gets fenced with a `ProducerFenced`-style error the moment the
other calls `init_transactions()`. Write one sentence on why this is a safety
feature rather than a bug, and what it implies for how you assign
`transactional.id` in Kubernetes.

### 8. Diagnose and fix: the double-charged customers

A payments consumer uses transactions and looks correct:

```python
producer = Producer({"bootstrap.servers": "...", "transactional.id": "payments"})
producer.init_transactions()
consumer = Consumer({"group.id": "payments", "enable.auto.commit": True})

while True:
    msgs = consumer.consume(100, timeout=1.0)
    producer.begin_transaction()
    for msg in msgs:
        charge_card(msg)                                  # external API call
        producer.produce("receipts", value=receipt(msg))
    producer.commit_transaction()
```

Customers report duplicate charges after every deploy. Find all the bugs.

<details>
<summary>Solution</summary>

Three, and the first is fatal to the whole design:

1. **`charge_card()` is outside the transaction boundary.** Kafka
   transactions are Kafka-to-Kafka only. If `commit_transaction()` fails or
   the process dies after some charges, those charges have already happened
   and cannot be rolled back — but the offsets weren't committed, so on
   restart the same records are reprocessed and the cards are charged again.
   No Kafka setting fixes this; the charge must be made idempotent (an
   idempotency key on the payment provider's API, which every real provider
   supports) or moved out of the transaction with an outbox.
2. **`enable.auto.commit=True` alongside transactions.** The consumer commits
   offsets on its own timer, independently of the transaction, so the atomic
   offset guarantee is entirely defeated. It must be `False`, with
   `send_offsets_to_transaction()` doing the commit.
3. **`send_offsets_to_transaction()` is missing.** Even with auto-commit off,
   nothing ties the offsets to the transaction — you'd get atomic output and
   no offset progress at all.

There's also a deployment hazard: a single hardcoded `transactional.id` means
you can only ever run one instance, and two overlapping instances during a
rolling deploy will fence each other repeatedly.

</details>

### 9. Clean up

```bash
kt --delete --topic tx-in; kt --delete --topic tx-out
```

## Independent challenge

No solution given. You're building an order-fulfilment consumer that, per
order event, must: write a row to Postgres, call a warehouse REST API to
reserve stock, and emit a `stock.reserved` event to Kafka. Duplicates cause
double-reservations, which cost real money.

Design the delivery guarantee. Decide whether Kafka transactions help at all
here, and if not, what does. Specify exactly where idempotency keys live,
what happens when the warehouse API times out (you don't know if it
succeeded), and what your consumer does on restart mid-order. Then state the
one failure mode your design still can't prevent, and why accepting it is
reasonable.

<details>
<summary>Stuck? One hint</summary>

Kafka transactions cover only the Kafka write, so they can't make the
Postgres write and the warehouse call atomic with it — this is the
distributed-transaction problem from track 10, and the standard answers are
the transactional outbox (write the row *and* the outbox event in one
Postgres transaction, publish separately) plus an idempotency key on the
warehouse call so a timeout can be safely retried. The failure mode you
can't eliminate is the gap between "warehouse reserved stock" and "we
recorded that it did": if you crash in between, the retry relies entirely on
the warehouse honouring the idempotency key. That's why the key must be
derived deterministically from the event (e.g. the `event_id`), not
generated per attempt.

</details>

## Common mistakes & troubleshooting

- **Assuming auto-commit gives at-least-once.** It's timer-based and gives
  whichever semantic the timing happens to produce.
- **Committing `msg.offset()` instead of `offset + 1`.** One reprocessed
  record per partition on every restart.
- **Believing transactions cover external side effects.** They are
  Kafka-to-Kafka only; database writes and API calls are outside the
  boundary.
- **Transactions without `send_offsets_to_transaction()`.** Atomic output,
  non-atomic offsets — i.e. at-least-once with extra latency.
- **Leaving `enable.auto.commit=True` with transactions.** Defeats the offset
  guarantee entirely.
- **Downstream consumers on `read_uncommitted`.** They see records from
  aborted transactions.
- **Sharing one `transactional.id` across instances.** They fence each other
  continuously.
- **Long-running transactions.** They hold the LSO back and stall
  `read_committed` consumers downstream.
- **Reaching for EOS when an idempotent handler would do.** Simpler, faster,
  and covers external effects that transactions can't.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. What single ordering decision distinguishes at-most-once from
   at-least-once?
2. Why is auto-commit neither reliably, and when is it acceptable?
3. Why do you commit `msg.offset() + 1`?
4. What exactly does a Kafka transaction make atomic, and what does it not
   cover?
5. What does `send_offsets_to_transaction()` add, and what do you get without
   it?
6. What is `isolation.level=read_committed` for, and what breaks without it?
7. What does `transactional.id` do on restart, and what goes wrong if two
   instances share one?
8. When should you prefer at-least-once with an idempotent handler over
   transactions?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Whether the offset is committed before or after processing. Committing
   first gives at-most-once (a crash loses the record, since the offset has
   already advanced past it); committing after gives at-least-once (a crash
   redelivers it).
2. Because it commits on a timer during `poll()`, covering records from the
   previous poll regardless of whether processing finished — so it behaves as
   at-least-once when batches finish faster than the interval and
   at-most-once when they don't, varying with load. It's acceptable for
   idempotent, loss-tolerant work such as metrics, logs or cache warming.
3. Because a committed offset means "the next record I want to read", not
   "the last one I processed". Committing the record's own offset makes the
   consumer re-read that record after a restart, producing one duplicate per
   partition every time.
4. It makes the records produced to Kafka topics *and* the consumer offset
   commit atomic — all visible together or not at all. It does not cover any
   external side effect: database writes, HTTP calls, emails and payments all
   sit outside the transaction boundary and are not rolled back by an abort.
5. It makes the consumer's offset commit part of the producer transaction, so
   input position and output records commit atomically. Without it you have
   atomic output but an independent offset commit, which is just
   at-least-once with the added cost of transactions.
6. It makes a consumer skip records belonging to aborted (or still open)
   transactions, so it only sees committed data. Without it (on
   `read_uncommitted`, the default) a downstream consumer reads records from
   transactions that were later aborted — data that logically never happened.
7. It gives the producer a stable identity so that, on restart, Kafka fences
   the previous session and prevents a hung or zombie old instance from
   writing. If two live instances share one, each fences the other as it
   initialises, and they knock each other out repeatedly.
8. Whenever the work touches anything outside Kafka — a database, an external
   API, a payment provider — because transactions can't cover those anyway.
   It's also the right default when duplicates are cheap to absorb, since it
   avoids the latency, throughput cost and operational complexity of the
   transactional path.

</details>

## Further reading & sources

- [KIP-98: Exactly-once delivery and transactional messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging) - the transaction coordinator design, fencing, and LSO.
- [Confluent: Transactions in Apache Kafka](https://www.confluent.io/blog/transactions-apache-kafka/) - the canonical walkthrough of consume-process-produce.
- [Kafka: Consumer configuration — `isolation.level`](https://kafka.apache.org/documentation/#consumerconfigs_isolation.level) - read_committed semantics and the LSO.
- [confluent-kafka-python: transactional API](https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html#transactional-api) - `init_transactions`, `send_offsets_to_transaction` and error handling.
- [Track 10: Idempotency in practice](../../10-distributed-systems-patterns/01-idempotency-in-practice/README.md) - the idempotency-key pattern this module recommends over transactions for external effects.

## Next

[03-schemas-and-evolution-with-schema-registry](../03-schemas-and-evolution-with-schema-registry/README.md) —
your records now arrive exactly as intended. Module 03 covers keeping them
*readable* as producers and consumers change independently over years.
