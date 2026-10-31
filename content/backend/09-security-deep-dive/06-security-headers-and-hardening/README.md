# Module 06: Security Headers and Hardening

## Why this matters

The previous modules defended against specific attacks. This one is about the
*baseline hardening* every app should have regardless of its features — the
controls that cost almost nothing, apply everywhere, and whose *absence* is
OWASP A05 (Security Misconfiguration) and A06 (Vulnerable and Outdated
Components). Two ideas dominate:

- **HTTP security headers** are instructions your server sends the browser that
  make the browser *enforce security on your behalf*: force HTTPS, refuse to be
  framed, don't sniff content types, lock down cookies, restrict what scripts
  run. They're a handful of response headers, they turn on defenses you can't
  implement server-side alone (a browser is the only thing that can refuse to
  render your page in a hostile iframe), and they're routinely missing — which
  is exactly why "add the security headers" is on every hardening checklist.
- **Dependency hygiene** is the other half. Modern backends are mostly other
  people's code — a FastAPI app pulls in dozens of transitive packages, and a
  known vulnerability (CVE) in any one of them is *your* vulnerability (A06).
  The `log4shell` and `event-stream` incidents were breaches of code nobody on
  the team wrote. Scanning and patching dependencies is not optional.

This module also covers the human layer that catches everything before it
ships: **security-focused code review**. It's the capstone-adjacent module —
after it, you harden a whole app in the capstone (07), and these headers,
scans, and review habits are the finishing pass on all of that.

## Concepts

### The essential security headers

Each header flips on a browser-enforced defense. The must-haves:

- **`Strict-Transport-Security` (HSTS)** — tells the browser to *only* ever
  connect to your site over HTTPS, for a given duration, even if a user types
  `http://` or clicks an `http` link. Defeats **SSL-stripping** downgrade
  attacks (a MITM forcing the connection back to plain HTTP, track 03 m07).
  `max-age=63072000; includeSubDomains; preload`. Only send it over HTTPS, and
  understand `max-age` is sticky — the browser remembers it — so roll out
  carefully.
- **`X-Content-Type-Options: nosniff`** — stops the browser from
  **MIME-sniffing** a response into a different content type than you declared.
  Without it, a browser might treat a user-uploaded "image" as HTML/JS and
  execute it (a stored-XSS vector). One value, always on.
- **`X-Frame-Options: DENY`** (and its modern CSP successor `frame-ancestors`)
  — stops your page from being embedded in an `<iframe>` on another site,
  defeating **clickjacking** (an attacker overlays your page invisibly and
  tricks the user into clicking a real button — "confirm transfer" — they can't
  see). Use `DENY` unless you have a specific framing need; `frame-ancestors
  'none'` in CSP is the modern equivalent and can allowlist specific origins.
- **`Content-Security-Policy` (CSP)** — the big one (introduced in module 02 for
  XSS). Restricts where scripts/styles/images/frames may load from, so an
  injected script is blocked from executing. `default-src 'self'; script-src
  'self'; object-src 'none'; frame-ancestors 'none'`. The XSS defense-in-depth
  backstop *and* (via `frame-ancestors`) the clickjacking defense. Roll out with
  `Content-Security-Policy-Report-Only` first to see what breaks.
- **`Referrer-Policy`** — controls how much of your URL is sent in the `Referer`
  header to other sites (URLs can contain tokens/ids). `no-referrer` or
  `strict-origin-when-cross-origin`.
- **`Permissions-Policy`** — disables browser features you don't use (camera,
  geolocation, microphone) so a compromised page can't invoke them.

```
  HSTS ────────────► SSL-strip / downgrade (MITM)
  CSP ─────────────► XSS  (injected & inline script refused)
  X-Frame-Options ─► clickjacking  (hostile iframe refused)
  nosniff ─────────► MIME-sniffing → XSS
  each header hands ONE specific defense to the browser to enforce on your behalf
```

And the anti-patterns — headers to *remove*: `Server`, `X-Powered-By`, framework
version banners. They tell an attacker exactly which version you run so they can
look up its CVEs (information leakage, module 00's attacker-mindset point).

### Secure cookie flags — the header-adjacent must-do

Track 03 covered these for the session cookie; the hardening pass ensures *every*
sensitive cookie has them:

- **`Secure`** — cookie only sent over HTTPS (never plain HTTP → not MITM-
  readable).
- **`HttpOnly`** — JavaScript can't read it (XSS can't steal it, module 02).
- **`SameSite=Lax`/`Strict`** — not attached on cross-site requests (CSRF
  defense, module 02).
- Plus a sensible `__Host-`/`__Secure-` prefix, a scoped `Path`, and a bounded
  lifetime. A session cookie missing any of `Secure`/`HttpOnly`/`SameSite` is a
  finding.

```python
response.set_cookie(
    "session", value=sid,
    secure=True, httponly=True, samesite="lax",   # the three non-negotiables
    max_age=3600, path="/",
)
```

### Applying headers globally in FastAPI

Headers belong in **one place** — middleware that runs on every response — not
sprinkled per-endpoint where one will be forgotten (defense in depth *and* the
DRY that prevents gaps). This is the same middleware pattern from track 02:

```python
from starlette.middleware.base import BaseHTTPMiddleware

SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        response.headers.pop("Server", None)          # don't advertise the server/version
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

Verify with `curl -I https://your-app/` and against an online scanner
(securityheaders.com, Mozilla Observatory) — but understand *why* each is there,
not just chase an A+ grade.

### Production configuration hardening

Headers are part of a broader "don't ship insecure defaults" discipline (A05):

- **Debug off in production.** A framework debug page (Starlette/FastAPI with
  `debug=True`, or an unhandled exception in dev mode) returns a **stack trace**
  to the client — leaking file paths, code, config, and sometimes secrets
  (module 05). Production returns generic errors; log the detail server-side
  (track 08).
- **CORS configured tightly.** Don't `allow_origins=["*"]` with credentials — that
  hands any site access to authenticated responses. Allowlist exact origins.
- **Change all defaults.** Default admin passwords, default ports left open,
  sample/debug endpoints, directory listing, an exposed `/docs` in prod if it
  reveals internal endpoints — all A05. Ship closed.
- **Least functionality.** Disable features/endpoints/HTTP methods you don't use.
  Every enabled thing is attack surface.
- **TLS configuration.** Modern TLS versions and cipher suites; redirect HTTP→
  HTTPS; valid certs. (Often terminated at a reverse proxy/load balancer.)

### Dependency scanning — A06, the code you didn't write

Your dependencies are code running with your app's full privileges, and a
**known CVE** in one of them is directly exploitable. The discipline:

- **Know your dependencies.** Pin versions (a lockfile — `poetry.lock`,
  `requirements.txt` with hashes, `uv.lock`) so builds are reproducible and you
  know exactly what's deployed. Include *transitive* deps — most of your
  dependency tree is indirect.
- **Scan continuously.** Tools that check your locked versions against
  vulnerability databases: **`pip-audit`** (Python-specific), **Safety**,
  GitHub **Dependabot**/`dependabot.yml`, `Snyk`, `Trivy` (also scans container
  images). Run them in **CI** so a PR that introduces a vulnerable dependency
  fails the build — "shift left."
- **Patch on a cadence, and urgently for criticals.** Most CVEs are fixed by
  bumping a version; keep dependencies reasonably current so the jump is small
  when a critical drops. An out-of-date app is a pile of unpatched CVEs waiting.
- **Supply-chain awareness.** Beyond known CVEs: typosquatted package names,
  compromised maintainer accounts (`event-stream`), malicious post-install
  scripts. Prefer well-maintained packages, review new dependencies, and
  consider hash-pinning so a tampered artifact fails verification.

```bash
pip-audit                      # scans installed/locked deps against the CVE database
pip-audit -r requirements.txt  # or a specific lockfile;  fails CI on findings
trivy image myapp:latest       # scan the built container image too (OS + app deps)
```

### Security-focused code review — the human backstop

Tools catch known patterns; review catches the rest. A security review pass over
a diff asks, systematically, the questions this whole track raised — it's the
attacker mindset (module 00) applied to a pull request:

- **Untrusted input** — is every new input parameterized (m01) / escaped or
  sanitized (m02) / validated at the boundary? Any new f-stringed query or
  `shell=True`?
- **Access control** — does every new data access check ownership/role (A01,
  track 03), not just authentication? Any IDOR-shaped `get(id)` without an owner
  scope?
- **New outbound requests** — any user-controlled URL fetched (SSRF, m03)? Any
  new `pickle`/`yaml.load`/`eval` on external data (m03)?
- **Abuse** — do new sensitive/expensive endpoints have rate limits (m04)?
- **Secrets** — any new hardcoded secret, secret in a log line, or secret in a
  default (m05)?
- **Errors & headers** — do new error paths leak detail? Are responses covered
  by the security headers?

Complement human review with **static analysis (SAST)** — **`bandit`** for
Python flags many of these automatically (`shell=True`, `yaml.load`, hardcoded
passwords, `pickle`, weak hashes) — run in CI alongside dependency scanning.
Automate what you can; reserve human attention for logic and authorization,
which tools are worst at.

```
  PR ─► [ secret scan ]─► [ dependency scan ]─► [ SAST ]─► [ tests ] ─► merge ✓
          gitleaks          pip-audit / Trivy     bandit       │
          any stage fails ───────────────────────────────────► block the merge ✗
```

## Command reference

| Header / practice | Defends against | Value / tool |
|---|---|---|
| `Strict-Transport-Security` | SSL-strip / downgrade (MITM) | `max-age=63072000; includeSubDomains` |
| `X-Content-Type-Options` | MIME-sniff → XSS | `nosniff` |
| `X-Frame-Options` / CSP `frame-ancestors` | clickjacking | `DENY` / `frame-ancestors 'none'` |
| `Content-Security-Policy` | XSS (backstop), framing | `default-src 'self'; object-src 'none'` |
| `Referrer-Policy` | URL/token leakage via `Referer` | `strict-origin-when-cross-origin` |
| remove `Server`/`X-Powered-By` | version fingerprinting | strip in middleware |
| `Secure`+`HttpOnly`+`SameSite` cookies | MITM/XSS/CSRF (track 03, m02) | on every sensitive cookie |
| debug off + generic errors | stack-trace/secret leakage | `debug=False` in prod |
| tight CORS | cross-origin credential theft | allowlist exact origins, not `*` |
| `pip-audit` / Dependabot / Trivy | vulnerable components (A06) | scan lockfile + image in CI |
| `bandit` (SAST) | insecure code patterns | flags `shell=True`, `pickle`, `yaml.load` |

## Hands-on exercises

Continue in `sec-track`. You'll verify headers with `curl -I` and a scanner, and
run `pip-audit`/`bandit` against your own dependency tree and code.

### 1. Add the security-headers middleware

Add the `SecurityHeadersMiddleware` to `sec-track`. Hit any endpoint with
`curl -I` and confirm HSTS, `nosniff`, `X-Frame-Options`, CSP, `Referrer-Policy`,
and `Permissions-Policy` all appear, and that `Server` is gone. Expected: every
response now carries the baseline defenses from one central place.

### 2. Demonstrate clickjacking, then block it

Serve a page on another origin that embeds `sec-track` in an `<iframe>`. Load it
and see your app render inside the attacker frame. Now ensure `X-Frame-Options:
DENY` (or CSP `frame-ancestors 'none'`) is set and reload. Expected: the browser
refuses to render your page in the frame — clickjacking blocked.

### 3. Demonstrate MIME-sniffing, then block it

Serve a "file download" endpoint that returns attacker-controlled bytes with a
misleading/absent `Content-Type`. Without `nosniff`, observe (or reason about)
the browser sniffing it as HTML and running embedded script. Add
`X-Content-Type-Options: nosniff` and confirm the browser respects the declared
type. Expected: sniffing-based XSS closed.

### 4. Leak a stack trace, then stop leaking it

Trigger an unhandled exception with `debug=True` (or a route that raises) and
observe the traceback returned to the client — note any file paths/config
visible. Turn debug off and add a generic exception handler. Expected: the client
gets a bland `500`; the detail goes to your server logs only (track 08).

### 5. Audit and fix your cookies

Inspect the cookies `sec-track`/`auth-track` sets (browser devtools or the
`Set-Cookie` response header). Confirm every sensitive cookie has
`Secure`+`HttpOnly`+`SameSite`. Fix any that don't. Expected: no session/auth
cookie is missing a flag — and you can name which attack each flag stops.

### 6. Scan your dependencies for CVEs

Run `pip-audit` (or `pip-audit -r requirements.txt`) against `sec-track`.
Expected: a report of any known-vulnerable packages with the fixed version.
Deliberately pin an *old* version of a package with a known CVE, re-scan, watch
it flag, then bump it and confirm it clears. Wire the scan into a CI step that
fails on findings.

### 7. Run SAST over your own code

Run `bandit -r .` over `sec-track`. Expected: it flags the insecure patterns you
planted across this track (any lingering `shell=True`, `pickle.loads`,
`yaml.load`, `assert` for auth, hardcoded secrets, weak hashes). Fix or
justify-and-suppress each finding. Note which real vulnerabilities it *missed*
(logic/authorization flaws) — that's what human review is for.

### 8. Do a security code review of a diff

Take a small feature diff (from this track's exercises, or write a new endpoint)
and review it *only* through the security checklist in Concepts: input handling,
access control, outbound requests/deserialization, abuse limits, secrets,
errors/headers. Write your findings as review comments. Expected: a repeatable
review habit that maps each comment to a Top 10 category.

### 9. Diagnose and fix: the misconfigured app startup

Audit this app configuration for every A05/A06 issue and fix them.

```python
app = FastAPI(debug=True)                                  # (a)
app.add_middleware(CORSMiddleware, allow_origins=["*"],    # (b)
                   allow_credentials=True)
# no security-headers middleware                           # (c)

@app.get("/download")
def download(name: str):
    return FileResponse(name)                              # (d) also: path traversal

@app.exception_handler(Exception)
def on_error(request, exc):
    return JSONResponse({"error": str(exc), "trace": traceback.format_exc()})  # (e)

# requirements.txt pinned 2 years ago, never scanned       # (f)
```

<details>
<summary>Solution</summary>

Issues: (a) **`debug=True` in prod** — returns stack traces leaking code/paths/
secrets; set `debug=False` and handle errors generically. (b) **`allow_origins=
["*"]` with `allow_credentials=True`** — lets *any* site read authenticated
responses; allowlist exact origins and never combine `*` with credentials. (c)
**No security headers** — add the middleware (HSTS, `nosniff`, `X-Frame-Options`,
CSP, etc.). (d) **`FileResponse(name)` with a user-controlled path** — path
traversal (`name=../../etc/passwd`), an injection cousin; resolve against a fixed
base dir and reject anything escaping it, or map to an allowlist of ids. (e)
**Returning the traceback in the error body** — hands the client internals/
secrets; return a generic message and log the trace server-side. (f) **Stale,
unscanned dependencies (A06)** — run `pip-audit`/Dependabot in CI, patch known
CVEs, keep deps current. Corrected shape: debug off, tight CORS, global security
headers, path-safe downloads, generic errors, and CI dependency + SAST scanning.

</details>

## Independent challenge

No code given. Do a full hardening pass on `sec-track` (ideally the app you've
been building across the whole track) and produce a hardening report.
Requirements: apply all baseline **security headers via one middleware** and be
able to explain, per header, the exact attack it stops and how you verified it;
ensure every sensitive **cookie** carries `Secure`/`HttpOnly`/`SameSite` (reach
back to **track 03 module 01** and **module 02** of this track for *why* each);
turn **debug off** with generic errors and tight **CORS**; wire **dependency
scanning** (`pip-audit`/Dependabot) and **SAST** (`bandit`) into a CI pipeline
that fails on findings; and perform a **security code review** of your own app
using the module's checklist, filing one finding per Top 10 category you can
locate (reach back across **modules 01-05** — injection, XSS/CSRF, SSRF/
deserialization, abuse limits, secrets). The deliverable is the report: for each
control, the attack it addresses, how you verified it, and any residual risk you
accepted and why.

<details>
<summary>Hint</summary>

The trap in a headers-only mindset is treating an A+ on securityheaders.com as
"done" — the grade measures *presence*, not *correctness for your app*. A CSP of
`default-src *` or one carrying `'unsafe-inline'` scores points while providing
almost no XSS protection (module 02); HSTS with a huge `max-age` shipped before
your HTTPS is solid can *lock users out*. So the report's value is the
per-control *reasoning*: name the specific attack, confirm the header's value
actually blocks it (test the clickjacking/sniffing/downgrade, don't just read
the header back), and note what it does *not* cover — headers are the browser-
enforced layer *on top of* the server-side fixes from modules 01-05, never a
replacement for them. For the code review, drive it from the checklist so you
systematically hit every category rather than eyeballing.

</details>

## Common mistakes & troubleshooting

- **No security headers, or set per-endpoint.** Gaps are inevitable when they're
  sprinkled around. Set them once in global middleware.
- **Chasing a scanner grade without understanding the headers.** A permissive
  CSP (`*`, `'unsafe-inline'`) or premature aggressive HSTS scores well but
  protects little or breaks things. Understand each value.
- **`debug=True` / tracebacks returned to clients in production.** Leaks code,
  paths, config, secrets. Debug off, generic errors, detail to server logs.
- **`CORS allow_origins=["*"]` with credentials.** Any site can read
  authenticated responses. Allowlist exact origins.
- **Cookies missing `Secure`/`HttpOnly`/`SameSite`.** Re-opens MITM/XSS/CSRF.
  Every sensitive cookie gets all three.
- **Advertising server/framework versions.** `Server`/`X-Powered-By` banners
  hand attackers your CVE list. Strip them.
- **Unpinned or unscanned dependencies (A06).** Known CVEs in your tree are your
  vulnerabilities. Pin lockfiles, scan in CI (`pip-audit`/Dependabot/Trivy),
  patch on a cadence.
- **Relying only on tools, or only on humans.** SAST/scanners miss logic and
  authorization flaws; humans miss known patterns. Do both.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does HSTS do, which attack does it stop, and why must you roll it out
   carefully?
2. What attack does `X-Content-Type-Options: nosniff` prevent, and how?
3. What is clickjacking, and which two mechanisms defend against it?
4. Why should security headers be applied in middleware rather than per-endpoint,
   and name the three non-negotiable cookie flags with the attack each stops.
5. Why is a returned stack trace / `debug=True` a security problem in
   production?
6. What is A06 (vulnerable components), and how do you defend against it in
   practice?
7. What does a security-focused code review add over automated scanning, and
   what's each better at catching?

<details>
<summary>Answers</summary>

1. HSTS tells the browser to only ever connect over HTTPS for a set `max-age`,
   defeating SSL-stripping/downgrade MITM attacks (a network attacker forcing
   plain HTTP). Roll out carefully because the browser *remembers* `max-age`
   (it's sticky) — shipping a long duration before your HTTPS is fully working
   can lock users out.
2. MIME-sniffing-based XSS: without it, a browser may sniff a response
   (e.g. a user-uploaded "image") as HTML/JS and execute it. `nosniff` forces
   the browser to honor the declared `Content-Type` instead of guessing.
3. Clickjacking overlays your page invisibly in an iframe on a malicious site so
   the user clicks a real action they can't see. Defend with `X-Frame-Options:
   DENY` or CSP `frame-ancestors 'none'` — both tell the browser to refuse
   framing.
4. Middleware applies them to *every* response from one place, so no endpoint is
   accidentally left uncovered (defense in depth + no gaps). Cookie flags:
   `Secure` (no plain-HTTP send → anti-MITM), `HttpOnly` (JS can't read → anti-
   XSS-theft), `SameSite` (not sent cross-site → anti-CSRF).
5. It returns internal detail — file paths, source, config, and sometimes
   secrets/DB strings — to the client, handing an attacker a map (and possibly
   credentials). Production must return generic errors and log detail
   server-side only.
6. A06 is shipping a dependency (often transitive) with a known vulnerability
   (CVE) — it runs with your app's privileges, so it's your hole. Defend by
   pinning lockfiles, scanning them (and container images) against CVE databases
   in CI (`pip-audit`/Dependabot/Trivy), and patching on a cadence + urgently for
   criticals.
7. Human review catches logic and *authorization* flaws (IDOR, missing ownership
   checks, business-logic abuse) that tools can't reason about; automated
   scanning (SAST like `bandit`, dependency scanners) reliably catches known
   insecure patterns and CVEs at scale. Use both — each covers the other's blind
   spot.

</details>

## Further reading & sources

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/) - reference values and rationale for every security header in this module.
- [MDN - HTTP security headers overview](https://developer.mozilla.org/en-US/docs/Web/Security) - browser-side documentation for HSTS, CSP, `X-Frame-Options`, and cookie flags.
- [MDN - Strict-Transport-Security (HSTS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) - how HSTS works and why `max-age` is sticky.
- [pip-audit](https://pypi.org/project/pip-audit/) - the Python dependency CVE scanner used here.
- [Bandit documentation](https://bandit.readthedocs.io/) - the Python SAST tool that flags `shell=True`, `pickle`, `yaml.load`, and more.
- [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/) - background on scanning components for known vulnerabilities (A06).

## Next

[07-capstone-project](../07-capstone-project/README.md) — everything in this
track now converges. You'll take a deliberately vulnerable FastAPI app and harden
it end to end: kill the injection, XSS, and CSRF; close the SSRF and
deserialization holes; add real rate limiting; get the secrets out of the code
and logs; and apply the security headers and dependency hygiene from this
module — a full secure-by-design pass on a system, defended.
