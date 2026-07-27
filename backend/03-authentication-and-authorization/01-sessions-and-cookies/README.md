# Module 01: Sessions and Cookies

## Why this matters

Module 00 told you *that* stateful auth stores identity server-side and hands
the client an opaque ID. This module is where you actually build it correctly —
and "correctly" is doing a lot of work in that sentence, because a session
system has three parts that each have a wrong way to do them: the **store**
(where the session record lives), the **transport** (how the ID travels
between client and server), and the **lifecycle** (create, rotate, expire,
destroy). Get the store wrong and you can't scale past one server. Get the
cookie attributes wrong and an attacker steals sessions with a line of
JavaScript or a forged cross-site request. Get the lifecycle wrong and you're
vulnerable to session fixation — an attack most tutorials never mention and
most hand-rolled session systems are wide open to.

Sessions are also not legacy. Every server-rendered app, every "log me out of
all devices" feature, every admin panel that needs a ban to take effect
*now* — these want server-side sessions, and the browser's cookie machinery is
purpose-built to carry them. This is the mechanism your capstone will use for
its browser client. Learn it properly here and you'll also understand exactly
what the framework "session middleware" you'll reach for is doing under the
hood, so you can reason about it instead of trusting it.

## Concepts

### How a server-side session actually works

A session is a server-side record plus a client-side pointer to it. The full
loop, concretely:

```
1. POST /login  {username, password}
2. Server verifies the password (module 05 covers hashing) → user 42.
3. Server generates a cryptographically random session ID: "s_9f3a...c1"
4. Server stores a record:  sessions["s_9f3a...c1"] = {user_id: 42,
      created_at: ..., last_seen: ..., ...}
5. Server responds with:  Set-Cookie: session=s_9f3a...c1; HttpOnly; Secure; ...
6. Browser stores the cookie, and on EVERY later request to this origin
   automatically sends:  Cookie: session=s_9f3a...c1
7. Server reads the cookie, looks up "s_9f3a...c1" in the store, finds
   user 42, and the request proceeds as user 42.
8. POST /logout → server DELETES the record → the cookie now points at
   nothing → next request is anonymous.
```

Two properties of the session ID are non-negotiable. It must be
**cryptographically random** (use `secrets.token_urlsafe`, never a counter,
never a UUID1, never anything guessable) and it must be **long enough** that
brute-forcing valid IDs is infeasible (128 bits / ~22 url-safe chars minimum).
The ID is a bearer credential — whoever holds it *is* the session — so it must
be unguessable and, on the wire, protected (see cookie attributes below).

### Session storage: in-memory vs Redis vs database

The store is where the truth lives. Three common choices, with real
consequences:

- **In-memory (a Python dict).** Fastest, zero infrastructure, perfect for
  local dev and single-process learning. Two fatal flaws in production: (1) it
  dies with the process — a restart or deploy logs everyone out; (2) it's local
  to *one* process, so the moment you run two workers or two servers, a session
  created on worker A is invisible to worker B. Even `uvicorn --workers 4` on
  one machine breaks it. Fine for this module's exercises; never for real.
- **Redis (or Memcached) — the standard answer.** An in-memory data store that
  all your app servers share over the network. Fast lookups, survives app
  restarts, and — crucially — supports **TTL**: `SET session:s_9f3a {...} EX
  1800` makes the key auto-expire in 30 minutes, so idle sessions clean
  themselves up without a cron job. This is what "sessions scale horizontally
  *with a shared store*" (module 00) means in practice: the shared store is
  Redis.
- **Relational database.** A `sessions` table. Durable and transactional, but a
  DB round-trip on *every authenticated request* is heavier than Redis, and you
  must expire rows yourself. Reasonable at small scale or when you already
  need session data in SQL; usually Redis is the better default.

The decision axis is the same one from module 00: sessions cost you a per-
request lookup and a shared store to run, in exchange for instant revocation
and full server-side control. Redis is how you make that lookup cheap and the
store shared.

### Cookies as the transport

A cookie is just a small key-value string the server sets via a `Set-Cookie`
response header and the browser then sends back automatically in a `Cookie`
request header, scoped to the origin. That "automatically, on every request"
behavior is exactly why cookies are the natural transport for a session ID —
the browser does the carrying for you, no client code required. It's *also*
exactly why cookies are dangerous: because the browser attaches them
automatically to *any* request to your origin, including requests triggered by
a malicious other site (that's CSRF — below and module 07).

The `Set-Cookie` header carries the value plus a set of **attributes** that
control the cookie's scope, lifetime, and security. Those attributes are the
entire security surface of a cookie-based session, so they get their own
section.

### Cookie attributes: HttpOnly, Secure, SameSite (and friends)

Get these right and a session cookie is a solid credential. Get them wrong and
you've handed attackers the session. The security-critical ones:

- **`HttpOnly`** — the cookie is not readable from JavaScript (`document.cookie`
  can't see it). This is your defense against **XSS stealing the session**: if
  an attacker injects a script into your page, `HttpOnly` stops that script from
  exfiltrating the session cookie. Session cookies must always be `HttpOnly`.
- **`Secure`** — the cookie is only ever sent over HTTPS, never plain HTTP. This
  stops a network attacker from reading the session ID off an accidental
  `http://` request. Always set it in production.
- **`SameSite`** — controls whether the cookie is sent on **cross-site**
  requests, which is your primary defense against **CSRF**:
  - `SameSite=Strict` — never sent on any cross-site request. Safest, but
    breaks "click a link from an email and land already logged in."
  - `SameSite=Lax` — sent on top-level *navigations* (clicking a link) but not
    on cross-site subrequests (a hidden form POST, an `img`/`fetch` from
    another origin). This is the sensible default and what most session cookies
    should use.
  - `SameSite=None` — sent on all cross-site requests; **must** be paired with
    `Secure`. Only for cookies you genuinely need cross-site (third-party
    embeds).
- **`Max-Age` / `Expires`** — how long the browser keeps the cookie. Omit both
  and it's a *session cookie* (deleted when the browser closes). Set `Max-Age`
  for a persistent "remember me" login. Note this is the *cookie's* lifetime on
  the client; the *server-side* session TTL (the Redis EX) is separate, and the
  effective session lasts only as long as the shorter of the two.
- **`Path` / `Domain`** — scope the cookie to a path prefix and/or domain.
  Default `Path=/` (whole origin) is usually what you want for a session.

Each attribute blunts a specific attack — the three security-critical ones map
one-to-one onto three threats:

```
  Set-Cookie: session=…
     ├─ HttpOnly ───► JS can't read it        ► blunts XSS session theft
     ├─ Secure ─────► HTTPS-only on the wire   ► blunts network sniffing
     └─ SameSite=Lax► not sent cross-site      ► blunts CSRF
```

A correct session cookie in FastAPI looks like:

```python
response.set_cookie(
    key="session",
    value=session_id,
    httponly=True,        # not readable by JS  → blunts XSS theft
    secure=True,          # HTTPS only           → blunts network sniffing
    samesite="lax",       # no cross-site sends  → blunts CSRF
    max_age=1800,         # 30 min persistent; omit for browser-session cookie
    path="/",
)
```

### Session lifecycle and session fixation

The lifecycle is create → (use, sliding expiry) → destroy, but there's one step
most hand-rolled systems miss and it opens a real attack: **you must issue a
brand-new session ID at the moment privilege changes — i.e. at login.**

**Session fixation** is the attack that exploits skipping it. The setup: your
app hands out a session ID to *anonymous* visitors (say, to hold a shopping
cart) and then, on login, keeps the *same* ID and just attaches the user to it.
The exploit:

```
1. Attacker visits your site, gets an anonymous session ID: "s_FIXED".
2. Attacker tricks the victim into using that exact ID — e.g. a link
   like https://yoursite/?session=s_FIXED, or by setting the cookie via
   an XSS/subdomain trick. The victim's browser now carries "s_FIXED".
3. Victim logs in. Your app, buggily, KEEPS "s_FIXED" and just marks it
   "= user 42".
4. The attacker already knows "s_FIXED" — and it's now an authenticated
   session for the victim. The attacker is logged in as the victim.
```

The fix is one line of discipline: **on every successful login, destroy any
existing session and generate a fresh, random session ID**, then set the cookie
to the new one. The attacker's known ID is now worthless because logging in
rotated it. The same rotate-on-privilege-change rule applies to any privilege
elevation (e.g. stepping up to admin via MFA).

```
  VULNERABLE (keep the ID)              FIXED (rotate at login)
  anon "s_FIXED" ─► login ─► still      anon "s_FIXED" ─► login ─► DROP s_FIXED,
     "s_FIXED" = user 42                    mint "s_NEW" = user 42
  attacker knew s_FIXED → owns you      attacker's s_FIXED → now worthless (401)
```

Also rotate/expire aggressively:
set an absolute lifetime (e.g. 8 hours) and an idle timeout (e.g. 30 min of
inactivity), and always fully delete the server-side record on logout so the ID
can't be replayed.

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| `secrets.token_urlsafe(32)` | generate a 256-bit random session ID | `sid = secrets.token_urlsafe(32)` |
| `response.set_cookie(...)` | issue the session cookie with attributes | see below |
| `request.cookies.get("session")` | read the session ID from the request | `sid = request.cookies.get("session")` |
| `response.delete_cookie("session")` | clear the cookie on logout | `response.delete_cookie("session")` |
| `redis.set(k, v, ex=1800)` | store session with a 30-min TTL | `r.set(f"session:{sid}", data, ex=1800)` |
| `redis.delete(k)` | destroy a session server-side | `r.delete(f"session:{sid}")` |
| `SessionMiddleware(secret_key=...)` | Starlette's signed-cookie sessions | `app.add_middleware(SessionMiddleware, ...)` |

Note on Starlette's built-in `SessionMiddleware`: it stores session data
*inside a signed cookie* on the client, not server-side. That's a different
tradeoff (it's closer to stateless — no store, but no server-side revocation
and a size limit). For a true server-side session with instant revocation you
implement the store yourself as below (or use a library like
`starsessions` with a Redis backend).

A hand-rolled server-side session, store-agnostic (dict here for dev, swap for
Redis in prod):

```python
import secrets, time
from fastapi import FastAPI, Request, Response, HTTPException, Depends

app = FastAPI()
SESSIONS: dict[str, dict] = {}          # dev store; use Redis in production
IDLE_TTL = 1800                          # 30 min

def create_session(user_id: int) -> str:
    sid = secrets.token_urlsafe(32)      # cryptographically random, 256-bit
    SESSIONS[sid] = {"user_id": user_id, "created": time.time(),
                     "last_seen": time.time()}
    return sid

def current_user(request: Request) -> int:
    sid = request.cookies.get("session")
    sess = SESSIONS.get(sid) if sid else None
    if not sess:
        raise HTTPException(401, "not authenticated")
    if time.time() - sess["last_seen"] > IDLE_TTL:      # idle timeout
        SESSIONS.pop(sid, None)
        raise HTTPException(401, "session expired")
    sess["last_seen"] = time.time()                     # sliding expiry
    return sess["user_id"]

@app.post("/login")
def login(response: Response, request: Request):
    # ... verify password → user 42 (module 05) ...
    old = request.cookies.get("session")
    if old:                              # FIXATION DEFENSE: drop any old session
        SESSIONS.pop(old, None)
    sid = create_session(user_id=42)     # brand-new ID at login
    response.set_cookie("session", sid, httponly=True, secure=True,
                        samesite="lax", max_age=IDLE_TTL, path="/")
    return {"ok": True}

@app.post("/logout")
def logout(response: Response, request: Request):
    sid = request.cookies.get("session")
    if sid:
        SESSIONS.pop(sid, None)          # destroy server-side record
    response.delete_cookie("session")    # clear client cookie
    return {"ok": True}

@app.get("/me")
def me(user_id: int = Depends(current_user)):
    return {"user_id": user_id}
```

## Hands-on exercises

Continue in the `auth-track` project from module 00.

### 1. Build the server-side session

Add the `create_session` / `current_user` / `login` / `logout` / `me` code
above (dict store for now). Log in with `curl -c cookies.txt -X POST
localhost:8000/login`, then hit `/me` reusing the jar:

```bash
curl -c cookies.txt -X POST localhost:8000/login
curl -b cookies.txt localhost:8000/me            # → {"user_id": 42}
curl localhost:8000/me                            # no cookie → 401
```

Expected: with the cookie jar you're user 42; without it, `401`.

### 2. Inspect the Set-Cookie header

Re-run login with `-i` and read the raw `Set-Cookie` header:

```bash
curl -i -X POST localhost:8000/login | grep -i set-cookie
```

Expected: you see `session=...; HttpOnly; Secure; SameSite=lax; Path=/;
Max-Age=1800`. Name what each attribute defends against — this is the security
surface, in one line of output.

### 3. Prove HttpOnly blocks JavaScript

Open the app in a browser (`fastapi dev` serves at `localhost:8000`), log in,
open devtools console, and run `document.cookie`. Expected: the `session`
cookie is **not** in the output because it's `HttpOnly`. Now temporarily set
`httponly=False`, log in again, and re-run — it appears. Set it back to `True`.
You just watched the XSS-theft defense turn on and off.

### 4. Prove logout revokes instantly

Log in (jar), confirm `/me` works, hit `/logout` with the jar, then hit `/me`
again with the same jar:

```bash
curl -c j.txt -X POST localhost:8000/login
curl -b j.txt localhost:8000/me      # 200
curl -b j.txt -X POST localhost:8000/logout
curl -b j.txt localhost:8000/me      # 401 — server-side record is gone
```

Expected: `401` after logout even though the browser still *has* the cookie —
because the server deleted the record. This is the instant-revocation property
from module 00, demonstrated.

### 5. Swap the dict for Redis

Run Redis (`docker run -p 6379:6379 redis`), `pip install redis`, and replace
the `SESSIONS` dict with `redis.Redis()` calls storing JSON with `ex=IDLE_TTL`.
Then restart your FastAPI process *without* clearing Redis and confirm your
session survives the restart:

```bash
# log in, note it works, Ctrl-C the app, restart fastapi dev, hit /me again
```

Expected: with the dict, a restart logs you out; with Redis, the session
survives — proving why in-memory doesn't survive deploys and Redis does.

### 6. Reproduce and fix session fixation

Simulate the attack against a *deliberately broken* login that reuses the
incoming session ID instead of rotating it:

```python
@app.post("/login-broken")
def login_broken(response: Response, request: Request):
    sid = request.cookies.get("session") or secrets.token_urlsafe(32)  # BUG: reuses
    SESSIONS[sid] = {"user_id": 42, "created": time.time(), "last_seen": time.time()}
    response.set_cookie("session", sid, httponly=True, samesite="lax")
    return {"ok": True}
```

Attack it: pick a fixed ID `s_FIXED`, send it in as the cookie to
`/login-broken`, then confirm that same `s_FIXED` now authenticates you at
`/me`:

```bash
curl -b "session=s_FIXED" -X POST localhost:8000/login-broken
curl -b "session=s_FIXED" localhost:8000/me       # 200 — the attacker-known ID is now logged in!
```

Now fix it (rotate the ID on login, dropping the old one, as in the correct
`/login`) and repeat: `s_FIXED` must **no longer** authenticate. Expected:
after the fix, `/me` with `s_FIXED` returns `401`.

### 7. Add idle and absolute timeouts

Add an absolute lifetime (e.g. 20 seconds for testing) alongside the idle
timeout: reject any session older than `created + ABSOLUTE_TTL` even if it's
been active. Log in, keep hitting `/me` every few seconds, and confirm you get
kicked to `401` once the absolute lifetime passes despite continuous activity.
Expected: sliding idle expiry keeps an active session alive, but the absolute
cap eventually forces re-login regardless.

### 8. Diagnose and fix: sessions vanish under load

A teammate deploys with `uvicorn main:app --workers 4` and users report being
"randomly logged out — refresh and I'm anonymous, refresh again and I'm back."
It never happens with `--workers 1`. The session code uses the in-memory dict.
Diagnose the root cause and state the fix.

<details>
<summary>Solution</summary>

The in-memory `SESSIONS` dict is local to *each* worker process. With 4
workers, login creates the session in whichever worker handled the login
request; a later request load-balanced to a *different* worker doesn't find it
(that worker's dict never saw it) and returns `401` — hence "randomly logged
out," flipping as requests bounce between workers. The fix is a **shared**
store all workers can see: Redis (or a database), exactly as in exercise 5.
This is module 00's "sessions need a shared store to scale horizontally" made
concrete — and note "horizontal" includes multiple workers on one machine, not
just multiple machines.

</details>

## Independent challenge

No code given. Build a complete "remember me" login on top of your session
system. Requirements: a `POST /login` that accepts a `remember: bool`; when
`false`, issue a *browser-session* cookie (deleted on browser close) with a
short idle timeout; when `true`, issue a *persistent* cookie lasting 14 days
with both an idle timeout and an absolute cap. In **both** cases rotate the
session ID at login (reach back to the session-fixation defense from this
module) and set `HttpOnly`, `Secure`, and an appropriate `SameSite`. Add a
`GET /sessions` endpoint that lists all of the current user's active sessions
(store a per-user index in your store) and a `DELETE /sessions/{id}` that
revokes a specific one — i.e. "log out this other device" — proving the
instant-revocation property from module 00 works per-session. Use Redis (from
exercise 5) as the store so the whole thing survives a restart.

<details>
<summary>Hint</summary>

The difference between a browser-session cookie and a persistent one is purely
whether you pass `max_age`/`expires` at all — omit it for browser-session, set
it for "remember me." Keep the *server-side* TTL separate from the *cookie*
lifetime: store a Redis key per session with its own `EX`, and maintain a Redis
set `user:42:sessions` holding that user's session IDs so `GET /sessions` and
per-device revocation ("log out that device") are just set operations plus
key deletes. Rotating the ID at login (fixation defense) means the "current"
session in the list is always the freshly-minted one.

</details>

## Common mistakes & troubleshooting

- **Guessable session IDs.** UUID1, counters, timestamps, short strings — all
  brute-forceable or predictable. Use `secrets.token_urlsafe(32)`.
- **In-memory store in production.** Dies on restart, invisible across
  workers/servers. Use Redis (or a DB). This bites even at `--workers 4` on one
  box.
- **Missing `HttpOnly`.** Any XSS on your site can then read and exfiltrate the
  session cookie. Always `HttpOnly` for session cookies.
- **Missing `Secure` / wrong `SameSite`.** Without `Secure`, the ID can leak
  over an accidental HTTP request; without `SameSite=Lax`/`Strict`, you're open
  to CSRF (module 07). `SameSite=None` without `Secure` is rejected by
  browsers.
- **Not rotating the session ID at login.** This is the session-fixation hole.
  Always destroy the old session and mint a new ID on any privilege change.
- **Logout that only clears the cookie.** `delete_cookie` without deleting the
  server-side record leaves a replayable session — if the client kept a copy of
  the ID, it still works. Delete the record *and* the cookie.
- **Cookie lifetime vs session TTL confusion.** The cookie's `Max-Age` and the
  server-side TTL are independent; the session effectively lives only as long
  as the shorter of the two, and a long cookie with a dead server record is
  just a `401` waiting to happen.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Walk through the full session loop from `POST /login` to a later
   authenticated request, naming what's on the wire and what the server stores.
2. Why must a session ID be both cryptographically random and long, and what
   goes wrong if it isn't?
3. Why does an in-memory session store break under `uvicorn --workers 4` even
   on a single machine, and what fixes it?
4. What does each of `HttpOnly`, `Secure`, and `SameSite` defend against?
5. Describe the session-fixation attack and the one-line discipline that
   prevents it.
6. What's the difference between the cookie's `Max-Age` and the server-side
   session TTL, and which one governs how long the session actually lasts?
7. Why is deleting only the cookie (not the server-side record) an incomplete
   logout?

<details>
<summary>Answers</summary>

1. Login sends username/password; the server verifies them, generates a random
   session ID, stores a record `{id → user_id, timestamps}` server-side, and
   returns `Set-Cookie: session=<id>`. On every later request the browser sends
   `Cookie: session=<id>`; the server looks the ID up in the store, finds the
   user, and proceeds. Only the opaque ID is ever on the wire; the identity
   lives in the store.
2. It's a bearer credential — holding it *is* the session — so it must be
   unguessable (cryptographically random, not a counter/UUID1) and long enough
   (128+ bits) that brute-forcing valid IDs is infeasible. A predictable or
   short ID lets an attacker guess or enumerate live sessions and hijack them.
3. The dict is per-process; each of the 4 workers has its own. A session
   created in one worker is invisible to the others, so requests
   load-balanced elsewhere return `401` intermittently. A shared store (Redis
   or a DB) that all workers read fixes it.
4. `HttpOnly`: blocks JavaScript from reading the cookie → blunts XSS session
   theft. `Secure`: sends the cookie only over HTTPS → blunts network sniffing.
   `SameSite` (Lax/Strict): stops the cookie being sent on cross-site requests
   → blunts CSRF.
5. The attacker fixes a known session ID onto the victim's browser (via a URL,
   XSS, etc.) *before* login; if the app keeps that same ID through login, the
   attacker now shares an authenticated session. Prevention: on every login,
   destroy any existing session and issue a fresh random ID (rotate on
   privilege change).
6. `Max-Age` is how long the *browser* keeps the cookie; the server-side TTL is
   how long the *record* lives. The session lasts only as long as the shorter
   of the two — a valid cookie pointing at an expired/deleted record is just a
   `401`.
7. Because the server-side record still exists and remains valid; anyone who
   kept a copy of the ID (or a cached request) can replay it. A complete logout
   deletes the server-side record *and* clears the client cookie.

</details>

## Further reading & sources

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) - session ID entropy, rotation, timeouts, and cookie hardening, all covered here.
- [OWASP: Session fixation](https://owasp.org/www-community/attacks/Session_fixation) - the attack this module reproduces, with defenses.
- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) - the authoritative reference for `HttpOnly`, `Secure`, `SameSite`, `Max-Age`, and friends.
- [RFC 6265 - HTTP State Management Mechanism](https://datatracker.ietf.org/doc/html/rfc6265) - the cookie spec itself, including how browsers scope and return cookies.
- [Redis: EXPIRE / key TTL](https://redis.io/docs/latest/commands/expire/) - how the `EX` TTL that auto-cleans idle sessions works.
- [Starlette SessionMiddleware](https://www.starlette.io/middleware/#sessionmiddleware) - the signed-cookie session middleware and why it differs from a server-side store.

## Next

[02-jwt-deep-dive](../02-jwt-deep-dive/README.md) — you've built the stateful
side thoroughly; now cross to the stateless side and dissect the JWT: its three
parts, `HS256` vs `RS256` signing, access vs refresh tokens, expiry, and the
revocation problem (plus its mitigations) that module 00 promised you'd have to
confront.
