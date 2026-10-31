# Module 09: TLS/SSL and HTTPS

## Why this matters

Every `https://` URL, every green padlock, every `curl -v` line that said
`TLS handshake` since module 00 — that's the security layer this module
finally opens up. HTTPS is not a different protocol from HTTP; it's plain
HTTP (everything you learned in modules 01-08) running *inside* an
encrypted, authenticated tunnel provided by TLS. Understanding that
relationship — "HTTPS = HTTP over TLS" — dissolves most of the confusion
people carry about certificates, the padlock, and why "the site is secure."

Why a backend engineer must know this beyond "just turn on HTTPS": you'll
configure TLS on servers and load balancers, debug certificate errors that
take down APIs (`certificate has expired`, `hostname mismatch`,
`unable to verify the first certificate`), decide where TLS terminates in
your architecture (module 00's proxy layer), and reason about the security
headers from module 02 (HSTS) that depend on it. And when a security review
asks "is data encrypted in transit?", you'll know exactly what TLS does and
does not protect.

The three things TLS actually gives you — **encryption** (eavesdroppers
can't read it), **integrity** (tampering is detected), and
**authentication** (you're really talking to `example.com`, not an
impostor) — are worth internalizing precisely, because people routinely
assume HTTPS provides guarantees it doesn't (it doesn't hide *which site*
you visited, and it doesn't vouch that the site is *trustworthy*, only that
it's *who it claims to be*).

## Concepts

### SSL vs TLS: the naming

**SSL** (Secure Sockets Layer) is the original 1990s protocol; **TLS**
(Transport Layer Security) is its successor and what everyone actually uses
today. SSL 2.0 and 3.0 are long broken and disabled. "SSL certificate,"
"SSL termination," "SSL/TLS" — in modern usage these all mean **TLS**; the
name "SSL" stuck culturally. Current versions: **TLS 1.2** (still common)
and **TLS 1.3** (2018, faster and more secure — fewer handshake round
trips, weak options removed). When you see "SSL," read "TLS."

### HTTPS = HTTP over TLS

The layering, bottom to top (module 00's journey, annotated):

```
[ HTTP request/response ]   ← everything from modules 01-08 (unchanged)
        rides inside
[ TLS record layer ]        ← encrypts + authenticates the bytes
        rides on
[ TCP connection ]          ← reliable byte transport
        rides on
[ IP packets ]              ← routed across the internet
```

TLS sits *between* TCP and HTTP. Your HTTP message is identical whether
it's HTTP or HTTPS — the difference is that with HTTPS, before any HTTP
flows, a **TLS handshake** establishes an encrypted channel, and then the
exact same HTTP bytes travel through it, opaque to anyone in the middle.
This is why nothing in modules 01-08 changed for HTTPS: TLS is transparent
to the HTTP semantics above it. The default port is **443** for HTTPS vs.
**80** for plain HTTP.

### What TLS provides (and what it doesn't)

TLS gives three guarantees:

- **Confidentiality (encryption):** anyone intercepting the bytes (your
  ISP, someone on the same Wi-Fi, a router along module 00's path) sees
  only ciphertext, not your data, cookies, or tokens.
- **Integrity:** if anyone alters the bytes in transit, the tampering is
  detected and the connection fails — you can't silently modify an HTTPS
  response.
- **Authentication (of the server):** the certificate proves you're
  talking to the real `example.com`, not an impostor who intercepted your
  connection (a man-in-the-middle).

What TLS does **not** give you:

- It does **not** hide *which* server you connected to. An observer still
  sees the destination IP, and historically the hostname (via SNI, below)
  in the clear. It hides the *content*, not the *fact of the connection*.
- It does **not** vouch that a site is *trustworthy* or *safe* — only that
  it is *who its certificate says it is*. `https://scam-site.example` can
  have a perfectly valid certificate. The padlock means "encrypted and
  authenticated," not "honest."
- It does **not** protect data *at rest* on the server or *after* the TLS
  terminates (e.g. inside your datacenter past the load balancer, unless
  you re-encrypt).

### Certificates, CAs, and the chain of trust

Server authentication rests on **certificates** and a **chain of trust**:

- A **certificate** binds a public key to an identity (a domain name like
  `example.com`) and is digitally signed by a **Certificate Authority
  (CA)**. It contains the domain(s) it's valid for, a validity period
  (not-before / not-after dates), the public key, and the CA's signature.
- A **CA** is an organization your system already trusts (Let's Encrypt,
  DigiCert, etc.). Your OS/browser ships with a **trust store** of root CA
  certificates.
- The **chain**: the server presents its certificate plus intermediate
  CA certificate(s); each is signed by the next up the chain, terminating
  at a **root CA** in your trust store. Your client verifies each
  signature up to a trusted root. If the chain is complete and valid, the
  identity is trusted.

```
   leaf cert           intermediate CA        root CA (in your trust store)
  ┌──────────────┐    ┌──────────────┐        ┌──────────────┐
  │ CN=example.com│   │ CN=R3        │        │ CN=ISRG Root │
  │ signed by ────┼──►│ signed by ───┼───────►│ self-signed  │ ◄─ already trusted
  └──────────────┘    └──────────────┘        └──────────────┘
   server presents leaf + intermediate; client walks signatures up to a root
```

Certificates **expire** (Let's Encrypt certs last 90 days) — hence
auto-renewal, and hence the classic outage: a cert expires unnoticed and
every client suddenly rejects the connection. Certs are also revocable
(compromised keys).

### The TLS handshake, conceptually

When you connect to `https://example.com` (module 00's step 4), before any
HTTP:

1. **ClientHello:** the client says "I support these TLS versions and
   cipher suites," offers a key-exchange share, and — crucially — names the
   host it wants via **SNI** (Server Name Indication), so a server hosting
   many domains on one IP knows which certificate to present.
2. **ServerHello + Certificate:** the server picks a version/cipher, sends
   its **certificate chain**, and its own key-exchange share.
3. **Verification:** the client validates the certificate chain against its
   trust store, checks the hostname matches, and checks the dates.
4. **Key agreement:** both sides derive the same shared **session keys**
   using the exchanged shares (modern TLS uses ephemeral Diffie-Hellman,
   giving **forward secrecy** — even if the server's long-term key later
   leaks, past sessions stay unreadable).
5. **Encrypted channel established:** from here, all HTTP flows encrypted.

```
   CLIENT                                              SERVER
     │ ── ClientHello ────────────────────────────────► │  versions, ciphers,
     │    (TLS versions, ciphers, key share, SNI, ALPN)  │  key share, SNI=host
     │ ◄──────────── ServerHello + Certificate chain ─── │  picks version/cipher,
     │               + server key share                  │  sends cert + key share
     │  verify: chain → trusted root? hostname? dates?   │
     │  derive shared session keys (ephemeral DH)        │
     │ ═══════════ encrypted channel established ═══════ │
     │ ── GET / HTTP/1.1 (now encrypted) ──────────────► │  ← HTTP finally flows
```

TLS 1.3 streamlined this to a single round trip (1-RTT), and supports
0-RTT resumption — part of why it's faster, and echoing module 07's point
that QUIC/HTTP-3 folds this handshake in for even fewer round trips.

Also recall **ALPN** from module 07: the handshake is where client and
server agree on `h2` vs `http/1.1`. So a single TLS handshake does triple
duty — secure the channel, prove identity, and negotiate the HTTP version.

### Where TLS terminates in your architecture

Recall module 00's stack (load balancer → reverse proxy → app server).
**TLS termination** is the point where encrypted traffic is decrypted:

- Most commonly, TLS terminates at the **load balancer or reverse proxy**
  (nginx, a cloud LB, a CDN). It holds the certificate/private key,
  decrypts, and forwards *plain HTTP* to your app over the trusted internal
  network. This is why your FastAPI app usually sees `http://` internally
  even though users used `https://` — and why the `X-Forwarded-Proto:
  https` header (module 00/02) exists to tell your app the original request
  was secure.
- For higher security, some setups do **end-to-end TLS** (re-encrypt to the
  backend) so traffic is never plaintext even inside the datacenter.

Knowing where termination happens tells you where the certificate lives,
where to debug TLS errors, and why redirect-to-HTTPS logic often belongs at
the proxy, not the app.

### HSTS: forcing HTTPS

The `Strict-Transport-Security` header from module 02 is TLS's enforcement
partner: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
tells the browser "for the next year, *only ever* connect to me over HTTPS,
even if the user types `http://` or clicks an `http` link." This defeats
**SSL stripping** attacks (a MITM downgrading you to plaintext before the
redirect). HSTS only makes sense once HTTPS works everywhere for your site.

## Command reference

| Command | What it does |
|---|---|
| `curl -v https://example.com/ 2>&1 \| grep -iE 'TLS\|SSL\|certificate\|subject\|ALPN'` | See the handshake, cert, and negotiated protocol |
| `openssl s_client -connect example.com:443 -servername example.com` | Full handshake + certificate chain details |
| `openssl s_client -connect example.com:443 </dev/null 2>/dev/null \| openssl x509 -noout -dates` | Show the certificate's validity dates |
| `openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \| openssl x509 -noout -subject -issuer` | Show who the cert is for and who issued it |
| `curl --cacert ca.pem https://...` | Verify against a specific CA bundle |
| `curl -k https://...` | Skip certificate verification (DANGER: debugging only) |

Notes:

- **`openssl s_client -connect host:443 -servername host`** is the
  Swiss-army tool. `-servername` sends **SNI** (needed for multi-domain
  hosts). The output shows the offered certificate chain, the negotiated
  protocol/cipher, and verification result (`Verify return code: 0 (ok)`).
- **`openssl x509 -noout -dates`** extracts `notBefore`/`notAfter` — how
  you check for an expired or not-yet-valid cert (the classic outage).
- **`curl -k`** (`--insecure`) disables verification. It's for debugging a
  cert problem *only* — using it in real code throws away TLS's
  authentication guarantee and invites man-in-the-middle attacks.
- The default trust store is your OS's; `--cacert` points at a specific CA
  (used for internal/self-signed CAs).

To serve HTTPS locally (used in exercises), generate a self-signed cert and
run uvicorn with TLS:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout key.pem -out cert.pem -days 1 \
  -subj "/CN=localhost"
uvicorn app:app --host 127.0.0.1 --port 8443 \
  --ssl-keyfile key.pem --ssl-certfile cert.pem
```

## Hands-on exercises

You'll use curl, openssl, and a local HTTPS server. Most exercises hit
public sites; a couple use a self-signed cert to *see* verification fail.

### 1. Watch a real TLS handshake

```bash
curl -v https://example.com/ 2>&1 | grep -iE 'TLS|SSL|ALPN|certificate|subject:|issuer:|SSL connection' | head -20
```

Expected: lines showing the TLS version (`TLSv1.3`), the ALPN-negotiated
protocol (`h2` or `http/1.1`, module 07), the server certificate's
`subject` (the domain) and `issuer` (the CA), and
`SSL connection using TLSv1.3 / <cipher>`. You're seeing module 00's step 4
in full.

### 2. Inspect the certificate chain and dates

```bash
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Expected: `subject=` (the domain the cert vouches for), `issuer=` (the CA),
and `notBefore`/`notAfter` dates. Confirm today's date falls inside the
validity window. This is exactly what a client checks in handshake step 3.

### 3. See the full chain of trust

```bash
openssl s_client -connect example.com:443 -servername example.com -showcerts </dev/null 2>/dev/null \
  | grep -E 's:|i:'
```

Expected: multiple certificates — the leaf (server) cert, whose issuer (`i:`)
matches the subject (`s:`) of the next intermediate, and so on toward a root
CA in your trust store. That linkage *is* the chain of trust.

### 4. Serve HTTPS locally with a self-signed cert

Use any earlier FastAPI `app.py`. Generate the cert and run (commands in
the reference above). Then:

```bash
curl -v https://127.0.0.1:8443/ 2>&1 | grep -iE 'certificate|verify|SSL|self'
```

Expected: curl reports it established TLS *but* the certificate is
self-signed / not from a trusted CA — a verification failure like
`SSL certificate problem: self-signed certificate`. The *encryption*
worked; the *authentication* failed because no trusted CA signed it.

### 5. Understand why `-k` is dangerous

```bash
curl -k -s https://127.0.0.1:8443/ | head -c 60; echo
```

Expected: it now succeeds — because `-k` told curl to skip verification.
Reason about what you gave up: you no longer have any proof you're talking
to the *right* server. On the public internet, `-k` would let a
man-in-the-middle present any cert and you'd accept it. `-k` is a debugging
crutch, never a fix.

### 6. Prove hostname matching matters

```bash
# Connect to a valid site but claim you expected a different hostname
curl -v --resolve wrong.example.com:443:$(dig +short example.com | head -1) \
  https://wrong.example.com/ 2>&1 | grep -iE 'certificate|does not match|subject' | head
```

Expected: a hostname-mismatch error — the certificate is valid but issued
for `example.com`, not `wrong.example.com`, so verification fails.
Authentication isn't just "is the cert valid" — it's "is it valid *for this
hostname*." (This is the `SNI`/subject-matching check.)

### 7. See SNI in action

```bash
# Without SNI on a multi-tenant host, the wrong/default cert may come back
openssl s_client -connect example.com:443 </dev/null 2>/dev/null | openssl x509 -noout -subject
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null | openssl x509 -noout -subject
```

Expected: with `-servername` (SNI), the server knows which domain you want
and returns the matching cert. On shared hosting, omitting SNI can return a
default/mismatched cert. SNI is how one IP serves many HTTPS sites (the TLS
analog of the `Host` header from module 01).

### 8. Diagnose and fix: the expired-certificate outage

Regenerate a cert that is *already expired* to reproduce the classic
production incident:

```bash
# A cert valid only in the past (backdated, 1-day lifetime already over)
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -subj "/CN=localhost" -days 1 -not_before 20200101000000Z -not_after 20200102000000Z 2>/dev/null || \
faketime '2 days ago' openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj "/CN=localhost" -days 1
uvicorn app:app --host 127.0.0.1 --port 8443 --ssl-keyfile key.pem --ssl-certfile cert.pem &
sleep 2
curl -v https://127.0.0.1:8443/ 2>&1 | grep -iE 'expired|certificate|verify'
```

Expected: `certificate has expired` (or similar). **Diagnose:** the cert's
`notAfter` is in the past, so every client rejects the connection — this is
exactly the real-world outage where "the whole API went down at midnight"
because a cert expired and auto-renewal failed. Check it with
`openssl x509 -noout -dates -in cert.pem`. **Fix:** issue a currently-valid
cert (the normal command from the reference, `-days 365`), restart, and
confirm `curl` connects (modulo the self-signed trust issue from exercise
4). Lesson: certificates expire; monitor expiry and automate renewal.
(Stop the server: `kill %1`.)

## Independent challenge

No code given.

**Task:** Take one FastAPI app you built in an earlier module and put it
behind proper HTTPS *locally*, then produce evidence for each of the three
guarantees TLS provides and each of the two guarantees it does *not*.
Specifically: (a) demonstrate that the HTTP request/response semantics
(module 01-08 — methods, status codes, headers) are byte-for-byte the same
over HTTPS as over HTTP, proving TLS is transparent to HTTP; (b) show your
server's certificate's subject, issuer, and validity window and explain
which handshake step checks each; (c) explain, referencing where TLS
*terminates* (module 00's proxy layer) and the `X-Forwarded-Proto` header
(module 02), how a load-balanced production app would know a request
originally arrived over HTTPS even though the app itself received plain
HTTP; and (d) state one thing an eavesdropper *can* still learn about your
HTTPS traffic despite encryption. Reference SNI and the `Host` header
(module 01) parallel by name.

<details>
<summary>Hint</summary>

For (a), run the same `curl -sD - -o /dev/null` against the HTTP and HTTPS
versions of an endpoint and diff the status line + headers — identical.
For (c), the pattern is: TLS terminates at the LB/proxy, which sets
`X-Forwarded-Proto: https` before forwarding plain HTTP to the app; the app
reads that header to know the original scheme. For (d), the destination IP
(and, unless encrypted-SNI is used, the hostname via SNI) is visible even
though the content is not.

</details>

## Common mistakes & troubleshooting

- **Thinking HTTPS is a different protocol.** It's HTTP inside a TLS
  tunnel; the HTTP semantics are unchanged. TLS sits between TCP and HTTP.
- **Using `curl -k` (or disabling verification in code) as a "fix."** It
  throws away authentication and enables man-in-the-middle attacks. Fix the
  cert/chain instead.
- **Believing the padlock means the site is trustworthy.** It means
  encrypted + authenticated identity, nothing about honesty. Scam sites can
  have valid certs.
- **Forgetting certs expire.** Unmonitored expiry is a top cause of sudden
  total outages. Automate renewal and alert on upcoming expiry.
- **Incomplete chain (missing intermediate).** `unable to verify the first
  certificate` usually means the server didn't send the intermediate cert;
  clients can't build the chain to a trusted root. Configure the full
  chain.
- **Hostname mismatch.** A valid cert for the wrong domain still fails.
  The cert must cover the exact hostname (or via a wildcard/SAN).
- **Assuming the app sees HTTPS when TLS terminates at a proxy.** The app
  gets plain HTTP; trust `X-Forwarded-Proto` (from a proxy you control) to
  learn the original scheme.
- **Confusing SSL and TLS.** "SSL certificate"/"SSL termination" mean TLS
  today; actual SSL 2/3 are disabled and insecure.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the precise relationship between HTTP, HTTPS, TLS, and TCP?
   Where in the stack does TLS sit?
2. Name the three guarantees TLS provides, and two things it explicitly
   does *not* protect.
3. What does a certificate bind together, who signs it, and what is the
   "chain of trust"?
4. During the handshake, name three things the client checks about the
   server's certificate before trusting it.
5. What does SNI do, and which HTTP/1.1 header is it the TLS-layer parallel
   of?
6. Your production app receives plain `http://` internally but users
   connect via `https://`. Explain where TLS terminated and how the app can
   still know the original request was HTTPS.
7. Why is `curl -k` acceptable for a quick local debug but dangerous in
   real client code?
8. A previously-working API suddenly rejects all clients at 00:00 with a
   TLS error. What's the most likely single cause, and how do you confirm
   it?

<details>
<summary>Answers</summary>

1. HTTPS *is* HTTP running over TLS. TLS sits between TCP (below) and HTTP
   (above): TCP carries bytes, TLS encrypts/authenticates them, and the
   unchanged HTTP messages flow inside the TLS tunnel.
2. Provides: confidentiality (encryption), integrity (tamper detection),
   and server authentication (you're talking to the real host). Does not:
   hide *which* server/IP (or hostname via SNI) you connected to, and does
   not vouch that the site is trustworthy/safe (only that it's who it
   claims).
3. A certificate binds a public key to an identity (a domain name); it's
   signed by a Certificate Authority (CA). The chain of trust is the
   sequence of signatures from the server (leaf) cert through
   intermediate CA cert(s) up to a root CA already trusted in the client's
   trust store.
4. Any three: that the chain validates up to a trusted root CA; that the
   hostname matches the cert's subject/SAN; and that the current time is
   within the cert's validity window (not expired / not-yet-valid). (Also:
   not revoked.)
5. SNI (Server Name Indication) tells the server, during the handshake,
   which hostname the client wants, so a server with many domains on one IP
   presents the right certificate. It's the TLS-layer parallel of the
   HTTP/1.1 `Host` header (module 01).
6. TLS terminated at the load balancer/reverse proxy, which decrypted and
   forwarded plain HTTP to the app over the internal network. The proxy
   sets `X-Forwarded-Proto: https`, which the app reads to know the
   original scheme was HTTPS.
7. `-k` skips certificate verification, so for a local self-signed cert
   it's a convenient debugging shortcut. In real code it removes the
   authentication guarantee — an attacker could present any cert as a
   man-in-the-middle and you'd accept it.
8. An expired certificate (its `notAfter` passed, likely a failed
   auto-renewal). Confirm with `openssl x509 -noout -dates` (or `openssl
   s_client ... | openssl x509 -noout -dates`) and check `notAfter`.

</details>

## Further reading & sources

- [MDN: Transport Layer Security (TLS)](https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security) - the overview of what TLS provides and how HTTPS layers on it.
- [RFC 8446: TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446) - the authoritative spec for the modern handshake and forward secrecy.
- [Cloudflare: What happens in a TLS handshake?](https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/) - a step-by-step visual walkthrough of the handshake in Concepts.
- [MDN: Strict-Transport-Security (HSTS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) - the header that forces HTTPS and defeats SSL stripping.
- [Let's Encrypt: How it works](https://letsencrypt.org/how-it-works/) - free automated certificates and the renewal automation that prevents expiry outages.
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/) - practical, secure TLS config for nginx and other servers where TLS terminates.

## Next

[10-routing-fundamentals](../10-routing-fundamentals/README.md) — the
request has arrived, decrypted and understood; now we cover how the server
decides *which code* handles it: routing URLs and methods to handlers.
