# Module 13: Batch ETL Pipeline Orchestration

## Why this matters

Module 03 taught you to schedule a *single* recurring job with Celery
Beat — "run this task every night at 2am." Real data pipelines are
rarely one task: a nightly ETL run typically extracts from three source
tables, transforms each independently, joins them, loads the result into
a warehouse (the OLAP module in track 04), and every one of those steps
depends on the ones before it succeeding. If the extract from one source
fails, running the transform on stale or missing data doesn't just waste
compute — it can silently corrupt a report someone makes a real decision
from. This module covers **dependency-aware pipeline orchestration**: a
purpose-built tool (this module uses Prefect) that understands which
steps depend on which, blocks downstream steps when an upstream step
fails, retries individual steps without restarting the whole pipeline,
and lets you safely re-run a single historical day's data (a
**backfill**) without touching any other day — none of which a bare
cron schedule or a hand-composed sequence of Celery tasks gives you for
free.

## Concepts

### Why this isn't just "another Celery Beat schedule"

Module 03's Celery Beat handles *when* a job runs. Module 01's Celery
chains/groups/chords handle *composing multiple tasks* into a sequence
or fan-out. A dedicated pipeline orchestrator like Prefect combines both
concerns **and** adds the two things neither of those gives you cleanly:
a persisted, inspectable record of every step's success/failure across
runs (so you can actually see "did last Tuesday's load succeed?"), and
first-class support for re-running one specific historical run
(a backfill) independently of the live schedule. You *could* hand-build
all of this on top of Celery primitives — teams did, for years — but a
pipeline orchestrator exists because that hand-built version is a
recurring, solved problem, not a novel one.

### Tasks and flows: naming the same shape you already know

The vocabulary maps directly onto what module 01 already taught:

- A **task** is one unit of work — extract, transform, or load one
  piece — the same idea as a Celery task.
- A **flow** is the orchestration function that calls tasks and defines
  their dependencies through **plain function calls and argument
  passing** — if task B's function call uses task A's return value, B
  depends on A, and the orchestrator understands that without you
  declaring it separately.

```python
from prefect import flow, task

@task
def extract():
    return [1, 2, 3, 4, 5]

@task
def transform(data):
    return [x * 2 for x in data]

@task
def load(data):
    return sum(data)

@flow
def etl_pipeline():
    raw = extract()
    transformed = transform(raw)   # depends on `raw` -> depends on extract()
    return load(transformed)       # depends on `transformed` -> depends on transform()
```

### Failure blocks downstream automatically — no manual checking required

If `extract()` raises, `transform()` and `load()` **never run** — the
orchestrator sees that `transform`'s call depends on `extract`'s result
and doesn't attempt it once that dependency has failed. You don't write
`if extract_succeeded: transform(...)` anywhere; the dependency,
expressed as an ordinary function call, is the whole mechanism.

```
  extract() FAILS
       │
       ▼
  transform() never runs   (its input never existed)
       │
       ▼
  load() never runs        (same reason, one level further)

  Compare to a naive script that "runs the next step regardless" --
  that script would call transform(None) or transform(garbage) and
  either crash confusingly or, worse, silently produce wrong output.
```

### Per-task retries — module 02's discipline, declared once per task

Just like module 02's Celery retry decorator and the durable-workflow
engine's retry policy (module 08, distributed-systems track), a task can
declare its own retry policy, and only *that* task retries — a transient
failure in one extract doesn't restart the whole pipeline from scratch:

```python
@task(retries=3, retry_delay_seconds=30)
def extract_from_flaky_api():
    ...  # only this task's failures are retried, up to 3 times
```

### Backfills: safely re-running one historical partition

A pipeline that processes "yesterday's data" every night needs a way to
re-run **a specific past day** — say, after fixing a bug that corrupted
last Tuesday's numbers — without touching any other day's data or
re-running the live nightly schedule early. The standard technique is
**parameterizing the flow by the date/partition it processes**, so
calling it for a historical date is just calling the same flow with a
different argument:

```python
@flow
def daily_etl(run_date: str):
    data = extract_for_date(run_date)
    load_for_date(data)

# The live schedule calls this with today's date.
# A backfill calls it explicitly for a past date -- same code, different input:
daily_etl(run_date="2026-07-27")
daily_etl(run_date="2026-07-28")
daily_etl(run_date="2026-07-29")
```

For this to be safe, `load_for_date` must be **idempotent per partition**
(module 01's idempotency lesson, applied to data pipelines): re-running
`daily_etl(run_date="2026-07-27")` a second time should replace that
day's data cleanly (e.g. `DELETE ... WHERE date = :run_date` then
insert, or an upsert keyed on the date), not append a second copy
alongside the first.

### DAGs, not just chains: fan-out and fan-in

A real pipeline is rarely one straight line. Multiple independent
extracts can run and feed a single downstream step that combines them —
this is a **DAG** (directed acyclic graph), the same shape module 01's
Celery chords gave you, expressed here as ordinary function calls:

```python
@flow
def multi_source_etl():
    orders = extract_orders()      # independent
    refunds = extract_refunds()    # independent, runs regardless of orders' timing
    return combine(orders, refunds)  # depends on BOTH
```

`combine` only runs once both `extract_orders` and `extract_refunds`
have completed — expressed with no explicit "wait for both" code, purely
by `combine`'s function signature needing both values.

## Command reference

This module uses **Prefect**, a Python-native pipeline orchestrator that
runs entirely locally for development (a lightweight embedded server
starts automatically) — no separate infrastructure required for these
exercises.

| Concern | Prefect (Python) |
|---|---|
| Define a task | `@task` decorator on a function |
| Define a flow (the pipeline) | `@flow` decorator on a function |
| Express a dependency | Pass one task's return value as another task's argument |
| Retry a task automatically | `@task(retries=N, retry_delay_seconds=S)` |
| Run a flow | Call it like a normal Python function: `my_flow()` |
| Run for a specific historical partition (backfill) | Call the flow with an explicit parameter: `my_flow(run_date="2026-07-27")` |

## Hands-on exercises

`pip install prefect`. Everything below runs locally with no external
services — Prefect starts a temporary local server automatically the
first time a flow runs.

### 1. Run a linear ETL pipeline and see the dependency chain execute

```python
from prefect import flow, task

@task
def extract():
    print("extracting raw data...")
    return [1, 2, 3, 4, 5]

@task
def transform(data):
    print("transforming...")
    return [x * 2 for x in data]

@task
def load(data):
    print("loading...")
    return sum(data)

@flow
def etl_pipeline():
    raw = extract()
    transformed = transform(raw)
    result = load(transformed)
    print("RESULT:", result)
    return result

if __name__ == "__main__":
    etl_pipeline()
```

Expected: `extracting raw data...`, `transforming...`, `loading...`, then
`RESULT: 30` — `sum([2,4,6,8,10])`. Each task's completion is logged with
its own status.

### 2. Prove a failed step blocks everything downstream

```python
from prefect import flow, task

@task
def extract():
    raise RuntimeError("source system unavailable")

@task
def transform(data):
    print("transform ran (should NOT happen)")
    return data

@flow
def etl_pipeline():
    raw = extract()
    transformed = transform(raw)
    return transformed

if __name__ == "__main__":
    try:
        etl_pipeline()
    except Exception as e:
        print("FLOW FAILED AS EXPECTED:", e)
```

Expected: `extract` fails and is logged as `Failed`; the string
`"transform ran"` **never prints** — `transform` was never attempted
because its input (`extract`'s return value) never existed. This is the
core dependency-aware behavior, proven by its absence, not asserted.

### 3. Prove per-task retries work without restarting the whole pipeline

```python
from prefect import flow, task

attempt_count = {"n": 0}

@task(retries=3, retry_delay_seconds=1)
def flaky_extract():
    attempt_count["n"] += 1
    print(f"attempt {attempt_count['n']}")
    if attempt_count["n"] < 3:
        raise RuntimeError("transient failure")
    return "data-loaded"

@flow
def etl_pipeline():
    return flaky_extract()

if __name__ == "__main__":
    result = etl_pipeline()
    print("RESULT:", result, "total attempts:", attempt_count["n"])
```

Expected: `attempt 1`, `attempt 2`, `attempt 3`, then
`RESULT: data-loaded total attempts: 3` — the task retried itself
automatically per its `retries=3` policy, with no hand-written retry
loop, exactly like module 02's Celery retries and module 08's
(distributed-systems track) durable-workflow retry policy.

### 4. Run a fan-out/fan-in DAG

```python
from prefect import flow, task

@task
def extract_orders():
    return [10, 20, 30]

@task
def extract_refunds():
    return [5]

@task
def combine(orders, refunds):
    return sum(orders) - sum(refunds)

@flow
def multi_source_etl():
    orders = extract_orders()
    refunds = extract_refunds()
    return combine(orders, refunds)

if __name__ == "__main__":
    print("RESULT:", multi_source_etl())
```

Expected: `RESULT: 55` (`10+20+30-5`) — `combine` correctly waited for
*both* independent extracts, expressed with nothing more than its
function signature needing both values.

### 5. Run a parameterized backfill for three historical dates

```python
from prefect import flow, task

processed_partitions = []

@task
def extract_for_date(run_date: str):
    print(f"extracting data for {run_date}")
    return {"run_date": run_date, "rows": 100}

@task
def load_for_date(data):
    processed_partitions.append(data["run_date"])
    print(f"loaded partition {data['run_date']}")

@flow
def daily_etl(run_date: str):
    data = extract_for_date(run_date)
    load_for_date(data)

if __name__ == "__main__":
    for d in ["2026-07-27", "2026-07-28", "2026-07-29"]:
        daily_etl(run_date=d)
    print("processed partitions:", processed_partitions)
```

Expected: each date is extracted and loaded independently, in order, and
`processed_partitions` ends with all three dates — proving the same
flow code handles both the live nightly run and an explicit historical
backfill, just by varying the `run_date` argument.

### 6. Make the backfill idempotent and prove a re-run doesn't duplicate data

Change `load_for_date` to write into a dict keyed by `run_date` instead
of appending to a list:

```python
warehouse = {}

@task
def load_for_date(data):
    warehouse[data["run_date"]] = data["rows"]  # overwrite, not append
```

Run `daily_etl(run_date="2026-07-27")` **twice** in a row. Expected:
`warehouse["2026-07-27"]` holds one value, not a growing list or a
doubled count — re-running the same partition replaced its data cleanly
instead of duplicating it, exactly the property a real backfill needs
(module 01's idempotency lesson, applied to a data partition instead of
a single task invocation).

### 7. Diagnose and fix: a corrupted report nobody noticed for a week

A nightly pipeline extracts from three source tables, transforms each,
and loads a combined report. One source's extract has been silently
failing for a week — but the team's original hand-rolled script (built
before adopting a real orchestrator) just logged the error and let the
transform/load steps run anyway with whatever partial data it had. The
weekly business report has been wrong for a week with no alert.

<details>
<summary>Solution</summary>

Root cause: the hand-rolled pipeline didn't treat a failed extract as a
reason to block the rest of the pipeline — it logged and continued,
producing a report from incomplete data that looked plausible enough
that nobody caught it. This is exactly the gap module 01's Celery chains
and a bare cron schedule don't close on their own: nothing *enforces*
that a downstream step can't run without its input actually succeeding
unless you write that check yourself, everywhere, correctly, forever.

Fix: express the pipeline as a proper dependency graph (as this module's
flows do) so a failed extract's result never reaches the transform/load
steps at all — they simply never run, and the flow's overall status
shows `Failed`, which is what should have triggered an alert the moment
it happened rather than a week of silently wrong reports. This is the
concrete value of dependency-aware orchestration over "a script that
calls things in order and hopes": the *failure to run* the rest of the
pipeline is the safety mechanism, not a bug to work around.

</details>

### 8. Clean up

```bash
# No persistent services were started; Prefect's temporary local server
# stops automatically when the script exits.
```

## Independent challenge

No code given. Design a nightly ETL pipeline that feeds the star schema
from track 04's OLAP module: extract from `orders`, `customers`, and
`products` source tables (three independent extracts), transform each
into its corresponding dimension/fact shape, then load into the
warehouse in the correct dependency order (dimensions before the fact
table that references them). Specify: (1) the full dependency graph —
which steps can run in parallel and which must wait for others; (2)
which steps need a retry policy and roughly why (which ones call
external/flaky systems vs. which are pure local transforms); (3) how you
would safely backfill just the `orders` data for one specific past week
without re-processing `customers` or `products` for that same window;
(4) what should happen to the fact-table load step if the
`products` extract fails that night.

<details>
<summary>Stuck? One hint</summary>

The three extracts (`orders`, `customers`, `products`) are independent
and can run in parallel (fan-out); each has its own transform step
depending only on its own extract; the fact-table load depends on *all
three* transformed outputs being ready (fan-in), since it needs valid
foreign keys into every dimension. Extracts (calling real source
databases/APIs) deserve retries; pure in-memory transforms usually
don't need them. A backfill parameterizes the flow by date range and
re-runs only the `orders` extract/transform/load for that window,
leaving `customers`/`products` flows completely untouched — they're
separate flow parameters, not entangled in one all-or-nothing script.
If `products` fails, the fact-table load must not run at all (per this
module's core lesson) — better a late, correct report than an on-time,
wrong one.

</details>

## Common mistakes & troubleshooting

- **Letting a pipeline continue after a failed step "because the rest
  might still be useful."** As the diagnose-and-fix exercise showed,
  this is exactly how a silently wrong report ships for a week. A
  failed dependency should block what depends on it, full stop.
- **Treating this as just a fancier cron job.** Module 03's Beat
  schedule handles *timing*; this module's orchestrator handles
  *dependencies between steps and safe historical re-runs* — different
  problems that happen to often show up together in the same pipeline.
- **Non-idempotent backfills.** Re-running a historical partition must
  replace that partition's data, not append a duplicate copy — exercise
  6 demonstrated the fix (overwrite/upsert keyed by partition, not
  blind insert).
- **Retrying every step uniformly regardless of what it does.** A pure
  in-memory transform that raises is a bug, not a transient condition —
  retrying it just delays surfacing the bug. Reserve retry policies for
  steps that call something genuinely flaky (an external API, a
  network call).
- **Forgetting the fan-in case.** A step that depends on multiple
  upstream branches (like `combine` in exercise 4) must wait for *all*
  of them, not just the first to finish — verify this explicitly rather
  than assuming your orchestrator "just handles it" without checking.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between what module 03's Celery Beat solves
   and what this module's pipeline orchestrator solves?
2. How does a task's dependency on another task get expressed in this
   module's flows, and what happens to a downstream task if its
   upstream dependency fails?
3. Why should retries typically be applied per-task rather than
   restarting the whole pipeline from the beginning on any failure?
4. What makes a backfill safe to run repeatedly for the same historical
   partition, and what breaks if that property is missing?
5. In a fan-in DAG where one step depends on two independent upstream
   branches, when does that step actually run?

<details>
<summary>Answers</summary>

1. Celery Beat (module 03) solves *when* a job runs — a schedule.
   This module's pipeline orchestrator solves *dependencies between
   multiple steps* (blocking downstream work on upstream failure) and
   *safe historical re-runs* (backfills) — concerns a bare schedule
   doesn't address on its own, even though a real pipeline usually needs
   both together.
2. A dependency is expressed simply by one task's function call using
   another task's return value as an argument — no separate dependency
   declaration is needed. If the upstream task fails, the downstream
   task that depends on its result never runs at all, because the value
   it needs was never produced.
3. Because a transient failure is usually local to one step (one flaky
   API call, say) — restarting the entire pipeline from scratch wastes
   the work every other, already-successful step already did, and
   delays detecting the real problem. A per-task retry policy retries
   only the step that actually failed.
4. The step that writes data for a given partition must overwrite or
   upsert that partition's data rather than blindly inserting/appending
   — the same idempotency requirement module 01 introduced for a single
   task, applied here to a whole historical partition. Without it, a
   re-run creates duplicate data instead of cleanly replacing what was
   there.
5. Only once **both** upstream branches have completed successfully —
   expressed by the step's function needing both values as arguments,
   with no manual "wait for both" logic required.

</details>

## Further reading & sources

- [Prefect: Flows and tasks](https://docs.prefect.io/v3/develop/write-flows) - the official concept reference for the `@flow`/`@task` model used throughout this module.
- [Prefect: Retries](https://docs.prefect.io/v3/develop/write-tasks#retries) - the per-task retry configuration used in exercise 3.
- [Apache Airflow: Concepts — DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html) - the same dependency-graph idea on the most widely deployed orchestrator, useful for recognizing the pattern regardless of tool.
- [Airflow: Backfill and catchup](https://airflow.apache.org/docs/apache-airflow/stable/dag-run.html#backfill) - a deeper look at backfilling on a platform built specifically around date-partitioned scheduling.
- [Martin Fowler: article on ETL vs. ELT and orchestration](https://martinfowler.com/articles/patterns-of-distributed-systems/) - general distributed-systems patterns background relevant to designing multi-step pipelines correctly.

## Next

[14-object-storage-and-large-files](../14-object-storage-and-large-files/README.md)
— the last building block before the capstone. You'll handle large files
the right way: why they don't belong in your database, object storage
(S3-style) concepts, multipart uploads in FastAPI, chunked/streamed
downloads, and presigned URLs that let clients upload and download
directly to storage without proxying gigabytes through your API.
</content>
