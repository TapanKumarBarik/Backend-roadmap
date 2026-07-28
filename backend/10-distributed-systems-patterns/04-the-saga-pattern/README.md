# Module 04: The Saga Pattern

## Why this matters

The previous module left you with a verdict: two-phase commit gives you real
cross-system atomicity, and you almost never want it, because it re-couples the
availability of services you deliberately split apart and freezes them all behind a
fragile coordinator. But the underlying problem didn't go away. You still have a
checkout that must charge a card, decrement inventory, and create a shipment — three
operations in three services with three databases — and you still can't let the
charge succeed while the inventory decrement silently fails. If 2PC is off the
table, *what actually holds this together?*

The **saga pattern** is the answer the whole industry converged on. Instead of one
atomic commit across all three systems, you run a *sequence of local transactions* —
each one committing independently and durably in its own database — and you make the
whole sequence *eventually* consistent by attaching, to every step, a
**compensating transaction** that semantically undoes it. If step 3 fails, you run
the compensations for steps 2 and 1 in reverse, and the system converges back to a
consistent state. You give up the instant, all-or-nothing atomicity of a single
transaction; in exchange you get loose coupling, independent availability, no
blocking coordinator, and a design that scales. This is not a niche technique — it
is *the* default way multi-step business transactions are built across services, and
almost every "workflow," "order pipeline," or "onboarding flow" you'll meet in a
service-oriented system is a saga whether or not anyone called it that. This module
is where the reliability primitives from the first four modules — consistency
choices (00), idempotency (01), locking (02), and the 2PC trade-off (03) — combine
into a pattern you'll actually ship.

## Concepts

### What a saga is: a sequence of local transactions plus compensations

A **saga** is a long-running transaction decomposed into a series of smaller,
*local* transactions T₁, T₂, … Tₙ, each of which commits independently in a single
service's database. Because each local transaction commits on its own, there is no
global lock and no coordinator holding everyone hostage — but there is also no
global rollback. A database can `ROLLBACK` an uncommitted transaction; it cannot
un-commit T₁ once T₁ is durable. So a saga replaces *rollback* with
**compensation**: for each forward transaction Tᵢ you define a compensating
transaction Cᵢ that *semantically* undoes its effect. If the saga gets partway and a
step fails, you execute the compensations for the already-completed steps, in
reverse order, to walk the system back to consistency.

The word *semantically* is doing a lot of work. Cᵢ does not restore the exact prior
bytes — it issues a *new* business action that negates the old one. The compensation
for "charge the card" is not "pretend the charge never happened"; it's "issue a
refund." The compensation for "reserve inventory" is "release the reservation." The
compensation for "send the shipping label" might be "cancel the label" — or, if the
package already went out, there *is* no compensation and you must design the saga so
that irreversible steps come last. This is the central mental shift from 2PC: a saga
does not promise the intermediate states never happened; it promises the system
*converges to a consistent end state*, forward (all steps done) or backward (all
done steps compensated).

```
  Forward:   T1 charge ──► T2 reserve ──► T3 confirm ──► CONFIRMED
             card         inventory      order          (all committed)
                              │
                              │ T3 fails (or T2 fails, etc.)
                              ▼
  Backward:  C1 refund ◄── C2 release ◄──┘   compensations run in REVERSE,
             card         inventory          only for steps that completed
                 │
                 ▼
             CANCELLED  (consistent end state — no lost money, no dangling hold)
```

### The window of inconsistency, and why it's usually fine

A saga is, by construction, **not atomic**. Between T₁ committing and Tₙ committing
(or between a failure and its compensations completing), the system is in a
partially-updated state that a strict cross-system transaction would never expose:
the payment is captured but the order isn't confirmed yet; the inventory is reserved
but the shipment doesn't exist yet. This is precisely the "brief window of
inconsistency" from module 03 — the thing 2PC exists to prevent and that you are now
*choosing* to accept.

The judgment from module 00 is exactly what tells you whether that's acceptable, and
it almost always is, because you *model the window explicitly* rather than pretending
it doesn't exist. The order sits in a `pending` state — visible, well-defined, and
self-correcting — until the saga completes and flips it to `confirmed`, or a
compensation flips it to `cancelled`. The user sees "your order is being processed,"
not a half-broken screen. The business tolerates a few seconds where payment is
captured but the shipment isn't yet booked, because the saga *will* converge and the
states in between are named and handled. The senior instinct: never let an
intermediate state be an *accident*; make it a first-class, queryable status that
your UI and your operators understand.

### Choreography: services react to events, no central brain

There are two ways to coordinate a saga, and choosing between them is the main design
decision. The first is **choreography**: there is no central coordinator. Each
service does its local transaction and then *publishes an event*; other services
*subscribe* to those events and react by doing their own local transaction and
publishing the next event. The saga advances as a chain reaction of events, and each
service knows only "when I see event X, I do my work and emit event Y."

Concretely, for an order saga: the Order service creates a `pending` order and emits
`OrderCreated`; the Payment service, subscribed to `OrderCreated`, charges the card
and emits `PaymentCaptured` (or `PaymentFailed`); the Inventory service, subscribed
to `PaymentCaptured`, reserves stock and emits `InventoryReserved` (or
`InventoryOutOfStock`); the Order service, subscribed to `InventoryReserved`, flips
the order to `confirmed`. Compensation is *also* event-driven: `InventoryOutOfStock`
is consumed by the Payment service, which refunds and emits `PaymentRefunded`, which
the Order service consumes to mark the order `cancelled`.

The appeal: services are maximally decoupled — no component knows the whole flow, you
add a participant by subscribing it to the right event, and there's no central
bottleneck. The cost: the business process is *implicit*, smeared across many
services' subscriptions, so no single place tells you "here is what a checkout does."
That makes the flow hard to see, hard to change, and prone to *cyclic dependencies*
between services. Choreography shines for **simple sagas with few steps**; it becomes
a maintenance nightmare as steps and branches multiply.

### Orchestration: a coordinator tells each service what to do

The second style is **orchestration**: a single component — the **saga orchestrator**
(or "saga coordinator," or in workflow engines a "process manager") — owns the flow.
It knows the whole sequence and issues *commands* to each service in turn: "Payment,
charge this card"; on success, "Inventory, reserve this stock"; on failure, it drives
the compensations: "Payment, refund this charge." Each service just executes the
command it's told and reports back; only the orchestrator knows the overall plan and
the current step.

Do not confuse this with the 2PC coordinator. The 2PC coordinator holds *locks* open
across all participants and blocks them until a global decision — the orchestrator
holds *no locks*; each service commits its local transaction immediately and the
orchestrator merely remembers "where are we, and what's next." An orchestrator crash
doesn't freeze anyone's data; it just pauses the workflow, which resumes from its
persisted state when the orchestrator recovers.

The appeal: the entire business process lives in *one place*, explicit and readable —
you can see, test, and change the flow without archaeology across ten services; the
compensation logic is centralized; and there are no hidden cyclic event
dependencies. The cost: the orchestrator is a component you must build and operate
(there's a risk of it becoming a bloated "god service" with all the business logic if
you're not disciplined about keeping the *work* in the services and only the
*sequencing* in the orchestrator). **Rule of thumb:** reach for choreography when the
saga is short and simple and the services are naturally event-driven; reach for
orchestration when the flow has several steps, branches, or compensations, or when
you need to *see* and evolve the process — which, past a trivial size, is most of the
time. Production systems increasingly use a workflow engine (Temporal, AWS Step
Functions, Camunda) that *is* an orchestrator with durable state built in.

### Compensation is hard: design for it deliberately

Compensating transactions look simple in a diagram and are the source of most
real-world saga bugs. Four disciplines make them correct:

- **Order irreversible steps last.** Some actions can't be compensated: an email is
  sent, a package physically ships, a third-party API has no "undo." Structure the
  saga so these come as late as possible — ideally as the final step, after every
  reversible step has already succeeded — so you rarely need to unwind past them.
  When you *must* place an irreversible step early, wrap it in a reservation you *can*
  release (reserve inventory now, actually decrement on confirm) so the early action
  is itself reversible.
- **Compensations must be idempotent (module 01).** Sagas run on top of at-least-once
  messaging and retrying orchestrators, so *every* step and *every* compensation will
  sometimes run twice. "Refund the charge" must refund once even if invoked three
  times — key it on the charge id and dedupe. This is why module 01 came first: a
  saga without idempotent steps double-charges and double-refunds under the exact
  retries it depends on.
- **Compensations can fail too — and must be retried, not abandoned.** A refund can
  itself time out. A compensation that fails cannot simply give up (that leaves money
  captured for a cancelled order); it must be retried with backoff until it succeeds,
  and if it truly can't, escalated to a human / a dead-letter queue. Sagas are
  "**forward recovery or backward recovery, but always to a consistent state**" — you
  don't get to stop halfway.
- **Beware semantic gaps the compensation can't close.** Between reserving a seat and
  releasing it, someone saw "sold out." Between charging and refunding, the customer
  saw a charge on their statement. Compensation restores the *system's* invariants,
  not the *observers'* experience. Where that gap matters (a visible charge), prefer a
  design that avoids the forward action until you're sure — e.g. *authorize* the card
  (a hold) and only *capture* on full success, so a failure *voids* the hold and the
  customer never sees a real charge.

## Command reference

| Concept | Mechanism | Notes |
|---|---|---|
| Saga | sequence of local transactions T₁…Tₙ | each commits independently; no global lock |
| Compensation Cᵢ | a *new* business action that undoes Tᵢ | semantic undo (refund), not byte-level rollback |
| Choreography | services react to events, publish next event | decoupled; flow is implicit; good for simple sagas |
| Orchestration | central orchestrator issues commands + drives compensation | flow explicit in one place; good for complex sagas |
| Saga log / state | persisted `saga_state` row (step, status) | lets the orchestrator resume after a crash |
| Reservation pattern | reserve now, confirm/release later | turns an irreversible step into a reversible one |
| Idempotency key per step | dedupe on `(saga_id, step)` | every step + compensation runs at-least-once |
| Transactional outbox | commit state change + event in one local txn | event isn't lost if the process dies after commit |

A minimal **orchestrator** for the order/payment/inventory saga. The orchestrator
persists its position so a crash resumes rather than restarts, drives forward on
success and compensations on failure, and treats every call as idempotent:

```python
from enum import Enum
from sqlalchemy import create_engine, text

db = create_engine("postgresql+psycopg://app@orchestrator-db:5432/sagas")

# CREATE TABLE saga_state (
#   saga_id     TEXT PRIMARY KEY,
#   order_id    TEXT NOT NULL,
#   step        TEXT NOT NULL,     -- current step / status
#   charge_id   TEXT,              -- filled once payment succeeds
#   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
# );

class Step(str, Enum):
    STARTED            = "started"
    PAYMENT_DONE       = "payment_done"
    INVENTORY_DONE     = "inventory_done"
    CONFIRMED          = "confirmed"          # forward success (terminal)
    COMPENSATING       = "compensating"
    CANCELLED          = "cancelled"          # backward success (terminal)

def _set_step(saga_id: str, step: Step, **cols) -> None:
    sets = ", ".join(["step = :step"] + [f"{k} = :{k}" for k in cols])
    with db.begin() as c:
        c.execute(text(f"UPDATE saga_state SET {sets} WHERE saga_id = :sid"),
                  {"sid": saga_id, "step": step.value, **cols})

def run_order_saga(saga_id: str, order_id: str, card, items) -> str:
    """Drive the saga forward; on any failure, compensate backward.
    Every service call MUST be idempotent, keyed on saga_id, because this
    function can be retried from the top after an orchestrator crash."""
    with db.begin() as c:
        c.execute(text("INSERT INTO saga_state (saga_id, order_id, step) "
                       "VALUES (:sid, :oid, :s) ON CONFLICT (saga_id) DO NOTHING"),
                  {"sid": saga_id, "oid": order_id, "s": Step.STARTED.value})
    try:
        # T1: capture payment (idempotency key = saga_id -> provider dedupes retries)
        charge_id = payment_service.charge(idem_key=saga_id, card=card, order=order_id)
        _set_step(saga_id, Step.PAYMENT_DONE, charge_id=charge_id)

        # T2: reserve inventory (idempotent on saga_id)
        inventory_service.reserve(idem_key=saga_id, order=order_id, items=items)
        _set_step(saga_id, Step.INVENTORY_DONE)

        # T3 (last, hardest to undo): confirm the order
        order_service.confirm(order_id)
        _set_step(saga_id, Step.CONFIRMED)
        return "confirmed"
    except Exception as exc:
        _compensate(saga_id, order_id)
        return f"cancelled: {exc}"

def _compensate(saga_id: str, order_id: str) -> None:
    """Run compensations in REVERSE order for whatever forward steps completed.
    Each compensation is idempotent and retried until it succeeds."""
    _set_step(saga_id, Step.COMPENSATING)
    with db.begin() as c:
        st = c.execute(text("SELECT step, charge_id FROM saga_state "
                            "WHERE saga_id = :sid"), {"sid": saga_id}).one()
    # Undo inventory only if it was reserved.
    if st.step in (Step.INVENTORY_DONE.value,):
        inventory_service.release(idem_key=saga_id, order=order_id)
    # Undo payment only if it was captured.
    if st.charge_id:
        payment_service.refund(idem_key=saga_id, charge_id=st.charge_id)
    order_service.cancel(order_id)
    _set_step(saga_id, Step.CANCELLED)
```

The same first step done as **choreography** — the Payment service reacts to an
event, does its local transaction, and publishes the next event (with a transactional
outbox so the event can't be lost even if the process dies right after committing):

```python
# Payment service: consumes OrderCreated, emits PaymentCaptured / PaymentFailed.
def on_order_created(event):
    saga_id, order_id = event["saga_id"], event["order_id"]
    try:
        with db.begin() as c:                       # one local transaction:
            # Idempotent claim so a redelivered OrderCreated doesn't double-charge.
            claimed = c.execute(
                text("INSERT INTO processed (saga_id) VALUES (:s) "
                     "ON CONFLICT DO NOTHING RETURNING saga_id"),
                {"s": saga_id}).first()
            if claimed is None:
                return                               # already handled this event
            charge_id = capture_card(order_id)       # the local effect
            # Outbox row commits in the SAME txn as the effect -> never lost.
            c.execute(text("INSERT INTO outbox (topic, payload) VALUES "
                           "('PaymentCaptured', :p)"),
                      {"p": json({"saga_id": saga_id, "order_id": order_id,
                                  "charge_id": charge_id})})
    except PaymentDeclined:
        with db.begin() as c:
            c.execute(text("INSERT INTO outbox (topic, payload) VALUES "
                           "('PaymentFailed', :p)"),
                      {"p": json({"saga_id": saga_id, "order_id": order_id})})
    # A separate relay process reads `outbox` and publishes to the broker,
    # at-least-once; downstream consumers are idempotent (module 01).
```

## Hands-on exercises

You'll simulate three services. The lightest setup is one Postgres with three
schemas (`orders`, `payments`, `inventory`) standing in for three databases, plus
Redis or a simple in-process queue for events. `docker run -d --name pg -p
5432:5432 -e POSTGRES_PASSWORD=pg postgres:16`; `pip install fastapi uvicorn
"sqlalchemy>=2" psycopg[binary] redis`. Create per-service tables: `orders(id,
status)`, `payments(charge_id, order_id, amount, status)`, `inventory(sku, reserved,
order_id)`, plus `saga_state` from the command reference and a `processed(saga_id)`
dedupe table.

### 1. Build the happy-path orchestrated saga

Implement `run_order_saga` with three stubbed services (`payment_service.charge`
inserts a `payments` row and returns a `charge_id`; `inventory_service.reserve`
inserts an `inventory` reservation; `order_service.confirm` sets the order to
`confirmed`). Run it end to end.

Expected: the order ends `confirmed`, a payment row exists, inventory is reserved,
and `saga_state.step` walks `started → payment_done → inventory_done → confirmed`.
You've run a multi-service transaction with no 2PC and no global lock — each step
committed independently.

### 2. Force a late failure and watch compensation run backward

Make `inventory_service.reserve` raise (simulate out-of-stock). Run the saga.

Expected: the saga catches the failure and `_compensate` runs — it refunds the
already-captured payment and cancels the order, so the end state is `cancelled` with
the payment `refunded` and no dangling reservation. Confirm the compensations ran in
*reverse* order and only for the steps that had actually completed (no attempt to
release inventory that was never reserved). This is backward recovery to a consistent
state.

### 3. Observe the window of inconsistency

Add a `sleep(3)` between `PAYMENT_DONE` and the inventory step, and while it sleeps,
query all three services' state and `saga_state`.

Expected: you can *see* the intermediate state — payment captured, order still
`pending`, inventory not yet reserved. This is the window 2PC would have prevented.
Note that the state is *named* (`payment_done`) and queryable, not a corrupt
half-state — that's what makes the window acceptable. Write one sentence on what a
user should see in your UI during this window.

### 4. Make every step idempotent and prove double-execution is safe

Give `payment_service.charge` an idempotency key (`saga_id`) and a `processed`-style
dedupe so a second call with the same key returns the *first* charge_id instead of
charging again. Call `run_order_saga` twice with the same `saga_id` (simulating an
orchestrator crash-and-retry).

Expected: exactly one payment row, one reservation, one confirmed order — the second
run finds every step already done and is a no-op that converges to the same state.
Then remove the idempotency key from `charge` and rerun: two payment rows. This is
why "sagas require idempotent steps" is not optional — the orchestrator *will* retry.

### 5. Crash the orchestrator mid-saga and resume from persisted state

After `PAYMENT_DONE` is written but before inventory, `raise SystemExit`. Restart and
call the saga again with the same `saga_id`. Have `run_order_saga` read `saga_state`
and skip steps already completed.

Expected: the resumed run does *not* re-charge (payment already done, and it's
idempotent anyway), reserves inventory, and confirms. The persisted `saga_state` is
what lets an orchestrator recover instead of restarting from zero or leaving a
half-finished saga stranded. Contrast with 2PC: here the crash paused a workflow; it
did *not* freeze anyone's rows behind held locks.

### 6. Build the same first two steps as choreography

Reimplement steps 1–2 as event-driven: `OrderCreated` → Payment consumes, emits
`PaymentCaptured` → Inventory consumes, emits `InventoryReserved` → Order confirms.
Use the transactional-outbox pattern from the command reference for at least one
service.

Expected: the same end state, but now *no component knows the whole flow* — each only
knows its own event-in/event-out. Then answer in writing: where does the "what does
checkout do?" knowledge live now, and how would you add a `Fraud-check` step between
payment and inventory? (In choreography you re-wire subscriptions; note how much
harder the flow is to see than in the orchestrator.)

### 7. Design a compensation for an irreversible step

Add a step that *sends a confirmation email* (irreversible — you can't un-send it).
Place it correctly in the saga and justify the placement. Then handle the case where
inventory fails *after* a hypothetical early email.

Expected: the email must be the *last* step (after confirm), so a failure never needs
to unwind past it; if forced earlier, its "compensation" is a follow-up "your order
was cancelled" email, not a true undo. Articulate the rule: irreversible steps go
last, and where they can't, their compensation is a *new* corrective action, not a
rollback.

### 8. Reservation pattern to make an early irreversible step reversible

Change inventory from "decrement stock" (hard to undo — someone may have bought the
freed unit) to "reserve stock" now and "commit the decrement" only on final confirm,
with "release the reservation" as the compensation.

Expected: the inventory step is now cleanly reversible (release the hold) right up
until final confirmation, so compensation is trivial and can't oversell. Note this is
the same idea as authorize-then-capture for payments: turn an irreversible action
into a reservation you can release.

### 9. Diagnose and fix: the saga that loses money on retries

Ops reports that during a broker incident, some cancelled orders left the customer
*charged* while others were *refunded twice*. The saga is choreographed: Payment
consumes `OrderCreated` and charges; on `InventoryOutOfStock` it refunds. The refund
handler does `provider.refund(charge_id)` with no idempotency key, and the broker
redelivered events during the incident. Explain both failure directions and give the
fix.

<details>
<summary>Answer</summary>

Root cause: **non-idempotent saga steps on top of at-least-once delivery** (modules
01 and 06), in both directions. The "double refund" is the refund handler running
twice for one `InventoryOutOfStock` (redelivered by the broker) with no idempotency
key, so `provider.refund(charge_id)` executes twice and the customer is credited
twice — the business loses money. The "charged but not refunded" is the mirror: a
redelivered or reordered event caused the *charge* to run again (or the refund event
was dropped/consumed before the charge event's effect committed), leaving a capture
with no matching refund. Choreography makes this worse because the ordering and
delivery guarantees of the events *are* the correctness of the saga, and nothing
central is tracking "did this saga's payment get exactly one net effect?"

Fix: make every forward step and every compensation **idempotent**, keyed on the
saga (module 01). Charge with `idem_key = saga_id` so the provider dedupes repeat
charges; refund with `idem_key = f"refund-{saga_id}"` (or the charge id) so a
redelivered `InventoryOutOfStock` refunds exactly once. Record each step's completion
in a `processed(saga_id, step)` table committed in the *same* local transaction as
the effect (transactional outbox for the emitted event) so a crash can't create a
"did the effect but lost the event" gap. Because the operation corrupts *money*, also
consider authorize-then-capture so a failed saga *voids a hold* instead of needing a
refund at all. If this saga's branching and compensation are this error-prone,
that's also a signal to move from choreography to an **orchestrator** (or a workflow
engine) so one place owns "this saga's payment nets to exactly one charge or one
refund," which is far easier to reason about and to make idempotent.

</details>

## Independent challenge

No code given. Recall **03-distributed-transactions-and-two-phase-commit** — you
rejected 2PC for a checkout there; now design the saga that replaces it. You're
building "book a trip": the operation must reserve a **flight seat**, reserve a
**hotel room**, and charge the customer **once for the total**, across three
independent services with three databases. Any of the three can fail or be
temporarily down. Write a design that specifies: (1) choreography or orchestration,
and defend the choice for *this* flow's complexity; (2) the ordered list of forward
steps and each step's compensating transaction, explicitly placing the irreversible
payment where a failure rarely has to unwind past it (hint: authorize vs capture);
(3) how you keep every step and compensation idempotent given at-least-once events;
(4) what state the customer sees during the inconsistent window and what they see if
the hotel reservation fails after the flight is already held; and (5) one sentence on
why this is better than the 2PC you'd have written in module 03.

<details>
<summary>Hint</summary>

Three coordinated steps with real compensations and a money step is past the
comfortable size for choreography — reach for an **orchestrator** so the whole
"book a trip" flow lives in one readable place and the compensation ordering is
explicit; that's the honest answer to (1). For (2)+(2b): reserve flight → reserve
hotel → *capture* payment, with compensations "release flight hold" and "release
hotel hold"; put the payment **last** and make it an authorize-then-capture so an
early failure merely *voids the authorization* (customer never sees a real charge)
and only a fully-successful trip is captured — that's how you keep the irreversible
step from ever needing a refund. For (3), key every reserve/release/capture on the
`saga_id` and dedupe on `(saga_id, step)` in the same local transaction as the effect
(outbox for events), because the orchestrator and the broker both retry. For (4),
the trip sits in a named `pending`/`holding` status the UI shows as "confirming your
booking"; if the hotel fails after the flight hold, the orchestrator releases the
flight hold and voids the authorization, and the customer sees "we couldn't complete
your booking, you were not charged." For (5): each service commits locally in
milliseconds and stays independently available — no coordinator holds locks across
all three, so a slow hotel service can't freeze the flight and payment rows the way
2PC would.

</details>

## Common mistakes & troubleshooting

- **Treating a compensation as a byte-level rollback.** A saga cannot un-commit a
  local transaction; a compensation is a *new* business action (refund, release,
  cancel) that semantically negates the old one. If you find yourself wanting to
  "restore the previous row exactly," you're thinking in 2PC terms — redesign around
  a forward corrective action.
- **Non-idempotent steps or compensations.** Sagas run on at-least-once events and
  retrying orchestrators, so every step *will* sometimes run twice. A step or
  compensation without an idempotency key double-charges or double-refunds under the
  exact retries the pattern depends on. Key every step on `(saga_id, step)`.
- **Putting an irreversible step early.** If an un-undoable action (send email, ship
  package, capture payment) runs before steps that can still fail, a later failure
  can't unwind past it. Order irreversible steps last, or wrap them in a reservation
  you can release (authorize-then-capture, reserve-then-commit).
- **Letting a compensation fail silently.** Compensations can time out too. A refund
  that fails and is abandoned leaves money captured for a cancelled order. Retry
  compensations with backoff until they succeed, and dead-letter/escalate the ones
  that truly can't — a saga must always reach a consistent end state, forward or
  backward.
- **Unnamed intermediate states.** If the "half-done" state is an accident rather
  than a first-class `pending`/`compensating` status, your UI and operators can't
  tell a mid-saga order from a corrupt one. Model every intermediate state
  explicitly and make it queryable.
- **Reaching for choreography on a complex flow.** Choreography's implicit,
  event-smeared flow is fine for two or three simple steps but becomes unreadable and
  cycle-prone as branches and compensations grow. Past that size, use an orchestrator
  (or a workflow engine) so the process lives in one place.
- **Building a bloated orchestrator.** The orchestrator should own *sequencing and
  compensation*, not the business work — keep the actual charging/reserving in the
  services. An orchestrator that accumulates all the domain logic becomes the
  distributed monolith you were trying to avoid.
- **Confusing the orchestrator with a 2PC coordinator.** The orchestrator holds no
  locks and blocks no one; each service commits locally and immediately, and an
  orchestrator crash pauses a workflow rather than freezing rows. If your
  "orchestrator" holds resources open across services, you've reinvented 2PC.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is a saga, and how does it provide "all-or-nothing" *without* the atomic
   cross-system commit that 2PC uses?
2. Why is a compensating transaction not the same as a rollback? Give a concrete
   compensation for "charge the customer's card."
3. Contrast choreography and orchestration. Give one flow where each is the better
   choice and say why.
4. A saga has an unavoidable window of inconsistency. Why is that usually acceptable,
   and what must you do to *make* it acceptable?
5. Why must every saga step and every compensation be idempotent? What breaks if
   they aren't?
6. Why should irreversible steps be ordered last, and what technique makes an
   early "irreversible" step reversible?

<details>
<summary>Answers</summary>

1. A saga is a long-running transaction split into a sequence of *local*
   transactions, each committing independently in one service's database, with a
   **compensating transaction** attached to each step. It doesn't get atomicity from
   a global commit; it gets *eventual* consistency by driving the sequence forward to
   completion, or — if a step fails — running the completed steps' compensations in
   reverse to converge back to a consistent state. There's no global lock and no
   blocking coordinator; the price is a temporary partially-updated window.
2. A rollback un-commits an *uncommitted* transaction and restores the exact prior
   state; a saga's forward steps are already committed and durable, so they can't be
   un-committed. A compensation is a *new* business action that semantically negates
   the old one — the compensation for "charge the card" is "issue a refund" (or,
   better, "void the authorization" if you only authorized), not a pretense that the
   charge never happened.
3. Choreography: no central coordinator — each service reacts to events and publishes
   the next, maximally decoupled but with the flow implicit and smeared across
   services; best for short, simple sagas (e.g. two-step "user signed up → send
   welcome email"). Orchestration: a central orchestrator issues commands and drives
   compensation, so the whole flow is explicit in one place; best for multi-step,
   branching flows with compensations (e.g. order → payment → inventory → shipping),
   where you need to see and evolve the process.
4. It's acceptable because a few seconds of well-defined partial state usually causes
   no real harm, and module 00's per-operation judgment says so. To *make* it
   acceptable you model the intermediate states explicitly as first-class statuses
   (`pending`, `compensating`) that the UI and operators understand, ensure the saga
   converges (forward or backward), and — where a visible effect like a card charge
   would be harmful — avoid the forward action until you're sure (authorize, don't
   capture).
5. Because sagas run on at-least-once messaging and retrying orchestrators, so every
   step and compensation *will* sometimes execute more than once. Without idempotency
   (keyed on `(saga_id, step)`), a retried "charge" double-charges and a redelivered
   "refund" double-refunds — the system loses money under the exact retries the
   pattern relies on. Idempotency makes a re-executed step a no-op that converges to
   the same state.
6. Because a failure after an irreversible step can't unwind past it, so putting
   un-undoable actions (ship, send email, capture) last minimizes the chance you ever
   need to. The technique that makes an early irreversible step reversible is a
   **reservation**: authorize (hold) the card instead of capturing, reserve inventory
   instead of decrementing — then the early action can be *released* on failure and
   only *committed* on full success.

</details>

## Cumulative review

Closed book — cover the earlier modules and answer from memory. This ties modules
00–04 into one chain, because they are one chain: each pattern exists to handle a
failure the previous one exposed.

1. **(00 → 04)** A saga leaves the system partially updated for a window. Name the
   consistency model that window represents, explain why CAP/PACELC says you're not
   getting something for nothing by accepting it, and give the per-operation
   reasoning that decides whether a *particular* saga's window is tolerable.
2. **(01 → 04)** Explain precisely why a saga is broken without idempotent steps.
   Reference at-least-once delivery and describe the exact mechanism (key + dedupe
   store) you'd use to make a saga's "charge payment" step safe to retry.
3. **(02)** A team guards a saga's "reserve the last unit of inventory" step with a
   single-Redis distributed lock and calls it correct. Using the efficiency-vs-
   correctness distinction, say what's still wrong and what actually makes the
   reservation correct under a process pause.
4. **(03 → 04)** In one paragraph, tell the story from 2PC to sagas: what problem 2PC
   solves, the specific failure mode that makes it unsuitable for a high-throughput
   checkout, and how a saga sidesteps that failure mode (and what it gives up to do
   so).
5. **(00–04 synthesis)** You're handed "process a refund request": validate the
   order, reverse the payment, restock the item, and email the customer. Sketch this
   as a saga — choreography or orchestration and why, the forward steps and their
   compensations, where the idempotency keys live, which step is irreversible and
   where it goes, and what consistency the customer experiences throughout.

<details>
<summary>Answers</summary>

1. The window is **eventual consistency** (module 00): the system converges to a
   consistent state but is temporarily divergent in between. CAP/PACELC says this
   isn't free — you bought availability and low coupling by *giving up* strong
   consistency during the window; the trade is real, not a free lunch. Whether a
   given saga's window is tolerable is a per-operation call (module 00): what does a
   user or the business actually experience during it? "Order shows pending for two
   seconds" is fine; "money can leave one account and appear in neither for two
   seconds" may not be — decide per feature, explicitly.
2. Sagas ride on at-least-once messaging and retrying orchestrators, so every step
   *will* occasionally run twice; a non-idempotent "charge" double-charges under
   those retries — the pattern's own reliability mechanism corrupts data. The fix
   (module 01): the client/orchestrator sends a stable **idempotency key**
   (`saga_id`) with the charge; the payment provider (or a local `processed` table
   with a unique constraint, claimed in the same transaction as the effect) records
   the key and returns the first result on any repeat, so N invocations produce one
   charge = effectively-once.
3. A single-Redis lock is an *efficiency* lock: under a process pause its TTL can
   expire while the holder still thinks it holds it, letting two reservers both
   "reserve the last unit" — an oversell, which *corrupts* (module 02). Reserving
   the last unit is a **correctness** operation, so the lock alone is insufficient;
   what makes it correct is enforcement at the resource — an atomic conditional write
   (`UPDATE ... SET reserved = true WHERE sku = :s AND reserved = false` returning
   row count, or a fencing token the inventory row checks), so only one reservation
   can win regardless of lock state.
4. 2PC solves cross-system atomicity: a coordinator makes N independent databases all
   commit or all abort via prepare-then-commit, so no subset commits while the rest
   roll back. It's unsuitable for a high-throughput checkout because participants
   that voted YES hold their locks across the whole multi-round-trip protocol and,
   worse, a coordinator crash between the phases leaves them blocked with locks held
   indefinitely — throughput collapses and a single failure freezes hot rows. A saga
   sidesteps this by making each step a *local* transaction that commits immediately
   (no cross-service locks, no blocking coordinator) and undoing failed sagas with
   compensations; it gives up instant atomicity, accepting a brief, explicitly-modeled
   inconsistent window in return.
5. Orchestration is the better fit — four steps with compensations and an
   irreversible email is past choreography's comfortable size, and one readable place
   for the flow helps. Forward steps and compensations: validate order (no
   compensation — pure read/guard); reverse payment / issue refund (compensation:
   re-charge is not sane, so this step is designed to be the point of no *business*
   return — make it idempotent and retried, not compensated); restock the item
   (compensation: un-restock / re-decrement); email the customer (irreversible — goes
   **last**, so a failure never has to unwind past it; if it must be earlier, its
   "compensation" is a follow-up correcting email). Idempotency keys live on
   `(refund_saga_id, step)` for the refund and restock so redeliveries don't
   double-refund or double-restock. Throughout, the customer sees a named `refund
   pending` status that converges to `refunded` — eventual consistency with an
   explicit, self-correcting window, exactly the module-00 trade applied on purpose.

</details>

## Further reading & sources

- [Saga pattern (microservices.io)](https://microservices.io/patterns/data/saga.html) - the reference definition of choreography vs orchestration sagas and compensating transactions.
- [Sagas (Garcia-Molina & Salem, 1987)](https://www.cs.princeton.edu/courses/archive/fall17/cos518/papers/sagas.pdf) - the original paper that introduced sagas and semantic compensation.
- [Saga distributed transactions pattern (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga) - a practical guide to orchestrated sagas, state, and compensation ordering.
- [Compensating Transaction pattern (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction) - focused guidance on the "compensations are new business actions, and can fail too" discipline stressed here.
- [Implementing the saga pattern with AWS Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/sample-saga-transaction.html) - a worked orchestrated saga on a durable workflow engine, the direction this module recommends past trivial size.

## Next

[05-cqrs](../05-cqrs/README.md) — sagas coordinate *writes* across services, and a
recurring theme has been that reads and writes want different things: the write path
needs strong consistency and careful coordination, while many reads happily tolerate
staleness (module 00) and just want to be fast. The next module makes that split
architectural. **CQRS** (Command Query Responsibility Segregation) separates the
model you write through from the model(s) you read from — letting each be optimized,
scaled, and made consistent independently — and, crucially, examines when that
separation earns its considerable extra complexity and when it's an overkill you'll
regret.
