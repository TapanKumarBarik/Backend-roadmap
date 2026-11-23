# Lesson 22: Certificates and PKI — Why Your Browser Trusts a Site It Has Never Met

> **Prerequisites:** [Lesson 21: The TLS 1.3 Handshake Step by Step](../21-tls-1-3-handshake/README.md) and [Networking From Zero Overview](../README.md) (Lesson 22 of 30).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Backend, SRE, and DevOps engineers debugging TLS trust chain failures, automating `ACME` certificate issuance, enabling `OCSP` stapling, and implementing service-to-service `mTLS`.  
> **Free PDF Notes:** [Download SD-N-022.pdf](https://backendroadmap.com/notes/system-design/SD-N-022.pdf)

> [!NOTE]
> **In one line:** a certificate binds a name to a public key; browsers trust it by checking signatures up a chain to a root in their trust store, and short-lived certificates with automated renewal (`ACME`) end surprise expiry outages.

> [!TIP]
> **The Golden Rule of PKI & Trust Chains:** Encryption without verified identity just locks traffic for an attacker; **X.509 certificates** bind a hostname in **`SAN`** (not deprecated `CN`) to a public key through a signature chain from an offline **Root CA** in your OS store down through an **Intermediate CA** to your **Leaf certificate**. Always configure servers to serve **`fullchain.pem` (Leaf + Intermediate)**, automate renewals via **`ACME` (`HTTP-01` / `DNS-01`)**, attach **`OCSP` staples**, and enforce **`mTLS`** when internal services must verify each other.

---

## Words You'll Meet Today

| Word | In Plain Words | Role in a Live Backend System |
| :--- | :--- | :--- |
| **X.509 Certificate** | A signed digital passport for a server's public key. | Binds domain names (`SAN`), validity dates, and public key (`SPKI`) via CA signature. |
| **`SAN` (Subject Alt Name)** | Extension listing exact DNS names/IPs a cert covers. | Mandatory hostname check (`api.shop.example`, `*.shop.example`); replaced legacy `CN`. |
| **Root CA** | A master authority baked into your OS/browser store. | Kept air-gapped offline; trusts the Intermediate CAs that sign public web certificates. |
| **Intermediate CA** | An online issuing authority signed by a Root CA. | Signs Leaf certs daily while insulating the Root key; **must be sent by the server**. |
| **`AIA` (Authority Info Access)** | A URL inside a cert pointing to its Intermediate CA. | Browsers fetch missing intermediates via `AIA`; Go, Python, and `curl` do **not**. |
| **`ACME` (`HTTP-01` / `DNS-01`)** | Automated protocol (Let's Encrypt) to prove domain ownership. | Zero-touch 60-day issuance and renewal; `DNS-01` unlocks wildcards and private hosts. |
| **`OCSP` Stapling** | Server attaches a fresh non-revocation proof to TLS. | Proves the cert wasn't revoked without slow, privacy-leaking client lookups to the CA. |
| **`mTLS` (Mutual TLS)** | Both server *and* client present X.509 certificates. | Zero-trust service-to-service identity across Kubernetes, meshes, and B2B webhooks. |

---

## Visual Mental Models & Architecture

### The Question: Why Did Your API Pass Chrome Yet Crash Go, Python, `curl`, and Mobile Apps?

In [Lesson 21](../21-tls-1-3-handshake/README.md), we saw the TLS 1.3 server send `{Certificate}` and `{CertificateVerify}` inside Flight 2. After an Nginx config change, your teammate opens `https://api.example.com` in desktop Chrome—green padlock, zero errors. Ten minutes later, PagerDuty explodes: iOS, Android, Go webhook callers, and `curl` are all throwing `unable to verify the first certificate` (`x509: unknown authority`). Why did Chrome trust a server that every backend client rejected?

### An Everyday Picture First: A Passport Stamped by an Embassy You Already Trust

Imagine meeting a stranger claiming to represent Acme Bank. You've never met them, so you don't trust their business card alone. Instead, they hand you:

1. **Their personal passport (`Leaf Cert`)**, listing their exact name (`SAN`) and photo (`Public Key`), stamped by a regional Passport Office (`Intermediate CA`).
2. **The Passport Office's charter (`Intermediate Cert`)**, stamped by the National Ministry (`Root CA`), whose master seal is already printed in the **official rulebook inside your pocket (`OS Trust Store`)**.

**What happens if they forget to bring paper #2 (the Intermediate Charter)?** A clever border guard (`Desktop Chrome`) reads the return address printed on the passport (`AIA`), remembers seeing that office earlier in their cache, or phones the Ministry to download the charter. An automated airport kiosk (`Go`, `Python`, `curl`, mobile APIs) refuses to make extra network calls—it rejects the incomplete passport on the spot!

### X.509 Certificate Anatomy (`SAN` vs. Deprecated `CN`)

Every TLS certificate follows the **`X.509 v3`** (`RFC 5280`) format and contains:
- **Serial Number & Issuer:** Unique ID and which Intermediate CA signed it.
- **Validity (`Not Before` / `Not After`):** Hard start/expiry timestamps (`UTC`). Public WebPKI caps leaf validity at `398` days (and industry timelines are tightening further toward `47` days), making automation non-negotiable.
- **`SubjectPublicKeyInfo` (`SPKI`):** The server's actual public key (`ECDSA P-256` or `RSA-2048`) and algorithm.
- **Extensions:**
  - **`Subject Alternative Name (SAN)`:** Lists every valid hostname/IP (`DNS:api.example.com`, `DNS:*.example.com`, `IP:10.0.1.5`). **Legacy `CN` (Common Name) is dead**—modern Go (`1.15+`), Chrome, and OpenSSL reject certificates lacking a matching `SAN` even if `CN` matches!
  - **`Key Usage` & `Extended Key Usage (EKU)`:** Constrains purpose (`serverAuth` for HTTPS servers, `clientAuth` for `mTLS` clients).
  - **`Basic Constraints`:** `CA:FALSE` on leaf certs (preventing any website from signing fake certs for other domains!).
  - **`AIA` (`Authority Information Access`):** URL where the signing Intermediate CA cert can be downloaded.
- **Digital Signature:** Signed by the issuing Intermediate CA's private key over all fields above.

### The Chain of Trust & Missing Intermediate Failure Mode

Because a single compromised Root CA key would break the internet, **Root CAs sit offline in vaults** and only sign a handful of **Intermediate CAs** (`R10`, `E6`, etc.). Intermediates sign millions of 90-day leaf certificates.

During TLS Flight 2, your server MUST send **`fullchain.pem`** = `[Leaf Cert, Intermediate Cert(s)]`:
- **Never send only `cert.pem` (Leaf only):** Non-browser clients (`curl`, Go, Python, Java, Node.js, iOS/Android) do **not** follow `AIA` links (`AIA chasing`) for performance and SSRF/latency reasons—they fail immediately with `unknown authority`!
- **Don't append the `Root CA` either:** Clients ignore server-sent roots anyway (they only trust roots baked into their local OS/Mozilla/container store), so appending the root just bloats Flight 2 by `~1.5 KB` unnecessarily.

```mermaid
flowchart TD
    R["Root CA (In OS / Browser Trust Store - Offline Vault)"] -->|"Signs Intermediate"| I["Intermediate CA (Sent on Wire in fullchain.pem!)"]
    I -->|"Signs Leaf Cert"| L["Leaf Cert: SAN=api.shop.example, SPKI=PubKey, NotAfter=90d"]
    L -->|"Missing Intermediate on Wire?"| C{"Which TLS Client Connects?"}
    C -->|"Desktop Chrome"| CH["Checks Cache or Fetches AIA URL -> Passes Silently!"]
    C -->|"curl / Go / Python / iOS"| API["No AIA Chasing -> CRASHES: unknown authority!"]
```

*Figure 1. The X.509 Chain of Trust and why omitting the Intermediate CA causes a deceptive split outage: desktop browsers work around missing intermediates via cache/`AIA`, while API clients fail hard.*

### Automated Issuance with `ACME` (`HTTP-01` vs. `DNS-01`)

Manual certificate spreadsheets guarantee midnight expiry outages. **`ACME` (`RFC 8555`, e.g., Let's Encrypt, ZeroSSL, Step-CA)** automates issuance and renewal (`60`-day auto-renew for `90`-day certs) via domain-control challenges:

1. **`HTTP-01` Challenge:** The ACME CA asks your agent (`Certbot`, `cert-manager`, `Caddy`) to host a random token at `http://api.example.com/.well-known/acme-challenge/<token>` on TCP port **`80`**.
   - *Pros:* Zero DNS API credentials needed.
   - *Limitations:* **Cannot issue wildcard certs (`*.example.com`)**, requires public port `80` reachability, and fails for internal VPC-only domains.
2. **`DNS-01` Challenge:** The ACME agent calls your DNS provider API to publish a **`TXT` record** at `_acme-challenge.api.example.com`.
   - *Pros:* **Issues wildcard certs (`*.example.com`)** and works for completely **private/air-gapped internal services** with zero public HTTP ports!
   - *Caveat:* Requires scoped DNS-write credentials (delegate `_acme-challenge` via `CNAME` to a dedicated restricted zone to limit blast radius).

### Revocation: `CRL` vs. `OCSP` vs. `OCSP Stapling`

What if a private key leaks before `Not After` expires? CAs maintain revocation status, delivered in three ways:
- **`CRL` (Certificate Revocation List):** Giant signed list of revoked serial numbers downloaded periodically—grew to tens of megabytes and went stale between downloads.
- **Online `OCSP` (Online Certificate Status Protocol):** Client queries the CA's OCSP HTTP server live during the TLS handshake. Slow (`+1–2` RTTs), leaks every site you visit to the CA, and breaks whenever the CA's responder goes down (`fail-open` soft checks defeat security!).
- **`OCSP Stapling` (`RFC 6066` / `RFC 6961`):** Your **web server** fetches the CA-signed, timestamped OCSP response (`valid ~7 days`) in the background and **staples it directly inside TLS Flight 2**. Zero extra client RTT, zero privacy leak! *(Modern WebPKI is also moving toward ultra-short `6–47` day ACME certificates + browser-pushed CRLite filters, reducing reliance on live OCSP altogether.)*

### Mutual TLS (`mTLS`) Between Services

Standard TLS proves **only the server's identity**. In zero-trust microservice meshes (`Envoy`/`Istio`, Kafka, PostgreSQL, B2B webhooks), **`mTLS`** forces **both sides** to authenticate cryptographically inside the handshake:
- In TLS 1.3 Flight 2, the server appends **`{CertificateRequest}`** (inside the encrypted handshake!).
- In Flight 3, the client replies with its own **`{Certificate}`** (`EKU: clientAuth`, e.g., SPIFFE ID `spiffe://prod/ns/billing/sa/worker`) and **`{CertificateVerify}`** signature proving it holds the client private key!

```mermaid
sequenceDiagram
    participant C as Service A (mTLS Client)
    participant S as Service B (mTLS Server)

    C->>S: ClientHello (key_share X25519, SNI, ALPN)
    S-->>C: ServerHello + [Encrypted: CertificateRequest, ServerCert, CertificateVerify, Finished]
    Note over C: Verifies ServerCert chain + Server SAN against Trusted Root CA
    C->>S: [Encrypted: ClientCert (EKU clientAuth), Client CertificateVerify, Finished + HTTP POST]
    Note over S: Verifies ClientCert chain + SPIFFE SAN + Client Signature!
    S-->>C: [Encrypted: 200 OK JSON]
```

*Figure 2. Mutual TLS (`mTLS`) over TLS 1.3: the server requests a client certificate inside Flight 2, and the client authenticates with its own certificate and `CertificateVerify` signature before HTTP traffic flows.*

---

## Systematic Reference & Comparison Grid

### Chain Files & PKI Artifacts

| Artifact / Cert Role | Stored Where? | Sent on TLS Wire? | Typical Validity | Failure Mode If Misconfigured |
| :--- | :--- | :--- | :--- | :--- |
| **Root CA** | OS / Browser / Container `ca-certificates` | **No** (wastes bytes; ignored) | `10–25 years` | Missing in stripped `scratch` containers -> TLS fails |
| **Intermediate CA** | Web server / Load Balancer `fullchain.pem` | **Yes** (after leaf) | `3–5 years` | Omitted -> Chrome passes (`AIA`), APIs/mobile crash |
| **Leaf Certificate** | Web server / Ingress `fullchain.pem` | **Yes** (position `0`) | `47–90 days` (`398 d` max) | Expired or missing `SAN` -> total HTTPS outage |
| **Private Key (`.key`)** | Server RAM / KMS / HSM (`0600` perms) | **Never** | Rotated with leaf | Leaked -> attacker impersonates server (`revoke!`) |

### `ACME` Challenge Types (`RFC 8555`)

| Challenge | Verification Vector | Wildcards (`*.domain`)? | Private / Firewalled Hosts? | Key Security Consideration |
| :--- | :--- | :--- | :--- | :--- |
| **`HTTP-01`** | `GET http://<host>/.well-known/acme-challenge/<tok>` | **No** | **No** (needs port `80` public) | Must disable HTTPS redirects on `/.well-known/` or pass through |
| **`DNS-01`** | `TXT _acme-challenge.<domain>` | **Yes** | **Yes** (zero open ports) | Delegate `_acme-challenge` via `CNAME` to isolate DNS API tokens |
| **`TLS-ALPN-01`** | TLS port `443` with `acme-tls/1` ALPN | **No** | **No** (needs port `443` public) | Useful when port `80` is blocked by compliance policies |

### Revocation Check Approaches Compared

| Mechanism | Extra Client Handshake RTT? | Leaks Browsing History to CA? | Fail-Open Risk? | Current Industry Direction |
| :--- | :--- | :--- | :--- | :--- |
| **`CRL` Download** | Periodic background download | Minimal | Stale until refresh | Used inside browsers via compressed `CRLite` / `CRLSets` |
| **Online `OCSP`** | **Yes (`+1–2 RTT`)** | **Yes** | High (soft-fail defaults) | Deprecated by major CAs (`Let's Encrypt` ending OCSP in favor of CRLs/short certs) |
| **`OCSP Stapling`** | **Zero** (`0 RTT`) | **No** | Safe with `Must-Staple` | Best practice when server OCSP responders are active |
| **Short-Lived Certs (`7–47 d`)** | **Zero** (`0 RTT`) | **No** | **Eliminated** via rapid expiry | Gold standard in automated cloud & `SPIFFE` `mTLS` meshes |

---

## Core Definition & Taxonomic Comparison

**An X.509 certificate is a signed document that binds a name to a public key.** A browser (or SDK) trusts it only when every link in the chain verifies: leaf signed by intermediate, intermediate signed by a **root already in the client's trust store**, hostname matches a `SAN`, dates are valid, the cert is not revoked, and the server proves possession of the matching private key via `CertificateVerify`. **What it is not:** a certificate is not encryption by itself, not a guarantee the site is safe, and not something you can omit the intermediate for just because Chrome still works.

| Term | Precise Meaning | Production Example |
| :--- | :--- | :--- |
| **Leaf** vs. **Intermediate** vs. **Root** | Leaf = your site's cert (sent first). Intermediate = online issuing CA (must be sent). Root = offline trust anchor (already on the device; never send it). | Serve `fullchain.pem` = leaf + intermediate; root lives in `/etc/ssl/certs`. |
| **`SAN`** vs. **`CN`** | `SAN` lists typed identities (`DNS:`, `IP:`). Legacy `CN` is ignored by modern Go/Chrome/OpenSSL. | `DNS:api.shop.example` + `DNS:*.shop.example` (one label only; `a.b.shop.example` is **not** covered). |
| **`SNI`** vs. **certificate name** | `SNI` is the plaintext hostname in `ClientHello` so a multi-tenant IP can pick which cert to send. The cert's `SAN` is what the client then validates. | One LB IP hosts `a.example`, `b.example`, `c.example`; wrong/missing `SNI` yields the default cert and `ERR_CERT_COMMON_NAME_INVALID`. |
| **One-way TLS** vs. **`mTLS`** | One-way: only the server presents a cert. `mTLS`: both sides present certs; the server also sends `CertificateRequest`. | Public website = one-way. Mesh `payments` accepting only `spiffe://…/orders` = `mTLS` + `SAN` allowlist. |
| **`HTTP-01`** vs. **`DNS-01`** | `HTTP-01` serves a token on port 80. `DNS-01` writes a `_acme-challenge` TXT (required for wildcards and firewalled hosts). | Public apex → `HTTP-01`. `*.internal.example.com` → `DNS-01`. |

**Business impact.** Certificate mistakes are binary outages: every HTTPS client fails at once. Manual yearly renewals guarantee calendar-driven SEV-1s; short lifetimes plus `ACME` automation shrink both the stolen-key window and the human-error window.

---

## Component Anatomy & The Observability Gap

### Anatomy of the Trust Chain (What the Server Must Send)

```text
 SENT BY THE SERVER IN THE HANDSHAKE          ALREADY ON THE DEVICE (trust store)
 +----------------------------------+         +----------------------------------+
 | Leaf certificate                 |         | Root X (self-signed)             |
 |   SAN: shop.example.com          |  signs  |   public key                     |
 |   public key                     | <------ |   lives in OS / browser store    |
 |   valid 90 days                  |         |   kept offline / HSM             |
 |   issuer: Intermediate R         |         +----------------------------------+
 +----------------------------------+                      ^
 | Intermediate R                   |                      | signs
 |   public key                     | ---------------------+
 |   issuer: Root X                 |
 +----------------------------------+
 Browser checks: signatures up the chain | SAN match | dates | not revoked | CertificateVerify (owns key)
```

*The root is never sent. Omitting the intermediate is the #1 production chain bug: Chrome may hide it via `AIA`/cache; `curl`, Go, Python, and mobile SDKs do not.*

### The Observability Gap: Where Cert Health Hides

| Vantage Point | What It Captures | What It Hides |
| :--- | :--- | :--- |
| **Desktop Chrome padlock** | Successful validation *for that browser*, often after `AIA` fetch or cached intermediate. | Programmatic clients (`curl`, Go, iOS) that never chase `AIA`. |
| **HTTP access / `5xx` dashboards** | Only requests that **finished** the handshake. | Failed handshakes (expired cert, incomplete chain, `SAN` mismatch) never become HTTP—they are invisible as `5xx`. |
| **`openssl s_client -showcerts` / synthetic probes** | Exact chain depth, `notAfter`, stapled OCSP, negotiated cipher. | Whether *every* edge PoP / region serves the same chain. |
| **ACME / cert-manager logs** | Issuance success, challenge failures, Secret updates. | Whether the *running* Ingress/LB reloaded the new Secret. |
| **Metrics to add** | Days-to-`notAfter` per endpoint (alert `< 14` days), incomplete-chain rate, `mTLS` handshake failure by `SAN`, OCSP staple age. | Nothing: they separate "Chrome looks fine" from "APIs are dark". |

---

## Mathematical Model of Certificate Lifetimes, Renewal Windows & Fleet Load

### 1. Renewal Window on a 90-Day Certificate

Let's Encrypt leaves typically last $L = 90$ days. Renew when $\frac{1}{3}$ of lifetime remains (cert-manager default):

$$t_{\text{renew}} = L - \frac{L}{3} = 60\text{ days into life},\qquad W_{\text{retry}} = \frac{L}{3} = 30\text{ days}$$

Alert when remaining life drops below $14$ days—that means automation has already been failing for roughly two weeks:

$$\text{Alert if}\quad \text{notAfter} - \text{now} < 14\text{ days}$$

| Lifetime $L$ | Renew-at remaining | Retry window | Critical alert |
| :--- | :--- | :--- | :--- |
| `90 d` (classic LE) | `30 d` left | `30 d` | `< 14 d` |
| `47 d` (tightening industry) | `~16 d` left | `~16 d` | `< 7 d` |
| `7 d` (short-lived / mesh) | continuous ACME | hours | `< 1 d` |
| `365 d` (manual legacy) | calendar guess | days of human lag | usually **too late** |

### 2. Worked Example: 40 Domains, Manual vs Automated

Manual 1-year certificates: $\approx 40$ renewals/year, each a chance to forget.

ACME 90-day certs renewed at 30 days left:

$$N_{\text{renewals/year}} = 40 \times \frac{365}{60} \approx 243\quad\text{(every ~60 days per domain)}$$

All automatic, each with a **30-day** retry window. Monitor `notAfter` for every public endpoint; page when any is under 14 days.

### 3. Stolen-Key Exposure Window

Revocation checking soft-fails in many clients, so a leaked private key stays usable until expiry:

$$E_{\text{exposure}} \approx L_{\text{remaining}} \le L$$

| Leaf lifetime | Max useful life of a stolen key | Operational consequence |
| :--- | :--- | :--- |
| `1–2 years` (legacy) | years | Manual CRLs/OCSP must work; they often don't |
| `90 days` | weeks | Forces automation; shrinks breach blast |
| `7–47 days` | days | Gold standard when issuance is fully automated |
| Mesh `24 h` SPIFFE | hours | Compromise self-heals overnight |

### 4. Chain Flight Size vs. TCP Initial Window

A leaf + one intermediate is typically $1.5\text{–}5$ KB. TCP initial window $\text{IW10} \approx 10 \times 1{,}460 = 14{,}600$ B. Keep the certificate flight under one IW so handshake Flight 2 does not stall an extra RTT:

$$\text{Flight}_2 \approx |\text{ServerHello}| + |\text{Cert chain}| + |\text{CertificateVerify}| + |\text{Finished}| \ll 14.6\text{ KB}$$

ECDSA P-256 chains are smaller and faster to verify than RSA-2048—pair short chains with [Lesson 21](../21-tls-1-3-handshake/README.md) handshake CPU math.

### 5. Compounding: Incomplete Chain Across Client Types

If a fraction $p$ of clients chase `AIA` (desktop browsers) and $1-p$ do not (SDKs, mobile, containers):

$$P(\text{outage visible in Chrome}) \approx 0,\qquad P(\text{outage for backend clients}) = 1$$

Shipping only the leaf makes staging "green" while production APIs are `100%` dark—exactly the war story below.

---

## Production War Story Post-Mortem: Staging Passed Chrome, Production Crashed Every Webhook & Mobile App

- **Severity:** SEV-1 (28-Minute Total Mobile API & Webhook Blackout)
- **Detection / Resolution Time:** 12 minutes to diagnose `cert.pem` vs `fullchain.pem`; 28 minutes to roll corrected Ingress Secret across clusters
- **Impact:** After migrating an ingress controller, engineers opened `https://api.shop.example/health` in Chrome, saw a green padlock, and signed off on the rollout. Instantly, `100%` of iOS/Android clients, Stripe webhook deliveries, and partner Go microservices failed TLS handshakes with `unable to verify the first certificate`.

### What Happened

```mermaid
sequenceDiagram
    participant Chrome as Engineer Desktop Chrome
    participant GoAPI as Partner Go Webhook Client
    participant Ingress as Nginx Ingress (Served Leaf cert.pem Only)
    participant AIA as CA AIA HTTP Endpoint

    Chrome->>Ingress: TLS ClientHello
    Ingress-->>Chrome: Sends Leaf Cert ONLY (Missing Intermediate!)
    Note over Chrome: Checks local cache or fetches Intermediate via AIA URL
    Chrome->>AIA: GET http://r10.i.lencr.org/
    AIA-->>Chrome: Returns Intermediate R10 Cert
    Note over Chrome: Green padlock! Engineer marks deploy healthy!
    GoAPI->>Ingress: TLS ClientHello
    Ingress-->>GoAPI: Sends Leaf Cert ONLY (Missing Intermediate!)
    Note over GoAPI: Does NOT perform AIA chasing -> Fails immediately!
    GoAPI--xIngress: x509 certificate signed by unknown authority (100% Outage)
```

### Root Cause Analysis

1. **Serving `cert.pem` Instead of `fullchain.pem`:** The Terraform/Helm template mapped `tls.crt` to the leaf certificate alone, omitting the Intermediate CA certificate (`R10`).
2. **False Confidence from Desktop Browser Validation:** Because desktop Chrome caches intermediates globally and falls back to `AIA` HTTP fetching, testing solely in a browser masked a completely broken TLS chain for all programmatic TLS clients.
3. **Stripped Container Images Missing Root Stores:** Simultaneously, two internal Go sidecars built `FROM scratch` without copying `/etc/ssl/certs/ca-certificates.crt`, guaranteeing failure even with a complete chain.

### The Fix & Architectural Hardening

- **Automated CI Chain Gate:** Added an OpenSSL/Go chain verification job in CI (`openssl s_client` / `verify_chain` rejecting `AIA`) that blocks deploys unless `PeerCertificates` includes a complete Leaf + Intermediate chain validating cleanly against stock Mozilla roots.
- **`ca-certificates` Baseline & `< 14`-Day Expiry Alerts:** Baked updated root bundles into minimal `distroless`/`alpine` images and exported Prometheus alerts firing at `21` days (`warning`) and `14` days (`critical`) before `NotAfter`.

---

## Multi-Language Production Implementation

Below is a production-structured **X.509 Certificate Chain, `SAN`, & `< 14`-Day Expiry Inspector** across Go, TypeScript, Python, and C# that checks whether the server supplies an intermediate chain (without relying on browser `AIA` chasing!), validates `SAN` matching, and flags expiring certs early.

````carousel
```go
package pkicheck

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"time"
)

type AuditReport struct {
	Host          string; ChainLen int; SANs []string
	DaysLeft      float64; MissingInterm, ExpiringSoon bool
}

func InspectCert(host, port string, warnDays int) (*AuditReport, error) {
	// Skip dial abort so manual x509.Verify reports exact chain/SAN/expiry faults.
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", net.JoinHostPort(host, port),
		&tls.Config{ServerName: host, InsecureSkipVerify: true})
	if err != nil { return nil, err }
	defer conn.Close()

	certs := conn.ConnectionState().PeerCertificates
	leaf, interms := certs[0], x509.NewCertPool()
	for _, c := range certs[1:] { interms.AddCert(c) }
	_, vErr := leaf.Verify(x509.VerifyOptions{DNSName: host, Intermediates: interms})
	days := time.Until(leaf.NotAfter).Hours() / 24.0
	rep := &AuditReport{host, len(certs), leaf.DNSNames, days, len(certs) < 2 && vErr != nil, days < float64(warnDays)}
	if vErr != nil { return rep, fmt.Errorf("verify failed: %w", vErr) }
	return rep, nil
}
```
<!-- slide -->
```typescript
import tls, { type DetailedPeerCertificate } from "node:tls";

export function inspectCertChain(host: string, port = 443, warnDays = 14) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      let cur: DetailedPeerCertificate | undefined = sock.getPeerCertificate(true);
      const chain: DetailedPeerCertificate[] = [];
      const seen = new Set<string>();
      while (cur?.fingerprint256 && !seen.has(cur.fingerprint256)) {
        seen.add(cur.fingerprint256); chain.push(cur); cur = cur.issuerCertificate;
      }
      const leaf = chain[0];
      const daysLeft = (new Date(leaf.valid_to).getTime() - Date.now()) / 86_400_000;
      const sans = (leaf.subjectaltname ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      sock.end();
      resolve({
        host, authorized: sock.authorized, error: sock.authorizationError ?? null,
        chainDepth: chain.length, missingIntermediate: chain.length < 2 && !sock.authorized,
        sans, daysRemaining: Math.round(daysLeft * 10) / 10, expiringSoon: daysLeft < warnDays,
      });
    });
    sock.on("error", reject);
  });
}
```
<!-- slide -->
```python
from datetime import datetime, timezone
import socket, ssl

def audit_tls_certificate(host: str, port: int = 443, warn_days: int = 14) -> dict[str, object]:
    ctx = ssl.create_default_context()  # Strict system roots + SAN check, zero AIA chasing
    try:
        with socket.create_connection((host, port), timeout=5.0) as tcp:
            with ctx.wrap_socket(tcp, server_hostname=host) as tls_sock:
                cert = tls_sock.getpeercert()
    except ssl.SSLCertVerificationError as exc:
        return {"host": host, "trusted": False, "error": str(exc), "expiring_soon": None}

    days = (ssl.cert_time_to_seconds(cert["notAfter"]) - datetime.now(timezone.utc).timestamp()) / 86400.0
    sans = [val for kind, val in cert.get("subjectAltName", ()) if kind == "DNS"]
    return {"host": host, "trusted": True, "sans": sans, "days_remaining": round(days, 1), "expiring_soon": days < warn_days}
```
<!-- slide -->
```csharp
using System;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Threading.Tasks;

public sealed record CertAudit(string Host, bool Trusted, int Depth, bool MissingInterm, double DaysLeft, bool ExpiringSoon, string Errors);

public static class CertificateAuditor
{
    public static async Task<CertAudit> InspectAsync(string host, int port = 443, int warnDays = 14)
    {
        CertAudit? report = null;
        using var tcp = new TcpClient();
        await tcp.ConnectAsync(host, port);
        await using var ssl = new SslStream(tcp.GetStream(), false, (_, cert, chain, errs) =>
        {
            var leaf = new X509Certificate2(cert!);
            double days = (leaf.NotAfter.ToUniversalTime() - DateTime.UtcNow).TotalDays;
            int depth = chain?.ChainElements.Count ?? 0;
            report = new(host, errs == SslPolicyErrors.None, depth, depth < 2 && errs != 0, Math.Round(days, 1), days < warnDays, errs.ToString());
            return true; // Audit callback preserves full diagnostic report
        });
        await ssl.AuthenticateAsClientAsync(host);
        return report!;
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

### 1. Inspect Full Certificate Chain Depth, `OCSP Stapling`, and Verify Code

```bash
openssl s_client -connect example.com:443 -servername example.com -showcerts -status < /dev/null
```

**Expected Output:**

```text
Certificate chain
 0 s:CN = *.example.com
   i:C = US, O = DigiCert Inc, CN = DigiCert Global G3 TLS ECC SHA384 2020 CA1
 1 s:C = US, O = DigiCert Inc, CN = DigiCert Global G3 TLS ECC SHA384 2020 CA1
   i:C = US, O = DigiCert Inc, OU = www.digicert.com, CN = DigiCert Global Root G3
...
OCSP response:
======================================
OCSP Response Data:
    OCSP Response Status: successful (0x0)
    Cert Status: good
...
    Verify return code: 0 (ok)
```

Look for **at least `0` (Leaf) and `1` (Intermediate)** in `Certificate chain`, `Verify return code: 0 (ok)`, and `OCSP Response Status: successful`. If you only see `0 s:...` and `Verify return code: 21 (unable to verify the first certificate)`, the server forgot its Intermediate CA!

### 2. Inspect `SAN`s, Expiry Dates, `AIA`, and `Basic Constraints`

```bash
openssl s_client -connect example.com:443 -servername example.com < /dev/null 2>/dev/null | \
  openssl x509 -noout -dates -ext subjectAltName,authorityInfoAccess,basicConstraints
```

**Expected Output:**

```text
notBefore=Jan 15 00:00:00 2026 GMT
notAfter=Jan 15 23:59:59 2027 GMT
X509v3 Subject Alternative Name:
    DNS:*.example.com, DNS:example.com
Authority Information Access:
    CA Issuers - URI:http://cacerts.digicert.com/DigiCertGlobalG3TLSECCSHA3842020CA1-1.crt
X509v3 Basic Constraints: critical
    CA:FALSE
```

### 3. Verify a Local `fullchain.pem` File Against System Roots Before Deploying

```bash
openssl verify -untrusted intermediate.pem leaf.pem
```

**Expected Output:**

```text
leaf.pem: OK
```

---

## Pause and Think

> [!exercise] You configure Nginx with `ssl_certificate cert.pem` (just your leaf certificate) instead of `fullchain.pem`. When you test on your laptop Chrome, it loads smoothly with a padlock, yet `curl`, Python `requests`, and iOS crash with `unable to get local issuer certificate`. Why—and why shouldn't you fix it by appending the `Root CA` certificate to `fullchain.pem` as well? Decide before you open the answer.

<details><summary>Answer</summary>

Chrome maintains a local intermediate cache and performs **`AIA` chasing** (downloading the missing Intermediate CA over HTTP from the URL embedded in the leaf cert's `AIA` extension). Non-browser TLS stacks (`curl`, Go, Python, mobile SDKs) intentionally skip `AIA` network fetches during handshakes, so without the Intermediate CA sent on the wire, they cannot link your leaf cert up to a trusted `Root CA`.

Don't append the `Root CA` to `fullchain.pem`: clients only trust roots stored locally in their own OS/browser trust store anyway, so sending the Root CA over the wire wastes ~1.5 KB inside every cold TLS handshake.

</details>

---

## Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Automating Wildcard & Private VPC Certificates with `ACME`</strong></summary>

**Scenario:** Your platform team needs a wildcard TLS certificate `*.internal.shop.example` for private Kubernetes services unreachable from the public internet (`port 80` blocked). `Certbot --nginx` (`HTTP-01`) keeps failing with connection timeouts. Which challenge should you switch to, and how do you limit DNS credential blast radius?

**Solution:**
Switch to the **`DNS-01`** challenge (`RFC 8555`), which is the *only* ACME challenge supporting wildcard (`*.domain`) names and completely private hosts without inbound port `80`/`443`. To avoid granting your Kubernetes cluster full write access to your main production DNS zone, `CNAME` `_acme-challenge.internal.shop.example` to a separate low-privilege validation zone (`_acme.acme-auth.example`) and scope the ACME API token exclusively to that validation zone.

</details>

<details><summary><strong>Checkpoint 2: Legacy `CN`-Only Internal Cert Rejected by Modern Services</strong></summary>

**Scenario:** After upgrading your Go microservice runtime (`Go 1.15+`), internal HTTPS requests to a legacy self-signed Postgres proxy start failing with `x509: certificate relies on legacy Common Name field, use SANs instead`. What field is missing, and how do you regenerate the cert cleanly?

**Solution:**
Modern TLS implementations (`RFC 2818`, Go `1.15+`, Chrome, OpenSSL `3.x`) ignore the `Subject CN` field completely during hostname matching and require **`Subject Alternative Name (SAN)`**. Regenerate the leaf certificate with `subjectAltName = DNS:pg-proxy.internal, IP:10.4.2.10` inside the X.509 v3 extensions and reissue via your internal CA (`Step-CA` / `Vault PKI`).

</details>

<details><summary><strong>Checkpoint 3: Designing Zero-Trust `mTLS` Between Microservices</strong></summary>

**Scenario:** Service A (`billing-api`) calls Service B (`ledger-core`) over an internal network. You enable `mTLS`, yet forget to validate the client certificate's identity (`SAN` / `SPIFFE ID`) on Service B—checking only that the client cert is signed by your company's internal Root CA. Why is that still dangerous, and what must Service B enforce?

**Solution:**
If Service B trusts *any* certificate signed by your internal Root CA, then a compromised `marketing-blog` pod holding a valid internal certificate from the same CA can call `ledger-core` directly! Service B must:
1. Verify **`Extended Key Usage` includes `clientAuth`**.
2. Inspect the verified client certificate's **`SAN` / `URI` (`spiffe://prod/ns/billing/sa/billing-api`)** against an explicit allowlist before authorizing requests.
3. Automate short-lived `mTLS` cert rotation (e.g., `24`-hour certs via `SPIRE` or `cert-manager`).

</details>

---

## Common Mistakes & Troubleshooting

### What Goes Wrong

- **Deploying `cert.pem` without Intermediate CAs:** Works in QA's desktop browser via `AIA` cache, immediately breaks mobile apps, webhooks, and microservices in production.
- **Putting `Root CA` or empty container root stores:** Bloats handshakes if sending roots, or breaks outbound HTTPS inside `FROM scratch` Docker images lacking `/etc/ssl/certs`.
- **Disabling verification (`InsecureSkipVerify: true` / `NODE_TLS_REJECT_UNAUTHORIZED=0`) in app code:** Silences local dev cert errors, leaks into production, and turns HTTPS into unauthenticated encryption vulnerable to trivial MitM attacks.

### Common Myths

- **"Desktop Chrome loaded the URL cleanly, so our TLS chain is valid."** False. Chrome hides missing Intermediate CAs using `AIA` chasing and caches; always test with `openssl s_client` or `curl`.
- **"Certificates expire cleanly—users just click through a warning."** False. Automated API clients, payment webhooks, and mobile apps crash hard with zero user prompt; treat cert expiry identically to a P0 outage.
- **"Self-signed internal certs are fine if `CN` matches the hostname."** False. Modern runtimes require `SAN`s; `CN`-only certificates fail validation outright.

| Symptom | Root Cause | Fix |
| :--- | :--- | :--- |
| `unable to verify the first certificate` in `curl`/Go/iOS (Chrome works) | Server sends `cert.pem` (leaf only), missing Intermediate CA | Configure server with `fullchain.pem` (`Leaf + Intermediate`) |
| `x509: certificate signed by unknown authority` inside Docker container | Minimal `scratch`/`alpine` container lacks `ca-certificates` bundle | Install `ca-certificates` or mount OS `/etc/ssl/certs` |
| `ERR_CERT_COMMON_NAME_INVALID` despite matching `CN` | Certificate missing `Subject Alternative Name (SAN)` extension | Re-issue cert with `SAN` (`DNS:...` / `IP:...`) |
| `ACME` `HTTP-01` fails for `*.example.com` or private cluster | `HTTP-01` cannot authorize wildcards or closed internal ports | Switch to `ACME` `DNS-01` challenge via TXT records |

---

## Recap in Three Lines

1. X.509 certificates bind a public key to hostnames in **`SAN`** (not `CN`), signed down a trust chain from a pre-installed **`Root CA`** through an **`Intermediate CA`** to your **`Leaf cert`**.
2. Always serve **`fullchain.pem` (Leaf + Intermediate)**—omitting intermediates lets desktop Chrome hide behind `AIA` fetching while crashing backend APIs and mobile clients.
3. Automate renewals with **`ACME` (`HTTP-01` / `DNS-01`)**, attach **`OCSP` staples** (or short-lived certs), and enforce **`mTLS` + `SAN` allowlists** for zero-trust services.

---

## Interview Practice Questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system), and **Tricky** (deep follow-ups). Answer out loud before opening the solution.

<details>
<summary><strong>1. How does a browser trust a certificate? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
It verifies the chain of signatures from the leaf through intermediates to a root CA in its trust store, checks the hostname against the `SAN`, checks validity dates and revocation, and in the handshake confirms the server signs with the matching private key (`CertificateVerify`).

</details>

<details>
<summary><strong>2. What is SNI and why is it needed? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Server Name Indication: the client sends the hostname in the cleartext `ClientHello` so a server (or LB) hosting many domains on one IP can present the matching certificate before encryption starts. Without `SNI` the server guesses a default cert and names mismatch.

</details>

<details>
<summary><strong>3. What is mTLS used for? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Mutual authentication—mostly service-to-service. Both sides present certificates so the server knows exactly which caller is connecting before reading any HTTP. Meshes like Istio/Linkerd issue and rotate short-lived certs automatically (`SPIFFE` IDs).

</details>

<details>
<summary><strong>4. Why did `SAN` replace `CN`? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
`CN` was an ambiguous single string; `SAN` explicitly types every identity (`DNS:`, `IP:`) and supports multiple names. Modern Go, Chrome, and OpenSSL ignore `CN` and reject certificates missing a matching `SAN`. Wildcards cover one label only (`*.example.com` ≠ `a.b.example.com`).

</details>

<details>
<summary><strong>5. Your site went down because a certificate expired. How do you prevent it again? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Automate with `ACME` (certbot, cert-manager, or managed LB certs), renewing at ~30 days left on a 90-day leaf. Monitor `notAfter` for every endpoint and alert below 14 days so failing automation is caught with two weeks to spare. Never rely on a human calendar.

</details>

<details>
<summary><strong>6. You need a certificate for `*.internal.example.com` on servers not reachable from the internet. Which ACME challenge? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
`DNS-01`: create a `TXT` at `_acme-challenge.internal.example.com`. `HTTP-01` needs port 80 reachable from the public internet and cannot issue wildcards.

</details>

<details>
<summary><strong>7. `curl` says `unable to verify the first certificate` but the browser shows the padlock. Why? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
The server isn't sending its intermediate. The browser cached it or fetched it via `AIA`; `curl` and most libraries do not. Configure the server to send the full chain (`leaf + intermediate` / `fullchain.pem`).

</details>

<details>
<summary><strong>8. How does mTLS differ from one-way TLS, and why isn't "signed by our CA" enough? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
One-way authenticates only the server; `mTLS` also requires a client certificate + live signature. CA signature alone lets any internal service impersonate any other—authorize the specific `SAN` / `SPIFFE ID` (and prefer short-lived mesh certs).

</details>

<details>
<summary><strong>9. Why do CAs use intermediates instead of signing leaves with the root? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
The root key stays offline in an HSM so it is hard to steal. If an intermediate is compromised it can be revoked and replaced without updating trust stores on billions of devices (a multi-year process).

</details>

<details>
<summary><strong>10. Why are short certificate lifetimes considered more secure? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Revocation checking is unreliable (browsers often soft-fail), so a stolen key stays usable until expiry. With 90-day or shorter certificates the damage window is weeks, not years—and short lifetimes force automation, which removes human error.

</details>

<details>
<summary><strong>11. What is OCSP stapling, and what two problems does it fix? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Online OCSP adds 1–2 RTTs, leaks browsing history to the CA, and soft-fails when the responder is down. Stapling: the server periodically fetches a CA-signed proof and attaches it in the handshake—zero extra client RTT, no privacy leak. Prefer short-lived certs when OCSP is being retired.

</details>

<details>
<summary><strong>12. What goes wrong with certificate pinning in mobile apps? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Pinning hard-codes which leaf key (or cert) the app trusts. Rotate to a new key the app doesn't know and every installed copy stops connecting until users update. If you pin, pin a backup key too and plan rotation—or pin the CA intermediate instead of the leaf.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                          CERTIFICATES & PKI  —  CHEAT SHEET
====================================================================================================
IN ONE LINE   Cert binds NAME -> public key; client walks signatures to a ROOT already in its trust store

CHAIN         Leaf (sent) <- Intermediate (MUST send) <- Root (on device, NEVER send)
CHECKS        signatures | SAN match | notBefore/notAfter | not revoked | CertificateVerify (owns key)
FILES         fullchain.pem = leaf + intermediate     cert.pem alone = Chrome may pass, curl/Go/mobile FAIL

SNI           plaintext hostname in ClientHello -> pick cert on shared IP     (ECH hides SNI later)
SAN vs CN     SAN is mandatory; CN ignored by modern stacks     *.example.com = ONE label only
ACME          HTTP-01: port 80 token (no wildcards)     DNS-01: TXT (wildcards + private hosts)
RENEW MATH    L=90 d -> renew at 30 d left (W_retry=30 d)     ALERT if notAfter-now < 14 d
EXPOSURE      stolen key useful until expiry -> shorter L shrinks breach window; meshes use ~24 h

mTLS          both sides present certs; authorize SPIFFE/SAN allowlist (CA-only check is insufficient)
OCSP          online = +RTT + privacy leak + soft-fail     staple = 0 RTT     short-lived certs = best
FLIGHT SIZE   keep leaf+intermediate << 14.6 KB (IW10) so Flight 2 fits one RTT; prefer ECDSA chains

OBSERVE       days-to-expiry per endpoint | incomplete-chain probes (no AIA) | mTLS fail by SAN
              failed handshakes NEVER appear in HTTP 5xx dashboards

ANTI-PATTERNS X renew by calendar   X serve leaf without intermediate   X trust CN over SAN
              X pin leaf with no backup   X ACME HTTP-01 for wildcards/private hosts
              X FROM scratch without ca-certificates   X declare healthy from Chrome alone
====================================================================================================
```

---

## Free PDF notes

Download these notes as a printable PDF, with the X.509 chain anatomy diagram, `ACME` comparison, and interview answers: [SD-N-022.pdf](https://backendroadmap.com/notes/system-design/SD-N-022.pdf).

---

## Sources

- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://www.rfc-editor.org/rfc/rfc5280), certificate fields, `SAN`, `Basic Constraints`, `AIA`, and chain validation.
- [RFC 8555: Automatic Certificate Management Environment (`ACME`)](https://www.rfc-editor.org/rfc/rfc8555), automated domain validation (`HTTP-01`, `DNS-01`) and issuance.
- [RFC 6066 & RFC 6961: TLS Certificate Status Request (`OCSP Stapling`)](https://www.rfc-editor.org/rfc/rfc6961), stapling revocation proofs inside TLS handshakes.
- [Let's Encrypt: Chain of Trust & Challenge Types](https://letsencrypt.org/docs/challenge-types/), practical root/intermediate chains and `HTTP-01` vs `DNS-01` tradeoffs.
- [CA/Browser Forum: Baseline Requirements](https://cabforum.org/working-groups/server/baseline-requirements/requirements/), `SAN` mandates and maximum public certificate lifetimes.

---

## Next

Next comes [Lesson 23: HTTP/1.1 vs HTTP/2 vs HTTP/3 and Head-of-Line Blocking](../23-http-1-1-vs-http-2-vs-http-3/README.md): now that our TLS 1.3 tunnel is authenticated and encrypted, how modern HTTP multiplexes dozens of concurrent streams and why QUIC fixes TCP head-of-line blocking. See [the track overview](../README.md) for the whole series.
