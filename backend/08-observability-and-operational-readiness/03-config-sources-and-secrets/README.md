# Module 03: Config Sources and Secrets

## Why this matters

Module 02 gave you the taxonomy — static, dynamic, sensitive; dev, staging,
prod. This module is the *plumbing*: where the values physically come from, how
to load them into a typed object that fails fast on bad input, and — the part
that gets people fired — how to handle secrets so they don't end up in git, in
logs, or in a screenshot in Slack.

The stakes on the secrets half are not abstract. Bots continuously scan public
GitHub for committed AWS keys and Stripe tokens; the median time-to-exploitation
of a leaked cloud key is *minutes*, not days. And the leak doesn't have to be
public: a secret in your git history is exposed to everyone who has ever cloned
the repo, including the contractor who left last year and the laptop that got
stolen. "Delete the line and force-push" does not fix it — the secret is in the
history, in every fork, and must be *rotated*. So the goal isn't "clean up
leaked secrets," it's *never let them touch source control in the first place*.

The config-loading half is quieter but just as operationally important. A
service that reads `os.environ["PORT"]` and blows up with `ValueError: invalid
literal for int()` on the first request that needs the port — instead of
crashing cleanly at startup with "PORT must be an integer" — is a service
that's hard to operate. Pydantic Settings turns config into a validated,
typed, documented contract loaded once at boot, which is the fail-fast
principle from module 00 applied to the thing that most often varies between a
working and a broken deploy.

## Concepts

### Config sources and their tradeoffs

There are four common places config values physically live. Each has a niche;
using the wrong one is a recurring source of pain.

**Environment variables** — key/value pairs in the process's environment
(`DATABASE_URL=postgres://...`).
- *Pros*: language-agnostic, the standard for containers/Kubernetes/PaaS,
  injected by the platform without touching the image, easy to override per
  environment, never committed (they live in the runtime, not the repo). This
  is the 12-factor recommendation (module 10, factor III) and the default you
  should reach for.
- *Cons*: flat (no nesting — though libraries fake it with `__`), all values
  are strings (you must parse/validate), and they can leak into logs, crash
  dumps, and child processes if you're careless. Not great for large
  structured config.

**Static config files (JSON / YAML / TOML / `.env`)** — a file the app reads
at startup.
- *Pros*: handles nesting and structure naturally, reviewable, good for large
  or hierarchical non-secret config, easy to diff.
- *Cons*: the file has to *get to* the environment somehow (baked into the
  image = bad for secrets and parity; mounted at runtime = fine), and it's the
  classic vector for accidentally committing secrets (a `.env` or
  `config.prod.json` slipping past `.gitignore`). Files are great for
  *non-secret structured* config; dangerous as a home for secrets.

**Command-line flags** — `--port 8080 --log-level debug`.
- *Pros*: explicit, self-documenting (`--help`), unambiguous per-invocation,
  great for tools/CLIs and one-off overrides.
- *Cons*: awkward for many values, **visible in the process list** (`ps aux`
  shows every flag — so *never* pass secrets as flags), and clumsy to manage
  across many services. Good for a handful of operational overrides, bad as
  the primary config mechanism for a long-running service.

**Remote config / secret managers** — a service the app queries (HashiCorp
Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, a
feature-flag service).
- *Pros*: centralized, access-controlled, auditable, supports rotation, and —
  crucially — supports *dynamic* config that changes under a running app.
- *Cons*: a runtime dependency (what if it's down at startup? — fail-fast or
  cache), more moving parts. This is where *secrets* and *dynamic* config
  belong in a serious deployment.

The pragmatic layering nearly everyone converges on: **non-secret config via
environment variables (optionally sourced from a mounted file), secrets via a
secret manager injected as env vars at runtime, dynamic config via a
flag/config service, CLI flags for occasional operational overrides.** Pydantic
Settings ties the first two together cleanly.

### Env vars vs files vs flags — choosing

A quick decision guide, because "which source?" comes up constantly:

| You have… | Use | Because |
|---|---|---|
| A secret (DB password, API key) | Secret manager → injected as env var | Never in an image or repo; rotatable |
| A single scalar that varies per env (log level, port) | Env var | 12-factor default, trivial to override |
| Large structured non-secret config | Mounted YAML/JSON file | Nesting + reviewability |
| A one-off operational override for this run | CLI flag | Explicit, self-documenting |
| A value you must flip without redeploy | Flag/config service | Dynamic, runtime-changeable |

The anti-patterns this table encodes: secrets as CLI flags (visible in
`ps`), secrets baked into a config file in the image (leaks with the image),
and dynamic config in a startup-only file (can't flip without redeploy).

### Managing secrets safely

The rules, in priority order:

1. **Never commit secrets to source control.** Not in code, not in a committed
   `.env`, not in a checked-in `config.prod.json`. Add `.env` and friends to
   `.gitignore` *before* you create them. Commit a `.env.example` with the
   *keys* and dummy values instead, so the shape is documented without the
   secrets.
2. **Assume anything committed is compromised forever.** git history is
   permanent and forked. If a secret is committed, the only real remediation is
   **rotate the secret** (issue a new key, revoke the old), plus scrubbing
   history as a secondary cleanup. Deleting the line is not remediation.
3. **Secrets live in a secret manager in real deployments.** Vault / AWS
   Secrets Manager / cloud KMS store the secret, control *who* can read it,
   *audit* every access, and support *rotation*. The app (or the platform)
   fetches the secret at startup or gets it injected as an env var — the secret
   never sits in the repo or the image. In Kubernetes this is a `Secret`
   object (or an external-secrets operator pulling from a cloud vault) mounted
   as env vars; the `learn/03-kubernetes` module 05 covers the cluster side.
4. **Never log secrets.** This is its own discipline (module 05 goes deep) —
   redact them at the boundary, and structure your config object so secrets are
   hard to accidentally print (Pydantic's `SecretStr` helps — its `repr` is
   `**********`).
5. **Least privilege and rotation.** Each environment (and ideally each
   service) gets its own credentials, scoped to only what it needs, rotated on
   a schedule and immediately on any suspected exposure.

`SecretStr` is a small but real safety net worth using:

```python
from pydantic import SecretStr

password = SecretStr("hunter2")
print(password)                    # -> **********   (safe to log accidentally)
print(f"connecting with {password}")   # -> connecting with **********
password.get_secret_value()        # -> "hunter2"    (explicit, deliberate access only)
```

The value is that a stray `log.info(settings)` or an f-string interpolation
prints `**********` instead of the real secret — a passive guardrail against
the single most common secret-leak vector (module 05's core sin).

```
   plain str "hunter2"                SecretStr("hunter2")
        │                                   │
   log.info(settings) ──▶ hunter2      log.info(settings) ──▶ **********  ✓
   f"{pw}"            ──▶ hunter2      f"{pw}"            ──▶ **********  ✓
   traceback repr    ──▶ hunter2      traceback repr    ──▶ **********  ✓
                          ▲                                   │
                    LEAKED to logs                  .get_secret_value() ──▶ hunter2
                                                   (deliberate, greppable, only here)
```

### Pydantic Settings: typed config as a contract

`pydantic-settings` (a separate package from `pydantic`) is the standard way to
turn scattered env vars into one validated, typed `Settings` object. It reads
from environment variables (and optionally a `.env` file), coerces to the
declared types, validates, and **fails fast at construction** if anything
required is missing or malformed — module 00's fail-fast principle, exactly
where it matters most.

```python
from pydantic import Field, SecretStr, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",             # optional: read .env in dev (not committed!)
        env_file_encoding="utf-8",
        env_prefix="APP_",           # env vars are APP_DATABASE_URL, APP_PORT, ...
        extra="forbid",              # crash on an unexpected env var (typo-catcher)
    )

    # static config — typed, validated, with sensible defaults where safe
    environment: str = "dev"
    log_level: str = "INFO"
    port: int = 8000                             # "8000" from env is coerced to int
    database_url: PostgresDsn                     # REQUIRED (no default) — fail-fast if missing
    request_timeout_s: float = 5.0

    # sensitive config — SecretStr so it never prints in the clear
    stripe_secret_key: SecretStr
    jwt_signing_key: SecretStr

    # dynamic-ish config — tuneable
    rate_limit_per_min: int = 100
    feature_new_checkout: bool = False


# construct ONCE at startup. If APP_DATABASE_URL is missing or APP_PORT="abc",
# this line raises ValidationError and the process exits — before serving traffic.
settings = Settings()
```

What you get for free:

- **Type coercion**: `APP_PORT=8080` (a string, as all env vars are) becomes
  an `int`; `APP_FEATURE_NEW_CHECKOUT=true` becomes a `bool`. No manual
  parsing.
- **Validation & fail-fast**: `database_url` has no default, so a missing
  `APP_DATABASE_URL` raises `ValidationError` at `Settings()` — a clean startup
  crash, not a mystery failure later. `PostgresDsn` even validates the URL
  *shape*.
- **`extra="forbid"`**: a typo like `APP_DATABSE_URL` (which would otherwise be
  silently ignored while `database_url` falls back to a default or errors)
  becomes a loud "unexpected setting" error. Catches a whole class of "why
  isn't my config taking effect" bugs.
- **One source of truth**: the class *is* the documentation of every value the
  app depends on, its type, and whether it's required.

The precedence order (highest wins) is: values passed directly to
`Settings(...)`, then real environment variables, then the `.env` file, then
field defaults. So env vars override the `.env` file — exactly what you want:
`.env` for local dev convenience, real env vars injected by the platform in
prod.

```
   HIGHEST  ┌──────────────────────────────┐  wins if present
      │     │ Settings(port=9999)  kwargs  │  (tests, explicit override)
      │     ├──────────────────────────────┤
      │     │ process env var  APP_PORT    │  ◄─ platform injects in prod
      │     ├──────────────────────────────┤
      │     │ .env file        APP_PORT=   │  ◄─ dev convenience, git-ignored
      │     ├──────────────────────────────┤
      ▼     │ field default    port = 8000 │  used only if nothing above set it
   LOWEST   └──────────────────────────────┘
```

Inject the single `settings` object via FastAPI's dependency system rather than
importing a global everywhere, so it's overridable in tests:

```python
from functools import lru_cache
from fastapi import Depends

@lru_cache
def get_settings() -> Settings:
    return Settings()

@app.get("/config-check")
async def config_check(settings: Settings = Depends(get_settings)):
    return {"environment": settings.environment, "port": settings.port}
    # note: NO secrets in this response — only safe static values
```

### Feature flags: dynamic config without redeploy

A **feature flag** is a boolean (or richer) value that turns a code path on or
off *at runtime*, decoupling **deploy** from **release**. You deploy the code
for "new checkout" behind a flag that's `off`, then flip the flag to release it
to users — no redeploy — and flip it back instantly if it misbehaves (a
"kill switch"). This is dynamic config (module 02) in action, and it's how
teams ship safely: dark launches, gradual rollouts (10% → 50% → 100%), and
instant rollback of a *feature* without rolling back a *deploy*.

The key property that distinguishes a flag from static config: **it must be
readable from a source that can change under the running process.** A flag
baked into `Settings()` at startup is not really a flag — flipping it needs a
restart. Real flags come from:

- a **feature-flag service** (LaunchDarkly, Unleash, Flagsmith) — purpose-built,
  with targeting/rollout/audit;
- a **config store / database** the app polls or subscribes to;
- at minimum, an env var you can change plus a restart (crude, but the deploy
  and the flip are at least separate operations).

A minimal, dependency-injected flag check that re-reads on each request (so a
change takes effect without restart) looks like:

```python
class FeatureFlags:
    """Reads flags from a store that can change at runtime (here, a dict
    standing in for a flag service / Redis / DB row)."""
    def __init__(self, store: dict[str, bool]):
        self._store = store
    def enabled(self, name: str, default: bool = False) -> bool:
        return self._store.get(name, default)

flags = FeatureFlags(store={"new_checkout": False})

@app.post("/checkout")
async def checkout():
    if flags.enabled("new_checkout"):
        return {"flow": "v2"}      # new path — released by flipping the flag, no deploy
    return {"flow": "v1"}          # old path — instant fallback if v2 misbehaves
```

Guidance: keep flags *short-lived* (a flag that's been `100%` for a year is
tech debt — remove it and the dead branch), and *never* use a feature flag as a
secret (it's config that decides behaviour, not a credential). Flags are also a
graceful-degradation lever: a kill-switch flag lets you shed an expensive or
misbehaving feature instantly under load (module 00's fail-safe, on demand).

## Command reference

| Tool / pattern | Purpose | Example |
|---|---|---|
| `BaseSettings` (pydantic-settings) | Typed config loaded from env/`.env`, validated at startup | `class Settings(BaseSettings): ...` |
| `SettingsConfigDict(env_file=..., env_prefix=..., extra="forbid")` | Configure sources, prefix, and typo-catching | model config |
| `SecretStr` | Wrap a secret so it prints as `**********` | `key: SecretStr` |
| `.get_secret_value()` | Deliberately read a `SecretStr`'s real value | `settings.key.get_secret_value()` |
| Required field (no default) | Force fail-fast if the value is missing | `database_url: PostgresDsn` |
| `PostgresDsn` / `AnyUrl` | Validate a URL's *shape*, not just its presence | `database_url: PostgresDsn` |
| `@lru_cache` on `get_settings` | Construct settings once, inject via `Depends` | `@lru_cache def get_settings()` |
| `.env` + `.gitignore` | Local-dev convenience without committing secrets | `.env` ignored; `.env.example` committed |
| Secret manager (Vault/ASM/KMS) | Store/rotate/audit secrets; inject as env at runtime | platform-specific |
| Feature-flag service / config store | Dynamic config flippable without redeploy | LaunchDarkly / Unleash / DB row |

**Env var precedence (highest first):** direct kwargs to `Settings(...)` →
process env vars → `.env` file → field defaults. Use `.env` for dev, real env
vars in prod; real env vars win, which is what you want.

**All env vars are strings.** `APP_PORT=8080` is the string `"8080"`; Pydantic
coerces it to the declared type. Booleans accept `true/false/1/0/yes/no`.
Without a typed loader you'd hand-parse and hand-validate all of this.

**`pip install pydantic-settings`** — it moved out of core `pydantic` in v2.
Importing `BaseSettings` from `pydantic` directly is the most common v1→v2
gotcha.

## Hands-on exercises

Start a `config-secrets/` project:

```bash
python -m venv .venv && source .venv/bin/activate
pip install "fastapi[standard]" pydantic-settings structlog
printf ".env\n.venv/\n__pycache__/\n" > .gitignore     # ignore secrets FIRST
```

### 1. First typed settings, and a fail-fast crash

Create the `Settings` class from Concepts (trim it to `environment`, `port`,
`database_url`, `stripe_secret_key`). Run a script that just does
`print(Settings())` with **nothing** in the environment.

```bash
python -c "from settings import Settings; print(Settings())"
```

Expected: a `ValidationError` naming `database_url` and `stripe_secret_key` as
required-and-missing, and the process exits non-zero. This is fail-fast: the
app refuses to start without required config. Now create a `.env`:

```
APP_ENVIRONMENT=dev
APP_PORT=8080
APP_DATABASE_URL=postgres://user:pw@localhost:5432/app
APP_STRIPE_SECRET_KEY=sk_test_abc123
```

Re-run. Expected: it constructs successfully, and `port` is the *int* `8080`
(not the string `"8080"`).

### 2. Prove SecretStr doesn't leak

```python
s = Settings()
print(s)                                  # whole object
print(s.stripe_secret_key)                # the secret field alone
print(s.stripe_secret_key.get_secret_value())   # explicit unwrap
```

Expected: the first two print `stripe_secret_key=SecretStr('**********')` /
`**********` — the real key never appears — and only the explicit
`.get_secret_value()` reveals `sk_test_abc123`. Internalize that a stray
`print(settings)` or `log.info("config", **settings.model_dump())` is now safe
for secret fields.

### 3. Catch a typo with `extra="forbid"`

Add `extra="forbid"` to the model config (if not already). Add
`APP_DATABSE_URL=...` (misspelled) to your `.env` *alongside* the correct one.
Run. Expected: a validation error about an unexpected `databse_url` setting —
instead of the typo being silently ignored. Remove `extra="forbid"` and
confirm the typo is now silently swallowed (the classic "my config isn't taking
effect" bug). Put it back.

### 4. Env vars override the .env file

With `APP_PORT=8080` in `.env`, run:

```bash
APP_PORT=9999 python -c "from settings import Settings; print(Settings().port)"
```

Expected: `9999` — the real env var wins over the `.env` file, per the
precedence order. This is exactly how prod works: `.env` is dev convenience;
the platform injects real env vars that override it.

### 5. Inject settings into FastAPI, expose a *safe* config endpoint

Wire `get_settings` with `@lru_cache` and add the `/config-check` endpoint from
Concepts. `curl localhost:8000/config-check`. Expected: it returns
`environment` and `port` — and you must confirm it returns **no** secret. Try
adding `stripe_secret_key` to the response and observe `SecretStr` still
protects you (it serializes as `**********` unless you call
`.get_secret_value()`), then remove it — a config endpoint should expose static
values only.

### 6. A runtime feature flag

Add the `FeatureFlags` class and the `/checkout` route from Concepts. Add an
admin route to flip the flag *without restarting*:

```python
@app.post("/admin/flags/{name}/{state}")
async def set_flag(name: str, state: bool):
    flags._store[name] = state
    return {name: state}
```

Call `/checkout` (get `v1`), then `POST /admin/flags/new_checkout/true`, then
`/checkout` again (get `v2`) — all *without restarting the server*. Expected:
behaviour changes at runtime. That's the deploy-vs-release decoupling: the v2
code was always deployed; you *released* it by flipping the flag.

### 7. The kill-switch drill

Add an "expensive" endpoint guarded by a flag defaulting to `on`, and simulate
shedding it under load by flipping the flag `off` at runtime and returning a
degraded response instead. Confirm you can disable a misbehaving feature
*instantly* without a deploy. Tie this back to module 00: this is fail-safe
graceful degradation, available on demand.

### 8. Diagnose and fix: a leaked secret and a config that won't load

You inherit this. Two problems: the CI logs show the Stripe key in plaintext,
and a new hire reports "I set `DATABASE_URL` but the app still uses the
default." Find and fix both.

```python
# settings.py
from pydantic import BaseSettings          # (1)
class Settings(BaseSettings):
    database_url: str = "postgres://localhost/dev"   # (2)
    stripe_key: str = ""                              # (3)
settings = Settings()

# startup.py
import logging
logging.info(f"Booting with settings: {settings.__dict__}")   # (4)
```

And the new hire set `export DATABASE_URL=postgres://prod/...` (5).

<details>
<summary>Solution</summary>

**Leaked secret — bugs (3) + (4).** `stripe_key: str` is a plain string, and
line (4) logs the entire settings dict, so the real key is printed to CI logs
in plaintext (module 05's cardinal sin). *Two* fixes: make it
`stripe_key: SecretStr` so it prints as `**********` even if logged, and
**stop logging the whole settings object** — log only known-safe fields
explicitly. (And since it already leaked into CI logs, the real remediation is
to **rotate the key** — the logs are permanent-ish too.)

**Config not loading — bugs (1) + (2) + (5).** Bug (1): `from pydantic import
BaseSettings` — in Pydantic v2 `BaseSettings` moved to `pydantic-settings`, so
this either errors or imports a broken shim; fix: `from pydantic_settings import
BaseSettings`. Bug (5) interacting with (2): the new hire set the env var
`DATABASE_URL`, but if the model uses an `env_prefix="APP_"` the app reads
`APP_DATABASE_URL`, so plain `DATABASE_URL` is ignored and it silently falls
back to the default in (2) — *that's* why "the app still uses the default." The
fix is either to set the correctly-prefixed variable (`APP_DATABASE_URL`) or to
align the prefix with what's documented; and to make `database_url` *required*
(no default) so a mis-set variable fails fast and loudly instead of silently
using a dev default. The silent-default-fallback is the trap: a required field
would have crashed with a clear message instead of quietly connecting to the
wrong database.

The two bugs share a theme from module 02: secrets need special typing/handling
*and* config needs fail-fast validation so a mistake is loud, not silent.

</details>

## Independent challenge

No code given. Take the **config inventory you produced in module 02's
independent challenge** and implement it as a real `pydantic-settings`
`Settings` class plus a feature-flag mechanism. Requirements: (1) every
required value is a field with no default so a missing one crashes at startup
with a clear message; (2) every sensitive value is a `SecretStr` and you prove,
with a transcript, that printing the settings object exposes none of them; (3)
non-secret values have safe defaults and can be overridden by env vars, with
`.env` used only for local dev and git-ignored, and a committed `.env.example`
documenting the keys; (4) `extra="forbid"` catches a deliberately-introduced
typo; and (5) at least one value is a runtime-flippable feature flag you toggle
without restarting the process. Reference **module 02's static/dynamic/sensitive
taxonomy** explicitly — each field should be traceable to a flavour, and its
source/handling should match that flavour's rule.

<details>
<summary>Hint</summary>

The mechanical mapping from module 02's taxonomy to code: *sensitive* →
`SecretStr`, no default, injected as env var (never in `.env.example` with a
real value); *static* → typed field with a safe default where one exists,
required (no default) where the app can't run without it; *dynamic* → not a
`Settings` field at all (that's startup-only), but a value read from a
runtime-changeable source (your `FeatureFlags` store) on each request. If a
value's flavour and its loading mechanism don't match — e.g. a "dynamic"
feature flag sitting in `Settings` where flipping it needs a restart — that's
the bug the challenge is checking you avoid.

</details>

## Common mistakes & troubleshooting

- **Committing a `.env` with real secrets.** Add it to `.gitignore` *before*
  creating it; commit `.env.example` instead. If it's already committed, rotate
  the secrets — deleting the file doesn't undo git history.
- **`from pydantic import BaseSettings` on Pydantic v2.** It moved to
  `pydantic-settings`. Install and import from there.
- **Plain `str` for secrets + logging the settings object.** Leaks the secret
  to logs. Use `SecretStr` and never log the whole object.
- **All-optional settings with defaults.** A missing required secret then
  silently falls back to a dev default and connects to the wrong thing. Make
  truly-required values have *no* default so they fail fast.
- **`env_prefix` mismatch.** Setting `DATABASE_URL` when the app reads
  `APP_DATABASE_URL` — the var is silently ignored. Document the prefix; a
  required field turns the silent miss into a loud crash.
- **Secrets as CLI flags.** Visible in `ps aux` / the process list. Use env
  vars or a secret manager, never flags, for secrets.
- **Feature flags baked into `Settings` at startup.** Flipping them then needs
  a restart — that's not a flag. Read dynamic config from a runtime-changeable
  source.
- **Long-lived flags.** A flag at 100% for a year is dead-code tech debt.
  Remove the flag and the unused branch once a feature is fully rolled out.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give one reason you'd choose an environment variable over a config file, and
   one reason you'd choose a file over an env var.
2. Why must you never pass a secret as a command-line flag?
3. A secret was committed to git two weeks ago and the line has since been
   deleted. Is the secret safe now? What's the actual remediation?
4. What three things does declaring a config field as *required* (no default)
   and typed in Pydantic Settings buy you compared to `os.environ["X"]`?
5. What does `SecretStr` protect against, and what must you call to read the
   real value?
6. What distinguishes a genuine runtime feature flag from a boolean stored in
   `Settings` at startup, and what does decoupling "deploy" from "release" mean
   in practice?

<details>
<summary>Answers</summary>

1. **Env var over file:** it's the 12-factor default — injected by the platform
   without touching the image, trivially overridable per environment, never in
   the repo (good for the common case and for secrets injected at runtime).
   **File over env var:** it handles *nested/structured* and *large* config
   naturally and is reviewable/diffable, which flat string env vars aren't —
   good for big non-secret structured config.
2. Command-line flags are visible in the process list (`ps aux`) to any user on
   the host and often end up in shell history and logs — so a secret passed as
   a flag is effectively exposed. Use an env var or a secret manager.
3. No — it's still in git history, in every clone and fork, permanently;
   deleting the line only changes the current tree. The real remediation is to
   **rotate the secret** (issue a new one, revoke the old), with history
   scrubbing as secondary cleanup. Assume anything ever committed is
   compromised.
4. (a) **Type coercion** — the string from the environment is converted to the
   declared type (int/bool/URL) automatically. (b) **Fail-fast validation** —
   a missing required value or a malformed one crashes at startup with a clear
   message, not deep in a request. (c) **One documented source of truth** — the
   class enumerates every value, its type, and whether it's required, instead
   of scattered unvalidated reads.
5. `SecretStr` protects against *accidental* exposure: its `repr`/`str` (and
   default serialization) is `**********`, so a stray print, f-string, or
   whole-object log doesn't reveal the value. You must call
   `.get_secret_value()` to read the real secret — deliberate, greppable
   access.
6. A genuine flag is read from a source that can change *under the running
   process* (a flag service, config store, or DB row), so it can be flipped
   without a restart; a boolean in `Settings` is fixed at startup and needs a
   restart to change, so it isn't really a flag. Decoupling deploy from release
   means you ship the code (deploy) with the feature *off*, then turn it on for
   users (release) by flipping the flag — and can instantly turn it back off (a
   kill switch) without rolling back the deploy.

</details>

## Further reading & sources

- [pydantic-settings documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) - the authoritative reference for `BaseSettings`, sources, and precedence used throughout this module.
- [pydantic — SecretStr](https://docs.pydantic.dev/latest/api/types/#pydantic.types.SecretStr) - the type whose masked `repr` is your passive guardrail against leaking secrets in logs.
- [The Twelve-Factor App — III. Config](https://12factor.net/config) - the rationale for environment variables as the default config source.
- [OWASP — Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) - practical rules for storing, rotating, and injecting secrets safely.
- [GitHub — Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) - why a committed secret must be rotated, not just deleted, and how to scrub history.
- [Martin Fowler — Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) - the reference on runtime feature flags and decoupling deploy from release.

## Next

[04-logging-fundamentals](../04-logging-fundamentals/README.md) — your config
is now typed, validated, and secret-safe (including a `SecretStr` habit that
keeps secrets out of logs). Next we build the logs themselves: log levels and
when to use each, why *structured* logging beats free-text for anything a
machine has to read, and exactly what belongs in a log line.
