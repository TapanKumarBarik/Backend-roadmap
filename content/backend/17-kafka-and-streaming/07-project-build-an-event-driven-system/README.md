# Module 07: Project — Build an Event-Driven Order System

## What you're building

A working event-driven order system, built step by step with the code
supplied. Every module in this track shows up as a component you can point
at and run.

```
  HTTP        ┌──────────────┐   orders    ┌────────────────────┐  payments
 ──────────▶  │ ingest       │ ──────────▶ │ payment-processor  │ ─────────▶
              │ idempotent   │  (keyed by  │ EXACTLY-ONCE       │
              │ producer  ◀00│  order_id)  │ transactional   ◀02│
              └──────────────┘             └─────────┬──────────┘
                                                     │ poison pills
                    ┌────────────────────┐           ▼
   inventory-state  │ inventory-projector│      orders.DLQ  ◀06
   (compacted) ◀04  │ topic-as-state     │
                    └────────────────────┘
                    ┌────────────────────┐
                    │ analytics          │  tumbling windows on event time ◀05
                    │ windowed counts    │
                    └────────────────────┘
                    ┌────────────────────┐
                    │ lag-monitor        │  seconds-behind, per partition  ◀06
                    └────────────────────┘
```

Budget 8-12 hours. Each step runs before you move to the next.

## Setup

```bash
mkdir kafka-orders && cd kafka-orders
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install confluent-kafka fastapi uvicorn pydantic

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
```

```bash
kt() { docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 "$@"; }
kg() { docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 "$@"; }
```

## Step 1 — Topics, chosen deliberately

`scripts/topics.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
K="docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092"

# business events: history matters -> delete policy, long retention (module 04)
$K --create --if-not-exists --topic orders   --partitions 6 --replication-factor 1 \
   --config retention.ms=604800000

$K --create --if-not-exists --topic payments --partitions 6 --replication-factor 1 \
   --config retention.ms=604800000

# current state per SKU: only latest matters -> compacted (module 04)
$K --create --if-not-exists --topic inventory-state --partitions 6 --replication-factor 1 \
   --config cleanup.policy=compact \
   --config segment.ms=10000 \
   --config min.cleanable.dirty.ratio=0.01 \
   --config delete.retention.ms=600000

# parked failures, retained long enough to investigate and replay (module 06)
$K --create --if-not-exists --topic orders.DLQ --partitions 3 --replication-factor 1 \
   --config retention.ms=2592000000

$K --list
```

Note the partition counts match between `orders` and `payments` — module 05's
co-partitioning requirement, so a future join stays possible.

## Step 2 — Shared config

`shared/config.py`:

```python
import os

BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")

# module 00: idempotence implies acks=all, unbounded retries, in-flight<=5
PRODUCER_BASE = {
    "bootstrap.servers": BOOTSTRAP,
    "enable.idempotence": True,
    "linger.ms": 10,
    "batch.size": 65536,
    "compression.type": "lz4",
    "delivery.timeout.ms": 120000,
}

# module 01: cooperative rebalancing + small batches so we never blow max.poll.interval
CONSUMER_BASE = {
    "bootstrap.servers": BOOTSTRAP,
    "enable.auto.commit": False,          # module 02: we commit deliberately
    "auto.offset.reset": "earliest",
    "partition.assignment.strategy": "cooperative-sticky",
    "max.poll.interval.ms": 300000,
    "session.timeout.ms": 45000,
}
```

`shared/events.py`:

```python
import json, uuid, time
from dataclasses import dataclass, asdict, field


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class OrderPlaced:
    order_id: str
    customer_id: str
    sku: str
    quantity: int
    unit_price: float
    timestamp_ms: int = field(default_factory=now_ms)
    # module 02: stable, producer-assigned id so handlers can dedupe
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_bytes(self) -> bytes:
        return json.dumps(asdict(self)).encode()

    @staticmethod
    def from_bytes(b: bytes) -> "OrderPlaced":
        return OrderPlaced(**json.loads(b))


@dataclass
class PaymentProcessed:
    order_id: str
    customer_id: str
    amount: float
    status: str                      # "CONFIRMED" | "DECLINED"
    timestamp_ms: int = field(default_factory=now_ms)
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_bytes(self) -> bytes:
        return json.dumps(asdict(self)).encode()

    @staticmethod
    def from_bytes(b: bytes) -> "PaymentProcessed":
        return PaymentProcessed(**json.loads(b))
```

## Step 3 — Ingest service (module 00)

`services/ingest.py`:

```python
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from confluent_kafka import Producer
from shared.config import PRODUCER_BASE
from shared.events import OrderPlaced

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ingest")

app = FastAPI(title="Order Ingest")
producer = Producer(PRODUCER_BASE)

delivered, failed = 0, 0


def on_delivery(err, msg):
    # module 00: without this, failures after the retry budget vanish silently
    global delivered, failed
    if err is not None:
        failed += 1
        log.error("DELIVERY FAILED key=%s err=%s", msg.key(), err)
    else:
        delivered += 1


class OrderRequest(BaseModel):
    customer_id: str
    sku: str
    quantity: int = Field(gt=0)
    unit_price: float = Field(gt=0)


@app.post("/orders", status_code=202)
def place_order(req: OrderRequest):
    import uuid
    event = OrderPlaced(
        order_id=f"ORD-{uuid.uuid4().hex[:8]}",
        customer_id=req.customer_id,
        sku=req.sku,
        quantity=req.quantity,
        unit_price=req.unit_price,
    )
    try:
        producer.produce(
            "orders",
            key=event.order_id.encode(),   # module 00: key = ordering guarantee
            value=event.to_bytes(),
            on_delivery=on_delivery,
        )
    except BufferError:
        raise HTTPException(503, "producer queue full")
    producer.poll(0)                        # serve delivery callbacks
    return {"order_id": event.order_id, "status": "accepted"}


@app.get("/stats")
def stats():
    return {"delivered": delivered, "failed": failed, "in_queue": len(producer)}


@app.on_event("shutdown")
def shutdown():
    log.info("flushing %d buffered records", len(producer))
    producer.flush(30)                      # module 00: or lose the buffer
```

```bash
PYTHONPATH=. uvicorn services.ingest:app --port 8000
curl -X POST localhost:8000/orders -H 'content-type: application/json' \
  -d '{"customer_id":"C1","sku":"SKU-1","quantity":2,"unit_price":9.99}'
```

## Step 4 — Payment processor: exactly-once (module 02)

The centrepiece. Consume `orders`, produce `payments`, commit offsets — all
in one transaction.

`services/payment_processor.py`:

```python
import logging, os, sys, json, signal
from confluent_kafka import Consumer, Producer, KafkaException
from shared.config import BOOTSTRAP, CONSUMER_BASE
from shared.events import OrderPlaced, PaymentProcessed

logging.basicConfig(level=logging.INFO, format="%(asctime)s payment %(message)s")
log = logging.getLogger()

INSTANCE = os.getenv("INSTANCE_ID", "1")

producer = Producer({
    "bootstrap.servers": BOOTSTRAP,
    # module 02: stable per instance, or instances fence each other
    "transactional.id": f"payment-processor-{INSTANCE}",
    "enable.idempotence": True,
})
producer.init_transactions()

consumer = Consumer({
    **CONSUMER_BASE,
    "group.id": "payment-processor",
    "group.instance.id": f"payment-{INSTANCE}",   # module 01: static membership
    "isolation.level": "read_committed",           # module 02
})
consumer.subscribe(["orders"])

running = True
signal.signal(signal.SIGTERM, lambda *_: globals().__setitem__("running", False))
signal.signal(signal.SIGINT, lambda *_: globals().__setitem__("running", False))

DECLINE_OVER = float(os.getenv("DECLINE_OVER", "1000"))


def to_dlq(msg, error):
    """module 06: park what can never succeed, keep the partition moving."""
    producer.produce(
        "orders.DLQ",
        key=msg.key(),
        value=msg.value(),
        headers=[
            ("original_topic", msg.topic().encode()),
            ("original_partition", str(msg.partition()).encode()),
            ("original_offset", str(msg.offset()).encode()),
            ("error", str(error)[:900].encode()),
        ],
    )


processed = 0
try:
    while running:
        msgs = consumer.consume(num_messages=50, timeout=1.0)
        if not msgs:
            continue

        producer.begin_transaction()
        try:
            for msg in msgs:
                if msg.error():
                    raise KafkaException(msg.error())
                try:
                    order = OrderPlaced.from_bytes(msg.value())
                except Exception as e:
                    # permanent failure: retrying will never help (module 06)
                    log.warning("poison pill at %s[%d]@%d: %s",
                                msg.topic(), msg.partition(), msg.offset(), e)
                    to_dlq(msg, e)
                    continue

                amount = order.quantity * order.unit_price
                status = "DECLINED" if amount > DECLINE_OVER else "CONFIRMED"
                payment = PaymentProcessed(
                    order_id=order.order_id,
                    customer_id=order.customer_id,
                    amount=amount,
                    status=status,
                )
                producer.produce("payments",
                                 key=order.order_id.encode(),
                                 value=payment.to_bytes())
                processed += 1

            # module 02: this is what makes offsets part of the transaction
            producer.send_offsets_to_transaction(
                consumer.position(consumer.assignment()),
                consumer.consumer_group_metadata(),
            )
            producer.commit_transaction()
            log.info("committed batch of %d (total %d)", len(msgs), processed)
        except Exception:
            log.exception("aborting transaction")
            producer.abort_transaction()
            raise
finally:
    log.info("closing, processed=%d", processed)
    consumer.close()
```

```bash
PYTHONPATH=. python services/payment_processor.py
```

## Step 5 — Inventory projector: topic as state (module 04)

`services/inventory_projector.py`:

```python
import logging, json, signal
from confluent_kafka import Consumer, Producer
from shared.config import BOOTSTRAP, CONSUMER_BASE, PRODUCER_BASE
from shared.events import PaymentProcessed

logging.basicConfig(level=logging.INFO, format="%(asctime)s inventory %(message)s")
log = logging.getLogger()

INITIAL_STOCK = {"SKU-1": 1000, "SKU-2": 500, "SKU-3": 50}

producer = Producer(PRODUCER_BASE)
consumer = Consumer({**CONSUMER_BASE, "group.id": "inventory-projector",
                     "isolation.level": "read_committed"})

# Rebuild state from the compacted topic before processing anything new.
# This is the whole "topic as state" idea: no database, fully rebuildable.
state = dict(INITIAL_STOCK)


def load_state():
    boot = Consumer({**CONSUMER_BASE, "group.id": "inventory-bootstrap-tmp",
                     "enable.partition.eof": True})
    boot.subscribe(["inventory-state"])
    eofs, assigned = set(), None
    while True:
        msg = boot.poll(2.0)
        if msg is None:
            break
        if msg.error():
            eofs.add((msg.topic(), msg.partition()))
            assigned = assigned or boot.assignment()
            if assigned and len(eofs) >= len(assigned):
                break
            continue
        k = msg.key().decode()
        if msg.value() is None:
            state.pop(k, None)                    # module 04: tombstone
        else:
            state[k] = json.loads(msg.value())["available"]
    boot.close()
    log.info("state rebuilt from log: %s", state)


load_state()
consumer.subscribe(["payments"])

running = True
signal.signal(signal.SIGINT, lambda *_: globals().__setitem__("running", False))

try:
    while running:
        msg = consumer.poll(1.0)
        if msg is None or msg.error():
            continue
        payment = PaymentProcessed.from_bytes(msg.value())
        if payment.status != "CONFIRMED":
            consumer.commit(msg, asynchronous=False)
            continue

        # NOTE: the sku isn't on PaymentProcessed — see "Extend it" #1.
        # For now we decrement a fixed SKU to demonstrate the mechanism.
        sku = "SKU-1"
        state[sku] = state.get(sku, 0) - 1
        producer.produce("inventory-state", key=sku.encode(),
                         value=json.dumps({"sku": sku, "available": state[sku]}).encode())
        producer.poll(0)
        consumer.commit(msg, asynchronous=False)   # module 02: after processing
        log.info("%s -> %d", sku, state[sku])
finally:
    producer.flush(10)
    consumer.close()
```

Kill and restart it: the log line `state rebuilt from log` proves the state
came back from Kafka with no database involved.

## Step 6 — Windowed analytics (module 05)

`services/analytics.py`:

```python
import logging, signal
from collections import defaultdict
from confluent_kafka import Consumer
from shared.config import CONSUMER_BASE
from shared.events import OrderPlaced

logging.basicConfig(level=logging.INFO, format="%(asctime)s analytics %(message)s")
log = logging.getLogger()

WINDOW_MS, GRACE_MS = 60_000, 10_000
windows = defaultdict(lambda: {"count": 0, "revenue": 0.0})
watermark = 0
late_dropped = 0

consumer = Consumer({**CONSUMER_BASE, "group.id": "analytics",
                     "isolation.level": "read_committed"})
consumer.subscribe(["orders"])

running = True
signal.signal(signal.SIGINT, lambda *_: globals().__setitem__("running", False))


def window_start(ms): return (ms // WINDOW_MS) * WINDOW_MS


try:
    while running:
        msg = consumer.poll(1.0)
        if msg is None or msg.error():
            continue
        order = OrderPlaced.from_bytes(msg.value())
        et = order.timestamp_ms                 # module 05: EVENT time, not clock
        watermark = max(watermark, et)

        ws = window_start(et)
        if ws + WINDOW_MS + GRACE_MS < watermark:
            late_dropped += 1                   # never drop silently
            log.warning("late record dropped (total %d)", late_dropped)
        else:
            windows[ws]["count"] += 1
            windows[ws]["revenue"] += order.quantity * order.unit_price

        for w in sorted(list(windows)):
            if w + WINDOW_MS + GRACE_MS < watermark:
                agg = windows.pop(w)
                log.info("WINDOW %d..%d  orders=%d revenue=%.2f",
                         w, w + WINDOW_MS, agg["count"], agg["revenue"])
        consumer.commit(msg, asynchronous=False)
finally:
    consumer.close()
```

## Step 7 — Lag monitor (module 06)

`services/lag_monitor.py`:

```python
import time, sys
from confluent_kafka import Consumer, TopicPartition
from confluent_kafka.admin import AdminClient
from shared.config import BOOTSTRAP

GROUP = sys.argv[1] if len(sys.argv) > 1 else "payment-processor"
TOPIC = sys.argv[2] if len(sys.argv) > 2 else "orders"

admin = AdminClient({"bootstrap.servers": BOOTSTRAP})
c = Consumer({"bootstrap.servers": BOOTSTRAP, "group.id": GROUP,
              "enable.auto.commit": False})

md = admin.list_topics(timeout=10).topics[TOPIC]
tps = [TopicPartition(TOPIC, p) for p in md.partitions]

prev, prev_t = None, None
while True:
    committed = c.committed(tps, timeout=10)
    per_partition, total = [], 0
    for tp in committed:
        lo, hi = c.get_watermark_offsets(tp, timeout=10, cached=False)
        pos = tp.offset if tp.offset >= 0 else lo
        lag = max(0, hi - pos)
        per_partition.append((tp.partition, lag))
        total += lag

    now = time.time()
    rate = None
    if prev is not None and now > prev_t:
        # negative delta = catching up; positive = falling behind (module 06)
        rate = (total - prev) / (now - prev_t)

    worst = max(per_partition, key=lambda x: x[1])
    print(f"total_lag={total:<8} worst=p{worst[0]}:{worst[1]:<8} "
          f"drift={rate if rate is None else round(rate, 1)}/s  "
          f"per_partition={sorted(per_partition)}")
    prev, prev_t = total, now
    time.sleep(5)
```

Note it reports **per-partition** lag and **drift**, not just a total — the
two things module 06's incident hinged on.

## Step 8 — Run the whole system

Five terminals:

```bash
./scripts/topics.sh
PYTHONPATH=. uvicorn services.ingest:app --port 8000     # 1
PYTHONPATH=. python services/payment_processor.py        # 2
PYTHONPATH=. python services/inventory_projector.py      # 3
PYTHONPATH=. python services/analytics.py                # 4
PYTHONPATH=. python services/lag_monitor.py              # 5
```

Generate load:

```bash
for i in $(seq 1 200); do
  curl -s -X POST localhost:8000/orders -H 'content-type: application/json' \
    -d "{\"customer_id\":\"C$((RANDOM%20))\",\"sku\":\"SKU-1\",\"quantity\":$((RANDOM%5+1)),\"unit_price\":9.99}" \
    > /dev/null
done
curl -s localhost:8000/stats
```

## Step 9 — Break it deliberately

Each of these maps to a module. Do them; the failures are the point.

### A. Poison pill → DLQ (module 06)

```bash
docker exec -i kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic orders \
  --property "parse.key=true" --property "key.separator=:" <<< "BAD:not-json-at-all"
```

Expected: the payment processor logs `poison pill`, routes it to
`orders.DLQ`, and **keeps processing**. Confirm the DLQ has it with headers:

```bash
docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic orders.DLQ --from-beginning \
  --property print.headers=true --property print.key=true --timeout-ms 5000
```

Expected — everything you need to diagnose and replay it later:

```
original_topic:orders,original_partition:1,original_offset:31,
error:Expecting value: line 1 column 1 (char 0)    BAD    not-json-at-all
```

### B. Exactly-once under crash (module 02)

Send 500 orders, and `kill -9` the payment processor mid-run. Restart it.

**Do not count with `kafka-get-offsets.sh` — it will lie to you here.** Run
it anyway, so you see why:

```bash
docker exec kafka /opt/kafka/bin/kafka-get-offsets.sh \
  --bootstrap-server localhost:9092 --topic payments
```

With 200 valid orders this reports something like **210**, not 200. Those
extra offsets are **transaction commit markers** — one control record per
partition per transaction. They occupy offsets in the log but are not
records, and no consumer ever delivers them. Offset arithmetic on a
transactional topic always overcounts, and mistaking that for duplicates is
a genuinely common false alarm.

Count what a consumer actually sees instead:

```python
from confluent_kafka import Consumer
c = Consumer({**CONSUMER_BASE, "group.id": "verify",
              "isolation.level": "read_committed",     # module 02
              "enable.partition.eof": True})
c.subscribe(["payments"])
seen, total = set(), 0
# ...poll until EOF on every assigned partition...
print(total, len(seen), total - len(seen))
```

Expected:

```
records=200  unique_order_ids=200  duplicates=0
```

Exactly one payment per valid order, despite the crash — the aborted
transaction's records were never committed and its offsets never advanced.
Re-run the same count with `isolation.level=read_uncommitted` to see the
aborted batch reappear.

### C. State rebuild (module 04)

Kill the inventory projector, note its last stock number, restart it.

Expected: `state rebuilt from log` shows the same number. Delete a key with a
tombstone and confirm it disappears from the rebuilt state:

```python
p.produce("inventory-state", key=b"SKU-3", value=None); p.flush()
```

### D. Lag under a slow consumer (module 06)

Add `time.sleep(0.2)` to the payment processor's loop and push 1,000 orders.

Expected: the lag monitor shows a **positive drift** — the alert-worthy
signal — long before the total is large.

### E. Rebalance behaviour (module 01)

Run a second payment processor with `INSTANCE_ID=2`.

Expected: cooperative-sticky moves only some partitions; the first instance
keeps serving the rest. Then restart instance 2 quickly and confirm static
membership means **no** rebalance at all.

## Verify you built it correctly

- [ ] `/stats` shows `delivered` climbing and `failed` at 0 (00)
- [ ] Killing ingest without `flush()` loses buffered orders; with it, none (00)
- [ ] Two payment processors rebalance cooperatively, not stop-the-world (01)
- [ ] A `kill -9` mid-batch produces **no** duplicate payments (02)
- [ ] Sharing one `transactional.id` across two instances fences one (02)
- [ ] `inventory-state` compacts to one record per SKU (04)
- [ ] Projector rebuilds identical state after restart (04)
- [ ] Analytics buckets by event time and reports late drops (05)
- [ ] A poison pill lands in the DLQ with headers, partition keeps moving (06)
- [ ] Lag monitor shows per-partition lag and drift, not just a total (06)

## Extend it yourself

No solutions given:

1. **Carry the SKU through.** `PaymentProcessed` lacks `sku`, so step 5
   hardcodes it. Add the field — and use module 03's rules to do it
   compatibly while a consumer is running.
2. **Add Schema Registry.** Replace the JSON dataclasses with Avro and
   enforce `BACKWARD_TRANSITIVE` in CI (03).
3. **Idempotent handler.** Add a `processed_events` table and make the
   projector idempotent, then prove it tolerates at-least-once redelivery
   (02).
4. **Stream-table join.** Join `payments` against a compacted `customers`
   topic to enrich with customer tier — and co-partition them (05).
5. **DLQ replay tool.** Read `orders.DLQ`, fix the payload, and republish to
   `orders` using the original headers (06).
6. **Session windows.** Replace the tumbling window with a 30-second session
   window per customer (05).
7. **Multi-broker.** Run 3 brokers, set RF 3 and `min.insync.replicas=2`,
   then kill a broker and watch ISR shrink while writes keep succeeding (00,
   06).

## This is the end of the track

Modules 00-07 are complete. You've gone from "a topic is a log" to a system
that doesn't lose messages, doesn't double-process them, survives rebalances
and restarts, rebuilds its own state, computes correct windowed aggregates,
parks its failures, and tells you when it's falling behind.

Back to the track index: [../README.md](../README.md)
Back to the backend master index: [../../README.md](../../README.md)
