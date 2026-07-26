# Track 15: Messaging and Event-Driven Architecture

This track is where your services stop calling each other synchronously and
start *reacting* to things that happened. You've already deployed apps to
Azure Container Apps and used **Dapr pub/sub** and service invocation at a
basic level (track 6, module 05), and you can provision Azure resources
declaratively with **Terraform** (track 9) and ship them through **CI/CD**
(track 10). This track takes the pub/sub primitive you met briefly and turns
it into a real skill: designing and operating **event-driven systems** on top
of Azure Service Bus, Azure Event Grid, and Dapr — with the reliability,
schema, and observability discipline that separates a demo from something you
can run in production.

Where track 6 handed you a working local pub/sub component and moved on, this
track asks the questions that actually matter once messages carry real
business events: *What happens when a consumer crashes mid-message? What if a
message is delivered twice? How do you change an event's shape without
breaking every consumer at once? How do you see a message that's silently
stuck?* Those questions are the whole track.

> **Cost warning:** most modules here create **real, billable Azure
> resources** — Service Bus namespaces (Standard/Premium tiers), Event Grid
> topics and subscriptions (billed per operation/event), and Container Apps
> running Dapr sidecars. None of it is expensive if you clean up promptly, but
> a Premium Service Bus namespace or a high-volume Event Grid firehose left
> running is a real bill. Every module ends with a cleanup step — do it. When
> in doubt: `az group delete --name <rg> --yes --no-wait`.

## How this track works

- Go in order. Module 01 assumes the vocabulary from module 00; module 02
  (Service Bus) is the backbone that modules 04-07 keep referencing.
- Every module except this index and the capstone follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz
  → Next**. Two modules (02 and 05) add a closed-book **Cumulative review**.
- Exercises use real `az servicebus` / `az eventgrid` CLI, real Dapr
  component YAML, and real Terraform against your actual subscription. Each
  module ends with an explicit cleanup step — don't skip it.
- The capstone (module 08) drops the quiz/challenge/review scaffolding and
  asks you to combine Service Bus, Event Grid, Dapr pub/sub, dead-lettering,
  and an idempotent consumer into one working event-driven system.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [event-driven-architecture-concepts](00-event-driven-architecture-concepts/README.md) | Commands vs. events, delivery guarantees (at-least/at-most/exactly-once), idempotency, coupling, and the consistency/resilience trade-off | 45-60 min |
| 01 | [queues-vs-topics-vs-streams](01-queues-vs-topics-vs-streams/README.md) | Point-to-point queues vs. pub/sub topics vs. ordered logs (streams) — where Service Bus queues, Service Bus topics, and Event Hubs/Kafka each fit | 45-60 min |
| 02 | [azure-service-bus-in-depth](02-azure-service-bus-in-depth/README.md) | Queues, topics & subscriptions, filters, dead-letter queues, sessions for ordering, provisioning via Terraform (track 9) | 90-120 min |
| 03 | [azure-event-grid](03-azure-event-grid/README.md) | Event sources/topics/subscriptions, the pub/sub-for-Azure-resource-events model, event schemas, push-based Event Grid vs. poll-based Service Bus | 75-90 min |
| 04 | [dapr-pubsub-in-depth](04-dapr-pubsub-in-depth/README.md) | The Dapr pub/sub building block's component model, at-least-once delivery, topic-level access control, Dapr's abstraction vs. talking to Service Bus directly | 75-90 min |
| 05 | [reliability-patterns](05-reliability-patterns/README.md) | Retry with backoff, dead-lettering, the outbox pattern, poison-message handling | 90 min |
| 06 | [event-schemas-and-versioning](06-event-schemas-and-versioning/README.md) | Why schema matters more in async systems, schema evolution strategies, a lightweight schema registry concept | 60-75 min |
| 07 | [observability-for-event-driven-systems](07-observability-for-event-driven-systems/README.md) | Tracing a message across queue hops (ties to track 12), queue depth and consumer lag as first-class metrics | 60-75 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end event-driven system: Service Bus topic with filtered subscriptions, Event Grid reacting to a resource event, a Dapr pub/sub consumer, proven dead-lettering, and an idempotent consumer design | 3-6 hours |

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum).
- Everything from [06-azure-container-apps](../06-azure-container-apps/README.md),
  especially module 05: you've enabled Dapr on a Container App, defined a Dapr
  component scoped to an app-id, and used pub/sub at a basic level. This track
  goes much deeper into the broker behind that component.
- Everything from [09-terraform-on-azure](../09-terraform-on-azure/README.md):
  you can provision Azure resources declaratively (`azurerm_*` resources,
  variables, outputs) instead of clicking or re-typing `az` commands.
- Helpful but not required: [10-cicd-and-gitops](../10-cicd-and-gitops/README.md)
  for wiring the provisioning into a pipeline.

[Back to main curriculum](../README.md)

Start here → [00-event-driven-architecture-concepts/README.md](00-event-driven-architecture-concepts/README.md)
