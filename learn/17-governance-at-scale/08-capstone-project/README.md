# Capstone Project

## Why this matters

This is where the whole track converges. Across modules 00-07 you learned each
piece of governance-at-scale in isolation — why one subscription breaks down, a
management-group hierarchy, landing zones, initiatives and exemptions,
repeatable provisioning, multi-subscription Terraform, a tagging taxonomy, and
compliance as code. A real platform team doesn't get to practise these
separately; they arrive as one coherent design decision: *"here is how our
organization is structured, governed, tagged, and provisioned, and here is why."*
There is no new concept and no quiz here. The goal is to prove you can
**compose** the track into a governance design a real org would recognize — and,
crucially, **defend every decision**, because at this level the reasoning is the
skill. Some of it is *designed* (written) rather than fully provisioned, because
you have one subscription and can't create a real multi-subscription org in a
lab — that constraint is explicitly part of the exercise, exactly as it was
throughout the track.

Treat this as a project, not a checklist of isolated tasks — the pieces depend on
each other in the order you'd actually build them: structure first, then the
governance that hangs off it, then the metadata and provisioning that live inside
it.

## The project

Design and (as far as a single subscription allows) build a **complete
governance foundation** for a fictional organization of your choosing — the
Payments/Web/Data org you've carried since module 00 is the natural candidate,
with three teams, dev/prod environments, and one compliance-bound workload.
Your deliverable has four parts, all of which must fit together:

1. **A management-group hierarchy design** (modules 00-02). A written design —
   a diagram plus prose — of the full hierarchy: every management group named,
   parent/child relationships shown, and every (real or imagined) subscription
   placed as a platform or application landing zone. It must be **CAF-aligned**
   in spirit (a clear platform vs. application-landing-zone split, a sandbox and
   a decommissioned path) and justify its **axis choice** (environment-first,
   business-unit-first, or combined). Build the **top two levels for real** in
   your tenant with `az account management-group create`, place your one real
   subscription where it best fits, and clearly note where the subscriptions you
   can't create would attach.

2. **A policy initiative at the management-group level** (modules 03, 06, 07). A
   **custom initiative** grouping **at least three** individual policies (drawn
   from the kinds you used in track 11 module 05 and this track — e.g. allowed
   locations, no public storage, a required `CostCenter` tag), created at your
   org-root MG and **assigned once at a management-group scope** so every
   subscription inherits it. It must expose at least one **shared parameter**,
   start in **`Audit`**, and be accompanied by **one narrow, documented,
   time-bound exemption** for a legitimate exception. Optionally overlay a
   **regulatory initiative** (module 07) on just the compliance-bound branch.

3. **A documented tagging taxonomy** (module 06). A written taxonomy: the
   required keys (at least `CostCenter`, `Environment`, `Owner`,
   `DataClassification`), their allowed values/formats, and which are enforced
   `Deny` at create vs. `Modify`/inherited vs. optional — plus how it will feed
   Cost Management (track 21). Enforce at least the required-tag `Deny` via
   policy (ideally *inside* the initiative from part 2), and demonstrate it
   blocking an untagged create and allowing a tagged one.

4. **A two-environment Terraform structure** (modules 05, track 9). A working
   **directory-per-environment** Terraform layout (`envs/dev`, `envs/prod`)
   where both environments call a **single shared module** and differ **only**
   in `*.tfvars` (SKU/size, tags), with **appropriate provider configuration**
   (structured for multi-subscription via aliasing, even if pointed at your one
   id) and **per-environment backend configuration** (separate state key per
   env). Apply **dev** for real, and prove via separate state that a dev apply
   cannot touch prod. Every resource the module creates must carry the taxonomy
   tags from part 3.

Then **integrate, prove, and defend** it — see the acceptance checklist.

### Acceptance checklist

Work top to bottom; each item leans on the previous ones actually working, not
just existing.

- [ ] **Hierarchy design document** exists: a diagram + prose naming every
      management group, showing parent/child links, placing every subscription
      as platform or application landing zone, with a CAF-aligned shape (platform
      vs. landing-zones split, sandbox, decommissioned) and a written
      justification of the axis choice.
- [ ] The **top two MG levels are built for real** (`az account management-group
      list` shows them), your subscription is placed under the correct MG, and
      the document marks where the un-creatable subscriptions would attach.
- [ ] A **custom initiative** groups **≥3** policies, is created at the org-root
      MG, exposes **≥1 shared parameter**, and is **assigned once at a
      management-group scope** in **`Audit`**. `az policy assignment list
      --scope <your-subscription> --disable-scope-strict-match` shows it
      **inherited** from the MG.
- [ ] **Inheritance is demonstrated**, not asserted: you can point to the
      initiative applying to your subscription purely because of where it sits in
      the tree, and explain what a *sibling* subscription would/wouldn't get.
- [ ] **One narrow, documented, time-bound exemption** exists for a legitimate
      exception — scoped to the *lowest* scope that covers it, targeting the
      *specific* member policy, with a category, a reason, and an `expiresOn`.
      You can explain why a subscription-wide, whole-initiative exemption would
      have been wrong.
- [ ] A **tagging taxonomy document** defines the required keys, allowed
      values/formats, and enforcement mode of each, and states how it feeds Cost
      Management. The required-tag **`Deny`** is enforced (ideally within the
      initiative) and **demonstrably blocks an untagged create** while allowing a
      tagged one.
- [ ] A **directory-per-environment** Terraform layout exists: `envs/dev` and
      `envs/prod` each call the **same shared module**, differ **only** in
      `*.tfvars`, and have **separate backend/state**. Provider configuration is
      structured for multi-subscription (aliasing present and explained), even if
      pointed at one real subscription id.
- [ ] **Dev is applied for real** and every created resource carries the part-3
      taxonomy tags. `terraform state list` in `envs/dev` shows the resources;
      `terraform plan` in `envs/prod` references **nothing** about dev (proving
      state isolation). You **read the plan's `N to add`** before applying.
- [ ] The four parts **fit together**: the initiative and tag `Deny` are assigned
      at the hierarchy you designed; the Terraform resources land in a
      subscription under that hierarchy and are tagged per the taxonomy and would
      be governed by the inherited initiative. It's one system, not four unrelated
      artifacts.
- [ ] You can **defend every decision**: for each of the four parts, why this
      shape and not an obvious alternative (why this axis, why assign at *this* MG
      level, why directory-per-env over workspaces, why these required tags). If
      you can't justify a piece, that's a signal to revisit the module, not to
      leave a decision you can't explain.

### Hints

- **Design the hierarchy first, on paper, before touching the CLI.** The
  structure is what everything else attaches to; a shaky tree makes parts 2-4
  fight you. Get the axis choice and the platform/application split settled in
  prose, then build the top two levels. (Modules 01-02.)
- **Assign the initiative at the *lowest MG that covers everything that needs
  it*.** For an org-wide baseline that's the org-root MG; resist assigning it on
  each subscription. The whole point is one assignment, inherited — demonstrate
  that, don't reassign per scope. (Modules 01, 03.)
- **Put the tag `Deny` *inside* the initiative rather than as a separate
  assignment.** It keeps the baseline a single named standard and proves you
  understand that tagging enforcement *is* policy (modules 03, 06). One shared
  parameter (e.g. `allowedLocations` or the required tag name) satisfies the
  shared-parameter requirement.
- **Make the exemption surgical and boring.** Lowest scope, one member policy,
  a real reason, a real `expiresOn`. The capstone is testing that you *didn't*
  reach for a broad exemption (module 03's footgun).
- **For Terraform, let `*.tfvars` be the only diff.** If you find yourself
  editing resource blocks between dev and prod, stop — the difference belongs in
  variables, and the structure belongs in one shared module (modules 05, track 9
  module 04). A `locals.common_tags` map keeps the taxonomy DRY across resources
  (remember tags don't inherit — module 06).
- **Prove isolation, don't claim it.** The convincing artifact is `envs/prod`'s
  plan showing it knows nothing about dev's applied resources because it reads a
  different state — that's the directory-per-env payoff (module 05, exercise 8).
- **Keep everything cheap and destroy promptly.** The only billable pieces are
  the handful of resources your Terraform dev environment creates (a storage
  account, a resource group). Two tiny resources prove the point; there's no
  need for a cluster here.
- **Reuse what you already built.** The `mg-org` hierarchy from module 01, the
  `contoso-baseline` initiative from module 03, and the tagging policies from
  module 06 are all still standing (they're free) — the capstone is about
  *integrating and defending* them as one design, not rediscovering each piece.

### Final cleanup

The only real spend is the Terraform dev environment; the governance constructs
are free, but clean them up too so you leave your tenant as you found it.

1. Confirm what you built: `terraform state list` (in `envs/dev`), `az policy
   assignment list --scope /providers/Microsoft.Management/managementGroups/<root>
   -o table`, and `az account management-group show -n <root> --expand --recurse`.
2. Destroy the Terraform environment: in `envs/dev`, `terraform destroy
   -var-file=dev.tfvars` — review the destroy plan, then confirm. (Prod was only
   ever planned, so there's nothing to destroy there.)
3. Remove the governance constructs you added: the policy **exemption**, the
   **initiative assignment(s)** at the MG scope, and the custom **initiative
   definition** (`az policy assignment delete`, then `az policy set-definition
   delete`).
4. Tear down the hierarchy **leaves before roots**: move your subscription back
   toward the root (`az account management-group subscription remove`), then
   `az account management-group delete` each MG from the bottom up (an MG must be
   empty to delete). Or, if you're continuing straight into track 18, you may
   leave the empty MG skeleton standing — it costs nothing.
5. Final sweep: `az group list -o table` shows nothing from this project, and
   `az policy assignment list --disable-scope-strict-match --query
   "[?contains(name,'baseline') || contains(name,'contoso')]" -o table` is empty.

## Before you move on

Once it's torn down, don't consider this finished yet. Wait a few days, then —
with no notes, none of the earlier modules open, and none of the HCL or CLI in
front of you — **redesign the whole governance foundation from a blank page**:
sketch the management-group hierarchy and justify its axis, list the ≥3 policies
in your baseline initiative and the exact MG scope you'd assign it at, write the
four required tags and their enforcement modes from memory, and describe the
directory-per-env Terraform layout with its separate backends and the one-line
provider-aliasing change that would move a workload to another subscription.
Then note *where you stalled* — was it which MG level to assign the initiative
at? The difference between a Deployment Stack and a Template Spec? Why tags don't
inherit? Whatever you couldn't reconstruct cold is exactly the module to redo.
Rebuilding the entire design from memory, and noticing precisely where it breaks
down, is the truest retention check there is — far more than re-reading the
prose.

## Next

You've now taken sixteen tracks' worth of single-subscription skill and learned
to structure, govern, tag, provision, and prove compliance for an entire
organization's Azure footprint — the platform-team foundation every later track
assumes. The immediate next step is
**[18-supply-chain-security](../../18-supply-chain-security/README.md)**, which
takes the policy-and-admission-control mindset you scaled up here — governing
*what is allowed to exist* — and points it at the **software supply chain**:
signing container images, generating SBOMs, verifying provenance, and enforcing
admission control so that only trusted, attested artifacts ever reach the
clusters and subscriptions you now know how to govern. The guardrail discipline
is the same; the boundary moves from "what Azure resources exist" to "what code
we trust to run."

[Back to track index](../README.md) · [Back to main curriculum](../../README.md)
