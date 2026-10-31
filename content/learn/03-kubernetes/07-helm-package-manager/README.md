# 07 - Helm Package Manager

## Why this matters

By now you've hand-written Deployments, Services, ConfigMaps, Secrets,
and PVCs — and noticed how much of that YAML repeats itself between
environments (dev vs. staging, different replica counts, different image
tags). Helm is to a set of Kubernetes manifests roughly what a package
manager plus a templating engine is to a pile of config files: it lets
you parameterize, version, package, install, upgrade, and roll back a
whole application's manifests as one unit, instead of manually tracking
which `kubectl apply` commands you ran in which order.

## Concepts

**A Helm chart is a directory (or packaged archive) of templated YAML**
plus metadata describing the application. "Templated" means the actual
manifests contain placeholders (`{{ .Values.replicaCount }}`) filled in
from a values file at install time — the same YAML shape you've been
writing by hand in every previous module, just with the parts that
change between environments pulled out into variables.

**A release is one installed instance of a chart** in a cluster,
identified by a release name. You can install the same chart multiple
times under different release names (e.g. `helm install app-dev
./mychart` and `helm install app-staging ./mychart` with different
values) — this is exactly analogous to running multiple containers from
one image with different config, just at the scale of a whole set of
Kubernetes objects.

**`values.yaml`** holds the default parameters for a chart — replica
count, image tag, resource requests, whatever the chart's author chose
to expose. You override any of it at install/upgrade time with `--set
key=value` or `-f my-values.yaml`, without touching the chart's
templates at all. This is the mechanism that turns "one chart" into "one
chart deployable to dev, staging, and prod with different settings."

```
   templates/*.yaml  ┐
   {{ .Values.x }}   │            ┌───────────────────┐   helm install
                     ├──render──► │ rendered manifests │ ──────────────►
   values.yaml       │            │ (plain Deployment, │   ┌───────────┐
   + --set / -f      ┘            │  Service, ...)     │   │  release  │
   (overrides layer                └───────────────────┘   │  in the   │
    on top)                        `helm template` shows     │  cluster  │
                                    this without installing  └───────────┘
```

**Templates use Go template syntax** embedded in otherwise-normal YAML:
`{{ .Values.foo }}` pulls from values, `{{ .Release.Name }}` gives you
the current release's name (handy for uniquely naming objects so
multiple releases of the same chart don't collide), `{{ .Chart.Version
}}` gives you chart metadata, and control structures like `{{- if
.Values.ingress.enabled }}...{{- end }}` conditionally include blocks —
e.g. only render an Ingress object at all if the user enabled it in
values.

**Helm's release history works like the Deployment rollout history you
already know** (module 03) but one level up: every `helm upgrade` records
a new revision of the *whole release*, and `helm rollback` reverts every
object in the release back to a previous revision's rendered state in
one command — instead of you manually figuring out which individual
Deployment/ConfigMap/Service changed.

**A repository (repo) is just a place charts are published to be
downloaded from** — conceptually identical to a container registry
(including ACR, which can actually host Helm charts as OCI artifacts),
except it serves charts instead of images. `helm repo add` +
`helm search repo` is to charts what `docker pull`/searching Docker Hub
is to images.

**`helm template`** renders a chart's templates locally, without
installing anything or talking to a cluster at all — the fastest way to
see exactly what YAML a chart *would* produce, and an essential
debugging tool before you ever run `helm install`.

**Helm hooks** let a chart run a Job at specific points in a release's
lifecycle (`pre-install`, `post-upgrade`, etc.) — e.g. running a database
migration before the new application version's Pods start. Worth knowing
the name exists; not required for the exercises below.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `helm version` | Shows the installed Helm client version | `helm version` |
| `helm create <name>` | Scaffolds a new chart with a standard structure and example templates | `helm create mychart` |
| `helm template <release> <chart>` | Renders a chart's templates locally without installing | `helm template demo ./mychart` |
| `helm lint <chart>` | Checks a chart for structural/syntax issues | `helm lint ./mychart` |
| `helm install <release> <chart>` | Installs a chart as a new release | `helm install demo ./mychart` |
| `helm install <release> <chart> -f <values-file>` | Installs with overridden values from a file | `helm install demo ./mychart -f values-dev.yaml` |
| `helm install <release> <chart> --set <k>=<v>` | Installs with one or more values overridden inline | `helm install demo ./mychart --set replicaCount=3` |
| `helm list` | Lists installed releases in the current namespace | `helm list -A` |
| `helm status <release>` | Shows a release's current status and notes | `helm status demo` |
| `helm upgrade <release> <chart>` | Updates an existing release to new chart content/values | `helm upgrade demo ./mychart --set image.tag=1.28` |
| `helm upgrade --install <release> <chart>` | Installs if the release doesn't exist, upgrades if it does | `helm upgrade --install demo ./mychart` |
| `helm rollback <release> <revision>` | Reverts a release to a previous revision | `helm rollback demo 1` |
| `helm history <release>` | Lists a release's revision history | `helm history demo` |
| `helm uninstall <release>` | Deletes a release and everything it created | `helm uninstall demo` |
| `helm repo add <name> <url>` | Registers a chart repository | `helm repo add bitnami https://charts.bitnami.com/bitnami` |
| `helm search repo <term>` | Searches added repositories for charts | `helm search repo nginx` |
| `helm show values <chart>` | Prints a chart's default `values.yaml` | `helm show values bitnami/nginx` |

## Hands-on exercises

Continue in namespace `demo`. Install Helm first if you haven't:

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### 1. Scaffold a chart

```bash
helm create mychart
find mychart -type f | sort
```

Expected: a directory tree with `Chart.yaml`, `values.yaml`,
`templates/deployment.yaml`, `templates/service.yaml`, and more — a
working example chart you can install right away.

### 2. Render it locally without installing anything

```bash
helm template demo ./mychart | less
```

Expected: full Deployment and Service YAML printed to your terminal —
notice the object names incorporate `demo` (the release name you gave)
and values pulled from `mychart/values.yaml`.

### 3. Install it

```bash
helm install demo ./mychart
helm list
kubectl get deployments,services,pods
```

Expected: `helm list` shows release `demo`, `STATUS: deployed`,
`REVISION: 1`; `kubectl get` shows the actual Deployment/Service/Pods it
created — same objects you've created by hand all track, just produced
by a template instead of a manifest you typed yourself.

### 4. Access the app it deployed

```bash
kubectl get svc
kubectl port-forward svc/demo-mychart 8080:80
```

In another terminal:

```bash
curl localhost:8080
```

Expected: the scaffolded chart's default nginx welcome page. Ctrl+C the
port-forward when done.

### 5. Override values at install time

```bash
helm upgrade demo ./mychart --set replicaCount=3
kubectl get pods -l app.kubernetes.io/instance=demo
helm get values demo
```

Expected: 3 Pods now instead of 1 (the chart's default); `helm get
values` shows only your override (`replicaCount: 3`), not the chart's
full defaults — Helm layers your overrides on top of `values.yaml`.

### 6. Write your own values file for a specific environment

```yaml
# values-dev.yaml
replicaCount: 2
image:
  repository: nginx
  tag: "1.27"
resources:
  requests:
    cpu: "50m"
    memory: "64Mi"
  limits:
    cpu: "200m"
    memory: "128Mi"
```

```bash
helm upgrade demo ./mychart -f values-dev.yaml
kubectl get pods -l app.kubernetes.io/instance=demo
kubectl describe deployment demo-mychart | grep -A6 Limits
```

Expected: 2 Pods now, image `nginx:1.27`, and the resource
requests/limits you specified showing up on the Deployment.

### 7. Release history and rollback

```bash
helm history demo
helm upgrade demo ./mychart --set replicaCount=1
helm history demo
helm rollback demo 1
helm history demo
kubectl get pods -l app.kubernetes.io/instance=demo
```

Expected: `history` grows by one revision per `upgrade`;
after `rollback demo 1`, the release is back to revision 1's rendered
state — `replicaCount` back to whatever revision 1 specified, with a new
revision number recorded for the rollback itself (Helm rollbacks are
themselves new revisions, exactly like `kubectl rollout undo` in
module 03).

### 8. Add a real chart repository and inspect a published chart

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo bitnami/nginx
helm show values bitnami/nginx | head -40
```

Expected: search results list `bitnami/nginx` (and others);
`show values` prints that chart's full configurable surface — the same
concept as your own `mychart/values.yaml`, just for a chart you didn't
write.

### 9. Customize your chart's templates directly

Open `mychart/templates/deployment.yaml` and find the `livenessProbe`/
`readinessProbe` section (or add one if the scaffold didn't include it),
then add resource requests/limits driven by values if not already
templated. Confirm your edit renders correctly before installing:

```bash
helm lint ./mychart
helm template demo ./mychart | grep -A6 resources
helm upgrade demo ./mychart
```

Expected: `lint` reports no errors; the rendered output reflects your
template edit; the live release updates to match.

### 10. Diagnose and fix: a values override that doesn't match the chart's expected structure

```bash
helm upgrade demo ./mychart --set relicaCount=5
```

(note the deliberate typo: `relicaCount` instead of `replicaCount`)

```bash
kubectl get pods -l app.kubernetes.io/instance=demo
```

Expected: Pod count does **not** change — Helm silently accepted an
override for a value the chart never reads, since `--set` doesn't
validate against any schema by default. Diagnose:

```bash
helm get values demo
helm template demo ./mychart --set relicaCount=5 | grep replicas
```

Expected: `get values` shows your (wrong) key was recorded, but
`template`'s rendered `replicas:` line still shows the old value — proof
the typo'd key was simply ignored, not applied. Fix by using the correct
key:

```bash
helm upgrade demo ./mychart --set replicaCount=5
kubectl get pods -l app.kubernetes.io/instance=demo
```

Expected: 5 Pods now. This is a good habit to take away: after any
`--set`, spot-check with `helm template` (or `helm get values` plus
`kubectl get`) that the override actually landed where you expected.

Clean up:

```bash
helm uninstall demo
kubectl get all
```

Expected: `No resources found` (aside from anything left from earlier
modules) — `helm uninstall` removed every object the release created, in
one command.

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** Take a working application you've already built by hand across
earlier modules — a Deployment with resource requests/limits, a Service, a
ConfigMap consumed as env vars, and a PVC mounted for durable data — and
package all of it as a single Helm chart. Expose, at minimum, the replica
count, the image tag, and the ConfigMap's log-level value as chart values.
Then install it once as `app-dev` with 1 replica and again as `app-stg`
with 3 replicas from the *same* chart, in the same namespace, and confirm
both releases coexist without their objects colliding. Verify the rendered
output before installing anything, and demonstrate a rollback of one
release. This pulls together modules 03 (Deployments), 04 (Services), 05
(ConfigMaps), and 06 (PVCs) under this module's templating.

<details>
<summary>Stuck? One hint</summary>

Two releases avoid collisions only if object names incorporate
`{{ .Release.Name }}`; run `helm template <release> <chart>` to inspect
the YAML before `helm install`, and `helm rollback <release> <revision>`
after an upgrade.

</details>

## Common mistakes & troubleshooting

- **Typo'd `--set` keys being silently ignored**: Helm doesn't validate
  that a `--set`/values-file key corresponds to anything a chart's
  templates actually reference — a typo just does nothing, with no
  error. Always verify with `helm template` or `helm get values` after
  a nontrivial override.
- **Forgetting `helm upgrade` needs the chart path/name again**: unlike
  `kubectl apply -f` re-applying the same file, `helm upgrade <release>
  <chart>` needs both the release name *and* the chart reference every
  time — easy to forget the chart argument if you're only thinking about
  which values changed.
- **Editing rendered manifests instead of the chart templates**: if you
  `kubectl edit` an object a Helm release created, your edit stays until
  the *next* `helm upgrade`, which overwrites it back to what the
  template renders — always change the chart or its values, not the live
  object, for changes you want to keep.
- **Not running `helm lint`/`helm template` before installing**: catches
  templating syntax errors and structural mistakes before they become a
  half-applied release in the cluster.
- **Assuming `helm uninstall` cleans up PVCs**: by default, many charts'
  PersistentVolumeClaims are *not* deleted automatically on uninstall (to
  protect data) — check `kubectl get pvc` after uninstalling if you
  expected a clean slate.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the relationship between a chart, a release, and `values.yaml`?
2. What does `helm template` do, and why is it useful before ever
   running `helm install`?
3. If two people `helm install` the same chart under different release
   names in the same namespace, what keeps their objects from colliding?
4. What happened when you passed `--set relicaCount=5` (typo'd) in
   exercise 10, and why didn't Helm reject it?
5. What does `helm rollback demo 1` actually do — does it delete
   revisions after 1, or create a new revision matching revision 1's
   state?
6. Why might editing a live object created by a Helm release with
   `kubectl edit` be a bad idea long-term?

<details>
<summary>Show answers</summary>

1. A chart is the packaged, templated set of manifests plus metadata; a
   release is one named, installed instance of a chart in a cluster;
   `values.yaml` supplies the default parameters the chart's templates
   are filled in with, and can be overridden per-install/upgrade.
2. It renders the chart's templates into final YAML locally, without
   touching the cluster — letting you review exactly what would be
   created/changed before committing to an actual install/upgrade.
3. Helm charts typically incorporate the release name into object names
   (e.g. `{{ .Release.Name }}-mychart`), so two releases of the same
   chart produce differently-named objects that don't collide.
4. Nothing changed — Helm doesn't validate that a `--set` key matches
   anything the chart's templates actually reference, so a typo'd key is
   silently recorded but never used, with no error raised.
5. It creates a *new* revision whose rendered state matches revision 1 —
   rollbacks are themselves new revisions in the history, not a deletion
   of anything.
6. The next `helm upgrade` re-renders and re-applies the chart's
   templates, overwriting any manual edit back to what the chart/values
   specify — manual edits to Helm-managed objects don't survive the next
   upgrade.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the
point is to find out what actually stuck.

1. A Helm chart renders a Deployment, a ClusterIP Service, and a
   ConfigMap. After `helm install`, `kubectl get endpoints <svc>` shows
   `<none>`. Explain how a templating mistake in the chart could cause
   this even though every object was "created successfully," and which two
   labels must agree for it to route.
2. Your chart mounts a ConfigMap as env vars and also templates the image
   tag. You `helm upgrade` to change only the ConfigMap's value. Do the
   running Pods see the new value? Explain why or why not, and what the
   answer would be if the ConfigMap were mounted as a file instead.
3. You install the same chart twice in one namespace as `web-a` and
   `web-b`. What Helm mechanism keeps their Deployments and Services from
   colliding, and what would collide anyway if the chart hard-coded a
   PVC's `metadata.name` instead of templating it?
4. A `LoadBalancer` Service defined in your chart shows `EXTERNAL-IP:
   <pending>` forever on kind. Is this a chart bug? What would you use
   locally to reach it instead, and what changes on a real cloud cluster?
5. Your chart's Deployment sets a `targetPort` of 8080 but the container
   listens on 80, and the Service's `port` is 80. Trace exactly where
   traffic breaks when a client hits the Service, and how
   `kubectl get endpoints` would look.
6. You run `helm upgrade <release> <chart> --set image.tag=1.28` and it
   completes, but the Pods still run the old image. Give the most likely
   Helm-specific cause (module 07) and how you'd confirm it in one command
   before assuming the cluster is broken.
7. A chart mounts a Secret as a file for a database password and also
   references a PVC for the database's data. After `helm uninstall`,
   which of these two is most likely to survive, and why does that
   default exist?
8. Explain how Helm's release-revision history and `kubectl rollout
   undo` differ in scope: if a single `helm upgrade` changed a
   Deployment's image *and* a ConfigMap's value, what does `helm rollback`
   revert versus what `kubectl rollout undo` on that Deployment reverts?
9. You want a Pod from the chart to only be sent traffic once it can serve
   requests, and its PVC-backed data to survive a rolling update. Name the
   two distinct fields (from modules 02/04 and module 06) that give you
   each guarantee, and confirm neither is a Helm concept — Helm only
   templates them.

<details>
<summary>Show answers</summary>

1. If the Service's `spec.selector` labels don't match the labels the
   chart puts on the Deployment's Pod template
   (`spec.template.metadata.labels`), the Service has zero endpoints even
   though both objects exist — a templating typo (e.g. a value used in one
   place but not the other) is a common cause. The Service selector and
   the Pod template labels must agree.
2. No — env-var values are read only at container start, so an upgrade
   that changes just the ConfigMap won't reach already-running Pods unless
   the Pods are also restarted (Helm doesn't roll them for a ConfigMap-only
   change by default). Mounted as a file, the kubelet would sync the new
   value into the container without a restart (though the app must notice).
3. Helm charts incorporate `{{ .Release.Name }}` into object names, so
   `web-a-*` and `web-b-*` objects don't collide. A PVC with a hard-coded
   `metadata.name` would collide — both releases would try to create/own
   the same claim.
4. Not a bug — there's no cloud load-balancer controller on kind to fulfill
   a `LoadBalancer`, so it stays `<pending>` by design. Locally you'd reach
   it via `kubectl port-forward` (or NodePort/Ingress); on a real cloud
   cluster the provider provisions an actual load balancer and populates
   `EXTERNAL-IP`.
5. The Service has healthy endpoints (Pods match its selector), but it
   forwards to `targetPort` 8080 inside the Pod where nothing is
   listening, so the connection times out / resets. `kubectl get
   endpoints` shows `<pod-ip>:8080` — pointing at the wrong port on
   otherwise-healthy Pods.
6. Most likely a typo'd `--set` key (e.g. `--set image.taag=...`), which
   Helm silently records but never applies since it validates nothing
   against the templates. Confirm with `helm template <release> <chart>
   --set image.tag=1.28 | grep image:` (or `helm get values`) to see
   whether the override actually lands in the rendered YAML.
7. The PVC is most likely to survive — many charts (and Helm's defaults
   for some resources) do not delete PVCs on uninstall specifically to
   protect data from accidental loss, whereas the Secret is a normal
   release-owned object that gets removed.
8. `helm rollback` reverts the *entire release* to a previous revision's
   rendered state — both the Deployment's image and the ConfigMap's value
   go back together. `kubectl rollout undo` on that Deployment only reverts
   the Deployment's Pod template (the image); it knows nothing about the
   ConfigMap, which would stay at its new value.
9. A `readinessProbe` (modules 02/04) gates whether the Pod receives
   Service traffic; referencing a PVC by `claimName` in the Pod's volumes
   (module 06) makes the data outlive Pod replacement during a rolling
   update. Both are ordinary Kubernetes fields — Helm only fills them in
   from values, it doesn't provide the behavior itself.

</details>

## Further reading & sources

- [Helm Documentation](https://helm.sh/docs/) - the official home for all Helm concepts and commands.
- [Charts](https://helm.sh/docs/topics/charts/) - the anatomy of a chart, templates, and `Chart.yaml`.
- [Values Files](https://helm.sh/docs/chart_template_guide/values_files/) - how `values.yaml` and `--set`/`-f` overrides layer together.
- [The Chart Template Developer's Guide](https://helm.sh/docs/chart_template_guide/) - Go templating, built-in objects like `.Release.Name`, and control structures.
- [Helm Commands (helm install / upgrade / rollback)](https://helm.sh/docs/helm/helm/) - the full CLI reference for the release lifecycle used here.

## Next

[08-ingress-controllers](../08-ingress-controllers/README.md) — route
HTTP(S) traffic for multiple Services through one shared entry point,
instead of a separate LoadBalancer/NodePort per app.
