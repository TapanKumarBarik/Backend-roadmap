# CDN & Reverse Proxy

## Why this matters

Module 06 taught you load balancers — one address spreading traffic
across many identical backends, all still ultimately your own
infrastructure, all still roughly in one place. Two more layers commonly
sit in front of a real production service, solving problems load
balancing alone doesn't: a **reverse proxy** sits directly in front of
your servers doing far more than distributing load (TLS termination,
caching, compression, request rewriting, hiding your real backend
topology entirely), and a **CDN** takes content and pushes it to servers
physically close to *every* user around the world, so a user in Tokyo
isn't waiting on a round trip to your one datacenter in Virginia. Both
are things you'll configure directly (NGINX, Cloudflare, Azure Front
Door) the moment you run anything real, and both reshape how you read
failures the same way module 06's load balancer did — one more hop
between client and origin, one more place a request can go wrong or get
served from something other than your live server.

## Concepts

### Reverse proxy: a proxy that hides the servers, not the client

You may already know a **forward proxy**: a proxy that sits in front of
*clients*, making requests on their behalf and hiding *who's asking* from
the destination server (a corporate web filter, or a VPN-adjacent
anonymizing proxy). A **reverse proxy** is the mirror image: it sits in
front of *servers*, and clients talk to the proxy thinking it's the real
destination, while the proxy forwards the request to one of possibly
several real backend servers and hides *which one, and how many there
are* from the client entirely. This is genuinely the same position module
06's load balancer occupies — a reverse proxy and an L7 load balancer are
overlapping concepts, and real software (NGINX, HAProxy, Envoy) routinely
serves as both at once. What a reverse proxy adds beyond pure load
distribution: TLS termination in one place instead of on every backend,
response caching, compression, request/response header rewriting, rate
limiting, and — importantly — hiding your backend architecture and
internal addresses from the outside world entirely, so an attacker
probing your public-facing address learns nothing about how many
backends exist or what they're individually reachable at.

### CDN: pushing content physically closer to users

A **CDN (Content Delivery Network)** is a distributed network of **edge
servers** in many geographic locations (**points of presence**, or PoPs)
that cache and serve your content from whichever location is physically
closest to each requesting user. Instead of every user worldwide making a
round trip to your one origin server, users are routed (via DNS-level
geographic routing, or anycast) to the nearest edge PoP, which serves a
cached copy if it has one. The direct benefit is latency — physical
distance is a hard floor on round-trip time no amount of server tuning
can beat, so moving the *content* closer to the *user* is the only fix
once you're serving a genuinely global audience — plus reduced load on
your origin (most requests never reach it at all) and better resilience
(a DDoS or traffic spike is absorbed and spread across the CDN's many
edge locations instead of hitting your one origin directly).

### Cache hit vs cache miss, and the origin fetch

When a request reaches a CDN edge server, one of two things happens:

- **Cache hit** — the edge already has a valid, unexpired copy of the
  requested content and serves it directly, fast, with no trip back to
  your origin server at all.
- **Cache miss** — the edge doesn't have it (first request for this
  content at this edge, or the cached copy expired), so the edge itself
  fetches it from your origin server (or a nearer upstream edge, in some
  CDN architectures), serves it to the user, *and* stores a copy locally
  so the next request at this edge is a hit.

This is why a CDN's benefit compounds with popularity and steadiness of
content: a viral, widely-requested static asset becomes an almost-pure
cache-hit workload edge-wide after the first few requests, while content
that's requested once by exactly one user in one region never really
benefits — the miss-then-fetch cost is paid, but there's no repeat
traffic to amortize it against.

### What's cacheable, and cache invalidation

CDNs are strongest for **static content** — images, CSS, JS bundles,
video segments — content that's identical for every user and changes
infrequently. **Dynamic, personalized content** (a logged-in user's
account page, an API response that differs per-user) is generally *not*
cacheable by a CDN in the same way — caching someone else's personalized
page and serving it to a different user would be a serious data leak, not
just a bug. HTTP's own caching headers (`Cache-Control`, `ETag`, from
module 04's territory) tell the CDN what's cacheable and for how long.
The classic hard problem: **cache invalidation** — you updated the
origin's content, but edges around the world are still serving a stale
cached copy until their TTL expires or you explicitly **purge** the cache
at every edge. "I deployed a fix but users still see the old version" is,
overwhelmingly often, a CDN cache that hasn't been purged or hasn't
expired yet — not a failed deployment.

### CDN + reverse proxy together

These two layers are complementary, not competing, and a real production
request path commonly passes through both: **CDN** (global edge caching,
closest-PoP routing, DDoS absorption) → **reverse proxy** (TLS
termination, request routing/rewriting, and — per module 06 — load
balancing across your actual backend instances) → **origin servers**. The
CDN's job is being close to users and absorbing most repeat traffic
before it ever reaches you; the reverse proxy's job is being the smart,
protective front door to your own infrastructure for whatever traffic
does arrive. Many managed CDN products (Cloudflare, Azure Front Door,
Fastly) bundle both roles into one configured service, but understanding
them as two distinct, stackable concerns — not one monolithic "the CDN
does everything" black box — is what lets you actually diagnose which
layer a given problem lives in.

### Reading failures through a CDN + reverse proxy stack

The client → CDN edge → reverse proxy → backend chain means a failure or
oddity can originate at any hop, and each hop has its own signature. A
response header like `X-Cache: HIT` or `CF-Cache-Status: HIT` (CDN-
specific, but most expose *something*) tells you immediately whether a
request was served from edge cache or passed through to origin — check
this *before* assuming a bug is in your application code, because a
cache hit means your application code didn't run for this request at
all. A response that's stale/wrong on a cache hit but correct when you
bypass the CDN (`curl` directly to origin, the same "test the backend
directly" instinct module 06 taught for load balancers) isolates the
problem to caching/invalidation, not your application. And a reverse
proxy adding, stripping, or rewriting headers (a common source of "why is
this header missing/different by the time it reaches my app") means
comparing what the client sent, what the proxy forwarded, and what the
origin received are three genuinely different things worth checking
separately when debugging something header-dependent.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `curl -I` | Fetches only response headers — check `Cache-Control`, `ETag`, `Age`, and any `X-Cache`/`CF-Cache-Status` header | `curl -I https://example.com/` |
| `curl -H` | Bypass DNS/CDN routing to hit a specific origin directly by forcing the Host header at a known origin IP (paired with `--resolve`) | `curl --resolve example.com:443:<origin-ip> -I https://example.com/` |
| `dig` | Reveals CDN-managed DNS behavior — many CDNs return different IPs to different resolvers/locations (geographic routing) | `dig example.com` |
| NGINX: `proxy_pass` | Reverse-proxies a request to an upstream backend | `proxy_pass http://backend_pool;` |
| NGINX: `proxy_cache` | Enables response caching at the reverse-proxy layer itself | `proxy_cache my_cache;` |
| NGINX: `add_header X-Cache $upstream_cache_status` | Exposes NGINX's own HIT/MISS status as a response header, the same debugging signal a CDN's `X-Cache` gives you | in `location` block |

Flag/output notes:

- `curl -I https://example.com/` — response headers alone, no body; the
  fastest way to check `Age` (seconds since the response was cached —
  nonzero means you got a cached copy, not a fresh origin hit) and any
  `Cache-Control: max-age=...` telling you the TTL that governs when this
  content goes stale.
- `curl --resolve example.com:443:<origin-ip> -I https://example.com/` —
  identical technique to module 06's `--resolve`, applied one layer up:
  forces the request past the CDN/DNS routing entirely to hit your actual
  origin directly, letting you compare "what the CDN is serving" against
  "what origin actually has right now" to isolate a stale-cache problem.
- `$upstream_cache_status` in NGINX is the direct, self-hosted equivalent
  of a managed CDN's `X-Cache`/`CF-Cache-Status` header — worth adding to
  any reverse proxy you configure yourself, purely for this kind of
  debugging visibility.

## Hands-on exercises

Use Docker (from your earlier tracks) to build a small reverse-proxy +
caching setup, plus real public sites for the CDN-observation exercises
(no CDN account needed — you're only ever reading headers from sites that
already use one).

1. **Stand up NGINX as a reverse proxy in front of two backends.** Reuse
   module 06's two backends (or two simple containers each returning a
   distinct response). Configure an NGINX container with `proxy_pass` to
   both as an upstream pool. Confirm `curl localhost` alternates between
   backends — you've rebuilt module 06's load balancer, but now via
   reverse-proxy software specifically, and can add proxy-specific
   features to it next.

2. **Add response caching at the reverse proxy and observe hit/miss.**
   Add `proxy_cache_path`/`proxy_cache` and the
   `$upstream_cache_status` header to your NGINX config. Request the same
   URL twice: `curl -I localhost/` twice in a row. Expected: the first
   response shows `X-Cache: MISS` (fetched from a backend), the second
   shows `HIT` (served from the proxy's own cache, without touching
   either backend) — confirm by watching backend logs and seeing no new
   request logged on the second `curl`.

3. **Read a real CDN's cache headers.** Pick any site you know uses a CDN
   (many large sites do) and run `curl -I <url>` on a static asset (an
   image or JS file). Look for `Cache-Control`, `Age`, and any
   `X-Cache`/`CF-Cache-Status`-style header. Run it again a few seconds
   later — expect `Age` to have increased (or a fresh `HIT`), showing
   you're repeatedly hitting the same cached edge copy rather than the
   origin.

4. **Observe geographic DNS routing.** Run `dig <cdn-backed-domain>` and
   note the returned IP. If you have access to an online "dig from
   multiple locations" tool or a VPN to change your apparent location,
   repeat the lookup and compare — many CDNs return *different* edge IPs
   depending on where the query originates, routing you to your nearest
   PoP. Even without changing location, note that the IP returned is
   almost certainly not a single fixed server — it's an edge address.

5. **Diagnose and fix: stale content after a "successful" deploy.**
   Simulate it with your exercise 2 setup: change one backend's response
   content, but *don't* purge the NGINX cache. `curl -I localhost/` still
   shows `HIT` with the old cached content. This is deliberately the same
   symptom as "I deployed a fix but users still see the old version."
   **Diagnose**: confirm the backend itself now serves the new content
   directly (bypass the proxy, hit the backend's own port), proving the
   backend is correct and the proxy's cache is the stale layer. **Fix**:
   purge/clear the proxy cache (or wait out its TTL) and re-confirm
   `curl -I localhost/` now shows fresh content. State in your own words
   why "the deploy failed" would have been the wrong diagnosis here.

## Independent challenge

No lab given. Your team ships a hotfix for a bug on the marketing site's
homepage. QA confirms the fix by curling the origin server directly and
sees it works. Twenty minutes later, real users report the bug still
happening, and your team's first instinct is to assume the deploy
silently failed or got reverted. Using this module's concepts, write out
the actual, more likely diagnosis (without redeploying anything) and the
specific commands you'd run to confirm it before touching the deploy
pipeline at all — and explain why "confirmed the origin has the fix"
does *not* mean "confirmed users are seeing the fix" when a CDN is in the
path.

<details><summary>Stuck? One hint</summary>

A common real answer: the CDN edge nodes serving real users still have
the *old* cached response, unexpired, and the fix genuinely landed on
origin correctly — these are two different, independently-checkable
facts, and QA only checked one of them. Confirm with `curl -I` on the
public URL (not the origin directly) looking for a `HIT` status and an
`Age` header showing the cached copy predates the deploy, then compare
against a `curl --resolve`-forced direct-to-origin request showing the
fix is genuinely present there. The fix is purging the CDN cache for that
URL (or waiting out its `Cache-Control` TTL), not touching the deploy
pipeline — redeploying again would change nothing, since the deployed
code was never the problem.

</details>

## Common mistakes & troubleshooting

- **Diagnosing "users still see the old version" as a failed deploy.**
  Exercise 5 and the independent challenge — check the CDN/reverse-proxy
  cache layer (`X-Cache`, `Age`, a direct-to-origin comparison) before
  assuming the deployment itself is broken.
- **Confusing a reverse proxy with a forward proxy.** They sit on
  opposite sides of the connection and hide opposite things — a forward
  proxy hides the client from the destination; a reverse proxy hides the
  real servers from the client. Getting this backwards leads to
  misreading which side a given proxy's logs/headers actually describe.
- **Assuming all content should be cached, or none should.** Static,
  identical-for-everyone content caches well; personalized/dynamic
  content generally must not be cached the same way, or you risk serving
  one user's private response to another — caching decisions have to be
  content-aware, driven by real `Cache-Control` semantics, not a single
  blanket policy.
- **Testing only through the CDN/proxy when something looks wrong.**
  Same lesson as module 06's load-balancer debugging — hit the origin
  directly (`--resolve`, or the backend's own port) to isolate whether a
  problem is at the edge/proxy layer or the origin itself.
- **Forgetting a reverse proxy can rewrite or strip headers.** A header
  present at the client, or expected by the backend, isn't guaranteed to
  survive the proxy hop unchanged — check what the proxy actually
  forwards, not just what was sent or what's expected.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. What's the difference between a forward proxy and a reverse proxy, in
   terms of which side of the connection each one hides?
2. What is a CDN edge server / point of presence, and what specific
   problem does moving content physically closer to users solve that no
   amount of origin-server tuning can fix?
3. What's the difference between a cache hit and a cache miss, and why
   does a CDN's benefit compound with how popular/repeated a piece of
   content is?
4. Why is dynamic, personalized content generally not cacheable by a CDN
   the same way static assets are?
5. A user reports seeing outdated content after a confirmed-successful
   deploy. What's the likely cause, and what header would you check
   first to confirm it?
6. Where do a CDN and a reverse proxy typically sit relative to each
   other in a request's path, and what's each one's distinct job?

<details><summary>Show answers</summary>

1. A forward proxy sits in front of clients and hides *who's asking* from
   the destination server; a reverse proxy sits in front of servers and
   hides *which backend served the request* (and how many exist) from
   the client. They occupy opposite ends of the same connection.
2. A CDN edge server/PoP is a geographically distributed server that
   caches and serves content close to users. It solves latency caused by
   physical distance — the speed of light puts a hard floor on round-trip
   time to a single distant origin that no server-side optimization can
   remove, so the only fix for a genuinely global audience is moving the
   content closer to each user.
3. A cache hit serves content already stored at the edge, with no trip to
   origin; a cache miss requires fetching from origin (or an upstream
   edge) first, then caching it for next time. Popular/repeated content
   quickly becomes almost all cache hits after the first request at each
   edge, amortizing the one-time miss cost across many free hits; content
   requested once by one user never gets that benefit.
4. Because caching a personalized response and serving it to a different
   user would leak that first user's private data to someone else — CDNs
   rely on HTTP caching headers (`Cache-Control` etc.) to know what's
   safe to cache, and personalized/dynamic responses are generally marked
   (or must be marked) non-cacheable specifically to prevent this.
5. Likely cause: a CDN or reverse-proxy cache still holding the old,
   pre-fix response, unexpired or unpurged, even though the deploy to
   origin succeeded. Check for an `X-Cache`/`CF-Cache-Status: HIT` header
   and an `Age` value predating the deploy on the public-facing request,
   distinct from checking the origin directly.
6. Typically: client → CDN (global edge caching and closest-PoP routing)
   → reverse proxy (TLS termination, request routing/rewriting, and load
   balancing across backend instances) → origin servers. The CDN's job is
   proximity to users and absorbing repeat traffic before it reaches you;
   the reverse proxy's job is being the protective, smart front door to
   your own infrastructure for whatever traffic does arrive.

</details>

## Next

[11 — WebSocket & gRPC](../11-websocket-and-grpc/README.md): everything so
far has been request/response HTTP. Now meet two protocols built for
different shapes of communication — a persistent two-way channel, and
fast, strongly-typed service-to-service calls.
