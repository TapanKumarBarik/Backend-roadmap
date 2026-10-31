# Module 00: Tenancy Models and the Decision Framework

## Why this matters

**[04-databases-and-data-layer, module 10](../../04-databases-and-data-layer/10-multi-tenancy-patterns/README.md)**
already gave you the three data-layer isolation models (shared schema,
schema-per-tenant, database-per-tenant) and the mechanism — row-level
security — that makes the cheap one safe. That was a *database* decision.
Before you get there, a product has to answer a broader question first:
**is this product multi-tenant at all, and if so, what does "a tenant"
even mean for this specific product?** Get that wrong and every module
after this one in the track — routing, auth, provisioning, billing — is
built on the wrong foundation. This module is the product-architecture
layer sitting above the data-layer decision: single-tenant vs.
multi-tenant vs. hybrid, what a tenant boundary actually protects, and a
repeatable framework for deciding.

## Concepts

### What "tenant" means

A **tenant** is an isolated customer boundary — normally a company, team,
or organization — whose users, data, and configuration must never leak
into another tenant's. A tenant is *not* the same as a "user": one tenant
(e.g. Acme Corp) typically contains many users (Acme's employees), each
scoped to that one tenant. This distinction matters immediately: your
`users` table needs a `tenant_id`, but your `tenants` table does not need
a `user_id` — the relationship is one tenant to many users, almost always.

### Single-tenant, multi-tenant, and hybrid

- **Single-tenant** — one deployment (app instance + database) per
  customer. Total isolation, because there's no shared infrastructure to
  leak across. Most expensive to run and operate — N customers means N
  deployments, N sets of monitoring, N places a bug can hide differently.
  Common for a handful of very large, very high-value, or regulatorily
  demanding customers (an on-prem or single-tenant-cloud enterprise deal).
- **Multi-tenant** — one deployment serves many customers, isolated
  logically (module 04-10's shared schema + RLS) or physically-within-
  shared-infra (schema/database-per-tenant, still one app deployment).
  Cheapest to run per customer, and the default assumption for a SaaS
  product aiming at more than a handful of customers.
- **Hybrid** — most of your customers are multi-tenant (shared
  infrastructure), but a small number of large/regulated customers are
  carved out to their own single-tenant deployment or database. This is
  the *product-level* version of the same escalation module 04-10
  described at the database level ("move the one noisy/large tenant to
  its own schema or database") — here the escalation can go all the way
  to a fully separate deployment, not just a separate schema.

```
Single-tenant             Multi-tenant                Hybrid
┌────────┐ ┌────────┐     ┌──────────────────┐        ┌──────────────────┐ ┌────────┐
│ App A  │ │ App B  │     │  One App          │        │  One App          │ │ App Z  │
│ DB A   │ │ DB B   │     │  Tenant 1,2,3...N │        │  Small tenants    │ │ DB Z   │
└────────┘ └────────┘     └──────────────────┘        │  1,2,3...N-1      │ └────────┘
                                                        └──────────────────┘  (one big
strongest isolation,       cheapest per-customer,       most tenants cheap,   regulated
most ops cost               shared blast radius         one carved out       tenant)
```

### A tenant is a boundary for more than data

Module 04-10 focused on data isolation. A tenant boundary in a real
product also has to hold for:

- **Configuration** — feature flags, branding/white-labeling, integrations
  (each tenant may have its own webhook URLs, SSO settings, API keys to
  third parties) must not leak or apply cross-tenant.
- **Compute/quota** — module 05 in this track covers this: a tenant's
  usage (API calls, background jobs, storage) needs a boundary too, or one
  tenant's spike degrades another's experience (the noisy-neighbor problem,
  now at the application layer, not just the database layer).
- **Identity** — module 02 in this track: a user's session/token must
  encode *which tenant* they're acting within, not just who they are —
  the same email address might even belong to two different tenants (a
  consultant who works with two client companies, each running the same
  SaaS product) and those must be two entirely separate identities.

### The decision framework

Answer these, in order, for a given product:

1. **Does this product have the concept of "a company/team using this
   together," or is every user fully independent?** If every user is
   fully independent (a personal note-taking app), you may not need
   tenancy at all — "tenant" and "user" collapse into the same thing. If
   users belong to organizations that share data with each other but not
   with other organizations, you need tenancy.
2. **How many tenants, and how large/valuable is each?** A handful of
   enterprise deals control this answer directly — heavily favors
   single-tenant or hybrid. Thousands of self-serve signups favors
   multi-tenant; single-tenant per customer doesn't scale operationally to
   that count (this is the same math as module 04-10's database-per-tenant
   cost, one layer up).
3. **What do contracts/regulations require?** Some enterprise customers
   contractually require physically separate infrastructure regardless of
   what's operationally ideal — this can force single-tenant or
   database-per-tenant for that customer specifically, independent of
   what every other customer gets (this is exactly the hybrid model).
4. **What's the cost of a cross-tenant leak?** The more catastrophic (two
   competing enterprises on the same platform, regulated data like health
   or financial records), the more that argues for stronger isolation and
   defense-in-depth (RLS *and* a genuinely separate schema/database for
   the highest-risk tenants), even at higher operational cost.
5. **Do tenants need to customize the product itself** (custom fields,
   custom workflows, white-labeled branding)? Heavy customization needs
   pushes toward designs that isolate config per-tenant cleanly — this
   shapes the routing and provisioning modules ahead, not just data
   layout.

This framework produces the same kind of answer as module 04-10's four
questions, but one level up: that module decided *how to store* an
already-agreed-on multi-tenant model; this one decides *whether, and for
whom*, multi-tenancy is even the right model in the first place.

## Command reference

There's no new code/CLI surface in this module — it's a decision
framework, not a mechanism. The reference here is the decision table
itself:

| Question | Answer favors single-tenant | Answer favors multi-tenant |
|---|---|---|
| How many customers? | A handful | Hundreds to millions |
| Customer value/size? | A few very large accounts | Many small-to-mid accounts |
| Contractual isolation requirement? | Yes, explicit | No, or negotiable |
| Cost of a cross-tenant leak? | Catastrophic | Bad but survivable with strong RLS |
| Per-tenant customization depth? | Deep (near-bespoke) | Shallow (config/branding only) |

A product that lands mixed answers (mostly multi-tenant column, but one
"yes" in the contractual row for a specific customer) is the hybrid case —
name that explicitly rather than forcing a single model onto every
customer.

## Hands-on exercises

These are written/design exercises — no code to run yet (module 01 starts
building). Write your answers down before checking the discussion.

### 1. Classify three real products

For each, decide single-tenant, multi-tenant, or hybrid, and justify with
the five-question framework:

- A project-management SaaS sold self-serve to small teams, $10-50/month,
  tens of thousands of customers.
- A hospital records system sold to individual hospital networks, each
  paying six figures/year, each with strict regulatory (HIPAA-adjacent)
  data-residency requirements.
- A developer-tools SaaS with a free tier (thousands of hobbyist signups)
  and an enterprise tier (dozens of large companies demanding SSO,
  dedicated support, and a signed data-processing agreement).

<details>
<summary>Discussion</summary>

- Project-management SaaS: multi-tenant, shared schema + RLS
  (module 04-10). Customer count is high, individual value is low,
  no regulatory driver, customization is shallow (branding/settings, not
  bespoke schema). Single-tenant per customer would be operationally
  absurd at that count.
- Hospital records system: single-tenant (or at minimum
  database-per-tenant with contractual/regulatory backing), small
  customer count, very high per-customer value, explicit regulatory
  isolation requirement, and catastrophic leak cost. This is the textbook
  case *for* paying the operational cost.
- Dev-tools SaaS: hybrid. The free/self-serve tier is multi-tenant, shared
  schema, cheap to run at high volume. The enterprise tier's demand for
  SSO/dedicated support/DPA is exactly the "carve out the large or
  regulated tenant" escalation from the Concepts section — those accounts
  might get their own schema, database, or in extreme cases a fully
  separate deployment, while the bulk of the product stays multi-tenant.

</details>

### 2. Find the boundary leak points

Take the project-management SaaS from exercise 1 (multi-tenant, shared
schema). List every place *besides the database* where a tenant boundary
could leak if not deliberately enforced. Aim for at least four.

<details>
<summary>Discussion</summary>

At minimum: (1) session/auth tokens that don't encode tenant ID, letting a
user's token work against the wrong tenant's data if the tenant check is
missing in a handler; (2) background jobs/queues that process work without
re-validating which tenant it belongs to; (3) cached data (module 05 in
`backend/`) keyed without a tenant prefix, serving tenant A's cached
response to tenant B; (4) file/object storage (uploaded attachments) using
a shared bucket/path without a tenant-scoped prefix; (5) third-party
integrations (webhooks, SSO config, API keys) stored without a tenant
scope, letting one tenant's webhook fire with another's data. Modules
01-05 in this track address these one at a time.

</details>

## Independent challenge

No solution given. You're the architect for a new B2B expense-reporting
SaaS. Early sales conversations reveal: most prospects are small
companies (10-200 employees) who want self-serve signup and monthly
billing; two prospects are Fortune 500 companies who want a pilot but are
explicitly asking, in writing, whether their data will ever share
physical infrastructure with other customers "for compliance reasons,"
without being able to name the exact regulation yet.

Write a one-page architecture decision: which tenancy model(s) you'd
build for launch, how you'd handle the two enterprise prospects without
building single-tenant infrastructure for a product that doesn't exist
yet, and what you'd tell sales to say to those two prospects about
timeline and guarantees. Use the five-question framework explicitly —
show your answer to each question, not just your conclusion.

<details>
<summary>Stuck? One hint</summary>

A common real answer: build multi-tenant shared-schema + RLS for launch
(it's what the bulk of prospects need and what you can actually ship on a
startup timeline), and tell the two enterprise prospects honestly that
dedicated/isolated infrastructure is on the roadmap contingent on signed
demand — many real SaaS companies sell an enterprise tier with
schema-per-tenant or database-per-tenant *after* proving the core product,
not before. The mistake to avoid is over-building single-tenant
infrastructure speculatively for prospects who haven't signed, at the
cost of shipping the self-serve product the majority of the market
actually wants first.

</details>

## Common mistakes & troubleshooting

- **Treating "user" and "tenant" as the same concept from the start.**
  Even a product that launches single-tenant-per-signup often grows an
  org/team feature later — modeling `tenant_id` on every row from day
  one, even with exactly one tenant in production, costs little now and
  saves a painful migration later.
- **Choosing single-tenant "to be safe" without a real driver.** Mirrors
  module 04-10's equivalent mistake one layer up — matching isolation
  strength to actual customer count/value/regulatory need, not to
  whichever option sounds most conservative.
- **Assuming multi-tenant is all-or-nothing.** The hybrid model is common
  and legitimate — most SaaS companies with a genuine enterprise tier end
  up here, not at a single uniform model for every customer.
- **Solving this only at the database layer.** Exercise 2 is the point:
  tenant boundaries have to hold in auth tokens, caches, queues, file
  storage, and third-party integrations — a correct RLS policy alone does
  not make a product's tenant isolation complete.

## Checkpoint quiz

Write down your answer before expanding it.

<details>
<summary>Show questions</summary>

1. What's the difference between a "tenant" and a "user," and why does
   your `users` table need a `tenant_id` even though your `tenants` table
   doesn't need a `user_id`?
2. Name the three product-level tenancy models and, for each, state
   roughly what customer profile it fits best.
3. Give two of the five decision-framework questions and explain how each
   pushes toward single-tenant vs. multi-tenant.
4. Besides the database, name three other places a tenant boundary must
   be enforced in a real system.
5. What is the "hybrid" model, and why is it often the realistic answer
   for a product with both a self-serve tier and an enterprise tier?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. A tenant is an isolated customer/organization boundary; a user is an
   individual person who belongs to (usually exactly) one tenant. A
   tenant typically has many users, so `users` needs a `tenant_id` foreign
   key, but `tenants` has no equivalent single "owning user" to reference.
2. Single-tenant (one deployment per customer — strongest isolation,
   highest ops cost, fits a handful of large/regulated customers);
   multi-tenant (one deployment serves many customers, logically or
   physically-within-shared-infra isolated — cheapest per customer, fits
   many small-to-mid customers); hybrid (most customers multi-tenant, a
   few large/regulated customers carved out to their own
   deployment/database).
3. Any two of: customer count/value (few big customers favors
   single-tenant; many small customers favors multi-tenant); contractual/
   regulatory isolation requirements (explicit requirement forces
   stronger isolation regardless of cost); cost of a cross-tenant leak
   (more catastrophic favors stronger isolation); depth of per-tenant
   customization (deep/bespoke customization pushes toward isolation
   models that don't force one rigid shared shape).
4. Any three of: auth/session tokens (must encode tenant ID), background
   job/queue processing (must re-validate tenant scope), caching (must be
   tenant-scoped, not globally shared keys), file/object storage (must be
   tenant-prefixed), third-party integrations (webhooks/SSO/API keys must
   be stored per-tenant).
5. Hybrid means most tenants share multi-tenant infrastructure while a
   specific subset (large, regulated, or contractually demanding
   customers) get carved out to stronger isolation (their own schema,
   database, or deployment). It's realistic because self-serve and
   enterprise tiers genuinely have different customer counts, value, and
   regulatory profiles — forcing both onto one uniform model either wastes
   money (over-isolating the self-serve tier) or under-delivers on
   enterprise requirements.

</details>

## Further reading & sources

- [AWS: SaaS tenant isolation strategies](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html) - the vendor-neutral framework this module's decision table is adapted from.
- [Module 10, 04-databases-and-data-layer](../../04-databases-and-data-layer/10-multi-tenancy-patterns/README.md) - the data-layer mechanics this module builds on top of.
- [Salesforce Engineering: Multi-tenant architecture](https://engineering.salesforce.com/) - a large-scale production account of the multi-tenant model at extreme scale.

## Next

[01-tenant-identification-and-request-routing](../01-tenant-identification-and-request-routing/README.md) —
now that you can decide *which* model a product needs, module 01 builds the
first real mechanism: figuring out, per incoming request, which tenant it
belongs to.
