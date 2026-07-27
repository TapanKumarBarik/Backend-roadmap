# Module 02: JWT Deep Dive

## Why this matters

Module 00 sketched the stateless token as a "signed thing that carries the
identity so the server needs no lookup." That thing, in practice, is almost
always a **JWT** (JSON Web Token). It's the credential behind OAuth2 access
tokens (module 03), most mobile and SPA API auth, and service-to-service calls
(module 04). If you only ever copy a "here's how to make a JWT" snippet, you
will eventually ship one of the classic JWT vulnerabilities — the `alg: none`
bypass, the HS256/RS256 confusion attack, a token you can't revoke when you
need to — because those all come from *not understanding what the three parts
are and what the signature actually proves*.

So this module dissects the JWT down to its bytes, then builds the real-world
pattern on top: short-lived **access tokens** plus longer-lived **refresh
tokens** with rotation, because a naive "one long-lived JWT" design is both
insecure and un-revocable. The revocation problem module 00 warned you about
gets confronted head-on here — statelessness is a spectrum, and you'll see
exactly how much state you have to add back to get logout and ban working, and
why that's a deliberate tradeoff rather than a failure.

## Concepts

### The three parts of a JWT

A JWT is three base64url-encoded chunks joined by dots:
`header.payload.signature`. A real one looks like:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsImV4cCI6MTcyMDAwMDAwMH0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

Split on the dots and base64url-decode the first two parts (the third is
binary signature bytes):

- **Header** — JSON metadata about the token itself. Chiefly `alg` (the signing
  algorithm, e.g. `HS256`) and `typ` (`JWT`). Example:
  `{"alg":"HS256","typ":"JWT"}`.
- **Payload (claims)** — JSON key/value assertions about the subject. A mix of
  **registered claims** with standard meanings and your own **custom claims**:
  - `sub` — subject (who the token is about, e.g. the user id)
  - `iss` — issuer (who minted it)
  - `aud` — audience (who it's for; the API that should accept it)
  - `exp` — expiry (Unix timestamp; after this the token is invalid)
  - `iat` — issued-at; `nbf` — not-before
  - `jti` — a unique token ID (you'll use this for denylists, below)
  - plus custom claims like `"role": "admin"` or `"scope": "read:orders"`.
- **Signature** — the cryptographic proof that the header and payload haven't
  been tampered with and were minted by someone holding the signing key.
  Computed over `base64url(header) + "." + base64url(payload)` using the
  algorithm named in `alg`.

**The single most important fact about a JWT: the payload is *signed, not
encrypted*.** Anyone holding the token can read every claim by base64-decoding
the middle part — no key required. base64url is an encoding, not a cipher
(same lesson as module 00's Basic-auth base64). So: never put secrets in a JWT
payload (passwords, PII, anything you wouldn't hand the client), and understand
that the signature guarantees *integrity and authenticity* — "these claims are
genuine and unaltered" — **not** confidentiality.

### What the signature proves, and how verification works

Signing binds the claims to a key. Verification recomputes the signature over
the received header+payload and checks it matches the one attached:

```
issue:   sig = HMAC_SHA256(secret, b64(header) + "." + b64(payload))
verify:  recompute HMAC_SHA256(secret, received_header + "." + received_payload)
         if recomputed == received_sig AND exp not passed AND iss/aud match
             → trust the claims (this is user 42, role admin, ...)
         else → reject (401)
```

If an attacker changes `"role":"user"` to `"role":"admin"` in the payload, the
recomputed signature won't match (they don't have the secret), so verification
fails. That's the whole trick: you don't need to look anything up in a
database, you just need the key and a few equality checks. **Always verify
`exp`, and verify `iss`/`aud` when you set them** — a valid signature on an
expired token, or a token minted for a *different* audience, must still be
rejected. Good libraries do these checks for you when you pass the expected
values; the danger is calling `decode` without them.

### HS256 vs RS256 — symmetric vs asymmetric signing

The `alg` picks how the signature is made, and the choice has real
architectural consequences:

- **HS256 (HMAC-SHA256) — symmetric.** One shared secret both signs *and*
  verifies. Simple and fast. The catch: **everyone who can verify can also
  forge.** Anyone holding the secret can mint valid tokens. That's fine when the
  same service issues and verifies (a monolith), but a problem the moment you
  want many services to *verify* tokens without any of them being able to
  *issue* them — because you'd have to share the signing secret with all of
  them.
- **RS256 (RSA-SHA256) — asymmetric.** A key *pair*: a **private key** signs
  (held only by the issuer/auth server) and a **public key** verifies (handed
  out freely to anyone who needs to check tokens). Verifiers can validate
  tokens but *cannot* mint them, because they don't have the private key. This
  is why OAuth2 providers and multi-service architectures use RS256 (or ES256):
  the auth server keeps the private key, publishes the public key (via a JWKS
  endpoint — module 03), and a hundred microservices can independently verify
  tokens without any of them being able to forge one.

Rule of thumb: **HS256 when the issuer and verifier are the same trust domain;
RS256 when they're separate** (third parties verify, or many services verify
tokens a central auth server issues).

Two notorious attacks come straight from mishandling `alg`, and they're why you
never trust the token's own header blindly:

- **`alg: none`** — the spec allows an "unsecured" JWT with no signature. A
  naive verifier that honors the header's `alg` will accept a token with `alg:
  none` and an empty signature — so an attacker just strips the signature and
  edits the claims freely. Defense: never allow `none`; pin the accepted
  algorithm(s) explicitly on verify.
- **HS256/RS256 confusion** — a server expecting RS256 (verifying with the RSA
  *public* key) but that also accepts HS256 can be tricked: the attacker signs a
  token with HS256 using the *public key* (which is, well, public) as the HMAC
  secret. Defense: pin the exact algorithm you expect; don't let the token's
  header choose. Both attacks vanish if you pass `algorithms=["RS256"]` (a
  fixed list) to `decode` instead of trusting the header.

### Access tokens vs refresh tokens

If a JWT is stateless and un-revocable, you don't want it long-lived — a stolen
30-day token is a 30-day breach. But you also don't want to prompt for the
password every five minutes. The standard resolution is **two tokens**:

- **Access token** — short-lived (5-15 minutes), sent on every API request
  (`Authorization: Bearer <access>`), carries the identity/claims the API needs.
  Because it's short-lived, a leaked one is only dangerous briefly, *and* a ban
  or logout takes effect within one short window even without revocation.
- **Refresh token** — longer-lived (days to weeks), sent *only* to a single
  `/refresh` endpoint, never to normal APIs. Its one job: exchange it for a
  fresh access token when the old one expires, without re-entering credentials.

The flow:

```
login    → server returns {access (10 min), refresh (14 days)}
API call → Authorization: Bearer <access>   (until it expires)
401 exp  → client POSTs refresh to /refresh → gets a NEW access (+ new refresh)
logout   → client discards both; server revokes the refresh (see below)
```

This shifts the security posture: access tokens stay stateless and cheap
(verify-only, no lookup), while the *refresh* token — rarely used, sent to one
endpoint — is where you can afford to add server-side state for revocation.

### The revocation problem and its mitigations

Here's the module-00 promise, confronted. A signed access token is valid until
`exp`, full stop — the server stored nothing to delete. So how do logout, "log
out all devices," and banning work? Three real mitigations, usually combined:

1. **Short access-token expiry (+ refresh rotation).** Make access tokens live
   5-15 minutes so the un-revocable window is small. On each refresh, issue a
   *new* refresh token and invalidate the old one — **refresh token
   rotation**. This also lets you detect theft: if an old (already-rotated)
   refresh token is presented, someone replayed it, so you revoke the whole
   token family (reuse detection). This is where the state lives — a small
   table of valid refresh tokens (or their `jti`s) per user.
2. **A denylist (revocation list).** Keep a server-side set of revoked token
   `jti`s (in Redis, with a TTL equal to the token's remaining lifetime) and
   check it on each request. This gives immediate revocation of specific access
   tokens — at the cost of a per-request lookup, i.e. you've traded away some of
   the "no lookup" statelessness. Because entries only need to live until the
   token would have expired anyway, the denylist stays small.
3. **A token version / `token_not_valid_before` per user.** Store a per-user
   counter or timestamp; embed it in the token; on "log out everywhere" or
   password change, bump it, invalidating every token issued before. One field
   per user, checked on verify.

The honest takeaway, and the reason module 00 made such a point of the
tradeoff: **pure statelessness and instant revocation are in tension.** You buy
revocation back by reintroducing a *little* state (a refresh-token table, a
denylist, a per-user version). The art is adding the minimum that meets your
product's needs — short expiry alone is often enough; add a denylist only if you
truly need to kill a specific live token *now*.

## Command reference

Using `pyjwt` (`pip install pyjwt`). `python-jose` is similar; the security
rules are identical.

| Pattern | Purpose | Snippet |
|---|---|---|
| `jwt.encode(claims, key, algorithm="HS256")` | mint a signed token | `jwt.encode({"sub":"42","exp":...}, SECRET, algorithm="HS256")` |
| `jwt.decode(tok, key, algorithms=["HS256"])` | verify + decode (pin algs!) | `jwt.decode(tok, SECRET, algorithms=["HS256"])` |
| `algorithms=["RS256"]` | pin to asymmetric verify (public key) | `jwt.decode(tok, PUBLIC_KEY, algorithms=["RS256"])` |
| `options={"require":["exp","sub"]}` | require critical claims present | `jwt.decode(..., options={"require":["exp"]})` |
| `audience=`, `issuer=` | enforce `aud`/`iss` on decode | `jwt.decode(..., audience="my-api", issuer="my-auth")` |
| `jwt.ExpiredSignatureError` | raised when `exp` has passed | catch → `401` |
| `jwt.InvalidTokenError` | base class for all verify failures | catch → `401` |
| `uuid4().hex` as `jti` | unique id for denylist/rotation | `claims["jti"] = uuid4().hex` |

A correct issue/verify pair with the safety checks that defeat `alg:none` and
confusion attacks:

```python
import jwt, time
from uuid import uuid4
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

app = FastAPI()
SECRET = "change-me-32-bytes-min"     # from env/secret manager in reality
ISSUER, AUDIENCE = "my-auth", "my-api"
ACCESS_TTL = 600                      # 10 minutes

def make_access(user_id: int, role: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": str(user_id), "role": role, "iss": ISSUER, "aud": AUDIENCE,
         "iat": now, "exp": now + ACCESS_TTL, "jti": uuid4().hex},
        SECRET, algorithm="HS256",
    )

bearer = HTTPBearer()

def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    try:
        claims = jwt.decode(
            cred.credentials, SECRET,
            algorithms=["HS256"],           # PIN the alg → defeats alg:none / confusion
            audience=AUDIENCE, issuer=ISSUER,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "invalid token")
    return {"user_id": int(claims["sub"]), "role": claims["role"], "jti": claims["jti"]}
```

## Hands-on exercises

Continue in `auth-track`. `pip install pyjwt`.

### 1. Mint and dissect a token by hand

Add `make_access` and mint a token for user 42. Print it, then split it on `.`
and base64url-decode the first two parts yourself:

```python
import base64, json
def b64url_decode(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
tok = make_access(42, "admin")
h, p, sig = tok.split(".")
print(json.loads(b64url_decode(h)))   # {"alg":"HS256","typ":"JWT"}
print(json.loads(b64url_decode(p)))   # {"sub":"42","role":"admin",...}
```

Expected: you read the header and full payload with **no key** — internalize
that the payload is public. Confirm you'd never put a secret there.

### 2. Verify, and watch tampering fail

Decode the token with `current_user`'s `jwt.decode` call — it succeeds. Now
tamper: take the payload, change `"role":"admin"`... actually change it to
`"user"`, re-encode it, splice it back with the *original* signature, and try
to decode. Expected: `InvalidTokenError` — the recomputed signature doesn't
match. You just proved the signature protects integrity.

### 3. Watch expiry work

Set `ACCESS_TTL = 2`, mint a token, `sleep(3)`, then decode it. Expected:
`ExpiredSignatureError`. Now decode the *same* expired token with
`options={"verify_exp": False}` and watch it "succeed" — demonstrating that
`exp` is only enforced because you check it. Put `ACCESS_TTL` back.

### 4. Reproduce the `alg: none` attack

Craft a malicious token by hand: header `{"alg":"none","typ":"JWT"}`, a payload
with `"role":"admin"`, and an empty signature (`header.payload.`). Try to
decode it two ways: once with `algorithms=["none"]` (or a permissive library
call) — it's accepted, a total bypass — and once with your safe
`algorithms=["HS256"]`. Expected: the safe call rejects it. Write one sentence
on why pinning the algorithm on *verify* is the fix.

### 5. HS256 vs RS256

Generate an RSA keypair (`openssl genrsa -out priv.pem 2048; openssl rsa -in
priv.pem -pubout -out pub.pem`), then mint with the private key and
`algorithm="RS256"`, verify with the public key and `algorithms=["RS256"]`.
Confirm you can verify with only the *public* key. Then articulate: which key
would you ship to 50 verifying microservices, and why can't they forge tokens
with it?

### 6. Build access + refresh with rotation

Add a `POST /login` returning `{access, refresh}` (refresh is a random
`token_urlsafe`, stored server-side in a `REFRESH: dict[str, dict]` keyed by
the token, holding `{user_id, jti}`), a `POST /refresh` that validates the
refresh token, **rotates** it (delete the old entry, issue a new refresh) and
returns a fresh access token, and a `POST /logout` that deletes the refresh
entry. Then:

```bash
# login → get access+refresh; use access until it 401s; refresh → new pair
```

Expected: after `/logout`, calling `/refresh` with the old refresh token
returns `401` — the refresh token is server-side state you *can* revoke, unlike
the access token.

### 7. Add a denylist for immediate access-token revocation

Add a `DENY: set[str]` of revoked `jti`s and check `claims["jti"] not in DENY`
inside `current_user`. Add `POST /revoke` that adds the current token's `jti`
to `DENY`. Revoke a still-valid access token and confirm the *next* request
with it returns `401` immediately — not after `exp`. Then state, in a comment,
what you gave up by adding this check (the per-request lookup / bit of state).

### 8. Detect refresh-token reuse

Extend exercise 6: when a refresh token is used, remember it was rotated out. If
a *rotated-out* refresh token is ever presented again, treat it as theft —
revoke the entire family for that user (drop all their refresh tokens) and force
re-login. Simulate by using one refresh token twice. Expected: the second use
not only fails but invalidates the legitimate client's session too, forcing a
fresh login — the standard reuse-detection response.

### 9. Diagnose and fix: "we can't log people out"

Support escalates: "A user's laptop was stolen. We hit our `/logout`, but their
API calls kept working for 20 more minutes. Sessions never did this." The
current design issues a single JWT with `exp` 20 minutes out and a `/logout`
that just tells the client to forget the token. Diagnose and give the concrete
fix.

<details>
<summary>Solution</summary>

The access token is a self-contained signed JWT with 20 minutes of validity;
the server stored nothing, so `/logout` telling the client to "forget it" does
nothing about a *copy* an attacker already holds — it stays valid until `exp`.
This is exactly module 00's revocation tradeoff. Concrete fixes, combinable:
(1) shorten access-token TTL to 5-10 min so the window is small, and move
longevity to a refresh token you *can* revoke server-side (exercise 6); (2) add
a `jti` **denylist** (exercise 7) so `/logout` can kill the specific live access
token immediately; (3) for "stolen device," support "log out everywhere" via a
per-user token version bumped on the event, invalidating all outstanding
tokens. The root cause: statelessness removed the thing sessions deleted, so
you must reintroduce a little state to get revocation back.

</details>

## Independent challenge

No code given. Build a complete two-token auth system for your `auth-track` API:
short-lived RS256 access tokens (reach back to **module 00**'s stateless model
and this module's asymmetric-signing rationale — mint with a private key so a
future fleet of services could verify with the public key), refresh tokens with
rotation *and* reuse-detection, a denylist for immediate access-token
revocation, and a per-user "logout everywhere" that invalidates all outstanding
tokens at once. Then write a short design note answering: for each of the three
revocation features, exactly how much and what kind of server-side state did you
have to add, and what did that cost you relative to the "pure stateless, zero
lookup" ideal? Tie every answer back to the stateful-vs-stateless tradeoff table
from module 00.

<details>
<summary>Hint</summary>

"Logout everywhere" is cheapest as a single per-user integer `token_version`
stored server-side and embedded as a claim; verification rejects any token whose
`token_version` claim is below the user's current value, so bumping one integer
invalidates every outstanding token with a single write and one comparison on
verify — far lighter than denylisting each token individually. The denylist
(per-token `jti`) is for killing *one specific* live token now; the
`token_version` is for killing *all* of a user's tokens at once. You'll want
both because they answer different questions.

</details>

## Common mistakes & troubleshooting

- **Treating the payload as secret.** It's base64, readable by anyone holding
  the token. Never put passwords/PII/secrets in claims — the signature is
  integrity, not confidentiality.
- **Calling `decode` without pinning `algorithms`.** Opens `alg:none` and
  HS256/RS256 confusion attacks. Always pass an explicit `algorithms=[...]`
  allowlist.
- **Not verifying `exp` / `aud` / `iss`.** A valid signature on an expired or
  wrong-audience token must still be rejected. Enforce them on decode.
- **Long-lived access tokens.** A stolen 24-hour access token is a 24-hour
  breach with no way to revoke. Keep access tokens minutes-long; put longevity
  in a revocable refresh token.
- **No refresh rotation / reuse detection.** A leaked refresh token that isn't
  rotated is a permanent backdoor. Rotate on every use and treat reuse of an
  old refresh as theft.
- **Sending the refresh token to normal API endpoints.** It should only ever go
  to `/refresh`. Sending it everywhere multiplies its leak surface for no
  reason.
- **Assuming JWTs give you free logout.** They don't — plan for the revocation
  machinery (short expiry, denylist, token version) from day one, not after the
  stolen-laptop ticket.
- **HS256 across trust boundaries.** Sharing the HMAC secret with every verifier
  means every verifier can forge. Use RS256 so verifiers get only the public
  key.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three parts of a JWT and what each contains. Which parts can anyone
   read without a key?
2. What exactly does the signature prove, and what does it *not* provide?
3. Explain HS256 vs RS256 and give one scenario that specifically requires
   RS256.
4. What are the `alg:none` and HS256/RS256-confusion attacks, and what single
   coding practice defeats both?
5. Why use short-lived access tokens plus a refresh token instead of one
   long-lived token?
6. Statelessness makes revocation hard. Name three mitigations and, for each,
   what state you reintroduce.
7. What is refresh-token rotation, and how does it enable theft detection?

<details>
<summary>Answers</summary>

1. Header (metadata, chiefly `alg`/`typ`), payload (claims like `sub`, `exp`,
   `aud`, plus custom ones like `role`), and signature (the integrity/
   authenticity proof). The header and payload are just base64url — anyone
   holding the token can read them without any key.
2. It proves integrity and authenticity: the claims haven't been altered and
   were minted by a holder of the signing key. It does *not* provide
   confidentiality — the payload is readable by anyone.
3. HS256 uses one shared secret to both sign and verify (so any verifier can
   also forge); RS256 uses a private key to sign and a public key to verify (so
   verifiers can't forge). RS256 is required when separate parties/services must
   verify tokens a central auth server issues — e.g. an OAuth2 provider
   publishing a public key to many microservices.
4. `alg:none` is an unsigned token a naive verifier accepts; confusion tricks an
   RS256 verifier into accepting an HS256 token signed with the public key as
   the HMAC secret. Both are defeated by pinning the accepted algorithm(s)
   explicitly on `decode` (`algorithms=["RS256"]`) instead of trusting the
   token's header.
5. A short access token limits the damage/validity window of a leak and lets
   bans/logout take effect quickly, while the refresh token (sent only to
   `/refresh`, revocable server-side) preserves a good UX without re-entering
   credentials. One long-lived token is a large, un-revocable breach if stolen.
6. (a) Short expiry + refresh rotation — reintroduces a refresh-token table/
   `jti` set; (b) denylist of revoked `jti`s — reintroduces a per-request lookup
   in a revocation store; (c) per-user token version/timestamp — reintroduces
   one field per user checked on verify.
7. On each use of a refresh token, the server issues a new one and invalidates
   the old. If an already-rotated (old) refresh token is presented again, that
   signals replay/theft, so the server revokes the whole token family and forces
   re-login.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-02 while attempting these — the point is to
find out what actually stuck.

1. A colleague says "sessions and JWTs are just two ways to do the same thing,
   pick either." Correct and sharpen this: name the one axis they differ on
   most fundamentally (module 00) and the concrete consequence that has for
   revocation in each (modules 01, 02).
2. For each, say whether it's *authentication* or *authorization* and which
   status code a failure returns: (a) no `Authorization` header at all; (b) a
   valid token whose `role` claim is `user` hitting an admin-only route; (c) an
   expired but correctly-signed JWT; (d) a session cookie whose server-side
   record was deleted by logout.
3. You base64-decode both a Basic-auth `Authorization` value (module 00) and a
   JWT payload (module 02) and read sensitive-looking data in each. Explain why
   this is a *fatal* problem for one of them and an *expected, acceptable* fact
   about the other.
4. Trace, component by component, an authenticated `GET /orders` request in (a)
   a Redis-backed session design and (b) a JWT design — naming exactly where the
   identity comes from and, for each, whether a store is touched.
5. Two "logout doesn't work" tickets: (a) a session app where logout clears the
   cookie but the user stays logged in; (b) a JWT app where logout tells the
   client to forget the token but stolen tokens keep working. Give the distinct
   root cause and fix for each.
6. Why does an in-memory session dict break under `--workers 4` (module 01) but
   a stateless JWT design keeps working across the same 4 workers with no shared
   store (modules 00, 02)? Name the property of each that explains the
   difference.
7. You must add "log out this user from all devices immediately." Describe how
   you'd implement it in the session design and in the JWT design, and say which
   is more natural and why.
8. A junior removes `algorithms=["HS256"]` from `jwt.decode` "to support more
   algorithms," and separately sets a session cookie without `HttpOnly` "so the
   frontend can read it." Name the specific attack each change enables and the
   one-line fix for each.

<details>
<summary>Answers</summary>

1. The fundamental axis is *where the identity lives*: server-side store
   (stateful/sessions) vs inside a signed token on the client
   (stateless/JWT). Consequence for revocation: sessions revoke instantly by
   deleting the server-side record; JWTs can't be un-issued, so a signed token
   stays valid until `exp` unless you add state back (denylist, short
   expiry+refresh, token version).
2. (a) authentication failure → `401`; (b) authorization failure → `403`; (c)
   authentication failure (expired) → `401`; (d) authentication failure (no
   valid session) → `401`. Only (b) is authorization.
3. For Basic auth the decoded value is the *actual password* resent every
   request — reading it is a real credential compromise, so it's fatal and why
   Basic needs TLS and is discouraged. For a JWT the payload is *designed* to be
   readable (signed, not encrypted); reading claims is expected, which is
   exactly why you never put secrets in it — nothing sensitive should be there
   to leak.
4. (a) Session: request carries an opaque cookie ID; server looks it up in Redis
   (a store *is* touched) and gets `user_id`. (b) JWT: request carries the
   Bearer token; server verifies the signature and reads `sub` from the token
   itself — no store touched (unless a denylist is checked). Identity comes from
   the store in (a) and from the token's claims in (b).
5. (a) Root cause: the server-side record still exists, so the deleted cookie
   isn't the source of truth; fix: delete the server-side session record, not
   just the cookie. (b) Root cause: the JWT is self-contained and stored
   nowhere, so "forget it" can't touch a stolen copy; fix: short expiry +
   revocable refresh token and/or a `jti` denylist / token-version bump.
6. The session dict is *per-process* mutable state, so a session created in one
   worker is invisible to the others — it needs a shared store. A JWT design
   holds no per-process state: any worker can verify any token with the shared
   *key* alone (a constant, not mutable state), so all 4 workers behave
   identically. Statelessness is what makes it worker-count-agnostic.
7. Sessions: delete all of that user's session records (e.g. drop every entry in
   their `user:id:sessions` set) — immediate, natural. JWT: bump a per-user
   `token_version` (or add outstanding `jti`s to a denylist) so every existing
   token fails verification. Sessions are more natural because the server
   already holds every session as deletable state; JWT requires deliberately
   adding that state.
8. Removing the `algorithms` allowlist enables the `alg:none` (and HS256/RS256
   confusion) forgery bypass; fix: pin `algorithms=["HS256"]` (or your exact
   list). Dropping `HttpOnly` lets any XSS read and exfiltrate the session
   cookie; fix: set the cookie `HttpOnly` (and let the frontend call an endpoint
   for what it needs instead of reading the cookie).

</details>

## Next

[03-oauth2-and-oidc](../03-oauth2-and-oidc/README.md) — you can now issue and
verify tokens yourself; next you'll see the protocol the whole industry uses to
*delegate* that — OAuth2's grant types (authorization code, PKCE, client
credentials), what OpenID Connect adds (identity and ID tokens), and a
full "Login with Google" flow end to end, all built on the JWT you just
dissected.
