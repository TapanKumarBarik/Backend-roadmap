# Governance, and Why Single-Subscription Thinking Breaks Down

## Why this matters

For sixteen tracks you have lived inside **one subscription** — one billing
boundary, one blast radius, one set of RBAC assignments you could hold in your
head. That is the right way to learn, and the wrong way to run a company on
Azure. The moment there are multiple teams, multiple environments, real money
being allocated to real cost centres, and an auditor asking "prove prod is
isolated from dev," the single-subscription model quietly collapses. This
module is the *why* before all the *how* — it names the forces that make an
organization's Azure footprint fundamentally different from your dev
subscription, so the hierarchy, policy, and Terraform patterns in the rest of
the track land as solutions to problems you can already see.

## Concepts

### What "governance" actually means (beyond the buzzword)

Governance is the set of **guardrails and structure** that let many people
build in a cloud *without* each of them being able to break, overspend, or
mis-secure the whole thing. You have already built individual guardrails: an
Azure Policy `Deny` on public storage (track 11 module 05), an RBAC role
assignment scoped to a resource group (track 16), a Terraform module that
bakes in a safe VNet layout (track 9 module 04). Governance at scale is those
same primitives applied **centrally and by default**, so a new team gets the
guardrails automatically instead of being trusted to remember them. The shift
is from *"I secured my subscription"* to *"every subscription in the org is
secured the same way, and I can prove it."* Nothing here is a new Azure
service — it's the primitives you know, applied at a level above the
subscription.

### The four forces that break one subscription

A single subscription works until one of four organizational realities shows
up, and in a real company all four show up at once:

- **Multiple teams.** Two teams in one subscription can see, and often
  modify, each other's resources. RBAC scoped per-resource-group helps, but
  the *blast radius* of an Owner assignment, a runaway script, or a bad policy
  is still the whole subscription. Teams want isolation, not just permissions.
- **Multiple environments.** Dev and prod in the same subscription share a
  quota, a policy set, and a failure domain. A dev load test that exhausts a
  regional quota can starve prod. You want dev to be *loud and permissive* and
  prod to be *quiet and strict* — different policy, different access, ideally a
  different subscription.
- **Multiple cost centres.** Finance needs to allocate spend to teams,
  projects, and business units. A single subscription is a single invoice; you
  can slice it with tags (module 06) but the cleanest allocation boundary Azure
  offers is the **subscription** itself. "Which team spent this $40k?" is very
  hard to answer inside one shared subscription.
- **Compliance boundaries.** A regulated workload (PCI, HIPAA-style data,
  a data-residency requirement) needs a *provable* boundary: "these resources,
  under these controls, in these regions, and nothing else touches them."
  Auditors want a boundary they can point at. A shared subscription full of
  unrelated dev resources is not that boundary.

Each force independently pushes you toward *more subscriptions* and *a
structure above them* to govern the set.

### The subscription is the unit of isolation, quota, and billing

Why not just use resource groups for everything? Because a **subscription** is
the boundary Azure itself uses for the things that matter at scale:

- **Billing** — each subscription is a line item / invoice section; it's the
  natural cost-allocation unit (track 21 builds on this).
- **Quota / limits** — many Azure limits (regional vCPU quota, number of
  resources of a type) are *per subscription*. Separate subscriptions =
  separate quota pools, so one team's scale test can't exhaust another's.
- **Isolation** — an Owner on subscription A has no inherent access to
  subscription B. The subscription is a hard RBAC and policy boundary.

A resource group, by contrast, is an *organizational and lifecycle* grouping
*within* a subscription — great for "delete this whole app at once," useless
as a billing or quota boundary. So real orgs end up with **many
subscriptions**, and immediately need a way to manage them as a set. That
"way" is the management group, which module 01 is entirely about.

### Inheritance is the whole point (and the whole danger)

The reason a structure *above* subscriptions is powerful is **inheritance**:
apply a policy or a role assignment once, high in the tree, and everything
below inherits it. You already saw a two-level version of this — an Azure
Policy assigned at *subscription* scope applies to every resource group under
it (track 11 module 05), and an RBAC role assigned at a resource group flows
to every resource in it (track 16). Management groups extend that to *many
levels*: assign the "no public IPs on databases" policy once at the top and
every subscription in the org inherits it, forever, including subscriptions
created next year. That is enormous leverage — and it means a mistake high in
the tree also inherits everywhere. Governance at scale is largely the
discipline of using inheritance deliberately: broad guardrails high, specific
exceptions low.

### Governance is a platform-team product, not a one-time setup

The last mental shift: at scale, governance is **owned by a platform team**
and consumed by application teams as a *product*. The platform team defines
the hierarchy, the baseline policies, the landing-zone template a new team
gets, and the tagging rules — then application teams request a subscription
and receive it *already governed*. This is the Cloud Adoption Framework's
central idea (module 02) and it reframes everything in this track: you're not
securing resources one at a time, you're building the **paved road** every
future team drives on. The rest of the curriculum's platform-engineering
tracks (24 especially) assume this framing.

## Command reference

This module is conceptual, but a few read-only commands let you *see* the
current shape of your environment — the "before" picture you'll restructure.

| Command | What it does | Example |
|---|---|---|
| `az account show` | Shows the currently active subscription (your single subscription so far) | `az account show -o table` |
| `az account list` | Lists every subscription your identity can see | `az account list -o table` |
| `az account management-group list` | Lists management groups in the tenant (likely just the root today) | `az account management-group list -o table` |
| `az role assignment list --all` | Shows every RBAC assignment your identity can see, across scopes | `az role assignment list --all -o table` |
| `az group list` | Lists resource groups in the active subscription | `az group list -o table` |
| `az consumption usage list` | Shows usage/cost detail for the subscription (billing boundary made concrete) | `az consumption usage list --top 5 -o table` |

Flag breakdown — `az role assignment list --all --assignee <you> --query "[].{role:roleDefinitionName, scope:scope}" -o table`:

- `--all` — includes assignments inherited from *above* the current
  subscription (management group / tenant root), not just those defined in it.
  This is the flag that reveals inheritance you might not know you have.
- `--assignee <you>` — filters to a single principal (your user or an SP);
  omit to see all assignments you're allowed to read.
- `--query "[].{role:..., scope:...}"` — a JMESPath projection reshaping the
  output to just the role name and the scope, so you can *see* which scope
  level each assignment lives at (resource group vs. subscription vs. MG).

## Hands-on exercises

These are **read-only and free** — you're surveying your current world, not
changing it. Nothing here bills.

1. **(Azure) Confirm you really are in one subscription.** Run:
   ```bash
   az account list -o table
   az account show --query "{name:name, id:id, tenant:tenantId}" -o table
   ```
   Note how many subscriptions you can see. For most learners it's one — that
   single subscription is the entire world this curriculum has used. Write down
   its ID; you'll place it under a management group in module 01.

2. **(Azure) See the (empty) hierarchy above you.** Run:
   ```bash
   az account management-group list -o table
   ```
   Expect either nothing, or just the **tenant root group** (its name is your
   tenant ID). That root is the invisible top of every Azure hierarchy —
   your subscription already hangs off it, you've just never looked up. This
   is the tree module 01 fills in.

3. **(Azure) Inventory the "teams" collision inside one subscription.** List
   your resource groups and imagine they belonged to different teams:
   ```bash
   az group list --query "[].{name:name, location:location}" -o table
   ```
   For each, ask: *if this were team A's and that were team B's, what stops
   team A's Owner from deleting team B's resource group?* (Answer: within one
   subscription, often nothing but convention.) This is the multiple-teams
   force made concrete.

4. **(Azure) Find your inherited RBAC.** Run:
   ```bash
   az role assignment list --all --assignee "$(az account show --query user.name -o tsv)" \
     --query "[].{role:roleDefinitionName, scope:scope}" -o table
   ```
   Look at the `scope` column. Most assignments will be at the subscription
   scope (`/subscriptions/<id>`) — meaning they flow *down* to every resource
   group. Note that today you have no scopes *above* the subscription; module
   01 adds a management-group scope you can assign at.

5. **(Azure) Make the billing boundary concrete.** Run:
   ```bash
   az consumption usage list --top 5 --query "[].{resource:instanceName, cost:pretaxCost, meter:meterId}" -o table 2>/dev/null || echo "consumption API may be unavailable on some subscription types — that's fine"
   ```
   Whatever this shows (or doesn't), the key realization: this is **one
   invoice**. Every team, environment, and project you might have is blended
   into this single bill. That blending is the multiple-cost-centres force —
   and it's exactly what a subscription-per-team split (and the tags in module
   06) untangles.

6. **(Reflection, written) Design pressure test — no commands.** In a scratch
   file, write down, for *your own* imagined org (invent 3 teams and dev/prod),
   how many subscriptions you'd want and why, using the four forces as
   headings. Don't design the hierarchy yet (that's module 01) — just justify
   the *count*. Keep this note; module 01 asks you to turn it into a tree and
   the capstone asks you to defend it.

7. **(Reflection, written) Map the guardrails you already have.** List three
   specific guardrails you built earlier in the curriculum (e.g. the track 11
   module 05 public-storage `Deny`, a track 16 RBAC assignment, a track 9
   Terraform module baking in a VNet). For each, write one sentence on what
   would change if it had to apply to *fifty* subscriptions instead of one.
   This is the exact gap the rest of the track closes.

## Independent challenge

No commands — this is a design-thinking task drawing on this module plus track
11 module 05 (policy/scope/effects) and track 16 (RBAC and role scope).
Imagine you've just been handed the platform-team role at a company with three
product teams (Payments, Web, Data), each needing a dev and a prod
environment, where Payments is under a PCI-style compliance obligation and
must be provably isolated. In one page of prose, argue **how many
subscriptions** you'd create and **why**, mapping each of the four forces
(teams, environments, cost centres, compliance) to a concrete grouping
decision. Then name **two specific guardrails** from earlier tracks you'd want
applied to *every* subscription automatically, and **one** you'd want applied
*only* to the Payments prod boundary — and explain, using the inheritance idea
from this module, at what level of a not-yet-designed hierarchy each would have
to be attached to get that behaviour. Do not design the tree itself; the point
is to reason from the forces to the requirements.

<details>
<summary>Stuck? One hint</summary>

Start from the compliance force because it's the hardest constraint: PCI
"provably isolated" almost forces Payments-prod into its **own subscription**
with nothing else in it, so the auditor has a clean boundary to point at. Then
apply the environments force (dev vs prod differ in policy strictness →
separate subscriptions per environment) and the teams force (blast-radius
isolation → separate per team), and you'll land around one subscription per
(team × environment), roughly six, plus shared platform ones later. The
"every subscription" guardrails are the broad ones (allowed regions, no public
storage) that belong *high* in a hierarchy so all subscriptions inherit them;
the Payments-prod-only one (e.g. a stricter PCI initiative) belongs *low*, on
just that boundary — which is exactly the "broad high, specific low"
inheritance discipline this module ends on.

</details>

## Common mistakes & troubleshooting

- **Assuming resource groups are enough isolation.** They organize resources
  and scope RBAC, but they share a subscription's quota, billing, and ultimate
  blast radius. For team/environment/compliance isolation you want
  *subscriptions*, grouped by *management groups* — resource groups are the
  wrong tool for that job.
- **Treating governance as a one-time hardening pass.** At scale it's an
  ongoing product: new subscriptions and teams appear continuously, and they
  must be governed *by default* (inheritance), not hardened by hand after the
  fact.
- **Confusing "I can restrict access" with "I can allocate cost."** RBAC
  controls *who can do what*; it does nothing for *whose budget paid for it*.
  Cost allocation wants subscription boundaries and tags (module 06), a
  separate axis from permissions.
- **Forgetting the tenant root already exists.** You don't build a hierarchy
  from nothing — every subscription already hangs off the tenant root
  management group. Module 01 fills in the middle; it doesn't create the top.
- **Designing the hierarchy before understanding the forces.** A tree that
  looks tidy but doesn't map to real teams/environments/compliance boundaries
  will fight you forever. Forces first (this module), tree second (module 01).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Name the four organizational forces that make a single subscription stop
   working, and give a one-line reason each pushes toward more subscriptions.
2. Why is a subscription — not a resource group — the natural unit of billing,
   quota, and isolation?
3. What is "inheritance" in this context, and why is it described as both the
   whole point and the whole danger of a hierarchy?
4. You already built individual guardrails in earlier tracks. In one sentence,
   what does "governance at scale" change about *how* those guardrails are
   applied?
5. Why can't RBAC alone solve the cost-centre problem?
6. What does it mean to say governance is "a platform-team product, not a
   one-time setup"?

</details>

<details>
<summary>Show answers</summary>

1. **Multiple teams** (blast-radius/isolation between teams within one
   subscription is weak); **multiple environments** (dev and prod want
   different policy/access/quota and shouldn't share a failure domain);
   **multiple cost centres** (a subscription is one invoice, so shared
   subscriptions blur who spent what); **compliance boundaries** (regulated
   workloads need a provable, isolated boundary an auditor can point at). Each
   pushes toward separate subscriptions.
2. Azure itself uses the subscription as the boundary for billing (one
   invoice/line item), quota/limits (many limits are per-subscription), and
   isolation (RBAC/policy don't cross subscriptions by default). A resource
   group is only a lifecycle/organizational grouping *within* a subscription
   and shares all of those.
3. Inheritance = a policy or role assignment applied high in the tree flows
   down to everything beneath it. It's the whole point because it lets you
   govern every current *and future* subscription with one assignment; it's
   the whole danger because a mistake high in the tree inherits everywhere too.
4. It applies them **centrally and by default** (via inheritance from above
   the subscription) so every team gets them automatically and provably, rather
   than each subscription being hardened by hand.
5. RBAC governs *who can do what*, not *whose budget paid for it*. Cost
   allocation needs billing boundaries (subscriptions) and tags, which is an
   orthogonal axis to permissions.
6. It means the platform team defines and owns the hierarchy, baseline
   policies, landing-zone templates, and tagging rules as an ongoing offering,
   and application teams *consume* a pre-governed subscription — versus a
   one-and-done hardening that new teams and subscriptions would immediately
   escape.

</details>

## Next

Continue to
[01-management-groups-and-subscription-hierarchy](../01-management-groups-and-subscription-hierarchy/README.md)
— you've seen *why* one subscription breaks down; now build the tree that
sits above subscriptions and makes inheritance real.
