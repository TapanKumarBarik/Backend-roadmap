# Module 02: Retries, Prioritization, and Rate Limiting in Queues

## Why this matters

Background tasks talk to things that fail: payment gateways time out, SMTP
servers hiccup, third-party APIs return `503` under load. In the request-
response cycle a failure just becomes an error the user sees and retries by
hand. In a queue, *the task itself* has to decide what to do when its
downstream dependency misbehaves — and the naive answers ("crash" or "retry
forever, instantly") are both wrong. Crash and the work is silently lost;
retry instantly in a tight loop and you turn a brief blip into a self-inflicted
denial-of-service against a service that's already struggling.

The right answer has three parts, and this module is about all three.
**Retry with backoff** so transient failures recover automatically without
hammering. **Idempotent task design** so that retrying (or the at-least-once
delivery a broker gives you) can't double-charge a card or send two emails.
And **prioritization + rate limiting** so that when the queue backs up,
payment tasks jump ahead of newsletter emails, and your outbound calls to a
partner API stay under the 10-requests-per-second cap they'll ban you for
exceeding.

These are the properties that separate a toy queue from one you'd trust with
money. A task that isn't idempotent is a bug waiting for its first retry; a
retry policy without backoff is an outage amplifier.

## Concepts

### At-least-once delivery means your task *will* run twice eventually

A broker guarantees at-least-once delivery, not exactly-once. If a worker
pulls a task, does the work, but crashes (or its network drops) *before*
acknowledging the message, the broker re-delivers it to another worker — which
runs it again. Add explicit retries on top and "runs more than once" goes from
rare to routine. You cannot make delivery exactly-once at the infrastructure
level in general; instead you make the *effect* exactly-once by designing the
task so running it twice is harmless. That's idempotency, and it's the
non-negotiable foundation everything else in this module sits on.

### Idempotent task design

A task is **idempotent** if running it N times has the same effect as running
it once. Concretely, before performing a side effect, check whether it's
already been done, keyed by something stable:

- **Charging a card:** pass an idempotency key (e.g. `order_id` or a generated
  UUID stored with the order) to the payment gateway. Stripe and others
  dedupe on it server-side — a retried charge with the same key returns the
  *original* charge instead of making a second one.
- **Sending an email:** record `sent_email(order_id, "receipt")` in a table
  with a unique constraint; the task checks/inserts first and skips if the row
  exists.
- **Updating a row:** prefer "set status = shipped" (idempotent) over
  "increment attempts by 1" (not idempotent) where you can, or guard the
  increment with a condition.

The pattern is always: **derive a stable key, check if the effect already
happened, and make the check-and-act atomic** (a unique constraint or
conditional update, not a read-then-write race). A task that does a bare
`balance -= amount` is a landmine — one redelivery and the customer is charged
twice.

```
  charge(order=42, key="order-42")   1st delivery ─► key unseen ─► CHARGE $150
  charge(order=42, key="order-42")   redelivery   ─► key seen   ─► skip, return
                                                                   original result
  Same key twice  ==  one side effect. Without the key:
  charge / charge ─────────────────────────────► $150 + $150 = double charge
```

### Automatic retries with exponential backoff

Celery tasks retry by re-enqueuing themselves. The modern, declarative way is
`autoretry_for` plus backoff options on the decorator:

```python
@app.task(
    autoretry_for=(requests.RequestException,),  # retry only on these
    max_retries=5,
    retry_backoff=True,        # 1s, 2s, 4s, 8s... exponential
    retry_backoff_max=60,      # cap the delay
    retry_jitter=True,         # randomize so retries don't sync up (thundering herd)
)
def call_partner_api(order_id):
    ...
```

**Exponential backoff** doubles the delay between attempts so a struggling
service gets breathing room instead of a retry storm. **Jitter** randomizes
the delay so that a thousand tasks that all failed at the same instant don't
all retry at the same instant (the "thundering herd" that keeps the service
down). **`max_retries`** bounds the attempts so a permanently-broken
dependency doesn't retry forever.

```
  attempt:   1      2         3               4                     5   (max_retries)
  try ──✗    │      │         │               │                     │
  wait:      └─1s─► └──2s───► └────4s──────► └──────8s──────────► └── give up
             (each delay doubles; jitter nudges each ± a little so 1000 failed
              tasks don't all retry on the same tick — the thundering herd)
```

Two failure categories deserve different handling: **transient** (timeout,
`503`, connection reset) — retry; **permanent** (`400 bad request`, `404`,
validation error) — do *not* retry, because it'll fail identically every time.
List only transient exception types in `autoretry_for`, and for the manual
form, don't call `self.retry()` on permanent errors.

The manual form gives you full control:

```python
@app.task(bind=True, max_retries=5)
def charge(self, order_id):
    try:
        do_charge(order_id)
    except PaymentTimeout as exc:
        # retry with computed backoff; raises MaxRetriesExceeded when exhausted
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

### Dead-letter handling: where exhausted tasks go

When retries are exhausted the task fails for good. Don't let that failure
vanish. Use `on_failure` (or an error callback / a dedicated failure task) to
record the permanently-failed task somewhere a human or a sweeper job can see
it — a "dead-letter" table or queue. Silent terminal failure is how "we
thought the emails were sending" happens.

```python
@app.task(bind=True, max_retries=3)
def charge(self, order_id):
    ...
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        record_dead_letter("charge", args, str(exc))   # visible, replayable
```

### Prioritization: important work jumps the line

When the queue backs up, not all tasks are equal — a payment capture should
run before a "here's our weekly newsletter" email. Two common approaches:

1. **Separate queues + dedicated workers.** Route payments to a `high` queue
   and emails to a `low` queue, then run workers that consume `high` first (or
   dedicate more workers to it). This is the most robust and predictable
   approach.

   ```python
   charge.apply_async(args=[order_id], queue="high")
   send_newsletter.apply_async(args=[user_id], queue="low")
   # worker consuming high-priority first:
   #   celery -A tasks worker -Q high,low
   ```

2. **Broker priority levels.** With RabbitMQ (and, with caveats, Redis) you
   can set a numeric `priority` on `apply_async`. This is coarser and
   broker-dependent; separate queues are usually clearer.

The important mental model: priority only matters *when there's a backlog*. An
empty queue runs everything immediately regardless. Prioritization is a
policy for scarcity.

### Rate limiting outbound calls from a task

A partner API caps you at, say, 10 requests/second; exceed it and you get
`429`s or a ban. Two layers:

- **Celery's per-task `rate_limit`** throttles how often a worker *starts* a
  given task: `@app.task(rate_limit="10/s")`. This is per-worker and a decent
  first line, but with N workers the effective rate is roughly N × the limit —
  so it's not a hard global cap.
- **A shared token bucket in Redis** for a true global limit across all
  workers. The task acquires a token before making the call; if none is
  available it retries with backoff. This is the reliable way to hold a
  cluster-wide ceiling.

Pair rate limiting with retries: when you *do* hit a `429`, respect the
`Retry-After` header the server sends by retrying after that many seconds
rather than your default backoff.

## Command reference

| Concern | Mechanism | Example |
|---|---|---|
| Auto-retry on transient errors | `autoretry_for=(...)` | `@app.task(autoretry_for=(TimeoutError,))` |
| Exponential backoff | `retry_backoff=True` | `retry_backoff=True, retry_backoff_max=60` |
| Randomize retry timing | `retry_jitter=True` | avoids thundering herd |
| Cap attempts | `max_retries=N` | `max_retries=5` |
| Manual retry | `self.retry(exc=, countdown=)` | needs `bind=True` |
| Handle terminal failure | `on_failure` / error callback | write a dead-letter record |
| Route to a queue | `apply_async(queue="high")` | + `celery worker -Q high,low` |
| Per-task throttle | `rate_limit="10/s"` | per-worker, not global |
| Global rate limit | Redis token bucket | true cluster-wide cap |
| Respect server backoff | read `Retry-After` on `429` | `self.retry(countdown=retry_after)` |

An idempotent, retrying, rate-limited payment task — `payments.py`:

```python
import time, requests
from celery import Celery

app = Celery("pay", broker="redis://localhost:6379/0",
             backend="redis://localhost:6379/1")

@app.task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    rate_limit="10/s",
)
def charge_card(self, order_id, amount):
    # 1. IDEMPOTENCY: skip if this order was already charged.
    if already_charged(order_id):
        return {"order_id": order_id, "status": "already_charged"}

    # 2. Use an idempotency key so a retry that reaches the gateway
    #    doesn't create a second charge.
    resp = requests.post(
        "https://api.gateway.example/charges",
        json={"amount": amount},
        headers={"Idempotency-Key": f"order-{order_id}"},
        timeout=5,
    )
    if resp.status_code == 429:
        # respect the server's backoff instruction
        retry_after = int(resp.headers.get("Retry-After", "2"))
        raise self.retry(countdown=retry_after)
    if 400 <= resp.status_code < 500 and resp.status_code != 429:
        # permanent client error: do NOT retry, fail loudly
        raise ValueError(f"permanent charge error {resp.status_code}")
    resp.raise_for_status()   # 5xx -> RequestException -> autoretry

    mark_charged(order_id, resp.json()["charge_id"])   # atomic write
    return {"order_id": order_id, "status": "charged"}

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        record_dead_letter("charge_card", args, str(exc))
```

A global token-bucket rate limiter in Redis:

```python
import time

# Refill-on-read token bucket. Returns True if a token was granted.
_BUCKET = """
local tokens = tonumber(redis.call('get', KEYS[1]) or ARGV[1])
if tokens > 0 then
  redis.call('set', KEYS[1], tokens - 1)
  return 1
end
return 0
"""

def acquire_token(redis, key, capacity):
    return bool(redis.eval(_BUCKET, 1, key, capacity))
# a separate scheduled task (module 03) refills the bucket each second
```

## Hands-on exercises

Continue in `bg-queues`. `pip install requests`. Keep a worker and Redis
running.

### 1. Make a task retry and watch the backoff

```python
@app.task(bind=True, max_retries=3, retry_backoff=True, retry_jitter=False)
def flaky(self):
    import random
    if random.random() < 0.7:
        raise self.retry(exc=RuntimeError("transient"))
    return "ok"
```

Enqueue it repeatedly and watch the worker log. Expected: on failure it
re-enqueues with growing delays (~1s, 2s, 4s); after 3 retries it raises
`MaxRetriesExceeded`. Note the delay doubling — that's backoff.

### 2. Prove non-idempotency bites on retry

Write a deliberately-broken "charge":

```python
_balance = {"acct": 100}
@app.task(bind=True, max_retries=2)
def bad_charge(self, amount):
    _balance["acct"] -= amount        # side effect BEFORE the risky part
    do_risky_thing()                  # sometimes raises -> retry
```

Force `do_risky_thing` to raise once then succeed. Expected: the balance is
debited on *every* attempt, so a single logical charge deducts the amount
multiple times. This is the double-charge bug in miniature.

### 3. Fix it: make the charge idempotent

Rewrite so the side effect happens once, guarded by a key:

```python
_charged = set()
@app.task(bind=True, max_retries=2)
def good_charge(self, order_id, amount):
    if order_id in _charged:          # already done? skip.
        return "already_charged"
    do_risky_thing()                  # do the risky part FIRST
    _charged.add(order_id)            # commit the effect only on success
    _balance["acct"] -= amount
    return "charged"
```

Expected: no matter how many retries, `order_id` is charged exactly once. (In
production the guard is a unique DB constraint / gateway idempotency key, not
an in-memory set — but the shape is identical.)

### 4. Distinguish transient from permanent failures

```python
@app.task(autoretry_for=(ConnectionError,), max_retries=3)
def call_api(kind):
    if kind == "transient":
        raise ConnectionError("timeout")     # retried
    if kind == "permanent":
        raise ValueError("bad input")        # NOT retried
    return "ok"
```

Enqueue both. Expected: `transient` retries 3 times then gives up;
`permanent` fails immediately with no retries (it's not in `autoretry_for`).
Lesson: never retry an error that will fail identically every time.

### 5. Two queues, priority by dedicated worker

Route work to `high` and `low`:

```python
charge_card.apply_async(args=[1, 50], queue="high")
send_newsletter.apply_async(args=[7], queue="low")
```

Start a worker that prefers high:

```bash
celery -A tasks worker -Q high,low --concurrency=1 --loglevel=info
```

Flood the `low` queue with 20 tasks, then enqueue one `high`. Expected: with a
single-slot worker consuming `high,low`, the high-priority task is picked up
ahead of the pending low ones (Celery drains listed queues with high first on
each fetch). Contrast with a worker started `-Q low,high`.

### 6. Per-task rate limit

```python
@app.task(rate_limit="2/s")
def limited():
    print(time.time())
```

Enqueue 10 at once against a single worker. Expected: the worker starts them
at ~2 per second (watch the timestamps ~0.5s apart), not all at once — Celery
throttles task *starts*. Note this is per-worker: two workers would run ~4/s.

### 7. Global rate limit with a Redis token bucket

Implement `acquire_token` from the reference. Seed the bucket
(`redis-cli SET api_tokens 5`). In a task, call `acquire_token`; if it returns
`False`, `self.retry(countdown=1)`. Enqueue 20 tasks. Expected: only 5 proceed
immediately; the rest retry until tokens are available — a hard global cap
regardless of worker count. (You'll automate refilling in module 03.)

### 8. Respect `Retry-After` on a 429

Simulate a server returning `429` with `Retry-After: 3`:

```python
@app.task(bind=True, max_retries=5)
def polite(self, attempt=0):
    if attempt < 2:
        raise self.retry(countdown=3, kwargs={"attempt": attempt + 1})
    return "done"
```

Expected: retries space out by exactly 3s (the server-dictated delay), not
your default backoff. Lesson: when a server tells you how long to wait, obey
it rather than guessing.

### 9. Diagnose and fix: the task that silently fails and never retries

A payment task "sometimes just doesn't happen" with nothing in the logs and
no retry. The code:

```python
@app.task
def capture(order_id):
    try:
        gateway.capture(order_id)     # can raise TimeoutError
    except Exception:
        pass                          # swallow everything
```

Explain the two bugs: (1) it has no retry configured, and (2) it *swallows*
the exception, so even the built-in failure recording never fires — the task
returns "successfully" having done nothing. Fix it: add
`autoretry_for=(TimeoutError,)` with backoff and `max_retries`, stop
swallowing (let transient errors propagate so Celery retries; re-raise
permanent ones), and add an `on_failure` that writes a dead-letter record so
an exhausted task is *visible*.

<details>
<summary>Solution</summary>

```python
@app.task(bind=True, autoretry_for=(TimeoutError,), max_retries=5,
          retry_backoff=True, retry_jitter=True)
def capture(self, order_id):
    if already_captured(order_id):        # idempotency guard
        return "already"
    try:
        result = gateway.capture(order_id, idempotency_key=f"cap-{order_id}")
    except PermanentError as exc:
        # don't retry something that'll always fail; fail loudly
        raise exc
    mark_captured(order_id, result.id)
    return "captured"

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        record_dead_letter("capture", args, str(exc))   # visible + replayable
```

The `except: pass` was hiding failures *and* preventing retries — Celery only
retries/records failures it actually sees. Never blanket-swallow in a task;
let transient errors propagate to trigger retry, re-raise permanent ones, and
route exhausted tasks to a dead-letter sink. Add the idempotency guard so the
now-enabled retries can't double-capture.

</details>

## Independent challenge

No code given. Build an "outbound SMS" task that calls a flaky third-party SMS
API capped at 5 requests/second globally. Requirements: retry transient errors
(timeouts, `5xx`) with exponential backoff and jitter but never retry a `400`
(bad phone number); hold the 5/s cap across *any* number of workers; make the
task idempotent so a redelivery never sends the same message twice (dedupe by
a `message_id` you pass in); and ensure a message that exhausts its retries
lands somewhere a human can see and replay it. Prove the global cap by
enqueuing 50 messages against 3 workers and confirming the send rate stays
around 5/s.

Reuse the idempotency guard shape from exercise 3, the transient-vs-permanent
split from exercise 4, and the Redis token bucket from exercise 7. The "pass
IDs, not objects" rule from
[00-task-queues-fundamentals](../00-task-queues-fundamentals/README.md) is what
makes your `message_id` dedupe key work.

<details>
<summary>Hint</summary>

The global cap can't come from Celery's per-task `rate_limit` (that's
per-worker, so 3 workers = ~15/s). Use the Redis token-bucket
`acquire_token` and `self.retry(countdown=1)` when no token is free, plus a
scheduled refill (foreshadowing module 03). Dedupe with a Redis `SET
sms:{message_id} NX` or a unique DB constraint checked before sending.

</details>

## Common mistakes & troubleshooting

- **Non-idempotent tasks.** The default assumption must be "this runs more
  than once." Any task with a side effect (charge, email, insert) needs a
  stable key and a check-before-act guard, or a retry/redelivery corrupts
  data.
- **Retrying permanent errors.** Retrying a `400`/validation error just burns
  attempts and delays the inevitable failure. Only retry transient errors;
  list them explicitly in `autoretry_for`.
- **Retries without backoff/jitter.** Instant, synchronized retries turn a
  brief downstream blip into a retry storm that keeps it down. Always
  exponential backoff + jitter.
- **Swallowing exceptions inside tasks.** `except: pass` hides failures *and*
  disables retries and failure recording — the task looks successful having
  done nothing. Let transient errors propagate; re-raise permanent ones.
- **Treating per-task `rate_limit` as a global cap.** It's per-worker; N
  workers multiply it. Use a shared Redis token bucket for a true cluster-wide
  limit.
- **Priority with no backlog.** Prioritization only reorders a *queue*; if
  workers are idle, everything runs immediately and priority is moot. It's a
  scarcity policy, and it needs dedicated-queue routing to be reliable.
- **Terminal failures that vanish.** A task that exhausts retries with no
  `on_failure`/dead-letter handling disappears silently. Always route
  exhausted tasks somewhere visible and replayable.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why can't a broker give you exactly-once execution, and what property must
   your task have as a result?
2. What are the two distinct things exponential backoff and jitter each solve?
3. How do you decide whether a given failure should be retried? Give an
   example of each category.
4. Your `rate_limit="10/s"` task runs on 4 workers. What's the real outbound
   rate, and how do you enforce a true global 10/s?
5. A payment task swallows all exceptions with `except: pass`. Name the two
   separate things that go wrong as a result.
6. When does task prioritization actually change anything, and what's the most
   reliable way to implement it in Celery?
7. Where should a task go when it has exhausted all its retries, and why does
   it matter?

<details>
<summary>Answers</summary>

1. Because a worker can do the work and then crash before acknowledging the
   message, so the broker re-delivers it — delivery is at-least-once. As a
   result the task must be idempotent: running it N times has the same effect
   as running it once.
2. Exponential backoff gives a struggling downstream service increasing
   breathing room instead of a tight retry loop. Jitter randomizes the timing
   so many tasks that failed simultaneously don't all retry at the same
   instant (thundering herd), which would re-overload the service.
3. Retry *transient* failures (timeout, connection reset, `503`) — they may
   succeed next time. Don't retry *permanent* failures (`400` bad request,
   `404`, validation error) — they'll fail identically every attempt. List
   only transient exception types in `autoretry_for`.
4. About 40/s — `rate_limit` is per-worker, so 4 workers each allow 10/s.
   Enforce a true global cap with a shared token bucket in Redis that every
   worker draws from before making the call, retrying when no token is free.
5. (1) The exception never propagates, so Celery never retries — a transient
   failure becomes permanent silent data loss. (2) Failure recording
   (`on_failure`/dead-letter) never fires, so the failure is invisible; the
   task appears to succeed having done nothing.
6. Only when there's a backlog — priority reorders a non-empty queue; with
   idle workers everything runs immediately. The most reliable implementation
   is separate queues (`high`/`low`) with workers that consume the
   high-priority queue first (`-Q high,low`).
7. To a visible, replayable dead-letter sink (a table or dedicated queue) via
   `on_failure` or an error callback. It matters because a terminal failure
   with no such handling vanishes silently — you find out only when a customer
   complains that the thing never happened.

</details>

## Further reading & sources

- [Celery: Retrying tasks](https://docs.celeryq.dev/en/stable/userguide/tasks.html#retrying) - `autoretry_for`, `retry_backoff`, `retry_jitter`, and `max_retries`.
- [Celery: Task options & rate limits](https://docs.celeryq.dev/en/stable/userguide/tasks.html#Task.rate_limit) - the per-worker `rate_limit` and why it isn't a global cap.
- [Celery: Routing Tasks](https://docs.celeryq.dev/en/stable/userguide/routing.html) - separate queues and `-Q high,low` worker routing for prioritization.
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) - how an idempotency key makes a retried charge return the original result.
- [AWS: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) - the canonical write-up on backoff and jitter defeating retry storms.
- [RabbitMQ: Dead Letter Exchanges](https://www.rabbitmq.com/docs/dlx) - broker-level dead-lettering for tasks that exhaust their retries.

## Next

[03-scheduling-recurring-jobs](../03-scheduling-recurring-jobs/README.md) —
so far tasks run when your code enqueues them. Next you'll run tasks on a
*schedule* — cron-style recurring jobs for backups, cleanups, and syncs — and
confront the subtle problem of making sure a job that's supposed to run once
an hour doesn't run three times because you have three scheduler replicas.
This module also carries the track's first cumulative review.
