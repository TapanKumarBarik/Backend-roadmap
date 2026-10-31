# Track 23: Performance and Load Testing

Back in [03-kubernetes module 09](../03-kubernetes/09-scaling-hpa-and-vpa/README.md)
you configured a Horizontal Pod Autoscaler, watched a CPU-burning demo pod
trigger it, and moved on. In [06-azure-container-apps module 03](../06-azure-container-apps/03-scaling-with-keda/README.md)
you wired KEDA scale rules and pushed a few thousand `curl`s at them. Both
times you proved the mechanism *can* scale — but not that *your real app*
scales the way production traffic would actually drive it, and not that the
thresholds you picked are the right ones. "It scaled when I hammered it with
a loop" is a demo, not a performance strategy.

This track closes that loop. You'll learn to design and run real load tests
with **k6**, run them at scale from **Azure Load Testing**, model traffic
that looks like real users instead of a uniform flood, and use those tests
to *validate* the HPA/KEDA autoscaling you configured earlier — watching
pods scale in real time on [track 12](../12-observability-deep-dive/README.md)'s
Grafana dashboards, and catching the common case where a config that *looks*
right never actually triggers. Then you'll go deeper: reading results to find
where a system really breaks (CPU limits, the database connection pool from
[track 14](../14-databases-and-stateful-workloads/README.md), a downstream
rate limit), profiling to tell an infra problem from a code problem, and
wiring a lightweight load test into a [track 10](../10-cicd-and-gitops/README.md)
pipeline as a regression gate.

## What this assumes

This is one of the last tracks, and it leans on several earlier ones:

- **[03-kubernetes](../03-kubernetes/README.md)** — Deployments, Services,
  HPA, `kubectl top`, metrics-server (module 09 especially).
- **[06-azure-container-apps](../06-azure-container-apps/README.md)** — KEDA
  scale rules, min/max replicas, scale-to-zero (module 03 especially).
- **[07-aks](../07-aks/README.md)** — running a real, billable managed
  cluster with Ingress, and the Cluster Autoscaler from module 05.
- **[12-observability-deep-dive](../12-observability-deep-dive/README.md)** —
  Prometheus, PromQL, and Grafana dashboards; you'll watch scaling happen
  through them here, not just via `kubectl get hpa -w`.

It also forward-references the SLOs you define in
[20-sre-practices](../20-sre-practices/README.md) (a load test's pass/fail
thresholds should be derived from your SLOs, not invented), the connection
pooling from [track 14](../14-databases-and-stateful-workloads/README.md),
and the CI pipelines from [track 10](../10-cicd-and-gitops/README.md).

> **Cost warning:** exercises here run load against real AKS clusters and
> Container Apps, and provision an Azure Load Testing resource. Load testing
> *deliberately* drives autoscaling, which means real replicas (and possibly
> real nodes via the Cluster Autoscaler) spin up and bill while the test
> runs. Nothing here is expensive if you clean up promptly, but a load test
> left running, or a cluster left scaled-up overnight, is a real way to get a
> real bill. Every module ends with an explicit cleanup step — don't skip it.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [performance-testing-concepts](00-performance-testing-concepts/README.md) | Load vs. stress vs. soak vs. spike testing; what question each answers; why "it feels fast" isn't a strategy; tying tests to SLOs | 45-60 min |
| 01 | [k6-fundamentals](01-k6-fundamentals/README.md) | Writing a k6 script, virtual users, stages/ramping, thresholds, checks; running locally against a real app | 60-90 min |
| 02 | [azure-load-testing](02-azure-load-testing/README.md) | The managed service: provisioning, running a k6 script at scale, engine instances, comparing to self-run k6 | 60-90 min |
| 03 | [designing-a-realistic-load-test](03-designing-a-realistic-load-test/README.md) | Modeling real traffic, think time, data parameterization, avoiding an unrealistically uniform test | 60-90 min |
| 04 | [proving-autoscaling-works](04-proving-autoscaling-works/README.md) | Load-testing the track-03/06 HPA/KEDA setups; watching pods scale via Grafana; catching config that looks right but never fires | 75-90 min |
| 05 | [identifying-bottlenecks](05-identifying-bottlenecks/README.md) | Reading results to find where a system breaks: CPU/memory limits, DB connection pool exhaustion, downstream rate limits | 75-90 min |
| 06 | [profiling-and-application-performance](06-profiling-and-application-performance/README.md) | A survey of profiling; hot code paths, N+1 queries; infra scaling vs. code-level fixes | 60-90 min |
| 07 | [performance-testing-in-cicd](07-performance-testing-in-cicd/README.md) | A lightweight load test as a pipeline gate; catching a regression before ship; thresholds that don't cause flakiness | 60-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: realistic k6 test on AKS/ACA, proof of HPA/KEDA scaling via Grafana, one real bottleneck + fix, a CI performance gate | 4-6 hours |

## How this track works

- Go in order — module 04 assumes you can write a k6 script (module 01) and
  design a realistic one (module 03); module 07 assumes you can find a
  bottleneck (module 05).
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint
  quiz → Next**. Two modules also carry a **Cumulative review**.
- Exercises run **real k6 tests against a real app** on Kubernetes or
  Container Apps — not a simulator. Each ends with a cleanup step.
- Module 08 is the capstone: no quiz, no new concepts — it asks you to
  combine everything into one real, load-tested, scaling-proven,
  bottleneck-diagnosed, CI-gated system.

## Prerequisites

- Everything from the four dependency tracks above, plus an active Azure
  subscription (already confirmed for this curriculum).
- k6 installed in your WSL2 environment (module 01 covers this).

[Back to main curriculum](../README.md)

Start here → [00-performance-testing-concepts/README.md](00-performance-testing-concepts/README.md)
