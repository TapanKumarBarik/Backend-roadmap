# The Cloud Adoption Framework and Landing Zones

## Why this matters

You can now build a management-group hierarchy (module 01) — but *which* one?
Rather than invent a tree from scratch, Microsoft publishes an opinionated,
battle-tested answer: the **Cloud Adoption Framework (CAF)** and its **landing
zone** architecture. A landing zone is the single most over-used and
under-defined term in Azure governance, so this module's job is to make it
concrete: what a landing zone actually *is*, the reference hierarchy CAF
recommends, and the crucial split between *platform* and *application* landing
zones. This is survey-level on purpose — you won't deploy the full enterprise
accelerator in a lab — but the vocabulary and shape here is what every later
module (and real platform team) assumes.

## Concepts

### The Cloud Adoption Framework in one paragraph

The **Cloud Adoption Framework** is Microsoft's prescriptive guidance for
adopting Azure at organizational scale — a set of methodologies (Strategy,
Plan, Ready, Adopt, Govern, Manage, Secure) plus reference architectures and
tooling. For this track, the part that matters is **Ready / Govern**: how to
lay out the environment so teams can build safely. You do *not* need to
memorize CAF's phases. You need its central deliverable: a **governed
landing-zone architecture** built on exactly the management groups, policy, and
RBAC primitives you already know. CAF is not a product you install; it's a
blueprint (small-b) for arranging the primitives from modules 00-01.

### What a "landing zone" actually is

A **landing zone** is a **pre-provisioned, pre-governed environment** that a
workload "lands" in — a subscription (or set of subscriptions) that already has
the networking, identity, policy, RBAC, and monitoring wired up *before* any
app team touches it. Contrast with what you've done all curriculum: an empty
subscription you configured by hand, per resource. A landing zone flips that —
the *environment arrives governed*, so a team requesting one gets guardrails,
a network, and a tagging/policy baseline **by default**. Concretely, a landing
zone is usually **one subscription** placed under the right management group,
with a baseline of policy assignments (inherited from that MG) and a standard
network/identity footprint. "Landing zone" ≈ "a governed subscription handed to
a team, ready to build in." It's the physical realization of module 00's
"governance is a platform-team product."

### Platform landing zones vs. application landing zones

The most important distinction in the whole CAF model:

- **Platform landing zones** host the **shared services** the whole
  organization depends on — connectivity (the hub VNet, VPN/ExpressRoute,
  Azure Firewall from track 5), identity (domain controllers, Entra Connect),
  and management (Log Analytics, backup, central monitoring from track 6/12).
  These are run by the **platform team**, typically in a small number of
  dedicated subscriptions, and everything else depends on them.
- **Application landing zones** are the subscriptions handed to **application
  teams** to deploy their workloads into. They *consume* the platform (peer to
  the hub network, send logs to the central workspace, inherit the baseline
  policy) but the app team owns what runs inside. Each app or team typically
  gets its own application landing zone (subscription), which is exactly the
  "subscription per team × environment" instinct from module 00.

The split is a separation of concerns: platform teams own the shared
foundation; app teams own their workloads on top of it. Getting this boundary
clean is what lets a platform team scale to hundreds of app teams.

### The CAF reference management-group hierarchy

CAF recommends a specific management-group shape under the tenant root — this
is the concrete tree module 01 was building toward:

```
Tenant Root Group
└─ Contoso (org root MG; broad "everyone" guardrails live here)
   ├─ Platform            (shared-services subscriptions)
   │  ├─ Connectivity     (hub network, firewall, DNS)
   │  ├─ Identity         (domain services, identity infra)
   │  └─ Management       (Log Analytics, automation, backup)
   ├─ Landing Zones       (application landing zones — the app teams' subs)
   │  ├─ Corp             (internal apps, no public inbound)
   │  └─ Online           (internet-facing apps)
   ├─ Sandbox             (loose, experiment-only subs; cheap guardrails)
   └─ Decommissioned      (subs being retired; deny-most policy)
```

Notice how the axes from module 01 combine: the top split is *by function*
(platform vs. workloads vs. sandbox vs. decommissioned), and `Landing Zones`
sub-splits `Corp`/`Online` *by network exposure*. Broad guardrails (allowed
regions, no public storage) attach at `Contoso` so everything inherits them;
`Online` gets stricter public-exposure policy than `Corp`; `Sandbox` gets a
deliberately loose set so experimentation isn't strangled; `Decommissioned`
gets a near-total `Deny` so retiring subs can't grow new resources. This is
"broad high, specific low" (module 01) made into a template.

### Landing zone "accelerators" and how much to adopt

Microsoft ships **landing zone accelerators** — ready-made Terraform/Bicep
deployments (the "Azure Landing Zones" or ALZ modules) that stand up the entire
hierarchy, baseline policies, and platform networking in one go. They're
powerful and *heavy*: designed for enterprises with connectivity, identity, and
management teams already in place. For a small org — or your lab — adopting the
full accelerator is overkill. The pragmatic path most teams take is
**"start with the concepts, adopt incrementally"**: build the management-group
skeleton (module 01), attach a handful of baseline policies (module 03), and
add platform subscriptions only when you actually have shared services to run.
This module is the *conceptual foundation*; you deliberately won't run the full
accelerator here. Knowing it exists — and that it's built from exactly the MG +
policy + Terraform primitives you're learning — is the goal.

## Command reference

CAF is architecture, not a CLI surface, so most "commands" here are the module-01
primitives arranged into the reference shape, plus ways to *inspect* it. There's
no `az caf` command.

| Command | What it does | Example |
|---|---|---|
| `az account management-group create` | Builds a node of the CAF reference hierarchy | `az account management-group create --name mg-platform --display-name Platform --parent mg-contoso` |
| `az account management-group show --expand --recurse` | Renders your whole hierarchy to compare against the CAF shape | `az account management-group show -n mg-contoso --expand --recurse -o json` |
| `az account management-group hierarchy-settings create` | Sets tenant-level defaults (e.g. a default MG new subscriptions land in) | see breakdown below |
| `az policy assignment list --scope <mg>` | Confirms which baseline policies a landing-zone MG inherits | `az policy assignment list --scope /providers/Microsoft.Management/managementGroups/mg-contoso -o table` |

Flag breakdown — `az account management-group hierarchy-settings create --name <tenant-root-id> --default-management-group /providers/Microsoft.Management/managementGroups/mg-sandbox --require-authorization-for-group-creation true`:

- `--name <tenant-root-id>` — the tenant root group these settings apply to
  (hierarchy settings live on the root).
- `--default-management-group .../mg-sandbox` — **where brand-new
  subscriptions automatically land** instead of directly under the root. Setting
  this to a governed (or sandbox) MG means a newly created subscription is
  *already* under guardrails rather than ungoverned at the root — a key CAF
  safety default.
- `--require-authorization-for-group-creation true` — locks down who can create
  management groups (requires explicit `Microsoft.Management/.../write`),
  preventing sprawl of ad-hoc MGs. The governance-of-the-governance setting.

## Hands-on exercises

Everything here is **free** (MGs, policy assignments, inspection). You'll shape
the hierarchy you started in module 01 into the CAF reference form. You have one
subscription, so most landing zones are *modelled, not populated* — noted where
it matters.

1. **(Azure) Reshape your module-01 tree toward the CAF reference.** Building on
   `mg-org`/`mg-prod`/`mg-nonprod` from module 01 (rename in your head to
   `mg-contoso`), add the CAF top-level nodes:
   ```bash
   az account management-group create --name mg-platform --display-name "Platform" --parent mg-org
   az account management-group create --name mg-landingzones --display-name "Landing Zones" --parent mg-org
   az account management-group create --name mg-sandbox --display-name "Sandbox" --parent mg-org
   az account management-group create --name mg-decommissioned --display-name "Decommissioned" --parent mg-org
   ```
   Expect a tree matching the CAF reference top level. You now have the standard
   skeleton — empty, but correctly shaped.

2. **(Azure) Add the platform and landing-zone sub-tiers.** Fill in the second
   level:
   ```bash
   az account management-group create --name mg-connectivity --display-name "Connectivity" --parent mg-platform
   az account management-group create --name mg-identity --display-name "Identity" --parent mg-platform
   az account management-group create --name mg-management --display-name "Management" --parent mg-platform
   az account management-group create --name mg-corp --display-name "Corp" --parent mg-landingzones
   az account management-group create --name mg-online --display-name "Online" --parent mg-landingzones
   ```
   Expect the full reference hierarchy. Render it:
   ```bash
   az account management-group show -n mg-org --expand --recurse \
     --query "{name:displayName, children:children[].{name:displayName, children:children[].displayName}}" -o json
   ```

3. **(Azure) Place your one subscription as an application landing zone.** Your
   dev subscription is best modelled as a `Corp` application landing zone (or
   move it to `mg-sandbox` if you prefer). Move it:
   ```bash
   SUB=$(az account show --query id -o tsv)
   az account management-group subscription add --name mg-corp --subscription "$SUB"
   ```
   Expect your subscription under `mg-corp`. **Write down** what a real org
   would have that you don't: separate subscriptions under `mg-connectivity`
   (the hub network), `mg-management` (Log Analytics), and one per app team
   under `mg-corp`/`mg-online`. You're modelling the shape with one real leaf.

4. **(Azure) Attach a broad baseline at the org root, a stricter one at
   `Online`.** Demonstrate "broad high, specific low." Assign allowed-locations
   at `mg-org` (broad) and a public-network-restriction flavour at `mg-online`
   (specific) — both in `Audit`:
   ```bash
   LOC=$(az policy definition list --query "[?displayName=='Allowed locations'].name" -o tsv)
   az policy assignment create --name baseline-locations --policy "$LOC" \
     --scope /providers/Microsoft.Management/managementGroups/mg-org \
     --params '{"listOfAllowedLocations":{"value":["eastus","westus"]}}'
   # A public-exposure-related built-in for the internet-facing tier (pick any storage-public built-in):
   PUB=$(az policy definition list --query "[?displayName=='Storage account public access should be disallowed'].name" -o tsv)
   az policy assignment create --name online-no-public-storage --policy "$PUB" \
     --scope /providers/Microsoft.Management/managementGroups/mg-online \
     --params '{"effect":{"value":"Audit"}}' 2>/dev/null || echo "adapt display name to an available built-in"
   ```
   Confirm `mg-online` sees *both* (its own + the inherited baseline), while
   `mg-corp` sees only the baseline:
   ```bash
   az policy assignment list --scope /providers/Microsoft.Management/managementGroups/mg-online -o table
   az policy assignment list --scope /providers/Microsoft.Management/managementGroups/mg-corp -o table
   ```

5. **(Azure) Distinguish a platform landing zone from an application one — on
   paper, backed by the tree.** In a scratch file, list which of your MGs are
   *platform* landing zones (`mg-connectivity`, `mg-identity`, `mg-management`)
   and which are *application* landing zones (`mg-corp`, `mg-online`), and for
   each platform one name the shared service from an earlier track it would host
   (hub VNet/firewall from track 5 → Connectivity; Log Analytics from track 6/12
   → Management). This cements the consume-vs-own boundary.

6. **(Azure) Inspect the tenant hierarchy setting (read-only).** See whether a
   default landing MG is configured for new subscriptions:
   ```bash
   az account management-group hierarchy-settings list --name $(az account management-group list --query "[?contains(displayName,'Tenant Root')].name | [0]" -o tsv) 2>/dev/null || echo "no custom hierarchy settings (new subs land at root by default)"
   ```
   Understand the implication: with no default set, a brand-new subscription
   lands **ungoverned at the tenant root**. A CAF-aligned org sets the default
   to a governed MG so nothing is ever born ungoverned. (Don't change the tenant
   setting in a shared tenant without permission — this is read/awareness only.)

7. **Diagnose and fix: "the landing zone isn't inheriting the baseline."** A
   very common CAF mistake — a subscription placed in the *wrong* MG silently
   misses the baseline. Simulate it: temporarily move your subscription to
   `mg-sandbox` (which has *no* baseline attached), then observe it loses the
   `Online` exposure policy and keeps only whatever `mg-org` provides:
   ```bash
   az account management-group subscription add --name mg-sandbox --subscription "$SUB"
   az policy assignment list --scope /subscriptions/$SUB --disable-scope-strict-match \
     --query "[].{name:name, scope:scope}" -o table
   ```
   **Diagnose:** the subscription now inherits only `mg-org` → `mg-sandbox`
   assignments; anything attached under `mg-landingzones`/`mg-online` no longer
   applies because sandbox is a *different branch*. **Fix:** move it back to the
   intended landing-zone MG:
   ```bash
   az account management-group subscription add --name mg-corp --subscription "$SUB"
   az policy assignment list --scope /subscriptions/$SUB --disable-scope-strict-match \
     --query "[].{name:name, scope:scope}" -o table
   ```
   Lesson: **a landing zone's governance comes entirely from *where in the tree*
   its subscription sits.** "The baseline isn't applying" is almost always "the
   subscription is in the wrong MG," not a broken policy.

8. **(Azure) Clean up the extra policy assignments; keep the hierarchy.** Later
   modules reuse the MG tree (free), so leave it, but remove the demo
   assignments if you like:
   ```bash
   az policy assignment delete --name online-no-public-storage --scope /providers/Microsoft.Management/managementGroups/mg-online 2>/dev/null; true
   # Leave baseline-locations on mg-org — module 03 builds on it.
   ```

## Independent challenge

No commands given — a design task drawing on this module, module 01 (hierarchy
axes), module 00 (the four forces), and track 5 (hub/spoke networking, firewall)
and track 6/12 (central monitoring). For the Payments/Web/Data org you've been
carrying since module 00, produce a **one-page landing-zone design document**:
draw the full CAF-aligned management-group hierarchy, then for **every**
subscription (real or imagined) label it as a *platform* or *application*
landing zone and name what it hosts. For each of the three platform landing
zones (Connectivity, Identity, Management), name the *specific* earlier-track
resource it would contain and which application landing zones depend on it and
how (e.g. "Web-prod's spoke VNet peers to the Connectivity hub"). Finally,
decide where Payments-prod's compliance-strict subscription attaches in this CAF
shape and argue whether `Corp` or `Online` (or a dedicated child) is correct for
it. Do not stand up an accelerator; the deliverable is the reasoned design and,
optionally, the top two MG levels built in your tenant.

<details>
<summary>Stuck? One hint</summary>

The platform-vs-application split maps almost directly onto "who runs it": the
three platform landing zones are the shared foundation the platform team runs
once (Connectivity = the track-5 hub VNet + Azure Firewall; Identity = domain/
identity infra; Management = the track-6/12 Log Analytics workspace + backup),
and *every* application landing zone consumes all three (peers its spoke to the
hub, authenticates against Identity, ships diagnostics to the Management
workspace). Payments-prod, being internet-facing *and* compliance-bound,
belongs under `Online` (public exposure) but almost certainly as its **own**
application landing zone subscription with an extra compliance initiative
attached at its level — the CAF shape gives you `Online` for the exposure axis,
and module 01's "lowest MG that exactly bounds the target" gives you where the
extra strictness attaches.

</details>

## Common mistakes & troubleshooting

- **Thinking a landing zone is a product you deploy.** It's a *pattern* — a
  governed subscription under the right MG with baseline policy/network/identity
  — realized from the primitives in modules 00-01. The accelerator automates it;
  the concept is what matters.
- **Blurring platform and application landing zones.** Platform LZs host shared
  services owned by the platform team (network, identity, management); app LZs
  host workloads owned by app teams. Mixing shared services into app
  subscriptions destroys the separation of concerns that lets the model scale.
- **Adopting the full accelerator into a small org.** The enterprise ALZ
  accelerator assumes connectivity/identity/management teams already exist. For
  a small org or a lab it's overkill — build the skeleton and add platform subs
  when you actually have shared services.
- **Letting new subscriptions be born at the tenant root.** With no default
  management group set, a fresh subscription is *ungoverned*. CAF sets a default
  landing MG so nothing is ever created outside the guardrails.
- **Putting a subscription in the wrong branch and blaming policy.** A landing
  zone's entire governance comes from *where its subscription sits* in the tree
  (exercise 7). Wrong MG = wrong (or missing) inherited baseline.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. In one sentence, what *is* a landing zone?
2. What's the difference between a platform landing zone and an application
   landing zone, and who owns each?
3. Name the CAF reference hierarchy's top-level management groups and one
   guardrail characteristic of `Sandbox` vs. `Decommissioned`.
4. Why is the Cloud Adoption Framework described as "a blueprint built from
   primitives you already know" rather than a product?
5. What does setting a tenant *default management group* accomplish, and what
   goes wrong without it?
6. A newly created application landing-zone subscription isn't inheriting the
   org baseline policy. What's the most likely cause and the fix?
7. Should a small org adopt the full landing-zone accelerator? Why or why not?

</details>

<details>
<summary>Show answers</summary>

1. A pre-provisioned, pre-governed environment (typically a subscription under
   the right management group) that a workload "lands" in — arriving with
   networking, identity, policy, RBAC, and monitoring already wired up.
2. A **platform** landing zone hosts shared services (connectivity, identity,
   management) owned by the **platform team**; an **application** landing zone
   is a subscription handed to an **application team** for its workloads, which
   consume the platform. Platform = shared foundation; application = workloads
   on top.
3. Top level: `Platform`, `Landing Zones` (with `Corp`/`Online`), `Sandbox`,
   `Decommissioned` (under an org root). `Sandbox` has deliberately **loose**
   guardrails for experimentation; `Decommissioned` has a near-total **`Deny`**
   so retiring subscriptions can't create new resources.
4. Because CAF is architecture/guidance, not software you install — its
   deliverable (the governed landing-zone hierarchy) is assembled from
   management groups, policy assignments, RBAC, and Terraform/Bicep, all of
   which you learned as separate primitives.
5. It makes brand-new subscriptions automatically land under a governed (or
   sandbox) MG instead of directly under the tenant root. Without it, new
   subscriptions are born **ungoverned** at the root, escaping every baseline
   until someone notices and moves them.
6. The subscription is in the **wrong management group** (wrong branch of the
   tree), so it inherits a different set — or none — of the baseline. Fix: move
   it to the intended landing-zone MG; its governance comes entirely from where
   it sits.
7. Generally no for a small org — the full accelerator assumes dedicated
   connectivity/identity/management teams and heavy platform infrastructure.
   Better to build the MG skeleton and baseline policies and add platform
   subscriptions incrementally as real shared services appear.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-02 or earlier tracks while attempting these
— the point is to find out what actually stuck. These mix this track's first
three modules with the baselines from tracks 9, 11, and 16.

1. Trace the full scope ladder from an individual storage account up to the
   tenant root, naming all five levels, and state at which levels you can attach
   a policy assignment.
2. A company has three teams, each with dev and prod, and one PCI-bound prod
   workload. Using module 00's four forces, justify a subscription *count*, then
   (module 01) sketch a management-group tree for them, then (module 02) label
   which nodes are platform vs. application landing zones.
3. You assigned an `Audit` "allowed locations" policy at a management group.
   Explain, using track 11 module 05's effect model, what would change if you
   promoted it to `Deny`, and why the existing non-compliant resources in a
   child subscription would *not* be deleted.
4. Explain "inheritance flows down, only down" and give a concrete example of a
   policy assigned on one subscription that a *sibling* subscription does not
   receive, plus the correct fix if both needed it.
5. Distinguish RBAC inheritance (additive) from `Deny`-policy inheritance
   (non-overridable) down a management-group hierarchy, referencing how role
   assignments worked in track 16.
6. What does it mean that "a landing zone's governance comes entirely from where
   its subscription sits"? Describe the exercise-7 failure and fix from module
   02 in your own words.
7. Give the Terraform (track 9) resource types you'd use to declare a two-level
   management-group hierarchy with one subscription placed under a child MG, and
   explain why the parent/child wiring should be a *reference* not a string.
8. Why is a subscription — not a resource group — the right boundary for
   isolating the PCI workload, in terms of billing, quota, and RBAC/policy?
9. Contrast an "environment-first" and a "business-unit-first" hierarchy for the
   three-team org, and say which makes "prod is stricter than dev" a clean MG
   boundary and why.
10. Name two guardrails you'd attach at the org-root MG (so everything
    inherits) and one you'd attach only at an `Online`/internet-facing MG, and
    justify the placement with "broad high, specific low."

<details>
<summary>Show answers</summary>

1. Resource (storage account) → resource group → subscription → management
   group(s) → tenant root management group. You can attach a policy assignment
   at the resource group, subscription, and every management group level
   (including the root) — not at the individual-resource level.
2. **Count:** compliance forces PCI-prod into its own subscription; environments
   force dev/prod apart; teams force per-team isolation → roughly one
   subscription per (team × environment) ≈ six, plus platform subs. **Tree:**
   e.g. org root → {Production, Non-Production} → per-team MGs, subscriptions as
   leaves (or CAF's Platform/Landing Zones/Sandbox/Decommissioned).
   **Labels:** Connectivity/Identity/Management subs = platform landing zones;
   each team's workload sub (incl. PCI-prod) = application landing zones.
3. Promoting to `Deny` (track 11 module 05) makes Azure *reject* new/updated
   resources in disallowed locations across every child scope, instead of just
   marking them non-compliant. Existing non-compliant resources are **not**
   deleted because `Deny` only acts at create/update time on future writes;
   pre-existing drift is reported, not removed (needs remediation or manual fix).
4. An assignment applies only to the scope it's on and everything *beneath* it,
   never sideways or upward. Example: a policy assigned on subscription A is not
   received by sibling subscription B (both under the same MG) — B is beside, not
   below, A. Fix: assign at their common ancestor (the shared MG), so both
   inherit it.
5. RBAC is **additive**: a role granted at an MG applies to everything below,
   and lower-scope grants only add permissions (track 16's role assignments,
   now at MG scope) — nothing subtracts. A `Deny` **policy** is
   **non-overridable**: a child cannot loosen a `Deny` inherited from an
   ancestor; the most restrictive wins, and the only carve-out is a scoped
   exemption.
6. A landing zone has no governance of its own — it inherits entirely from the
   management group it sits under. In module 02 exercise 7, moving the
   subscription to `Sandbox` (a different branch with no baseline) silently
   dropped the `Online` policy; moving it back to the intended landing-zone MG
   restored the inherited baseline. Right MG = right governance.
7. `azurerm_management_group` for each MG (parent via `parent_management_group_id`)
   and `subscription_ids` on the child MG to place the subscription (or a
   separate association). The wiring is a reference
   (`parent_management_group_id = azurerm_management_group.parent.id`) so
   Terraform orders creation correctly (parent before child) — the same
   dependency-ordering discipline as track 9 module 04's subnet references.
8. A subscription is Azure's boundary for billing (its own invoice line — clean
   cost allocation for the PCI workload), quota (its own limit pool, so other
   workloads can't starve it), and RBAC/policy isolation (access and `Deny`
   don't cross into it by default). A resource group shares all three with the
   rest of its subscription, so it can't provide a provable isolation boundary.
9. **Environment-first** (top MGs = Production/Non-Production) makes "prod
   stricter than dev" a clean MG boundary — attach strict policy on the
   Production MG and every team's prod inherits it. **Business-unit-first** (top
   MGs = teams) groups a team's dev+prod together, so environmental strictness
   must be applied per-subscription instead of at one clean MG. Environment-first
   wins for that specific requirement.
10. Org-root (broad, everything inherits): allowed regions/locations, and "no
    public blob storage." `Online`-only (specific): a stricter public-network /
    inbound-exposure policy that would wrongly block internal Corp apps. Broad
    universal rules go high so all subscriptions inherit; exposure-specific
    strictness goes low on just the internet-facing branch — "broad high,
    specific low."

</details>

## Next

Continue to
[03-azure-policy-at-scale-initiatives-and-exemptions](../03-azure-policy-at-scale-initiatives-and-exemptions/README.md)
— you have a governed hierarchy; now bundle the individual policies from track
11 into an **initiative**, assign it at the management-group level, and learn
the one escape hatch (**exemptions**) for legitimate exceptions.
