# Module 04: Database Migrations in Deployment Pipelines

## Why this matters

Module 03 established the rule: during a deploy, two app versions run against one
database, so migrations must keep the schema valid for *both* versions at every
instant. This module is how you actually *do* that — safely, as part of an
automated pipeline, without downtime.

Migrations are the single most dangerous thing in a deploy, because they're the one
step that isn't easily reversible and isn't isolated to one replica. A bad code
deploy rolls back in seconds; a migration that dropped a column, rewrote a table,
or took a lock that froze the database does not. The failure modes are specific and
brutal: a migration that adds a `NOT NULL` column with no default rejects every
insert from the still-running old code; a migration that rewrites a big table
holds a lock that stalls all writes for minutes (an outage); a migration deployed
in the wrong order relative to the code breaks whichever version is out of sync.
Every one of these is avoidable with a known pattern.

Track 04 (Databases and Data Layer) taught you migrations as a tool — Alembic,
schema versioning, writing an `upgrade`/`downgrade`. This module is the
*deployment* view: how to sequence and shape migrations so they're safe to run
automatically while the app is live and mid-rollout. The **expand/contract**
pattern is the spine, migration ordering vs. app rollout is the discipline, and
"run it as a one-off admin process" (factor XII) is the mechanism. The
orchestration of *when* the pipeline runs the migration job — `learn/10-cicd-and-
gitops` for the pipeline wiring, `learn/03-kubernetes` for Jobs/init-containers —
is cross-referenced; the schema-change reasoning is what you own here.

## Concepts

### Expand/contract: the pattern that makes any change zero-downtime

Almost every "risky" schema change can be decomposed into a sequence of
*individually safe, backward-compatible* steps. That decomposition is
**expand/contract** (also called parallel-change):

1. **Expand** — add the new schema *alongside* the old, in a purely additive way
   that the currently-running code doesn't even notice. Add the new column/table;
   don't touch the old.
2. **Migrate the data & code** — backfill existing rows into the new shape;
   deploy code that **writes to both** old and new (dual-write) and gradually
   **shifts reads** from old to new.
3. **Contract** — once nothing reads or writes the old schema anymore, remove it
   in a final, separate deploy.

The power of this is that *every intermediate state is a valid database for every
running version of the app.* You never have a moment where the schema and some
running code disagree. A scary "rename a column" becomes five boring, reversible
steps. The cost is that a single logical change spans multiple deploys and a
backfill — which is exactly the price of zero downtime, and it's the same
expand/contract shape as the backward-compatible API changes in module 03 (they
share the root cause: two versions coexist).

```
 phase:   EXPAND ─────► MIGRATE (data + code) ─────────────► CONTRACT
          add new col   backfill (batched) + dual-write +    drop old col
          (additive)    shift reads old→new                  (destructive)
 ──────────────────────────────────────────────────────────────────────►
 schema:  old + NEW     old + NEW (both valid, both written)  NEW only
 reads:   old           old ──────────────► new               new
 writes:  old           old + NEW ─────────────────────────►  new
          ▲ safe before code        ▲ every step valid for BOTH versions
                                                    ▲ safe only after old code gone
```

### Migration ordering relative to the app rollout

The ordering rule from module 03, stated precisely and justified:

- **Additive migrations run *before* the code that uses them.** Adding a nullable
  or defaulted column, a new table, or a new index is invisible to the old code
  (it doesn't reference them), so you can apply it first and then deploy code that
  relies on it. If you deployed the code first, the new code would reference a
  column that doesn't exist yet and crash. **Expand goes before code.**
- **Destructive migrations run *after* every version that used the thing is
  gone.** Dropping a column, table, or constraint must wait until no running
  replica references it — otherwise you break the still-running old version
  mid-rollout. So: deploy code that stops using it, let that fully roll out
  (become the *only* running version), and only then, in a *later* deploy, drop it.
  **Contract goes after code.**

The mental test for any migration: *"Is the resulting schema valid for every app
version currently running, including the ones mid-rollout?"* Additive changes pass
that test before the code ships; destructive changes only pass it after the last
version that needed the thing is gone. This is why a destructive migration and the
code change that motivated it must never be in the same deploy — a point worth
over-learning, because it's the single most common cause of a broken rollout.

### Backfills and dual-writes: moving the data without a freeze

When a change requires *existing* rows to be transformed (splitting a `name` into
`first`/`last`, copying `ref` into `reference`, populating a new required field),
you can't do it in one big `UPDATE` inside the migration — on a large table that
locks rows and can run for minutes. Instead:

- **Backfill in batches, outside the schema migration.** Add the new nullable
  column (fast, additive), then run a separate, *idempotent, batched* job that
  fills it in chunks (`UPDATE ... WHERE id BETWEEN x AND y AND new_col IS NULL`),
  sleeping between batches so you don't saturate the DB. It can be re-run safely if
  it fails partway (idempotency — a discipline from track 06/track 10).
- **Dual-write during the transition.** While reads are still on the old column,
  have the app write **both** columns on every insert/update, so new rows are
  correct in both places and the backfill only has to handle *old* rows. Once the
  backfill completes and reads have switched to the new column, you drop the
  dual-write and (later) the old column.

The sequence for a required new field, end to end: add nullable column → dual-write
+ backfill in batches → verify no NULLs remain → add the `NOT NULL` constraint (now
safe) → switch reads → stop writing the old field → drop the old field. Seven small
safe steps instead of one dangerous one.

### Avoiding the lock that becomes an outage

The subtlest migration danger is not correctness but **locking**: some DDL
operations take a lock that blocks reads or writes on the whole table while they
run, and on a large or busy table that block *is* downtime even though the
migration "succeeds." The specifics are engine-dependent (this is Postgres; the
principle is universal, and the depth is a database-operations topic — `learn/14`
in the ops curriculum):

- **Adding a column** is fast/safe in modern Postgres — *unless* you add it with a
  non-constant/volatile default in older versions, which rewrites the table. Add
  nullable, backfill separately, then set a default.
- **Adding an index**: a plain `CREATE INDEX` locks writes for the whole build.
  Use `CREATE INDEX CONCURRENTLY` to build it without blocking writes (it can't run
  inside a transaction — a gotcha with migration tools that wrap steps in one).
- **Adding a `NOT NULL` constraint** scans/locks the table; adding it as `NOT
  VALID` then `VALIDATE CONSTRAINT` separately avoids the long lock.
- **Changing a column type** can rewrite the whole table under a lock — almost
  always do it as an expand/contract (new column) instead.

The rule of thumb: **any migration that rewrites or long-locks a big table is an
outage in disguise; decompose it into additive steps + a batched backfill.** Keep
each migration fast (sub-second locks), and do the slow data movement as a separate
online job.

### Running migrations as a one-off admin process (factor XII)

*How* the migration runs in the pipeline matters as much as what it does. It is a
**one-off admin process** (factor XII, track 08 module 10): the *same image* as the
app, with the *same config*, running the migration command once — not an ad-hoc
`psql` session, not code baked into app startup.

- **Same image, same config:** `docker run --env-file .env <same-image> alembic
  upgrade head`. This guarantees the migration sees exactly the schema-versioning
  code and connection config the app uses (parity, factor X), and it's reviewable
  and reproducible.
- **Run it as a distinct pipeline step, not in the app's startup.** Don't put
  `alembic upgrade` in the container's `CMD` or `lifespan` startup: with N
  replicas that's N concurrent migrations racing each other, and it couples
  "process starts" to "schema changes" (slow, dangerous startup — violates
  disposability). Run migrations as a **single** dedicated step: a Kubernetes
  `Job` or init step, or a pipeline stage that runs once before the app rollout.
- **Sequence it with the deploy per the ordering rule:** for an additive migration,
  the pipeline runs the migration job, waits for success, *then* rolls out the new
  app; for a destructive one, the app rollout happens first and the drop is a later
  pipeline run.

The Kubernetes/pipeline mechanics (Jobs, init-containers, migration-before-rollout
hooks, Argo sync waves) are `learn/03-kubernetes` and `learn/10-cicd-and-gitops`.
The backend engineer's responsibility is that the migration is *safe to run
automatically, once, in that sequence* — which is everything above.

## Command reference

| Concern | Rule / command |
|---|---|
| Additive migration | Run **before** the code that uses it (`expand`) |
| Destructive migration | Run **after** every version that used it is gone (`contract`) |
| Big data change | Backfill in **batches**, idempotent, outside the DDL |
| During transition | **Dual-write** old+new; shift reads gradually |
| Add index | `CREATE INDEX CONCURRENTLY` (no write lock) |
| Add NOT NULL | Backfill → `NOT VALID` then `VALIDATE CONSTRAINT` |
| Change type | Never in place — expand/contract to a new column |
| Run it | One-off job, same image/config: `alembic upgrade head` (factor XII) |
| Not in startup | Never in `CMD`/`lifespan` — N replicas would race |

Expand/contract for a column rename (`ref` → `reference`), as an Alembic sequence:

```python
# --- Migration 1 (EXPAND): add the new column, additive & nullable. Runs BEFORE new code. ---
def upgrade():
    op.add_column("orders", sa.Column("reference", sa.String(), nullable=True))

# --- App deploy A: dual-write both columns, still READ `ref`. ---
# order.reference = order.ref = value   # both written on every insert/update

# --- Batched backfill (a one-off job, NOT a migration): idempotent, chunked. ---
#   UPDATE orders SET reference = ref
#   WHERE id BETWEEN :lo AND :hi AND reference IS NULL;   -- loop over id ranges, sleep between

# --- App deploy B: switch READS to `reference` (still writing both). ---
# --- App deploy C: stop writing `ref`. ---

# --- Migration 2 (CONTRACT): now nothing uses `ref`. Runs AFTER deploy C is fully rolled out. ---
def upgrade():
    op.drop_column("orders", "ref")
```

Adding a NOT NULL column without rejecting the old code's inserts:

```python
# ❌ breaks old code's inserts immediately (they don't supply `plan`)
op.add_column("users", sa.Column("plan", sa.String(), nullable=False))

# ✅ additive first, backfill, then constrain — old code keeps working throughout
op.add_column("users", sa.Column("plan", sa.String(), nullable=True))   # migration 1 (expand)
#   ... app dual-writes `plan`; batched backfill sets it for existing rows ...
op.alter_column("users", "plan", nullable=False)                         # migration 2, after no NULLs
```

Running the migration as a one-off admin process in the pipeline (factor XII) —
the mechanics are `learn/10`, this is the shape:

```yaml
# A dedicated migration step, run ONCE before the app rollout — not in the app container's CMD.
migrate:
  image: registry.example.com/myapp:git-<sha>     # SAME image as the app (module 02)
  command: ["alembic", "upgrade", "head"]          # one-off admin process
  envFrom: [{ secretRef: { name: app-config } }]   # SAME config as the app
# pipeline: run `migrate` to success → THEN roll out the app (for an additive change)
```

## Hands-on exercises

Work against a local Postgres in Docker with an Alembic-managed FastAPI service
(bring one from track 04). Simulate "two versions running" by keeping an old-code
client hitting the API while you migrate.

### 1. Add a nullable column in the right order

Add a nullable column your new code will use. Practice the order: run
`alembic upgrade head` (the migration) *first*, confirm the old running code is
unaffected, *then* deploy the new code that uses the column. Confirm both work.

### 2. Break the order on purpose

Now do it backwards: deploy code that reads the new column *before* running the
migration. Watch the new code error (column doesn't exist). Reset, and state the
rule you just violated.

### 3. Add a NOT NULL column safely

Add a required field the wrong way first (`nullable=False`, no default) and watch
the old code's inserts fail. Then do it the safe way: nullable column → backfill →
`alter_column(nullable=False)`. Confirm the old code keeps inserting throughout the
first two steps.

### 4. Write an idempotent batched backfill

Write a backfill script that fills the new column in id-range batches, skips rows
already filled (`WHERE new_col IS NULL`), and sleeps between batches. Kill it
halfway and re-run it — confirm it completes correctly without double-processing.
That's the idempotency that makes it safe in a pipeline.

### 5. Full expand/contract rename

Take a column used by both the API and the DB and rename it end-to-end with the
five-step expand/contract sequence (expand → dual-write+backfill → switch reads →
stop old writes → contract). Keep an old client running the whole time and confirm
it never breaks. This is module 03's zero-downtime rename, done for real.

### 6. Feel a locking migration

On a table with a lot of rows, run a plain `CREATE INDEX` while a load generator
writes to the table — observe writes stall until the index finishes. Redo it with
`CREATE INDEX CONCURRENTLY` and observe writes continue. Note why CONCURRENTLY
can't run inside a transaction block.

### 7. Run the migration as a one-off admin process

Run `alembic upgrade head` via `docker run --env-file .env <same-image>` — the
exact image and config your app uses (factor XII). Then deliberately (mis)place
`alembic upgrade` in the app's `lifespan` startup, scale to 3 replicas, and reason
about what happens when three replicas start at once. Remove it.

### 8. Diagnose and fix

A deploy pipeline runs, and production goes down for four minutes and then throws
errors. The single migration in the release does all of this at once, in the same
deploy as the code that renames the field:

```python
def upgrade():
    op.alter_column("orders", "ref", new_column_name="reference")   # (a) rename in place
    op.add_column("users", sa.Column("plan", sa.String(), nullable=False))  # (b) NOT NULL, no default
    op.create_index("ix_orders_big", "orders", ["customer_id"])     # (c) plain index on a huge table
# and this runs inside the app container's lifespan startup, on all 3 replicas   # (d)
```

<details>
<summary>Solution</summary>

- **(a) In-place rename in one deploy** → the old running replicas still reference
  `ref`, which no longer exists → they break mid-rollout, and the new column name
  isn't backward-compatible. Fix: expand/contract across deploys (add `reference`,
  dual-write, backfill, switch reads, drop `ref` later).
- **(b) `NOT NULL` with no default** → every insert from the still-running old code
  (which doesn't supply `plan`) is rejected. Fix: add nullable → backfill →
  `alter_column(nullable=False)` in a later step.
- **(c) Plain `CREATE INDEX` on a huge table** → locks writes for the whole build
  = the four-minute outage. Fix: `CREATE INDEX CONCURRENTLY` (outside a
  transaction).
- **(d) Migration in `lifespan` startup on 3 replicas** → three concurrent
  migrations race each other, and schema changes are coupled to process start. Fix:
  run migrations as a **single** one-off admin job (factor XII), same image/config,
  as a distinct pipeline step ordered relative to the rollout — never in the app's
  startup.

Root theme: each of these is a fast/safe additive step plus separate data movement
away from being a slow, destructive, wrongly-ordered, concurrently-raced
migration. Decompose, order (additive-before-code, destructive-after-everything),
backfill online, and run once as an admin process.

</details>

## Independent challenge

No code given. Take a service with a real schema (bring one from **track 04
(Databases and Data Layer)**) and execute a **zero-downtime rename of a column that
both the API and old replicas use**, driven through your **module 02** CI pipeline
and deployed with the **module 03** rolling strategy. Do it as a full
expand/contract: add the new column additively, deploy code that dual-writes and
still reads the old column, write and run an *idempotent, batched* backfill,
deploy code that switches reads to the new column, deploy code that stops writing
the old one, and finally drop the old column — each as a correctly-ordered step,
running every migration as a one-off admin process (factor XII, from **track 08's
module 10, The 12-factor app**) on the same image and config as the app. Keep an
old-version client hitting the API throughout and prove it never breaks. Then write
a short "migration safety checklist" for your team covering ordering
(additive-before-code, destructive-after), locking (which operations need
CONCURRENTLY / NOT VALID), backfill idempotency, and where the migration runs in
the pipeline — pointing to `learn/10-cicd-and-gitops` for wiring the migration job
into the pipeline and `learn/03-kubernetes` for running it as a Job/init step.

<details>
<summary>Hint</summary>

The whole challenge is the discipline of never letting the schema and any running
code version disagree — apply the one test to every step: "is this schema valid for
*every* version currently running, including mid-rollout?" Additive steps pass it
before the code ships (so they go first); the drop passes it only after the last
version that read the old column is gone (so it goes last, in its own deploy). The
backfill is the part people get wrong: it must be idempotent and batched so you can
kill and re-run it — write it as `UPDATE ... WHERE new IS NULL` over id ranges with
a sleep, and dual-write in the app so the backfill only ever has to fix *old* rows.
Prove correctness with the old client running the entire time: if it ever sees an
error, a step was ordered wrong.

</details>

## Common mistakes & troubleshooting

- **Destructive migration in the same deploy as its code change.** Breaks the
  still-running old version. Contract only after every version that used the thing
  is gone; ship the drop in a later deploy.
- **`NOT NULL` (or new required field) with no default.** Rejects the old code's
  inserts immediately. Add nullable → backfill → constrain.
- **One big `UPDATE` inside the migration.** Locks rows for minutes on a large
  table = outage. Backfill in idempotent batches, outside the DDL.
- **Plain `CREATE INDEX` / in-place type change on a big table.** Long write lock =
  downtime. `CREATE INDEX CONCURRENTLY`; type changes via expand/contract.
- **Migrations in the app's `CMD`/`lifespan` startup.** N replicas race; startup
  becomes slow and dangerous. Run as a single one-off admin job (factor XII).
- **Non-idempotent backfill.** Can't be safely retried after a partial failure.
  Guard with `WHERE new_col IS NULL` and id ranges so re-runs are safe.
- **Migration run from a different image/config than the app.** Parity break;
  it may see a different schema-version state. Use the same image and config.
- **No rollback thinking.** A destructive migration means the code can't roll back.
  Keep migrations forward-only and each backward-compatible (module 03).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is expand/contract, why does every intermediate state stay safe, and what
   does it cost you compared to a single in-place change?
2. Give the ordering rule for additive vs destructive migrations relative to the
   code rollout, and the single test you apply to decide whether a migration is
   safe to run now.
3. You need to add a required (`NOT NULL`) field to a large, live table. Give the
   full safe sequence and say what breaks if you just add it `NOT NULL` in one step.
4. Why must a big data backfill be batched *and* idempotent, and why is dual-writing
   during the transition what keeps the backfill's job small?
5. Which common migrations are "outages in disguise" due to locking, and what's the
   safe alternative for adding an index and for adding a NOT NULL constraint?
6. Why must migrations run as a one-off admin process (factor XII) and *not* in the
   app's startup? What specifically goes wrong with `alembic upgrade` in `lifespan`
   on 3 replicas?

<details>
<summary>Answers</summary>

1. Expand/contract decomposes a risky change into a sequence of individually safe,
   backward-compatible steps: **expand** (add new schema additively), migrate data
   + code (backfill, dual-write, shift reads), **contract** (remove old schema
   last). Every intermediate state is a valid database for *every* running app
   version, so schema and code never disagree. The cost is that one logical change
   spans multiple deploys plus a backfill — the price of zero downtime.
2. **Additive → before** the code that uses it (old code ignores it, new code needs
   it); **destructive → after** every version that referenced the thing is gone
   (dropping it earlier breaks the still-running old version). The test: "is the
   resulting schema valid for every app version currently running, including
   mid-rollout?" Additive passes before the code ships; destructive passes only
   after the last version needing it is gone.
3. Add the column **nullable** (additive, migrate before/with new code) → have the
   app **dual-write** it → **backfill** existing rows in idempotent batches →
   verify no NULLs → `alter_column(nullable=False)` in a later migration. If you add
   it `NOT NULL` in one step, every insert from the still-running old code (which
   doesn't supply the field) is rejected immediately — and on a big table the
   constraint scan/rewrite can also lock the table.
4. Batched: a single big `UPDATE` locks many rows for a long time on a large table
   (an outage); chunking with sleeps keeps locks short and the DB responsive.
   Idempotent (`WHERE new_col IS NULL`, id ranges): so a backfill that dies partway
   can be safely re-run without double-processing — essential for an automated
   pipeline. Dual-writing means *new* rows are already correct in both columns, so
   the backfill only has to fix the finite set of *pre-existing* rows.
5. "Outages in disguise": plain `CREATE INDEX` (locks writes for the whole build),
   in-place column type changes (rewrite the table under a lock), and big
   in-migration `UPDATE`s. Safe alternatives: `CREATE INDEX CONCURRENTLY` (builds
   without a write lock, can't run in a transaction); for NOT NULL, add the
   constraint `NOT VALID` then `VALIDATE CONSTRAINT` separately to avoid the long
   lock; for type changes, expand/contract to a new column.
6. As a one-off admin process it runs **once**, in the same image and config as the
   app (parity, reviewable, reproducible), sequenced correctly relative to the
   rollout. In `lifespan` startup on 3 replicas, all three replicas run the
   migration **concurrently** as they start — racing each other on the same schema —
   and schema changes get coupled to process start, making startup slow and
   dangerous (violating disposability). Run it as a single dedicated Job/pipeline
   step instead.

</details>

## Further reading & sources

- [Martin Fowler: ParallelChange (expand and contract)](https://martinfowler.com/bliki/ParallelChange.html) - The canonical write-up of the expand/contract pattern that is the spine of this module.
- [GitLab: Migration style guide](https://docs.gitlab.com/ee/development/migration_style_guide.html) - A battle-tested checklist for online, lock-safe migrations, batched backfills, and reversibility.
- [PostgreSQL: ALTER TABLE and locking](https://www.postgresql.org/docs/current/sql-altertable.html) - The authoritative reference for which DDL takes which locks — the basis for the "outage in disguise" section.
- [PostgreSQL: CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY) - How to build an index without locking writes, and why it can't run inside a transaction.
- [The Twelve-Factor App: Admin processes (factor XII)](https://12factor.net/admin-processes) - Why a migration is a one-off admin process on the same image and config as the app, not app-startup code.
- [Alembic documentation](https://alembic.sqlalchemy.org/en/latest/) - The migration tool used for the upgrade/downgrade sequences shown here.

## Next

[05-service-configuration-and-environments](../05-service-configuration-and-environments/README.md)
— migrations are the one-off admin side of a deploy. Next we handle the *config*
side: managing configuration across dev/staging/prod, injecting secrets at deploy
time (building on track 09's secrets management and track 08's config modules), and
using feature flags to decouple "deployed" from "released."
