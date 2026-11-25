# Track: Multi-Tenant SaaS

Tenant isolation, shared vs dedicated data, noisy neighbors, routing and deployment stamps.

Part of **Phase 6** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLbu9hGadb_zQ). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Every lesson below is **Live** with full notes, diagrams, and multi-language code.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Tenant Isolation Strategies: Silo vs Pool vs Bridge](01-tenant-isolation-strategies/README.md) | Choose between Silo, Pool, and Bridge isolation across cost, blast radius, and compliance | **Live** |
| 02 | [Shared vs Dedicated Databases: Choosing a Multi-Tenant Data Model](02-shared-vs-dedicated-databases/README.md) | Compare shared-table `tenant_id`, schema-per-tenant, and DB-per-tenant topologies | **Live** |
| 03 | [Tenant-Aware Authorization: Tenant Claims, Context & Row-Level Security](03-tenant-aware-authorization/README.md) | Propagate verified tenant claims and enforce PostgreSQL Row-Level Security (RLS) | **Live** |
| 04 | [Noisy Neighbour Mitigation: Per-Tenant Limits, Quotas & Fair Queues](04-noisy-neighbour-mitigation/README.md) | Stop single-tenant starvation with weighted fair queueing, shuffle sharding, and per-tenant limits | **Live** |
| 05 | [Quotas and Usage Metering: Billing Customers Accurately](05-quotas-and-usage-metering/README.md) | Build idempotent, outbox-backed usage metering pipelines for accurate tiered billing | **Live** |
| 06 | [Data Residency & Sovereignty: Keeping EU Data in the EU](06-data-residency-sovereignty/README.md) | Pin tenant PII, backups, logs, and encryption keys to regional compliance boundaries | **Live** |
| 07 | [Enterprise Identity: SAML/OIDC SSO, SCIM & Group-to-Role Mapping](07-enterprise-identity/README.md) | Integrate enterprise SAML/OIDC SSO, SCIM directory provisioning, and IdP group-to-role mapping | **Live** |
| 08 | [Enterprise Audit Trails: Tamper-Evident, Exportable Logs](08-enterprise-audit-trails/README.md) | Deliver tenant-scoped, hash-chained, SIEM-exportable audit trails | **Live** |
| 09 | [Tenant Configuration: Plans, Overrides & Entitlements](09-tenant-configuration/README.md) | Model plan tiers, custom contract overrides, and low-latency entitlement checks | **Live** |
| 10 | [Deployment Stamps: Scaling SaaS with Cells Across Regions](10-deployment-stamps/README.md) | Scale multi-region SaaS horizontally using independent Deployment Stamps and global routers | **Live** |

Start here → [Tenant Isolation Strategies: Silo vs Pool vs Bridge](01-tenant-isolation-strategies/README.md)

Back to the course index: [../README.md](../README.md)
