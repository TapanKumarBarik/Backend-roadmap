# Module 00: Auth Fundamentals — Stateful vs Stateless

## Why this matters

In track 02 every endpoint you built implicitly trusted whoever called it.
`POST /orders` created an order for "user 1" because you hardcoded
`user_id=1`. That's fine for learning request handling; it's a gaping hole in
a real system. The instant more than one person uses your API, two questions
appear that your handlers cannot currently answer: **who is this caller**
(authentication) and **are they allowed to do this** (authorization). Every
other module in this track is a specific, real answer to those two questions —
sessions, JWTs, OAuth2, API keys, MFA, RBAC. This module builds the mental
model they all hang off, so you're not memorizing four unrelated technologies
but recognizing four points on one map.

The single most important distinction on that map is **stateful vs
stateless**: does the server remember who you are between requests (it stored
something), or does each request carry a self-describing proof the server can
verify without remembering anything? Almost every design decision, security
tradeoff, and scaling headache in auth traces back to that one choice. Get
this fork clear now and the rest of the track is variations on a theme; get it
fuzzy and JWTs will feel like magic and sessions like legacy cruft, when in
fact they're two deliberate answers to the same problem.

## Concepts

### Authentication vs authorization — two different questions

They rhyme, they're both "auth," they're constantly conflated, and confusing
them causes real bugs. Keep them physically separate in your head:

- **Authentication (AuthN)** — *who are you?* Proving identity. A login form,
  an API key, a certificate. The output is a verified identity ("this request
  is from user 42") or a rejection.
- **Authorization (AuthZ)** — *what are you allowed to do?* Deciding whether an
  already-identified caller may perform this specific action on this specific
  resource. "User 42 may read order 99 but may not delete it."

AuthN happens first and once per request boundary; AuthZ happens at every
protected action and depends on AuthN's result. A system can authenticate you
perfectly and still (correctly) deny you — you *are* who you say, you're just
not allowed. Conversely, skipping AuthN entirely and only checking AuthZ is the
classic "I forgot to check they were logged in" vulnerability. You need both,
in that order, and this track spends modules 00-05 mostly on AuthN and module
06 entirely on AuthZ.

A concrete way to feel the split in FastAPI: a `get_current_user` dependency
does AuthN (turns a credential into a `User` or raises `401`); a
`require_role("admin")` dependency does AuthZ (takes that `User` and raises
`403` if they lack permission). Two dependencies, two responsibilities, two
different status codes — `401 Unauthorized` really means *unauthenticated*, and
`403 Forbidden` means *authenticated but not allowed*. HTTP named them
confusingly; you don't have to think confusingly.

### The core problem: HTTP is stateless

HTTP has no memory. Each request is an island — the protocol itself gives the
server no way to know that the request asking to delete order 99 came from the
same client that logged in thirty seconds ago. That's not a bug; it's what
makes HTTP scale. But it means *authentication state* — the fact that you
proved who you are — has to be re-established or re-proven on **every single
request**. You do not log in once and then have a "connection" that stays
authenticated; there is no connection. There are only independent requests,
each of which must carry, somehow, the evidence of who's making it.

There are exactly two families of answers to "how does each request carry that
evidence," and that fork is the whole module:

1. **Stateful:** the server remembers. On login it stores a record ("session
   abc123 = user 42, logged in at 10:00") and hands the client a meaningless
   opaque ID. Each later request presents that ID; the server looks it up.
2. **Stateless:** the server remembers nothing. On login it hands the client a
   self-describing, cryptographically signed token that *contains* the
   identity. Each later request presents that token; the server verifies the
   signature and trusts the contents — no lookup.

### Stateful (session-based) auth

The server is the source of truth. Think of a coat check at a theater: you hand
over your coat (credentials), they write down "coat #17 = this coat" in their
ledger and give you a plastic tag stamped `17`. The tag means nothing on its
own — it's just a number — but the ledger behind the counter turns it back into
your coat. Lose the ledger and every tag is worthless; that's the defining
property.

```
Login:   client sends username+password ─► server verifies, creates
         session record {id: "s_ab12", user_id: 42, created: ...} in a
         store, sends back Set-Cookie: session=s_ab12
Request: client sends Cookie: session=s_ab12 ─► server looks up "s_ab12"
         in the store ─► finds user 42 ─► request proceeds as user 42
Logout:  server deletes the session record ─► the cookie is now worthless
```

The token on the wire (`s_ab12`) is **opaque** — it carries no information, it's
just a key into server-side storage. The identity lives in the store (in
memory, Redis, or a database — module 01's subject). Properties that fall out
of this design:

- **Instant revocation.** Delete the record and the session is dead on the
  very next request. Logout, "log out all devices," banning a user, forcing
  re-login after a password change — all trivial, because the server holds the
  truth and can destroy it.
- **Server-side state.** Every logged-in user consumes a record. Millions of
  sessions is millions of rows to store and look up on every request.
- **Needs a shared store to scale horizontally.** If request 1 hits server A
  and request 2 hits server B, both must see the same session store — so you
  can't keep sessions in one server's local memory once you run more than one
  server. (Again, module 01.)

### Stateless (token-based) auth

The client carries the truth; the server only verifies it. Think of a
tamper-evident concert wristband instead of a coat-check tag. The wristband
itself says "VIP, valid July 27" printed on it and sealed so it can't be
altered without visibly breaking. The gate staff don't phone a central office
to check who you are — they read the band, confirm the seal is intact, and let
you in. No ledger anywhere. The flip side: if you sneak someone else a valid
band, the gate can't tell, and staff can't "cancel" a band already on a wrist —
it's valid until the printed date passes.

```
Login:   client sends username+password ─► server verifies, creates a
         signed token containing {sub: 42, exp: <10 min from now>},
         signs it with a secret ─► sends token back
Request: client sends Authorization: Bearer <token> ─► server verifies
         the signature and that exp hasn't passed ─► reads user 42 from
         the token itself ─► request proceeds. No store, no lookup.
```

The token is **self-describing and signed** (module 02 dissects the JWT that
implements this). Properties, mostly the mirror image of sessions:

- **No server-side state, no lookup.** Any server holding the verification key
  can validate any token. Horizontal scaling is trivial — there's nothing to
  share but the key. This is why token auth dominates APIs, microservices, and
  mobile.
- **Revocation is hard.** The server didn't store anything, so there's nothing
  to delete. A signed token with 30 minutes left is valid for 30 minutes even
  after the user logs out or is banned — unless you add machinery back
  (short expiry, refresh rotation, denylists — module 02) that reintroduces a
  bit of state. This is *the* fundamental tradeoff, and it's why "just use
  JWTs" is not automatically the right answer.
- **Size on the wire.** A token carrying claims is far bigger than a short
  opaque session ID, and it rides on every request.

### The tradeoff, stated once, cleanly

| | Stateful (sessions) | Stateless (tokens) |
|---|---|---|
| Where identity lives | server-side store | inside the token, on the client |
| Server memory per user | one record each | none |
| Per-request cost | a store lookup | a signature verification |
| Revocation | instant (delete record) | hard (token valid till expiry) |
| Horizontal scaling | needs a shared store | trivial (share only the key) |
| Token on the wire | short, opaque | large, self-describing |
| Natural fit | browser apps, "log me out everywhere" | APIs, microservices, mobile |

Neither wins outright. A bank's web app wants instant revocation and
server-side control → sessions. A fleet of stateless microservices behind a
gateway wants no shared session store → tokens. And plenty of real systems use
**both**: sessions for the browser front-end, tokens for the API — which is
exactly what you'll build in this track's capstone. The skill isn't picking a
side once; it's knowing which question each situation is really asking.

### Basic auth — the simplest form, and why it's rarely enough

Before either of the above, there's the most primitive real authentication
HTTP defines: **HTTP Basic Authentication**. The client sends the username and
password on *every* request, base64-encoded, in a header:

```
Authorization: Basic dXNlcjQyOnMza3JldA==
```

That base64 string is just `user42:s3kret` encoded — and this is the first
thing to internalize: **base64 is not encryption.** It's trivially reversible
(`echo dXNlcjQyOnMza3JldA== | base64 -d`). Basic auth transmits the password in
effectively cleartext, so it is only ever acceptable over TLS (HTTPS), and even
then it has serious problems:

- The client must hold the *actual password* and resend it on every request,
  multiplying the chances it leaks (in logs, in proxies, in a compromised
  client).
- There's no session and no token, so there's **no clean logout** and no
  expiry — the credential is valid until the password changes.
- No place for MFA, no refresh, no scoping. It's all-or-nothing.

Basic auth over TLS is genuinely fine for a narrow slice of cases — an internal
tool, a machine-to-machine call where the "password" is really a rotating
secret, a quick prototype. It's a real tool, not a joke. But it doesn't scale
to human-facing apps, which is why the rest of this track exists. It's worth
knowing precisely *because* it's the baseline everything else improves on: every
later mechanism is essentially "basic auth, but we stopped resending the
password by introducing a session or a token."

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| `HTTPBasic()` | FastAPI Basic-auth credential extractor | `security = HTTPBasic()` |
| `Depends(security)` | pull `HTTPBasicCredentials` from the header | `creds: HTTPBasicCredentials = Depends(security)` |
| `secrets.compare_digest(a, b)` | constant-time string compare (module 07) | `secrets.compare_digest(pw, stored)` |
| `HTTPBearer()` | extract a `Bearer <token>` (stateless) | `bearer = HTTPBearer()` |
| `Request.cookies.get("session")` | read a session cookie (stateful) | `sid = request.cookies.get("session")` |
| `HTTPException(401, ...)` | signal *unauthenticated* | `raise HTTPException(401, headers={"WWW-Authenticate": "Basic"})` |
| `HTTPException(403, ...)` | signal *authenticated but forbidden* | `raise HTTPException(403, "not allowed")` |

A minimal, correct Basic-auth dependency in FastAPI — note the constant-time
comparison (previewing module 07's timing-attack defense) and the `401` with a
`WWW-Authenticate` header:

```python
import secrets
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

app = FastAPI()
security = HTTPBasic()

# pretend this came from a real store; password would be HASHED in reality (module 05)
_USERS = {"user42": "s3kret"}

def current_user(creds: HTTPBasicCredentials = Depends(security)) -> str:
    stored = _USERS.get(creds.username)
    # compare_digest on BOTH fields so a wrong username and wrong password
    # take the same time — see module 07 on timing attacks
    user_ok = stored is not None
    pw_ok = user_ok and secrets.compare_digest(creds.password, stored)
    if not (user_ok and pw_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return creds.username  # AuthN result: a verified identity

@app.get("/whoami")
def whoami(user: str = Depends(current_user)):
    return {"user": user}
```

The shape here — *a dependency that turns a credential into an identity or
raises `401`* — is the shape of every AuthN mechanism in this track. Only the
credential and the verification change.

## Hands-on exercises

You'll build one FastAPI project up across this whole track. Start it now.

```bash
mkdir auth-track && cd auth-track
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install "fastapi[standard]"
```

Create `main.py` and run with `fastapi dev main.py`. Keep this project — every
later module adds to it.

### 1. Prove HTTP is stateless

Write an endpoint `GET /count` that increments and returns a module-level
integer, then call it twice from two *different* clients (two browser
profiles, or `curl` twice). Now add a second endpoint `GET /whoami` that just
returns `"unknown"`. The point to internalize by hand: the server has no idea
the two `/count` calls came from "the same user" — there is nothing in the
request tying them together. Write one sentence in a comment explaining what
*would* have to be added to the request for the server to know.

### 2. Implement Basic auth

Add the `current_user` dependency from the command reference and a protected
`GET /whoami`. Call it three ways and record the exact status code each time:

```bash
curl -i localhost:8000/whoami                                  # no header
curl -i -u user42:wrong localhost:8000/whoami                  # bad password
curl -i -u user42:s3kret localhost:8000/whoami                 # correct
```

Expected: `401` (no creds), `401` (wrong creds), `200` with `{"user":"user42"}`.
Note the `WWW-Authenticate: Basic` header on the `401`s.

### 3. Prove base64 is not encryption

Grab the base64 blob your client sent (it's in the `Authorization: Basic ...`
header — log `creds` or watch the request) and decode it yourself:

```bash
echo -n 'user42:s3kret' | base64          # encode
echo 'dXNlcjQyOnMza3JldA==' | base64 -d   # decode — your password, in the clear
```

Expected: the decode prints `user42:s3kret`. Write one sentence on why this
means Basic auth is unacceptable over plain HTTP.

### 4. Feel the AuthN/AuthZ split

Add a `role` to your fake user store (`{"user42": {"pw": "s3kret", "role":
"user"}}`) and a second dependency `require_admin` that takes the result of
`current_user` and raises `403` unless the role is `admin`. Add
`DELETE /orders/{id}` protected by `require_admin`. Call it as `user42`.

Expected: `403 Forbidden` — you are correctly *authenticated* (the server knows
you're `user42`) but not *authorized*. Confirm the status is `403`, not `401`,
and articulate why that distinction matters to a client.

### 5. Design on paper: stateful vs stateless

No code. For each of these systems, decide sessions or tokens and write one
sentence of justification: (a) an online bank's web app with a "sign out of all
devices" button; (b) a public REST API consumed by third-party mobile apps;
(c) an internal cluster of 20 identical microservices behind a gateway; (d) a
social app that must ban abusive accounts and have the ban take effect
immediately. Keep your answers — you'll check them against modules 01 and 02.

### 6. Trace a request end to end (both models)

On paper, trace one authenticated `GET /orders` request through **both** a
stateful and a stateless design, naming at each step what's on the wire and
what the server does. For stateful, include the store lookup; for stateless,
include the signature verification and note there is *no* lookup. This is the
diagram from Concepts, reproduced from memory — do it without looking.

### 7. Diagnose and fix: the "logged in forever" bug

A colleague reports: "We switched from sessions to signed tokens with a
24-hour expiry, and now when we ban a user or they hit logout, they can still
use the API for hours. With sessions this never happened." Here's the offending
logout handler:

```python
@app.post("/logout")
def logout():
    # sessions version used to do: session_store.delete(sid)
    return {"ok": True}   # ...but now there's no server-side state to delete
```

Explain precisely why the behavior changed (tie it to stateful vs stateless),
say whether the logout handler is even the right place to fix it, and list two
mitigations without full code. This is the central tradeoff of this module
showing up as a real ticket.

<details>
<summary>Solution</summary>

The switch moved identity *off* the server and *into* the token. With sessions,
logout/ban deleted the server-side record and the credential died on the next
request. With stateless tokens the server stored nothing, so `logout` has
nothing to delete — the signed token remains valid until its `exp` passes
(24h), no matter what the server does. The logout handler is *not* where you
fix it, because a stateless token can't be un-issued. Mitigations (module 02):
(1) drastically shorten access-token expiry (e.g. 5-15 min) and use refresh
tokens so a ban takes effect within one short window; (2) add a server-side
**denylist** of revoked token IDs checked on each request — which deliberately
reintroduces a small amount of state, trading away some of the "no lookup"
benefit for revocability. The lesson: revocation is the price of statelessness,
and you buy it back explicitly.

</details>

## Independent challenge

No code given. Using only what this module covered, build a single FastAPI app
that exposes the **same** protected endpoint `GET /profile` behind **two**
different authentication mechanisms living side by side: HTTP Basic auth on one
router (`/basic/profile`) and a trivial opaque-token scheme on another
(`/token/profile`) where a `POST /token/login` hands back a random opaque
string you store in an in-memory dict and later look up. Make both paths return
the same identity for the same user. Then write a short note comparing them
against the **stateful vs stateless** table from this module — classify each of
your two schemes, and identify which one you could make "log out instantly" and
which one (if you'd used a *signed* token instead of an opaque stored one)
you could not. Reach back to the AuthN/authZ split and add a `role` check to
`/profile` so both paths also demonstrate authorization, not just
authentication.

<details>
<summary>Hint</summary>

Your opaque-token scheme is actually *stateful* — you stored the token
server-side in a dict, so it's really a hand-rolled session, and deleting the
dict entry logs the user out instantly. That's the tell: revocability comes
from the server holding the truth. A *signed* token (module 02) would move the
truth to the client and take that instant logout away. Use one shared
`require_role` dependency that operates on the resolved `User`, and mount it
after each router's own AuthN dependency so authentication runs first,
authorization second.

</details>

## Common mistakes & troubleshooting

- **Conflating `401` and `403`.** `401` = we don't know who you are
  (authentication failed/missing); `403` = we know who you are and you're not
  allowed (authorization failed). Returning `403` for a missing login, or
  `401` for a permission denial, misleads clients and breaks retry logic.
- **Thinking base64 protects the password.** It's an encoding, not encryption.
  Basic auth is cleartext-equivalent; never use it without TLS.
- **Assuming "stateless is just better."** Statelessness buys scaling and costs
  revocability. If your product needs instant logout/ban, you either pick
  sessions or bolt state back onto tokens — there's no free lunch.
- **Storing sessions in one server's local memory, then scaling out.** Works on
  one box, breaks the moment a second server can't see the first's memory.
  (Module 01.)
- **Doing authorization without authentication.** Checking "is this user an
  admin" when you never verified the user is real is a top vulnerability. AuthN
  first, always, then AuthZ.
- **Re-sending the password on every request by design.** Beyond Basic auth,
  any scheme where the long-lived password rides on every call multiplies leak
  surface. The whole point of sessions/tokens is to send the password *once*.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define authentication and authorization in one sentence each, and say which
   runs first and why.
2. Which HTTP status code means "unauthenticated" and which means
   "authenticated but not allowed"?
3. HTTP is stateless. What concrete consequence does that have for how a server
   knows *who* is making each request?
4. In stateful (session) auth, what is actually on the wire, and where does the
   real identity live?
5. In stateless (token) auth, why is revocation hard, and name two ways to buy
   revocability back.
6. Give one system that should use sessions and one that should use tokens, and
   justify each in a sentence.
7. Why is HTTP Basic auth acceptable only over TLS, and name two reasons it
   doesn't scale to a human-facing app.

<details>
<summary>Answers</summary>

1. Authentication is proving *who you are*; authorization is deciding *what
   you're allowed to do*. AuthN runs first because you can't decide what an
   identity may do until you've established the identity.
2. `401 Unauthorized` = unauthenticated (misnamed by HTTP); `403 Forbidden` =
   authenticated but not permitted.
3. Because each request is independent with no memory, the evidence of identity
   must be carried on (or re-established by) *every single request* — there's no
   persistent "logged-in connection."
4. On the wire is a short, meaningless **opaque** session ID; the real identity
   lives in a server-side store (memory/Redis/DB) that the ID is a key into.
5. Because the server stored nothing, there's nothing to delete — a signed
   token is valid until its `exp`. Buy revocability back with (a) short expiry +
   refresh rotation and/or (b) a server-side denylist of revoked token IDs.
6. Sessions: a bank web app with "log out everywhere," because it needs instant
   server-side revocation. Tokens: a fleet of stateless microservices, because
   there's no shared session store to maintain — each service just verifies the
   signature.
7. Basic auth base64-encodes (not encrypts) the password and resends it every
   request, so without TLS it's effectively cleartext. It doesn't scale because
   there's no clean logout/expiry, no MFA/refresh/scoping, and the real password
   is exposed on every call.

</details>

## Next

[01-sessions-and-cookies](../01-sessions-and-cookies/README.md) — you now know
*that* sessions store identity server-side and hand back an opaque ID; next
you'll build one properly: where the session store lives (in-memory vs Redis),
how the cookie transports the ID, the cookie attributes (`HttpOnly`, `Secure`,
`SameSite`) that keep it from being stolen, and the session-fixation attack you
have to design against.
