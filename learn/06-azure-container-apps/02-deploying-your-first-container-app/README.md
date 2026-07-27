# Deploying Your First Container App

## Why this matters

Now you put a real workload into an Environment. This is where ACA pays off:
what took a Deployment, a Service, an Ingress, and an HPA on a Kubernetes
cluster (the YAML you wrote by hand in track 03) collapses into
a single `az containerapp create`. Understanding exactly what that one command
provisions — and how to update, inspect, and roll it back — is the foundation
for scaling, networking, and revisions in every later module.

## Concepts

### One command, several Kubernetes objects

A **container app** is a single Azure resource that internally becomes the
equivalent of a Kubernetes Deployment (your replicas), a Service (internal load
balancing), optionally an Ingress (Envoy exposes it), and an HPA-like scaler
(KEDA). You describe the image, the resources, and whether/how it's exposed;
ACA reconciles the rest. Because you know Kubernetes, the mental translation is
direct — you're just not writing or applying the YAML, and there's no cluster
to target.

### Ingress: external, internal, or none

Each app chooses one of three ingress modes. **External** ingress puts the app
behind the Environment's public endpoint (a `*.<region>.azurecontainerapps.io`
FQDN) with automatic HTTPS. **Internal** ingress exposes it only inside the
Environment's VNet (other apps can reach it, the internet can't). **No
ingress** means the app receives no inbound traffic at all — appropriate for a
worker/queue-consumer. You also set the **target port** (the port your
container listens on, like a Service's `targetPort`); Envoy terminates TLS and
forwards to it. Module 04 goes deep on ingress and networking; here you just
need external vs. none to see traffic flow.

### Container configuration: image, CPU, memory, env

You configure the container much like a Kubernetes pod spec: an image
reference (from a registry — Docker Hub, MCR, or an Azure Container Registry),
**CPU and memory** (ACA uses specific allowed CPU/memory *combinations*, e.g.
0.5 vCPU with 1.0 GiB — not arbitrary values), environment variables, and
(later) secrets and probes. On the Consumption plan the CPU/memory you request
directly drives per-second cost while replicas run, so "right-size, don't
over-allocate" is a cost lever, not just hygiene.

### Every change makes a revision

You don't edit a running app in place the way you might `kubectl edit` a pod.
Any change to the container template (new image, new env var, new resources)
produces a **new revision** — an immutable snapshot, like a specific Deployment
rollout. In the default single-revision mode, ACA shifts 100% of traffic to
the newest revision automatically (a rolling update). This module uses that
default; module 05 unlocks running multiple revisions and splitting traffic.
The practical upshot now: to roll back, you point traffic at (or reactivate) an
older revision instead of "undoing" an edit.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az containerapp create` | Deploy a new container app | `az containerapp create --name web --resource-group rg-aca-m02 --environment env-m02 --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external` |
| `az containerapp update` | Change an app (new image, env, resources, scale) | `az containerapp update --name web --resource-group rg-aca-m02 --image mcr.microsoft.com/k8se/quickstart:latest --cpu 0.5 --memory 1.0Gi` |
| `az containerapp show` | Show an app's full config | `az containerapp show --name web --resource-group rg-aca-m02 -o jsonc` |
| `az containerapp list` | List apps in a resource group | `az containerapp list --resource-group rg-aca-m02 -o table` |
| `az containerapp logs show` | Stream/print an app's logs | `az containerapp logs show --name web --resource-group rg-aca-m02 --follow` |
| `az containerapp ingress show` | Show ingress config incl. FQDN | `az containerapp ingress show --name web --resource-group rg-aca-m02 -o jsonc` |
| `az containerapp revision list` | List an app's revisions | `az containerapp revision list --name web --resource-group rg-aca-m02 -o table` |
| `az containerapp delete` | Delete an app | `az containerapp delete --name web --resource-group rg-aca-m02 --yes` |

Flag-by-flag breakdowns:

`az containerapp create --name web --resource-group rg-aca-m02 --environment env-m02 --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external`
- `--name` — the app's name.
- `--resource-group` — where it lives.
- `--environment` — which Environment hosts it (must already exist).
- `--image` — the container image to run.
- `--target-port` — the port your container listens on; Envoy forwards to it.
- `--ingress external` — expose it publicly with an HTTPS FQDN. Use `internal` for VNet-only, or omit `--ingress`/`--target-port` for no ingress.

`az containerapp update --name web --resource-group rg-aca-m02 --image ... --cpu 0.5 --memory 1.0Gi`
- `--image` — new image; producing a new revision.
- `--cpu 0.5` — vCPU for the container (must pair with an allowed memory value).
- `--memory 1.0Gi` — memory; `0.5` vCPU pairs with `1.0Gi`. Invalid CPU/memory *combinations* are rejected.

`az containerapp create ... --min-replicas 0 --max-replicas 3 --env-vars COLOR=blue APP_ENV=demo`
- `--min-replicas 0` — allow scale-to-zero (no replicas, no compute cost, when idle).
- `--max-replicas 3` — cap replicas at 3.
- `--env-vars` — space-separated `KEY=value` pairs injected as environment variables.

## Hands-on exercises

1. **Set up group and Environment.**
   ```powershell
   az group create --name rg-aca-m02 --location eastus
   az containerapp env create --name env-m02 --resource-group rg-aca-m02 --location eastus
   ```

2. **Deploy the quickstart app with external ingress.**
   ```powershell
   az containerapp create `
     --name web --resource-group rg-aca-m02 --environment env-m02 `
     --image mcr.microsoft.com/k8se/quickstart:latest `
     --target-port 80 --ingress external `
     --min-replicas 0 --max-replicas 2
   ```
   When it finishes, the command prints the app's FQDN. If you missed it:
   ```powershell
   az containerapp show --name web --resource-group rg-aca-m02 --query properties.configuration.ingress.fqdn -o tsv
   ```

3. **Hit the app.** Open `https://<fqdn>` in a browser, or:
   ```powershell
   $fqdn = az containerapp show --name web --resource-group rg-aca-m02 --query properties.configuration.ingress.fqdn -o tsv
   curl "https://$fqdn"
   ```
   Verify you get an HTTP 200 and the quickstart welcome page. Note the FQDN
   ends in `.azurecontainerapps.io` and HTTPS "just works" (Envoy handled the
   cert).

4. **Inspect what got created.**
   ```powershell
   az containerapp show --name web --resource-group rg-aca-m02 -o jsonc
   ```
   Find `properties.template.containers[0]` (image, resources), 
   `properties.configuration.ingress` (external, targetPort 80, fqdn), and
   `properties.template.scale` (min/max replicas). This single resource is
   your Deployment + Service + Ingress + scaler.

5. **View logs.**
   ```powershell
   az containerapp logs show --name web --resource-group rg-aca-m02 --tail 30
   ```
   Confirm you see the container's stdout. Add `--follow` to stream live.

6. **Update the app — watch a new revision appear.**
   ```powershell
   az containerapp update `
     --name web --resource-group rg-aca-m02 `
     --cpu 0.5 --memory 1.0Gi --set-env-vars COLOR=blue
   az containerapp revision list --name web --resource-group rg-aca-m02 -o table
   ```
   Verify there are now two revisions and the newest is `Active` with 100% of
   traffic (default single-revision mode). Confirm the app still responds.

7. **Roll back by reactivating.** Get the two revision names from the list,
   then (in single-revision mode) update again to effectively supersede, or
   practice revision control:
   ```powershell
   az containerapp revision list --name web --resource-group rg-aca-m02 --query "[].name" -o tsv
   ```
   Note both names — module 05 will have you split and shift traffic between
   them deliberately. For now, verify you *can* see history to roll back to.

8. **Scale-to-zero check.** Because `--min-replicas 0`, an idle app releases
   its replicas. Confirm the current replica count:
   ```powershell
   az containerapp replica list --name web --resource-group rg-aca-m02 -o table
   ```
   After a period of no traffic, this can be empty — that's scale-to-zero, and
   it's why an idle Consumption app costs almost nothing.

9. **Diagnose and fix: ingress misconfigured as internal.** Deploy a second
   app you *intend* to be public but mistakenly set internal:
   ```powershell
   az containerapp create `
     --name web2 --resource-group rg-aca-m02 --environment env-m02 `
     --image mcr.microsoft.com/k8se/quickstart:latest `
     --target-port 80 --ingress internal
   $f2 = az containerapp show --name web2 --resource-group rg-aca-m02 --query properties.configuration.ingress.fqdn -o tsv
   curl "https://$f2"
   ```
   From your machine (outside the VNet) the request fails/hangs — the FQDN
   resolves to a private address. **Fix it** by switching ingress to external:
   ```powershell
   az containerapp ingress enable --name web2 --resource-group rg-aca-m02 --type external --target-port 80 --transport auto
   curl "https://$f2"
   ```
   Now it responds. Lesson: `external` vs `internal` is a common
   "why can't I reach it?" root cause (module 04 explores it fully).

10. **Diagnose and fix: bad CPU/memory combo.** Try an invalid pairing:
    ```powershell
    az containerapp update --name web --resource-group rg-aca-m02 --cpu 0.25 --memory 4.0Gi
    ```
    Observe the rejection (unsupported CPU/memory combination). **Fix it** with
    a valid pairing, e.g. `--cpu 0.5 --memory 1.0Gi` or `--cpu 1.0 --memory 2.0Gi`.

11. **Cleanup.**
    ```powershell
    az group delete --name rg-aca-m02 --yes --no-wait
    ```

## Independent challenge

Deploy a single externally-reachable container app (any public image that
serves HTTP, e.g. `mcr.microsoft.com/k8se/quickstart:latest`) into a fresh
Environment, then change one environment variable and confirm — using only
`az containerapp revision list` and a request to the FQDN — that a **new
revision** was created and is now serving. Combine this module with **module
01**: your Environment must reuse a Log Analytics workspace *you* created (not
an auto one). Report the two revision names and which is active. Delete the
resource group afterward.

<details><summary>Stuck? One hint</summary>

An env-var change is a template change, so it forces a new revision. Capture
`revision list --query "[].name"` before and after the `update --set-env-vars`
and diff the two lists; the new name is your new revision, and
`--query "[?properties.active].name"` tells you which is live.

</details>

## Common mistakes & troubleshooting

- **Forgetting `--target-port` with ingress.** If you enable ingress but the
  target port doesn't match what your container listens on, requests fail with
  502/timeout even though the app is "running." Match the port your image
  actually binds.
- **Expecting in-place edits.** There's no live edit — every template change is
  a new revision. To "undo," activate/route to a prior revision (module 05),
  don't try to reverse the edit.
- **Invalid CPU/memory combos.** ACA only allows specific pairings. Guessing
  arbitrary values (`0.25` vCPU / `4.0Gi`) fails; consult allowed combos.
- **Assuming external ingress is the default.** If you omit `--ingress`, the
  app has *no* ingress and won't be reachable at all — not the same as
  internal. Be explicit.
- **Cost pitfall: min-replicas > 0 without needing it.** Setting
  `--min-replicas 1` (or more) keeps replicas warm and billing even when idle,
  defeating scale-to-zero. Use `0` unless you specifically need to avoid cold
  starts.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. A single `az containerapp create` stands in for which four Kubernetes
   objects?
2. What are the three ingress modes, and when would you pick each?
3. What happens to revisions when you change an env var, and (in default mode)
   where does traffic go?
4. Why does `--cpu 0.25 --memory 4.0Gi` fail?
5. Your externally-intended app isn't reachable from your laptop but its FQDN
   exists. What's the first ingress setting to check?
6. What does `--min-replicas 0` buy you, and what's the downside?
7. How do you find an app's public FQDN after deployment?

<details><summary>Show answers</summary>

1. A Deployment (replicas), a Service (internal load balancing), an Ingress
   (Envoy exposure), and an HPA-equivalent scaler (KEDA).
2. **External** (public HTTPS FQDN — for internet-facing services),
   **internal** (VNet-only — for backend/service-to-service), and **none**
   (no inbound — for workers/queue consumers).
3. A new immutable revision is created; in default single-revision mode 100%
   of traffic shifts to the newest active revision (a rolling update).
4. It's an unsupported CPU/memory combination — ACA only allows specific
   pairings (e.g. 0.5 vCPU with 1.0 GiB, 1.0 vCPU with 2.0 GiB).
5. Whether ingress is `internal` vs `external` — an internal FQDN resolves to
   a private VNet address unreachable from outside. Switch with
   `az containerapp ingress enable --type external`.
6. Scale-to-zero: no replicas and near-zero compute cost when idle. Downside:
   cold-start latency on the first request after idling.
7. `az containerapp show ... --query properties.configuration.ingress.fqdn -o tsv`
   (or read it from the create command's output / `ingress show`).

</details>

## Next

[03-scaling-with-keda](../03-scaling-with-keda/README.md) — make the app scale
on demand: scale-to-zero, HTTP and custom KEDA rules, and diagnosing a rule
that never fires.
