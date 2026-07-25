# AKS Networking: LoadBalancer and Ingress

## Why this matters

Locally, `kind`/`minikube` faked `LoadBalancer` Services (or you used
port-forwarding/NodePort tricks) and any Ingress controller you installed
had no real public IP behind it. On AKS, a `LoadBalancer` Service actually
provisions an **Azure Load Balancer and a public IP address** — real,
billable infrastructure — and Ingress gets you a shared entry point
without one IP per Service. Understanding what's real infrastructure
versus what's "just YAML" here matters both for your bill and for
debugging.

## Concepts

**`Service` type `LoadBalancer` on AKS is not simulated.** When you
`kubectl apply` a Service with `type: LoadBalancer`, the in-cluster cloud
controller manager talks to Azure and provisions a real **Azure Load
Balancer** (Basic or Standard SKU depending on cluster networking mode)
plus a **public IP address** resource, and wires it to route traffic to
your Service's backing pods. Both the load balancer and the public IP are
billable Azure resources that persist until the Service (or cluster) is
deleted — this is different from local clusters where `type: LoadBalancer`
often just meant "pretend, use `kubectl port-forward` or a NodePort to
actually reach it."

**Ingress still works the same at the API level.** An `Ingress` object's
host/path routing rules are unchanged from local Kubernetes. What differs
is what serves as the ingress controller: on AKS you either install
**ingress-nginx** yourself (same Helm chart you used locally, which
itself provisions one `LoadBalancer` Service, and therefore one public IP,
shared across every Ingress you define), or use AKS's built-in **App
Routing add-on** (`az aks approuting enable`), a managed ingress-nginx
Azure operates for you.

**One IP for many Services vs. one IP per Service.** This is the core
economic and operational reason to prefer Ingress over multiple
`LoadBalancer` Services: N Services fronted by one Ingress controller need
only the controller's single public IP/load balancer, not N of them.

**DNS.** A public IP alone isn't a hostname. For real hostnames you'd
attach an Azure DNS zone or use the load balancer's auto-generated
`*.cloudapp.azure.com` label — this track uses the raw IP or that
auto-generated label for exercises rather than requiring you to own a
domain.

**What AKS manages vs. what you own:** Azure's cloud controller manager
handles the actual load balancer/public IP provisioning and keeps them in
sync with your Service objects. You own: which Services are `type:
LoadBalancer` (each one costs its own IP+LB), your Ingress routing rules,
which ingress controller (self-managed vs. App Routing add-on) you run,
and remembering to delete these Services/Ingress before deleting the
cluster's resource group if you want to avoid dangling public IP charges
in edge cases.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl expose` / Service manifest with `type: LoadBalancer` | Requests a real Azure Load Balancer + public IP | `kubectl expose deployment demo-app --type=LoadBalancer --port=80 --target-port=8080` |
| `kubectl get service -w` | Watches a Service until `EXTERNAL-IP` is assigned | `kubectl get service demo-app -w` |
| `az network public-ip list` | Lists public IP resources in a resource group (useful to see the IP behind a Service) | `az network public-ip list --resource-group MC_rg-aks-learn_aks-learn_eastus --output table` |
| `az aks approuting enable` | Enables the managed App Routing (ingress-nginx) add-on | `az aks approuting enable --resource-group rg-aks-learn --name aks-learn` |
| `az aks approuting disable` | Disables the App Routing add-on | `az aks approuting disable --resource-group rg-aks-learn --name aks-learn` |
| `helm install ingress-nginx ingress-nginx/ingress-nginx` | Installs a self-managed ingress-nginx controller (same as local track) | `helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace` |
| `kubectl get ingress` | Lists Ingress objects and their address | `kubectl get ingress` |
| `kubectl describe ingress` | Shows Ingress rule details and events | `kubectl describe ingress <name>` |
| `kubectl get service -n ingress-nginx` | Finds the ingress controller's own `LoadBalancer` Service and its external IP | `kubectl get service -n ingress-nginx` |
| `curl` | Tests reachability against the external IP/hostname | `curl http://<external-ip>/` |

## Hands-on exercises

1. **Expose a Deployment directly as `LoadBalancer`.** Reuse (or
   recreate) the Deployment from module 02/03. Apply a Service manifest
   with `type: LoadBalancer`. Watch it provision:
   `kubectl get service <name> -w`. Verify: `EXTERNAL-IP` moves from
   `<pending>` to a real IP address within a minute or two (press Ctrl+C
   once it appears).

2. **Confirm the real Azure resource behind it.** Run
   `az network public-ip list --resource-group MC_rg-aks-learn_aks-learn_eastus --output table`
   (adjust the `MC_...` name to match `az aks show`'s output if
   different). Verify: a public IP resource exists whose address matches
   the Service's `EXTERNAL-IP`.

3. **Reach it from outside the cluster.** Run
   `curl http://<external-ip>/` from your own machine (not from inside a
   pod). Verify: you get your application's response back, over the real
   internet, no port-forwarding involved — the first genuinely-public
   endpoint in this whole curriculum.

4. **Delete that Service and switch to Ingress instead.** Run
   `kubectl delete service <name>` (verify the public IP also disappears
   after a short delay — recheck with the same `az network public-ip
   list` command). Then enable the App Routing add-on:
   `az aks approuting enable --resource-group rg-aks-learn --name aks-learn`.
   Verify: `kubectl get pods -n app-routing-system` (or similar
   add-on namespace — check `kubectl get namespaces` for the exact name)
   shows ingress controller pods running.

5. **Create an Ingress routing to your app.** Change your app's Service
   back to `type: ClusterIP` (Ingress talks to ClusterIP Services), then
   write an `Ingress` manifest with a host/path rule pointing at it,
   using the ingress class the App Routing add-on registers (check with
   `kubectl get ingressclass`). Apply it and verify with
   `kubectl get ingress` that an `ADDRESS` gets populated.

6. **Reach your app through the Ingress.** `curl` the Ingress's address
   (with the `Host` header if you used a hostname rule:
   `curl -H "Host: demo.example.com" http://<ingress-ip>/`). Verify: same
   response as exercise 3, but now routed through Ingress instead of a
   dedicated LoadBalancer Service.

7. **Add a second app behind the same Ingress** to demonstrate the "one
   IP, many Services" model. Deploy a second small Deployment+ClusterIP
   Service, add a second path/host rule to the same (or a new) Ingress
   object, and verify both routes work via `curl` against the *same*
   external IP — confirming you didn't provision a second public IP for
   the second app.

8. **Diagnose and fix: Ingress not getting a public IP.** Deliberately
   create a second Ingress referencing an `ingressClassName` that doesn't
   exist (e.g. `nginx-typo`). Apply it and run `kubectl get ingress` —
   verify `ADDRESS` stays empty. Run `kubectl describe ingress
   <bad-name>` and look for events/conditions indicating no controller is
   claiming it (or check the ingress controller's own logs:
   `kubectl logs -n app-routing-system -l app.kubernetes.io/name=ingress-nginx --tail=50`
   as an alternative angle). Fix it by correcting `ingressClassName` to
   match `kubectl get ingressclass` output, re-apply, and confirm
   `ADDRESS` populates.

9. **Clean up.** Delete the test Ingress objects and Services you created:
   `kubectl delete ingress --all` and `kubectl delete service <any-leftover-LoadBalancer-services>`.
   Confirm no dangling public IPs remain:
   `az network public-ip list --resource-group MC_rg-aks-learn_aks-learn_eastus --output table`
   should no longer list ones tied to deleted Services. If you enabled
   App Routing only for this module and don't need it going forward,
   disable it: `az aks approuting disable --resource-group rg-aks-learn --name aks-learn`.
   If you're done with the cluster for the day, stop or delete it per
   module 01's cleanup commands.

## Common mistakes & troubleshooting

- **Creating one `LoadBalancer` Service per app "because it's easy."**
  Each one is its own public IP + load balancer charge. Prefer one
  Ingress controller fronting many Services once you have more than one
  or two apps to expose.
- **Forgetting to delete a `LoadBalancer` Service before tearing down a
  cluster in unusual ways.** Normally `az group delete` cleans up
  everything including public IPs in the `MC_*` group, but if you ever
  manage networking resources outside the standard flow, a public IP can
  be left orphaned and keep billing — always sanity check `az network
  public-ip list` in the `MC_*` resource group before assuming cleanup is
  complete.
- **Assuming Ingress "just has an IP" instantly.** Both the ingress
  controller's own Service provisioning and DNS/IP propagation take a
  little time; wait and re-check with `kubectl get ingress` /
  `kubectl get service -n <ingress-namespace>` rather than assuming
  failure after a few seconds.
- **Wrong `ingressClassName` (or none at all, with multiple controllers
  installed).** If more than one ingress controller exists in a cluster,
  an Ingress without an explicit class may go unclaimed. Always check
  `kubectl get ingressclass` for the exact name.
- **Cost pitfall: forgetting a `LoadBalancer` Service from an early
  exercise is still around.** `kubectl get service --all-namespaces` at
  the end of a session is a cheap habit that catches forgotten
  `LoadBalancer` Services (and their IPs) before they bill you overnight.

## Checkpoint quiz

1. What real Azure resources get created when you apply a Service with
   `type: LoadBalancer` on AKS, and how is that different from a local
   kind/minikube cluster?
2. Why is Ingress generally cheaper than N `LoadBalancer` Services for N
   apps?
3. What's the difference between the App Routing add-on and installing
   ingress-nginx yourself via Helm?
4. If `kubectl get ingress` shows an empty `ADDRESS` column, what are two
   things you'd check?
5. Why does an Ingress route to a `ClusterIP` Service rather than a
   `LoadBalancer` Service?
6. What command would you run to make sure you haven't left any public
   IPs behind after cleaning up Services?

<details>
<summary>Show answers</summary>

1. An Azure Load Balancer and a public IP address resource, both real and
   billed. Locally, `type: LoadBalancer` typically had no real cloud
   infrastructure behind it at all (often just simulated or requiring
   port-forwarding/NodePort workarounds).
2. Because one ingress controller (and its one `LoadBalancer`
   Service/public IP) can route to many backend Services by host/path, so
   you pay for one IP+LB regardless of how many apps sit behind it,
   instead of one IP+LB per app.
3. The App Routing add-on is a version of ingress-nginx that Azure
   installs, manages, and upgrades for you as part of the cluster;
   installing ingress-nginx yourself via Helm gives you the same
   functionality but you own its lifecycle (upgrades, configuration,
   troubleshooting its pods) directly.
4. Whether the `ingressClassName` on the Ingress actually matches an
   existing `IngressClass` (`kubectl get ingressclass`), and whether the
   ingress controller's own Service has successfully gotten an external
   IP (`kubectl get service -n <ingress-namespace>`).
5. Because the ingress controller itself is the single externally-exposed
   entry point (it owns the `LoadBalancer` Service/public IP); it then
   routes internally to backend Services, which only need to be reachable
   inside the cluster, i.e. `ClusterIP`.
6. `az network public-ip list --resource-group <MC_* resource group> --output table`,
   compared against `kubectl get service --all-namespaces` to confirm
   every remaining public IP is backing a Service you still intend to
   keep.

</details>

## Next

[05-scaling-aks-cluster-autoscaler-and-hpa](../05-scaling-aks-cluster-autoscaler-and-hpa/README.md)
— let your cluster grow and shrink automatically, both at the pod and
node level.
