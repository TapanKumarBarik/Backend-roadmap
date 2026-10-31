# Capstone Project

## Why this matters

This is where the whole track converges. Across modules 00-07 you learned each
piece in isolation — the command/event distinction and idempotency (00), the
queue/topic/stream topologies (01), Service Bus queues/topics/filters/DLQ/
sessions (02), push-based Event Grid (03), the Dapr pub/sub building block backed
by a real broker (04), the reliability patterns that make at-least-once
survivable (05), event schema versioning (06), and the observability that makes
all of it operable (07). None of those, alone, is an event-driven system. This
capstone asks you to *compose* them into one: a small but genuinely event-driven
application where a real Azure resource event and a business event flow through
filtered subscriptions to a Dapr-based consumer, failures are proven to
dead-letter, and duplicates are proven harmless. There's no new concept and no
quiz here — the goal is to prove you can build and *operate* the real thing, then
tear it down cleanly and confirm nothing's left billing.

Treat this as a project, not a checklist of isolated exercises — the pieces
depend on each other in the order you'd actually build them.

> **Cost warning:** this capstone creates real, billable resources — a Service
> Bus **Standard** namespace, an Event Grid subscription on a real Azure
> resource, a Container Apps Environment with Dapr sidecars, and (optionally)
> Log Analytics/App Insights ingestion. Nothing here is expensive if you clean up
> promptly, but a **Premium** Service Bus namespace, a chatty Event Grid source,
> or full-sampling trace ingestion left running over a weekend is a real bill.
> Build it, prove it, destroy it — see the final cleanup.

## The project

Build a small **order-processing event-driven system** end to end. An order is
placed (a business event), it fans out through a filtered Service Bus topic to
specialized consumers, a real Azure resource event (a blob upload representing an
order document) triggers a reaction via Event Grid, one consumer runs as a
Dapr-pub/sub Container App, failures are dead-lettered and proven, and duplicate
deliveries are proven harmless. Provision the Azure infrastructure with
**Terraform** where you can (track 9), reusing your clean variables/outputs
habit, and fall back to `az` only where it's genuinely simpler.

Your system must include:

1. **A real Service Bus topic with at least two subscriptions with *different*
   filters** (modules 01-02). E.g. an `orders` topic with a `high-value`
   subscription (`amount > 1000`) and a `eu-orders` subscription
   (`region = 'eu'`), with the implicit `$Default` rule removed where it
   shouldn't apply, so each subscription provably receives a *different* subset
   and at least one message lands in both (fan-out).

2. **An Event Grid subscription reacting to a real Azure resource event**
   (module 03). E.g. a Storage account where uploading an order document
   (`BlobCreated`) triggers an Event Grid subscription — scoped by event type and
   subject — that pushes into the messaging system (a Service Bus queue handler is
   the clean in-Azure option), with a **dead-letter destination configured** so
   failed deliveries aren't dropped.

3. **A Dapr-pub/sub-based Container App consumer** (module 04). At least one
   consumer runs on Container Apps with Dapr enabled, subscribing to the `orders`
   topic through a **Service Bus-backed pub/sub component** whose connection comes
   from a **secret** (not inline — track 6 module 06), reusing your track 6 module
   05 Dapr muscle memory.

4. **Dead-letter handling proven to actually work** (modules 02, 05). You must
   **force a poison message** (a deliberately malformed or unprocessable event),
   show it lands in the DLQ with a meaningful reason after bounded retries (or via
   immediate dead-letter), and demonstrate a redrive/inspection path. A
   dead-letter path you haven't exercised doesn't count.

5. **An idempotent consumer design, written up** (modules 00, 05, 06). At least
   one consumer must be idempotent: it dedups on the envelope `id`, so a
   redelivered/duplicate event produces the side effect exactly once. Prove it by
   delivering the same logical event twice and showing the effect happened once,
   and write up the design (what the dedup key is, where it's stored, why
   at-least-once delivery makes this necessary).

Then **operate** it, **prove** it, and **destroy** it — see the acceptance
checklist.

## Acceptance checklist

Work top to bottom; each item depends on the previous ones actually working, not
just existing.

- [ ] An `orders` **Service Bus topic** exists with **≥2 subscriptions carrying
      different filters**. Publishing a spread of messages provably routes
      **different subsets** to each subscription, and at least one message lands
      in **both** (fan-out). The implicit `$Default` rule is removed where a
      subscription is meant to filter — verified by sending a message that should
      be *excluded* and confirming it does not appear.
- [ ] An **Event Grid subscription** reacts to a **real Azure resource event**
      (e.g. `Microsoft.Storage.BlobCreated`), scoped by event type and subject to
      the right container/path (using the *actual* subject format, not a guessed
      prefix), and delivers into the messaging system. Uploading a blob provably
      triggers it end to end.
- [ ] The Event Grid subscription has a **configured dead-letter destination**;
      you demonstrated (by forcing a delivery failure) that exhausted events land
      there rather than being silently dropped.
- [ ] At least one **Container App consumer runs with Dapr enabled**, subscribed
      to `orders` via a **Service Bus-backed pub/sub component**, and the
      component's connection string comes from a **secret**, not inline. A
      published event provably reaches the consumer (logs/trace confirm it).
- [ ] You **forced a poison message** and it landed in the **DLQ** with a
      meaningful `DeadLetterReason` after bounded retries (or immediate
      dead-letter). You can show the DLQ depth climbing and describe the
      redrive/inspection path.
- [ ] At least one consumer is **idempotent**: delivering the **same logical
      event twice** (same envelope `id`) produces the side effect **once**. You
      have a written design covering the dedup key, where it's stored, and why
      at-least-once delivery requires it.
- [ ] **Observability** is wired (module 07): at minimum an alert (or a
      demonstrated query) on **DLQ depth > 0** and evidence you can see **queue
      depth** as a time series. Bonus: a single **trace/correlation id** ties a
      message across the publish→queue→consume hops.
- [ ] Infrastructure is provisioned **declaratively where practical**
      (Terraform, track 9): the topic, subscriptions, and filter rules are
      `azurerm_servicebus_*` resources driven by variables, not hand-clicked. You
      read the plan before applying and it matched expectation.
- [ ] You can **explain every component** — why a topic (not a queue) for the
      fan-out, why Event Grid (push) for the resource event, why Dapr for the
      consumer, why the DLQ and idempotency are both required — mapping each back
      to the module that taught it. If you can't explain a piece, that's a signal
      to revisit it, not to leave a copy-pasted block that happened to work.
- [ ] **Everything is torn down** in the final cleanup and you've confirmed no
      Service Bus namespace, Event Grid subscription, Container Apps Environment,
      or diagnostic ingestion is still billing.

## Hints

- **Build in dependency order, proving each hop before adding the next.** Get the
  Service Bus topic + filtered subscriptions applying and routing correctly first
  (module 02), *then* add the Dapr consumer on top (module 04), *then* the Event
  Grid resource-event path (module 03), *then* force failures and wire
  observability (modules 05, 07). Don't stand up all five pieces and debug a
  system-wide failure at once — each proven hop is a checkpoint.
- **Remove the `$Default` filter or your filters are a lie.** A new subscription
  matches everything until you delete its implicit `$Default` `TrueFilter` (module
  02). Prove your filtering by sending a message that *should be excluded* and
  confirming it's absent — not just that included messages arrive.
- **Use the actual Event Grid subject format.** Storage blob subjects are
  `/blobServices/default/containers/<c>/blobs/<path>`, not `/container/path`
  (module 03). Inspect one real event's subject before writing a
  `--subject-begins-with` filter, or your subscription will silently receive
  nothing.
- **Prove dead-lettering, don't assume it.** Force a genuine poison message and
  watch it reach the DLQ with a reason (module 05). Bound `max_delivery_count` so
  it dead-letters instead of looping, and configure Event Grid's dead-letter
  endpoint explicitly — it's opt-in and defaults to *dropping* (module 03).
- **Dedup on a stable id.** Idempotency only works if the same logical event
  carries the same envelope `id` across retries/republishes (modules 00, 06).
  Have the consumer record processed ids and no-op on repeats; "publish the same
  event twice → effect once" is the proof.
- **Keep secrets out of the component.** The Service Bus connection string goes in
  a secret and is referenced by `secretRef` (track 6 module 06), never pasted into
  the component definition.
- **Watch depth and the DLQ, not just success paths.** An alert on
  `DeadletteredMessages > 0` and visibility into rising `ActiveMessages` (module
  07) are what make this operable — and they're what would have caught every
  diagnose-and-fix in this track early.
- **Keep it small and destroy promptly.** A Standard namespace, one small Storage
  account, and scale-to-zero Container Apps are cheap; this is still real spend.
  Don't leave it running while you write up your idempotency design.

## Final cleanup

This is the end of the track's real-Azure spend. Clean up deliberately.

1. Confirm what you're about to delete:
   `terraform state list` (everything Terraform manages) and
   `az resource list -g <your-rg> -o table`.
2. Destroy the Terraform-managed infrastructure: `terraform destroy` — review the
   destroy plan, confirm it includes the Service Bus namespace and rules, then
   `yes`.
3. Delete anything created with `az` (Event Grid subscriptions, the Container Apps
   Environment, Storage account, any resource group not under Terraform):
   `az group delete -n <your-rg> --yes --no-wait`.
4. Disable any **diagnostic settings / Application Insights ingestion** you wired
   for observability — these bill per GB and a `terraform destroy` of the messaging
   resources won't necessarily stop a workspace from ingesting.
5. Final sweep: `az servicebus namespace list -o table` (empty),
   `az eventgrid event-subscription list -o table` (nothing from this project),
   and `az group list -o table` (no leftover groups). Empty results from all are
   your signal you're no longer being billed for any of it.

## Before you move on

Once everything is torn down, don't consider this finished yet. Wait a few days,
then — with no notes, none of the earlier modules open, and none of the config in
front of you — **rebuild the core of this capstone from memory**: the filtered
topic with a message that lands in two subscriptions, the Event Grid path off a
real resource event with a dead-letter destination, the Dapr consumer reading
from a secret-backed component, a forced poison message reaching the DLQ, and the
same event delivered twice with the effect happening once. Rebuilding it cold —
and noticing exactly where you stall (Was it removing `$Default`? The Storage
subject format? Wiring the dedup key? Proving the DLQ?) — is the truest retention
check there is. Tear it all down again afterward and confirm the subscription is
clean.

## Next

You've now designed, built, and operated a real event-driven system — the
messaging backbone that later platform tracks assume. The immediate next step is
**[16-identity-deep-dive](../../16-identity-deep-dive/README.md)**. It's the
natural continuation of a thread you kept pulling on here: every secret-backed
Dapr component, every Service Bus connection string, and every Event Grid handler
you wired raised the same question — *which identity is actually allowed to
publish, subscribe, and be reacted to, and how do you stop putting connection
strings in secrets at all?* Track 16 answers it properly: Entra ID, service
principals, managed identity, and workload identity federation across every
resource type — so the messaging system you just built can authenticate with
identities instead of shared keys.

[Back to track index](../README.md) · [Back to main curriculum](../../README.md)
