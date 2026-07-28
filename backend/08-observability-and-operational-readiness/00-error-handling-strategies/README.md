# Module 00: Error Handling Strategies

## Why this matters

Every backend you'll ever write is mostly a machine for dealing with things
going wrong. The database connection drops mid-query. A downstream API returns
a `503`. A user sends a JSON body that's missing a required field. A bug you
wrote three months ago divides by zero on exactly one row of production data.
The *happy path* — the code that runs when everything works — is the small,
easy part. The difference between a hobby script and a production service is
almost entirely in how it behaves when the happy path doesn't happen.

The failure mode that ends careers isn't the loud crash. It's the *silent*
one: the `except: pass` that swallowed a `KeyError` so a background job quietly
stopped processing payments for six hours, and nobody noticed because there was
no error, no log, no alert — just a number that slowly stopped going up. Loud
failures get fixed. Silent failures get discovered by customers. This whole
track is, at heart, about making a service fail *loudly, safely, and
legibly* — and error handling is the foundation the rest of it is built on.

This module is deliberately framework-light. Before you reach for FastAPI's
exception handlers (module 01), you need a clear model of what an error *is*,
which errors you should catch and which you should let propagate, and what it
means to handle an error *well* versus merely making it stop appearing on your
screen. Get this wrong and every later module — logging, metrics, alerting —
is instrumenting a lie.

## Concepts

### Three kinds of errors: syntax, runtime, logical

Not all errors are the same, and the response to each is different.

- **Syntax errors** are malformed code — a missing colon, an unclosed bracket.
  In Python these are caught at *import/parse time*, before your program runs
  at all. You cannot ship a syntax error to production in the normal sense;
  it fails immediately and locally. These are the *cheapest* errors because
  they're caught earliest. (Type checkers like `mypy` and linters push even
  more errors into this "caught before running" bucket — that's their entire
  value.)

- **Runtime errors** happen while the program is running: a `KeyError`, a
  `ConnectionError`, a `TimeoutError`, a `ZeroDivisionError`. The code is
  valid Python; the *conditions* at runtime made an operation impossible.
  These are what "error handling" usually means — they're the ones you catch,
  translate, retry, or let propagate. They can't be found by reading the code
  alone because they depend on data and on the state of the world.

- **Logical errors** are the worst: the code runs without raising anything,
  and produces the *wrong answer*. You compute a discount as `price * rate`
  when it should be `price * (1 - rate)`. No exception fires. Nothing logs.
  The only defense is tests, assertions, and monitoring that checks *outputs*
  against expectations, not just "did it throw." A logical error that doesn't
  throw is exactly the silent failure this track exists to stamp out.

The mental model: **push errors as far toward "syntax" as you can.** A bug a
type checker catches is cheaper than one a test catches, which is cheaper than
one that raises in production, which is cheaper than a logical error a customer
reports a week later. Every technique in this module is about moving errors
earlier and making the ones that remain impossible to ignore.

```
  cheapest ┌──────────┬─────────┬─────────────┬──────────────────┐ costliest
  to fix   │ syntax   │ type/   │ runtime     │ logical error    │ to fix
           │ error    │ lint    │ error       │ (wrong answer,   │
           │          │ error   │ (raises)    │  no exception)   │
           └──────────┴─────────┴─────────────┴──────────────────┘
   caught:   parse      pre-run    in prod       maybe never
             time       (mypy)     (traceback)   (customer finds it)
             ◄──────── push errors leftward ────────
```

### Fail-fast vs fail-safe

When something goes wrong, you have two broad strategies, and choosing the
right one per situation is a real engineering judgement call.

**Fail-fast** means: stop immediately, loudly, at the first sign that an
assumption is violated. If a required config value is missing at startup,
*crash on boot* rather than starting up and serving broken responses. If a
function receives an argument that should be impossible, raise rather than
guess. Fail-fast is about *not continuing in a corrupted state* — because
every step you take after the corruption makes the eventual damage worse and
the root cause harder to find.

**Fail-safe** (or fail-*soft*) means: when a *non-essential* part fails,
degrade to a reduced-but-working state instead of taking everything down. If
your recommendation service is down, show the page *without* recommendations
rather than returning a `500` for the whole page. If your cache is unreachable,
fall back to the database (slower, but correct) rather than erroring.

The art is knowing which to apply where:

- **Fail-fast on startup and on invariant violations.** Missing secrets,
  unparseable config, a database schema mismatch — crash now, before you take
  traffic. A pod that fails its readiness probe (module 09, and the k8s track)
  and never receives traffic is *far* better than one serving errors.
- **Fail-safe on the request path for non-critical dependencies.** The user's
  core action should still work when the "nice to have" pieces are down.
- **Fail-fast on the request path for *critical* dependencies.** If the
  primary database is down, there is no safe degraded state for a "create
  order" endpoint — return a clean `503`, don't pretend the order succeeded.

The dangerous middle ground is *accidental* fail-safe: a broad `try/except`
that catches everything and returns a default, silently converting a critical
failure into a wrong-but-quiet answer. That's not fail-safe design; that's a
swallowed error wearing a disguise.

```
              something went wrong
                       │
          ┌────────────┴────────────┐
     startup / invariant?      request path?
          │                         │
      FAIL-FAST          ┌──────────┴──────────┐
   crash on boot,   critical dep?         non-critical dep?
   don't take          │                       │
   traffic         FAIL-FAST              FAIL-SAFE
                   clean 503,         degrade + LOG + meter
                   don't fake it      (serve reduced result)
```

### Graceful degradation

Graceful degradation is fail-safe applied deliberately across a whole system.
The principle: **rank your features by how essential they are, and shed the
non-essential ones under failure rather than collapsing entirely.**

A concrete example on an e-commerce product page:

| Component | Essential? | On failure |
|---|---|---|
| Product name, price, "buy" button | Yes | Fail the request (`503`) — the page is pointless without these |
| Inventory count ("3 left!") | No | Hide the badge, serve the page |
| Personalized recommendations | No | Show a generic "popular items" fallback, or nothing |
| Recently-viewed items | No | Omit silently |

The implementation pattern is a scoped `try/except` (or a timeout with a
fallback) around *each* non-essential piece, so one failing component can't
take down the whole response. The critical distinction from "swallowing":
degradation is a **deliberate, logged, and often metered** decision — you log
that recommendations failed and increment a counter (module 06), so the
degradation is *visible* even though the user's request succeeded. Silent
swallowing hides the failure; graceful degradation *contains* it while keeping
it observable.

### Catching errors early vs letting them propagate silently

There's a persistent beginner instinct to wrap everything in `try/except`
"to be safe." This is almost always wrong. The right questions are: *can this
layer actually do something useful about this error?* and *if I catch it here,
does the information survive?*

Catch an error at a layer **only if that layer can meaningfully act on it** —
retry, translate to a domain error, fall back, or add context and re-raise.
If a layer can't do anything useful, it should let the error propagate to one
that can. The worst pattern is catching an error deep in the stack, logging a
useless `"something went wrong"`, and returning `None` — now the caller gets a
`None` it didn't expect, the real exception and its traceback are gone, and the
`None` causes a *second*, unrelated crash somewhere far away with no connection
to the real cause. You've turned one clear error into two confusing ones.

The healthy default is: **let exceptions propagate to a place that can handle
them properly** (in a web app, that's the global handler from module 01), and
only catch earlier when you're adding real value. "Catch early" means catch
*the specific error you can handle* early — not catch *everything* early.

### Never swallow errors

"Swallowing" an error means catching it and then neither handling it nor
re-raising it, so it vanishes without a trace. The canonical crimes:

```python
# CRIME 1: the bare except that eats everything, including KeyboardInterrupt
try:
    result = process(payload)
except:                      # noqa: E722  — catches SystemExit, KeyboardInterrupt too!
    result = None            # the real error is gone forever

# CRIME 2: catch, "log", lose the cause
try:
    charge_card(order)
except Exception:
    logger.error("payment failed")   # WHICH failure? no exception, no traceback
    return {"ok": True}               # and we told the user it worked. it did not.

# CRIME 3: broad catch that hides bugs you didn't anticipate
try:
    total = sum(item.price for item in cart)
except Exception:
    total = 0                # a typo in `.price` (AttributeError) now silently zeroes the bill
```

If you *must* catch broadly (e.g. a top-level worker loop that must not die),
the rule is: **catch, log the full exception with its traceback, and then
either re-raise or record the failure somewhere it will be noticed** — never
just continue as if nothing happened.

```python
try:
    result = process(payload)
except Exception:
    logger.exception("failed to process payload", extra={"payload_id": payload.id})
    metrics_failed.inc()          # make it visible in monitoring (module 06)
    raise                         # or: route to a dead-letter queue, then continue
```

`logger.exception(...)` (inside an `except` block) automatically attaches the
active exception's full traceback — this is the single most important habit in
this module. `logger.error("...")` without it throws the traceback away.

### Custom exception types

Python's built-in exceptions (`ValueError`, `KeyError`) describe *mechanical*
problems. Your application has *domain* problems: "this order can't be
cancelled because it already shipped," "this user isn't allowed to do that,"
"this coupon expired." Modelling those as **custom exception types** lets you
handle them precisely — a `ShippedOrderError` can map to a `409 Conflict`,
while an `InsufficientPermissionsError` maps to `403`, and both are
distinguishable from an unexpected `KeyError` (which is a *bug*, → `500`).

```python
class AppError(Exception):
    """Base for all expected, domain-level errors in this app."""

class NotFoundError(AppError):
    def __init__(self, resource: str, resource_id: str):
        self.resource = resource
        self.resource_id = resource_id
        super().__init__(f"{resource} {resource_id!r} not found")

class ConflictError(AppError):
    """A request that conflicts with current state (e.g. already shipped)."""

class PermissionError(AppError):
    """The caller is authenticated but not allowed to do this."""
```

Two design points that pay off constantly:

1. **A common base class (`AppError`)** lets a global handler distinguish
   *your expected domain errors* (safe to translate into a clean client
   message) from *unexpected exceptions* (bugs — log loudly, return a generic
   `500`). This exact split is the backbone of module 01.
2. **Carry structured data on the exception** (`resource`, `resource_id`) not
   just a string message — so handlers and logs can use the fields, not
   re-parse a sentence.

### Logging errors with stack traces

An error you can't diagnose is barely better than a silent one. The whole
point of catching-and-logging (as opposed to letting it crash, which *also*
logs a traceback) is to record *enough context to fix it*: what operation
failed, on what input, and the full traceback showing *where*.

```python
try:
    user = fetch_user(user_id)
except DatabaseError:
    logger.exception(
        "failed to fetch user",
        extra={"user_id": user_id, "operation": "fetch_user"},
    )
    raise
```

The traceback tells you *where* and *how*; the `extra` fields tell you *on
what*. A traceback alone often isn't enough — "`DatabaseError` on line 40" is
much less useful than the same traceback plus `user_id=8123, operation=
fetch_user`. Module 04 formalizes *what* to put in a log line and why
structured (key/value) beats free-text; for now, the habit to build is:
**every caught error gets its traceback AND the context needed to reproduce
it.**

## Command reference

| Tool / pattern | What it does | When to use |
|---|---|---|
| `raise` | Propagate an exception up the stack | Default — let a competent layer handle it |
| `raise NewError(...) from err` | Re-raise a new type, preserving the original cause | Translating a low-level error to a domain one |
| `raise ... from None` | Suppress the original cause in the chain | Rarely — when the underlying cause is noise/leaky |
| `except SpecificError:` | Catch exactly one (or a tuple of) known type(s) | Whenever you catch — be specific |
| `logger.exception(msg, extra=...)` | Log message + active traceback (inside `except`) | Every caught error you don't re-raise immediately |
| `logger.error(msg, exc_info=True)` | Same traceback capture, outside a bare `except` | When you have the exception object explicitly |
| `contextlib.suppress(Error)` | Deliberately ignore a *specific* expected error | Only when ignoring is genuinely correct |
| custom `AppError` hierarchy | Distinguish domain errors from bugs | Always, in any non-trivial service |
| `assert` | Check an invariant, fail-fast (dev only) | Guarding "impossible" states; **not** for validation |

A note on `assert`: it documents and enforces invariants, but Python strips
`assert` statements when run with `-O` (optimized mode), so **never** use it
for input validation or security checks — use an explicit `raise` for anything
that must hold in production.

Exception chaining, worth internalizing:

```python
try:
    row = db.query(...)
except psycopg.OperationalError as err:
    # translate the low-level driver error into a domain error,
    # but keep the original as __cause__ so the traceback shows BOTH.
    raise ServiceUnavailableError("database unreachable") from err
```

The `from err` is what preserves the chain. The traceback will read
"`ServiceUnavailableError` … *The above exception was the direct cause of the
following*" — you get your clean domain error *and* the root cause. Dropping
`from err` (or worse, `from None`) throws away the diagnostic gold.

## Hands-on exercises

Create a fresh project folder `error-handling/` with a virtualenv. You mostly
need the standard library here; install structlog for the later exercises:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install structlog
```

### 1. Classify three errors

Write a script with three functions, each triggering one category:

```python
# 1. runtime error
def runtime_bug():
    data = {"a": 1}
    return data["b"]            # KeyError at runtime

# 2. logical error (runs fine, wrong answer)
def apply_discount(price, rate):
    return price * rate         # BUG: should be price * (1 - rate)

# 3. syntax error — put this in a separate file and try to import it
# def broken(  :               # uncomment in syntax_demo.py to see the parse error
```

Run each. Expected: `runtime_bug()` raises `KeyError: 'b'` with a traceback;
`apply_discount(100, 0.2)` returns `20` with no error (the dangerous one —
it *looks* fine); the syntax file fails to import at all. Write one sentence
for each on *when* the error was caught (parse time / run time / never).

### 2. See what a swallowed error costs you

```python
def charge(order_id):
    raise ConnectionError("payment gateway timeout")

# BAD
def checkout_bad(order_id):
    try:
        charge(order_id)
        return {"ok": True}
    except Exception:
        return {"ok": True}        # swallowed — customer thinks they paid

print(checkout_bad("A1"))          # {'ok': True}  — a lie
```

Expected: `checkout_bad` returns success despite the charge failing. Now note
there is *no log, no traceback, nothing* — this failure is completely
invisible. This is the single most expensive bug pattern in backend
engineering.

### 3. Fix it with log-and-propagate

Rewrite `checkout` to catch, log the full traceback, and re-raise:

```python
import structlog
log = structlog.get_logger()

def checkout_good(order_id):
    try:
        charge(order_id)
        return {"ok": True}
    except ConnectionError:
        log.exception("charge failed", order_id=order_id)
        raise                       # let a competent layer decide the response
```

Expected: calling `checkout_good("A1")` prints a structured log line *with the
`ConnectionError` traceback* and then propagates the exception. Compare the
console output to exercise 2 — the failure is now impossible to miss.

### 4. Build a custom exception hierarchy

Create the `AppError` / `NotFoundError` / `ConflictError` hierarchy from
Concepts. Write a `cancel_order(order)` that raises `ConflictError` if the
order's status is `"shipped"` and `NotFoundError` if `order is None`. Write a
caller that catches `AppError` and prints a friendly message, but lets any
*other* exception propagate:

```python
try:
    cancel_order(order)
except NotFoundError as e:
    print(f"Nothing to cancel: {e}")
except ConflictError as e:
    print(f"Can't cancel: {e}")
# note: no `except Exception` — a real bug should still crash loudly
```

Expected: domain errors produce friendly messages; if you introduce a typo
(e.g. `order.staus`) the resulting `AttributeError` is *not* caught and crashes
with a traceback — exactly what you want for a bug.

### 5. Preserve the cause with exception chaining

```python
class ServiceUnavailableError(AppError): ...

def fetch_config():
    try:
        return open("/etc/app/config.json").read()
    except FileNotFoundError as err:
        raise ServiceUnavailableError("config missing") from err
```

Trigger it (the file won't exist) and read the traceback carefully. Expected:
you see `ServiceUnavailableError: config missing`, and above it *"The above
exception was the direct cause…"* with the original `FileNotFoundError`. Now
change `from err` to `from None` and re-run — the original cause disappears.
Understand what you just gave up.

### 6. Graceful degradation with scoped fallbacks

Model a product page assembled from four pieces, where the non-essential ones
can fail independently:

```python
def get_product_page(product_id):
    product = get_product(product_id)          # essential — let it propagate
    page = {"product": product}

    try:
        page["recommendations"] = get_recommendations(product_id)
    except Exception:
        log.warning("recommendations unavailable", product_id=product_id)
        page["recommendations"] = []           # degrade, but LOG it

    try:
        page["inventory"] = get_inventory(product_id)
    except Exception:
        log.warning("inventory unavailable", product_id=product_id)
        page["inventory"] = None               # hide the badge
    return page
```

Make `get_recommendations` raise. Expected: the page still renders with an
empty recommendations list, a `warning` is logged, but the *essential* product
data is untouched. Then make `get_product` (essential) raise — confirm the
whole request fails, because there's no safe degraded state without it.

### 7. Fail-fast on startup

Write a `load_settings()` that reads a required `DATABASE_URL` from the
environment and **raises immediately** if it's missing:

```python
import os, sys

def load_settings():
    url = os.environ.get("DATABASE_URL")
    if not url:
        # fail-fast: better to crash on boot than serve broken requests
        raise RuntimeError("DATABASE_URL is required but not set")
    return {"database_url": url}

if __name__ == "__main__":
    try:
        settings = load_settings()
    except RuntimeError as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(1)          # non-zero exit — an orchestrator will not route traffic here
```

Run it once without `DATABASE_URL` (crashes with exit code 1) and once with it
set. Expected: no `DATABASE_URL` → immediate fatal exit; set → clean start.
This is the pattern module 02/03 formalizes with Pydantic Settings.

### 8. Diagnose and fix: the error handler that hides the real cause

You're handed this worker loop. Reports say "the queue processor sometimes
stops making progress but never crashes." Find and fix the two bugs.

```python
def process_forever(queue):
    while True:
        job = queue.get()
        try:
            handle(job)
        except Exception as e:
            log.error("job failed")          # bug A
            continue                          # bug B?
```

<details>
<summary>Solution</summary>

**Bug A — the traceback is thrown away.** `log.error("job failed")` records a
useless message with *no* exception info: you can't tell whether it was a
transient `TimeoutError` (retryable) or an `AttributeError` (a code bug that
will fail *every* time). Fix: `log.exception("job failed", job_id=job.id)` (or
`log.error(..., exc_info=True)`) so the full traceback and the offending job's
id are recorded.

**Bug B is subtler — `continue` isn't wrong by itself, but *unconditional*
continue-on-everything is.** A worker loop *should* keep running past a single
bad job (that's legitimate fail-safe design — one poison message shouldn't kill
the consumer). The bug is that it continues *silently and identically* for
every error type, so a systemic failure (e.g. the database is down and *every*
job now fails) looks exactly like one bad job — the loop spins, logs a flood of
useless "job failed" lines, and makes no progress, "never crashing" exactly as
reported. The fix is to make the failure *visible and actionable*: log with the
traceback (Bug A), increment a failure metric (module 06) so a spike is
alertable (module 08), and route the poison job to a dead-letter queue instead
of dropping it. Optionally, a circuit-breaker: if N consecutive jobs fail, stop
and fail-fast rather than spin forever.

```python
def process_forever(queue, dead_letter):
    consecutive_failures = 0
    while True:
        job = queue.get()
        try:
            handle(job)
            consecutive_failures = 0
        except Exception:
            log.exception("job failed", job_id=job.id)   # fix A: traceback + context
            jobs_failed_total.inc()                       # fix: make it visible
            dead_letter.put(job)                          # fix: don't lose the job
            consecutive_failures += 1
            if consecutive_failures >= 10:
                log.critical("10 consecutive failures — halting", extra={"last_job": job.id})
                raise                                     # fail-fast on a systemic problem
```

The lesson: "never crashes" is not automatically good. A loop that never
crashes but silently stops doing useful work is *worse* than one that crashes,
because at least a crash gets noticed. Fail-safe (survive one bad job) and
fail-fast (halt on a systemic problem) are both correct — applied to the right
situations.

</details>

## Independent challenge

No code given. Using only what's in this module, take a plain function
`transfer_funds(from_acct, to_acct, amount)` that talks to a database and an
external fraud-check API, and give it a *complete* error-handling strategy.
Decide, and write down your reasoning for, each of these: which failures are
fail-fast and which are fail-safe; which get a custom exception type and what
the hierarchy is; where you catch versus let-propagate; what each caught error
logs (and whether it re-raises); and which non-essential step (hint: the fraud
check might be *advisory*) could degrade gracefully versus which (the actual
debit/credit) must never silently succeed-or-fail. You should not need a web
framework — this is pure error-handling design, the exact thinking module 01
will then wire into FastAPI.

<details>
<summary>Hint</summary>

The money movement itself is the critical, must-fail-fast, must-never-swallow
operation — a swallowed error here is the exercise-2 catastrophe with real
dollars. The fraud check is where the interesting judgement lives: is a fraud
API *timeout* a reason to block a legitimate transfer (fail-closed, treat
unavailable as "deny") or to allow it and flag for review (fail-open, degrade
gracefully)? There's no universally right answer — but there *is* a wrong
answer, which is to make that decision *accidentally* via a broad `try/except`
instead of deliberately. Whatever you choose, it must be logged and metered so
the degradation is visible.

</details>

## Common mistakes & troubleshooting

- **Bare `except:` (no exception type).** Catches `KeyboardInterrupt` and
  `SystemExit` too, so you can't even Ctrl-C the process. Always catch
  `Exception` at the broadest, and prefer specific types.
- **`log.error("failed")` instead of `log.exception(...)` inside an except
  block.** Throws the traceback away — the single most common way people
  cripple their own debugging. Inside `except`, use `logger.exception`.
- **Broad `try/except` that returns a default.** Silently converts unexpected
  bugs (a typo, a missing attribute) into wrong-but-quiet answers. Catch the
  *specific* error you expect; let the rest propagate.
- **`raise NewError()` without `from err`.** Loses the original cause from the
  traceback. Use `raise NewError(...) from err` when translating.
- **Using `assert` for validation.** `python -O` strips asserts; the check
  vanishes in production. Use an explicit `raise` for anything that must hold.
- **Catching too early "to be safe."** If the layer can't do anything useful
  with the error, don't catch it there — let it reach a layer that can.
- **Treating "it never crashes" as success.** A service that silently stops
  doing work is worse than one that crashes loudly. Loud beats silent, always.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What are the three categories of error, and at what point (parse time /
   run time / possibly never) is each typically caught? Which is the most
   dangerous and why?
2. Give a concrete example each of when fail-fast is the right strategy and
   when fail-safe is, and name the dangerous "accidental fail-safe" pattern.
3. What does it mean to "swallow" an error, and what's the minimum you must do
   if you genuinely need to catch broadly in, say, a top-level worker loop?
4. Why is `logger.exception(...)` (or `exc_info=True`) inside an except block
   so important compared to `logger.error("something failed")`?
5. What's the point of a custom `AppError` base class shared by all your
   domain exceptions — how does a global handler use it?
6. What does `raise NewError(...) from err` give you that `raise NewError(...)`
   alone does not?

<details>
<summary>Answers</summary>

1. **Syntax errors** — caught at parse/import time, before the program runs.
   **Runtime errors** — caught while running (they depend on data/state).
   **Logical errors** — the code runs and raises nothing but produces a wrong
   answer, so they may be caught *never* (until a customer or a test notices).
   Logical errors are the most dangerous precisely because there's no exception
   to alert you — they're the archetypal silent failure.
2. **Fail-fast:** a missing required secret/config at startup — crash on boot
   rather than serve broken responses (also: violated invariants). **Fail-safe:**
   a non-essential dependency (recommendations, cache) failing on the request
   path — degrade to a reduced-but-correct response. The dangerous accidental
   version is a broad `try/except` that returns a default, silently turning a
   critical failure into a wrong-but-quiet answer.
3. Swallowing = catching an exception and then neither handling it meaningfully
   nor re-raising it, so it vanishes with no log/trace. If you must catch
   broadly, the minimum is: log the full exception *with its traceback*
   (`logger.exception`), make it visible to monitoring (increment a failure
   metric / dead-letter the item), and then either re-raise or record the
   failure somewhere it will be noticed — never just `continue` as if fine.
4. `logger.exception` (and `logger.error(..., exc_info=True)`) automatically
   attaches the active exception's *full traceback and type*; a plain
   `logger.error("failed")` records only a message, throwing away the where and
   the how — you can't tell a retryable transient error from a code bug.
5. A shared base lets a global handler cleanly split *expected domain errors*
   (subclasses of `AppError` — safe to translate into a specific, friendly
   client response) from *unexpected exceptions* (bugs — log loudly, return a
   generic `500`). It's the single `except AppError` vs `except Exception` fork
   that module 01 is built around.
6. `from err` preserves the original exception as the `__cause__`, so the
   traceback shows *both* your clean domain error and the underlying root cause
   ("the above exception was the direct cause of…"). Without it, you keep only
   the new error and lose the diagnostic trail to what actually went wrong.

</details>

## Further reading & sources

- [Python: Errors and Exceptions](https://docs.python.org/3/tutorial/errors.html) - the language reference on exceptions, chaining (`raise ... from`), and `try`/`except` semantics used throughout this module.
- [Python logging: `logger.exception`](https://docs.python.org/3/library/logging.html#logging.Logger.exception) - the standard-library method that captures the active traceback, the single most important logging habit here.
- [Google SRE Book — Handling Overload](https://sre.google/sre-book/handling-overload/) - how graceful degradation and load-shedding keep a service usefully alive instead of collapsing entirely.
- [Martin Fowler — Fail Fast](https://www.martinfowler.com/ieeeSoftware/failFast.pdf) - the canonical short essay on why crashing loudly at the first sign of a broken assumption beats limping on.
- [AWS Builders' Library — Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) - practical guidance on retrying transient failures without amplifying an outage.

## Next

[01-global-error-handlers-and-user-facing-errors](../01-global-error-handlers-and-user-facing-errors/README.md)
— you now have a strategy and a custom exception hierarchy; next you'll wire
that hierarchy into FastAPI with a single centralized handler that turns your
domain errors into safe, consistent client responses and your bugs into clean
`500`s that never leak a stack trace.
