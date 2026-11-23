# Lesson 20: Why Encryption, Public and Private Keys, the Padlock Picture

> **Prerequisites:** [Lesson 19: HTTP Status Codes and Caching](../19-http-status-codes-and-caching/README.md) and [Networking From Zero Overview](../README.md) (Lesson 20 of 30).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Backend engineers securing API traffic, managing TLS/SSH key pairs, reasoning about forward secrecy and MitM attacks, and avoiding broken home-made cryptography.  
> **Free PDF Notes:** [Download SD-N-020.pdf](https://backendroadmap.com/notes/system-design/SD-N-020.pdf)

> [!NOTE]
> **In one line:** Without encryption every packet is a postcard; symmetric encryption (one key) is fast but the key must be shared, public and private keys solve the sharing but are slow, so HTTPS uses both: agree one secret, then encrypt fast with `AES`.

> [!TIP]
> **The Golden Rule of Hybrid Encryption:** Without encryption every packet is a postcard. **Symmetric encryption (`AES` / `ChaCha20`)** is gigabit-fast but suffers the key distribution problem, while **asymmetric public/private keys (`X25519`, `ECDSA`, `RSA`)** solve sharing and signatures at high CPU cost—so TLS 1.3 pairs ephemeral key exchange for **forward secrecy** with fast symmetric `AES` for bulk data.

---

## Words You'll Meet Today

| Word | In Plain Words | Role in a Live Backend System |
| :--- | :--- | :--- |
| **Encryption** | Scrambling data so only the right person can read it. | Turns plaintext HTTP payloads into authenticated ciphertext (`AES-GCM` / `ChaCha20-Poly1305`). |
| **Key** | The secret value that locks and unlocks. | Random `128`/`256`-bit secret feeding symmetric ciphers or `2048`-bit/`256`-bit asymmetric math. |
| **Symmetric** | The same key locks and unlocks (`AES`). | Encrypts gigabytes per second of bulk TLS records once a session secret is established. |
| **Public key** | Half of a key pair that anyone may have. | Distributed inside X.509 server certificates (`TLS`) or `authorized_keys` (`SSH`). |
| **Private key** | The other half, kept only by the owner. | Stored in HSM/KMS or locked down on disk; signs TLS handshakes to prove server identity. |
| **Key exchange** | Both sides compute the same secret without sending it. | `X25519` / `ECDHE` lets client and server derive matching session keys across an untrusted wire. |
| **Signature** | Made with a private key, checked with the public key. | Proves authenticity and integrity in TLS certificates, JWTs (`RS256`/`EdDSA`), and code releases. |
| **Forward secrecy** | Fresh keys per connection, so an old leak can't unlock old traffic. | Ephemeral Diffie-Hellman ensures stealing a server's static private key never decrypts past captures. |

---

## Visual Mental Models & Architecture

### The Question: What Can Someone on the Café Wi-Fi See?

You're on café Wi-Fi and log in to a site over plain HTTP. Anyone on the same network can read your password. Worse, they can change the page before it reaches you. In [lesson 19](../19-http-status-codes-and-caching/README.md) we met status codes and caching; today, why encryption matters and how public and private keys make it work.

### An Everyday Picture First: A Postcard

Without encryption, every packet is a postcard. It passes the café router, your internet provider and many routers after that, and anyone holding it on the way can read it.

![A postcard reading my password: sunny42, and a chain of hops (café router, your internet provider, two routers), each marked can read it.](images/figure-1.svg)

*Figure 1. Without encryption every packet is a postcard: the café router, your internet provider and every router after that can read it.*

Three things can go wrong. Someone **reads** it: privacy. Someone **changes** it: integrity. Someone **pretends** to be your bank: authenticity. Today we fix the first one; lessons 21 and 22 finish the rest.

![Three cards: privacy, someone reads it (today); integrity, someone changes it; authenticity, someone pretends to be your bank (lessons 21 and 22).](images/figure-2.svg)

*Figure 2. Three things can go wrong on the wire: someone reads it (privacy), changes it (integrity), or pretends to be the other side (authenticity).*

### The Simplest Fix: A Lockbox with One Key (Symmetric)

The same key locks and unlocks. This is **symmetric** encryption, and the common one is called **`AES`**. It's very fast: a laptop can encrypt gigabytes every second.

But there's a catch. Both sides need the same key. If you send it over the café Wi-Fi, the snooper copies the key too. This is the **key distribution problem**.

![You and a server need the same blue key; sending it over the Wi-Fi lets a snooper copy it, shown as a red copy of the key.](images/figure-3.svg)

*Figure 3. Symmetric encryption uses one key to lock and unlock, and is very fast; the catch is getting that key to the other side without anyone copying it.*

### Public and Private Keys: The Padlock Picture (Asymmetric)

A bank hands out open padlocks, free, to anyone. Only the bank has the key that opens them. You put your message in a box and snap a padlock shut. Now nobody can open it, not even you. Only the bank.

![A bank with the only key, three open green padlocks handed out to anyone, and a box with your message locked by one of them.](images/figure-4.svg)

*Figure 4. The padlock picture: the bank hands out open padlocks to anyone but keeps the only key; once you snap one shut on your box, only the bank can open it.*

The real thing is a **key pair**. The **public key**, like the open padlock, is shared with the whole world. The **private key** never leaves the server. What the public key locks, only the private key can unlock. So a snooper who sees the public key and the locked box learns nothing: a public key can only lock.

Then why not use public keys for everything? Because they're slow: public-key operations are hundreds to thousands of times slower than AES. Fine for a few bytes, too slow for a whole video.

![An open green padlock labelled public key, a purple key labelled private key, and two bars: AES long and fast, public key tiny and much slower.](images/figure-5.svg)

*Figure 5. A key pair: the public key is shared with everyone, the private key never leaves the server; public-key operations are much slower than AES.*

### Why HTTPS Uses Both (Hybrid Encryption & Key Exchange)

1. The browser makes a random secret key.
2. It locks that key with the server's public key, and sends it.
3. The server unlocks it with its private key.
4. Now both sides share one secret, and switch to fast `AES` for everything else.

That's the classic idea. Modern **TLS 1.3** uses a cousin called a **key exchange**, or Diffie-Hellman (`X25519` / `ECDHE`): each side keeps a secret and sends only a public part, and both compute the same shared key, which is never sent at all. The snooper sees both public parts and still can't work it out.

![A sequence diagram: the browser makes a random key, sends it locked with the server's public key, the server unlocks it with its private key, then both use fast AES.](images/figure-6.svg)

*Figure 6. HTTPS uses both: slow public-key crypto to agree one secret, then fast AES for the data. TLS 1.3 agrees it with a Diffie-Hellman key exchange.*

```mermaid
sequenceDiagram
    participant C as Browser Client
    participant E as Café Wi-Fi Snooper
    participant S as HTTPS Server

    Note over C: Generates ephemeral X25519 secret a, public A
    C->>S: ClientHello with ephemeral public share A
    Note over E: Sees A only - cannot derive shared secret
    Note over S: Generates ephemeral secret b, public B
    Note over S: Computes shared secret S_key from (b, A) and signs transcript with static private key
    S-->>C: ServerHello (B) + Certificate + Signature
    Note over C: Verifies cert + signature, computes identical S_key from (a, B)
    C->>S: Encrypted HTTP GET /login (AES-256-GCM using S_key)
    S-->>C: Encrypted 200 OK JSON (AES-256-GCM using S_key)
```

**The other way round: signatures.** The server can sign something with its private key, like a wax seal. Anyone with the public key can check the seal is real. That proves who sent it, and it's the base of certificates, in [lesson 22](../22-certificates-and-pki/README.md).

**Real numbers.** An `AES` key is `128` or `256` bits. An `RSA` key is usually `2,048` bits, and an elliptic curve key (`X25519` / `P-256`) just `256`. Guessing a `128`-bit key means up to `2^128` (`~3.4 × 10^38`) tries: even with every computer on Earth, that takes far longer than the age of the universe.

**What HTTPS hides.** The page content, the full URL path, your cookies and your password. What stays visible: your IP address, the server's, the site's domain name, and how much data moves, and when.

![Two columns: hidden by HTTPS, and still visible.](images/figure-7.svg)

*Figure 7. What HTTPS hides (content, URL path, cookies, passwords) and what stays visible (both IP addresses, the domain name, and how much data moves, and when).*

```mermaid
flowchart TD
    Q["What Are You Trying to Do with Data?"] --> C1{"Need Original Data Back?"}
    C1 -->|No - Verify Password| H["One-Way Salted Hash (Argon2id / bcrypt)"]
    C1 -->|Yes - Transport Encoding Only| E["Base64 / Hex (Zero Secrecy!)"]
    C1 -->|Yes - Secret Storage or Wire Privacy| C2{"Do Both Sides Already Share a Secret Key?"}
    C2 -->|Yes - Bulk Speed| SYM["Symmetric AEAD (AES-256-GCM / ChaCha20-Poly1305)"]
    C2 -->|No - Untrusted Wire or Identity Proof| ASYM["Asymmetric Key Exchange (X25519) + Signatures (Ed25519 / ECDSA / RSA)"]
    ASYM --> SYM
```

---

## Systematic Reference & Comparison Grid

### Encoding vs. Hashing vs. Symmetric vs. Asymmetric Cryptography

| Mechanism | Reversible? | Key(s) Required | Relative Speed | Primary Security Goal | Classic Anti-Pattern |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Encoding (`Base64`, `URL`)** | Yes (trivially) | None | Instant | Wire-safe text representation | Treating Base64 JWT headers/payloads as "encrypted" |
| **Hashing (`SHA-256`, `Argon2id`)** | **No** (one-way) | None (plus salt for passwords) | Fast (`SHA`) / Tuned slow (`Argon2`) | Integrity & password verification | Storing reversible plaintext or unsalted MD5 passwords |
| **Symmetric (`AES-GCM`, `ChaCha20`)** | Yes | Same shared secret key | **Gigabytes/sec** (hardware AES-NI) | Confidentiality + integrity (AEAD) | Sending raw symmetric keys over plain HTTP or reusing nonces |
| **Asymmetric (`X25519`, `ECDSA`, `RSA`)** | Key exchange / verify | Public + Private key pair | **100×–1,000× slower** than AES | Safe key agreement & signatures | Bulk-encrypting multi-MB files directly with RSA |

### Café Wi-Fi Visibility Matrix Over HTTPS

| Traffic Metadata / Payload | Visible to Café Wi-Fi Snooper? | Why / Mitigation |
| :--- | :--- | :--- |
| **Client & Server IP Addresses** | **Yes** | Required in unencrypted L3 IP headers for packet routing |
| **Target Domain Name** | **Yes** (unless DoH + ECH) | Leaked via plain UDP DNS and TLS `SNI` extension |
| **Packet Size & Timing** | **Yes** | Encrypted TLS record lengths reveal traffic bursts |
| **URL Path & Query (`?token=...`)** | **Hidden** | Sent inside encrypted HTTP layer after TLS handshake |
| **Cookies, Passwords, JSON Bodies** | **Hidden** | Encrypted and authenticated with `AES-GCM` / `ChaCha20` |

---

## Core Definition & Taxonomic Comparison

**Encryption turns readable data into ciphertext using a key, so that only holders of the right key can recover it.** On a network it is one tool inside a larger goal: the three guarantees a secure channel must provide. What it is not: encryption alone does not tell you *who* you are talking to, and it does not stop someone from replaying or reordering messages unless it is *authenticated* (AEAD) and bound to a session.

| Term | Precise Meaning | Production Example |
| :--- | :--- | :--- |
| **Confidentiality** vs. **Integrity** vs. **Authenticity** | Nobody can *read* it; nobody can *change* it undetected; you know *who* sent it. Three separate properties with three separate mechanisms. | `AES-256-GCM` (confidentiality + integrity), `HMAC`/GCM tag (integrity), signature + certificate (authenticity). |
| **Encryption** vs. **Signature** (key direction) | Encrypt with the **public** key, decrypt with the **private** key (only the owner reads). Sign with the **private** key, verify with the **public** key (anyone checks the owner wrote it). | TLS: client encrypts/agrees to the server; server signs `CertificateVerify`. JWT `RS256`: issuer signs, services verify. |
| **Static (long-term) key** vs. **ephemeral key** | Static keys live for months in a certificate. Ephemeral keys are generated per connection in RAM and discarded, so a later leak decrypts nothing. | Server cert key (static, signs only in TLS 1.3); `X25519` share (ephemeral, per connection). |
| **Key transport** vs. **key agreement** | *Transport*: one side invents the secret and sends it locked (classic `RSA` kex). *Agreement*: both contribute public halves and compute the secret; it never travels (`(EC)DHE`). | Legacy `TLS_RSA_*` suites vs. `X25519` in TLS 1.3. |
| **Public key** vs. **certificate** | A public key is just math (`32` bytes for X25519). A certificate binds that key to an *identity* with a CA's signature (Lesson 22). | Copying a public key proves nothing; a valid chain for `bank.example` does. |

**Business impact.** Unencrypted traffic is a compliance failure (PCI DSS, HIPAA, GDPR) and a breach waiting for any shared network hop. Misused crypto is nearly as bad: the incidents in practice come from *key handling and protocol choices* (no forward secrecy, leaked private keys, Base64 mistaken for encryption), not from broken algorithms.

---

## Component Anatomy & The Observability Gap

### Anatomy of a Hybrid-Encrypted Message

```text
  ASYMMETRIC PHASE  (once per connection, microseconds-milliseconds of CPU)
     client eph. secret a ──> A = a·G  (32 B) ───────────┐                   ┌── server eph. secret b ──> B = b·G (32 B)
                                                         ▼                   ▼
                              shared = a·B = b·A  (never transmitted) ──HKDF-SHA256──> 256-bit AES key
     server STATIC private key signs the transcript (CertificateVerify) -> proves WHO owns B

  SYMMETRIC PHASE   (every byte afterwards, GB/s per core)
     [ nonce 12 B ][ ciphertext  (= len(plaintext)) ][ auth tag 16 B ]       AES-256-GCM / ChaCha20-Poly1305
       └─ unique per message under one key           └─ any flipped bit => tag check fails => message rejected

  FIXED OVERHEAD per standalone message = 32 (eph. pub) + 12 (nonce) + 16 (tag) = 60 B
  TLS record overhead                   = 5 (header) + 1 (inner type) + 16 (tag) = 22 B per <=16 KB record (0.13%)
```

### The Observability Gap: Where Plaintext Actually Exists

| Vantage Point | What It Sees | What It Cannot See |
| :--- | :--- | :--- |
| **Café Wi-Fi snooper / ISP router** | Ciphertext, both IPs, ports, packet sizes and timing, the `SNI` hostname. | URL path, headers, cookies, body, passwords. |
| **`tcpdump` on the server NIC** | The same ciphertext (unless you provide `SSLKEYLOGFILE` to Wireshark). | Plaintext: *"I captured packets"* is not *"I saw the request"*. |
| **TLS-terminating LB / WAF / CDN** | Full plaintext HTTP: it holds the session keys. | Nothing on the client leg; it is a trust boundary you must secure and audit. |
| **App process, logs, core dumps, APM** | Plaintext and **keys in memory**; secrets in logs and heap dumps. | N/A, which is why the biggest leaks are *post*-decryption (logs, backups, memory). |
| **Metrics to add** | TLS version and cipher distribution, handshake failure rate, certificate days-to-expiry, key age and rotation date, share of `TLS_RSA_*` handshakes (target `0`). | Nothing: these catch downgrade, weak ciphers, and expiring or stale keys early. |

**Rule:** encryption protects data **in transit** between two endpoints; it does nothing for data at rest, in logs, or in memory at an endpoint. Threat-model every place plaintext appears.

---

## Mathematical Model of Key Strength, Speed & Overhead

### 1. Brute-Force Search

A $b$-bit symmetric key has $2^b$ possibilities; on average half must be tried:

$$N_{128} = 2^{128} \approx 3.4 \times 10^{38},\qquad t = \frac{2^{128}}{r}\ \text{seconds at}\ r\ \text{guesses/s}$$

At a deliberately absurd $r = 10^{18}$ key guesses per second (far more than every computer on Earth combined could actually test, since one guess costs many operations):

$$t = \frac{3.4 \times 10^{38}}{10^{18}} = 3.4 \times 10^{20}\ \text{s} \approx 1.1 \times 10^{13}\ \text{years} \approx 780 \times \text{age of the universe}\ (1.38 \times 10^{10}\ \text{yr})$$

AES-256 raises the space to $2^{256} \approx 1.16 \times 10^{77}$. Practical attacks target **keys, implementations, and people**, never the keyspace.

### 2. Equivalent Security Strength (NIST SP 800-57)

| Security Bits | Symmetric | RSA / DH (modulus) | Elliptic Curve | Typical Use |
| :--- | :--- | :--- | :--- | :--- |
| `112` | 3DES (retired) | `2,048` bits | -- | Legacy certificates (minimum acceptable) |
| **`128`** | **AES-128** | **`3,072` bits** | **`X25519`, `P-256` (`256`-bit)** | Modern TLS default |
| `192` | AES-192 | `7,680` bits | `P-384` | Compliance profiles |
| `256` | AES-256 | `15,360` bits | `P-521` | Long-term secrecy |

This is why TLS moved to elliptic curves: the same `128`-bit strength costs a `32`-byte public key and a `64`-byte signature instead of `384`-byte RSA keys and `384`-byte signatures.

### 3. Why Not Public Keys for Everything? (Speed Arithmetic)

Approximate single-core figures (hardware dependent): AES-GCM with AES-NI `~4 GB/s`; X25519 key agreement `~50-100 µs`; RSA-2048 private operation `~1 ms`, public operation `~40 µs`.

Encrypting `1 GB`:

- **AES-256-GCM:** $1\ \text{GB} / 4\ \text{GB/s} = 0.25\ \text{s}$.
- **RSA-2048 OAEP (SHA-256)**, `190` plaintext bytes per block $\Rightarrow$ $1\text{e}9 / 190 \approx 5.26\text{M}$ blocks; decrypting them costs $5.26\text{M} \times 1\ \text{ms} \approx 5{,}263\ \text{s} \approx 88\ \text{min}$.

$$\frac{5{,}263\ \text{s}}{0.25\ \text{s}} \approx 21{,}000\times\ \text{slower per byte on the private-key side}$$

So public-key math is used for the **one-time key agreement and signature**, then symmetric crypto carries the bytes.

### 4. Diffie-Hellman in Numbers (Toy Example)

Public parameters $p = 23,\ g = 5$. Alice's secret $a = 6$, Bob's secret $b = 15$.

$$A = g^a \bmod p = 5^6 \bmod 23 = 8,\qquad B = g^b \bmod p = 5^{15} \bmod 23 = 19$$

$$\text{Alice: } B^a \bmod p = 19^6 \bmod 23 = 2,\qquad \text{Bob: } A^b \bmod p = 8^{15} \bmod 23 = 2$$

Both reach the shared secret `2`, though an eavesdropper only saw `p, g, 8, 19`. Real curves ($X25519$) work the same way on a group where recovering $a$ from $a \cdot G$ is infeasible (`~2^128` work).

### 5. Nonce Safety for AES-GCM

With a random `96`-bit nonce and $n$ messages under one key, the collision probability is about:

$$P_{\text{collision}} \approx \frac{n^2}{2^{97}},\qquad n = 2^{32} \Rightarrow P \approx 2^{-33} \approx 1.2 \times 10^{-10}$$

That is why NIST caps random-nonce GCM at `2^32` messages per key, and why TLS re-keys (`KeyUpdate`) on very long connections. **Reusing a nonce under one GCM key is catastrophic** (it leaks the authentication key and plaintext XORs).

### 6. Forward Secrecy: How Much History Is Exposed by a Key Leak?

| Key Exchange | Past Sessions Decryptable After Static-Key Leak | Impersonation Window |
| :--- | :--- | :--- |
| Static `RSA` transport (`TLS_RSA_*`) | **All recorded traffic since the key was first used** (e.g. `90 days` or the key's full lifetime) | Until revoked and replaced |
| `ECDHE` / `X25519` (TLS 1.3, mandatory) | **`0` sessions** (ephemeral keys already destroyed) | Until revoked and replaced (detection + revocation + deploy, e.g. `16 min`) |

---

## Production War Story Post-Mortem: Leaked Private Key Without Forward Secrecy

- **Severity:** SEV-1 (90-Day Historical Traffic Exposure)
- **Detection / Resolution Time:** 16 minutes to revoke certificate and rotate keys; full TLS 1.3 cipher migration in 2 hours
- **Impact:** A misconfigured artifact backup exposed a wildcard `*.internal.example.com` TLS private key. Because legacy internal load balancers still allowed static RSA key transport (`TLS_RSA_WITH_AES_128_GCM_SHA256`), recorded east-west captures from the prior `90` days became retroactively decryptable.

### What Happened

```mermaid
sequenceDiagram
    participant C as Service A (Legacy TLS 1.2)
    participant E as Passive Packet Tap
    participant S as Internal LB (Static RSA)

    Note over E: Records encrypted traffic for 90 days
    C->>S: ClientKeyExchange (PreMasterSecret locked with Static Public Key)
    Note over S: Later, Static Private Key leaks in backup bucket
    Note over E: Uses leaked Static Private Key to unlock every recorded PreMasterSecret
    Note over E: Decrypts 90 days of past internal traffic retroactively!
```

### Root Cause Analysis

1. **Static RSA Key Transport Allowed:** Under legacy RSA key exchange, the client generates a `PreMasterSecret`, locks it with the server's *long-lived static public key*, and sends it over the wire. Whoever later steals that single static private key unlocks every recorded session forever.
2. **Missing Ephemeral Key Exchange (`ECDHE` / `X25519`):** TLS 1.3 drops static RSA key transport completely; the static private key is used **only** to sign the handshake, while session secrets come from short-lived ephemeral `X25519` keys destroyed immediately when each connection closes.

### The Fix & Architectural Hardening

- **Enforce TLS 1.3 / Ephemeral Ciphers Only:** Disabled all `TLS_RSA_*` suites across Envoy, Nginx, and ALBs, enforcing TLS 1.3 (or TLS 1.2 `ECDHE-*` AEAD suites only) for universal **forward secrecy**.
- **Key Rotation & Revocation:** Revoked the exposed certificate via CRL/OCSP, rotated keys inside hardware-backed KMS/HSM boundaries, and blocked raw `.key` files from backup policies.

---

## Multi-Language Production Implementation

Below is a production-structured **Hybrid Encryption Pipeline (Ephemeral `X25519`/`ECDH` Key Agreement + `HKDF-SHA256` + `AES-256-GCM` Authenticated Encryption)** demonstrating exactly how modern TLS 1.3 pairs asymmetric key exchange with fast symmetric AEAD ciphers across Go, TypeScript, Python, and C#.

````carousel
```go
package hybridcrypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"io"
)

// HybridEncrypt derives an ephemeral X25519 shared key and encrypts plaintext with AES-256-GCM.
func HybridEncrypt(serverPub *ecdh.PublicKey, plaintext []byte) (ephemeralPub, nonce, ciphertext []byte, err error) {
	ephemeralPriv, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, nil, err
	}
	sharedSecret, err := ephemeralPriv.ECDH(serverPub)
	if err != nil {
		return nil, nil, nil, err
	}
	key := sha256.Sum256(sharedSecret) // Production code uses HKDF-SHA256 over transcript

	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, nil, nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, nil, err
	}
	nonce = make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, nil, err
	}
	ciphertext = aead.Seal(nil, nonce, plaintext, ephemeralPriv.PublicKey().Bytes())
	return ephemeralPriv.PublicKey().Bytes(), nonce, ciphertext, nil
}
```
<!-- slide -->
```typescript
import {
  createCipheriv,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

export function hybridEncrypt(serverPublicKey: KeyObject, plaintext: Buffer) {
  // 1. Fresh ephemeral X25519 key pair per message/session (forward secrecy)
  const eph = generateKeyPairSync("x25519");
  const shared = diffieHellman({
    privateKey: eph.privateKey,
    publicKey: serverPublicKey,
  });

  // 2. Derive 256-bit symmetric key via HKDF-SHA256
  const aesKey = Buffer.from(
    hkdfSync("sha256", shared, Buffer.alloc(0), Buffer.from("tls13-hybrid-demo"), 32)
  );

  // 3. Fast authenticated symmetric encryption (AES-256-GCM)
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { ephemeralPublicKey: eph.publicKey, nonce, ciphertext, authTag };
}
```
<!-- slide -->
```python
import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def hybrid_encrypt(
    server_public_key: X25519PublicKey, plaintext: bytes
) -> tuple[bytes, bytes, bytes]:
    # 1. Ephemeral X25519 key exchange (forward secrecy)
    eph_private = X25519PrivateKey.generate()
    shared_secret = eph_private.exchange(server_public_key)

    # 2. Key derivation -> 256-bit AES session key
    aes_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"tls13-hybrid-demo",
    ).derive(shared_secret)

    # 3. Fast AES-256-GCM encryption + integrity tag
    nonce = os.urandom(12)
    ciphertext = AESGCM(aes_key).encrypt(nonce, plaintext, associated_data=None)
    return eph_private.public_key().public_bytes_raw(), nonce, ciphertext
```
<!-- slide -->
```csharp
using System;
using System.Security.Cryptography;

public static class HybridEnvelopeCrypto
{
    public static (byte[] EphemeralPublicKey, byte[] Nonce, byte[] Ciphertext, byte[] Tag) Encrypt(
        ECDiffieHellmanPublicKey serverPublicKey,
        ReadOnlySpan<byte> plaintext)
    {
        // 1. Ephemeral ECDH key pair for forward secrecy
        using var eph = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        byte[] sharedSecret = eph.DeriveRawSecretAgreement(serverPublicKey);

        // 2. HKDF-SHA256 -> 32-byte AES-256-GCM key
        byte[] aesKey = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            sharedSecret,
            outputLength: 32,
            info: "tls13-hybrid-demo"u8);

        // 3. Fast authenticated encryption with AES-256-GCM
        byte[] nonce = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        byte[] ciphertext = new byte[plaintext.Length];
        byte[] tag = new byte[AesGcm.TagByteSizes.MaxSize];

        using var aes = new AesGcm(aesKey, AesGcm.TagByteSizes.MaxSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        return (eph.PublicKey.ExportSubjectPublicKeyInfo(), nonce, ciphertext, tag);
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

### 1. Inspect a Live TLS 1.3 Key Exchange (`X25519`) and Symmetric Cipher (`AES-GCM`)

```bash
openssl s_client -connect example.com:443 -tls1_3 -brief
```

**Expected Output:**

```text
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Ciphersuite: TLS_AES_256_GCM_SHA384
Peer certificate: CN = *.example.com
Hash used: SHA256
Signature type: ECDSA
Server Temp Key: X25519, 253 bits
```

Notice both halves in action: `X25519` ephemeral key exchange (`Server Temp Key`) plus `ECDSA` signature for identity, paired with `TLS_AES_256_GCM_SHA384` symmetric encryption for data!

### 2. Generate an Asymmetric Key Pair & Separate Public Key from Private Key

```bash
openssl genpkey -algorithm Ed25519 -out private.pem && openssl pkey -in private.pem -pubout -out public.pem && cat public.pem
```

**Expected Output:**

```text
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAz6x2p9... (safe to share publicly)
-----END PUBLIC KEY-----
```

### 3. Verify That Base64 Is Reversible Encoding (Zero Encryption!)

```bash
printf "sunny42" | base64 && printf "c3Vubnk0Mg==" | base64 -d
```

**Expected Output:**

```text
c3Vubnk0Mg==
sunny42
```

---

## Pause and Think

> [!exercise] An attacker on the café Wi-Fi copies the server's public key and your locked box. Can they read your message? And what if, before the key reached you, they swapped it for their own? Decide before you open the answer.

<details><summary>Answer</summary>

The first: no. A public key only locks, so copying it doesn't help. The second: yes. You locked your secret with the attacker's padlock. That's exactly why the browser must check who the key belongs to.

![You, an attacker and a server: the attacker takes the server's real padlock and hands you their own, so your secret is locked for the attacker.](images/figure-8.svg)

*Figure 8. The pause-and-think answer: copying a public key doesn't help an attacker, but swapping in their own does. That's a man in the middle, and why certificates exist.*

</details>

---

## Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: JWT Decoding on the Café Wi-Fi</strong></summary>

**Scenario:** An API passes user emails inside a signed JWT (`HS256` / `RS256`) header/query over plain HTTP, assuming "it's cryptographic tokens, so eavesdroppers can't read the email." True or false?

**Solution:**
**False.** Standard signed JWTs (JWS) only **Base64url-encode** the JSON header and payload and append a digital signature/HMAC. Anyone sniffing plain HTTP (or decoding the token client-side) can read the Base64 payload effortlessly without any key. Signing protects **integrity/authenticity**, not **privacy**—you need TLS encryption (or JWE) for confidentiality.

</details>

<details><summary><strong>Checkpoint 2: What Happens After a Private Key Leak Under TLS 1.3?</strong></summary>

**Scenario:** An attacker steals your server's TLS private key (`cert.key`) today. They also saved a `pcap` file of yesterday's HTTPS traffic between users and your TLS 1.3 server. Can they (a) impersonate your server tomorrow, and (b) decrypt yesterday's `pcap`?

**Solution:**
- **(a) Impersonate tomorrow:** **Yes**—until you revoke the certificate and deploy a new key pair, they can sign TLS handshakes pretending to be your server.
- **(b) Decrypt yesterday's `pcap`:** **No**—TLS 1.3 mandates ephemeral Diffie-Hellman (`X25519`/`ECDHE`), giving **forward secrecy**. Yesterday's ephemeral keys were discarded in RAM as each connection closed, so the stolen static key cannot reconstruct past session secrets.

</details>

<details><summary><strong>Checkpoint 3: Auditing What HTTPS Actually Conceals</strong></summary>

**Scenario:** An employee visits `https://jobs.competitor.com/engineering/staff-backend?ref=secret` from corporate Wi-Fi. Which exact parts can the corporate router log: the domain `jobs.competitor.com`, the path `/engineering/staff-backend`, or `?ref=secret`?

**Solution:**
The router can see the **IP addresses** and the **domain name** `jobs.competitor.com` (via plain DNS and the unencrypted TLS `SNI` field unless Encrypted Client Hello is enabled), plus traffic size/timing. The URL **path** (`/engineering/staff-backend`), **query string** (`?ref=secret`), cookies, headers, and HTML body are all strictly hidden inside the TLS tunnel.

</details>

---

## Common Mistakes & Troubleshooting

### What Goes Wrong

- **A leaked private key:** Anyone who has it can pretend to be your server. With old setups, they could even unlock traffic recorded months ago. That's why TLS 1.3 makes fresh keys for every connection: **forward secrecy**.
- **Home-made encryption:** Base64 is not encryption: anyone can decode it in a second. A clever scheme you invented is almost always broken. Use standard, well-tested libraries.
- **Encrypting to the wrong person:** If an attacker swaps in their own public key, you lock your secret for the attacker: a man in the middle. Encryption alone doesn't say who you're talking to. Certificates fix that, in [lesson 22](../22-certificates-and-pki/README.md).

### Common Myths

- **"The public key must be kept secret."** No. It's meant to be shared. Only the private key is secret.
- **"HTTPS hides which site I visit."** No. The domain name and IP addresses are still visible. The content and the URL path are hidden.
- **"Public keys are better, so use them for everything."** No. They're slow. They're used to agree on a key, then fast symmetric encryption does the work.

| Risk / Failure | Root Cause | Hardened Fix |
| :--- | :--- | :--- |
| Past captures decrypted after key leak | Static `TLS_RSA_*` cipher suites used | Enforce TLS 1.3 or `ECDHE-*` AEAD ciphers only |
| Home-rolled XOR / Base64 "encryption" | Confusing encoding or weak obfuscation with crypto | Use vetted AEAD (`AES-256-GCM` / `ChaCha20-Poly1305`) libraries |
| Unverified server public key | Accepting unauthenticated keys without CA trust chain | Enforce strict X.509 certificate verification (never skip TLS verify) |

---

## Recap in Three Lines

1. Symmetric: one shared key, fast, but how do you share it?
2. Public and private keys: the public key locks, only the private key unlocks.
3. HTTPS uses both: agree a secret, then encrypt fast with `AES`.

---

## Interview Practice Questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system), and **Tricky** (deep follow-ups). Answer out loud before opening the solution.

<details>
<summary><strong>1. What is the difference between symmetric and asymmetric encryption? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
**Symmetric** (AES, ChaCha20) uses one shared key to encrypt and decrypt; it is extremely fast (GB/s) but both sides need the key, so sharing it safely is the *key distribution problem*. **Asymmetric** uses a key pair: the public key is shared with anyone, the private key never leaves its owner, and what one locks only the other opens. It solves sharing and enables signatures but is `100x-20,000x` slower per byte.

</details>

<details>
<summary><strong>2. Why does HTTPS use both kinds? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Asymmetric crypto is too slow for bulk data, and symmetric crypto alone has no safe way to share its key over an untrusted network. So TLS uses asymmetric crypto (today an ephemeral Diffie-Hellman key agreement plus a signature) to establish a fresh session key, then encrypts all data with fast symmetric AEAD (`AES-GCM` or `ChaCha20-Poly1305`). Certificates prove the public key belongs to the site.

</details>

<details>
<summary><strong>3. What is a digital signature, and how is it different from encryption? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
A signature is created with the **private** key over a hash of the data and verified by anyone with the **public** key; it proves *who* produced the data and that it was not altered, but it does **not hide** the content. Encryption is the opposite direction (public key locks, private key unlocks) and hides content. TLS certificates, `CertificateVerify`, JWT `RS256`/`EdDSA`, and signed releases all rely on signatures.

</details>

<details>
<summary><strong>4. What is forward secrecy? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Each connection derives its session key from **ephemeral** key pairs that are discarded afterwards, while the server's long-term key only signs. If the long-term key is stolen later, previously recorded traffic stays unreadable. Without it (static `RSA` key transport), one stolen key decrypts every recording ever made with it. TLS 1.3 makes forward secrecy mandatory.

</details>

<details>
<summary><strong>5. What does an attacker on public Wi-Fi see when you use HTTPS? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Your IP and the server's, the domain name (from DNS and the `SNI` field unless Encrypted Client Hello and encrypted DNS are used), and the size and timing of the traffic. They cannot see the URL path, query string, cookies, headers, or bodies, and they cannot alter them without the AEAD tag failing. They could still do traffic analysis (page sizes can fingerprint pages).

</details>

<details>
<summary><strong>6. A server's private key leaks. What is the damage and what do you do? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
The attacker can impersonate the server until the certificate is revoked and replaced (revoke via the CA, rotate to a new key pair, deploy, verify with `openssl s_client`). With legacy static-`RSA` suites they could also decrypt **all recorded past traffic**; with TLS 1.3/`ECDHE` they cannot. Then find the leak path (backups, CI logs, repos), keep keys in an HSM/KMS, shorten certificate lifetimes, and disable every `TLS_RSA_*` suite.

</details>

<details>
<summary><strong>7. How should you store user passwords: encrypt them, hash them, or encode them? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
**Hash** with a slow, salted, memory-hard function (`Argon2id`, `bcrypt`, `scrypt`), because the server only ever needs to *verify* a password, never recover it. Encryption is reversible (the key becomes a single point of catastrophic failure) and Base64 is not protection at all. Use a unique salt per user, tune the cost to about `100-500 ms`, add a pepper in a KMS if desired, and rate-limit logins. Plain `SHA-256` is too fast for passwords.

</details>

<details>
<summary><strong>8. An API puts user emails in a signed JWT and sends it over plain HTTP, assuming it is "encrypted". Is it? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
No. A standard signed JWT (JWS) only Base64url-**encodes** the header and payload and appends a signature or HMAC. Anyone who sees the token can decode the email with no key. Signing gives integrity and authenticity, not confidentiality. Fix: always use TLS, keep sensitive claims out of tokens, or use JWE if the token itself must be confidential.

</details>

<details>
<summary><strong>9. Is Base64 or hashing a form of encryption? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
No. Base64 is an **encoding**: anyone can reverse it with no key. A hash is **one-way**: it cannot be reversed and suits integrity checks and password verification, not storing data you need back. Encryption is reversible only with a key. Never invent your own scheme: use vetted AEAD libraries and let the platform manage nonces and keys.

</details>

<details>
<summary><strong>10. Public keys are public. How can a man in the middle still break things? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Copying a public key gives the attacker nothing, since it can only lock. But if they **swap in their own public key** before it reaches you, you encrypt for the attacker, who reads the data and forwards it on. Encryption alone does not say who you are talking to. Certificates signed by trusted CAs (Lesson 22) bind the key to the domain name so the browser can detect the substitution, which is why you must never disable certificate verification.

</details>

<details>
<summary><strong>11. Why not encrypt a 1 GB file directly with RSA? Quantify it. [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
RSA-2048 can only encrypt a few hundred bytes per operation (`190 B` with OAEP-SHA256), so `1 GB` needs about `5.3 million` private-key operations at `~1 ms` each, roughly `88 minutes`, versus about `0.25 s` for AES-GCM at `4 GB/s`: ~`21,000x` slower. Real systems use **hybrid encryption**: a random symmetric key (or a DH-derived key) encrypts the data, and the asymmetric layer protects only that small key.

</details>

<details>
<summary><strong>12. How can two parties agree on a shared secret over a channel an attacker can fully watch? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
**Diffie-Hellman** key agreement: each side keeps a private number and sends only a public value (`A = g^a`, `B = g^b`). Each computes `g^(ab)` using its own secret and the other's public value; the attacker sees `g, A, B` but recovering `a` or `b` is the discrete-log problem, infeasible at `2^128` work on curves like X25519 (toy: `p=23, g=5, a=6, b=15` gives shared secret `2`). It is not authenticated, so it needs signatures/certificates to stop an active man in the middle.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
              WHY ENCRYPTION: PUBLIC & PRIVATE KEYS, THE PADLOCK PICTURE  —  CHEAT SHEET
====================================================================================================
THREE GUARANTEES   Confidentiality (AEAD)  |  Integrity (GCM tag / MAC)  |  Authenticity (signature + certificate)
WITHOUT TLS        every packet is a postcard: read it (privacy), change it (integrity), impersonate (authenticity)

TOOLBOX
  Encoding (Base64)   : reversible, NO key, NO secrecy        Hash (SHA-256)  : one-way; passwords need Argon2id/bcrypt + salt
  Symmetric (AES-GCM) : 1 shared key, GB/s, key-distribution problem      ChaCha20-Poly1305: fast on CPUs w/o AES-NI
  Asymmetric          : public key LOCKS / VERIFIES, private key UNLOCKS / SIGNS ; 100x-20,000x slower per byte
  Key agreement (DH)  : each side sends only a public half; both compute the same secret; it never travels

HTTPS = HYBRID   asymmetric agreement + signature (once)  ->  HKDF  ->  AES/ChaCha20 for all bytes
  Static key = signs only (TLS 1.3).   Ephemeral key = per connection, discarded => FORWARD SECRECY.

MATH
  keyspace 2^128 = 3.4e38 ; at 1e18 guesses/s = 1.1e13 years (~780x universe age) ; AES-256 = 2^256 ~ 1.2e77
  128-bit security  ~  AES-128  ~  RSA-3072  ~  X25519 / P-256 (32 B public key, 64 B signature)
  1 GB: AES-GCM 0.25 s vs RSA-OAEP ~88 min (~21,000x)       GCM random nonce: P ~ n^2 / 2^97 (cap 2^32 msgs / key)
  Overhead: 60 B per standalone hybrid message ; TLS record 22 B per <=16 KB (0.13%)

WHAT HTTPS HIDES  : path, query, cookies, headers, body        STILL VISIBLE: IPs, ports, domain (SNI/DNS), sizes, timing

LEAK RULES  Static RSA transport: leak => ALL recorded history  | TLS 1.3 ECDHE: past safe, future impersonation until revoked
  Response: revoke -> rotate (HSM/KMS) -> redeploy -> find leak path -> disable TLS_RSA_* -> shorten cert lifetime

JWT: signed != encrypted (Base64 payload is readable) | MitM = swapped public key -> verify certificates ALWAYS

ANTI-PATTERNS  X home-made crypto   X Base64 as "encryption"   X RSA for bulk data   X nonce reuse in GCM
               X private keys in repos/backups/logs   X TLS verification disabled   X static-RSA cipher suites
====================================================================================================
```

---

## Free PDF notes

Download these notes as a printable PDF, with every picture, the padlock pictures and the interview answers: [SD-N-020.pdf](https://backendroadmap.com/notes/system-design/SD-N-020.pdf).

---

## Sources

- [RFC 8446: TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446), the key exchange, forward secrecy and the handshake.
- [RFC 7748: Elliptic Curves for Security](https://www.rfc-editor.org/rfc/rfc7748), X25519, the key exchange most browsers use.
- [NIST FIPS 197: AES](https://csrc.nist.gov/pubs/fips/197/final), the symmetric cipher behind most HTTPS traffic.
- [Cloudflare: What is encryption?](https://www.cloudflare.com/learning/ssl/what-is-encryption/), a readable introduction.
- [Cloudflare: How does public key encryption work?](https://www.cloudflare.com/learning/ssl/how-does-public-key-encryption-work/), key pairs and TLS.

---

## Next

Next comes [lesson 21, the TLS 1.3 handshake step by step](../21-tls-1-3-handshake/README.md): how HTTPS sets up forward-secret keys in one round trip. See [the track overview](../README.md) for the whole series.
