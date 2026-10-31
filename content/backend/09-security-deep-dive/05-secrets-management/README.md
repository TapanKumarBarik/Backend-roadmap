# Module 05: Secrets Management

## Why this matters

Every module so far assumed your code *holds* secrets — a database password, the
JWT signing key (track 03), an API token for a third-party service, the HMAC key
that signs your webhooks (track 06), encryption keys. These are the highest-
value targets you own: leak the DB password and the injection defenses in module
01 are moot; leak the JWT signing key and an attacker mints valid tokens for any
user, bypassing all of track 03; leak a cloud key and the game is simply over.
This is OWASP A02 (Cryptographic Failures) and A05 (Security Misconfiguration)
territory, and it's where the most *embarrassing* breaches come from — because
the failure is rarely sophisticated. It's a key hardcoded in source, committed
to a public GitHub repo, printed in a log, or baked into a Docker image.

The discipline here is boring and absolute, which is exactly why it's so often
skipped: **secrets never live in code, never appear in logs, never enter git
history, and don't stay valid forever.** This module covers where secrets
*should* live (environment/config, then real secret managers), how to rotate
them, and the two silent leaks — logs and git history — that catch teams who got
everything else right. Because this is the two-thirds point of the track, it
also carries a **cumulative review** spanning modules 00-05.

## Concepts

### Why hardcoded secrets are a category of disaster

A hardcoded secret — `DATABASE_PASSWORD = "hunter2"` in your source — is
uniquely bad for reasons that compound:

- **It's in version control forever.** Commit it once and it's in git history
  even after you "delete" it in a later commit — anyone who clones the repo (a
  contractor, a laid-off employee, the public if the repo ever goes open) has
  it. Secret-scanning bots crawl every new public GitHub commit within *seconds*
  looking for exactly this.
- **It's in every copy of the code.** Your laptop, CI, the Docker image, every
  developer's machine, every backup. The secret's exposure surface is the code's
  exposure surface — enormous.
- **You can't rotate it without a deploy.** Changing a hardcoded secret means a
  code change, review, and redeploy — so in practice it never changes, and a
  leaked one stays valid indefinitely.
- **The same code can't serve multiple environments.** Dev, staging, and prod
  need *different* secrets; hardcoding forces either one shared secret (dev
  compromise = prod compromise) or per-environment code branches.

The fix is the foundational principle of secrets management: **separate secrets
from code.** Code is the same everywhere and can be public; configuration
(including secrets) is environment-specific and never in the repo. This is a
pillar of the "twelve-factor app" (config in the environment) and it's covered
from the config-management angle in track 08 — here we focus on the *security*
of it.

### Environment variables — the baseline

The simplest correct approach: the app reads secrets from **environment
variables** (or a mounted secret file) at startup, and those are injected by the
platform (your shell, systemd, Docker, Kubernetes, the CI/CD system) — never
committed. In Python you validate them into typed config with Pydantic:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    jwt_signing_key: str          # track 03 — leaking this forges any token
    stripe_api_key: str
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()             # reads env vars; fails fast at startup if one is missing
```

Two disciplines make this safe:

- **`.env` for local dev only, and `.gitignore` it.** A `.env` file is a
  convenience for your machine; it must be in `.gitignore` so it never gets
  committed. Commit a `.env.example` with the *names* and dummy values so
  teammates know what to set, never the real values.
- **Fail fast.** Validate required secrets at startup (Pydantic does this) so a
  missing secret crashes the app immediately with a clear error, rather than
  surfacing as a mysterious runtime failure — or worse, a fallback to an
  insecure default.

Environment variables are the *baseline*, not the ceiling. Their weaknesses:
they're visible to the whole process (and child processes), can leak into logs
and crash dumps, aren't audited or versioned, and rotating them still requires a
restart. For anything beyond a small app, you graduate to a secret manager.

### Secret managers / vaults — the real answer

A **secret manager** is a dedicated, access-controlled service that stores
secrets encrypted and hands them to authorized workloads at runtime. Examples:
**HashiCorp Vault**, **AWS Secrets Manager**, **GCP Secret Manager**, **Azure
Key Vault**. What they add over plain env vars:

- **Centralized, encrypted storage.** Secrets are encrypted at rest and never
  sit in your repo, image, or config files. One place to manage them all.
- **Fine-grained access control + audit.** Each workload gets *only* the secrets
  it needs (least privilege), and every access is *logged* — you can answer "who
  read the DB password, and when." That audit trail is often a compliance
  requirement and an incident-response necessity.
- **Dynamic secrets.** Vault's standout feature: instead of a static DB
  password, it can generate a *short-lived, unique* credential per app instance
  on demand, valid for minutes and then revoked. A leaked dynamic secret is
  worthless almost immediately — the strongest form of "don't stay valid
  forever."
- **Rotation support.** The manager can rotate secrets on a schedule and
  distribute the new value, so rotation isn't a manual redeploy.

The app authenticates to the secret manager (via a workload identity — an IAM
role, a Kubernetes service account, a Vault token) and fetches secrets at
startup or on demand. The bootstrap question — *how does the app prove its
identity to the vault without a secret to do so?* — is solved by platform
identity (cloud IAM roles, K8s-projected tokens) so there's no "secret zero" in
your code. This connects straight to track 03's service-to-service auth and mTLS.

```python
# Fetching from AWS Secrets Manager at startup (workload identity via IAM role — no key in code)
import boto3, json
def load_secret(name: str) -> dict:
    client = boto3.client("secretsmanager")          # auth via the instance/pod IAM role
    resp = client.get_secret_value(SecretId=name)
    return json.loads(resp["SecretString"])          # {"database_url": "...", "jwt_key": "..."}
```

### Rotating secrets — because leaks are "when," not "if"

Rotation is periodically replacing a secret with a new one. It matters because
you must assume every secret *will* eventually leak (an ex-employee, a
compromised laptop, a logged value), and rotation bounds the damage window: a
secret that rotates every 30 days is worthless to an attacker 31 days after they
stole it. Two triggers: **scheduled** (routine hygiene) and **reactive**
(immediately, on any suspected compromise — the emergency you must be *able* to
do fast).

```
  created ─► stored (vault, encrypted) ─► injected at runtime (env / IAM role) ─► used
                                                                                   │
                              old version retired ◄── rotate (new version) ◄───────┘
```

The design problem rotation forces you to solve is **doing it with zero
downtime**, and the standard technique is **overlapping validity / dual
secrets**: support *two* valid secrets at once during a transition.

- For a **signing key** (JWT, HMAC — track 03/06): publish the new key and accept
  signatures from *both* old and new keys during the overlap (`kid` header
  selects which), then retire the old key once all tokens signed with it have
  expired. Verifiers must support multiple keys; this is why track 03 stressed
  key IDs.

```
  time ────────────────────────────────────────────────►
  old key: ═══════ valid ═══════╡ retired once its tokens expire
  new key:           ╞═══════ valid ══════════════════════
                     └ overlap: BOTH accepted (kid selects) ─► no live token invalidated
```
- For a **database/API credential**: create the new credential, deploy the app to
  use it, confirm, then revoke the old one — never revoke-then-deploy (that's an
  outage).

The practical rule: **design every secret to be rotatable from day one**
(support multiple valid keys, read the current one from config/vault, never
assume "the key" is singular and eternal), because the day you *need* to rotate
— a live breach — is the worst day to discover your architecture can't.

### The silent leaks: logs, errors, and git history

You can store secrets perfectly and still leak them through side channels. These
are the ones that catch careful teams:

- **Logs.** The classic: logging a whole request/response, a config object, or an
  exception that includes the secret. `logger.info(f"connecting with
  {settings}")` dumps every secret into your log aggregator (which is widely
  readable and long-retained). Track 03's rule applies to *all* secrets, not
  just auth: never log passwords, tokens, keys, or full credentials — log a
  *reference* (a key's name/prefix, a token's `jti`), never the value. Implement
  a log **redaction/masking** filter so a stray secret is scrubbed even if
  someone logs it by accident, and mark secret fields (Pydantic `SecretStr`
  renders as `**********` in reprs).
- **Error responses / stack traces.** A debug traceback returned to the client
  (module 06) can include local variables holding secrets. Turn debug off in
  production; return generic errors.
- **Git history.** Committing a secret and removing it in a later commit does
  **not** remove it — it's still in history. The correct response to a committed
  secret is: **rotate it immediately** (assume it's compromised — bots find
  public ones in seconds), *then* optionally scrub history (`git filter-repo`,
  BFG). Rotation first, because scrubbing history doesn't un-leak what was
  already cloned. Prevent it with a **pre-commit secret scanner** (`gitleaks`,
  `detect-secrets`, `trufflehog`) that blocks commits containing secret-shaped
  strings — the same "shift left" idea as dependency scanning in module 06.

```python
from pydantic import BaseModel, SecretStr
class Config(BaseModel):
    api_key: SecretStr            # str(config.api_key) → 'SecretStr('**********')'
c = Config(api_key="sk_live_abc123")
print(c)                          # api_key=SecretStr('**********')  ← not leaked in logs
c.api_key.get_secret_value()      # explicit unwrap only where you actually use it
```

### Least privilege and blast-radius thinking

Two cross-cutting principles that turn a leaked secret from a catastrophe into an
incident:

- **Least privilege.** Every secret should grant the *minimum* access needed. The
  app's DB user can touch only its own tables (module 01's least-privilege point,
  now generalized); a service's cloud role can read only its own bucket; an API
  key is *scoped* (track 03 m04). A leaked least-privilege secret does bounded
  damage.
- **Separate secrets per environment and per service.** Dev, staging, prod get
  *different* secrets so a dev leak can't touch prod; distinct services get
  distinct credentials so one compromise doesn't cascade. Never share "the API
  key" across everything — that maximizes blast radius.

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| `BaseSettings` (pydantic-settings) | typed config from env, fail-fast | required fields crash at startup if unset |
| `.env` + `.gitignore` (+ `.env.example`) | local secrets, never committed | commit names/dummies only |
| `SecretStr` | prevent accidental log/repr leaks | renders `**********`; `.get_secret_value()` to use |
| AWS/GCP/Vault client + workload identity | fetch secrets at runtime, no key in code | auth via IAM role / K8s SA |
| dynamic secrets (Vault) | short-lived per-instance credentials | leaked value expires in minutes |
| `kid` + multi-key verify | rotate signing keys with no downtime | accept old+new during overlap |
| log redaction filter | scrub secrets even if logged by mistake | mask secret-shaped values |
| `gitleaks` / `detect-secrets` pre-commit | block secrets before they enter history | shift-left prevention |
| **rotate-then-scrub** on a committed secret | correct incident response | history scrub doesn't un-leak |

A config module doing it right — env with fail-fast, `SecretStr`, no defaults for
secrets:

```python
from pydantic import SecretStr
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: SecretStr                 # required — no insecure default
    jwt_signing_key: SecretStr              # leaking this forges any token (track 03)
    jwt_previous_key: SecretStr | None = None   # supports overlapping rotation
    class Config:
        env_file = ".env"                   # dev only; .env is gitignored

settings = Settings()                       # raises at startup if a required secret is missing

# Use — unwrap only at the point of use, never log the value:
engine = create_engine(settings.database_url.get_secret_value())
logger.info("db configured", extra={"db_host": urlparse(  # log a reference, not the secret
    settings.database_url.get_secret_value()).hostname})
```

## Hands-on exercises

Continue in `sec-track`. For the vault exercise you can run Vault in dev mode via
Docker (`docker run -p 8200:8200 hashicorp/vault`) or simulate with AWS Secrets
Manager against LocalStack — either is fine; the point is the *pattern*.

### 1. Move a hardcoded secret to the environment

Find (or plant) a hardcoded secret in `sec-track` — a DB URL or the track-03 JWT
key. Move it to a `Settings(BaseSettings)` reading from the environment, add a
`.env` (gitignored) for local dev and a committed `.env.example` with dummy
values. Expected: the secret is gone from source; the app reads it from the
environment and starts.

### 2. Fail fast on a missing secret

Remove a required secret from your environment/`.env` and start the app.
Expected: it crashes *at startup* with a clear "field required" error — not a
mysterious runtime failure later, and not a silent fallback to a default. Add a
required field with no default to guarantee this.

### 3. Prove git history keeps deleted secrets

In a throwaway repo, commit a file with a fake secret, then commit again removing
it. Run `git log -p` (or `git show <first-commit>`). Expected: the secret is
still fully visible in history despite being "deleted" — internalize why the
response to a committed secret is *rotate*, not just delete.

### 4. Add a pre-commit secret scanner

Install `gitleaks` (or `detect-secrets`) as a pre-commit hook. Try to commit a
line like `AWS_SECRET_ACCESS_KEY = "AKIA..."`. Expected: the commit is *blocked*
before the secret enters history. This is shift-left prevention — the same idea
as dependency scanning (module 06).

### 5. Stop a secret from leaking into logs

Log your whole `settings`/config object (`logger.info(f"config: {settings}")`)
and observe the secret in the output. Now wrap secret fields in `SecretStr` and
re-log. Expected: the value renders as `**********`; you can still
`.get_secret_value()` where you actually use it. Bonus: add a log redaction
filter that masks secret-shaped strings regardless of who logged them.

### 6. Fetch a secret from a vault at startup

Put a secret in Vault (dev mode) or AWS Secrets Manager (LocalStack) and have the
app fetch it at startup via the client + workload identity pattern (no vault
credential hardcoded — use the dev token/role). Expected: the app runs with no
secret in its source *or* its `.env` — the secret lives only in the manager and
is fetched at boot.

### 7. Rotate a signing key with zero downtime

Take your track-03 JWT signing. Add support for `jwt_signing_key` (new) *and*
`jwt_previous_key` (old): sign with the new key (set `kid`), but *verify* against
both. Issue a token with the old key, rotate, and confirm the old token still
verifies during the overlap while new tokens use the new key. Expected: a
rotation that doesn't invalidate live tokens — the overlapping-validity pattern.

### 8. Least-privilege and per-environment separation

Give `sec-track` distinct secrets for a "dev" and a "prod" config, and (reusing
module 01's least-privilege DB user) confirm the dev DB credential can't touch
prod data. Expected: you can state, for one secret, exactly what it can and
cannot do, and that a dev leak can't reach prod.

### 9. Diagnose and fix: the leaky settings module

Audit this configuration and startup code for every secrets-management failure
and fix them all.

```python
# config.py  — committed to the repo
DATABASE_URL = "postgres://app:S3cr3t@db.internal/prod"
JWT_KEY = "supersecret-signing-key"
STRIPE_KEY = os.getenv("STRIPE_KEY", "sk_test_fallback_12345")

@app.on_event("startup")
def startup():
    logging.info(f"starting with config: DB={DATABASE_URL} JWT={JWT_KEY}")
```

<details>
<summary>Solution</summary>

Failures: (1) **Hardcoded secrets in a committed file** (`DATABASE_URL`,
`JWT_KEY`) — in git history forever, in every copy, unrotatable without a deploy;
move to env/vault via `BaseSettings`, and since they're now committed, **rotate
them** (assume compromised). (2) **Insecure default** — `os.getenv("STRIPE_KEY",
"sk_test_fallback_...")` silently falls back to a real-looking key if the env var
is unset, hiding a misconfiguration; require it with no default so it fails fast.
(3) **Logging the secrets at startup** — the DB password and JWT key land in the
log aggregator; log only a reference (host name), and wrap secrets in `SecretStr`
so an accidental log renders `**********`. (4) **No rotation support / singular
key** — `JWT_KEY` can't be rotated without invalidating live tokens; support
old+new keys with `kid`. (5) **Same key implicitly across environments** — the
prod DB URL is hardcoded, so dev and prod share fate; separate per environment.
Corrected shape: `Settings(BaseSettings)` with required `SecretStr` fields (no
defaults), `.env` gitignored, secrets fetched from a vault in prod, references-
only logging, multi-key rotation support — and rotate the exposed values now.

</details>

## Independent challenge

No code given. Do a full secrets audit and remediation of `sec-track` (and, if
you kept it, `auth-track` from track 03). Find every secret the system uses (DB
credentials, the JWT signing key, any third-party API keys, the webhook HMAC key
if you built track 06), and for each: (1) move it out of code into environment/
vault-backed config with fail-fast validation and no insecure defaults; (2)
ensure it can't leak into logs (`SecretStr` + a redaction filter) or error
responses; (3) make it **rotatable with zero downtime** (design the
overlapping-validity mechanism — reach back to **track 03**'s key-id/JWT work
for the signing key specifically); and (4) scope it to least privilege and
separate it per environment. Add a pre-commit secret scanner so new secrets
can't enter history. Then write a note: for each secret, state its blast radius
*if leaked today* and how your changes bound that radius (rotation window, least
privilege, per-environment isolation), and describe your emergency reactive-
rotation runbook for a suspected compromise of the JWT signing key.

<details>
<summary>Hint</summary>

The design constraint that shapes the whole challenge is **zero-downtime
rotation**, and it forces one architectural decision everywhere: *a secret is
never singular*. For a signing key that means the verifier must accept multiple
keys during an overlap (select by `kid`) so rotating doesn't invalidate every
live token at once; for a DB/API credential it means create-new → deploy →
verify → revoke-old (never revoke-then-deploy, which is an outage). If any part
of your code assumes "the key" is one eternal value, you can't rotate under fire
— and the moment you *must* rotate (a live breach) is exactly when you can't
afford downtime. For the JWT-key emergency runbook, the ordering is the lesson:
rotate/revoke *first* (the leaked key can forge tokens for anyone right now),
then scrub history/investigate — because scrubbing a committed secret never
un-leaks what was already cloned or scanned.

</details>

## Common mistakes & troubleshooting

- **Hardcoding secrets in source.** In history forever, in every copy,
  unrotatable. Separate secrets from code — env vars, then a secret manager.
- **Committing a `.env` (or any secret file).** `.gitignore` it; commit only a
  `.env.example` with names/dummy values.
- **Insecure default fallbacks.** `getenv("KEY", "dev-default")` hides
  misconfiguration and may ship a weak/real key. Require secrets with no default
  — fail fast.
- **Logging secrets (or whole config/exceptions).** They land in widely-readable,
  long-retained log stores. Log references (names/prefixes/`jti`), use
  `SecretStr`, add a redaction filter.
- **"Deleting" a committed secret in a later commit.** It's still in history.
  Rotate the secret immediately (assume compromised); then optionally scrub
  history.
- **No rotation / a singular eternal key.** You can't rotate under fire. Design
  for overlapping validity (multi-key verify) from day one.
- **Debug/verbose errors in production.** Tracebacks leak secrets and internals
  (module 06). Generic errors, debug off.
- **One shared secret across services/environments.** Maximizes blast radius.
  Least privilege, scoped, and separate per service and per environment.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give three distinct reasons a hardcoded secret is dangerous, and state the
   foundational principle that fixes all of them.
2. What do environment variables give you over hardcoding, and what are their
   limitations that push you toward a secret manager?
3. Name three things a secret manager (Vault/AWS/GCP) adds over plain env vars,
   and what "dynamic secrets" are.
4. Why does committing a secret and deleting it in a later commit not fix the
   leak, and what is the correct response order?
5. Explain zero-downtime rotation of a JWT signing key using overlapping
   validity.
6. Name two "silent" leak channels for a perfectly-stored secret and how you
   defend each.
7. What is "fail fast" for secrets and why is an insecure default fallback
   dangerous?

<details>
<summary>Answers</summary>

1. (a) It's in git history forever and in every copy of the code (huge exposure,
   scanned by bots in seconds). (b) It can't be rotated without a code change/
   redeploy, so it never changes. (c) It forces one shared secret across
   environments (dev leak = prod leak). Fix: **separate secrets from code** —
   config/secrets live in the environment or a secret manager, never the repo.
2. Env vars keep secrets out of the repo, differ per environment, and can be
   changed without a code change. Limits: visible to the whole process, can leak
   into logs/crash dumps, aren't audited/versioned, and rotating still needs a
   restart — so beyond a small app you graduate to a secret manager.
3. Centralized encrypted storage, fine-grained least-privilege access with an
   *audit log* of every access, and rotation support. **Dynamic secrets**:
   short-lived, per-instance credentials generated on demand and auto-revoked, so
   a leaked one expires in minutes.
4. Because the secret remains in git history (and in every existing clone) even
   after a later commit removes it — scrubbing doesn't un-leak what was already
   cloned/scanned. Correct order: **rotate the secret immediately** (assume
   compromised), then optionally scrub history.
5. Support two valid keys during a transition: sign new tokens with the new key
   (identified by `kid`) while verifiers accept *both* old and new keys; once all
   tokens signed with the old key have expired, retire it. Live tokens stay valid
   throughout — no downtime.
6. **Logs** — never log secret values; log references (name/prefix/`jti`), wrap
   in `SecretStr`, add a redaction filter. **Error responses/stack traces** —
   turn off debug in production and return generic errors so tracebacks don't
   expose local variables holding secrets. (Also git history — pre-commit
   scanner.)
7. Validating required secrets at startup so a missing one crashes the app
   immediately with a clear error. An insecure default fallback
   (`getenv("K","default")`) is dangerous because it silently hides the
   misconfiguration and may run with a weak or real-looking key instead of
   failing — turning a config error into a security hole.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-05 while attempting these.

1. For each attack, name the trust boundary crossed and the *primary* structural
   fix (module 00's lens): SQL injection (m01), stored XSS (m02), SSRF (m03),
   pickle deserialization (m03).
2. A single `/import?url=` endpoint fetches a user URL, parses the response, runs
   a DB query with a value from it, and renders a summary to a browser. Name
   *four* distinct Top 10 risks it could carry (drawing on m01-m03) and the fix
   for each.
3. "We validate/blocklist bad input" is offered as the fix for SQLi (m01), SSRF
   (m03), and XSS-sanitization (m02). Explain why blocklisting is the wrong
   primary approach in all three and give the correct approach for each.
4. Your login endpoint must resist: SQL injection (m01), brute force (m04),
   username enumeration (track 03 m07), and a leaked signing key (m05). Give the
   specific defense for each.
5. Rank by blast radius and justify: a leaked JWT *signing key* (m05), a stored
   XSS in an admin view (m02), and an SSRF that reaches the cloud metadata
   endpoint (m03).
6. You find `pickle.loads` reading from a Redis cache (m03) and the same Redis
   holds your rate-limit counters (m04) and (hypothetically) a cached secret
   (m05). Walk through how one cache-write vulnerability could chain across all
   three modules' concerns.
7. Explain why the phrase "the frontend already validates this" (m00) and "we
   deleted the secret in the next commit" (m05) are the *same category* of
   mistake — trusting something that doesn't actually enforce/erase what you
   think.
8. For each, say whether the failure is a *code bug* or an *insecure design*
   (A04, m00), and why: no rate limit on login (m04); an f-stringed SQL query
   (m01); a hardcoded secret (m05); no CSRF token on a cookie-authed POST (m02).

<details>
<summary>Answers</summary>

1. SQLi: request input → SQL interpreter; fix = parameterize (separate code from
   data). Stored XSS: input stored then rendered → browser HTML parser; fix =
   context-aware output encoding (+ sanitize/CSP). SSRF: user URL → your HTTP
   client's destination; fix = allowlist/resolve-validate the target. Pickle:
   untrusted bytes → deserializer that executes code; fix = use a data-only
   format (JSON) and never `pickle.loads` untrusted data.
2. **A10 SSRF** (the fetch) → allowlist/resolve-validate + no redirects. **A08
   Deserialization** (parsing the response, if via pickle/`yaml.load`) → JSON/
   `safe_load` + validate shape. **A03 SQLi** (the query) → parameterize the
   value, allowlist any identifier. **A03 XSS** (rendering the summary) →
   output-encode/sanitize + CSP. (Also A02 if it fetches over plain HTTP.)
3. Blocklists lose structurally: the input space (encodings, alternate syntaxes,
   cases you missed) is bigger than any list, and they break legitimate data.
   Correct approaches: SQLi → parameterize values + allowlist identifiers; SSRF →
   allowlist hosts or resolve-and-validate to reject private/metadata IPs; XSS →
   escape by default and *allowlist-sanitize* rich text with a maintained
   library.
4. SQLi → parameterized query. Brute force → Redis-backed rate limit (per IP +
   per account) + backoff. Enumeration → one generic message + constant-time
   dummy-hash verify. Leaked signing key → rotate immediately (overlapping
   `kid` keys), keep the key in a vault out of code/logs.
5. Leaked JWT signing key is worst — it forges valid tokens for *any* user,
   silently bypassing all of track 03 until rotated. SSRF to metadata is next —
   it steals cloud credentials (broad, but bounded by that role's privileges).
   Stored admin XSS is severe but scoped to what an admin session can do and to
   viewers of that view. (Reasonable orderings differ; the justification is the
   point.)
6. If an attacker can write one cache key: (m03) they plant a crafted pickle that
   RCEs any reader doing `pickle.loads` — total compromise. Short of RCE, (m04)
   they could tamper with rate-limit counters to disable throttling (re-enabling
   brute force) or (m05) read/overwrite a cached secret to escalate. One
   write-primitive chains into code execution, abuse-control bypass, and secret
   exposure — which is why pickle-in-cache, shared-store integrity, and not
   caching secrets all matter together.
7. Both trust a control that isn't actually enforcing/erasing what you assume.
   "The frontend validates it" trusts a cosmetic client-side check an attacker
   bypasses by calling the API directly; "we deleted it next commit" trusts a
   deletion that never removed the secret from history/clones. Same error:
   believing something is guarded/gone when the real enforcement/erasure never
   happened server-side or in history.
8. No rate limit → **insecure design** (the control is missing by design; A04).
   f-stringed SQL → **code bug** (a specific line concatenates input; fix the
   line). Hardcoded secret → **insecure design/misconfiguration** (the practice,
   not one line, is wrong; A05/A02). No CSRF token on a cookie POST → **insecure
   design** (a required control was never part of the flow). The bug is patchable
   in place; the design flaws require adding a control that was never there.

</details>

## Further reading & sources

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) - storage, rotation, and injection practices this module is built on.
- [The Twelve-Factor App - Config](https://12factor.net/config) - the "store config (including secrets) in the environment" principle.
- [pydantic-settings documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) - typed, fail-fast config from environment variables.
- [Pydantic `SecretStr`](https://docs.pydantic.dev/latest/api/types/#pydantic.types.SecretStr) - the type that masks secret values in reprs and logs.
- [HashiCorp Vault documentation](https://developer.hashicorp.com/vault/docs) - centralized secret storage, dynamic secrets, and rotation.
- [gitleaks](https://github.com/gitleaks/gitleaks) - the pre-commit secret scanner that blocks secrets before they enter git history.

## Next

[06-security-headers-and-hardening](../06-security-headers-and-hardening/README.md)
— the final standard module ties the surface together: the HTTP security headers
(HSTS, `X-Frame-Options`, `X-Content-Type-Options`, CSP, secure cookie flags)
that a browser enforces on your behalf, dependency scanning for known-CVE
components (A06), and the security-focused code-review habits that catch all of
the above before they ship.
