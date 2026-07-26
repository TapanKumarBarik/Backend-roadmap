# Pod Security and Admission Control

## Why this matters

02/09 taught you to build a non-root, minimal image. But *building* an image
that could run non-root doesn't stop someone from deploying it *with* root
privileges, or with a `hostPath` mount that reaches the node's filesystem, or
with `privileged: true` that effectively hands over the host. The image is one
control; the *runtime security context* the cluster allows is another — and
until now nothing in this curriculum enforced the second. This module closes
that gap two ways: the per-Pod `securityContext` (what a Pod declares about
itself) and **Pod Security Admission** (what the cluster *refuses to admit* in
the first place). This is your first admission-control layer, and it sets up
the policy-as-code depth of module 04.

## Concepts

### `securityContext`: what a Pod declares about how it runs

03/11 scoped *API* permissions with RBAC. `securityContext` is different — it
constrains the *Linux process* the container runs as, at the kernel level.
Set at the Pod or container level, the fields that matter most for hardening:

- `runAsNonRoot: true` — refuse to start if the image would run as UID 0,
  enforcing 02/09's non-root lesson at *runtime* even if someone forgot the
  `USER` line in the Dockerfile.
- `runAsUser: <uid>` / `runAsGroup: <gid>` — pin the exact UID/GID.
- `allowPrivilegeEscalation: false` — block a process from gaining more
  privileges than its parent (e.g. via setuid binaries) — closes a common
  escalation path (STRIDE's E, module 00).
- `readOnlyRootFilesystem: true` — mount the container's root filesystem
  read-only, so an attacker who lands code execution can't write a tool, a
  web-shell, or a cron job into it. Anything the app legitimately writes must
  go to an explicitly-mounted `emptyDir`/volume.
- `capabilities.drop: ["ALL"]` — drop all Linux capabilities and add back only
  the few (if any) the app truly needs. (More on capabilities next.)
- `seccompProfile.type: RuntimeDefault` — apply a syscall filter (more below).

The key mental shift: a hardened *image* and a hardened *`securityContext`*
are two independent layers (defense in depth, module 00). You want both.

### Linux capabilities: root's powers, split into pieces

Traditional Linux is all-or-nothing: root (UID 0) can do everything, everyone
else is restricted. **Capabilities** break root's power into ~40 distinct
units (`CAP_NET_BIND_SERVICE` to bind ports below 1024, `CAP_SYS_ADMIN` the
famously-broad "almost-root", `CAP_CHOWN`, etc.). By default Docker/Kubernetes
grant a container a subset of these — more than most apps need. Best practice
is `drop: ["ALL"]` and then `add` back only the specific capability the app
requires (very often *none*). A web server that binds port 8080 needs zero
capabilities; one binding port 80 needs only `NET_BIND_SERVICE` — never the
full default set. Fewer capabilities = smaller elevation-of-privilege surface.

### seccomp: filtering which syscalls a container may make

Every interaction between a program and the kernel is a **syscall**. **seccomp**
(secure computing mode) installs a filter that restricts *which* syscalls a
container can make, blocking the exotic ones that exploits rely on while
allowing the normal ones apps use. `seccompProfile.type: RuntimeDefault`
applies the container runtime's curated default profile — a large risk
reduction for almost no effort, yet it's *off* unless you ask for it. This is
kernel-level attack-surface reduction, the same philosophy as minimal images
(02/09) applied to the syscall interface instead of installed packages.

### The dangerous knobs: privileged, host namespaces, hostPath

Some Pod settings effectively dissolve the container boundary and should be
treated as near-equivalent to giving away the node:

- `privileged: true` — disables most isolation; the container gets nearly full
  access to the host kernel and devices. A privileged container escape *is* a
  node compromise.
- `hostNetwork: true` / `hostPID: true` / `hostIPC: true` — share the node's
  network/process/IPC namespaces, so the container can see and interfere with
  the host and other Pods.
- `hostPath` volumes — mount a path from the *node's* filesystem into the Pod;
  mounting `/` or `/var/run/docker.sock` is a classic escape-to-node path.

These exist for legitimate infra Pods (CNI, monitoring — recall your module-00
surface inventory found them). The point of admission control is to ensure
*only* those blessed workloads get them, never a random app Deployment.

### Pod Security Admission (PSA) and the three Standards

Enforcing all of the above by hand on every Pod doesn't scale. **Pod Security
Admission** is a built-in Kubernetes admission controller (GA since 1.25) that
enforces the **Pod Security Standards** — three predefined profiles — at the
*namespace* level:

- **privileged** — no restrictions (for trusted infra workloads).
- **baseline** — blocks the most dangerous, obviously-bad settings
  (`privileged`, host namespaces, most `hostPath`) while staying broadly
  compatible with common apps.
- **restricted** — the hardened profile: requires `runAsNonRoot`,
  `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`, a seccomp
  profile, and more — essentially the full `securityContext` hardening above.

You opt a namespace into a Standard with labels, and PSA acts in one of three
**modes** per Standard:

- `enforce` — reject Pods that violate the Standard (hard block).
- `audit` — allow them but record a violation in the audit log.
- `warn` — allow them but return a `Warning` to the user who applied them.

You can set different Standards for different modes on the same namespace — a
common rollout pattern is `warn`/`audit` at `restricted` first (to see what
*would* break) while still `enforce`ing `baseline`, then tightening `enforce`
to `restricted` once you've fixed the violations. This graduated approach is
the same audit-then-enforce idea you'll see again in Gatekeeper (module 04)
and Azure Policy (module 05).

### PSA vs. the old PodSecurityPolicy, and where Gatekeeper fits

If you read older material: **PodSecurityPolicy (PSP)** was the previous
mechanism and is **removed** (gone in 1.25+). PSA replaced it. PSA is simple
and built-in but *rigid* — you get exactly the three Standards, no custom
rules. When you need a rule PSA doesn't express ("images must come from *our*
ACR", "every Pod must have a `team` label"), you reach for a general policy
engine — **OPA/Gatekeeper** (module 04) or Azure Policy's Gatekeeper-based AKS
add-on (module 05). PSA handles the common Pod-hardening baseline cheaply;
Gatekeeper handles everything custom. Use PSA for what it covers and Gatekeeper
for the rest — they layer.

## Command reference

| Command / field | What it does | Example |
|---|---|---|
| `kubectl label ns <ns> pod-security.kubernetes.io/enforce=<level>` | Sets the PSA *enforce* Standard on a namespace | `kubectl label ns prod pod-security.kubernetes.io/enforce=restricted` |
| `pod-security.kubernetes.io/warn=<level>` | Sets the *warn* Standard (returns warnings, doesn't block) | `kubectl label ns prod pod-security.kubernetes.io/warn=restricted` |
| `pod-security.kubernetes.io/audit=<level>` | Sets the *audit* Standard (records violations) | `kubectl label ns prod pod-security.kubernetes.io/audit=restricted` |
| `pod-security.kubernetes.io/enforce-version=<v>` | Pins which version of the Standard to enforce | `...enforce-version=v1.29` |
| `securityContext.runAsNonRoot: true` | Refuses to start a container that would run as root | see exercise 3 |
| `securityContext.allowPrivilegeEscalation: false` | Blocks privilege escalation within the container | see exercise 3 |
| `securityContext.readOnlyRootFilesystem: true` | Makes the container root FS read-only | see exercise 5 |
| `securityContext.capabilities.drop: ["ALL"]` | Drops all Linux capabilities | see exercise 3 |
| `securityContext.seccompProfile.type: RuntimeDefault` | Applies the runtime's default syscall filter | see exercise 3 |
| `kubectl label ns <ns> ... --dry-run=server` | Previews whether existing Pods would violate a Standard before enforcing | see exercise 7 |

Flag breakdown for `kubectl label ns prod pod-security.kubernetes.io/enforce=restricted pod-security.kubernetes.io/warn=restricted`:

- `label ns prod` — applies labels to the `prod` namespace (PSA is configured
  entirely through namespace labels).
- `pod-security.kubernetes.io/enforce=restricted` — any Pod created in `prod`
  that violates the `restricted` Standard is *rejected* at admission.
- `pod-security.kubernetes.io/warn=restricted` — additionally return a warning
  to whoever applies a violating Pod; harmless to set alongside `enforce` and
  useful because the warning explains *which* rule failed.

Flag breakdown for the hardened container `securityContext`:

- `runAsNonRoot: true` — kubelet refuses to start the container if its
  effective user is UID 0.
- `allowPrivilegeEscalation: false` — sets `no_new_privs`, so no child process
  can gain privileges beyond the container's (blocks setuid escalation).
- `capabilities: { drop: ["ALL"] }` — start from *zero* Linux capabilities;
  add back only specific ones the app proves it needs.
- `seccompProfile: { type: RuntimeDefault }` — enable syscall filtering using
  the runtime's default allowlist.
- `readOnlyRootFilesystem: true` — the container can't write to its own root
  FS; pair with an `emptyDir` mounted at any path the app must write to.

## Hands-on exercises

All run on your local kind cluster from track 03 — PSA is built in, no add-on
needed. No Azure cost here.

1. **(WSL2) Create test namespaces at two Standards.**
   ```bash
   kubectl create namespace psa-baseline
   kubectl create namespace psa-restricted
   kubectl label ns psa-baseline pod-security.kubernetes.io/enforce=baseline
   kubectl label ns psa-restricted pod-security.kubernetes.io/enforce=restricted pod-security.kubernetes.io/warn=restricted
   kubectl get ns --show-labels | grep psa-
   ```
   Expect both namespaces labeled with their enforce Standard.

2. **(WSL2) Watch `baseline` block a privileged Pod.**
   ```bash
   kubectl apply -n psa-baseline -f - <<'EOF'
   apiVersion: v1
   kind: Pod
   metadata: {name: bad-privileged}
   spec:
     containers:
       - name: c
         image: busybox:1.36
         command: ["sleep","3600"]
         securityContext: {privileged: true}
   EOF
   ```
   Expect the API server to *reject* it with a Pod Security violation naming
   `privileged`. The dangerous knob from Concepts is blocked at admission, not
   at runtime — it never gets scheduled.

3. **(WSL2) Watch `restricted` block an ordinary-looking Pod.** A plain Pod
   that's fine under `baseline` fails `restricted`:
   ```bash
   kubectl apply -n psa-restricted -f - <<'EOF'
   apiVersion: v1
   kind: Pod
   metadata: {name: plain-pod}
   spec:
     containers:
       - name: c
         image: busybox:1.36
         command: ["sleep","3600"]
   EOF
   ```
   Expect rejection listing multiple violations: missing `runAsNonRoot`,
   missing `allowPrivilegeEscalation: false`, capabilities not dropped, no
   seccomp profile. `restricted` demands the full hardening — a bare Pod
   doesn't qualify.

4. **(WSL2) Make it pass `restricted` with a proper `securityContext`.**
   ```bash
   kubectl apply -n psa-restricted -f - <<'EOF'
   apiVersion: v1
   kind: Pod
   metadata: {name: hardened-pod}
   spec:
     securityContext:
       runAsNonRoot: true
       runAsUser: 1000
       seccompProfile: {type: RuntimeDefault}
     containers:
       - name: c
         image: busybox:1.36
         command: ["sleep","3600"]
         securityContext:
           allowPrivilegeEscalation: false
           capabilities: {drop: ["ALL"]}
           readOnlyRootFilesystem: true
   EOF
   kubectl get pod hardened-pod -n psa-restricted
   ```
   Expect it to be admitted and reach `Running`. This is the exact
   `securityContext` shape the `restricted` Standard requires — memorize its
   shape; you'll write it constantly.

5. **Diagnose and fix: read-only root filesystem breaks a legitimate app.**
   Deploy an app that writes to disk under `readOnlyRootFilesystem: true`:
   ```bash
   kubectl apply -n psa-restricted -f - <<'EOF'
   apiVersion: v1
   kind: Pod
   metadata: {name: writer}
   spec:
     securityContext: {runAsNonRoot: true, runAsUser: 1000, seccompProfile: {type: RuntimeDefault}}
     containers:
       - name: c
         image: busybox:1.36
         command: ["sh","-c","echo data > /var/cache/out.txt && sleep 3600"]
         securityContext:
           allowPrivilegeEscalation: false
           capabilities: {drop: ["ALL"]}
           readOnlyRootFilesystem: true
   EOF
   kubectl logs writer -n psa-restricted
   ```
   Expect a `Read-only file system` error — the app legitimately needs to
   write, but the root FS is locked. Diagnose: the fix is *not* to remove the
   hardening but to give the app a writable volume where it needs one:
   ```bash
   kubectl delete pod writer -n psa-restricted
   kubectl apply -n psa-restricted -f - <<'EOF'
   apiVersion: v1
   kind: Pod
   metadata: {name: writer}
   spec:
     securityContext: {runAsNonRoot: true, runAsUser: 1000, seccompProfile: {type: RuntimeDefault}}
     containers:
       - name: c
         image: busybox:1.36
         command: ["sh","-c","echo data > /var/cache/out.txt && sleep 3600"]
         securityContext:
           allowPrivilegeEscalation: false
           capabilities: {drop: ["ALL"]}
           readOnlyRootFilesystem: true
         volumeMounts: [{name: cache, mountPath: /var/cache}]
     volumes: [{name: cache, emptyDir: {}}]
   EOF
   kubectl logs writer -n psa-restricted; kubectl get pod writer -n psa-restricted
   ```
   Expect no error and `Running`. The lesson: read-only root FS plus explicit
   writable mounts is the pattern — you keep the hardening *and* let the app
   write where it must.

6. **(WSL2) Prove capability dropping actually restricts the container.**
   Compare a default Pod against one with `NET_RAW` dropped by trying to ping
   (ping needs `CAP_NET_RAW`):
   ```bash
   kubectl run cap-test --image=busybox:1.36 --restart=Never -n psa-baseline -- sh -c "ping -c1 127.0.0.1; sleep 3600"
   kubectl logs cap-test -n psa-baseline
   ```
   Then a version with capabilities dropped:
   ```bash
   kubectl apply -n psa-baseline -f - <<'EOF'
   apiVersion: v1
   kind: Pod
   metadata: {name: cap-test-dropped}
   spec:
     containers:
       - name: c
         image: busybox:1.36
         command: ["sh","-c","ping -c1 127.0.0.1; sleep 3600"]
         securityContext: {capabilities: {drop: ["ALL"]}}
   EOF
   kubectl logs cap-test-dropped -n psa-baseline
   ```
   Expect the first to ping successfully and the second to fail with an
   operation-not-permitted error — visible proof that dropping capabilities
   removed a real kernel power.

7. **(WSL2) Preview impact before enforcing — the safe rollout.** Before
   flipping an existing namespace to `restricted`, see what would break using
   `warn`/`dry-run`:
   ```bash
   kubectl label --dry-run=server --overwrite ns psa-baseline pod-security.kubernetes.io/enforce=restricted
   ```
   Expect warnings listing existing Pods in `psa-baseline` that *would* be
   rejected under `restricted` — without actually enforcing it. This is the
   audit-then-enforce discipline: measure blast radius before you tighten.

8. **(WSL2) Clean up.**
   ```bash
   kubectl delete namespace psa-baseline psa-restricted
   ```

## Independent challenge

No YAML given — build it yourself using this module plus 02/09 (non-root
images) and module 00 (defense in depth). Take a small web app image and
deploy it into a namespace enforcing the `restricted` Pod Security Standard,
such that the Pod is *admitted and runs correctly* while satisfying every
`restricted` requirement — non-root, no privilege escalation, all capabilities
dropped (add back only what it genuinely needs, if anything), seccomp
`RuntimeDefault`, and a read-only root filesystem with writable volumes only
where the app actually writes. Then deliberately introduce a violation (e.g.
flip on `privileged` or remove `runAsNonRoot`), observe the exact admission
error, and explain which STRIDE category (module 00) that blocked setting
would have exposed. Finally, describe in two sentences why enforcing this at
the *namespace admission* layer is stronger than merely building a non-root
image — i.e., what admission control catches that image hardening alone cannot.

<details>
<summary>Stuck? One hint</summary>

Start from the passing `hardened-pod` spec in exercise 4, add your app image
and a `readOnlyRootFilesystem: true` plus an `emptyDir` for its writable path
(exercise 5's pattern). The reason admission beats image hardening: a non-root
*image* can still be deployed *as root* or *privileged* by someone overriding
the `securityContext` — namespace-level `enforce=restricted` refuses that Pod
regardless of what the image intended, so it catches misconfiguration at
deploy time, not just at build time.

</details>

## Common mistakes & troubleshooting

- **Assuming a non-root image can't be run privileged.** The image says how it
  *would* run by default; a Pod spec can still request `privileged: true`,
  root, or host namespaces. Only admission control (`securityContext` +
  PSA/enforce) actually prevents that at deploy time.
- **Flipping a live namespace straight to `enforce=restricted`.** You'll
  reject existing workloads that don't yet meet it, causing an outage. Use
  `warn`/`audit`/`--dry-run=server` first to measure the blast radius, fix the
  workloads, then enforce.
- **Removing hardening to fix a write error.** A `readOnlyRootFilesystem`
  failure means add a writable `emptyDir`/volume at the path the app needs —
  not turn the root FS writable again. Keep the control; carve out the
  exception narrowly.
- **`drop: ["ALL"]` then wondering why the app broke.** Some apps need one
  specific capability (e.g. `NET_BIND_SERVICE` for port 80). Drop all, then
  `add` back the *minimum* — don't restore the whole default set.
- **Forgetting seccomp is off by default.** `RuntimeDefault` is a large, near-
  free win, but you must set it explicitly; a Pod with no `seccompProfile`
  runs `Unconfined` and fails `restricted`.
- **Expecting PSA to enforce custom rules.** PSA only knows the three fixed
  Standards. "Images must come from our ACR" or "every Pod needs a `team`
  label" require Gatekeeper (module 04) or Azure Policy (module 05) — PSA
  can't express them.
- **Labeling the wrong namespace / typo in the label key.** PSA is silent if
  the label key is misspelled — `pod-security.kubernetes.io/enforce` must be
  exact, or the Standard simply isn't applied and nothing is blocked.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the difference between what a hardened *image* (02/09) protects and
   what a Pod `securityContext` protects?
2. What are the three Pod Security Standards, and what does each roughly allow
   or block?
3. What do PSA's three modes — `enforce`, `audit`, `warn` — each do, and why
   would you set more than one?
4. Why is `capabilities.drop: ["ALL"]` preferred over leaving the default
   capability set, and what do you do if the app needs one?
5. What does `seccompProfile.type: RuntimeDefault` do, and why does it matter
   that it's off by default?
6. An app fails with "read-only file system" under `restricted`. What's the
   correct fix, and what's the *wrong* fix?
7. When do you need Gatekeeper/Azure Policy instead of PSA?
8. Why is flipping a live namespace directly to `enforce=restricted` risky,
   and what's the safe rollout?

</details>

<details>
<summary>Show answers</summary>

1. A hardened image controls what's *inside* the container and how it would
   run by default (non-root user, minimal packages). A `securityContext`
   controls how the cluster actually *runs* that container as a Linux process
   (non-root enforced at runtime, capabilities, privilege escalation, seccomp,
   read-only FS) — and can be enforced even if the image or Pod author got it
   wrong. They're independent defense-in-depth layers.
2. `privileged` (no restrictions, for trusted infra); `baseline` (blocks the
   most dangerous settings like `privileged` and host namespaces while staying
   broadly compatible); `restricted` (the hardened profile requiring
   `runAsNonRoot`, no privilege escalation, all capabilities dropped, a seccomp
   profile, etc.).
3. `enforce` rejects violating Pods; `audit` allows them but records a
   violation in the audit log; `warn` allows them but returns a warning to the
   applier. You set more than one to roll out safely — e.g. `enforce=baseline`
   now while `warn`/`audit` at `restricted` to see what *would* break before
   tightening `enforce` to `restricted`.
4. The default capability set grants more root powers than most apps need,
   enlarging the elevation-of-privilege surface. Dropping all and adding back
   only the specific capability required (often none) is least privilege at the
   kernel level. If the app needs one (e.g. `NET_BIND_SERVICE` for port 80),
   `add` just that one back.
5. It applies the container runtime's default syscall allowlist, blocking
   exotic syscalls exploits rely on while allowing normal ones. It matters that
   it's off by default because a Pod with no `seccompProfile` runs
   `Unconfined` — you get this large, nearly-free hardening only if you set it
   explicitly (and `restricted` requires it).
6. Correct fix: add a writable volume (e.g. an `emptyDir`) mounted at the path
   the app writes to, keeping `readOnlyRootFilesystem: true`. Wrong fix:
   removing `readOnlyRootFilesystem` (or the hardening generally) to make the
   error go away — that discards a real control instead of carving a narrow
   exception.
7. When you need a rule PSA can't express — anything beyond the three fixed
   Standards, e.g. "images must come from our ACR", "every Pod must carry a
   `team` label", "no `latest` tags". Those custom rules need a general policy
   engine: OPA/Gatekeeper (module 04) or Azure Policy's AKS add-on (module 05).
8. Existing Pods that don't meet `restricted` are immediately rejected on any
   recreation/rollout, which can cause an outage. The safe rollout is to first
   apply `warn`/`audit=restricted` (or use `--dry-run=server`) to enumerate
   what would break, fix those workloads, then set `enforce=restricted`.

</details>

## Next

Continue to
[04-policy-as-code-opa-gatekeeper](../04-policy-as-code-opa-gatekeeper/README.md)
— PSA gave you three fixed profiles; now write your *own* admission rules to
block the misconfigurations PSA can't express.
