# 17 - Kafka & Streaming Backbones

`backend/06-background-processing-and-realtime`, module 10, already taught
you what Kafka *is*: a topic is a log rather than a queue, partitions are how
it scales, offsets are per-consumer positions, and consumer groups give you
both work-sharing and fan-out. That's the mental model, and it's enough to
produce and consume messages.

This track is what happens when that system carries real money and real
traffic. Every default in Kafka is tuned for throughput, not safety — the
out-of-the-box producer can silently lose messages, the default consumer can
process the same record twice or skip records entirely, and a rebalance can
stall your entire consumer fleet for minutes. None of that shows up in a
laptop demo. All of it shows up in production.

So this track covers the settings and semantics that decide whether your
event backbone is trustworthy: producer acknowledgement and idempotence,
rebalancing behaviour, real exactly-once processing with transactions, schema
evolution, compaction and topics-as-state, stream processing with windows and
joins, and the operational signals that tell you it's healthy. It ends with a
**guided project**: an event-driven order system you build end to end.

## How this track works

- It assumes **[06-background-processing-and-realtime, module 10](../06-background-processing-and-realtime/10-message-brokers-kafka/README.md)**
  (topics, partitions, offsets, consumer groups, replay) and does not
  re-teach any of it. If "a topic is a log, not a queue" isn't already
  obvious to you, do that module first.
- It also leans on **[10-distributed-systems-patterns](../10-distributed-systems-patterns/README.md)**
  for idempotency, sagas, CQRS and event sourcing — this track is the
  transport those patterns run over — and on
  **[16-grpc-deep-dive, module 00](../16-grpc-deep-dive/00-protobuf-schema-design-and-evolution/README.md)**
  for schema evolution, since module 03 here applies exactly the same wire
  compatibility rules to events on a log.
- Everything is **Python** with `confluent-kafka` (the librdkafka-backed
  client used in production, and the only one with a complete transactional
  API). Kafka itself runs in Docker in **KRaft mode** — no ZooKeeper.
- Modules 00-06 use the standard shape: concepts, command reference,
  hands-on exercises, an independent challenge, common mistakes, and a
  checkpoint quiz.
- **Module 07 is a guided project, not an open-ended capstone** — same
  approach as tracks 15 and 16, since building the thing is the point.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Producer internals: acks, idempotence and partitioning](00-producer-internals-acks-idempotence-and-partitioning/README.md) | Configure a producer that genuinely doesn't lose or duplicate messages: `acks`, `min.insync.replicas`, the idempotent producer, batching/linger tradeoffs, and custom partitioners | 90-120 min |
| 01 | [Consumer groups and rebalancing in depth](01-consumer-groups-and-rebalancing-in-depth/README.md) | Reason about what actually happens during a rebalance, choose eager vs cooperative-sticky, use static membership, and stop the rebalance storms caused by slow processing | 90-120 min |
| 02 | [Delivery semantics and exactly-once](02-delivery-semantics-and-exactly-once/README.md) | Implement at-least-once correctly with manual commits, then real exactly-once with transactions and `read_process_write` — and know when EOS is the wrong tool | 100-130 min |
| 03 | [Schemas and evolution with Schema Registry](03-schemas-and-evolution-with-schema-registry/README.md) | Version event schemas safely: Avro/Protobuf/JSON Schema, compatibility modes, and what "backward compatible" means when consumers replay two-year-old records | 90-120 min |
| 04 | [Retention, compaction and topics as state](04-retention-compaction-and-topics-as-state/README.md) | Choose retention vs compaction deliberately, use tombstones, and treat a compacted topic as a durable key-value store you can rebuild state from | 75-100 min |
| 05 | [Stream processing: windows, joins and state](05-stream-processing-windows-joins-and-state/README.md) | Aggregate over windows, join streams and tables, and handle late and out-of-order events — plus what a stream processor buys you over a plain consumer loop | 100-130 min |
| 06 | [Operating Kafka: lag, sizing and reliability](06-operating-kafka-lag-sizing-and-reliability/README.md) | Monitor consumer lag properly, size partitions, reason about ISR and replication, and handle poison pills with a dead-letter strategy | 90-120 min |
| 07 | [Project: build an event-driven order system](07-project-build-an-event-driven-system/README.md) | Build a complete event-driven system: order ingest, an exactly-once payment processor, a compacted state topic, a windowed analytics consumer, DLQ handling, and lag monitoring | 8-12 hrs |

Start here -> [00-producer-internals-acks-idempotence-and-partitioning/README.md](00-producer-internals-acks-idempotence-and-partitioning/README.md)

Back to the master index: [../README.md](../README.md)

---

Related tracks:
**[06-background-processing-and-realtime](../06-background-processing-and-realtime/README.md)**
is the prerequisite (module 10 for Kafka basics, 09 for the RabbitMQ
contrast);
**[10-distributed-systems-patterns](../10-distributed-systems-patterns/README.md)**
covers the sagas, CQRS and event-sourcing patterns this track transports;
**[16-grpc-deep-dive](../16-grpc-deep-dive/README.md)** covers the
synchronous half of service communication and shares this track's schema
evolution rules; and
**[learn/15-messaging-and-event-driven-architecture](../../learn/15-messaging-and-event-driven-architecture/README.md)**
covers the Azure-managed equivalents (Service Bus, Event Grid, Event Hubs).
