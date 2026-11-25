# Track: Reliability and SRE

Availability math, SLIs/SLOs/SLAs, error budgets, retries, circuit breakers, bulkheads, chaos and static stability.

Part of **Phase 5** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLNdzHik9GD0I). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Practise live outage triage in the [Production Incident Troubleshooting & RCA Simulator](/tools/incident-debugger/).

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Availability Math: Series vs Parallel, Nines & Redundancy](01-availability-math/README.md) | Compute composite series/parallel availability and translate "nines" into downtime budgets | **Live** |
| 02 | [SLI vs SLO vs SLA Explained (and How to Pick Good SLIs)](02-sli-vs-slo-vs-sla-explained/README.md) | Define user-centric SLIs, realistic internal SLOs, and contractual SLAs | **Live** |
| 03 | [Error Budgets & Burn-Rate Alerts: Ship Fast Without Breaking SLOs](03-error-budgets-burn-rate-alerts/README.md) | Calculate error budgets and configure multi-window, multi-burn-rate Prometheus alerts | **Live** |
| 04 | [Timeouts: Why One Missing Timeout Takes Down Your Whole Service](04-timeouts/README.md) | Bound connect, read, and end-to-end deadline propagation to stop thread-pool exhaustion | **Live** |
| 05 | [Retry Storms: Backoff, Jitter, Retry Budgets & the 27x Problem](05-retry-storms/README.md) | Prevent cascading retry amplification using full jitter and token-bucket retry budgets | **Live** |
| 06 | [Circuit Breaker Pattern: Closed, Open, Half-Open (vs Retries)](06-circuit-breaker-pattern/README.md) | Design Closed/Open/Half-Open state machines to fail fast and protect struggling downstreams | **Live** |
| 07 | [Bulkhead Pattern: Isolate Pools So One Failure Can't Sink Everything](07-bulkhead-pattern/README.md) | Partition thread pools, connection pools, and semaphores per dependency | **Live** |
| 08 | [Graceful Degradation & Fallbacks: What If the Cache Cluster Dies?](08-graceful-degradation-fallbacks/README.md) | Implement load shedding, stale-while-error, and feature-flag degradation under overload | **Live** |
| 09 | [Health Checks & Self-Healing: Liveness vs Readiness vs Startup Probes](09-health-checks-self-healing/README.md) | Configure Kubernetes startup, readiness, and liveness probes without causing restart loops | **Live** |
| 10 | [Redundancy for Availability: Failure Domains, N+2 & Multi-AZ](10-redundancy-for-availability/README.md) | Size N+1/N+2 capacity across independent fault domains and availability zones | **Live** |
| 11 | [Failover Mechanisms: How Long It Takes & What You Lose](11-failover-mechanisms/README.md) | Compare active-passive vs active-active failover, DNS TTL traps, and split-brain fencing | **Live** |
| 12 | [Disaster Recovery: Pilot Light vs Warm Standby vs Active-Active](12-disaster-recovery/README.md) | Pick the right DR tier balancing infrastructure cost against recovery speed | **Live** |
| 13 | [RTO vs RPO Explained: How Long Down vs How Much Data Lost](13-rto-vs-rpo-explained/README.md) | Map Recovery Time Objective and Recovery Point Objective to replication and backup topologies | **Live** |
| 14 | [Backups & Restore Testing: Why a Backup Isn't a Backup Until Restored](14-backups-restore-testing/README.md) | Enforce the 3-2-1-1-0 rule, immutable snapshots, and automated restore drills | **Live** |
| 15 | [Multi-Region Architecture: Active-Active, Home Regions & Write Conflicts](15-multi-region-architecture/README.md) | Architect active-active multi-region writes, home-region routing, and conflict resolution | **Live** |
| 16 | [Cell-Based Architecture: Limiting the Blast Radius (+ Shuffle Sharding)](16-cell-based-architecture/README.md) | Partition systems into isolated cells and apply shuffle sharding to contain noisy neighbors | **Live** |
| 17 | [Chaos Engineering: Breaking Production on Purpose (Safely)](17-chaos-engineering/README.md) | Formulate steady-state hypotheses and run blast-radius-bounded fault injection experiments | **Live** |
| 18 | [Static Stability: Surviving Dependency & Control Plane Failures](18-static-stability/README.md) | Design data planes that keep serving from pre-provisioned state when control planes fail | **Live** |

Start here → [Availability Math: Series vs Parallel, Nines & Redundancy](01-availability-math/README.md)

Back to the course index: [../README.md](../README.md)
