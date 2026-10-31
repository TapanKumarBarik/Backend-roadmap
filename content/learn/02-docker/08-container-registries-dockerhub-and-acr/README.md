# Container Registries: Docker Hub and ACR

## Why this matters

An image that only exists on your laptop can't be deployed anywhere else.
A **registry** is what lets you build once and run the same, exact image
on another machine, a teammate's laptop, or — starting in module 10 — in
Azure. Every deployment path in this track from here on depends on
getting an image into a registry first.

## Concepts

### A registry is a tagged, addressable store of images

A registry stores images under **repositories**, and each image inside a
repository is identified by a **tag** — think of the repository as a
named shelf and the tag as which specific version sits on it. A full
image reference looks like
`<registry-host>/<repository>:<tag>`, e.g.
`docker.io/library/python:3.12-slim` or
`myregistry.azurecr.io/webapp:v1`. When you `docker pull python:3.12-slim`
with no registry host, Docker assumes `docker.io` (Docker Hub) — Docker
Hub is the default, not the only option.

```
   local machine                    registry (Docker Hub / ACR)
  ┌───────────────┐   docker push   ┌──────────────────────────────┐
  │ webapp:v1     │ ───────────────►│ <repo>/webapp                │
  │ (image layers)│                 │   :v1  → manifest + layers   │
  └───────────────┘ ◄─────────────── │   :v2  → manifest + layers  │
        another         docker pull  └──────────────────────────────┘
        machine ◄────────────────────────────┘
   push/pull transfer only layers the other side is missing
```

### Tagging is a local, free operation

`docker tag <source> <target>` doesn't copy or rebuild anything — it adds
a second name pointing at the same image ID (same layers), exactly like a
hard link pointing at the same inode. This is how you take an image you
built with a plain local name (`webapp`) and give it the fully-qualified
name a specific registry expects before pushing.

```
  docker tag webapp myregistry.azurecr.io/webapp:v1

     webapp:latest ──────────┐
                             ├──► IMAGE ID sha256:abc…  (one set of layers)
     myregistry.azurecr.io/  │
       webapp:v1 ────────────┘
   two names, one image — no copy, no rebuild (like a hard link)
```

> In Docker Desktop: the **Images** tab shows every tag pointing at an
> image. Tag two names to the same build and you'll see both listed
> against one identical `IMAGE ID` — visual proof tagging doesn't
> duplicate data.

### Pushing and pulling require you to be logged in to that registry

`docker login <registry-host>` stores a credential for that specific
host. You can be logged into Docker Hub and Azure Container Registry
(ACR) at the same time — credentials are stored per-registry-host, not
globally. `docker push` uploads any layers the registry doesn't already
have (same layer-sharing logic as `docker pull`); `docker logout` clears
a stored credential.

> In Docker Desktop: the account icon in the top-right shows your signed-in
> Docker Hub identity, and **Settings → Resources → Proxies/Docker Engine**
> is unrelated to registry logins — Docker Hub sign-in in the GUI is
> separate from `docker login` for other registries like ACR, which you
> authenticate via the Azure CLI instead.

### Azure Container Registry (ACR) is a private, per-subscription registry

ACR is Azure's managed Docker registry — one instance you create per
project (or per environment), reachable at
`<your-registry-name>.azurecr.io`. Because it lives in your Azure
subscription, it's private by default and integrates directly with other
Azure services you'll use in modules 10 and 11 (ACI and App Service can
both be granted pull access to an ACR instance without you managing a
separate username/password by hand, via **managed identity** or the
`--admin-enabled` credential — covered concretely in those modules).

### `az acr build` builds in the cloud, skipping a local push entirely

`docker build` + `docker push` is one valid path: build locally, then
push. `az acr build` is a second path: it uploads your build context to
Azure, builds the image *inside* ACR's own build service, and stores the
result directly — no local Docker engine involvement at all beyond
having the `az` CLI. This is useful on a slow local machine, in CI, or
simply to avoid a separate push step.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `docker tag <source> <target>` | Adds a second name to an existing local image, no rebuild | `docker tag webapp myregistry.azurecr.io/webapp:v1` |
| `docker login [registry-host]` | Authenticates against a registry (Docker Hub if host omitted) | `docker login` |
| `docker login <acr-name>.azurecr.io` | Authenticates against a specific ACR instance | `docker login myregistry.azurecr.io` |
| `docker push <image>:<tag>` | Uploads an image's layers (and manifest) to a registry | `docker push myregistry.azurecr.io/webapp:v1` |
| `docker pull <image>:<tag>` | Downloads an image from a registry | `docker pull myregistry.azurecr.io/webapp:v1` |
| `docker logout [registry-host]` | Clears a stored credential | `docker logout myregistry.azurecr.io` |
| `az acr create` | Creates an Azure Container Registry instance | `az acr create --resource-group learn-docker-rg --name myuniqueacrname --sku Basic` |
| `az acr login --name <acr-name>` | Authenticates Docker to that ACR using your Azure CLI identity | `az acr login --name myuniqueacrname` |
| `az acr build` | Builds an image in the cloud using ACR's build service and pushes the result directly | `az acr build --registry myuniqueacrname --image webapp:v1 .` |
| `az acr repository list` | Lists repositories stored in an ACR instance | `az acr repository list --name myuniqueacrname --output table` |
| `az acr repository show-tags` | Lists tags for one repository in an ACR instance | `az acr repository show-tags --name myuniqueacrname --repository webapp --output table` |

Flag breakdown for `az acr create --resource-group learn-docker-rg --name myuniqueacrname --sku Basic`:

- `--resource-group learn-docker-rg` — the Azure resource group this ACR
  instance belongs to (a logical folder for related Azure resources; you
  create this once with `az group create` before module 10's exercises).
- `--name myuniqueacrname` — the registry's name; it must be **globally
  unique across all of Azure** (it becomes part of a public DNS name,
  `<name>.azurecr.io`), lowercase letters and numbers only.
- `--sku Basic` — the pricing/capability tier; `Basic` is the cheapest
  tier and is enough for this entire track.

Flag breakdown for `az acr build --registry myuniqueacrname --image webapp:v1 .`:

- `--registry myuniqueacrname` — which ACR instance performs the build
  and stores the result.
- `--image webapp:v1` — the repository name and tag to store the build
  under, equivalent to `docker build -t webapp:v1`.
- `.` — the build context, uploaded to ACR's build service, same meaning
  as the `.` in `docker build -t webapp:v1 .`.

## Hands-on exercises

Exercises 1-6 use Docker Hub and don't touch Azure; exercises 7-10
introduce ACR and use PowerShell for `az` commands, matching modules 10
and 11's convention.

1. **(WSL2 Ubuntu terminal)** Build the same tiny example app pattern used
   in earlier modules:
   ```bash
   mkdir -p ~/learn-docker/registry-lab && cd ~/learn-docker/registry-lab

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

   docker build -t webapp .
   ```
   Expect a successful build ending with `webapp:latest` tagged.

2. **(WSL2 Ubuntu terminal)** If you have (or create for free) a Docker
   Hub account, log in and tag the image for your namespace:
   ```bash
   docker login
   docker tag webapp docker.io/<your-dockerhub-username>/webapp:v1
   docker images | grep webapp
   ```
   Expect `docker images` to list **two** rows — `webapp:latest` and
   `<your-dockerhub-username>/webapp:v1` — with the **same** `IMAGE ID`,
   proving tagging didn't duplicate anything.

3. **(WSL2 Ubuntu terminal)** Push it:
   ```bash
   docker push docker.io/<your-dockerhub-username>/webapp:v1
   ```
   Expect a series of "Pushed" lines, one per layer, ending with a digest.
   If you don't want a public Docker Hub account, skip pushing here and
   read the expected output instead — the ACR exercises below don't
   depend on this step.

4. **(WSL2 Ubuntu terminal)** Confirm it's really remote by removing your
   local copy and pulling it back:
   ```bash
   docker rmi docker.io/<your-dockerhub-username>/webapp:v1
   docker pull docker.io/<your-dockerhub-username>/webapp:v1
   ```
   Expect the `rmi` to succeed (this only removes the tag/reference you
   pushed, `webapp:latest` still exists locally) and the `pull` to
   re-download it fresh from Docker Hub.

5. **(Docker Desktop GUI)** Open the **Images** tab and find `webapp`.
   Click it, and note the **Push to Hub** option available from an
   image's context menu (three-dot menu) if you're signed into Docker
   Hub via the account icon — this is the GUI equivalent of
   `docker push`, useful for a one-off push without touching the
   terminal.

6. **(WSL2 Ubuntu terminal)** Clean up the Docker Hub tag locally (the
   image stays in your Docker Hub account until you delete it there):
   ```bash
   docker rmi docker.io/<your-dockerhub-username>/webapp:v1
   docker logout
   ```

7. **(PowerShell)** Log in to Azure and create a resource group and an
   ACR instance (reuse the resource group in later modules, so pick a
   name you'll recognize):
   ```powershell
   az login
   az group create --name learn-docker-rg --location eastus
   az acr create --resource-group learn-docker-rg --name <yourinitialsacr2026> --sku Basic
   ```
   `--name` must be globally unique — if it errors with "already in
   use," append digits until it isn't. Expect the final command to
   print a JSON block with `"provisioningState": "Succeeded"`.

8. **(PowerShell)** Authenticate Docker to your new ACR instance and push
   the image you built in exercise 1 (rebuild it here if you're
   continuing in a new shell):
   ```powershell
   az acr login --name <yourinitialsacr2026>
   docker tag webapp "<yourinitialsacr2026>.azurecr.io/webapp:v1"
   docker push "<yourinitialsacr2026>.azurecr.io/webapp:v1"
   ```
   Expect `az acr login` to print `Login Succeeded`, and the push to
   complete the same way a Docker Hub push did in exercise 3.

9. **(PowerShell)** Build directly in the cloud with `az acr build`,
   skipping the local push, then confirm what's stored:
   ```powershell
   cd ~/learn-docker/registry-lab   # or wherever you built the app in exercise 1
   az acr build --registry <yourinitialsacr2026> --image webapp:v2 .
   az acr repository list --name <yourinitialsacr2026> --output table
   az acr repository show-tags --name <yourinitialsacr2026> --repository webapp --output table
   ```
   Expect the build log to stream from Azure's build service (not your
   machine), and `show-tags` to list both `v1` (pushed from your machine)
   and `v2` (built by ACR itself).

10. **Diagnose and fix: push rejected with "requested access to the
    resource is denied."** Deliberately push without authenticating
    first:
    ```powershell
    docker logout "<yourinitialsacr2026>.azurecr.io"
    docker push "<yourinitialsacr2026>.azurecr.io/webapp:v1"
    ```
    Expect exactly that denied-access error — Docker has no stored
    credential for this registry host anymore. Fix it by logging back
    in and retrying:
    ```powershell
    az acr login --name <yourinitialsacr2026>
    docker push "<yourinitialsacr2026>.azurecr.io/webapp:v1"
    ```
    Expect the push to succeed this time — same image, same tag, the
    only difference is a valid credential.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Prove to yourself that a registry actually decouples "where an image was built" from "where it can run," and that tagging is a pointer, not a copy. Build a small image locally, give it a second, fully-qualified name for a registry namespace *without* rebuilding, and confirm both names point at the same underlying image ID. Push it, then delete your *local* copy entirely and pull it back fresh from the registry to prove it truly lived remotely. Use whichever registry you have easiest: a free Docker Hub account needs no cleanup; if you instead use an ACR instance, remember it lives in your Azure subscription and bills while it exists, so delete the registry (or its resource group) afterward. Reuse module 07's discipline and push a lean image, not a bloated one.

<details>
<summary>Stuck? One hint</summary>

The second name is created with `docker tag <local-name> <host>/<repo>:<tag>` (no rebuild); after logging in and pushing, remove the local tag with `docker rmi` and then `docker pull` the same reference back.

</details>

## Common mistakes & troubleshooting

- **Forgetting `docker tag` before pushing.** `docker push webapp` alone
  tries to push to `docker.io/library/webapp`, which you almost
  certainly don't have permission to write to — always tag with the full
  target registry/repository/tag first.
- **Confusing `docker login` (Docker Hub or a manually specified
  registry) with `az acr login` (ACR specifically).** `az acr login`
  is a convenience wrapper that fetches a short-lived token using your
  already-authenticated `az` CLI session and feeds it to `docker login`
  for you — it only works for ACR, not Docker Hub.
- **Picking an ACR `--name` that collides with someone else's.** ACR
  names share a single global DNS namespace (`*.azurecr.io`) across all
  Azure customers — a generic name like `test` or `myregistry` is almost
  certainly taken; include something unique like initials and a date.
- **Assuming a credential lasts forever.** `az acr login` tokens expire
  after a few hours; if a push suddenly fails with an access error after
  it worked earlier in the day, re-run `az acr login` before assuming
  anything else is wrong.
- **Not realizing `az acr build` still needs the Dockerfile and full
  build context uploaded**, just like a local build — a huge, un-ignored
  build context (module 03's `.dockerignore`) makes cloud builds slow to
  upload too, not just local ones.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What does `docker tag` actually do to the underlying image data —
   does it copy anything?
2. What's the difference between `docker login` and `az acr login`?
3. Why must an ACR instance's `--name` be globally unique across all of
   Azure, not just within your subscription?
4. What's the difference between the "build locally, then push" workflow
   and `az acr build`?
5. If `docker push` fails with an access-denied error after having
   worked earlier the same day, what's the most likely cause and the
   fix?
6. Why can you be logged into both Docker Hub and an ACR instance at the
   same time without conflict?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Nothing is copied — `docker tag` adds a second name pointing at the
   same underlying image ID and layers, the same way a hard link adds a
   second name for the same inode.
2. `docker login` authenticates against any registry host you specify
   (Docker Hub by default); `az acr login` is ACR-specific — it uses your
   existing Azure CLI session to fetch a token and configures Docker's
   credential for that one ACR instance automatically.
3. Every ACR instance's hostname is `<name>.azurecr.io`, a public DNS
   name shared across all Azure customers — two different subscriptions
   cannot both claim the same name, since DNS names must be unique
   globally.
4. Building locally uses your machine's Docker engine, then a separate
   `docker push` uploads the result; `az acr build` uploads the build
   context to Azure and performs the build inside ACR's own build
   service, storing the result directly with no local push step at all.
5. `az acr login` tokens are short-lived (a few hours) and expire; the
   fix is simply to re-run `az acr login --name <registry>` to refresh
   the credential before retrying the push.
6. Docker stores credentials per registry host, not globally — a
   credential for `docker.io` and a separate one for
   `<name>.azurecr.io` coexist independently.

</details>

## Further reading & sources

- [Docker: docker push / docker pull reference](https://docs.docker.com/reference/cli/docker/image/push/) - the CLI reference for uploading and downloading images, including tag semantics.
- [Docker Hub quickstart](https://docs.docker.com/docker-hub/quickstart/) - how repositories, tags, and namespaces work on the default registry.
- [Azure: Introduction to Azure Container Registry](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-intro) - overview of ACR, SKUs, and how it fits into Azure.
- [Azure: Build images with az acr build (ACR Tasks)](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-quickstart-task-cli) - the cloud-build workflow used in this module's exercises.
- [Azure: Authenticate with an Azure container registry](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-authentication) - explains `az acr login`, tokens, admin credentials, and managed identity.

## Next

Continue to
[09-security-best-practices](../09-security-best-practices/README.md) to
harden the images you're now able to share.
