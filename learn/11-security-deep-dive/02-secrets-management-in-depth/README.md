# Secrets Management in Depth

## Why this matters

Three earlier modules touched secrets and each stopped at "the basics": 02/09
said inject at runtime, never bake into a layer; 03/11 noted a Kubernetes
`Secret` is only base64-encoded; 07/07 wired up the Key Vault CSI driver to
mount a secret into a Pod at start-time. All true, all shallow. Real systems
have to answer harder questions: what happens when a secret must *rotate*?
Where does the source of truth live, and who can read it? And — the one that
causes the most real breaches — why is a long-lived secret sitting in your CI
system a serious liability, and what replaces it? This module is the depth
those three modules deferred.

## Concepts

### The secret lifecycle: it's not "set and forget"

02/09 treated a secret as a static value you inject. In production a secret
has a *lifecycle*: it's created, distributed to workloads, used, **rotated**
(replaced with a new value on a schedule or after suspected exposure), and
eventually revoked. Most secrets-management maturity is about the rotation and
revocation stages, which the earlier modules never touched. A secret you can't
rotate quickly is a secret that, once leaked, stays dangerous until you can
redeploy everything that uses it — which during an incident (module 07) is
exactly when you can least afford slowness.

### Why a Kubernetes `Secret` alone is not a secrets-management solution

Recall 03/11 and 07/07: a Kubernetes `Secret` is base64-encoded (not
encrypted — base64 is trivially reversible), stored in etcd, and readable by
anyone with `get secrets` RBAC in that namespace. It has no rotation, no audit
of *who read it*, and no lifecycle of its own. It's a *delivery mechanism*,
not a *management* system. That's precisely why 07/07 introduced pulling from
Key Vault instead — but 07/07 stopped at the initial mount. The real value of
an external secret store is everything *after* the mount: rotation, access
policies, and an audit trail.

### The Secrets Store CSI Driver, revisited for rotation

07/07 mounted a Key Vault secret into a Pod via the Azure Key Vault provider
for the Secrets Store CSI Driver, and its "Common mistakes" even warned that
mounted secrets are *not* fire-and-forget. Here's the depth:

- By default the driver mounts secret values **at pod start** and does not
  update them if the Key Vault value changes afterward.
- Enabling **secret auto-rotation** (a driver-level setting with a poll
  interval) makes the driver periodically re-read Key Vault and update the
  mounted files in place — so a rotated secret propagates to running Pods
  without a restart *for file mounts*.
- The important caveat: an app that read the secret file *once at startup* and
  cached it in memory won't see the new value even after the file updates —
  rotation only helps if the app re-reads the file (or you restart it). This
  is the gap between "the platform rotated the secret" and "the application is
  using the new secret," and it trips up teams constantly.
- If you *sync* the CSI-mounted secret into a Kubernetes `Secret` (an option
  in the `SecretProviderClass`) and consume it as an env var, env vars are set
  once at container start and **never** update live — so that path always
  needs a restart to pick up rotation.

### Key Vault vs. HashiCorp Vault, conceptually

Azure Key Vault isn't the only secrets store; **HashiCorp Vault** is the
common cloud-agnostic alternative, and knowing the difference sharpens your
understanding of both:

- **Azure Key Vault** — a managed Azure service. Tightly integrated with Azure
  identity (managed identity, workload identity from 07/07), access via Azure
  RBAC or access policies, audit into Azure Monitor. Great when you're all-in
  on Azure; less portable across clouds.
- **HashiCorp Vault** — you run it (or use HCP Vault), cloud-agnostic, with a
  richer feature set: **dynamic secrets** (it generates short-lived, on-demand
  credentials for a database and revokes them automatically — so no
  long-lived DB password exists at all), pluggable auth backends, and
  fine-grained leasing. More powerful and portable, but *you* operate it
  (patching, availability, unsealing) — a shared-responsibility shift back
  toward you (module 00).

The dynamic-secrets idea is the conceptual leap: the most secure secret is one
that's *short-lived and auto-revoked*, so a leaked value is useless within
minutes. Hold that idea — it's exactly what the next concept applies to CI.

### Long-lived secrets in CI are a liability — and OIDC is the fix

This is the single most important idea in the module. A CI pipeline (track 10)
that authenticates to Azure with a **long-lived service-principal secret or
client secret** stored in the CI system is a standing liability:

- It's a **high-value, long-lived credential** sitting in a system (GitHub,
  Azure DevOps) that many people and workflows can touch — a fat target
  (module 00: the CI→subscription trust boundary).
- If it leaks (a logged env var, a compromised action, a malicious PR), it's
  valid until *someone notices and manually rotates it* — which may be never.
- It grants standing access even when no pipeline is running.

Track 10 already showed the fix: **OIDC / workload identity federation**.
Instead of storing a secret, the CI provider proves its identity to Azure with
a short-lived, cryptographically-verified token minted *per run*, and Azure
federates trust to that CI identity — **no secret is stored anywhere**. This
is the dynamic-secrets principle applied to CI: the credential is short-lived,
scoped to the run, and impossible to leak because it never sits at rest. If
you take one operational habit from this track, make it *"no long-lived cloud
credentials in CI — federate instead."*

### Detecting and responding to a leaked secret

Assume-breach (module 00): secrets *will* occasionally leak — into a log, a
commit, an error message. Two disciplines matter. **Prevention/detection:**
secret-scanning (git-hooks, GitHub secret scanning, `trivy fs` from module 01
catching secrets in source) catches many before they spread. **Response:** the
*only* safe assumption once a secret is exposed is that it's compromised — so
you **rotate immediately** (generate a new value, update the store, roll the
workloads), then revoke the old one, then investigate blast radius. You do not
"delete the log and hope." Module 07 turns this into a full runbook; here you
practice the rotation reflex.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az keyvault secret set` | Creates/updates a secret value (a new version) in Key Vault | `az keyvault secret set --vault-name kv-sec --name db-pass --value 's3cr3t'` |
| `az keyvault secret show --query value` | Reads a secret's current value (audited by Key Vault) | `az keyvault secret show --vault-name kv-sec --name db-pass --query value -o tsv` |
| `az keyvault secret list-versions` | Lists all versions of a secret — the rotation history | `az keyvault secret list-versions --vault-name kv-sec --name db-pass -o table` |
| `az keyvault secret set-attributes --enabled false` | Disables (effectively revokes) a secret version without deleting it | `az keyvault secret set-attributes --vault-name kv-sec --name db-pass --version <v> --enabled false` |
| `az keyvault set-policy --secret-permissions get list` | Grants an identity read access to secrets (from 07/07) | `az keyvault set-policy --name kv-sec --object-id <id> --secret-permissions get list` |
| CSI `SecretProviderClass` + `spec.parameters` | Declares which vault/secrets to mount and (with the add-on rotation setting) how often to poll | see exercise 5 |
| `az aks addon update --enable-secret-rotation --rotation-poll-interval` | Turns on CSI driver auto-rotation and its poll interval | `az aks addon update -g rg -n aks -a azure-keyvault-secrets-provider --enable-secret-rotation --rotation-poll-interval 2m` |
| `trivy fs --scanners secret <path>` | Scans a source tree for accidentally-committed secrets | `trivy fs --scanners secret .` |
| `az ad app federated-credential create` | Creates an OIDC federated credential (no stored secret) for CI, from track 10 | see exercise 8 |

Flag breakdown for `az aks addon update -g rg -n aks -a azure-keyvault-secrets-provider --enable-secret-rotation --rotation-poll-interval 2m`:

- `addon update ... -a azure-keyvault-secrets-provider` — targets the Key
  Vault CSI add-on you enabled in 07/07.
- `--enable-secret-rotation` — turns on the driver's background rotation loop;
  without it, mounted secrets are read once at pod start and never refreshed.
- `--rotation-poll-interval 2m` — how often the driver re-reads Key Vault and
  updates mounted files. Shorter = fresher secrets, more API calls; `2m` is a
  reasonable lab value.

Flag breakdown for `az keyvault secret set-attributes --vault-name kv-sec --name db-pass --version <v> --enabled false`:

- `set-attributes` — modifies metadata of an existing secret version rather
  than creating a new value.
- `--version <v>` — targets one specific version (from `list-versions`);
  omitting it targets the current version.
- `--enabled false` — marks that version disabled, so reads of it fail — an
  immediate *revocation* of a leaked value without destroying the audit
  history of it having existed.

## Hands-on exercises

Exercises 1-2 and 7 run locally. The Key Vault/CSI/OIDC exercises use real
Azure — they reuse the `rg-aks-learn`/`aks-learn`/Key Vault resources from
07/07. Costs are small; clean up per the last exercise.

1. **(WSL2) Prove a Kubernetes Secret is not encrypted.** On your kind
   cluster:
   ```bash
   kubectl create secret generic demo-secret --from-literal=password=hunter2
   kubectl get secret demo-secret -o jsonpath='{.data.password}' | base64 -d; echo
   ```
   Expect `hunter2` — recovered from the "secret" with a one-line base64
   decode by anyone with `get secrets`. This is *why* the rest of the module
   exists. Clean up: `kubectl delete secret demo-secret`.

2. **(WSL2) Scan a source tree for a leaked secret.** Create a file that looks
   like a real leak and catch it:
   ```bash
   mkdir -p ~/sec-lab && cd ~/sec-lab
   echo 'AZURE_CLIENT_SECRET=abc123-do-not-commit-this-value' > config.env
   trivy fs --scanners secret .
   ```
   Expect Trivy to flag the file and the secret pattern — the detection half
   of the leak discipline. Clean up: `rm config.env`.

3. **(Azure) Create a secret and inspect its version history.**
   ```bash
   az keyvault secret set --vault-name kv-aks-learn --name db-pass --value 'v1-original'
   az keyvault secret set --vault-name kv-aks-learn --name db-pass --value 'v2-rotated'
   az keyvault secret list-versions --vault-name kv-aks-learn --name db-pass -o table
   ```
   Expect two versions listed. Setting a new value didn't overwrite the old —
   it created a new *version*, and the old one still exists (this is what
   makes rotation auditable and rollback-able, unlike a plain env var).

4. **(Azure) Revoke a specific version without deleting the secret.** Grab an
   older version's ID from exercise 3 and disable it:
   ```bash
   OLDVER=$(az keyvault secret list-versions --vault-name kv-aks-learn --name db-pass --query "[1].id" -o tsv | awk -F/ '{print $NF}')
   az keyvault secret set-attributes --vault-name kv-aks-learn --name db-pass --version "$OLDVER" --enabled false
   az keyvault secret show --vault-name kv-aks-learn --name db-pass --version "$OLDVER" 2>&1 | head -3
   ```
   Expect the show of the disabled version to error/refuse — that's
   revocation, while the current version and audit history stay intact.

5. **(Azure/K8s) Enable CSI secret auto-rotation.** On your AKS cluster with
   the Key Vault add-on from 07/07:
   ```bash
   az aks addon update -g rg-aks-learn -n aks-learn -a azure-keyvault-secrets-provider --enable-secret-rotation --rotation-poll-interval 2m
   ```
   Re-mount `db-pass` into a Pod using the `SecretProviderClass` pattern from
   07/07, `exec` in and `cat` the mounted file, then in Key Vault run
   `az keyvault secret set --vault-name kv-aks-learn --name db-pass --value 'v3-live-rotated'`,
   wait ~2-3 minutes, and `cat` the file again.
   Expect the mounted file to update to `v3-live-rotated` *without recreating
   the Pod* — the rotation loop propagated it. (Contrast: had you synced it to
   an env var, the running container would still show the old value.)

6. **Diagnose and fix: rotation "isn't working."** Configure the same secret
   to sync into a Kubernetes `Secret` and consume it as an **environment
   variable** in a Pod (`env.valueFrom.secretKeyRef`). Read the env var, rotate
   the Key Vault value, wait past the poll interval, and read the env var
   again.
   Expect the env var to *still show the old value* even though the mounted
   file (exercise 5) updates. Diagnose: env vars are injected once at container
   start and never change for a running process — rotation updated the backing
   `Secret`, but the already-started container's environment is frozen. Fix:
   either consume the secret as a **mounted file the app re-reads**, or trigger
   a rollout (`kubectl rollout restart deployment/<name>`) so new containers
   pick up the new env value. Verify the value updates after the restart. The
   lesson: "the platform rotated it" ≠ "the app is using the new value" —
   consumption mode decides.

7. **(WSL2) Practice the leak-response reflex.** Simulate a secret
   accidentally printed into a CI log:
   ```bash
   echo "::debug:: connecting with DB_PASSWORD=v3-live-rotated"   # pretend this hit a build log
   ```
   Do *not* just imagine deleting the log. Write down the ordered response and
   then perform the rotation for real against Key Vault:
   ```bash
   az keyvault secret set --vault-name kv-aks-learn --name db-pass --value "$(openssl rand -base64 24)"
   ```
   Then (conceptually) roll the workloads that use it and disable the leaked
   version (as in exercise 4). The reflex to build: *exposed = compromised =
   rotate now*, not "scrub the log and hope."

8. **(Azure, ties to track 10) Contrast a stored CI secret with OIDC
   federation.** Without necessarily wiring a full pipeline, create a
   federated credential so a CI identity can get Azure access *with no stored
   secret*:
   ```bash
   az ad app federated-credential create --id <app-id> --parameters '{
     "name": "gh-main",
     "issuer": "https://token.actions.githubusercontent.com",
     "subject": "repo:my-org/my-repo:ref:refs/heads/main",
     "audiences": ["api://AzureADTokenExchange"]
   }'
   ```
   Write down, in two sentences, why this is safer than storing a client
   secret in GitHub Actions: the credential is minted per-run, short-lived,
   scoped to exactly `repo:.../main`, and there is *no secret at rest to leak*
   — the module's central lesson made concrete.

9. **(Azure) Clean up.** Remove the demo secret and, if you don't need them
   beyond this module, the Pods/`SecretProviderClass`:
   ```bash
   kubectl delete pod --all -n <your-lab-ns> 2>/dev/null; true
   az keyvault secret delete --vault-name kv-aks-learn --name db-pass
   ```
   Optionally disable rotation again with
   `az aks addon update -g rg-aks-learn -n aks-learn -a azure-keyvault-secrets-provider --disable-secret-rotation`.
   (Remember Key Vault soft-delete from 07/07 if you tear down the whole
   vault.)

## Independent challenge

No commands given — build it yourself, drawing on 07/07 (Key Vault CSI
mounting), track 10 (CI and OIDC), and this module's rotation and leak-response
ideas. Take a workload that today reads a database password from a plain
Kubernetes `Secret` set as an env var, and re-architect its secret handling
end to end so that: the source of truth is Key Vault (not the cluster); the
value is delivered by the CSI driver in a way that *actually picks up
rotation* (choose the consumption mode deliberately and justify it); the CI
pipeline that deploys it authenticates with **no long-lived stored secret**;
and you can articulate the exact ordered steps you'd take the moment that
password appeared in a build log. Prove rotation propagates without a manual
value edit inside the container, and prove (by inspecting the CI identity's
config) that no client secret is stored anywhere.

<details>
<summary>Stuck? One hint</summary>

The consumption-mode decision is the crux: a *mounted file* with
`--enable-secret-rotation` updates live only if the app re-reads it; an *env
var* (synced Secret) always needs a `rollout restart`. Pick one and say why.
For "no stored secret," the mechanism is OIDC federated credentials (track
10) — `az ad app federated-credential create` scoped to your repo/branch,
verified by there being no client secret in the app's credentials list. For
the leak response: rotate the Key Vault value, roll the workloads, disable the
leaked version, then investigate blast radius — in that order.

</details>

## Common mistakes & troubleshooting

- **Treating a Kubernetes `Secret` as actually secret.** It's base64, not
  encrypted, and readable by anyone with `get secrets` in the namespace. It's
  a delivery format, not a management system — the source of truth belongs in
  Key Vault (or Vault).
- **Assuming CSI-mounted secrets rotate by default.** They don't — you must
  enable `--enable-secret-rotation`. And even then, an app that cached the
  value at startup won't see the update until it re-reads the file or
  restarts.
- **Consuming a rotated secret as an env var and expecting live updates.** Env
  vars are frozen at container start. A rotated backing `Secret` never reaches
  a running process's environment — that path always needs a `rollout
  restart`.
- **Storing a long-lived service-principal/client secret in CI.** It's a
  standing, high-value, leakable credential granting access even when no
  pipeline runs. Federate with OIDC (track 10) so the credential is short-
  lived and never stored.
- **"Scrubbing the log" as a response to a leaked secret.** Deleting the log
  doesn't un-leak the value — anyone (or any process) that saw it still has
  it. The only safe response is to rotate and revoke, treating exposed as
  compromised.
- **Running HashiCorp Vault without accounting for the operational burden.**
  Its dynamic secrets are powerful, but you now own its availability,
  patching, and unsealing — a real shared-responsibility shift back to you
  versus managed Key Vault.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Why is a Kubernetes `Secret` object not, by itself, a secrets-management
   solution?
2. What does `--enable-secret-rotation` on the CSI driver change, and what
   case does it *still* not fix?
3. Why does a rotated secret consumed as an environment variable fail to
   update in a running container, and what's the fix?
4. Conceptually, what does HashiCorp Vault's "dynamic secrets" feature do that
   a static Key Vault secret doesn't — and what's the cost of running Vault?
5. Why is a long-lived service-principal secret stored in CI a liability, and
   what replaces it?
6. You discover a database password was printed into a build log an hour ago.
   What is the correct ordered response, and what response is *not* acceptable?
7. What's the security benefit of Key Vault keeping every version of a secret
   rather than overwriting?

</details>

<details>
<summary>Show answers</summary>

1. It's only base64-encoded (trivially reversible, not encrypted), stored in
   etcd, readable by anyone with `get secrets` RBAC, and has no rotation,
   revocation, or read-audit of its own. It's a *delivery mechanism*, not a
   *management* system — the source of truth and lifecycle belong in an
   external store like Key Vault.
2. It turns on the driver's background loop that periodically re-reads Key
   Vault and updates the mounted secret *files* in place, so a rotated value
   propagates to running Pods without a restart. It does *not* help an app
   that read the file once at startup and cached the value in memory, nor an
   env-var consumption path — those still need the app to re-read or a restart.
3. Environment variables are injected once when the container starts and never
   change for the life of that process, so even though rotation updated the
   backing `Secret`, the already-running container's environment is frozen.
   The fix is to consume the secret as a mounted file the app re-reads, or to
   `kubectl rollout restart` so new containers pick up the new value.
4. Dynamic secrets are generated on demand, short-lived, and auto-revoked
   (e.g. a per-request database credential valid for minutes) — so no long-
   lived password exists to leak. The cost is that you operate Vault yourself
   (availability, patching, unsealing), a shared-responsibility shift toward
   you versus managed Key Vault.
5. It's a high-value, long-lived credential sitting in a system many people
   and workflows can touch, valid until someone manually rotates it, granting
   standing access even when no pipeline runs — so a single leak is durable
   and dangerous. OIDC / workload identity federation replaces it: a short-
   lived, per-run, cryptographically-verified token with no secret stored at
   rest.
6. Treat exposed as compromised: rotate the secret immediately (new value in
   the store), roll the workloads that use it, disable/revoke the leaked
   version, then investigate blast radius. Merely deleting/scrubbing the log
   is *not* acceptable — anyone or any process that already saw the value
   still has it.
7. It makes rotation auditable and reversible — you can see the full history
   of when values changed, roll back to a prior version if a rotation breaks
   something, and revoke a specific leaked version by disabling it without
   destroying the record that it existed.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the point
is to find out what actually stuck. These mix modules 00-02 of this track with
the security baseline from tracks 02/03/07/10.

1. Map each of the three secret-handling failures — a secret baked into an
   image layer (02/09), a base64 Kubernetes `Secret` read by an over-broad
   ServiceAccount (03/11), and a long-lived client secret in CI (this module)
   — to a STRIDE category (module 00) and name the control that counters each.
2. A teammate says "we're on AKS, so Azure manages our secrets securely."
   Using the shared-responsibility model (module 00) and this module, list
   three secret-related things that are still entirely your responsibility on
   AKS.
3. You add a Trivy CI gate (module 01) *and* move CI auth to OIDC (module 02).
   Explain how these defend two *different* trust boundaries from your module-
   00 data-flow diagram, and why neither substitutes for the other.
4. An image passes its Trivy scan cleanly and is deployed, but it reads a stale
   database password after a rotation. Walk the layers: is this a scanning
   problem, a signing problem, a secret-consumption-mode problem, or a Key
   Vault problem — and how would you confirm which?
5. Rank by blast radius if leaked, largest first: a subscription-`Owner`
   service-principal secret in CI, a namespace-scoped Kubernetes `Secret`, a
   single Key Vault secret version. Justify the ranking using least-privilege
   reasoning from 03/11.
6. Explain why "rotate the secret" is a faster, safer incident response when
   the secret lives in Key Vault with the CSI driver than when it's a plain
   env-var `Secret` baked into a Deployment manifest committed to Git.
7. A scanner (module 01) and a secret-scanner (`trivy fs --scanners secret`,
   this module) both run in your pipeline. What distinct class of problem does
   each catch, and why do you want both rather than either alone?
8. You enable CSI secret auto-rotation with a 2-minute poll but the app still
   serves the old value ten minutes later. Give two distinct, correct
   explanations and the check that distinguishes them.
9. Using module 00's assume-breach mindset, an attacker gets read access to
   one application Pod. For each of (a) a secret mounted as a file, (b) a
   secret in an env var, (c) a Key Vault secret *not* mounted into that Pod,
   state whether the attacker can read it and why.
10. Tie it together: name the single operational habit from these three
    modules that most reduces standing risk across the CI→subscription
    boundary, and explain in one sentence why it beats "store the secret but
    rotate it often."

<details>
<summary>Show answers</summary>

1. Baked-in image secret → Information disclosure; counter: inject at runtime,
   never write to a layer (02/09), and scan source/images for secrets (module
   01/02). Over-broad `Secret` read → Information disclosure (and enabled by an
   Elevation-of-privilege-style over-grant); counter: least-privilege RBAC on
   `get secrets` (03/11). Long-lived CI client secret → Spoofing/Information
   disclosure; counter: OIDC federation so no secret is stored (module 02 /
   track 10).
2. Among others: which secrets exist and their access policies; how workloads
   consume them (mount vs. env, rotation config); whether CI uses OIDC or a
   stored secret; and rotating/revoking on exposure. Azure secures the vault
   service and etcd-at-rest infrastructure; the *design and hygiene* of your
   secrets are yours.
3. The Trivy gate defends the *image/registry* boundary (stopping vulnerable
   content from being published/run); OIDC defends the *CI→subscription*
   boundary (removing a leakable standing credential). A clean image deployed
   by a pipeline holding a leakable subscription secret is still a breach
   waiting to happen, and a secretless pipeline shipping a vulnerable image is
   still shipping a vulnerable image — different boundaries, both required.
4. It's a secret-consumption-mode problem, not scanning/signing/Key Vault.
   Confirm by checking how the Pod consumes the secret: if it's an env var (or
   a file cached at startup), the running container is frozen to the old value
   despite a correct rotation. Check the `SecretProviderClass`/Deployment for
   env-var vs. mounted-file consumption and whether rotation is enabled;
   `az keyvault secret show` will confirm Key Vault itself has the new value.
5. Largest: the subscription-`Owner` SP secret (full control of every resource
   in the subscription). Then the namespace-scoped Kubernetes `Secret`
   (limited to what that namespace's workloads and readers can reach). Smallest:
   one Key Vault secret version (a single value, revocable independently).
   Least privilege: blast radius tracks the scope of what the credential can
   reach.
6. With Key Vault + CSI, you rotate by setting a new value in one place and
   (with rotation enabled or a rollout) workloads pick it up — no code/manifest
   change, and the old value can be revoked centrally. A secret baked as an
   env var into a committed manifest requires editing Git, re-running the
   pipeline, and the old value persists in Git history — slower and leakier
   exactly when speed matters.
7. The image/dependency scanner catches *known CVEs in packages*; the secret-
   scanner catches *credentials accidentally committed into source*. Different
   problem classes (vulnerable code vs. leaked secrets) with no overlap, so you
   want both — a clean CVE scan says nothing about a hard-coded password, and
   vice versa.
8. (a) The app cached the secret in memory at startup and never re-reads the
   updated file; (b) the app consumes the secret as an env var, which is frozen
   for the container's life regardless of rotation. Distinguish by checking the
   consumption mode: if it's a mounted file, `cat` it inside the Pod — if the
   *file* shows the new value but the app doesn't, it's caching (a); if it's an
   env var, it's (b) and needs a restart.
9. (a) Mounted file: yes — it's readable in the Pod's filesystem. (b) Env var:
   yes — readable via the process environment. (c) Key Vault secret not mounted
   into that Pod: no, not directly — unless the Pod's identity has Key Vault
   access it can abuse, the value isn't present in the Pod. This is why *what
   you mount into a Pod* is itself an attack-surface decision.
10. Use OIDC/workload-identity federation instead of any stored long-lived CI
    credential. It beats "store but rotate often" because a federated
    credential never exists at rest to be leaked in the first place, whereas a
    stored secret is exposed in every window between rotations and depends on
    someone remembering to rotate it.

</details>

## Next

Continue to
[03-pod-security-and-admission-control](../03-pod-security-and-admission-control/README.md)
— from protecting the secrets a Pod consumes to constraining what the Pod
itself is allowed to *be*.
