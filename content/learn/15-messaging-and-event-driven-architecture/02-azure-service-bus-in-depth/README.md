# Azure Service Bus in Depth

## Why this matters

Service Bus is the workhorse behind almost everything else in this track: the
Dapr pub/sub component you'll back with a real broker in module 04 talks to a
Service Bus topic, the reliability patterns in module 05 are built on its
dead-letter queues and lock semantics, and the capstone requires a topic with
filtered subscriptions. Everything you learned abstractly in modules 00-01 —
point-to-point vs. pub/sub, at-least-once delivery, ordering — is a concrete,
billable feature here with a flag or a Terraform argument. This is the longest
module in the track on purpose; get fluent here and the rest is composition.

> **Cost warning:** topics/subscriptions and **sessions** require the
> **Standard** tier (Basic is queues-only, no topics, no sessions). Standard is
> billed largely per operation and is cheap for a lab, but the **Premium** tier
> (dedicated capacity, needed for very high throughput) bills per *messaging
> unit per hour* whether idle or not — do not create a Premium namespace for
> these exercises. Clean up at the end of the module.

## Concepts

### Namespaces, queues, and the lock/complete lifecycle

A **namespace** is the top-level container (a DNS name, a security and billing
boundary) that holds queues and topics. A **queue** is point-to-point (module
01). The part that matters most is the **message lifecycle** under
**PeekLock** (the default, safe receive mode): a consumer *receives* a message,
which **locks** it (makes it invisible to others) for a lock duration; the
consumer does its work and then explicitly **completes** it (removes it) — or
**abandons** it (unlocks it for immediate redelivery) or **dead-letters** it
(routes it aside). If the consumer crashes or the lock simply *expires* before
it completes, the broker assumes failure and **redelivers** — this is exactly
the at-least-once guarantee from module 00, mechanised. The alternative,
**ReceiveAndDelete**, removes the message on receipt (at-most-once) — faster,
lossy, rarely what you want. Every "stuck message being redelivered forever"
bug in this track traces back to a consumer that received but never completed.

### Topics, subscriptions, and filters

A **topic** fans a published message out to its **subscriptions**, each an
independent queue-like backlog (module 01). What's new here is that each
subscription has a **filter** deciding *which* messages it receives. Three
filter kinds:

- **`TrueFilter`** (the default) — the subscription gets every message.
- **`CorrelationFilter`** — matches on system/user properties by exact equality
  (e.g. `label = 'priority'`, or a custom `region = 'eu'` property). Cheap and
  fast; the right default when you're routing on a known property.
- **`SqlFilter`** — a SQL-like boolean expression over properties
  (`amount > 1000 AND region = 'eu'`). More expressive, slightly more
  expensive to evaluate.

This is how one `OrderPlaced` topic feeds a `high-value` subscription
(`amount > 1000`) and an `eu-orders` subscription (`region = 'eu'`) from the
same publisher — the capstone requires exactly this. A subtle default: a new
subscription created via SQL/correlation filters may still carry the implicit
`$Default` `TrueFilter` unless you replace it, which is a classic "why is this
subscription getting everything?" bug.

### Dead-letter queues (DLQ)

Every queue and every subscription has a **dead-letter sub-queue** (DLQ) — a
built-in side channel for messages that can't be delivered/processed. Messages
land there two ways: **automatically**, when delivery attempts exceed
**MaxDeliveryCount** (default 10) or the message expires (TTL), or
**explicitly**, when your consumer calls dead-letter on a message it knows it
can't handle (a *poison message* — malformed, references a deleted entity).
The DLQ is addressed as `<queue>/$DeadLetterQueue` (or
`<topic>/Subscriptions/<sub>/$DeadLetterQueue`). Crucially, **messages don't
leave the DLQ on their own** — they sit there until you read and handle them,
which is the point (nothing is silently lost) *and* a trap (a DLQ quietly
filling up is invisible unless you monitor its depth, a diagnose-and-fix
exercise below and a first-class metric in module 07).

### Sessions: ordering and stateful processing

By default a queue/subscription gives no ordering under competing consumers
(module 01). **Sessions** fix this: enable sessions on the entity, tag related
messages with a **SessionId**, and Service Bus locks *all messages of one
session to a single consumer* and delivers them **in order (FIFO)**. Different
sessions still process in parallel across consumers, so you keep throughput
while getting per-key ordering — e.g. all events for `order-42` handled in
order by one worker, while `order-43` runs on another. Sessions also enable
**session state** (a small per-session scratchpad) for stateful workflows.
Sessions must be enabled at **creation** (`--enable-session true`) and require
Standard tier — you can't turn them on later. This is the concrete answer to
module 01's "how do you get ordering" question.

### Provisioning Service Bus with Terraform

Everything above has a one-to-one `azurerm` resource, so you can provision it
declaratively exactly as you did AKS/ACR in track 9 module 06 instead of by
hand:

```hcl
resource "azurerm_servicebus_namespace" "sb" {
  name                = "sb-msg-tf-12345"   # globally unique
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard"
}

resource "azurerm_servicebus_topic" "orders" {
  name         = "orders"
  namespace_id = azurerm_servicebus_namespace.sb.id
}

resource "azurerm_servicebus_subscription" "high_value" {
  name               = "high-value"
  topic_id           = azurerm_servicebus_topic.orders.id
  max_delivery_count = 10
}

resource "azurerm_servicebus_subscription_rule" "high_value_filter" {
  name            = "amount-gt-1000"
  subscription_id = azurerm_servicebus_subscription.high_value.id
  filter_type     = "SqlFilter"
  sql_filter      = "amount > 1000"
}
```

The mapping (compare to track 9 module 06's `az`→`azurerm` table):
`az servicebus namespace create` → `azurerm_servicebus_namespace`,
`topic create` → `azurerm_servicebus_topic`,
`subscription create` → `azurerm_servicebus_subscription`, and the *filter*
(the interesting bit) → `azurerm_servicebus_subscription_rule`. Because the
rule references the subscription's id, Terraform's dependency graph orders them
correctly — the same "reference, don't hard-code" discipline from track 9.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az servicebus namespace create` | Creates the namespace (Standard for topics/sessions) | `az servicebus namespace create -g rg-sb -n sb-msg-02-$RANDOM --sku Standard` |
| `az servicebus queue create` | Creates a queue (optionally session-enabled) | `az servicebus queue create -g rg-sb --namespace-name <ns> -n jobs --enable-session true --max-delivery-count 5` |
| `az servicebus topic create` | Creates a topic | `az servicebus topic create -g rg-sb --namespace-name <ns> -n orders` |
| `az servicebus topic subscription create` | Adds a subscription to a topic | `az servicebus topic subscription create -g rg-sb --namespace-name <ns> --topic-name orders -n high-value --max-delivery-count 10` |
| `az servicebus topic subscription rule create` | Adds a filter rule to a subscription | `az servicebus topic subscription rule create -g rg-sb --namespace-name <ns> --topic-name orders --subscription-name high-value -n amountRule --filter-sql-expression "amount > 1000"` |
| `az servicebus topic subscription rule delete` | Removes a rule (e.g. the implicit `$Default`) | `az servicebus topic subscription rule delete -g rg-sb --namespace-name <ns> --topic-name orders --subscription-name high-value -n '$Default'` |
| `az servicebus queue show --query countDetails` | Shows active vs. dead-letter counts (backlog + DLQ depth) | `az servicebus queue show -g rg-sb --namespace-name <ns> -n jobs --query countDetails` |
| `az servicebus namespace authorization-rule keys list` | Gets a connection string for sending/receiving | `az servicebus namespace authorization-rule keys list -g rg-sb --namespace-name <ns> -n RootManageSharedAccessKey --query primaryConnectionString -o tsv` |

Flag-by-flag — `az servicebus queue create -g rg-sb --namespace-name <ns> -n jobs --enable-session true --max-delivery-count 5`:
- `--enable-session true` — turns on **sessions** for FIFO-per-SessionId
  ordering. Must be set at creation; cannot be added later.
- `--max-delivery-count 5` — how many delivery attempts before a message is
  **auto-dead-lettered**. Lower it to fail fast on poison messages; the default
  is 10.

Flag-by-flag — `az servicebus topic subscription rule create ... -n amountRule --filter-sql-expression "amount > 1000"`:
- `--filter-sql-expression "amount > 1000"` — creates a **SqlFilter**;
  only messages whose `amount` application property exceeds 1000 reach this
  subscription. Use `--correlation-id` / property flags instead for a cheaper
  **CorrelationFilter** when matching on exact equality.
- Note: adding a rule does **not** remove the implicit `$Default` `TrueFilter`
  — delete it (`rule delete ... -n '$Default'`) or the subscription still
  receives everything.

## Hands-on exercises

These create a Standard Service Bus namespace (cheap, per-operation billing).
For sending/receiving actual messages you'll use the Azure portal's Service Bus
**Explorer** (Namespace → Queue/Subscription → Service Bus Explorer → Send /
Peek / Receive), which needs no code — the CLI provisions, the Explorer
exercises the message flow. Cleanup is the last exercise.

1. **Provision the namespace.**
   ```powershell
   az group create -n rg-sb -l eastus
   az servicebus namespace create -g rg-sb -n sb-msg-02-$RANDOM --sku Standard
   ```
   Record the generated name as `<ns>` for the rest of the module.

2. **Create a queue and inspect its lifecycle counters.**
   ```powershell
   az servicebus queue create -g rg-sb --namespace-name <ns> -n jobs --max-delivery-count 5
   az servicebus queue show -g rg-sb --namespace-name <ns> -n jobs --query countDetails
   ```
   > Verify: `activeMessageCount` and `deadLetterMessageCount` are both 0. These
   > are the two numbers you'll watch all module.

3. **Send and PeekLock-receive a message (portal Explorer).** In the portal,
   open the `jobs` queue → Service Bus Explorer → **Send** a message with body
   `{"job":"resize","id":1}`. Then **Peek** (non-destructive) and observe it.
   Now **Receive** in **PeekLock** mode but *don't* complete it. Wait past the
   lock duration and receive again.
   > Verify: the same message reappears — you're watching at-least-once
   > redelivery caused by a receive that never completed. Complete it to remove
   > it; confirm `activeMessageCount` drops to 0.

4. **Create a topic with two filtered subscriptions.**
   ```powershell
   az servicebus topic create -g rg-sb --namespace-name <ns> -n orders
   az servicebus topic subscription create -g rg-sb --namespace-name <ns> --topic-name orders -n high-value --max-delivery-count 10
   az servicebus topic subscription create -g rg-sb --namespace-name <ns> --topic-name orders -n eu-orders --max-delivery-count 10
   az servicebus topic subscription rule create -g rg-sb --namespace-name <ns> --topic-name orders --subscription-name high-value -n amountRule --filter-sql-expression "amount > 1000"
   az servicebus topic subscription rule create -g rg-sb --namespace-name <ns> --topic-name orders --subscription-name eu-orders -n regionRule --filter-sql-expression "region = 'eu'"
   ```
   Then delete the implicit default rule from each so the filters actually
   restrict:
   ```powershell
   az servicebus topic subscription rule delete -g rg-sb --namespace-name <ns> --topic-name orders --subscription-name high-value -n '$Default'
   az servicebus topic subscription rule delete -g rg-sb --namespace-name <ns> --topic-name orders --subscription-name eu-orders -n '$Default'
   ```
   > Verify: `az servicebus topic subscription rule list ... --subscription-name high-value -o table` shows only `amountRule`.

5. **Prove the filters route correctly.** In the portal, send three messages to
   the `orders` topic, each with **custom application properties**: (a)
   `amount=1500, region=us`; (b) `amount=200, region=eu`; (c)
   `amount=5000, region=eu`. Peek each subscription.
   > Verify: `high-value` has (a) and (c) [`amount > 1000`]; `eu-orders` has (b)
   > and (c) [`region = eu`]; message (c) is in **both** (fan-out, independent
   > copies). This is the multi-filter topic the capstone requires.

6. **Force a message into the dead-letter queue.** On the `jobs` queue
   (max-delivery-count 5), send a message, then Receive-in-PeekLock and
   **Abandon** it six times (or just don't complete it and let the lock expire
   repeatedly).
   ```powershell
   az servicebus queue show -g rg-sb --namespace-name <ns> -n jobs --query countDetails
   ```
   > Verify: after exceeding max-delivery-count, `activeMessageCount` is 0 and
   > `deadLetterMessageCount` is 1 — the message was auto-dead-lettered. Peek
   > the DLQ in the Explorer (`jobs/$DeadLetterQueue`) and note the
   > `DeadLetterReason` = `MaxDeliveryCountExceeded`.

7. **Create a session-enabled queue and see ordering.**
   ```powershell
   az servicebus queue create -g rg-sb --namespace-name <ns> -n ordered --enable-session true
   ```
   In the portal, send four messages to `ordered`, two with **SessionId** `A`
   (bodies `A1`, `A2`) and two with SessionId `B` (`B1`, `B2`), interleaved.
   Receive with a **session** accept.
   > Verify: within a session, messages arrive FIFO (`A1` before `A2`); the
   > broker locks a whole session to one receiver. Note you can't receive from a
   > session-enabled queue without accepting a session — sessions change the
   > receive contract.

8. **Provision the same topic with Terraform.** In a new directory, write
   `main.tf` using the four `azurerm_servicebus_*` resources from Concepts (a
   Standard namespace, the `orders` topic, a `high-value` subscription, and its
   `SqlFilter` rule). Then:
   ```bash
   terraform init && terraform plan
   ```
   > Verify: `Plan: 4 to add`. Apply it, confirm with
   > `az servicebus topic subscription rule show ... -n amount-gt-1000`, then
   > `terraform destroy`. You've now built by hand *and* declaratively — the
   > track 9 discipline applied to messaging. Note the filter is its own
   > `azurerm_servicebus_subscription_rule` resource, just as the NSG
   > association was its own resource in track 9.

9. **Diagnose and fix: a message stuck being redelivered.** Reproduce the
   canonical bug. Send a message to `jobs`, Receive-in-PeekLock, and simulate a
   consumer that "processes" but never completes (just leave it, letting the
   lock expire). Watch it via:
   ```powershell
   az servicebus queue show -g rg-sb --namespace-name <ns> -n jobs --query countDetails
   ```
   > Observe: `activeMessageCount` stays 1 and the message's delivery count
   > climbs on each expiry — it's being redelivered because nothing ever
   > **completes** it. **Diagnose**: the consumer receives but never acks
   > (completes). **Fix** two ways: (a) properly Complete the message after
   > processing so it's removed, and (b) recognize that if it's genuinely
   > unprocessable, letting delivery count hit max-delivery-count routes it to
   > the DLQ (exercise 6) instead of looping forever. The lesson: **always
   > complete, abandon, or dead-letter — never just drop the receive.**

10. **Diagnose and fix: a subscription filter that never matches.** Add a
    subscription `big-eu` with a SQL filter `amount > 1000 AND region = 'EU'`
    (note the uppercase `EU`), delete its `$Default` rule, and send message (c)
    from exercise 5 (`region=eu`).
    > Observe: `big-eu` receives nothing even though the amount qualifies.
    > **Diagnose**: SqlFilter string comparison is case-sensitive — `'EU'` ≠
    > `'eu'`; the filter can *never* match your `eu` messages. **Fix**: recreate
    > the rule with `region = 'eu'` (or normalize the property at publish time).
    > This is the "filter that never matches" trap — the subscription looks
    > healthy and silently receives zero messages.

11. **Diagnose and fix: a DLQ filling up unnoticed.** Over the module you've
    routed messages to the `jobs` DLQ. Imagine no one is watching it. Query its
    depth explicitly:
    ```powershell
    az servicebus queue show -g rg-sb --namespace-name <ns> -n jobs --query "countDetails.deadLetterMessageCount"
    ```
    > Observe: a non-zero DLQ depth that nothing is draining. **Diagnose**: the
    > DLQ never auto-empties; those messages represent real failures nobody
    > sees. **Fix**: peek the DLQ, understand the `DeadLetterReason`, fix the
    > root cause, and either **resubmit** (receive from the DLQ and re-send to
    > the main entity) or discard deliberately. The durable fix is an **alert on
    > DLQ depth** — which is exactly the first-class metric you'll wire up in
    > module 07.

12. **Clean up.**
    ```powershell
    az group delete -n rg-sb --yes --no-wait
    ```
    > Verify: `az servicebus namespace list -o table` no longer lists your
    > namespace once deletion completes. Also make sure any Terraform-created
    > namespace from exercise 8 was destroyed.

## Independent challenge

Model a small order-processing system on **one** Service Bus topic named
`orders`, entirely in **Terraform** (reusing the track 9 module 04 habit of
clean variables and outputs). It must have at least three subscriptions with
*different* filters — e.g. `all-orders` (TrueFilter, audit), `high-value`
(`amount > 1000`), and `eu-orders` (`region = 'eu'`) — with the implicit
`$Default` rule removed where it shouldn't apply. Then, by hand via the portal
Explorer, publish a spread of messages and *prove* each subscription receives
exactly the right subset, including one message that lands in two subscriptions
at once. Finally, deliberately drive one subscription's message to its
dead-letter queue by exceeding `max_delivery_count`, and show its DLQ depth
climbing. This combines module 01's topic topology, this module's filters and
DLQ, and track 9's Terraform. Run `terraform destroy` and confirm
`az servicebus namespace list` is empty — a Standard namespace bills per
operation while it exists.

<details><summary>Stuck? One hint</summary>

The filter behavior that trips everyone: creating a subscription gives it an
implicit `$Default` rule that is a `TrueFilter` (matches everything). Adding
your own `azurerm_servicebus_subscription_rule` does **not** remove that default
— so the subscription matches *your* rule OR the default, i.e. everything.
There's no `azurerm` argument to suppress the default cleanly, so the common
pattern is to name your rule and, for a subscription that should filter, verify
in the portal that only your rule is present (removing `$Default` via `az` in a
`local-exec` or by hand). Prove the filtering empirically by sending a message
that should be *excluded* and confirming it does **not** appear.

</details>

## Common mistakes & troubleshooting

- **Receiving without completing.** In PeekLock, a message you don't
  Complete/Abandon/DeadLetter is redelivered when the lock expires — the
  "stuck message" bug. Always resolve every received message.
- **Forgetting the implicit `$Default` filter.** A new subscription matches
  everything until you remove `$Default`; your carefully written SqlFilter then
  looks broken because the subscription gets all messages anyway.
- **Case-sensitive SqlFilter comparisons.** `region = 'EU'` won't match `'eu'`.
  Filters that "never match" are usually a case or type mismatch (string vs.
  number) on a property.
- **Trying to enable sessions after creation.** Sessions (and partitioning)
  must be set at entity creation. Retrofitting means recreating the entity.
- **Ignoring the DLQ.** It never drains itself. A silently growing DLQ is lost
  business events; monitor its depth and alert on it (module 07).
- **Cost pitfall — Premium when Standard would do.** **Premium** Service Bus
  bills per **messaging unit per hour**, 24/7, whether or not traffic flows —
  it's for guaranteed throughput/latency and VNet isolation, not for labs.
  **Standard** is per-operation and effectively free at lab volumes. Never spin
  up Premium for these exercises; if you inherited one, that's a standing
  hourly charge to hunt down. Also, extremely chatty fine-grained messages
  multiply per-operation cost on Standard — design meaningful events (the
  module 00 lesson).

## Cumulative review

Closed-book. Cover the answers and write each one out before checking — this
mixes everything from modules 00-02.

1. A consumer receives a Service Bus message in PeekLock, does its work, but the
   process is killed before it can Complete. What does the broker do, which
   delivery guarantee is this, and what property eventually saves you from an
   infinite loop?
2. Name the three Service Bus subscription filter types and when you'd pick the
   correlation one over the SQL one.
3. You have `OrderPlaced` that billing, shipping, and fraud each need. Queue,
   topic, or stream? If instead five identical workers must each pull *different*
   jobs from a shared list, which one?
4. Distinguish a command from an event, and give the Service Bus entity you'd
   naturally use for each.
5. Why does a plain competing-consumers queue not preserve order, and what
   Service Bus feature restores per-key FIFO without giving up parallelism
   across keys?
6. In Terraform, the subscription *filter* is a separate resource from the
   subscription. Name it, and explain why the reference between them makes
   Terraform order their creation correctly (tie it to the track 9 NSG-
   association idea).
7. A subscription with a valid-looking SQL filter receives zero messages. Give
   two independent causes and how you'd tell them apart.
8. Define at-least-once delivery and state the one consumer property that makes
   at-least-once safe for a side effect like charging a card.
9. What's in a dead-letter queue, the two ways a message gets there, and why is
   "it's empty" not something you can assume without checking?

<details><summary>Show answers</summary>

1. The lock expires and the broker **redelivers** the message (incrementing its
   delivery count). This is **at-least-once** delivery. **MaxDeliveryCount**
   saves you: after that many attempts the message is auto-dead-lettered instead
   of looping forever.
2. **TrueFilter** (matches all — the default), **CorrelationFilter** (exact
   equality on properties, cheap/fast), **SqlFilter** (boolean SQL-like
   expression, more expressive). Pick correlation when you route on exact
   property equality and want the cheapest/fastest evaluation; use SQL when you
   need ranges/AND/OR.
3. Fan-out to three independent consumers → a **topic** with three
   subscriptions. Five workers each taking different jobs from one list →
   a **queue** (competing consumers).
4. A command is an imperative request to one handler (`ChargeCard`) → a
   **queue**; an event is a past-tense fact many can react to (`OrderPlaced`) →
   a **topic** (with subscriptions).
5. Under competing consumers, workers complete messages independently, so
   completion order isn't send order. **Sessions** (SessionId) restore FIFO per
   session by locking a whole session to one consumer, while different sessions
   still run in parallel.
6. `azurerm_servicebus_subscription_rule`. It references the subscription's
   `subscription_id`, so Terraform's dependency graph creates the subscription
   before the rule — the same "reference, not hard-coded string" ordering that
   made the NSG association follow the subnet/NSG in track 9 module 06.
7. (a) The filter genuinely excludes the traffic — e.g. a case/type mismatch
   like `'EU'` vs `'eu'` or `amount > '1000'` (string). (b) The publisher isn't
   setting the property the filter reads at all. Tell them apart by peeking a
   message on a TrueFilter/audit subscription and inspecting whether the
   property is present and what value/type it holds.
8. At-least-once: every message is delivered one *or more* times (never lost,
   possibly duplicated). An **idempotent** consumer (e.g. dedup on a stable
   message/business id) makes duplicates harmless, so charging twice becomes a
   no-op.
9. Messages that couldn't be processed/delivered. They arrive **automatically**
   (max-delivery-count exceeded or TTL expiry) or **explicitly** (the consumer
   dead-letters a poison message). You can't assume it's empty because the DLQ
   never drains itself — you must query its depth (`countDetails.
   deadLetterMessageCount`) or alert on it.

</details>

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Walk the PeekLock lifecycle: what are the four things a consumer can do with
   a received message, and what happens if it does none of them?
2. What's the difference between ReceiveAndDelete and PeekLock, and which
   delivery guarantee does each give?
3. You want a subscription that only sees orders over $1000 from the EU. Which
   filter type, and write the expression. What subtle default must you also
   remove?
4. A message ends up in a subscription's dead-letter queue. Give the two
   distinct routes it could have taken to get there.
5. What does enabling sessions change about how messages are received, and what
   ordering guarantee does it provide?
6. Which Service Bus tier do topics and sessions require, and which tier bills
   per messaging-unit-hour whether idle or not?
7. In the Terraform version, which resource represents the subscription filter,
   and why don't you hard-code the subscription id into it?
8. Your `deadLetterMessageCount` is 47 and climbing and nobody noticed. What
   went wrong operationally, and what's the durable fix?

<details><summary>Show answers</summary>

1. **Complete** (remove it — success), **Abandon** (unlock for immediate
   redelivery), **DeadLetter** (route to the DLQ), or **Defer** (set aside by
   sequence number for later). If it does none, the **lock expires** and the
   message is **redelivered** (delivery count++), eventually hitting
   max-delivery-count and being dead-lettered.
2. **ReceiveAndDelete** removes the message the instant it's received —
   **at-most-once** (a crash loses it). **PeekLock** locks it until you
   explicitly resolve it — **at-least-once** (a crash redelivers it).
3. **SqlFilter**: `amount > 1000 AND region = 'EU'` (match the exact case your
   publisher uses). You must also **delete the implicit `$Default` rule**, or
   the subscription still matches everything.
4. **Automatically** (delivery attempts exceeded MaxDeliveryCount, or the
   message's TTL expired) or **explicitly** (the consumer called dead-letter on
   a message it recognized as a poison message).
5. Receiving requires **accepting a session** (you can't do a plain receive);
   the broker locks *all messages of one SessionId* to a single consumer and
   delivers them **in order (FIFO)**, while different sessions run in parallel.
6. Topics and sessions require **Standard** (Basic is queues-only, no sessions).
   **Premium** bills per messaging-unit-hour continuously, idle or not.
7. `azurerm_servicebus_subscription_rule`. You reference
   `azurerm_servicebus_subscription.<x>.id` so Terraform builds the subscription
   first and wires the rule to it — a real dependency edge, not a brittle
   hard-coded string.
8. Operationally, nobody was **monitoring DLQ depth**, so accumulating failed
   messages (lost business events) went unseen — the DLQ never drains itself.
   The durable fix is an **alert on `deadLetterMessageCount`** plus a process to
   inspect the `DeadLetterReason`, fix root causes, and resubmit or discard
   (module 07 makes this a first-class metric).

</details>

## Next

[03-azure-event-grid](../03-azure-event-grid/README.md) — the other half of
Azure's eventing story: a push-based, pub/sub-for-Azure-resource-events service.
You'll compare its event-source/topic/subscription model and *push* delivery to
the *poll*-based Service Bus you just learned, and see where each fits.
