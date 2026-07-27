# Security Best Practices

## Why this matters

Module 01 established that containers share the host kernel and give
shallower isolation than a VM. That means the practices in this module
aren't optional polish — a container running as root, built from a bloated
base image, with a secret baked into a layer, is a meaningfully bigger
risk than the same app running non-root from a minimal image with secrets
injected at runtime. This is the module that turns "it runs" into "it's
safe to run."

## Concepts

### Root inside a container is still root

By default, a container process runs as **root (UID 0)** unless the
Dockerfile or `docker run` says otherwise — the same root that owns
`/etc/passwd` and can install packages. Namespaces (module 01) restrict
what that root can *see*, not fundamentally what it *is*: certain kernel
vulnerabilities and container escapes are far more dangerous if the
escaping process was root than if it was an unprivileged UID. Running as
a non-root user is the single highest-leverage change you can make to a
Dockerfile.

### `USER` switches who runs the process

Adding a non-root user and switching to it with `USER` (module 03) is
straightforward for most Debian/Ubuntu-based images:

```dockerfile
RUN useradd --create-home --uid 1000 appuser
USER appuser
```

Everything from that `USER` line onward — remaining `RUN` steps and the
final container process — runs as `appuser`, not root. Combine this with
what you learned in module 04: a non-root process needs matching file
ownership/permissions on anything it reads or writes, including bind
mounts and volumes.

> In Docker Desktop: a running container's **Inspect** sub-tab shows its
> effective user under the config section — a quick way to confirm a
> container isn't accidentally running as root without shelling in.

### Minimal base images shrink the attack surface

A full `python:3.12` image ships a shell, a package manager, and dozens
of utilities an attacker who gains code execution could use. A
`python:3.12-slim` image ships far less; `-alpine` less still; a
`distroless` image (module 07) ships no shell and no package manager at
all — if an attacker can't get a shell, many post-exploitation techniques
simply don't work. This is the same "smaller surface, fewer things that
can go wrong" logic as disabling unused services on a bare Linux server.

```
  attack surface, largest → smallest
  python:3.12       [ shell + apt + many utils + app ]  ██████████
  python:3.12-slim  [ shell + minimal utils + app    ]  █████
  python:3.12-alpine[ busybox shell + app            ]  ███
  distroless        [ app + runtime only, NO shell   ]  █
                    fewer tools = fewer post-exploit options
```

### Secrets don't belong in layers

Anything written into an image layer (an `ENV` with a password, a `COPY`
of a credentials file, a secret passed as a plain `ARG`) is permanently
part of that image — visible to `docker history`, extractable by anyone
who can pull or inspect the image, even if a *later* layer deletes it
(module 07's "layers are additive" lesson applies directly here: deleting
a secret in a later `RUN` does not remove it from the earlier layer that
already shipped it). The fix is to never let secrets touch a layer at
all: inject them at **runtime** via environment variables
(`docker run -e`, or Compose's `environment:`/`env_file:`) or mounted
files, so they exist only in the running container's memory/writable
layer, never baked into the shareable image.

```
  BAKED IN (leaks)                     INJECTED AT RUNTIME (safe)
  Dockerfile                           Dockerfile ships no secret
  ┌──────────────────────────┐         ┌──────────────────────────┐
  │ RUN echo KEY > creds  ← still in    │ CMD uses $API_KEY        │
  │ RUN rm creds          │ history!    └──────────────────────────┘
  └──────────────────────────┘                    │
      layer 1: creds  ✗ shipped                    │ docker run -e API_KEY=…
      layer 2: (rm)   removes view only            ▼
   docker history --no-trunc → SECRET       secret lives only in the
                                            running container's memory
```

### BuildKit secret mounts keep build-time secrets out of layers too

Sometimes a secret is needed *during* the build itself (e.g. a private
package registry token for `pip install`). BuildKit's
`--mount=type=secret` makes a secret available to one `RUN` instruction
without ever writing it into a layer — conceptually the same "exists only
for this instruction, never committed" trick as the cache mounts from
module 07.

### Image scanning finds known vulnerabilities in your dependencies

An image is a snapshot of an OS and a set of packages, each with its own
history of published CVEs (Common Vulnerabilities and Exposures).
Scanning tools compare what's actually installed in your image against
databases of known vulnerabilities and report matches by severity —
similar in spirit to running a package-manager security audit
(`apt list --upgradable` cross-referenced against advisories) but applied
to the whole image, including transitive OS packages you didn't
explicitly install. Docker Desktop ships `docker scout` for this
out of the box.

> In Docker Desktop: the **Images** tab shows a vulnerability summary
> badge (e.g. a count of high/critical findings) per image once Docker
> Scout has analyzed it — the GUI surface for what `docker scout cves`
> reports on the command line.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `USER <user>` (Dockerfile) | Switches the user for later `RUN` steps and the runtime process | `USER appuser` |
| `docker run -u <uid>[:<gid>]` | Overrides the user a container runs as, without editing the Dockerfile | `docker run -u 1000:1000 webapp` |
| `docker run -e <KEY>=<value>` | Injects an environment variable at runtime, not baked into a layer | `docker run -e API_KEY=secret webapp` |
| `docker run --env-file <file>` | Injects many environment variables at once from a file | `docker run --env-file .env webapp` |
| `RUN --mount=type=secret,id=<id>` | (BuildKit) Makes a secret available to one `RUN` step without writing it to a layer | `RUN --mount=type=secret,id=pip_token pip install --index-url https://...` |
| `docker build --secret id=<id>,src=<file>` | Supplies the value for a `--mount=type=secret` at build time | `docker build --secret id=pip_token,src=./token.txt -t app .` |
| `docker scout cves <image>` | Scans an image for known vulnerabilities (CVEs) | `docker scout cves webapp:latest` |
| `docker scout quickview <image>` | Prints a short vulnerability summary for an image | `docker scout quickview webapp:latest` |
| `docker inspect --format '{{.Config.User}}' <image>` | Shows which user an image's process runs as by default | `docker inspect --format '{{.Config.User}}' webapp` |

Flag breakdown for `docker run -u 1000:1000 webapp`:

- `-u 1000:1000` — sets the container's runtime UID and GID to `1000`
  and `1000`, overriding whatever `USER` the Dockerfile declares (or
  overriding the root default if none was declared) — useful for testing
  non-root behavior without rebuilding the image.

Flag breakdown for `docker build --secret id=pip_token,src=./token.txt -t app .`:

- `--secret id=pip_token,src=./token.txt` — makes the contents of
  `./token.txt` available *only* to `RUN` instructions that explicitly
  request it with `--mount=type=secret,id=pip_token`; it is never written
  to any layer or visible in `docker history`.

## Hands-on exercises

1. **(WSL2 Ubuntu terminal)** Build a deliberately root-running example
   app and confirm it:
   ```bash
   mkdir -p ~/learn-docker/security-lab && cd ~/learn-docker/security-lab

   cat > app.py <<'EOF'
   from flask import Flask

   app = Flask(__name__)

   @app.get("/health")
   def health():
       return {"status": "ok"}

   if __name__ == "__main__":
       app.run(host="0.0.0.0", port=8000)
   EOF

   cat > requirements.txt <<'EOF'
   flask==3.0.3
   EOF

   cat > Dockerfile <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   docker build -t secapp:root .
   docker run --rm secapp:root whoami
   ```
   Expect `root` — this image runs as root by default, like most images
   that don't explicitly set `USER`.

2. **(WSL2 Ubuntu terminal)** Add a non-root user and rebuild:
   ```bash
   cat > Dockerfile <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   RUN useradd --create-home --uid 1000 appuser
   USER appuser
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   docker build -t secapp:nonroot .
   docker run --rm secapp:nonroot whoami
   docker run --rm secapp:nonroot id
   ```
   Expect `appuser` from `whoami`, and `id` to show `uid=1000(appuser)
   gid=1000(appuser)` — confirming the process no longer runs as root.

3. **(Docker Desktop GUI)** Run both images detached (different ports)
   and compare their **Inspect** sub-tab. In the **Containers** tab,
   click each running container, open **Inspect**, and find the `User`
   field in the config section:
   ```bash
   docker run -d --name rootcheck -p 8030:8000 secapp:root
   docker run -d --name nonrootcheck -p 8031:8000 secapp:nonroot
   ```
   Expect `rootcheck`'s Inspect view to show an empty `User` field
   (meaning root, the default) and `nonrootcheck`'s to show `appuser`.
   Clean up: `docker rm -f rootcheck nonrootcheck`.

4. **(WSL2 Ubuntu terminal)** Confirm a non-root user can still be
   blocked by ownership, tying back to module 04. Try to have the
   non-root container write to a root-owned bind-mounted directory:
   ```bash
   mkdir -p /tmp/rootowned
   sudo chown root:root /tmp/rootowned
   docker run --rm -v /tmp/rootowned:/data secapp:nonroot sh -c "touch /data/test.txt"
   ```
   Expect `Permission denied` — `appuser` (UID 1000) can't write into a
   directory owned by root with no write access for others, the exact
   same permission model as any Linux process.

5. **(WSL2 Ubuntu terminal)** Prove a baked-in secret is visible in image
   history even if you try to remove it in a later layer. Build this
   deliberately insecure Dockerfile:
   ```bash
   cat > Dockerfile.leaky <<'EOF'
   FROM python:3.12-slim
   RUN echo "super-secret-api-key=abc123" > /tmp/creds.txt
   RUN rm /tmp/creds.txt
   EOF

   docker build -f Dockerfile.leaky -t leaky .
   docker history --no-trunc leaky | grep -i creds
   docker run --rm leaky sh -c "docker --version 2>/dev/null; cat /tmp/creds.txt 2>/dev/null || echo 'not in final filesystem, but check history above'"
   ```
   Expect `docker history --no-trunc` to still show the `echo` command
   containing the secret text in an earlier layer, even though the file
   itself is gone from the final filesystem — the secret leaked into the
   image's permanent history regardless of the later `rm`.

6. **(WSL2 Ubuntu terminal)** Fix it the right way — inject at runtime
   instead of baking in:
   ```bash
   cat > Dockerfile.clean <<'EOF'
   FROM python:3.12-slim
   CMD ["sh", "-c", "echo \"using key: $API_KEY\""]
   EOF

   docker build -f Dockerfile.clean -t notleaky .
   docker run --rm -e API_KEY=abc123 notleaky
   docker history --no-trunc notleaky | grep -i abc123
   ```
   Expect the `run` command to print `using key: abc123`, but the
   `docker history` grep to find **nothing** — the secret only ever
   existed in the running container's environment, never in a layer.

7. **(WSL2 Ubuntu terminal)** Scan an image for known vulnerabilities:
   ```bash
   docker scout quickview secapp:nonroot
   ```
   Expect a short summary table with counts of vulnerabilities by
   severity (critical/high/medium/low) for the base image and any
   installed packages. If you want detail on a specific finding:
   ```bash
   docker scout cves secapp:nonroot
   ```
   Expect a longer, per-CVE breakdown. (Exact counts vary over time as
   new CVEs are published — the point of this exercise is running the
   scan and reading the report shape, not a specific number.)

8. **(WSL2 Ubuntu terminal)** Compare scan results across base image
   choices, connecting back to module 07's size discussion:
   ```bash
   docker pull python:3.12
   docker scout quickview python:3.12
   docker scout quickview python:3.12-slim
   ```
   Expect `python:3.12` (the full image, more installed packages) to
   generally report more findings than `python:3.12-slim` — smaller
   images tend to have a smaller vulnerability surface simply by
   shipping fewer packages.

9. **Diagnose and fix: a container that can't write anywhere it needs
   to, after switching to non-root.** Simulate a real regression:
   ```bash
   cat > Dockerfile.regress <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   RUN useradd --create-home --uid 1000 appuser
   RUN mkdir /code/logs
   USER appuser
   CMD ["python", "app.py"]
   EOF

   docker build -f Dockerfile.regress -t regress .
   docker run --rm regress sh -c "touch /code/logs/out.log && echo wrote-ok"
   ```
   Expect a `Permission denied` failure — `/code/logs` was created while
   still root (before `USER appuser`), so it's owned by root, and
   `appuser` can't write into it. Diagnose with:
   ```bash
   docker run --rm --user root regress ls -la /code
   ```
   Fix it by fixing ownership before switching users:
   ```bash
   cat > Dockerfile.fixed <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   RUN useradd --create-home --uid 1000 appuser \
       && mkdir /code/logs \
       && chown -R appuser:appuser /code/logs
   USER appuser
   CMD ["python", "app.py"]
   EOF

   docker build -f Dockerfile.fixed -t fixed .
   docker run --rm fixed sh -c "touch /code/logs/out.log && echo wrote-ok"
   ```
   Expect `wrote-ok` this time.

10. **(WSL2 Ubuntu terminal)** Clean up:
    ```bash
    docker rmi secapp:root secapp:nonroot leaky notleaky regress fixed 2>/dev/null
    docker images | grep -E "secapp|leaky|notleaky|regress|fixed"
    ```
    Expect no matching images left.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Start from a deliberately careless Dockerfile for a small app — one that runs as root, bakes a fake secret into a layer, and uses a fuller-than-necessary base image — and harden it into a version that fixes all three problems, proving each fix rather than asserting it. Show that the runtime process is no longer root; show that your secret no longer appears anywhere in the image's build history yet is still available to the running container; and show a smaller vulnerability/attack surface than the careless version. Bring in module 04's ownership reasoning: create a directory the non-root user must write to, and make sure the switch to that user doesn't leave it unwritable. Then scan both versions and compare.

<details>
<summary>Stuck? One hint</summary>

Add a non-root user with `useradd` and `USER`, `chown` any writable directories *before* switching users, inject the secret at run time with `-e` instead of writing it into a layer, pick a slimmer base image, and compare the two images with `docker scout quickview` and `docker history`.

</details>

## Common mistakes & troubleshooting

- **Forgetting a Dockerfile defaults to root if `USER` is never set.**
  Always add a non-root user for anything beyond a throwaway experiment
  — it costs two extra Dockerfile lines and meaningfully reduces risk.
- **Deleting a secret in a later `RUN` and assuming it's gone.** As
  exercise 5 showed, it's still visible in `docker history` on the
  layer that created it — the only fix is to never write the secret into
  a layer in the first place.
- **Passing a secret as a plain `ARG` or `--build-arg`.** Build args are
  visible in `docker history` too (and in image metadata) unless you
  specifically use BuildKit's `--mount=type=secret`, which was designed
  exactly to avoid this.
- **Switching to `USER` too early, before file ownership is set up.**
  As exercise 9 showed, directories created by earlier `RUN` steps (as
  root) stay root-owned; either create them after `USER`, or `chown`
  them before switching.
- **Treating a clean `docker scout` report as "definitely safe."**
  Scanning only catches *known, published* CVEs in installed packages —
  it says nothing about vulnerabilities in your own application code, or
  unpublished/zero-day issues.
- **Assuming a non-root container is equivalent to a VM's isolation.**
  It reduces risk meaningfully but doesn't change the fact that all
  containers on a host still share one kernel (module 01) — non-root is
  defense in depth, not a substitute for kernel-level isolation.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Why is running a container as a non-root user considered one of the
   highest-leverage security improvements you can make?
2. If a Dockerfile writes a secret in one `RUN` step and deletes it in a
   later `RUN` step, is the secret actually gone from the final image?
   Why or why not?
3. What's the correct way to supply a secret to a running container
   without ever baking it into an image layer?
4. What does BuildKit's `--mount=type=secret` provide that a plain
   `ARG` does not?
5. Why does switching `USER` before creating directories a non-root user
   needs to write to cause a permission error, and how do you fix it?
6. What does an image vulnerability scan (like `docker scout`) actually
   check, and what does a clean report *not* guarantee?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Containers share the host kernel with no separate guest OS boundary
   (module 01); if an attacker achieves code execution or a container
   escape, doing so as root inside the container carries far greater
   risk than doing so as an unprivileged UID, since root has far more
   avenues to escalate or damage the shared system.
2. No — layers are additive and immutable once created; the earlier
   `RUN` layer that wrote the secret still contains it and still ships
   with the image, visible via `docker history`, even though a later
   layer's deletion makes it invisible in the final filesystem.
3. Inject it at runtime — via `docker run -e KEY=value`, `--env-file`,
   or a mounted secret file — so it only ever exists in the running
   container's memory/writable layer, never committed to a shareable
   image layer.
4. `--mount=type=secret` makes the secret's value available only to the
   specific `RUN` instruction that requests it, and never writes it into
   any layer or `docker history` entry; a plain `ARG` (or `--build-arg`)
   is recorded in the image's build history and metadata, so it can leak
   even without you writing it to a file.
5. Directories or files created by earlier `RUN` steps are owned by
   whatever user was active at the time (root, by default, before
   `USER` is set) — switching to a non-root `USER` afterward doesn't
   retroactively change that ownership, so the non-root user gets
   "permission denied" on those paths. Fix it by creating the paths
   after switching `USER`, or explicitly `chown`-ing them to the
   non-root user before the `USER` instruction.
6. It checks installed OS and language packages against databases of
   known, published CVEs. A clean report does not guarantee safety
   against vulnerabilities in your own application code or against
   unpublished/zero-day issues — it only covers what's already known
   about the packages you've installed.

</details>

## Further reading & sources

- [OWASP: Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) - a concise, authoritative checklist covering non-root users, minimal images, and secrets.
- [Docker: Build secrets (RUN --mount=type=secret)](https://docs.docker.com/build/building/secrets/) - how to supply build-time secrets without baking them into layers.
- [Docker Scout overview](https://docs.docker.com/scout/) - the built-in image vulnerability scanner used in this module's exercises.
- [Docker: Engine security](https://docs.docker.com/engine/security/) - official background on the container threat model and the shared-kernel caveat.
- [Trivy: open-source image scanner](https://trivy.dev/latest/docs/target/container_image/) - a popular alternative CVE scanner to cross-check Docker Scout findings.

## Next

Continue to
[10-deploy-to-azure-container-instances](../10-deploy-to-azure-container-instances/README.md)
to take a hardened, registry-hosted image and run it on real Azure
infrastructure for the first time.
