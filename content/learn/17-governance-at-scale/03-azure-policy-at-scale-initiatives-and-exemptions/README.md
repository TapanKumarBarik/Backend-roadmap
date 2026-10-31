# Azure Policy at Scale: Initiatives and Exemptions

## Why this matters

In track 11 module 05 you assigned *one* policy to *one* resource group. That
doesn't survive contact with an organization: a real governance baseline is
*dozens* of related policies (allowed regions, no public storage, required
encryption, required tags) that must apply consistently to *every* subscription.
Assigning them one at a time, per scope, is unmanageable. **Initiatives** (a.k.a.
policy sets) solve the "many policies" problem by bundling them into one
assignable unit; assigning at a **management-group scope** (module 01) solves
the "every subscription" problem via inheritance. And **exemptions** solve the
inevitable "this one resource legitimately needs an exception" problem without
weakening the policy for everyone. Together these three are how policy actually
operates at scale — this module turns the single-policy skill from track 11 into
an org-wide control plane.

## Concepts

### From policy definition to initiative (policy set)

You already met the building blocks in track 11 module 05: a **policy
definition** is reusable logic (the `if`/`then` rule), a **policy assignment**
applies a definition to a scope with parameters and an effect. An **initiative**
(the API name is **policy set definition**) is a third object that **groups many
policy definitions** into one bundle with shared parameters. You then create a
single **initiative assignment** — and all the bundled policies apply at once.
This is the exact concept track 11 module 05 previewed ("an initiative bundles a
group of definitions under one assignable unit... the building block track 17
scales up") — now you build and assign one yourself. The mental model:
definition = one rule, initiative = a *standard* made of many rules, assignment
= that standard applied somewhere.

### Why bundle: consistency, single assignment, shared parameters

Three concrete payoffs over assigning policies individually:

- **One assignment, many rules.** Assign the initiative once at `mg-org` and
  every subscription inherits *all* its policies — versus creating and tracking
  dozens of separate assignments per scope. Add a policy to the initiative later
  and every scope that assigned the initiative picks it up automatically.
- **Consistency.** A named standard ("Contoso Baseline") means every scope gets
  *the same* set — no subscription accidentally missing the "no public storage"
  rule because someone forgot to assign it there.
- **Shared parameters.** An initiative can expose one parameter (e.g.
  `allowedLocations`) that feeds several of its member policies, so you set the
  allowed regions once for the whole bundle instead of per policy.

This is the same abstraction win as a Terraform module (track 9 module 04):
package many pieces behind one interface, assign/call it once, stay DRY.

### Built-in initiatives vs. custom initiatives

Like definitions, initiatives come in two flavours. **Built-in initiatives**
ship with Azure — the Microsoft Cloud Security Benchmark, CIS, and the
regulatory compliance sets (PCI-DSS, ISO 27001, etc., which module 07 uses).
You *assign* these; you don't author them. **Custom initiatives** are ones you
build by selecting existing definitions (built-in or your own) into a set —
this is how you create *your org's* baseline ("Contoso Baseline" = allowed
locations + no public storage + require tags). Most orgs do both: assign a
built-in security benchmark for breadth, plus a lean custom initiative for
their specific house rules. Authoring a custom initiative is *assembly* (pick
definitions, wire parameters), not writing rule logic from scratch — the same
"governance is assembly, not authoring" point from track 11 module 05.

### Assigning at management-group scope: inheritance meets initiatives

The payoff of combining this module with module 01: assign the initiative at a
**management-group scope** and it inherits to every subscription beneath, using
the exact same `--scope /providers/Microsoft.Management/managementGroups/<id>`
string from module 01. This is the difference the whole track is about — track
11 module 05 assigned "at a management-group scope instead of one resource
group" as a forward promise; here you cash it in. One initiative assignment at
`mg-org` = your entire baseline applied to the whole org, including future
subscriptions. Effects still work identically (start `Audit`, promote to `Deny`
— the track 11 discipline), and compliance still evaluates on a schedule; the
only thing that changed is the *scope* and the *bundling*, not the mechanics.

### Exemptions: the auditable escape hatch

Inevitably, one resource legitimately can't comply — a legacy app that must live
in a non-approved region during migration, a workload that genuinely needs a
public endpoint. You do **not** loosen the policy or the initiative for everyone
(that defeats the baseline), and you *can't* override an inherited `Deny` from a
child (module 01). Instead you create a **policy exemption**: a scoped, explicit,
**time-bound**, auditable carve-out that says "this specific scope is exempt from
this specific assignment (or these members of it), for this reason, until this
date." Two exemption categories: **Waiver** (accept the non-compliance as-is) and
**Mitigated** (the risk is handled by other means). The key properties: an
exemption is *narrow* (a resource group or resource, not the whole subscription),
*documented* (it carries a reason and metadata), and ideally *expiring* (an
`expiresOn` date forces re-review). An exemption is the governed way to say
"yes, we know, and here's why" — the opposite of silently weakening the rule.

### Exemption scope is the whole game (the footgun preview)

The single most common exemption mistake — which you'll deliberately create and
fix in the exercises — is making the exemption **too broad**. An exemption at
*subscription* scope for the whole initiative exempts *everything* in that
subscription from *every* policy in the bundle, quietly gutting the baseline for
that entire subscription. The discipline mirrors module 01's inheritance rule in
reverse: **exempt at the *lowest* scope that covers exactly the resource(s) that
need it, and for the *specific* policy definitions within the initiative that
they violate — never the whole initiative at a high scope.** A good exemption is
surgical; a bad one is a hole you forgot you cut.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az policy set-definition create` | Creates a **custom initiative** from a list of member definitions | see breakdown below |
| `az policy set-definition list` | Lists initiatives (built-in and custom) | `az policy set-definition list --query "[?policyType=='Custom'].displayName" -o tsv` |
| `az policy assignment create --policy-set-definition <id> --scope <mg>` | Assigns an **initiative** to a scope (note the `-set-` flag, vs `--policy` for a single definition) | see breakdown below |
| `az policy exemption create` | Creates a scoped, categorized, optionally time-bound exemption from an assignment | see breakdown below |
| `az policy exemption list` | Lists exemptions at/under a scope | `az policy exemption list --scope <scope> -o table` |
| `az policy exemption delete` | Removes an exemption (re-subjecting the scope to the policy) | `az policy exemption delete --name legacy-region-waiver --scope <rg-id>` |
| `az policy state summarize` | Summarizes compliance for an initiative assignment across a scope | `az policy state summarize --management-group mg-org` |

Flag breakdown — `az policy set-definition create --name contoso-baseline --display-name "Contoso Baseline" --definitions @definitions.json --params @params.json --management-group mg-org`:

- `--name contoso-baseline` — the immutable id of the initiative.
- `--definitions @definitions.json` — a JSON **array** of member policies, each
  `{ "policyDefinitionId": "<def-id>", "parameters": {...} }`. This is the list
  of individual definitions (from track 11) the bundle contains.
- `--params @params.json` — the initiative-level parameters (e.g. a single
  `allowedLocations`) that member policies reference via
  `"[parameters('allowedLocations')]"` — the shared-parameter mechanism.
- `--management-group mg-org` — creates the initiative *definition* at MG scope
  so it (and everything under it) can assign it. Definitions live at a scope too;
  create them high enough that every scope needing them can see them.

Flag breakdown — `az policy assignment create --name contoso-baseline-assign --policy-set-definition contoso-baseline --scope /providers/Microsoft.Management/managementGroups/mg-org --params '{"allowedLocations":{"value":["eastus","westus"]}}' --mi-system-assigned --location eastus`:

- `--policy-set-definition contoso-baseline` — assign an **initiative** (this
  is the flag that differs from track 11's `--policy <definition>` for a single
  policy).
- `--scope .../managementGroups/mg-org` — the MG scope; the whole bundle
  inherits to every subscription below.
- `--params '{"allowedLocations":{"value":[...]}}'` — sets the shared
  initiative parameter once for all member policies.
- `--mi-system-assigned --location eastus` — creates a **managed identity** for
  the assignment, required only if the initiative contains `DeployIfNotExists`/
  `Modify` policies that *write* resources (track 11 module 05's DINE note); the
  identity needs a role grant to remediate. Pure `Audit`/`Deny` initiatives don't
  need this.

Flag breakdown — `az policy exemption create --name legacy-region-waiver --policy-assignment <assignment-id> --exemption-category Waiver --scope <rg-id> --policy-definition-reference-ids allowedLocations --expires-on 2026-12-31T00:00:00Z --description "Legacy CRM mid-migration; approved by CAB-1423"`:

- `--policy-assignment <assignment-id>` — *which* assignment this exempts from
  (the initiative assignment above).
- `--exemption-category Waiver` — `Waiver` (accept the non-compliance) or
  `Mitigated` (risk handled elsewhere); makes the *intent* auditable.
- `--scope <rg-id>` — the **narrow** scope the exemption applies to; a resource
  group or single resource, *not* the whole subscription. This flag is where
  the too-broad footgun lives.
- `--policy-definition-reference-ids allowedLocations` — exempt only the
  **specific member policy** within the initiative (by its reference id), not
  the entire bundle — surgical, not blanket.
- `--expires-on 2026-12-31...` — a hard expiry forcing re-review; an exemption
  without one tends to become permanent and forgotten.
- `--description "..."` — the *reason* and approval reference; the documentation
  that makes it a governed carve-out rather than a silent hole.

## Hands-on exercises

Initiatives, assignments, and exemptions are **free**. Reuse the `mg-org`
hierarchy from modules 01-02 and your one subscription under it. Compliance
evaluation is not instant (track 11 module 05's ~30-minute lesson still applies).

1. **(Azure) Gather three built-in definitions for your baseline.** Grab the
   ids of three cheap, universal built-ins (the same kind from track 11):
   ```bash
   LOC=$(az policy definition list --query "[?displayName=='Allowed locations'].id" -o tsv)
   PUB=$(az policy definition list --query "[?displayName=='Storage account public access should be disallowed'].id" -o tsv)
   TAG=$(az policy definition list --query "[?displayName=='Require a tag on resources'].id" -o tsv)
   echo "$LOC"; echo "$PUB"; echo "$TAG"
   ```
   Expect three definition ids. (If a display name differs in your cloud, pick
   the nearest built-in — the point is *three* real definitions.)

2. **(Azure) Build a custom initiative from them.** Write the member list and
   create the initiative at `mg-org`:
   ```bash
   cat > /tmp/definitions.json <<JSON
   [
     { "policyDefinitionId": "$LOC", "parameters": { "listOfAllowedLocations": { "value": "[parameters('allowedLocations')]" } } },
     { "policyDefinitionId": "$PUB", "parameters": {} },
     { "policyDefinitionId": "$TAG", "parameters": { "tagName": { "value": "CostCenter" } } }
   ]
   JSON
   cat > /tmp/params.json <<JSON
   { "allowedLocations": { "type": "Array", "defaultValue": ["eastus","westus"] } }
   JSON
   az policy set-definition create --name contoso-baseline \
     --display-name "Contoso Baseline" \
     --definitions @/tmp/definitions.json --params @/tmp/params.json \
     --management-group mg-org
   ```
   Expect an initiative created at `mg-org` bundling three policies with one
   shared `allowedLocations` parameter. You just built a *standard*.

3. **(Azure) Assign the initiative at the management-group scope.** One
   assignment, whole org, `Audit` first:
   ```bash
   SETID=$(az policy set-definition show --name contoso-baseline --management-group mg-org --query id -o tsv)
   az policy assignment create --name contoso-baseline-assign \
     --policy-set-definition "$SETID" \
     --scope /providers/Microsoft.Management/managementGroups/mg-org \
     --params '{"allowedLocations":{"value":["eastus","westus"]}}'
   ```
   Confirm your subscription (under `mg-org`) sees it inherited:
   ```bash
   az policy assignment list --scope /subscriptions/$(az account show --query id -o tsv) \
     --disable-scope-strict-match --query "[?name=='contoso-baseline-assign'].{name:name, scope:scope}" -o table
   ```
   Expect the assignment listed with an `mg-org` scope — three policies applied
   to the whole org from one command. This is the module's headline.

4. **(Azure) Create a violating resource and watch bundle compliance.** In a lab
   RG, create a resource that violates one member (a storage account with no
   `CostCenter` tag), then summarize compliance for the initiative:
   ```bash
   az group create -n rg-policy-lab -l eastus
   az storage account create -n govlab$RANDOM -g rg-policy-lab --sku Standard_LRS 2>/dev/null || echo "created (or name taken)"
   # after the evaluation delay (up to ~30 min):
   az policy state summarize --management-group mg-org \
     --query "policyAssignments[?policyAssignmentId!=null] | [0].results" -o json 2>/dev/null || \
   az policy state list --filter "complianceState eq 'NonCompliant'" -o table
   ```
   Expect (after the delay) the storage account non-compliant against the
   *require-tag* member of the initiative — one bundle, per-policy compliance
   results.

5. **(Azure) Add a legitimate exception the RIGHT way — a narrow, expiring
   exemption.** Suppose `rg-policy-lab` holds a legacy resource that genuinely
   can't carry the `CostCenter` tag yet. Exempt **only that RG**, **only the tag
   policy**, **with an expiry and a reason**:
   ```bash
   ASSIGN=$(az policy assignment show --name contoso-baseline-assign \
     --scope /providers/Microsoft.Management/managementGroups/mg-org --query id -o tsv)
   az policy exemption create --name legacy-tag-waiver \
     --policy-assignment "$ASSIGN" \
     --exemption-category Waiver \
     --scope $(az group show -n rg-policy-lab --query id -o tsv) \
     --expires-on 2026-12-31T00:00:00Z \
     --description "Legacy CRM cannot be tagged until migration; approved CAB-1423"
   az policy exemption list --scope $(az group show -n rg-policy-lab --query id -o tsv) -o table
   ```
   Expect one exemption, scoped to just `rg-policy-lab`, with a category, reason,
   and expiry. This is the governed way to say "we know, and here's why."

6. **(Azure) Promote the initiative to enforce and observe exemptions still
   hold.** Flip the tag member to `Deny` behaviour (via the initiative
   assignment's effect override or by re-assigning with a Deny param, depending
   on the member's exposed effect) — the track 11 audit-then-enforce move — and
   confirm a *new* untagged resource elsewhere is blocked while the exempted RG
   is not. (If the chosen built-in doesn't expose an `effect` param, articulate
   in writing what *would* happen and move on — the exemption behaviour is the
   learning target.)

7. **Diagnose and fix: an exemption that's far too broad.** This is the money
   footgun. Create a deliberately over-broad exemption at *subscription* scope
   for the *whole initiative*, then prove it guts the baseline:
   ```bash
   BADSCOPE=/subscriptions/$(az account show --query id -o tsv)
   az policy exemption create --name oops-blanket \
     --policy-assignment "$ASSIGN" \
     --exemption-category Waiver \
     --scope "$BADSCOPE" \
     --description "temporary — quick fix (this is the mistake)"
   az policy exemption list --scope "$BADSCOPE" -o table
   ```
   **Diagnose:** this exemption has no `--policy-definition-reference-ids` (so it
   exempts *every* member policy) and sits at *subscription* scope (so *every*
   resource group under it is exempt) — the entire baseline is now off for the
   whole subscription, not the one legacy resource that needed relief. Spot it by
   noting the scope is a whole subscription and no specific member is named.
   **Fix:** delete the blanket exemption; keep only the narrow RG-scoped,
   single-policy one from exercise 5:
   ```bash
   az policy exemption delete --name oops-blanket --scope "$BADSCOPE"
   az policy exemption list --scope "$BADSCOPE" -o table   # gone
   az policy exemption list --scope $(az group show -n rg-policy-lab --query id -o tsv) -o table  # narrow one remains
   ```
   Lesson: **exempt at the lowest scope, for the specific member policy, with an
   expiry.** A subscription-wide, whole-initiative exemption is a hole you'll
   forget you cut.

8. **(Azure) Clean up the lab resources; keep the initiative and hierarchy.**
   ```bash
   az policy exemption delete --name legacy-tag-waiver --scope $(az group show -n rg-policy-lab --query id -o tsv) 2>/dev/null; true
   az group delete -n rg-policy-lab --yes --no-wait
   # Leave contoso-baseline + its mg-org assignment — modules 06/07 reuse them (free).
   ```

## Independent challenge

No commands given — build it yourself, drawing on this module, track 11 module
05 (definitions, effects, audit-then-enforce, exemptions preview), and module 01
(MG scope, inheritance). Design and assemble a **custom initiative representing a
defensible org baseline** of at least four built-in policies — pick a coherent
set (e.g. allowed locations, no public storage, require a `CostCenter` tag,
require HTTPS/secure transport). Expose at least **one shared parameter** the
whole bundle consumes, create the initiative at your org-root management group,
and assign it once — in `Audit` — at that MG so every subscription inherits it.
Then create *one* violating resource in a lab resource group, confirm the correct
member reports it non-compliant, and grant a **single narrow, time-bound,
documented exemption** for exactly that resource against exactly the member
policy it violates — no broader. Finally, write two or three sentences explaining
why this initiative-at-MG-scope approach is strictly better than assigning the
four policies individually per subscription, and why your exemption's scope and
`expiresOn` were chosen the way they were. Clean up the lab resource; keep the
initiative.

<details>
<summary>Stuck? One hint</summary>

The member-definitions JSON is the part people get wrong: it's an array of
objects each with a `policyDefinitionId` (the built-in's full id from
`az policy definition list ... --query [].id`) and a `parameters` map, where a
member parameter can reference an initiative-level parameter with
`"[parameters('allowedLocations')]"` — that string is what wires the *shared*
parameter through to a member. Create the initiative with
`az policy set-definition create --management-group <root> --definitions
@members.json --params @setparams.json`, assign it with
`az policy assignment create --policy-set-definition <id> --scope <mg>` (note
`--policy-set-definition`, not `--policy`), and make the exemption surgical with
`--scope <the-one-rg>`, `--policy-definition-reference-ids <the-one-member>`, and
`--expires-on <a-real-date>`. If you find yourself exempting at subscription
scope or omitting the reference id, you've recreated exercise 7's footgun.

</details>

## Common mistakes & troubleshooting

- **Using `--policy` when you mean `--policy-set-definition`.** A single policy
  and an initiative are different objects with different assignment flags. `az
  policy assignment create --policy <def>` assigns one definition;
  `--policy-set-definition <set>` assigns the whole bundle.
- **Creating the initiative definition at too low a scope.** If you author the
  initiative at a subscription but want to assign it at a management group, the
  MG can't see it. Create the *definition* at a scope at or above every scope
  that will assign it (typically the org-root MG).
- **Exemptions that are too broad.** A subscription-scoped, whole-initiative
  exemption silently disables the entire baseline for that subscription. Exempt
  the *lowest* scope that covers the resource, name the *specific* member policy,
  and set an expiry. (Exercise 7.)
- **Exemptions with no expiry.** An open-ended exemption becomes permanent and
  forgotten. Always set `--expires-on` so it forces a re-review.
- **Expecting the initiative to remove existing non-compliant resources.** Like
  any policy (track 11 module 05), `Deny` members block new/updated resources
  only; pre-existing drift is reported, not deleted — remediation needs DINE/
  Modify members and a managed identity.
- **Forgetting the managed identity for DINE/Modify members.** If your
  initiative contains a `DeployIfNotExists` or `Modify` policy, the assignment
  needs `--mi-system-assigned --location <region>` and a role grant, or
  remediation silently fails (the track 11 module 05 DINE lesson).
- **Assuming compliance is instant.** Evaluation runs on a schedule (up to ~30
  min for a new assignment). "No results yet" is timing, not a broken initiative.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Define, in one line each, a policy *definition*, an *initiative* (policy set),
   and an *assignment*. Which one did you not need in track 11 module 05?
2. Give three concrete advantages of assigning an initiative over assigning its
   member policies individually.
3. What does assigning an initiative at a *management-group* scope buy you that
   assigning at a subscription doesn't?
4. What is a policy exemption, and why is it preferable to loosening the policy
   or the initiative for a legitimate one-off exception?
5. Name the two exemption categories and what each communicates.
6. What are the three properties of a *good* (surgical) exemption, and what does
   a too-broad one look like?
7. Your initiative contains a `DeployIfNotExists` member and remediation isn't
   happening. What did you likely forget?
8. Where must an initiative *definition* be created if you want to assign it at
   the org-root management group, and why?

</details>

<details>
<summary>Show answers</summary>

1. **Definition** = one reusable rule (`if`/`then` + effect). **Initiative /
   policy set** = a bundle of many definitions with shared parameters, assignable
   as one. **Assignment** = a definition or initiative applied to a scope with
   parameters. Track 11 module 05 used definitions and assignments but you didn't
   *build* an initiative there — that's new here.
2. One assignment applies many rules (and new members are picked up
   automatically); consistency (every scope gets the same named standard, none
   missing a rule); shared parameters (set e.g. allowed locations once for the
   whole bundle instead of per policy).
3. Inheritance to *every* subscription beneath the MG — present and future —
   from a single assignment, versus a subscription assignment that only covers
   that one subscription and its resource groups.
4. A scoped, categorized, documented, optionally time-bound carve-out exempting
   a specific scope from a specific assignment (or specific member policies).
   It's preferable because it keeps the baseline intact for everyone else and is
   auditable ("we know, here's why, until when"), whereas loosening the policy
   removes the guardrail for all and can't even override an inherited `Deny`.
5. **Waiver** — accept the non-compliance as-is; **Mitigated** — the risk is
   handled by other means. Both make the *intent* of the exception explicit and
   auditable.
6. Good: (a) the *lowest* scope that covers exactly the resource(s) needing it,
   (b) targeting the *specific* member policy via its reference id (not the whole
   initiative), (c) a real `expiresOn` forcing re-review. Too-broad: a
   subscription- (or MG-) scoped exemption for the *whole* initiative with no
   member targeting and no expiry — it silently disables the entire baseline for
   that scope.
7. The assignment's managed identity — a DINE/Modify member *writes* resources,
   so the assignment needs `--mi-system-assigned --location <region>` and the
   identity must be granted the right role, or remediation fails silently.
8. At a scope **at or above** every scope that will assign it — for org-root
   assignment, at the org-root management group (or the tenant root). A
   definition created lower (e.g. in a subscription) isn't visible to assign at a
   higher MG scope.

</details>

## Next

Continue to
[04-repeatable-environments-deployment-stacks-and-template-specs](../04-repeatable-environments-deployment-stacks-and-template-specs/README.md)
— you can govern what exists; now provision *whole environments* repeatably with
the current Azure mechanisms (Deployment Stacks and Template Specs), and learn
why the service you might have read about — Azure Blueprints — is deprecated.
