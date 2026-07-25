# Load Balancing Concepts

## Why this matters

A single server can't handle a real workload, so production traffic almost always hits a **load balancer** first, which spreads requests across many backends. This changes how you read every failure: a `502` isn't "the app crashed," it's "the balancer couldn't reach a healthy backend"; an intermittent bug that "only happens sometimes" is often "one bad backend out of five." Load balancing is also the direct conceptual parent of Azure Load Balancer, Application Gateway, and the ingress in Container Apps — understanding L4 vs L7, health checks, and session persistence here makes those services obvious later.

## Concepts

### What a load balancer is

A **load balancer** presents a single stable address (a **virtual IP / VIP**, often behind a DNS name) to clients, and distributes incoming connections or requests across a pool of **backends** (also called real servers, targets, or upstreams). Clients think they're talking to one machine; behind the VIP, the work is shared across many. Besides spreading load, it provides **high availability**: if a backend dies, the balancer stops sending it traffic and the service keeps working. Think of it as the host stand at a busy restaurant — one line, one greeter, many tables, and diners never need to know which table is free.

### Layer 4 vs Layer 7

The single most important distinction is *what the balancer looks at*, framed by the layer model from module 00:

- **Layer 4 (transport) load balancing** operates on TCP/UDP (module 03). It sees IP addresses and ports, not the content. It picks a backend when the connection is established and forwards packets/bytes without understanding them. It's fast, protocol-agnostic (works for any TCP/UDP service, not just HTTP), but can't make decisions based on URL, headers, or cookies.
- **Layer 7 (application) load balancing** operates on HTTP/HTTPS (module 04). It terminates the connection, reads the actual request — path, headers, host, cookies — and can route on that content (`/api` to one pool, `/images` to another), rewrite requests, and often terminate TLS. It's smarter but does more work per request and only understands the protocols it speaks.

The rule of thumb: choose **L4** when you need raw speed or non-HTTP protocols and don't need content-based decisions; choose **L7** when you need routing by URL/host/header, TLS termination, or per-request logic. Azure's Load Balancer is L4; Application Gateway and Container Apps ingress are L7 — the same split you're learning now.

### Distribution algorithms

Once a balancer decides to send a request somewhere, an **algorithm** picks which backend:

- **Round robin** — each new request goes to the next backend in rotation. Simple and even when backends are equal.
- **Least connections** — send to the backend with the fewest active connections. Better when request durations vary widely.
- **Weighted** variants — give beefier backends a larger share (weighted round robin / weighted least connections).
- **Hash-based** (e.g. by source IP) — the same client consistently maps to the same backend, a cheap form of stickiness.

The right choice depends on whether backends are identical, whether requests are uniform or long-lived, and whether clients need to hit the same backend repeatedly. Round robin is the sensible default; least-connections helps when some requests are much heavier than others.

### Health checks

A load balancer must know which backends are alive, so it continuously runs **health checks (probes)** against each one and only sends traffic to those passing. An **active** check periodically connects or sends a request; a **passive** check watches real traffic for failures. Checks come in depths: a shallow **L4 check** just opens a TCP connection to the port (is anything listening?), while a deeper **L7 check** issues an HTTP request to a health endpoint (e.g. `GET /healthz` expecting `200`) — the latter catches an app that's listening but broken (returning 500s, or up but its database is down).

This is why health-check design matters: a TCP-only check will happily keep sending traffic to an app that accepts connections but returns errors, because the port is open. A good `/healthz` endpoint reflects real readiness (dependencies included). When a backend fails its checks, the balancer removes it from rotation; when it recovers, the balancer adds it back — usually after several consecutive successes to avoid flapping.

### Session persistence (stickiness)

HTTP is stateless (module 04), but some applications keep per-user state in memory on one backend (a session, an upload in progress). If the balancer sends that user's next request to a *different* backend, the state isn't there and things break. **Session persistence / sticky sessions** ties a client to the same backend for the duration of a session — via a cookie the L7 balancer sets, or a source-IP hash at L4. It solves the stateful-app problem but has a cost: it unbalances load (a few heavy clients pin to a few backends) and complicates failover (if that backend dies, the session is lost anyway). The cleaner long-term answer is **stateless backends** that store session state in a shared store (a database or cache), so any backend can serve any request and stickiness becomes unnecessary. Recognizing "works sometimes, fails sometimes after login" as a stickiness/state problem is a valuable instinct.

### Reading failures through the balancer

Because a balancer sits between client and backend, it reshapes how failures appear. A client-visible `502 Bad Gateway` or `504 Gateway Timeout` (module 04) usually means the *balancer* reached the client fine but couldn't get a good/timely response from a backend — so you debug the balancer-to-backend hop, not the client-to-balancer hop. "One in five requests fails" strongly suggests one unhealthy backend still (wrongly) in rotation, often because the health check is too shallow to notice. And a request that works when you hit a backend directly but fails through the VIP isolates the problem to the balancer or its health/routing config. This layered view — client → VIP → backend — is the load-balancing counterpart of tracing a packet through routing and firewalls in module 05.

## Command reference

Load balancers are usually managed platforms, but you can observe and simulate the concepts with standard tools.

| Command | What it does | Example |
|---------|--------------|---------|
| `curl` (repeated) | Hits a VIP repeatedly to observe distribution across backends | `for i in $(seq 6); do curl -s http://vip/whoami; done` |
| `curl -H` | Sends a specific Host/header so an L7 balancer routes it | `curl -H 'Host: api.example' http://vip/` |
| `curl --resolve` | Forces a hostname to a specific IP, bypassing DNS to test a backend directly | `curl --resolve app.example:443:10.0.0.5 https://app.example/` |
| `curl -w` | Prints timing/status details to compare backends | `curl -s -o /dev/null -w '%{http_code} %{time_total}\n' http://vip/` |
| `nc -zv` | L4-style health check: is the backend's port open? | `nc -zv 10.0.0.5 8080` |
| `ss -tan` | Shows connection distribution/states (from module 03) | `ss -tan state established` |

Flag breakdowns:

- `curl --resolve app.example:443:10.0.0.5 https://app.example/` — `--resolve name:port:addr` forces `app.example:443` to connect to `10.0.0.5` while *still* sending the correct SNI/Host for `app.example`, so you can test one specific backend behind a VIP without changing DNS. Essential for "is it the balancer or this backend?"
- `curl -s -o /dev/null -w '%{http_code} %{time_total}\n' http://vip/` — `-s` silent, `-o /dev/null` discard body, `-w` write out chosen variables (here the HTTP status and total time). Loop it to spot one slow/erroring backend among many.
- `curl -H 'Host: api.example' http://vip/` — `-H` adds/overrides a header; setting `Host` lets you exercise an L7 balancer's host-based routing without DNS for that name.

## Hands-on exercises

These use Docker (from your earlier track) to build a tiny load-balanced setup. If Docker isn't available, read them as a thought exercise and do the `curl`/`nc` observation parts against any real site.

1. **Two backends that identify themselves.** Start two simple web servers that echo their own name, on different ports: `docker run -d --name b1 -p 8081:80 -e ... ` (or two `python3 -m http.server` instances in directories containing different `index.html` files). Confirm each responds distinctly with `curl localhost:8081` and `curl localhost:8082`.

2. **Round-robin by hand.** Write a loop that alternates: `for i in $(seq 6); do curl -s localhost:808$((i%2+1)); done`. Observe the responses alternating between backends — you've simulated round-robin distribution. Expected: b1, b2, b1, b2, ...

3. **L4 vs L7 in your head.** For each of these needs, decide L4 or L7 and why: route `/api` and `/web` to different pools; balance a raw PostgreSQL (TCP 5432) service; terminate TLS centrally; balance a UDP game server. Expected: L7, L4, L7, L4 respectively.

4. **Simulate a health check.** Run an L4 check `nc -zv localhost 8081` (port open = pass) and an L7 check `curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/` (200 = pass). Now stop the app process but imagine the port still accepted connections — note how the L4 check would falsely pass while the L7 check catches the real failure.

5. **Test a backend directly through a fake VIP name.** Pick any HTTPS site and run `curl --resolve example.com:443:93.184.216.34 https://example.com/ -I`. You forced the name to a specific address while keeping correct SNI. Expected: a normal 200/headers, proving you can target one backend behind a name. This is the core "is it the LB or this backend?" technique.

6. **Compare backend timings.** Loop `curl -s -o /dev/null -w '%{http_code} %{time_total}\n'` against your two backends several times. Expected: similar codes/times when both are healthy; a divergent slow or erroring line is how you'd spot a bad backend in a pool.

7. **Observe stickiness vs not.** With your round-robin loop from exercise 2, note there's *no* stickiness — consecutive requests land on different backends. Reason about what would break if b1 held a login session and request 2 went to b2. Expected: the session wouldn't be found on b2 — the "logged in, then randomly logged out" symptom.

8. **Diagnose and fix: one unhealthy backend still in rotation.** Simulate it: keep b1 healthy but make b2 return errors (stop its app but leave a listener, or serve a page that 500s). Run the round-robin loop from exercise 2 with `-w '%{http_code}\n'`. You see an alternating pattern like `200, 500, 200, 500` — exactly the "fails every other request" symptom. Diagnose: hit each backend directly (`curl localhost:8081` vs `localhost:8082`) to identify *which* backend is bad — b2 returns 500 while b1 returns 200. The root cause is that the "balancer" is still sending traffic to an unhealthy backend because nothing removed it. **Fix (conceptual):** the health check must be deep enough (L7 `/healthz`, not just L4 port-open) to detect b2's failure and pull it from rotation; operationally, remove/repair b2. Re-run the loop after "removing" b2 (only curl b1) to confirm a clean `200, 200, 200`. The lesson: intermittent, patterned failures = one bad backend + an inadequate health check.

## Independent challenge

Users of a web app report that they get logged out at random and occasionally see a `502`, but only "sometimes." You have a load balancer in front of four backends. Design an investigation that determines (a) whether the intermittent logouts are a session-persistence/state problem and (b) whether the `502`s trace to one specific unhealthy backend that the health check isn't catching. You must combine this module with **module 04 (HTTP/TLS)**: use HTTP status semantics and direct-to-backend requests to distinguish a client-side 4xx from a backend 5xx, and to tell "the LB can't reach the backend" from "the backend itself errors."

<details><summary>Stuck? One hint</summary>

Attack the two symptoms separately. For the logouts: the "random" nature across multiple backends screams session state living in one backend's memory with no stickiness (or failed stickiness) — reproduce by forcing requests to different backends (`curl --resolve` to each) after logging in and see if the session survives. For the 502s: a 502 is a backend/upstream failure (module 04), not a client error, so hit each backend *directly* (bypassing the VIP with `--resolve`) and compare status codes — if one backend consistently errors while the VIP only fails "sometimes," the health check is too shallow to evict it. Round-robin over four backends means roughly one in four requests is the culprit.

</details>

## Common mistakes & troubleshooting

- **Blaming the app for a 502/504.** These are gateway errors — the balancer couldn't reach or get a timely reply from a backend. Debug the balancer→backend hop and backend health, not the client's request.
- **Health checks that are too shallow.** A TCP-only (L4) check passes as long as *something* accepts the port, even if the app returns 500s or its database is down. Use an L7 `/healthz` that reflects real readiness.
- **Reaching for stickiness instead of statelessness.** Sticky sessions paper over in-memory state but unbalance load and lose sessions on failover. Prefer stateless backends with a shared session store.
- **Testing only through the VIP.** When something fails "sometimes," you can't tell which backend is bad from the VIP alone. Use `curl --resolve` to hit each backend directly and isolate the offender.
- **Assuming round robin means perfectly even load.** Round robin distributes *requests*, not *work*. If some requests are far heavier, least-connections or weighting fits better.
- **Forgetting the balancer terminates TLS (L7).** If the L7 balancer terminates TLS, the backend often speaks plain HTTP behind it — cert problems and encryption expectations differ on each hop. Don't debug the backend as if it must present the public cert.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does a Layer 4 balancer see that a Layer 7 balancer additionally sees, and give one thing only L7 can do.
2. Why can a TCP-only health check keep an actually-broken backend in rotation?
3. A user reports being "randomly logged out." What load-balancing concept is the likely cause, and what's the cleaner fix than sticky sessions?
4. A client gets an intermittent `502`. Whose hop should you investigate and why?
5. When is least-connections a better algorithm than round robin?
6. How does `curl --resolve` help you decide whether a problem is the load balancer or one backend?
7. What is a VIP, and what two benefits does putting one in front of a pool provide?
8. You need to balance a raw non-HTTP TCP service and also route HTTP by URL path. Which layer of balancing does each require?

<details><summary>Show answers</summary>

1. L4 sees IP addresses and ports (transport). L7 additionally reads the HTTP content — path, headers, host, cookies — so only L7 can do things like route `/api` vs `/web`, rewrite requests, or terminate TLS with per-request logic.
2. A TCP check only verifies something is accepting connections on the port. An app can accept connections while returning 500s or with a dead dependency, so the port-open check passes and the balancer keeps sending it traffic.
3. In-memory session state on one backend without (working) session persistence — requests land on different backends that don't have the session. The cleaner fix is stateless backends storing session state in a shared store (DB/cache), removing the need for stickiness.
4. The balancer→backend hop. A 502 means the balancer reached the client but couldn't get a good response from a backend, so the fault is upstream of the balancer, not in the client's request.
5. When request durations vary a lot, so simple rotation can pile long-lived connections onto one backend. Least-connections steers new work to the least-busy backend.
6. It forces a hostname to resolve to one specific backend IP while keeping correct SNI/Host, letting you test each backend directly and compare with the VIP — isolating whether the fault is the balancer/config or a particular backend.
7. A virtual IP is the single stable address clients hit, fronting many backends. Benefits: load distribution across backends and high availability (a failed backend is removed from rotation without downtime).
8. The raw TCP service needs L4 (it's not HTTP, so there's no content to route on); URL-path routing needs L7 (it must read the HTTP request path).

</details>

## Next

[07 — Network troubleshooting toolkit](../07-network-troubleshooting-toolkit/README.md): you now understand every layer's failure mode — time to combine them into one repeatable diagnostic method and the tools that support it.
