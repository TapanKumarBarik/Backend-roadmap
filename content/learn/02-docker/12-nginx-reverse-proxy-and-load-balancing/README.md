# Nginx: Reverse Proxy and Load Balancing

## Why this matters

Every deployment module so far (10, 11) has pointed traffic straight at
one container. Real production setups almost never do that: they put a
**reverse proxy** in front — something that receives the actual internet
traffic and forwards it to one or more backend containers. Nginx is the
default choice for this job, and you've already met it as a black box:
`ingress-nginx` in a Kubernetes cluster (a topic in a later track) is
just nginx, configured and run for you. This module opens that black box.
By the end you'll be able to write an nginx config from scratch to
terminate TLS, serve static files directly (never touching your app
process), and spread traffic across several backend containers.

## Concepts

### A reverse proxy sits between the internet and your app

A **forward proxy** sits in front of *clients* (e.g. a corporate proxy
that all employees' browsers go through to reach the internet). A
**reverse proxy** is the mirror image: it sits in front of *servers*,
so from the outside the proxy looks like the whole application, and the
real backend containers are never directly reachable.

```
  client (browser)
        │
        ▼
  ┌───────────────┐
  │     nginx     │  ← reverse proxy: the only thing the internet sees
  └───────────────┘
        │
        ▼
  ┌───────────────┐
  │  app container │  ← never exposed directly
  └───────────────┘
```

This buys you three things at once, all covered in this module: **TLS
termination** (nginx handles HTTPS once, your app only ever speaks plain
HTTP), **load balancing** (nginx picks one of several identical backend
containers per request), and **static-file offloading** (nginx serves
files straight off disk, never bothering your app process for them).

### `server` and `location` blocks are nginx's routing unit

An nginx config file is built from nested blocks. A `server` block
defines one virtual host (what hostname/port it answers for); `location`
blocks inside it route by URL path:

```nginx
server {
    listen 80;
    server_name example.com;

    location /api/ {
        proxy_pass http://backend;
    }

    location / {
        root /usr/share/nginx/html;
    }
}
```

Requests to `/api/...` get proxied to `backend`; everything else is
served as a static file from `/usr/share/nginx/html`. This is the same
"route by path to a different handler" idea as an API framework's
router, just one layer earlier in the request's journey.

### `proxy_pass` forwards a request and needs its headers rebuilt

`proxy_pass http://backend;` forwards the request, but by default the
backend sees *nginx's* connection, not the original client's — it
doesn't automatically know the real client IP or which host/scheme the
client originally used. The standard fix is to forward the missing
information as headers:

```nginx
location /api/ {
    proxy_pass http://backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Your app then reads `X-Forwarded-For` instead of the raw socket address
for "who is this request really from" — the same header
`backend/01-request-response-fundamentals` describes any app sitting
behind a proxy needing to trust (only from a proxy you control).

### `upstream` names a pool of backends — that's load balancing

An `upstream` block groups multiple backend addresses under one name;
`proxy_pass` then targets the pool instead of a single container, and
nginx picks one member per request:

```nginx
upstream backend {
    server app1:8000;
    server app2:8000;
    server app3:8000;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
    }
}
```

Default behavior is **round robin** (requests cycle through the list in
order). Two other built-in strategies matter:

- `least_conn;` inside the `upstream` block — sends the next request to
  whichever backend currently has the fewest open connections, better
  than round robin when requests take uneven amounts of time.
- `ip_hash;` — routes the same client IP to the same backend
  consistently, useful when a backend keeps per-client state in memory
  (session affinity / "sticky sessions") rather than in a shared store.

```
  round robin              least_conn               ip_hash
  req1 → app1              req1 → app1(0 conns)     client A → always app1
  req2 → app2              req2 → app2(0 conns)     client B → always app2
  req3 → app3              req3 → app1(1, busy)     client A → always app1
  req4 → app1              req4 → app3(0 conns)     client C → always app3
  (strict rotation)        (fewest busy wins)        (same client, same backend)
```

### TLS termination: HTTPS ends at nginx, HTTP continues inward

"Terminating" TLS means nginx is the one holding the certificate and
decrypting the HTTPS connection; traffic from nginx to your backend
containers travels as plain HTTP over the private Docker network, which
is fine because that traffic never leaves the host's internal networking
(module 05's bridge network, not the public internet).

```nginx
server {
    listen 443 ssl;
    server_name example.com;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://backend;
    }
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

The second `server` block is the standard **HTTP → HTTPS redirect**:
anything arriving on port 80 gets a `301` sending the client to the same
path over HTTPS instead.

### Static files never need to reach your app process at all

`backend/01-request-response-fundamentals` already described the
request path as client → reverse proxy → app server. For static assets
(images, CSS, a built frontend bundle), nginx can skip the second hop
entirely and serve the file straight from disk with `root`/`try_files`:

```nginx
location /static/ {
    root /usr/share/nginx/html;
    try_files $uri =404;
}
```

This is faster (no process hand-off, no application framework overhead
per file) and reduces load on your app containers, which is why static
assets are one of the first things offloaded to nginx in a real
deployment.

### `nginx -t` validates config before you reload it

Nginx will refuse to (re)start on a broken config, but you don't have to
wait for that to find out — `nginx -t` checks syntax and reports the
first error with a file and line number, the same "catch it before it's
live" habit as `docker build`'s layer-by-layer failures.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `nginx -t` | Tests a config file for syntax errors without starting/reloading | `docker exec proxy nginx -t` |
| `nginx -s reload` | Reloads config without dropping existing connections | `docker exec proxy nginx -s reload` |
| `docker exec <container> nginx -t` | Runs the config test inside a running nginx container | `docker exec proxy nginx -t` |
| `docker compose up -d --scale <service>=<N>` | Starts N replicas of one Compose service (for load-balancing exercises) | `docker compose up -d --scale app=3` |
| `curl -I <url>` | Fetches only response headers — useful for confirming redirects/proxy headers | `curl -I http://localhost:8080` |
| `curl -k <url>` | Fetches over HTTPS while skipping certificate validation (for self-signed certs) | `curl -k https://localhost:8443` |

Flag breakdown for `docker compose up -d --scale app=3`:

- `--scale app=3` — starts 3 containers for the `app` service instead of
  the 1 implied by `compose.yaml`, so nginx's `upstream` pool actually
  has multiple real backends to balance across.

Flag breakdown for `curl -k https://localhost:8443`:

- `-k` — skips certificate hostname/trust validation, needed because the
  exercises below use a self-signed certificate that no real certificate
  authority has vouched for.

## Hands-on exercises

1. **(WSL2 Ubuntu terminal)** Build a tiny backend app to proxy to,
   reusing the pattern from earlier modules:
   ```bash
   mkdir -p ~/learn-docker/nginx-lab/app && cd ~/learn-docker/nginx-lab/app

   cat > app.py <<'EOF'
   import os
   from flask import Flask

   app = Flask(__name__)

   @app.get("/api/hello")
   def hello():
       return {"message": "hello from the backend", "pid": os.getpid()}

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

   docker build -t nginxlab-app .
   ```

2. **(WSL2 Ubuntu terminal)** Write an nginx config that reverse-proxies
   to that app, and a static `index.html` it can serve directly:
   ```bash
   cd ~/learn-docker/nginx-lab
   mkdir -p static

   cat > static/index.html <<'EOF'
   <h1>Served directly by nginx — never touched the Flask app</h1>
   EOF

   cat > nginx.conf <<'EOF'
   server {
       listen 80;

       location /api/ {
           proxy_pass http://app:8000/api/;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location / {
           root /usr/share/nginx/html;
           try_files $uri =404;
       }
   }
   EOF

   cat > compose.yaml <<'EOF'
   services:
     app:
       image: nginxlab-app
     proxy:
       image: nginx:1.27
       ports:
         - "8080:80"
       volumes:
         - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
         - ./static:/usr/share/nginx/html:ro
       depends_on:
         - app
   EOF

   docker compose up -d
   ```

3. **(WSL2 Ubuntu terminal)** Confirm both paths work — the proxied API
   and the directly-served static file:
   ```bash
   curl http://localhost:8080/
   curl http://localhost:8080/api/hello
   ```
   Expect the static HTML from the first `curl`, and the Flask JSON
   response (with a `pid`) from the second — proving nginx served one
   itself and forwarded the other.

4. **(WSL2 Ubuntu terminal)** Validate config before making it live —
   deliberately break it first:
   ```bash
   cp nginx.conf nginx.conf.bak
   sed -i 's/listen 80;/listen 80/' nginx.conf   # removes the semicolon
   docker compose cp nginx.conf proxy:/etc/nginx/conf.d/default.conf
   docker exec $(docker compose ps -q proxy) nginx -t
   ```
   Expect `nginx -t` to fail and print the exact line number of the
   missing semicolon. Restore the good config:
   ```bash
   cp nginx.conf.bak nginx.conf
   docker compose cp nginx.conf proxy:/etc/nginx/conf.d/default.conf
   docker exec $(docker compose ps -q proxy) nginx -t
   docker exec $(docker compose ps -q proxy) nginx -s reload
   ```
   Expect `nginx -t` to pass this time (`syntax is ok` / `test is
   successful`), and the reload to apply without dropping the container.

5. **(WSL2 Ubuntu terminal)** Turn on load balancing — scale the backend
   and switch the config from a single target to an `upstream` pool:
   ```bash
   cat > nginx.conf <<'EOF'
   upstream backend {
       server app:8000;
   }

   server {
       listen 80;

       location /api/ {
           proxy_pass http://backend/api/;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location / {
           root /usr/share/nginx/html;
           try_files $uri =404;
       }
   }
   EOF

   docker compose up -d --scale app=3 --no-recreate
   ```
   Compose's default networking means `app` now resolves to multiple
   containers, but a plain `upstream backend { server app:8000; }` with
   one line only balances if you list each replica explicitly, since
   Compose doesn't auto-populate `upstream` blocks. List all three by
   their Compose-assigned hostnames:
   ```bash
   docker compose ps --format '{{.Name}}'
   ```
   Note the three container names (e.g. `nginx-lab-app-1`,
   `nginx-lab-app-2`, `nginx-lab-app-3`), then update the `upstream`
   block to list all three explicitly:
   ```bash
   cat > nginx.conf <<'EOF'
   upstream backend {
       server nginx-lab-app-1:8000;
       server nginx-lab-app-2:8000;
       server nginx-lab-app-3:8000;
   }

   server {
       listen 80;

       location /api/ {
           proxy_pass http://backend/api/;
           proxy_set_header Host $host;
       }

       location / {
           root /usr/share/nginx/html;
           try_files $uri =404;
       }
   }
   EOF

   docker compose cp nginx.conf proxy:/etc/nginx/conf.d/default.conf
   docker exec $(docker compose ps -q proxy) nginx -s reload
   ```
   (Substitute your actual container names from the `ps` output above if
   they differ from the example names.)

6. **(WSL2 Ubuntu terminal)** Prove round-robin balancing by watching the
   `pid` field rotate across repeated requests:
   ```bash
   for i in 1 2 3 4 5 6; do curl -s http://localhost:8080/api/hello; echo; done
   ```
   Expect the `pid` value to cycle through three distinct numbers in
   order, repeating — one per backend container, confirming requests are
   actually being spread across all three rather than always hitting one.

7. **(WSL2 Ubuntu terminal)** Add TLS termination with a self-signed
   certificate:
   ```bash
   mkdir -p certs
   openssl req -x509 -nodes -newkey rsa:2048 \
     -keyout certs/privkey.pem -out certs/fullchain.pem \
     -days 365 -subj "/CN=localhost"

   cat >> nginx.conf <<'EOF'

   server {
       listen 443 ssl;
       ssl_certificate     /etc/nginx/certs/fullchain.pem;
       ssl_certificate_key /etc/nginx/certs/privkey.pem;

       location /api/ {
           proxy_pass http://backend/api/;
           proxy_set_header Host $host;
       }

       location / {
           root /usr/share/nginx/html;
           try_files $uri =404;
       }
   }
   EOF
   ```
   Update `compose.yaml` to publish 443 and mount the certs directory,
   then recreate:
   ```bash
   sed -i 's|"8080:80"|"8080:80"\n        - "8443:443"|' compose.yaml
   sed -i 's|./static:/usr/share/nginx/html:ro|./static:/usr/share/nginx/html:ro\n        - ./certs:/etc/nginx/certs:ro|' compose.yaml
   docker compose up -d --force-recreate proxy
   curl -k https://localhost:8443/api/hello
   ```
   Expect the same JSON response, now served over HTTPS; `-k` is
   required because the certificate is self-signed, not issued by a
   trusted authority.

8. **(WSL2 Ubuntu terminal)** Clean up:
   ```bash
   docker compose down
   docker rmi nginxlab-app
   cd ~ && rm -rf ~/learn-docker/nginx-lab
   ```

## Independent challenge

No commands given here — figure it out yourself using what you know from
this module and earlier ones.

**Task:** Build a Compose stack with two *different* backend
applications (not replicas of the same one) — say one that returns JSON
and one that returns plain text — and write an nginx config that routes
`/service-a/` to the first and `/service-b/` to the second, each behind
its own `upstream` pool with at least two replicas. Add the HTTP → HTTPS
redirect from the Concepts section so port 80 always forwards to 443. Prove
the routing is correct (each path reaches the right service), prove each
pool actually load-balances (vary a response field to show which replica
answered, the same way the `pid` field did in this module), and prove the
redirect works (`curl -I` on port 80 should show a `301` to the `https://`
URL).

<details>
<summary>Stuck? One hint</summary>

Two `location` blocks, each `proxy_pass`ing to its own `upstream` block;
list every replica's Compose-assigned container name inside the matching
`upstream`; the redirect is the same bare `server { listen 80; return
301 https://$host$request_uri; }` block shown in the Concepts section,
just with no `location` blocks of its own.

</details>

## Common mistakes & troubleshooting

- **Forgetting `proxy_set_header Host $host;`.** Without it, your
  backend app sees nginx's own request, and anything the app does with
  the `Host` header (redirects, generated links) breaks or points at the
  wrong hostname.
- **Assuming Compose scaling auto-populates `upstream` blocks.**
  `docker compose up --scale app=3` creates three containers, but a
  hand-written `upstream backend { server app:8000; }` still only names
  one hostname unless you either list every replica explicitly (as in
  exercise 5) or use Compose's internal DNS round robin (a single
  `server app:8000;` entry does get load-balanced by Docker's embedded
  DNS across scaled replicas at the *network* level in newer Compose
  versions — but relying on that instead of nginx's `upstream` gives you
  none of nginx's balancing-method choices like `least_conn`).
- **Editing `nginx.conf` and expecting the change to apply
  immediately.** Nginx reads its config once at startup/reload; you must
  either `docker exec ... nginx -s reload` (or recreate the container)
  for a config change to take effect — the same "config changes need
  a restart or reload" rule as most long-running server processes.
- **Skipping `nginx -t` before a reload.** A syntax error in a reload
  attempt can leave nginx running the *old* config while logging an
  error, which looks like "nothing happened" rather than an obvious
  failure — always test first.
- **Confusing TLS termination with end-to-end encryption.** Terminating
  TLS at nginx means traffic *inside* your Docker network (nginx →
  backend) is plain HTTP. That's normal and fine for traffic that never
  leaves the host, but it is not the same guarantee as encryption all
  the way to the application process — don't describe it as "the whole
  path is encrypted" in a design discussion.
- **Only testing with `curl` from inside the same container/network.**
  A config can look correct from `docker exec` but still fail for real
  external clients if the wrong port is published or the container's
  network isn't attached the way you assumed — always test from outside
  (a real `curl` against `localhost:<published-port>`, as this module's
  exercises do) rather than only from inside the proxy container.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the difference between a forward proxy and a reverse proxy?
2. Why do you need `proxy_set_header X-Forwarded-For ...;` if you want
   your backend app to know the real client IP address?
3. What does an `upstream` block let you do that a single `proxy_pass
   http://one-host:port;` doesn't?
4. When would you choose `ip_hash` over the default round-robin balancing
   method, and what's the tradeoff?
5. What does "TLS termination" actually mean, and what protocol carries
   traffic onward from nginx to your backend container?
6. Why does serving a static file directly through nginx's `root`/
   `try_files` outperform proxying that same request to your app server?
7. What's the point of running `nginx -t` before `nginx -s reload`?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. A forward proxy sits in front of clients, forwarding their outbound
   requests to the wider internet (e.g. a corporate proxy). A reverse
   proxy sits in front of servers, so the outside world only ever talks
   to the proxy and never reaches the real backend directly.
2. Without it, the backend only sees the TCP connection from nginx
   itself, so `remote_addr`-style lookups on the backend would report
   nginx's own container IP for every request. `X-Forwarded-For` (along
   with `X-Real-IP`) carries the original client's address forward as an
   explicit header the backend can read instead.
3. It lets you name a pool of two or more backend addresses under one
   name and have nginx distribute requests across all of them
   (round-robin by default, or `least_conn`/`ip_hash`), instead of every
   request always going to the exact same single host.
4. `ip_hash` when a backend keeps per-client state in its own memory
   (session affinity) rather than a shared store, so the same client
   must keep landing on the same backend. The tradeoff is uneven load if
   client IPs aren't evenly distributed, and it breaks if a client's
   apparent IP changes mid-session (e.g. behind a mobile carrier's NAT).
5. TLS termination means nginx is the endpoint that holds the
   certificate and decrypts the HTTPS connection; from nginx onward to
   the backend container, traffic normally continues as plain HTTP over
   the internal Docker network.
6. Static-file serving lets nginx read straight from disk and send bytes
   back, with no process hand-off to an application framework and no
   application-level request handling overhead for that file — cheaper
   per request and it keeps that load off your app containers entirely.
7. `nginx -t` validates the config's syntax and reports the exact file
   and line of any error *before* you apply it, so a broken config is
   caught immediately instead of silently failing to take effect (or
   crashing nginx) during a reload.

</details>

## Further reading & sources

- [Nginx: Reverse proxy guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/) - the official walkthrough this module's `proxy_pass`/header setup is based on.
- [Nginx: Load balancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/) - round robin, `least_conn`, and `ip_hash` covered in more depth, straight from the source.
- [Nginx: Configuring HTTPS servers](https://nginx.org/en/docs/http/configuring_https_servers.html) - TLS termination configuration reference, including certificate/key directives used in this module.
- [Mozilla: proxy headers (X-Forwarded-For, X-Forwarded-Proto)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For) - what each forwarded header means and how a backend should treat it.
- [Docker Hub: official nginx image](https://hub.docker.com/_/nginx) - the image used throughout this module's exercises, including its default config file locations.

## Next

Continue to [13-capstone-project](../13-capstone-project/README.md) to
combine everything from this track — a multi-stage build, Compose, ACR,
nginx in front of it, and a real Azure deployment — into one project you
design yourself.
</content>
