# 05 - ConfigMaps and Secrets

## Why this matters

You already know from the Docker track not to bake environment-specific
values into an image — that's why `docker run -e` and `.env` files exist.
Kubernetes has the same principle at cluster scale: ConfigMaps and
Secrets let the same Pod template (same image, same Deployment YAML) run
in different environments with different configuration, without ever
rebuilding the image. Secrets additionally give you a (mildly) safer way
to handle credentials than plain environment variables baked into a
manifest committed to git.

## Concepts

**A ConfigMap is just a named bag of key-value data**, stored in the
cluster (in etcd, via the API server, exactly like every other object
from module 01). It holds no logic — it's a place to put configuration
so it's decoupled from your Pod template and your image, similar in
spirit to a `.env` file, except it lives in the cluster instead of on
disk.

**A Secret is structurally almost identical to a ConfigMap** — same
shape, same ways to consume it — but intended for sensitive values
(passwords, tokens, keys). The values are stored base64-encoded, which is
**encoding, not encryption** — anyone who can read the Secret object via
the API can trivially decode it. Base64 exists so binary data survives
transport in YAML/JSON, not for security. Real protection comes from
restricting *who can read Secret objects at all* (RBAC, module 11) and,
in production clusters, encrypting etcd at rest — a cluster-admin-level
concern, not something you configure per-Secret.

**Three ways to consume either one in a Pod**:
1. **As environment variables** — one at a time (`env.valueFrom`) or all
   keys at once (`envFrom`). Simple, but the Pod must be restarted to
   pick up changes, and env vars are visible in `kubectl describe pod`
   and process listings inside the container (a mild exposure concern
   for Secrets).
2. **As mounted files** — each key becomes a file in a directory inside
   the container, with the key's value as file content. Files *can*
   update live when the ConfigMap/Secret changes (the kubelet
   periodically syncs mounted ConfigMaps/Secrets), without a Pod
   restart, though your application still needs to notice the file
   changed.
3. **Referenced directly by other objects** — e.g., an `imagePullSecrets`
   entry referencing a Secret holding registry credentials, which is how
   a Pod authenticates to pull an image from a private registry like
   Azure Container Registry.

**Why the split into two object types at all**, given they're
structurally so similar: it's a signal to humans and tooling. RBAC rules
(module 11) commonly grant broad read access to ConfigMaps but restrict
Secret reads tightly; tools that scan manifests for accidentally-committed
credentials look specifically for Secret objects. Using a Secret for
anything sensitive — even if a ConfigMap would technically work — is the
convention that keeps those protections meaningful.

**Immutable ConfigMaps/Secrets** (`immutable: true`) tell the API server
to reject any future updates to the object — useful for config you
version by creating a new object (e.g. `app-config-v2`) rather than
editing in place, which also lets the kubelet skip watching it for
changes, a minor performance win at cluster scale.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl create configmap <name> --from-literal=<k>=<v>` | Creates a ConfigMap from literal key/value pairs | `kubectl create configmap app-config --from-literal=LOG_LEVEL=debug` |
| `kubectl create configmap <name> --from-file=<path>` | Creates a ConfigMap from a file (filename becomes the key) | `kubectl create configmap nginx-conf --from-file=nginx.conf` |
| `kubectl create secret generic <name> --from-literal=<k>=<v>` | Creates a generic Secret from literal values | `kubectl create secret generic db-creds --from-literal=password=s3cr3t` |
| `kubectl create secret docker-registry <name> --docker-server=... --docker-username=... --docker-password=...` | Creates a Secret usable as `imagePullSecrets` | `kubectl create secret docker-registry acr-secret --docker-server=myregistry.azurecr.io --docker-username=... --docker-password=...` |
| `kubectl get configmaps` / `kubectl get secrets` | Lists ConfigMaps/Secrets | `kubectl get cm; kubectl get secrets` |
| `kubectl describe configmap <name>` | Shows keys and (for ConfigMaps) values | `kubectl describe cm app-config` |
| `kubectl get secret <name> -o jsonpath='{.data.<key>}' \| base64 -d` | Decodes a Secret value for inspection | `kubectl get secret db-creds -o jsonpath='{.data.password}' \| base64 -d` |
| `envFrom.configMapRef` / `envFrom.secretRef` | Injects every key in a ConfigMap/Secret as env vars | see exercises |
| `env[].valueFrom.configMapKeyRef` / `secretKeyRef` | Injects one specific key as one env var | see exercises |
| `volumes[].configMap` / `volumes[].secret` | Mounts a ConfigMap/Secret as files in a volume | see exercises |
| `spec.imagePullSecrets` | References a docker-registry Secret for pulling private images | `imagePullSecrets: [{name: acr-secret}]` |

## Hands-on exercises

Continue in namespace `demo`.

### 1. Create a ConfigMap two ways

```bash
kubectl create configmap app-config --from-literal=LOG_LEVEL=debug --from-literal=GREETING="hello from configmap"
kubectl get configmap app-config -o yaml
```

Expected: a `data` section with both keys, in plain text (ConfigMaps are
never encoded).

### 2. Consume it as environment variables (all keys at once)

```yaml
# pod-cm-env.yaml
apiVersion: v1
kind: Pod
metadata:
  name: cm-env-demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "env | grep -E 'LOG_LEVEL|GREETING'; sleep 3600"]
      envFrom:
        - configMapRef:
            name: app-config
```

```bash
kubectl apply -f pod-cm-env.yaml
kubectl logs cm-env-demo
```

Expected: `LOG_LEVEL=debug` and `GREETING=hello from configmap` printed.

### 3. Consume one specific key

```yaml
# pod-cm-onekey.yaml
apiVersion: v1
kind: Pod
metadata:
  name: cm-onekey-demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "echo \"level is: $MY_LOG_LEVEL\"; sleep 3600"]
      env:
        - name: MY_LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL
```

```bash
kubectl apply -f pod-cm-onekey.yaml
kubectl logs cm-onekey-demo
```

Expected: `level is: debug` — note the env var name (`MY_LOG_LEVEL`) can
differ from the ConfigMap key name (`LOG_LEVEL`).

### 4. Mount a ConfigMap as files

```yaml
# pod-cm-volume.yaml
apiVersion: v1
kind: Pod
metadata:
  name: cm-volume-demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: config-vol
          mountPath: /etc/app-config
  volumes:
    - name: config-vol
      configMap:
        name: app-config
```

```bash
kubectl apply -f pod-cm-volume.yaml
kubectl exec cm-volume-demo -- ls /etc/app-config
kubectl exec cm-volume-demo -- cat /etc/app-config/GREETING
```

Expected: files named `LOG_LEVEL` and `GREETING`, each containing that
key's value.

### 5. Create and inspect a Secret

```bash
kubectl create secret generic db-creds --from-literal=username=admin --from-literal=password='S3cr3tP@ss'
kubectl get secret db-creds -o yaml
```

Expected: `data` section shows base64 strings, not plaintext. Decode one:

```bash
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d; echo
```

Expected: `S3cr3tP@ss` prints — proving base64 is not real protection,
just encoding.

### 6. Consume a Secret as env vars and as a mounted file

```yaml
# pod-secret-demo.yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-creds
              key: username
      volumeMounts:
        - name: secret-vol
          mountPath: /etc/secrets
          readOnly: true
  volumes:
    - name: secret-vol
      secret:
        secretName: db-creds
```

```bash
kubectl apply -f pod-secret-demo.yaml
kubectl exec secret-demo -- sh -c 'echo $DB_USERNAME; cat /etc/secrets/password'
```

Expected: `admin` then `S3cr3tP@ss` — both files under
`/etc/secrets/` already decoded, not base64.

### 7. Live-update a mounted ConfigMap without restarting the Pod

```bash
kubectl create configmap live-config --from-literal=MESSAGE="version 1"
```

```yaml
# pod-live.yaml
apiVersion: v1
kind: Pod
metadata:
  name: live-demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "while true; do cat /etc/live/MESSAGE; sleep 5; done"]
      volumeMounts:
        - name: live-vol
          mountPath: /etc/live
  volumes:
    - name: live-vol
      configMap:
        name: live-config
```

```bash
kubectl apply -f pod-live.yaml
kubectl logs live-demo --follow &
kubectl patch configmap live-config --type=merge -p '{"data":{"MESSAGE":"version 2"}}'
```

Expected: within roughly a minute (the kubelet's sync interval), the
looped output changes from `version 1` to `version 2` with no Pod
restart. Stop following logs with Ctrl+C (or `kill %1`) when you've
confirmed it.

### 8. Use a Secret for private registry pulls (as you'd do for ACR)

```bash
kubectl create secret docker-registry acr-secret \
  --docker-server=myregistry.azurecr.io \
  --docker-username=myuser \
  --docker-password=mypassword \
  --docker-email=me@example.com
kubectl get secret acr-secret -o yaml
```

Expected: a Secret of type `kubernetes.io/dockerconfigjson`. Reference it
in a Pod spec (don't actually run this one against a real private image
unless you have one available):

```yaml
spec:
  imagePullSecrets:
    - name: acr-secret
  containers:
    - name: app
      image: myregistry.azurecr.io/myapp:1.0
```

This is exactly what you'll do in the AKS track to pull images from
Azure Container Registry — the mechanism doesn't change, only that
there you'll typically wire ACR access via AKS's managed identity
instead of a manually-created Secret.

### 9. Diagnose and fix: env var referencing a missing key

```yaml
# pod-badref.yaml
apiVersion: v1
kind: Pod
metadata:
  name: badref-demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      env:
        - name: MY_VALUE
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DOES_NOT_EXIST
```

```bash
kubectl apply -f pod-badref.yaml
kubectl get pod badref-demo
```

Expected: `STATUS: CreateContainerConfigError`. Diagnose:

```bash
kubectl describe pod badref-demo
```

Expected: an event like `Error: couldn't find key DOES_NOT_EXIST in
ConfigMap demo/app-config`. Fix by correcting the key name to one that
actually exists (`LOG_LEVEL` or `GREETING`), re-apply, and confirm
`Running`.

### 10. Diagnose and fix: referencing a Secret/ConfigMap in the wrong namespace

```bash
kubectl create namespace other
```

```yaml
# pod-wrongns.yaml
apiVersion: v1
kind: Pod
metadata:
  name: wrongns-demo
  namespace: demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      envFrom:
        - configMapRef:
            name: config-that-lives-in-other-namespace
```

First create the referenced ConfigMap only in `other`, not `demo`:

```bash
kubectl create configmap config-that-lives-in-other-namespace --from-literal=X=1 -n other
kubectl apply -f pod-wrongns.yaml
kubectl get pod wrongns-demo -n demo
```

Expected: `CreateContainerConfigError` again — ConfigMaps/Secrets are
namespaced objects, invisible across namespace boundaries. Diagnose with
`kubectl describe pod wrongns-demo -n demo` (event mentions the
ConfigMap not found), fix by creating an equivalent ConfigMap inside
`demo` itself:

```bash
kubectl create configmap config-that-lives-in-other-namespace --from-literal=X=1 -n demo
kubectl delete pod wrongns-demo -n demo
kubectl apply -f pod-wrongns.yaml
kubectl get pod wrongns-demo -n demo
```

Expected: `Running`. Clean up this module's objects:

```bash
kubectl delete pod cm-env-demo cm-onekey-demo cm-volume-demo secret-demo live-demo badref-demo wrongns-demo -n demo
kubectl delete configmap app-config live-config config-that-lives-in-other-namespace -n demo
kubectl delete secret db-creds acr-secret -n demo
kubectl delete namespace other
```

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** Deploy a small web application (a Deployment, not a bare Pod)
whose container reads a non-sensitive setting (say, a `LOG_LEVEL`) from a
ConfigMap as an environment variable, and reads a database password from a
Secret as a mounted file. Put a Service in front of it. Now change the
`LOG_LEVEL` value in the ConfigMap and get the running Pods to actually
pick up the new value — reasoning first about whether an env-var
consumer can see the change without a restart, and doing whatever is
required to make it take effect. This combines this module's ConfigMap/
Secret consumption with Deployments (module 03) and Services (module 04).

<details>
<summary>Stuck? One hint</summary>

Env-var values are read only at container start, so a ConfigMap edit
alone won't reach a running Pod — you need to roll the Deployment's Pods
(e.g. `kubectl rollout restart deployment/<name>`); mounted-file
consumption would have updated on its own.

</details>

## Common mistakes & troubleshooting

- **Treating base64 as encryption**: anyone with API read access to a
  Secret can decode it trivially. Restrict Secret access with RBAC
  (module 11); don't rely on base64 for confidentiality.
- **Referencing a key that doesn't exist**: results in
  `CreateContainerConfigError`, not a clear "typo" message — always
  cross-check the exact key names with `kubectl describe
  configmap/secret <name>`.
- **Forgetting ConfigMaps/Secrets are namespaced**: a Pod in namespace
  `demo` cannot reference a ConfigMap/Secret that only exists in
  namespace `other` — you need one in each namespace that needs it, or a
  templating tool (Helm, module 07) to keep them in sync.
- **Expecting env-var consumption to update live**: it won't — Pods only
  read env vars at container start, so a ConfigMap/Secret change
  requires a Pod restart (a rolling restart of a Deployment) to take
  effect when consumed as env vars, unlike mounted-file consumption.
- **Committing plaintext Secret manifests to git**: a Secret's `data` is
  only base64, so a committed manifest is functionally a committed
  plaintext credential — treat Secret YAML the same as any other
  credential file (don't commit it; use e.g. `kubectl create secret` in
  a pipeline, or a proper secrets-management tool in production).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Structurally, what's actually different between a ConfigMap and a
   Secret?
2. Why doesn't base64 encoding provide real security for Secret values?
3. Name the three ways a Pod can consume a ConfigMap or Secret.
4. If you update a ConfigMap that's mounted as a volume in a running
   Pod, does the Pod need to restart to see the new value? What about if
   it's consumed as an environment variable?
5. Why did `pod-wrongns-demo` fail even though the ConfigMap it
   referenced definitely existed in the cluster?
6. What Secret type would you create to let a Pod pull an image from
   Azure Container Registry, and what object field references it?

<details>
<summary>Show answers</summary>

1. Almost nothing structurally — a Secret's values are stored
   base64-encoded and it's conventionally treated (and restricted via
   RBAC) as sensitive; a ConfigMap stores plaintext and is treated as
   general configuration.
2. Base64 is a reversible encoding, not encryption — anyone with read
   access to the Secret object can decode it in one command; it exists
   so arbitrary data survives YAML/JSON transport, not to hide the value.
3. As environment variables (one key or all keys), as mounted files in a
   volume, or referenced directly by another field (e.g.
   `imagePullSecrets`).
4. Mounted-file consumption updates automatically (via the kubelet's
   periodic sync) without a Pod restart, though the app must notice the
   file changed; env-var consumption requires a Pod restart because env
   vars are only read at container start.
5. ConfigMaps and Secrets are namespaced objects — a Pod can only
   reference one that exists in its own namespace, regardless of what
   exists elsewhere in the cluster.
6. A `kubernetes.io/dockerconfigjson` Secret, created with `kubectl
   create secret docker-registry ...`, referenced via
   `spec.imagePullSecrets` in the Pod spec.

</details>

## Next

[06-storage-pv-and-pvc](../06-storage-pv-and-pvc/README.md) — configuration
is externalized; next, give Pods durable storage that survives beyond a
single Pod's lifetime.
