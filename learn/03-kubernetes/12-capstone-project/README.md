# 12 - Capstone Project

## Why this matters

Every prior module in this track taught one concept in isolation —
Pods, Deployments, Services, config, storage, Helm, Ingress, scaling,
observability, security — each with its own small, disposable exercises.
Real applications need all of these working together at once, packaged
in a way someone else (or your future self, or a CI pipeline) can deploy
reliably. This capstone has you build one realistic multi-component
application end to end, then package the whole thing as a Helm chart —
the exact artifact you'll later hand to the AKS track and deploy, largely
unchanged, to a real managed cluster. Before that, the next few tracks take
a detour through networking and Azure Container Apps; the Helm chart you
build here will be waiting when you get to AKS.

## The project

Build and deploy a small multi-component application to your local
kind cluster, consisting of at minimum:

1. **A backend API component** (reuse the FastAPI dashboard app from the
   Docker track if you have it, or any small HTTP API you can containerize
   — even a simple one built for this exercise is fine) that reads its
   configuration from a ConfigMap and a database connection string/
   credential from a Secret.
2. **A database component** (e.g. PostgreSQL or Redis) running as its own
   Deployment (a single replica is fine — StatefulSets are out of scope
   for this track), backed by a PersistentVolumeClaim so its data
   survives Pod restarts.
3. **A Service** in front of each component, so the backend reaches the
   database by a stable DNS name (module 04), not a hardcoded Pod IP.
4. **An Ingress** exposing the backend API (and, if your app has one, a
   frontend) through a single entry point via your local ingress-nginx
   controller (module 08), instead of relying on `port-forward`.
5. **Resource requests and limits** set on every container in every
   Deployment (module 02) — no container should be missing them.
6. **A HorizontalPodAutoscaler** on the backend component, targeting CPU
   utilization, with sensible `minReplicas`/`maxReplicas` (module 09).
7. **The entire thing packaged as a single Helm chart** (module 07), with
   a `values.yaml` exposing at minimum: replica counts, image
   repository/tag for each component, resource requests/limits, the
   Ingress host, and the HPA's min/max/target — installable and
   upgradeable with `helm upgrade --install`.

Optional stretch goals, if you want to go further:
- Add a NetworkPolicy (module 11) restricting the database to only
  accept traffic from the backend's Pods, and confirm (as in module 11's
  exercises) that an unrelated Pod cannot reach it.
- Add a ServiceAccount with a minimal Role/RoleBinding for the backend if
  it needs any Kubernetes API access (e.g. reading its own ConfigMap
  programmatically) — otherwise, explicitly note in your chart that it
  uses the default ServiceAccount with no elevated permissions.
- Install the Prometheus/Grafana stack from module 10 alongside your app
  and confirm you can see its resource usage on a real dashboard.

## Acceptance criteria checklist

Work through this in order — each item should be independently
verifiable with a `kubectl` or `helm` command:

- [ ] `helm install <release> <your-chart>` succeeds from a clean
      namespace with no manual `kubectl apply` steps required first.
- [ ] `kubectl get pods` shows every component `Running` and `Ready`
      (correct `READY` count, e.g. `1/1`), with `RESTARTS: 0` once
      settled.
- [ ] `kubectl get pvc` shows the database's claim `Bound`.
- [ ] Writing data through the backend API, then deleting the database
      Pod (`kubectl delete pod`), then reading that same data back
      afterward, succeeds — proving the PVC actually persists data
      independent of the Pod's lifecycle (recall module 06's exercise 5).
- [ ] `kubectl get svc` shows a ClusterIP Service for each component, and
      `kubectl get endpoints <svc>` shows populated endpoints for each
      (no silent selector mismatches, per module 04's most common bug).
- [ ] `kubectl get ingress` shows your Ingress with an assigned address,
      and a `curl` (or browser request) through it reaches the backend
      successfully end to end — through the Ingress, not a
      `port-forward`.
- [ ] `kubectl describe deployment <backend>` shows resource
      requests/limits set — no container in the whole app should be
      missing them.
- [ ] `kubectl get hpa` shows real percentages (not `<unknown>`) once the
      backend has received any traffic, confirming metrics-server and the
      HPA's target metric are both correctly wired (module 09's most
      common bug).
- [ ] Generating enough load against the backend (reuse a technique from
      module 09, e.g. a CPU-burning test image or a simple loop of
      requests) causes `kubectl get hpa --watch` to show replica count
      increase, and `kubectl get pods` to show more backend Pods.
- [ ] `helm upgrade <release> <your-chart> --set <something>=<newvalue>`
      (e.g. a changed image tag, or a changed replica count) applies
      cleanly, and `helm rollback <release> <previous-revision>` reverts
      it successfully.
- [ ] The chart passes `helm lint` with no errors, and `helm template`
      renders successfully with default values with no manual
      intervention.
- [ ] Everything in the chart — Deployments, Services, ConfigMap, Secret,
      PVC, Ingress, HPA — is expressed as chart templates, not left as
      separate `kubectl apply -f` manifests applied by hand alongside the
      chart.

## Hints

- Start by writing and testing each object as plain YAML with `kubectl
  apply`, exactly like every previous module — get the app fully working
  imperatively first, *then* convert it into a Helm chart
  (`helm create`, then replace the scaffold's templates with your own,
  parameterizing the values that should differ between environments).
  Converting working YAML into templates is much easier than debugging
  both templating and application issues simultaneously.
- For the database's credentials, create the Secret's values via
  `--set` at install time (or a separate, gitignored values file) rather
  than hardcoding a real-looking password into `values.yaml` — the same
  "don't commit plaintext Secret material" principle from module 05
  applies to chart defaults too.
- Reuse the label-selector discipline from modules 03/04/11 carefully —
  with several components in one chart, it's easy to have two
  Deployments' Pods accidentally share a label a Service or NetworkPolicy
  selector also matches. Use a specific `app.kubernetes.io/component`
  label per component, not just a shared `app` label, to keep them
  distinguishable (this is also the convention Helm's own `helm create`
  scaffold nudges you toward).
- If the HPA sits at `<unknown>`, revisit module 09's exercise 9 — it's
  almost always a missing CPU `request` on the target Deployment.
- If the Ingress returns a 503 or doesn't route, revisit module 08's
  exercises 8-9 — check `kubectl get ingressclass`, and confirm the
  Ingress's backend port matches the Service's `port`, not the
  container's port.
- Keep `helm template <release> <chart> | less` as your go-to sanity
  check throughout — it catches most templating mistakes before they
  ever reach the cluster.

## What comes next

This chart is not a throwaway exercise — it's the artifact the AKS track
picks up directly. There, you'll take this same Helm chart (with, at
most, small values overrides for a real domain name, TLS certificates,
and Azure-specific storage/ingress annotations) and deploy it to a real
managed AKS cluster, backed by real Azure Disks/Files, a real Azure Load
Balancer, and Azure Container Registry for your images — the exact same
manifests and the exact same `helm upgrade --install` you practiced here,
just pointed at a cloud cluster instead of kind.

## Before you move on

A day or two after you finish, delete the whole thing — the cluster (or at
least every resource this project created) — and rebuild it from memory:
the manifests, the Helm chart, the Ingress, the HPA, all of it, without
re-reading your own notes or this README. If you can stand it back up and
pass the acceptance checklist again cold, the concepts have genuinely
stuck; wherever you get stuck is exactly the module worth a quick reread
before you start the next track.

## Further reading & sources

- [Helm Best Practices](https://helm.sh/docs/chart_best_practices/) - conventions for structuring the multi-component chart this capstone asks you to build.
- [Kubernetes Configuration Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/) - general guidance on labels, resources, and manifest hygiene across all the objects here.
- [Recommended Labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/) - the `app.kubernetes.io/*` labels that keep multiple components distinguishable in one chart.
- [Twelve-Factor App](https://12factor.net/) - the config/backing-services principles behind splitting config into ConfigMaps/Secrets and databases into their own Deployments.
- [DigitalOcean: Package a Kubernetes app with Helm](https://www.digitalocean.com/community/tutorials/how-to-create-a-helm-chart-and-deploy-your-kubernetes-app) - a worked example of turning working manifests into a reusable chart.

## Next

Continue to
[04-networking-fundamentals](../../04-networking-fundamentals/README.md) —
a detour through general networking and Azure networking before Azure
Container Apps and, eventually, AKS.
