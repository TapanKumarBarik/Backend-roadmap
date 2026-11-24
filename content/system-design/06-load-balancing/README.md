# Track: Load Balancing

What a load balancer does, L4 vs L7, algorithms, health checks, sticky sessions, TLS termination, DNS LB, global LB and autoscaling signals.

Part of **Phase 3** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLWDD-HPgiAnA). Every lecture already has a video; all **14** written 16-point lectures in this track are live.

**Status: 🟢 Live (14/14)**

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Load Balancer Fundamentals: What It Does & How to Make It HA](01-load-balancer-fundamentals/README.md) | Explain the LB front door, HA patterns, drain and TLS termination | Live |
| 02 | [Layer 4 vs Layer 7 Load Balancing: NLB vs ALB, TLS Termination](02-layer-4-vs-layer-7-load-balancing/README.md) | Choose L4 vs L7 and avoid HTTP/2/gRPC connection skew | Live |
| 03 | [Round Robin vs Weighted Round Robin: When Taking Turns Fails](03-round-robin-vs-weighted-round-robin/README.md) | Configure RR/WRR and know when equal counts ≠ equal load | Live |
| 04 | [Least Connections, EWMA & Power of Two Choices Explained](04-least-connections-ewma-power-of-two-choices-explained/README.md) | Apply least-conn, EWMA latency scoring and P2C against herding | Live |
| 05 | [Consistent Hashing Explained: Hash Ring, Virtual Nodes, Rendezvous](05-consistent-hashing-explained/README.md) | Resize caches/shards with ~1/N key movement via a hash ring | Live |
| 06 | [Sticky Sessions & IP Hash: Why Session Affinity Bites](06-sticky-sessions-ip-hash/README.md) | Prefer external session state; use affinity only as a speed hint | Live |
| 07 | [Health Checks: Liveness vs Readiness & Why Deep Checks Are Dangerous](07-health-checks/README.md) | Separate live/ready probes and avoid deep-check cascades | Live |
| 08 | [Service Discovery: Client-Side vs Server-Side, DNS & Kubernetes](08-service-discovery/README.md) | Choose client/server/DNS/mesh discovery and avoid stale endpoints | Live |
| 09 | [Reverse Proxy Config in Production: Timeouts, Retries, Buffering](09-reverse-proxy-config-in-production/README.md) | Tune timeouts, bounded retries, buffering and upstream limits | Live |
| 10 | [Load Shedding & Traffic Shaping: Survive Overload (Black Friday)](10-load-shedding-traffic-shaping/README.md) | Shed early, prioritize critical tiers, and protect goodput | Live |
| 11 | [Global Server Load Balancing: GSLB, Anycast & Regional Failover](11-global-server-load-balancing/README.md) | Steer by geo/latency/health with N−1 capacity and residency | Live |
| 12 | [Failover Strategies: Active-Active vs Active-Passive, Hot/Warm/Cold](12-failover-strategies/README.md) | Set RTO/RPO, prevent split brain, and rehearse failovers | Live |
| 13 | [Blue-Green Deployments & Canary Releases with Weighted Traffic](13-blue-green-deployments-canary-releases-with-weighted-traffic/README.md) | Ship with weighted canaries and expand/contract schema safety | Live |
| 14 | [Autoscaling Explained: Which Metric? (CPU vs RPS vs Queue Depth)](14-autoscaling-explained/README.md) | Scale on the bottleneck signal without melting the database | Live |

Start here → [Load Balancer Fundamentals: What It Does & How to Make It HA](01-load-balancer-fundamentals/README.md)

Back to the course index: [../README.md](../README.md)
