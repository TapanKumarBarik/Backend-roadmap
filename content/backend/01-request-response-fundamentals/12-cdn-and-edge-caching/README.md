# Module 12: CDN and Edge Caching

## Why this matters

Module 06 gave you the actual HTTP caching contract — `Cache-Control`,
`ETag`, `Vary` — and one cache sitting between a client and your origin.
A **CDN (Content Delivery Network)** takes that exact same contract and
applies it at **many** caches simultaneously, geographically distributed
at points-of-presence (PoPs) close to your users worldwide, so a
response cached once can be served thousands of miles from your origin
with no round trip to it at all. Nothing about the caching *rules*
changes — a CDN reads the same `Cache-Control` header you already learned
to write. What's new, and what this module covers, is what happens when
"one cache" becomes "hundreds of independent caches you don't operate
directly": how a cache key is actually constructed, what "purge" means
when there's no single cache to clear, why an unexpected `Vary` header
can quietly multiply your cache misses across every one of those PoPs,
and the specific technique (**origin shielding**) that stops a CDN's own
architecture from accidentally hammering your origin.

## Concepts

### One more hop, same contract

Module 06's "where caches live" diagram had a browser cache and one
reverse-proxy/gateway cache. A CDN inserts a distributed layer of
caches, at PoPs around the world, between the client and your origin —
using the exact same `Cache-Control`/`ETag` machinery you already know,
just applied at every PoP a request happens to land on:

```
  Without a CDN:
  client ──────────────────────────────────────► your origin (every request)

  With a CDN:
  client ──► nearest PoP cache ──(only on a miss)──► your origin
             (same Cache-Control/ETag rules module 06 taught you)
```

A request that hits a warm PoP cache never reaches your origin at all —
not "reaches it faster," genuinely never touches it. This is why a CDN
is as much a **load-shedding** tool for your origin as a latency
optimization for your users.

### The cache key: what actually makes two requests "the same" response

A cache (whether one reverse proxy or a CDN PoP) decides "have I already
got a response for this exact request?" using a **cache key** — by
default, typically the request's method + URL + relevant headers
(module 06's `Vary` mechanism, at CDN scale). Two requests that differ in
anything the cache key includes are cached **separately** — which is
usually correct (different URLs are different resources) but becomes a
real problem the moment your app adds a header or query parameter to
every request that doesn't actually change the response:

- A `?utm_source=twitter` tracking parameter on an otherwise-identical
  URL, if included in the cache key, means every unique tracking value
  is a **cache miss on first sight** — you can silently tank your hit
  rate on high-traffic pages without changing a single byte of actual
  content.
- An `Authorization` or session-cookie header included in the cache key
  (or in `Vary`) means every distinct user gets their own cache entry
  for what might be identical public content, again multiplying misses.

This is module 06's `Vary` header at a much larger blast radius: a
`Vary` value that's technically correct but too broad quietly explodes
your effective cache hit rate across every PoP, not just one proxy.

### Purging: there is no one cache to clear

With one reverse-proxy cache (module 06), invalidating a stale entry is
a single operation against a single process. A CDN has **many**
independent PoP caches holding their own copies — "purge this URL" is a
*fan-out* operation the CDN's control plane has to propagate to every
PoP that might be holding it, and that propagation is not instantaneous
worldwide. Two practical techniques sidestep waiting on that
propagation entirely:

- **Short, deliberate TTLs** for content that changes — accept a bounded
  staleness window (`Cache-Control: max-age=60`) instead of depending on
  purge for correctness.
- **Cache-busting via the URL itself** — version a static asset's path
  or query string (`app.js?v=3` or `/assets/v3/app.js`) so a new deploy
  is simply a *new cache key*, never colliding with the old cached
  version at all, and never requiring a purge.

### Origin shielding: the CDN's own architecture can hammer your origin

A naive mental model assumes "many PoPs, but each one only ever asks
origin once per TTL" — in practice, a popular resource with **no**
current PoP cache entry (right after a deploy, or the first request to
a rarely-hit region) can trigger dozens of *simultaneous* PoPs each
independently missing and calling origin for the *same* resource at
once — a **thundering herd**, the CDN version of the caching stampede
problem, at a much larger scale than one process. **Origin shielding**
designates one specific PoP (or a small shielding tier) as the *only*
one allowed to talk to origin; every other PoP's miss routes through the
shield instead of hitting origin directly, collapsing what could have
been N simultaneous origin requests into effectively one.

```
  Without shielding: many PoPs miss at once, all hit origin simultaneously
  PoP-A ──┐
  PoP-B ──┼──► origin (N simultaneous requests for the SAME resource)
  PoP-C ──┘

  With shielding: only the shield PoP talks to origin; others go through it
  PoP-A ──┐
  PoP-B ──┼──► shield PoP ──► origin (ONE request, others wait/reuse the result)
  PoP-C ──┘
```

### Stale-while-revalidate: serving slightly-old content instead of making users wait

Module 06 taught `max-age` as a hard freshness boundary — once expired,
the next request revalidates or refetches before responding.
`stale-while-revalidate` is a refinement many CDNs (and modern browsers)
support: for a bounded extra window *after* `max-age` expires, the cache
serves the stale response **immediately** while fetching a fresh one in
the background for the *next* request, instead of making the current
request wait on that refetch:

```
Cache-Control: max-age=60, stale-while-revalidate=30
```

For the 30 seconds after the 60-second `max-age` window, a request gets
the (slightly stale, at most 90 seconds old) cached response
instantly, while the cache quietly refreshes itself in the background —
trading a small, bounded amount of staleness for **zero** requests ever
waiting on a synchronous origin round trip, a meaningfully different
trade than module 06's plain `max-age` alone offers.

## Command reference

There's no single "run a CDN locally" tool — a real CDN's value is its
globally distributed PoP network, which a laptop fundamentally can't
reproduce. This module instead uses **nginx's `proxy_cache`** to
simulate one PoP's caching behavior faithfully and locally — the same
cache-hit/miss/expiry mechanics a real CDN PoP applies, just running on
one machine instead of hundreds worldwide.

| Concern | nginx directive |
|---|---|
| Declare a cache zone | `proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=mycache:10m max_size=100m inactive=60m;` |
| Use the cache in a location | `proxy_cache mycache;` |
| Set how long a 200 response is cached | `proxy_cache_valid 200 10s;` |
| See hit/miss/expired status | `add_header X-Cache-Status $upstream_cache_status;` |
| Cache-busting via query string | append `?v=N` to the request URL — a different cache key entirely |

A minimal edge-cache config in front of an origin service:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=cdn_cache:10m max_size=100m inactive=60m;

server {
    listen 80;

    location /api/ {
        proxy_cache cdn_cache;
        proxy_cache_valid 200 10s;
        proxy_pass http://origin:8000/api/;
        add_header X-Cache-Status $upstream_cache_status;
    }
}
```

## Hands-on exercises

Run a real origin app behind a real nginx edge cache with Docker
Compose — this reproduces genuine cache MISS/HIT/EXPIRED behavior, not a
simulation.

### 1. Build an origin that reports how many times it's actually been hit

```bash
mkdir -p cdn-lab/origin && cd cdn-lab

cat > origin/app.py << 'EOF'
import time
from flask import Flask, jsonify

app = Flask(__name__)
hit_count = {"n": 0}

@app.get("/api/data")
def data():
    hit_count["n"] += 1
    return jsonify({"served_at": time.time(), "origin_hits": hit_count["n"]})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
EOF

cat > origin/Dockerfile << 'EOF'
FROM python:3.12-slim
WORKDIR /code
RUN pip install --no-cache-dir flask
COPY app.py .
CMD ["python", "app.py"]
EOF

cat > cdn.conf << 'EOF'
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=cdn_cache:10m max_size=100m inactive=60m;

server {
    listen 80;

    location /api/ {
        proxy_cache cdn_cache;
        proxy_cache_valid 200 10s;
        proxy_pass http://origin:8000/api/;
        add_header X-Cache-Status $upstream_cache_status;
    }
}
EOF

cat > compose.yaml << 'EOF'
services:
  origin:
    build: ./origin
  cdn:
    image: nginx:1.27
    ports:
      - "8080:80"
    volumes:
      - ./cdn.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - origin
EOF

docker compose up -d --build
```

### 2. Watch the first request MISS and every request after it HIT

```bash
curl -s -i http://localhost:8080/api/data | grep -E "X-Cache-Status"
curl -s http://localhost:8080/api/data
curl -s -i http://localhost:8080/api/data | grep -E "X-Cache-Status"
curl -s http://localhost:8080/api/data
```

Expected: the first request shows `X-Cache-Status: MISS` with
`"origin_hits":1`; the second and third requests show
`X-Cache-Status: HIT` and the **exact same** `origin_hits` and
`served_at` value as the first — proof the origin was never actually
called again, not just that the response looked similar.

### 3. Watch the cache expire and re-fetch after its TTL

```bash
sleep 11
curl -s -i http://localhost:8080/api/data | grep -E "X-Cache-Status"
curl -s http://localhost:8080/api/data
```

Expected: `X-Cache-Status: EXPIRED` (nginx's status for "was cached, is
now stale, refetched from origin") and `"origin_hits":2` — the `10s`
`proxy_cache_valid` window from `cdn.conf` had elapsed, so this request
genuinely reached origin again, exactly like `max-age` expiring in
module 06.

### 4. Bust the cache with a versioned query string instead of purging

```bash
curl -s -i "http://localhost:8080/api/data?v=2" | grep -E "X-Cache-Status"
curl -s "http://localhost:8080/api/data?v=2"
```

Expected: `X-Cache-Status: MISS` even though you just fetched
`/api/data` moments ago (possibly still within its own cache window) —
because nginx's default cache key includes the query string, `?v=2` is
a completely different cache entry from the un-versioned URL. This is
the mechanism behind "deploy a new asset version, never purge" — a new
URL is automatically a cache miss with no coordination needed.

### 5. Simulate a `Vary`-driven cache-key explosion

Add a second location that includes a header in its cache key (nginx
achieves this by including the header value directly in
`proxy_cache_key`):

```nginx
location /api/personalized/ {
    proxy_cache cdn_cache;
    proxy_cache_valid 200 10s;
    proxy_cache_key "$scheme$request_method$host$request_uri$http_x_user_id";
    proxy_pass http://origin:8000/api/data;
    add_header X-Cache-Status $upstream_cache_status;
}
```

Reload nginx with this added, then request the same URL with different
`X-User-Id` headers:

```bash
curl -s -i http://localhost:8080/api/personalized/ -H "X-User-Id: 1" | grep -E "X-Cache-Status"
curl -s -i http://localhost:8080/api/personalized/ -H "X-User-Id: 2" | grep -E "X-Cache-Status"
curl -s -i http://localhost:8080/api/personalized/ -H "X-User-Id: 1" | grep -E "X-Cache-Status"
```

Expected: the first two requests (different `X-User-Id` values) both
show `MISS` — even though it's the exact same URL, each header value
produced its own cache entry. The third request (repeating
`X-User-Id: 1`) shows `HIT`. If this content is genuinely identical for
every user, including the header in the cache key was a mistake that
silently multiplies your miss rate by however many distinct header
values exist — the CDN-scale version of module 06's `Vary` warning.

### 6. Diagnose and fix: a hit rate that collapsed after adding analytics

A team adds a client-side analytics library that appends
`?utm_source=...&utm_campaign=...` to every outbound link on their
highest-traffic page. A week later, CDN hit-rate dashboards show the
page's cache hit rate dropped from 95% to near 0%, and origin load
spiked accordingly.

<details>
<summary>Solution</summary>

Root cause: the default cache key includes the full URL, query string
and all. Every unique combination of `utm_source`/`utm_campaign`
values — which is effectively unbounded, since it varies per traffic
source and campaign — becomes its **own** cache entry, so the
"same" page is a fresh cache miss for nearly every visitor, exactly like
exercise 4's versioned query string, except unintentional and
unbounded instead of deliberate and small.

Fix: configure the CDN/cache to **strip or ignore known tracking query
parameters** when constructing the cache key for pages whose content
doesn't actually depend on them (most CDNs support an explicit
"ignore these query params for caching purposes" rule). The URL the
*browser* sees can still carry `utm_*` params for analytics; the URL the
*cache* keys on should not, restoring the original hit rate without
losing the analytics data.

</details>

### 7. Clean up

```bash
docker compose down
cd .. && rm -rf cdn-lab
```

## Independent challenge

No code given. Design the CDN caching strategy for a news site's
homepage, which is regenerated by the origin every 30 seconds, gets
enormous traffic spikes when a major story breaks, and must never show a
logged-in user's personalized "saved articles" widget to a different
user. Specify: (1) the `Cache-Control` header (including whether
`stale-while-revalidate` belongs here and why) for the shared, public
parts of the page; (2) whether the personalized widget can be cached at
all at the CDN layer, and if not, how you'd architect the page so the
cacheable and non-cacheable parts don't force the whole response to be
uncacheable; (3) what origin-shielding buys you specifically during a
traffic spike right after a major story breaks and the cache has just
gone cold for that story's page; (4) how a new deploy that changes the
homepage's HTML structure should be rolled out without needing to
coordinate a purge across every PoP.

<details>
<summary>Stuck? One hint</summary>

The public homepage content: `Cache-Control: max-age=30,
stale-while-revalidate=30` — short because the origin regenerates it
every 30 seconds, with `stale-while-revalidate` so a spike right after
expiry doesn't force every concurrent request to wait on a synchronous
origin refetch. The personalized widget shouldn't be cached at the CDN
layer at all (`Cache-Control: private, no-store` on that specific
response) — the realistic architecture is to render it client-side via a
separate, uncached API call, or as an edge-computed fragment (module
08's edge-computing module) rather than baking it into the
cacheable page HTML, so the cacheable shell and the per-user fragment
are genuinely separate responses. Origin shielding collapses the many
simultaneous PoP misses right after a story breaks into effectively one
origin request instead of a stampede. A deploy that changes HTML
structure is safest as a new asset-path/version the same way exercise 4
demonstrated, or accepting the short `max-age` window as the natural
rollout boundary — no purge coordination required either way.

</details>

## Common mistakes & troubleshooting

- **Including a tracking or session-identifying value in the cache
  key without meaning to.** Exercises 5 and 6 both showed the same
  failure at different scales: an unbounded or per-user value in the
  cache key silently multiplies cache misses, sometimes catastrophically.
- **Relying on purge for correctness instead of short TTLs or
  versioned URLs.** Purge is a fan-out operation across many
  independent PoPs and isn't instantaneous — content that must be
  correct *immediately* everywhere shouldn't depend on purge timing.
- **Assuming a CDN protects origin from simultaneous cold-cache
  misses.** Without origin shielding, a popular resource going cold
  (post-deploy, or first hit in a new region) can trigger many PoPs
  hitting origin for the same resource at once — the exact thundering
  herd this module's shielding technique exists to prevent.
- **Caching a response that mixes public and per-user content in one
  payload.** If any part of a response is user-specific, either the
  whole response becomes uncacheable at the CDN layer or (better) the
  personalized part is architected as a separate, uncached fetch so the
  shared shell can still be cached aggressively.
- **Forgetting module 06's rules still apply.** A CDN doesn't replace
  `Cache-Control`/`ETag`/`Vary` — it reads and enforces them at a larger
  scale. Getting those headers wrong breaks CDN caching exactly the way
  it broke a single reverse-proxy cache, just with more PoPs affected.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does a CDN change about the HTTP caching rules module 06
   taught, and what does it add?
2. What is a cache key, and why can including an unnecessary header or
   query parameter in it silently destroy your hit rate?
3. Why is "purge" a fundamentally different operation for a CDN than
   for a single reverse-proxy cache, and what are two techniques that
   avoid depending on it?
4. What problem does origin shielding solve, and when does it matter
   most?
5. What does `stale-while-revalidate` let a cache do that plain
   `max-age` doesn't?

<details>
<summary>Answers</summary>

1. It changes nothing about the rules themselves — `Cache-Control`,
   `ETag`, and `Vary` mean exactly what module 06 taught. What it adds
   is scale: those same rules now get applied at many geographically
   distributed PoP caches instead of one reverse proxy, which introduces
   new considerations around purge propagation, cache-key construction,
   and origin-request stampedes that a single cache doesn't have to
   worry about.
2. A cache key is what a cache uses to decide whether two requests are
   "the same" cached response. Including something that varies per
   request but doesn't actually change the response (a tracking query
   param, a per-user header) means every distinct value creates its own
   cache entry — turning what should be a small number of cached
   responses into an effectively unbounded number of cache misses.
3. A single reverse-proxy cache is one process you can clear directly. A
   CDN has many independent PoP caches, so a purge has to fan out and
   propagate to every one of them, which isn't instantaneous. Two
   techniques that avoid depending on that propagation: short,
   deliberate TTLs (accept bounded staleness instead), and cache-busting
   via a versioned URL/query string (a new version is simply a new cache
   key, never needing to invalidate the old one).
4. It solves the thundering-herd problem of many PoPs simultaneously
   missing on the same cold resource and all calling origin at once.
   Origin shielding routes every PoP's miss through one designated
   shield instead, collapsing N simultaneous origin requests into
   effectively one. It matters most right after a deploy, or for a
   resource that suddenly becomes popular in a region with no warm
   cache yet.
5. Plain `max-age` means once the freshness window expires, the next
   request must wait for revalidation/refetch before it gets a response.
   `stale-while-revalidate` lets the cache serve the stale response
   immediately for a bounded extra window while refreshing in the
   background, so no request has to wait synchronously on that refetch —
   trading a small amount of bounded staleness for consistently fast
   responses.

</details>

## Further reading & sources

- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) - the same `Cache-Control` contract from module 06, referenced here as the foundation a CDN builds on.
- [Fastly: Shielding](https://docs.fastly.com/en/guides/shielding) - a production CDN's own explanation of origin shielding and the thundering-herd problem it solves.
- [Cloudflare: Cache keys and cache variance](https://developers.cloudflare.com/cache/how-to/cache-keys/) - configuring what is and isn't included in a real CDN's cache key, directly relevant to exercises 5 and 6.
- [MDN: stale-while-revalidate](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#stale-while-revalidate) - the exact header syntax and semantics used in this module's Concepts section.
- [nginx: proxy_cache_path and related directives](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache_path) - the reference for every directive used in this module's exercises.

## Next

[13-capstone-project](../13-capstone-project/README.md) — time to put the
entire track together: build a raw-HTTP-aware Python service that
demonstrates correct status codes, headers, caching, content negotiation,
and versioned JSON + protobuf responses.
</content>
