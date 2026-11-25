# Track: Cloud and Platform

IaaS/PaaS/FaaS, regions and AZs, IAM, networking, cost, scheduling and green software.

Part of **Phase 6** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLbu9hGadb_zQ). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Every lesson below is **Live** with full notes, diagrams, and multi-language code.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Cloud Service Models: IaaS vs PaaS vs FaaS vs SaaS](01-cloud-service-models/README.md) | Compare IaaS, PaaS, FaaS, and SaaS across operational ownership, cold starts, and TCO | **Live** |
| 02 | [Regions, Availability Zones & Edge: What Multi-AZ Really Protects](02-regions-availability-zones-edge/README.md) | Separate AZ fault isolation from regional outages and cross-AZ replication latency/cost | **Live** |
| 03 | [Cloud Networking: VNets, Subnets, Security Groups & Private Endpoints](03-cloud-networking/README.md) | Architect public/private subnets, NAT gateways, Security Groups, and PrivateLink endpoints | **Live** |
| 04 | [Well-Architected Frameworks: The Six Pillars and a Pre-Launch Review](04-well-architected-frameworks/README.md) | Run pre-launch Well-Architected reviews across reliability, security, cost, and ops | **Live** |
| 05 | [Containers & Docker: Images, Layers, Multi-Stage Builds vs VMs](05-containers-docker/README.md) | Shrink container images with multi-stage builds, layer caching, and cgroup/namespace isolation | **Live** |
| 06 | [Kubernetes Core Objects: Pod, Deployment, Service, Ingress](06-kubernetes-core-objects/README.md) | Wire Pods, ReplicaSets, Deployments, Services, and Ingress controllers cleanly | **Live** |
| 07 | [Kubernetes Scheduling: Requests, Limits, OOMKilled, QoS & PDBs](07-kubernetes-scheduling/README.md) | Prevent CPU throttling and `OOMKilled` cascades with QoS classes, topology spread, and PDBs | **Live** |
| 08 | [Kubernetes Autoscaling: HPA, VPA, Cluster Autoscaler & KEDA](08-kubernetes-autoscaling/README.md) | Combine HPA, VPA, Karpenter/Cluster Autoscaler, and KEDA queue-depth scaling | **Live** |
| 09 | [Databases on Kubernetes? StatefulSets, Volumes & Operators](09-databases-on-kubernetes-statefulsets-volumes-operators/README.md) | Evaluate StatefulSets, PVCs, and Kubernetes Operators vs managed databases | **Live** |
| 10 | [Kubernetes Networking: CNI, Services, Ingress & NetworkPolicies](10-kubernetes-networking/README.md) | Trace pod-to-pod CNI routing, kube-proxy iptables/eBPF, and zero-trust NetworkPolicies | **Live** |
| 11 | [Infrastructure as Code: Terraform State, Plan/Apply, Modules & Drift](11-infrastructure-as-code/README.md) | Manage remote Terraform state locking, modular composition, and drift remediation | **Live** |
| 12 | [GitOps: Pull-Based Deploys with Argo CD and Flux](12-gitops/README.md) | Replace push CI scripts with pull-based reconciliation loops in Argo CD and Flux | **Live** |
| 13 | [Immutable Infrastructure: Golden Images, Replace Don't Patch, No Drift](13-immutable-infrastructure/README.md) | Eliminate snowflake servers using Packer golden images and replace-on-deploy rollouts | **Live** |
| 14 | [Cloud Cost Optimization: Right-Sizing, Reservations, Spot, Storage Tiers](14-cloud-cost-optimization/README.md) | Cut cloud spend with right-sizing, Savings Plans, Spot diversification, and S3 tiering | **Live** |
| 15 | [Cost-Aware Architecture: Egress, GPU Costs & TCO in System Design](15-cost-aware-architecture/README.md) | Model internet egress, cross-AZ transfer fees, and GPU inference unit economics | **Live** |
| 16 | [Data Consistency Across Systems: Dual Writes, CDC & Reconciliation](16-data-consistency-across-systems/README.md) | Fix cross-store drift using Outbox/CDC, version guards, and automated reconciliation | **Live** |
| 17 | [Privacy Engineering: PII Classification, Masking, Minimisation & Consent](17-privacy-engineering/README.md) | Isolate PII in tokenized vaults and enforce consent, masking, and crypto-shredding | **Live** |
| 18 | [Data Governance & Lineage: Catalogs, Ownership and Impact Analysis](18-data-governance-lineage/README.md) | Track column-level lineage DAGs with OpenLineage to prevent silent schema breaks | **Live** |
| 19 | [Edge Computing: CDN Edge Functions, Personalisation & Their Limits](19-edge-computing/README.md) | Run sub-10ms edge routing and auth while keeping heavy state in origin regions | **Live** |
| 20 | [Platform Engineering: Internal Developer Platforms & Golden Paths](20-platform-engineering/README.md) | Build self-service Internal Developer Platforms (IDPs) and paved Golden Paths | **Live** |
| 21 | [Workflow Orchestration Engines: Durable Execution with Temporal](21-workflow-orchestration-engines/README.md) | Replace fragile cron/queue glue with durable event-sourced workflows in Temporal | **Live** |
| 22 | [Distributed Job Scheduling: Leader Election, Delayed Jobs & Idempotency](22-distributed-job-scheduling/README.md) | Build HA distributed schedulers using lease-based leader election and idempotent runs | **Live** |
| 23 | [Sustainability & Green Software: Carbon-Aware Computing](23-sustainability-green-software/README.md) | Reduce carbon intensity with time/region-shifting batch workloads and right-sized compute | **Live** |

Start here → [Cloud Service Models: IaaS vs PaaS vs FaaS vs SaaS](01-cloud-service-models/README.md)

Back to the course index: [../README.md](../README.md)
