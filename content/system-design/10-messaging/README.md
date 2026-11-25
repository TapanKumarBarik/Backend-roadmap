# Track: Messaging

Brokers vs streams, delivery semantics, ordering, DLQs, Kafka fundamentals, cloud queues and pub/sub fan-out.

Part of **Phase 4** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLTQZUTpyfa_k). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Try the interactive [Kafka & Event Streaming Simulator](/tools/event-streaming/) and [Distributed Transactions & Saga Simulator](/tools/distributed-transactions/) alongside these lessons.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Why Use a Message Broker? Decoupling, Load Levelling & the Costs](01-why-use-a-message-broker-decoupling-load-levelling-the-costs/README.md) | Decide what should be a message, level a burst with a queue, and name the costs of a broker | **Live** |
| 02 | [Message Queues vs Event Streams: RabbitMQ/SQS vs Kafka](02-message-queues-vs-event-streams/README.md) | Choose between competing-consumer work queues and replayable append-only event logs | **Live** |
| 03 | [Kafka Producers & Consumers: acks=all, Batching, Keys & Prefetch](03-kafka-producers-consumers/README.md) | Tune `acks`, `linger.ms`, `batch.size`, and consumer `fetch` limits for throughput vs latency | **Live** |
| 04 | [Kafka Topics, Partitions & Offsets (Retention + Log Compaction)](04-kafka-topics-partitions-offsets/README.md) | Size partitions, manage sequential segment I/O, and pick time/size retention vs log compaction | **Live** |
| 05 | [Kafka Consumer Groups & Rebalancing (Why More Consumers Don't Help)](05-kafka-consumer-groups-rebalancing/README.md) | Explain partition-to-consumer assignment, stop-the-world vs cooperative sticky rebalances | **Live** |
| 06 | [Kafka Replication & Durability: ISR, min.insync.replicas, acks=all](06-kafka-replication-durability/README.md) | Configure `RF=3`, `min.insync.replicas=2`, and `acks=all` to prevent silent data loss | **Live** |
| 07 | [Kafka Ordering Guarantees: Partition Keys, Retries & Sequence Numbers](07-kafka-ordering-guarantees/README.md) | Preserve per-entity ordering with partition keys and idempotent producer sequence numbers | **Live** |
| 08 | [Delivery Semantics: At-Most-Once vs At-Least-Once (Offset Commits)](08-delivery-semantics/README.md) | Control offset commit timing and combine at-least-once delivery with idempotency | **Live** |
| 09 | [Dead-Letter Queues: Handling Poison Messages (Retry Limits & Redrive)](09-dead-letter-queues/README.md) | Isolate poison pills with `maxReceiveCount` and safely inspect, fix, and redrive DLQs | **Live** |
| 10 | [Retries & Delayed Messages: Retry Topics Without Blocking Kafka](10-retries-delayed-messages/README.md) | Design non-blocking tiered retry topics and exponential backoff without stalling partitions | **Live** |
| 11 | [Backpressure in Messaging: Consumer Lag, Bounded Queues & Autoscaling](11-backpressure-in-messaging/README.md) | Measure consumer lag, bound in-memory queues, and scale consumers without overloading DBs | **Live** |
| 12 | [Event Types: Notifications vs State Transfer vs Commands, Thin vs Fat](12-event-types/README.md) | Distinguish Commands, Event Notifications, and Event-Carried State Transfer (ECST) | **Live** |
| 13 | [Event Sourcing Explained: Event Store, Snapshots, Projections & Pitfalls](13-event-sourcing-explained/README.md) | Model append-only event stores, snapshot intervals, projections, and schema versioning | **Live** |
| 14 | [CQRS Explained: Separate Read and Write Models (and When Not To)](14-cqrs-explained/README.md) | Separate transactional write models from denormalized read views and manage projection lag | **Live** |
| 15 | [Transactional Outbox Pattern: Fixing the Dual-Write Problem](15-transactional-outbox-pattern/README.md) | Eliminate DB-plus-broker dual-write bugs using an atomic outbox table + CDC/polling relay | **Live** |
| 16 | [Inbox Pattern & Deduplication: Never Process a Message Twice](16-inbox-pattern-deduplication/README.md) | Build idempotent consumers using atomic inbox deduplication tables and TTL pruning | **Live** |
| 17 | [Schema Evolution & Schema Registry: Backward vs Forward Compatibility](17-schema-evolution-schema-registry/README.md) | Evolve Avro/Protobuf/JSON schemas safely using Schema Registry compatibility modes | **Live** |
| 18 | [Event-Driven Microservices: Choreography, Event Spaghetti & Tracing](18-event-driven-microservices/README.md) | Balance choreography vs orchestration, avoid event spaghetti, and trace flows with `traceparent` | **Live** |
| 19 | [Cloud Messaging: SQS, SNS, Service Bus, Event Hubs, Pub/Sub vs Kafka](19-cloud-messaging/README.md) | Compare managed cloud queues and streams on ordering, retention, replay, and pricing | **Live** |
| 20 | [Pub/Sub & Fan-Out: One Event, Many Services (SNS → SQS, Filters, Redis)](20-pub-sub-fan-out/README.md) | Design resilient fan-out topologies with SNS→SQS, subscription filter policies, and Redis Pub/Sub | **Live** |

Start here → [Why Use a Message Broker? Decoupling, Load Levelling & the Costs](01-why-use-a-message-broker-decoupling-load-levelling-the-costs/README.md)

Back to the course index: [../README.md](../README.md)
