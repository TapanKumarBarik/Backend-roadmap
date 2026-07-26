# Queues vs. Topics vs. Streams

## Why this matters

"Just put it on a queue" hides three genuinely different tools with different
guarantees, and picking the wrong one shows up months later as a scaling wall
or a missing replay you can't add retroactively. A **queue** hands each message
to one worker; a **topic** fans one message out to many independent
subscribers; a **stream** is an ordered, retained log many readers replay at
their own pace. This module gives you the decision framework so that when
module 02 drops you into Service Bus and module 03 into Event Grid, you already
know *why* you're reaching for each.

## Concepts

### The queue: point-to-point, competing consumers

A **queue** is a single line of messages consumed by one logical reader. Put
several worker replicas on the same queue and they *compete*: each message goes
to exactly one of them, so adding replicas increases throughput — the
**competing-consumers** pattern, and the standard way to scale a worker pool.
The message is removed once a consumer acknowledges it; until then it's locked
(invisible to others) so two workers don't grab the same job. This is the
point-to-point topology from module 00, made concrete. In Azure this is a
**Service Bus queue**. Reach for it when work must be done *once* by *one of*
several interchangeable workers: image thumbnails to generate, emails to send,
jobs to run.

### The topic: publish/subscribe, one copy per subscriber

A **topic** decouples the publisher from *how many* things care. The publisher
sends one message to the topic; the topic has a set of **subscriptions**, and
each subscription gets its **own independent copy** of every matching message.
Three teams that each need to react to `OrderPlaced` create three
subscriptions; each has its own backlog, its own consumers, its own
dead-letter queue, and one team falling behind doesn't affect the others. This
is the publish/subscribe topology, and it's what Dapr's `publish` gave you in
track 6 module 05. In Azure this is a **Service Bus topic + subscriptions**.
Crucially, *within* a single subscription you're back to competing consumers —
so a topic is "fan-out across subscriptions, fan-in (compete) within each." A
queue is really just a topic with exactly one subscription baked in.

### The stream: an ordered, retained log

A **stream** is a different animal: an **append-only, ordered log** of events,
retained for a time window (hours to days) regardless of who has read it.
Readers don't *remove* messages — they hold a **cursor** (offset) into the log
and advance it. Multiple independent consumer groups can each read the whole
log at their own position and *replay* from any past offset. That replay, plus
strict ordering within a partition and very high throughput, is what queues and
topics don't give you. In Azure this is **Event Hubs** (and the open-source
equivalent everyone benchmarks against is **Apache Kafka**; Event Hubs even
speaks the Kafka protocol). Reach for a stream when you have high-volume,
ordered events that several systems consume independently and may need to
reprocess: telemetry, clickstream, change-data-capture, event sourcing.

The mental model that keeps them straight:

- **Queue** — a to-do list; you take an item and it's gone.
- **Topic** — a mailing list; everyone subscribed gets their own copy.
- **Stream** — a ledger/tape; everyone reads the same durable log at their own
  bookmark and can rewind.

### Ordering and how each service handles it

Ordering is where the three diverge most. A plain queue does *not* guarantee
global order once you have competing consumers — worker B might finish message
2 before worker A finishes message 1. When you need related messages processed
in order, Service Bus offers **sessions**: messages tagged with the same
session id are locked to a single consumer and delivered in order (you'll use
this in module 02). A **stream** gives ordering *per partition* natively — the
log is the order — which is a big reason event sourcing lives on streams. The
practical rule: if you need ordering, either use Service Bus sessions
(point-to-point/pub-sub with a partition-like key) or a stream partitioned by
your ordering key. Don't assume a bare queue preserves order; it generally
doesn't under load.

### Retention, replay, and why streams cost differently

The other big axis is **what happens to a message after it's read**. In a queue
or topic subscription, a message is *deleted* once acknowledged — the broker's
job is to deliver it and forget it, and the backlog is only the *unprocessed*
messages. In a stream, every event is *retained for the whole window* whether
or not anyone read it, because replay is the point — so a stream's storage and
cost scale with *total event volume × retention*, not with backlog. This also
shapes cost: Service Bus bills largely per operation and (on Premium) per
messaging unit; Event Hubs bills per throughput unit and ingress volume. A
chatty firehose is cheap-ish on a stream built for it and expensive on a topic
that has to durably queue and fan out every tiny message. Match the tool to the
shape of the traffic, not just the topology.

## Command reference

You won't provision much here — this module is a decision framework — but these
let you *look at* the three services and see the topology differences directly.
Deep provisioning comes in module 02 (Service Bus) and module 03 (Event Grid).

| Command | What it does | Example |
|---|---|---|
| `az servicebus queue create` | Creates a point-to-point queue in a namespace | `az servicebus queue create -g rg-msg-01 --namespace-name sb-msg-01 -n jobs` |
| `az servicebus topic create` | Creates a pub/sub topic | `az servicebus topic create -g rg-msg-01 --namespace-name sb-msg-01 -n orders` |
| `az servicebus topic subscription create` | Adds an independent subscription to a topic | `az servicebus topic subscription create -g rg-msg-01 --namespace-name sb-msg-01 --topic-name orders -n billing` |
| `az eventhubs eventhub create` | Creates an Event Hub (a Kafka-style stream) | `az eventhubs eventhub create -g rg-msg-01 --namespace-name eh-msg-01 -n telemetry --partition-count 4 --retention-time 24` |
| `az servicebus queue show` | Shows a queue's live message counts (backlog) | `az servicebus queue show -g rg-msg-01 --namespace-name sb-msg-01 -n jobs --query countDetails` |

Flag breakdown — `az eventhubs eventhub create -g rg-msg-01 --namespace-name eh-msg-01 -n telemetry --partition-count 4 --retention-time 24`:
- `--namespace-name eh-msg-01` — the Event Hubs namespace (the billing/network
  boundary, like a Service Bus namespace).
- `-n telemetry` — the Event Hub itself, i.e. the individual stream/log.
- `--partition-count 4` — the number of **partitions**; ordering is guaranteed
  *within* a partition, and partitions are the unit of parallelism for readers.
  You can't reduce this later, so it's a real up-front decision.
- `--retention-time 24` — how many **hours** the log is retained and thus how
  far back consumers can replay; storage cost scales with this. (This is the
  knob queues/topics simply don't have — they delete on ack.)

## Hands-on exercises

The first few are decision exercises; the rest create small, cheap resources
(a Standard Service Bus namespace and a Basic Event Hubs namespace) so you can
*see* the topology differences. Cleanup is the last step.

1. **Choose the tool, five scenarios.** Write down queue / topic / stream for
   each and one-sentence why: (a) five replicas generating PDF invoices from a
   job list; (b) `UserSignedUp` that welcome-email, analytics, and CRM-sync
   each react to; (c) 50k IoT readings/sec you must be able to reprocess after
   a bug fix; (d) a `DeleteAccount` job that must run exactly once by one
   worker; (e) an ordered per-account audit log several tools tail. Verify (a)/(d)
   → queue, (b) → topic, (c)/(e) → stream.

2. **Create the resource groups and namespaces.**
   ```powershell
   az group create -n rg-msg-01 -l eastus
   az servicebus namespace create -g rg-msg-01 -n sb-msg-01-$RANDOM --sku Standard
   ```
   Note the actual namespace name it created (the `$RANDOM` suffix keeps it
   globally unique). Topics require **Standard** tier — Basic has queues only.

3. **Build a queue and watch competing consumers conceptually.**
   ```powershell
   az servicebus queue create -g rg-msg-01 --namespace-name <ns> -n jobs
   az servicebus queue show -g rg-msg-01 --namespace-name <ns> -n jobs --query countDetails
   ```
   > Verify: `activeMessageCount` is 0. This is the backlog counter — the
   > *unprocessed* messages, which for a queue is the whole story (processed
   > ones are deleted). Note there's no "retention" concept here.

4. **Build a topic with two independent subscriptions.**
   ```powershell
   az servicebus topic create -g rg-msg-01 --namespace-name <ns> -n orders
   az servicebus topic subscription create -g rg-msg-01 --namespace-name <ns> --topic-name orders -n billing
   az servicebus topic subscription create -g rg-msg-01 --namespace-name <ns> --topic-name orders -n shipping
   az servicebus topic subscription list -g rg-msg-01 --namespace-name <ns> --topic-name orders -o table
   ```
   > Verify: two subscriptions, `billing` and `shipping`. One message published
   > to `orders` will land a **separate copy** in each — that's fan-out, and
   > each subscription has its own independent message count.

5. **See the "queue = topic with one subscription" idea.** Note that the
   `orders` topic with just the `billing` subscription behaves exactly like a
   queue named `billing`: one publisher, one logical consumer, competing within
   it. Write down, in one sentence, what the *second* subscription bought you
   that a queue could not.

6. **Create a stream and see the difference that retention makes.**
   ```powershell
   az eventhubs namespace create -g rg-msg-01 -n eh-msg-01-$RANDOM --sku Basic
   az eventhubs eventhub create -g rg-msg-01 --namespace-name <eh-ns> -n telemetry --partition-count 2 --retention-time 1
   az eventhubs eventhub show -g rg-msg-01 --namespace-name <eh-ns> -n telemetry --query "{partitions:partitionCount, retentionHours:messageRetentionInDays}"
   ```
   > Verify: partitions and a retention window appear — concepts a Service Bus
   > queue has no equivalent for. The log keeps events for the window whether
   > or not anyone read them; that's replay.

7. **Diagnose and fix: chose a topic where a stream was needed.** Scenario: a
   team put a 40k-events/sec clickstream on a Service Bus **topic** with one
   subscription, and now analytics wants to reprocess *yesterday's* events
   after fixing a bug — but the messages were deleted on ack and are gone.
   Write down (a) why the topic can't satisfy the replay requirement, (b) which
   service they should have used, and (c) what makes that service able to
   replay. Verify your answer names retention/offsets on a **stream**
   (Event Hubs) as the missing capability — and note this is *not* fixable
   after the fact, which is the lesson.

8. **Diagnose and fix: ordering lost under competing consumers.** Scenario: a
   billing queue processes `AccountDebited` then `AccountCredited` for the same
   account, but with three worker replicas the credit sometimes posts before
   the debit, briefly overdrawing the account. Write down two valid fixes:
   one using a Service Bus feature that pins related messages to one ordered
   consumer, and one using a different topology entirely. Verify one answer is
   **sessions** (module 02 preview) keyed by account id, and the other is a
   **stream partitioned** by account id.

9. **Clean up.**
   ```powershell
   az group delete -n rg-msg-01 --yes --no-wait
   ```
   > Verify: `az servicebus namespace list -o table` no longer shows your
   > namespace once deletion completes. Standard Service Bus and Basic Event
   > Hubs are inexpensive, but don't leave namespaces idling.

## Independent challenge

Take the event-driven workflow you diagrammed in module 00's independent
challenge and, for each event and each consumer you identified, decide whether
it belongs on a **queue**, a **topic**, or a **stream**, and justify the choice
against the three axes this module gave you: number of independent consumers,
ordering needs, and whether replay/retention matters. Then pick the *one* place
where you're least sure and provision both candidate resources briefly (a
Service Bus topic vs. an Event Hub), inspect their differing properties
(`countDetails` vs. partitions/retention), and write a paragraph defending your
final choice. This builds on module 00's decomposition and previews the
Service Bus depth of module 02. Delete the resource group the moment you've
made your notes — both namespaces bill while they exist.

<details><summary>Stuck? One hint</summary>

The single most decisive question is: *does anyone need to read these events
more than once, or read them again after the fact?* If yes — replay, reprocess,
event sourcing, "let a new consumer catch up on history" — it's a **stream**,
because only a stream retains events after they're read. If every event is
handled once and then irrelevant, it's a queue (one consumer) or topic (several
independent consumers). Ordering is the tie-breaker, not the primary axis.

</details>

## Common mistakes & troubleshooting

- **Using a queue when you needed fan-out.** Adding a second consumer *type* to
  a queue makes them compete, so each message goes to only one — the second
  consumer silently misses half the messages. You needed a topic with two
  subscriptions.
- **Expecting global ordering from a queue.** Under competing consumers, order
  is not preserved. If you need it, use sessions (Service Bus) or partition a
  stream by your ordering key.
- **Choosing a topic/queue when you needed replay.** Queues and topics delete
  on ack; there is no "reprocess yesterday." That requirement forces a stream
  (Event Hubs), and it can't be retrofitted after the messages are gone.
- **Over-partitioning or under-partitioning a stream.** Partition count caps
  reader parallelism *and* is (effectively) fixed at creation on many tiers.
  Too few throttles consumers; too many fragments ordering. Size it to your
  target concurrency.
- **Cost pitfall — tier and topology mismatch.** Topics require Standard
  Service Bus (Basic is queues-only), and pushing a high-volume firehose
  through a topic that durably fans out every tiny message is far pricier than
  an Event Hub built for throughput. Match the tool to the traffic shape:
  low-volume business events → Service Bus; high-volume telemetry → a stream.
  Streams also bill for *retained* volume, so a long retention window on a
  firehose is a standing storage cost.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. In one line each: what does a queue, a topic, and a stream each do with a
   message after it's read?
2. Why is a Service Bus queue fairly described as "a topic with exactly one
   subscription"?
3. You add three worker replicas to one queue. What pattern is that, and what
   does it buy you? What does it cost you in terms of ordering?
4. A stream retains events for a window regardless of who read them. What
   capability does that enable that queues/topics can't offer?
5. Two teams both need to react to every `OrderPlaced`. Queue or topic, and why
   would the other choice break?
6. Name the Azure service for each: a competing-consumers work queue; a
   fan-out to independent subscribers; a high-volume ordered log with replay.
7. Give the two ways to get ordering for related messages, one using a Service
   Bus feature and one using stream partitioning.

<details><summary>Show answers</summary>

1. **Queue**: deletes the message on acknowledgement (it's consumed once).
   **Topic**: deletes each subscription's *copy* on that subscription's ack, but
   fans a copy to every subscription. **Stream**: keeps every event for the
   retention window regardless of reads; readers just advance an offset.
2. Because a topic fans out to its subscriptions and *within* a subscription
   consumers compete — so a topic with a single subscription is exactly one
   line of messages consumed once, which is a queue.
3. Competing consumers. It buys you horizontal throughput (more replicas =
   more parallel processing). It costs you global ordering — messages can
   complete out of order across replicas.
4. **Replay/reprocessing**: a consumer can rewind to an earlier offset and read
   history again (and a brand-new consumer can catch up from the beginning).
   Queues and topics delete on ack, so history is gone.
5. **Topic** with two subscriptions — each team gets its own independent copy.
   A queue would make the two teams *compete*, so each `OrderPlaced` would go to
   only one team and the other would miss it.
6. Competing-consumers work queue → **Service Bus queue**; fan-out to
   independent subscribers → **Service Bus topic + subscriptions** (or Event
   Grid); high-volume ordered log with replay → **Event Hubs** (Kafka-style
   stream).
7. Service Bus **sessions**: tag related messages with the same session id so
   they're locked to one consumer and delivered in order. Stream
   **partitioning**: partition by the ordering key so all related events land in
   one ordered partition.

</details>

## Next

[02-azure-service-bus-in-depth](../02-azure-service-bus-in-depth/README.md)
— now go deep on the workhorse: Service Bus queues, topics and subscriptions,
subscription filters, dead-letter queues, and sessions for ordering — all
provisioned by hand *and* declaratively with the Terraform you learned in
track 9.
