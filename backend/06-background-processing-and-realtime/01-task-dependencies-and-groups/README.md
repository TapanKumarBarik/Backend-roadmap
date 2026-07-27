# Module 01: Task Dependencies and Groups

## Why this matters

Real background work is rarely one task. "Process this order" is actually:
charge the card, *then* reserve inventory, *then* generate a shipping label,
*then* email the customer — and step N usually needs the *output* of step
N-1 (you can't email a tracking number you haven't generated yet). Meanwhile
"resize this uploaded photo into six sizes" is six independent tasks you'd
love to run all at once and only declare "done" when the last one finishes.

If you wire these by hand — one task calling `.delay()` on the next from
inside itself, passing state through Redis or a database column you invent —
you'll reinvent a workflow engine badly, and you'll do it without the retry,
error-propagation, and result-collection semantics Celery already gives you.
Celery has first-class primitives for exactly these shapes: **chains** for
sequential pipelines where output feeds input, **groups** for fan-out
parallelism, and **chords** for "fan out, then run one callback when all the
parallel work is done."

Getting these right is the difference between a pipeline that cleanly retries
one failed step and one where a mid-pipeline crash leaves an order half-
charged with no label and no way to resume. This module builds the vocabulary
(signatures, chains, groups, chords) and applies it to a concrete order-
processing pipeline.

## Concepts

### Signatures: a task call frozen for later

Before you can compose tasks you need a way to describe "this task, with
these arguments" *without running it yet*. That's a **signature** (sometimes
called a "subtask"). `add.s(2, 3)` is a signature: a serializable object
meaning "call `add` with args `(2, 3)`." Composition primitives take
signatures and wire them together.

```python
sig = add.s(2, 3)      # a frozen call; nothing has run
sig.delay()            # NOW it runs, like add.delay(2, 3)
```

The key subtlety is **partial signatures** and how a chain passes results.
`add.s(3)` is a signature missing an argument. When a chain feeds the previous
task's result into it, that result is *prepended* as the first argument. So in
a chain, `add.s(3)` becomes `add(previous_result, 3)`. This is how output
flows into the next step's input.

### Chains: output of one feeds the next

A **chain** runs tasks in sequence, feeding each task's return value as the
first argument to the next. Use it when step N genuinely needs step N-1's
output.

```python
from celery import chain

# add(2, 3) -> 5, then multiply(5, 10) -> 50, then store(50)
workflow = chain(add.s(2, 3), multiply.s(10), store.s())
result = workflow.apply_async()
```

Each link runs on a worker, possibly a *different* worker than the previous
link — the result travels through the result backend between steps. If any
link raises and isn't retried into success, the chain stops: downstream links
don't run, and the error propagates to the chain's `AsyncResult`. That
"downstream doesn't run on failure" property is a feature — you don't want to
email a tracking number when label generation failed.

Two syntaxes, identical meaning — the pipe operator is common:

```python
workflow = add.s(2, 3) | multiply.s(10) | store.s()
```

### Groups: fan out and run in parallel

A **group** runs many tasks *concurrently* (across your worker pool) and
collects their results into a list, preserving order. Use it for independent
work you want to parallelize.

```python
from celery import group

# resize the same image into 6 sizes, all at once
job = group(resize.s(image_id, size) for size in [64, 128, 256, 512, 1024, 2048])
result = job.apply_async()
result.get()        # [path64, path128, ...] once ALL finish, in order
```

Throughput here is bounded by how many workers/slots you have — a group of 6
with a 3-slot pool runs 3, then 3. The group's result is "ready" only when
every member is done; a single failed member marks the group result as
failed (the others may still have completed).

### Chords: fan out, then one callback on all results

A **chord** is a group plus a callback: run all the tasks in the (parallel)
"header," and when *every one* has finished, run a single "body" task with the
list of their results. This is the primitive for "do N things in parallel,
then combine."

```python
from celery import chord

# thumbnail 6 sizes in parallel, then write ONE manifest listing all paths
chord(
    (resize.s(image_id, s) for s in [64, 128, 256, 512, 1024, 2048]),
    write_manifest.s(image_id),      # callback: gets [path64, path128, ...]
).apply_async()
```

The callback runs exactly once, only after the whole header succeeds. Under
the hood the chord needs a result backend to know when the header is complete
— chords don't work without one. A failure in any header task by default
prevents the callback from running.

### Chaining vs. calling `.delay()` from inside a task

You *can* make a task enqueue the next task itself:

```python
@app.task
def charge_card(order_id):
    ...
    reserve_inventory.delay(order_id)   # tail call
```

Sometimes that's fine, but it has real downsides versus a chain: the workflow
structure is hidden inside task bodies (you can't see the pipeline shape in
one place), error propagation is manual, you can't easily attach a single
callback for "the whole pipeline finished," and there's no built-in result
handle for the end-to-end job. Prefer declaring the workflow with
chain/group/chord at enqueue time so the *shape* is explicit and Celery
manages the wiring. Reach for in-task `.delay()` only for genuinely dynamic
branching the static primitives can't express.

### Immutable signatures: when you *don't* want the result passed

Sometimes a chained task shouldn't receive the previous result as an argument
— e.g. a final "send notification" step that takes only an `order_id`, not
the upstream return value. Mark its signature **immutable** with `.si(...)`
(or `.s(...).set(immutable=True)`) so Celery doesn't prepend the previous
result:

```python
chain(charge_card.s(order_id), notify.si(order_id))   # notify gets order_id only
```

Getting this wrong produces confusing `TypeError: got multiple values` /
unexpected-argument bugs where a task receives a result it wasn't written to
accept.

## Command reference

| Primitive | Meaning | Constructor |
|---|---|---|
| Signature | A frozen task-call (task + args), not yet run | `task.s(*args)` |
| Immutable signature | Signature that ignores an injected upstream result | `task.si(*args)` |
| Chain | Run in sequence; each result feeds the next as first arg | `chain(a.s(), b.s())` or `a.s() \| b.s()` |
| Group | Run in parallel; collect results into an ordered list | `group(a.s(), b.s(), ...)` |
| Chord | Group (header) + a callback (body) run once all finish | `chord(header)(body)` or `chord(header, body)` |
| Enqueue a workflow | Kick off any of the above | `.apply_async()` or `.delay()` |
| Collect group/chord result | Blocks until all done | `result.get()` |

A concrete order-processing pipeline — `pipeline.py`:

```python
import time
from celery import Celery, chain, group, chord

app = Celery("orders", broker="redis://localhost:6379/0",
             backend="redis://localhost:6379/1")

@app.task
def charge_card(order_id, amount):
    time.sleep(1)
    print(f"[charge] order {order_id}: ${amount}")
    return {"order_id": order_id, "charge_id": f"ch_{order_id}"}

@app.task
def reserve_inventory(charge_result):
    # receives charge_card's return value as first arg (chain)
    order_id = charge_result["order_id"]
    time.sleep(1)
    print(f"[inventory] reserved for order {order_id}")
    return {**charge_result, "reserved": True}

@app.task
def make_shipping_label(reserve_result):
    order_id = reserve_result["order_id"]
    time.sleep(1)
    tracking = f"TRK{order_id:05d}"
    print(f"[label] {tracking}")
    return {**reserve_result, "tracking": tracking}

@app.task
def email_customer(pipeline_result):
    print(f"[email] tracking {pipeline_result['tracking']} sent to customer")
    return "emailed"

def process_order(order_id, amount):
    # The whole pipeline shape, visible in one place:
    workflow = (
        charge_card.s(order_id, amount)
        | reserve_inventory.s()
        | make_shipping_label.s()
        | email_customer.s()
    )
    return workflow.apply_async()   # returns a handle to the END of the chain
```

Fan-out with a chord — thumbnailing:

```python
@app.task
def resize(image_id, size):
    time.sleep(1)
    return f"/thumbs/{image_id}_{size}.jpg"

@app.task
def write_manifest(paths, image_id):
    print(f"[manifest] image {image_id}: {paths}")
    return {"image_id": image_id, "thumbnails": paths}

def thumbnail_all(image_id):
    header = group(resize.s(image_id, s) for s in [64, 128, 256, 512])
    return chord(header)(write_manifest.s(image_id))
```

## Hands-on exercises

Continue in `bg-queues` with Redis and a worker running. A result backend is
**required** for chords, so keep `backend=...` configured. Put the code above
in `pipeline.py`.

### 1. Signatures don't run until you tell them to

```python
from pipeline import charge_card
sig = charge_card.s(1, 99)
print(type(sig))     # a Signature — nothing charged yet
sig.delay()          # NOW it runs on a worker
```

Expected: creating `sig` logs nothing; only `.delay()` triggers the worker to
print `[charge] order 1`. A signature is a *description* of a call.

### 2. Run the order chain and watch results flow

```python
from pipeline import process_order
r = process_order(order_id=42, amount=150)
print(r.get(timeout=15))     # 'emailed' — the LAST task's return
```

Watch the worker log `[charge]`, `[inventory]`, `[label]`, `[email]` **in
order**, ~1s apart. Expected: each step's dict flowed into the next as its
first argument, ending with the tracking number reaching `email_customer`.

### 3. See a chain stop on failure

Edit `reserve_inventory` to `raise RuntimeError("out of stock")`. Re-run
`process_order`. Expected: `[charge]` logs, then the chain **stops** —
`[label]` and `[email]` never run — and `r.get()` re-raises the
`RuntimeError`. Downstream steps didn't execute because an upstream step
failed. Revert the change after.

### 4. Fan out with a group

```python
from celery import group
from pipeline import resize
job = group(resize.s(7, s) for s in [64, 128, 256, 512])
r = job.apply_async()
print(r.get(timeout=15))   # ['/thumbs/7_64.jpg', ...] in size order
```

Run a worker with `--concurrency=4` and watch all four run at once. Expected:
four `resize` calls execute concurrently; the result list preserves the input
order regardless of which finished first.

### 5. Chord: combine parallel results in one callback

```python
from pipeline import thumbnail_all
r = thumbnail_all(image_id=7)
print(r.get(timeout=20))
```

Expected: four `resize` tasks run in parallel, then `write_manifest` runs
**exactly once** with the list of all four paths — logging one `[manifest]`
line. The callback waited for the whole header.

### 6. Immutable signature: stop a result being passed

Add a final notify step that takes only an id:

```python
@app.task
def notify(order_id):
    print(f"[notify] order {order_id} complete")
    return "notified"
```

Chain it two ways and observe:

```python
# WRONG: notify gets the upstream dict prepended -> TypeError (too many args)
(charge_card.s(1, 50) | notify.s()).apply_async()
# RIGHT: immutable -> notify(1) only
(charge_card.s(1, 50) | notify.si(1)).apply_async()
```

Expected: the `.s()` version fails with an argument error (visible via
`r.get()`); the `.si()` version runs cleanly. Lesson: use `.si()` when a
chained task must ignore the upstream result.

### 7. Combine group inside a chain

Build "charge, then resize 4 thumbnails in parallel, then notify":

```python
from celery import chain, group
workflow = chain(
    charge_card.s(9, 20),
    group(resize.s(9, s) for s in [64, 128, 256]),   # a group as a chain step
    write_manifest.s(9),
)
print(workflow.apply_async().get(timeout=20))
```

Expected: charge runs, then three resizes fan out in parallel, then the
manifest callback collects them — Celery upgrades the group-in-a-chain into a
chord automatically. You've composed sequential and parallel stages.

### 8. Diagnose and fix: the hand-rolled pipeline that loses errors

A teammate wired the pipeline by having each task call the next with
`.delay()` from inside itself, and reports: "when inventory fails, the
customer still gets a tracking email sometimes, and I have no single handle
to know if the order finished." Their code (simplified):

```python
@app.task
def charge_card2(order_id, amount):
    charge = do_charge(order_id, amount)
    reserve_inventory2.delay(order_id)     # fire-and-forget tail call
    return charge

@app.task
def reserve_inventory2(order_id):
    ok = do_reserve(order_id)
    make_label2.delay(order_id)            # runs even if `ok` is False!
    return ok
```

Explain why (a) there's no end-to-end result handle and (b) label/email can
run despite a failed reserve. Then rewrite it as a single `chain(...)` so a
failure stops the pipeline and `apply_async()` returns one handle for the
whole thing.

<details>
<summary>Solution</summary>

(a) Each task fires the next and returns its *own* value; the producer only
gets a handle to `charge_card2`, which is "done" the instant charging
finishes — long before the pipeline actually completes. There is no object
representing the tail. (b) `reserve_inventory2` calls `make_label2.delay()`
unconditionally — it enqueues the next step even when `ok` is `False`, because
a normal return (even `return False`) is not an error and doesn't stop
anything. Nothing propagates the failure. The fix is a chain:

```python
workflow = (charge_card.s(order_id, amount)
            | reserve_inventory.s()
            | make_shipping_label.s()
            | email_customer.s())
handle = workflow.apply_async()   # ONE handle for the whole pipeline
```

Now if `reserve_inventory` *raises* (make it raise on failure instead of
returning `False`), the chain stops and downstream steps never run, and
`handle.get()` re-raises — you have both end-to-end status and correct
failure semantics. Lesson: declare the workflow shape at enqueue time; let
raising (not returning falsy) signal failure so the chain halts.

</details>

## Independent challenge

No code given. Using the primitives from this module, model a "publish blog
post" workflow: (1) render the post to HTML, then in parallel (2a) generate a
social-share image, (2b) warm the CDN cache, and (2c) build a search-index
document — and only once all three parallel steps finish, (3) flip the post's
status to `published` and (4) notify the author. Use a chain for the
sequential parts, a group/chord for the parallel middle, and an **immutable
signature** for the final notify step (it needs only `post_id`, not upstream
results). Prove that if the "generate social image" step raises, the post is
*not* marked published.

Recall the "pass IDs, not objects" rule from
[00-task-queues-fundamentals](../00-task-queues-fundamentals/README.md): every
signature should carry `post_id`, and each task should re-fetch what it needs.

<details>
<summary>Hint</summary>

The shape is `chain(render.s(post_id), chord(group(social, warm, index),
mark_published.si(post_id)), notify.si(post_id))` — but note a chord's
callback must accept the header's result list, so `mark_published` either
takes that list or you make the whole middle a chord whose body ignores the
list via `.si()`. Test the failure case by making the social-image task raise;
the chord body (and everything after) should never run.

</details>

## Common mistakes & troubleshooting

- **Using `.s()` where you needed `.si()`.** A chained task that isn't written
  to accept the upstream result gets it prepended and throws an argument
  error. Use immutable signatures (`.si()`) for steps that ignore the previous
  result.
- **Returning falsy instead of raising to signal failure.** A chain only stops
  when a task *raises*; `return False` is a successful completion and the next
  link runs. Raise an exception to halt a pipeline.
- **Chords without a result backend.** Chords need a backend to detect when
  the header is complete; without one they hang or error. Configure a backend.
- **Blocking inside a task by calling `.get()` on a subtask.** Waiting on
  another task's result from within a task ties up a worker slot and can
  deadlock the pool. Compose with chains/chords instead of nesting
  `.get()` calls.
- **Hiding the workflow inside task bodies.** Tail-calling `.delay()` scatters
  the pipeline shape across files and loses end-to-end status/error handling.
  Declare the workflow with chain/group/chord at enqueue time.
- **Assuming group results come back in completion order.** They come back in
  *submission* order, regardless of which finished first — don't rely on
  timing.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is a signature, and how does `add.s(3)` behave differently inside a
   chain than called on its own?
2. In a chain, what happens to the tasks *after* a link that raises an
   exception, and why is that the behavior you want for an order pipeline?
3. What's the difference between a group and a chord? What does a chord give
   you that a bare group doesn't?
4. When would you use `.si()` (immutable) instead of `.s()`, and what bug does
   using the wrong one produce?
5. Why is declaring a `chain(...)` at enqueue time generally better than
   having each task call `.delay()` on the next from inside itself?
6. Why does a chord require a result backend when a simple fire-and-forget
   task does not?

<details>
<summary>Answers</summary>

1. A signature is a frozen, serializable description of "call this task with
   these args," not yet executed. On its own, `add.s(3)` means `add(3)` (and
   would error if `add` needs two args). Inside a chain, the previous task's
   result is *prepended*, so `add.s(3)` becomes `add(previous_result, 3)`.
2. They don't run — the chain stops at the failing link and the error
   propagates to the chain's result handle. That's what you want: if charging
   or inventory fails, you must not go on to print a shipping label and email
   the customer a tracking number for an order that didn't actually process.
3. A group runs many tasks in parallel and collects their results. A chord is
   a group *plus* a callback (body) that runs exactly once, after every task
   in the header finishes, receiving the list of their results. The chord
   gives you the "combine all parallel results in one step" callback a bare
   group doesn't.
4. Use `.si()` when a chained task should *ignore* the upstream result and run
   with only its own arguments (e.g. a final `notify(order_id)`). Using `.s()`
   there prepends the upstream result as an extra first argument, causing a
   `TypeError`/wrong-argument bug.
5. Because the workflow shape is then visible in one place, Celery manages the
   wiring/error propagation, downstream steps automatically stop on failure,
   and `apply_async()` returns a single handle for the whole pipeline. In-task
   `.delay()` scatters the structure, runs steps even after a "failure" that
   only returned falsy, and gives no end-to-end handle.
6. A chord must know when *all* header tasks have completed before running the
   callback — it tracks their completion/results through the result backend.
   A fire-and-forget task has no such coordination and no result anyone reads,
   so it needs no backend.

</details>

## Next

[02-retries-prioritization-and-rate-limiting-in-queues](../02-retries-prioritization-and-rate-limiting-in-queues/README.md)
— pipelines fail on flaky networks and downstream hiccups. Next you'll make
tasks retry with backoff, design them to be idempotent so retries are safe,
prioritize payment work ahead of notification emails, and rate-limit outbound
calls so you don't hammer a third-party API from inside a task.
