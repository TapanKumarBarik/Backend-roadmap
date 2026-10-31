# Scaling with KEDA

## Why this matters

Autoscaling is the single biggest reason to choose Container Apps over ACI and
one of the biggest reasons to choose it over a Kubernetes cluster you manage
yourself. ACA's scaler is **KEDA** — the same project you could install on any
Kubernetes cluster yourself, including track 03's local one — but built in and
pre-wired. Getting scale rules right is what makes an app cheap when idle and
responsive under load; getting them wrong means either a bill for replicas you
don't need or an app that never scales up when it should.

## Concepts

### KEDA, but you didn't install it

On a Kubernetes cluster you run yourself, event-driven autoscaling means
installing KEDA and writing `ScaledObject` YAML. In ACA, KEDA is already
running and you configure it
through the app's **scale rules**. Each rule has a **type** (http, tcp, or a
KEDA "custom" scaler like azure-queue, azure-servicebus, cpu, memory,
cron, etc.) and **metadata** specific to that type. KEDA watches the metric and
adjusts replica count between your min and max. Conceptually it's the HPA you
know, generalized beyond CPU/memory to arbitrary event sources.

### Min replicas, max replicas, and scale-to-zero

Two numbers bound everything: **`--min-replicas`** and **`--max-replicas`**.
Min 0 enables **scale-to-zero** — with no matching events/traffic KEDA removes
all replicas and you pay no compute. The first request after that incurs a
**cold start** while a replica spins up. Setting min ≥ 1 keeps replicas warm
(no cold start) but bills continuously. Max caps the blast radius (and cost)
of a spike. On Consumption, these two numbers are your primary cost/latency
dial.

### The HTTP scale rule

The default and simplest rule for a web app is **http**, whose key metadata is
**`concurrentRequests`**: KEDA targets that many concurrent requests per
replica and adds replicas when the actual concurrency exceeds it. If you set
`concurrentRequests=50` and 200 requests are in flight, KEDA drives toward
~4 replicas (up to max). This is roughly "requests-per-replica" autoscaling —
different from CPU-based HPA, and usually a better fit for bursty web traffic.
Note: HTTP (and TCP) scale rules are what allow scale-to-zero for
request-driven apps; a purely CPU/memory rule cannot scale to zero because
there's no signal at zero replicas.

### Custom (event-driven) scale rules

The powerful case: scale on a **queue depth** or other external signal. A
`azure-queue` rule watches an Azure Storage queue and adds replicas as messages
pile up (`queueLength` metadata = messages per replica); `azure-servicebus`
does the same for Service Bus. This is how you build a worker with **no
ingress** that sleeps at zero replicas and wakes up only when work arrives —
the classic serverless-consumer pattern. The rule needs the trigger metadata
plus authentication (a connection string, provided via a secret ref) so KEDA
can read the queue depth.

### Why a rule "never fires" (the failure mode)

The most common scaling bug is a rule that looks configured but never triggers.
Usual causes: the **trigger metadata is wrong** (misspelled metadata key,
wrong queue name, `queueLength` so high it never trips), the **authentication/
secret ref is broken** so KEDA can't read the metric (it silently can't scale),
the **metric genuinely never crosses the threshold**, or `min-replicas` already
equals `max-replicas` (no room to scale). Because KEDA fails "closed" (stays at
min) rather than erroring loudly, diagnosing means checking the rule config and
the system logs, not waiting for a crash.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az containerapp update` (scale flags) | Set min/max replicas | `az containerapp update --name web --resource-group rg-aca-m03 --min-replicas 0 --max-replicas 10` |
| `az containerapp create` (http rule) | Create app with an HTTP scale rule | see below |
| `az containerapp update` (add scale rule) | Add/replace a scale rule | see below |
| `az containerapp revision list` | Confirm which revision is active | `az containerapp revision list --name web --resource-group rg-aca-m03 -o table` |
| `az containerapp replica list` | See current replica count | `az containerapp replica list --name web --resource-group rg-aca-m03 -o table` |
| `az containerapp revision show` | Inspect a revision's scale config | `az containerapp revision show --name web --resource-group rg-aca-m03 --revision <rev> -o jsonc` |

Flag-by-flag breakdowns:

`az containerapp create --name web --resource-group rg-aca-m03 --environment env-m03 --image ... --target-port 80 --ingress external --min-replicas 0 --max-replicas 10 --scale-rule-name http-rule --scale-rule-type http --scale-rule-http-concurrency 50`
- `--min-replicas 0` / `--max-replicas 10` — scale bounds (0 enables scale-to-zero).
- `--scale-rule-name http-rule` — a name for this rule.
- `--scale-rule-type http` — rule type (http/tcp/custom KEDA scaler).
- `--scale-rule-http-concurrency 50` — target concurrent requests per replica; the HTTP rule's core metadata.

`az containerapp update --name worker --resource-group rg-aca-m03 --min-replicas 0 --max-replicas 20 --scale-rule-name queue-rule --scale-rule-type azure-queue --scale-rule-metadata queueName=jobs queueLength=5 --scale-rule-auth connection=queue-conn`
- `--scale-rule-type azure-queue` — the KEDA azure-queue scaler.
- `--scale-rule-metadata queueName=jobs queueLength=5` — trigger metadata: which queue, and messages-per-replica target (5 messages → +1 replica).
- `--scale-rule-auth connection=queue-conn` — maps the scaler's `connection` auth param to a **secret** named `queue-conn` on the app (the storage connection string). If this is wrong, KEDA can't read the queue and never scales.

## Hands-on exercises

1. **Set up group, Environment, and an HTTP app.**
   ```powershell
   az group create --name rg-aca-m03 --location eastus
   az containerapp env create --name env-m03 --resource-group rg-aca-m03 --location eastus
   az containerapp create `
     --name web --resource-group rg-aca-m03 --environment env-m03 `
     --image mcr.microsoft.com/k8se/quickstart:latest `
     --target-port 80 --ingress external `
     --min-replicas 0 --max-replicas 10 `
     --scale-rule-name http-rule --scale-rule-type http `
     --scale-rule-http-concurrency 20
   ```

2. **Inspect the scale config.**
   ```powershell
   az containerapp show --name web --resource-group rg-aca-m03 --query properties.template.scale -o jsonc
   ```
   Verify `minReplicas: 0`, `maxReplicas: 10`, and an http rule with
   `concurrentRequests: "20"`.

3. **Observe scale-to-zero.** With no traffic, wait a few minutes then:
   ```powershell
   az containerapp replica list --name web --resource-group rg-aca-m03 -o table
   ```
   Expect zero (or an emptying) replica list. First request afterward will
   cold-start.

4. **Generate load and watch it scale up.** In one terminal, hammer the FQDN;
   in another, watch replicas.
   ```powershell
   $fqdn = az containerapp show --name web --resource-group rg-aca-m03 --query properties.configuration.ingress.fqdn -o tsv
   1..2000 | ForEach-Object -Parallel { curl -s "https://$using:fqdn" > $null } -ThrottleLimit 100
   ```
   Meanwhile: `az containerapp replica list --name web --resource-group rg-aca-m03 -o table`.
   Verify replica count climbs above 1 (toward max as concurrency exceeds 20
   per replica). When load stops, it drifts back toward zero.

5. **Tighten the concurrency to force more replicas.**
   ```powershell
   az containerapp update --name web --resource-group rg-aca-m03 `
     --scale-rule-name http-rule --scale-rule-type http --scale-rule-http-concurrency 5
   ```
   Re-run the load test. Lower concurrency-per-replica → more replicas for the
   same load. Confirm the replica count is higher than in exercise 4.

6. **Cap cost with max-replicas.**
   ```powershell
   az containerapp update --name web --resource-group rg-aca-m03 --max-replicas 3
   ```
   Repeat the load test and confirm replicas never exceed 3 no matter how hard
   you push. This is your spike-cost ceiling.

7. **Build a queue-driven worker (no ingress).** Create a storage account and
   queue, wire a secret and an azure-queue scale rule.
   ```powershell
   az storage account create --name stacam03$((Get-Random -Max 9999)) --resource-group rg-aca-m03 --location eastus --sku Standard_LRS
   # capture the account name you used:
   $sa = az storage account list --resource-group rg-aca-m03 --query "[0].name" -o tsv
   $conn = az storage account show-connection-string --name $sa --resource-group rg-aca-m03 --query connectionString -o tsv
   az storage queue create --name jobs --connection-string $conn
   az containerapp create `
     --name worker --resource-group rg-aca-m03 --environment env-m03 `
     --image mcr.microsoft.com/k8se/quickstart:latest `
     --min-replicas 0 --max-replicas 10 `
     --secrets "queue-conn=$conn" `
     --scale-rule-name queue-rule --scale-rule-type azure-queue `
     --scale-rule-metadata "queueName=jobs" "queueLength=5" `
     --scale-rule-auth "connection=queue-conn"
   ```
   (This worker has no ingress on purpose.) Confirm it sits at zero replicas.

8. **Trigger the queue scaler.** Push messages and watch it wake:
   ```powershell
   1..50 | ForEach-Object { az storage message put --queue-name jobs --content "job-$_" --connection-string $conn }
   az containerapp replica list --name worker --resource-group rg-aca-m03 -o table
   ```
   With `queueLength=5` and 50 messages, KEDA drives toward ~10 replicas
   (capped at max). Verify replicas appear even though there's no ingress.

9. **Diagnose and fix: scale rule never triggers (wrong metadata).** Break the
   queue rule with a misspelled queue name:
   ```powershell
   az containerapp update --name worker --resource-group rg-aca-m03 `
     --scale-rule-name queue-rule --scale-rule-type azure-queue `
     --scale-rule-metadata "queueName=jobsss" "queueLength=5" `
     --scale-rule-auth "connection=queue-conn"
   1..50 | ForEach-Object { az storage message put --queue-name jobs --content "job-$_" --connection-string $conn }
   az containerapp replica list --name worker --resource-group rg-aca-m03 -o table
   ```
   Despite 50 real messages, replicas stay at zero — KEDA is watching a queue
   that doesn't exist. **Diagnose** by comparing the rule's `queueName` to the
   actual queue (`az storage queue list --connection-string $conn -o table`).
   **Fix** by setting `queueName=jobs` back correctly, then re-verify replicas
   climb. Lesson: KEDA fails closed and silent — check metadata against
   reality.

10. **Diagnose and fix: broken auth secret ref.** Point the rule's auth at a
    non-existent secret:
    ```powershell
    az containerapp update --name worker --resource-group rg-aca-m03 `
      --scale-rule-name queue-rule --scale-rule-type azure-queue `
      --scale-rule-metadata "queueName=jobs" "queueLength=5" `
      --scale-rule-auth "connection=wrong-secret-name"
    ```
    The scaler can't authenticate to read queue depth, so it never scales.
    **Fix** by mapping `connection=queue-conn` (the real secret). Verify with a
    fresh batch of messages that replicas now appear.

11. **Cleanup.**
    ```powershell
    az group delete --name rg-aca-m03 --yes --no-wait
    ```

## Independent challenge

Build a single Container App that is a pure background worker (no ingress,
scale-to-zero) driven by an Azure Storage queue, such that pushing N messages
reliably produces roughly N/10 replicas up to a max of 5. Then, without
deleting anything, deliberately make it *fail to scale* in a way caused by the
**scale rule metadata** (not auth), prove it's stuck at zero despite a full
queue, and fix it. This combines this module's KEDA rules with **module 02**'s
create/update-and-inspect workflow. Remember to delete the resource group (the
storage account and its transactions are billable) when done.

<details><summary>Stuck? One hint</summary>

`queueLength` is "messages per replica," so N/10 replicas means
`queueLength=10`. The easiest metadata-only breakage that isn't auth is a
`queueName` that doesn't match the real queue — KEDA reports no depth and holds
at min. Compare `--scale-rule-metadata queueName=...` against
`az storage queue list`.

</details>

## Common mistakes & troubleshooting

- **CPU/memory-only rules can't scale to zero.** There's no metric at zero
  replicas, so a CPU/memory scaler holds min at ≥1. For scale-to-zero you need
  an http/tcp or event-driven trigger.
- **Silent KEDA failures.** A wrong metadata key, wrong resource name, or
  broken auth secret makes the rule a no-op — no error, just stuck at min.
  Diagnose by inspecting the rule config and the system logs, not by waiting.
- **min == max.** If min and max replicas are equal there's no room to scale;
  the rule is inert by definition.
- **Concurrency set too high.** An HTTP rule with `concurrentRequests` far
  above real traffic never adds replicas. Set it to realistic per-replica
  capacity.
- **Cost pitfall: min-replicas ≥ 1 "to avoid cold starts."** Warm replicas
  bill 24/7. Only pay for warmth you actually need; otherwise keep min at 0 and
  accept cold starts, or use a small max to cap spikes.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Which autoscaler powers ACA, and how does using it here differ from using
   it on a Kubernetes cluster you run yourself?
2. What does `--scale-rule-http-concurrency 50` actually target?
3. Why can't a CPU-only scale rule scale an app to zero?
4. A queue worker with a full queue stays at zero replicas. Name two distinct
   root causes and how you'd tell them apart.
5. What's the cost/latency trade-off between `--min-replicas 0` and
   `--min-replicas 1`?
6. In `--scale-rule-auth "connection=queue-conn"`, what is `queue-conn`?
7. You set `queueLength=5` and push 50 messages with max-replicas 10. Roughly
   how many replicas do you expect, and why not more?

<details><summary>Show answers</summary>

1. **KEDA.** On a Kubernetes cluster you run yourself you install KEDA and
   write ScaledObject YAML; on ACA it's built in and configured via the app's
   scale rules — same engine, no installation or cluster.
2. Target concurrent requests **per replica**; KEDA adds replicas when actual
   concurrency exceeds it (200 concurrent / 50 ≈ 4 replicas, up to max).
3. At zero replicas there's no container producing CPU/memory metrics, so
   there's no signal to scale *up from* zero. Only external/request triggers
   (http/tcp/queue) provide a signal at zero.
4. Any two of: wrong trigger metadata (e.g. misspelled `queueName`); broken
   auth secret ref so KEDA can't read depth; `queueLength` threshold never
   crossed; min==max. Tell apart by checking the rule's metadata/auth against
   the real resources and reading system logs.
5. Min 0 = no compute cost when idle but cold-start latency on first request;
   min 1 = no cold start but continuous billing for the warm replica.
6. The name of a **secret** on the app holding the storage connection string;
   the scaler's `connection` auth parameter is mapped to it.
7. About **10** replicas (50 messages ÷ 5 per replica), but capped at
   max-replicas 10 — the cap prevents more even if the math suggested it.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix
concepts from modules 00–03.

1. You need service-to-service internal calls between two apps *and*
   independent autoscaling for each. Which resource must the two apps share,
   and which resource is configured per-app?
2. Compare ACI and Container Apps for a queue-consuming worker that should cost
   nothing when the queue is empty: which fits, and which two ACA features make
   it work?
3. An Environment was auto-created with a workspace; you delete the
   Environment but a bill continues. What's the likely culprit and the fix?
4. Walk the full path of a change: you run `az containerapp update
   --set-env-vars X=1`. What object is created, what happens to traffic in
   default mode, and how does this relate to a Kubernetes Deployment rollout?
5. Which two `az containerapp create` flags together determine both the cost
   floor (idle) and the cost ceiling (spike) of a Consumption app, and what
   values give the cheapest idle behavior?
6. A web app with an HTTP scale rule and `--min-replicas 0` shows a first
   slow request after quiet periods. Explain the mechanism and one way to
   eliminate it (and its cost).
7. Name the two resource providers from module 00 and tie each to something you
   used in modules 01–03.
8. You created a workload-profiles Environment "to be safe." A colleague says
   it's costing money even with no traffic. Under what condition are they
   right, and under what condition are they wrong?
9. Diagnose: a worker's azure-queue rule is present, the queue has 100
   messages, but replicas stay at zero and there's no error. List the three
   things you'd check, in order.
10. Translate to Kubernetes terms: Environment, Container App, Revision, scale
    rule.

<details><summary>Show answers</summary>

1. They must share an **Environment** (internal discovery/Dapr is
   Environment-scoped); **scale rules and min/max replicas** are per-app.
2. Container Apps fits (ACI has no autoscaling/scale-to-zero). The two features:
   **scale-to-zero** (min-replicas 0) and a **KEDA azure-queue scale rule** to
   wake on queue depth.
3. The **Log Analytics workspace** (and/or a leftover resource) outlived the
   Environment and still bills for retained data. Fix: delete the whole
   resource group, or delete the workspace explicitly.
4. A new **revision** (immutable snapshot). In default single-revision mode
   100% of traffic shifts to the new active revision — a rolling update,
   exactly like a new Deployment rollout replacing the old ReplicaSet.
5. `--min-replicas` (cost floor: 0 = near-zero idle) and `--max-replicas`
   (cost ceiling: caps replicas during spikes). Cheapest idle: `--min-replicas 0`.
6. Scale-to-zero removed all replicas; the first request cold-starts a new one.
   Eliminate with `--min-replicas 1` — at the cost of a warm replica billing
   24/7.
7. `Microsoft.App` (the Container Apps provider — used to create Environments
   and apps) and `Microsoft.OperationalInsights` (Log Analytics — the
   workspace behind the Environment's logs).
8. Right if a **Dedicated workload profile** has been added (reserved compute
   bills continuously). Wrong if it still has only the **Consumption** profile
   (then it behaves like a normal Consumption environment and idles cheap).
9. (1) The rule's **metadata** (queueName matches the real queue? queueLength
   sane?); (2) the **auth secret ref** (does `connection=` point to a real
   secret with a valid connection string?); (3) **min/max replicas** (is
   min==max, leaving no room?). Also check system logs.
10. Environment ≈ namespace + shared ingress/logging; Container App ≈
    Deployment + Service + Ingress + HPA; Revision ≈ a specific Deployment
    rollout/ReplicaSet; scale rule ≈ a KEDA ScaledObject / generalized HPA.

</details>

## Next

[04-networking-ingress-and-vnet-integration](../04-networking-ingress-and-vnet-integration/README.md)
— the networking module: internal vs external ingress, custom VNet/subnet
integration, private environments, and DNS. This is where the Azure networking
track pays off.
