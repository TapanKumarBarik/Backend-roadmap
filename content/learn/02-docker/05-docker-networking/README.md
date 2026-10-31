# Docker Networking

## Why this matters

Almost nothing useful runs in a single, isolated container — you'll want
a web app that talks to a database, or a public port that reaches an
internal service. Docker's default networking model (bridge networks,
published ports, container DNS) is what makes multi-container apps
possible, and it's exactly what Compose (module 06) automates for you —
understanding it manually first means Compose won't feel like magic.

## Concepts

### Every container has its own network namespace

Recall from module 01: every container gets its own **network namespace**
— its own loopback interface, its own routing table, its own IP. That's
why `localhost` inside a container means the container itself, and why two
containers don't automatically share anything at the network level.

### The bridge network connects containers

By default, Docker connects containers to a **bridge network**: a virtual
switch on the host (similar to a Linux bridge you could build with `ip
link add type bridge`) that containers plug into like virtual network
cards. Containers on the same bridge can reach each other directly by IP;
the host can reach them only through explicitly published ports.

```
                    Host (WSL2 VM)
   browser :8000 ─► ┌─────────────────────────────────────┐
                    │  -p 8000:8000  (NAT / iptables)      │
                    │            │                         │
                    │   ┌────────▼─── docker bridge ───────┐
                    │   │  (virtual switch)                │
                    │   │    │                │            │
                    │   │ ┌──▼───────┐   ┌────▼─────────┐  │
                    │   │ │ web      │   │ db           │  │
                    │   │ │172.18.0.2│   │ 172.18.0.3   │  │
                    │   │ │ :8000    │   │ :5432        │  │
                    │   │ └──────────┘   └──────────────┘  │
                    │   └──────────────────────────────────┘
                    └─────────────────────────────────────┘
   web ↔ db talk directly by IP/name; host only via -p mapping
```

### Publishing a port forwards host traffic inward

**Publishing a port** with `-p host:container` sets up a mapping so
traffic hitting a port on the host gets forwarded into the container's
network namespace to the specified container port — implemented with the
same iptables/NAT mechanisms you'd configure by hand on bare Linux, just
managed for you. Without `-p`, a container's ports are reachable only from
other containers on the same Docker network, never from the host or the
outside world.

> In Docker Desktop: a container's published ports appear in the
> **Containers** tab as clickable links (e.g. `8000:8000`) that open the
> mapped host port in your browser — a quick visual confirmation of what
> `-p` did. The container's **Inspect** sub-tab shows its assigned IP and
> which network it's on.

### User-defined networks give you free DNS

**User-defined bridge networks** are the practical default for anything
beyond a single container. Create one with `docker network create`, attach
containers to it, and Docker gives you **DNS-based service discovery**:
each container can reach another by its `--name` as a hostname, resolved
automatically, no hardcoded IPs. The *default* bridge network (where
containers land if you don't specify one) does **not** provide this
automatic name resolution — a key, easy-to-miss difference.

```
  user-defined bridge "applab"        default "bridge"
  ┌──────────────────────────┐       ┌──────────────────────────┐
  │  svcB ──"svcA"──► svcA   │       │  svcB ──"svcA"──► ✗ fail  │
  │        (DNS resolves)    │       │     (no name resolution)  │
  └──────────────────────────┘       └──────────────────────────┘
      reach peers by --name             must use raw IPs only
```

### Three things to keep straight

- **`localhost` inside a container** refers to that container's own
  loopback interface — never the host, never another container.
- **`host.docker.internal`** is a special DNS name Docker Desktop provides
  *inside* containers that resolves to the host machine — handy when a
  container needs to reach something running directly on your Windows/WSL2
  host.
- **Container-to-container communication** on a shared user-defined
  network uses the *container port* directly, not the published host port
  — e.g. another container reaches your app at `http://web:8000` (its
  `--name` and internal port), regardless of what host port you published
  with `-p`.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `docker network ls` | Lists Docker networks | `docker network ls` |
| `docker network create <name>` | Creates a user-defined bridge network | `docker network create applab` |
| `docker network inspect <name>` | Shows a network's subnet, connected containers, and their IPs | `docker network inspect applab` |
| `docker network rm <name>` | Deletes a network (fails if containers are attached) | `docker network rm applab` |
| `docker run --network <name> ...` | Attaches a container to a specific network at start | `docker run --network applab --name web webapp` |
| `docker network connect <net> <container>` | Attaches a running container to another network | `docker network connect applab other` |
| `docker network disconnect <net> <container>` | Detaches a container from a network | `docker network disconnect applab other` |
| `docker run -p <hostport>:<containerport> ...` | Publishes a container port to the host | `docker run -p 8000:8000 webapp` |
| `docker run -p 127.0.0.1:<hostport>:<containerport> ...` | Publishes a port bound only to localhost | `docker run -p 127.0.0.1:8000:8000 webapp` |
| `docker port <container>` | Shows a running container's published port mappings | `docker port web` |

Flag breakdown for the port-publishing forms:

- `-p 8000:8000` — `host:container` order. Host port `8000` forwards to
  container port `8000`, and the mapping is bound on *all* host
  interfaces, so other devices on your network can reach it too.
- `-p 127.0.0.1:8000:8000` — the same mapping, but the leading
  `127.0.0.1:` binds it only to the host's loopback interface, so only
  processes on this machine can reach it.
- `--network applab --name web` — `--network applab` attaches the
  container to the `applab` network at start; `--name web` sets the name
  other containers will use as a DNS hostname on that network.

## Hands-on exercises

Exercise 5 creates a tiny self-contained app inline; earlier exercises
use only `alpine`. Nothing is downloaded.

1. **(WSL2 Ubuntu terminal)** List the networks Docker already created:
   ```bash
   docker network ls
   ```
   Expect at least `bridge`, `host`, and `none` — Docker's built-in
   networks. `bridge` is the default new containers join if you don't
   specify one.

2. **(WSL2 Ubuntu terminal)** Confirm containers on the default bridge
   can't resolve each other by name:
   ```bash
   docker run -d --name svcA alpine sleep 300
   docker run -d --name svcB alpine sleep 300
   docker exec svcB ping -c 2 svcA
   ```
   Expect `ping` to fail to resolve `svcA` — the default `bridge` network
   provides no automatic DNS between containers. Clean up:
   `docker rm -f svcA svcB`.

3. **(WSL2 Ubuntu terminal)** Now do the same on a user-defined network:
   ```bash
   docker network create applab
   docker run -d --network applab --name svcA alpine sleep 300
   docker run -d --network applab --name svcB alpine sleep 300
   docker exec svcB ping -c 2 svcA
   ```
   Expect `ping` to succeed, resolving `svcA` to its container IP — the
   DNS-based service discovery a user-defined network gives you for free.
   Keep these running for the next exercise.

4. **(WSL2 Ubuntu terminal)** Inspect the network to see both containers'
   IPs:
   ```bash
   docker network inspect applab
   ```
   Expect a `Containers` section listing `svcA` and `svcB`, each with an
   `IPv4Address` on the same subnet. Clean up:
   ```bash
   docker rm -f svcA svcB
   docker network rm applab
   ```

5. **(WSL2 Ubuntu terminal)** Create a tiny app inline and run it on a
   user-defined network with a published port:
   ```bash
   mkdir -p ~/learn-docker/net-lab && cd ~/learn-docker/net-lab

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
   docker network create applab
   docker run -d --network applab --name web -p 8000:8000 webapp
   curl -s http://localhost:8000/health
   ```
   Expect `{"status":"ok"}` — the published port made it reachable from
   the host.

6. **(Docker Desktop GUI, then CLI)** See the published port in the GUI.
   Open Docker Desktop's **Containers** tab: the `web` row shows a port
   link like `8000:8000`. Click it and your browser opens
   `http://localhost:8000/` (you'll get the app's response). Open the
   `web` container's **Inspect** sub-tab and find its IP and the `applab`
   network under its network settings. Cross-check from the CLI:
   ```bash
   docker port web
   docker network inspect applab
   ```
   Expect `docker port` to report the same `8000` mapping the GUI link
   used, and the inspect output to list `web` on `applab` with the IP the
   GUI showed.

7. **(WSL2 Ubuntu terminal)** Confirm container-to-container access uses
   the *container* port, not the host-published port. Curl the first
   container by name from a second one on the same network:
   ```bash
   docker run --rm --network applab alpine sh -c "apk add --no-cache curl >/dev/null && curl -s http://web:8000/health"
   ```
   Expect `{"status":"ok"}` — note it used port `8000` (the container's
   internal port) and the name `web`, not `localhost` and not a host-side
   port number.

8. **(WSL2 Ubuntu terminal)** Confirm `localhost` inside a container means
   the container itself, not the host or another container:
   ```bash
   docker exec web sh -c "python -c \"import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read())\""
   ```
   Expect it to succeed (the app really does listen on `localhost` inside
   its own namespace). This proves the loopback interface is
   container-local, not shared with the host.

9. **(WSL2 Ubuntu terminal)** Bind a published port to localhost only,
   and understand the difference from the unrestricted form:
   ```bash
   docker rm -f web
   docker run -d --network applab --name web -p 127.0.0.1:8000:8000 webapp
   curl -s http://127.0.0.1:8000/health
   docker port web
   ```
   Expect the `curl` to succeed and `docker port` to show the binding
   restricted to `127.0.0.1:8000` — other devices on your network could
   not reach this container through this interface, whereas a plain
   `-p 8000:8000` would have bound all host interfaces.

10. **Diagnose and fix: port not reachable.** Deliberately mix up the `-p`
    direction (a common real mistake):
    ```bash
    docker rm -f web
    docker run -d --network applab --name web -p 8000:9000 webapp
    curl -m 3 -s http://localhost:8000/health
    ```
    Expect the `curl` to fail/hang — you told Docker to forward host port
    8000 to *container* port 9000, but the app listens on 8000. Diagnose:
    ```bash
    docker port web
    docker logs web
    ```
    (`docker port` shows the wrong mapping; in Docker Desktop's
    **Containers** tab, the port link would point at 9000 too.) Fix it
    with the correct `host:container` mapping:
    ```bash
    docker rm -f web
    docker run -d --network applab --name web -p 8000:8000 webapp
    curl -s http://localhost:8000/health
    ```
    Expect success this time. Full cleanup:
    ```bash
    docker rm -f web
    docker network rm applab
    docker network ls
    ```
    Expect `applab` gone, only the built-in networks remaining.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Build the small Flask app (reuse the pattern from module 02) and stand up a two-container scenario entirely by hand that demonstrates three of this module's claims in one setup: a second container reaching the app *by name* on a shared network, the same lookup *failing* when the containers are only on the default bridge, and the fact that container-to-container traffic uses the app's internal container port rather than any host-published port. Publish the app to your host as well, but bind that published port so that only your own machine — not other devices on your network — can reach it. Explain why the port number the second container uses to reach the app differs from the number you'd type in a browser on the host.

<details>
<summary>Stuck? One hint</summary>

Create a user-defined network and attach both containers with `--name`s; from the second container reach the first at `http://<name>:<container-port>`, and repeat the name lookup with both containers left on the default bridge to see it fail. For the host-only publish, put a loopback address in front of the `-p` mapping.

</details>

## Common mistakes & troubleshooting

- **Assuming containers on the default `bridge` network can resolve each
  other by name.** They can't — only user-defined networks provide
  automatic DNS; always create one for multi-container setups you run
  manually (Compose does this for you, module 06).
- **Reversing `-p host:container`.** Easy to typo, and the failure mode
  (connection refused/timeout, app looks "broken") doesn't obviously point
  at the mapping — always double-check with `docker port <container>` or
  the port link in Docker Desktop's Containers tab.
- **Trying to reach another container via `localhost`.** `localhost` is
  always the current container's own namespace; use the other container's
  `--name` on a shared network instead.
- **Forgetting `-p` entirely and wondering why the host can't connect,
  even though the container is `Up`.** Being "up" only means the process
  is running in its own namespace — nothing reaches it from outside
  without an explicit port publish.
- **Expecting a plain `-p 8000:8000` to be private to your machine.** By
  default it binds all host interfaces. Use `-p 127.0.0.1:8000:8000` to
  restrict it to the host.
- **Trying to `docker network rm` a network with containers still
  attached.** Fails with "has active endpoints" — remove or disconnect
  the containers first.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Why can't two containers on Docker's default `bridge` network resolve
   each other by container name, while two on a user-defined bridge
   network can?
2. What does `-p 8000:9000` actually do, and which number is the host
   port vs. the container port?
3. From inside container A, why would `curl http://localhost:8000` *not*
   reach a server running in container B, even if both are on the same
   Docker network and B listens on 8000?
4. If a container is published with `-p 8000:8000`, what port should
   another container on the same user-defined network use to reach it by
   name — the host port or the container port?
5. What's the difference between `-p 8000:8000` and `-p
   127.0.0.1:8000:8000`?
6. What does `host.docker.internal` resolve to, and when would you use
   it?
7. Where in Docker Desktop can you (a) click through to a container's
   published port and (b) see which network a container is on?

</details>

<details>
<summary>Show answers</summary>

1. Docker only provides built-in DNS-based service discovery on
   user-defined networks; the default `bridge` network is kept
   backward-compatible with older Docker behavior and does no name
   resolution between containers on it.
2. It publishes container port `9000` to host port `8000` — traffic to
   the host on `8000` is forwarded to `9000` inside the container. The
   format is always `host:container`.
3. `localhost` inside a container always refers to that container's own
   loopback interface, never another container's — even on the same
   network, containers don't share a loopback.
4. The container port (8000) — container-to-container traffic on a shared
   network goes directly to the port the app listens on inside the
   container, bypassing the host-side port mapping.
5. `-p 8000:8000` binds the mapping on all host interfaces (reachable
   from other devices, subject to firewall); `-p 127.0.0.1:8000:8000`
   binds only to loopback, so only the host machine itself can reach it.
6. It resolves to the host machine's own address from inside a container —
   used when a container needs to reach a service running directly on the
   Windows/WSL2 host rather than in another container.
7. In the **Containers** tab, the port link (e.g. `8000:8000`) opens the
   published port in a browser; a container's **Inspect** sub-tab shows
   its IP and the network it's attached to.

</details>

## Further reading & sources

- [Docker: Networking overview](https://docs.docker.com/network/) - the top-level guide to bridge, host, and none network drivers.
- [Docker: Bridge network driver](https://docs.docker.com/network/drivers/bridge/) - explains user-defined bridges, DNS-based service discovery, and how they differ from the default bridge.
- [Docker: Published ports and packet filtering](https://docs.docker.com/network/packet-filtering-firewalls/) - how `-p` maps host ports via NAT/iptables and how to restrict binding.
- [Docker: docker network CLI reference](https://docs.docker.com/reference/cli/docker/network/) - full reference for `create`, `inspect`, `connect`, and `rm`.
- [Docker Desktop: Explore networking features (host.docker.internal)](https://docs.docker.com/desktop/features/networking/) - documents the special host DNS name and Docker Desktop networking specifics.

## Next

Continue to [06-docker-compose](../06-docker-compose/README.md) to stop
wiring up networks and containers by hand and describe multi-container
apps declaratively.
