# Module 04: API Keys and Service-to-Service Auth

## Why this matters

Not every caller is a human in a browser. A huge fraction of real traffic is
machines calling machines: your billing service calling your notification
service, a customer's backend calling your public API, a cron job hitting an
internal endpoint, a webhook provider posting events to you. None of these have
a password to type, a consent screen to click, or a browser to redirect. They
need **machine-to-machine (M2M) authentication** — and the tools are different
from the human-facing ones you've built so far.

The workhorse is the **API key**: a long random string a client sends on every
request. It's simple, ubiquitous, and — because it's simple — easy to get
dangerously wrong (storing keys in plaintext, putting them in query strings,
never rotating them). This module covers how API keys actually work, when a
key is the right tool versus when you should reach for OAuth2 Client
Credentials (module 03) or a signed JWT (module 02), and the certificate-based
alternative — **mutual TLS** — that some high-security environments use instead.
Getting M2M auth right is what stops your "internal-only" service from being
wide open the moment someone finds its URL, and it's a core piece of your
capstone's API surface.

## Concepts

### What an API key is (and isn't)

An API key is a **long, high-entropy random string** issued to a client, which
the client presents on every request to identify itself. That's the whole idea —
it's a bearer credential, like a session ID (module 01), but for a *machine*
client and typically long-lived. It's usually sent in a header:

```
Authorization: Bearer sk_live_9f3a1c...        (or)
X-API-Key: sk_live_9f3a1c...
```

Prefer a header over a query string (`?api_key=...`) because query strings land
in server logs, browser history, proxy logs, and `Referer` headers — leaking the
key. Use `Authorization` or a dedicated `X-API-Key` header.

Two things an API key *is not*:

- **It is not a user login.** An API key identifies an *application/client or an
  account*, not "which human is at the keyboard." It answers "which integration
  is calling," not "who is this person." (You can associate a key with an
  account and derive coarse permissions, but it isn't user authentication.)
- **It is not a secret the way a password is presented.** Like a session ID,
  whoever holds it *is* the client — there's no second factor, no proof of
  possession beyond holding the string. So key hygiene (storage, transport,
  rotation, scoping) is the entire security story.

### How to handle API keys correctly

The key is a bearer secret, so treat it with the same care as a password —
crucially, **on the server side, store only a hash of it, never the plaintext**:

- **Generate** with a CSPRNG: `secrets.token_urlsafe(32)` (256 bits). Add a
  recognizable prefix (`sk_live_`, `sk_test_`) so keys are identifiable in logs/
  code and secret-scanners can catch leaks — but the prefix is not the secret.
- **Store hashed.** When you issue a key, show the plaintext to the user *once*,
  then store only `sha256(key)` (or an HMAC of it). On each request, hash the
  presented key and look up the hash. This way a database leak doesn't hand
  attackers working keys — same reasoning as password hashing (module 05),
  though because API keys are already high-entropy random strings, a fast hash
  like SHA-256 is acceptable here (unlike human passwords, which need bcrypt/
  argon2 — module 05 explains exactly why the two cases differ).
- **Look up in constant time / avoid leaking which part was wrong.** Compare
  hashes with `secrets.compare_digest` (module 07 on timing attacks).
- **Scope and attribute each key.** Store per-key metadata: which account,
  which permissions/scopes, rate limits, an `expires_at`, and `last_used_at`.
  A key should grant the *least* privilege its integration needs.
- **Support rotation and revocation.** Because you stored the key server-side
  (as a hash), you can revoke it instantly (delete the row) — API keys are
  *stateful* (module 00), so revocation is easy, the mirror image of the JWT
  problem. Allow multiple active keys per account so a client can rotate
  without downtime (create new, migrate, delete old).

```python
import hashlib, secrets
from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader

app = FastAPI()
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# server stores ONLY hashes → a DB leak doesn't expose usable keys
KEYS: dict[str, dict] = {}   # sha256(key) -> {account, scopes, expires_at, ...}

def issue_key(account: str, scopes: list[str]) -> str:
    raw = "sk_live_" + secrets.token_urlsafe(32)     # show ONCE, never stored raw
    KEYS[hashlib.sha256(raw.encode()).hexdigest()] = {"account": account, "scopes": scopes}
    return raw

def require_api_key(presented: str = Security(api_key_header)) -> dict:
    if not presented:
        raise HTTPException(401, "missing API key")
    record = KEYS.get(hashlib.sha256(presented.encode()).hexdigest())  # hash-then-lookup
    if record is None:
        raise HTTPException(401, "invalid API key")
    return record          # the client identity + its scopes

@app.get("/v1/data")
def data(client=Depends(require_api_key)):
    return {"account": client["account"]}
```

### When to use API keys vs OAuth2/JWT

All three are M2M-capable; they differ in what they buy you:

| | API key | OAuth2 Client Credentials (module 03) | Signed JWT (module 02) |
|---|---|---|---|
| What it is | opaque long-lived secret | short-lived token from a token endpoint | self-describing signed token |
| State | stateful (server stores/looks up hash) | token is often a JWT (stateless verify) | stateless verify |
| Revocation | instant (delete the record) | wait for expiry, or add state | wait for expiry, or add state |
| Scoping | per-key metadata you define | standard `scope` claims | claims you embed |
| Rotation | issue/delete keys | re-request from token endpoint | re-mint |
| Best for | simple external integrations, "give me a key" DX | many services in an org with a central auth server | internal calls where verify-without-lookup matters |

Rules of thumb:

- **API key** when you want dead-simple developer experience ("here's your key,
  put it in a header"), long-lived credentials, and easy per-key revocation —
  the classic *public API for third parties*. Stripe, SendGrid, etc. work this
  way.
- **OAuth2 Client Credentials** when you have *many* services and a central
  authorization server, want standardized short-lived tokens and scopes, and
  don't want long-lived secrets floating around. The enterprise/microservices
  default.
- **Raw signed JWT** (an internal one your own auth mints) when services need to
  verify a caller *without a lookup* on every request and you control both ends
  — e.g. a gateway mints a signed JWT and downstream services verify it with a
  public key (module 02's RS256). Fast, stateless, but revocation is the JWT
  problem again.

A common hybrid: clients authenticate with a long-lived **API key** to a token
endpoint and receive a short-lived **JWT** they use for the actual calls — you
get simple onboarding *and* short-lived, verifiable, scoped access.

### Service-to-service patterns inside a system

Between *your own* services (behind a gateway, in a cluster), several patterns
appear, often layered:

- **Shared secret / API key per service.** Each service holds a key identifying
  it; simple, but many secrets to manage and rotate.
- **Central auth issues short-lived JWTs.** A service gets a token (Client
  Credentials) and presents it to peers, who verify the signature (module 02).
  Scales well; the identity of the *calling service* is in the token's `sub`.
- **The gateway authenticates once, then forwards identity.** The edge/gateway
  verifies the external caller and injects a trusted internal header or a signed
  internal token; downstream services trust the gateway. Requires that
  downstream services are *not* reachable directly from outside (network
  isolation) — otherwise a caller could forge the "trusted" header.
- **Mutual TLS (below)** — the transport itself proves both identities.

A recurring failure mode: treating the internal network as automatically
trusted ("it's behind the firewall, so no auth needed"). Modern practice is
**zero-trust** — authenticate service-to-service calls even internally, because a
single compromised internal host otherwise reaches everything.

### Mutual TLS (mTLS) as an alternative

Ordinary HTTPS is *one-way* TLS: the **server** presents a certificate the
client verifies (so the client knows it's really talking to `api.example.com`),
but the server learns nothing cryptographic about the client. **Mutual TLS**
makes it two-way: the **client also presents a certificate**, and the server
verifies it against a trusted Certificate Authority. Now the TLS handshake
itself authenticates *both* ends — before a single byte of HTTP is exchanged.

Why this is attractive for M2M:

- The client's identity (its certificate's subject) is proven cryptographically
  by possession of the private key — **no bearer secret to leak** in a header,
  no token to steal and replay, because proving identity requires the private
  key, which never goes on the wire.
- It's enforced at the transport layer, so even a service that forgets an
  application-level check is still protected.
- It's the backbone of **service mesh** systems (Istio, Linkerd) that give every
  pod a rotating certificate and require mTLS for all inter-service traffic —
  zero-trust by default.

The costs are real: you need a **PKI** (certificate authority, issuance,
rotation, revocation via CRL/OCSP) — operationally heavy, which is why meshes
automate it — and it authenticates *services/hosts*, not end users, so it
complements rather than replaces user auth. Use mTLS for high-assurance
service-to-service links (finance, healthcare, internal zero-trust meshes);
use API keys/OAuth2 for the far more common "give an external developer
programmatic access" case.

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| `secrets.token_urlsafe(32)` | generate a 256-bit API key | `"sk_live_" + secrets.token_urlsafe(32)` |
| `hashlib.sha256(k.encode()).hexdigest()` | hash key for storage/lookup | store the hash, not the key |
| `APIKeyHeader(name="X-API-Key")` | FastAPI extractor for a key header | `Security(api_key_header)` |
| `secrets.compare_digest(a, b)` | constant-time compare (module 07) | avoid timing leaks |
| `grant_type=client_credentials` | OAuth2 M2M token request (module 03) | no user, no redirect |
| `uvicorn --ssl-certfile --ssl-keyfile` | serve TLS (server side) | one-way TLS |
| `ssl.create_default_context(...); ctx.verify_mode=CERT_REQUIRED; ctx.load_verify_locations(ca)` | require + verify client cert (mTLS) | server verifies client cert |
| `httpx.Client(cert=(client_crt, client_key))` | client presents its cert (mTLS) | client side of mTLS |

## Hands-on exercises

Continue in `auth-track`.

### 1. Issue and use an API key (stored hashed)

Add `issue_key` / `require_api_key` from Concepts and a protected `GET
/v1/data`. Issue a key, call the endpoint with it, then call with a wrong key
and with no key:

```bash
curl -H "X-API-Key: <the key>"  localhost:8000/v1/data     # 200
curl -H "X-API-Key: wrong"      localhost:8000/v1/data     # 401
curl                            localhost:8000/v1/data     # 401
```

Then inspect your `KEYS` store and confirm the **plaintext key is nowhere in
it** — only a SHA-256 hash. That's the property that makes a DB leak survivable.

### 2. Prove the query-string mistake leaks keys

Temporarily accept the key from `request.query_params["api_key"]` and call
`GET /v1/data?api_key=<key>`. Look at your `fastapi dev` server log line for
that request. Expected: the key is right there in the access log. Revert to the
header. Write one sentence on why headers are safer than query strings for
secrets.

### 3. Scope a key and enforce it

Give keys a `scopes` list (`["read:data"]`) and add a `POST /v1/data` requiring
`write:data`. Issue one read-only key and one read-write key; confirm the
read-only key gets `403` on the write endpoint but `200` on read. Expected:
per-key least privilege — the key identifies the client *and* bounds what it may
do (a preview of module 06's authorization).

### 4. Rotate without downtime

Support multiple active keys per account. Issue key A, start using it, issue key
B for the same account, confirm *both* work, then revoke key A (delete its hash)
and confirm A now `401`s while B keeps working. Expected: zero-downtime rotation
— and note revocation was *instant* because API keys are stateful (contrast the
JWT revocation pain of module 02).

### 5. Client Credentials vs API key

Stand up a `POST /token` that accepts a valid API key and returns a short-lived
JWT (module 02) scoped from the key's metadata; protect `GET /v1/data` to accept
*either* a raw API key *or* a Bearer JWT. Use both paths. Expected: you've built
the common hybrid — long-lived key for onboarding, short-lived JWT for calls —
and can articulate the tradeoff (simple DX + short-lived verifiable access).

### 6. Set up mutual TLS locally

Generate a local CA, a server cert, and a client cert (with `openssl`), serve
FastAPI with TLS requiring a client certificate, and call it with `httpx`
presenting the client cert:

```bash
# create CA, server cert, client cert (all self-signed for the exercise)
# run uvicorn with --ssl-certfile/--ssl-keyfile + an SSL context requiring client certs
```

```python
import httpx
r = httpx.get("https://localhost:8443/v1/data",
              cert=("client.crt", "client.key"), verify="ca.crt")
```

Then call *without* the client cert and watch the TLS handshake be rejected
before any HTTP runs. Expected: the connection fails at the transport layer with
no client cert — proving mTLS authenticates the client before HTTP even starts,
with no bearer secret on the wire.

### 7. Choose the mechanism (on paper)

For each, pick API key / OAuth2 Client Credentials / mTLS and justify in a
sentence: (a) a public REST API you sell to thousands of external developers;
(b) 30 internal microservices in a zero-trust cluster; (c) a partner bank's
backend integrating with yours under a compliance mandate; (d) a hobbyist's
weekend script hitting your API. Keep your answers.

### 8. Diagnose and fix: the leaked-key incident

Postmortem: "An engineer pasted a production API key into a public GitHub gist.
We found out three weeks later. Worse, when we checked the database, all API
keys are stored in a `keys` table in plaintext, keys never expire, and the same
key is shared by all 12 of our microservices." Identify every problem and the
fix for each.

<details>
<summary>Solution</summary>

Problems and fixes: (1) **Plaintext storage** — a DB leak exposes every working
key; store only `sha256`/HMAC of each key and compare hashes. (2) **No
expiry/rotation** — a leaked key is valid forever; add `expires_at`, support
multiple active keys, and rotate regularly. (3) **One shared key across 12
services** — you can't revoke or attribute per service, and one leak burns all
of them; issue a distinct, least-privilege key per service so you can revoke and
audit individually. (4) **Detection took 3 weeks** — add a recognizable prefix
(`sk_live_`) so secret-scanning tools catch pushes, log `last_used_at`, and
alert on anomalous use. Immediate response to *this* incident: revoke the leaked
key instantly (delete its hash — trivial because keys are stateful, module 00/
02), issue a fresh scoped one, and rotate the shared key out of all services.

</details>

## Independent challenge

No code given. Build a complete API-key subsystem for your `auth-track` service
suitable for external developers: an authenticated `POST /keys` that issues a
new key (returns the plaintext exactly once, stores only a hash), `GET /keys`
listing a user's keys by prefix + `last_used_at` (never the secret),
`DELETE /keys/{id}` for instant revocation, per-key scopes enforced on protected
endpoints, and an `expires_at` with automatic rejection of expired keys. Then
add the hybrid from exercise 5: a `POST /token` that trades a valid API key for
a short-lived **JWT** (reach back to **module 02**), and make your protected
endpoints accept either. Finally, write a design note placing your subsystem on
the **stateful-vs-stateless** map from **module 00**: which parts are stateful,
where revocation is instant vs delayed, and why an API key can be revoked
immediately but the JWT it mints cannot.

<details>
<summary>Hint</summary>

The "show the plaintext once" rule is the crux of good key DX and security:
after `POST /keys` returns the raw key, your server can never display it again
because it only kept the hash — so your `GET /keys` shows a non-secret prefix
(the `sk_live_` plus a few chars) purely for human recognition. The stateful/
stateless split writes itself: the *key* is stateful (you look up its hash, so
`DELETE` kills it instantly), but the short-lived *JWT* it mints is stateless
(verify-only, no lookup), so revoking the key doesn't retroactively kill JWTs
already issued from it — they die at `exp`. That's the exact module-02 tradeoff
reappearing one layer up.

</details>

## Common mistakes & troubleshooting

- **Storing API keys in plaintext.** A DB leak then hands out working keys.
  Store only a hash (SHA-256/HMAC is fine for high-entropy keys) and compare
  hashes.
- **Keys in query strings.** They leak into logs, history, and `Referer`. Send
  keys in `Authorization`/`X-API-Key` headers.
- **One shared, never-expiring key.** Can't attribute, scope, or revoke
  granularly, and one leak compromises everything. Issue per-client,
  least-privilege, expiring keys and support rotation.
- **Treating an API key as user authentication.** It identifies a client/
  account, not a human. Don't derive per-user identity/permissions from a key
  alone.
- **Trusting the internal network.** "Behind the firewall" is not
  authentication. Authenticate service-to-service calls even internally
  (zero-trust); a forged "trusted" header from a reachable service is a real
  breach path.
- **Non-constant-time key comparison.** Use `secrets.compare_digest` (module 07)
  to avoid timing leaks on the lookup.
- **Reaching for mTLS when an API key suffices (or vice versa).** mTLS is
  powerful but needs a PKI and authenticates services, not users; don't impose
  it for a simple external developer API, and don't use a bare shared key for a
  high-assurance zero-trust link.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does an API key identify, and how does that differ from a user login?
2. Why store only a hash of an API key server-side, and why is a fast hash
   (SHA-256) acceptable for keys but not for user passwords?
3. Give two reasons to send a key in a header rather than a query string.
4. When would you choose an API key over OAuth2 Client Credentials, and vice
   versa?
5. Why can an API key be revoked instantly while a JWT it mints cannot?
6. What does mutual TLS add over ordinary one-way HTTPS, and what does it prove?
7. What is the "trust the internal network" antipattern, and what's the modern
   alternative?

<details>
<summary>Answers</summary>

1. An API key identifies a *client/application or account* — "which integration
   is calling" — not which human is at the keyboard. A user login authenticates
   a person; a key authenticates a machine caller.
2. So a database leak doesn't expose usable keys — you compare hashes of the
   presented key. A fast hash is fine for API keys because they're already
   long, high-entropy random strings (infeasible to brute-force), whereas human
   passwords are low-entropy and guessable, so they need a deliberately slow
   hash (bcrypt/argon2, module 05) to resist offline cracking.
3. Query strings leak into server access logs, browser history, proxy logs, and
   the `Referer` header; headers avoid all of these. (Any two.)
4. API key: simple developer experience, long-lived credential, easy per-key
   revocation — ideal for a public API sold to external developers. OAuth2
   Client Credentials: many services with a central auth server, standardized
   short-lived scoped tokens, and no long-lived secrets lying around — the
   enterprise/microservices default.
5. The API key is stateful — the server stores its hash, so deleting that record
   invalidates it on the next request. The JWT it mints is stateless — the
   server stored nothing, so it stays valid until `exp` regardless of the key's
   fate.
6. One-way HTTPS authenticates only the server to the client; mTLS also has the
   *client* present a certificate the server verifies, so the TLS handshake
   authenticates both ends cryptographically — proving the client's identity via
   possession of its private key, with no bearer secret on the wire.
7. Assuming calls from inside the network need no authentication ("it's behind
   the firewall"). The modern alternative is zero-trust: authenticate every
   service-to-service call even internally, because one compromised internal
   host otherwise reaches everything.

</details>

## Next

[05-mfa-and-password-security](../05-mfa-and-password-security/README.md) —
you've covered how humans and machines authenticate; now go under the hood of
the *human* credential itself: multi-factor authentication (TOTP, WebAuthn/
passkeys) and — critically — how to store passwords so a database breach doesn't
hand attackers everyone's login: salting, and why bcrypt/argon2 exist while
plain or unsalted hashing fails.
