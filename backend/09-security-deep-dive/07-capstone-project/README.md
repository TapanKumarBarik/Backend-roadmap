# Module 07: Capstone Project

## Why this matters

Every module in this track taught one class of attack in isolation: injection,
XSS/CSRF, SSRF and insecure deserialization, abuse via unlimited requests,
leaked secrets, and missing hardening. Real applications aren't attacked one
category at a time — a single feature usually exposes several at once (the
cumulative reviews kept hammering this: one `/import?url=` endpoint carries
SSRF, deserialization, injection, and XSS simultaneously), and a real hardening
job means finding and closing *all* of them across an app you didn't necessarily
write.

This capstone makes you do exactly that. You'll take a small, deliberately
vulnerable FastAPI application and harden it end to end — not by memorizing
fixes, but by applying the trust-boundary lens from module 00 to every input,
identifying which interpreter each one reaches, and neutralizing it correctly.
This is the job: not "add a WAF," but methodically walk the surface, threat-model
each feature, and defend in depth. If you can take a vulnerable app and make it
defensible — and *explain the threat each change addresses* — you've absorbed
the track. There's no solution code here; if you get stuck on a category, the
module that taught it is named, so go back and redo its exercises rather than
guessing.

## The project

Build (or take the provided sketch and flesh out) a small FastAPI app — a
minimal "team notes + link-preview" service — that deliberately contains one
vulnerability from each module, then **harden it into a secure-by-design
application**. It should authenticate users (reuse your track-03 `auth-track`
foundation — sessions or JWTs, your choice) and expose a realistic feature set
whose seams span the whole track:

- **Notes CRUD** with a search endpoint (a SQL/NoSQL query built from user
  input) and notes that render in a browser (rich-text bodies shown to other
  users) — your injection (m01) and XSS (m02) surface.
- **State-changing actions** over cookie-authed requests (create/delete a note,
  change a setting) — your CSRF (m02) surface.
- **A link-preview feature** that fetches a user-supplied URL server-side and a
  cache that stores the parsed result — your SSRF and deserialization (m03)
  surface.
- **Login, signup, and password-reset** endpoints — your brute-force/abuse (m04)
  surface.
- **Configuration** holding a DB credential, the auth signing key, and a
  third-party API key — your secrets (m05) surface.
- **The HTTP layer and dependencies** as shipped — your headers/hardening (m06)
  surface.

Start it vulnerable (concatenated queries, unescaped rendering, no CSRF token, an
unvalidated URL fetch with a pickled cache, no rate limits, hardcoded secrets,
no security headers, unscanned deps), *exploit each hole yourself* to prove it's
real, then harden each one and prove the exploit no longer works.

### Acceptance checklist

Your build is done when all of these are true and you can *demonstrate* each —
both the exploit before and the failure of that exploit after:

- [ ] **Injection (m01):** every query is parameterized and every dynamic
      identifier (sort column, table) is allowlisted; a `' OR '1'='1` /
      `admin'--` / `UNION SELECT` payload that worked before now returns nothing.
      Any subprocess call uses an argv list, no `shell=True`.
- [ ] **XSS (m02):** plain fields are output-encoded and rich-text is
      allowlist-*sanitized*; a stored `<script>` payload that ran for every
      viewer before now renders as inert text. A CSP header backstops it.
- [ ] **CSRF (m02):** state-changing cookie-authed requests require a
      synchronizer token (constant-time compared) and cookies are `SameSite`;
      an auto-submitting form on another origin no longer succeeds.
- [ ] **SSRF (m03):** the link-preview fetch allowlists or resolve-validates the
      target (rejecting private/loopback/link-local/metadata IPs), disables
      redirects, and restricts the scheme; a request for
      `http://169.254.169.254/...` or an internal address is rejected — including
      encoded (`0x7f000001`) and redirect-based bypasses.
- [ ] **Deserialization (m03):** the cache (and any config load) uses a
      data-only format (JSON/`safe_load`) with shape validation — a crafted
      `pickle`/`!!python/object` payload can no longer execute code.
- [ ] **Abuse (m04):** login and password-reset are rate-limited with a
      shared-store (Redis), atomic limiter keyed by real IP *and* account/email,
      returning `429`+`Retry-After`; a brute-force loop is throttled, and the
      reset endpoint is enumeration-safe.
- [ ] **Secrets (m05):** no secret in source, logs, or an insecure default;
      config loads from env/vault with fail-fast validation and `SecretStr`; the
      signing key is rotatable (overlapping keys); a secret-scanner pre-commit
      hook is in place.
- [ ] **Headers/hardening (m06):** HSTS, `nosniff`, `X-Frame-Options`/
      `frame-ancestors`, CSP, `Referrer-Policy` applied via one middleware; every
      sensitive cookie has `Secure`/`HttpOnly`/`SameSite`; debug is off with
      generic errors; CORS is tight.
- [ ] **Dependency + code hygiene (m06):** `pip-audit` (or Dependabot) and
      `bandit` run in CI and pass; you've done one security code-review pass and
      filed a finding per category.
- [ ] **Access control (module 00 / track 03):** every object lookup is scoped
      to the authenticated owner — no IDOR; changing an id in the URL can't reach
      another user's note.
- [ ] **Threat-model note:** a written mapping of each defense to the specific
      attack it stops, plus any residual risk you consciously accepted and why.

### Stretch goals (optional)

- Wire the whole thing into a **CI pipeline** that fails on a new injection
  pattern (`bandit`), a vulnerable dependency (`pip-audit`), or a committed
  secret (`gitleaks`) — security as a build gate.
- Add **audit logging** of every security-relevant event (track 03 m07) —
  login success/failure, permission denials, rate-limit trips — with no secrets
  in the logs.
- Run the app behind a reverse proxy that also sets headers and terminates TLS,
  and reconcile app-level vs edge-level controls (defense in depth, m04/m06).
- Add a **dynamic secret** (Vault dev mode) for the DB credential and observe a
  short-lived credential expiring.
- Write an **automated exploit test suite** — a test per vulnerability that
  asserts the exploit *fails* — so a regression that re-opens a hole breaks CI.

### Hints (design, not code)

<details>
<summary>Walk the trust boundaries, don't chase a checklist</summary>

The efficient way to harden an app is module 00's method, not a feature-by-
feature scramble: list every place untrusted data enters (path/query params,
bodies, headers, cookies, uploaded files, the URL for the preview, and values
you read back out of your own DB), and for *each* write down which interpreter
it eventually reaches — SQL, the browser's HTML parser, your HTTP client, a
deserializer, a subprocess, a filename. The interpreter tells you the fix:
parameterize for SQL, encode/sanitize for HTML, allowlist/resolve for URLs,
JSON for deserialization, argv for subprocess. A checklist makes you ask "did I
do XSS?"; the boundary walk makes you find *every* place XSS could live,
including the ones the checklist's mental model missed.

</details>

<details>
<summary>Exploit first, then fix — the demo is the point</summary>

For each vulnerability, actually *perform the attack* before you fix it: run the
`' OR '1'='1`, store the `<script>`, submit the cross-origin form, fetch the
metadata URL, load the pickle, brute-force the login, grep the secret out of a
log. A fix you can't demonstrate defeating a real exploit is a fix you don't
know works — and several "fixes" (a blocklist for SSRF, `SameSite` alone for
CSRF, a fixed-window limiter, deleting a committed secret) *look* right and
aren't. The before/after demonstration is what proves you understood the threat,
not just pattern-matched a mitigation.

</details>

<details>
<summary>Defense in depth — no single control per category</summary>

The track's recurring lesson is that one layer isn't enough, and the capstone is
where it compounds. XSS wants escaping/sanitization *and* CSP *and* `HttpOnly`
cookies; CSRF wants `SameSite` *and* a synchronizer token; SSRF wants an
allowlist/resolve-validate *and* disabled redirects *and* a network egress
backstop; injection wants parameterization *and* a least-privilege DB user so a
missed spot can't `DROP`. When you find yourself relying on exactly one thing to
stop a category, ask what happens when it's bypassed — and add the next layer.

</details>

<details>
<summary>Where each fix belongs — centralize, don't sprinkle</summary>

Controls that must apply everywhere belong in one place, or one will be
forgotten: security headers in a single middleware (m06); authorization checks
at a central chokepoint scoped to the owner (track 03 / A01), not per-handler;
the rate limiter as a shared dependency; secret loading in one typed config
module (m05). Per-endpoint copies of a control are how gaps appear. If a defense
is scattered across handlers, that's a finding in your own code review.

</details>

## Further reading & sources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - the full attack model your hardened app must defend against, end to end.
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) - per-category defensive references for every fix in the acceptance checklist.
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/) - how to systematically test each vulnerability class you're closing.
- [OWASP Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/) - a testable checklist to verify your hardened app against.
- [FastAPI - Security](https://fastapi.tiangolo.com/tutorial/security/) - framework-level security primitives for the app you're hardening.
- [OWASP Proactive Controls](https://owasp.org/www-project-proactive-controls/) - the secure-by-design controls this capstone asks you to build in from the start.

## Next

[../../10-distributed-systems-patterns/README.md](../../10-distributed-systems-patterns/README.md)
— you can now defend a backend against the OWASP-class attacks, throttle abuse,
manage secrets, and harden the HTTP surface — secure-by-design, not
secure-by-luck. With the application layer built (tracks 01-03), given a data
layer (04), made fast (05), asynchronous (06), searchable (07), observable (08),
and now secure (09), the next track steps up to *systems of services*: CAP-theorem
tradeoffs, idempotency and distributed locking, and the saga/CQRS/event-sourcing
patterns that coordinate many backends at once.
