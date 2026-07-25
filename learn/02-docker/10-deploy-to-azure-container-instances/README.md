# Deploy to Azure Container Instances

## Why this matters

Everything so far has run on your own machine. **Azure Container
Instances (ACI)** is the fastest path from "I have an image in a
registry" to "it's running on the public internet" — no cluster to
provision, no VM to manage, just a single command that starts a
container and gives it a public address. It's the right tool for a quick
deployment, a demo, or a batch job; it's also the simplest way to prove
your ACR setup from module 08 actually works end to end before tackling
App Service (module 11) or Kubernetes (the next track).

This module uses your real Azure subscription. Follow the cleanup
subsection at the end — ACI bills while the container group exists.

## Concepts

### A container group is ACI's unit of deployment

ACI's core object is a **container group** — one or more containers that
are always scheduled together on the same host, sharing a network
namespace and, optionally, volumes. For a single-container deployment
(everything in this module), a container group behaves like one
`docker run`, but hosted on Azure-managed infrastructure with a public IP
instead of your machine's.

### ACI needs to authenticate to your registry to pull the image

Since your image lives in a private ACR instance (module 08), ACI needs
credentials to pull it — the same problem `docker login` solves locally,
solved here with registry credentials passed to `az container create`.
The simplest approach for learning purposes is ACR's **admin account**: a
single built-in username/password pair for the whole registry, which you
enable once and pass to ACI at container-creation time. (Production
setups typically use a managed identity instead, avoiding a shared
password entirely — worth knowing exists, not required for this
exercise.)

### DNS name label gives you a stable public hostname

A container group can be assigned a `--dns-name-label`, producing a
fully-qualified domain name of the form
`<label>.<region>.azurecontainer.io`. This label must be unique within
that Azure region (similar in spirit to ACR's globally-unique name
requirement from module 08, but scoped to the region rather than all of
Azure) — if it's taken, `az container create` fails with a clear error
telling you so.

### Logs work the same way conceptually as `docker logs`

`az container logs` reads the same stdout/stderr stream `docker logs`
reads locally — the daemon-buffers-output convention from module 02
holds here too, just surfaced through Azure's API instead of the local
Docker engine.

> In Docker Desktop: none of ACI's resources show up in Docker Desktop —
> ACI containers run entirely on Azure's infrastructure, not your local
> Docker engine. Docker Desktop's GUI is local-engine-only; from here on,
> the Azure Portal (portal.azure.com) is the GUI equivalent for anything
> you deploy to Azure. Worth opening the Portal alongside PowerShell in
> this module's exercises to see the resource group, registry, and
> container group appear as you create them.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az login` | Authenticates the Azure CLI to your account | `az login` |
| `az group create` | Creates a resource group (a logical container for related Azure resources) | `az group create --name learn-docker-rg --location eastus` |
| `az acr update --admin-enabled true` | Enables the built-in admin username/password for an ACR instance | `az acr update --name myacr --admin-enabled true` |
| `az acr credential show` | Retrieves the admin username/password for an ACR instance | `az acr credential show --name myacr` |
| `az container create` | Creates and starts a container group in ACI | see below |
| `az container show` | Shows a container group's status, including its public FQDN | `az container show --resource-group learn-docker-rg --name webapp-aci --query "{fqdn:ipAddress.fqdn,state:instanceView.state}" --output table` |
| `az container logs` | Prints a container group's stdout/stderr | `az container logs --resource-group learn-docker-rg --name webapp-aci` |
| `az container attach` | Streams live logs and events (similar to `docker logs -f`) | `az container attach --resource-group learn-docker-rg --name webapp-aci` |
| `az container exec` | Runs a command inside a running container in the group | `az container exec --resource-group learn-docker-rg --name webapp-aci --exec-command "/bin/sh"` |
| `az container restart` | Restarts a container group | `az container restart --resource-group learn-docker-rg --name webapp-aci` |
| `az container delete` | Deletes a single container group | `az container delete --resource-group learn-docker-rg --name webapp-aci --yes` |
| `az group delete` | Deletes a resource group and everything in it | `az group delete --name learn-docker-rg --yes --no-wait` |

Flag breakdown for the full `az container create` command:

```powershell
az container create `
  --resource-group learn-docker-rg `
  --name webapp-aci `
  --image myacr.azurecr.io/webapp:v1 `
  --registry-login-server myacr.azurecr.io `
  --registry-username <acr-admin-username> `
  --registry-password <acr-admin-password> `
  --dns-name-label webapp-aci-<yourinitials>2026 `
  --ports 8000 `
  --cpu 1 `
  --memory 1.5
```

- `--resource-group learn-docker-rg` — which resource group this
  container group belongs to.
- `--name webapp-aci` — the container group's name (used in later
  `az container ...` commands to refer to it).
- `--image myacr.azurecr.io/webapp:v1` — the fully-qualified image
  reference to pull, exactly like the tag you pushed in module 08.
- `--registry-login-server`, `--registry-username`,
  `--registry-password` — how ACI authenticates to pull a private image
  from ACR, equivalent to what `docker login` does locally.
- `--dns-name-label webapp-aci-<yourinitials>2026` — the subdomain
  portion of the public FQDN; must be unique within the chosen region.
- `--ports 8000` — which container port(s) to expose publicly (the
  container-side port, matching what your app actually listens on —
  same concept as the container-side number in `docker run -p`).
- `--cpu 1 --memory 1.5` — resource allocation in vCPUs and GiB of
  memory; billing scales with these values, so keep them modest for a
  learning exercise.

## Hands-on exercises

1. **(PowerShell)** Log in and confirm your subscription:
   ```powershell
   az login
   az account show --output table
   ```
   Expect a browser window to open for sign-in, then a table showing
   your subscription name and ID.

2. **(PowerShell)** Reuse or create the resource group and ACR instance
   from module 08 (skip the `az group create`/`az acr create` lines if
   you already have them from that module):
   ```powershell
   az group create --name learn-docker-rg --location eastus
   az acr create --resource-group learn-docker-rg --name <yourinitialsacr2026> --sku Basic
   ```

3. **(PowerShell)** Build and push a small example image directly with
   `az acr build` (no local Docker build needed — see module 08 if you
   want the local-build alternative):
   ```powershell
   mkdir ~/learn-docker/aci-lab
   cd ~/learn-docker/aci-lab
   ```
   Then create the same three files from earlier modules (`app.py`,
   `requirements.txt`, `Dockerfile` with a Flask app exposing `/health`
   on port 8000 — copy the pattern from module 08, exercise 1), and run:
   ```powershell
   az acr build --registry <yourinitialsacr2026> --image webapp:v1 .
   ```
   Expect a build log streamed from Azure, ending in a successful push.

4. **(PowerShell)** Enable the ACR admin account and fetch its
   credentials:
   ```powershell
   az acr update --name <yourinitialsacr2026> --admin-enabled true
   az acr credential show --name <yourinitialsacr2026>
   ```
   Expect JSON containing a `username` and two `passwords` — note the
   username and the first password value for the next step.

5. **(PowerShell)** Create the container group:
   ```powershell
   az container create `
     --resource-group learn-docker-rg `
     --name webapp-aci `
     --image "<yourinitialsacr2026>.azurecr.io/webapp:v1" `
     --registry-login-server "<yourinitialsacr2026>.azurecr.io" `
     --registry-username "<acr-admin-username>" `
     --registry-password "<acr-admin-password>" `
     --dns-name-label "webapp-aci-<yourinitials>2026" `
     --ports 8000 `
     --cpu 1 `
     --memory 1.5
   ```
   Expect a JSON response with `"provisioningState": "Succeeded"` after
   a short wait (ACI provisioning typically takes under a minute).

6. **(PowerShell)** Get the public FQDN and confirm the app is reachable:
   ```powershell
   az container show --resource-group learn-docker-rg --name webapp-aci --query "{fqdn:ipAddress.fqdn,state:instanceView.state}" --output table
   ```
   Take the `fqdn` value and open, in a browser or with `curl`:
   ```powershell
   curl "http://<fqdn>:8000/health"
   ```
   Expect `{"status":"ok"}` — this request left your machine entirely
   and hit a container running on Azure.

7. **(Azure Portal GUI)** Open portal.azure.com, navigate to your
   `learn-docker-rg` resource group, and click into the `webapp-aci`
   container instance. Its **Overview** page shows the same FQDN, state,
   and CPU/memory allocation you just saw via CLI; its **Containers →
   Logs** tab shows the same output `az container logs` would print —
   confirm both match.

8. **(PowerShell)** View logs and stream them live:
   ```powershell
   az container logs --resource-group learn-docker-rg --name webapp-aci
   ```
   Then, in a separate terminal, generate some traffic and watch logs
   stream:
   ```powershell
   az container attach --resource-group learn-docker-rg --name webapp-aci
   ```
   (Ctrl+C to stop attaching — this does not stop the container, only
   your local log stream.) Expect Flask's request log lines to appear as
   you hit the `/health` endpoint again from another window.

9. **Diagnose and fix: container group stuck in "Waiting" with a pull
   failure.** Deliberately break the registry credential:
   ```powershell
   az container delete --resource-group learn-docker-rg --name webapp-aci --yes
   az container create `
     --resource-group learn-docker-rg `
     --name webapp-aci-broken `
     --image "<yourinitialsacr2026>.azurecr.io/webapp:v1" `
     --registry-login-server "<yourinitialsacr2026>.azurecr.io" `
     --registry-username "<acr-admin-username>" `
     --registry-password "wrong-password" `
     --dns-name-label "webapp-aci-broken-<yourinitials>2026" `
     --ports 8000
   az container show --resource-group learn-docker-rg --name webapp-aci-broken --query "instanceView.state" --output tsv
   ```
   Expect the state to stay stuck (not `Running`), and:
   ```powershell
   az container show --resource-group learn-docker-rg --name webapp-aci-broken --query "containers[0].instanceView.events" --output table
   ```
   to show a pull failure event referencing authentication. Fix it by
   deleting and recreating with the correct password from exercise 4:
   ```powershell
   az container delete --resource-group learn-docker-rg --name webapp-aci-broken --yes
   ```
   (There's no in-place credential update for a running container
   group — ACI container groups are immutable once created; fixing a
   bad config means delete-and-recreate, which is why getting the
   credentials right from `az acr credential show` matters.)

10. **Cleaning up (avoid surprise charges).** ACI bills for CPU/memory
    allocated to a running container group for as long as it exists —
    stopping is not free the way `docker stop` is; you must delete the
    container group (or the whole resource group) to stop being billed
    for it. When you're done experimenting:
    ```powershell
    az container delete --resource-group learn-docker-rg --name webapp-aci --yes
    ```
    Or, to remove everything from this module and module 08 at once
    (resource group, ACR instance, and any container groups inside it)
    in one step:
    ```powershell
    az group delete --name learn-docker-rg --yes --no-wait
    ```
    `--yes` skips the confirmation prompt; `--no-wait` returns
    immediately instead of blocking until deletion finishes (deletion
    itself continues in the background). Confirm it's gone a few minutes
    later:
    ```powershell
    az group show --name learn-docker-rg
    ```
    Expect a `ResourceGroupNotFound` error once deletion completes — that
    error is what you want to see.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Using real `az` commands, get one of your own images from a private ACR instance (module 08) running on ACI and reachable over the public internet, then deliberately provoke and diagnose a failure before cleaning everything up. First deploy the image so a `curl` against its public FQDN returns your app's response — you'll have to get the registry authentication and the exposed container port both right for that to work. Then create a second container group with something wrong (a bad registry credential, or an exposed port that doesn't match what the app listens on), observe that it never reaches a healthy running state, and find the specific reason using the platform's own diagnostics rather than guessing. **When you are finished, delete the container groups and the resource group so you stop being billed** — ACI charges for allocated CPU/memory for as long as a group exists, and there is no free "stopped" state. Confirm the resource group is actually gone afterward.

<details>
<summary>Stuck? One hint</summary>

Get the pull working by passing the ACR login server plus admin username/password to `az container create` and setting `--ports` to the container's own port; when it won't start, read the container group's `instanceView.events` for the pull/authentication error, and tear down with `az group delete`.

</details>

## Common mistakes & troubleshooting

- **Forgetting `az container delete` or `az group delete` after
  finishing.** Unlike a local `docker run`, an ACI container group keeps
  billing until you explicitly delete it — there's no equivalent of just
  closing your laptop to stop the meter.
- **Picking a `--dns-name-label` that's already taken in that region.**
  Fails with a clear "already in use" error — the fix is simply to pick a
  more unique label (initials + numbers works reliably).
- **Mismatched `--ports` and what the app inside actually listens on.**
  If your Flask app listens on 8000 but you pass `--ports 80`, the health
  check/curl will time out even though the container is "Running" —
  double-check the container-side port matches the app, the same
  container-vs-host-port confusion from module 05, just without a
  host-side number to get right here (ACI publishes the container port
  directly).
- **Using the wrong ACR admin password (or the account not being
  enabled) and getting a stuck pull.** As shown in exercise 9, the
  container group provisions but never reaches `Running` — check
  `instanceView.events` for the specific pull error rather than
  guessing.
- **Expecting `az container create` to update an existing container
  group in place.** It doesn't — running it again with the same
  `--name` against an existing group errors; you must delete first (as
  in the diagnose-and-fix exercise) for any config change.
- **Confusing ACI's per-second CPU/memory billing model with a flat
  monthly cost.** Cost scales directly with `--cpu`/`--memory` and how
  long the group exists — keep both modest for learning exercises, and
  don't leave a container group running between study sessions.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is a "container group" in ACI, and how does it relate to what
   `docker run` does locally?
2. Why does `az container create` need `--registry-login-server`,
   `--registry-username`, and `--registry-password` for an image stored
   in ACR, when a local `docker run` for the same image needs none of
   that (once you're logged in)?
3. What determines the public hostname of a deployed container group,
   and what constraint does that value have to satisfy?
4. If a container group's provisioning state never reaches `Running`,
   what's the first thing to check, and which command shows it?
5. Can you update an existing container group's image or credentials in
   place with another `az container create`? What do you have to do
   instead?
6. Why does deleting a container group (or the whole resource group)
   matter for cost, in a way that stopping a local container never
   required?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. A container group is ACI's unit of deployment — one or more
   containers scheduled together, sharing a network namespace. For a
   single container, it's conceptually equivalent to one `docker run`,
   except hosted on Azure infrastructure with a public IP/FQDN instead
   of your local machine.
2. ACI has no persisted login session the way your local Docker CLI does
   after `docker login`/`az acr login` — each container group creation
   needs to authenticate to the registry itself, so the credentials must
   be supplied explicitly at creation time.
3. The `--dns-name-label` value, combined with the region, forms the
   FQDN (`<label>.<region>.azurecontainer.io`); the label must be unique
   within that Azure region.
4. Check `instanceView.events` via `az container show ... --query
   "containers[0].instanceView.events"` — it surfaces specific failure
   reasons like image pull authentication errors.
5. No — container groups are immutable once created; changing the image,
   credentials, ports, or resources requires deleting the existing group
   and creating a new one with the updated configuration.
6. ACI bills for allocated CPU/memory for as long as the container group
   exists, regardless of whether it's actively serving traffic — unlike
   a local container, there's no free "just leave it stopped" state;
   you must delete the group (or resource group) to stop being charged.

</details>

## Next

Continue to
[11-deploy-to-azure-app-service](../11-deploy-to-azure-app-service/README.md)
to deploy the same kind of image to a managed web-hosting platform with
built-in scaling, custom domains, and deployment slots.
