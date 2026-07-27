# Module 08: Capstone Project

## Why this matters

The previous eight modules each taught one pattern in isolation, with clean exercises
that exercised exactly that pattern. Real distributed systems are never so tidy: the
patterns show up *together*, interacting, and the hard part is not any single pattern
but making them cooperate correctly. An idempotency key protects the *entrance* to a
saga; the saga's steps append *events* that an event-sourced log records; the read
side of that log is a CQRS projection that lags; a lock or conditional write guards
the one step where two orders race for the last unit. Each pattern closes a gap the
others open. You don't understand this material until you've felt those seams — where
idempotency meets the saga, where the saga's writes meet the event log, where the
event log meets the eventually-consistent read model.

This capstone is where the track stops handing you patterns and asks you to *integrate*
them. You'll design and partially build a **distributed order-processing system** that
must be correct under the conditions this entire track insisted are the default:
duplicated requests, retried steps, partial failures, and concurrent access. There is
no new theory here and there is no solution code — the point is to make the judgment
calls yourself: which pattern each requirement demands, where they connect, and what
happens at each seam when things go wrong. If you can build the skeleton below and
defend every design choice by naming the failure it prevents and the module it came
from, you've genuinely absorbed the track. Treat this as the exam you write for
yourself.

## The project

Build the core of an **order-processing service**. A client submits an order; the
system must charge payment, reserve inventory, and confirm the order across
independent services — safely under retries and partial failure — while recording the
order's full lifecycle as an event history that support and audit can replay. You are
expected to *design the whole thing* and *implement enough of it to demonstrate each
pattern working*, not to ship a production system. Stub external services (payment
provider, inventory service) with simple functions you can make fail on command.

Use the local stack from earlier modules: Postgres (event store + read models + the
idempotency/dedupe tables), optionally Redis (locks, fast idempotency claims), and
FastAPI for the command entrypoint. Reuse the code shapes from modules 01, 04, 05, 06,
and 07 — this is an integration exercise, so leaning on those references is expected.

### What it must do

1. **Accept `POST /orders` with a client-supplied `Idempotency-Key`.** A retried
   submission (same key) must never create a second order or trigger a second charge —
   it returns the original result. (Module 01.)
2. **Process the order as a saga** across three steps — capture payment, reserve
   inventory, confirm order — each a local transaction, with **compensating
   transactions** (refund, release reservation, cancel) if a later step fails. The
   order moves through explicit, queryable states (`pending → paid → reserved →
   confirmed`, or `→ compensating → cancelled`). (Module 04.)
3. **Record the order's lifecycle as an event-sourced log** — `OrderPlaced`,
   `PaymentCaptured`, `InventoryReserved`, `OrderConfirmed`, `OrderCancelled`,
   `PaymentRefunded`, etc. — as the source of truth; current order state is *derived*
   by folding the events. (Module 06.)
4. **Serve reads from a CQRS projection** — an `order_summary` read model built from
   the event stream — that tolerates lag, with **read-your-writes** for the customer
   who just placed the order. (Modules 05, 00.)
5. **Guard the contended step** — reserving the last unit of inventory — with an atomic
   conditional write (or a fenced lock) so two concurrent orders can't oversell.
   (Module 02.)
6. **Survive an orchestrator crash mid-saga** by persisting saga state and resuming
   (or safely restarting, given idempotent steps) rather than stranding a half-done
   order. (Modules 04, 06.)

### Acceptance checklist

Your system is "done enough" when you can demonstrate each of these, ideally with a
script or test that *proves* it rather than an assertion that it's true:

- [ ] Submitting the *same* order twice with the same `Idempotency-Key` produces
      exactly **one** order, **one** charge, and returns the identical response both
      times. (01)
- [ ] Submitting with the same key but a *different* body is rejected (e.g. `422`),
      not silently answered with the stored response. (01)
- [ ] The happy path walks the order through all forward states and ends `confirmed`,
      with a payment captured and inventory reserved. (04)
- [ ] Forcing the **inventory step to fail** triggers compensations in reverse order —
      the captured payment is **refunded** and the order ends `cancelled` — with no
      dangling reservation and no lost money. (04)
- [ ] Every saga step and every compensation is **idempotent**: invoking any of them
      twice (simulating at-least-once retry) leaves the same state. (01, 04)
- [ ] The order's current state is **derived by folding its event log**, not read from
      a mutable status column as the source of truth; deleting/rebuilding the derived
      state recomputes it correctly from the events. (06)
- [ ] Correcting a mistake appends a **new event** rather than mutating/deleting an
      existing one; the full history (including the correction) is preserved. (06)
- [ ] The `order_summary` **read model** is built by projecting events, is idempotent
      under redelivery, and can be **rebuilt from scratch** from the event log. (05, 06)
- [ ] A customer who just placed an order **sees it immediately** (read-your-writes),
      even though other reads come from the lagging projection. (00, 05)
- [ ] Two concurrent orders competing for the **last unit of inventory**: exactly one
      succeeds; the other is cleanly rejected/compensated — **no oversell**. (02)
- [ ] Killing the process **mid-saga** (after payment, before confirm) and restarting
      leaves a resumable/consistent order — never a charged-but-lost order. (04, 06)
- [ ] A short **written design memo** accompanies the code: for each pattern, one
      paragraph naming the failure it prevents, the seam where it meets the next
      pattern, and the consistency the customer experiences. (all)

### Hints (not solutions)

<details>
<summary>Where the patterns connect — read only after you've sketched your own design</summary>

- **The idempotency key wraps the whole saga, not each step.** The client's
  `Idempotency-Key` dedupes the *order submission* (one saga per key); *inside* the
  saga, each step also needs its own idempotency (keyed on `saga_id`/`order_id`) so the
  orchestrator's retries don't double-charge. Two layers: one at the door (per
  submission), one per step. Store the first submission's response against the key and
  return it verbatim on retry; bind the key to a request hash to catch the
  different-body bug. (Module 01.)

- **Make the event log the source of truth and derive everything else.** Resist a
  mutable `orders.status` column as the truth. Append events (`OrderPlaced`,
  `PaymentCaptured`, …); derive current status by folding. The saga's "state" and the
  `order_summary` read model are *both* projections of the log — which is what makes
  "rebuild from scratch" and "resume after crash" fall out naturally. The saga
  orchestrator advancing = validating the command against folded state, then appending
  the next event. (Modules 04, 06.)

- **Order the irreversible step last and prefer authorize-then-capture.** Payment is
  the step you least want to unwind. Either place it so a failure rarely has to refund,
  or *authorize* (hold) the card and only *capture* on final confirm, so a failed saga
  *voids the hold* and the customer never sees a real charge — turning an irreversible
  action into a reversible one, exactly like reserving inventory instead of
  decrementing. (Module 04.)

- **The oversell guard is a conditional write, not just a lock.** A lock reduces
  contention but can expire under a pause; the *correctness* guarantee is an atomic
  `UPDATE inventory SET reserved = reserved + 1 WHERE sku = :s AND reserved < stock`
  (or a fenced write) that the resource itself enforces — so even if two orders race or
  a lock lapses, only one reservation can win. Lock for efficiency, conditional write
  for correctness. (Module 02.)

- **Read-your-writes hides the projection lag for one user.** After the command
  commits, serve *that customer's* just-placed order from the write-side folded state
  (or return it in the command response), while everyone else reads the lagging
  `order_summary` projection. Don't force all reads to be strongly consistent — choose
  per read. (Modules 00, 05.)

- **Persist saga position so a crash resumes, not restarts blindly.** Keep a
  `saga_state`/event marker of which steps completed. On restart, fold the events to
  see where you are and continue; because every step is idempotent, even a naive
  "re-run from the top" converges without double effects. The crash must never leave a
  charged-but-unconfirmed order with no path forward. (Modules 04, 06.)

- **Prove failures, don't assert them.** For each acceptance item, write a small script
  that *forces* the failure (duplicate key, inventory-fails injection, kill mid-saga,
  two concurrent last-unit orders) and checks the invariant held. The whole track's
  thesis is that these conditions are the *default*, so testing only the happy path
  proves nothing.

- **If you get stuck on coordination** (e.g. "which instance runs the saga
  orchestrator?"), that's module 07: a Postgres advisory lock for a singleton
  orchestrator is the smallest correct tool — don't build anything fancier, and don't
  hand-roll consensus.

</details>

## Next

You've reached the end of **track 10 — distributed systems patterns**. Look back at
what the capstone forced together: an idempotency key at the door, a saga coordinating
independent local transactions with compensations, an event log as the source of
truth, CQRS projections for fast reads, a conditional write to prevent oversell, and
crash-resumable saga state — every one of them a specific answer to a failure that
distributed systems make routine. The meta-skill you should carry out of this track is
not any single pattern but the *judgment*: recognizing which failure a situation
exposes, reaching for the smallest pattern that closes it, and knowing the cost of each
(the inconsistent window a saga accepts, the complexity CQRS and event sourcing add,
the coordination you should buy rather than build). That judgment — matching the
pattern to the pressure, and resisting the reflex to over-engineer — is what separates
engineers who *know* these patterns from those who can *wield* them.

From here, revisit the [track index](../README.md) to review any module, and carry
these patterns into the systems you design next — you'll now recognize the saga hiding
in every multi-step workflow, the idempotency key missing from every retry, and the
consensus problem lurking behind every "just have one of them do it."
