# Pipeline Security and Secrets

## Why this matters

A CI/CD pipeline is one of the most privileged things in your whole
environment: it can build any code, push any image, and — in a push-based
setup — deploy to production. That makes it a prime target. A leaked
long-lived credential in a workflow, an over-permissive service connection,
or an unprotected `production` environment turns your delivery pipeline into
an attacker's delivery pipeline. This module pulls together the security
threads that have been previewed all track — OIDC federation (track 07 module
08), least privilege (module 01's `permissions:`), protected environments
(modules 00/01) — into a coherent posture: no long-lived secrets, minimum
privilege everywhere, and a human gate on production. It's the last standard
module before the capstone, and it's the bridge into track 11
(security-deep-dive), which adds scanning and policy gates to this exact
pipeline.

## Concepts

### OIDC federation vs. long-lived secrets (generalized)

Track 07 module 08 introduced this for Azure specifically; here's the general
principle. A **long-lived secret** (a service-principal password, a registry
token, a cloud access key) stored in GitHub is a *standing* credential: it
exists until someone rotates it, it's valid from anywhere, and if it leaks
(from a log, a compromised action, a misconfigured secret scope) an attacker
can use it indefinitely. **OIDC federation** replaces it: the cloud provider
is configured to *trust GitHub's own token issuer* for a specific
repo/branch/environment, so at run time the workflow requests a **short-lived**
token (minutes-long) that the provider verifies against the trust
relationship. Nothing durable is stored in GitHub — there's no secret to
leak and nothing to rotate, and the trust is scoped to exactly the workflow
context you configured. This is the same pattern for Azure (federated
credentials), AWS (IAM OIDC provider), and GCP (workload identity
federation) — "no long-lived secret in the CI system" is the modern default,
and everything in this module assumes it.

### Scoping the trust: subject claims are the security boundary

OIDC is only as safe as the **subject claim** the cloud trusts. The federated
credential's `subject` (from track 07 module 08:
`repo:<org>/<repo>:ref:refs/heads/main`) is what limits *which* workflow runs
can assume the identity. Get it too broad — e.g. trusting *any* branch
(`repo:<org>/<repo>:ref:refs/heads/*`) or any environment — and a PR from a
fork or a throwaway branch could obtain production credentials. Scope it
tightly: to a specific branch (`main`), or better, to a specific
**environment** (`repo:<org>/<repo>:environment:production`), so only a run
that's been through the environment's protection rules (below) can get the
production identity. The subject claim is the actual security boundary, not
an incidental string — a typo or an over-broad pattern is a real
vulnerability, not just a misconfiguration.

### Least privilege for the pipeline's identities

Two distinct privilege surfaces need minimizing:

- **The cloud identity** the workflow assumes (via OIDC). It should have the
  *narrowest* roles that let it do its job, scoped to the *narrowest*
  resources. Track 07 module 08 already made this concrete: the CI identity
  needs `AcrPush` (module 03) and a cluster role — but *not* subscription
  `Owner`. Scope roles to the specific ACR and cluster resource IDs, not the
  whole resource group or subscription. In GitOps (module 05), the pipeline
  needs even *less* — often only Git push access to the config repo, and no
  cluster credentials at all, because ArgoCD does the deploying. GitOps is a
  least-privilege win in itself.
- **The `GITHUB_TOKEN`** (module 01's `permissions:`). Default to `contents:
  read` and add only what each job needs (`id-token: write` for OIDC,
  `packages: write` to push to GHCR). An over-broad token is a blast-radius
  risk if any step runs untrusted code.

The principle mirrors track 07 module 07's Kubernetes RBAC: grant the
specific verb on the specific resource, nothing more. A "service connection"
(the pipeline's identity into the cloud) with `Contributor` on the whole
subscription is the pipeline-security equivalent of a `cluster-admin`
ServiceAccount — convenient and dangerous.

### Protecting `main` and production: required reviewers and environments

Two enforcement layers gate what reaches production:

- **Branch protection on `main`** (module 02): required status checks +
  required reviews mean code can't merge without passing tests and human
  review. This protects what enters the deployable state.
- **Protected environments** (module 01): a GitHub Environment named
  `production` with a **required reviewer** rule pauses any job targeting it
  until a designated human approves — the manual gate that turns continuous
  deployment into continuous *delivery* (module 00). Combined with an
  OIDC subject scoped to `environment:production`, this means the production
  credential is *only* obtainable by a run that a human has approved. You can
  also add a **wait timer** (a cooling-off delay) and restrict which branches
  can deploy to the environment.

Together: broken/unreviewed code can't merge, and even merged code can't reach
production without a human clicking approve and the run satisfying the
environment's scoped trust.

### Secret hygiene when you *do* need secrets

OIDC removes cloud credentials, but some secrets remain unavoidable (a
third-party API key, a database password). Handle them well:

- **Scope them to environments**, not the whole repo (module 01) — a
  `staging` secret shouldn't be readable by a `production` job or vice
  versa, and neither by an arbitrary PR run.
- **Never echo them** — GitHub masks known secret values in logs, but
  transformed secrets (base64'd, concatenated) can slip through masking.
  Don't print secrets, even "temporarily to debug."
- **Beware `pull_request_target` and untrusted PRs** — workflows triggered by
  PRs from forks must not expose secrets to attacker-controlled code. The
  default `pull_request` trigger deliberately withholds secrets from fork PRs;
  don't defeat that.
- **In GitOps, never commit raw Secrets to Git** (module 05) — base64 is
  encoding, not encryption. Use sealed-secrets, SOPS, or an external secrets
  operator (track 11/16).

### Auditing and rotation: assume something will leak

Defense in depth assumes a control will fail. Keep the pipeline auditable and
recoverable: OIDC's short-lived tokens mean a leaked token expires in minutes
(vs. a standing secret valid forever); federated-credential and role
assignments are listable (`az ad app federated-credential list`,
`az role assignment list`) so you can review what the pipeline can do;
GitHub's audit log records secret access and environment approvals; and any
long-lived secret you couldn't avoid needs a **rotation** schedule. The
question to ask of any pipeline: "if this credential leaked right now, how
long is it valid, how much can it touch, and would we know?" OIDC + least
privilege + audit makes all three answers small.

## Command reference

The Azure/GitHub commands for federated identity, scoped roles, and
environment protection (building on track 07 module 08).

| Command | What it does | Notes |
|---|---|---|
| `az ad app create --display-name <n>` | Creates the AD app to federate with GitHub OIDC | Track 07 module 08 |
| `az ad app federated-credential create --id <app> --parameters <json>` | Adds a trusted OIDC subject | The `subject` is the security boundary |
| `az ad app federated-credential list --id <app> -o table` | Lists trusted subjects | Audit what can assume the identity |
| `subject: repo:<org>/<repo>:environment:production` | Scopes trust to the `production` environment | Tighter than a branch subject |
| `subject: repo:<org>/<repo>:ref:refs/heads/main` | Scopes trust to the `main` branch | Track 07 module 08's pattern |
| `az role assignment create --assignee <app> --role AcrPush --scope <acr-id>` | Grants push on a *specific* ACR only | Least privilege: scope to the resource, not the sub |
| `az role assignment list --assignee <app> -o table` | Lists what the identity can do | Audit for over-privilege |
| `az role assignment delete --assignee <app> --role <r> --scope <s>` | Removes an over-broad grant | Tightening privilege |
| `permissions: { id-token: write, contents: read }` | Scopes the `GITHUB_TOKEN` (module 01) | Minimum for OIDC + checkout |
| `environment: production` (job key) | Targets a protected environment | Triggers required-reviewer gate |
| `gh api repos/:owner/:repo/environments/production -X PUT -f 'reviewers[...]'` | Configures environment protection via API | Or set required reviewers in the UI |
| `gh secret set NAME --env production` | Sets an environment-scoped secret | Not readable outside that environment |
| `gh api repos/:owner/:repo/branches/main/protection` | Reads branch-protection config | Confirm required checks/reviews (module 02) |
| `gh api /orgs/<org>/audit-log` | Reads the org audit log | Review secret access / approvals (org plans) |

## Hands-on exercises

Use your GitHub repo, AKS cluster, and ACR from earlier modules. Several
exercises revisit track 07 module 08's OIDC setup — that's intentional; this
module hardens and scopes it.

1. **Audit your current pipeline's privilege.** For the OIDC identity you
   created in track 07 module 08, run
   `az role assignment list --assignee <client-id> -o table` and
   `az ad app federated-credential list --id <app-id> -o table`. Write down:
   what roles does it have, at what *scope* (resource vs. resource group vs.
   subscription), and what branches/environments does it trust? Flag anything
   broader than "push to this ACR + act on this cluster from `main`."

2. **Tighten an over-broad role.** If your CI identity has `Contributor` at
   the resource-group or subscription scope (a common quick-start shortcut),
   replace it with the minimal set scoped to specific resources: `AcrPush` on
   the ACR's resource ID and the cluster-user role on the cluster's resource
   ID (track 07 module 08). Delete the broad assignment
   (`az role assignment delete`) and confirm the pipeline still deploys —
   least privilege verified by the pipeline still working with *less*.

3. **Scope the federated credential to an environment, not a branch.** Add a
   federated credential with subject
   `repo:<org>/<repo>:environment:production`. Confirm it's listed. This sets
   up exercise 5, where only an approved `production`-environment run can
   assume the identity.

4. **Minimize the `GITHUB_TOKEN`.** Audit each job's `permissions:` block.
   Set the workflow default to `contents: read` and add per-job only what's
   needed (`id-token: write` on the deploy job). Push and confirm everything
   still runs. Try removing `id-token: write` and watch OIDC login fail
   (track 07 module 08's known error) — proof the permission is load-bearing
   and that you granted the *minimum*, not less.

5. **Protect the production environment with a required reviewer.** Create a
   GitHub Environment `production` with a required reviewer (yourself or a
   teammate). Add `environment: production` to your deploy job. Push a change
   and watch the deploy job **pause for approval**; approve it and watch it
   proceed. This is the human gate that makes it continuous *delivery*
   (module 00). Combined with exercise 3's environment-scoped subject, the
   production credential is now only reachable through an approved run.

6. **Prove secrets don't leak to fork PRs.** Add a repo secret and a workflow
   step that (harmlessly) checks whether the secret is set. Open a PR from a
   fork (or simulate the `pull_request` trigger's fork behavior) and confirm
   the secret is *empty* in that run — GitHub withholds secrets from
   untrusted fork PRs by default. Note why defeating this (e.g. via
   `pull_request_target` running fork code with secrets) would be dangerous.

7. **Show the OIDC blast-radius advantage concretely.** Contrast two
   scenarios in writing: (a) a long-lived SP secret (`AZURE_CREDENTIALS`)
   leaks from a log; (b) an OIDC token leaks from a log. For each, state how
   long the credential is valid and what an attacker can do. Tie the
   difference back to why OIDC is the default (short-lived, scoped, nothing
   stored). If you still have an `AZURE_CREDENTIALS` secret from an old
   setup, delete it.

8. **Verify the GitOps least-privilege win.** For your ArgoCD setup (module
   05), confirm the *CI pipeline* holds no cluster credentials at all — only
   Git push access to the config repo. Compare against track 07 module 08's
   push pipeline, which needed a cluster role. Write two sentences on why
   moving the cluster credential from "the CI system" to "only inside the
   cluster (ArgoCD)" shrinks the attack surface.

9. **Diagnose and fix: a pipeline secret misconfigured.** You'll reproduce
   the most common secrets failure. The deploy job fails authenticating, and
   the logs show an empty/blank credential where a secret should be.
   Reproduce one of: (a) the secret is defined at the *repository* level but
   the job declares `environment: production` and the secret was set only for
   a *different* environment (so the job reads an empty value — the
   environment-scoping rule from module 01); (b) a typo in the secret *name*
   (`AZURE_CLIENT_ID` vs `AZURE_CLIENTID`) yields an empty string; or (c) the
   OIDC subject doesn't match the run's context (branch/environment), so the
   token exchange is rejected by Azure (track 07 module 08). Investigate:
   check which environment the job targets and where the secret is scoped
   (`gh secret list --env production`), check the exact secret name against
   the workflow, and check the federated-credential subject against the run's
   actual ref/environment. Fix the real cause and confirm a green,
   authenticated deploy. Write one sentence on why "the secret is right there
   in settings" doesn't mean "this job can read it."

## Independent challenge

No commands given — assemble it from track 07 module 07 (RBAC/least
privilege), track 07 module 08 (OIDC), module 01 (`permissions:`/
environments), module 02 (branch protection), and module 05 (GitOps's
credential shift). Harden an existing deploy pipeline so that no long-lived
cloud credential exists anywhere, privilege is minimal and scoped, and
production is reachable only through a reviewed, approved, tightly-scoped
path — then prove each property. Convert any stored cloud secret to OIDC
federation and delete the old secret; scope the cloud identity's roles to
specific resource IDs (not the resource group or subscription) and confirm
the pipeline still works with the reduced grant; scope the federated trust to
the `production` *environment* rather than a branch; set every job's
`GITHUB_TOKEN` permissions to the documented minimum; require passing checks
and human review to merge to `main`; and put a required reviewer on the
`production` environment so a deploy pauses for approval. Then demonstrate the
security posture end to end: show that a fork PR gets no secrets, that a run
not targeting the approved production environment cannot obtain the production
credential, and that if the deploy credential leaked it would be valid for
minutes and touch only one ACR and one cluster. Conclude by naming which
control would catch each of two threats — a leaked credential and a malicious
unreviewed commit — and note which of these track 11 will extend with image
scanning and policy gates.

<details>
<summary>Stuck? One hint</summary>

Attack it as "what could go wrong, and what control stops it," not as a
checklist of settings. For each threat, name the single control: a leaked
credential → OIDC (short-lived + scoped, so the leak is nearly worthless) plus
resource-scoped roles (small blast radius); a malicious unreviewed commit →
branch protection with required reviews (can't merge) plus a protected
`production` environment (can't deploy without approval); a fork trying to
steal secrets → the default `pull_request` trigger withholding secrets (don't
switch to `pull_request_target` with fork code). The subtle, high-value move
is scoping the OIDC *subject* to `environment:production` instead of a branch:
that ties the production credential to the environment's approval gate, so
"get production access" now requires "pass a human review" — the two controls
reinforce instead of sitting independently.

</details>

## Common mistakes & troubleshooting

- **Keeping a long-lived SP secret when OIDC is available.** A stored
  credential is valid forever from anywhere and must be rotated; OIDC tokens
  are short-lived and scoped. Delete `AZURE_CREDENTIALS`-style secrets once
  OIDC works (track 07 module 08).
- **Over-broad OIDC subject.** Trusting all branches/forks, or a wildcard
  subject, lets untrusted runs assume the identity. Scope to a specific
  branch or, better, a specific environment.
- **Roles scoped to the subscription/resource group.** `Contributor` on the
  subscription is the pipeline equivalent of `cluster-admin`. Scope roles to
  the specific ACR and cluster resource IDs.
- **Default (broad) `GITHUB_TOKEN` permissions.** Leaving write-all
  permissions is a blast-radius risk. Default to `contents: read`; add only
  what each job needs.
- **Environment-scoped secret read by the wrong job.** A secret set for
  `staging` is empty in a `production` job (and vice versa), and repository
  secrets aren't the same as environment secrets. "It's in settings" ≠ "this
  job can read it" — match the scope.
- **Echoing secrets to debug.** Transformed secrets can evade log masking.
  Never print secrets; use them directly.
- **`pull_request_target` running fork code with secrets.** This deliberately
  dangerous pattern exposes secrets to attacker-controlled code. Avoid it for
  untrusted PRs; the default `pull_request` withholds secrets for a reason.
- **Committing raw Secrets to a GitOps repo.** base64 isn't encryption
  (module 05). Use sealed-secrets/SOPS/external secrets.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why is a leaked OIDC token far less dangerous than a leaked long-lived
   service-principal secret? Address validity duration, scope, and rotation.
2. What is the OIDC "subject" claim, and why is scoping it to
   `environment:production` stronger than scoping it to a branch?
3. What two distinct privilege surfaces does pipeline least-privilege apply
   to, and give one concrete over-privilege example of each.
4. How do branch protection (module 02) and protected environments (module
   01) each gate what reaches production, and how do they differ?
5. A deploy job reads an empty value for a secret that's clearly set in repo
   settings. Give two distinct causes and how you'd confirm each.
6. Why does adopting GitOps (module 05) reduce the pipeline's privilege even
   before you harden anything?
7. Why does the default `pull_request` trigger withhold secrets from fork
   PRs, and what's the danger of `pull_request_target`?
8. For any pipeline credential, what three questions summarize its security
   posture, and how do OIDC + scoped roles + audit make all three answers
   small?

<details>
<summary>Show answers</summary>

1. An OIDC token is short-lived (minutes), so a leak expires almost
   immediately; it's scoped to a specific repo/branch/environment, so it
   can't be used from elsewhere; and there's nothing stored to rotate. A
   long-lived SP secret is valid until manually rotated, usable from
   anywhere, and a standing thing that must be tracked and rotated — a leak is
   exploitable indefinitely.
2. The subject is the claim the cloud trusts to decide which workflow runs may
   assume the identity. Scoping to `environment:production` (vs. a branch)
   ties the credential to the environment's protection rules — so only a run
   that passed the required-reviewer approval can obtain the production
   credential, whereas a branch subject grants it to any run on that branch
   with no approval step.
3. (a) The cloud identity the workflow assumes — over-privilege example:
   `Contributor` on the whole subscription instead of `AcrPush` on one ACR +
   a cluster role. (b) The `GITHUB_TOKEN` — over-privilege example: default
   write-all permissions instead of `contents: read` + only what's needed.
4. Branch protection gates what can *merge* into `main` (required checks +
   reviews) — protecting the deployable state. Protected environments gate
   what can *deploy* (required reviewer pauses the deploy job for approval) —
   protecting the act of releasing. One guards entry to `main`; the other
   guards the release from `main` to production.
5. (a) The secret is scoped to a different environment (or is a repo secret
   while the job targets an environment) — confirm with `gh secret list --env
   <name>` and check the job's `environment:`. (b) A typo in the secret name
   yields an empty string — confirm by diffing the exact name in settings
   against the workflow reference. (Also: OIDC subject mismatch rejects the
   token — confirm the federated-credential subject against the run's ref/env.)
6. In GitOps the deploy is done by ArgoCD *inside* the cluster, so the CI
   pipeline no longer needs cluster credentials at all — often only Git push
   access to the config repo. The most dangerous credential (cluster access)
   moves out of the externally-reachable CI system entirely.
7. Fork PRs contain untrusted, attacker-controllable code; running it with
   access to secrets would let an attacker exfiltrate them. `pull_request`
   withholds secrets from fork runs to prevent this. `pull_request_target`
   runs in the context of the base repo *with* secrets — combining it with
   checking out and running fork code is a known secret-exfiltration hole.
8. "If this credential leaked: how long is it valid, how much can it touch,
   and would we know?" OIDC makes validity short (minutes); scoped, resource-
   level roles make the blast radius small (one ACR/one cluster); and audit
   logs + listable role/credential assignments mean you'd know and could
   review — so all three answers are minimized.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — put the entire
track together: PR-gated tests, a SHA-tagged image built and pushed to ACR on
merge, and ArgoCD syncing a Git-committed manifest to AKS with a progressive
rollout.

