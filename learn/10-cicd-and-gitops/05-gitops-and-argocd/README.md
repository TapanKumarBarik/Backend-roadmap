# GitOps and ArgoCD

## Why this matters

Everything so far has been **push-based**: a pipeline holds cluster
credentials and reaches into AKS to apply changes (track 07 module 08's
`kubectl set image`, module 04's rollouts). That works, but it has real
downsides — the pipeline needs standing cluster credentials, there's no
single record of what's *supposed* to be running, and if someone
`kubectl edit`s the cluster by hand, nothing notices or corrects it. GitOps
inverts the model: a controller *inside* the cluster continuously pulls the
desired state from a Git repo and makes the cluster match it. Git becomes
the single source of truth, every change is a reviewable commit, and the
cluster **self-heals** back toward Git if it drifts. This module installs
ArgoCD on your AKS cluster and makes it deploy your app from a Git repo —
the pivot from push to pull that the whole back half of this track builds on.

## Concepts

### Push vs. pull, made concrete

Recall module 00's two models. **Push** (what you've done): the CI runner,
sitting outside the cluster, authenticates in and runs `kubectl`/`helm`.
The cluster is passive; the pipeline is the actor and holds the keys.
**Pull** (GitOps): an agent running *inside* the cluster watches a Git repo,
notices when the committed manifests differ from what's running, and applies
the difference itself. The pipeline's responsibility now *ends at `git
push`* — it commits the desired manifests and stops; it never touches the
cluster. Consequences: no external system needs cluster-admin credentials
(smaller attack surface — a security win developed in module 07); the Git
repo is a complete, audited, revertible record of every deploy; and the
cluster can *reconcile* — continuously drive itself toward the declared
state — which is the property that enables self-healing.

### Git as the single source of truth

In GitOps, the desired state of the cluster lives entirely in Git as
declarative manifests (plain YAML, Kustomize, or Helm). "What is running in
production?" is answered by `git log` on that repo, not by querying the
cluster and hoping no one changed it by hand. This gives you: **auditability**
(every change is a commit with an author and a diff), **rollback by
`git revert`** (revert the commit, the controller rolls the cluster back —
no special deploy tooling), and **review** (a manifest change goes through
the same PR + required-checks workflow from track 08 and module 02 as
application code). The mental shift from track 09 is natural: Terraform made
*infrastructure* declarative and version-controlled; GitOps does the same
for *application deployments*, and uses a continuously-reconciling agent
rather than a human running `apply`.

### ArgoCD's architecture and the Application object

**ArgoCD** is a Kubernetes controller (a set of pods you install into the
cluster, usually in an `argocd` namespace) plus an API/UI/CLI. Its central
custom resource is the **Application**: a declarative object that says "the
desired state lives at *this Git repo, this path, this revision*, and should
be deployed into *this cluster, this namespace*." ArgoCD continuously
compares that Git source against the live cluster state and reports a
**sync status** — `Synced` (cluster matches Git) or `OutOfSync` (they
differ) — and a **health status** (`Healthy`/`Progressing`/`Degraded`,
derived from the underlying resources' readiness, e.g. a Deployment's
rollout — connecting to track 03 and module 04). You manage apps through the
`argocd` CLI or UI, but the Application itself is just YAML you can (and
should) also keep in Git — "App of Apps" and declarative setup.

### Sync policies: manual vs. automated, prune, self-heal

An Application's **sync policy** decides how differences between Git and the
cluster are resolved:

- **Manual sync**: ArgoCD detects drift and marks the app `OutOfSync`, but
  waits for you to click **Sync** (or `argocd app sync`) to apply. Safer for
  learning and for production changes you want a human to trigger.
- **Automated sync**: ArgoCD applies committed changes automatically as soon
  as it sees them in Git — the fully pull-based continuous deployment path.
  Two important sub-options:
  - **prune**: also *delete* cluster resources that were removed from Git.
    Without prune, deleting a manifest from Git leaves the orphaned resource
    running in the cluster. With prune, Git is authoritative for deletions
    too. (Powerful and slightly dangerous — a bad commit can delete real
    resources.)
  - **selfHeal**: if the *cluster* drifts from Git (someone `kubectl edit`s
    a live resource), ArgoCD reverts it back to the Git state automatically.
    This is the self-healing property; without it, manual drift persists as
    `OutOfSync` until someone syncs.

### Drift detection and self-healing

**Drift** is any difference between the Git-declared state and the live
cluster. ArgoCD detects it continuously (a periodic reconcile plus watch
events). What it *does* about drift depends on the policy above: with
`selfHeal: true`, out-of-band changes are automatically reverted to match
Git — so `kubectl scale deployment/x --replicas=99` on a self-healing app
gets undone within seconds, because Git said 3. With self-heal off, ArgoCD
just *shows* the drift as `OutOfSync` and leaves it for a human. This is the
single biggest operational difference from push-based CD: in push-based, the
cluster stays however anyone last left it; in GitOps with self-heal, the
cluster is *continuously* pulled back to what Git says, making manual hotfixes
either impossible or immediately reverted — which is the point (all changes
go through Git) but a real behavior change to internalize.

### Where the CI pipeline fits now: commit the image tag to Git

GitOps changes what your CI pipeline's *last step* is. Instead of
`kubectl set image` (push), the pipeline — after building and pushing the
SHA-tagged image (module 03) — **commits the new image tag into the
deployment manifest in Git** (e.g. updates `image: .../demo:<sha>` in a
Kustomize/Helm values file and pushes). ArgoCD sees the commit and syncs the
new image into the cluster. So the flow becomes: CI builds+pushes the image
and writes the tag to Git; CD (ArgoCD) pulls it from Git into the cluster.
A common structure is **two repos**: an *app* repo (source code + CI that
builds the image and bumps the tag) and a *config/GitOps* repo (the
manifests ArgoCD watches) — keeping application code separate from
deployment state. The capstone (module 08) wires exactly this.

## Command reference

Installing ArgoCD and driving it with the `argocd` CLI and `kubectl`.

| Command | What it does | Notes |
|---|---|---|
| `kubectl create namespace argocd` | Creates the namespace ArgoCD installs into | Convention |
| `kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml` | Installs ArgoCD's controllers/API/UI | The standard non-HA install |
| `kubectl -n argocd get pods` | Confirms ArgoCD's own pods are running | Wait for all `Running`/`Ready` |
| `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' \| base64 -d` | Retrieves the initial admin password | First-login credential |
| `kubectl -n argocd port-forward svc/argocd-server 8080:443` | Exposes the UI/API locally | Or expose via a LoadBalancer/Ingress (track 07 module 04) |
| `argocd login localhost:8080` | Authenticates the CLI to the ArgoCD API | `--insecure` for the self-signed port-forward cert |
| `argocd app create <name> --repo <git-url> --path <dir> --dest-server https://kubernetes.default.svc --dest-namespace <ns>` | Creates an Application pointing at a Git path | The core "deploy from Git" command |
| `argocd app list` | Lists Applications and their sync/health status | Quick overview |
| `argocd app get <name>` | Detailed status: sync, health, resource tree, diff | Primary troubleshooting view |
| `argocd app sync <name>` | Manually applies the Git state to the cluster | Needed when sync policy is manual |
| `argocd app diff <name>` | Shows the difference between Git and the live cluster | Why an app is `OutOfSync` |
| `argocd app set <name> --sync-policy automated` | Turns on automated sync | Add `--auto-prune` / `--self-heal` |
| `argocd app set <name> --sync-policy automated --auto-prune --self-heal` | Full automated GitOps: apply, delete-removed, revert-drift | The pull-based continuous-deployment setup |
| `argocd app history <name>` | Lists sync revisions (deploy history) | Rollback target list |
| `argocd app rollback <name> <id>` | Rolls the app back to a prior synced revision | GitOps rollback (or `git revert` the commit) |
| `argocd app delete <name>` | Removes the Application (and, if configured, its resources) | Cleanup |

## Hands-on exercises

Use your AKS cluster (track 07). You need a **Git repo of manifests** ArgoCD
can read — a public GitHub repo with a `k8s/` directory containing a
Deployment + Service for your `demo` app (referencing a SHA-tagged image
from module 03). The exercises install ArgoCD and deploy that repo.

1. **Install ArgoCD and reach the UI.** Create the `argocd` namespace and
   apply the install manifest. Wait for all `argocd` pods to be `Running`.
   Retrieve the initial admin password, port-forward `argocd-server`, and
   log in with the `argocd` CLI (`argocd login localhost:8080 --insecure`).
   Confirm `argocd app list` returns (an empty list is fine).

2. **Create your first Application (manual sync).** Point an Application at
   your manifests repo/path with a *manual* sync policy. Run
   `argocd app get <name>` and observe it reports `OutOfSync` (Git says
   deploy these objects; the cluster has nothing yet). Note ArgoCD detected
   the desired state but did *not* apply it.

3. **Sync and verify.** Run `argocd app sync <name>`. Watch the app become
   `Synced` and `Healthy`, then confirm from the cluster side with
   `kubectl get deployment,svc -n <ns>` that your app is running. You just
   deployed via *pull* — you never ran `kubectl apply` against the cluster
   yourself; ArgoCD did, from Git.

4. **Change Git, watch it go OutOfSync, sync again.** Edit the Deployment's
   replica count in Git (e.g. 2 → 4) and commit/push. Within a minute
   `argocd app get` shows `OutOfSync`; run `argocd app diff <name>` to see
   exactly the replica difference. Sync and confirm the cluster now runs 4
   replicas. This is the core GitOps loop: change Git → reconcile.

5. **Turn on automated sync.** `argocd app set <name> --sync-policy
   automated`. Now push another Git change (replicas 4 → 3) and *do not*
   sync manually — confirm ArgoCD applies it on its own within a minute.
   You've moved from "GitOps detects" to "GitOps deploys" — pull-based
   continuous deployment.

6. **Demonstrate self-heal (drift correction).** Enable self-heal
   (`argocd app set <name> --sync-policy automated --self-heal`). Now drift
   the cluster by hand: `kubectl scale deployment/demo -n <ns>
   --replicas=9`. Watch (`kubectl get pods -w` and `argocd app get`) ArgoCD
   revert it back to the Git-declared count within seconds. Contrast: with
   self-heal *off*, that manual change would persist and just show as
   `OutOfSync`. This is the behavior that makes Git authoritative.

7. **Prune: deletion through Git.** Add `--auto-prune`. Delete one manifest
   from the Git repo (e.g. remove the Service) and push. Confirm ArgoCD
   *deletes* the corresponding cluster resource. Then re-add it in Git and
   confirm it comes back. Note the danger: with prune on, a bad commit that
   removes a manifest deletes a live resource — Git is authoritative for
   deletions too.

8. **Rollback via Git.** Make a bad change in Git (e.g. point the image at a
   nonexistent tag) and push; watch the app go `Progressing`/`Degraded` as
   the pods fail to pull. Roll back with `git revert` + push (or
   `argocd app rollback`) and confirm the app returns to `Healthy`. Note you
   rolled back a *deploy* with an ordinary Git operation — no special deploy
   tooling.

9. **Diagnose and fix: an Application stuck OutOfSync.** You'll hit the most
   common ArgoCD confusion. An app refuses to become `Synced` even after you
   sync. Reproduce one of these: (a) a manifest in Git has a YAML/schema
   error so the sync operation fails (visible in `argocd app get` →
   `OutOfSync`, and the sync result shows the apply error); or (b) something
   *outside* ArgoCD's management keeps mutating the resource (e.g. an HPA
   from track 07 module 05 changing replica count while Git pins a fixed
   `replicas`, so it flaps `OutOfSync` forever). Investigate with
   `argocd app get <name>` (health/sync + conditions), `argocd app diff`
   (what differs), and the resource tree in the UI. Fix (a) by correcting the
   manifest in Git and re-syncing; fix (b) by removing the conflicting
   `replicas` field from Git so the HPA can own it (the "who owns this field"
   lesson). Write one sentence on why "I clicked Sync and it's still
   OutOfSync" is usually a real conflict, not an ArgoCD bug.

## Independent challenge

No commands given — assemble it from track 07 (the cluster), module 03 (SHA-
tagged images), module 04 (why a controlled rollout matters), and this
module's ArgoCD concepts. Set up a genuine two-repo GitOps deployment for
your demo app and prove Git is the source of truth. Keep application source
(and the CI that builds/pushes a SHA-tagged image) in one repo, and the
Kubernetes manifests in a separate config repo that an ArgoCD Application
watches with automated sync, prune, and self-heal all on. Demonstrate four
properties, each with evidence: a normal deploy happens by committing a new
image tag to the config repo and letting ArgoCD pull it (you never run
`kubectl apply`); an out-of-band `kubectl edit` to a live resource is
reverted automatically to match Git; deleting a manifest from Git removes
the resource from the cluster; and a bad deploy is rolled back purely by
`git revert`. Then answer, in a short paragraph, the security question this
raises versus track 07 module 08's push pipeline: which system now holds
cluster-admin-level credentials, and why is that a smaller attack surface —
a point module 07 develops.

<details>
<summary>Stuck? One hint</summary>

The mental unlock is that *you never deploy to the cluster anymore* — you
only ever commit to Git, and ArgoCD is the only thing that touches the
cluster. So build the loop entirely around Git operations: to deploy, commit
a manifest change; to roll back, `git revert`; to scale, edit and commit the
replica count. If you find yourself reaching for `kubectl apply` to make a
change, that's the push-based habit — stop and make the change in Git
instead. The two-repo split matters because the app repo's CI *writes to*
the config repo (bumping the image tag), which means the CI needs push
access to the config repo (a token/deploy key), not to the cluster — that
credential shift is exactly the security point.

</details>

## Common mistakes & troubleshooting

- **Still running `kubectl apply` against a GitOps-managed app.** With
  self-heal on, ArgoCD reverts your manual change; with it off, you create
  drift ArgoCD flags forever. In GitOps, change Git, not the cluster.
- **"I synced and it's still OutOfSync."** Usually a real conflict: the sync
  *apply* failed (bad manifest — see `argocd app get`'s operation result),
  or something outside ArgoCD keeps mutating the resource (an HPA vs. a
  pinned `replicas` field). It's rarely an ArgoCD bug; read the diff and the
  conditions.
- **Pinning a field another controller owns.** If Git hard-codes `replicas`
  but an HPA (track 07 module 05) manages it, the app flaps `OutOfSync`
  endlessly. Let the HPA own `replicas` — remove it from the Git manifest.
- **Enabling auto-prune without understanding it.** A commit that removes or
  mis-paths a manifest will *delete* the live resource. Prune makes Git
  authoritative for deletions — powerful, but review deletion commits
  carefully.
- **Treating self-heal as optional decoration.** Self-heal is what enforces
  "Git is the truth" — without it, anyone's `kubectl edit` silently persists.
  But it also means emergency manual hotfixes get reverted; the fix belongs
  in Git.
- **Committing secrets in plaintext to the GitOps repo.** Manifests in Git
  are readable by anyone with repo access. Kubernetes Secrets are only
  base64, not encrypted — use sealed-secrets/SOPS/external secret operators
  (previewed here, deepened in track 11/16) rather than committing raw
  secrets.
- **CI pipeline still pushing to the cluster in a GitOps setup.** If your
  pipeline both bumps the Git tag *and* runs `kubectl set image`, you have
  two systems fighting over the cluster. Pick one: in GitOps, CI writes to
  Git and stops.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In GitOps, where does the deploy logic run, and what is the CI pipeline's
   *last* step (contrast with track 07 module 08's last step)?
2. What is an ArgoCD Application, and what two status axes does it report?
3. What is the difference between `OutOfSync` and `Degraded`?
4. What do `automated`, `prune`, and `selfHeal` each add to a sync policy?
5. You `kubectl scale` a self-healing ArgoCD app to 9 replicas. What
   happens, and why?
6. Why does GitOps reduce the credential/attack surface compared to a
   push-based pipeline (preview of module 07)?
7. An app is stuck `OutOfSync` even after syncing, and the replica count
   keeps flapping. What's the likely cause and the fix?
8. How do you roll back a deployment in a GitOps world, and why is no
   special deploy tooling needed?

<details>
<summary>Show answers</summary>

1. The deploy logic runs *inside* the cluster in the ArgoCD controller,
   which pulls from Git. The CI pipeline's last step is to **commit the new
   image tag/manifest to Git** and stop — it never touches the cluster.
   Track 07 module 08's last step was `kubectl set image` directly against
   the cluster (push).
2. An Application is a declarative object pointing at a Git repo/path/
   revision as the desired state and a target cluster/namespace. It reports
   **sync status** (`Synced`/`OutOfSync` — does the cluster match Git?) and
   **health status** (`Healthy`/`Progressing`/`Degraded` — are the resources
   actually working?).
3. `OutOfSync` means the live cluster differs from what Git declares (a
   reconciliation state). `Degraded` means the deployed resources exist but
   are unhealthy (e.g. pods crash-looping). An app can be `Synced` but
   `Degraded` (matches Git, but the Git-declared thing is broken).
4. `automated` applies Git changes to the cluster without a manual sync;
   `prune` also deletes cluster resources removed from Git (Git authoritative
   for deletions); `selfHeal` reverts out-of-band cluster changes back to the
   Git state (drift correction).
5. ArgoCD detects the drift (cluster has 9, Git says N) and, because
   self-heal is on, reverts the Deployment back to the Git-declared count
   within seconds. Git is authoritative, so the manual change is undone.
6. In push, the external pipeline holds standing cluster-admin credentials.
   In pull, no external system holds cluster credentials — the in-cluster
   controller pulls from Git, so a compromised CI system can at most commit
   to Git (reviewable, revertible) rather than directly command the cluster.
7. Something outside ArgoCD keeps changing the resource — typically an HPA
   managing `replicas` while the Git manifest pins a fixed `replicas`, so
   they conflict forever. Fix: remove `replicas` from the Git manifest so the
   HPA owns that field.
8. `git revert` the offending commit (or `argocd app rollback` to a prior
   synced revision) and push; ArgoCD reconciles the cluster back to that
   state. No special tooling is needed because the deploy state *is* Git
   history, so ordinary Git operations are the rollback mechanism.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-04 while attempting these — find out
what actually stuck across the whole first half of the track.

1. Trace one code change from a developer's commit all the way to running in
   the cluster, for both a *push-based* pipeline (track 07 module 08) and a
   *pull-based* GitOps setup (module 05). Name the tool doing each step and
   where cluster credentials live in each.
2. You tag every image `latest`. Name three distinct things this breaks,
   pulling from modules 00, 03, and 04, and say which is a rollout problem,
   which a traceability problem, and which a rollback problem.
3. A PR with a failing test can still be merged to `main`. Give the
   module-02 cause. Separately, a merged PR that passed CI still broke
   `main`. Give a different module-02 cause. Are these the same fix?
4. Map each strategy from module 04 (rolling, blue/green, canary) to how
   you'd *roll it back*, and to whether ArgoCD self-heal (module 05) would
   help or interfere with each.
5. Your CI job `build` pushes an image and job `deploy` (in a GitOps setup)
   commits the tag to the config repo, but `deploy` commits the *wrong* tag.
   Give the module-01/03 cause (how the tag should have flowed) and the fix.
6. Explain how "build once, deploy many" (module 00), SHA tagging (module
   03), and Git-as-source-of-truth (module 05) reinforce each other to make
   a deploy both traceable and revertible.
7. A self-healing ArgoCD app flaps `OutOfSync` forever. Independently, a
   replica-ratio canary (module 04) keeps drifting its traffic split. What
   single track-07-module-05 concept explains *both* problems?
8. For true continuous *deployment* to production (module 00), list the
   capabilities you'd need from modules 02, 04, and 05, one line each on why.
9. Someone runs `kubectl edit` on a production Deployment to hotfix it. What
   happens under push-based CD versus under GitOps with self-heal, and which
   is "correct"?
10. Why is committing a raw Kubernetes Secret to a GitOps repo a mistake even
    though the repo is private, and what does base64 encoding *not* give you?

<details>
<summary>Show answers</summary>

1. **Push:** developer commits → CI runner (GitHub Actions) builds+pushes
   image (module 03) → same runner runs `kubectl set image`/`helm` against
   AKS. Cluster credentials live in the CI system. **Pull:** developer
   commits → CI builds+pushes image and commits the new tag to a Git config
   repo → ArgoCD (in-cluster) pulls the change and applies it. Cluster
   credentials live only inside the cluster; CI holds only Git push access.
2. (a) Breaks `kubectl set image` rollouts — the pod spec text never changes
   (rollout problem, modules 03/04/track 07 module 08). (b) Destroys
   traceability — you can't map the image to a commit (traceability problem,
   modules 00/03). (c) Makes rollback impossible — no stable prior reference
   to return to (rollback problem, modules 03/04). Same root cause (a
   mutable, non-unique tag), three symptoms.
3. Mergeable-despite-failing: the check isn't *required* (branch protection
   not enforcing it). Merged-but-broke-main: "require up to date before
   merge" wasn't set, so a combination bug slipped through. Different fixes —
   one enables a required check, the other enables the up-to-date
   requirement.
4. Rolling → `kubectl rollout undo`; blue/green → flip the Service selector
   back to blue; canary → re-weight (or scale) traffic to 0% on the new
   version. Self-heal helps keep the *declared* state enforced but would
   *interfere* with an out-of-band manual rollback (it'd revert your manual
   flip back to what Git says) — in GitOps you roll back via Git, not by hand.
5. The tag should have been computed once in `build` and passed via a job
   output (`needs.build.outputs...`, modules 01/03); `deploy` recomputed it
   independently and diverged. Fix: expose the tag as a job output and have
   `deploy` consume only that.
6. Build-once produces a single immutable artifact; the SHA tag gives that
   artifact a unique, traceable identity mapping to an exact commit; storing
   that tag in Git makes the *deployed* state an audited, revertible record.
   Together: what ran is provably what you built, you can name it exactly,
   and you can revert to any prior one with `git revert`.
7. A controller you didn't account for owning a field — the HPA (track 07
   module 05) manages `replicas`. It fights ArgoCD's pinned `replicas`
   (endless `OutOfSync`) and silently changes the pod counts that *are* the
   canary's traffic split. Both are "another controller owns the field you're
   trying to control."
8. Module 02: a strong required test suite (the only backstop with no human
   gate). Module 04: a canary/blue-green strategy to limit blast radius.
   Module 05: GitOps with automated sync (and, for safety, self-heal +
   auditable rollback) so deploys are declarative and instantly revertible.
9. Push-based: the manual edit persists — the cluster stays however it was
   last left. GitOps with self-heal: ArgoCD reverts the edit back to Git
   within seconds. GitOps is "correct" for the model — the fix belongs in
   Git (commit it) so the change is reviewed and durable, not a snowflake
   edit that disappears on the next sync.
10. Anyone with repo access can read it, and base64 is *encoding, not
    encryption* — it provides no confidentiality at all. A private repo
    limits *who* can read, but the secret is still stored in plaintext-
    equivalent form in Git history forever. Use sealed-secrets/SOPS/an
    external secrets operator instead.

</details>

## Next

[06-progressive-delivery-canary-and-blue-green](../06-progressive-delivery-canary-and-blue-green/README.md)
— automate the canary and blue/green strategies from module 04 with Argo
Rollouts, gated on real metrics.
