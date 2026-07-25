# Scaling AKS: Cluster Autoscaler and HPA

## Why this matters

You already know the Horizontal Pod Autoscaler (HPA) from the Kubernetes
track — it adds/removes *pod replicas* based on load. But on a small,
fixed-size AKS node pool, the HPA can want more pods than the existing
nodes can physically fit. AKS's **Cluster Autoscaler** solves the other
half of the problem: adding/removing *nodes* based on demand. Combining
both is how a real cluster elastically handles load without you manually
resizing anything — and without paying for idle capacity when load drops.

## Concepts

**HPA scales pods; Cluster Autoscaler scales nodes.** These operate at
different layers and you typically want both, together, for a workload
that needs to handle variable traffic: HPA reacts first (fast, seconds to
a couple minutes) by changing replica count against a metric (CPU%,
memory, or a custom metric); if the extra replicas don't fit on existing
nodes, they go `Pending`, and Cluster Autoscaler notices unschedulable
pods and adds a node to your pool (slower, a few minutes, since it's
provisioning a real VM) so they can schedule.

**Cluster Autoscaler is per-node-pool, with a min/max range.** You enable
it with a floor and ceiling node count; Azure adds nodes up to the max
when pods can't be scheduled, and removes nodes back down toward the min
when they've been underutilized for a while (it's conservative about
scaling down — it won't remove a node that has pods on it it can't safely
evict, e.g. pods without a controller, or ones violating a
PodDisruptionBudget).

**Why the max matters for cost.** Cluster Autoscaler's ceiling is also
your cost ceiling — every additional node it's allowed to add is another
billable VM. For a learning cluster, keep the max small (e.g. 3-4) so an
autoscaling experiment (or an HPA misconfiguration) can't accidentally
scale you into a large, expensive fleet of nodes overnight.

**HPA still needs metrics-server**, exactly as on your local cluster —
already present on AKS by default (you confirmed this in module 02 with
`kubectl top`).

**What AKS manages vs. what you own:** Azure runs the Cluster Autoscaler
controller for you (you don't install or operate it) and handles the
actual VM provisioning/deprovisioning when it decides to scale. You still
own: the min/max bounds you set (cost/capacity tradeoff), your HPA target
metrics and thresholds, and your Pods' resource requests (Cluster
Autoscaler's scheduling-fit decisions are driven by requests, same as the
scheduler itself — under-requesting starves pods, over-requesting
triggers unnecessary node adds).

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az aks nodepool update --enable-cluster-autoscaler` | Turns on the Cluster Autoscaler for a node pool with min/max bounds | `az aks nodepool update --resource-group rg-aks-learn --cluster-name aks-learn --name nodepool1 --enable-cluster-autoscaler --min-count 1 --max-count 3` |
| `az aks nodepool update --disable-cluster-autoscaler` | Turns it off | `az aks nodepool update --resource-group rg-aks-learn --cluster-name aks-learn --name nodepool1 --disable-cluster-autoscaler` |
| `az aks nodepool update --update-cluster-autoscaler` | Changes min/max bounds without disabling/re-enabling | `az aks nodepool update --resource-group rg-aks-learn --cluster-name aks-learn --name nodepool1 --update-cluster-autoscaler --min-count 1 --max-count 4` |
| `az aks nodepool show` | Shows a node pool's config including autoscaler state | `az aks nodepool show --resource-group rg-aks-learn --cluster-name aks-learn --name nodepool1 --output table` |
| `kubectl autoscale deployment` | Creates an HPA imperatively | `kubectl autoscale deployment demo-app --cpu-percent=50 --min=1 --max=10` |
| `kubectl get hpa -w` | Watches HPA current/target metrics and replica counts | `kubectl get hpa -w` |
| `kubectl describe hpa` | Shows HPA scaling events/decisions | `kubectl describe hpa <name>` |
| `kubectl get nodes -w` | Watches node count change as Cluster Autoscaler acts | `kubectl get nodes -w` |
| `kubectl top pods` | Shows live CPU/memory per pod, useful to watch HPA's input metric | `kubectl top pods` |

## Hands-on exercises

1. **Enable Cluster Autoscaler on your node pool.** Find its name
   (`az aks nodepool list --resource-group rg-aks-learn --cluster-name aks-learn --output table`),
   then run:
   ```
   az aks nodepool update --resource-group rg-aks-learn --cluster-name aks-learn \
     --name nodepool1 --enable-cluster-autoscaler --min-count 1 --max-count 3
   ```
   Verify: `az aks nodepool show --resource-group rg-aks-learn --cluster-name aks-learn --name nodepool1 --output table`
   shows autoscaling enabled with the min/max you set.

2. **Deploy a CPU-hungry test app with an HPA.** Deploy a small
   Deployment with a modest CPU request (e.g. `100m`) running something
   that can be made to burn CPU (a simple busy-loop app, or `stress` in a
   container). Create an HPA targeting it:
   `kubectl autoscale deployment <name> --cpu-percent=50 --min=1 --max=10`.
   Verify: `kubectl get hpa` shows the HPA with a real (not `<unknown>`)
   current CPU percentage after a minute.

3. **Generate load and watch the HPA react.** Drive CPU load against
   your app (e.g. run several `kubectl exec` busy-loops, or a load tool
   from inside the cluster). Watch `kubectl get hpa -w` — verify
   `REPLICAS` climbs as the current CPU% exceeds the 50% target.

4. **Watch Cluster Autoscaler kick in.** As HPA pushes replica count up
   past what your existing nodes can fit, some new pods will go
   `Pending` (check with `kubectl get pods -o wide`). Watch
   `kubectl get nodes -w` — verify a new node appears (this can take a
   few minutes, since it's a real VM provisioning) and the previously
   `Pending` pods move to `Running` once it's ready.

5. **Stop the load and watch it scale back down.** Remove the load
   generator. Watch `kubectl get hpa -w` — verify replica count drops
   back down after HPA's stabilization window. Then watch
   `kubectl get nodes -w` over a longer period (Cluster Autoscaler is
   conservative — scale-down typically waits several minutes of
   sustained low utilization before removing a node) — verify the node
   count eventually returns toward your `--min-count`.

6. **Check the cost-relevant ceiling.** Run
   `az aks nodepool show --resource-group rg-aks-learn --cluster-name aks-learn --name nodepool1 --query "[autoScalerProfile,maxCount,minCount]"`
   (or inspect the full `show` output) and confirm your `--max-count`
   is still the small number you set — this is your safety ceiling
   against a runaway scale-out.

7. **Diagnose and fix: HPA shows `<unknown>` for targets.** Deliberately
   remove the CPU request from your test Deployment's container spec
   (`resources.requests.cpu`) and re-apply. Run `kubectl describe hpa
   <name>` — verify it reports something like "missing request for cpu"
   or fails to compute a percentage, because HPA's CPU-percentage target
   is relative to the pod's *request*, not an absolute number. Fix it by
   restoring a CPU request and re-applying; confirm `kubectl get hpa`
   shows a real percentage again within a minute.

8. **Clean up.** Delete the test HPA, Deployment, and any load-generator
   pods: `kubectl delete hpa <name>`, `kubectl delete deployment <name>`.
   Consider lowering `--max-count` back to `1`, or disabling the
   autoscaler entirely if you're not using it further this session:
   `az aks nodepool update --resource-group rg-aks-learn --cluster-name aks-learn --name nodepool1 --disable-cluster-autoscaler`,
   then manually scale back to your usual 2 nodes with `az aks scale` if
   Cluster Autoscaler left you at a different count. If you're done for
   the day, stop or delete the cluster per module 01.

## Common mistakes & troubleshooting

- **Setting `--max-count` too high "to be safe."** Every extra node
  Cluster Autoscaler is *allowed* to add is a node it *might* add and
  bill you for, if load (or a misconfigured HPA) demands it. Keep the
  ceiling tight for a learning cluster.
- **Forgetting CPU requests on the scaled Deployment.** Both HPA
  CPU-percent targets and Cluster Autoscaler's scheduling-fit decisions
  are driven by requests, not real-time usage alone. No request means
  broken or unpredictable scaling in both places.
- **Expecting instant node scale-down.** Cluster Autoscaler intentionally
  waits out a stabilization period before removing nodes, to avoid
  flapping. Don't assume it's broken if node count doesn't drop the
  moment load ends — give it several minutes.
- **Confusing HPA min/max with Cluster Autoscaler min/max.** They bound
  different things (pod replicas vs. node count) and are configured with
  entirely different commands (`kubectl autoscale` /HPA manifest vs.
  `az aks nodepool update`). Mixing them up leads to debugging the wrong
  layer.
- **Cost pitfall: leaving Cluster Autoscaler enabled with a generous max
  and forgetting a load test is still hammering the cluster.** Always
  confirm your load generator is actually stopped (`kubectl get pods` —
  no stray busy-loop pods) before walking away, and re-check node count
  before ending a session.

## Checkpoint quiz

1. What's the difference between what HPA scales and what Cluster
   Autoscaler scales?
2. Why does an HPA-driven scale-up sometimes require Cluster Autoscaler
   to also act, and what's the visible sign in `kubectl get pods` while
   waiting?
3. Why is Cluster Autoscaler's `--max-count` a cost control, not just a
   capacity control?
4. Why does HPA need CPU *requests* set on the target Deployment to
   compute a CPU percentage?
5. Why is Cluster Autoscaler's scale-down intentionally slower/more
   conservative than its scale-up?
6. What command changes Cluster Autoscaler's min/max bounds without
   fully disabling and re-enabling it?

<details>
<summary>Show answers</summary>

1. HPA scales the number of pod replicas for a workload based on a
   metric (e.g. CPU%). Cluster Autoscaler scales the number of nodes in
   a node pool based on whether pods can be scheduled.
2. Because HPA can create more replicas than existing nodes have room
   for; those extra pods sit `Pending` until Cluster Autoscaler notices
   and provisions a new node for them to schedule onto. The visible sign
   is pods in `Pending` state in `kubectl get pods -o wide` with no node
   assigned.
3. Because every additional node the autoscaler is permitted to add is a
   real, billable Azure VM — the max is effectively the most you're
   willing to let automatic scaling spend, independent of whether the
   load turns out to be real traffic or a misconfiguration.
4. Because HPA's `--cpu-percent` target is calculated as (current usage)
   / (requested CPU) — with no request, there's no denominator, so HPA
   can't compute a meaningful percentage and reports the target as
   unknown.
5. To avoid "flapping" — rapidly adding and removing nodes in response to
   short-lived dips in load, which would be both disruptive (evicting
   pods) and not actually cost-effective given node provisioning isn't
   instantaneous either.
6. `az aks nodepool update --update-cluster-autoscaler` with new
   `--min-count`/`--max-count` values.

</details>

## Next

[06-monitoring-aks-azure-monitor-container-insights](../06-monitoring-aks-azure-monitor-container-insights/README.md)
— see what's happening across your cluster with real observability
tooling instead of ad hoc `kubectl` commands.
