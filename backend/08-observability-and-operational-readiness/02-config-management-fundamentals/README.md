# Module 02: Config Management Fundamentals

## Why this matters

Here is a true story that happens somewhere every week: an engineer runs the
test suite, and it wipes the production database — because the test config and
the prod config were the same file, and someone flipped a variable. Or:
a deploy goes out, and the app connects to *last quarter's* payment provider,
because the endpoint URL was hardcoded in a Python file three releases ago and
nobody remembered it was there. Or: the app runs perfectly on the developer's
laptop and `500`s instantly in staging, because "it worked on my machine"
literally means "it used my machine's config."

Every one of these is a **configuration** failure, not a code failure. The code
was fine. What varied was the *environment* the code ran in — which database,
which API endpoint, which credentials, which feature flags — and the app had no
clean, safe way to express "this value depends on where I'm running." Config
management is the discipline of separating *the things that change per
environment* from *the code*, so that the exact same build runs in dev,
staging, and prod, differing only in the config injected into it.

This is important enough that it's one of the twelve factors (module 10 walks
all twelve), and it's foundational to everything operational: you cannot have
separate dev/staging/prod behaviour, safe secrets, or runtime feature toggles
without first understanding *what config is* and *what kinds of it exist*. This
module is the conceptual groundwork; module 03 is the hands-on "where do the
values come from and how do I keep secrets safe." Get the taxonomy right here
and module 03 is mechanical.

## Concepts

### What configuration actually is (and the litmus test)

Configuration is **any value your application needs that can differ between one
running instance and another, without the code itself changing.** The database
host in dev is `localhost`; in prod it's `db.internal.prod`. The code that
connects is identical. The host is config.

The practical litmus test — *"would this value differ between two deployments
of the same code?"*:

- **Config**: database URL, external API endpoints and keys, the port to bind,
  log level, feature flags, rate limits, the S3 bucket name, credentials.
  These differ between dev and prod, or between your deploy and a teammate's.
- **Not config (it's code)**: your routing table, your validation rules, the
  business logic of how a discount is computed, the *structure* of a config
  object. These are the same everywhere the code runs; baking them into the
  build is correct.

The line can blur — is a tax rate config or code? — but the test holds up: if
two identical deployments would legitimately need *different* values, it's
config, and it must live *outside* the code.

### Why decoupling config from logic matters

Hardcoding an environment-specific value into source is the original sin, and
it causes a specific, predictable set of problems:

- **You can't run the same build in two places.** If `DATABASE_URL =
  "localhost:5432"` is in your Python, the prod build needs *different source*,
  which means you're either editing code per environment (error-prone, defeats
  reproducibility) or maintaining parallel branches (a nightmare). The whole
  value of a build artifact is that *the same artifact* is promoted dev →
  staging → prod; hardcoded config destroys that.
- **Changing a value means a code change, review, rebuild, and redeploy.**
  Want to bump a rate limit or point at a new cache host? That should be a
  config change, not a source-control commit and a full release cycle.
- **Secrets end up in source control.** If credentials live in code, they live
  in git history *forever* — and git history leaks (module 03 goes deep). A
  hardcoded prod password is one `git clone` away from being everyone's
  password.
- **"Works on my machine."** The gap between environments *is* the config; if
  config is implicit and scattered, the gap is invisible until it bites in
  staging.

The fix, stated as a principle you'll see again in module 10: **strict
separation of config from code.** The code declares *what config it needs*
(names and types); the environment supplies *the values* at runtime. The build
knows nothing about which environment it'll run in.

### The three flavours of config

Not all config is alike, and conflating them is how secrets end up in logs and
feature flags end up requiring redeploys. Three flavours, by *how they change*
and *how sensitive they are*:

**Static config** — set once per environment, rarely changes, not secret:
- database *host*, external API *base URLs*, the port to bind, the environment
  name (`dev`/`staging`/`prod`), the log level.
- Loaded at startup; changing it is a deploy/restart. It's fine (even good)
  for these to be visible in dashboards and non-secret config files.

**Dynamic config** — expected to change *while the app is running*, without a
redeploy:
- feature flags (`checkout_v2_enabled`), rate limits, sampling rates, a
  kill-switch for an expensive feature, A/B test allocations.
- The distinguishing property: you want to flip these *at runtime*, so they
  can't only come from a startup-time file. They're read from a source that
  can change under the running process (a feature-flag service, a config
  store, a database, a watched file) — module 03 covers the mechanics.

**Sensitive config (secrets)** — values whose *exposure is a security
incident*:
- database passwords, API keys/tokens, signing keys, TLS private keys, OAuth
  client secrets.
- These need everything static config does *plus* special handling: never in
  source control, never in logs, ideally from a dedicated secret manager with
  access control and rotation. A secret is config that can get you breached.

Why the distinction is operationally load-bearing:

| Flavour | Changes at runtime? | Safe to log/display? | Where it lives |
|---|---|---|---|
| Static | No (restart) | Yes | env vars, config file, ConfigMap |
| Dynamic | Yes | Usually | flag service, config store, watched source |
| Sensitive | Occasionally (rotation) | **Never** | secret manager / vault, injected env |

Treating a secret like static config (putting it in a checked-in `.env`) leaks
it. Treating a feature flag like static config (baking it into the build)
means a redeploy to flip a switch — exactly what dynamic config exists to
avoid. The taxonomy tells you *how* to handle each.

### The dev / staging / prod problem

Real services run in multiple **environments**, and the entire reason they
exist is to catch problems before they reach users:

- **Development (dev)** — your laptop or a shared dev box. Fast iteration,
  throwaway data, verbose logging, permissive settings, fake/sandbox versions
  of external services (a Stripe *test* key, a local Postgres).
- **Staging (pre-prod)** — a mirror of prod, as close to identical as you can
  afford. Real-ish data (often anonymized), the *same* build you'll promote to
  prod, integration with sandbox or carefully-scoped real dependencies. The
  point of staging is **dev/prod parity** (module 10's factor X): if staging
  ≈ prod, a bug shows up in staging; if staging is wildly different, staging
  passes and prod breaks.
- **Production (prod)** — real users, real money, real data. Least verbose
  logging that's still useful, strictest security, real credentials, real
  external services, real consequences.

The core problem: **the same code must behave correctly in all three, differing
only by config.** That's the whole game. If achieving different behaviour
requires different *code* per environment, you've lost — you can no longer
trust that "it passed in staging" says anything about prod, because prod runs
different code. So the design constraint is: one build, N sets of config, and
the config injected per environment. The value of `ENVIRONMENT=staging` vs
`ENVIRONMENT=prod` should be the *only* difference between how those two
identical artifacts behave.

Common failure modes this framing prevents:
- **Config drift** — staging and prod configs diverge over time until they no
  longer resemble each other, and staging stops being predictive.
- **Environment leakage** — a dev pointing at the prod database "just to
  check something," or a test suite that finds real credentials in its
  environment and does real damage. Strong config separation (and *distinct*
  credentials per environment, so dev *can't* reach prod even by accident) is
  the guardrail.
- **The "prod-only" config path** — a code path that only runs in prod because
  its config is only set there, so it's *never tested* until it fails live.

### Config as a typed contract, not a bag of strings

A preview of module 03's mechanics, but a *conceptual* point that belongs here:
config should be a **validated, typed object** your app loads once at startup —
not `os.environ["FOO"]` scattered across the codebase. Two reasons rooted in
module 00's fail-fast principle:

1. **Fail-fast on bad config.** If `PORT` is supposed to be an int and someone
   sets `PORT=onehundred`, you want a *loud crash at startup*, not a confusing
   `TypeError` on the 500th request. Loading config into a typed schema
   validates it once, up front — a missing required secret or a malformed URL
   crashes the boot, and an orchestrator won't route traffic to a pod that
   never became ready (module 09).
2. **One source of truth.** A single `Settings` object means you can see
   *everything* the app depends on in one place, document it, and never wonder
   "wait, does this read `DB_HOST` or `DATABASE_HOST`?" Scattered
   `os.environ[...]` calls are how you get two names for the same value and a
   bug that only appears when one is set and the other isn't.

Module 03 implements this with Pydantic Settings; the principle — *config is a
typed contract validated at startup, defined once* — is what makes the rest
safe.

## Command reference

This module is conceptual; the deep tooling is module 03. But the mental model
has a concrete shape worth pinning down now — a single settings object that
distinguishes the three flavours and the environment:

```python
from enum import Enum

class Environment(str, Enum):
    dev = "dev"
    staging = "staging"
    prod = "prod"

# A sketch of the ONE settings object (module 03 makes this real with
# Pydantic Settings, validation, and secret handling):
class Settings:
    environment: Environment      # static: which env am I?
    log_level: str                # static
    database_host: str            # static
    database_password: str        # SENSITIVE — never logged, from secret manager
    checkout_v2_enabled: bool     # dynamic-ish: a feature flag
    rate_limit_per_min: int       # dynamic: tuneable without redeploy
```

| Concept | Rule of thumb |
|---|---|
| Litmus test for "is this config?" | Would two deployments of the same code need different values? → config |
| Static config | Set per environment, rarely changes, restart to change, safe to display |
| Dynamic config | Changes at runtime without redeploy (feature flags, limits) |
| Sensitive config | Exposure = incident; never in source/logs; secret manager |
| Environments | dev (fast/fake), staging (prod-mirror), prod (real) |
| Dev/prod parity | Keep staging ≈ prod so staging is predictive |
| Config = typed contract | Load once at startup into a validated object; fail-fast |
| Distinct creds per env | Dev credentials must not be able to reach prod resources |

There are no shell commands to memorize here — the "commands" are the
*decisions*: classify each value into a flavour, decide its source and
sensitivity, and confirm the same build could run in any environment given only
different config. That classification is the deliverable.

## Hands-on exercises

These are analysis-and-design exercises — the muscle this module builds is
*classification and judgement*, which module 03 then implements. Keep a
`config-notes.md` as you go; you'll turn it into a real `Settings` class next
module.

### 1. Classify a real config list

Here's a config list pulled from a typical service. Label each value **static**,
**dynamic**, or **sensitive**, and say whether it's safe to print in a
`/debug/config` endpoint:

```
DATABASE_URL              STRIPE_SECRET_KEY        LOG_LEVEL
FEATURE_NEW_CHECKOUT      PORT                     JWT_SIGNING_KEY
MAX_UPLOAD_MB             ENVIRONMENT              REDIS_HOST
RATE_LIMIT_PER_MINUTE     SENTRY_DSN               ADMIN_EMAIL
```

Expected (check your reasoning): `DATABASE_URL` — sensitive (contains a
password), never print. `STRIPE_SECRET_KEY`, `JWT_SIGNING_KEY` — sensitive,
never. `LOG_LEVEL`, `PORT`, `ENVIRONMENT`, `REDIS_HOST`, `ADMIN_EMAIL`,
`MAX_UPLOAD_MB` — static, safe to print. `FEATURE_NEW_CHECKOUT`,
`RATE_LIMIT_PER_MINUTE` — dynamic (you'd want to change these without a
redeploy). `SENTRY_DSN` — arguably sensitive-ish (it's a write key); treat as
sensitive to be safe.

### 2. Find the hardcoded config

Given this snippet, list every hardcoded value that *should* be config and
name its flavour:

```python
import requests

def notify_user(user_id, message):
    requests.post(
        "https://api.prod.notifier.com/v2/send",     # ?
        headers={"Authorization": "Bearer sk_live_9f83a2b1c4"},  # ?
        json={"user": user_id, "text": message},
        timeout=5,                                    # ?
    )
    if user_id in [1, 2, 3]:                          # ?
        log.debug("VIP user notified")
```

Expected: the URL (static config — differs in staging), the bearer token
(**sensitive** — and it's hardcoded, i.e. already leaked into source), the
timeout (static config, arguably fine to hardcode but better as config), and
the VIP user list (dynamic config — you shouldn't redeploy to change who's a
VIP). Note the token is the emergency: it's in git history now.

### 3. Design the environment matrix

For a service with dev/staging/prod, fill in a table for these values: which
database, which Stripe key (test vs live), log level, and whether
`FEATURE_NEW_CHECKOUT` is on. There is no single right answer, but articulate a
defensible one and justify *why staging must resemble prod* for the checkout
flag specifically.

Expected shape:

| Value | dev | staging | prod |
|---|---|---|---|
| database | local throwaway | staging DB (anonymized) | prod DB |
| Stripe key | `sk_test_...` | `sk_test_...` | `sk_live_...` |
| log level | `DEBUG` | `INFO` | `INFO`/`WARNING` |
| new checkout flag | on | on | off → gradual rollout |

Justification to write: if staging uses the live Stripe key you risk real
charges in testing; if the checkout flag is *never* on in a prod-like
environment before prod, you've never tested the prod code path — the essence
of the dev/prod parity problem.

### 4. Spot the parity gap

You're told: "Tests pass in staging every time, but this feature `500`s in prod
about 10% of the time." Staging runs a single app instance with an in-memory
cache; prod runs 6 instances behind a load balancer sharing a Redis cache. List
the config/environment differences that could cause a prod-only failure.

<details>
<summary>Discussion</summary>

The parity gap is the concurrency/shared-state difference, expressed through
config: staging's in-memory cache means state is never shared or contended;
prod's 6 instances + shared Redis means cache misses, races, and
per-instance-in-memory assumptions (like the in-memory rate limiter from track
02 module 04!) behave differently. The "10% of the time" is the tell — it's
the fraction of requests hitting a code path that only breaks under
multi-instance/shared-state conditions that *staging's config never
reproduces*. The fix isn't a code change first; it's making staging's config
mirror prod's (multiple instances, real shared Redis) so the bug is reproducible
*before* prod. This is dev/prod parity (module 10) as a debugging tool.

</details>

### 5. Write the "why not hardcode" memo

In your own words (5-6 sentences), write the argument you'd give a junior
engineer who says "why can't I just put the prod DB URL in `settings.py`, it's
easier?" Cover: the same-build-everywhere principle, secrets in git history,
config-change-requires-redeploy, and the fact that git history is forever.

### 6. Diagnose and fix: the test suite that touched prod

Post-incident. An engineer ran the integration tests locally and they deleted
several thousand real customer rows. The test setup does
`db = connect(os.environ["DATABASE_URL"])` and then truncates tables in
`teardown`. Explain the config failure and the *two* independent fixes.

<details>
<summary>Solution</summary>

**The failure:** the tests read `DATABASE_URL` from the ambient environment
with *no guard on which environment that is*. The engineer's shell happened to
have the **prod** `DATABASE_URL` exported (maybe from an earlier debugging
session), so the test suite happily connected to prod and truncated prod tables.
This is *environment leakage* — the absence of config separation let dev code
reach prod resources.

**Fix 1 — fail-fast guard (defense in the app).** The test harness must
*refuse to run* unless it's pointed at a test database. Check
`settings.environment == Environment.dev`/`test` (or assert the DB name
matches a `test_` prefix) and raise loudly otherwise. This is module 00's
fail-fast applied to config: crash rather than proceed in a dangerous state.
Never trust the ambient environment for a destructive operation.

**Fix 2 — distinct credentials with no prod access (defense in depth).** The
credentials available on a developer's machine should *not be able to reach
prod at all*. Dev/test credentials should be scoped to dev/test databases;
prod credentials should live only in the prod environment (a secret manager,
module 03) and never be present on a laptop. Then even a misconfigured test
*cannot* touch prod, because the connection would be refused. The principle:
separation of config isn't just tidiness — with distinct, least-privilege
credentials per environment, whole classes of "oops I hit prod" incidents
become *impossible* rather than merely discouraged.

Both fixes matter: Fix 1 catches the mistake in the app; Fix 2 ensures the
mistake can't do damage even if Fix 1 is missing. Neither is a code change to
the *feature* — both are config/environment discipline.

</details>

## Independent challenge

No code given. Take any service you've built earlier in this curriculum (the
`api-layer` app from track 02 is ideal) and produce a complete **config
inventory**: enumerate every value the app depends on that would differ between
your laptop and production, classify each as static / dynamic / sensitive,
specify where each should come from and whether it's safe to display, and lay
out the dev/staging/prod matrix. Then write, in prose, the guarantee your
inventory provides: *"the same build artifact can run in any of the three
environments, and the only thing that changes is the injected config; here is
proof that no environment-specific value is baked into the code."* This
inventory becomes the direct input to module 03, where you'll load it with
Pydantic Settings. Reference **module 00's fail-fast principle** explicitly
where you decide which config must crash the app on boot if missing.

<details>
<summary>Hint</summary>

Grep your codebase for string literals that look environment-specific — URLs,
hostnames, ports, anything that looks like a key or token, magic numbers used
as limits. Every hit is a candidate. For each, apply the litmus test ("would
two deployments need different values?") and then the sensitivity test ("is
exposure an incident?"). The values that must fail-fast on boot are almost
always the *sensitive required* ones (no database password → the app can't do
anything useful, so crash now) plus anything the app can't safely default (the
environment name itself). Anything with a safe default (log level → `INFO`)
can degrade rather than crash.

</details>

## Cumulative review

Closed-book. This covers modules 00-02. Write each answer before expanding —
and if one exposes a gap, go redo that module's exercises, don't just read the
answer.

1. A service catches every exception in a top-level handler and returns
   `{"error": "something went wrong"}` with a `200` status, logging nothing.
   Name *three separate* things wrong with this across what you've learned so
   far (think: module 00's swallowing, module 01's leaking/shape, and status
   codes).
2. You're designing the error surface for an endpoint that reads a
   `DATABASE_URL` from config and queries it. Walk through: what should happen
   if the config is *missing at startup*; what should happen if the DB is
   *reachable but the row is missing*; and what should happen if the DB
   *connection drops mid-query*. For each, name the strategy (fail-fast /
   fail-safe / propagate), the status code the client sees, and whether the
   real cause is logged with a traceback.
3. Why does putting a hardcoded `sk_live_...` key in `settings.py` create a
   security problem that persists *even after you delete the line*, and how
   does that connect to module 01's rule about not leaking internals in error
   responses?
4. Distinguish static, dynamic, and sensitive config with one example each,
   and state the one handling rule that's unique to each flavour.
5. Explain, using the "10% of requests fail in prod but never in staging"
   scenario, why dev/prod parity is a *debugging* tool and not just tidiness —
   and tie it to why config must be injected rather than hardcoded.

<details>
<summary>Answers</summary>

1. (a) **Swallowing (module 00):** logging nothing means the failure is
   completely invisible — no traceback, no way to diagnose or alert; a systemic
   outage looks identical to a single fluke. (b) **Wrong shape / status
   (module 01):** returning `200` for a failure is a lie that breaks every
   client's retry and error logic — a failure must be `4xx`/`5xx`; and a single
   uniform message means clients can't distinguish a bad-input `400` from a
   `500`. (c) **No distinction of expected vs unexpected (modules 00-01):** a
   real domain error (`404`) and an unanticipated bug are collapsed into one
   opaque response, and there's no `request_id` to correlate a report to a log.
2. **Missing config at startup:** fail-fast — crash on boot (module 00/02),
   the process should exit non-zero so no traffic is routed; client sees
   nothing because the app never started. **Row missing:** propagate a domain
   `NotFoundError` to the central handler → `404`; it's normal operation, log
   lightly or not at all, no traceback needed. **Connection drops mid-query:**
   this is an unexpected/infrastructure failure → translate to a `503` (or let
   it hit the catch-all → `500`); the client sees a generic message, and the
   full exception *is* logged with a traceback server-side because it's a real
   server problem. `5xx` here signals "retry may help"; `404` signals "don't
   retry unchanged."
3. Git history is permanent: once the key is committed it lives in every clone
   and every historical revision *forever*, so deleting the line removes it
   from the current tree but not from history — the secret is effectively
   public to anyone with repo access and must be *rotated*, not just deleted.
   It connects to module 01's rule because both are information-disclosure
   failures: a leaked key in git and a leaked stack trace in a `500` response
   are the same category of mistake — sensitive internal detail escaping to
   where it shouldn't be.
4. **Static:** e.g. `DATABASE_HOST` — set per environment, changed by restart;
   unique rule: safe to display/log. **Dynamic:** e.g. a feature flag or rate
   limit — unique rule: must be changeable *at runtime without a redeploy*, so
   it can't come only from a startup file. **Sensitive:** e.g. an API key —
   unique rule: exposure is a security incident, so *never* in source control
   or logs; from a secret manager.
5. Staging that mirrors prod reproduces prod-only bugs *before* users hit them;
   the "10% fail in prod only" symptom is a code path that only breaks under
   conditions staging's config never recreates (e.g. multiple instances +
   shared cache vs staging's single in-memory instance). So parity turns an
   un-debuggable prod-only failure into a reproducible staging failure —
   that's the debugging value. It requires injected (not hardcoded) config
   precisely because parity means *same build, different injected config*: you
   make staging resemble prod by changing config, which is only possible if
   behaviour is driven by injected config in the first place.

</details>

## Common mistakes & troubleshooting

- **Hardcoding environment-specific values in source.** Breaks
  same-build-everywhere, buries secrets in git history, turns a config tweak
  into a redeploy. The root sin this whole module exists to prevent.
- **Conflating secrets with static config.** Putting a password in a
  checked-in `.env` or a ConfigMap leaks it. Secrets get their own handling
  (module 03).
- **Baking feature flags into the build.** Turns a runtime toggle into a
  redeploy. Dynamic config must come from a source that can change under the
  running app.
- **Scattered `os.environ[...]` reads.** No single source of truth, easy to get
  two names for one value, no validation. Load once into a typed object.
- **No fail-fast on missing required config.** The app boots and fails
  confusingly on the 500th request instead of crashing on line one. Validate
  required config at startup.
- **Staging that doesn't resemble prod.** Config drift makes "passed in
  staging" meaningless. Keep parity, especially for the things that only break
  under prod-like conditions.
- **Shared credentials across environments.** Lets dev code reach prod
  resources by accident. Distinct, least-privilege credentials per environment.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the litmus test for whether a value is "config," and give one example
   that is config and one that is code.
2. Name the three flavours of config and the single handling rule unique to
   each.
3. Why must the *same build artifact* run in dev, staging, and prod — what
   goes wrong if you instead ship different code per environment?
4. What is dev/prod parity and why does breaking it make staging useless as a
   safety net?
5. Give two distinct problems caused by hardcoding a prod database URL in
   source code.
6. Why should config be loaded once into a typed, validated object at startup
   rather than read via `os.environ[...]` wherever it's needed?

<details>
<summary>Answers</summary>

1. Litmus test: *would two deployments of the same code legitimately need
   different values?* If yes, it's config. Config example: the database host
   (`localhost` in dev, an internal hostname in prod). Code example: how a
   discount is computed / your routing table — identical everywhere the code
   runs.
2. **Static** — rarely changes, restart to change; unique rule: safe to
   display. **Dynamic** — changes at runtime without redeploy (feature flags,
   limits); unique rule: must come from a source changeable under the running
   process. **Sensitive** — exposure is an incident; unique rule: never in
   source control or logs, from a secret manager.
3. So that "it passed in staging" actually predicts prod behaviour and a
   config tweak (not a code change) moves the artifact between environments. If
   you ship different code per environment, staging tests a *different program*
   than prod runs, so staging guarantees nothing about prod, and you lose
   build reproducibility — every environment becomes a bespoke, separately-built
   thing.
4. Parity = keeping staging (and dev, as far as feasible) as close to prod as
   possible, differing only by config. Breaking it means bugs that only appear
   under prod-specific conditions (multiple instances, shared cache, real data
   volumes) never surface in staging, so staging passes and prod breaks —
   staging stops being predictive.
5. (a) The same source can no longer run in another environment without editing
   code, destroying build reproducibility and forcing per-environment code. (b)
   If it contains credentials, they're now in git history permanently (leaked),
   and even changing a non-secret URL now requires a commit + rebuild + redeploy
   instead of a config change.
6. A typed object validates config *once at startup* (fail-fast on a missing
   secret or malformed value, rather than a confusing error deep in a request),
   and gives a single documented source of truth so you can't accidentally read
   two different names for the same value or scatter unvalidated reads
   everywhere.

</details>

## Next

[03-config-sources-and-secrets](../03-config-sources-and-secrets/README.md)
— you can now classify config and reason about environments. Next, the
mechanics: *where* the values come from (env vars vs files vs flags), how to
load them into a typed Pydantic Settings object with fail-fast validation, how
to keep secrets out of source control and in a secret manager, and how to flip
feature flags at runtime.
