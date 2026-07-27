# Module 03: OAuth2 and OIDC

## Why this matters

You can now issue and verify tokens yourself (module 02). But you rarely want to
hold everyone's password. "Log in with Google," "connect your GitHub,"
"authorize this app to read your calendar" — these are all cases where a user
wants to prove who they are, or grant your app limited access to *their* data on
*another* service, **without handing your app their password.** OAuth2 is the
industry-standard protocol for exactly that delegation, and OpenID Connect
(OIDC) is the thin layer on top that turns "this app may access some resource"
into "and here is *who* the user is."

The reason this module matters beyond "so you can add a Google login button" is
that OAuth2 is *everywhere* and is *constantly implemented wrong*. Developers
pick the wrong grant type, skip PKCE, misuse the `state` parameter and open
themselves to CSRF, or conflate the access token (authorization) with the ID
token (authentication) — a mistake that leads to real account-takeover bugs.
This module gives you the precise mental model: the four roles, the grant types
and when each applies, what OIDC adds, and a step-by-step trace of a real login
flow so the redirects and tokens stop being magic.

## Concepts

### The four roles, and the problem OAuth2 solves

OAuth2 is a **delegated authorization** framework. The scenario it's built for:
a user wants to let App A access some of their data held by Service B, without
giving App A their Service B password. Four roles:

- **Resource Owner** — the user who owns the data (you).
- **Client** — the application that wants access (the "third-party app," e.g.
  a photo-printing site that wants your Google Photos).
- **Authorization Server** — issues tokens after authenticating the user and
  getting their consent (Google's account/OAuth server).
- **Resource Server** — the API holding the protected data, which accepts the
  token (the Google Photos API).

The core insight: instead of the user giving the client their password, the
client redirects the user *to the authorization server*, the user logs in and
consents *there*, and the client receives a **token** representing that limited,
consented grant. The client never sees the password, the grant is **scoped**
(read photos, not delete account), and the user can revoke it later at the
authorization server. Passwords never leave the service that owns them.

**`scope`** is how the grant is limited: a space-separated list of permissions
the client requests (`read:photos profile email`), which the user sees on the
consent screen and approves. The issued access token carries only the approved
scopes, and the resource server enforces them.

### OAuth2 is about authorization, not (by itself) identity

This is the most important conceptual correction in the module. Plain OAuth2
gives the client an **access token** — a key that opens certain doors at the
resource server. It does **not**, by design, tell the client *who the user is*.
An access token is like a hotel keycard: it opens room 214, but it isn't an ID
card and doesn't reliably say your name. People who tried to use OAuth2 access
tokens *as* a login mechanism ("if I got a token, the user must be who they
claim") created security holes, because an access token can be obtained/replayed
in ways that don't prove the bearer's identity to *your* app. That gap is
exactly what OIDC fills — hold that thought.

### The grant types (flows)

A "grant type" is a recipe for how the client obtains a token. Pick the one that
matches your client's nature:

- **Authorization Code** — the main, most secure flow, for apps that have a
  server-side backend. The client gets a short-lived **authorization code** via
  a browser redirect, then exchanges that code for tokens in a **back-channel**
  (server-to-server) call using its **client secret**. Why the two steps? The
  code travels through the user's browser (front-channel, exposable in URLs/
  history), but it's useless alone — turning it into tokens requires the client
  secret, which never leaves the server. This is the flow for a normal web app
  with a backend.
- **Authorization Code + PKCE** (Proof Key for Code Exchange) — the same flow
  hardened for clients that **can't keep a secret**: single-page apps (SPAs) and
  mobile apps, where any embedded "client secret" could be extracted. Instead of
  a static secret, the client generates a random **code verifier** per login,
  sends its hash (**code challenge**) up front, and proves possession of the
  verifier when exchanging the code. This stops an attacker who intercepts the
  authorization code from redeeming it (they don't have the verifier). PKCE is
  now recommended for **all** clients, including confidential ones — it's the
  modern default.
- **Client Credentials** — no user at all. The client authenticates *as itself*
  (client id + secret) to get a token for **machine-to-machine** access to its
  own resources. This is service-to-service auth (module 04) — there's no
  resource owner, no redirect, no consent screen; the client *is* the subject.
- **Legacy/discouraged:** *Implicit* (tokens returned directly in the redirect;
  deprecated — superseded by code+PKCE) and *Resource Owner Password
  Credentials* (client collects the actual password; defeats the whole point,
  only for trusted first-party migration cases). Know they exist so you can
  recognize and avoid them.

Decision rule: **web app with backend → Authorization Code (+PKCE). SPA/mobile
→ Authorization Code + PKCE. Service-to-service → Client Credentials.** Never
Implicit; avoid Password grant.

```
  Authorization Code + PKCE
                         FRONT-CHANNEL (browser, exposable)
  client ──challenge=hash(verifier)──► authz server ──login+consent──┐
     ▲                                                                  │
     └───────────── redirect ?code=… ──────────────────────────────────┘
                         BACK-CHANNEL (server-to-server, private)
  client ──code + verifier(+secret)──► /token ──► {access, id_token}
     an intercepted code alone is useless: no verifier → no tokens
```

### The `state` parameter and CSRF

The authorization-code flow bounces the user out to the authorization server and
back to your **redirect URI** with a code. Without protection, an attacker could
trick a victim's browser into completing *the attacker's* half-finished flow,
linking the attacker's account to the victim (login CSRF). The **`state`**
parameter prevents this: the client generates a random, unguessable `state`
before redirecting, stores it (in the user's session), includes it in the
authorization request, and the authorization server echoes it back on the
redirect. The client **must verify** the returned `state` matches the one it
stored, and reject the callback otherwise. `state` is mandatory in practice —
treat a flow without `state` verification as broken.

### What OpenID Connect (OIDC) adds

OIDC is a thin **identity** layer built *on top of* OAuth2. Where OAuth2 gives
you an access token (authorization), OIDC adds:

- **The `openid` scope** — requesting it signals "I also want to know who this
  user is," which turns the flow into an OIDC flow.
- **The ID Token** — a **JWT** (module 02!) whose claims describe the
  authenticated user: `sub` (a stable unique user id at this provider), `iss`
  (which provider issued it), `aud` (which client it's for), `exp`, and often
  `email`, `name`, `picture`. **This** is the thing you use to log the user in,
  because — unlike an access token — it's a signed assertion *about the user's
  identity*, issued *to your specific client* (`aud`), that you verify.
- **The UserInfo endpoint** — an API the client can call with the access token
  to fetch additional profile claims.
- **Discovery / JWKS** — providers publish their config at
  `/.well-known/openid-configuration` and their public keys at a **JWKS**
  endpoint, so your client can fetch the RS256 public keys (module 02) to verify
  ID token signatures without pre-sharing secrets.

The one-line distinction to burn in: **access token = what you can do (OAuth2,
for the resource server); ID token = who you are (OIDC, for the client).** Use
the ID token to establish the user's identity in *your* app; use the access
token to call *the provider's* APIs. Don't authenticate with the access token.

```
  ┌─ OIDC ──────────────────────────────┐  scope: openid
  │  ID TOKEN (JWT) → for the CLIENT       │  aud = your client_id
  │  "who you are": sub, email, iss, exp    │  → log the user in
  ├─ OAuth2 ────────────────────────────┤
  │  ACCESS TOKEN → for the RESOURCE server │  scope: read:photos …
  │  "what you can do"                       │  → call provider APIs
  └────────────────────────────────────┘
```

### "Login with Google," end to end

Putting it together — Authorization Code + PKCE with OIDC, the modern standard
login flow. Your app is the client; Google is the authorization server + OIDC
provider; a user wants to log into your app with their Google account:

```
1. User clicks "Log in with Google" on your app.
2. Your app generates: a random `state`, a PKCE `code_verifier`, and its
   SHA256 `code_challenge`. It stores state+verifier in the user's session.
3. Your app redirects the browser to Google's /authorize with:
     response_type=code
     client_id=<your app's id>
     redirect_uri=https://yourapp/callback
     scope=openid email profile        ← "openid" makes it OIDC
     state=<random>
     code_challenge=<hash>  code_challenge_method=S256
4. Google authenticates the user (their password, their MFA — never your
   concern) and shows a consent screen for the requested scopes.
5. On consent, Google redirects the browser back to your redirect_uri with:
     ?code=<authorization code>&state=<the same state>
6. Your app VERIFIES `state` matches what it stored (CSRF defense). Then, in
   a BACK-CHANNEL server-to-server POST to Google's /token, it exchanges:
     code + client_id + client_secret(if confidential) + code_verifier
   → Google returns { id_token (JWT), access_token, refresh_token? }.
7. Your app VERIFIES the id_token: signature via Google's JWKS public key
   (RS256), plus iss=Google, aud=your client_id, exp not passed.
8. Your app reads `sub`/`email`/`name` from the id_token → this IS the
   user's identity. It creates/looks up a local user and starts YOUR OWN
   session or issues YOUR OWN JWT (modules 01/02). Login complete.
```

Notice how this reuses everything so far: the ID token is a JWT you verify with
RS256 and a public key (module 02); after login you fall back to *your own*
session or token (modules 01/02) rather than reusing Google's tokens for your
app's auth. Google handles the password and MFA; you handle identity mapping and
your own session lifecycle.

## Command reference

Using `authlib` (`pip install authlib httpx`), the standard FastAPI-friendly
OAuth2/OIDC client. You rarely hand-roll the protocol; you use a library and
must know what it's doing.

| Concept | Where | Snippet / value |
|---|---|---|
| Discovery document | provider | `GET https://accounts.google.com/.well-known/openid-configuration` |
| Register a client | `authlib` | `oauth.register(name="google", server_metadata_url=..., client_kwargs={"scope":"openid email profile"})` |
| Start the flow | client | `await oauth.google.authorize_redirect(request, redirect_uri)` |
| Handle callback | client | `token = await oauth.google.authorize_access_token(request)` |
| ID token claims | client | `user = token["userinfo"]` (authlib verifies the id_token for you) |
| `scope` (OIDC) | request | `openid email profile` |
| `response_type=code` | authorize | authorization-code flow |
| `code_challenge_method=S256` | authorize | PKCE |
| `state` | authorize/callback | random; **must** be verified on callback |
| JWKS endpoint | provider | RS256 public keys to verify the id_token |

A minimal, correct "Login with Google" in FastAPI (`authlib` handles PKCE,
`state`, and id_token verification for you — but you must know it's doing them):

```python
from authlib.integrations.starlette_client import OAuth
from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="...")   # authlib stores state here

oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id="...", client_secret="...",
    client_kwargs={"scope": "openid email profile"},       # openid → OIDC
)

@app.get("/login/google")
async def login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)  # sets state+PKCE

@app.get("/auth/callback", name="auth_callback")
async def auth_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)  # verifies state + id_token
    userinfo = token["userinfo"]           # verified id_token claims
    sub, email = userinfo["sub"], userinfo.get("email")
    # map to a local user, then start YOUR OWN session/JWT (modules 01/02):
    request.session["user_id"] = get_or_create_local_user(sub, email)
    return {"logged_in_as": email}
```

## Hands-on exercises

Continue in `auth-track`. `pip install authlib httpx`. You'll need a free OAuth
client from a provider (Google Cloud Console → OAuth consent + credentials, or
GitHub → Developer settings → OAuth Apps) with redirect URI
`http://localhost:8000/auth/callback`.

### 1. Read a real discovery document

```bash
curl -s https://accounts.google.com/.well-known/openid-configuration | python -m json.tool
```

Find and note: `authorization_endpoint`, `token_endpoint`, `jwks_uri`,
`scopes_supported`, `id_token_signing_alg_values_supported`. Expected: you can
point at exactly where each step of the flow happens and confirm ID tokens are
RS256-signed — connecting back to module 02.

### 2. Implement "Login with Google/GitHub"

Wire up the `authlib` code above with your registered client. Log in through the
browser and confirm you land back on `/auth/callback` authenticated, printing
the user's email. Expected: you never typed a Google password into *your* app —
you typed it into Google — and you came back with a verified identity.

### 3. Watch the redirects on the wire

Repeat the login with the browser devtools Network tab open (preserve log).
Identify each hop: your `/login/google` → Google `/authorize` (note the
`state`, `scope=openid...`, `code_challenge`, `code_challenge_method=S256` query
params) → Google login/consent → redirect back to `/auth/callback?code=...&
state=...`. Expected: you can literally read `state`, the `openid` scope, and
the PKCE challenge in the URLs — the diagram made real.

### 4. Inspect the ID token as a JWT

Temporarily log `token["id_token"]` (the raw JWT string) and paste its payload
into the by-hand decoder from module 02 exercise 1 (base64url-decode the middle
part). Find `iss`, `aud`, `sub`, `email`, `exp`. Expected: an OIDC ID token *is*
just a JWT (module 02) — you already know how to read and, in principle, verify
it. Confirm `aud` equals *your* client id.

### 5. Prove `state` blocks CSRF

Complete a login normally, then hit `/auth/callback?code=fake&state=wrong`
directly. Expected: the flow is rejected because the `state` doesn't match what
was stored in your session. Write one sentence on what attack this prevents
(login CSRF — an attacker completing their flow in your browser).

### 6. Client Credentials (no user)

Simulate machine-to-machine: register a second "service" client and do a
Client Credentials grant against a token endpoint (your provider's, or a local
mock), obtaining a token with **no user/`sub`** — the client itself is the
subject. Compare the request to the auth-code flow: no redirect, no consent, no
ID token.

```bash
curl -X POST https://<provider>/token \
  -d grant_type=client_credentials -d client_id=... -d client_secret=... -d scope=read:things
```

Expected: you get an access token directly, in one back-channel call, with no
browser involved — the shape of service-to-service auth you'll formalize in
module 04.

### 7. Map identity into your own session

After a successful Google login, implement `get_or_create_local_user(sub,
email)` backed by a dict (or your DB later), then start your *own* session
(module 01) or issue your *own* JWT (module 02). Log in, then hit a protected
endpoint using *your* session/token — not Google's. Expected: after the OIDC
handshake, your app runs on its own auth, using Google only to establish
identity. Articulate why you don't just reuse Google's access token as your
app's session.

### 8. Diagnose and fix: "we log the user in with the access token"

A teammate's login works like this: after the callback, they call Google's
UserInfo endpoint with the **access token**, read the returned `email`, and log
the user in as that email — ignoring the ID token entirely. It "works." Explain
what's conceptually wrong and what the safer design is.

<details>
<summary>Solution</summary>

They're using an *authorization* artifact (the access token) to make an
*authentication* decision, and trusting a UserInfo response without binding it
to *their* client. The access token says "the bearer may call these APIs," not
"the person in front of my app is this user" — an access token obtained or
injected by another party (e.g. a token minted for a *different* client, the
"confused deputy"/token-substitution class of bug) can yield a UserInfo
response your app wrongly treats as proof of identity. The correct design uses
the **ID token**: a JWT issued *to your `client_id`* (`aud`), signed by the
provider (verify via JWKS/RS256), with `iss`/`exp` checked. Its `sub` is the
stable identity you key your local user on. Rule from Concepts: access token =
what you can do; ID token = who you are — authenticate with the ID token.

</details>

## Independent challenge

No code given. Add full "Sign in with GitHub" (or Google) to your `auth-track`
app using Authorization Code + PKCE, and then *bridge it into the auth you
already built*: after the provider confirms identity, map the provider `sub` to
a local user and start a **server-side session** (reach back to **module 01** —
rotate the session id at login to defend against fixation) *and* separately mint
your own short-lived **JWT** for API clients (reach back to **module 02**).
Verify the ID token yourself at least once (don't only rely on the library):
fetch the provider's JWKS, check the signature, `iss`, `aud`, and `exp`. Then
write a short note distinguishing, for your finished flow, exactly which token
is doing authorization vs authentication, and where the `state` and PKCE
protections each stop a specific attack.

<details>
<summary>Hint</summary>

The bridge is the key idea: OAuth2/OIDC only gets you to "this is user
`sub=1234567` at GitHub, verified." From there you're back in modules 01/02 —
you create-or-look-up a *local* user record keyed on `(provider, sub)` and then
issue *your own* credentials, because your app's session/token lifecycle
(logout, revocation, roles) is yours to control, not GitHub's. Verify the ID
token with the same `jwt.decode(..., algorithms=["RS256"], audience=your_client_id,
issuer=provider)` you learned in module 02, fetching the RS256 public key from
the provider's `jwks_uri` in the discovery document.

</details>

## Common mistakes & troubleshooting

- **Authenticating with the access token.** The access token is authorization,
  not identity. Use the **ID token** (OIDC) to log users in; verify its
  signature, `iss`, `aud`, and `exp`.
- **Skipping or not verifying `state`.** Opens login CSRF. Generate a random
  `state`, store it, and reject any callback whose `state` doesn't match.
- **Skipping PKCE on public clients (SPA/mobile).** An intercepted auth code can
  then be redeemed by an attacker. Use Authorization Code + PKCE for all
  clients.
- **Using the Implicit or Password grant.** Implicit is deprecated (use
  code+PKCE); Password grant hands your app the user's password, defeating
  OAuth2's whole purpose. Avoid both.
- **Embedding a client secret in an SPA or mobile app.** It's extractable; those
  are *public* clients and must use PKCE instead of relying on a secret.
- **Reusing the provider's tokens as your app's session.** Map identity into
  *your own* session/JWT so you control lifecycle, roles, and revocation.
- **Not verifying `aud` on the ID token.** An ID token minted for a different
  client must be rejected — accepting it is a token-substitution vulnerability.
- **Confusing the four roles.** Being crisp on resource owner / client / auth
  server / resource server is what makes every flow diagram legible.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the four OAuth2 roles and, in "Login with Google" for your app, say who
   plays each.
2. What does plain OAuth2 give you, and what does OIDC add on top?
3. Which grant type for each: a web app with a backend, a single-page app, a
   backend service calling another service with no user?
4. What problem does PKCE solve, and for which kind of client is it essential?
5. What is the `state` parameter for, and what breaks if you don't verify it on
   the callback?
6. What's the difference between an access token and an ID token, and which do
   you use to log a user into *your* app?
7. Why does the authorization-code flow split into a front-channel redirect and
   a back-channel exchange, and what makes the intercepted code useless on its
   own?

<details>
<summary>Answers</summary>

1. Resource owner (the user), client (your app), authorization server (Google's
   OAuth/OIDC server that authenticates the user and issues tokens), resource
   server (the API holding protected data, e.g. Google's APIs). In "log in with
   Google" your app is the client, the user is the resource owner, Google is both
   authorization server and resource server.
2. Plain OAuth2 gives an access token for delegated *authorization* (what the
   client may do at the resource server). OIDC adds an *identity* layer: the
   `openid` scope, a signed **ID token** (JWT) describing who the user is, a
   UserInfo endpoint, and discovery/JWKS for verification.
3. Web app with backend → Authorization Code (+ PKCE); SPA → Authorization Code
   + PKCE; backend-to-backend with no user → Client Credentials.
4. PKCE stops an attacker who intercepts the authorization code from redeeming
   it, by requiring proof of a per-login secret (code verifier) at token
   exchange. It's essential for public clients that can't safely hold a secret —
   SPAs and mobile apps — and recommended for all clients.
5. `state` is a random value the client stores and the auth server echoes back;
   verifying it on callback ties the response to the request the *same* user
   started. Without verification you're open to login CSRF — an attacker gets a
   victim to complete the attacker's flow, linking accounts.
6. The access token authorizes API calls at the resource server (what you can
   do); the ID token is a signed assertion about the user's identity issued to
   your client (who you are). Use the **ID token** to log the user into your app.
7. The code travels through the user's browser (front-channel), where it could
   be exposed, so it's deliberately useless alone: turning it into tokens
   requires a back-channel server-to-server call authenticated with the client
   secret (or PKCE verifier), which never transits the browser — so an
   intercepted code can't be redeemed.

</details>

## Further reading & sources

- [RFC 6749 - The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749) - the core spec: roles, grant types, and the authorization-code flow.
- [RFC 7636 - Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636) - the spec for the `code_verifier`/`code_challenge` hardening this module builds.
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) - what OIDC adds on top of OAuth2: the ID token, `openid` scope, and UserInfo.
- [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://datatracker.ietf.org/doc/html/rfc9700) - the modern guidance that makes PKCE and `state` mandatory and deprecates Implicit.
- [OWASP: OAuth 2.0 Protocol Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html) - practical pitfalls including `state`/CSRF and token-substitution.
- [Authlib documentation](https://docs.authlib.org/en/latest/client/fastapi.html) - the FastAPI OAuth client used here, and what it handles for you (PKCE, `state`, id_token verification).

## Next

[04-api-keys-and-service-to-service-auth](../04-api-keys-and-service-to-service-auth/README.md)
— the Client Credentials grant hinted at auth with no user in the loop; next
you'll go deep on machine-to-machine authentication: API keys and how they
really work, when to use them versus OAuth2/JWT, and mutual TLS as the
certificate-based alternative for services proving identity to each other.
