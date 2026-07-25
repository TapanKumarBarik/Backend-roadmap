# Revisions, Traffic Splitting & Dapr

## Why this matters

Revisions and traffic splitting are how you ship safely: canary a new version
to 10% of users, roll back instantly by shifting weights, or run blue/green —
all without the Deployment/Service surgery you'd do in raw Kubernetes yourself
(as in track 03). Dapr then lets two
apps call each other by name with retries and mTLS, without you wiring service
discovery yourself. Together they turn a Container Apps Environment into a small
service mesh you didn't have to build.

## Concepts

### Single-revision vs. multiple-revision mode

Every app runs in one of two **revision modes**. In **single** mode (the
default) only the latest revision is active and gets 100% of traffic; each
update supersedes the last — a rolling update, like a plain Deployment. In
**multiple** mode, several revisions can be active simultaneously and you
control how traffic is divided among them. You switch modes with
`az containerapp revision set-mode`. Multiple mode is the prerequisite for
canary/blue-green; single mode is simpler when you don't need it. Switching to
multiple mode doesn't retroactively activate old revisions — you manage which
are active going forward.

### Revisions are immutable snapshots

A **revision** is an immutable version of the app's template (image + config).
You've already seen that any template change mints one (module 02). In multiple
mode each active revision gets its own stable **revision FQDN**
(`<app>--<revision-suffix>.<env>...`) in addition to the app's main FQDN — so
you can hit a specific revision directly for testing, while the main FQDN
follows your traffic weights. Revisions can be **activated** and
**deactivated**; a deactivated revision keeps its config but serves no traffic
and consumes no replicas.

### Traffic splitting: canary, blue/green, rollback

In multiple mode you assign **traffic weights** across revisions with
`az containerapp ingress traffic set` — e.g. 90% to the current stable, 10% to
a new canary. Blue/green is just 100/0 then 0/100. Instant rollback is shifting
weights back to the known-good revision — no redeploy, no image pull, because
the old revision is still there. This is the same idea as a Kubernetes
canary with two Deployments behind one Service and weighted routing, except
Envoy and the platform do the weighting for you and it's one command.

### Dapr in Container Apps

**Dapr** (Distributed Application Runtime) is built into ACA and enabled
per-app (`--enable-dapr`, plus a stable `--dapr-app-id`). When enabled, each
app gets a Dapr **sidecar**; apps call each other through it using the app-id,
getting service discovery, retries, and mTLS for free. This is the same Dapr
you could add to any Kubernetes cluster yourself, but you don't deploy the Dapr
control plane — it's part
of the Environment. Dapr **components** (state stores, pub/sub brokers, secret
stores) are defined at the Environment level and scoped to specific app-ids.

### Dapr service invocation between two apps

The headline pattern: app A calls app B without knowing B's address. A issues a
request to its **local Dapr sidecar** at
`http://localhost:3500/v1.0/invoke/<B-app-id>/method/<path>`, and Dapr resolves
`<B-app-id>` to app B within the Environment, forwards the call over mTLS, and
retries on transient failure. B just needs Dapr enabled with that app-id and to
be listening on its app port. Because discovery is by **app-id**, not FQDN or
IP, this only works **within one Environment** (recall module 01: Dapr and
internal discovery are Environment-scoped).

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az containerapp revision set-mode` | Set single/multiple revision mode | `az containerapp revision set-mode --name web --resource-group rg-aca-m05 --mode multiple` |
| `az containerapp revision list` | List revisions and their state | `az containerapp revision list --name web --resource-group rg-aca-m05 -o table` |
| `az containerapp revision copy` | Create a new revision from an existing one | `az containerapp revision copy --name web --resource-group rg-aca-m05 --image <img> --revision-suffix v2` |
| `az containerapp revision activate` / `deactivate` | Turn a revision on/off | `az containerapp revision deactivate --name web --resource-group rg-aca-m05 --revision web--v1` |
| `az containerapp ingress traffic set` | Split traffic across revisions | `az containerapp ingress traffic set --name web --resource-group rg-aca-m05 --revision-weight web--v1=90 web--v2=10` |
| `az containerapp ingress traffic show` | Show current traffic weights | `az containerapp ingress traffic show --name web --resource-group rg-aca-m05 -o table` |
| `az containerapp create` (Dapr) | Create an app with Dapr enabled | `az containerapp create ... --enable-dapr --dapr-app-id orders --dapr-app-port 80` |

Flag-by-flag breakdowns:

`az containerapp revision copy --name web --resource-group rg-aca-m05 --image <img> --revision-suffix v2`
- `--image` — the image for the new revision (change it to ship a new version).
- `--revision-suffix v2` — a human-readable suffix so the revision is named `web--v2` instead of a random hash; makes traffic commands readable.

`az containerapp ingress traffic set --name web --resource-group rg-aca-m05 --revision-weight web--v1=90 web--v2=10`
- `--revision-weight web--v1=90 web--v2=10` — assign percentages by revision name; must sum to 100. This is the canary/blue-green/rollback control. You can also use `latest=NN` to target the latest revision.

`az containerapp create --name orders --resource-group rg-aca-m05 --environment env-m05 --image ... --target-port 80 --ingress internal --enable-dapr --dapr-app-id orders --dapr-app-port 80`
- `--enable-dapr` — inject the Dapr sidecar.
- `--dapr-app-id orders` — the stable identity other apps use to invoke this one; changing it breaks callers.
- `--dapr-app-port 80` — the port Dapr forwards invoked requests to inside the container (usually your app's listening port).

## Hands-on exercises

1. **Set up group, Environment, and an app.**
   ```powershell
   az group create --name rg-aca-m05 --location eastus
   az containerapp env create --name env-m05 --resource-group rg-aca-m05 --location eastus
   az containerapp create --name web --resource-group rg-aca-m05 --environment env-m05 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external `
     --revision-suffix v1
   ```

2. **Switch to multiple-revision mode.**
   ```powershell
   az containerapp revision set-mode --name web --resource-group rg-aca-m05 --mode multiple
   az containerapp show --name web --resource-group rg-aca-m05 --query properties.configuration.activeRevisionsMode -o tsv
   ```
   Verify it prints `Multiple`.

3. **Create a second revision.**
   ```powershell
   az containerapp revision copy --name web --resource-group rg-aca-m05 `
     --image mcr.microsoft.com/k8se/quickstart:latest --revision-suffix v2 --set-env-vars VERSION=2
   az containerapp revision list --name web --resource-group rg-aca-m05 -o table
   ```
   Verify both `web--v1` and `web--v2` appear and are active.

4. **Canary split 90/10.**
   ```powershell
   az containerapp ingress traffic set --name web --resource-group rg-aca-m05 `
     --revision-weight web--v1=90 web--v2=10
   az containerapp ingress traffic show --name web --resource-group rg-aca-m05 -o table
   ```
   Verify the weights. Hit the FQDN repeatedly and observe ~1 in 10 requests
   hitting v2 (if the image surfaced the difference; otherwise trust the
   weights table).

5. **Test a specific revision directly.**
   ```powershell
   az containerapp revision show --name web --resource-group rg-aca-m05 --revision web--v2 --query properties.fqdn -o tsv
   ```
   `curl` that revision FQDN to hit v2 regardless of traffic weights — useful
   for smoke-testing a canary before widening it.

6. **Promote (blue/green) then instant rollback.**
   ```powershell
   az containerapp ingress traffic set --name web --resource-group rg-aca-m05 --revision-weight web--v2=100
   # ...decide v2 is bad...
   az containerapp ingress traffic set --name web --resource-group rg-aca-m05 --revision-weight web--v1=100
   ```
   Verify each switch in the traffic table. Note the rollback is instant — v1
   was never removed.

7. **Deactivate the old revision to stop it consuming replicas.**
   ```powershell
   az containerapp revision deactivate --name web --resource-group rg-aca-m05 --revision web--v2
   az containerapp revision list --name web --resource-group rg-aca-m05 -o table
   ```
   Verify `web--v2` shows inactive. (Reactivate with `revision activate` if
   needed.)

8. **Deploy two Dapr-enabled apps.** A backend and a caller.
   ```powershell
   az containerapp create --name backend --resource-group rg-aca-m05 --environment env-m05 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress internal `
     --enable-dapr --dapr-app-id backend --dapr-app-port 80
   az containerapp create --name frontend --resource-group rg-aca-m05 --environment env-m05 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external `
     --enable-dapr --dapr-app-id frontend --dapr-app-port 80
   ```
   Verify both show Dapr enabled:
   `az containerapp show --name frontend --resource-group rg-aca-m05 --query properties.configuration.dapr -o jsonc`.

9. **Exercise Dapr service invocation.** From the frontend's console (or a Dapr
   app that makes the call), the invocation URL is
   `http://localhost:3500/v1.0/invoke/backend/method/<path>`. Using
   `az containerapp exec` into the frontend replica:
   ```powershell
   az containerapp exec --name frontend --resource-group rg-aca-m05 --command "/bin/sh"
   # inside the container:
   # wget -qO- http://localhost:3500/v1.0/invoke/backend/method/
   ```
   Verify the call reaches `backend` via its app-id (not its FQDN/IP). If your
   image lacks a shell/wget, note the URL pattern is the deliverable.

10. **Diagnose and fix: revision stuck provisioning.** Ship a revision whose
    container can't start (bad image tag):
    ```powershell
    az containerapp revision copy --name web --resource-group rg-aca-m05 `
      --image mcr.microsoft.com/k8se/quickstart:doesnotexist --revision-suffix bad
    az containerapp revision list --name web --resource-group rg-aca-m05 -o table
    ```
    Observe `web--bad` stuck in Provisioning/Failed and (if you routed traffic
    to it) errors. **Diagnose** with
    `az containerapp revision show --name web --resource-group rg-aca-m05 --revision web--bad -o jsonc`
    (look at provisioning/health state) and the logs. **Fix** by shifting all
    traffic back to a healthy revision and deactivating the bad one:
    ```powershell
    az containerapp ingress traffic set --name web --resource-group rg-aca-m05 --revision-weight web--v1=100
    az containerapp revision deactivate --name web --resource-group rg-aca-m05 --revision web--bad
    ```

11. **Diagnose and fix: Dapr call fails with wrong app-id.** In the invocation
    URL, use a non-existent app-id (`.../invoke/backendd/method/`). The call
    fails to resolve. **Fix** by using the correct `--dapr-app-id` (`backend`).
    Lesson: Dapr discovery is by app-id, and it's Environment-scoped.

12. **Cleanup.**
    ```powershell
    az group delete --name rg-aca-m05 --yes --no-wait
    ```

## Independent challenge

Deploy an app in multiple-revision mode, ship a second revision, and run a
disciplined canary: 100/0 → 90/10 → 50/50 → 0/100, verifying weights at each
step and testing the canary via its dedicated revision FQDN before widening.
Then deploy a **second** Dapr-enabled app and demonstrate that your first app
can invoke it by app-id. Combine this module with **module 03**: give the
canary revision an HTTP scale rule and confirm it scales independently of the
stable revision under load. Clean up the resource group when done.

<details><summary>Stuck? One hint</summary>

Each active revision scales on its own scale rules, so to see the canary scale
independently, drive load *specifically at its revision FQDN* (from
`revision show --query properties.fqdn`) rather than the app's main FQDN, and
watch `replica list` — replicas are reported per revision.

</details>

## Common mistakes & troubleshooting

- **Forgetting to switch to multiple mode.** `ingress traffic set` across
  revisions only makes sense in multiple mode; in single mode the latest
  revision always gets 100%.
- **Traffic weights that don't sum to 100.** The command expects percentages
  summing to 100; a leftover revision at some weight throws off the split.
- **Leaving dead revisions active.** Active-but-unused revisions can still hold
  min replicas and cost money. Deactivate old revisions you've rolled away from.
- **Changing a Dapr app-id.** Callers invoke by app-id; renaming it silently
  breaks them. Treat app-id as a stable contract.
- **Expecting cross-Environment Dapr.** Dapr invocation and internal discovery
  work only within one Environment — the same boundary rule from module 01.
- **Cost pitfall: canaries with warm min-replicas.** A canary revision with
  `--min-replicas 1` bills continuously alongside stable. Keep canaries at
  min 0 (or deactivate them) when not actively testing.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. What must you do before you can split traffic across two revisions?
2. How do you roll back a bad release instantly, and why is it instant?
3. What's the difference between the app's main FQDN and a revision FQDN?
4. In Dapr service invocation, what does app A use to address app B, and what
   does A actually connect to locally?
5. Why does Dapr invocation only work within a single Environment?
6. A deactivated revision — does it serve traffic? Does it consume replicas?
7. You set `--revision-weight web--v2=100` and the app starts erroring. Two
   likely causes and the fastest mitigation?

<details><summary>Show answers</summary>

1. Switch the app to **multiple**-revision mode
   (`revision set-mode --mode multiple`); single mode always routes 100% to the
   latest revision.
2. Shift traffic weights back to the known-good revision with
   `ingress traffic set`. Instant because the old revision is still present
   (immutable snapshot) — no redeploy or image pull needed.
3. The main FQDN follows your traffic weights across active revisions; a
   revision FQDN (`<app>--<suffix>...`) always hits that one specific revision,
   for direct testing.
4. A uses B's **Dapr app-id**; A connects to its **own local Dapr sidecar**
   (`http://localhost:3500/v1.0/invoke/<app-id>/method/...`), which resolves and
   forwards to B over mTLS.
5. Dapr discovery/invocation and internal service discovery are scoped to one
   Environment (the shared network/mesh boundary from module 01).
6. No traffic, and no replicas — it retains config but is dormant until
   reactivated.
7. Either v2's revision is unhealthy/stuck provisioning (bad image/config) or
   v2 has a bug. Fastest mitigation: shift 100% back to the healthy revision,
   then deactivate/investigate v2.

</details>

## Next

[06-secrets-managed-identity-and-config](../06-secrets-managed-identity-and-config/README.md)
— stop putting connection strings in plaintext: secrets, Key Vault references,
managed identity, and the role assignments that make them work.
</content>
