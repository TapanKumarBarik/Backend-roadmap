# Monitoring AKS: Azure Monitor & Container Insights

## Why this matters

So far you've debugged everything with `kubectl describe`, `kubectl logs`,
and `kubectl top` — fine for one cluster you're staring at directly, but
it doesn't scale to "what happened at 3am" or "which pod is slowly
leaking memory over days." **Container Insights** (part of Azure Monitor)
collects logs and metrics from your cluster into a queryable, persistent
store, so you can investigate after the fact and set up alerts instead of
watching a terminal.

## Concepts

**Azure Monitor** is Azure's umbrella observability service across all
resource types; **Container Insights** is the AKS/Kubernetes-specific
feature built on top of it. Enabling it deploys an agent (the Azure
Monitor Metrics/Logs agent, running as a DaemonSet — one pod per node) to
your cluster, which ships container logs, node/pod metrics, and inventory
data to a **Log Analytics workspace**.

**Log Analytics workspace** is where the data actually lives — a
queryable store you search with **KQL (Kusto Query Language)**, similar
in spirit to `kubectl logs` but across every pod, over any historical
time range you retain, with real filtering/aggregation instead of grep.

**This is additive, not a replacement for `kubectl`.** You'll still use
`kubectl describe`/`kubectl logs` for "what's wrong with this pod right
now." Container Insights is for "what happened across the whole cluster
over the last day," "show me every pod that OOM-killed this week," or
setting up an alert that pages you without you watching anything.

**Retention and cost.** Log Analytics bills for data ingested and for
retention beyond the free default window. A busy cluster logging
verbosely can generate meaningful log volume — this is a real,
easy-to-overlook cost knob distinct from node/LB/disk costs you've
already met.

**What AKS manages vs. what you own:** enabling Container Insights is a
one-command, Azure-managed agent deployment and pipeline — you don't
write log-shipping config yourself. You still own: which Log Analytics
workspace you point at (and its retention/cost settings), what queries
and alerts you build on top of the collected data, and remembering to
disable/detach monitoring (and clean up the workspace) when you're done
with a learning cluster, since the workspace persists independently of
the AKS cluster's own lifecycle in some setups.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az aks enable-addons -a monitoring` | Enables Container Insights on an existing cluster | `az aks enable-addons --resource-group rg-aks-learn --name aks-learn --addons monitoring` |
| `az aks disable-addons -a monitoring` | Disables it | `az aks disable-addons --resource-group rg-aks-learn --name aks-learn --addons monitoring` |
| `az monitor log-analytics workspace create` | Creates a Log Analytics workspace explicitly (otherwise one is created/reused automatically) | `az monitor log-analytics workspace create --resource-group rg-aks-learn --workspace-name law-aks-learn` |
| `az monitor log-analytics workspace list` | Lists workspaces in the subscription | `az monitor log-analytics workspace list --output table` |
| `az aks show --query addonProfiles.omsagent` | Confirms the monitoring add-on's status and which workspace it's wired to | `az aks show --resource-group rg-aks-learn --name aks-learn --query addonProfiles.omsagent` |
| `kubectl get pods -n kube-system -l component=oms-agent` | Confirms the monitoring DaemonSet pods are running | `kubectl get pods -n kube-system -l component=oms-agent` |
| (Azure Portal) Container Insights views | Live/historical dashboards: node/pod CPU-memory, logs, workbooks | — |
| (Azure Portal) Log Analytics "Logs" blade, KQL query | Query collected container logs/metrics | `ContainerLogV2 \| where PodNamespace == "demo" \| take 50` |
| `az monitor log-analytics workspace delete` | Deletes a Log Analytics workspace | `az monitor log-analytics workspace delete --resource-group rg-aks-learn --workspace-name law-aks-learn --yes` |

## Hands-on exercises

1. **Enable Container Insights on your cluster.** Run
   `az aks enable-addons --resource-group rg-aks-learn --name aks-learn --addons monitoring`.
   This creates (or reuses) a default Log Analytics workspace if you
   don't specify one. Verify:
   `az aks show --resource-group rg-aks-learn --name aks-learn --query addonProfiles.omsagent.enabled`
   returns `true`.

2. **Confirm the agent is running.** Run
   `kubectl get pods -n kube-system -l component=oms-agent -o wide`.
   Verify: one agent pod per node, all `Running`.

3. **Find your Log Analytics workspace.** Run
   `az monitor log-analytics workspace list --resource-group rg-aks-learn --output table`
   (it may live in a different resource group depending on how it was
   auto-created — check `az aks show ... --query addonProfiles.omsagent.config`
   for the exact workspace resource ID if it's not where you expect).
   Note the workspace name for the portal exercises below.

4. **Generate some real log data.** Deploy a small app (reuse one from
   earlier modules) that logs something identifiable, e.g.
   `echo "hello from $(hostname)"` in a loop. Let it run for a few
   minutes so data has time to ship (ingestion typically lags live by a
   few minutes, unlike `kubectl logs` which is immediate).

5. **Query it in the portal.** In the Azure Portal, open your Log
   Analytics workspace → **Logs**, and run a KQL query against the
   `ContainerLogV2` table filtered to your namespace/pod, e.g.:
   `ContainerLogV2 | where PodNamespace == "demo" | order by TimeGenerated desc | take 50`.
   Verify: you see your app's log lines, with timestamps, queryable in a
   way `kubectl logs` alone doesn't give you (e.g. across pod restarts,
   or across multiple pods at once).

6. **Look at the Container Insights dashboards.** In the portal, open
   your AKS cluster resource → **Insights** (or **Monitoring** →
   **Insights**). Verify: you can see node CPU/memory over time, a list
   of pods with their status, and container-level resource usage — the
   same kind of data `kubectl top` gives you live, now with history.

7. **Diagnose using Container Insights instead of `kubectl`.**
   Deliberately cause a pod failure you can investigate after the fact:
   deploy a Deployment with a container that exits after a short sleep
   (causing `CrashLoopBackOff`), let it crash a few times, then
   investigate it two ways: first with `kubectl describe pod` /
   `kubectl logs --previous` (what you already know), then find the same
   failure in the portal's Insights view or via a KQL query against
   `KubePodInventory`/`ContainerLogV2` filtered to that pod name — confirm
   you can see the crash history there too, which is useful once a pod
   has been deleted and `kubectl logs --previous` no longer has anything
   to show.

8. **Set up a basic alert (optional but recommended).** In the portal,
   under your Log Analytics workspace or the AKS cluster's **Alerts**
   blade, create a simple metric alert (e.g. node CPU percentage above a
   threshold for 5 minutes) so you experience the alerting side, not just
   dashboards. Verify: the alert rule is listed as enabled; you don't
   need to actually trigger it.

9. **Clean up.** Delete the crash-looping test Deployment:
   `kubectl delete deployment <name>`. Container Insights and its
   Log Analytics workspace are relatively low-cost at small scale, but
   they do accrue ingestion/retention charges over time — if you're done
   with monitoring for now, disable the add-on
   (`az aks disable-addons --resource-group rg-aks-learn --name aks-learn --addons monitoring`)
   and consider deleting the workspace if you created a dedicated one
   just for this exercise
   (`az monitor log-analytics workspace delete --resource-group rg-aks-learn --workspace-name <name> --yes`).
   Note that disabling the add-on stops new data collection but does not
   by itself delete already-ingested data or the workspace — delete the
   workspace explicitly if you want that gone too.

## Common mistakes & troubleshooting

- **Expecting portal data instantly.** Ingestion lag means log/metric
  data can take a few minutes to appear after being generated — don't
  conclude monitoring is broken after checking 10 seconds later.
- **Not knowing which Log Analytics workspace got created.** If you
  enable monitoring without specifying `--workspace-resource-id`, Azure
  auto-creates or reuses a default one, sometimes in a different resource
  group than expected — always confirm with `az aks show --query
  addonProfiles.omsagent.config` rather than guessing.
- **Treating Container Insights as a replacement for `kubectl describe`.**
  It's complementary — for "why is this pod behaving oddly right now,"
  `kubectl` is still faster; for historical/aggregate questions,
  Container Insights is the right tool.
- **Verbose application logging left on indefinitely.** Every log line
  your app writes is a candidate for ingestion cost once Container
  Insights is enabled. Debug-level logging that was harmless with
  `kubectl logs` (ephemeral, free) has a real, ongoing cost once shipped
  to Log Analytics continuously.
- **Cost pitfall: an orphaned Log Analytics workspace outliving the
  cluster.** Because the workspace is a separate Azure resource from the
  AKS cluster, deleting the cluster's resource group does not
  automatically delete a workspace that lives in a different resource
  group. Explicitly check `az monitor log-analytics workspace list
  --output table` across your subscription when doing final cleanup.

## Checkpoint quiz

1. What's the relationship between Azure Monitor, Container Insights, and
   a Log Analytics workspace?
2. What does Container Insights give you that `kubectl logs`/`kubectl
   top` alone don't?
3. Why might data not appear in the portal the instant you generate it?
4. Name one situation where you'd still prefer `kubectl describe pod`
   over a KQL query, and one where you'd prefer the KQL query.
5. Why can a Log Analytics workspace outlive the AKS cluster it was
   monitoring, cost-wise?
6. What table would you query in Log Analytics to see shipped container
   log lines?

<details>
<summary>Show answers</summary>

1. Azure Monitor is the overall observability platform; Container
   Insights is its AKS/Kubernetes-specific feature that collects
   cluster logs/metrics; the collected data is stored in and queried
   from a Log Analytics workspace.
2. Historical retention (data survives pod restarts/deletion), the
   ability to query across many pods/namespaces at once with KQL, portal
   dashboards, and the ability to configure alerts — none of which
   `kubectl logs`/`kubectl top` provide on their own (they're live-only,
   single-resource views).
3. Because there's an ingestion lag between data being generated on the
   node and it being shipped, processed, and indexed in the workspace —
   typically a few minutes, not instant.
4. `kubectl describe pod` is faster for "what's wrong with this specific
   pod right now" while it's still running/recent; a KQL query is
   better for "show me this failure pattern across time or across many
   pods," especially once a pod has already been deleted and
   `kubectl logs --previous` has nothing left to show.
5. Because the Log Analytics workspace is its own Azure resource
   (potentially in its own resource group) with its own billing for
   ingestion and retention — deleting the AKS cluster's resource group
   doesn't automatically delete a workspace living elsewhere.
6. `ContainerLogV2` (the current container log table used by Container
   Insights).

</details>

## Next

[07-security-aks-aad-rbac-and-keyvault](../07-security-aks-aad-rbac-and-keyvault/README.md)
— lock down who can do what on your cluster and stop putting secrets
directly in Kubernetes Secret objects.
