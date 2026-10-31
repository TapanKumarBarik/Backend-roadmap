# Deploy to Azure App Service

## Why this matters

ACI (module 10) is great for a single, standalone container, but it has
no built-in concept of custom domains, deployment slots, autoscaling, or
integrated HTTPS. **Azure App Service** is a managed web-hosting platform
that can run a container image directly (instead of only "upload your
code" as it did historically) and layers on all of that — the more
realistic target for a real web app than raw ACI, and the pattern you'll
recognize again once you reach AKS Ingress in the AKS track.

This module uses your real Azure subscription. Follow the cleanup
subsection at the end.

## Concepts

### App Service Plan defines the compute; the Web App runs on it

An **App Service Plan** is the underlying compute (VM size/tier, Linux or
Windows) that one or more **Web Apps** run on top of — similar to how one
VM host can run multiple containers, one App Service Plan can host
multiple web apps sharing that capacity. You create the plan once
(`--sku B1` is the cheapest tier with the features this module needs)
and then create a web app against it, specifying a container image
instead of a code deployment.

### A Web App running a container is just App Service pulling and running your image

Once configured with a container image, App Service does conceptually
what `docker run` does locally: pulls the image from the registry you
specify, starts a container from it, and routes public HTTPS traffic to
whatever port the container listens on internally.

```
                    ┌──────── App Service Plan (B1 compute) ────────┐
   ACR              │  ┌──────── Web App ─────────────────────────┐ │
  ┌──────────────┐  │  │  pulls image ─► runs container            │ │
  │ webapp:v1    │──┼─►│  WEBSITES_PORT=8000 ─► routes here        │ │
  └──────────────┘  │  └──────────────────────────────────────────┘ │
   (registry creds) └─────────────────────┬─────────────────────────┘
                                           │ managed HTTPS
   browser ─── https://<name>.azurewebsites.net ◄──── auto TLS cert
```

The two commands that
matter are `az webapp create --deploy-container-image-name` (set the
image at creation time) and `az webapp config container set` (change it
later, e.g. to deploy a new tag) — both ultimately configure the same
underlying setting.

### `WEBSITES_PORT` tells App Service which port your container listens on

App Service's container support defaults to expecting your app on port
`80` (or attempts to detect it). If your app listens on a different
port — like this track's example Flask app on `8000` — you must set the
`WEBSITES_PORT` app setting explicitly, or App Service can't route
traffic to your container even though it started successfully. This is
the App Service equivalent of getting the container-side port right in
`docker run -p` or ACI's `--ports`.

```
  WEBSITES_PORT=8000 (correct)      WEBSITES_PORT unset/9999 (broken)
  App Service ──► :8000 ◄─ app      App Service ──► :80/:9999   app on :8000
     traffic reaches app               nothing listening → "Application Error"
                                       (container started fine — routing gap)
```

### Registry authentication works the same way as ACI

App Service needs credentials to pull from a private ACR instance, just
like ACI did in module 10 — either ACR's admin username/password (used
here, for consistency with module 10) or a managed identity in
production setups. The credential is stored as part of the web app's
container configuration, set once via `az webapp config container set`.

### Logs stream through `az webapp log tail`, after enabling container logging

Unlike ACI's always-on `az container logs`, App Service requires log
collection to be explicitly enabled once
(`az webapp log config --docker-container-logging filesystem`) before
`az webapp log tail` has anything to stream — conceptually similar to how
a bare Linux daemon needs its logging configured before you can `tail`
its log file.

> In Docker Desktop: nothing here appears locally, same as ACI — use the
> Azure Portal's **App Service → Log stream** page as the GUI equivalent
> of `az webapp log tail`, and **App Service → Deployment Center /
> Container settings** page as the GUI equivalent of
> `az webapp config container set`.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az appservice plan create` | Creates the compute plan a web app runs on | `az appservice plan create --resource-group learn-docker-rg --name webapp-plan --is-linux --sku B1` |
| `az webapp create --deploy-container-image-name` | Creates a web app, pointing it at a container image | see below |
| `az webapp config container set` | Updates a web app's container image/registry settings | see below |
| `az webapp config appsettings set` | Sets environment variables / app settings, including `WEBSITES_PORT` | `az webapp config appsettings set --resource-group learn-docker-rg --name webapp-<unique> --settings WEBSITES_PORT=8000` |
| `az webapp log config` | Enables container log collection | `az webapp log config --resource-group learn-docker-rg --name webapp-<unique> --docker-container-logging filesystem` |
| `az webapp log tail` | Streams live logs | `az webapp log tail --resource-group learn-docker-rg --name webapp-<unique>` |
| `az webapp restart` | Restarts the web app (e.g. after a config change) | `az webapp restart --resource-group learn-docker-rg --name webapp-<unique>` |
| `az webapp show` | Shows a web app's details, including its default hostname | `az webapp show --resource-group learn-docker-rg --name webapp-<unique> --query "defaultHostName" --output tsv` |
| `az webapp delete` | Deletes a single web app | `az webapp delete --resource-group learn-docker-rg --name webapp-<unique>` |
| `az appservice plan delete` | Deletes an App Service plan | `az appservice plan delete --resource-group learn-docker-rg --name webapp-plan --yes` |

Flag breakdown for the full `az webapp create` command:

```powershell
az webapp create `
  --resource-group learn-docker-rg `
  --plan webapp-plan `
  --name webapp-<yourinitials>2026 `
  --deploy-container-image-name "<yourinitialsacr2026>.azurecr.io/webapp:v1"
```

- `--resource-group learn-docker-rg` — same resource group used in
  earlier modules.
- `--plan webapp-plan` — the App Service Plan this web app runs on.
- `--name webapp-<yourinitials>2026` — the web app's name; must be
  globally unique across all of Azure (it becomes part of the public
  hostname `<name>.azurewebsites.net`, same DNS-uniqueness constraint as
  ACR's name in module 08).
- `--deploy-container-image-name` — the image to pull and run, exactly
  the reference you pushed to ACR.

Flag breakdown for `az webapp config container set`:

```powershell
az webapp config container set `
  --resource-group learn-docker-rg `
  --name webapp-<yourinitials>2026 `
  --container-image-name "<yourinitialsacr2026>.azurecr.io/webapp:v2" `
  --container-registry-url "https://<yourinitialsacr2026>.azurecr.io" `
  --container-registry-user "<acr-admin-username>" `
  --container-registry-password "<acr-admin-password>"
```

- `--container-image-name` — the (possibly new) image/tag to deploy —
  this is how you ship an update: push a new tag to ACR, then re-point
  the web app at it with this command.
- `--container-registry-url`, `--container-registry-user`,
  `--container-registry-password` — the registry endpoint and admin
  credentials, the App Service equivalent of the same three pieces of
  information ACI needed in module 10.

## Hands-on exercises

1. **(PowerShell)** Reuse the resource group and ACR instance from
   modules 08/10 (skip if you still have them):
   ```powershell
   az group create --name learn-docker-rg --location eastus
   az acr create --resource-group learn-docker-rg --name <yourinitialsacr2026> --sku Basic
   az acr update --name <yourinitialsacr2026> --admin-enabled true
   ```

2. **(PowerShell)** Reuse the `webapp:v1` image from module 10, or build
   it fresh:
   ```powershell
   cd ~/learn-docker/aci-lab   # reuse module 10's app, or recreate app.py/requirements.txt/Dockerfile there
   az acr build --registry <yourinitialsacr2026> --image webapp:v1 .
   ```

3. **(PowerShell)** Create the App Service plan and the web app:
   ```powershell
   az appservice plan create --resource-group learn-docker-rg --name webapp-plan --is-linux --sku B1
   az webapp create `
     --resource-group learn-docker-rg `
     --plan webapp-plan `
     --name webapp-<yourinitials>2026 `
     --deploy-container-image-name "<yourinitialsacr2026>.azurecr.io/webapp:v1"
   ```
   Expect a JSON response including `"state": "Running"` and a
   `defaultHostName` like `webapp-<yourinitials>2026.azurewebsites.net`.

4. **(PowerShell)** Supply registry credentials (needed since the
   registry is private) and set the port:
   ```powershell
   az acr credential show --name <yourinitialsacr2026>
   az webapp config container set `
     --resource-group learn-docker-rg `
     --name webapp-<yourinitials>2026 `
     --container-image-name "<yourinitialsacr2026>.azurecr.io/webapp:v1" `
     --container-registry-url "https://<yourinitialsacr2026>.azurecr.io" `
     --container-registry-user "<acr-admin-username>" `
     --container-registry-password "<acr-admin-password>"
   az webapp config appsettings set `
     --resource-group learn-docker-rg `
     --name webapp-<yourinitials>2026 `
     --settings WEBSITES_PORT=8000
   az webapp restart --resource-group learn-docker-rg --name webapp-<yourinitials>2026
   ```
   Expect each command to return successfully; the restart applies the
   new container/port settings.

5. **(PowerShell)** Confirm it's reachable:
   ```powershell
   az webapp show --resource-group learn-docker-rg --name webapp-<yourinitials>2026 --query "defaultHostName" --output tsv
   curl "https://<the-hostname-from-above>/health"
   ```
   Expect `{"status":"ok"}` — note this is served over **HTTPS** by
   default, unlike the plain HTTP FQDN ACI gave you in module 10; App
   Service provisions a certificate for the `azurewebsites.net` domain
   automatically.

6. **(Azure Portal GUI)** Open portal.azure.com, navigate to
   `learn-docker-rg`, and open the `webapp-<yourinitials>2026` App
   Service. On its **Overview** page, confirm the same default hostname
   and status. Open **Deployment Center** (or **Container settings**,
   depending on portal version) and confirm the image name and registry
   URL match what you set via CLI — this page is the GUI equivalent of
   `az webapp config container set`.

7. **(PowerShell)** Enable and stream logs:
   ```powershell
   az webapp log config --resource-group learn-docker-rg --name webapp-<yourinitials>2026 --docker-container-logging filesystem
   az webapp log tail --resource-group learn-docker-rg --name webapp-<yourinitials>2026
   ```
   While it's streaming, hit the `/health` endpoint again from another
   terminal window and watch a corresponding request log line appear.
   Ctrl+C to stop tailing.

8. **(PowerShell)** Deploy an update — build a new tag and re-point the
   web app at it, the realistic "ship a change" workflow:
   ```powershell
   # edit app.py, e.g. change the health response to {"status": "ok", "version": "v2"}
   az acr build --registry <yourinitialsacr2026> --image webapp:v2 .
   az webapp config container set `
     --resource-group learn-docker-rg `
     --name webapp-<yourinitials>2026 `
     --container-image-name "<yourinitialsacr2026>.azurecr.io/webapp:v2" `
     --container-registry-url "https://<yourinitialsacr2026>.azurecr.io" `
     --container-registry-user "<acr-admin-username>" `
     --container-registry-password "<acr-admin-password>"
   az webapp restart --resource-group learn-docker-rg --name webapp-<yourinitials>2026
   Start-Sleep -Seconds 15
   curl "https://<hostname>/health"
   ```
   Expect the response to reflect your `v2` change once the restart
   completes and the new image has been pulled.

9. **Diagnose and fix: web app returns a default "Application Error"
   page.** Deliberately break the port setting:
   ```powershell
   az webapp config appsettings set `
     --resource-group learn-docker-rg `
     --name webapp-<yourinitials>2026 `
     --settings WEBSITES_PORT=9999
   az webapp restart --resource-group learn-docker-rg --name webapp-<yourinitials>2026
   Start-Sleep -Seconds 15
   curl "https://<hostname>/health"
   ```
   Expect an error response (App Service's default error page, or a
   timeout) — the platform is trying to route traffic to port `9999`,
   but Flask is listening on `8000` inside the container, so nothing
   answers. Diagnose with the log stream:
   ```powershell
   az webapp log tail --resource-group learn-docker-rg --name webapp-<yourinitials>2026
   ```
   You'd see the container start fine in the logs (it's genuinely
   running), which is the tell that the problem is routing/port
   configuration, not the app itself. Fix it:
   ```powershell
   az webapp config appsettings set `
     --resource-group learn-docker-rg `
     --name webapp-<yourinitials>2026 `
     --settings WEBSITES_PORT=8000
   az webapp restart --resource-group learn-docker-rg --name webapp-<yourinitials>2026
   Start-Sleep -Seconds 15
   curl "https://<hostname>/health"
   ```
   Expect `{"status":"ok",...}` again.

10. **Cleaning up (avoid surprise charges).** The `B1` App Service Plan
    bills hourly for as long as it exists, regardless of traffic — same
    principle as ACI in module 10, just billed at the plan level instead
    of per container group. When done:
    ```powershell
    az webapp delete --resource-group learn-docker-rg --name webapp-<yourinitials>2026
    az appservice plan delete --resource-group learn-docker-rg --name webapp-plan --yes
    ```
    Or remove everything from this module and earlier Azure modules at
    once:
    ```powershell
    az group delete --name learn-docker-rg --yes --no-wait
    ```
    Confirm afterward:
    ```powershell
    az group show --name learn-docker-rg
    ```
    Expect a `ResourceGroupNotFound` error once deletion finishes.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Using real `az` commands, deploy one of your ACR-hosted images to App Service, get it answering over HTTPS at its `azurewebsites.net` hostname, and then ship an update to it the way you would in real life — then clean everything up. Getting the first version reachable will require you to reconcile the same port question from ACI (module 10) with App Service's own way of learning which port your container listens on, plus supplying registry credentials for the private pull. Once it's live, make a visible change to the app, build and store it under a *new* tag, re-point the web app at that new tag, and confirm the public hostname now serves the updated response. **When you're done, delete the web app and its App Service plan (or the whole resource group)** — the plan bills hourly for as long as it exists regardless of traffic, so confirm the resource group is gone at the end.

<details>
<summary>Stuck? One hint</summary>

If the site shows an application error even though the container started, the port App Service is routing to probably doesn't match the app — set `WEBSITES_PORT` to the container's port; ship the update with a new image tag plus `az webapp config container set` followed by `az webapp restart`, and tear down with `az group delete`.

</details>

## Common mistakes & troubleshooting

- **Forgetting `WEBSITES_PORT` when the app doesn't listen on port
  80.** The single most common "container runs fine but the site shows
  an error" cause for App Service — always set it explicitly to match
  what your `EXPOSE`/`CMD` actually binds to.
- **Leaving the App Service Plan running after you're done.** Unlike
  ACI's per-container billing, the plan (`B1` tier and above) bills
  continuously whether or not a web app is actively serving traffic —
  delete the plan (or resource group) when you're finished, the same
  discipline as module 10's ACI cleanup.
- **Changing the container image/registry settings without a restart.**
  Some settings changes apply immediately; others (especially the
  container image itself) need `az webapp restart` to take effect —
  if a redeployed image doesn't seem to have updated, restart before
  assuming something else is wrong.
- **Picking a `--name` that collides with an existing
  `*.azurewebsites.net` name.** Same global-uniqueness constraint as ACR
  names and ACI DNS labels — append initials/digits.
- **Assuming `az webapp log tail` works without first running `az
  webapp log config --docker-container-logging filesystem`.** Without
  enabling it, there's nothing to tail — you'll just see the command
  hang or return nothing useful.
- **Confusing this with a straight code deployment.** Historically App
  Service's primary model was "push your code, we build and run it" —
  this module uses its separate container-hosting mode, where App
  Service only pulls and runs an image you already built; there is no
  build step happening on the App Service side.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the relationship between an App Service Plan and a Web App?
2. Why is `WEBSITES_PORT` necessary for this track's example app, and
   what happens if it's set incorrectly?
3. What two commands does deploying an updated image version require,
   and why is the second one necessary?
4. What has to be enabled before `az webapp log tail` will show
   anything, and why?
5. Why does App Service serve traffic over HTTPS by default at the
   `azurewebsites.net` hostname, unlike the plain-HTTP FQDN ACI gave you
   in module 10?
6. What's the billing difference between an ACI container group and an
   App Service Plan, in terms of what determines whether you're being
   charged?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. An App Service Plan is the underlying compute (VM tier, OS) that one
   or more Web Apps run on top of and can share; the Web App is the
   individual application (here, a container) hosted on that plan.
2. App Service's container hosting defaults to routing traffic to port
   80 unless told otherwise; the example app listens on 8000, so
   `WEBSITES_PORT=8000` tells App Service where to actually send
   requests. Set incorrectly (or omitted when it doesn't match), the
   container runs but nothing answers on the port App Service is trying
   to reach, producing an application error even though the container
   itself started fine.
3. `az acr build` (or a local build + push) to produce the new image tag
   in ACR, then `az webapp config container set` to point the web app at
   that new tag, followed by `az webapp restart` to apply it —
   `config container set` is necessary because the web app doesn't
   automatically detect or pull a new tag on its own.
4. `az webapp log config --docker-container-logging filesystem` must be
   run first — container log collection isn't on by default, so there's
   nothing for `log tail` to stream until it's enabled.
5. App Service automatically provisions and manages a TLS certificate
   for the shared `azurewebsites.net` domain as part of the platform;
   ACI's `azurecontainer.io` FQDN has no such built-in certificate
   management, so it's served over plain HTTP unless you set up TLS
   yourself.
6. An ACI container group bills based on allocated CPU/memory for as
   long as the group exists, tied to that specific container instance;
   an App Service Plan bills for the compute tier itself continuously,
   independent of how many web apps are deployed on it or whether they're
   receiving traffic — deleting the web app alone doesn't stop the
   plan's charges, you must also delete (or downsize) the plan.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the
point is to find out what actually stuck.

1. You built an image locally and want it running on Azure. Trace the
   minimum chain of concepts from "image on my laptop" to "container
   answering on a public hostname," naming what a registry contributes in
   the middle and why the deployment target can't just use your local
   image directly.
2. Both ACI and App Service need to pull your app's image from a *private*
   ACR instance, and neither has run `docker login`. Explain what those
   platforms need supplied at creation/configuration time that your local
   Docker didn't, and what the ACR admin account provides for this.
3. The example Flask app listens on 8000. Explain how you tell each of the
   three deployment surfaces — a local `docker run`, ACI, and App Service —
   which port matters, and why the App Service mechanism is named
   differently from the other two but solves the same problem.
4. `docker tag myapp myacr.azurecr.io/myapp:v1` then `docker push` uploads
   only some layers, not the whole image, and the tag itself was
   instantaneous. Explain both facts in terms of what a tag is and how
   push reuses layers.
5. Your ACI container group provisions but never reaches `Running`, and
   separately your App Service site returns an "Application Error" page.
   For each, name the single most likely cause given what this track
   emphasized, and the diagnostic command you'd run first.
6. You need to ship v2 of your app to a running App Service web app.
   Describe the full sequence — including where the new image comes from
   and why a restart is involved — and contrast it with how you'd "update"
   an already-created ACI container group.
7. Explain why an ACR name, an ACI `--dns-name-label`, and an App Service
   `--name` all have uniqueness requirements, and how the *scope* of that
   uniqueness differs among the three.
8. App Service serves your app over HTTPS automatically at
   `azurewebsites.net`, while ACI gave you a plain-HTTP `azurecontainer.io`
   FQDN. Explain the difference in what each platform provides, not just
   that one has a padlock.
9. Both ACI and App Service keep charging you after you stop actively
   using them, in a way a local `docker stop` never did. Explain what each
   bills for and the concrete cleanup command that actually stops the
   meter for a whole project.
10. A colleague reduced their image with a multi-stage build and a
    non-root user before pushing to ACR and deploying. Explain how those
    two earlier-module choices (size and non-root) still pay off once the
    image is running on ACI or App Service, not just locally.

<details>
<summary>Show answers</summary>

1. Build the image, tag it for and push it to a registry (here ACR), then
   have the Azure service pull it from that registry and run it, exposing a
   public hostname. The registry is the shared, addressable store that
   makes the image reachable from somewhere other than your laptop — ACI
   and App Service run on Azure infrastructure with no access to your local
   Docker engine's images, so the image has to be in a registry they can
   pull from.
2. Your local Docker had a persisted credential from `docker login`/`az
   acr login`; the Azure platforms have no such session, so they need the
   registry login server plus a username and password supplied explicitly
   at creation/config time. ACR's admin account provides a single built-in
   username/password pair for the whole registry to hand them.
3. Locally you pass the container port in `-p host:container`; ACI takes
   `--ports <container-port>`; App Service needs the `WEBSITES_PORT` app
   setting. App Service's is named differently because it doesn't publish a
   host port the way `-p`/`--ports` conceptually do — it terminates public
   HTTPS and just needs to know which internal container port to route to —
   but all three answer the same "which port does the app actually listen
   on" question.
4. `docker tag` only adds a second name pointing at the same image ID and
   layers, so it copies nothing and is instant. `docker push` uploads only
   the layers the registry doesn't already have, reusing shared layers, so
   a rebuild that changed little transfers little.
5. ACI stuck-not-`Running`: most likely a registry pull/authentication
   failure (bad or unenabled admin credential) — check `az container show
   ... --query "containers[0].instanceView.events"`. App Service
   "Application Error": most likely a `WEBSITES_PORT` that doesn't match the
   app's port — check `az webapp log tail` (the container starts fine,
   pointing at routing, not the app).
6. Build the new image and store it in ACR under a new tag (`az acr build`
   or local build + push), then `az webapp config container set` to point
   the web app at the new tag, then `az webapp restart` to make it pull and
   run the new image (it won't auto-detect a new tag). An ACI container
   group is immutable — you can't update it in place; you delete it and
   create a new one with the new configuration.
7. All three become part of a public DNS name, so they can't collide.
   Scope differs: an ACR name (`<name>.azurecr.io`) and an App Service name
   (`<name>.azurewebsites.net`) must be unique globally across all of
   Azure, while an ACI `--dns-name-label` must be unique only within its
   Azure region.
8. App Service automatically provisions and manages a TLS certificate for
   the shared `azurewebsites.net` domain as a platform feature, so HTTPS
   works with no setup. ACI's `azurecontainer.io` FQDN has no built-in
   certificate management, so it's plain HTTP unless you set up TLS
   yourself.
9. ACI bills for the CPU/memory allocated to a container group for as long
   as the group exists; an App Service plan bills hourly for its compute
   tier regardless of traffic or how many apps run on it. The cleanup that
   stops a whole project's meter is `az group delete --name <rg> --yes`,
   which removes the resource group and everything in it.
10. A smaller image pulls faster and starts faster on the Azure side (ACI
    provisioning, App Service cold pulls) and carries less attack surface;
    running as a non-root user reduces risk exactly the same way it did
    locally, since the container still shares the host kernel wherever it
    runs — the hardening travels with the image, it isn't a local-only
    property.

</details>

## Further reading & sources

- [Azure: App Service overview](https://learn.microsoft.com/en-us/azure/app-service/overview) - the platform overview, including App Service Plans and Web Apps.
- [Azure: Run a custom container in App Service](https://learn.microsoft.com/en-us/azure/app-service/quickstart-custom-container) - the container-hosting workflow this module follows, including `WEBSITES_PORT`.
- [Azure: Configure a custom container (WEBSITES_PORT, registry auth)](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container) - reference for the port and private-registry settings used here.
- [az webapp CLI reference](https://learn.microsoft.com/en-us/cli/azure/webapp) - the full reference for `create`, `config container set`, `log tail`, and `restart`.
- [Azure: App Service pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/) - the per-plan hourly billing model behind this module's cleanup warnings.

## Next

Continue to
[12-nginx-reverse-proxy-and-load-balancing](../12-nginx-reverse-proxy-and-load-balancing/README.md)
to put nginx in front of a containerized app for TLS termination, load
balancing, and static-file serving — the last new piece before the
capstone.
