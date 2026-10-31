# Monitoring & Log Analytics

## Why this matters

You can't operate what you can't see. When a revision won't start, a scale rule
won't fire, or a Dapr call fails, the answer is in the logs and metrics — and
in Container Apps those flow to the Log Analytics workspace you wired up back in
module 01. Knowing which log table holds what, how to query it with KQL, and
how to alert on it is the difference between guessing and diagnosing. It's also
where log-volume cost either stays sane or quietly balloons.

## Concepts

### Console logs vs. system logs

ACA separates two log streams. **Console logs** are your container's
stdout/stderr — application output, exactly what you'd see with
`docker logs` or `kubectl logs`. **System logs** are the platform's events
about your app — revision provisioning, scaling decisions, image pull results,
health probe outcomes. When a revision is "stuck" or a scale rule "never
fires," the *system* log usually explains why, while the *console* log tells
you what your code did. Both land in Log Analytics, in different tables.

### Live streaming vs. querying history

For real-time debugging, `az containerapp logs show --follow` streams a
replica's console logs live, like `kubectl logs -f` — great during an active
incident. For anything historical or aggregated ("how many 500s in the last
hour across all revisions?"), you query the **Log Analytics workspace** with
**KQL** (Kusto Query Language). Streaming is immediate but ephemeral and
per-replica; the workspace is durable, cross-replica, and queryable — at the
cost of a short ingestion delay and per-GiB billing.

### The Log Analytics tables

Container Apps writes to specific tables in the workspace. The main ones:
**`ContainerAppConsoleLogs_CL`** (your stdout/stderr) and
**`ContainerAppSystemLogs_CL`** (platform events). You query them with KQL —
filter by `ContainerAppName_s`, `RevisionName_s`, time range, and log message.
This is the same Log Analytics/KQL used across Azure for container logs — the
same tooling you'll point at an AKS cluster's container insights in track 07,
just aimed at ACA tables here. (Table names carry the `_CL` custom-log suffix and
column names carry type suffixes like `_s` for string — a Log Analytics
convention.)

### Metrics vs. logs

Separate from logs, ACA emits **metrics** (Azure Monitor metrics): replica
count, CPU/memory usage, request count, and request latency, per app and per
revision. Metrics are cheap, near-real-time numeric time series — ideal for
dashboards and for autoscaling insight ("did replica count actually track my
load?"). Logs are richer but heavier. Rule of thumb: use **metrics** to see
*that* something happened (a spike, a scale event), use **logs** to see *why*.

### Alerts and cost awareness

You can attach **alert rules** to metrics (e.g. replica count pinned at max, or
elevated 5xx) or to **log queries** (a scheduled KQL query that fires when it
returns rows) via Azure Monitor, routing to an **action group** (email,
webhook, etc.). The cost caveat lives here too: **Log Analytics bills per GiB
ingested and retained**, so verbose apps at scale, long retention, and
frequent log-query alerts all add cost. Sending only what you need, setting
sane retention, and preferring metric alerts over high-frequency log-query
alerts keeps the monitoring bill down.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az containerapp logs show` | Stream/print a replica's console logs | `az containerapp logs show --name web --resource-group rg-aca-m07 --follow --tail 50` |
| `az containerapp logs show` (system) | Show system logs | `az containerapp logs show --name web --resource-group rg-aca-m07 --type system` |
| `az monitor log-analytics query` | Run a KQL query against the workspace | see below |
| `az monitor metrics list` | List metrics for the app resource | `az monitor metrics list --resource <appId> --metric Replicas --interval PT1M -o table` |
| `az monitor metrics alert create` | Create a metric alert | see below |
| `az containerapp env show` (workspace id) | Get the workspace customer ID | `az containerapp env show --name env-m07 --resource-group rg-aca-m07 --query properties.appLogsConfiguration.logAnalyticsConfiguration.customerId -o tsv` |

Flag-by-flag breakdowns:

`az containerapp logs show --name web --resource-group rg-aca-m07 --follow --tail 50`
- `--follow` — stream live (Ctrl-C to stop).
- `--tail 50` — start by showing the last 50 lines.
- (add `--type system` to view platform/system logs instead of console.)

`az monitor log-analytics query --workspace <customerId> --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == 'web' | take 20"`
- `--workspace <customerId>` — the workspace GUID (from the env-show query above).
- `--analytics-query "..."` — the KQL. `ContainerAppConsoleLogs_CL` = console table; filter by `ContainerAppName_s`; `take 20` caps rows.

`az monitor metrics alert create --name maxrep --resource-group rg-aca-m07 --scopes <appId> --condition "avg Replicas > 4" --window-size 5m --evaluation-frequency 1m --action <actionGroupId>`
- `--scopes <appId>` — the container app resource to watch.
- `--condition "avg Replicas > 4"` — fire when average replica count exceeds 4 (e.g. pinned near max).
- `--window-size 5m` / `--evaluation-frequency 1m` — evaluate the 5-minute average every minute.
- `--action <actionGroupId>` — action group to notify.

## Hands-on exercises

1. **Set up group, Environment (note the workspace), and an app.**
   ```powershell
   az group create --name rg-aca-m07 --location eastus
   az containerapp env create --name env-m07 --resource-group rg-aca-m07 --location eastus
   az containerapp create --name web --resource-group rg-aca-m07 --environment env-m07 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external `
     --min-replicas 0 --max-replicas 5 --scale-rule-http-concurrency 10
   ```

2. **Stream console logs live.**
   ```powershell
   az containerapp logs show --name web --resource-group rg-aca-m07 --follow --tail 30
   ```
   In another terminal, `curl` the FQDN a few times and watch requests appear.
   Ctrl-C to stop.

3. **View system logs.**
   ```powershell
   az containerapp logs show --name web --resource-group rg-aca-m07 --type system --tail 40
   ```
   Verify you see platform events (revision created, scaling, etc.) — distinct
   from your app's stdout.

4. **Get the workspace ID and run your first KQL query.**
   ```powershell
   $ws = az containerapp env show --name env-m07 --resource-group rg-aca-m07 `
     --query properties.appLogsConfiguration.logAnalyticsConfiguration.customerId -o tsv
   az monitor log-analytics query --workspace $ws `
     --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == 'web' | project TimeGenerated, Log_s | take 20" -o table
   ```
   Verify rows return. (There's an ingestion delay of a few minutes — if empty,
   generate traffic and wait.)

5. **Query system logs for scaling events.**
   ```powershell
   az monitor log-analytics query --workspace $ws `
     --analytics-query "ContainerAppSystemLogs_CL | where ContainerAppName_s == 'web' | project TimeGenerated, Reason_s, Log_s | order by TimeGenerated desc | take 30" -o table
   ```
   Look for scaling/provisioning reasons. This table is your first stop for
   "why did/didn't it scale or start?"

6. **Look at metrics.**
   ```powershell
   $appId = az containerapp show --name web --resource-group rg-aca-m07 --query id -o tsv
   az monitor metrics list --resource $appId --metric Replicas --interval PT1M -o table
   ```
   Generate load (module 03's parallel curl), then re-run and confirm the
   Replicas metric climbs — cross-check it against what the system logs said.

7. **Aggregate with KQL.** Count console log lines per revision in the last
   hour:
   ```powershell
   az monitor log-analytics query --workspace $ws `
     --analytics-query "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1h) | summarize count() by RevisionName_s" -o table
   ```
   Verify a per-revision breakdown. This is the cross-replica, historical view
   streaming can't give you.

8. **Create a metric alert (optional action group).**
   ```powershell
   az monitor metrics alert create --name maxrep-web --resource-group rg-aca-m07 `
     --scopes $appId --condition "avg Replicas > 4" `
     --window-size 5m --evaluation-frequency 1m
   ```
   Verify with `az monitor metrics alert list --resource-group rg-aca-m07 -o table`.
   (Attach an action group with `--action` if you want notifications.)

9. **Diagnose and fix (integrative): a revision that won't start.** Ship a
   broken revision and use logs to find out why:
   ```powershell
   az containerapp update --name web --resource-group rg-aca-m07 --image mcr.microsoft.com/k8se/quickstart:nope
   az containerapp revision list --name web --resource-group rg-aca-m07 -o table
   az containerapp logs show --name web --resource-group rg-aca-m07 --type system --tail 40
   az monitor log-analytics query --workspace $ws `
     --analytics-query "ContainerAppSystemLogs_CL | where ContainerAppName_s == 'web' | order by TimeGenerated desc | take 20" -o table
   ```
   The **system** log/table reveals the image-pull failure (the console log
   won't, because the container never started). **Fix** by updating back to a
   valid image tag and confirm the revision goes healthy.

10. **Check the cost surface.** In the Portal, open the Log Analytics workspace
    → Usage and estimated costs, or query ingestion volume. Note how much data
    your experiments produced. In notes, write one sentence on how you'd reduce
    it (less verbose logging, shorter retention, metric alerts over log-query
    alerts).

11. **Cleanup.**
    ```powershell
    az group delete --name rg-aca-m07 --yes --no-wait
    ```

## Independent challenge

Instrument a running app so you can answer three questions with evidence: (1)
did it scale under load, (2) how many requests errored in the last 30 minutes,
and (3) why did its most recent revision reach its current state. Use metrics
for (1), a KQL query against the console table for (2), and the system table
for (3). Combine this module with **module 03**: drive the app with a load
generator and correlate the Replicas *metric* with the scaling *system-log*
events on the same timeline. Note the workspace's approximate ingestion cost
for the exercise, then delete the resource group.

<details><summary>Stuck? One hint</summary>

The correlation trick is aligning timestamps: `az monitor metrics list ...
--metric Replicas --interval PT1M` gives per-minute replica counts, and a KQL
query on `ContainerAppSystemLogs_CL | order by TimeGenerated desc` gives the
scaling events with `TimeGenerated`. Line the two up by minute and you can see
the scale decision and its effect side by side.

</details>

## Common mistakes & troubleshooting

- **Looking in the wrong log stream.** A container that never started produces
  no console logs; the reason is in the **system** logs/table. Check system
  logs for start/provisioning/pull failures.
- **Expecting instant KQL results.** Log Analytics has an ingestion delay of a
  few minutes. An empty query right after an event usually means "wait," not
  "nothing happened."
- **Wrong workspace ID.** `az monitor log-analytics query` needs the
  workspace's **customer ID** (GUID), which you read from the Environment — not
  the workspace's resource name.
- **Confusing metrics and logs.** Metrics tell you *that* replicas scaled;
  logs tell you *why*. Reaching for logs to get a simple replica count is
  slower and pricier.
- **Cost pitfall: verbose logging + long retention + log-query alerts.** All
  three drive Log Analytics ingestion/retention cost. Trim log verbosity, set
  sane retention, and prefer metric alerts over frequent scheduled log queries.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Console logs vs. system logs — what's in each, and which do you check for a
   revision stuck provisioning?
2. When would you use `logs show --follow` vs. a KQL query in Log Analytics?
3. Name the two main Log Analytics tables ACA writes to and what each holds.
4. What identifier does `az monitor log-analytics query --workspace` expect,
   and where do you get it?
5. Metrics vs. logs: which answers "did it scale?" and which answers "why did
   it scale?"
6. Give three things that increase your Log Analytics bill.
7. Your KQL query returns nothing right after an incident. What are the two
   likely explanations?

<details><summary>Show answers</summary>

1. Console = container stdout/stderr (your app output); system = platform
   events (provisioning, scaling, image pulls, probes). For a stuck/failed
   revision, check **system** logs — the container may never have produced
   console output.
2. `--follow` for live, real-time debugging of a replica during an active
   incident; KQL for historical, aggregated, cross-replica analysis.
3. `ContainerAppConsoleLogs_CL` (stdout/stderr) and
   `ContainerAppSystemLogs_CL` (platform/system events).
4. The workspace's **customer ID** (a GUID), read from the Environment
   (`properties.appLogsConfiguration.logAnalyticsConfiguration.customerId`) —
   not the workspace resource name.
5. Metrics answer "did it scale?" (replica-count time series); logs answer
   "why?" (system-log scaling reasons).
6. Any three of: high log verbosity/volume, high app scale (many replicas
   logging), long retention, and frequent scheduled log-query alerts.
7. Ingestion delay (data not yet queryable — wait a few minutes), or you're
   querying the wrong table/filter/time-range (or wrong workspace ID).

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix
concepts from modules 04–07.

1. An internal-only Environment hosts an app with `--ingress external` that
   reads a Key Vault secret via managed identity. Requests from your laptop
   fail. List the two independent things that could each cause this and how
   you'd tell them apart.
2. You canary a new revision to 10% (module 05) and it errors. Which log
   stream/table tells you whether the failure is your code vs. the platform,
   and what metric confirms the blast radius stayed at ~10%?
3. A queue worker in a VNet-integrated Environment isn't scaling. Give one
   networking cause (module 04) and one KEDA cause (module 03), and which
   log/table you'd check for each.
4. You rotate a database password in Key Vault. Do you need to redeploy the
   app? Why or why not (module 06)?
5. Design: two apps must call each other privately and you must be able to
   verify the calls and their latency. Which module-05 feature enables the
   calls, which module-04 property must both apps share, and which module-07
   tools verify them?
6. A role assignment was just granted but the new revision still returns
   forbidden from Key Vault. Give the module-06 reason and the module-07 way to
   confirm it in the logs.
7. Cost audit: name one recurring cost from module 04, one from module 06, and
   one from module 07, and how you'd minimize each.
8. Traffic is split 50/50 across two revisions; one revision is far slower.
   Which metric (per revision) exposes this, and how would you shift traffic
   to mitigate (naming the module-05 command)?
9. You need an alert when an app pins at max replicas for 5 minutes. Metric or
   log alert? Write the condition in words and say why this choice is cheaper.
10. Trace a Dapr invocation failure end to end: which app-id concept (module
    05), which Environment boundary (module 01/04), and which table (module 07)
    would you inspect, in order.

<details><summary>Show answers</summary>

1. (a) The **Environment is internal-only**, so an "external" app is private
   and unreachable from your laptop regardless of the secret (module 04); (b) a
   **missing role assignment** makes the app crash-loop so nothing serves
   (module 06). Tell apart: check the Environment `staticIp` (private ⇒ cause
   a) and the system logs for a *forbidden* error (⇒ cause b). Both can be true.
2. The **console** log/`ContainerAppConsoleLogs_CL` (filtered to the canary's
   `RevisionName_s`) shows code errors; **system** logs show platform issues.
   The **request count / replica** metric per revision confirms only ~10% hit
   the canary.
3. Networking cause: a **UDR/NSG blocking required egress** so KEDA/the app
   can't reach the queue/control plane (check **system** logs). KEDA cause:
   **wrong scale-rule metadata or auth secret** (check the scale rule config
   and **system** logs). 
4. No redeploy needed if the app uses a **Key Vault reference** resolved at
   runtime via managed identity — it picks up the new value. (If the value was
   stored directly as an app secret, you'd have to update it.)
5. **Dapr service invocation** (by app-id) enables the calls; both apps must be
   in the **same Environment** (Dapr is Environment-scoped); verify with
   module-07 **metrics** (request count/latency) and **console/system logs**.
6. Reason: **RBAC propagation lag** — the assignment hasn't taken effect
   (module 06). Confirm via the **system** logs still showing the
   forbidden/authorization error until it clears, then success after
   re-rolling.
7. Module 04: a jumpbox VM / NAT Gateway / firewall billing per hour — delete
   it / share it in hub-spoke. Module 06: Key Vault operations (and soft-delete
   retention) — modest; consolidate vaults. Module 07: Log Analytics ingestion/
   retention — trim verbosity, shorten retention, prefer metric alerts.
8. The per-revision **request latency** (and CPU) metric exposes the slow
   revision; shift traffic with `az containerapp ingress traffic set` toward
   the healthy revision (e.g. 90/10 or 100/0).
9. **Metric** alert on `avg Replicas` at/above max over a 5-minute window.
   Cheaper because metric alerts don't ingest/scan log data the way a scheduled
   KQL log-query alert does.
10. First confirm the caller used the correct **Dapr app-id** (module 05); then
    confirm both apps are in the **same Environment** (module 01/04 boundary —
    Dapr won't cross it); then inspect **`ContainerAppSystemLogs_CL`** (and
    console) for the Dapr sidecar's invocation/resolution error.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — put all of it
together: a VNet-integrated, multi-revision, Dapr-connected, autoscaling app
with secrets from Key Vault and monitoring wired up, built and torn down end to
end.
