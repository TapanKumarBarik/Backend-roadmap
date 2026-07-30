# Module 08: Edge Computing and WebAssembly

## Why this matters

Module 00's paradigm map placed every option on one of two ends of a
request's journey: your origin server (REST, gRPC, GraphQL all run
there) or the browser (the client). This module adds a third place code
can run: **the edge** — infrastructure physically distributed close to
where requests actually originate, running your logic in a **WebAssembly
sandbox** instead of a traditional server process, often before the
request ever reaches your origin at all. The pitch isn't "faster
servers" — it's a genuinely different place in the request's path, with
different constraints (no long-lived connections, no arbitrary native
code, cold starts measured in single-digit milliseconds instead of
hundreds) that make certain classes of logic — auth checks, geo-routing,
A/B assignment, simple transforms — dramatically cheaper to run at the
edge than to round-trip to origin for. This module gives you the mental
model and lets you run real edge functions locally so you can feel the
difference rather than take a vendor's latency chart on faith.

## Concepts

### Where "the edge" sits in a request's path

A traditional request goes client → (maybe a CDN cache hit) → your
origin server, wherever that's hosted. Edge computing inserts a fourth
option: client → **edge function**, running on infrastructure at a
point-of-presence (PoP) physically close to the client, which can answer
the request itself, modify it before forwarding, or decide not to bother
your origin at all.

```
  Traditional:     client ──────────────────────► origin server
                          (every request travels the full distance)

  CDN (caching):   client ──► CDN edge cache ──► origin (only on a miss)

  Edge compute:     client ──► edge FUNCTION (runs YOUR code, close by)
                                   │
                            can answer directly,
                            or forward to origin
                            only if it needs to
```

The previous module's CDN content covered *caching* static responses at
the edge. This module is about running **your own code** at that same
location — a meaningfully different capability: a cache can only serve
what's already there; an edge function can make a decision.

### WebAssembly (Wasm): why the edge doesn't just run your normal server code

Edge platforms don't give you a normal OS process or a container per
customer the way a traditional server would — that's too heavy to spin
up in milliseconds, at every PoP, for every customer's code, on shared
hardware you don't control. **WebAssembly** is a low-level, portable
bytecode format, originally built for running native-speed code safely
inside a browser, that turns out to be exactly the right shape for this
problem: a Wasm module runs inside a lightweight, memory-isolated sandbox
that starts in microseconds (not the hundreds of milliseconds a
container or VM needs) and can't touch anything outside its sandbox
unless the host explicitly allows it. This is *why* the edge runs Wasm
specifically, not "the cloud, but smaller" — the sandboxing and startup
speed are the actual enabling technology, not an implementation detail.

JavaScript, the most common language edge functions are written in
today, itself runs *inside* this same kind of isolate-based sandbox on
platforms like Cloudflare Workers — you don't have to write raw Wasm
yourself to get its isolation and startup-speed properties; the platform
compiles/JITs your JS into that sandboxed execution model for you. Other
languages (Rust, Go, C) can compile directly to Wasm and run in the same
sandbox when you want more control or portable, near-native performance.

### No long-lived state, no arbitrary native calls — the real constraint

An edge function is not a smaller version of your origin server; it runs
under different rules:

- **No persistent local disk, no long-lived in-memory state between
  requests** (by default) — each invocation is expected to be able to
  start fresh, because the *same* function might run at a different PoP
  on the next request, or the isolate might simply be recycled. State
  that must persist belongs in an edge-reachable store (a globally
  replicated key-value store, or a call back to your origin/database) —
  not in a module-level variable you assume survives.
- **No arbitrary outbound native code, no shelling out, no filesystem
  access to the host** — the sandbox that makes startup fast and
  multi-tenant execution safe also means you're restricted to the APIs
  the platform exposes (`fetch`, a KV store client, etc.), not "run any
  program you want."
- **A CPU-time budget per invocation**, often in the low milliseconds —
  edge functions are built for cheap, fast, request-shaping logic (check
  a header, pick a variant, rewrite a URL), not for running your whole
  application. Reaching for the edge to do heavy computation is a
  mismatch this module explicitly warns against.

### What actually belongs at the edge

Given those constraints, the sweet spot is logic that's **cheap,
stateless (or backed by edge-native storage), and benefits from running
close to the client before your origin is ever involved**:

- **Auth/allowlist checks** — reject an obviously invalid or blocked
  request before it ever reaches origin, saving the round trip entirely
  for traffic you were always going to refuse.
- **A/B testing and feature-flag assignment** — decide which experiment
  bucket a request falls into at the very first hop, consistently,
  without a origin round trip just to pick a variant.
- **Geo-based routing and redirects** — serve a region-specific redirect
  or response using the request's known origin location, without your
  application server ever seeing that request.
- **Request/response rewriting** — add security headers, rewrite a path,
  strip a query parameter, normalize a header — cheap transformations
  that don't need your full application stack.

What does **not** belong at the edge: anything needing a real database
transaction, heavy computation, or long-lived connections — that's still
your origin's job. The edge is a *first stop*, not a replacement
architecture.

### Cold starts: the concrete number that makes this a different tool

A traditional serverless function (a container-based FaaS) commonly has
a cold-start latency in the **hundreds of milliseconds** the first time
it spins up on a given host — the cost of starting a container/VM
runtime. A Wasm-sandboxed edge isolate's cold start is commonly cited in
the **single-digit milliseconds**, because there's no OS process or
container to boot — the isolate is closer to "load a small, pre-verified
bytecode module into an already-running host process" than "boot a
machine." This module doesn't ask you to trust that number blindly:
the hands-on exercises have you run and time a real edge function
locally so you can see the shape of the cost yourself, even though a
laptop's local dev server won't reproduce a production multi-region
network's actual latency profile — that global-distribution benefit is
inherent to the vendor's infrastructure, not something a local exercise
can demonstrate.

## Command reference

This module uses **Cloudflare Workers** via `wrangler`, its official
CLI, which includes a fully local dev server (`workerd`, the same
open-source runtime Cloudflare's production edge uses) — no account or
deployment needed to run and test the examples below.

| Concern | Command / API |
|---|---|
| Run a worker locally | `npx wrangler dev` |
| Minimal worker entrypoint | `export default { async fetch(request) { ... } }` |
| Read the request URL | `new URL(request.url)` |
| Build a JSON response | `new Response(JSON.stringify(obj), { headers: {"content-type": "application/json"} })` |
| Redirect | `Response.redirect(url, statusCode)` |
| Forward to origin only when needed | `await fetch(originUrl, request)` (calls out, same as any `fetch`) |
| Read a geo-routing hint (Workers-specific) | `request.cf?.country` |

A worker that rejects at the edge before ever calling origin:

```javascript
export default {
  async fetch(request) {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || !isAllowed(apiKey)) {
      // Never touches origin — the reject happens at the very first hop.
      return new Response("Unauthorized", { status: 401 });
    }
    // Only forward to origin for requests that pass the check.
    return fetch("https://origin.example.com" + new URL(request.url).pathname, request);
  },
};

function isAllowed(key) {
  return key === "demo-allowed-key"; // stand-in for a real allowlist/KV lookup
}
```

A worker that assigns an A/B variant consistently at the edge:

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const bucket = (Math.random() < 0.5) ? "A" : "B";
    return new Response(JSON.stringify({ variant: bucket, path: url.pathname }), {
      headers: { "content-type": "application/json" },
    });
  },
};
```

## Hands-on exercises

`npx wrangler dev` requires Node.js (already installed if you've done
any modern JS tooling) — no Cloudflare account is needed for local
development; `wrangler dev` runs your code against a fully local copy of
the same open-source runtime (`workerd`) production traffic runs on.

### 1. Run your first edge function locally

```bash
mkdir edge-lab && cd edge-lab
cat > worker.js << 'EOF'
export default {
  async fetch(request) {
    const country = request.cf?.country || "unknown";
    return new Response(JSON.stringify({ message: "hello from the edge", country }), {
      headers: { "content-type": "application/json" },
    });
  },
};
EOF
cat > wrangler.toml << 'EOF'
name = "edge-lab"
main = "worker.js"
compatibility_date = "2024-01-01"
EOF
npx wrangler dev --port 8791
```

In a second terminal:

```bash
curl -s http://127.0.0.1:8791/
```

Expected: a JSON response like `{"message":"hello from the edge",
"country":"..."}` — your code, running inside `workerd`'s sandbox, not a
traditional Node.js server process.

### 2. Reject a request at the edge before it would reach origin

Using the "rejects before calling origin" pattern from the Command
reference, request without and with the header:

```bash
curl -s -i http://127.0.0.1:8791/           # no x-api-key header
curl -s -i http://127.0.0.1:8791/ -H "x-api-key: demo-allowed-key"
```

Expected: the first request gets `401 Unauthorized` — and note that in a
real deployment this reject happens at a PoP near the client, so a
malicious or invalid request never even reaches your origin's network,
let alone its application code. The second request would attempt to
forward to `origin.example.com` (which doesn't exist in this exercise,
so expect a fetch error — the point here is confirming the *decision
logic* ran correctly at the edge, not standing up a real origin).

### 3. Redirect at the edge with zero origin involvement

```bash
cat > worker.js << 'EOF'
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/old-path") {
      return Response.redirect("https://example.com/new-path", 302);
    }
    return new Response("no redirect for this path");
  },
};
EOF
npx wrangler dev --port 8791
```

```bash
curl -s -i http://127.0.0.1:8791/old-path | head -5
```

Expected: `HTTP/1.1 302 Found` with a `Location:
https://example.com/new-path` header — the redirect decision and
response were both generated entirely by the edge function, with no
origin server involved at all.

### 4. Prove A/B assignment happens without any backend round trip

Using the A/B pattern from the Command reference, run several requests
in a row:

```bash
for i in 1 2 3 4 5 6; do curl -s http://127.0.0.1:8791/; echo; done
```

Expected: a mix of `{"variant":"A",...}` and `{"variant":"B",...}`
responses — the experiment assignment decision was made entirely inside
the edge function, per request, with no call to any backend service or
experimentation platform.

### 5. Feel the state-isolation constraint directly

```bash
cat > worker.js << 'EOF'
let counter = 0; // module-level "state" -- deliberately naive

export default {
  async fetch(request) {
    counter += 1;
    return new Response(JSON.stringify({ counter }), {
      headers: { "content-type": "application/json" },
    });
  },
};
EOF
npx wrangler dev --port 8791
```

```bash
for i in 1 2 3; do curl -s http://127.0.0.1:8791/; echo; done
```

Expected locally: the counter *does* increment within this one dev
session, because your laptop is running one single instance of the
isolate for this exercise. In a real multi-PoP deployment, this same
code is unreliable as a source of truth — a different request can land
on a different, freshly-started isolate at a different PoP with its own
`counter` starting back at zero, so relying on module-level state for
anything that must be consistent (a real request count, a rate limit)
is a mistake this exercise is designed to expose conceptually, even
though a single local dev server can't reproduce the multi-PoP
inconsistency itself. Fix conceptually: any state that must be
consistent belongs in an edge-reachable external store (a globally
replicated KV store, or your origin), not a module-level variable.

### 6. Diagnose and fix: an edge function that silently breaks under real traffic

A team ships an edge function that rate-limits requests per API key by
counting hits in a module-level `Map`, exactly like exercise 5's
counter. In their local testing (one dev server, one isolate) it works
perfectly. In production, abusive clients are getting through the rate
limit far more often than the configured threshold should allow.

<details>
<summary>Solution</summary>

Root cause: the rate limiter's counter lives in module-level memory
inside a single isolate, but production edge platforms run many
independent isolates across many PoPs (and even multiple isolates on
one PoP under load) — each with its *own* separate copy of that `Map`,
starting from zero. A client's requests don't reliably land on the same
isolate twice, so the "count of hits so far" the code checks against is
never the *true* global count — it's whatever one, randomly-selected
isolate happened to see. An abusive client effectively gets a fresh
rate-limit budget on every isolate their requests happen to land on.

Fix: move the counter into a store the edge platform can read/write
consistently across all isolates — a globally-consistent or
strongly-consistent key-value/counter service designed for this exact
problem (e.g. Cloudflare's Durable Objects, or a call out to a shared
Redis/database) — so every isolate, everywhere, checks and increments
the *same* counter instead of each keeping its own local guess. This is
the edge-computing version of a lesson from track 06's pub-sub-architecture
module (module 08 there): don't rely on in-process state across multiple
independent worker processes — the same problem, one level further out,
across PoPs instead of across processes on one machine.

</details>

### 7. Clean up

```bash
# Ctrl+C the running `wrangler dev` process; no cloud resources were created.
```

## Independent challenge

No code given. Design an edge-function strategy for a public API that's
currently REST-only, entirely served from one origin region. You've been
asked to: (1) reject requests from a small list of abusive IP ranges
before they reach origin, (2) redirect EU-region traffic to a
region-specific terms-of-service page for a specific deprecated
endpoint, (3) run a 50/50 experiment on a new response format for one
endpoint, and (4) maintain an accurate, global count of how many times
each API key has been used this month for billing purposes. For each of
the four requirements, decide whether it belongs at the edge or must
stay at origin, and if it belongs at the edge, whether it needs external
state or can be handled with pure per-request logic. Justify each
decision using this module's constraints (statelessness, CPU budget, no
native calls) rather than just asserting an answer.

<details>
<summary>Stuck? One hint</summary>

(1), (2), and (3) are all pure per-request decisions with no need for
state that must be globally consistent — textbook edge-function
territory, exactly like exercises 2-4. (4) is the interesting one: an
accurate, global, billing-grade count is precisely the kind of state
exercise 5/6 showed module-level edge state *cannot* reliably provide —
it needs either a globally-consistent counter store the edge can call
into, or (more simply) should just be tracked at origin/your database,
accepting that the edge's job here is limited to letting the request
through, not doing the counting itself.

</details>

## Common mistakes & troubleshooting

- **Treating an edge function as a smaller server.** It runs under real
  constraints — no persistent local state by default, a tight CPU-time
  budget, no arbitrary native code — not just "the same code, closer to
  the user." Design for those constraints explicitly rather than
  porting server logic over unchanged.
- **Storing state that must be globally consistent in module-level
  memory.** Exercises 5 and 6 showed this directly: each isolate, at
  each PoP, has its own separate copy, so a rate limiter or counter
  built this way silently under-enforces in production even though it
  looks correct in a single local dev session.
- **Reaching for the edge to do heavy computation.** The CPU-time budget
  and sandboxed execution model exist for cheap, fast, per-request
  logic — routing, auth checks, rewrites — not your full application's
  business logic. That's still origin's job.
- **Assuming a local `wrangler dev` session proves the global-latency
  benefit.** A local dev server validates your *logic*, not the
  multi-region distribution that's the actual latency win — that
  benefit only appears with a real multi-PoP deployment, and this
  module says so honestly rather than claiming a laptop benchmark
  proves the vendor's latency chart.
- **Putting genuinely origin-bound work (a real database transaction,
  anything needing strong consistency across many operations) at the
  edge.** The edge is a first stop for cheap decisions, not a
  replacement architecture for your backend.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Where does an edge function run in a request's path, and how is that
   different from a CDN cache?
2. Why do edge platforms run code inside a WebAssembly-based sandbox
   instead of a traditional container or VM per customer?
3. Name three kinds of logic that are a good fit for the edge, and one
   kind of work that is *not* a good fit, with a reason for each.
4. Why is a module-level variable an unreliable place to keep a count
   that must be accurate (like a rate limit or a billing counter) in a
   real edge deployment, even if it works correctly in local testing?
5. What's the actual claimed advantage of a Wasm-sandboxed cold start
   over a traditional container-based serverless cold start?

<details>
<summary>Answers</summary>

1. It runs at a point-of-presence physically close to the client,
   before the request necessarily reaches your origin server. Unlike a
   CDN cache, which can only serve an already-cached static response, an
   edge function runs your actual code and can make a decision per
   request — reject it, redirect it, rewrite it, or decide to forward it
   to origin.
2. Because a Wasm-based sandbox starts in microseconds and isolates
   tenants safely on shared hardware without needing to boot a full OS
   process or container per customer — the fast-start, safely-isolated
   properties are the specific reason this technology fits the edge's
   "many customers, many PoPs, must start instantly" requirement.
3. Good fits: auth/allowlist checks (reject before origin), A/B/feature-
   flag assignment (a pure per-request decision), and geo-based
   routing/redirects (uses request-local information, no origin needed).
   Not a good fit: heavy computation or anything needing a real,
   multi-step database transaction — the CPU-time budget and sandboxed
   execution model aren't built for that, and it belongs at origin.
4. Because production edge platforms run many independent isolates
   across many PoPs, each with its own separate copy of any module-level
   variable — a client's requests don't reliably land on the same
   isolate twice, so the "count so far" any single isolate sees is never
   the true global count. Local testing only exercises one isolate, so
   it hides this entirely; the bug only appears under real, distributed
   traffic.
5. A traditional container/VM-based serverless cold start commonly costs
   hundreds of milliseconds (booting a container runtime); a Wasm
   isolate's cold start is commonly single-digit milliseconds, because
   there's no OS process or container to boot — closer to loading a
   small, pre-verified bytecode module into an already-running host
   process.

</details>

## Further reading & sources

- [Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/) - the official explanation of the V8-isolate/Wasm sandboxing model used throughout this module.
- [Cloudflare: WebAssembly on Workers](https://developers.cloudflare.com/workers/runtime-apis/webassembly/) - using compiled Wasm modules directly in a Worker, beyond the JavaScript examples in this module.
- [Wrangler CLI documentation](https://developers.cloudflare.com/workers/wrangler/) - the CLI and local dev server (`workerd`) used in every exercise in this module.
- [Fastly: Compute — WebAssembly at the edge](https://www.fastly.com/documentation/guides/compute/) - a second major vendor's take on the same Wasm-at-the-edge model, useful for confirming this isn't one company's idiosyncratic design.
- [Cloudflare: Durable Objects](https://developers.cloudflare.com/durable-objects/) - the mechanism referenced in exercise 6's fix for state that must be globally consistent across isolates.

## Next

[09-capstone-project](../09-capstone-project/README.md) — you've built
the whole map: REST, gRPC, GraphQL, event-driven communication, and now
edge computing as a fifth place logic can run. The capstone makes the
core of it real in miniature: one small service exposed via an internal
gRPC API and fronted by a GraphQL BFF for a web client.
</content>
