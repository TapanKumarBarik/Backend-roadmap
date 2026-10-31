# Capstone Project

## Why this matters

This is the last module of the track, and it has no new concepts, no quiz, and
no independent challenge — it is the integration test. Every earlier module gave
you one mechanism in isolation and one diagnose-and-fix; here you wire them into
a single, real, secretless system and — critically — produce the **written audit
trail** that a platform engineer is actually judged on. The point is not that
each piece works, but that you can stand in front of the whole chain and answer,
for every identity and every permission, *what it is, how it authenticates, what
it is authorized to do, and why that grant is the least one that works.* If you
can build this and defend the audit trail, you have mastered identity as a
discipline rather than as a set of copied commands.

## The project

Build an end-to-end pipeline in which **no long-lived secret is stored
anywhere**, and every permission is least-privilege and documented. The shape is
the module-06 chain, made real:

1. **A GitHub Actions pipeline authenticates to Azure via workload identity
   federation** — no stored client secret. The workflow uses `id-token: write`
   and `azure/login` with only `client-id`/`tenant-id`/`subscription-id`
   (module 03, building on
   [10-cicd-and-gitops/07](../../10-cicd-and-gitops/07-pipeline-security-and-secrets/README.md)).
2. **A Terraform apply runs *through that pipeline* and creates a user-assigned
   managed identity** (and the supporting resources), using the `azurerm`
   provider you know from
   [09-terraform-on-azure](../../09-terraform-on-azure/README.md) — the pipeline
   authenticates as *one* federated identity to provision *another* identity for
   the workload (modules 02 and 06).
3. **An AKS workload uses that user-assigned identity via workload identity
   federation to read a Key Vault secret** — a ServiceAccount annotated with the
   identity's `clientId`, a federated credential whose subject is the SA, a pod
   labeled `azure.workload.identity/use: "true"`, reading a secret from Key Vault
   (module 03's AKS variant + module 02, going beyond the cluster-wide CSI
   identity of [07-aks/07](../../07-aks/07-security-aks-aad-rbac-and-keyvault/README.md)).
4. **Least-privilege role assignments scoped correctly at each step** — the
   pipeline identity gets only what it needs to run Terraform in one resource
   group; the workload identity gets only `Key Vault Secrets User` on the one
   vault (module 04). Nothing at subscription scope, nothing broader than the job
   requires.
5. **A written audit trail** documenting *every* identity created and *every*
   permission granted, with the justification for each — the deliverable that
   proves you designed this rather than stumbled into it.

Treat this as a project, not a checklist of isolated steps — each piece depends
on the ones before it, in roughly the order you would build it for real. Build it
incrementally: get the federated pipeline logging in first, then Terraform
creating the identity, then the AKS workload, then tighten every scope, then
write the trail.

### Acceptance checklist

Work through these in order; each depends on the previous ones actually working,
not merely existing.

- [ ] A GitHub Actions workflow authenticates to Azure with **no `client-secret`
      anywhere** — only `client-id`/`tenant-id`/`subscription-id` and
      `permissions: id-token: write`. You have proven it by watching an
      `azure/login` step succeed on a push to `main`, and you can point to the
      federated credential whose **subject** matches the run context.
- [ ] `terraform apply` runs **inside that pipeline** (not from your laptop) and
      creates a **user-assigned managed identity** plus the supporting resources
      (resource group, Key Vault, and — if you provision it via Terraform — the
      AKS cluster). The pipeline's own identity has only the role/scope needed to
      do this, and you can show the assignment.
- [ ] A Key Vault exists with at least one secret, on the RBAC-authorization model
      (`--enable-rbac-authorization true` or the Terraform equivalent).
- [ ] The AKS cluster has the **OIDC issuer and workload identity** enabled, and a
      **federated credential** on the user-assigned identity whose subject is
      `system:serviceaccount:<ns>:<sa>` and whose issuer is the cluster's actual
      OIDC issuer URL.
- [ ] A **ServiceAccount** annotated with the identity's `clientId` exists, and a
      pod using it (labeled `azure.workload.identity/use: "true"`) **reads the Key
      Vault secret at runtime** — you have proven it (e.g. the pod logs/exec show
      the secret value), and there is **no Kubernetes Secret and no stored
      credential** involved in getting it there.
- [ ] Every role assignment is **least-privilege and correctly scoped**: the
      workload identity has `Key Vault Secrets User` on **the one vault** (not the
      resource group, not the subscription); the pipeline identity has the
      narrowest role that lets Terraform run in **one resource group**. You can
      show, via `az role assignment list --scope <resource>`, that no principal has
      broader access than its job requires.
- [ ] A **written audit trail** exists (a Markdown file, a table — your choice)
      listing **every identity** (name, type, why it exists) and **every role
      assignment** (principal → role → scope → the one-line justification for why
      it is the least grant that works). Anyone reading it can answer "who can read
      this secret, and why" without inspecting Azure.
- [ ] You can **trace a failure to the right hop**: deliberately break one thing
      (a subject-claim mismatch, a role at the wrong scope, or a revoked grant),
      classify it as authn vs. authz vs. propagation using module 07's method,
      capture the signature, and fix it — and your audit trail/notes reflect the
      incident.
- [ ] You can **explain every piece**: for each identity and grant, what
      authenticates it, what authorizes it, and what Azure manages versus what you
      configured. If you cannot explain a piece, that is the signal to go back and
      understand it rather than leaving a copied command in place.

### Hints

- **Build the chain one hop at a time.** Get the federated pipeline doing a
  trivial `az group show` first (module 03's exercise 4). Only once login works
  with no secret should you add Terraform; only once Terraform creates the
  identity should you add the AKS workload. Debugging federation and Terraform and
  workload identity simultaneously is how you lose an evening.
- **Two identities, two federation subjects.** The pipeline identity federates a
  **GitHub** subject (`repo:...:ref:refs/heads/main`); the workload identity
  federates a **Kubernetes** subject (`system:serviceaccount:<ns>:<sa>`). You can
  even use one identity with both federated credentials (module 06) — but keeping
  them separate makes the least-privilege story cleaner and the audit trail
  clearer.
- **Watch the Graph-lookup race.** When Terraform (or the pipeline) creates an
  identity and grants it a role in the same run, use the object-id form of the
  assignment (`--assignee-object-id ... --assignee-principal-type
  ServicePrincipal`, or the Terraform `azurerm_role_assignment` with
  `principal_id` + `principal_type`) to avoid "principal does not exist" (module
  06).
- **Scope every grant from the action, not the role.** For each identity, write
  down the exact operation it must perform, then pick the narrowest role and
  narrowest scope (module 04). If you catch yourself typing `Contributor` at
  subscription scope, stop — that is the antipattern this whole track was about.
- **If the pod authenticates but gets `Forbidden`,** it is authz at the Key Vault
  hop — check `az role assignment list --assignee <workload-principalId> --scope
  <vaultId>` (module 06/07). If `azure/login` fails with "no matching federated
  identity," it is authn — compare the presented subject to the configured one
  (module 03/07). Never apply one class's fix to the other's failure.
- **Write the audit trail as you go, not at the end.** Every time you create an
  identity or a role assignment, add its row immediately with the justification.
  A trail written after the fact is guesswork; one written live is a record. This
  is also the artifact that makes final cleanup a checklist rather than
  archaeology.
- **Reuse patterns you already validated** in modules 02-06 rather than inventing
  new configuration — the capstone is integration, not new discovery.

### Final cleanup

- [ ] Delete the resource group(s) you created:
      `az group delete --name <rg> --yes --no-wait`. Remember AKS bills for node
      VMs until it is gone (the track-07 cost warning still applies).
- [ ] Remove the GitHub Actions workflow and the repo variables/secrets (the three
      federated identifiers) if you are done, and delete the federated credentials
      on any identity you keep
      (`az identity federated-credential list` / `delete`).
- [ ] Confirm no orphaned role assignments remain
      (`az role assignment list --all -o table` filtered to your principals) and
      no soft-deleted Key Vault lingers (`az keyvault list-deleted -o table`;
      purge if you want the name back).
- [ ] Keep the **audit trail file** — it is the one artifact worth saving, and it
      is the template you will reuse for real systems.

## Before you move on

Once it is all torn down, do not consider this finished yet. Wait a few days,
then — with no notes, no earlier modules open, and none of the commands in front
of you — rebuild the core of it from memory: a federated GitHub Actions login
with no secret, Terraform through that pipeline creating a user-assigned
identity, and an AKS pod using that identity via workload identity federation to
read a Key Vault secret, every grant least-privilege. Rebuilding it cold, and
noticing exactly where you stall — was it the federation subject format? the
`principalId`-vs-`clientId` choice? the scope of a role? — is the truest
retention check there is, because those stall points are precisely the things you
had only *recognized* before, not yet *recalled*. Tear it down again afterward,
and — most importantly — be able to walk someone else through your audit trail
and defend every single grant. That defense is what "mastered identity" actually
means.

This track deliberately built identity as its own discipline because it is the
foundation the next one stands on: **[17-governance-at-scale](../../17-governance-at-scale/README.md)**
takes the management-group scope you met in module 04, the least-privilege
role-design habit you built throughout, and the audit-trail discipline you just
practiced, and scales them across *many* subscriptions with Azure Policy,
management groups, and landing zones. You now know how a *single* identity is
authenticated, authorized, and audited; governance-at-scale is how you enforce
that correctly across an entire organization without doing it by hand one role
assignment at a time.

## Next

[Back to the track index](../README.md) · then continue to
[17-governance-at-scale](../../17-governance-at-scale/README.md) when it is
available.
