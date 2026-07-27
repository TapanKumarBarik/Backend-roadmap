# Module 05: Service Configuration and Environments

## Why this matters

You have one image (module 00), injected with config at run time (module 01), built
by CI (module 02), rolled out safely (module 03). The thing that makes that *one
image* run correctly as dev, staging, and prod is the **config** you feed it — and
managing that config across environments, injecting secrets at deploy time without
leaking them, and controlling what's *on* independently of what's *deployed*, is
its own discipline with its own failure modes.

Get config management wrong and the symptoms are among the most painful in
backend engineering: a staging run that accidentally points at the production
database and corrupts real data; a secret printed into a log or an error response
and now compromised; a config value that's set in dev but forgotten in prod so the
service half-works in a way no test caught; a feature that can only be turned off
by an emergency redeploy at 2am. Every one of these is a config-management failure,
not a code bug, and the deploy pipeline is where you either prevent or cause them.

Track 08 (modules 02-03) taught config *as an app concern*: `pydantic-settings`,
typed and validated config, `SecretStr`, config sources and layering. Track 09
taught secrets management as a *security* concern. This module is the *deployment*
view that ties them together: how config differs across environments while the code
stays identical, how secrets get injected at deploy time from a secret store (not
committed, not in the image), and how feature flags let you separate deploying code
from releasing behavior. The secret-store *infrastructure* — Azure Key Vault,
Kubernetes Secrets/External Secrets, managed identity — is `learn/03-kubernetes`
and `learn/16-identity-deep-dive`; the backend engineer's decisions are here.

## Concepts

### One codebase, many environments: what differs and what must not

Factor I/X: the *same build artifact* runs in dev, staging, and prod, and
environments differ **only by config**, never by code. That principle is only
useful if you're disciplined about what "config" is. Config is *everything that
varies between deploys*: connection strings, hostnames, credentials, log levels,
resource limits, feature toggles, external API endpoints. Code — including business
logic, validation rules, and the set of features that *exist* — is the same
everywhere.

Two properties this buys you, both from track 08's config track:

- **Dev/prod parity (factor X):** the environments should be as *similar* as
  possible — same backing service types (Postgres in dev, Postgres in prod, not
  SQLite-then-Postgres), same dependencies, small config surface. The more they
  diverge, the more "works in staging, breaks in prod" bugs you get. Config should
  express *values* that differ (URLs, sizes), not *structural* differences.
- **The environment is named in config, not branched in code.** An `APP_ENV`
  (`dev`/`staging`/`prod`) value tells the app *which* environment it's in, and the
  app reads its other config accordingly — but you should be deeply suspicious of
  `if app_env == "prod":` branches in business logic. Those are code paths that
  *only run in prod*, i.e. untested-until-prod code — the opposite of parity. Use
  config values to parameterize behavior, not `if env` branches to change it.

The validation angle matters at deploy time specifically: with `pydantic-settings`,
a missing or malformed required config value should make the app **fail to start**
(fail-fast, track 08 module 00) rather than boot half-configured. A deploy that
would run with a broken config should crash on startup and fail the rollout's
readiness check — loudly, immediately — not limp along serving errors.

### The config spectrum: hardcoded → env vars → config service, and secrets apart

Not all config is the same, and the mechanism should match the kind:

- **Non-secret, per-environment config** (log level, feature flags, pool sizes,
  external URLs): env vars are the 12-factor default and are plenty for a modest
  config surface. When the surface grows to hundreds of settings, a **config
  service / config file mounted per environment** (a ConfigMap in Kubernetes, an
  App Configuration store) becomes reasonable — the pragmatic bend on factor III
  that track 08 module 10 flagged. Either way it's injected, not baked in.
- **Secrets** (DB passwords, API keys, signing keys, tokens) are config too, but
  they get **stricter handling**: never in the repo, never in the image, never in
  logs or error responses, and ideally sourced from a dedicated **secret store**
  rather than plain env vars. This is where track 09's discipline and `SecretStr`
  (track 08 module 03) come in — a `SecretStr` won't print its value when a config
  object is logged or an error is rendered, closing the most common leak path.

The litmus test remains track 08 module 10's: *could you open-source this repo
right now without leaking a credential?* Secrets pass it by never being in the repo
in the first place — they're injected at deploy time from the store.

### Injecting secrets at deploy time

The safe path for a secret, end to end, keeps it out of everything durable and
inspectable except the secret store:

1. The secret lives in a **secret store** (Azure Key Vault, Kubernetes Secret
   backed by a store, HashiCorp Vault) — not in Git, not in the CI config, not in
   the image.
2. At **deploy/run time**, the platform injects it into the container as an env var
   or a mounted file — the *release* step of build/release/run. The image (the
   *build*) never contained it.
3. The app reads it via `pydantic-settings` into a `SecretStr`, so it's typed and
   won't leak through logs or error rendering.
4. **Rotation** happens in the store; a redeploy (or a secret-refresh mechanism)
   picks up the new value — the code never changes.

The anti-patterns this rule set eliminates: secrets committed to Git (leaked
forever in history — the reason for secret scanning in module 02), secrets baked
into the image (anyone who pulls the image gets them), secrets in CI logs (echoed
by a careless step), and secrets in a plaintext `.env` checked into the repo (why
`.env` is in `.gitignore` *and* `.dockerignore`). The *how* — Key Vault, managed
identity so the app authenticates to the store without a bootstrap secret, External
Secrets Operator syncing into the cluster — is `learn/16-identity-deep-dive` and
`learn/03-kubernetes`; the rule you own is *store it, inject at release, type it as
a secret, rotate in the store.*

### Feature flags: decoupling deploy from release

The deployment strategies in module 03 control *how code reaches production*.
**Feature flags** control *whether a feature is on*, independently — and that
separation is powerful. A feature flag is a config-driven runtime switch
(`if flags.new_checkout_enabled:`) that lets you:

- **Deploy code dark.** Merge and deploy an unfinished or risky feature turned
  *off*, so it's in production but inert. This lets you deploy continuously
  (small, frequent, low-risk deploys) without waiting for a feature to be "done" —
  and it makes the risky expand/contract migrations of module 04 easier to
  sequence (the new read path can be flag-gated).
- **Release without deploying.** Turn a feature *on* by flipping a flag (a config
  change, not a code deploy), and turn it *off* the same way if it misbehaves — an
  instant kill switch that needs no rollback and no 2am redeploy.
- **Gradual/targeted rollout.** Enable a feature for 5% of users, or internal users
  only, or one tenant — a canary at the *feature* level rather than the deploy
  level.

The cost is real and worth naming: flags are **config that lives in code paths**,
so every flag is a branch that must be tested in both states, and stale flags
accumulate into an unreadable mess of dead conditionals. The discipline is to treat
flags as **temporary** by default — a flag for a rollout should be *removed* once
the feature is fully on and stable, exactly like the `contract` step removes the
old column in module 04. Long-lived flags (true configuration, like
per-tenant entitlements) are legitimate but should be recognized as *permanent
config*, not leftover rollout scaffolding. Full flag platforms (LaunchDarkly,
Unleng, targeting rules, experimentation) are a specialization; the backend
engineer's core skill is knowing *why* to reach for a flag and to clean them up.

### Config as part of the deploy, and validating it

Pulling it together at the pipeline level: config is a **release input**, and
treating it with the same rigor as code prevents a whole class of incidents.

- **Config is versioned and reviewed** (per environment), just like code — a
  ConfigMap/values file in Git (minus secrets), changed by PR, so a prod config
  change is auditable and reversible. This is the GitOps idea; the tooling is
  `learn/10-cicd-and-gitops`.
- **Config is validated at startup, failing fast.** The app defines its config
  schema (`pydantic-settings`); a deploy with a missing required var or a malformed
  URL crashes on startup and fails the rollout's readiness check, rather than
  running misconfigured. This turns "prod is subtly broken because someone forgot
  to set `REDIS_URL`" into "the deploy never went live."
- **Environment isolation is enforced, not hoped for.** Staging config must not be
  able to reach prod's database. The most reliable enforcement is that staging
  simply doesn't *have* prod's credentials (separate secret stores/scopes per
  environment) — so a copy-paste mistake can't point staging at prod, because the
  connection string isn't available to it.

The recurring theme: config errors should fail **early and loud** (at deploy time,
on startup) rather than **late and quiet** (in production, subtly), and the way you
get that is typed validation + environment-scoped secrets + reviewed, versioned
config.

## Command reference

| Concern | Approach |
|---|---|
| Per-env non-secret config | Env vars / ConfigMap, injected at release |
| Large config surface | Config file/service mounted per environment |
| Secrets | Secret store → injected at deploy; `SecretStr` in app |
| Env identity | An `APP_ENV` value; **not** `if env` branches in logic |
| Config validation | `pydantic-settings` → fail-fast on startup |
| Feature on/off without deploy | Feature flag (config-driven switch) |
| Environment isolation | Separate secret scopes so staging can't reach prod |
| Config change auditability | Config in Git (minus secrets), changed by PR |

Typed, validated config that fails fast and won't leak secrets (track 08 modules
02-03, restated for deployment):

```python
from pydantic import SecretStr, PostgresDsn, field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_env: str = "dev"                    # names the environment; does NOT branch logic
    database_url: PostgresDsn               # required — missing → startup crash (fail fast)
    redis_url: str
    log_level: str = "INFO"
    stripe_key: SecretStr                   # secret: won't print in logs/errors
    new_checkout_enabled: bool = False      # feature flag, config-driven

    @field_validator("app_env")
    @classmethod
    def known_env(cls, v: str) -> str:
        if v not in {"dev", "staging", "prod"}:
            raise ValueError(f"unknown APP_ENV: {v}")   # bad config fails the deploy, loudly
        return v

settings = Settings()   # a missing/invalid required value raises here → the container won't start
```

A feature flag decoupling release from deploy:

```python
@app.post("/checkout")
async def checkout(cart: Cart):
    if settings.new_checkout_enabled:       # flip via config — no redeploy to turn on/off
        return await new_checkout(cart)     # deployed dark until the flag is flipped
    return await legacy_checkout(cart)
# TODO(flag): remove new_checkout_enabled + legacy_checkout once new path is fully on & stable
```

Injecting a secret at deploy time (Kubernetes shape; the store/identity mechanics
are `learn/03` + `learn/16`) — note the image never contains the secret:

```yaml
# Secret lives in the store; injected as env at release. Image (build) has none of this.
envFrom:
  - configMapRef: { name: app-config }     # non-secret, per-env config
  - secretRef:    { name: app-secrets }    # secrets, injected at deploy — never in Git/image
```

## Hands-on exercises

Use the containerized service from earlier modules with Postgres/Redis in Docker.

### 1. One image, three environment configs

Run the same image three times with `dev`/`staging`/`prod` config sets (different
`APP_ENV`, `DATABASE_URL`, `LOG_LEVEL`). Add an `/info` endpoint returning
`app_env` and the log level. Confirm behavior differs by config alone, no rebuild —
and that *no* config is in the image (`docker history`).

### 2. Fail fast on missing config

Remove a required config var (e.g. `DATABASE_URL`) and start the container. Confirm
it crashes on startup with a clear error rather than booting broken. Add an
`app_env` validator that rejects an unknown value and prove a typo'd `APP_ENV`
fails the start. Connect this to the rollout readiness check from module 03.

### 3. Type a secret so it can't leak

Store an API key as a plain `str` in `Settings`, then log the settings object and
watch the key appear in the log. Change it to `SecretStr` and confirm it now prints
as `**********`. Trigger an error that renders config and confirm the secret
doesn't leak there either. This is track 08 module 03 / track 09, at deploy scope.

### 4. Keep secrets out of the image and repo

Confirm `.env` is in both `.gitignore` and `.dockerignore`. Grep the repo and image
for anything secret-shaped (module 02's secret scan). Inject the secret at run via
`--env-file`/`secretRef` instead, and verify the running app has it while the image
does not.

### 5. Deploy code dark behind a flag

Add a feature flag defaulting to `false`, wrapping a new endpoint/behavior. Deploy
it (the code is in prod, inert). Flip the flag on via config *without redeploying*
(restart with the env var flipped, or a live flag source) and confirm the feature
activates. Flip it off again as a kill switch.

### 6. Enforce environment isolation

Give staging and prod *separate* secret sets so staging simply doesn't have prod's
`DATABASE_URL`. Try to "accidentally" point staging at prod and confirm it can't —
the credential isn't available to it. Write one sentence on why "don't have the
secret" beats "remember not to use it."

### 7. Avoid the `if env` trap

Find or write an `if app_env == "prod":` branch that changes business logic. Refactor
it so the differing behavior is driven by a *config value* instead
(`if settings.rate_limit_enabled:` set per env). Explain how this restores dev/prod
parity and testability.

### 8. Diagnose and fix

A service has three recurring incidents: (1) last week a staging test run wiped a
production table; (2) a support engineer found the Stripe key printed in the error
logs; (3) turning off a broken feature required an emergency redeploy that took 40
minutes. Its config looks like this:

```python
DATABASE_URL = "postgresql://prod-db/app"          # (a) hardcoded prod URL, same for all envs
STRIPE_KEY = "sk_live_51H..."                       # (b) hardcoded live secret
class Settings(BaseSettings):
    stripe_key: str                                 # (c) plain str
    # no APP_ENV, no validation
def checkout():
    if NEW_FLOW:  # (d) module-level constant, only changeable by editing code + redeploy
        ...
```

<details>
<summary>Solution</summary>

- **(a) Hardcoded prod URL used everywhere** → staging runs against the prod DB and
  wipes it. Fix: `DATABASE_URL` per environment from config, and **separate secret
  scopes** so staging literally doesn't have prod's credentials — isolation
  enforced, not hoped for.
- **(b) Hardcoded live secret** → in the repo/image forever (leaked). Fix: move to a
  secret store, inject at deploy, never in Git/image (module 02's secret scan would
  have caught it).
- **(c) `stripe_key: str`** → printed in logs/errors (the leak the support engineer
  found). Fix: `SecretStr`, which redacts in logs and error rendering.
- **(d) `NEW_FLOW` as a code constant** → the only way to turn the feature off is to
  edit code and redeploy (the 40-minute emergency). Fix: make it a **feature flag**
  (config-driven), flippable without a deploy — an instant kill switch.
- Missing `APP_ENV` + validation → misconfig boots silently. Fix: typed, validated
  `pydantic-settings` that **fails fast** on startup so a bad config fails the
  rollout instead of running broken.

Root theme: config errors were failing *late and quiet* (in prod, subtly).
Externalize per-env config, isolate secrets by environment, type secrets so they
can't leak, flag features so release is decoupled from deploy, and validate config
so failures are *early and loud*.

</details>

## Independent challenge

No code given. Take the service you've carried through this track and give it a
production-grade configuration setup across dev/staging/prod, then prove each
property. (1) **One image, many environments:** run the same module 00 image as all
three environments differing only by injected config, with *no* config baked into
the image and *no* `if env` branches in business logic (parameterize with config
values instead). (2) **Secrets, safely:** source every secret from a secret store,
inject it at deploy time, type it as `SecretStr` so it can't leak into logs or
errors, and confirm the repo and image contain no credentials — building on
**track 08's module 03 (Config sources and secrets)** and **track 09's secrets
management** for the security discipline. (3) **Fail fast on bad config:** make a
missing/invalid required value crash the container on startup so it fails the
rollout readiness check rather than running misconfigured. (4) **Decouple deploy
from release:** put a risky new behavior behind a feature flag, deploy it dark, and
demonstrate flipping it on and off via config with no redeploy — then write the
note that says when you'll *remove* the flag. Enforce environment isolation by
giving each environment its own secret scope, and point to
`learn/16-identity-deep-dive` and `learn/03-kubernetes` for the secret-store and
managed-identity mechanics you'd use in production.

<details>
<summary>Hint</summary>

The unifying goal is that config errors fail *early and loud* instead of *late and
quiet*. For fail-fast, lean on `pydantic-settings`: declare required fields with no
default and add validators, so a missing `DATABASE_URL` or a bad `APP_ENV` raises
at `Settings()` construction — which is at container startup, which fails the
rollout. For isolation, the strongest guarantee isn't a rule ("don't use prod in
staging") but an *absence* (staging doesn't have prod's credentials in its scope),
so a mistake can't reach prod. For the flag, the proof that matters is flipping it
*without a redeploy* — same running container, behavior changes — because that's
exactly what a 2am kill switch needs; and pre-commit yourself to removing it, so it
doesn't become the dead conditional module 04's `contract` step warns about.

</details>

## Common mistakes & troubleshooting

- **Hardcoded per-env config (esp. a prod URL) used everywhere.** Staging hits
  prod's DB and corrupts data. Per-env config from the environment; separate secret
  scopes so staging can't reach prod.
- **Secrets in the repo or image.** Leaked forever / shipped to anyone who pulls
  the image. Store in a secret store, inject at deploy, keep `.env` out of Git and
  the image.
- **Secrets as plain `str`.** Printed in logs and error responses. Use `SecretStr`.
- **`if app_env == "prod"` branches in logic.** Code paths that only run in prod =
  untested-until-prod, breaks parity. Parameterize behavior with config *values*.
- **Config not validated.** A missing var boots a half-working service. Fail fast
  on startup with typed `pydantic-settings` so a bad config fails the rollout.
- **Feature toggles as code constants.** Turning a feature off needs an emergency
  redeploy. Use config-driven feature flags — flip without deploying.
- **Flags that never get removed.** Accumulate into dead, untested conditionals.
  Treat rollout flags as temporary; remove once fully on (like module 04's
  contract step).
- **Environment isolation by convention.** "Remember not to" fails. Enforce by not
  granting staging prod's credentials.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What exactly is allowed to differ between environments and what must stay
   identical, and why are `if app_env == "prod"` branches in business logic a
   parity/testability problem?
2. Trace a secret's safe path from store to app. Name every place it must *not*
   appear and what `SecretStr` specifically prevents.
3. Why should a missing or malformed required config value crash the container on
   startup, and how does that interact with the module 03 rollout?
4. What do feature flags decouple, and give one concrete win for deploying code
   "dark" and one for "releasing without deploying."
5. What's the downside of feature flags, and what discipline keeps it from
   becoming a mess (and which module's pattern is it analogous to)?
6. "Staging must never touch prod's database." Why is enforcing this by *not
   granting the credential* stronger than a rule saying "don't use prod in
   staging"?

<details>
<summary>Answers</summary>

1. Only **config** (values that vary between deploys — URLs, credentials, log
   levels, toggles, sizes) may differ; the **code**, including business logic and
   which features exist, stays identical (factor I/X). `if app_env == "prod"`
   branches create logic that *only runs in prod*, so it's untested until it hits
   prod (breaking parity), and it diverges the environments structurally rather
   than by value. Parameterize with config values instead.
2. The secret lives only in a **secret store**; at **deploy/release time** the
   platform injects it into the container (env var/mounted file); the app reads it
   into a **`SecretStr`**; rotation happens in the store, picked up by a redeploy/
   refresh. It must *not* appear in Git/history, the image, CI logs, a committed
   `.env`, app logs, or error responses. `SecretStr` specifically prevents it
   leaking through logging the config object and through error rendering (it prints
   redacted).
3. Because a service that boots with broken/missing config runs *subtly wrong* in
   production — the worst kind of failure (late and quiet). Failing fast on startup
   (typed `pydantic-settings` raising) makes the misconfigured container never
   become ready, so its **readiness probe fails and the rollout is halted** (module
   03) — the bad config fails the deploy instead of reaching users.
4. Flags decouple **deploying code** from **releasing the behavior**. Deploying
   dark: you can merge/deploy an unfinished or risky feature turned off, enabling
   small continuous deploys without waiting for the feature to be done (and it
   eases sequencing the expand/contract migrations of module 04). Releasing without
   deploying: flip a flag to turn a feature on/off via config — an instant kill
   switch with no redeploy and no rollback.
5. Flags are branches in code that must be tested in *both* states, and stale flags
   pile up into dead, confusing conditionals. The discipline: treat rollout flags
   as **temporary** and remove them once the feature is fully on and stable —
   analogous to module 04's **contract** step removing the old column once nothing
   uses it. (Genuinely permanent config, like per-tenant entitlements, is a
   different thing and can stay.)
6. Because "don't use prod in staging" relies on humans remembering and never
   copy-pasting the wrong connection string — it fails eventually. If staging's
   secret scope simply *doesn't contain* prod's credentials, then no mistake in
   staging can reach prod's database, because the connection string isn't available
   to it at all. Enforcement by absence beats enforcement by convention.

</details>

## Next

[06-health-checks-readiness-and-scaling-signals](../06-health-checks-readiness-and-scaling-signals/README.md)
— your service is well-configured and its secrets are safe. Now we make it
*manageable by the platform*: liveness and readiness probes from the app's side
(building on track 08's graceful shutdown), what the app must expose so a scheduler
knows when it's ready for traffic and when to restart it, and the metrics an
autoscaler needs to scale it.
