# Capstone Project

## Why this matters

Every module in this track exercised one skill in isolation: writing a
Dockerfile, mounting a volume, wiring a network, pushing to a registry,
deploying to Azure. Real work requires all of them together, in the
right order, with the small mistakes (a wrong port, a missing
credential, a volume that doesn't persist) that only show up when
everything has to work at once. This project is that integration test —
for you, not for a grader. There's no answer key because the point is
debugging your own decisions.

This bridges directly to the next track: once you can reliably
containerize and deploy a multi-service app to Azure by hand, the
Kubernetes track picks up exactly where this leaves off — the same
container images, deployed instead to a cluster that handles scaling,
self-healing, and rolling updates for you.

## The project

Build, containerize, compose, and deploy a small two-service web
application, end to end, on your own. No starter files are provided —
design and write the application yourself (it can be as simple as a
Flask or FastAPI app with two or three routes; reuse patterns from
earlier modules freely).

### Required components

1. **A small web app with a multi-stage Dockerfile.** The app should
   have at least one route that depends on a second service (a database
   or Redis) to prove the two are actually wired together — e.g. a
   counter that increments in Redis, or a route that reads/writes a
   Postgres table. The Dockerfile must use at least two build stages
   (module 07): one that installs dependencies, a second, leaner stage
   that only contains what's needed at runtime. It must run as a
   non-root user (module 09).

2. **A `compose.yaml` wiring the app to a second service with a named
   volume.** The second service is a database (Postgres, MySQL) or
   Redis, using an official image (no need to build it yourself). Its
   data must be stored in a named volume (module 04) so it survives a
   `docker compose down` (without `-v`). Use `depends_on` with
   `condition: service_healthy` (module 06) so the app doesn't start
   before the database/cache is actually ready.

3. **Local verification.** Before touching Azure, get the whole thing
   working locally with `docker compose up` — prove the app can read
   and write through the second service, and that data survives a
   restart.

4. **Push the app's image to Azure Container Registry.** Reuse an ACR
   instance from earlier modules or create a new one (module 08). The
   second service (database/Redis) does not need to be pushed to ACR —
   you'll pull its official image directly from Docker Hub in whichever
   Azure hosting option you choose next.

5. **Deploy to either ACI or App Service**, with the registry
   credentials configured correctly so the deployed container can
   actually pull your image (modules 10/11). Pick whichever platform
   fits your app's needs better and be ready to explain why: ACI is
   simpler and cheaper for a single-container deployment without a
   custom domain requirement, while App Service adds HTTPS out of the
   box and separates the compute plan from the individual deployment. If
   your app needs the second service (database/Redis) reachable too,
   decide deliberately how you're providing that in the Azure
   environment — this is the part of the project with no single correct
   answer, and the hints below discuss the trade-off.

6. **Verify it's reachable over the public internet** — from a browser
   or `curl`, hitting the public FQDN/hostname, not `localhost`.

7. **Tear everything down cleanly** — no lingering ACI container groups,
   App Service plans, or ACR instances left running after you're done.
   Confirm with `az group show` that the resource group is gone.

### Acceptance criteria checklist

- [ ] Dockerfile has at least two `FROM` stages, and the final stage
      does not contain build-only tooling that the first stage needed.
- [ ] The final image runs as a non-root user (confirm with
      `docker run --rm <image> whoami`).
- [ ] `.dockerignore` excludes anything irrelevant to the build
      (`.git`, virtual envs, `__pycache__`, etc.).
- [ ] `compose.yaml` defines at least two services and one named volume.
- [ ] The database/cache service has a `healthcheck:`, and the app
      service's `depends_on` uses `condition: service_healthy`.
- [ ] Locally, `docker compose down` (no `-v`) followed by
      `docker compose up -d` again preserves previously written data;
      `docker compose down -v` followed by `up -d` does not.
- [ ] The app's image is pushed to an ACR instance you created or
      control, tagged meaningfully (not just `latest`).
- [ ] The app is deployed to ACI or App Service, successfully pulling
      from your private ACR instance (not a public image).
- [ ] You can reach a working route over the public internet using the
      deployment's public hostname, and it demonstrably depends on the
      second service (e.g. a counter that increases across requests).
- [ ] You can explain, in your own words, why you chose ACI vs. App
      Service for this specific app.
- [ ] Every Azure resource created for this project has been deleted,
      confirmed with `az group show <name>` returning "not found."

### Hints (not a solution)

- **On the second-service-in-Azure question:** the simplest version of
  this project doesn't require a persistent database in Azure at all —
  using Redis (or an in-memory counter as a fallback) and accepting that
  ACI's container group or an App Service instance restart may reset
  data is a legitimate, honestly-labeled simplification for a learning
  project. If you want persistence in Azure specifically, the two
  realistic paths are: (a) an ACI **multi-container group** running both
  your app and a Redis/Postgres container together, sharing a network
  namespace, or (b) Azure's managed database offerings (outside this
  track's scope, but worth knowing they exist for anything beyond a
  demo). Don't feel obligated to solve production-grade persistence here
  — the grading bar is "you made a deliberate, explainable choice," not
  "you built what a real production system would use."
- **On multi-container ACI specifically:** `az container create` accepts
  a YAML file describing multiple containers in one group (rather than
  the single-container flags used in module 10) if you want to try
  running both services together in ACI — look at
  `az container create --file <yaml>` if you go this route.
- **On healthchecks:** if your `healthcheck:` command isn't available
  inside the official database/cache image (e.g. no `curl`), use the
  tool that image actually ships — `redis-cli ping` for Redis,
  `pg_isready` for Postgres — the same "use what's actually in the
  image" lesson from module 02's exec exercises.
- **On credentials reaching Azure:** re-use the ACR admin
  username/password pattern from modules 10/11 rather than inventing a
  new auth mechanism — this project is about integration, not learning a
  new credential type.
- **On debugging a deployment that "works locally but not on Azure":**
  work through the same checklist you used in modules 10/11's
  diagnose-and-fix exercises, in order — check the registry credentials
  first, then the port configuration, then the logs (`az container
  logs` / `az webapp log tail`) — rather than guessing.
- **On knowing when you're done:** if you can close your laptop, open it
  again tomorrow, run one `curl` against a public hostname, and see the
  right response — you've actually deployed something, not just gotten
  a command to exit successfully once.

## Further reading & sources

- [Docker: Multi-stage builds](https://docs.docker.com/build/building/multi-stage/) - for the two-stage Dockerfile the capstone requires.
- [Compose file reference](https://docs.docker.com/reference/compose-file/) - for the multi-service `compose.yaml` with a named volume and health-gated `depends_on`.
- [Azure: Deploy a multi-container group to ACI with YAML](https://learn.microsoft.com/en-us/azure/container-instances/container-instances-multi-container-yaml) - the `az container create --file` path referenced in the multi-container hint.
- [Azure: Run a custom container in App Service](https://learn.microsoft.com/en-us/azure/app-service/quickstart-custom-container) - the App Service deployment option for the capstone.
- [OWASP: Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) - to sanity-check the non-root, minimal-image requirements before you ship.
- [Docker: Build best practices](https://docs.docker.com/build/building/best-practices/) - a final checklist for image size, caching, and `.dockerignore` before deploying.

## Next

This is the last module in the Docker track. From here, continue to the
Kubernetes track — the container images and Compose files you just built
are exactly what you'll translate into Kubernetes objects (Pods,
Deployments, Services) next; nothing about how you build and structure
images changes, only how they're scheduled and networked.

## Before you move on

A day or two after you finish, tear the whole capstone down and rebuild it
from memory — build the image, push it to your registry, and redeploy it
to Azure — without re-reading your own notes or this page. If you can get
it live again from a blank directory and a working recollection alone,
that's the real signal the whole track stuck. Do that retention check
before you start the Kubernetes track.
