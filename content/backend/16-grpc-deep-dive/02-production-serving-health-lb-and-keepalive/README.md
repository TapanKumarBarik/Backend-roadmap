# Module 02: Production Serving — Health, Load Balancing and Keepalive

## Why this matters

This is the module where gRPC's central design decision — long-lived,
multiplexed HTTP/2 connections — stops being an advantage and becomes the
thing that breaks your deployment. A REST service behind a load balancer
distributes fine, because every request opens (or reuses from a shared pool)
a short connection and the balancer gets a decision point per request. gRPC
opens **one** connection and sends thousands of requests down it. A
connection-level load balancer therefore makes exactly one decision, and
then every subsequent RPC goes to the same backend, forever.

The symptom is unmistakable once you know it: you scale to ten replicas, and
one of them is at 100% CPU while nine sit idle. This module covers that
problem and the rest of the operational surface — health checking, graceful
shutdown, keepalives, and message limits — that separates a service that
runs from a service that stays up.

## Concepts

### Why L4 load balancing silently fails for gRPC

```
HTTP/1.1 + L4 LB                     gRPC (HTTP/2) + L4 LB
─────────────────                    ──────────────────────
req 1 ──▶ conn A ──▶ backend 1       conn A ──▶ backend 1
req 2 ──▶ conn B ──▶ backend 2         ├─ req 1 ──▶ backend 1
req 3 ──▶ conn C ──▶ backend 3         ├─ req 2 ──▶ backend 1
                                       ├─ req 3 ──▶ backend 1
balanced ✓                             └─ …all of them ──▶ backend 1
                                     
                                     backends 2 and 3: idle ✗
```

An L4 (TCP/transport) balancer — Azure Load Balancer, AWS NLB, a
`Service` of type `LoadBalancer` in Kubernetes, `kube-proxy` for a
ClusterIP — balances *connections*. gRPC multiplexes many concurrent RPCs
as HTTP/2 streams inside one connection, so after the initial placement
there are no further connections to balance.

There are three real fixes:

1. **L7 load balancing.** Put something that speaks HTTP/2 and balances
   per-*stream* in the path: Envoy, Linkerd, Istio, NGINX with
   `grpc_pass`, Azure Application Gateway, or a Kubernetes Gateway API
   implementation. This is the standard answer, and a service mesh
   (`learn/13-service-mesh`) gives it to you transparently.
2. **Client-side load balancing.** The client resolves *all* backend
   addresses and balances across them itself, opening one subchannel per
   backend. gRPC has this built in — no proxy required.
3. **`MAX_CONNECTION_AGE`.** Force connections to be recycled periodically
   so the L4 balancer gets fresh placement decisions. A mitigation, not a
   fix — it converts permanent imbalance into periodic rebalancing.

### Client-side load balancing in Python

```python
# round_robin across every address the resolver returns.
# Without this, gRPC's default is pick_first: it connects to the first
# working address and sends everything there — the same imbalance again.
channel = grpc.insecure_channel(
    "dns:///orders.default.svc.cluster.local:50051",
    options=[("grpc.service_config",
              '{"loadBalancingConfig": [{"round_robin": {}}]}')],
)
```

Two things are load-bearing here. The `dns:///` scheme (three slashes) tells
gRPC to use the DNS resolver and keep re-resolving, so new backends are
picked up; a plain `host:port` uses the default resolver and one address.
And in Kubernetes this requires a **headless** Service
(`clusterIP: None`), because a normal ClusterIP resolves to a single
virtual IP — there is nothing for the client to balance across.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders
spec:
  clusterIP: None          # headless: DNS returns every pod IP
  selector:
    app: orders
  ports:
    - port: 50051
      targetPort: 50051
```

The tradeoff of client-side balancing: every client now needs to know about
every backend, which doesn't scale to very large fleets and puts balancing
policy in your application. L7 proxies exist because that tradeoff is often
worse than an extra hop.

### The standard health checking protocol

gRPC defines a standard health service — `grpc.health.v1.Health` — so that
load balancers, Kubernetes probes and service meshes have a uniform way to
ask "are you ready?". Don't invent your own.

```python
from grpc_health.v1 import health, health_pb2, health_pb2_grpc

health_servicer = health.HealthServicer()
health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)

# empty string "" is the conventional key for overall server health
health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)
# per-service status is also supported:
health_servicer.set("shop.v1.OrderService", health_pb2.HealthCheckResponse.SERVING)
```

Health should reflect *readiness to serve*, not merely "the process is
alive". If your service can't reach its database, it should report
`NOT_SERVING` so the balancer stops sending it traffic — that's the whole
point of the signal.

Kubernetes can probe this natively (1.24+), with no extra binary:

```yaml
readinessProbe:
  grpc:
    port: 50051
    service: ""          # matches the key you set above
  initialDelaySeconds: 5
livenessProbe:
  grpc:
    port: 50051
  periodSeconds: 10
```

Remember module 01's warning: the health service must be **exempt from your
auth interceptor**, or probes get `UNAUTHENTICATED` and the platform
concludes your healthy service is broken.

### Server reflection

Reflection lets tools discover your services and message shapes at runtime,
which is what makes `grpcurl` usable without passing `.proto` files around:

```python
from grpc_reflection.v1alpha import reflection

SERVICE_NAMES = (
    shop_pb2.DESCRIPTOR.services_by_name["OrderService"].full_name,
    health_pb2.DESCRIPTOR.services_by_name["Health"].full_name,
    reflection.SERVICE_NAME,
)
reflection.enable_server_reflection(SERVICE_NAMES, server)
```

Enable it in development and internal environments. On a public-facing
endpoint it's an information disclosure — it publishes your entire API
surface — so gate it behind an environment flag.

### Graceful shutdown

A server killed abruptly drops in-flight RPCs, which clients see as
`UNAVAILABLE` — indistinguishable from a real failure, and a common cause
of error spikes during every deploy. The correct sequence is: stop
advertising readiness, stop accepting new RPCs, let in-flight ones finish,
then exit.

```python
import signal

def shutdown(signum, frame):
    # 1. fail readiness first, so the LB removes us before we stop serving
    health_servicer.set("", health_pb2.HealthCheckResponse.NOT_SERVING)
    time.sleep(5)                       # let the LB notice (>= one probe interval)
    # 2. refuse new RPCs, give in-flight ones a grace period
    server.stop(grace=30).wait()

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)
```

The `sleep` between failing readiness and stopping is the part everyone
omits. Without it you stop serving before the balancer has observed the
readiness change, so it keeps routing to a socket that's already closing.

### Keepalive: the setting that causes the most confusing outages

Idle HTTP/2 connections get silently dropped by NAT gateways, cloud load
balancers and firewalls — typically after 4-5 minutes. The client doesn't
notice, because nothing tells it; it discovers the connection is dead only
when its next RPC fails with `UNAVAILABLE`. Keepalive pings prevent this by
keeping the connection provably alive.

```python
# client
channel = grpc.insecure_channel(target, options=[
    ("grpc.keepalive_time_ms", 30000),            # ping every 30s
    ("grpc.keepalive_timeout_ms", 10000),         # ping must be answered in 10s
    ("grpc.keepalive_permit_without_calls", 1),   # ping even when idle
    ("grpc.http2.max_pings_without_data", 0),     # 0 = unlimited
])
```

```python
# server — MUST be at least as permissive as clients, or it will punish them
server = grpc.server(executor, options=[
    ("grpc.keepalive_time_ms", 30000),
    ("grpc.keepalive_timeout_ms", 10000),
    ("grpc.keepalive_permit_without_calls", 1),
    ("grpc.http2.min_ping_interval_without_data_ms", 10000),  # tolerate pings this often
    ("grpc.http2.max_ping_strikes", 0),                       # 0 = don't GOAWAY on "too many" pings
])
```

The trap: servers default to treating frequent pings as abuse and responding
with `GOAWAY` and `ENHANCE_YOUR_CALM`. If you tune the client to ping every
30s but leave the server's `min_ping_interval_without_data_ms` at its
default (5 minutes), the server will kill the connections of a
correctly-configured client. Client and server keepalive settings must be
designed together.

### Message size and concurrency limits

```python
server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=16),
    options=[
        ("grpc.max_receive_message_length", 16 * 1024 * 1024),   # default is 4 MB
        ("grpc.max_send_message_length", 16 * 1024 * 1024),
        ("grpc.max_concurrent_streams", 1000),
        ("grpc.max_connection_age_ms", 300000),      # recycle for L4 rebalancing
        ("grpc.max_connection_age_grace_ms", 30000),
    ],
)
```

The 4 MB default receive limit is the single most common "it worked in
testing" failure — the payload that exceeds it fails with
`RESOURCE_EXHAUSTED`, and the limit is enforced independently on each side,
so raising it on the server alone doesn't help a client receiving a large
response. If you're hitting it, prefer server streaming (track 11, module
02) over raising the ceiling: chunking is the actual fix, a bigger limit
just moves the wall.

Note also that Python's `grpc.server` uses a **thread pool** — `max_workers`
caps how many RPCs execute concurrently. If handlers do blocking I/O and the
pool is small, requests queue invisibly and latency climbs while CPU sits
idle.

## Command reference

| Concern | Setting / command |
|---|---|
| Client-side round robin | `options=[("grpc.service_config", '{"loadBalancingConfig":[{"round_robin":{}}]}')]` |
| Re-resolving DNS target | `dns:///host:port` (three slashes) |
| Kubernetes headless service | `spec.clusterIP: None` |
| Health service | `grpc_health.v1.health.HealthServicer()`, key `""` for overall |
| K8s gRPC probe | `readinessProbe.grpc.port` (1.24+) |
| Reflection | `reflection.enable_server_reflection(SERVICE_NAMES, server)` |
| Graceful stop | `server.stop(grace=30).wait()` after failing readiness |
| Client keepalive | `grpc.keepalive_time_ms`, `grpc.keepalive_permit_without_calls` |
| Server ping tolerance | `grpc.http2.min_ping_interval_without_data_ms`, `grpc.http2.max_ping_strikes` |
| Raise message limit | `grpc.max_receive_message_length` (both sides) |
| Force connection recycling | `grpc.max_connection_age_ms` |
| List services | `grpcurl -plaintext localhost:50051 list` |
| Check health | `grpcurl -plaintext localhost:50051 grpc.health.v1.Health/Check` |

## Hands-on exercises

```bash
pip install grpcio grpcio-tools grpcio-health-checking grpcio-reflection
```

### 1. Reproduce the L4 imbalance

Run three server instances on ports 50051-50053, each printing its own port
on every request. Put a plain TCP proxy in front of them (or simply have the
client dial one address that resolves to all three). Send 300 RPCs over a
single channel.

Expected: **all 300 land on one backend.** This is the failure the whole
module is about — reproduce it before fixing it, so you recognize the shape.

### 2. Fix it with client-side round robin

Point the client at a target that resolves to all three addresses and add
the `round_robin` service config. Send 300 RPCs again.

Expected: roughly 100 per backend. Then remove *only* the `service_config`
option and re-run to confirm the default `pick_first` policy reproduces the
imbalance — proving it's the policy, not the resolver, doing the work.

### 3. Add health checking and flip it

Register the health servicer, set `""` to `SERVING`, and verify:

```bash
grpcurl -plaintext localhost:50051 grpc.health.v1.Health/Check
```

Expected: `{"status": "SERVING"}`. Now add an admin RPC (or a signal
handler) that sets `NOT_SERVING`, flip it, and re-run the check. Confirm the
status changes while the process is still running and still answering other
RPCs — readiness and liveness are genuinely different signals.

### 4. Enable reflection and browse your own API

```bash
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext localhost:50051 describe shop.v1.OrderService
grpcurl -plaintext -d '{"id":"A-1"}' localhost:50051 shop.v1.OrderService/GetOrder
```

Expected: all three work with no `.proto` file passed. Then disable
reflection and confirm `list` fails — that's the information you're choosing
whether to expose.

### 5. Prove abrupt shutdown drops calls

Start a long-running RPC (a handler that sleeps 10s), then `kill -9` the
server mid-call. Observe the client error. Repeat with the graceful
`server.stop(grace=30).wait()` handler and `kill -TERM`.

Expected: `kill -9` gives the client `UNAVAILABLE`; the graceful path lets
the in-flight call complete normally. This difference is your deploy-time
error spike.

### 6. Trigger `ENHANCE_YOUR_CALM` on purpose

Configure the client to ping aggressively
(`keepalive_time_ms: 1000`, `permit_without_calls: 1`) against a server
left at defaults. Hold the channel open and idle.

Expected: the server sends `GOAWAY` with `ENHANCE_YOUR_CALM` and the client
sees `UNAVAILABLE` — *caused by your own keepalive configuration*, not by any
network problem. Then set the server's
`min_ping_interval_without_data_ms` to `1000` and `max_ping_strikes` to `0`
and confirm the connection survives.

### 7. Hit the 4 MB message limit

Return a response containing a 5 MB `bytes` field.

Expected: `RESOURCE_EXHAUSTED` naming the size and the limit. Fix it twice:
once by raising `grpc.max_receive_message_length` on the **client**, and once
by converting the RPC to server streaming and chunking at 256 KB. Note which
fix you'd actually ship.

### 8. Diagnose and fix: the deploy that always spikes errors

A team runs 6 replicas behind a Kubernetes Service. Every rolling deploy
produces a burst of `UNAVAILABLE` errors in clients for about 30 seconds,
even though the new pods are healthy and the old pods are given a 30-second
`terminationGracePeriodSeconds`. Their shutdown handler is
`server.stop(0)` on `SIGTERM`, and their readiness probe is a TCP socket
check on port 50051.

<details>
<summary>Solution</summary>

Two compounding causes.

**`server.stop(0)` gives no grace period at all**, so every in-flight RPC is
severed the instant `SIGTERM` arrives, regardless of the 30-second
termination grace Kubernetes is offering. The generous
`terminationGracePeriodSeconds` is doing nothing because the process
volunteers to die immediately. Fix: `server.stop(grace=30).wait()`.

**The readiness probe is a TCP check**, which succeeds as long as the socket
is open — including during shutdown. So endpoints removal never happens
early enough, and the balancer keeps routing to a pod that has already begun
terminating. Fix: use the gRPC health probe and set `NOT_SERVING` *first*,
then sleep past one probe interval before calling `stop()`, so the pod is
removed from endpoints while it is still able to serve.

The ordering is the real lesson: fail readiness → wait for propagation →
stop accepting → drain in-flight → exit. Skipping the wait is why this looks
like a load balancer bug rather than an application bug.

</details>

## Independent challenge

No solution given. You operate a gRPC service with 20 replicas and ~500
client processes, each holding a long-lived channel. Traffic is uneven:
two replicas run hot while others idle, and the imbalance persists for hours.
You cannot deploy a service mesh (org constraint), and clients are owned by
five different teams you'd need to coordinate with to change.

Design a remediation you can ship **without** client changes, then a second,
better design assuming you *can* eventually change clients. For each, state
what it costs: extra latency, extra infrastructure, connection churn, or
coordination. Then decide what you'd measure to prove the imbalance is
actually fixed rather than merely moved.

<details>
<summary>Stuck? One hint</summary>

The no-client-changes lever is server-side connection recycling —
`max_connection_age_ms` with a grace period — which forces periodic
reconnection so the L4 balancer re-places connections. It costs connection
churn and a small periodic latency blip, and it only *bounds* imbalance
rather than eliminating it. The with-client-changes answer is either
client-side `round_robin` over a headless service, or introducing an L7
proxy hop; the honest comparison is between putting balancing policy in 500
client processes versus adding a hop you have to operate. For measurement,
per-replica RPC rate over time is the direct signal — an even *average* with
a high per-replica variance means you moved the problem rather than solving
it.

</details>

## Common mistakes & troubleshooting

- **Assuming an L4 load balancer distributes gRPC.** It balances
  connections, and gRPC makes one. This is the default failure, not an edge
  case.
- **Using `pick_first` by accident.** It's gRPC's default policy; without an
  explicit `round_robin` service config, client-side balancing does nothing.
- **A non-headless Kubernetes Service with client-side balancing.** A
  ClusterIP resolves to one virtual IP, so there is nothing to balance
  across.
- **Health that reports process liveness rather than readiness.** If health
  stays `SERVING` while the database is unreachable, the balancer keeps
  feeding traffic to an instance that can only fail.
- **Auth interceptor not exempting `grpc.health.v1.Health`.** Probes fail,
  instances get pulled, and it looks like an infrastructure outage.
- **`server.stop(0)` or `kill -9` on deploy.** Severs in-flight RPCs and
  produces an error spike every release.
- **Failing readiness and stopping in the same instant.** The balancer needs
  at least one probe interval to notice; without the wait, you stop serving
  before you stop receiving.
- **Client keepalive tuned more aggressively than the server tolerates.**
  The server responds `GOAWAY`/`ENHANCE_YOUR_CALM` and you get connection
  drops that look like network faults.
- **Raising the message limit on one side only.** It's enforced
  independently on send and receive, on both peers.
- **A thread pool too small for blocking handlers.** RPCs queue silently;
  latency rises while CPU looks fine.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why does an L4 load balancer distribute HTTP/1.1 traffic evenly but send
   nearly all gRPC traffic to one backend?
2. Name the three approaches to fixing gRPC load balancing, and say which is
   a true fix versus a mitigation.
3. What two things must be true for client-side `round_robin` to actually
   work in Kubernetes?
4. What should a gRPC health check reflect, and why is a TCP socket check an
   inadequate readiness probe?
5. Give the correct ordering for graceful shutdown, and explain why the wait
   between the first two steps is necessary.
6. Your client pings every 30 seconds and connections keep dropping with
   `GOAWAY`. What server setting is most likely responsible?
7. A 5 MB response fails with `RESOURCE_EXHAUSTED`. Where is the limit
   enforced, and what's the better fix than raising it?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because an L4 balancer makes its routing decision per *connection*.
   HTTP/1.1 clients open many short-lived connections, giving it many
   decision points, while gRPC multiplexes all its RPCs as HTTP/2 streams
   inside a single long-lived connection — so exactly one placement decision
   is made and every subsequent RPC follows it.
2. (a) L7 load balancing that understands HTTP/2 and balances per stream
   (Envoy, Linkerd, NGINX `grpc_pass`, a service mesh); (b) client-side load
   balancing where the client resolves all backends and balances itself;
   (c) `max_connection_age_ms` to force periodic reconnection. (a) and (b)
   are true fixes; (c) is a mitigation that bounds imbalance rather than
   removing it.
3. The channel must use a re-resolving DNS target (`dns:///host:port`) with
   an explicit `round_robin` load balancing config — otherwise the default
   `pick_first` policy applies — and the Kubernetes Service must be
   **headless** (`clusterIP: None`) so DNS returns every pod IP instead of a
   single virtual IP.
4. It should reflect *readiness to serve real traffic*, including
   dependencies — reporting `NOT_SERVING` when, say, the database is
   unreachable. A TCP socket check only proves the port is open, which stays
   true while the process is unhealthy or already shutting down, so traffic
   keeps being routed to an instance that cannot serve it.
5. Fail readiness (`NOT_SERVING`) → wait at least one probe interval for the
   load balancer to observe it and remove the instance → stop accepting new
   RPCs with a grace period (`server.stop(grace=N)`) → let in-flight calls
   drain → exit. The wait is necessary because readiness propagation is not
   instantaneous; without it the server stops serving before the balancer
   has stopped sending, which produces exactly the errors the graceful
   shutdown was meant to avoid.
6. `grpc.http2.min_ping_interval_without_data_ms` (with
   `grpc.http2.max_ping_strikes`). The server defaults to treating pings more
   frequent than about five minutes as abusive and responds with `GOAWAY` /
   `ENHANCE_YOUR_CALM`. Client and server keepalive settings have to be
   configured as a pair.
7. Independently on each peer, for both sending and receiving — so raising
   it on the server does not help a client receiving a large response; both
   sides need it. The better fix is usually to convert the RPC to server
   streaming and chunk the payload, since a larger limit only moves the wall
   further out while chunking removes it.

</details>

## Further reading & sources

- [gRPC: Load balancing](https://grpc.io/blog/grpc-load-balancing/) - the canonical explanation of why connection-level balancing fails for gRPC and what the alternatives cost.
- [gRPC health checking protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md) - the specification behind `grpc.health.v1.Health`.
- [Kubernetes: Configure gRPC liveness probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-a-grpc-liveness-probe) - native gRPC probing, 1.24+.
- [gRPC keepalive guide](https://github.com/grpc/grpc/blob/master/doc/keepalive.md) - every keepalive channel argument and the server-side ping policy that rejects them.
- [gRPC service config](https://github.com/grpc/grpc/blob/master/doc/service_config.md) - the JSON schema used for `loadBalancingConfig` and retry policy.

## Next

[03-observability-and-testing](../03-observability-and-testing/README.md) —
a service that stays up still has to be *debuggable*: interceptor-based
logging, metrics and tracing, plus how to test gRPC without mocking the
framework out of existence.
