# Module 08: Durable Workflow Orchestration

## Why this matters

Module 04 built a real, correct saga orchestrator by hand: a `saga_state`
table you write to after every step, a `_compensate` function you wrote
yourself, idempotency keys you designed and applied one by one, and — in
exercise 5 — a manual "read `saga_state`, skip completed steps" recovery
path for when the orchestrator process itself crashes mid-saga. It works,
and understanding it by hand is exactly what makes the next tool make
sense: a **durable execution engine** (Temporal is this module's example;
AWS Step Functions and Camunda solve the same problem for different
platforms) gives you everything that hand-rolled machinery did —
crash-resume, automatic retries, a durable record of every step — as a
property of the *platform*, not code you wrote and must keep correct
yourself. This module shows you exactly what that trade buys you, using
the same order-charge-reserve-confirm flow from module 04, so you can
compare the two approaches directly rather than taking the promise on
faith.

## Concepts

### The problem restated: your hand-rolled orchestrator already does this — manually

Look back at module 04's `run_order_saga`: every step writes to
`saga_state` before moving on, specifically so that a crash can be
recovered from by re-reading that table and skipping finished steps. That
pattern — persist progress, replay to resume — is exactly what a durable
execution engine automates. The difference isn't a new concept; it's who
implements the mechanism and how much of it you have to get right
yourself, by hand, in every workflow you write.

### Event history: how the engine remembers, without you writing to a table

A durable execution engine like Temporal doesn't ask you to write
`saga_state` rows. Instead, the *engine itself* durably records an
**event history** for every workflow run — "activity X started," "activity
X completed with result Y," "timer fired," "signal received" — every time
your workflow code does something meaningful. When a worker process
restarts (crashes, redeploys, whatever), a fresh worker picking up that
workflow doesn't start over: it **replays** the event history from the
beginning, and your workflow code re-executes deterministically — but
every already-recorded activity call returns its *already-recorded
result* instantly instead of actually re-running the side effect. Only
the point *past* what's in history actually does new work.

```
  Hand-rolled (module 04):              Durable execution engine:
  YOU write to saga_state               ENGINE writes event history
  after each step                       automatically, transparently

  YOU read saga_state on restart        ENGINE replays history on restart
  and skip completed steps              — your workflow code just runs
                                         again; completed activities
                                         return cached results, don't
                                         re-execute
```

### Workflows and activities: the same split you already made in module 04

The vocabulary maps directly onto what you already built:

- A **workflow function** is your orchestration logic — the sequence of
  steps, exactly like `run_order_saga`. Rule: workflow code must be
  **deterministic**, because it gets *replayed* on every recovery. No
  direct network calls, no reading the real clock, no random numbers
  inside workflow code itself — anything with a real side effect or
  non-deterministic result belongs in an activity instead.
- An **activity function** is where actual side effects happen — calling
  the payment service, hitting a database, anything module 04 called
  "T1, T2, T3." Activities are *not* replayed — the engine records their
  result once and reuses it, which is exactly why workflow code can safely
  re-run from the top without re-charging a card.

```python
from temporalio import workflow, activity
from datetime import timedelta

@activity.defn
async def charge_card(order_id: str) -> str:
    # Real side effect — calls out, may fail, may take time.
    return f"charge-{order_id}"

@workflow.defn
class OrderSaga:
    @workflow.run
    async def run(self, order_id: str) -> str:
        # Orchestration logic ONLY — no direct side effects here.
        charge_id = await workflow.execute_activity(
            charge_card, order_id, start_to_close_timeout=timedelta(seconds=10)
        )
        return charge_id
```

### Retries are the engine's job now, not a `try`/`except` you wrote

Module 01 (idempotency) and module 04 both leaned on retries you had to
reason about and often implement yourself. A durable execution engine
retries a failed activity **automatically**, with a configurable backoff
policy, and your workflow code doesn't contain a single retry loop:

```python
from temporalio.common import RetryPolicy

result = await workflow.execute_activity(
    charge_card, order_id,
    start_to_close_timeout=timedelta(seconds=10),
    retry_policy=RetryPolicy(initial_interval=timedelta(milliseconds=100), maximum_attempts=5),
)
```

If `charge_card` raises, the engine automatically re-invokes it — with
backoff, up to `maximum_attempts` — with **no code in your workflow
handling the retry**. This is module 04's "the compensations must be
retried, not abandoned" discipline, built into the platform instead of
hand-written per step. (Idempotency still matters — module 01's lesson
doesn't disappear — because the *activity itself* might partially
succeed before failing; the engine retrying it doesn't make the
underlying side effect idempotent for you.)

### Signals: getting an external event into a running, possibly long-lived workflow

Module 04's saga ran start-to-finish in seconds. Real workflows are often
much longer-lived — "wait for a human to approve this expense report,"
which could take days. A **signal** is how outside code delivers an event
into an already-running workflow, and `workflow.wait_condition` is how the
workflow waits for it without polling:

```python
@workflow.defn
class ApprovalSaga:
    def __init__(self):
        self._approved = False

    @workflow.signal
    def approve(self):
        self._approved = True

    @workflow.run
    async def run(self, order_id: str) -> str:
        await workflow.wait_condition(lambda: self._approved)
        return f"{order_id}-approved"
```

The workflow can sit waiting for days — the engine doesn't hold a
process or a thread open the whole time; it's durably parked in event
history until a signal arrives, then resumes exactly where it left off.
This is a capability module 04's hand-rolled `saga_state` table doesn't
give you for free: a truly long-running, crash-proof "wait for something
external" step.

### What you give up: a platform dependency and a learning curve

This isn't a strictly-better replacement for everything module 04 taught
— it's a different point on the same cost curve module 04 kept coming
back to. You now depend on running (or paying for) the workflow engine
itself; your workflow code must follow the determinism rule (no direct
I/O, no `datetime.now()`, no raw randomness inside workflow functions —
mistakes here are a real, non-obvious class of bug specific to this
model); and you've added an infrastructure dependency for flows that
might have been simple enough for module 04's choreography. **Reach for
a durable execution engine when**: sagas are long-running (hours/days,
not seconds), have many steps/branches, need human-in-the-loop signals,
or you're maintaining enough hand-rolled orchestrators that the
platform's cost is cheaper than N more `saga_state` tables. **Stick with
module 04's approach when**: the saga is short, few steps, and adding a
new piece of infrastructure isn't worth it yet — the same escalation
judgment this whole track has taught from module 00 onward.

## Command reference

This module uses **Temporal**, run locally with its own dev-mode server
(no separate database or Docker Compose needed for local development).

| Concern | Temporal (Python SDK) |
|---|---|
| Start a local dev server | `temporal server start-dev` |
| Check the server is healthy | `temporal operator cluster health` |
| Define a workflow | `@workflow.defn` class with an `@workflow.run` method |
| Define an activity | `@activity.defn` async function |
| Call an activity from a workflow | `await workflow.execute_activity(fn, arg, start_to_close_timeout=...)` |
| Run a worker | `Worker(client, task_queue=..., workflows=[...], activities=[...])` |
| Start a workflow (fire and forget) | `await client.start_workflow(Fn.run, arg, id=..., task_queue=...)` |
| Start and wait for the result | `await client.execute_workflow(Fn.run, arg, id=..., task_queue=...)` |
| Send a signal to a running workflow | `await handle.signal(Fn.signal_method)` |
| Get a handle to an existing workflow | `client.get_workflow_handle(workflow_id)` |
| Web UI (history, running workflows) | `http://localhost:8233` (started automatically by `start-dev`) |

## Hands-on exercises

`pip install temporalio`. Start the local dev server once, in its own
terminal, and leave it running for all exercises:

```bash
temporal server start-dev
```

### 1. Run the order saga as a durable workflow

```python
import asyncio
from datetime import timedelta
from temporalio import workflow, activity
from temporalio.client import Client
from temporalio.worker import Worker

@activity.defn
async def charge_card(order_id: str) -> str:
    return f"charge-{order_id}"

@activity.defn
async def reserve_inventory(order_id: str) -> None:
    pass

@activity.defn
async def confirm_order(order_id: str) -> None:
    pass

@workflow.defn
class OrderSaga:
    @workflow.run
    async def run(self, order_id: str) -> str:
        charge_id = await workflow.execute_activity(
            charge_card, order_id, start_to_close_timeout=timedelta(seconds=10)
        )
        await workflow.execute_activity(
            reserve_inventory, order_id, start_to_close_timeout=timedelta(seconds=10)
        )
        await workflow.execute_activity(
            confirm_order, order_id, start_to_close_timeout=timedelta(seconds=10)
        )
        return f"confirmed:{charge_id}"

async def main():
    client = await Client.connect("localhost:7233")
    async with Worker(
        client, task_queue="orders-tq",
        workflows=[OrderSaga], activities=[charge_card, reserve_inventory, confirm_order],
    ):
        result = await client.execute_workflow(
            OrderSaga.run, "order-1", id="saga-order-1", task_queue="orders-tq"
        )
        print("RESULT:", result)

if __name__ == "__main__":
    asyncio.run(main())
```

Expected: `RESULT: confirmed:charge-order-1`. Open `http://localhost:8233`
and find this workflow run — you can see its full event history (every
activity call and result), something module 04's `saga_state` table
only gave you a single current row of, not a full audit trail.

**Gotcha to know before you hit it**: Temporal's Python SDK re-imports
your workflow-defining module inside a sandbox to guarantee determinism.
If your script calls `asyncio.run(main())` at module level with no
guard, that call re-executes during the sandboxed re-import and crashes
with `RuntimeError: asyncio.run() cannot be called from a running event
loop`. Always guard your entrypoint with
`if __name__ == "__main__":` — every example in this module already does.

### 2. Prove retries are automatic — no retry loop in your code

```python
import asyncio
from datetime import timedelta
from temporalio import workflow, activity
from temporalio.client import Client
from temporalio.worker import Worker
from temporalio.common import RetryPolicy

@activity.defn
async def flaky_charge(order_id: str) -> str:
    info = activity.info()
    if info.attempt < 3:
        raise RuntimeError("simulated transient failure")
    return f"charge-{order_id}"

@workflow.defn
class FlakySaga:
    @workflow.run
    async def run(self, order_id: str) -> str:
        return await workflow.execute_activity(
            flaky_charge, order_id,
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(initial_interval=timedelta(milliseconds=100), maximum_attempts=5),
        )

async def main():
    client = await Client.connect("localhost:7233")
    async with Worker(client, task_queue="flaky-tq", workflows=[FlakySaga], activities=[flaky_charge]):
        result = await client.execute_workflow(FlakySaga.run, "order-2", id="saga-order-2", task_queue="flaky-tq")
        print("RESULT:", result)

if __name__ == "__main__":
    asyncio.run(main())
```

Expected: the activity raises on attempts 1 and 2 (visible in the
worker's log output), succeeds on attempt 3, and the workflow still
completes with `RESULT: charge-order-2` — your workflow code contains no
`try`/`except`, no backoff, no attempt counter. Compare this to module
04's `payment_service.charge` idempotency-key discipline: idempotency
still matters here too (the retry policy will call `flaky_charge` again
on failure, so if the activity's side effect can partially succeed
before raising, it still needs to be safe to retry) — the engine
automates the *retry mechanics*, not the idempotency of your side effect.

### 3. Kill the worker mid-workflow and prove it resumes without re-running completed work

This is the exercise that actually proves the "durable" claim rather than
asserting it. Run one process that starts the workflow, a worker that
runs just long enough to complete the first step, then a **second,
independent worker** that resumes the same workflow:

```python
import asyncio, os
from datetime import timedelta
from temporalio import workflow, activity
from temporalio.client import Client
from temporalio.worker import Worker

SIDE_EFFECT_FILE = "side_effect.txt"

@activity.defn
async def step_one(order_id: str) -> str:
    with open(SIDE_EFFECT_FILE, "a") as f:
        f.write(f"step_one ran for {order_id}\n")
    return "step-one-done"

@activity.defn
async def step_two(order_id: str) -> str:
    with open(SIDE_EFFECT_FILE, "a") as f:
        f.write(f"step_two ran for {order_id}\n")
    return "step-two-done"

@workflow.defn
class CrashSaga:
    @workflow.run
    async def run(self, order_id: str) -> str:
        r1 = await workflow.execute_activity(step_one, order_id, start_to_close_timeout=timedelta(seconds=10))
        await asyncio.sleep(3)  # a window to "crash" the worker in
        r2 = await workflow.execute_activity(step_two, order_id, start_to_close_timeout=timedelta(seconds=10))
        return f"{r1}+{r2}"

async def main():
    client = await Client.connect("localhost:7233")

    await client.start_workflow(CrashSaga.run, "order-3", id="saga-order-3", task_queue="crash-tq")
    print("workflow started")

    # "Worker A": runs briefly, completes step_one, then stops (simulated crash).
    async with Worker(client, task_queue="crash-tq", workflows=[CrashSaga], activities=[step_one, step_two]):
        await asyncio.sleep(1.5)
    print("worker A stopped (simulated crash)")
    print("side effects so far:", open(SIDE_EFFECT_FILE).read())

    # "Worker B": a completely fresh worker, resuming the SAME workflow from history.
    async with Worker(client, task_queue="crash-tq", workflows=[CrashSaga], activities=[step_one, step_two]):
        handle = client.get_workflow_handle("saga-order-3")
        result = await handle.result()
        print("RESULT after resume:", result)
    print("side effects after resume:", open(SIDE_EFFECT_FILE).read())

if __name__ == "__main__":
    if os.path.exists(SIDE_EFFECT_FILE):
        os.remove(SIDE_EFFECT_FILE)
    asyncio.run(main())
```

Expected: after "worker A" stops, the side-effect file shows `step_one`
ran exactly once, and `step_two` hasn't run yet. After "worker B"
resumes and the workflow completes, the file shows `step_one` **still
only once**, plus `step_two` once — the completed `step_one` activity's
result came back from Temporal's event history instantly on replay; it
was never re-executed by the new worker, even though the new worker is a
totally separate process that never saw the first one run. This is
module 04's manual "read `saga_state`, skip finished steps" recovery,
except you didn't write any of the resume logic.

### 4. Build a signal-driven, human-in-the-loop approval step

```python
import asyncio
from temporalio import workflow
from temporalio.client import Client
from temporalio.worker import Worker

@workflow.defn
class ApprovalSaga:
    def __init__(self):
        self._approved = False

    @workflow.signal
    def approve(self):
        self._approved = True

    @workflow.run
    async def run(self, order_id: str) -> str:
        await workflow.wait_condition(lambda: self._approved)
        return f"{order_id}-approved"

async def main():
    client = await Client.connect("localhost:7233")
    async with Worker(client, task_queue="approval-tq", workflows=[ApprovalSaga], activities=[]):
        handle = await client.start_workflow(
            ApprovalSaga.run, "order-4", id="saga-order-4", task_queue="approval-tq"
        )
        await asyncio.sleep(1)          # stand-in for "a human takes their time"
        await handle.signal(ApprovalSaga.approve)
        result = await handle.result()
        print("RESULT:", result)

if __name__ == "__main__":
    asyncio.run(main())
```

Expected: `RESULT: order-4-approved`. The workflow was durably parked in
`wait_condition` the whole time — try increasing the `sleep` to 30
seconds and confirm it still works exactly the same way; a signal-waiting
workflow doesn't cost a held-open connection or thread the way a
hand-rolled "poll a status column every few seconds" approach would.

### 5. Diagnose and fix: a workflow that behaves differently after every deploy

A team's workflow function calls `datetime.now()` directly inside the
workflow to compute a discount that only applies before a cutoff time,
and reads a random number to pick between two shipping carriers. It
works in testing, but in production, some workflows that get replayed
after a worker restart mysteriously flip which carrier they chose, or
apply a discount they shouldn't have.

<details>
<summary>Solution</summary>

Root cause: the workflow function called `datetime.now()` and a random
number generator **directly inside workflow code**, which violates the
determinism rule this module introduced. On replay, the engine re-runs
the workflow function from the top to reconstruct its state — if that
function calls the real clock or real randomness again, it can get a
*different* answer on replay than it got the first time (the clock has
moved on; the random seed isn't preserved the same way), so a decision
made once during the original execution silently changes during a
later replay.

Fix: move any need for the current time or randomness into an
**activity** (which is *not* replayed — its result is recorded once and
reused) — or, in engines that provide one, use the SDK's replay-safe time
API instead of the standard library's clock directly. The general rule:
anything non-deterministic — real time, real randomness, real network
calls, real file I/O — belongs in an activity, never directly in
workflow code, precisely because workflow code is replayed and must
produce the same decisions every time it is.

</details>

### 6. Clean up

```bash
# Ctrl+C the `temporal server start-dev` terminal — an in-memory dev server,
# nothing persists once it stops.
```

## Independent challenge

No code given. Redesign module 04's independent challenge — "book a
trip" (reserve a flight, reserve a hotel, charge the customer once) — as
a durable workflow instead of a hand-rolled orchestrator. Specify: (1)
which parts become activities and which stay as pure workflow
orchestration logic, and justify each choice against the determinism
rule; (2) how you'd model "the flight reservation service is down for
maintenance for the next 10 minutes" using retry policies instead of a
hand-written retry loop; (3) how you'd add a genuinely long-lived
step — "wait up to 24 hours for the customer to confirm the itinerary
by clicking a link in an email" — using a signal, and what happens to
that wait if the worker process restarts twice during those 24 hours;
(4) one paragraph arguing, using this module's escalation judgment,
whether "book a trip" actually *justifies* a durable execution engine
over module 04's hand-rolled orchestrator, or whether it's simple enough
that the extra infrastructure isn't worth it yet.

<details>
<summary>Stuck? One hint</summary>

Reserving the flight, reserving the hotel, and charging the card are all
activities (real side effects, real network calls to other services);
the sequencing and compensation logic is the workflow function itself
(pure orchestration, replay-safe). For (2), a `RetryPolicy` with a longer
`maximum_interval`/backoff and a high `maximum_attempts` handles a
service being down for minutes without any hand-written retry code —
the workflow simply awaits the activity call as normal; the engine keeps
retrying underneath. For (3), a signal plus `workflow.wait_condition`
(or a timeout combined with it, to handle "customer never confirmed")
survives any number of worker restarts because it's durably recorded in
event history, not held in a live process's memory — this is precisely
the capability module 04's hand-rolled saga didn't have. For (4), "book
a trip" has three steps and one genuinely long wait (24 hours for
confirmation) — the long-lived signal wait is exactly the kind of
requirement that tips the scale toward a durable execution engine, since
module 04's hand-rolled approach has no good answer for "durably wait
up to a day for a human," short of building a chunk of this
infrastructure yourself.

</details>

## Common mistakes & troubleshooting

- **Calling real I/O, the real clock, or real randomness directly inside
  workflow code.** As the diagnose-and-fix exercise showed, workflow code
  is replayed to reconstruct state, and non-deterministic calls can
  return different answers on replay than they did the first time,
  silently corrupting decisions. Push anything non-deterministic into an
  activity.
- **Forgetting the `if __name__ == "__main__":` guard on an entrypoint
  script.** Temporal's Python SDK re-imports the workflow-defining module
  inside a sandbox; unguarded module-level code (like a bare
  `asyncio.run(main())`) re-executes during that re-import and crashes
  with a confusing `RuntimeError`, as exercise 1 noted.
- **Assuming the engine's automatic retries remove the need for
  idempotency.** The engine retries a *failed* activity call
  automatically, but if that activity's side effect can partially
  succeed before raising, a retry can still repeat real-world work.
  Module 01's idempotency-key discipline still applies inside activities.
- **Reaching for a durable execution engine for a two-step, seconds-long
  saga.** As the independent challenge's final question emphasizes, this
  is an escalation decision like every other in this track — a short,
  simple saga (module 04's choreography case) doesn't need a new
  infrastructure dependency; a long-running, branchy, human-in-the-loop
  workflow does.
- **Confusing "activities aren't replayed" with "activities can't fail."**
  Activities still fail, time out, and get retried per their policy —
  "not replayed" means a *successful* activity's result is reused on
  replay, not that failures are hidden or impossible.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does a durable execution engine's "event history" replace from
   module 04's hand-rolled orchestrator, and what does replaying that
   history actually do on a worker restart?
2. What's the difference between a workflow function and an activity
   function, and why must workflow code be deterministic while activity
   code doesn't have that restriction?
3. If an activity has a `RetryPolicy` with `maximum_attempts=5` and fails
   on the first two attempts, what code do you have to write to make the
   third attempt happen?
4. What is a signal, and what kind of requirement from module 04's saga
   design does it solve that a hand-rolled `saga_state` table doesn't
   solve well?
5. Give one concrete reason a short, two-step saga might *not* be worth
   moving to a durable execution engine.

<details>
<summary>Answers</summary>

1. It replaces the `saga_state` table and the manual "read `saga_state`
   on restart, skip completed steps" recovery logic from module 04.
   Replaying the event history re-runs the workflow function, but every
   activity call that already completed returns its already-recorded
   result instantly instead of re-executing the real side effect — only
   work past what's already in history actually happens again.
2. A workflow function is pure orchestration/sequencing logic and gets
   *replayed* to reconstruct state after a restart, so it must be
   deterministic (no direct real-time clock, randomness, network calls,
   or file I/O). An activity function is where real side effects
   happen; it is not replayed — its result is recorded once in history
   and reused — so it's free to call out to real services, use real
   time, etc.
3. None — the retry is automatic. You configure a `RetryPolicy` when
   calling `workflow.execute_activity`, and the engine handles
   re-invoking the failed activity with backoff up to
   `maximum_attempts`; no `try`/`except` or retry loop belongs in your
   workflow or activity code for this.
4. A signal is how external code delivers an event into an already-
   running (possibly long-lived) workflow, and `workflow.wait_condition`
   lets the workflow durably wait for it with no polling. It solves
   "wait an indefinite, possibly very long time for an external event
   (human approval, an async callback)" — a hand-rolled `saga_state`
   table has no equivalent durable, crash-proof "wait for this" primitive
   without building substantial extra infrastructure yourself.
5. Any of: it adds an infrastructure dependency (running or paying for
   the engine) for a flow simple enough not to need it; workflow code
   must follow the determinism rule, a real learning curve and a new
   class of subtle bug if violated; and module 04's choreography or a
   simple hand-rolled orchestrator is easier to reason about and
   operate for a saga that completes in seconds with few steps and no
   long-lived waits.

</details>

## Further reading & sources

- [Temporal: Core application concepts](https://docs.temporal.io/temporal) - the official overview of workflows, activities, and event history this module is built on.
- [Temporal Python SDK documentation](https://docs.temporal.io/develop/python) - the SDK used throughout this module's exercises.
- [Temporal: Workflow determinism constraints](https://docs.temporal.io/workflows#deterministic-constraints) - the exact rules behind the "no real time/randomness/I-O directly in workflow code" discipline in this module.
- [AWS Step Functions: How it works](https://docs.aws.amazon.com/step-functions/latest/dg/how-step-functions-works.html) - the same durable-orchestration idea on a different, JSON-state-machine-based platform.
- [microservices.io: Saga pattern](https://microservices.io/patterns/data/saga.html) - the pattern this module's engine automates the mechanics of; read alongside module 04 for the full picture.

## Next

[09-capstone-project](../09-capstone-project/README.md) — you now hold
the whole toolkit: per-operation consistency (00), idempotency (01),
locking and fencing (02), the 2PC trade-off (03), sagas (04), CQRS (05),
event sourcing (06), consensus/coordination (07), and durable workflow
orchestration (08). The capstone stops teaching new patterns and asks
you to *combine* them: design and partially build a distributed
order-processing system that uses idempotency keys to make requests
safe, a saga to coordinate the multi-step transaction across services,
and event sourcing to record the order's state history.
</content>
