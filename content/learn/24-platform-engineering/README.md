# Track 24: Platform Engineering

**This is the finale — the capstone track of the entire 24-track curriculum.**
Every other track taught you one layer. This one is about the layer that sits
*on top of all of them*: taking everything you now know how to do by hand and
packaging it into a **self-service internal developer platform (IDP)** that
other engineers can use *without* having to learn all 23 tracks first.

Look back at what you can already do individually. You can run a Linux box
([01](../01-linux/README.md)) and build a container ([02](../02-docker/README.md)).
You can operate Kubernetes ([03](../03-kubernetes/README.md)) and a real AKS
cluster ([07](../07-aks/README.md)), and reason about networking from IP up
([04](../04-networking-fundamentals/README.md),
[05](../05-azure-networking/README.md)). You can provision infrastructure as
code ([09](../09-terraform-on-azure/README.md)), wire CI/CD and GitOps
([10](../10-cicd-and-gitops/README.md)), threat-model and enforce policy
([11](../11-security-deep-dive/README.md),
[18](../18-supply-chain-security/README.md)), instrument observability
([12](../12-observability-deep-dive/README.md)), run a mesh
([13](../13-service-mesh/README.md)), operate data and messaging
([14](../14-databases-and-stateful-workloads/README.md),
[15](../15-messaging-and-event-driven-architecture/README.md)), federate
identity ([16](../16-identity-deep-dive/README.md)), govern at scale
([17](../17-governance-at-scale/README.md)), front APIs
([19](../19-api-management/README.md)), practice SRE
([20](../20-sre-practices/README.md)), manage cost
([21](../21-cost-management-and-finops/README.md)), survive disasters
([22](../22-disaster-recovery-and-chaos-engineering/README.md)), and prove
capacity under load ([23](../23-performance-and-load-testing/README.md)).

That is an enormous amount of knowledge — and it is exactly the problem this
track solves. **No individual application engineer at a company can hold all
of it in their head, and they shouldn't have to.** Platform engineering is the
discipline of building a *paved road* through all of it: an opinionated,
self-service default path where a developer clicks a button (or runs one CLI
command), and a new service comes out the other side already containerized,
deployed via GitOps, scanned for vulnerabilities, instrumented with traces and
metrics, protected by an SLO, fronted by an API gateway, tagged for cost, and
running inside a governed landing zone — every layer you learned across tracks
02-23, wired together by default so the application team never has to assemble
it themselves.

This track does not teach you a 24th brand-new technology. It teaches you the
**meta-skill of synthesis**: how to take 23 tracks' worth of independently
mastered building blocks and compose them into a product that other engineers
consume. Every module here explicitly cites and stitches together specific
earlier tracks by number — that citing *is* the point. And the capstone is the
single most ambitious project in the whole curriculum: build a genuine
golden-path IDP end to end.

## How this track works

- Go in order — each module assumes the ones before it, and this track assumes
  *every* track before it. If a concept from an earlier track is fuzzy, this is
  the track where that gap will finally show, because everything converges here.
- Every module except this index and the capstone follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz →
  Next**. Two modules also carry a closed-book **Cumulative review**.
- Because the subject is synthesis, the concepts sections here are unusually
  cross-referential: expect to see four or five earlier tracks named in a single
  paragraph. Follow the links back when you need to — that reconnection is how
  the platform picture assembles in your head.
- Much of this track is **design work**, not just command-running. Some
  exercises ask you to write templates, draw abstraction boundaries, and make
  product decisions — because that is what platform engineering actually is.
- The capstone (module 08) has no quiz or challenge — it is the open-ended
  final exam for the *entire curriculum*, asking you to integrate as many prior
  tracks as you realistically can into one working golden path.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [platform-engineering-concepts](00-platform-engineering-concepts/README.md) | What a platform team does, the paved road / golden path, platform-as-a-product, developer experience as a metric, how this differs from "just DevOps" | 60-75 min |
| 01 | [designing-a-golden-path](01-designing-a-golden-path/README.md) | What a self-service golden path for a new service actually contains — scaffolding, CI/CD, observability, and security defaults, pulling tracks 09/10/11/12 into one opinionated default | 75-90 min |
| 02 | [internal-developer-portals](02-internal-developer-portals/README.md) | Backstage conceptually — the software catalog, TechDocs, and scaffolder templates as the front door to the platform | 75-90 min |
| 03 | [self-service-infrastructure-provisioning](03-self-service-infrastructure-provisioning/README.md) | Exposing track 09's Terraform modules as self-service catalog items, guardrails via track 17's policy, and approval workflows | 75-90 min |
| 04 | [platform-apis-and-abstractions](04-platform-apis-and-abstractions/README.md) | Designing an internal API/CLI/template layer that hides Kubernetes/Azure complexity — the abstraction-design skill, and the too-little vs. too-much tradeoff | 60-90 min |
| 05 | [platform-observability-and-slos](05-platform-observability-and-slos/README.md) | Applying track 20's SRE discipline to the platform itself — the platform's own SLOs, with internal developers as its customers | 75-90 min |
| 06 | [multi-tenancy-and-platform-security](06-multi-tenancy-and-platform-security/README.md) | Tenant isolation on shared AKS/Container Apps, applying tracks 11/13/16 at the platform level, and cost attribution via track 21 tagging | 90 min |
| 07 | [platform-adoption-and-measuring-success](07-platform-adoption-and-measuring-success/README.md) | Developer-experience metrics, adoption curves, avoiding "build it and they won't come," and the platform team's own roadmap process | 60-75 min |
| 08 | [capstone-project](08-capstone-project/README.md) | The capstone of the whole curriculum: design and build a genuine golden-path IDP integrating as many prior tracks as possible | 8-16 hours |

## Prerequisites

- **Everything.** This track is the synthesis of tracks 01-23. In particular
  you must be comfortable with: Terraform ([09](../09-terraform-on-azure/README.md)),
  CI/CD and GitOps ([10](../10-cicd-and-gitops/README.md)), security and policy
  ([11](../11-security-deep-dive/README.md),
  [18](../18-supply-chain-security/README.md)), observability
  ([12](../12-observability-deep-dive/README.md)), governance and landing zones
  ([17](../17-governance-at-scale/README.md)), SRE
  ([20](../20-sre-practices/README.md)), and cost management
  ([21](../21-cost-management-and-finops/README.md)). The modules link back to
  the specific earlier modules they build on — follow those links whenever a
  foundation feels shaky.
- An active Azure subscription (already confirmed for this curriculum). Some
  modules provision real (billable) infrastructure; each ends with cleanup.

Start here → [00-platform-engineering-concepts/README.md](00-platform-engineering-concepts/README.md)

[Back to main curriculum](../README.md)
