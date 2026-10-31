# 15 - Multi-Tenancy & SaaS Architecture

Track 04 (module 10, "Multi-tenancy patterns") already taught you *how* to
physically isolate one tenant's data from another's — shared schema,
schema-per-tenant, database-per-tenant, and row-level security as the
mechanism that makes the cheap option safe. That was one decision inside the
data layer. This track is everything **around** that decision: how a request
even knows which tenant it belongs to, how auth works when "user" now means
"user *within* a tenant," how a brand-new tenant gets provisioned without a
human running SQL by hand, how you charge tenants for what they use, and how
you keep one tenant's load from degrading everyone else's — then a capstone
that builds a small, real, working multi-tenant SaaS app end to end, wiring
every module together instead of leaving it as a diagram.

This track is added to the curriculum as a dedicated deep dive because
"multi-tenant SaaS" is a shape a huge fraction of real backend jobs take,
and it's normally learned in painful pieces on the job rather than taught
as a coherent whole.

## How this track works

- It assumes you've finished **[04-databases-and-data-layer](../04-databases-and-data-layer/README.md)**,
  specifically module 10 (multi-tenancy patterns) — this track does not
  re-teach shared-schema vs. schema-per-tenant vs. database-per-tenant or
  row-level security, it *uses* that decision as a given and builds the
  application-layer concerns around it. It also assumes
  **[03-authentication-and-authorization](../03-authentication-and-authorization/README.md)**
  (sessions/JWTs/RBAC) and **[06-background-processing-and-realtime](../06-background-processing-and-realtime/README.md)**
  (for provisioning as an async job).
- Same shape as every other track: concepts, a command/code reference,
  hands-on exercises against a real running app, an independent challenge,
  common mistakes, and a checkpoint quiz per module.
- **Unlike other tracks, the capstone here is not open-ended/no-solution.**
  You explicitly asked for this to be a guided, step-by-step build of a real
  small SaaS app, not left as an exercise — so module 06 walks the build
  directly, the way modules 12-18 in `lld/` give a full worked solution,
  rather than the "no solution given" capstone convention used elsewhere in
  `backend/`.
- Go in order. Tenant identification (01) must exist before auth (02) can be
  tenant-scoped; auth must exist before provisioning (03) can create a
  tenant's first admin user; provisioning must exist before billing (04) has
  something to meter; all four feed the capstone (06).

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Tenancy models and the decision framework](00-tenancy-models-and-decision-framework/README.md) | Recap the three isolation models from a product-architecture angle (not the data-layer mechanics), and decide single-tenant vs. multi-tenant vs. hybrid for a given product | 45-60 min |
| 01 | [Tenant identification and request routing](01-tenant-identification-and-request-routing/README.md) | Resolve "which tenant is this request for" from subdomain, path, or header, and enforce it in middleware before any handler runs | 75-100 min |
| 02 | [Auth and authorization across tenants](02-auth-and-authorization-across-tenants/README.md) | Design tenant-scoped users, tenant admins, and cross-tenant access prevention, and put the tenant ID inside the token itself | 90-120 min |
| 03 | [Provisioning and onboarding automation](03-provisioning-and-onboarding-automation/README.md) | Automate new-tenant signup: schema/row creation, migrations, seed data, and the first-admin bootstrap, as a repeatable job instead of a manual runbook | 75-100 min |
| 04 | [Billing, plans, and usage metering](04-billing-plans-and-usage-metering/README.md) | Design plan tiers and quotas, meter usage per tenant, and wire a metered event into a billing provider conceptually (Stripe-shaped) | 75-100 min |
| 05 | [Scaling and the noisy-neighbor problem at the app layer](05-scaling-and-noisy-neighbor-at-the-app-layer/README.md) | Apply per-tenant rate limiting, tiered infrastructure, and feature flags by plan — the application-layer half of noisy-neighbor mitigation (module 04-10 covered the database half) | 60-90 min |
| 06 | [Capstone: build a small SaaS](06-capstone-build-a-small-saas/README.md) | Guided, step-by-step build of a minimal multi-tenant project-tracker SaaS: tenant signup -> isolated data -> tenant-scoped auth -> basic usage metering, wiring modules 00-05 into one working app | 4-6 hrs |

Start here -> [00-tenancy-models-and-decision-framework/README.md](00-tenancy-models-and-decision-framework/README.md)

Back to the master index: [../README.md](../README.md)

---

This track cross-references
**[04-databases-and-data-layer, module 10](../04-databases-and-data-layer/10-multi-tenancy-patterns/README.md)**
constantly for the isolation mechanics (RLS, schema-per-tenant migrations,
noisy-neighbor at the database layer) — read that module first if you
haven't, this track builds directly on top of it rather than repeating it.
