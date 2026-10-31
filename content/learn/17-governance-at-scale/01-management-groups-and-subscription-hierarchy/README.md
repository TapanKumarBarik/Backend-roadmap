# Management Groups and Subscription Hierarchy

## Why this matters

Module 00 argued that a real org needs *many subscriptions* and *a structure
above them*. **Management groups** are that structure: a tree whose leaves are
subscriptions and whose nodes let you assign policy and RBAC once and have them
inherit downward. This is the single most load-bearing concept in the whole
track — initiatives (module 03), landing zones (module 02), and the capstone
all attach to a management-group hierarchy. Get the tree right and governance
becomes "assign once, inherit everywhere"; get it wrong and you'll fight
scope mismatches forever. This module builds a real (small) hierarchy in your
tenant and proves inheritance with your own eyes.

## Concepts

### The tree: tenant root → management groups → subscriptions → RGs → resources

Every Azure tenant has a single **tenant root management group** at the top
(you saw it, empty, in module 00). Beneath it you can nest **management
groups** up to six levels deep, and at the bottom of any branch you place
**subscriptions**. Below each subscription are the resource groups and
resources you already know. So the full scope ladder, top to bottom, is:

```
Tenant Root Management Group        (one, automatic, = your tenant ID)
└─ Management Group                 (you create these; up to 6 levels)
   └─ Management Group
      └─ Subscription               (the leaf; billing/quota/isolation unit)
         └─ Resource Group          (track 9's grouping)
            └─ Resource             (a storage account, an AKS cluster…)
```

Each of these five levels is a **scope** you can assign policy and RBAC at —
and this is the same `scope` concept from track 11 module 05 and track 16, now
with three more levels above the subscription. A subscription lives under
*exactly one* management group at a time (you can move it), and a management
group lives under exactly one parent. It's a strict tree, not a graph.

### Inheritance flows down, and only down

An assignment at any node applies to **everything beneath it** and nothing
above or beside it. Assign the "allowed locations = [eastus, westus]" policy at
a management group and every subscription, resource group, and resource under
that MG inherits it — *including subscriptions you add to that MG next year*.
This is precisely the subscription-scope inheritance you saw in track 11 module
05 ("assign at subscription level and every resource group inherits it"),
extended upward: now you can assign *above* the subscription so multiple
subscriptions inherit at once. Inheritance is **cumulative and non-overridable
for `Deny`**: a `Deny` inherited from a grandparent MG cannot be "un-denied" by
a child — the most restrictive wins (with a narrow escape hatch, *exemptions*,
which module 03 covers). RBAC inheritance is **additive**: a role granted at
an MG is granted on everything under it, and lower-scope grants only *add*
permissions, they never subtract. Remembering "down, only down, most-restrictive-`Deny`-wins,
additive-RBAC" prevents most scope confusion.

### Two hierarchy shapes: by org chart vs. by environment

The big design question is *what the intermediate management groups represent*.
Two archetypes:

- **By org chart / business unit** — MGs mirror the company: `Payments`,
  `Web`, `Data`, each containing that team's subscriptions. Good when teams are
  the primary axis of ownership, budget, and access. Weakness: dev and prod for
  a team sit together, so "prod is stricter than dev" needs per-subscription
  policy rather than a clean MG boundary.
- **By environment** — top-level MGs are `Production`, `Non-Production`,
  `Sandbox`, each containing every team's subscription of that environment.
  Good when the *strictest* differences are environmental (prod policy vs. dev
  policy), which is very common. Weakness: a single team's resources are spread
  across MGs, complicating team-level budget/access.

Real hierarchies **combine both axes** — e.g. environment at the top, business
unit beneath, or vice versa — and the Cloud Adoption Framework (module 02) has
a specific opinionated shape (Platform / Landing Zones / Sandbox / Decommissioned)
you'll meet next. There is no single right tree; there's the tree that matches
*how your org actually allocates policy, budget, and access*. Design for the
axis whose differences are strictest and hardest to express per-subscription.

### The hierarchy is for governance, not for everything

A crucial discipline: management groups are for **policy and RBAC inheritance**,
not for modelling every organizational nuance. Resist the urge to build a deep,
elaborate tree that mirrors your full org chart with ten levels — every level
is a place governance can be attached and therefore a place a future engineer
must *check* when debugging why a policy applies. Keep it **shallow and
purposeful**: a level exists because you need to attach a distinct set of
guardrails there. Two-to-four meaningful levels covers almost every real org.
Depth is a cost (more scopes to reason about), not a feature.

### Moving subscriptions and the "management group scope" string

Subscriptions aren't nailed down — you **move** a subscription from one MG to
another, and it instantly picks up the new parent's inherited policy/RBAC and
drops the old. This is how a subscription gets "promoted" from a sandbox MG to
a governed landing-zone MG. Every management group also has a **scope string**
you'll use constantly for assignments:
`/providers/Microsoft.Management/managementGroups/<mg-id>`. This is the exact
analogue of the `/subscriptions/<id>` and
`/subscriptions/<id>/resourceGroups/<rg>` scope strings you used in track 11
module 05 — just the level above. Every `az policy assignment create --scope`
and every RBAC assignment you make at MG level uses this form.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az account management-group list` | Lists management groups in the tenant | `az account management-group list -o table` |
| `az account management-group create` | Creates a management group under the root (or a parent) | see breakdown below |
| `az account management-group show` | Shows an MG, optionally with its descendants | `az account management-group show -n mg-org --expand --recurse -o json` |
| `az account management-group subscription add` | Moves a subscription under a management group | see breakdown below |
| `az account management-group subscription remove` | Removes a subscription from an MG (returns it toward root) | `az account management-group subscription remove -n mg-dev --subscription <sub-id>` |
| `az account management-group delete` | Deletes an MG (must be empty of child MGs/subscriptions first) | `az account management-group delete -n mg-dev` |
| `az role assignment create --scope <mg-scope>` | Assigns an RBAC role at management-group scope (inherits down) | see breakdown below |
| `az policy assignment create --scope <mg-scope>` | Assigns a policy/initiative at MG scope (module 03 uses this) | `az policy assignment create --name loc --policy <def> --scope /providers/Microsoft.Management/managementGroups/mg-org` |

Flag breakdown — `az account management-group create --name mg-payments --display-name "Payments" --parent mg-org`:

- `--name mg-payments` — the **immutable ID** of the MG (used in scope
  strings and every reference). Choose a stable, kebab-ish id; you can't rename
  it later, only the display name.
- `--display-name "Payments"` — the human-friendly name shown in the portal;
  this one *is* changeable.
- `--parent mg-org` — the parent MG's **id** (or full scope string). Omit
  `--parent` and the new MG is created directly under the **tenant root** group.

Flag breakdown — `az account management-group subscription add --name mg-dev --subscription <sub-id>`:

- `--name mg-dev` — the **destination** management group id the subscription
  will hang under.
- `--subscription <sub-id>` — the subscription's GUID to move. After this, the
  subscription inherits everything assigned on `mg-dev` and its ancestors. A
  subscription is under exactly one MG, so this *moves* it (removing it from its
  previous parent), it doesn't add a second parent.

Flag breakdown — `az role assignment create --assignee <principal> --role Reader --scope /providers/Microsoft.Management/managementGroups/mg-org`:

- `--assignee <principal>` — the user/group/SP object id or sign-in name (the
  same principals from track 16).
- `--role Reader` — the role definition; granted on **everything** under
  `mg-org` by inheritance (every subscription, RG, resource beneath it).
- `--scope /providers/Microsoft.Management/managementGroups/mg-org` — the
  **management-group scope string**. This is the new, higher scope level this
  track unlocks; contrast with track 16's `/subscriptions/<id>` scope.

Terraform equivalent — an MG hierarchy plus an MG-scoped role assignment in HCL (builds on track 9):

```hcl
resource "azurerm_management_group" "org" {
  display_name = "Contoso Platform Org"
  # no parent_management_group_id => created under the tenant root group
}

resource "azurerm_management_group" "prod" {
  display_name               = "Production"
  parent_management_group_id = azurerm_management_group.org.id
}

resource "azurerm_management_group" "nonprod" {
  display_name               = "Non-Production"
  parent_management_group_id = azurerm_management_group.org.id
  subscription_ids           = [var.dev_subscription_id]  # place a sub under this MG
}

resource "azurerm_role_assignment" "platform_readers" {
  scope                = azurerm_management_group.org.id   # inherits to every sub below
  role_definition_name = "Reader"
  principal_id         = var.platform_team_group_object_id
}
```

- `azurerm_management_group.org` with no `parent_management_group_id` → created
  under the tenant root, exactly like omitting `--parent` in the CLI.
- `parent_management_group_id = azurerm_management_group.prod`'s parent wiring
  is a **reference**, not a string — this is the same dependency-ordering
  reference pattern from track 9 module 04 (the network/subnet wiring), so
  Terraform creates `org` before `prod`.
- `subscription_ids` on an MG resource is the declarative form of
  `az account management-group subscription add` — Terraform will *move* the
  listed subscription under that MG.
- The `azurerm_role_assignment.scope` set to an MG id is the HCL form of the
  MG-scoped `az role assignment create` above.

## Hands-on exercises

Management groups, policy/RBAC assignments, and subscription moves are **free**.
You need rights to create an MG at the tenant root — see exercise 1. You have
only one real subscription, so several exercises **simulate** multiple
subscriptions with multiple resource groups and note where a real org would
have more subscriptions.

1. **(Azure) Check you can create management groups.** MG creation requires
   the `Microsoft.Management/managementGroups/write` permission at the root
   (Owner/Contributor at tenant root, or the "Management Group Contributor"
   role). Test cheaply:
   ```bash
   az account management-group list -o table
   az account management-group create --name mg-smoke-test --display-name "smoke test" 2>&1 | head
   ```
   If it succeeds, delete it: `az account management-group delete -n mg-smoke-test`.
   If you get an **authorization** error, you may need the tenant admin to grant
   you "Management Group Contributor" at the root, or enable "hierarchy
   protection." Note the exact error — being *unable* to create an MG is itself
   a governance finding (someone owns the root and hasn't delegated it).

2. **(Azure) Build a small real hierarchy.** Create a three-node tree — an org
   root MG with a prod and a non-prod child:
   ```bash
   az account management-group create --name mg-org --display-name "Contoso Org"
   az account management-group create --name mg-prod --display-name "Production" --parent mg-org
   az account management-group create --name mg-nonprod --display-name "Non-Production" --parent mg-org
   az account management-group show -n mg-org --expand --recurse --query "children[].{id:name, children:children[].name}" -o json
   ```
   Expect a tree with `mg-org` containing `mg-prod` and `mg-nonprod`. You've
   just created the first governance structure above your subscription.

3. **(Azure) Place your subscription under the tree.** Move your one real
   subscription under `mg-nonprod` (it's a dev subscription, after all):
   ```bash
   SUB=$(az account show --query id -o tsv)
   az account management-group subscription add --name mg-nonprod --subscription "$SUB"
   az account management-group show -n mg-nonprod --expand --query "children[].{name:name, type:type}" -o table
   ```
   Expect your subscription listed as a child of `mg-nonprod`. It now inherits
   anything assigned on `mg-nonprod` or `mg-org`. In a real org, *many*
   subscriptions would hang here — you have one, so imagine the rest.

4. **(Azure) Prove RBAC inheritance from the MG.** Assign yourself Reader at
   `mg-org` and observe it appears as an *inherited* assignment on your
   subscription:
   ```bash
   ME=$(az ad signed-in-user show --query id -o tsv)
   az role assignment create --assignee "$ME" --role Reader \
     --scope /providers/Microsoft.Management/managementGroups/mg-org
   az role assignment list --all --assignee "$ME" \
     --query "[?contains(scope,'managementGroups')].{role:roleDefinitionName, scope:scope}" -o table
   ```
   Expect the Reader assignment showing a `managementGroups/mg-org` scope —
   an assignment that lives *above* your subscription and flows down. This is
   track 16's role assignment, now at the new higher scope.

5. **(Azure) Assign a policy at MG scope and watch it reach the subscription.**
   Reuse the "allowed locations" built-in (the same kind of built-in from track
   11 module 05), assigned at `mg-org` in `Audit`:
   ```bash
   LOC_DEF=$(az policy definition list --query "[?displayName=='Allowed locations'].name" -o tsv)
   az policy assignment create --name allowed-locations-org \
     --policy "$LOC_DEF" \
     --scope /providers/Microsoft.Management/managementGroups/mg-org \
     --params '{"listOfAllowedLocations":{"value":["eastus","westus"]}}'
   az policy assignment list --scope /subscriptions/$(az account show --query id -o tsv) --query "[?name=='allowed-locations-org']" -o table
   az policy assignment list --disable-scope-strict-match --query "[?name=='allowed-locations-org'].{name:name, scope:scope}" -o table
   ```
   Expect the assignment to exist at MG scope and be *visible to* your
   subscription (inherited). Assigned **once**, at the top — every subscription
   under `mg-org`, present and future, gets it. That is the leverage module 00
   promised. Leave it in `Audit`; module 03 builds on it.

6. **(Azure) Simulate a second subscription with a resource group.** You can't
   create a real second subscription in a lab, so model "team A vs team B" as
   two resource groups and reason about the boundary:
   ```bash
   az group create -n rg-team-a -l eastus
   az group create -n rg-team-b -l eastus
   ```
   Note explicitly what you *lose* versus real subscriptions: these two RGs
   still share one subscription's quota, one invoice, and one blast radius. In a
   real org each team would be its own subscription under `mg-nonprod`. Write
   that limitation down — it's the single-subscription lab's honest gap.

7. **Diagnose and fix: "my policy isn't applying to this resource group."**
   This is the classic scope/inheritance misunderstanding. Assign a policy at a
   *sibling* scope and watch it **not** reach where you expected:
   ```bash
   # Assign 'allowed locations' at rg-team-a ONLY:
   az policy assignment create --name loc-team-a --policy "$LOC_DEF" \
     --scope $(az group show -n rg-team-a --query id -o tsv) \
     --params '{"listOfAllowedLocations":{"value":["eastus"]}}'
   # Now try to see it from rg-team-b — it won't be there:
   az policy assignment list --scope $(az group show -n rg-team-b --query id -o tsv) --query "[?name=='loc-team-a']" -o table
   ```
   Expect **empty** output for `rg-team-b`: the assignment lives on a *sibling*
   resource group, and inheritance only flows *down*, never sideways.
   **Diagnose:** confirm the assignment's real scope with
   `az policy assignment show --name loc-team-a --scope $(az group show -n rg-team-a --query id -o tsv) --query scope -o tsv`.
   **Fix:** if you wanted *both* RGs covered, assign at a scope *above both* —
   the subscription (or the MG) — not on one sibling:
   ```bash
   az policy assignment delete --name loc-team-a --scope $(az group show -n rg-team-a --query id -o tsv)
   az policy assignment create --name loc-both --policy "$LOC_DEF" \
     --scope /subscriptions/$(az account show --query id -o tsv) \
     --params '{"listOfAllowedLocations":{"value":["eastus"]}}'
   az policy assignment list --scope $(az group show -n rg-team-b --query id -o tsv) --query "[?name=='loc-both']" -o table
   ```
   Now `rg-team-b` *does* see it (inherited from the subscription above it). The
   lesson: **the fix for "it didn't inherit" is almost always "assign higher,"
   not "assign again on each sibling."**

8. **(Azure) Clean up the lab resources, keep the hierarchy.** Remove the RGs
   and the RG-scoped assignments, but you can leave `mg-org`/`mg-prod`/`mg-nonprod`
   and the MG-scoped `Audit` assignment standing — later modules reuse them
   (they're free):
   ```bash
   az policy assignment delete --name loc-both --scope /subscriptions/$(az account show --query id -o tsv)
   az group delete -n rg-team-a --yes --no-wait
   az group delete -n rg-team-b --yes --no-wait
   ```
   If you *do* want to tear the MGs down (e.g. end of track), you must first move
   your subscription back out (`az account management-group subscription remove
   -n mg-nonprod --subscription "$SUB"`) then delete children before parents —
   an MG must be empty to delete.

## Independent challenge

No commands given — design and partially build, drawing on this module plus
module 00 (the four forces) and track 16 (RBAC scope). Take the org you
reasoned about in module 00's challenge (Payments/Web/Data, each dev+prod, with
Payments-prod under compliance) and design a **concrete management-group
hierarchy** for it on paper: name every management group, show the parent/child
relationships, and mark where each team's (imagined) subscriptions attach.
Justify your *choice of axis* — environment-first vs. business-unit-first vs.
combined — in two or three sentences, explicitly tying it to which differences
are strictest. Then, in your real tenant, **build just the top two levels** of
that tree with `az account management-group create` (you don't have the
subscriptions to fill it, and that's fine — note where they'd go), place your
one real subscription in the MG where it best fits, and assign an `Audit`
"allowed locations" policy at the level you decided *all* environments should
inherit it. Finally, state at which single MG you would attach a stricter,
Payments-prod-only guardrail and why that level (and not higher or lower) is
correct. Tear down any resource groups you create; you may leave the MGs for
later modules.

<details>
<summary>Stuck? One hint</summary>

The cleanest combined shape for this org is **environment at the top, business
unit beneath**: `mg-org` → {`mg-prod`, `mg-nonprod`} → per-team MGs
(`mg-prod-payments`, `mg-prod-web`, … under `mg-prod`; the dev equivalents
under `mg-nonprod`), with each team's subscription hanging off its team MG.
Broad guardrails (allowed locations, no public storage) go on `mg-org` so
*everything* inherits them; environment-wide strictness (e.g. deny certain SKUs
in prod) goes on `mg-prod`; and the Payments-prod-only compliance guardrail
goes on `mg-prod-payments` — the *lowest* MG that still contains exactly the
Payments-prod boundary and nothing else, so the strict rule inherits to that
subscription without leaking onto Web or Data. That "lowest MG that exactly
bounds the target" instinct is the whole skill.

</details>

## Common mistakes & troubleshooting

- **Assigning on a sibling and expecting it to inherit sideways.**
  Inheritance is strictly *down*. If two resource groups (or subscriptions)
  both need a rule, assign it at their common ancestor, not on each — and never
  on just one of them expecting the other to pick it up. (This is exercise 7's
  whole point.)
- **Building a deep tree that mirrors the full org chart.** Every MG level is
  a scope someone must check when debugging "why does this policy apply." Keep
  it shallow (2-4 meaningful levels); add a level only when you need to attach
  distinct guardrails there.
- **Confusing the MG `--name` (immutable id) with `--display-name`.** The id
  goes in every scope string and can't be changed; only the display name is
  editable. Pick a stable id.
- **Trying to delete a non-empty management group.** An MG must have no child
  MGs and no subscriptions before it can be deleted. Move subscriptions out and
  delete children first (leaves before roots).
- **Forgetting a `Deny` inherited from above can't be overridden below.** A
  child MG or subscription cannot "un-deny" a `Deny` from an ancestor; the most
  restrictive wins. The only escape is a scoped **exemption** (module 03), not a
  looser child assignment.
- **Missing permission to create MGs and blaming Azure.** MG creation needs
  rights at the tenant root; an authorization error usually means the root is
  owned by someone who hasn't delegated "Management Group Contributor" to you.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. List the five scope levels from the tenant root down to an individual
   resource, in order.
2. In which direction(s) does an assignment at a management group apply, and
   what does that mean for two sibling subscriptions?
3. Give the two archetype hierarchy shapes and one strength and weakness of
   each.
4. Can a child subscription override a `Deny` policy it inherits from an
   ancestor management group? What's the only exception?
5. What is the management-group scope string format, and how does it relate to
   the subscription and resource-group scope strings from earlier tracks?
6. Your policy assigned to `rg-team-a` doesn't show up on `rg-team-b`. Why, and
   what's the correct fix if you wanted both covered?
7. Why is a deep, org-chart-mirroring hierarchy discouraged?
8. How do you get a subscription to pick up a different set of inherited
   guardrails without changing any assignment?

</details>

<details>
<summary>Show answers</summary>

1. Tenant root management group → (nested) management group(s) → subscription →
   resource group → resource. Each is a scope you can assign policy/RBAC at.
2. Downward only — it applies to every subscription, resource group, and
   resource *beneath* the MG, present and future. It does **not** apply
   sideways, so a sibling subscription under a *different* MG gets nothing from
   it; only a common ancestor covers both.
3. **By org chart / business unit** (MGs = teams): strength — clean team
   ownership/budget/access; weakness — dev and prod for a team sit together, so
   environmental strictness needs per-subscription policy. **By environment**
   (MGs = prod/non-prod): strength — clean prod-vs-dev policy boundary; weakness
   — a team's resources are spread across MGs, complicating team-level
   budget/access. Real orgs combine both.
4. No — a `Deny` inherited from an ancestor cannot be overridden by a child;
   the most restrictive wins. The only exception is a **policy exemption**
   scoped to the child (module 03), which is an explicit, auditable carve-out,
   not a looser reassignment.
5. `/providers/Microsoft.Management/managementGroups/<mg-id>`. It's the same
   idea as `/subscriptions/<id>` and `/subscriptions/<id>/resourceGroups/<rg>`
   from tracks 11/16 — just the scope level(s) above the subscription.
6. Inheritance only flows down, and `rg-team-a` and `rg-team-b` are *siblings*,
   so an assignment on one never reaches the other. The fix is to assign at a
   scope *above both* — the subscription or a management group — not to
   reassign on each sibling.
7. Every MG level is another scope an engineer must inspect when reasoning
   about which policies/roles apply, so depth adds debugging cost. Add a level
   only when you genuinely need to attach distinct guardrails there.
8. **Move** it to a different management group — it instantly inherits the new
   parent's (and ancestors') assignments and drops the old parent's, with no
   change to any assignment itself.

</details>

## Next

Continue to
[02-cloud-adoption-framework-and-landing-zones](../02-cloud-adoption-framework-and-landing-zones/README.md)
— you can build a hierarchy; now meet the opinionated, battle-tested shape
Microsoft recommends for one (the Cloud Adoption Framework) and what a
"landing zone" actually is.
