# Incident Response and Security Monitoring

## Why this matters

Every module so far built a *defense*. This one assumes a defense failed —
because module 00's assume-breach mindset says one eventually will — and asks
the question none of the others did: *what do you actually do when a container
or cluster is compromised?* Panic, in the wrong order, makes incidents worse:
people delete the evidence they needed, tip off the attacker, or rotate
credentials the attacker already used without checking what else was touched.
This module gives you an ordered response, and shows you where the *signals*
that detect an incident in the first place actually live on Azure — Defender
for Cloud, Azure Monitor, and audit logs. It's the capstone's runbook
requirement, and it bridges directly into the observability track.

## Concepts

### Detection comes before response — you can't respond to what you can't see

Recall module 00's Repudiation category: without logging, an attacker acts and
you can't even tell. Response is impossible without detection, and detection
lives in signals you must have turned on *before* the incident:

- **Kubernetes audit logs** — every request to the API server (who did what,
  when). The record that answers "who deleted that Secret / created that
  privileged Pod." On AKS these flow to a Log Analytics workspace via
  diagnostic settings (the same workspace as Container Insights, track 07/06).
- **Azure Activity Log** — control-plane operations on Azure resources (who
  changed an NSG, deleted a Key Vault, altered a role assignment).
- **Container/runtime signals** — a Pod suddenly making outbound connections to
  an unknown IP, a shell spawned in a container, a crypto-miner's CPU pattern.
- **Defender for Cloud alerts** (below) — Azure correlating the above into
  named threats.

The theme from track 07/06 returns: signals you didn't collect *before* the
incident aren't available *during* it. This is exactly why the next track
(observability) is a prerequisite for defending well — you can only respond to
what you instrumented.

### Microsoft Defender for Cloud and Defender for Containers

You met **Defender for Containers** in module 01 as an image scanner. Its other
half is **runtime threat detection**: once enabled, it watches cluster and
container behavior and raises **security alerts** in **Defender for Cloud** for
things like a container running a suspicious binary, a connection to a known-
malicious IP, or a possible container escape. Defender for Cloud is the central
place those alerts (plus posture recommendations from module 05) surface. In
the shared-responsibility model (module 00), Defender is Azure *helping you
detect* — but acting on the alert is still yours. It's a paid plan (bill-aware,
as in module 01), and it's the closest thing to an out-of-the-box "something is
wrong right now" signal for AKS.

### Azure Monitor alerts — turning a signal into a page

Detection you have to remember to go *look* at isn't detection. **Azure Monitor
alerts** fire automatically on a condition — a metric threshold (CPU pegged, an
unusual count of failed auth events) or a **log-query (KQL) alert** against the
Log Analytics workspace (e.g. "a Pod made egress to an IP outside our
allowlist", building on the blocked-egress signal from module 06). An alert
rule has a condition and an **action group** (who gets emailed/paged/webhooked).
This is how a blocked-egress event or a suspicious audit-log entry becomes a
human getting notified at 2am instead of a line nobody reads.

### The incident-response order: isolate, snapshot, rotate, root-cause

When a specific container/Pod is suspected compromised, the *order* matters as
much as the actions. A workable sequence:

1. **Isolate — contain before you clean.** Cut the compromised workload off so
   it can't spread or exfiltrate, *without* killing it (you still need its
   state). In Kubernetes: apply a **default-deny NetworkPolicy** (module 06) to
   the Pod and/or **cordon** the node, remove the Pod from Service endpoints by
   changing its labels (so traffic stops routing to it) rather than deleting
   it. Isolation first, because every second it's connected it can do more
   damage.
2. **Snapshot — preserve evidence before it's gone.** Capture what you'll need
   to investigate and can't recover later: the running Pod's logs, a
   description/manifest, relevant audit-log entries, and (for deeper forensics)
   a disk snapshot of the node. If you delete first, you've destroyed the
   evidence — the Repudiation problem, self-inflicted.
3. **Rotate — assume everything it could touch is compromised.** Any credential
   the workload had access to (its ServiceAccount token, mounted secrets, Key
   Vault access, cloud identity) must be treated as leaked and rotated (module
   02's rotate-on-exposure reflex), and the old ones revoked. Assume the
   attacker already used them.
4. **Root-cause — how did they get in, and what did they reach.** Only now,
   with the threat contained and evidence preserved, investigate: the entry
   vector (a vulnerable image? a leaked secret? an over-broad RBAC grant?),
   the blast radius (what the compromised identity could reach — your module-00
   threat model pays off here), and the fix that prevents recurrence.

The most common mistakes are doing these *out of order*: deleting the Pod first
(destroys evidence), or rotating credentials before isolating (the attacker,
still connected, just re-establishes access).

### Containment on Kubernetes specifically

The controls you've built are also your response tools:

- **NetworkPolicy** (module 06): a default-deny policy targeting the
  compromised Pod's labels instantly cuts its ingress *and* egress — the
  fastest software isolation.
- **Cordon/drain** (`kubectl cordon`): stop scheduling new work on a suspect
  node; drain moves legitimate workloads off so you can snapshot/analyze it.
- **RBAC/token revocation**: delete the Pod's ServiceAccount bindings or the
  ServiceAccount itself so its token stops working.
- **Labels**: changing a Pod's labels drops it out of its Service's endpoints
  (03/11) — traffic stops routing to it while the Pod stays alive for forensics.

Note these are the *same* objects you learned to *build* defenses with, now
used to *contain* — a nice demonstration that operational security and
incident response are the same toolkit pointed at a live problem.

### The runbook: decide the response before the incident

You do not want to be inventing the steps above at 2am. A **runbook** is a
written, scenario-specific response plan agreed in advance: for a given
scenario ("a container starts connecting to an unknown external IP"), the exact
ordered steps, who's responsible, which commands, and how you'll know it's
contained. Writing runbooks *before* incidents is what separates teams that
recover calmly from teams that make it worse. The capstone requires you to
write one for a realistic scenario — this module is where you learn its shape.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl cordon <node>` | Marks a node unschedulable — stop placing new Pods on a suspect node | `kubectl cordon aks-nodepool1-xxxxx` |
| `kubectl drain <node> --ignore-daemonsets` | Evicts legitimate Pods off a node for isolation/analysis | `kubectl drain aks-... --ignore-daemonsets --delete-emptydir-data` |
| `kubectl label pod <p> quarantine=true --overwrite` | Re-labels a Pod to drop it from Service endpoints / target it with a deny policy | `kubectl label pod bad-pod app- quarantine=true --overwrite` |
| `kubectl apply -f deny-all.yaml` | Applies a default-deny NetworkPolicy to isolate a Pod (module 06) | see exercise 3 |
| `kubectl logs <pod> --previous` / `kubectl describe pod` | Captures evidence from a (possibly-crashed) container | `kubectl logs bad-pod --previous` |
| `az snapshot create` | Snapshots a node's disk for forensic preservation | `az snapshot create -g <node-rg> -n ir-snap --source <disk-id>` |
| `az monitor activity-log list` | Reads Azure control-plane audit events | `az monitor activity-log list --offset 2h -o table` |
| `az monitor scheduled-query create` | Creates a KQL log-alert rule (e.g. unexpected egress) | see exercise 6 |
| `az security alert list` | Lists Defender for Cloud security alerts | `az security alert list -o table` |

Flag breakdown for `kubectl drain aks-nodepool1-xxxxx --ignore-daemonsets --delete-emptydir-data`:

- `drain <node>` — cordon the node *and* evict its Pods, so you can isolate and
  analyze it without legitimate workloads still running on it.
- `--ignore-daemonsets` — DaemonSet Pods (CNI, monitoring) can't be evicted
  normally; this lets drain proceed instead of erroring on them.
- `--delete-emptydir-data` — allow eviction of Pods using `emptyDir` volumes
  (whose data is ephemeral anyway); without it, drain refuses to evict them.

Flag breakdown for `az monitor scheduled-query create --name unexpected-egress --scopes <workspace-id> --condition "count > 0" --condition-query <KQL> --action-groups <ag-id>`:

- `scheduled-query create` — a log-based (KQL) alert rule that runs on a
  schedule against Log Analytics.
- `--scopes <workspace-id>` — the Log Analytics workspace the query runs
  against (the one collecting AKS logs, track 07/06).
- `--condition "count > 0"` + `--condition-query <KQL>` — fire when the query
  returns any rows (e.g. egress to an IP outside the allowlist).
- `--action-groups <ag-id>` — who/what gets notified (email/SMS/webhook/
  automation) when it fires — turning a log line into a page.

## Hands-on exercises

Exercises 1-5 run locally on kind (no cost) and rehearse the response reflex.
6-7 touch Azure Monitor/Defender and are optional/observational with teardown.

1. **(WSL2) Set the scene — a "compromised" Pod making outbound connections.**
   ```bash
   kubectl create namespace ir-lab
   kubectl run suspect --image=busybox:1.36 -n ir-lab --labels app=web,role=frontend --restart=Never -- sh -c "while true; do wget -qO- --timeout=3 http://example.com >/dev/null 2>&1; sleep 5; done"
   kubectl exec suspect -n ir-lab -- wget -qO- --timeout=3 http://example.com | head -1
   ```
   Expect the outbound to succeed — this stands in for a container "phoning
   home" to an unknown IP. Do *not* delete it; you're going to respond
   properly.

2. **(WSL2) Step 0: capture evidence FIRST (snapshot the volatile state).**
   Before touching anything, preserve what you'll lose if the Pod dies:
   ```bash
   kubectl describe pod suspect -n ir-lab > ir-suspect-describe.txt
   kubectl logs suspect -n ir-lab --tail=100 > ir-suspect-logs.txt 2>&1
   kubectl get pod suspect -n ir-lab -o yaml > ir-suspect-manifest.yaml
   ```
   Expect three evidence files. This is the snapshot step — done *before*
   isolation changes anything, so you have the pre-response state. (In a real
   incident you'd also snapshot the node disk with `az snapshot create`.)

3. **(WSL2) Step 1: isolate with a default-deny NetworkPolicy (module 06).**
   Cut the Pod off without killing it (needs a policy-enforcing CNI from
   03/11/module 06):
   ```bash
   kubectl apply -n ir-lab -f - <<'EOF'
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata: {name: quarantine-suspect}
   spec:
     podSelector: {matchLabels: {app: web}}
     policyTypes: [Ingress, Egress]
   EOF
   kubectl exec suspect -n ir-lab -- wget -qO- --timeout=3 http://example.com | head -1 || echo "EGRESS BLOCKED (contained)"
   ```
   Expect the outbound to now *fail* — the Pod is isolated but still alive for
   forensics. Containment before cleanup, exactly the Concepts order.

4. **(WSL2) Step 1b: drop it from Service routing via labels, and cordon-
   simulate.** Change the label a Service would select on so traffic stops
   reaching it (03/11), while the Pod persists:
   ```bash
   kubectl label pod suspect -n ir-lab app=quarantined role- --overwrite
   kubectl get pod suspect -n ir-lab --show-labels
   ```
   Expect the labels changed — any Service selecting `app=web` no longer routes
   to it. (On a real AKS node you'd also `kubectl cordon <node>` to stop new
   scheduling there.)

5. **(WSL2) Step 2: rotate what it could touch.** The Pod ran as a
   ServiceAccount; treat its token as compromised. Simulate revoking access by
   deleting the SA/binding it used (here the default SA — in real life a
   dedicated one):
   ```bash
   # In a real incident: rotate every mounted secret + Key Vault value it could read (module 02),
   # revoke its ServiceAccount token, and remove its RBAC bindings.
   echo "Rotate: any mounted secret -> new value in Key Vault (module 02)"
   echo "Revoke: delete the Pod's ServiceAccount / bindings so its token stops working (03/11)"
   ```
   Write down (for real) which specific credentials *this* Pod could reach —
   its SA token, any mounted Secret, any Key Vault secret its identity could
   read — using your module-00 threat-model habit. That list *is* your rotation
   checklist.

6. **(WSL2) Step 3: root-cause from the evidence, then only now delete.**
   Review the captured files to reason about entry vector and blast radius:
   ```bash
   grep -iE "image|serviceaccount|securityContext|volume" ir-suspect-manifest.yaml | head
   ```
   Ask: what image/tag (scan it — module 01)? what identity (blast radius —
   module 00)? Only after evidence is preserved and the threat contained:
   ```bash
   kubectl delete namespace ir-lab
   rm -f ir-suspect-*.txt ir-suspect-manifest.yaml
   ```
   The order you just practiced — evidence → isolate → rotate → root-cause →
   remediate — is the whole point; deleting first (the instinctive move)
   destroys the evidence you need.

7. **(Azure, optional/observational) Wire an alert and view Defender alerts.**
   Create a KQL log-alert shape against your AKS Log Analytics workspace (from
   07/06) and list Defender alerts:
   ```bash
   az security alert list -o table 2>/dev/null | head    # existing Defender for Cloud alerts, if any
   # A log-alert rule (shape) for unexpected egress would query ContainerLogV2 / network tables
   # and notify an action group; create with: az monitor scheduled-query create ...
   ```
   Observe where security signals surface in the portal (Defender for Cloud →
   Security alerts; Monitor → Alerts). If you enabled a Defender plan in module
   01, confirm it's back on `Free` when done:
   ```bash
   az security pricing show -n Containers --query pricingTier -o tsv
   ```

8. **(Paper) Write a runbook for a specific scenario.** For "a container in the
   cluster starts making outbound connections to an unknown external IP," write
   the ordered steps (detect → snapshot → isolate → rotate → root-cause →
   remediate), the exact commands at each step, who's responsible, and the
   "how do we know it's contained?" check. Keep it — this is precisely the
   capstone deliverable, and doing it now (before the capstone) is deliberate
   practice.

## Independent challenge

No commands given — build it yourself using this module plus module 06
(NetworkPolicy isolation), module 02 (rotate-on-exposure), module 01 (scan the
image to find the vector), and module 00 (blast-radius reasoning). Take a
running Pod on your cluster and run a *full* incident-response drill against the
scenario "this container is suspected compromised and is making unexpected
outbound connections." Without deleting the Pod first, preserve its evidence,
isolate it at the network level so it can neither be reached nor reach out,
identify and (conceptually) rotate every credential it could have touched, and
reason from the captured manifest/image about how an attacker could have gotten
in and how far they could have moved. Produce a short written runbook capturing
the ordered steps you took and the exact command for each, and end with the
single detection signal you'd add so that *next* time this fires automatically
instead of being noticed by luck.

<details>
<summary>Stuck? One hint</summary>

The order is the graded part: capture (`kubectl describe`/`logs`/`get -o yaml`,
plus a node disk snapshot in real life) *before* you change anything, then
isolate with a default-deny `Ingress,Egress` NetworkPolicy targeting the Pod's
labels (module 06) and relabel it out of Service endpoints, then build the
rotation checklist from what the Pod's ServiceAccount/mounts/Key-Vault identity
could reach (modules 00/02), then root-cause the image (scan it, module 01) and
identity. The detection signal to add is a KQL Azure Monitor alert on egress to
non-allowlisted IPs wired to an action group.

</details>

## Common mistakes & troubleshooting

- **Deleting the compromised Pod first.** It feels decisive but destroys the
  logs, manifest, and forensic state you need for root-cause — the self-
  inflicted Repudiation problem. Capture evidence *before* any destructive
  action.
- **Rotating credentials before isolating.** If the attacker is still connected
  when you rotate, they may simply re-establish access or grab the new
  credentials. Isolate (cut network) first, then rotate.
- **Isolating by killing the Pod instead of cutting its network.** A default-
  deny NetworkPolicy (or relabeling it out of endpoints) contains it while
  keeping it alive for analysis; deleting it loses the live state.
- **Rotating only the "obvious" secret.** Rotate *everything the workload could
  reach* — its SA token, every mounted Secret, any Key Vault value its identity
  could read. Use your threat model (module 00) to build the full list, not
  just the one credential you first thought of.
- **Having no signals turned on.** You can't investigate audit events you never
  collected. Enable AKS diagnostic/audit logging and (optionally) Defender
  *before* an incident — during one is too late.
- **A detection nobody looks at.** A dashboard is not an alert. Wire high-signal
  events (blocked/unexpected egress, privileged-Pod creation, mass Secret
  reads) to an Azure Monitor action group so a human is actually notified.
- **No runbook.** Inventing the response order live, under stress, is how steps
  get done backwards. Write scenario-specific runbooks in advance.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is the correct order of incident-response steps for a suspected-
   compromised container, and why does each precede the next?
2. Why is deleting the compromised Pod first a mistake?
3. Why isolate *before* rotating credentials?
4. How do you isolate a Pod on Kubernetes *without* killing it, using controls
   from earlier modules?
5. What's the difference between what Kubernetes audit logs and the Azure
   Activity Log record?
6. What does Defender for Containers add beyond the image scanning you met in
   module 01?
7. Why is "a dashboard exists" insufficient, and what turns a signal into a
   response?
8. What is a runbook and why write it before an incident?

</details>

<details>
<summary>Show answers</summary>

1. Snapshot/preserve evidence → isolate/contain → rotate credentials → root-
   cause → remediate. Evidence first because response actions destroy volatile
   state; isolate next to stop spread/exfiltration before it does more damage;
   rotate because any credential the workload touched must be assumed leaked;
   root-cause only once contained and evidence is safe; remediate to prevent
   recurrence. (Some order snapshot and isolate very close together — the key
   is both precede rotation and deletion.)
2. It destroys the evidence — logs, manifest, running state, forensic disk
   contents — that you need to determine the entry vector and blast radius,
   leaving you unable to answer how they got in or what they reached. It's a
   self-inflicted Repudiation gap.
3. Because if the attacker is still network-connected when you rotate, they can
   re-establish access or capture the newly-rotated credentials. Cutting the
   Pod's network (default-deny NetworkPolicy) first removes their live foothold
   so rotation actually locks them out.
4. Apply a default-deny `Ingress,Egress` NetworkPolicy targeting the Pod's
   labels (module 06) to cut its traffic both ways, and/or change its labels so
   it drops out of its Service's endpoints (03/11) — plus `cordon` the node to
   stop new scheduling. The Pod stays alive for forensics while being contained.
5. Kubernetes audit logs record requests to the *Kubernetes API server* (who
   created/deleted which Kubernetes object). The Azure Activity Log records
   *Azure control-plane* operations on Azure resources (who changed an NSG,
   deleted a Key Vault, altered a role assignment). Different layers of "who
   did what."
6. Runtime threat detection: it watches cluster/container behavior and raises
   named security alerts in Defender for Cloud (suspicious binary, connection
   to a malicious IP, possible container escape), beyond module 01's static
   image scanning. Detecting an active threat, not just a vulnerable image.
7. A dashboard requires a human to remember to look; incidents happen when
   nobody is looking. An Azure Monitor alert rule with a condition and an action
   group fires automatically and notifies/pages someone (or triggers
   automation), turning a passive signal into an active response.
8. A runbook is a written, scenario-specific, pre-agreed response plan: the
   ordered steps, responsible people, exact commands, and containment check for
   a given incident type. Writing it before an incident means the response
   order is decided calmly in advance, so nobody improvises the steps backwards
   under 2am stress.

</details>

## Next

Continue to
[08-hashicorp-vault-in-depth](../08-hashicorp-vault-in-depth/README.md) —
module 02 named HashiCorp Vault as the cloud-agnostic alternative to Key
Vault and stopped there. This module runs it for real: dynamic,
short-lived database credentials that revoke themselves automatically.
