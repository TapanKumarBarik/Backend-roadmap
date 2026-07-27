# Module 00: Task Queues Fundamentals

## Why this matters

Every slow thing your API does inside a request handler is time the client
spends staring at a spinner — and a connection your server can't reuse for
anyone else. Sending a welcome email might take 800ms while your SMTP
provider does its handshake. Resizing an uploaded image might take four
seconds. Calling a third-party payment or shipping API might take anywhere
from 200ms to a timeout thirty seconds later, depending on how their
afternoon is going. If you do that work *inside* the request, the user waits
for all of it, your worker/thread is pinned the whole time, and one slow
downstream service can pile up enough in-flight requests to take your whole
API down.

The fix is one of the oldest and most load-bearing patterns in backend
engineering: **don't do slow work in the request-response cycle.** Instead,
the request handler does the fast part (validate, write a row, enqueue a
job), returns immediately — typically a `202 Accepted` — and a *separate*
pool of processes chews through the slow work in the background. The user
gets an instant response; the email still gets sent; a spike in slow work
becomes a longer queue instead of a cascade of timeouts.

This is the foundation for the rest of this track. Scheduled jobs, webhook
delivery, email sending, file processing — they all run as background tasks.
Get the producer/broker/worker mental model right here and everything after
it is a variation on the theme. This module builds that model and gets a
real Celery task running against Redis.

## Concepts

### The request-response cycle is the wrong place for slow work

A synchronous web request has an implicit contract: the client is *blocked*
until you respond. Everything you do before returning is latency the user
feels, and — just as important — it holds server resources. Under a
thread/worker-per-request model, a handler that takes four seconds ties up
that worker for four seconds; with only N workers, N slow requests in flight
means request N+1 waits in the accept queue. Even with async I/O (where a
coroutine awaiting a slow call yields the event loop), you've still made the
*user's* latency depend on a third party you don't control.

The tell that work belongs in the background: it's **slow**, **I/O-bound or
CPU-heavy**, **not needed to compute the response**, and **tolerant of a
short delay**. Sending a confirmation email fits all four — the user doesn't
need the email to have arrived before they see "thanks for signing up." A
task queue lets the handler hand that work off and return now.

### Producer, broker, worker, result backend

A task queue system has four roles, and keeping them straight is most of the
battle:

- **Producer** — the code that *creates* a task and hands it off. In a web
  app this is your FastAPI request handler calling `some_task.delay(...)`. It
  does not run the task; it serializes a message ("run `send_email` with
  these args") and pushes it to the broker.
- **Broker** — the message queue in the middle. It's a piece of
  infrastructure (Redis or RabbitMQ, usually) that durably holds task
  messages until a worker picks one up. The broker is what decouples
  producers from workers: producers can enqueue faster than workers drain,
  and the queue absorbs the difference.
- **Worker** — a separate long-running process (often several, on separate
  machines) that connects to the broker, pulls task messages off the queue,
  and *actually executes* the task function. Workers are where the slow work
  happens. You scale throughput by running more workers.
- **Result backend** — an *optional* store (Redis, a database) where a
  task's return value and status are written so the producer can later ask
  "is task `abc123` done, and what did it return?" Many tasks are
  fire-and-forget and need no result backend at all — sending an email
  doesn't return anything you care about.

The critical mental shift: your web process and your worker process are
**different programs** that only communicate through the broker. They don't
share memory. Anything a task needs must be in the message (its arguments) or
reachable by the worker (a database, a file store). This is exactly why you
can't pass a live database session or an open file handle to a task — only
things that survive serialization and travel through the broker.

### A message is just data — so arguments must be serializable

When you call `task.delay(user_id, subject)`, the producer serializes the
task name and arguments (JSON, by default, in modern Celery) into a message
and pushes it to the broker. The worker deserializes it and calls the
function. That round-trip means arguments must be **JSON-serializable
primitives** — ints, strings, lists, dicts — not ORM objects, not open
connections, not `datetime` objects unless you configure a serializer for
them.

The idiomatic rule: **pass IDs, not objects.** Don't pass a `User` model
instance; pass `user_id` and let the task re-fetch the user from the database
inside the worker. This isn't just a serialization constraint — it's
*correct*, because the task might run seconds later, and you want the fresh
row at execution time, not a stale snapshot from when the request ran.

### Celery: the app, the task, `.delay()`, and the worker

Celery is the most common Python task queue. Four pieces:

1. A **Celery app** object, configured with a broker URL (and optionally a
   result backend URL).
2. **Tasks** — plain functions decorated with `@app.task`, which registers
   them so a worker knows how to run them by name.
3. **Enqueuing** — calling `task.delay(args)` (a shortcut) or
   `task.apply_async(args=[...], ...)` (the full form, for when you need
   options like countdown, queue, or priority) from the producer.
4. Running the **worker** as a separate process: `celery -A app worker`.

`.delay()` returns immediately with an `AsyncResult` — a handle carrying the
task's ID — *not* the task's return value. The return value only exists later,
after a worker runs it, and only if you configured a result backend to store
it. Confusing `.delay()`'s return with the task's return is the single most
common beginner mistake.

### RQ: the simpler alternative, same shape

**RQ** (Redis Queue) is a lighter option: Redis-only, less configuration, no
separate task registration — you enqueue any importable function with
`queue.enqueue(my_func, arg1, arg2)`. It's a good choice when your needs are
modest and you're already on Redis. The four roles are identical; only the
API differs. This track uses Celery because its scheduling, chaining,
retry, and routing features (later modules) are richer, but everything about
the *architecture* transfers directly to RQ. Where it matters we'll note the
RQ equivalent.

## Command reference

| Thing | Celery | Notes |
|---|---|---|
| Define the app | `Celery("app", broker=..., backend=...)` | broker required; backend optional |
| Register a task | `@app.task` decorator | gives the function a name workers resolve |
| Enqueue (simple) | `task.delay(*args, **kwargs)` | returns an `AsyncResult`, not the result |
| Enqueue (full) | `task.apply_async(args=[...], countdown=10, queue="q")` | when you need options |
| Get result handle | `r = task.delay(...)` then `r.id` | the task's ID |
| Check status | `r.status` / `r.state` | `PENDING`, `STARTED`, `SUCCESS`, `FAILURE` |
| Fetch return value | `r.get(timeout=5)` | blocks until done; needs a result backend |
| Run a worker | `celery -A tasks worker --loglevel=info` | separate process from your API |
| Inspect queues | `celery -A tasks inspect active` | what workers are doing now |

The Redis broker via Docker:

```bash
docker run -d --name redis -p 6379:6379 redis:7
# broker URL: redis://localhost:6379/0
```

A first, complete Celery setup — `tasks.py`:

```python
import time
from celery import Celery

# One app object. Broker holds the queue; backend stores results (optional
# but we enable it here so we can inspect return values in exercises).
app = Celery(
    "tasks",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",   # a different Redis DB, tidy but not required
)

@app.task
def add(x, y):
    """A trivial task so we can watch the machinery work end to end."""
    time.sleep(2)          # pretend this is slow work
    return x + y

@app.task
def send_welcome_email(user_id):
    """Fire-and-forget: no return value anyone waits on."""
    # In a real task you'd re-fetch the user by id and send mail here.
    print(f"[worker] sending welcome email to user {user_id}")
```

The producer — a FastAPI handler that enqueues and returns immediately:

```python
from fastapi import FastAPI
from tasks import add, send_welcome_email

api = FastAPI()

@api.post("/signup")
def signup(user_id: int):
    # Do the fast part synchronously, hand off the slow part, return now.
    send_welcome_email.delay(user_id)     # returns instantly
    return {"status": "accepted"}         # respond without waiting for the email

@api.post("/add")
def start_add(x: int, y: int):
    result = add.delay(x, y)              # AsyncResult, NOT 4
    return {"task_id": result.id}         # client polls with this id later
```

Running the two processes (two terminals):

```bash
# terminal 1 — the worker
celery -A tasks worker --loglevel=info

# terminal 2 — the API
uvicorn producer:api --reload
```

## Hands-on exercises

Create a project folder `bg-queues`. You'll build on it through the next
modules. Start Redis via Docker (`docker run -d --name redis -p 6379:6379
redis:7`) and `pip install "celery[redis]" fastapi uvicorn`.

### 1. Watch a task cross the boundary

Create `tasks.py` with the `add` task above and start a worker. In a Python
shell (`python`, then `from tasks import add`), run:

```python
r = add.delay(2, 3)
print(r.id)          # a uuid — the task's id
print(r.status)      # 'PENDING' or 'STARTED' immediately
```

Watch the worker terminal print that it received and executed `add`. Then:

```python
print(r.get(timeout=10))   # 5 — fetched from the result backend
```

Expected: `r.id` prints instantly; `r.get()` blocks ~2s (the `time.sleep`)
then returns `5`. You've watched a message go producer → broker → worker →
result backend and come back.

### 2. Prove `.delay()` doesn't return the result

```python
r = add.delay(10, 20)
print(r)             # <AsyncResult: ...> — an object, not 30
print(r + 1)         # TypeError — it's not a number
```

Expected: a `TypeError`. Internalize this: the producer never sees the return
value directly; it gets a *handle*. This is the whole point — the producer
didn't wait.

### 3. Kill the worker and see the queue absorb work

Stop the worker (Ctrl+C). Now enqueue several tasks:

```python
for i in range(5):
    add.delay(i, i)
```

Nothing runs — there's no worker. Check that Redis is holding the messages:

```bash
docker exec -it redis redis-cli LLEN celery
```

Expected: a non-zero length — the broker is durably holding 5 queued tasks.
Now restart the worker and watch it drain all five in order. This is the
queue doing its job: producers enqueued while no worker existed, and the work
wasn't lost.

### 4. Run the API and confirm the instant response

Start the worker and the FastAPI app. Time the endpoint:

```bash
curl -w "\n%{time_total}s\n" -X POST "localhost:8000/signup?user_id=1"
```

Expected: `{"status":"accepted"}` in a few milliseconds, even though the
worker's `send_welcome_email` sleeps/prints afterward. The user's request did
not wait for the email. Watch the worker log the send *after* curl already
returned.

### 5. Poll a task to completion from HTTP

Add a status endpoint:

```python
from celery.result import AsyncResult
from tasks import app as celery_app

@api.get("/tasks/{task_id}")
def task_status(task_id: str):
    r = AsyncResult(task_id, app=celery_app)
    return {"id": task_id, "status": r.status,
            "result": r.result if r.ready() else None}
```

`POST /add`, grab the `task_id`, then `GET /tasks/{task_id}` repeatedly.
Expected: `PENDING`/`STARTED` for ~2s, then `SUCCESS` with `result: 5`. This
is the standard "submit a job, poll for it" HTTP pattern built on a queue.

### 6. Scale workers and watch concurrency

Enqueue 8 slow `add` tasks, then run a worker with 4 child processes:

```bash
celery -A tasks worker --loglevel=info --concurrency=4
```

Expected: tasks run 4 at a time (watch the log) — 8 tasks finish in ~two
2-second waves instead of ~16 seconds serially. Throughput scales with
worker concurrency; the queue and producer code didn't change at all.

### 7. Serialization failure: pass an object, not an ID

Add a task that (wrongly) expects an object:

```python
@app.task
def greet(user):
    return f"hi {user['name']}"
```

Try to enqueue something non-JSON-serializable:

```python
from datetime import datetime
greet.delay(datetime.now())   # or a custom class instance
```

Expected: an `EncodeError`/`kombu` serialization error — the default JSON
serializer can't encode a `datetime`. Fix it by passing a primitive
(`greet.delay({"name": "ada"})`). Lesson: messages are just data; pass
IDs/primitives, re-fetch objects inside the worker.

### 8. Diagnose and fix: the silent no-op enqueue

A colleague reports "the emails just never send, but there's no error." Their
code:

```python
@api.post("/notify")
def notify(user_id: int):
    send_welcome_email(user_id)      # <-- called directly
    return {"status": "accepted"}
```

Run it with the worker up. Expected: the email logic runs, but **in the web
process, synchronously** — and if `send_welcome_email` were slow, the request
would block for its whole duration. Worse, if they intended it to run on the
worker (e.g. it uses a library only the worker has), it silently runs in the
wrong place. The bug: they called the function instead of enqueuing it. Fix:
`send_welcome_email.delay(user_id)`. Confirm the worker (not the API) now logs
the send. Lesson: `task(...)` runs it here and now; `task.delay(...)` sends it
to the queue.

### 9. Fire-and-forget vs. needing a result

Make `send_welcome_email` a task with no result backend interest, and `add`
one you poll. Notice you never call `.get()` on the email task — you don't
care about its return. Configure `task_ignore_result=True` on a copy of the
email task and confirm no result row is written to Redis DB 1
(`redis-cli -n 1 KEYS 'celery-task-meta-*'`). Expected: results stored for
`add`, not for the ignore-result email task. Lesson: only pay for a result
backend when something actually reads the result.

## Independent challenge

No code given. Using only what this module covered, build a `POST /reports`
endpoint that kicks off a "generate monthly report" task (simulate the work
with a 5-second sleep and a returned dict like `{"rows": 4213}`), returns
`202` with a `task_id` immediately, and exposes a `GET /reports/{task_id}`
endpoint the client polls until the report is ready. Prove with `curl` timing
that `POST /reports` returns in milliseconds while the work happens on the
worker. Run two workers and submit three reports at once; confirm they run
concurrently, not serially.

<details>
<summary>Hint</summary>

You need a result backend configured (the report's return value must be
retrievable), the `apply_async`/`delay` + `AsyncResult(task_id)` pattern from
exercises 5, and `--concurrency` (or multiple worker processes) from exercise
6. The `POST` handler must call `.delay()` and return `result.id` — never
`.get()`, or you'd re-block the request you're trying to free.

</details>

## Common mistakes & troubleshooting

- **Calling `task(args)` instead of `task.delay(args)`.** The first runs the
  function synchronously in your web process — no queue involved. Only
  `.delay()`/`.apply_async()` enqueue. This is the number-one silent bug.
- **Expecting `.delay()` to return the result.** It returns an `AsyncResult`
  handle. The value exists only after a worker runs the task, and only if a
  result backend is configured.
- **Passing non-serializable arguments.** ORM objects, open connections,
  `datetime` (under the default JSON serializer), custom classes — all fail
  or misbehave. Pass IDs and primitives; re-fetch inside the task.
- **No worker running.** Tasks pile up in the broker and nothing happens,
  with no error on the producer side. Always confirm a worker is up
  (`celery -A tasks inspect active`) when "nothing runs."
- **Forgetting the worker is a separate process that must be restarted on
  code change.** Editing a task file doesn't reload a running worker (unless
  you use `--autoreload`/watch tooling). Stale workers run old code.
- **Using the result backend for fire-and-forget tasks.** Storing results
  nobody reads wastes memory in Redis. Set `task_ignore_result=True` (or
  globally) for tasks whose return value you never fetch.
- **Assuming ordering/exactly-once.** A basic queue gives you *at-least-once*
  delivery and no strict cross-task ordering guarantee. Design tasks to be
  safe if run slightly out of order or more than once (module 02 goes deep).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the four roles in a task-queue system and say, in one line each, what
   each one does.
2. What does `task.delay(2, 3)` return, and why isn't it `5`?
3. Why must you pass a `user_id` rather than a `User` object to a task? Give
   both the technical reason and the correctness reason.
4. You enqueue 10 tasks but nothing runs and there's no error on the producer
   side. What's the first thing to check, and how?
5. What's the difference between `send_email(user_id)` and
   `send_email.delay(user_id)` in a request handler, and which one keeps the
   request fast?
6. When do you actually need a result backend, and when is configuring one
   just wasted memory?

<details>
<summary>Answers</summary>

1. **Producer** creates and enqueues a task message; **broker** durably holds
   queued messages until a worker takes one; **worker** is a separate process
   that pulls messages and executes the task function; **result backend**
   (optional) stores task status/return values so the producer can look them
   up later.
2. An `AsyncResult` — a handle carrying the task's ID and a way to query its
   status/result later. It isn't `5` because the producer doesn't run the
   task; a worker does, later, so no return value exists yet at enqueue time.
3. Technical: task arguments are serialized (JSON by default) to travel
   through the broker, and a live ORM object/session isn't serializable.
   Correctness: the task may run seconds later, so you want the *fresh* row
   fetched at execution time, not a stale snapshot from request time.
4. Whether a worker is actually running and connected to the same broker.
   Check with `celery -A tasks inspect active` (or that the worker process is
   up and its broker URL matches the producer's). Tasks silently accumulate in
   the broker when no worker drains them.
5. `send_email(user_id)` calls the function synchronously *in the web
   process* — the request waits for it. `send_email.delay(user_id)` serializes
   a message to the broker and returns instantly; a worker runs it later. The
   `.delay()` form keeps the request fast.
6. You need a result backend when something later reads the task's return
   value or must poll its status (e.g. a "submit job, poll for completion"
   flow). For fire-and-forget tasks (send an email, warm a cache) nothing
   reads the result, so storing it just consumes memory — set
   `task_ignore_result=True`.

</details>

## Next

[01-task-dependencies-and-groups](../01-task-dependencies-and-groups/README.md)
— a single task is rarely the whole story. Next you'll chain tasks so one
feeds the next, fan work out across many tasks and wait for all of them, and
model a real multi-step order-processing pipeline as a graph of tasks.
