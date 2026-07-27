# Module 03: Scheduling Recurring Jobs

## Why this matters

Not all background work is triggered by a user action. Some of it has to
happen *on a clock*: back up the database every night at 02:00, delete
expired sessions every ten minutes, send the weekly digest every Monday at
09:00, sync exchange rates every hour, roll up yesterday's analytics at
midnight. Nobody clicks a button for these — they need a scheduler that fires
tasks on a recurring cadence whether or not anyone is looking.

This is where a lot of teams reach for the operating system's `cron` and a
one-line crontab. That works until it doesn't: cron runs a *command* on *one
machine*, so it doesn't compose with the queue you just built (no retries, no
result tracking, no visibility), and if that machine is down at 02:00 the
backup simply never happens. Worse, the moment you run for high availability
— two copies of your scheduler so one dying doesn't stop the clock — you've
created a new bug: *both* copies fire the 02:00 backup, and now you have two
backups running at once, or two "weekly digest" emails hitting every user.

This module covers scheduling that integrates with your task queue (Celery
Beat and APScheduler), the real use cases, and — the part that separates
people who've operated this from people who've only read about it — how to
guarantee a scheduled job runs *once* even when the scheduler itself is
replicated.

## Concepts

### Two schedulers: Celery Beat and APScheduler

**Celery Beat** is a scheduler process that ships with Celery. It doesn't run
tasks; it *enqueues* them on a schedule. You define a `beat_schedule` mapping
names to (task, cadence, args), start `celery -A app beat` alongside your
workers, and Beat drops a message onto the broker every time an entry is due.
The task then runs on a normal worker — so it inherits everything from the
last two modules: retries, priority queues, idempotency, result tracking. This
is the natural choice when you already have Celery.

**APScheduler** (Advanced Python Scheduler) is a standalone library that runs
scheduled jobs *inside* a Python process — it can call a function directly or,
better in a web app, enqueue a Celery task. It's lighter than Beat, supports
cron/interval/one-off triggers, and can persist its job store to a database so
schedules survive restarts. Use it when you're not on Celery, or when you need
dynamic schedules created at runtime (Beat's schedule is mostly static
config).

Both share the core split: **the scheduler decides *when*; the worker decides
*how*.** Keep the scheduled entry a thin trigger that enqueues a real task;
don't do heavy work inside the scheduler process itself.

```
  cron entry            scheduler (Beat)         broker        worker
  "0 2 * * *"  ──tick──► due? enqueue msg ──────► queue ─────► run backup_database()
  (the WHEN)            (thin: no work here)                   (the HOW: retries,
                                                                idempotency, result)
```

### Cron expressions and interval schedules

A **cron expression** is five fields — minute, hour, day-of-month, month,
day-of-week — describing *when* something recurs. `0 2 * * *` is "at 02:00
every day"; `*/10 * * * *` is "every 10 minutes"; `0 9 * * 1` is "09:00 every
Monday." Celery expresses these with `crontab(...)`; APScheduler with a
`CronTrigger`. For "every N seconds/minutes" that isn't clock-aligned, an
**interval** schedule (`timedelta` / `IntervalTrigger`) is simpler than
faking it with cron.

The one that trips everyone up is **timezones**. A cron schedule fires
according to whatever timezone the scheduler is configured for. If you don't
set it, you may be running "midnight" in UTC when you meant local — and DST
transitions can make a daily job skip or double a run. Always set the
scheduler's timezone explicitly and know whether your `0 2 * * *` means 02:00
UTC or 02:00 in some region.

### Real use cases

- **Database backups** — `0 2 * * *`, off-peak, then verify and ship the dump
  to object storage (module 09).
- **Cleanup jobs** — expire sessions, prune soft-deleted rows, delete stale
  cache entries and old log files, delete finished-task result rows so Redis
  doesn't fill up. Usually every few minutes to hourly.
- **Recurring notifications** — daily reminders, weekly digests, monthly
  invoices. These are the highest-risk for the duplicate-run problem because a
  double run means users get *two* emails.
- **Data sync jobs** — pull exchange rates / third-party data hourly, refill
  the rate-limit token buckets from module 02 every second, recompute a
  materialized view.

Every one of these should be an *idempotent* task (module 02): a cleanup that
runs twice should be harmless; a digest that somehow fires twice must dedupe
so users don't get two copies.

### The duplicate-run problem when the scheduler is replicated

Here's the trap. A single Beat process is a single point of failure — if it's
down, nothing gets scheduled. The obvious fix is to run two Beat processes for
high availability. But now **both** are ticking through the same schedule, and
at 02:00 *both* enqueue the backup task. You get duplicate runs of everything.

```
  BUG: two Beats, no guard          FIX: single execution via a window lock
  Beat A ─02:00─► enqueue ─► run     Beat A ─► SET lock:backup:2026-07-27 NX ─► WON ─► run
  Beat B ─02:00─► enqueue ─► run     Beat B ─► SET lock:backup:2026-07-27 NX ─► lost ─► no-op
        = TWO backups (bad)                = ONE backup; loser skips
```

There are three correct answers, in rough order of preference:

1. **Run exactly one scheduler.** For Celery Beat specifically, the
   recommendation is to run a *single* Beat instance — Beat is not designed to
   be run redundantly. You get availability from fast restart (a supervisor /
   Kubernetes Deployment with replicas=1 that reschedules the pod on failure),
   not from running two. A brief gap while it restarts is usually fine for
   cron work; a duplicate digest email to every user is not.

2. **A distributed lock around the *task*.** Even with one scheduler, belt-
   and-suspenders: the scheduled task acquires a short-lived Redis lock keyed
   by job-name + time-window (`SET lock:backup:2026-07-27 NX EX 3600`) and
   only proceeds if it won the lock. If two schedulers (or a retry) fire the
   same logical run, only the lock-winner does the work; the others no-op.
   This is the same idempotency principle from module 02, applied to a
   time-window key.

3. **A leader-election / single-active mechanism.** For APScheduler running in
   multiple app instances, either designate one instance as the scheduler, or
   use a shared, locking job store so only one instance fires each job. The
   principle is identical: exactly one actor should own each scheduled run.

The mental model to carry away: **redundant schedulers cause duplicate runs
unless something guarantees single execution.** The distributed lock keyed by
a time window is the most robust general answer, and it composes with the
"single Beat" recommendation rather than replacing it.

### Missed runs, overlap, and catch-up

Two more operational realities. **Missed runs:** if the scheduler was down
when a job was due, does it run late on recovery ("catch-up"/misfire) or skip?
APScheduler exposes `misfire_grace_time` and `coalesce` for exactly this;
decide per job (a backup you probably want to catch up; a "send at 9am"
notification you probably want to skip if it's now noon). **Overlap:** if a
job runs every 5 minutes but sometimes takes 8, a naive scheduler starts a
second copy while the first is still running. Guard long jobs with a lock (or
`max_instances=1` in APScheduler) so they don't stack.

## Command reference

| Concern | Celery Beat | APScheduler |
|---|---|---|
| Daily at 02:00 | `crontab(hour=2, minute=0)` | `CronTrigger(hour=2, minute=0)` |
| Every 10 minutes | `crontab(minute="*/10")` | `IntervalTrigger(minutes=10)` |
| Every 30 seconds | `timedelta(seconds=30)` | `IntervalTrigger(seconds=30)` |
| Weekly Mon 09:00 | `crontab(hour=9, minute=0, day_of_week=1)` | `CronTrigger(day_of_week="mon", hour=9)` |
| Start the scheduler | `celery -A app beat` | `scheduler.start()` in-process |
| Set timezone | `app.conf.timezone = "UTC"` | `BackgroundScheduler(timezone="UTC")` |
| Prevent overlap | distributed lock in task | `max_instances=1` |
| Catch up missed runs | (handle in task) | `misfire_grace_time`, `coalesce` |

Celery Beat schedule — `celeryconfig` on the app:

```python
from celery import Celery
from celery.schedules import crontab
from datetime import timedelta

app = Celery("scheduled", broker="redis://localhost:6379/0",
             backend="redis://localhost:6379/1")
app.conf.timezone = "UTC"          # be explicit — don't inherit the host's tz

app.conf.beat_schedule = {
    "nightly-backup": {
        "task": "scheduled.backup_database",
        "schedule": crontab(hour=2, minute=0),          # 02:00 UTC daily
    },
    "cleanup-sessions": {
        "task": "scheduled.cleanup_expired_sessions",
        "schedule": crontab(minute="*/10"),             # every 10 min
    },
    "refill-rate-tokens": {
        "task": "scheduled.refill_tokens",
        "schedule": timedelta(seconds=1),               # module 02's bucket
    },
    "weekly-digest": {
        "task": "scheduled.send_weekly_digest",
        "schedule": crontab(hour=9, minute=0, day_of_week=1),  # Mon 09:00
    },
}
```

The scheduled tasks, with a distributed lock guaranteeing single execution:

```python
import redis
_r = redis.Redis()

def with_lock(key, ttl):
    """Return True only for the caller that wins the lock for this window."""
    return bool(_r.set(key, "1", nx=True, ex=ttl))

@app.task
def backup_database():
    # Key by the calendar day so two schedulers on the same day collide.
    from datetime import date
    if not with_lock(f"lock:backup:{date.today().isoformat()}", ttl=3600):
        return "skipped: another run holds the lock"
    dump = do_pg_dump()
    upload_to_object_storage(dump)     # module 09
    return "backed up"

@app.task
def cleanup_expired_sessions():
    n = delete_sessions_older_than(minutes=30)   # naturally idempotent
    return f"deleted {n} sessions"

@app.task
def send_weekly_digest():
    for user_id in users_wanting_digest():
        # dedupe per user per ISO week so a double run can't double-send
        send_digest.delay(user_id, week=iso_week_key())
```

Running it (three processes now):

```bash
celery -A scheduled worker --loglevel=info      # runs the tasks
celery -A scheduled beat   --loglevel=info      # fires them on schedule (ONE instance)
docker run -d -p 6379:6379 redis:7              # broker + lock store
```

APScheduler enqueuing a Celery task, for comparison:

```python
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

sched = BackgroundScheduler(timezone="UTC")
sched.add_job(lambda: backup_database.delay(),
              CronTrigger(hour=2, minute=0),
              id="nightly-backup", max_instances=1, coalesce=True,
              misfire_grace_time=3600)
sched.start()
```

## Hands-on exercises

Continue in `bg-queues`. `pip install apscheduler`. You'll run a worker *and*
a beat process.

### 1. A first Beat schedule you can watch

Add a fast entry so you don't wait for a real cron time:

```python
app.conf.beat_schedule = {
    "tick": {"task": "scheduled.tick", "schedule": timedelta(seconds=5)},
}
@app.task
def tick():
    import datetime; print("tick", datetime.datetime.utcnow())
```

Run `celery -A scheduled worker` and `celery -A scheduled beat` in two
terminals. Expected: the worker prints `tick` every ~5 seconds — Beat enqueues
it, the worker runs it. Stop Beat: ticks stop (the scheduler, not the worker,
drives timing). Restart Beat: ticks resume.

### 2. A cron entry and a timezone check

Change `tick` to `crontab(minute="*/1")` (every minute on the minute) and set
`app.conf.timezone = "UTC"`. Expected: it fires at the top of each minute in
UTC. Temporarily set the timezone to `"America/New_York"` and note that
`crontab(hour=2)` would now mean 02:00 Eastern, not UTC — the same expression,
a different wall-clock moment. Set it back to UTC.

### 3. Verify a cleanup task is idempotent

Write `cleanup_expired_sessions` against an in-memory dict of
`{session_id: expiry}` and schedule it every 10 seconds. Run it, then run it
again immediately by enqueuing manually. Expected: the second run deletes
nothing new and errors on nothing — deleting already-deleted things is a
no-op. This is why cleanups are safe to run often and to double-run.

### 4. Simulate two schedulers and see the duplicate run

Start **two** Beat processes against the same broker with a schedule that
fires `backup_database` every 15 seconds, but *remove* the lock for now.
Expected: you see `backed up` printed *twice* per interval — both Beats
enqueued it, two workers ran it. This is the duplicate-run bug, reproduced.

### 5. Add the distributed lock and fix it

Restore the `with_lock(...)` guard in `backup_database`, keyed by a short time
window (e.g. `int(time.time()) // 15`). Re-run the two Beats. Expected: now
each interval prints `backed up` **once** and `skipped: another run holds the
lock` once — only the lock-winner does the work. You've made a replicated
scheduler safe.

### 6. Prevent overlap on a slow job

Schedule a task every 5 seconds that sleeps 8 seconds, guarded by
`with_lock("lock:slowjob", ttl=8)`. Expected: runs don't stack — while one is
mid-flight, the next tick's attempt finds the lock held and skips, so you
never have two overlapping copies. Remove the lock and watch copies pile up.

### 7. APScheduler enqueuing a Celery task

Stand up the `BackgroundScheduler` from the reference with an
`IntervalTrigger(seconds=5)` that calls `tick.delay()`. Expected: identical
behavior to Beat — APScheduler decides *when*, the Celery worker runs the
task. Note `max_instances=1` prevents overlap at the scheduler level too.

### 8. Missed-run behavior

With APScheduler, add a job with `misfire_grace_time=10` and `coalesce=True`,
start the scheduler, then pause your machine/process for longer than the
interval (or set the interval short and block the event loop briefly).
Expected: on recovery, coalesced misfires collapse into a single catch-up run
rather than a burst of back-to-back runs. Decide per job whether that's what
you want.

### 9. Diagnose and fix: the weekly digest that sends twice

Users report occasionally getting the Monday digest **twice**. Investigation
shows the team runs two Beat replicas "for reliability," and the digest task
is:

```python
@app.task
def send_weekly_digest():
    for user_id in users_wanting_digest():
        send_email(user_id, build_digest(user_id))   # no dedupe
```

Explain the root cause (two schedulers both fire the 09:00 entry) and give the
two-layer fix: (1) run a single Beat instance (availability via fast restart,
not redundancy), and (2) make the send idempotent per user per week so *even
if* it fires twice, each user gets at most one digest.

<details>
<summary>Solution</summary>

Root cause: Celery Beat isn't designed to run redundantly — two Beat
processes each independently reach the `day_of_week=1, hour=9` entry and each
enqueue `send_weekly_digest`, so the whole digest run happens twice. Fix:

```python
@app.task
def send_weekly_digest():
    week = iso_week_key()                    # e.g. "2026-W30"
    if not with_lock(f"lock:digest:{week}", ttl=3600):
        return "another run owns this week"  # only one run proceeds
    for user_id in users_wanting_digest():
        send_digest.delay(user_id, week=week)

@app.task
def send_digest(user_id, week):
    # unique constraint on (user_id, week) makes the insert-then-send atomic
    if already_sent(user_id, week):
        return "already sent"
    send_email(user_id, build_digest(user_id))
    mark_sent(user_id, week)
```

Plus: run **one** Beat instance under a supervisor that restarts it, instead
of two. The lock keyed by ISO week guarantees the *run* happens once; the
per-user `(user_id, week)` uniqueness guarantees each *user* is emailed once
even if something slips through. Two independent guards, because a duplicate
email to every user is a serious incident. This is module 02's idempotency
applied to a scheduled, time-windowed job.

</details>

## Independent challenge

No code given. Build a scheduled "expire and notify" system: every 15 minutes,
find trial accounts that expired in the last window and (a) downgrade them and
(b) enqueue a "your trial ended" email — running correctly even though you
deploy the scheduler as two replicas for availability. Requirements: the
downgrade must be idempotent (running the sweep twice must not double-process
an account), the email must be dedup'd per account, the sweep must not overlap
itself if a run takes longer than 15 minutes, and the schedule's timezone must
be explicit. Prove correctness by running two schedulers at once and
confirming each expired account is downgraded once and emailed once.

Reuse the distributed-lock-by-time-window pattern from exercise 5, the
overlap guard from exercise 6, and the per-recipient dedupe from
[02-retries-prioritization-and-rate-limiting-in-queues](../02-retries-prioritization-and-rate-limiting-in-queues/README.md).

<details>
<summary>Hint</summary>

Two independent locks/guards, not one: a window lock
(`lock:trial-sweep:{window}`) so only one scheduler runs the *sweep* per
15-minute window, and a per-account guard (unique `(account_id, "trial_ended")`)
so the *email* can't double-send even across windows or retries. The
downgrade should be a conditional update (`SET status=free WHERE
status=trial`), which is naturally idempotent.

</details>

## Common mistakes & troubleshooting

- **Running redundant Beat instances.** Two Beats double every scheduled run.
  Run exactly one, get availability from fast restart, and/or guard tasks with
  a distributed lock keyed by the time window.
- **Non-idempotent scheduled tasks.** A cleanup or notification that isn't
  safe to run twice will eventually cause damage (double emails, double
  processing) on a retry, catch-up, or duplicate schedule. Every scheduled
  task should be idempotent.
- **Unset or wrong timezone.** `0 2 * * *` fires at a different wall-clock
  moment depending on the scheduler's timezone, and DST can skip/double a
  daily run. Set `timezone` explicitly and know what your cron means.
- **Doing heavy work in the scheduler process.** Beat/APScheduler should
  *enqueue* a task, not perform the work — keep the scheduler thin so a slow
  job can't block the clock. Let workers do the work.
- **Overlapping runs of a slow job.** A job that sometimes runs longer than
  its interval gets a second copy started on top. Guard with a lock or
  `max_instances=1`.
- **No plan for missed runs.** If the scheduler was down when a job was due,
  decide explicitly whether it catches up or skips (`misfire_grace_time`,
  `coalesce`) — don't leave it to chance.
- **Assuming cron on one box is "good enough."** OS cron doesn't integrate
  with your queue's retries/visibility and dies with the box. Prefer a
  scheduler that enqueues real tasks.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the division of responsibility between the scheduler (Beat/
   APScheduler) and the worker? Why keep the scheduled entry thin?
2. You run two Celery Beat processes for high availability. What breaks, and
   what are the two layers of fix?
3. Why must every scheduled task be idempotent, even ones that "obviously only
   run on a timer"?
4. What does a distributed lock keyed by a *time window* (rather than just the
   job name) buy you over a lock keyed by job name alone?
5. Your daily 02:00 job sometimes runs at what you think is the wrong time
   after a DST change. What's the likely cause and fix?
6. A job scheduled every 5 minutes sometimes takes 8. What can go wrong, and
   how do you prevent it?
7. When would you choose APScheduler over Celery Beat?

<details>
<summary>Answers</summary>

1. The scheduler decides *when* and enqueues a task; the worker decides *how*
   and executes it. Keeping the entry thin (just enqueue) means the scheduled
   task inherits retries/priority/idempotency from the worker path, and a slow
   job can't block the scheduler's clock or delay other scheduled entries.
2. Both Beats independently reach each due entry and enqueue it, so every
   scheduled job runs twice. Fix: (1) run exactly one Beat instance
   (availability via fast restart, since Beat isn't built to run redundantly),
   and (2) guard the task with a distributed lock keyed by job + time window
   and/or make the effect idempotent, so a duplicate fire no-ops.
3. Because runs can duplicate (redundant scheduler, catch-up/misfire, retry,
   at-least-once delivery). If the task isn't idempotent, any of those causes
   double emails, double processing, or corrupted data. A timer is not a
   guarantee of "exactly once."
4. A window key (e.g. `lock:backup:2026-07-27`) makes each *scheduled
   occurrence* the unit of exclusion, so today's run and tomorrow's run don't
   block each other, but two schedulers firing *the same* occurrence do
   collide. A bare job-name lock either blocks legitimate future runs or needs
   careful TTL tuning to avoid it.
5. The scheduler's timezone is unset or set to a zone that observes DST, so
   the cron's wall-clock time shifts (or a daily run is skipped/doubled across
   the transition). Fix: set the timezone explicitly (often UTC) and interpret
   the cron expression in that zone.
6. A second copy starts while the first is still running (overlap), which can
   corrupt shared state or double-process. Prevent it with a distributed lock
   held for the job's duration, or `max_instances=1` in APScheduler.
7. When you're not using Celery, when you need schedules created/changed
   dynamically at runtime (Beat's schedule is mostly static config), or when
   you want a lightweight in-process scheduler with a persistent job store —
   often having it just enqueue Celery tasks anyway.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-03 while attempting these — the point is
to find out what actually stuck.

1. A `POST /orders` endpoint charges a card, reserves inventory, makes a
   shipping label, and emails the customer — currently all inside the request
   handler, and it's timing out under load. Redesign it end to end: what
   returns to the client immediately, how the four steps are wired so a
   failure at step 2 doesn't run steps 3-4, and how the client learns the
   final outcome. Name the specific primitives.
2. Your email task is enqueued with `send_email(user_id)` inside the handler
   and "sometimes blocks the request for 3 seconds." What's the bug, and what
   is the one-character-ish fix?
3. A payment task is configured with `autoretry_for=(Exception,)` and no
   idempotency guard. Give two distinct ways this corrupts data, and fix both.
4. Explain why passing `datetime.now()` as a task argument fails under the
   default serializer, and why passing a `User` ORM object is a bad idea even
   if it *could* serialize.
5. You have a chain `charge | reserve | label | notify` and want `notify` to
   receive only `order_id`, not the label's return value. Which signature form
   do you use, and what error appears if you use the wrong one?
6. A nightly backup runs on two Beat replicas and you're getting two backups.
   Give the single-instance answer and the belt-and-suspenders lock answer,
   and explain the time-window lock key.
7. Distinguish transient from permanent failures with one example each, and
   explain what `autoretry_for` should and shouldn't contain.
8. Your third-party API caps you at 10 req/s and you run 5 workers. Why does
   `rate_limit="10/s"` on the task not hold the cap, and what does?
9. A scheduled cleanup task and a scheduled digest task both "sometimes run
   twice." For each, say whether a double run is harmful and what makes it
   safe.

<details>
<summary>Show answers</summary>

1. The handler validates, writes the order row, enqueues a Celery **chain**
   `charge.s(order_id) | reserve.s() | label.s() | notify.s()`, and returns
   `202 Accepted` with the chain's task id immediately. Because it's a chain,
   a raise in `reserve` stops the pipeline — `label`/`notify` never run. The
   client learns the outcome by polling a `GET /orders/{task_id}` endpoint
   backed by `AsyncResult` (needs a result backend), or by a webhook/websocket
   push (later modules).
2. It calls the task function *directly* (synchronously in the web process)
   instead of enqueuing it, so the request waits for the send. Fix: `.delay()`
   — `send_email.delay(user_id)`.
3. (a) A `4xx`/validation error gets retried forever-ish because
   `autoretry_for=(Exception,)` retries permanent failures too — wasted work
   and delayed failure. (b) With no idempotency guard, a retry after a partial
   success (or an at-least-once redelivery) charges the card twice. Fix:
   restrict `autoretry_for` to transient exception types, and add an
   idempotency key / unique-constraint guard so a re-run charges once.
4. The default JSON serializer has no encoding for `datetime`, so it raises an
   encode error — pass an ISO string or epoch int instead. A `User` object is
   a bad idea even if serializable because the task may run seconds later; you
   want the *fresh* row fetched by id at execution time, not a stale snapshot,
   and the object may carry a live session that can't cross process
   boundaries.
5. Use an immutable signature: `notify.si(order_id)`. With `notify.s()` the
   upstream (label) result is prepended as an extra first argument, producing a
   `TypeError`/wrong-number-of-arguments failure.
6. Single-instance: run exactly one Beat process (availability comes from a
   supervisor restarting it, not from a second copy). Lock: the backup task
   does `SET lock:backup:{today} NX EX 3600` and only the winner runs;
   duplicates no-op. The window key (`{today}`) scopes exclusion to *this*
   occurrence so it doesn't block tomorrow's run.
7. Transient: a timeout / `503` / connection reset — may succeed on retry.
   Permanent: a `400`/validation/`404` — fails identically every time.
   `autoretry_for` should contain only the transient exception types and never
   a blanket `Exception` (which would retry permanent errors too).
8. `rate_limit` is per-worker, so 5 workers allow ~50 req/s — the cap is
   blown. A shared Redis token bucket that every worker draws a token from
   before calling (retrying when empty) holds a true global 10/s.
9. Cleanup: a double run is harmless because deleting already-deleted rows is a
   no-op — it's naturally idempotent. Digest: a double run is harmful (users
   get two emails); make it safe with a per-user-per-week uniqueness guard
   plus a run-level window lock so at most one send happens per user per week.

</details>

## Further reading & sources

- [Celery: Periodic Tasks (Beat)](https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html) - defining `beat_schedule`, `crontab`, and running a single Beat process.
- [Celery: crontab schedules](https://docs.celeryq.dev/en/stable/reference/celery.schedules.html#celery.schedules.crontab) - the full field reference for cron-style entries.
- [APScheduler documentation](https://apscheduler.readthedocs.io/en/3.x/userguide.html) - triggers, `misfire_grace_time`, `coalesce`, `max_instances`, and persistent job stores.
- [Redis: SET with NX and EX](https://redis.io/docs/latest/commands/set/) - the atomic primitive behind the time-window distributed lock.
- [Redis: Distributed locks with Redlock](https://redis.io/docs/latest/develop/use/patterns/distributed-locks/) - the reasoning and caveats for locks that guarantee single execution.

## Next

[04-transactional-emails](../04-transactional-emails/README.md) — you've been
"sending emails" as a stand-in for slow work all track. Now you'll actually
build them: the anatomy of a transactional email, personalizing with dynamic
data, sending from a background task (tying straight back to module 00), and
the deliverability basics (SPF/DKIM) that decide whether your mail lands in
the inbox or the spam folder.
