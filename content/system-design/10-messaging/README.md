# Track: Messaging

Brokers vs streams, delivery semantics, ordering, DLQs, Kafka fundamentals, cloud queues and pub/sub fan-out.

Part of **Phase 4** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLTQZUTpyfa_k). The written lectures for this track are being published one at a time; a lesson marked *Soon* in the sidebar is still being written.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Why Use a Message Broker? Decoupling, Load Levelling & the Costs](01-why-use-a-message-broker-decoupling-load-levelling-the-costs/README.md) | Decide what should be a message, level a burst with a queue, and name the costs of a broker | **Live** |
| 02 | [Message Queues vs Event Streams: RabbitMQ/SQS vs Kafka](02-message-queues-vs-event-streams/README.md) | Message Queues vs Event Streams: RabbitMQ/SQS vs Kafka | *Soon* |
| 03 | [Kafka Producers & Consumers: acks=all, Batching, Keys & Prefetch](03-kafka-producers-consumers/README.md) | Kafka Producers & Consumers: acks=all, Batching, Keys & Prefetch | *Soon* |
| 04 | [Kafka Topics, Partitions & Offsets (Retention + Log Compaction)](04-kafka-topics-partitions-offsets/README.md) | Kafka Topics, Partitions & Offsets (Retention + Log Compaction) | *Soon* |
| 05 | [Kafka Consumer Groups & Rebalancing (Why More Consumers Don't Help)](05-kafka-consumer-groups-rebalancing/README.md) | Kafka Consumer Groups & Rebalancing (Why More Consumers Don't Help) | *Soon* |
| 06 | [Kafka Replication & Durability: ISR, min.insync.replicas, acks=all](06-kafka-replication-durability/README.md) | Kafka Replication & Durability: ISR, min.insync.replicas, acks=all | *Soon* |
| 07 | [Kafka Ordering Guarantees: Partition Keys, Retries & Sequence Numbers](07-kafka-ordering-guarantees/README.md) | Kafka Ordering Guarantees: Partition Keys, Retries & Sequence Numbers | *Soon* |
| 08 | [Delivery Semantics: At-Most-Once vs At-Least-Once (Offset Commits)](08-delivery-semantics/README.md) | Delivery Semantics: At-Most-Once vs At-Least-Once (Offset Commits) | *Soon* |
| 09 | [Dead-Letter Queues: Handling Poison Messages (Retry Limits & Redrive)](09-dead-letter-queues/README.md) | Dead-Letter Queues: Handling Poison Messages (Retry Limits & Redrive) | *Soon* |
| 10 | [Retries & Delayed Messages: Retry Topics Without Blocking Kafka](10-retries-delayed-messages/README.md) | Retries & Delayed Messages: Retry Topics Without Blocking Kafka | *Soon* |
| 11 | [Backpressure in Messaging: Consumer Lag, Bounded Queues & Autoscaling](11-backpressure-in-messaging/README.md) | Backpressure in Messaging: Consumer Lag, Bounded Queues & Autoscaling | *Soon* |
| 12 | [Event Types: Notifications vs State Transfer vs Commands, Thin vs Fat](12-event-types/README.md) | Event Types: Notifications vs State Transfer vs Commands, Thin vs Fat | *Soon* |
| 13 | [Event Sourcing Explained: Event Store, Snapshots, Projections & Pit…](13-event-sourcing-explained/README.md) | Event Sourcing Explained: Event Store, Snapshots, Projections & Pitfalls | *Soon* |
| 14 | [CQRS Explained: Separate Read and Write Models (and When Not To)](14-cqrs-explained/README.md) | CQRS Explained: Separate Read and Write Models (and When Not To) | *Soon* |
| 15 | [Transactional Outbox Pattern: Fixing the Dual-Write Problem](15-transactional-outbox-pattern/README.md) | Transactional Outbox Pattern: Fixing the Dual-Write Problem | *Soon* |
| 16 | [Inbox Pattern & Deduplication: Never Process a Message Twice](16-inbox-pattern-deduplication/README.md) | Inbox Pattern & Deduplication: Never Process a Message Twice | *Soon* |
| 17 | [Schema Evolution & Schema Registry: Backward vs Forward Compatibility](17-schema-evolution-schema-registry/README.md) | Schema Evolution & Schema Registry: Backward vs Forward Compatibility | *Soon* |
| 18 | [Event-Driven Microservices: Choreography, Event Spaghetti & Tracing](18-event-driven-microservices/README.md) | Event-Driven Microservices: Choreography, Event Spaghetti & Tracing | *Soon* |
| 19 | [Cloud Messaging: SQS, SNS, Service Bus, Event Hubs, Pub/Sub vs Kafka](19-cloud-messaging/README.md) | Cloud Messaging: SQS, SNS, Service Bus, Event Hubs, Pub/Sub vs Kafka | *Soon* |
| 20 | [Pub/Sub & Fan-Out: One Event, Many Services (SNS → SQS, Filters, Re…](20-pub-sub-fan-out/README.md) | Pub/Sub & Fan-Out: One Event, Many Services (SNS → SQS, Filters, Redis) | *Soon* |

Start here → [Why Use a Message Broker? Decoupling, Load Levelling & the Costs](01-why-use-a-message-broker-decoupling-load-levelling-the-costs/README.md)

Back to the course index: [../README.md](../README.md)
