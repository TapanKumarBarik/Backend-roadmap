# Module 09: Message Brokers — RabbitMQ

## Why this matters

Every task queue exercise so far has used Redis as the broker, and every
pub/sub exercise has used Redis's `PUBLISH`/`SUBSCRIBE`. That's a
deliberate simplification: Redis's broker role is genuinely just a list
(`LPUSH`/`BRPOP`) and its pub/sub is genuinely just fan-out with no
persistence. **RabbitMQ is a broker built for messaging as its one job**,
and it gives you primitives Redis doesn't: routing messages to multiple
queues based on rules (not just one channel name), acknowledgment that
survives a worker crash mid-task, and dead-lettering messages that fail
repeatedly instead of losing or endlessly retrying them. This module
opens up what a dedicated broker gives you, using RabbitMQ specifically
because it's the open-source reference point every managed message
service (Azure Service Bus, Amazon SQS/SNS) is compared against.

## Concepts

### Producers, the broker, queues, and consumers — but with an exchange in between

RabbitMQ's model has one extra piece Redis doesn't: producers never
publish directly to a queue. They publish to an **exchange**, and the
exchange — based on **bindings** you configure — routes the message into
zero, one, or many queues. Consumers only ever read from queues, never
from exchanges directly.

```
  producer ──► exchange ──(binding rules)──► queue A ──► consumer 1
                    │
                    └──(binding rules)──► queue B ──► consumer 2
```

This extra hop is the entire point: it decouples "what a producer says
happened" from "which queue(s) should care," the same way pub/sub
decoupled publishers from subscribers in module 08 — except here the
routing rule lives in the broker's configuration, not in the channel name
the producer happens to pick.

### Exchange types: direct, topic, fanout

- **Direct** — routes a message to any queue bound with an exact
  matching **routing key**. `routing_key="orders.created"` only reaches
  queues bound to exactly `"orders.created"`.
- **Topic** — routes by pattern: bindings can use `*` (one word) and `#`
  (zero or more words) as wildcards against a dot-separated routing key.
  A queue bound to `orders.*` matches `orders.created` and
  `orders.cancelled` but not `orders.created.eu`; a queue bound to
  `orders.#` matches all three.
- **Fanout** — ignores the routing key entirely and delivers to *every*
  bound queue, Redis Pub/Sub-style fan-out, except every bound queue is a
  **durable** queue, not a fire-and-forget subscriber list.

```
  Direct: routing_key must match exactly
    "orders.created" ──► queue bound to "orders.created"          ✓
    "orders.created" ──► queue bound to "orders.cancelled"        ✗

  Topic: wildcard patterns
    "orders.created"    ──► queue bound to "orders.*"             ✓
    "orders.created.eu" ──► queue bound to "orders.*"             ✗ (extra word)
    "orders.created.eu" ──► queue bound to "orders.#"             ✓

  Fanout: routing key ignored, every bound queue gets a copy
    (any key)  ──► queue A  ✓
               ──► queue B  ✓
               ──► queue C  ✓
```

### Durability: queues, messages, and acknowledgment together

Redis Pub/Sub drops a message the instant there's no subscriber. RabbitMQ
can be configured so that's never true for messages that matter:

- A **durable queue** (`durable=True`) survives a broker restart — the
  queue itself isn't lost.
- A **persistent message** (`delivery_mode=2`) is written to disk, not
  just held in memory — the message survives a broker restart too, not
  just the queue definition.
- **Manual acknowledgment** (`ack=False` on consume, then an explicit
  `basic_ack` after the work succeeds) means a message is only removed
  from the queue once a consumer *proves* it finished. If the consumer
  crashes mid-task — the process dies, the machine loses power — the
  unacknowledged message is **requeued** and redelivered to another
  consumer. This is what gives you Celery-style at-least-once delivery,
  explicit and configurable rather than a broker default you don't
  control.

```
  consumer picks up message ──► starts work ──► CRASHES before ack
                                                        │
                          message has no ack ───────────┘
                                   │
                                   ▼
                    RabbitMQ requeues it automatically
                                   │
                                   ▼
                    redelivered to another consumer
```

The tradeoff, same as module 02's idempotency lesson: at-least-once
means **possible redelivery**, so a handler that isn't idempotent could
double-charge a card or double-send an email on redelivery. The fix is
identical to what module 02 taught for Celery — make the handler
idempotent (check-then-act on a unique message ID), don't rely on
"delivered exactly once."

### Dead-letter exchanges: a graveyard for repeatedly-failing messages

A message that fails every retry shouldn't loop forever or silently
vanish. A **dead-letter exchange (DLX)** is a normal exchange you
designate as a queue's overflow destination: when a message on that
queue is rejected without requeue (`basic_nack(requeue=False)`) or
expires (via a per-message or per-queue TTL), RabbitMQ automatically
republishes it to the DLX instead of discarding it. Bind a queue to that
DLX and you get a **dead-letter queue** — a durable, inspectable record
of "these messages failed and a human or a separate process needs to
look at them," instead of an endless retry loop or a message dropped
with no trace.

```
  main queue ──(processing fails N times)──► reject, no requeue
                                                      │
                                                      ▼
                                          dead-letter exchange
                                                      │
                                                      ▼
                                          dead-letter queue
                                          (inspect, replay, or alert)
```

### RabbitMQ vs. Redis-as-broker vs. Kafka — when each earns its keep

| | Redis (as broker) | RabbitMQ | Kafka (next module) |
|---|---|---|---|
| Core model | List (`LPUSH`/`BRPOP`) or Pub/Sub | Exchange → routing → queue | Append-only log, partitioned |
| Routing | None (one key/channel) | Direct/topic/fanout exchanges | Consumer chooses partition/offset |
| Message removed after consume | Yes | Yes (once acked) | No — stays until retention expires |
| Replay | No | No (once acked, it's gone) | Yes — re-read any offset |
| Best fit | Simple queues, ephemeral pub/sub, already using Redis for caching | Complex routing, per-message ack/DLX, task distribution across services | High-volume event streams, multiple independent consumers replaying the same log |

The one-line version: reach for RabbitMQ when you need **routing rules
and reliable per-message handling** beyond what a plain list gives you;
reach for Kafka when you need **a durable, replayable log** multiple
independent systems can each read at their own pace (module 10).

## Command reference

| Concern | pika (Python client) API |
|---|---|
| Connect | `pika.BlockingConnection(pika.ConnectionParameters("localhost"))` |
| Declare exchange | `channel.exchange_declare(exchange="orders", exchange_type="topic")` |
| Declare durable queue | `channel.queue_declare(queue="billing", durable=True)` |
| Bind queue to exchange | `channel.queue_bind(queue="billing", exchange="orders", routing_key="orders.*")` |
| Publish (persistent) | `channel.basic_publish(exchange="orders", routing_key="orders.created", body=..., properties=pika.BasicProperties(delivery_mode=2))` |
| Consume (manual ack) | `channel.basic_consume(queue="billing", on_message_callback=cb, auto_ack=False)` |
| Acknowledge | `channel.basic_ack(delivery_tag=method.delivery_tag)` |
| Reject without requeue (→ DLX) | `channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)` |
| Declare queue with a DLX | `channel.queue_declare(queue="billing", durable=True, arguments={"x-dead-letter-exchange": "billing.dlx"})` |
| Inspect queue depth | `docker exec rabbitmq rabbitmqctl list_queues name messages` |

A topic-routed order pipeline — `producer.py`:

```python
import pika, json

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
channel = connection.channel()
channel.exchange_declare(exchange="orders", exchange_type="topic", durable=True)

def publish_order_event(routing_key: str, payload: dict):
    channel.basic_publish(
        exchange="orders",
        routing_key=routing_key,
        body=json.dumps(payload).encode(),
        properties=pika.BasicProperties(delivery_mode=2),  # persistent
    )

publish_order_event("orders.created", {"order_id": 1, "total": 42.50})
publish_order_event("orders.cancelled", {"order_id": 2})
connection.close()
```

A billing consumer with manual ack and a dead-letter exchange —
`billing_consumer.py`:

```python
import pika, json

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
channel = connection.channel()

channel.exchange_declare(exchange="orders", exchange_type="topic", durable=True)
channel.exchange_declare(exchange="orders.dlx", exchange_type="fanout", durable=True)

channel.queue_declare(
    queue="billing.dlq", durable=True,
)
channel.queue_bind(queue="billing.dlq", exchange="orders.dlx")

channel.queue_declare(
    queue="billing",
    durable=True,
    arguments={"x-dead-letter-exchange": "orders.dlx"},
)
channel.queue_bind(queue="billing", exchange="orders", routing_key="orders.*")

def on_message(ch, method, properties, body):
    event = json.loads(body)
    try:
        charge_order(event)                     # your idempotent handler
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except PermanentFailure:
        # give up on this one — send it to the DLQ instead of looping forever
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    except TransientFailure:
        # let RabbitMQ redeliver — same message, maybe a different consumer
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

def charge_order(event):
    if "order_id" not in event:
        raise PermanentFailure("malformed event")
    print(f"charged order {event['order_id']}")

class PermanentFailure(Exception): pass
class TransientFailure(Exception): pass

channel.basic_consume(queue="billing", on_message_callback=on_message, auto_ack=False)
channel.start_consuming()
```

## Hands-on exercises

Run RabbitMQ locally with the management UI enabled:

```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

The management UI is at `http://localhost:15672` (default login
`guest`/`guest`) — keep it open in a browser tab; it shows exchanges,
queues, bindings, and live message rates as you run each exercise.
`pip install pika`.

### 1. Direct exchange: routing key must match exactly

```python
import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
channel = connection.channel()
channel.exchange_declare(exchange="logs_direct", exchange_type="direct")
channel.queue_declare(queue="error_logs", durable=True)
channel.queue_bind(queue="error_logs", exchange="logs_direct", routing_key="error")

channel.basic_publish(exchange="logs_direct", routing_key="error", body=b"disk full")
channel.basic_publish(exchange="logs_direct", routing_key="info", body=b"user logged in")
connection.close()
```

Check the management UI's **Queues** tab: `error_logs` should show 1
message, not 2 — the `info`-routed message had no matching binding and
was simply discarded by the exchange (a direct exchange with no matching
binding drops the message, since there's no queue to hold it).

### 2. Topic exchange: wildcard routing

Using the pattern from the Concepts section, bind one queue to
`orders.*` and another to `orders.#`, then publish to `orders.created`,
`orders.cancelled`, and `orders.created.eu`. Expected: the `orders.*`
queue receives the first two only; the `orders.#` queue receives all
three. Confirm counts in the management UI's **Queues** tab.

### 3. Fanout: every bound queue gets a copy

Declare a `fanout` exchange, bind three separate queues to it with no
routing key, and publish one message. Expected: all three queues show
exactly one message each — true broadcast, unlike a direct/topic
exchange's selective routing.

### 4. Prove durability survives a broker restart

```bash
docker exec rabbitmq rabbitmqctl list_queues name messages durable
```

Publish a persistent message (`delivery_mode=2`) to a durable queue,
confirm it's listed, then:

```bash
docker restart rabbitmq
docker exec rabbitmq rabbitmqctl list_queues name messages durable
```

Expected: the queue and its message count are unchanged after the
restart — both the queue and the message survived, unlike Redis Pub/Sub
which has nothing to survive a restart with (there was never anything
stored).

### 5. Manual ack + a crash before ack = redelivery

Run the `billing_consumer.py` pattern from the Concepts section, but add
a deliberate crash: `if event["order_id"] == 2: raise SystemExit` *before*
the `basic_ack` call. Publish an `orders.created` event with `order_id=2`
and start the consumer. Expected: the consumer process exits without
acking; check the management UI — the message is still in the `billing`
queue, marked unacked-then-requeued. Restart the consumer (without the
crash line this time): expected the same message is redelivered and
processed successfully — nothing was lost by the crash.

### 6. Route a permanently-bad message to the dead-letter queue

Using the full `billing_consumer.py` with the DLX wired up, publish a
malformed event (missing `order_id`) so `charge_order` raises
`PermanentFailure`. Expected: the consumer's `except PermanentFailure`
branch calls `basic_nack(requeue=False)`, and the message appears in
`billing.dlq` (check the management UI), not stuck looping in `billing`
and not silently gone.

### 7. Diagnose and fix: messages disappearing under load

A team's consumer uses `auto_ack=True` (the default `pika` shortcut) "to
keep things simple." Under normal load it works fine; during a deploy,
consumers restart mid-task and messages that were being processed at
that exact moment are never seen again — no error, no trace.

<details>
<summary>Solution</summary>

Root cause: `auto_ack=True` acknowledges a message the instant RabbitMQ
*delivers* it to the consumer, before the consumer has done any work —
so if the consumer process dies mid-task, RabbitMQ already considers
that message successfully handled and will never redeliver it. The task
in flight at the moment of the crash is lost with no error, because
from the broker's point of view nothing went wrong.

Fix: switch to `auto_ack=False` and call `basic_ack` only *after* the
work actually succeeds (as in `billing_consumer.py`). Now a crash before
the ack leaves the message unacknowledged, and RabbitMQ requeues it for
another consumer to pick up — the exact mechanism verified in exercise 5.

</details>

### 8. Clean up

```bash
docker stop rabbitmq && docker rm rabbitmq
```

## Independent challenge

No code given. Design a routing setup for an order system where three
independent services each need a different slice of order events:
**billing** needs only `orders.created` events; **fulfillment** needs
`orders.created` and `orders.cancelled` (to stop fulfilling on
cancellation) but not `orders.created.eu`-style regional variants;
**analytics** needs literally every order event regardless of type or
region. Choose one exchange type (or a combination) and a set of
bindings that satisfies all three without any service receiving events
it doesn't need. Give every consumer's queue manual acknowledgment and a
dead-letter queue, and prove a permanently-malformed event lands in the
dead-letter queue instead of blocking or looping the main queue.

<details>
<summary>Stuck? One hint</summary>

A single topic exchange with routing keys like `orders.created`,
`orders.created.eu`, `orders.cancelled`: bind billing's queue to
`orders.created` only (direct match, no wildcard); bind fulfillment's
queue to both `orders.created` and `orders.cancelled` (two separate
bindings on the same queue, not one pattern); bind analytics' queue to
`orders.#` (catches everything, any depth). Each queue gets its own DLX
binding independently — dead-lettering is per-queue, not shared.

</details>

## Common mistakes & troubleshooting

- **Using `auto_ack=True` "to keep it simple."** As exercise 7 showed,
  this acknowledges before work is confirmed done, so a crash mid-task
  loses the message silently. Default to manual ack for anything that
  matters.
- **Forgetting `delivery_mode=2` on publish.** A message published
  without it is not written to disk — it survives a *consumer* crash
  (still sitting in the queue) but not a *broker* restart. Durable queue
  + persistent message are both needed for full durability, not just one.
- **Assuming a direct exchange with no matching binding queues the
  message somewhere "safe."** It doesn't — an unmatched routing key on a
  direct or topic exchange is dropped with no error, similar in spirit to
  Redis Pub/Sub's silent drop (module 08), just for a different reason
  (no matching route rather than no subscriber).
- **Rejecting a message with `requeue=True` in a retry loop with no
  limit.** A message that fails for a genuinely permanent reason
  (malformed data) will loop forever between "redeliver" and "fail
  again" unless you route it to a dead-letter queue after a bounded
  number of attempts.
- **Confusing "acked" with "processed successfully."** Acking only tells
  RabbitMQ "stop tracking this message as pending" — your own code is
  responsible for making sure the ack only happens after the work is
  actually done, in the right order (work, then ack — never ack, then
  work).
- **Not making handlers idempotent.** At-least-once delivery means a
  redelivered message (after a crash before ack) could be processed
  twice if the consumer restarts mid-retry in an unlucky window. Same
  discipline as module 02's Celery idempotency — check-then-act on a
  unique message ID.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Why do producers in RabbitMQ publish to an exchange instead of
   directly to a queue?
2. What's the difference between a direct, topic, and fanout exchange,
   in terms of how they use the routing key?
3. What two separate settings are both required for a message to survive
   a broker restart, and what does each one cover?
4. What does manual acknowledgment protect against that `auto_ack=True`
   doesn't?
5. What is a dead-letter exchange, and what two things can trigger a
   message being sent to one?
6. When would you reach for RabbitMQ instead of just using Redis as a
   broker? When would you reach for Kafka instead of RabbitMQ?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. The exchange is where routing rules live — publishing to it lets the
   broker's bindings decide which queue(s), if any, should receive the
   message, decoupling the producer from needing to know which specific
   queues exist or care about this message.
2. A direct exchange routes to queues whose binding key exactly matches
   the routing key. A topic exchange routes using wildcard patterns
   (`*` for one word, `#` for zero or more words) against a dot-separated
   routing key. A fanout exchange ignores the routing key entirely and
   delivers to every bound queue.
3. A durable queue (`durable=True`), which makes the queue definition
   itself survive a restart, and a persistent message
   (`delivery_mode=2`), which makes the message body actually written to
   disk survive a restart. Either alone is insufficient — a persistent
   message in a non-durable queue is lost when the queue itself doesn't
   survive.
4. It protects against a consumer crashing mid-task: a message is only
   removed from the queue once the consumer explicitly acks it after
   finishing successfully. With `auto_ack=True`, the message is
   considered handled the instant it's delivered, so a crash before the
   work finishes loses it with no redelivery and no error.
5. A dead-letter exchange is a designated overflow destination for a
   queue: RabbitMQ automatically republishes a message there when it's
   rejected without requeue (`basic_nack(requeue=False)`) or when it
   expires via a TTL, giving you an inspectable record of failed messages
   instead of an endless retry loop or a silent drop.
6. Reach for RabbitMQ over plain Redis-as-broker when you need routing
   rules beyond one queue name (multiple consumers needing different
   slices of the same event stream) or reliable per-message ack/DLX
   handling Redis's list primitives don't give you. Reach for Kafka
   instead of RabbitMQ when you need a durable, replayable log that
   several independent systems can each consume at their own pace and
   re-read from an arbitrary point, rather than a message that's gone
   once any one consumer acks it.

</details>

## Further reading & sources

- [RabbitMQ: Tutorial 4 — Routing](https://www.rabbitmq.com/tutorials/tutorial-four-python) - the direct-exchange routing example this module's exercise 1 is based on.
- [RabbitMQ: Tutorial 5 — Topics](https://www.rabbitmq.com/tutorials/tutorial-five-python) - wildcard routing key patterns in depth.
- [RabbitMQ: Reliability guide](https://www.rabbitmq.com/docs/reliability) - acknowledgment, publisher confirms, and durability covered together.
- [RabbitMQ: Dead Letter Exchanges](https://www.rabbitmq.com/docs/dlx) - the full DLX configuration reference, including per-message and per-queue TTL triggers.
- [pika documentation](https://pika.readthedocs.io/) - the Python client used throughout this module's code.

## Next

[10-message-brokers-kafka](../10-message-brokers-kafka/README.md) — the
same "why not just Redis" question, answered differently: a durable,
replayable log built for high-volume streams and multiple independent
consumers, rather than routed, once-consumed messages.
</content>
