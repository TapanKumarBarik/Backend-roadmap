# HTTP, HTTPS & TLS Fundamentals

## Why this matters

HTTP is the language almost every API and web app speaks, and HTTPS (HTTP over TLS) is now the default — which means "TLS handshake failure" and "certificate error" are among the most common problems you'll debug, and they masquerade as everything from "site won't load" to "my container can't call the API." Understanding what an HTTP request actually contains, and exactly what happens during the TLS handshake and certificate validation, lets you separate an application bug from a transport problem from a broken certificate chain in minutes.

## Concepts

### HTTP: request and response over TCP

HTTP is a text-based **application-layer** protocol (module 00) that rides on a TCP connection (module 03). The client sends a **request** and the server sends back a **response** — a simple, stateless exchange. A request has a **method** (verb), a **path**, a set of **headers**, and an optional **body**:

```
GET /index.html HTTP/1.1
Host: example.com
User-Agent: curl/8.0
Accept: */*
```

Common methods: `GET` (fetch), `POST` (submit/create), `PUT` (replace), `PATCH` (partially update), `DELETE` (remove), `HEAD` (fetch headers only). The `Host` header is essential — it tells a server hosting many sites on one IP which one you want (this is **virtual hosting**, and its TLS equivalent, SNI, appears below).

### HTTP responses and status codes

A response has a **status line**, headers, and usually a body:

```
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 1256
```

Status codes group by first digit: **1xx** informational, **2xx** success (`200 OK`, `201 Created`, `204 No Content`), **3xx** redirection (`301` permanent, `302`/`307` temporary — the `Location` header says where), **4xx** client error (`400` bad request, `401` unauthenticated, `403` forbidden, `404` not found, `429` too many requests), **5xx** server error (`500` internal error, `502` bad gateway, `503` unavailable, `504` gateway timeout). Reading the class alone tells you which side to blame: a 4xx is your request's fault, a 5xx is the server's. This distinction matters enormously with load balancers (module 06), where a `502`/`504` typically means the balancer couldn't reach or didn't get a timely reply from a backend.

### Statelessness, headers, and connections

HTTP itself is **stateless** — each request stands alone; the server doesn't inherently remember you. State is layered on with **cookies** (a header the server sets and the browser returns) and **tokens** (e.g. an `Authorization: Bearer ...` header). Headers carry almost everything interesting: content type, caching directives, compression (`Accept-Encoding`), authentication, and more.

HTTP/1.1 keeps the TCP connection open by default (**keep-alive**) so multiple requests reuse one connection, avoiding a fresh three-way handshake each time. HTTP/2 multiplexes many requests over a single connection; HTTP/3 runs over QUIC (which is built on UDP) for lower latency. For this track, focus on the HTTP/1.1 request/response model — the semantics carry over.

### Why HTTPS: what TLS adds

Plain HTTP sends everything in cleartext — anyone on the path can read or modify it. **TLS (Transport Layer Security)** wraps the TCP connection to provide three things: **confidentiality** (encryption, so eavesdroppers see gibberish), **integrity** (tampering is detected), and **authentication** (you can verify you're really talking to `example.com`, not an impostor). "HTTPS" is simply HTTP carried inside a TLS-protected connection, conventionally on port 443. TLS sits between TCP and HTTP: the TCP handshake completes first, then the TLS handshake, then HTTP flows encrypted inside it.

### The TLS handshake and certificates

After TCP connects, TLS negotiates a secure channel (roughly, for TLS 1.2/1.3):

1. **ClientHello** — the client offers its TLS versions, cipher suites, and (crucially) an **SNI** field naming the host it wants (`example.com`), so a server with many certs picks the right one.
2. **ServerHello + certificate** — the server picks parameters and sends its **certificate**, which contains its public key and its identity (domain name), signed by a **Certificate Authority (CA)**.
3. **Key exchange** — both sides derive a shared symmetric session key (modern TLS uses ephemeral Diffie-Hellman for forward secrecy). Asymmetric crypto is used only to bootstrap; the bulk data uses fast symmetric encryption.
4. **Finished** — both confirm, and encrypted application data (your HTTP request) begins.

The **certificate** is the trust anchor. It's a signed document asserting "the holder of this public key is `example.com`," valid between two dates. Your client trusts it only if it can build a **chain** from the server's certificate up through any intermediate CA certificates to a **root CA** that's in the client's trusted **root store** (on Linux, typically `/etc/ssl/certs`). This is why self-signed or unknown-CA certs trigger warnings — the chain doesn't reach a trusted root.

### How certificate validation fails (and why)

Most "TLS handshake failed" and browser cert errors come down to a handful of checks the client makes on the certificate:

- **Name mismatch** — the certificate's names (its Common Name and Subject Alternative Names) don't include the hostname you requested. Connecting to `https://93.184.216.34` directly usually fails this way because the cert is for `example.com`, not the IP.
- **Expired or not-yet-valid** — the current time is outside the cert's validity window. A wrong system clock causes this spuriously.
- **Untrusted issuer** — the chain doesn't reach a root in your trust store (self-signed cert, missing intermediate, or a private CA your machine doesn't know).
- **Incomplete chain** — the server didn't send the intermediate certificate, so the client can't link leaf to root even though the root is trusted.

Each of these is a *validation* failure, distinct from a *connection* failure. If TCP to port 443 succeeds but TLS fails, the network is fine and the problem is the certificate or TLS negotiation — a completely different fix from "the port is unreachable."

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `curl -v` | Makes an HTTP(S) request showing connection, TLS, request, and response details | `curl -v https://example.com` |
| `curl -I` | Fetches only the response headers (HEAD-like) | `curl -I https://example.com` |
| `curl` (options) | Follows redirects, sets methods/headers, ignores cert errors | `curl -sSL -X POST https://example.com` |
| `openssl s_client` | Opens a raw TLS connection and dumps the handshake and certificate | `openssl s_client -connect example.com:443 -servername example.com` |
| `openssl x509` | Parses/prints an X.509 certificate's fields | `openssl x509 -noout -text -in cert.pem` |
| `dig`/`getent` | (from module 02) resolves the name TLS/HTTP will connect to | `getent hosts example.com` |

Flag breakdowns:

- `curl -v https://example.com` — `-v` verbose: prints DNS/connect, the TLS handshake summary (protocol, cipher, cert subject/issuer), request lines (`>`), and response lines (`<`). Your first tool for any HTTP(S) issue.
- `curl -sSL -X POST https://example.com` — `-s` silent (hide progress meter), `-S` still show errors, `-L` follow redirects (3xx), `-X POST` set the method. Combining `-s -S` gives clean output that still surfaces failures.
- `curl -Ik https://self-signed.example` — `-I` headers only; `-k` (insecure) skip certificate validation. Use `-k` only to *confirm* a cert is the problem, never in production.
- `openssl s_client -connect example.com:443 -servername example.com` — `-connect host:port` opens the TLS connection; `-servername example.com` sends SNI so a multi-site server returns the right certificate (omit it and you may get the wrong/default cert). Add `-showcerts` to dump the full chain the server sent.
- `openssl x509 -noout -text -in cert.pem` — `-noout` don't re-print the encoded cert; `-text` print human-readable fields; `-in cert.pem` the input file. Add `-dates` to see just validity, or `-subject`/`-issuer` for names.

## Hands-on exercises

1. **Anatomy of a request.** Run `curl -v https://example.com >/dev/null`. Identify the four phases in order: DNS/TCP connect, TLS handshake (`SSL connection using ...`, cert subject/issuer lines), your request (`>` lines), the response (`<` lines with the status code). Map each to a layer.

2. **Just the headers and status.** Run `curl -I https://example.com`. Read the status line and headers (`Content-Type`, `Server`, caching headers). Expected: `HTTP/... 200 OK` plus headers, no body.

3. **Follow a redirect.** Run `curl -sSL -o /dev/null -w '%{http_code} %{url_effective}\n' http://example.com` and compare with `-s` *without* `-L`. Expected: without `-L` you see a 3xx and a `Location`; with `-L` curl follows it to the final 200 URL.

4. **See the TLS handshake raw.** Run `openssl s_client -connect example.com:443 -servername example.com </dev/null`. Find the certificate chain, the `Verify return code: 0 (ok)` line, and the negotiated protocol/cipher. Expected: a chain ending in a known CA and `verify` OK.

5. **Inspect the certificate.** Pull and read the cert:
   `echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates`.
   Expected: subject (the domain), issuer (the CA), and `notBefore`/`notAfter` dates. Confirm today falls inside the window.

6. **Send different methods.** Against a test endpoint you control or a public echo service, try `curl -X POST -d 'a=1' ...` and `curl -X DELETE ...`, observing the status codes returned. Expected: varying 2xx/4xx depending on what the endpoint allows.

7. **Trigger and read a name mismatch.** Run `curl -v https://wrong.host.badssl.com` (a public test site) or `curl -v https://93.184.216.34`. Expected: a certificate verification error about the hostname not matching the cert. Then add `-k` and watch it succeed — proving the network was fine and only validation failed.

8. **Diagnose and fix: TLS handshake / cert failure.** You run `curl https://expired.badssl.com` and get `certificate has expired`. First rule out a connection problem: `nc -zv expired.badssl.com 443` succeeds and `curl -v` shows TCP connected and the TLS handshake *starting* — so the network and port are fine; the failure is purely certificate validation. Confirm the cause precisely: `echo | openssl s_client -connect expired.badssl.com:443 -servername expired.badssl.com 2>/dev/null | openssl x509 -noout -dates` shows a `notAfter` in the past. **The fix depends on the real cert error** — for expiry, the server operator must renew the certificate (nothing the client can fix); for an *untrusted private CA*, the fix is adding that CA to the client's trust store; for a *name mismatch*, connect using the name on the cert (or reissue the cert with the right SAN). The diagnostic skill is naming *which* of the four validation checks failed, because each has a different owner and fix. (`-k` only masks it — never a real fix.)

9. **Diagnose and fix: check your own clock.** Note that a badly wrong system clock makes *every* cert look expired or not-yet-valid. If many unrelated HTTPS sites suddenly fail cert validation at once, check `date` before blaming the servers — a skewed clock is a classic self-inflicted "all TLS is broken" cause.

## Independent challenge

A service at `https://payments.internal.example` returns `curl: (60) SSL certificate problem` for your teammate but works for you. Devise a diagnosis that determines which of the four validation failures is occurring (name mismatch, expired, untrusted issuer, or incomplete chain) and *why it differs between the two machines*. You must combine this module with **module 03 (TCP/ports)**: before concluding it's a certificate problem, prove that TCP to port 443 actually completes for both of you, so you don't misattribute a firewall-dropped handshake to TLS. Explain what evidence would point to each of the four causes.

<details><summary>Stuck? One hint</summary>

First confirm the transport layer is identical for both: `nc -zv payments.internal.example 443` from each machine — if one times out, it's a module-03 reachability problem, not TLS. Once both reach 443, dump the actual cert with `openssl s_client -connect ... -servername ... -showcerts` on each and compare: an `notAfter` in the past means expired; a `Verify return code` about self-signed/unknown issuer that differs between machines usually means one machine trusts a private CA the other doesn't (check the trust store); a "unable to get local issuer certificate" with a root the client *does* trust points to a missing intermediate (incomplete chain). The fact that it differs per-machine strongly hints at the trust store or a stale/mismatched local root.

</details>

## Common mistakes & troubleshooting

- **Confusing "can't connect" with "cert invalid."** If `nc -zv host 443` succeeds but `curl` fails on the certificate, the network is fine — stop checking firewalls and look at the cert. They're different layers.
- **Forgetting SNI.** Without `-servername` (curl sends it automatically; `openssl s_client` needs it explicitly), a multi-site server may hand back the wrong/default certificate, making you think the cert is misconfigured when it isn't.
- **Using `-k` as a fix.** `-k`/`--insecure` disables validation to *diagnose*, not to solve. Shipping it hides real impersonation risk. Fix the cert or the trust store instead.
- **Ignoring the system clock.** A wrong clock invalidates every certificate (expired or not-yet-valid). Check `date` before assuming servers are at fault.
- **Missing intermediate certificates.** A server that sends only its leaf cert, not the intermediate, fails on some clients and works on others (browsers sometimes cache intermediates). "Works in my browser, fails in curl/containers" is the classic symptom.
- **Reading 4xx vs 5xx backwards.** 4xx = your request is wrong (auth, path, method); 5xx = the server or an upstream failed. Fixing a 401 by restarting the server, or a 502 by editing your request, wastes time.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Where does TLS sit relative to TCP and HTTP, and in what order do their handshakes happen?
2. Name the three guarantees TLS provides and one sentence on each.
3. What is SNI and why does a server hosting many HTTPS sites need it?
4. List the four common certificate validation failures and the different owner/fix for each.
5. A `curl` fails with a certificate error but `nc -zv host 443` succeeds. Which layer is fine, which is at fault, and what should you check?
6. What does a certificate contain, and what does it mean for a chain to be "trusted"?
7. You get a `502 Bad Gateway`. Whose fault is it likely to be, and how does that differ from a `404`?
8. Why does using ephemeral key exchange (forward secrecy) matter even though asymmetric crypto could encrypt the data directly?

<details><summary>Show answers</summary>

1. TLS sits between TCP (below) and HTTP (above). TCP's three-way handshake completes first, then the TLS handshake runs on top of it, then HTTP data flows encrypted inside TLS.
2. Confidentiality (encryption hides the data from eavesdroppers), integrity (tampering in transit is detected), authentication (you can verify the server's identity via its certificate).
3. Server Name Indication — the hostname the client sends in the ClientHello so a server with multiple certificates/sites on one IP knows which certificate to present. Without it the server can't pick the right cert.
4. Name mismatch (connect using the cert's name or reissue with correct SAN — cert owner), expired/not-yet-valid (renew the cert — server operator; or fix your clock), untrusted issuer (add the CA to the client trust store — client owner), incomplete chain (server must send the intermediate — server operator).
5. TCP/transport is fine (port 443 reachable); the fault is TLS/certificate validation at the application layer. Check which validation failed: dump the cert with `openssl s_client`, look at dates, subject/SAN names, and issuer/trust.
6. A certificate contains a public key and an identity (domain names), plus validity dates, signed by a CA. A trusted chain means the client can link the server's cert through intermediate CA certs up to a root CA present in its trust store.
7. A 5xx (`502`) is the server's/upstream's fault — often a load balancer couldn't reach a healthy backend. A `404` is a 4xx, meaning the request asked for something that doesn't exist — a client/request issue. Different side to fix.
8. Ephemeral key exchange means the session key isn't derivable later even if the server's long-term private key is stolen — past recorded traffic stays secret (forward secrecy). Encrypting bulk data directly with the long-term key would expose all past sessions if that key ever leaked.

</details>

## Next

[05 — Routing, NAT & firewalls](../05-routing-nat-and-firewalls/README.md): you've followed a request up through the application layer — now go back down and learn how packets actually choose a path, get their addresses translated, and are permitted or blocked along the way.
