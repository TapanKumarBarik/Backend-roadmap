# Module 03: Schemas and Evolution with Schema Registry

## Why this matters

A Kafka topic is a shared, long-lived, append-only contract between teams who
deploy independently. That's harder than it sounds: unlike an HTTP API, where
a breaking change fails loudly at request time, a bad schema change on a
topic fails *silently and later* — when a consumer replays six-month-old
records, or when the one team that hadn't upgraded yet reads a field that
changed meaning.

`16-grpc-deep-dive` module 00 established the wire-compatibility rules for
protobuf. This module applies the same reasoning to events on a log, where
the problem is strictly harder: **retained records are immutable**, so your
schema must stay compatible with every version ever written that's still
within retention — which for a compacted topic (module 04) can be forever.

## Concepts

### Why `json.dumps` isn't enough

Plain JSON on a topic has no schema, so nothing prevents a producer shipping
`{"amount": "12.50"}` where consumers expect a number. The failure surfaces
in a downstream consumer at 3 a.m., far from the deploy that caused it.

A schema registry moves that failure to **produce time**, and to CI. The
producer registers its schema, the registry checks it against the configured
compatibility rule, and rejects an incompatible change before a single record
is written.

### How the wire format works

The registry doesn't put the schema in every record — that would be enormous.
It stores schemas centrally and embeds a 4-byte ID:

```
┌──────┬────────────────┬──────────────────────────┐
│ 0x00 │ schema ID (4B) │ serialized payload       │
│ magic│  big-endian    │ (Avro / Protobuf / JSON) │
└──────┴────────────────┴──────────────────────────┘
```

A consumer reads the ID, fetches (and caches) that schema from the registry,
and deserializes using **both** the writer's schema and its own reader's
schema. That two-schema resolution is what makes evolution work at all.

### Compatibility modes — the decision that matters

| Mode | New schema can read | Meaning | Safe to |
|---|---|---|---|
| `BACKWARD` (default) | old data | new consumers read old records | **add optional**, delete fields |
| `FORWARD` | — (old schema reads new data) | old consumers read new records | **add** fields, delete optional |
| `FULL` | both | both directions | add/remove optional only |
| `NONE` | — | no checking | anything (don't) |
| `*_TRANSITIVE` | all previous versions | checked against **every** version, not just the last | the one you usually want |

The non-transitive variants only check against the **latest** version. That
allows a slow drift: v1→v2 compatible, v2→v3 compatible, but v1→v3 broken —
which matters the moment someone replays from the start of the topic.

**Rule of thumb:** `BACKWARD_TRANSITIVE` for event topics. It lets you
upgrade consumers first, then producers, and guarantees a new consumer can
read the entire retained history.

### The upgrade order follows from the mode

```
BACKWARD  → upgrade CONSUMERS first, then producers
FORWARD   → upgrade PRODUCERS first, then consumers
FULL      → either order
```

Getting this backwards is how a "compatible" change still causes an
incident.

### Avro evolution rules in practice

```json
{
  "type": "record",
  "name": "OrderPlaced",
  "namespace": "shop.events.v1",
  "fields": [
    {"name": "order_id",   "type": "string"},
    {"name": "customer_id","type": "string"},
    {"name": "total",      "type": "double"},
    {"name": "currency",   "type": "string", "default": "USD"},
    {"name": "coupon",     "type": ["null", "string"], "default": null}
  ]
}
```

The single most important rule: **a field you add must have a default.**
Without one, a consumer reading an old record has no value to supply and
deserialization fails. `["null","string"]` with `"default": null` is the
idiomatic optional field — and note the `null` must come *first* in the union
for the default to be valid.

| Change | BACKWARD-safe? |
|---|---|
| Add field **with** default | Yes |
| Add field **without** default | **No** |
| Delete field with default | Yes |
| Delete field without default | No |
| Rename field | No — use `aliases` |
| Widen `int` → `long`, `float` → `double` | Yes |
| Narrow `long` → `int` | No |
| Change type otherwise | No |
| Add enum symbol | Only with a default for the enum |

Renaming is handled by `aliases`, which lets the reader map an old name:

```json
{"name": "total_amount", "type": "double", "aliases": ["total"]}
```

### Subjects and naming strategy

The registry namespaces schemas by **subject**, and the default is
`<topic>-value` (and `<topic>-key`). That implies **one schema per topic**,
which is fine until you want several event types on one topic to preserve
ordering between them.

```
TopicNameStrategy       (default)  subject = "orders-value"
RecordNameStrategy                 subject = "shop.events.OrderPlaced"
TopicRecordNameStrategy            subject = "orders-shop.events.OrderPlaced"
```

Use `TopicRecordNameStrategy` when a topic legitimately carries multiple
event types — e.g. `OrderPlaced`, `OrderShipped`, `OrderCancelled` all keyed
by `order_id` so they stay ordered per order. That's a common and correct
design, and the default strategy blocks it.

### Producing and consuming with the registry

```python
from confluent_kafka import Producer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.avro import AvroSerializer, AvroDeserializer
from confluent_kafka.serialization import SerializationContext, MessageField

sr = SchemaRegistryClient({"url": "http://localhost:8081"})

serializer = AvroSerializer(sr, SCHEMA_STR, lambda obj, ctx: obj)
producer = Producer({"bootstrap.servers": "localhost:9092"})

producer.produce(
    topic="orders",
    key=order["order_id"].encode(),
    value=serializer(order, SerializationContext("orders", MessageField.VALUE)),
)
producer.flush()
```

```python
deserializer = AvroDeserializer(sr, SCHEMA_STR)   # reader schema
value = deserializer(msg.value(), SerializationContext(msg.topic(), MessageField.VALUE))
```

Passing the reader's schema explicitly is what enables schema resolution — if
you omit it, you decode with the writer's schema and lose the defaults that
make evolution work.

### Enforce it in CI, not in review

```bash
# fails the build if the change violates the subject's compatibility mode
curl -s -X POST -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  --data @schema-check.json \
  http://localhost:8081/compatibility/subjects/orders-value/versions/latest
```

This is the same argument as `buf breaking` in the gRPC track: these rules
are exactly what humans forget under deadline pressure, so they belong in a
pipeline.

### Avro vs Protobuf vs JSON Schema

| | Avro | Protobuf | JSON Schema |
|---|---|---|---|
| Size | smallest | small | largest |
| Evolution | defaults + aliases | field numbers | ad hoc |
| Human-readable payload | no | no | yes |
| Cross-language | excellent | excellent | universal |
| Best for | Kafka-native pipelines | shared with gRPC services | external/partner feeds |

If your services already speak gRPC (track 16), **Protobuf on Kafka too** is
usually right: one schema language, one set of evolution rules, one codegen
pipeline. Avro is the Kafka-ecosystem default and integrates most deeply with
stream-processing tooling.

## Command reference

| Concern | Command |
|---|---|
| List subjects | `curl -s localhost:8081/subjects` |
| Show versions | `curl -s localhost:8081/subjects/orders-value/versions` |
| Fetch a version | `curl -s localhost:8081/subjects/orders-value/versions/1` |
| Get global mode | `curl -s localhost:8081/config` |
| Set subject mode | `curl -X PUT -H "Content-Type: application/vnd.schemaregistry.v1+json" --data '{"compatibility":"BACKWARD_TRANSITIVE"}' localhost:8081/config/orders-value` |
| Test compatibility | `POST /compatibility/subjects/<s>/versions/latest` |
| Delete a version (dev only) | `curl -X DELETE localhost:8081/subjects/orders-value/versions/2` |
| Python client | `SchemaRegistryClient({"url": "..."})` |

## Hands-on exercises

Add a registry alongside the broker from module 00:

```bash
docker run -d --name schema-registry -p 8081:8081 \
  --link kafka \
  -e SCHEMA_REGISTRY_HOST_NAME=schema-registry \
  -e SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS=PLAINTEXT://kafka:9092 \
  -e SCHEMA_REGISTRY_LISTENERS=http://0.0.0.0:8081 \
  confluentinc/cp-schema-registry:7.6.0

pip install "confluent-kafka[avro,schemaregistry]"
```

### 1. Register a schema and inspect the wire bytes

Produce one Avro record, then read it raw with the console consumer.

Expected: the payload begins with `0x00` followed by a 4-byte schema ID, and
is otherwise unreadable binary. Confirm the ID matches
`curl -s localhost:8081/subjects/orders-value/versions/1`.

### 2. Add a field with a default — compatible

Add `{"name":"currency","type":"string","default":"USD"}` and register v2.

Expected: accepted. Now consume the **v1** records with the **v2** reader
schema and confirm `currency` comes back as `"USD"` — the default filling in
for records written before the field existed. That's schema resolution doing
the work.

### 3. Add a field without a default — rejected

Try `{"name":"region","type":"string"}` with no default.

Expected: HTTP 409, `Schema being registered is incompatible with an earlier
schema`. Note that this failure happens at *registration*, not at consume
time — which is the entire value proposition.

### 4. Prove non-transitive modes allow drift

Set compatibility to `BACKWARD` (not transitive). Register v1, then v2
(remove a field), then v3 (re-add it with a different type). Each step passes
against its immediate predecessor.

Then try to read v1 records with the v3 schema.

Expected: it fails, despite every individual step being "compatible". Switch
the subject to `BACKWARD_TRANSITIVE` and confirm the offending step is now
rejected up front.

### 5. Get the upgrade order wrong on purpose

Under `BACKWARD`, add a field with a default and deploy the **producer**
first while an old consumer is still running.

Expected: the old consumer reads new records fine (it ignores the unknown
field) — so this particular case survives. Now switch the subject to
`FORWARD` and delete a field, upgrading the consumer first.

Expected: breakage. Write down the rule you just derived about which
direction each mode protects.

### 6. Multiple event types on one topic

Publish `OrderPlaced` and `OrderShipped` to the same topic under the default
`TopicNameStrategy`.

Expected: the second type is rejected as incompatible with the first —
they're different records competing for one subject. Switch to
`TopicRecordNameStrategy` and confirm both register independently while
staying on the same topic (and therefore ordered per key).

### 7. Wire compatibility into CI

Write a script that, for each `.avsc` in your repo, POSTs to
`/compatibility/subjects/<subject>/versions/latest` and exits non-zero on
incompatibility. Break a schema and confirm the script fails.

### 8. Diagnose and fix: the replay that couldn't

A team's analytics job replays `orders` from the beginning each month to
rebuild a warehouse table. It worked for a year. This month it fails on
records from eight months ago with an Avro deserialization error. The subject
is on `BACKWARD`, has 14 versions, and every registration was accepted.

<details>
<summary>Solution</summary>

`BACKWARD` (non-transitive) only checks a new schema against the
**immediately previous** version. Over 14 versions the schema drifted: each
individual step was compatible with the one before it, but v14 is not
compatible with v6. Day-to-day consumption never noticed, because consumers
only ever read recent records written by recent schemas — the incompatibility
was latent and only surfaced when something replayed far enough back.

Fixes, in order:

1. Set the subject to `BACKWARD_TRANSITIVE` so future registrations are
   validated against *every* retained version, not just the last.
2. For the immediate breakage, the replay job must deserialize using the
   *writer's* schema per record (which the registry supplies via the embedded
   ID) and project forward, rather than forcing one reader schema across all
   history — or you re-register a reader schema that is genuinely compatible
   with v6 through v14, typically by restoring defaults that were dropped.
3. Add the CI compatibility check from exercise 7, since the registry
   accepted all 14 versions and nothing else was watching.

The general lesson: on a topic with long retention, "compatible with the
previous version" is not the property you need — "compatible with everything
still readable" is.

</details>

### 9. Clean up

```bash
docker rm -f schema-registry
```

## Independent challenge

No solution given. You own `orders`, retained for two years, consumed by six
teams. You must make three changes: rename `total` to `total_amount`; change
`status` from a free-text string to an enum; and split `address` (one string)
into a nested record with four fields.

For each, decide whether it's registrable under `BACKWARD_TRANSITIVE`, and
design the migration — including the exact deployment order across six teams
you don't control, and what happens to consumers that haven't upgraded when
you're halfway through. Then decide whether any of them justifies a new topic
(`orders.v2`) instead, and defend that choice on cost, not purity.

<details>
<summary>Stuck? One hint</summary>

One of the three is directly solvable with an Avro feature (`aliases`), one
is solvable by the additive dual-write pattern (add the new shape alongside
the old, backfill consumers, then remove the old field in a later version
once every reader has moved), and one is expensive enough that a parallel
`orders.v2` topic with a bridging consumer is usually cheaper than
coordinating six teams through a multi-step migration. The deciding question
for the third isn't whether the change is *possible* under the compatibility
rules — it's how many independent deploys must happen in a specific order
before the old field can be removed, and whether you can realistically
sequence that across teams you don't control.

</details>

## Common mistakes & troubleshooting

- **Adding a field without a default.** The single most common rejection, and
  the reason is that old records have no value to supply.
- **Using non-transitive compatibility on a long-retention topic.** Allows
  drift that only surfaces during replay, months later.
- **Getting the upgrade order backwards.** `BACKWARD` means consumers first;
  `FORWARD` means producers first.
- **Renaming instead of aliasing.** A rename is a delete plus an add, and
  fails compatibility; `aliases` is the supported mechanism.
- **Union ordering.** For an optional field the union must be
  `["null","string"]` with `"default": null` — `["string","null"]` makes the
  null default invalid.
- **Default `TopicNameStrategy` with multiple event types per topic.** Use
  `TopicRecordNameStrategy` instead of splitting topics and losing ordering.
- **Deserializing without a reader schema.** You lose the default-filling
  that makes evolution work.
- **No CI compatibility check.** The registry catches the change at deploy
  time, which is better than runtime but still later than the pull request.
- **Deleting registry versions to "fix" a conflict.** The records on the
  topic still reference those schema IDs and become unreadable.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. What are the 5 bytes at the start of a schema-registry-encoded record, and
   why isn't the schema itself embedded?
2. Why must an added Avro field have a default?
3. What's the difference between `BACKWARD` and `BACKWARD_TRANSITIVE`, and
   when does that difference actually bite?
4. Under `BACKWARD`, which do you deploy first — producers or consumers? And
   under `FORWARD`?
5. How do you rename a field compatibly in Avro?
6. When would you use `TopicRecordNameStrategy`, and what does the default
   strategy prevent?
7. Why is schema evolution harder on Kafka than on a request/response API?
8. Why is deleting a schema version from the registry dangerous?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. A magic byte `0x00` followed by a 4-byte big-endian schema ID. The schema
   itself is stored centrally in the registry and fetched (then cached) by
   ID, because embedding a full schema in every record would dwarf the
   payload.
2. Because a consumer using the new schema will read records written before
   the field existed, and those records carry no value for it. The default
   supplies one; without it, deserialization of historical records fails.
3. `BACKWARD` validates a new schema only against the immediately previous
   version, while `BACKWARD_TRANSITIVE` validates against every retained
   version. The difference bites when schemas drift gradually — each step
   compatible with its predecessor but not with much older ones — and only
   surfaces when something replays far enough back into history.
4. `BACKWARD` means the new schema can read old data, so consumers upgrade
   first and then producers. `FORWARD` means old schemas can read new data,
   so producers upgrade first and then consumers.
5. With `aliases`: give the field its new name and list the old name in the
   `aliases` array, so a reader can map records written under the old name. A
   plain rename is treated as deleting one field and adding another, which
   fails compatibility.
6. When one topic legitimately carries several event types — for example
   `OrderPlaced`, `OrderShipped` and `OrderCancelled` keyed by `order_id` so
   they stay ordered per order. The default `TopicNameStrategy` maps the whole
   topic to a single subject, so the second event type is rejected as
   incompatible with the first.
7. Because records are retained and immutable: a schema change must remain
   compatible with every version still within retention, which can be years
   (or forever on a compacted topic). A request/response API only has to be
   compatible with clients that are live *right now*, and a bad change fails
   loudly and immediately rather than silently during a later replay.
8. Because records already written to the topic embed that schema's ID. If
   the version is deleted, consumers can no longer resolve the writer schema
   for those records, and previously readable data becomes undeserializable.

</details>

## Further reading & sources

- [Confluent: Schema Registry concepts](https://docs.confluent.io/platform/current/schema-registry/index.html) - subjects, IDs, and the wire format.
- [Confluent: Schema evolution and compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html) - the authoritative compatibility-mode table and upgrade ordering.
- [Apache Avro: Specification — schema resolution](https://avro.apache.org/docs/current/specification/#schema-resolution) - how reader and writer schemas are reconciled, including defaults and aliases.
- [Confluent: Subject name strategies](https://docs.confluent.io/platform/current/schema-registry/fundamentals/serdes-develop/index.html#subject-name-strategy) - when to use record-name strategies.
- [16-grpc-deep-dive, module 00](../../16-grpc-deep-dive/00-protobuf-schema-design-and-evolution/README.md) - the same evolution problem in protobuf, with the wire-type rules.

## Next

[04-retention-compaction-and-topics-as-state](../04-retention-compaction-and-topics-as-state/README.md) —
schemas keep records readable. Module 04 decides which records still exist at
all, and how a topic becomes a queryable store rather than a transient log.
