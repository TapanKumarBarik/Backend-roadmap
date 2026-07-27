# Module 04: Logging Fundamentals

## Why this matters

At 3am, when a service is misbehaving and you can't attach a debugger to
production, logs are the story of what happened. They are the single most-used
diagnostic tool in operations — not metrics, not traces, *logs* — because a
log line can carry the exact input, the exact decision, and the exact error
that a metric can only count. The catch is that logs are only as useful as they
are *disciplined*. A codebase full of `print("here")`, `print(user)`, and
`logger.info("done")` produces a firehose of noise that's useless the moment
you actually need it — you can't filter it, you can't search it, you can't
correlate it, and half the important events aren't logged at all.

This module is about the craft of a *good* log: choosing the right **level**
so you can turn the volume up or down without changing code; choosing
**structured** (key/value) output so a machine can filter and aggregate
millions of lines; and knowing **what belongs in a line** so it's actually
useful when you need it and not a liability (the secret-leaking kind from
module 03) when you don't. This is the application-level counterpart to the
`learn/03-kubernetes` observability module: that one covered reading logs
*across a cluster*; this one is about the app *producing* logs worth reading.
Module 05 then covers what happens to those logs once they leave the process —
aggregation, retention, correlation IDs, and the sensitive-data rules in full.

Get this module right and every later one gets easier: good structured logs
feed your metrics (module 06), carry the trace IDs that tie the three pillars
together (module 07), and are the raw material every alert (module 08) is built
on. Get it wrong and you're operating blind with a haystack.

## Concepts

### Log levels and when to use each

A log **level** is a severity tag on each line. Its purpose is *control*: you
emit lines at many levels, and configure a *threshold* per environment so the
process only outputs lines at or above it. Set the threshold to `DEBUG` in dev
to see everything; set it to `INFO` (or `WARNING`) in prod to cut the noise —
*without changing any code*. That's the whole point: levels let one codebase be
chatty in dev and quiet in prod via config (module 02's log-level setting).

The standard ladder, low to high severity, with the real question each answers:

- **DEBUG** — *"what is the code doing, step by step?"* Fine-grained detail for
  diagnosing during development: variable values, branch decisions, "entering
  function X with args Y." Off in prod normally (too voluminous), but
  invaluable when you temporarily raise the threshold to debug a live issue.
- **INFO** — *"what significant, expected thing just happened?"* Normal
  milestones: "server started on port 8000," "order 123 created," "user 45
  logged in," "processed 200 records." The narrative of normal operation. The
  default prod threshold usually starts here.
- **WARNING** — *"something unexpected happened, but we handled it / it's not
  broken yet."* A retry succeeded on the second attempt; a deprecated endpoint
  was called; the cache was unreachable so we fell back to the DB; disk is at
  80%. Warnings are *"look at this soon,"* not *"page someone now."* This is
  also where graceful degradation (module 00) logs — a degraded-but-working
  request.
- **ERROR** — *"an operation failed and a user or task was affected."* A
  request errored, a job failed, an exception we caught but couldn't recover
  from. Something didn't work. Errors should be rare and *actionable* — each
  one ideally corresponds to a real problem worth investigating. This is where
  `logger.exception` (with the traceback) lives.
- **CRITICAL / FATAL** — *"the app itself is going down or is unusable."* Can't
  connect to the database at startup, out of memory, a required dependency is
  gone. Often the last line before the process exits. Rare; each one is a
  fire.

The discipline that makes levels useful:

- **Don't cry wolf.** If routine, handled situations log at `ERROR`, then
  `ERROR` becomes noise and real errors get missed — the direct cause of alert
  fatigue (module 08). A handled fallback is a `WARNING`, not an `ERROR`.
- **Don't hide real problems.** If a genuine failure logs at `INFO` (or not at
  all — module 00's swallowing), it's invisible. Match the level to the actual
  severity.
- **The level *is* the filter.** `ERROR` should mean "someone might need to act";
  keep it clean enough that alerting on "any `ERROR`" is almost sane.

A useful heuristic: *if you'd want to be woken up for it → `ERROR`/`CRITICAL`;
if you'd want to see it in tomorrow's review → `WARNING`; if it's the normal
story → `INFO`; if it's only useful while actively debugging → `DEBUG`.*

### Structured vs unstructured logging

This is the single most consequential choice in the module.

**Unstructured logging** is free-text: a human sentence with values jammed in.

```
2026-07-27 03:14:07 INFO User ada (id 8123) placed order A-4417 for $59.90 from 10.0.0.5 in 142ms
```

Readable by a human, one line at a time. But a *disaster* for machines, which
is what actually reads production logs at scale. To answer "show me all orders
over $50 by user 8123 that took longer than 100ms," a machine has to *parse
that sentence with a regex* — and the regex breaks the moment someone rewords
the message, adds a field, or logs an order id with a space in it. You cannot
reliably filter, aggregate, or graph free text.

**Structured logging** emits each line as machine-readable key/value data —
almost always JSON in production:

```json
{"timestamp": "2026-07-27T03:14:07Z", "level": "info", "event": "order_placed",
 "user_id": 8123, "user_name": "ada", "order_id": "A-4417", "amount": 59.90,
 "client_ip": "10.0.0.5", "duration_ms": 142, "request_id": "3f9a-..."}
```

Now the same question is a trivial query in any log system:
`level=info event=order_placed user_id=8123 amount>50 duration_ms>100`. No
regex, no fragility. Every field is typed, filterable, and aggregatable. This
is *why structured wins*: production logs are read by machines (log
aggregators, dashboards, alerts — modules 05-08), and machines need fields, not
prose.

Concrete advantages of structured logs:

- **Filterable and searchable** by any field, exactly, at scale.
- **Aggregatable** — count errors by `error_type`, average `duration_ms` by
  `endpoint`, without parsing.
- **Correlatable** — attach a `request_id`/`trace_id` (module 05/07) as a field
  and follow one request across every line and every service.
- **Stable** — reword the human `event` name all you like; the *fields* stay
  queryable. Adding a field never breaks existing queries.
- **Context-rich** — you can bind context (the current user, request id) *once*
  and have it appear on every subsequent line automatically (structlog's
  killer feature, below).

The one cost: raw JSON is less pleasant to eyeball than a sentence. The
solution is *not* to go back to free text — it's to render **human-friendly
console output in dev** (colored, aligned) and **JSON in prod**, from the *same*
structured log calls. structlog does exactly this, so you get both without
choosing.

### structlog: structured logging in Python

`structlog` is the de-facto structured logging library for Python. The mental
model: you log an **event name** plus **key/value fields**, and a pipeline of
**processors** transforms each event into the final output (adding a timestamp,
the level, rendering to JSON or pretty console).

```python
import structlog

log = structlog.get_logger()

log.info("order_placed", order_id="A-4417", user_id=8123, amount=59.90)
#         ^event name    ^--- arbitrary structured key/value fields ---^
```

- The **first positional arg is the event name** — a short, stable, snake_case
  identifier (`order_placed`, `payment_failed`), *not* a sentence with values
  interpolated. Keep the variable data in fields, not in the message.
- **Every keyword becomes a queryable field.** Add whatever context helps:
  ids, durations, counts.
- **`log.exception("payment_failed", order_id=...)`** inside an `except` block
  attaches the traceback as structured data (module 00's habit, now structured).

The feature that makes structlog transformative for web apps is
**context binding**: bind fields once (e.g. per request) and every subsequent
log call automatically includes them.

```python
# at the start of a request (in middleware), bind the request id + user once:
structlog.contextvars.bind_contextvars(request_id="3f9a-...", user_id=8123)

# ...anywhere deeper in the request, with no plumbing:
log.info("cache_miss", key="user:8123")
log.info("db_query", table="orders", duration_ms=12)
# BOTH lines automatically carry request_id and user_id — you never passed them
```

This is how you get a `request_id` (from track 02's request-context middleware)
onto *every* log line in a request without threading it through every function
signature — the foundation of the correlation story in module 05.

A production-ready configuration that renders pretty console output in dev and
JSON in prod, driven by config (module 02):

```python
import logging, sys, structlog

def configure_logging(env: str, level: str = "INFO"):
    shared = [
        structlog.contextvars.merge_contextvars,     # pull in bound request context
        structlog.processors.add_log_level,           # add "level" field
        structlog.processors.TimeStamper(fmt="iso"),  # add ISO timestamp
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,         # render exceptions/tracebacks
    ]
    if env == "prod":
        renderer = structlog.processors.JSONRenderer()          # machine-readable
    else:
        renderer = structlog.dev.ConsoleRenderer()              # colored, human dev output
    structlog.configure(
        processors=shared + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

Same `log.info("order_placed", ...)` calls throughout your code; the *output
format* is a config decision, exactly like module 02 preached.

### What belongs in a log line (and what must never)

A good log line answers *what happened, to what, when, in what context, and (if
it failed) why* — as fields. A useful checklist for every line:

**Always present (usually via processors/context, not per-call):**
- **timestamp** (ISO 8601, UTC) — when.
- **level** — severity.
- **event name** — a stable identifier of *what* happened.
- **request_id / trace_id** — the correlation key tying this line to a request
  and (module 07) a distributed trace. Bound once per request.
- **service / environment** — which app and which environment emitted it
  (essential once logs from many services land in one place — module 05).

**Add per-event, whatever makes it actionable:**
- the **identifiers** involved — `user_id`, `order_id`, `job_id` (IDs, not full
  objects).
- **outcome/metrics** — `status`, `duration_ms`, `rows_affected`.
- on failure, the **error type** and the **traceback** (via `log.exception`).

**Must NEVER appear in a log line** (module 05 covers this in full; the rule
starts here):
- **secrets** — passwords, API keys, tokens, session cookies, full auth
  headers. (`SecretStr` from module 03 is your passive guard.)
- **PII beyond what you truly need** — full credit-card numbers (a *class of
  compliance violation*), government IDs, and often full email/name depending
  on your data-protection obligations. Log a `user_id`, not the user's password
  reset token; log that a card was charged, not its number.
- **entire request/response bodies** — they may contain any of the above, and
  they bloat logs. Log the fields you need, not the whole payload.

The mindset: a log line is *written once and read at 3am by someone who wasn't
there*. Give them the IDs and context to reconstruct what happened — and
nothing that turns your log store into a breach waiting to happen.

### Logs are an append-only event stream, not files you manage

A framing that pays off in module 05 and module 10 (factor XI): a modern app
should treat logs as an **unbuffered event stream written to stdout/stderr**,
and *not* concern itself with log files, rotation, or shipping. The app's only
job is to *emit* well-structured events to standard out; the *environment*
(the container runtime, the platform, a log agent) captures that stream and
routes it to aggregation and storage. This is why the structlog config above
uses `PrintLoggerFactory` (write to stdout) rather than opening a file — writing
your own log files inside a container is an anti-pattern that fights the
platform. The app produces the stream; the platform owns its fate. Module 05
picks up exactly where that stream goes.

## Command reference

| Call / pattern | Purpose | Example |
|---|---|---|
| `structlog.get_logger()` | Get a bound logger | `log = structlog.get_logger()` |
| `log.debug/info/warning/error/critical("event", **fields)` | Log at a level with structured fields | `log.info("order_placed", order_id="A-1")` |
| `log.exception("event", **fields)` | Log at ERROR *with* the active traceback (in `except`) | `log.exception("charge_failed", order_id=oid)` |
| `structlog.contextvars.bind_contextvars(**fields)` | Bind fields onto all later logs in this context | `bind_contextvars(request_id=rid)` |
| `structlog.contextvars.clear_contextvars()` | Clear bound context (end of request) | `clear_contextvars()` |
| `structlog.configure(processors=..., wrapper_class=...)` | Set up the processor pipeline once at startup | see Concepts |
| `JSONRenderer()` | Render events as JSON (prod) | processor |
| `dev.ConsoleRenderer()` | Render pretty colored output (dev) | processor |
| `make_filtering_bound_logger(level)` | Drop events below a threshold level | wrapper_class |

**Event name first, values as fields — never interpolate.** Write
`log.info("user_login", user_id=8123)`, *not*
`log.info(f"user {user_id} logged in")`. The f-string version re-creates
unstructured logging (unqueryable, and it defeats aggregation because every
message string is unique).

**Configure once, at startup.** Call `structlog.configure(...)` during app
construction (driven by your `Settings.log_level` / `environment` from modules
02-03), not per log call. The *format* (JSON vs console) and *threshold* are
config decisions.

**Use `log.exception` only inside an `except` block** — it relies on the active
exception. Outside one, use `log.error("event", exc_info=err)` with the
exception object.

## Hands-on exercises

Start a `logging-fundamentals/` project:

```bash
python -m venv .venv && source .venv/bin/activate
pip install "fastapi[standard]" structlog
```

### 1. Levels and thresholds

Configure structlog (console renderer) with a threshold and emit one line at
each level:

```python
import logging, structlog
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),  # threshold
)
log = structlog.get_logger()
for lvl in ("debug", "info", "warning", "error", "critical"):
    getattr(log, lvl)(f"{lvl}_event", detail="x")
```

Expected: with the threshold at `INFO`, the `debug` line does *not* appear; the
other four do. Change the threshold to `DEBUG` and re-run — now all five show.
You just changed log volume without touching a single log call. That's the
point of levels.

### 2. Unstructured vs structured, side by side

Log the same event both ways:

```python
# unstructured
log.info(f"user ada (id 8123) placed order A-4417 for $59.90 in 142ms")
# structured
log.info("order_placed", user="ada", user_id=8123, order_id="A-4417",
         amount=59.90, duration_ms=142)
```

Now imagine querying for "orders over $50." Write down how you'd extract the
amount from each. Expected realization: from the structured line it's the
`amount` field; from the unstructured one you need a fragile regex that breaks
if the wording changes. Switch the renderer to `JSONRenderer()` and re-run — the
structured line becomes clean JSON; the unstructured one is JSON with a useless
single `event` string containing everything.

### 3. JSON in prod, console in dev — same calls

Wrap the Concepts `configure_logging(env, level)` into your project and run
your script once with `env="dev"` and once with `env="prod"`. Expected:
identical `log.info(...)` calls produce colored aligned console output in dev
and one-line JSON in prod — proving format is a config decision, not a code
one.

### 4. Context binding across function calls

```python
import structlog
log = structlog.get_logger()

def charge(order_id):
    log.info("charging")          # no ids passed in — will they appear?

def handle_request(request_id, user_id, order_id):
    structlog.contextvars.bind_contextvars(request_id=request_id, user_id=user_id)
    log.info("request_start", order_id=order_id)
    charge(order_id)
    structlog.contextvars.clear_contextvars()

handle_request("req-1", 8123, "A-4417")
```

Expected: the `charging` line — which passed *no* ids — still carries
`request_id=req-1` and `user_id=8123`, because they were bound once. This is
how a `request_id` reaches every line without plumbing.

### 5. Wire it into FastAPI with per-request context

Add middleware that binds a request id for the duration of each request:

```python
import uuid, structlog
from fastapi import FastAPI, Request
app = FastAPI()
log = structlog.get_logger()

@app.middleware("http")
async def logging_context(request: Request, call_next):
    rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=rid, path=request.url.path)
    log.info("request_start", method=request.method)
    response = await call_next(request)
    log.info("request_end", status=response.status_code)
    response.headers["X-Request-ID"] = rid
    return response

@app.get("/hello")
async def hello():
    log.info("greeting")        # carries request_id + path automatically
    return {"hi": True}
```

Hit `/hello`. Expected: `request_start`, `greeting`, and `request_end` all
share the same `request_id` — three lines you can group into one request's
story.

### 6. Log an error with a traceback, at the right level

```python
@app.get("/boom")
async def boom():
    try:
        1 / 0
    except ZeroDivisionError:
        log.exception("computation_failed", operation="divide")
        raise
```

Hit `/boom`. Expected: an `error`-level line `computation_failed` *with the
full traceback rendered as structured data* — and it carries the request
context from exercise 5. Change `log.exception` to `log.info` and note how
wrong that feels: a real failure logged at `info` is invisible to anyone
filtering for problems.

### 7. Choose the level for six situations

For each, decide the correct level and justify in one line: (a) server finished
starting; (b) a retry to the payment API succeeded on attempt 2; (c) the cache
was down so you served from the DB (slower but correct); (d) a user submitted
an invalid form (`422`); (e) the database is unreachable at startup; (f) a
background job threw an unhandled exception and died.

<details>
<summary>Answers</summary>

(a) **INFO** — normal expected milestone. (b) **WARNING** (or INFO) — it
*worked*, but the fact a retry was needed is worth noticing; not an error since
the outcome was success. (c) **WARNING** — graceful degradation: handled,
working, but you want to know the cache is flaky. (d) **INFO** (or DEBUG) — a
`422` is *normal* client behaviour, not a server problem; logging every
validation failure at `ERROR` is crying wolf. (e) **CRITICAL** — the app can't
function; likely the last line before exit. (f) **ERROR** — an operation
failed and work was lost; log with the traceback (`log.exception`). The theme:
match the level to *who needs to care and how urgently*, and never inflate
normal events to `ERROR`.

</details>

### 8. Diagnose and fix: logs nobody can use

You're handed this. Ops complains: "we can't filter these logs, we can't find a
single request's lines, and last week we found a password in them." Fix every
problem.

```python
@app.post("/login")
async def login(username: str, password: str):
    print(f"login attempt: {username} / {password}")          # (1)
    user = authenticate(username, password)
    if not user:
        log.error(f"login failed for {username}")             # (2)
        return {"ok": False}
    log.info(f"user {username} logged in from {request_ip}")  # (3)
    return {"ok": True}
```

<details>
<summary>Solution</summary>

**(1) — `print` of a secret.** Two crimes: `print` bypasses the logging system
entirely (no level, no structure, no routing — it just splats to stdout
unfiltered), and it logs the **password in plaintext** (module 03/05's cardinal
sin). Fix: delete the line, or if you need to record the attempt, log a
*structured event with the username only* and *never* the password:
`log.info("login_attempt", username=username)`.

**(2) — wrong level + unstructured + not actionable.** A failed login is
*normal* (users mistype passwords constantly), so `ERROR` is crying wolf — it
should be `INFO` or `WARNING`. And it's an f-string, so it's unqueryable. Fix:
`log.info("login_failed", username=username)` — a queryable field, an
appropriate level. (Bonus: don't reveal *why* it failed to the client — module
01's security note.)

**(3) — unstructured, and no correlation.** The values are jammed into a
sentence (`user {username}...`), so you can't filter by user or IP, and there's
no `request_id` to group this line with the rest of the request. Fix:
`log.info("login_succeeded", username=username, client_ip=request_ip)` with a
`request_id` bound in middleware (exercise 5) so every line of the request
shares an id.

Root causes, tying the module together: **use the logging system, not `print`;
event-name + fields, never interpolated sentences; the level must match the
real severity; bind a `request_id` so lines correlate; and never, ever log a
secret.** Fix all three and the ops complaints — "can't filter, can't
correlate, found a password" — all disappear at once, because they were three
symptoms of the same lack of logging discipline.

</details>

## Independent challenge

No code given. Take the `api-layer` service (track 02) or your module-01 error
app and give it a complete logging setup: (1) a single startup configuration
(driven by your **module 03 `Settings`** — log level and env from config) that
renders pretty console output in dev and JSON in prod; (2) a per-request bound
`request_id` (reuse track 02's request-context middleware) that appears on
*every* log line of the request, including inside route handlers and service
functions you never pass it to; (3) correct, deliberate levels — normal
milestones at `INFO`, handled fallbacks at `WARNING`, real failures at `ERROR`
with tracebacks; and (4) a proof that no secret or full request body is ever
logged, using `SecretStr` from module 03 as the guard. Then run one request end
to end and show that you can grep a single `request_id` and reconstruct the
entire request's story from the log alone.

<details>
<summary>Hint</summary>

The "appears on every line without plumbing" requirement is
`structlog.contextvars.bind_contextvars` in your request middleware —
`clear_contextvars()` at the start, bind the id, and every `log.*` call
anywhere downstream in that request inherits it. The "no secret ever logged"
proof is easiest if your config object uses `SecretStr` (module 03): even a
careless `log.info("settings", **settings.model_dump())` then prints
`**********`. For the level discipline, walk your existing routes and ask of
each log call the exercise-7 question: *who needs to care, and how urgently?* —
and downgrade anything that's crying wolf.

</details>

## Common mistakes & troubleshooting

- **`print()` instead of a logger.** No level, no structure, no routing, can't
  be filtered or turned off. Use the logging system for everything.
- **f-string messages (`log.info(f"user {id} did X")`).** Recreates
  unstructured logging — unqueryable, and defeats aggregation because every
  message is unique. Use an event name + fields.
- **Wrong levels — crying wolf.** Logging normal/handled situations at `ERROR`
  makes `ERROR` meaningless and buries real problems (and fuels alert fatigue,
  module 08). Match level to real severity.
- **`log.error("failed")` without the traceback.** Use `log.exception(...)`
  inside `except` blocks so the traceback is captured (module 00's recurring
  lesson).
- **Logging secrets, tokens, or full bodies.** A breach in your log store.
  Never; use `SecretStr`, log IDs not payloads (module 05 in full).
- **No correlation id.** Without a bound `request_id`, you can't reconstruct a
  single request's story from interleaved logs. Bind one per request.
- **Writing log files inside the app/container.** Fights the platform. Emit to
  stdout as a stream; let the environment capture and route it (module 05/10).
- **Configuring logging per call or not at all.** Configure once at startup,
  format and threshold driven by config.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is a log level *for* — what does having levels let you do that a single
   undifferentiated log stream doesn't? Give the prod-vs-dev example.
2. A retry to an external API succeeds on the second attempt. What level, and
   why is `ERROR` the wrong choice?
3. Why does structured (key/value) logging beat unstructured free text for
   production logs? Give a concrete query that's trivial with one and fragile
   with the other.
4. What does `structlog.contextvars.bind_contextvars` let you do, and why is it
   the key to getting a `request_id` on every log line?
5. List four things that must *never* appear in a log line, and name the
   module-03 tool that passively guards against one of them.
6. Why should an app emit logs to stdout as a stream rather than writing and
   rotating its own log files?

<details>
<summary>Answers</summary>

1. Levels are a *severity-based volume control*: you emit at many levels and
   set a per-environment *threshold*, so the same code is chatty (`DEBUG`) in
   dev and quiet (`INFO`/`WARNING`) in prod — changed via config, no code edit.
   A single undifferentiated stream forces you to choose "everything or
   nothing" and gives you no way to filter by importance.
2. **WARNING** (arguably INFO) — the operation ultimately *succeeded*, so it's
   not an error; but the fact a retry was necessary is worth noticing. `ERROR`
   is wrong because it implies a failure that affected a user/task and might
   warrant action — using it here is crying wolf, which desensitizes you to
   real errors.
3. Machines read production logs at scale, and machines need fields, not prose:
   structured logs are filterable/aggregatable/correlatable by exact field,
   and stay queryable even when you reword the message. Example: "orders over
   $50 by user 8123" is `event=order_placed user_id=8123 amount>50` on
   structured logs, but requires a fragile regex over free text that breaks the
   moment the wording changes.
4. It *binds* fields (like `request_id`, `user_id`) into the logging context
   once, so every subsequent `log.*` call in that context automatically
   includes them without being passed the values. That's what lets a
   `request_id` set in middleware appear on every line emitted anywhere deeper
   in the request, without threading it through function signatures.
5. Never: secrets (passwords, API keys, tokens, session cookies/auth headers);
   PII beyond need (full card numbers, government IDs); entire request/response
   bodies; (and generally anything whose exposure is a compliance or security
   problem). Module 03's `SecretStr` passively guards secrets — it renders as
   `**********` even if accidentally logged.
6. Because in modern (containerized/12-factor) deployments the *environment*
   owns log capture, routing, aggregation, and retention — the app's only job
   is to produce a well-structured event stream on stdout. Writing/rotating
   files inside the app fights the platform, doesn't survive ephemeral
   containers, and duplicates what the runtime already does (module 05/10).

</details>

## Next

[05-centralized-logging-and-best-practices](../05-centralized-logging-and-best-practices/README.md)
— you now produce clean, structured, correctly-leveled, secret-free logs on
stdout. Next: what happens to that stream once it leaves the process —
centralized aggregation (why you can't SSH into every box), rotation and
retention, correlation IDs tying back to request context, and the full rules
for keeping sensitive data out. It also carries this track's second cumulative
review.
