# Capstone Project

This is the last module of the entire curriculum. There's no new concept
section and no quiz here — the goal is to combine everything from modules
00-08 of this track (and the Helm chart you built in the Kubernetes
track's capstone, [03-kubernetes/12-capstone-project](../../03-kubernetes/12-capstone-project/README.md))
into one real, working, monitored, autoscaling, CI/CD-deployed
application running on a real AKS cluster.

Treat this as a project, not a checklist of isolated exercises — pieces
depend on each other in the order you'd actually build them in the real
world.

## The project

Take the multi-component application and Helm chart you built for the
Kubernetes track's capstone, and run it for real on Azure:

1. Create a real AKS cluster (module 01) sized appropriately for the
   app's needs — don't just reuse leftover single-purpose exercise
   clusters from earlier modules; start from a clean, deliberately-sized
   resource group for this project.
2. Attach an ACR to the cluster using the managed-identity approach
   (module 03), and push your application's image(s) to it.
3. Deploy the application using its Helm chart (from the Kubernetes
   track) against the real AKS cluster, adjusting `values.yaml` as needed
   for the AKS environment (image references pointing at your ACR,
   resource requests sized for your node VMs, etc.).
4. Expose the application through a real Ingress (module 04) with a
   public IP — not a bare `LoadBalancer` Service per component.
5. Enable Container Insights (module 06) and confirm you can see live
   metrics and logs for the running application in the Azure Portal.
6. Apply an HPA to at least one component of the app (module 05), and
   prove it scales under real load using a simple load-generation tool
   (e.g. `hey`, `k6`, `locust`, or even a scripted loop of concurrent
   `curl`s) — watch replica count and, if load is high enough, node
   count change in real time.
7. Set up the GitHub Actions workflow from module 08 so that pushing to
   `main` builds the image, pushes it to your ACR, and rolls the update
   out to the running AKS deployment automatically.

## Acceptance criteria

Work through these in order; each depends on the previous ones actually
working, not just existing.

- [ ] A resource group exists containing a real AKS cluster you created
      specifically for this project, sized to comfortably run your app
      (not a single undersized learning node pool left over from an
      earlier module).
- [ ] `az aks get-credentials` is run and `kubectl get nodes` shows all
      nodes `Ready`.
- [ ] An ACR is attached to the cluster via `az aks update --attach-acr`,
      and `az role assignment list --scope <acr-id>` shows the `AcrPull`
      assignment for the cluster's identity.
- [ ] Your application's image(s) are pushed to that ACR, tagged
      meaningfully (not just `latest`).
- [ ] `helm install` (or `helm upgrade --install`) deploys the full
      multi-component app from your Kubernetes-track Helm chart onto the
      cluster, with every component's Deployment reporting all replicas
      `Ready` (`kubectl get deployments` / `helm status`).
- [ ] An Ingress object routes real external traffic to the app, and
      `kubectl get ingress` shows a populated `ADDRESS`; `curl`-ing that
      address (with a `Host` header if applicable) returns the
      application's real response from outside the cluster.
- [ ] Container Insights is enabled and you can find your application's
      logs and pod/node metrics in the Azure Portal (not just via
      `kubectl`).
- [ ] At least one component has an HPA configured, and you have
      first-hand evidence (a screenshot, terminal output, or a
      `kubectl get hpa -w` transcript) of replica count increasing under
      generated load and decreasing again after load stops.
- [ ] A GitHub Actions workflow exists (`.github/workflows/...yml`) that,
      on push to `main`, builds the image, pushes it to your ACR using
      OIDC federation (not a stored SP secret), and updates the running
      Deployment — and you've proven it works by pushing a real code
      change and observing it deployed without running any manual
      `docker`/`kubectl` command yourself.
- [ ] You can explain, for every piece above, what Azure/AKS manages
      automatically versus what you configured or are responsible for
      operating — if you can't explain a piece, that's a sign to go back
      and actually understand it rather than just having copy-pasted a
      command that worked.

## Hints

- Start smaller than you think you need to, then scale up. Get the app
  running with `kubectl apply`/plain manifests first if the Helm chart
  gives you trouble, then move to Helm once the basics work — don't debug
  two unfamiliar layers (Helm templating and AKS-specific networking) at
  the same time if you can avoid it.
- Reuse resource names and patterns you already validated in modules
  00-08 (e.g. the same node VM size, the same ACR attach flow) rather
  than inventing new configuration for the capstone — the goal is
  integration, not new discovery.
- If the HPA doesn't visibly scale under your load test, check the same
  things module 05's diagnose-and-fix exercise covered: does the target
  component have CPU requests set, and is your load actually hitting the
  component the HPA is watching (not, say, only hitting a
  frontend that's not the CPU bottleneck)?
- If Ingress won't get a public IP, revisit module 04's diagnose exercise:
  check `kubectl get ingressclass` and confirm your Ingress object's
  `ingressClassName` matches exactly.
- If the GitHub Actions workflow can authenticate but `kubectl` commands
  in it fail with permission errors, revisit module 08's role assignment
  step — the CI identity needs a role that lets it act against the
  cluster, separate from the cluster's own `AcrPull` identity.
- Keep a running note of every resource you create (cluster name, ACR
  name, Key Vault if you use one, Log Analytics workspace) so final
  cleanup is a checklist, not an archaeology exercise.

## Final cleanup

This is the end of the curriculum's real-Azure-spend section — clean up
deliberately rather than leaving anything running "just in case."

1. Confirm what you're about to delete:
   `az resource list --resource-group <your-capstone-rg> --output table`.
2. Delete the resource group and everything in it:
   `az group delete --name <your-capstone-rg> --yes --no-wait`.
3. If you created a Log Analytics workspace or Key Vault in a *different*
   resource group at any point in the track (check with
   `az monitor log-analytics workspace list --output table` and
   `az keyvault list --output table` across your subscription), delete
   those explicitly too — they don't get cleaned up by deleting an
   unrelated resource group.
4. If you ever purge-protected a Key Vault or left one soft-deleted,
   check `az keyvault list-deleted --output table` and purge anything you
   don't need retained.
5. Do a final sweep: `az group list --output table` and
   `az aks list --output table` across your subscription — confirm
   nothing from this entire track is still listed. An empty result from
   both is your signal you're no longer being billed for any of this.

## Before you move on

Once everything above is torn down, don't consider this finished yet. Wait
a few days, then — with no notes, no earlier modules open, and none of the
commands in front of you — stand the entire capstone back up from memory:
a fresh cluster, ACR attached by managed identity, the app deployed via
Helm, a real Ingress with a public IP, Container Insights enabled, an HPA
that visibly scales under load, and the GitHub Actions pipeline deploying
on push. Rebuilding the whole thing cold, and noticing exactly where you
stall, is the truest retention check there is — and passing it is the real
end of this four-track curriculum. Tear it all down again afterward.

## Where to go from here

You've now taken an application from a Dockerfile through a local
Kubernetes cluster to a monitored, autoscaling, CI/CD-deployed service on
a real managed cloud cluster — that's a genuinely complete path, and most
production Kubernetes setups aren't conceptually more sophisticated than
what you just built. A few directions worth exploring next, roughly in
order of how directly they build on what you already know:

- **GitOps (ArgoCD or Flux):** instead of a CI pipeline directly running
  `kubectl`/`helm` against the cluster, a GitOps controller running
  inside the cluster continuously reconciles against a Git repo as the
  source of truth — a different (arguably more auditable and safer)
  deployment model than what module 08 built.
- **Service mesh (Istio, Linkerd, or Open Service Mesh):** adds
  mutual TLS between services, fine-grained traffic splitting (canary
  releases, blue/green), and much deeper observability of
  service-to-service traffic than Ingress alone gives you.
- **Multi-cluster and multi-region:** running AKS clusters in more than
  one region for resilience or latency, and the traffic-routing/data
  -replication questions that raises.
- **Cost optimization in depth:** spot node pools for
  interruption-tolerant workloads, right-sizing based on actual
  Container Insights data rather than guesses, reserved instances/savings
  plans for steady-state production clusters, and automated
  start/stop scheduling for non-production clusters.
- **Policy and compliance at scale:** Azure Policy for AKS and/or OPA
  Gatekeeper, for enforcing organization-wide rules (allowed image
  registries, required resource limits, etc.) across many clusters and
  teams instead of trusting individual discipline.

There's no required next step — pick whichever of these solves a problem
you actually have.
