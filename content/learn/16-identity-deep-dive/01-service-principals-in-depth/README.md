# Service Principals in Depth

## Why this matters

A **service principal** is how a non-human thing — a script, a Terraform run,
a CI job, an app on a server outside Azure — proves it is allowed to call
Azure. It is the oldest and most portable machine-identity mechanism, and it
is the one you reach for when managed identity (module 02) and workload
identity federation (module 03) are not available. It is also the one with a
sharp edge: authenticating a service principal with a **client secret** means
storing a long-lived credential somewhere, and that stored secret is the exact
thing tracks 10 and 11 spent effort getting *out* of your pipelines. This
module makes you fluent in service principals *and* clear-eyed about why you
should avoid the secret-based version wherever you can.

## Concepts

### What `create-for-rbac` actually does

You may have run `az ad sp create-for-rbac` before without seeing the moving
parts. It does **three** things in one command: it creates an **app
registration**, creates the matching **service principal** (the two linked
objects from module 00), and — because of the `for-rbac` part — creates a
**role assignment** granting that principal a role at a scope. The output hands
you an `appId` (the client ID), a `password` (the client secret), and the
`tenant` — the three values a client needs to log in as that principal:

```
{
  "appId": "00000000-0000-0000-0000-000000000000",
  "displayName": "sp-terraform-learn",
  "password": "the-only-time-you-ever-see-this",
  "tenant": "11111111-1111-1111-1111-111111111111"
}
```

That `password` is shown **exactly once** and is never retrievable again. Lose
it and you must reset it. This one-time-view is your first hint that a secret
is an awkward thing to manage.

### Client secret vs. certificate authentication

A service principal can authenticate two ways:

- **Client secret** — a shared string (effectively a password) the client
  presents. Simple, but it is a **bearer credential**: anyone who reads it
  *is* the principal, it is easy to accidentally commit to Git or log, and it
  is long-lived unless you actively rotate it. This is the `password` from
  `create-for-rbac`.
- **Certificate** — the client holds a **private key** and proves possession
  of it without ever sending it over the wire; Entra ID stores only the
  **public** key. This is strictly stronger: the secret material never
  transits, it is harder to exfiltrate from a keystore than a string is from
  an env var, and it maps naturally onto hardware-backed key storage. The
  trade-off is operational complexity (you manage a cert and its expiry).

Neither removes the fundamental problem: **the credential still lives
somewhere you have to protect.** That is the motivation for module 02 and 03.

### Why long-lived secrets are a liability

This connects directly back to
[10-cicd-and-gitops/07-pipeline-security-and-secrets](../../10-cicd-and-gitops/07-pipeline-security-and-secrets/README.md),
which pushed you toward OIDC federation instead of a stored service principal
secret. The reasons, stated plainly:

- **It can leak.** A string in a CI variable, an env file, a Terraform state,
  or a log line is a string that can be copied. A leaked secret is a valid
  credential until someone notices and rotates it.
- **It rarely rotates.** In theory secrets have an expiry; in practice they get
  set to a year or two and forgotten, so a leak in month one is exploitable for
  the whole window.
- **It is a standing target.** A long-lived secret is exactly the kind of
  credential the threat models in [11-security-deep-dive](../../11-security-deep-dive/README.md)
  flag: it grants access continuously, whether or not any legitimate workload
  is running right now.

The modern hierarchy, worst to best: **stored client secret → certificate →
managed identity (no credential you hold at all) → workload identity federation
(no stored credential, short-lived tokens minted per-run)**. This module owns
the first two; modules 02 and 03 own the last two.

### Secret expiry, rotation, and reset

Because a secret is a liability, treat its **expiry** as a feature, not a
nuisance. `create-for-rbac` lets you set `--years` (or you can add a credential
with an explicit end date). When a secret expires, the principal's logins start
failing with an **authentication** error (invalid client secret) — importantly
*not* a `403` authorization error. Recognizing "auth suddenly broke on a
schedule" as "the secret expired" is a real diagnosis skill (revisited in
module 07). You **rotate** by adding a new credential, cutting clients over,
then removing the old one — never by deleting the principal.

### Service principal vs. managed identity, previewed

Hold this comparison; module 02 develops it. A **service principal with a
secret** is a credential *you* create, hold, and must protect. A **managed
identity** is also a service principal under the hood — but Azure creates and
rotates its credential for you and never exposes it, so there is nothing for
you to store or leak. The rule of thumb you are building toward: **if the
workload runs inside Azure, prefer a managed identity; if it runs outside Azure
(like GitHub Actions), prefer workload identity federation; reach for a
secret-based service principal only when neither is possible.**

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az ad sp create-for-rbac` | Creates an app registration + service principal + role assignment, returns credentials | `az ad sp create-for-rbac --name sp-learn --role Reader --scopes /subscriptions/<sub-id>/resourceGroups/rg-id-learn` |
| `az ad app create` | Creates only the app registration (no SP, no role) | `az ad app create --display-name sp-learn-app` |
| `az ad sp create` | Creates the service principal for an existing app registration | `az ad sp create --id <app-id>` |
| `az ad sp credential reset` | Resets/rotates a service principal's client secret | `az ad sp credential reset --id <app-id> --years 1` |
| `az ad app credential reset` | Adds/rotates credentials on the app registration | `az ad app credential reset --id <app-id> --years 1` |
| `az ad sp show` | Shows a service principal's details | `az ad sp show --id <app-id> --query "{name:displayName, spId:id}" -o jsonc` |
| `az login --service-principal` | Logs in *as* a service principal (secret or cert) | `az login --service-principal -u <app-id> -p <secret> --tenant <tenant-id>` |
| `az ad sp delete` | Deletes the service principal (and app, if using the app id) | `az ad sp delete --id <app-id>` |

Flag-by-flag breakdowns:

`az ad sp create-for-rbac --name sp-terraform-learn --role Contributor --scopes /subscriptions/<sub-id>/resourceGroups/rg-id-learn --years 1`
- `--name` — display name for the app registration/SP (a `http://`-prefixed name is auto-generated if omitted; prefer an explicit, greppable name).
- `--role` — the RBAC role to grant the new principal. **Do not default to `Contributor` at subscription scope** — that is the over-privileging module 04 and track 11 warn against.
- `--scopes` — one or more resource IDs the role is granted on. Scope to a **resource group or single resource**, not the whole subscription, unless you truly need it. Space-separated for multiple scopes.
- `--years` — secret lifetime. A shorter lifetime is safer but means more frequent rotation; this flag existing at all is the tell that the secret is a managed liability.

`az login --service-principal -u <app-id> -p <secret-or-cert-path> --tenant <tenant-id>`
- `--service-principal` — log in as an SP, not interactively as a human.
- `-u` — the **app (client) ID** of the principal.
- `-p` — the client **secret**, *or* a path to a `.pem` certificate file (with `--password` pointing at the cert for cert auth in some CLI versions). Passing a secret on the command line leaks it into shell history — prefer an env var.
- `--tenant` — the tenant the principal lives in.

`az ad sp credential reset --id <app-id> --years 1`
- `--id` — the app (client) ID (or the app registration's object ID).
- `--years` — validity of the **new** secret it generates and returns. This is your rotation command; the old secret keeps working until it expires or you remove it, enabling a zero-downtime cutover.

## Hands-on exercises

1. **Create a resource group to scope against.** Run
   `az group create --name rg-id-learn --location eastus`. You will scope this
   module's service principal to *this group only*, practicing least privilege
   from the first command.

2. **Create a scoped service principal.** Run
   ```powershell
   $subId = az account show --query id -o tsv
   az ad sp create-for-rbac --name sp-id-learn --role Reader `
     --scopes /subscriptions/$subId/resourceGroups/rg-id-learn --years 1
   ```
   **Copy the `appId`, `password`, and `tenant` from the output now** — the
   password is shown only once. Verify: `az ad sp show --id <appId> --query
   displayName -o tsv` returns `sp-id-learn`.

3. **Log in as the service principal.** In a *separate* shell (so you do not
   disturb your main login), run
   `az login --service-principal -u <appId> -p <password> --tenant <tenant>`.
   Verify: `az account show --query user -o jsonc` shows a `type` of
   `servicePrincipal` and the `name` is the `appId` — you are now *acting as*
   the machine identity, not yourself.

4. **Confirm its permissions are exactly what you granted.** Still logged in as
   the SP, run `az group show --name rg-id-learn` (should succeed — it has
   Reader there) and then `az group create --name rg-id-should-fail --location eastus`
   (should be **denied** — Reader cannot create, and it has no rights outside
   `rg-id-learn` anyway). Verify: the second command returns a `403`
   authorization error. This is least privilege working. Log back in as
   yourself (`az login`) afterward.

5. **Inspect and reset (rotate) the secret.** As yourself, run
   `az ad sp credential reset --id <appId> --years 1`. Verify: a **new**
   `password` is returned, different from the first. Conceptually, the old
   secret is still valid until expiry unless removed — this is how you rotate
   without downtime.

6. **Prove the SP has no retrievable secret after the fact.** Try to read the
   secret back — there is no `az ad sp` command that returns an existing
   secret's value, only `reset` which makes a new one. Verify: confirm for
   yourself that Entra ID stores secrets one-way; the only recovery from a lost
   secret is a reset. Write down why that makes a stored secret operationally
   fragile.

7. **Diagnose-and-fix: expired/invalid secret (authn failure).** Simulate a
   bad secret: run `az login --service-principal -u <appId> -p "definitely-wrong-secret" --tenant <tenant>`.
   Observe the error. **Diagnose:** this is an **authentication** failure
   (invalid client secret / `AADSTS7000215`-style), *not* a `403` — the
   principal never got a token, so authorization never even ran. Contrast this
   with exercise 4's `403`, which happened *after* a successful login. **Fix:**
   log in with the correct current secret (from your exercise 5 reset). The
   lesson — *wrong/expired secret = authn error before any permission check;
   missing role = authz `403` after login* — is the core diagnostic split you
   will use in module 07.

8. **Diagnose-and-fix: over-scoped by accident.** Create a throwaway SP with a
   deliberately too-broad grant:
   `az ad sp create-for-rbac --name sp-toobroad --role Contributor --scopes /subscriptions/$subId`.
   **Diagnose:** run `az role assignment list --assignee <its-appId> --all -o table`
   and observe the role is `Contributor` at **subscription** scope — this SP
   can now modify *everything* in the subscription, exactly the over-privilege
   antipattern from track 11. **Fix:** delete the subscription-scoped assignment
   (`az role assignment delete --assignee <appId> --role Contributor --scope /subscriptions/$subId`)
   and, if the SP still needs access, re-create it at resource-group scope only.
   Then delete the throwaway SP entirely (`az ad sp delete --id <appId>`).

9. **Clean up.** Delete the learning SP
   (`az ad sp delete --id <sp-id-learn-appId>`) and the resource group
   (`az group delete --name rg-id-learn --yes --no-wait`). Verify: `az ad sp
   list --show-mine -o table` no longer lists `sp-id-learn`. (Deleting the SP
   also cleans up its role assignments; leftover assignments to a deleted
   principal show up as an orphaned GUID — module 04 covers cleaning those.)

## Independent challenge

Using only what you know, provision a service principal that a *hypothetical
external build server* (something outside Azure that cannot use managed
identity) would use to deploy into a single resource group — and then make the
case, in writing, for why you would **not** actually ship this design to
production. Grant it the *least* role that would let it deploy the kinds of
resources you built in [09-terraform-on-azure](../../09-terraform-on-azure/README.md),
scoped to exactly one resource group, with a short secret lifetime. Then write
a short "why this is the wrong long-term answer" note that references the
stored-secret risks from
[10-cicd-and-gitops/07](../../10-cicd-and-gitops/07-pipeline-security-and-secrets/README.md)
and names what you would replace it with once the workload could run either
inside Azure (module 02's mechanism) or in GitHub Actions (module 03's
mechanism). The deliverable is the SP *plus* the argument against it — proving
you can both wield the tool and know when not to.

<details>
<summary>Stuck? One hint</summary>

The role that lets a pipeline "deploy resources" in a resource group is
usually `Contributor` **scoped to that one resource group** — not at
subscription scope. Build the `--scopes` value as
`/subscriptions/<sub-id>/resourceGroups/<rg>` and confirm with `az role
assignment list --assignee <appId> --all -o table` that nothing broader was
granted. For the write-up, the single sentence that matters is: *the `password`
this command prints is a long-lived bearer credential you now have to store and
protect, which is the exact thing OIDC federation (module 03) removes.*

</details>

## Common mistakes & troubleshooting

- **Not copying the password on creation.** `create-for-rbac` shows the secret
  once. If you miss it, you cannot retrieve it — you must `credential reset`,
  which invalidates plans that captured the old one.
- **Defaulting to `--role Contributor --scopes /subscriptions/<id>`.** The
  convenient default is dangerously broad. Scope to a resource group or single
  resource and pick the narrowest role that works.
- **Confusing an authn failure with an authz failure.** A wrong/expired secret
  fails at *login* (no token issued). A missing role fails *after* login with a
  `403`. The remedies are completely different (rotate the secret vs. add a role
  assignment) — never treat one as the other.
- **Leaking the secret into shell history or Git.** Passing `-p <secret>` on
  the command line records it in history; committing it to a repo publishes it.
  Use environment variables and never commit credentials — the same discipline
  track 10 built for pipeline secrets.
- **Deleting the SP to "rotate" it.** Deleting and recreating changes the
  `appId`, breaking every role assignment and every client that referenced it.
  Rotate with `credential reset`, which keeps the principal and its
  assignments intact.
- **Forgetting that a managed identity would avoid all of this.** If the
  workload runs in Azure, you probably should not be creating a secret-based SP
  at all — that is the whole pivot into module 02.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. `az ad sp create-for-rbac` does three distinct things in one command. Name
   them.
2. Which three values from its output does a client need to authenticate as the
   service principal, and which of the three can you never retrieve again?
3. Give two concrete reasons a client **certificate** is stronger than a client
   **secret** for an SP.
4. A service principal that worked yesterday suddenly fails to log in today,
   with no changes to its role assignments. What is the most likely cause, and
   is it an authn or authz failure?
5. Rank these four machine-auth options from least to most secure: managed
   identity, stored client secret, workload identity federation, certificate.
6. Why is deleting-and-recreating a service principal the *wrong* way to rotate
   its secret?
7. You want an SP that can deploy into `rg-app` but nothing else. What `--role`
   and `--scopes` shape do you use, and why not subscription scope?

<details>
<summary>Show answers</summary>

1. It creates an **app registration**, creates the matching **service
   principal**, and creates a **role assignment** granting that principal a
   role at the scope you specify.
2. The **`appId`** (client ID), the **`password`** (client secret), and the
   **`tenant`** ID. The **`password`** can never be retrieved again — it is
   shown once at creation.
3. (any two) The private key never transits the network (only the public key is
   stored in Entra ID); it is harder to exfiltrate from a keystore than a string
   from an env var; it maps onto hardware-backed key storage; possession is
   proven cryptographically rather than by presenting a copyable bearer string.
4. The **secret expired** (or was reset elsewhere). It is an **authentication**
   failure — the SP cannot get a token at all, which is different from a `403`
   that would happen after a successful login.
5. Least to most secure: **stored client secret → certificate → managed
   identity → workload identity federation.**
6. Deleting recreates the principal with a **new `appId`**, which breaks every
   role assignment and every client that referenced the old one. `credential
   reset` rotates the secret while keeping the principal and its assignments.
7. `--role Contributor` (or narrower) with `--scopes
   /subscriptions/<sub-id>/resourceGroups/rg-app`. Not subscription scope
   because that would let the SP modify every resource in the subscription — a
   blast radius far larger than the job requires (least privilege).

</details>

## Next

[02-managed-identity-in-depth](../02-managed-identity-in-depth/README.md) —
the first real fix for the stored-secret problem: an identity Azure creates and
rotates for you, with no credential you ever hold, generalized well beyond the
basic usage you saw on Container Apps and AKS.
