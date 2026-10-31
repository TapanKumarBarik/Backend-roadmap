# Module 05: MFA and Password Security

## Why this matters

Every module so far assumed the password check "just works" — `verify the
password → user 42`. This module is where you build that check *correctly*,
and it is the single most consequential piece of security code most backends
contain. Password databases get breached constantly; the difference between a
breach that's an embarrassing news story and a breach that's a catastrophe is
almost entirely *how you stored the passwords*. Store them wrong (plaintext,
unsalted MD5/SHA-256) and a leaked database hands attackers every user's actual
password — which they then try on those users' email, bank, and everything
else. Store them right (salted bcrypt/argon2) and the leaked database is mostly
useless.

Passwords alone, though, are a weak factor — users reuse them, phishing steals
them, breaches leak them. **Multi-factor authentication (MFA)** adds a second,
independent proof so that a stolen password isn't enough. This module covers
both: the MFA approaches you'll actually implement (TOTP codes, WebAuthn/
passkeys) and the cryptographic hygiene of password storage. TOTP is what your
capstone adds on login, and correct password hashing underpins the whole track's
"verify the password" step. Get this module wrong and everything built on top is
compromised at the foundation.

## Concepts

### The factors, and what "multi-factor" really means

Authentication factors come in three independent categories:

- **Something you know** — a password, PIN, security answer.
- **Something you have** — a phone running an authenticator app, a hardware
  security key, a registered device.
- **Something you are** — a biometric: fingerprint, face.

**Multi-factor** means requiring proofs from **two or more different
categories** — not two of the same. A password plus a security question is *not*
MFA (both are "something you know," both fall to the same phishing/breach). A
password (know) plus a code from your phone (have) *is* MFA: an attacker who
phishes the password still can't log in without also having the phone. That
independence is the entire value — MFA doesn't make each factor stronger, it
makes the attacker need to compromise two unrelated things at once.

### TOTP — time-based one-time passwords

TOTP is the ubiquitous "6-digit code from Google Authenticator/Authy" second
factor. It's an *implementation of "something you have"* (the phone holding the
seed) and works entirely offline. How it works:

- At enrollment, the server generates a random **shared secret** (the seed) and
  gives it to the user's authenticator app — usually by displaying a QR code
  encoding an `otpauth://` URI. Both sides now hold the same seed.
- To generate a code, both sides compute `HMAC(secret, current_30-second_time_
  window)` and truncate it to 6 digits. Because both share the seed and the
  clock, they independently arrive at the *same* code, which changes every 30
  seconds. No network needed — that's why it works on a plane.
- At login, after the password check, the user types the current code; the
  server computes what the code *should* be and compares. To tolerate clock
  skew, the server accepts the code for the adjacent window(s) too (a small
  `valid_window`).

```
  enroll: server ──shared seed (QR)──► authenticator app   (both hold the seed)

  every 30s, INDEPENDENTLY on each side, no network:
     seed + current_time_window ─► HMAC ─► truncate ─► 6 digits
  server ─┐                                                 ┌─ phone
          └── same seed + same clock → same code ───────────┘
  login: user types code ─► server recomputes ─► compare (±1 window for skew)
```

Security properties and pitfalls:

- The seed is a **shared secret** — store it server-side *encrypted*, not
  plaintext, because a DB leak of TOTP seeds lets an attacker generate valid
  codes.
- Codes are **one-time within their window**: to be strict you should reject a
  code already used in the current window (prevents replay of a code sniffed in
  transit), though TLS makes sniffing hard.
- TOTP is **phishable**: a fake login page can prompt for the code and relay it
  in real time. It's a big step up from password-only, but not phishing-proof —
  which is exactly why WebAuthn exists.
- Always issue **recovery/backup codes** at enrollment, or a lost phone locks
  the user out permanently.

The `otpauth://` URI you encode in the QR looks like:
`otpauth://totp/MyApp:alice@example.com?secret=BASE32SEED&issuer=MyApp`.

### WebAuthn / passkeys — phishing-resistant MFA

WebAuthn (the browser API behind FIDO2 and **passkeys**) is the modern,
phishing-resistant factor. Instead of a shared secret or a code the user types,
it uses **public-key cryptography** bound to the site's origin:

- At registration, the user's **authenticator** (a hardware key like a YubiKey,
  or the platform's secure enclave — Touch ID, Windows Hello, the phone) 
  generates a **key pair**. The public key goes to your server; the private key
  *never leaves the device*.
- At login, the server sends a random **challenge**; the authenticator signs it
  with the private key (gated by a local biometric/PIN — a *user presence/
  verification* check), and the server verifies the signature with the stored
  public key.
- Crucially, the signature is **bound to the origin** (`example.com`). A
  phishing site at `examp1e.com` gets a different origin, so the authenticator
  simply won't produce a valid signature for the real site. This is what makes
  WebAuthn **phishing-resistant** where TOTP is not — there's no code to relay,
  and the browser enforces the origin binding.
- **Passkeys** are WebAuthn credentials that sync across a user's devices (via
  iCloud Keychain, Google Password Manager) and can replace the password
  *entirely* (passwordless), not just augment it. This is where the industry is
  heading.

WebAuthn's tradeoff is complexity (a multi-step ceremony, more moving parts) and
account-recovery design (lost-device flows), so many apps offer TOTP as the
accessible default and WebAuthn/passkeys as the stronger option. Know both;
implement TOTP in the capstone, understand WebAuthn's model.

### Password hashing — the core of it

Now the foundation. **Never store passwords in a form you can reverse to the
original.** Concretely, in order of increasing correctness:

- **Plaintext** — catastrophic. A DB leak = every password, in the clear,
  instantly. Never.
- **Plain fast hash (MD5, SHA-256)** — also broken for passwords, for two
  reasons. First, hashing is deterministic, so identical passwords produce
  identical hashes — an attacker precomputes a **rainbow table** (a giant
  dictionary of `hash → password`) once and reverses your whole database by
  lookup. Second, fast hashes are *fast by design*: a GPU computes billions of
  SHA-256 hashes per second, so an attacker with your hashes brute-forces
  common/weak passwords offline at enormous speed.

The two fixes correspond to those two problems:

### Salting — defeating precomputation

A **salt** is a unique random value generated per password and stored alongside
the hash; you hash `salt + password` instead of just `password`. Two
consequences:

- Two users with the same password now get **different** hashes (different
  salts), so an attacker can't spot shared passwords and can't use a *single*
  precomputed table against your whole DB.
- Rainbow tables are defeated: a precomputed table is built for a specific salt,
  so a unique random salt per user forces the attacker to attack each hash
  *individually* rather than reversing everyone at once.

The salt is **not secret** — it's stored right next to the hash (modern password
hashers embed it in the output string). Its job isn't secrecy; it's uniqueness,
to break precomputation and force per-hash work.

### Slow, adaptive hashing — bcrypt / argon2

Salting stops precomputation, but a fast hash still lets an attacker brute-force
each salted hash quickly. The second fix is to make the hash **deliberately slow
and tunable**: a **password hashing function** (a KDF) designed so that
computing one hash takes a meaningful fraction of a second and a controllable
amount of memory. The standards:

- **bcrypt** — the long-standing default; has a **cost factor** (work factor)
  you raise over time as hardware gets faster (e.g. cost 12). Salts
  automatically.
- **argon2** (argon2id variant) — the modern winner of the Password Hashing
  Competition; tunable in **time, memory, and parallelism**. The memory-hardness
  matters because it resists GPU/ASIC attacks (which have lots of compute but
  limited fast memory) far better than bcrypt. Prefer **argon2id** for new
  systems.
- **scrypt / PBKDF2** — also acceptable (PBKDF2 is FIPS-approved but weaker
  against GPUs); argon2id or bcrypt are the usual recommendations.

The "adaptive" part is the point: as computers get faster, you *increase* the
cost/memory parameters so hashing stays expensive for attackers while remaining
a fraction of a second for your one legitimate login. A fast hash can't do
this — it's fast by design, which is a virtue for checksums and a fatal flaw for
passwords.

Both bcrypt and argon2 **generate and embed the salt for you** and produce a
single self-describing string containing the algorithm, parameters, salt, and
hash — so verification just re-runs the function with the embedded parameters
and compares. You never manage salts by hand.

```
  STORE (one-way, irreversible)
  "hunter2" ─► + random salt ─► argon2id(slow, tunable) ─► $argon2id$…$salt$hash
                                                              (this is all you keep)
  VERIFY
  login pw ─► re-run argon2id with embedded salt+params ─► compare ─► match / no
     no way back from the stored hash to "hunter2"
```

```python
# argon2id via passlib — salting + slow adaptive hashing, both automatic
from passlib.context import CryptContext
pwd = CryptContext(schemes=["argon2"], deprecated="auto")

hashed = pwd.hash("correct horse battery staple")
#  '$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>'  ← alg, params, salt, hash embedded
assert pwd.verify("correct horse battery staple", hashed) is True
assert pwd.verify("wrong", hashed) is False
# raise cost over time; passlib flags outdated hashes for rehash-on-login:
if pwd.needs_update(hashed):
    hashed = pwd.hash("correct horse battery staple")   # re-store the stronger hash
```

### Putting it together: a correct login

A production login combines everything: verify the password with a slow salted
hash, do it in **constant time even when the user doesn't exist** (module 07's
timing-attack defense — verify against a dummy hash so "no such user" takes as
long as "wrong password"), and then, if the account has MFA, require the second
factor before issuing a session/token:

```python
DUMMY = pwd.hash("x")   # so a missing user costs the same as a real verify

def authenticate(username: str, password: str) -> User | None:
    user = users.get(username)
    stored = user.password_hash if user else DUMMY   # always run a real verify
    ok = pwd.verify(password, stored)
    if not user or not ok:
        return None                # identical work/time whether user exists or not
    return user                    # password OK → next, MFA if enabled
```

## Command reference

`pip install "passlib[argon2]" pyotp qrcode`.

| Pattern | Purpose | Snippet |
|---|---|---|
| `CryptContext(schemes=["argon2"])` | configure the password hasher | slow, salted, adaptive |
| `pwd.hash(password)` | hash (auto-salts, embeds params) | store the returned string |
| `pwd.verify(password, hash)` | check a password | constant-time internally |
| `pwd.needs_update(hash)` | detect outdated cost → rehash on login | keep hashes current |
| `pyotp.random_base32()` | generate a TOTP seed | store encrypted |
| `pyotp.TOTP(secret).provisioning_uri(name, issuer_name=...)` | build the `otpauth://` URI for the QR | enrollment |
| `pyotp.TOTP(secret).verify(code, valid_window=1)` | verify a TOTP code (with skew tolerance) | login step 2 |
| `secrets.compare_digest` | constant-time compare (module 07) | recovery codes etc. |

## Hands-on exercises

Continue in `auth-track`. `pip install "passlib[argon2]" pyotp qrcode`.

### 1. Hash and verify a password

Set up the `CryptContext` and hash a password. Print the resulting string and
identify each part (`$argon2id$`, the `m=/t=/p=` params, the salt, the hash).
Verify the correct and an incorrect password. Expected: correct → `True`, wrong
→ `False`, and you can point to where the salt lives *inside* the hash string.

### 2. Prove salting makes identical passwords differ

Hash the *same* password twice and compare the two output strings. Expected:
they're **different** (different random salts), yet both `verify` the original
correctly. Write one sentence explaining how this defeats rainbow tables.

### 3. Feel why a fast hash is dangerous

Time hashing "password" 10,000 times with `hashlib.sha256` versus with argon2:

```python
import time, hashlib
from passlib.context import CryptContext
pwd = CryptContext(schemes=["argon2"])
t=time.time(); [hashlib.sha256(b"password").hexdigest() for _ in range(10000)]; print("sha256", time.time()-t)
t=time.time(); [pwd.hash("password") for _ in range(50)]; print("argon2 x50", time.time()-t)
```

Expected: SHA-256 does 10k in a blink; argon2 takes real time for just 50. Now
reason about it from the attacker's side: at those rates, how many *passwords
per second* could a GPU try against each kind of hash, and why does "slow" =
"secure" here?

### 4. Replace your fake password check with real hashing

Go back to your `/login` (module 01/00) and store users as `{username:
argon2_hash}`. Verify with `pwd.verify`. Confirm login still works end to end,
now with properly hashed passwords. Expected: a real, breach-resistant password
store underpinning the sessions/JWTs you built earlier.

### 5. Enroll and verify TOTP

Add `POST /mfa/enroll` that generates a `pyotp.random_base32()` seed, stores it
for the user, and returns the `provisioning_uri`. Render it as a QR (or paste
the `otpauth://` URI into your authenticator app manually). Then add
`POST /mfa/verify` that checks a submitted 6-digit code with `valid_window=1`:

```python
import pyotp
secret = pyotp.random_base32()
print(pyotp.totp.TOTP(secret).provisioning_uri("alice@example.com", issuer_name="AuthTrack"))
# scan into an authenticator app, then:
print(pyotp.TOTP(secret).verify("123456", valid_window=1))
```

Expected: a code from your app verifies `True`; a stale/wrong code verifies
`False`. You now have a working "something you have" factor.

### 6. Gate login on MFA

Wire it together: `POST /login` verifies the password; if the user has a TOTP
seed enrolled, it does **not** issue a session yet — it returns "MFA required"
and expects a second call `POST /login/mfa` with the code before issuing the
session/JWT. Confirm that a correct password alone does *not* log you in when
MFA is enabled. Expected: two independent factors required — password (know) +
code (have).

### 7. Add recovery codes

At enrollment, generate 10 random recovery codes, show them once, and store only
their **hashes** (same reasoning as API keys, module 04). Allow one to be
redeemed in place of a TOTP code, marking it used. Confirm a used code can't be
reused. Expected: a lost-phone escape hatch that doesn't itself become a
weakness (hashed, single-use).

### 8. Constant-time login for a missing user

Implement the `authenticate` function from Concepts (verify against a `DUMMY`
hash when the user doesn't exist). Roughly time `/login` for an existing user
with a wrong password vs a totally nonexistent username. Expected: the two take
about the *same* time — so an attacker can't tell which usernames exist by
timing. (This is a preview of module 07; note it here.)

### 9. Diagnose and fix: the breach postmortem

You're handed this legacy user store and login. List every security failure and
give the fix for each.

```python
import hashlib
USERS = {"alice": hashlib.md5("hunter2".encode()).hexdigest()}   # unsalted MD5

def login(username, password):
    if username not in USERS:
        return "no such user"                # different message + returns early
    if USERS[username] == hashlib.md5(password.encode()).hexdigest():
        return "ok"
    return "wrong password"
```

<details>
<summary>Solution</summary>

Failures: (1) **MD5** — cryptographically broken and blazing fast; GPUs reverse
it trivially. Use argon2id (or bcrypt). (2) **Unsalted** — identical passwords
hash identically and rainbow tables reverse the whole DB; a salted adaptive
hasher fixes this automatically. (3) **Fast hash** — no work factor, so offline
brute force is cheap; argon2/bcrypt are deliberately slow and adaptive. (4)
**Username enumeration** — a distinct "no such user" message *and* an early
return means a wrong username is distinguishable from a wrong password both by
response text and by timing; return an identical generic message ("invalid
credentials") for both and verify against a dummy hash so timing matches
(module 07). (5) **No MFA** — a single leaked/phished password is game over; add
TOTP/WebAuthn as a second factor. Fix: `CryptContext(schemes=["argon2"])`,
constant-time `authenticate` with a dummy-hash path, generic error, and a TOTP
step.

</details>

## Independent challenge

No code given. Build the complete credential subsystem for `auth-track`:
registration that stores argon2id hashes (auto-salted, adaptive), a login that
runs in **constant time whether or not the username exists** (reach back — this
is the module-07 timing concern, applied now), TOTP enrollment with a QR/
provisioning URI and hashed single-use recovery codes, and a two-step login that
requires the TOTP code as a second factor before issuing the credential. Then
make the *credential you issue after MFA* pluggable: a **server-side session**
for a browser client (reach back to **module 01**, rotating the session id at
login) or a short-lived **JWT** for an API client (reach back to **module 02**).
Finally, write a short note: classify each factor you used by category (know/
have/are), explain why your two factors are genuinely independent, and explain
why argon2id's *memory* parameter — not just its time cost — matters against a
GPU-equipped attacker.

<details>
<summary>Hint</summary>

The reason argon2id beats bcrypt against modern attackers is memory-hardness:
GPUs and ASICs bring massive parallel *compute* but comparatively little fast
*memory* per core, so a hash that demands, say, 64 MB per evaluation
bottlenecks them in a way raw compute can't buy around — whereas a compute-only
cost (bcrypt, PBKDF2) scales with the hardware attackers actually have. For the
constant-time login, always run one real `pwd.verify` even for a nonexistent
user (against a stored dummy hash) so the "no such user" and "wrong password"
paths do the same work and take the same time — otherwise timing alone reveals
which usernames are real.

</details>

## Common mistakes & troubleshooting

- **Plaintext or fast-hash (MD5/SHA-256) password storage.** Reversible or
  GPU-crackable. Use a slow, salted, adaptive hasher: argon2id or bcrypt.
- **Rolling your own salting/hashing.** Off-by-one and salt-reuse bugs are easy;
  use `passlib`/argon2 which salt and embed parameters for you.
- **Never raising the work factor.** Hardware gets faster; use `needs_update`
  and rehash on login to keep hashes strong over time.
- **Calling a password + security question "MFA."** Both are "something you
  know" — not independent, not real MFA. Combine *different* categories.
- **Storing TOTP seeds or recovery codes in plaintext.** A leak then lets
  attackers mint valid codes. Encrypt seeds; hash recovery codes; make recovery
  codes single-use.
- **No backup/recovery codes.** A lost phone permanently locks users out. Issue
  recovery codes at enrollment.
- **Treating TOTP as phishing-proof.** It's relay-phishable; for true
  phishing-resistance use WebAuthn/passkeys (origin-bound public-key crypto).
- **Username enumeration via login.** Different messages or timings for
  "no such user" vs "wrong password" leak which accounts exist. One generic
  message + constant-time verify against a dummy hash (module 07).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three factor categories and explain why a password + security
   question is not real MFA.
2. Why is plain SHA-256 unsuitable for password storage — give the two distinct
   reasons and the fix for each.
3. What does a salt accomplish, and is it secret? Where is it stored?
4. What makes bcrypt/argon2 "adaptive," and why does a fast hash fundamentally
   can't offer this?
5. How does TOTP let the server and phone agree on a 6-digit code with no
   network, and name one thing TOTP does *not* protect against.
6. What makes WebAuthn/passkeys phishing-resistant where TOTP is not?
7. Why should a login take the same amount of time whether or not the username
   exists, and how do you achieve that?

<details>
<summary>Answers</summary>

1. Something you know, something you have, something you are. A password +
   security question is two "know" factors — both fall to the same phishing or
   breach, so compromising one path compromises both; real MFA requires two
   *different* categories so an attacker must defeat two unrelated things.
2. (1) It's deterministic, so identical passwords hash identically and rainbow
   tables reverse the DB — fix with a unique per-password salt. (2) It's fast, so
   GPUs brute-force offline at billions/sec — fix with a slow, adaptive KDF
   (argon2id/bcrypt).
3. A salt makes each password's hash unique, defeating precomputed rainbow
   tables and hiding shared passwords. It is *not* secret — it's stored right
   next to (usually embedded in) the hash; its job is uniqueness, not secrecy.
4. They have tunable cost parameters (bcrypt's work factor; argon2's time/
   memory/parallelism) you raise as hardware improves, keeping hashing
   expensive for attackers. A fast hash is fast by design with no such tunable
   cost, so it can't be made deliberately expensive.
5. Both hold the same shared secret (seed) and use the current 30-second time
   window; each computes `HMAC(seed, window)` truncated to 6 digits and arrives
   at the same code independently — no network needed. TOTP does not protect
   against real-time phishing (a fake page can relay the code).
6. WebAuthn uses origin-bound public-key crypto: the authenticator signs a
   server challenge with a private key that never leaves the device, and the
   signature is valid only for the real origin — a phishing site has a different
   origin, so no valid signature is produced and there's no code to relay.
7. So an attacker can't enumerate valid usernames by timing (a fast "no such
   user" vs a slower real verify). Achieve it by always running one real hash
   verification — against a stored dummy hash when the user doesn't exist — and
   returning one generic error either way.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-05 while attempting these.

1. Draw the full "Login with Google, then use our API" path end to end, naming:
   which module-03 flow authenticates the user, what the ID token proves
   (module 03) and how you verify it (module 02), and what credential you issue
   afterward for (a) a browser (module 01) and (b) an API client (module 02).
2. For each stored secret, state whether you'd use a *fast* hash or a *slow
   adaptive* hash, and why: (a) a user's password; (b) an API key (module 04);
   (c) a TOTP recovery code (module 05).
3. Three "revocation" tickets — give the mechanism and how fast it takes effect
   for each: (a) log a session user out everywhere (module 01); (b) kill a live
   JWT access token now (module 02); (c) disable a leaked API key (module 04).
4. A login endpoint must resist three distinct attacks at once: username
   enumeration (module 05), session fixation (module 01), and — after switching
   to JWTs — inability to log out (module 02). Name the specific defense for
   each.
5. You're choosing auth for four callers: a browser SPA, a third-party
   developer's script, one of your own microservices calling another, and a
   partner bank under compliance. Pick a mechanism for each (drawing on modules
   00, 03, 04) and justify in a sentence.
6. Why must a JWT's `algorithms` be pinned on verify (module 02), a session
   cookie be `HttpOnly` (module 01), an OAuth2 callback verify `state` (module
   03), and a password be salted (module 05) — what single theme unites all
   four "the default/naive path is unsafe" lessons?
7. Explain why an API key can be revoked instantly (module 04) but a JWT it
   mints cannot (module 02), tying it back to the stateful-vs-stateless axis
   (module 00).
8. A teammate proposes "just use one long-lived JWT for everything: browser
   login, API access, and service-to-service." Give three separate reasons from
   three different modules why this is a bad idea.

<details>
<summary>Answers</summary>

1. User clicks login → Authorization Code + PKCE flow (module 03): redirect to
   Google with `openid` scope, `state`, PKCE challenge; Google authenticates +
   consents; callback returns a code; back-channel exchange yields an **ID
   token** (a JWT) proving the user's identity (`sub`), which you verify via
   Google's JWKS public key with RS256, checking `iss`/`aud`/`exp` (module 02).
   Map `sub` to a local user, then issue (a) a server-side session with a
   rotated id for the browser (module 01), or (b) your own short-lived JWT for
   an API client (module 02).
2. (a) Password → slow adaptive (argon2id/bcrypt): low-entropy and guessable, so
   it must resist offline brute force. (b) API key → fast hash (SHA-256/HMAC):
   already long and high-entropy, so a fast hash suffices. (c) Recovery code →
   fast hash is acceptable if generated high-entropy (like an API key), and it
   must be single-use; either way store only the hash.
3. (a) Delete the user's session records in the store — instant on next request.
   (b) Add its `jti` to a denylist (or bump the user's token version) — instant,
   at the cost of a per-request lookup/comparison. (c) Delete the key's stored
   hash — instant on next request. All three are instant *because they're
   stateful*.
4. Enumeration: one generic error + constant-time verify against a dummy hash
   (module 05). Fixation: rotate/regenerate the session id on login (module 01).
   JWT logout: short expiry + revocable refresh token and/or a `jti` denylist /
   token-version bump (module 02).
5. SPA → Authorization Code + PKCE / then your own short-lived JWT (public
   client, can't hold a secret). Third-party script → API key (simple DX,
   revocable, long-lived). Microservice→microservice → OAuth2 Client
   Credentials or an internal signed JWT (verify without lookup, central
   issuance). Partner bank under compliance → mutual TLS (cryptographic
   host identity, high assurance).
6. In each case the naive/default path silently accepts something unsafe:
   trusting the token's own `alg`, letting JS read the cookie, accepting any
   callback, or hashing without a salt. The unifying theme: **never trust the
   easy default — security requires explicitly pinning/hardening the thing the
   naive path leaves open** (pin algs, lock the cookie, verify `state`, salt +
   slow-hash).
7. The API key is stateful — the server stores its hash and consults it every
   request, so deleting the record kills the key immediately. The JWT is
   stateless — the server stored nothing and verifies by signature alone, so it
   stays valid until `exp`. It's the module-00 axis: identity in a server store
   (revocable) vs identity in a self-contained token (not, without added state).
8. (module 00/02) One long-lived JWT can't be revoked, so logout/ban/stolen-
   device don't take effect until expiry. (module 01) A browser wants
   `HttpOnly`-cookie sessions with instant server-side logout, which a bearer
   JWT in JS-accessible storage undermines (XSS-exfiltratable). (module 03/04)
   Service-to-service and third-party access want scoped, independently
   revocable credentials (Client Credentials / API keys), not one shared
   all-powerful token whose leak compromises everything at once.

</details>

## Further reading & sources

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) - the definitive guidance on argon2id/bcrypt parameters, salting, and peppering.
- [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html) - factor categories, TOTP, and recovery-code design.
- [RFC 6238 - TOTP: Time-Based One-Time Password Algorithm](https://datatracker.ietf.org/doc/html/rfc6238) - the spec the `HMAC(seed, time_window)` code generation follows.
- [webauthn.guide](https://webauthn.guide/) - an approachable walkthrough of the WebAuthn registration/authentication ceremonies and origin binding.
- [FIDO Alliance: Passkeys](https://fidoalliance.org/passkeys/) - what passkeys are and why they are phishing-resistant and passwordless.
- [passlib CryptContext docs](https://passlib.readthedocs.io/en/stable/lib/passlib.context.html) - the `hash`/`verify`/`needs_update` API used here for adaptive rehashing.

## Next

[06-authorization-models](../06-authorization-models/README.md) — you've now
covered *authentication* thoroughly, human and machine. Time for the second
half of "auth": once you know *who* the caller is, how do you decide *what
they're allowed to do*? RBAC, ABAC, and ReBAC (Zanzibar-style), and how to
build a real permission-check layer in FastAPI.
