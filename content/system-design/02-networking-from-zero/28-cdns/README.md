# Lesson 28: CDNs — Moving Bytes Closer to the Speed of Light

> **Prerequisites:** [Lesson 27: Forward and Reverse Proxies](../27-forward-and-reverse-proxies/README.md), [Lesson 19: HTTP Status Codes and Caching](../19-http-status-codes-and-caching/README.md), [Lesson 17: DNS Traffic Management](../17-dns-traffic-management/README.md), and [Networking From Zero Overview](../README.md) (Lesson 28 of 30).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Backend and platform engineers designing low-latency global APIs, preventing cache stampedes with Origin Shielding, tuning `s-maxage`/`stale-while-revalidate` policies, and locking origins against WAF bypass.  
> **Free PDF Notes:** [Download SD-N-028.pdf](https://backendroadmap.com/notes/system-design/SD-N-028.pdf)

> [!NOTE]
> **In one line:** a CDN serves your content from edge servers near users, so handshakes and round trips are short and cache hits never reach the origin; after a deploy, change file names instead of purging.

> [!TIP]
> **The Golden Rule of CDNs:** Light travels through fiber optic glass at roughly `200,000 km/s`—so a New York-to-Tokyo round trip costs `~140 ms` even with a zero-latency origin. Terminating TCP and TLS at a nearby **Anycast Edge POP (`~10 ms`)** immediately deletes `3–4×` cross-ocean handshakes even for uncached requests; combine **normalized cache keys**, **Origin Shielding with request coalescing**, `s-maxage` / `stale-while-revalidate` / `Cache-Tag` purges, and **mTLS origin lockdown** so traffic spikes never melt your database or bypass your WAF. Prefer **content-hashed file names** (`app.3f9a.js` with `max-age=31536000, immutable`) and short-TTL HTML so deploys need almost no purge.

---

## Words You'll Meet Today

| Word | In Plain Words | Role in a Live Backend System |
| :--- | :--- | :--- |
| **Edge POP** | A CDN data center close to users running reverse proxies and caches. | Terminates TCP/TLS within `5–20 ms` of the caller and serves cached objects locally. |
| **Origin Shield** | A central caching tier between all global Edge POPs and your origin. | Collapses hundreds of simultaneous regional cache misses into one origin fetch. |
| **Request coalescing** | Holding concurrent misses for the same key while one request fetches upstream. | Prevents thundering-herd cache stampedes when a hot key expires or gets purged. |
| **Cache key** | The exact tuple identifying one cached entry (`scheme + host + path + query`). | Drives cache hit ratio; noisy params (`utm_source`, `fbclid`) fragment keys and drop hits. |
| **`Vary` header** | Lists request headers that produce different cached responses (`Accept-Encoding`). | `Vary: User-Agent` creates thousands of fragments per URL and ruins CDN hit ratios. |
| **`s-maxage`** | Shared-cache lifetime overriding `max-age` specifically for CDNs. | Keeps assets cached `3600 s` at the edge while browsers hold `60 s` for instant purges. |
| **`stale-while-revalidate`** | Serves a slightly expired object instantly while refreshing it asynchronously. | Eliminates `p99` revalidation spikes; pairs with `stale-if-error` for origin resilience. |
| **`Surrogate-Key` (`Cache-Tag`)** | A logical dependency label attached to cached responses for bulk purging. | Invalidates `product-42` across thousands of URLs and query permutations in `< 150 ms`. |

---

## Visual Mental Models & Architecture

### The Question: Why Can't We Just Buy a Faster Origin Server?

Imagine your origin cluster runs in Tokyo (`ap-northeast-1`) and computes every API response in `2 ms`. Yet users in New York wait `430 ms` for the very first byte of a tiny JSON file—even before a single byte of payload finishes downloading! Upgrading your Tokyo CPUs from 8 cores to 128 cores shaves off `1 ms` and still leaves `429 ms`. Why? Because the bottleneck isn't CPU; it's **light moving through glass** across multiple network handshakes ([lesson 17](../17-dns-traffic-management/README.md) and [lesson 27](../27-forward-and-reverse-proxies/README.md)).

### An Everyday Picture First: Neighborhood Espresso Bars and One Roastery

Suppose a specialty coffee roastery sits in Tokyo, and customers live in 200 cities worldwide. Sending every morning customer on a round-trip flight to Tokyo just to place an order, show ID, and pick up a cup would take hours—even if pouring the coffee took two seconds.

Instead, the roastery opens **200 neighborhood espresso bars (Edge POPs)** five minutes from every customer, supplied by **one central warehouse (Origin Shield)** near the roastery:

- **Repeat drinks (Cache Hits):** Customers walk five minutes to their local bar and get coffee immediately.
- **Custom drinks (Dynamic / Cache Misses):** Even when a drink must be brewed at headquarters, the customer checks ID and places the order locally in five minutes, and the neighborhood bar calls headquarters over an already-open private phone line!

### Fiber Physics vs. Anycast Edge Termination

In a vacuum, light travels at $c \approx 299,792\text{ km/s}$. Inside silica optical fiber (refractive index $n \approx 1.47$), light slows to:

$$v_{\text{fiber}} = \frac{c}{n} \approx \frac{299{,}792}{1.47} \approx 203{,}940\text{ km/s} \approx 200{,}000\text{ km/s}$$

Between New York and Tokyo, submarine and terrestrial fiber paths span roughly `14,000 km` one way (longer than the `10,850 km` great-circle arc). One single round trip (`28,000 km`) therefore takes:

$$\text{RTT}_{\text{NY}\leftrightarrow\text{Tokyo}} \approx \frac{28{,}000\text{ km}}{200{,}000\text{ km/s}} = 0.140\text{ s} = 140\text{ ms}$$

Without a CDN, a brand-new HTTPS request pays **at least 3 cross-ocean RTTs** before the first byte of HTTP response starts streaming: `1 RTT` TCP handshake (`SYN`/`SYN-ACK`), `1 RTT` TLS 1.3 handshake (`ClientHello`/`ServerHello`), and `1 RTT` HTTP `GET` -> response (`3 × 140 ms = 420 ms`, or `4 × 140 ms = 560 ms` on TLS 1.2!).

When you place an **Anycast Edge POP** `10 ms` away from the New York user:

1. **TCP + TLS 1.3 finish at the local Edge POP** in `2 × 10 ms = 20 ms` (saving `260 ms` before any HTTP byte even leaves New York!).
2. On a **cache hit**, HTTP finishes in another `10 ms` (`~30 ms` total—**14× faster**).
3. Even on a **dynamic API call or cache miss**, the Edge POP forwards the request to Tokyo over a **warm, pre-established, congestion-tuned backbone TCP pool**, paying only `1 × 140 ms` WAN RTT instead of `3–4×`!

```mermaid
sequenceDiagram
    participant UserNYC as User in New York
    participant EdgePOP as Anycast Edge POP (NYC 10ms)
    participant OriginTYO as Origin Server (Tokyo 140ms)

    Note over UserNYC,OriginTYO: Direct Cross-Ocean Connection (3 RTTs = 420 ms TTFB)
    UserNYC->>OriginTYO: TCP SYN (140 ms RTT)
    UserNYC->>OriginTYO: TLS 1.3 ClientHello (140 ms RTT)
    UserNYC->>OriginTYO: HTTP GET /catalog (140 ms RTT -> 420 ms total!)

    Note over UserNYC,EdgePOP: Via CDN Edge POP (TLS at Edge + Warm Backbone Pool)
    UserNYC->>EdgePOP: TCP SYN + TLS 1.3 Handshake (2 x 10 ms = 20 ms)
    UserNYC->>EdgePOP: HTTP GET /catalog
    alt Cache Hit at Edge POP
        EdgePOP-->>UserNYC: 200 OK from Edge NVMe Cache (30 ms total!)
    else Cache Miss or Dynamic Route
        EdgePOP->>OriginTYO: Reuses Warm Persistent Socket (140 ms RTT, no handshake)
        OriginTYO-->>EdgePOP: 200 OK
        EdgePOP-->>UserNYC: 200 OK (~170 ms total vs 420 ms direct)
    end
```

*Figure 1. Anycast Edge POP termination eliminates cross-ocean TCP and TLS handshakes immediately, cutting dynamic TTFB by `250+ ms` and serving cache hits in `~30 ms`.*

### Cache Key Anatomy, `Vary` Traps, and Origin Shield + Request Coalescing

Every CDN stores responses indexed by a **Cache Key**—by default, `scheme + host + path + full query string`. Three subtleties routinely wreck hit ratios and overload origins:

1. **Query Parameter Fragmentation:** If marketing links add `?utm_source=newsletter&fbclid=IwAR3...`, two users requesting the exact same article generate different cache keys and miss the cache every single time. Configure the CDN to **strip tracking query parameters** from the cache key (while preserving functional params like `?page=2&sort=price`).
2. **The `Vary` Cardinality Explosion:** `Vary: Accept-Encoding` splits a URL into just `2–3` variants (`br`, `gzip`, identity)—totally safe. By contrast, `Vary: User-Agent` creates **thousands** of distinct browser/OS string variants per URL, and `Vary: Cookie` or `Vary: X-Request-Id` makes every request a cache miss! Never emit high-cardinality `Vary` headers on shared cacheable responses.
3. **Origin Shielding + Request Coalescing (Preventing Cache Stampedes):** A global CDN often operates `200+` Edge POPs. When a viral product JSON expires at `12:00:00`, if `1,000` users across `200` POPs hit it simultaneously, all `200` POPs miss and stampede your origin at once.
   - **Origin Shield:** Routes all Edge POP misses through **one regional shield POP** close to your origin. Now `199` regional misses become hits in the Origin Shield!
   - **Request Coalescing (Collapsed Forwarding):** When `500` concurrent requests miss the same key in the same millisecond at the shield, the CDN holds `499` requests in memory, sends **exactly `1` upstream fetch** to your origin, and streams the single response back to all `500` callers. *(Caution: disable coalescing on uncacheable/personalized `Set-Cookie` or `no-store` responses, or disable on huge byte-range video streams where serialization hurts.)*

```mermaid
flowchart LR
    U1["Americas Users"] --> P1["Edge POPs (US / EU / APAC)"]
    U2["Europe Users"] --> P1
    U3["APAC Users"] --> P1
    P1 -->|"Cache Hit (95% Traffic)"| EdgeServe["Served Locally (~10-20 ms)"]
    P1 -->|"Regional Miss (5%)"| Coalesce["Origin Shield + Request Coalescing"]
    Coalesce -->|"500 Concurrent Misses Collapsed to 1 Fetch"| Gate{"mTLS Authenticated Origin Pull?"}
    Gate -->|"Verified CDN Client Cert"| Origin["Origin Cluster (Safe & Low Load)"]
    Attacker["Direct IP Scraper (WAF Bypass)"] -.->|"Rejected at TLS Handshake"| Gate
```

*Figure 2. Multi-tier CDN protection: Edge POPs absorb hits globally, Origin Shield + Request Coalescing collapse concurrent misses to `1` origin fetch, and mTLS locks down direct origin access.*

### `s-maxage`, `stale-while-revalidate`, `Cache-Tag` Purges, and Origin Lockdown

From [lesson 19](../19-http-status-codes-and-caching/README.md), `Cache-Control: max-age=3600` tells **both** browsers and CDNs to cache for an hour. That creates a nasty deployment bug: even after you purge the CDN, user browsers keep holding the stale file for up to `59` minutes because you cannot purge a stranger's laptop!

- **`s-maxage` vs. `max-age` (RFC 9111):** `s-maxage=3600` governs **shared caches (CDNs)** only, while `max-age=60` governs **private browser caches**. Or send `Surrogate-Control: max-age=86400` (stripped by the CDN before replying to the browser) alongside `Cache-Control: public, max-age=30`.
- **`stale-while-revalidate` & `stale-if-error` (RFC 5861):**
  ```text
  Cache-Control: public, max-age=30, s-maxage=300, stale-while-revalidate=600, stale-if-error=86400
  ```
  After `300 s`, the next visitor still receives the slightly stale object in **`10 ms`** while the CDN refreshes it silently in the background! And if your origin crashes (`500`/`502`/`504`) during a bad deploy, `stale-if-error=86400` lets the CDN keep serving the last healthy copy for up to `24` hours instead of showing users an error page.
- **`Cache-Tag` / `Surrogate-Key` Instant Purges:** Suppose `product-42` appears in `/products/42`, `/catalog?cat=shoes`, and `/home-featured.json`. Attaching `Surrogate-Key: product-42 cat-shoes` lets your backend call a single CDN API purge on tag `product-42` whenever inventory changes, invalidating every dependent URL worldwide in `~150 ms` without tracking URL lists.
- **Origin Lockdown (Stopping WAF Bypass):** Publishing your site behind a CDN does *not* hide your origin's IP if attackers find it in historical DNS logs, SSL certificate scans, or outbound webhook headers. Once an attacker hits `https://203.0.113.88` directly with `Host: api.example.com`, they **completely bypass** your CDN WAF, rate limits, and DDoS shield! Always lock down origin port `443` via **CDN IP firewall allowlists** *and* **mTLS Authenticated Origin Pulls**, requiring the CDN to present a trusted client certificate during the origin TLS handshake.

---

## Systematic Reference & Comparison Grid

### Latency Breakdown: Direct Origin vs. Anycast CDN (NY User -> Tokyo Origin)

| Request Scenario | Handshake RTTs | Origin Fetch RTTs | Typical TTFB | Origin CPU / Sockets Hit? |
| :--- | :--- | :--- | :--- | :--- |
| **Direct to Tokyo (TLS 1.2)** | `3 × 140 ms` (`TCP + 2-RTT TLS`) | `1 × 140 ms` | `~560 ms` | Yes (new TCP + TLS + app) |
| **Direct to Tokyo (TLS 1.3)** | `2 × 140 ms` (`TCP + 1-RTT TLS`) | `1 × 140 ms` | `~420 ms` | Yes (new TCP + TLS + app) |
| **CDN Edge Miss (Warm Pool)** | `2 × 10 ms` (Edge POP) | `1 × 140 ms` (Backbone) | `~160–170 ms` | App only (TLS offloaded) |
| **CDN Edge Cache Hit** | `2 × 10 ms` (Edge POP) | `0` (Local NVMe) | `~25–35 ms` | **Zero** |
| **CDN Pooled Hit (Repeat Req)** | `0` (Existing H2/H3) | `0` (Local NVMe) | `~10 ms` | **Zero** |

### Shared Cache Headers & Purge Mechanisms

| Header / Directive | Who Reads It? | Production Behavior | Common Trap |
| :--- | :--- | :--- | :--- |
| **`s-maxage=3600`** | Shared CDNs / Reverse Proxies | Overrides `max-age` on CDN only | Setting high `max-age` instead traps stale assets in user browsers |
| **`Surrogate-Control`** | Edge CDN (stripped before client) | Edge-only caching policy invisible to browsers | Forgetting CDN strips it; browsers receive only `Cache-Control` |
| **`stale-while-revalidate=300`** | RFC 5861 Shared/Browser Caches | Serves stale immediately while async revalidating | Omitting it exposes users to origin `p99` latency spikes on expiry |
| **`stale-if-error=86400`** | RFC 5861 Shared Caches | Serves cached copy if origin returns `5xx` or times out | Caching `5xx` accidentally via misconfigured error-TTL rules |
| **`Vary: Accept-Encoding`** | All HTTP Caches | Partitions cache by `br` / `gzip` / identity | Using `Vary: User-Agent` or `Vary: Cookie` destroys hit ratio |
| **`Cache-Tag` / `Surrogate-Key`** | Edge CDN (stripped before client) | Enables `< 150 ms` tag-based global invalidation | Exceeding header/tag count limits per object (keep `< 50` tags) |

---

## Core Definition & Taxonomic Comparison

**A CDN is a global mesh of edge PoPs that terminate TCP/TLS near the user and serve (or fetch) content on their behalf.** Your servers are the **origin**; users connect to the nearest PoP via anycast or DNS. A cache hit never leaves the edge. A miss still wins, because the edge reuses warm, tuned connections back to the origin.

| Term | Precise Meaning | Production Example |
| :--- | :--- | :--- |
| **CDN Edge PoP** vs. **Origin** vs. **Origin Shield** | *Edge PoP*: cache + TLS terminator near users. *Origin*: your source of truth. *Shield*: one middle cache that all edges miss into, so the origin sees one fetch, not hundreds. | Mumbai shopper hits Mumbai PoP (`~5 ms`); miss goes to a Virginia shield, then your origin once. |
| **Pull CDN** vs. **Push CDN** | *Pull*: edge fetches on first miss and caches (default for websites). *Push*: you upload content ahead of time (video libraries, OS ISOs). | `app.3f9a.js` pulled on first miss; a `50 GB` game build pushed overnight. |
| **Cache key** vs. **URL** vs. **`Vary`** | The cache key is what makes two requests "the same object" (URL ± chosen headers/query). `Vary` partitions that key further. Too much in either collapses hit ratio. | Key = `/img/shoe.jpg` → one copy, `95%` hits. Key = URL + session cookie → one copy per user. |
| **Purge / invalidation** vs. **versioned URLs** | *Purge*: tell every PoP to drop a path/tag (seconds–minutes, sometimes billed per path). *Versioned URLs*: new content gets a new name, so nothing needs invalidating. | `app.3f9a.js` → `app.7c21.js` after deploy; HTML `max-age=60` points to the new name. |

**Business impact.** At a `95%` hit ratio, `1,000,000` edge requests/hour become only `50,000` at the origin (`1 in 20`). At `80%`, origin load is `4×` higher. Hit ratio drives both latency *and* origin cost.

---

## Component Anatomy & The Observability Gap

### Anatomy of One CDN Request

```text
 USER (Mumbai)                    EDGE PoP (Mumbai)                 SHIELD (optional)              ORIGIN (Virginia)
   |  TCP+TLS (~5 ms RTT) ------> |                                   |                              |
   |  GET /img/shoe.jpg           |                                   |                              |
   |                              |-- HIT? serve from NVMe (~few ms)  |                              |
   |                              |-- MISS + coalesce --------------->|-- MISS? fetch once ---------->|
   |                              |<-- 200 + Cache-Control -----------|<-- 200 + body ----------------|
   |<-- 200 from edge             |  store under cache key            |  warm keep-alive pool        |
 Cache key = scheme+host+path (+ selected query/headers); ignore utm_*/fbclid or hit ratio collapses
```

### The Observability Gap: Where CDN Metrics Lie

| Vantage Point | What It Captures | What It Hides |
| :--- | :--- | :--- |
| **CDN analytics** (`Hit/Miss`, `Cache Status`, `Edge TTFB`) | Per-PoP hit ratio, bandwidth saved, purge lag. | Whether *your* origin CPU is healthy; shield vs edge miss distinction if not enabled. |
| **Origin access logs** | Only misses that reached you (plus shield collapses). | The `95%` of traffic served at the edge—origin QPS looking "fine" can hide a collapsing hit ratio. |
| **RUM / browser timings** | Real user TTFB by geography. | Whether a slow TTFB is DNS, TLS at edge, or origin miss (needs `Server-Timing` / CDN headers). |
| **`curl -I` from one laptop** | One PoP's `cf-cache-status` / `x-cache` / `Age`. | Other PoPs still cold after a purge; anycast may land you on a different PoP next hop. |
| **Metrics to add** | Hit ratio by path class, origin RPS, shield coalesced-miss count, purge propagation p95, `4xx`/`5xx` cached ratio. | Nothing useful if you only watch origin CPU during a marketing campaign. |

**Operational rule:** declare a deploy "cached" only when **edge hit ratio and origin RPS** both look right—not when one laptop sees `HIT`.

---

## Mathematical Model of Edge Latency, Hit Ratio & Origin Load

### 1. Cold HTTPS Cost: Origin vs Nearby PoP

A new HTTPS connection needs about `2` RTTs (TCP + TLS 1.3) before the first request, plus `1` more for the response:

$$T_{\text{TTFB}} \approx 3 \times \text{RTT} + T_{\text{serve}}$$

| Path | RTT | Cold TTFB (`3 × RTT`) | Notes |
| :--- | :--- | :--- | :--- |
| Mumbai → Virginia (no CDN) | `200 ms` | **`600 ms`** | Every image/bundle pays this |
| Mumbai → Mumbai PoP (hit) | `5 ms` | **`~15 ms`** + cache read | Handshakes stay local |
| Mumbai → PoP miss, warm origin pool | `5 ms` + `200 ms` | **`~220 ms`** | Edge skips new origin handshake |

### 2. Origin Offload from Hit Ratio

$$\text{Origin QPS} = \lambda_{\text{edge}} \times (1 - h), \qquad h = \text{cache hit ratio}$$

| Edge RPS ($\lambda$) | Hit ratio $h$ | Origin RPS | Relative origin load |
| :--- | :--- | :--- | :--- |
| `1,000,000 / h` ≈ `278 / s` | `95%` | `~14 / s` (`50k/h`) | **1×** (baseline) |
| same | `80%` | `~56 / s` | **4×** |
| same | `50%` | `~139 / s` | **10×** |
| same | `30%` (polluted keys) | `~194 / s` | **~14×** |

**Worked example (PDF):** at `95%` hits, `1,000,000` requests/hour → only `50,000` at the origin (`1 in 20`).

### 3. Percentiles: Why Average Hit Ratio Lies

Suppose `90` PoPs at `99%` hit, `9` at `80%`, and `1` viral PoP at `10%` after a campaign polluted keys:

$$\bar{h} = 0.90\times0.99 + 0.09\times0.80 + 0.01\times0.10 = 0.964 = 96.4\%$$

That looks healthy—yet the viral PoP's origin miss storm can still SEV-1 the database. Track **p95 / worst-PoP hit ratio**, not only the fleet average.

| Metric | Who it describes | CDN action |
| :--- | :--- | :--- |
| **$p_{50}$ edge TTFB** | Typical cache-hit user | Should be single-digit–low tens of ms near a PoP |
| **$p_{95}$ edge TTFB** | Users on cold PoPs / misses | Watch after deploys and purges |
| **$p_{99}$ origin TTFB** | Miss path + origin queueing | Pair with shield + `stale-while-revalidate` |
| **Worst-PoP hit ratio** | The PoP with polluted keys | Alert when any PoP drops below `70%` on public assets |

### 4. Compounding: Many Assets Per Page

A home page with $N$ images/bundles, each independently cached at hit ratio $h$:

$$P(\text{at least one miss}) = 1 - h^{N}$$

| $N$ assets | $h = 0.99$ | $h = 0.95$ | $h = 0.80$ |
| :--- | :--- | :--- | :--- |
| `1` | `1%` | `5%` | `20%` |
| `5` | `5%` | `23%` | `67%` |
| `10` | `10%` | `40%` | `89%` |
| `20` | `18%` | `64%` | `99%` |
| `40` (typical storefront) | `33%` | **`87%`** | `~100%` |

At `95%` hit ratio, an `40`-asset page still has an **`87%` chance of at least one origin-bound miss**—so shield + coalescing matter even when "the CDN looks fine."

### 5. Numbers Every Backend Engineer Must Know

| Operation / Fact | Typical Value | Architectural Implication |
| :--- | :--- | :--- |
| Fiber speed in glass | `~200,000 km/s` | Cross-ocean RTT floor `~140–200 ms` |
| Mumbai ↔ Virginia RTT | `~200 ms` | Cold HTTPS ≈ `600 ms` without edge |
| Nearby PoP RTT | `5–20 ms` | Cold HTTPS ≈ `15–60 ms` on hit |
| Good static hit ratio | `90–99%` | Origin offload `10–100×` |
| Immutable hashed asset TTL | `1 year` (`31536000`) | Deploy = new URL; no purge |
| HTML / entry document TTL | `30–60 s` | Must update to point at new hashes |
| Purge propagation | seconds–minutes | Exception, not the deploy plan |
| Origin shield coalescing | `N` misses → `1` fetch | Survives `200+` PoP stampedes |

### 6. Hierarchical Latency Budget (Global Page)

| Tier | Budget (example) | Notes |
| :--- | :--- | :--- |
| DNS / anycast steering | `5–30 ms` | See [Lesson 17](../17-dns-traffic-management/README.md) |
| Edge TCP + TLS 1.3 | `10–40 ms` | Dominates on hits |
| Edge cache read (hit) | `1–10 ms` | NVMe / memory |
| Shield + origin (miss) | `50–250 ms` | Warm pool preferred |
| Browser parse / remaining | rest of `2 s` SLA | Keep HTML short-TTL |

### 7. Top Engineering Mitigations

1. **Anycast / GeoDNS edge termination** — cut cross-ocean handshakes even for dynamic APIs.
2. **Normalized cache keys** — strip `utm_*`, `fbclid`; keep `Vary: Accept-Encoding` only.
3. **Origin Shield + request coalescing** — one origin fetch per object under stampede.
4. **Versioned assets + short HTML** — avoid purge-driven deploys.
5. **`s-maxage` + `stale-while-revalidate` + `stale-if-error` + mTLS origin lockdown** — tail latency, resilience, and WAF integrity.

---

## Production War Story Post-Mortem: `Vary: User-Agent` Stampede & Direct-IP WAF Bypass

- **Severity:** SEV-1 (Origin Outage During Flash Sale + Credential-Stuffing Bypass)
- **Detection / Resolution Time:** 9 minutes to identify `4%` cache hit ratio; 35 minutes to fix `Vary`, enable Origin Shield, and lock origin firewall to mTLS
- **Impact:** Origin database CPU pinned at `100%`, returning `504 Gateway Timeout` for `25` minutes during a seasonal launch while scrapers bypassed the CDN rate limiter by hitting the raw origin IP.

### What Happened

```mermaid
sequenceDiagram
    participant Shopper as Mobile Shoppers (utm/fbclid)
    participant Scraper as Bot Scraping Raw Origin IP
    participant EdgePOPs as 180 Global Edge POPs
    participant Origin as Unprotected Origin Cluster

    Note over Shopper,Origin: Bug 1 - Tracking query params + Vary User-Agent fragment cache keys
    Shopper->>EdgePOPs: GET /deals?fbclid=abc123 (User-Agent iPhone_16_2)
    EdgePOPs->>Origin: Cache Miss (Hit ratio drops 98% to 4%)
    Origin-->>EdgePOPs: 200 OK with Vary User-Agent
    Note over EdgePOPs: Operators click Purge Everything without Origin Shield
    EdgePOPs->>Origin: 180 POPs x 250 req/s = 45,000 req/s stampede!
    Origin-->>EdgePOPs: 504 Gateway Timeout (No stale-if-error set!)
    Note over Scraper,Origin: Bug 2 - Raw IP exposed in old DNS MX/A logs
    Scraper->>Origin: Direct HTTPS POST /login (Host shop.example)
    Origin-->>Scraper: 200 OK (CDN WAF and rate limit completely bypassed!)
```

### Root Cause Analysis

1. **Cache Key Fragmentation (`fbclid` + `Vary: User-Agent`):** Every social click carried a unique `?fbclid=` parameter and distinct iOS/Android `User-Agent` string, driving effective cache hits down to `4%`.
2. **No Origin Shield, Coalescing, or `stale-if-error`:** Executing a full cache purge without Origin Shield coalescing blasted all uncached origin misses straight to Postgres simultaneously—and missing `stale-if-error` turned every timeout into a visible outage page.
3. **Unauthenticated Origin Access:** The cloud load balancer accepted port `443` from `0.0.0.0/0`, allowing bots that found the origin IP via certificate transparency/DNS history to bypass CDN WAF rules completely.

### The Fix & Architectural Hardening

- **Normalized Cache Keys + `Vary` Hygiene:** Stripped `utm_*`, `fbclid`, and `gclid` from the CDN cache key, and replaced `Vary: User-Agent` with `Vary: Accept-Encoding`.
- **Origin Shield + `stale-while-revalidate` + `Surrogate-Key`:** Enabled Origin Shield with request coalescing, set `s-maxage=600, stale-while-revalidate=300, stale-if-error=86400`, and moved purges to targeted `Surrogate-Key` invalidation instead of full-site purges.
- **mTLS Authenticated Origin Pulls:** Configured the origin reverse proxy to require the CDN's mTLS client certificate (`ssl_verify_client on`) and locked the VPC security group to CDN ingress CIDRs only.

---

## Multi-Language Production Implementation

Below is a production-structured **Edge Cache-Header Policy Builder & Origin-Pull Verification Middleware** across Go, TypeScript, Python, and C#. It emits safe `s-maxage` / `stale-while-revalidate` / `stale-if-error` directives, enforces strict `Vary` hygiene against high-cardinality headers, formats `Surrogate-Key` tags, and rejects requests lacking a verified CDN origin-pull header/certificate subject.

````carousel
```go
package edgecache

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type Policy struct {
	BrowserMaxAgeSec   int
	EdgeSMaxAgeSec     int
	StaleWhileRevalSec int
	StaleIfErrorSec    int
	SurrogateKeys      []string
	VaryHeaders        []string
}

var forbiddenVary = map[string]bool{
	"user-agent": true, "cookie": true, "authorization": true, "x-forwarded-for": true,
}

func ApplyEdgeHeaders(w http.ResponseWriter, p Policy) error {
	for _, h := range p.VaryHeaders {
		if forbiddenVary[strings.ToLower(strings.TrimSpace(h))] {
			return fmt.Errorf("high-cardinality Vary header rejected: %s", h)
		}
	}

	cc := fmt.Sprintf(
		"public, max-age=%d, s-maxage=%d, stale-while-revalidate=%d, stale-if-error=%d",
		p.BrowserMaxAgeSec, p.EdgeSMaxAgeSec, p.StaleWhileRevalSec, p.StaleIfErrorSec,
	)
	w.Header().Set("Cache-Control", cc)

	if len(p.VaryHeaders) > 0 {
		w.Header().Set("Vary", strings.Join(p.VaryHeaders, ", "))
	}
	if len(p.SurrogateKeys) > 0 {
		// Space-delimited Surrogate-Key (Fastly) / Cache-Tag (comma-delimited on Cloudflare)
		w.Header().Set("Surrogate-Key", strings.Join(p.SurrogateKeys, " "))
		w.Header().Set("Cache-Tag", strings.Join(p.SurrogateKeys, ","))
	}
	return nil
}

// RequireOriginPullMTLS rejects requests bypassing the CDN mTLS terminator.
func RequireOriginPullMTLS(r *http.Request, expectedClientCN string) error {
	if r.TLS == nil || len(r.TLS.VerifiedChains) == 0 {
		return errors.New("403 direct origin access forbidden: missing mTLS client certificate")
	}
	cn := r.TLS.VerifiedChains[0][0].Subject.CommonName
	if cn != expectedClientCN {
		return fmt.Errorf("403 invalid CDN client cert CN=%s", cn)
	}
	return nil
}
```
<!-- slide -->
```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";

export interface EdgeCachePolicy {
  browserMaxAgeSec: number;
  edgeSMaxAgeSec: number;
  staleWhileRevalidateSec: number;
  staleIfErrorSec: number;
  surrogateKeys?: string[];
  varyHeaders?: string[];
}

const FORBIDDEN_VARY = new Set(["user-agent", "cookie", "authorization", "x-request-id"]);

export function applyEdgeCachePolicy(res: ServerResponse, policy: EdgeCachePolicy): void {
  const vary = policy.varyHeaders ?? ["Accept-Encoding"];
  for (const h of vary) {
    if (FORBIDDEN_VARY.has(h.trim().toLowerCase())) {
      throw new Error(`Unsafe Vary header "${h}" would fragment CDN cache hit ratio`);
    }
  }

  res.setHeader(
    "Cache-Control",
    `public, max-age=${policy.browserMaxAgeSec}, s-maxage=${policy.edgeSMaxAgeSec}, ` +
      `stale-while-revalidate=${policy.staleWhileRevalidateSec}, stale-if-error=${policy.staleIfErrorSec}`
  );
  res.setHeader("Vary", vary.join(", "));

  if (policy.surrogateKeys?.length) {
    res.setHeader("Surrogate-Key", policy.surrogateKeys.join(" "));
    res.setHeader("Cache-Tag", policy.surrogateKeys.join(","));
  }
}

export function verifyCdnOriginPull(req: IncomingMessage, expectedCn: string): boolean {
  const tlsSock = req.socket as Partial<TLSSocket>;
  if (!tlsSock.authorized || typeof tlsSock.getPeerCertificate !== "function") {
    return false;
  }
  const cert = tlsSock.getPeerCertificate();
  return cert?.subject?.CN === expectedCn;
}
```
<!-- slide -->
```python
from dataclasses import dataclass, field

FORBIDDEN_VARY = frozenset({"user-agent", "cookie", "authorization", "x-forwarded-for"})


@dataclass(frozen=True)
class EdgeCachePolicy:
    browser_max_age: int = 30
    edge_s_maxage: int = 3600
    stale_while_revalidate: int = 300
    stale_if_error: int = 86400
    surrogate_keys: list[str] = field(default_factory=list)
    vary_headers: list[str] = field(default_factory=lambda: ["Accept-Encoding"])


def build_edge_headers(policy: EdgeCachePolicy) -> dict[str, str]:
    for h in policy.vary_headers:
        if h.strip().lower() in FORBIDDEN_VARY:
            raise ValueError(f"Rejected high-cardinality Vary header: {h}")

    headers = {
        "Cache-Control": (
            f"public, max-age={policy.browser_max_age}, s-maxage={policy.edge_s_maxage}, "
            f"stale-while-revalidate={policy.stale_while_revalidate}, "
            f"stale-if-error={policy.stale_if_error}"
        ),
        "Vary": ", ".join(policy.vary_headers),
    }
    if policy.surrogate_keys:
        headers["Surrogate-Key"] = " ".join(policy.surrogate_keys)
        headers["Cache-Tag"] = ",".join(policy.surrogate_keys)
    return headers


def verify_origin_pull_cert(client_verify_header: str | None, client_dn: str | None, expected_cn: str) -> bool:
    """Validates Nginx/Envoy TLS-terminated origin-pull headers at the app layer."""
    return client_verify_header == "SUCCESS" and bool(client_dn) and f"CN={expected_cn}" in client_dn
```
<!-- slide -->
```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Http;

public sealed record EdgeCachePolicy(
    int BrowserMaxAgeSec = 30,
    int EdgeSMaxAgeSec = 3600,
    int StaleWhileRevalidateSec = 300,
    int StaleIfErrorSec = 86400,
    string[]? SurrogateKeys = null,
    string[]? VaryHeaders = null);

public static class EdgeCacheHelper
{
    private static readonly HashSet<string> ForbiddenVary = new(StringComparer.OrdinalIgnoreCase)
    {
        "User-Agent", "Cookie", "Authorization", "X-Forwarded-For"
    };

    public static void ApplyPolicy(HttpResponse response, EdgeCachePolicy policy)
    {
        var vary = policy.VaryHeaders ?? ["Accept-Encoding"];
        foreach (var header in vary)
        {
            if (ForbiddenVary.Contains(header.Trim()))
                throw new InvalidOperationException($"High-cardinality Vary '{header}' destroys CDN hit rate.");
        }

        response.Headers.CacheControl =
            $"public, max-age={policy.BrowserMaxAgeSec}, s-maxage={policy.EdgeSMaxAgeSec}, " +
            $"stale-while-revalidate={policy.StaleWhileRevalidateSec}, stale-if-error={policy.StaleIfErrorSec}";
        response.Headers.Vary = string.Join(", ", vary);

        if (policy.SurrogateKeys is { Length: > 0 } keys)
        {
            response.Headers["Surrogate-Key"] = string.Join(" ", keys);
            response.Headers["Cache-Tag"] = string.Join(",", keys);
        }
    }

    public static bool IsVerifiedCdnOriginPull(HttpContext ctx, string expectedClientCn)
    {
        var cert = ctx.Connection.ClientCertificate;
        return cert is not null && cert.GetNameInfo(System.Security.Cryptography.X509Certificates.X509NameType.SimpleName, false) == expectedClientCn;
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

### 1. Measure Edge TLS Termination Speed vs. TTFB with `curl -w`

```bash
curl -sS -o /dev/null -w "dns:%{time_namelookup}s tcp:%{time_connect}s tls:%{time_appconnect}s ttfb:%{time_starttransfer}s total:%{time_total}s\n" https://www.cloudflare.com/
```

**Expected Output:**

```text
dns:0.004s tcp:0.015s tls:0.032s ttfb:0.048s total:0.062s
```

Observe how `time_connect` (`~15 ms`) and `time_appconnect` (`~32 ms`) complete at the nearest Anycast Edge POP rather than crossing an ocean to the origin.

### 2. Inspect CDN Cache Hit/Miss Status, `Age`, and `Cache-Control`

```bash
curl -sS -I https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js
```

**Expected Output:**

```text
HTTP/2 200
cache-control: public, max-age=30672000
age: 148291
cf-cache-status: HIT
vary: Accept-Encoding
```

Notice `cf-cache-status: HIT`, `age` showing seconds elapsed since the Edge POP cached the asset, and clean `vary: Accept-Encoding`.

### 3. Verify Cache-Key Hygiene Against Query Parameter Pollution

```bash
curl -sS -I "https://example.com/?utm_source=test123" | grep -iE "cache|age|x-cache|cf-cache"
```

**Expected Output:**

```text
cache-control: max-age=604800
x-cache: HIT
age: 9412
```

If appending `?utm_source=test123` drops `age` to `0` and flips `MISS`, your CDN cache key is still including marketing query strings and needs query-parameter ignoring enabled.

---

## Pause and Think

> [!exercise] A site has `200` global Edge POPs. You serve an API response with `Cache-Control: public, max-age=300` and `Vary: User-Agent`. If `1,000` users with `40` distinct `User-Agent` strings request `/trending` right after an expiry, roughly how many requests hit your origin *without* Origin Shield vs. *with* Origin Shield + Request Coalescing and `Vary: Accept-Encoding`? Decide before opening the answer.

<details><summary>Answer</summary>

- **Without Origin Shield + with `Vary: User-Agent`:** Up to **`200 POPs × 40 User-Agents = 8,000`** theoretical cache buckets—so nearly all `1,000` requests can miss across POPs and User-Agent combinations, slamming the origin with hundreds of redundant queries!
- **With Origin Shield + Request Coalescing + `Vary: Accept-Encoding`:** Each POP collapses identical regional misses to the single Origin Shield, and Request Coalescing at the Shield merges all concurrent misses per encoding (`br` / `gzip`)—dropping origin load from ~`1,000` requests down to **just `1–2` upstream fetches**!

</details>

---

## Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Users Still See Old Content After Instant CDN Purge</strong></summary>

**Scenario:** Your team updates `/pricing.json`, triggers a CDN purge by `Surrogate-Key: pricing`, and confirms `cf-cache-status: MISS -> HIT` with fresh JSON via `curl`. Yet returning browser users still see old prices for `30` minutes. Why?

**Solution:**
The response shipped `Cache-Control: public, max-age=1800` instead of separating browser and CDN lifetimes. Browsers stored `/pricing.json` locally for `1,800` seconds and never contacted the CDN at all. Switch to `Cache-Control: public, max-age=30, s-maxage=86400, stale-while-revalidate=60` (or `Surrogate-Control: max-age=86400` + `Cache-Control: public, max-age=30`) so CDN edge caches stay hot for 24 hours while browsers check back within 30 seconds after a purge.

</details>

<details><summary><strong>Checkpoint 2: Attackers Bypass CDN Rate Limits via Historical DNS IP</strong></summary>

**Scenario:** You enabled strict CDN WAF rules and rate limits on `api.example.com`, yet origin logs still show bursts of `4,000 req/s` hitting `/v1/login` directly without `CF-Connecting-IP` or CDN headers. How did they get in and how do you stop them permanently?

**Solution:**
Attackers looked up your origin's raw IPv4 address from historical DNS archives (`SecurityTrails`, Censys) and sent HTTPS requests straight to `https://<origin-ip>/v1/login` with `Host: api.example.com`. Restrict the origin firewall to **CDN egress CIDR ranges only**, AND enable **mTLS Authenticated Origin Pulls** so the origin's TLS listener drops any connection missing the CDN's signed client certificate.

</details>

<details><summary><strong>Checkpoint 3: Preventing `Set-Cookie` Cross-User Leaks on Shared CDN Caches</strong></summary>

**Scenario:** An API endpoint accidentally caches a response containing `Set-Cookie: session_id=xyz` at the CDN edge. What happens if the CDN does not strip `Set-Cookie` or bypass cache?

**Solution:**
Another user hitting that cached edge URL could receive the first user's `Set-Cookie` header and hijack their session! Always mark personalized or cookie-setting responses `Cache-Control: private, no-store`, configure CDN rules to **never cache responses containing `Set-Cookie`**, and separate public cacheable endpoints from authenticated endpoints.

</details>

---

## Common Mistakes & Troubleshooting

### What Goes Wrong

- **Forgetting Origin Lockdown:** Leaving origin ports `80`/`443` open to `0.0.0.0/0` lets attackers skip your CDN WAF, rate limiting, and DDoS mitigation effortlessly.
- **Caching Error Pages for Hours:** Returning `500`/`404` with generic CDN "cache everything" rules serves outage pages to everyone even after the database recovers. Keep negative/error TTLs tiny (`0–10 s`) and rely on `stale-if-error` for `5xx` protection.
- **Query String & `Vary` Fragmentation:** Leaving marketing tracking tokens (`utm_*`, `fbclid`) in cache keys or emitting `Vary: User-Agent` silently tanks hit ratio below `10%`.
- **Using `max-age` Instead of `s-maxage`:** Locks stale content inside visitor browsers where CDN purges cannot reach.

### Common Myths

- **"CDNs only help static images and JavaScript."** False. Even for **uncached dynamic `POST` and `GET` API calls**, terminating TCP and TLS 1.3 at a nearby Anycast Edge POP cuts `2–3` cross-ocean RTTs (`250–400 ms`) and reuses warm backbone pools to the origin.
- **"A CDN purge empties user browsers too."** False. Purge APIs invalidate **Edge POPs and Origin Shields** only; browser caches obey `max-age` until expiry.
- **"Enabling a CDN hides my origin server completely."** False unless your origin firewall and mTLS reject direct public traffic to the origin IP.

| Symptom | Root Cause | Fix |
| :--- | :--- | :--- |
| Cache hit ratio stuck below `15%` on static/public pages | `utm_*` / `fbclid` in cache key or `Vary: User-Agent` / `Cookie` | Ignore tracking query params in CDN cache key; normalize `Vary` to `Accept-Encoding` |
| Origin still crashes during traffic spikes on purge | `200` Edge POPs all fetch concurrently on expiry | Enable **Origin Shield** + **Request Coalescing** + `stale-while-revalidate` |
| WAF rules appear ignored in origin access logs | Scrapers connect directly to origin IP bypassing CDN | Enforce CDN IP allowlist + **mTLS Authenticated Origin Pulls** |

---

## Recap in Three Lines

1. Fiber speed limits (`~200,000 km/s`) lock cross-ocean round trips around `140 ms`, so **Anycast Edge POPs** cut `2–3` handshake RTTs immediately—even on uncached API calls.
2. Protect hit ratios and origins using **clean cache keys**, safe **`Vary: Accept-Encoding`**, **Origin Shielding with request coalescing**, and `s-maxage` + `stale-while-revalidate` + `stale-if-error`.
3. Pair instant **`Surrogate-Key` / `Cache-Tag`** purges with **mTLS Origin Pull lockdown** so attackers can never bypass your edge WAF.

---

## Interview Practice Questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system), and **Tricky** (deep follow-ups). Answer out loud before opening the solution.

<details>
<summary><strong>1. How does a CDN reduce latency? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
It serves content from edge PoPs near users: TCP/TLS handshakes and round trips are short (`~5 ms` instead of `~200 ms`), cache hits skip the origin entirely, and misses reuse warm edge-to-origin connections so the client still avoids a cold cross-ocean handshake.

</details>

<details>
<summary><strong>2. Pull CDN vs push CDN? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
**Pull:** the edge fetches from the origin on the first miss and caches it—easy, and the default for websites. **Push:** you upload content to the CDN ahead of time—good for large, rarely changing files like video libraries and software downloads.

</details>

<details>
<summary><strong>3. What is the cache hit ratio, and why does it matter? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
The share of requests served from the edge. At `95%`, the origin sees `1` request in `20`; at `80%`, `1` in `5`—about `4×` more origin load. Hit ratio drives both latency and origin cost. Also watch **worst-PoP** hit ratio; a healthy fleet average can hide one viral PoP melting the origin.

</details>

<details>
<summary><strong>4. What is a cache key, and what ruins it? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
The tuple that makes two requests the "same" cached object—usually URL plus chosen headers/query params. Including session cookies, `utm_*`, `fbclid`, or `Vary: User-Agent` / `Cookie` creates per-user or per-browser copies so the hit ratio collapses. Strip tracking params; keep `Vary: Accept-Encoding` only on public assets.

</details>

<details>
<summary><strong>5. How do you invalidate CDN content after a deploy? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Prefer **versioned (content-hashed) file names** with `Cache-Control: public, max-age=31536000, immutable`, and keep the HTML short-lived (e.g. `max-age=60`) so it points to new names. Old copies age out; nothing to purge. Purge only the few same-URL paths that must change in place—purges take seconds to minutes per PoP and some CDNs bill per path.

</details>

<details>
<summary><strong>6. Your hit ratio dropped from 95% to 30% after a marketing launch. What do you check? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
The **cache key**. Likely new query parameters (`utm_*`) or a cookie are now part of it, so each visitor creates a new copy. Strip or ignore them in the key, and check `Vary` headers. Confirm with CDN analytics per path and a `curl -I` before/after appending `?utm_source=test`.

</details>

<details>
<summary><strong>7. A new 50 MB video goes live and 300 PoPs miss at once. What protects the origin? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
**Origin shielding:** all edge misses go to one shield PoP, which fetches the file once. The CDN also **collapses concurrent misses** for the same object into one origin request. Without that, `300` PoPs × concurrent viewers can stampede the origin.

</details>

<details>
<summary><strong>8. How does a CDN speed up uncached dynamic API requests? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Even when the response cannot be cached, terminating TCP and TLS at a nearby Anycast edge deletes `2–3` cross-ocean handshake RTTs. The edge forwards over a warm backbone pool to the origin. Cache only public, non-personalized `GET`s with short TTLs; send `private` / `no-store` for per-user data.

</details>

<details>
<summary><strong>9. Can you put an API behind a CDN? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Yes. Even uncached traffic gains nearby TLS termination and warm connections. Cache only public, non-personalized `GET` responses with short TTLs; never cache responses with `Set-Cookie` or auth-bound bodies as `public`. Mark personalized endpoints `private, no-store`.

</details>

<details>
<summary><strong>10. Why is the HTML not given the same one-year TTL as the bundles? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
The HTML's URL never changes, so a long TTL would pin users to the old page, which points to old hashed bundles. It is the entry point that must update, so it gets a short TTL or revalidation. Bundles can be immutable because a content change produces a **new URL**.

</details>

<details>
<summary><strong>11. How do `stale-while-revalidate` and `stale-if-error` help? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
`stale-while-revalidate` serves an expired object immediately while refreshing asynchronously—hiding origin revalidation from `p99`. `stale-if-error` keeps serving the last healthy copy if the origin returns `5xx` or times out. Pair with short error TTLs so you do not accidentally cache a `500` for hours.

</details>

<details>
<summary><strong>12. Why isn't pointing DNS at a CDN enough to protect the origin? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Attackers who find the origin IP (historical DNS, cert transparency) can hit it directly with `Host: your.domain` and bypass CDN WAF/rate limits. Lock the origin firewall to CDN egress CIDRs **and** require **mTLS Authenticated Origin Pulls** so handshakes without the CDN client cert are rejected.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                              CDNs EXPLAINED  —  CHEAT SHEET
====================================================================================================
IN ONE LINE   Edge PoPs near users: short handshakes, hits never hit origin; deploy = new filenames, not purges

ANATOMY       User -> Anycast/DNS PoP -> (hit: local) | (miss: Shield coalesce -> Origin warm pool)
CACHE KEY     scheme+host+path (+ chosen query/headers)   Strip utm_*/fbclid   Vary: Accept-Encoding ONLY
PULL vs PUSH  Pull = fetch on miss (websites)   Push = upload ahead (video/ISO libraries)

LATENCY MATH  Cold HTTPS TTFB ≈ 3 × RTT
  Mumbai↔Virginia 200 ms -> 600 ms direct | Mumbai PoP 5 ms -> ~15 ms hit | miss+warm pool ~220 ms
HIT RATIO     Origin QPS = λ_edge × (1 − h)     95% => 1/20 origin   80% => 1/5 (4× load)
COMPOUNDING   P(≥1 miss on N assets) = 1 − h^N     40 assets @ 95% => ~87% chance of a miss
PERCENTILES   Watch worst-PoP hit ratio, not only fleet average (one viral PoP can SEV-1 you)

DEPLOY        Hashed assets: max-age=31536000, immutable   HTML: max-age=30–60   Purge = exception
HEADERS       s-maxage (CDN) vs max-age (browser)   stale-while-revalidate   stale-if-error
              Surrogate-Key / Cache-Tag for <150 ms tag purges
SHIELD        200+ PoP misses -> 1 shield fetch + request coalescing
LOCKDOWN      CDN IP allowlist + mTLS Authenticated Origin Pulls (DNS-to-CDN alone is NOT enough)

OBSERVE       Edge hit/miss, Age, origin RPS, shield coalesce count, purge p95, RUM TTFB by geo
ANTI-PATTERNS X long TTL on app.js without hash   X cookies/utm in cache key   X public cache of personalized APIs
              X purge every deploy   X Vary: User-Agent/Cookie   X open origin 0.0.0.0/0 behind CDN
====================================================================================================
```

---

## Free PDF notes

Download these notes as a printable PDF with the fiber latency math, Origin Shield architecture, and interview answers: [SD-N-028.pdf](https://backendroadmap.com/notes/system-design/SD-N-028.pdf).

---

## Sources

- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111), `s-maxage`, `Vary`, shared-cache freshness, and `Age`.
- [RFC 5861: HTTP Cache-Control Extensions for Stale Content](https://www.rfc-editor.org/rfc/rfc5861), `stale-while-revalidate` and `stale-if-error`.
- [Cloudflare Learning Center: What is a CDN? & Anycast Routing](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/), Edge POP termination and Anycast physics.
- [Cloudflare Docs: Authenticated Origin Pulls (mTLS)](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pulls/), cryptographic origin lockdown.
- [Fastly Docs: Origin Shielding, Request Collapsing & Surrogate-Key](https://www.fastly.com/documentation/guides/concepts/edge-state/cache/), multi-tier shield caching and instant tag purging.

---

## Next

Next comes [Lesson 29: Connection Pooling and Keep-Alive](../29-connection-pooling-and-keep-alive/README.md): how persistent socket pools eliminate handshake overhead and `TIME_WAIT` exhaustion, why mismatched idle timeouts trigger random `502`s, and how Little's Law sizes database pools safely. See [the track overview](../README.md) for the whole series.
