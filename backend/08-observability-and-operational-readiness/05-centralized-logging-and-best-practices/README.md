# Module 05: Centralized Logging and Best Practices

## Why this matters

Module 04 got your app *producing* clean, structured, correctly-leveled logs on
stdout. This module is about what happens the moment that stream leaves the
process — and it's where logging stops being an app concern and becomes an
*operations* concern. The reason is brutally simple: in a modern deployment you
cannot read logs where they're written. Your app runs as three, or thirty,
replicas across a cluster; each is an **ephemeral container** that can be killed
and rescheduled at any moment, taking its local filesystem with it. The one
process that logged the error you're chasing was reaped twenty minutes ago.
There is no box to SSH into. "Just tail the log file" is a single-server habit
that dies the instant you scale past one replica or deploy to Kubernetes (the
`learn/03-kubernetes` world).

The fix is **centralized logging**: every process ships its stdout stream to a
single aggregation system where all logs from all services and all replicas land
in one searchable place. That's the difference between "grep across thirty pods
by hand, hoping the right one is still alive" and "type one query and see every
line from every service for the last week." But centralization only pays off if
the logs arriving are *disciplined* — consistently structured, correlated by a
shared id, sensible in volume, and free of secrets. A firehose of unstructured,
uncorrelated, secret-leaking logs is just as useless centralized as it was
local, only now it's expensive and a compliance liability too.

So this module has two halves. First, the **pipeline**: how a stdout stream
becomes a queryable index (the ELK/Loki-style architecture), and why the app's
only job is to emit to stdout. Second, the **best practices at scale** that make
centralized logs actually usable — correlation IDs that follow a request across
services (the direct setup for tracing in module 07), sampling and level
discipline to control volume and cost, consistent event schemas to keep queries
stable, and the full sensitive-data and retention rules that module 04 promised
were coming. Get this right and every alert (module 08) and every incident
investigation has a solid foundation to stand on.

## Concepts

### Why centralize: the aggregation problem

A single-server app has one log stream and one place to read it. Everything
about operating logs — tailing, grepping, rotating — assumes that world. Modern
deployments break every assumption in it:

- **Many replicas.** A request that failed hit *one* of N identical processes.
  Which one? Without central logs you're grepping N places to find the single
  line that matters.
- **Ephemeral instances.** Containers are cattle, not pets: killed on deploy,
  rescheduled on node failure, scaled down when traffic drops. When a container
  dies, its local logs die with it. The error from the pod that OOM-killed
  itself is *gone* if it only ever wrote to that pod's filesystem.
- **Multiple services.** One user action fans out across an API service, a
  worker, an auth service. The story of that action is scattered across several
  processes' logs, interleaved with thousands of unrelated requests.
- **Humans can't be everywhere.** You cannot watch thirty terminals. You need
  one pane of glass.

**Centralized logging** solves all four: every process ships its logs to a
central store, and you query *that* — filtered by service, replica, time range,
level, or any field — from one UI. The failed request is one query
(`request_id=abc`) instead of a manual sweep. A dead container's logs survive
because they were shipped *before* it died. The cross-service story reassembles
because every service ships to the same place with a shared correlation id. This
is not a nice-to-have at scale; it's the only way logging works at all past one
box.

### The log pipeline: from stdout to a searchable index

Centralized logging is a **pipeline** with a few well-defined stages. Learn the
stages, and every stack (ELK, Loki, Datadog, CloudWatch, Splunk) is the same
shape with different parts:

1. **Emit.** Your app writes structured JSON to **stdout/stderr** — nothing
   more. (Module 04's `PrintLoggerFactory` + `JSONRenderer`.) The app does *not*
   ship, rotate, or store; that's the platform's job (factor XI, module 10).
2. **Collect.** A **log agent** running on each node/host captures the stdout
   streams of the containers there. Examples: **Promtail** (for Loki),
   **Filebeat/Fluent Bit/Fluentd** (for ELK), or the platform's built-in
   collector (Docker's logging driver, Kubernetes' node logging). The agent
   tails the container runtime's captured stream — it does *not* require your app
   to know anything about it.
3. **Transport & process.** The agent forwards lines, often through a buffer or
   pipeline that can parse, enrich (add `pod`, `namespace`, `node` labels),
   filter, and batch. In ELK this is often **Logstash**; in Loki, Promtail does
   light labelling; heavier stacks use a queue (Kafka) as a shock absorber.
4. **Store & index.** A datastore ingests and indexes the logs so they're
   queryable. **Elasticsearch** (the "E" in ELK) indexes *every field* for rich
   full-text and field search. **Loki** takes a deliberately cheaper approach: it
   indexes only a small set of **labels** (service, level, pod) and stores the
   log body compressed, so it's far cheaper but you filter by label then grep
   within.
5. **Query & visualize.** A UI queries the store: **Kibana** (for
   Elasticsearch) or **Grafana** (for Loki). This is where you type
   `service=api level=error request_id=abc` and read the results.

```
[your app] --stdout JSON--> [log agent] --> [transport/parse] --> [store+index] --> [query UI]
 emit only    (Promtail/       (Logstash/       (Elasticsearch/     (Kibana/
              Fluent Bit)      Loki ingester)     Loki)              Grafana)
```

The two archetypes worth knowing by name:

- **ELK / EFK** (Elasticsearch + Logstash/Fluentd + Kibana): index-everything,
  powerful arbitrary queries and aggregations, heavier and more expensive to run
  and store.
- **Loki + Promtail + Grafana** ("Prometheus, but for logs"): index-labels-only,
  much cheaper at scale, pairs naturally with Prometheus metrics (module 06) in
  the same Grafana. The trade is less rich full-text querying.

The key insight for *you the app author*: your responsibility ends at
**"structured JSON on stdout."** Which stack sits downstream is an ops decision
and can change without touching your code — *provided* your logs are structured
and consistent. That's the whole reason module 04 hammered structure so hard.

### Correlation IDs: following one request across services

Centralized logs from many services all land together — which means one
request's lines are now interleaved with thousands of others from a dozen
services. The thing that lets you pull *one request's story* back out of that
haystack is a **correlation id** (also called a request id or, once you add
tracing in module 07, a trace id): a single unique id, generated once at the
edge, attached to every log line, and **propagated to every downstream service**
the request touches.

The mechanics:

1. **Generate or accept at the edge.** The first service to see a request either
   reads an incoming `X-Request-ID` header (if a gateway/upstream set one) or
   generates a fresh UUID. Bind it to the log context (module 04's
   `bind_contextvars`) so every line in this service carries it.
2. **Propagate downstream.** When this service calls another service (HTTP,
   queue message, RPC), it **passes the id along** — as an `X-Request-ID` header
   on the outbound call, or a field in the queue message. The downstream service
   reads it and binds it too, instead of generating a new one.
3. **Result:** every log line, in every service, for that one request, shares
   one id. In your central UI, `request_id=3f9a...` reconstructs the entire
   cross-service journey in timestamp order — *this* is the payoff of
   centralization plus discipline together.

```python
# outbound: propagate the current request id to the next service
import httpx, structlog

async def call_billing(payload: dict):
    rid = structlog.contextvars.get_contextvars().get("request_id")
    async with httpx.AsyncClient() as client:
        # pass the id downstream so billing's logs share it
        return await client.post("http://billing/charge", json=payload,
                                 headers={"X-Request-ID": rid})
```

The failure mode to avoid: each service generating its *own* id. Then the API
logs say `req-1`, billing says `req-2`, and you've lost the thread between them —
you can see each service's half of the story but not that they're the same
request. Generate once at the edge; propagate everywhere. (This exact
propagation, formalized with a standard header format and a *span* per hop, is
what distributed tracing in module 07 automates — a correlation id is tracing's
manual ancestor.)

### Controlling volume: levels, sampling, and cost at scale

Centralized logging has a property local logging didn't: **volume costs money
and can hurt you.** Every line is ingested, indexed, transported, and stored —
and at scale (tens of thousands of requests per second) naive logging produces
terabytes per day, which is expensive to store, slow to query, and can even take
down your logging pipeline (a logging outage during an incident is a special
kind of miserable). Controlling volume is a first-class operational skill:

- **Level thresholds are your primary volume knob** (module 04). Prod runs at
  `INFO` or `WARNING`; `DEBUG` is off by default. The ability to *temporarily*
  raise a service to `DEBUG` via config (module 02) to chase a live issue, then
  drop it back, is exactly why levels exist. Never ship `DEBUG` on by default in
  prod.
- **Sampling** keeps a representative *fraction* of high-volume, low-value logs
  instead of all of them. If a hot endpoint logs a successful `request_end` at
  `INFO` 50,000 times a second, you don't need all 50,000 — keep 1% and you
  still see the pattern at 1/100th the cost. The rule: **sample the boring,
  keep every error.** Never sample `ERROR`/`WARNING` — those are rare and each
  one matters. Sample only high-frequency success/info lines.
- **Log the event, not the loop.** A line *inside* a loop over 10,000 items is
  10,000 lines; log once with a count (`log.info("processed_batch",
  count=10000)`) instead. Per-item logging is the most common accidental
  firehose.
- **Cardinality discipline** (crucial for Loki/metrics-style systems): keep the
  set of *label* values bounded. A label like `user_id` with millions of values
  explodes the index; `user_id` belongs as a *log field* (searchable in the
  body) not as an indexed *label*. High-cardinality data goes in the line;
  low-cardinality dimensions (service, level, env, endpoint-*template*) are
  labels.

The mindset: every line has a cost, so each one should earn its place. This is
the same discipline that makes alerting sane (module 08) — noise is expensive
whether it's logs or pages.

### Sensitive data and retention: the full rules

Module 04 introduced the "never log secrets" rule; centralization is where it
becomes a serious, enforced discipline, because now your logs are a **single
high-value store** aggregating sensitive fragments from every service, retained
for weeks, accessible to many people. A leaked secret or PII record in central
logs is a genuine breach with regulatory weight (GDPR, PCI-DSS, HIPAA depending
on your data).

The rules, in full:

- **Never log secrets.** Passwords, API keys, tokens, session cookies, full
  `Authorization` headers, private keys. `SecretStr` (module 03) is your passive
  guard; a redaction processor is your active one (below).
- **Minimize PII.** Log the *identifier* (`user_id`), not the person (full name,
  email, home address) unless you have a concrete, lawful need and a retention
  plan. Never log full payment card numbers (a PCI violation), government ids,
  or health data. When in doubt, log the id and look the rest up in a properly
  access-controlled system when you actually need it.
- **Redact defensively, at the pipeline edge.** Don't rely only on every
  developer remembering — add a **structlog processor** that scrubs known
  sensitive keys (`password`, `token`, `authorization`, `card_number`) from
  every event before it's rendered, so an accidental
  `log.info("req", **body)` can't leak. Defense in depth: `SecretStr` in the
  config layer *and* a redaction processor in the logging layer.
- **Retention has a lifecycle.** Central logs are not kept forever — that's both
  costly and a liability (data you don't have can't leak). Set a **retention
  policy**: hot storage for recent logs (days–weeks) for fast querying, then
  either delete or roll to cheap cold storage, with a hard maximum driven by
  cost and legal/compliance requirements. Elasticsearch does this with **ILM**
  (Index Lifecycle Management: hot → warm → cold → delete); Loki with per-tenant
  retention. As the app author you don't configure retention, but you must know
  it exists and that "keep everything forever" is the wrong default.

```python
# a redaction processor: scrub sensitive keys before rendering
_SENSITIVE = {"password", "token", "authorization", "api_key", "card_number", "secret"}

def redact_sensitive(logger, method_name, event_dict):
    for key in list(event_dict):
        if key.lower() in _SENSITIVE:
            event_dict[key] = "***REDACTED***"
    return event_dict

# add it EARLY in the processor chain (module 04's configure), before the renderer
```

### Structured logging best practices at scale

With logs centralized and correlated, a few disciplines separate a log store you
can actually query from one that's technically-structured-but-still-useless:

- **Stable, low-cardinality event names.** The event name (module 04's first
  positional arg) is your primary grouping key. Use a small, stable vocabulary
  of `snake_case` names (`order_placed`, `payment_failed`, `cache_miss`). Never
  interpolate values into the event name (`f"order {id} placed"`) — that makes
  every event unique and destroys the ability to count/group by event.
- **Consistent field names across services.** If one service logs `user_id` and
  another logs `userId` and a third logs `uid`, you can't query across them.
  Agree on a **shared field vocabulary** (`user_id`, `request_id`, `duration_ms`,
  `status`) so cross-service queries work. This is a team convention worth
  writing down.
- **Always include the context triplet:** `service`, `environment`, and
  `request_id` on every line (bound once, via context/processors), so any line
  can be traced to *which app, which env, which request*.
- **Log outcomes with metrics-shaped fields.** `duration_ms`, `status`,
  `rows_affected`, `retry_count` as typed fields — so you can aggregate them in
  the log UI (average latency by endpoint) and they line up with the metrics
  you'll emit in module 06.
- **One event per significant thing, at the right grain.** Not per loop
  iteration, not per trivial function call — per meaningful business/operational
  event. Right grain plus stable names plus consistent fields is what makes the
  central store a queryable dataset rather than a text dump.

## Command reference

| Tool / pattern | Layer | Purpose |
|---|---|---|
| stdout JSON (`JSONRenderer`) | app | The only thing your app should do — emit structured events |
| Promtail / Fluent Bit / Filebeat | agent | Collect container stdout on each node and ship it |
| Logstash / Fluentd | transport | Parse, enrich, filter, and buffer log streams |
| Elasticsearch | store | Index every field; rich queries and aggregations (ELK) |
| Loki | store | Index labels only; cheap, pairs with Prometheus (module 06) |
| Kibana / Grafana | UI | Query and visualize the central store |
| `X-Request-ID` header | app | Carry/propagate the correlation id across services |
| structlog redaction processor | app | Scrub sensitive keys before rendering |
| ILM / retention policy | store | Age logs out (hot → warm → cold → delete) |

**Propagating a correlation id (FastAPI middleware, accept-or-generate):**

```python
import uuid, structlog
from fastapi import FastAPI, Request

app = FastAPI()
log = structlog.get_logger()

@app.middleware("http")
async def correlation(request: Request, call_next):
    # accept an upstream id if present (from a gateway/other service), else make one
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=rid, service="api", environment="prod",
    )
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid   # echo it back for the client/next hop
    return response
```

**Sampling the boring, keeping every error (a structlog processor):**

```python
import random
import structlog

def sample_info(logger, method_name, event_dict):
    # keep 100% of warning/error/critical; keep ~1% of debug/info
    level = event_dict.get("level", "info")
    if level in ("warning", "error", "critical"):
        return event_dict
    if random.random() < 0.01:          # 1% sample of the boring lines
        event_dict["sampled"] = True
        return event_dict
    raise structlog.DropEvent          # drop this line entirely
```

**A minimal Loki + Promtail + Grafana stack (docker-compose, for the exercises):**

```yaml
services:
  loki:
    image: grafana/loki:2.9.0
    ports: ["3100:3100"]
  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - ./promtail.yaml:/etc/promtail/config.yaml
    command: -config.file=/etc/promtail/config.yaml
  grafana:
    image: grafana/grafana:10.2.0
    ports: ["3000:3000"]
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
```

**Emit to stdout, never to files.** Your app opens no log file, configures no
rotation. `PrintLoggerFactory` (module 04) writes to stdout; the platform
captures and ships it. Writing files inside a container fights the pipeline and
doesn't survive the container.

## Hands-on exercises

Reuse your `logging-fundamentals` project (module 04). You'll extend its
structlog config and, for the pipeline exercises, run the compose stack above.

### 1. Add a redaction processor and prove it scrubs secrets

Add the `redact_sensitive` processor early in your `configure_logging` chain
(before the renderer). Then deliberately try to leak a secret:

```python
log.info("login_attempt", username="ada", password="hunter2", token="abc123")
```

Expected: the rendered line shows `password="***REDACTED***"` and
`token="***REDACTED***"` while `username="ada"` survives. You've built the
active guard that catches the careless log call `SecretStr` alone wouldn't.

### 2. Propagate a correlation id across two services

Run two tiny FastAPI apps: `api` on :8000 and `billing` on :8001. In `api`, add
the correlation middleware and a route that calls `billing` with `httpx`,
passing `X-Request-ID`. In `billing`, add the *same* middleware (accept-or-
generate) and log a line.

Hit `api`. Expected: both services' logs for that request carry the **same**
`request_id`. Now remove the header propagation from `api`'s outbound call and
retry: `billing` generates its own id, and the thread between the two services'
logs is broken. That broken state is what you're preventing.

### 3. See the format is stack-agnostic

With `JSONRenderer` active, pipe your app's stdout into `jq`:

```bash
python app.py 2>&1 | jq 'select(.level=="error")'
```

Expected: `jq` filters your JSON logs by field with zero parsing — the same
thing Elasticsearch/Loki do at scale. This proves the payoff of structure:
*any* JSON-aware tool can query your logs. Try
`jq 'select(.request_id=="...")'` to reconstruct one request.

### 4. Ship logs to Loki and query in Grafana

Bring up the compose stack. Run your app in a container so Promtail captures its
stdout. Open Grafana (:3000), add Loki (`http://loki:3100`) as a data source,
and run a query like `{container="app"} | json | level="error"`.

Expected: your app's structured logs appear in Grafana, filterable by the JSON
fields. You've now run the whole pipeline end to end: stdout → Promtail → Loki →
Grafana. Note you never configured your *app* to talk to Loki — it only wrote to
stdout.

### 5. Sample the boring, keep every error

Add the `sample_info` processor. Emit 1,000 `INFO` lines in a loop and 5 `ERROR`
lines:

```python
for i in range(1000):
    log.info("request_end", i=i, status=200)
for i in range(5):
    log.error("payment_failed", order_id=i)
```

Expected: roughly 10 of the 1,000 info lines survive (1%), but **all 5** errors
appear. Change the loop to log at `ERROR` and watch all 1,000 survive — proving
you must never sample errors. This is volume control without losing what matters.

### 6. Kill the container and prove central logs survive

With the Loki stack running, generate some logs from your containerized app,
then `docker kill` the app container. Query Grafana for the logs from *before*
the kill.

Expected: the logs are still there in Loki even though the container (and its
local filesystem) is gone. This is the core value proposition made concrete —
shipped-before-death logs survive the ephemeral container. Contrast:
`docker logs <dead-container>` after `docker rm` returns nothing.

### 7. Log the batch, not the loop

You're processing a 10,000-item import and someone logs inside the loop:

```python
for item in items:            # 10,000 items
    process(item)
    log.info("item_processed", item_id=item.id)   # 10,000 log lines!
```

Rewrite it to emit meaningful volume: one line at start, one at end with a
count, and only log *inside* the loop on failure.

<details>
<summary>One good rewrite</summary>

```python
log.info("import_started", total=len(items))
failed = 0
for item in items:
    try:
        process(item)
    except Exception:
        failed += 1
        log.exception("item_failed", item_id=item.id)   # only failures, individually
log.info("import_finished", total=len(items), failed=failed)
```

Two lines for the happy path plus one per *failure* — you keep the signal
(which items failed) and drop 9,998 useless success lines. That's the difference
between a $50/day and a $5,000/day log bill at scale, and a query that returns in
a second versus a minute.

</details>

### 8. Diagnose and fix: useless central logs

Three services ship to a shared Loki, and ops is miserable: "we can't follow a
request across services, half our queries time out from the volume, `user_id`
queries are impossibly slow, and legal found emails in the logs." Here's a
representative service's setup. Fix every root cause.

```python
# service A
@app.middleware("http")
async def mw(request, call_next):
    structlog.contextvars.bind_contextvars(reqId=str(uuid.uuid4()))  # (1)
    return await call_next(request)

@app.post("/checkout")
async def checkout(order: Order):
    log.info(f"checkout for {order.user_email}")          # (2)
    for line in order.lines:                               # 200 lines/order
        log.info("line", sku=line.sku, price=line.price)  # (3)
    resp = await httpx.post("http://ship/create", json=order.dict())  # (4)
    log.debug("shipping_response", body=resp.text)        # (5)
    return {"ok": True}
```

<details>
<summary>Solution</summary>

**(1) — inconsistent field name + not propagated + never cleared.** The id field
is `reqId` here but likely `request_id` elsewhere, so cross-service queries can't
join on one name — agree on `request_id` everywhere. It's generated fresh (never
accepts an upstream id) and never passed to the `ship` service (see 4), so the
request can't be followed across services. And it's never `clear_contextvars()`'d,
so ids leak between requests on a reused worker. Fix: accept-or-generate a
`request_id`, clear at the start, and propagate it downstream.

**(2) — PII + unstructured + unstable event name.** Logs the user's **email**
(PII in central storage — the legal complaint) inside an interpolated string
(unqueryable, and every message is unique so you can't group/count checkouts).
Fix: `log.info("checkout_started", user_id=order.user_id)` — an id not the
email, a stable event name, a field not a sentence. Add a redaction processor so
`user_email` is scrubbed even if someone slips.

**(3) — per-item firehose.** 200 lines per order at `INFO` is the volume that's
timing out queries and running up the bill. Fix: log once —
`log.info("checkout_lines", count=len(order.lines))` — and only log individual
lines on failure.

**(4) — no propagation.** The outbound call to `ship` doesn't pass
`X-Request-ID`, so `ship`'s logs are disconnected from this request. Fix: pass
`headers={"X-Request-ID": rid}`.

**(5) — full response body at DEBUG (but is DEBUG on in prod?) + potential
secrets.** Logging a whole response body bloats logs and may contain sensitive
data; and if `DEBUG` is enabled in prod this fires on every checkout. Fix: log
the `status_code` and maybe a shipment id, never the whole body; keep `DEBUG`
off in prod.

Root causes, all one theme: **centralized logs are only as good as the
discipline of what's shipped.** Consistent field names + propagated correlation
id (follow a request), bounded volume (don't time out), ids-not-PII + redaction
(don't leak), and outcomes-not-bodies. Fix these five and all four ops
complaints dissolve together.

</details>

## Independent challenge

No code given. Take the fully-logged service you built in **module 04's
independent challenge** and make it *centralization-ready and multi-service*.
Stand up a second service it calls (a "billing" or "notifications" stub). Then:
(1) implement accept-or-generate correlation-id middleware in *both* services and
propagate the id on the outbound call, so one `request_id` spans both services'
logs; (2) add a redaction processor so a deliberate `log.info("dump",
**request_body)` cannot leak a secret or PII; (3) apply volume discipline — pick
one high-frequency success log and sample it, and find one accidental per-loop
log and collapse it; and (4) run both services in containers behind the Loki +
Promtail + Grafana stack and prove, in Grafana, that a single `request_id` query
returns the *complete* cross-service story of one request in time order — while a
secret you tried to log shows up redacted. Reach back to **module 02**: the log
level and environment for both services must come from config, and flipping one
service to `DEBUG` via config (without redeploying the other) must work.

<details>
<summary>Hint</summary>

The cross-service correlation hinges on two things being true at once: both
services run the *same* accept-or-generate middleware (module 04's
`bind_contextvars` for the local half), and the caller copies the current id
onto the outbound request's `X-Request-ID` header (this module's propagation
half). Read the id back out of the context with
`structlog.contextvars.get_contextvars().get("request_id")` right before the
`httpx` call. For the Grafana proof, a LogQL query like
`{job=~"api|billing"} | json | request_id="<the id>"` across both jobs, sorted by
time, *is* the reconstructed story — screenshot it. For the "flip one to DEBUG"
requirement, the level is `make_filtering_bound_logger(settings.log_level)` from
module 04, and `settings.log_level` is per-service config (module 02), so the two
services' verbosity is independent.

</details>

## Common mistakes & troubleshooting

- **Writing/rotating log files in the app or container.** Fights the pipeline
  and dies with the container. Emit JSON to stdout; let the agent ship it.
- **No correlation id, or a per-service one.** Without a single id generated at
  the edge and *propagated*, you can't follow a request across services. Accept-
  or-generate at the edge; pass it on every outbound call.
- **Inconsistent field names across services** (`user_id` vs `userId` vs `uid`).
  Cross-service queries break. Agree on a shared field vocabulary.
- **Per-loop / per-item logging.** The most common accidental firehose — 10,000
  lines where one with a count would do. Log the batch and the failures.
- **Never sampling, or sampling errors.** No sampling means ruinous volume;
  sampling errors means missing the rare thing that matters. Sample the boring
  `INFO`, keep every `WARNING`/`ERROR`.
- **High-cardinality labels** (`user_id` as a Loki label / index dimension).
  Explodes the index. High-cardinality data belongs in the log *body* as a
  field; labels stay low-cardinality (service, level, env).
- **Logging PII or secrets into central storage.** A retained, aggregated,
  widely-accessible breach. Log ids not people; add a redaction processor as
  defense in depth alongside `SecretStr`.
- **Assuming logs are kept forever (or forgetting they aren't).** Retention is a
  policy (hot → warm → cold → delete). Know it exists; don't design as if last
  year's logs are one query away, and don't hoard sensitive data indefinitely.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give two concrete reasons why "just tail the log file" stops working the
   moment you deploy more than one replica or move to containers.
2. Name the five stages of a log pipeline (emit → … → query), and state the one
   stage your *application* is responsible for.
3. What is a correlation id, and what are the two things you must do with it
   (one at the edge, one on every outbound call) for it to actually let you
   follow a request across services?
4. You have a hot endpoint logging a successful `request_end` 50,000×/second and
   the occasional `payment_failed`. How do you cut log volume without losing
   what matters — and what must you *never* sample?
5. Give two distinct defenses that together keep secrets out of central logs,
   naming the module-03 tool for one of them.
6. Why is retention a required policy for central logs rather than "keep
   everything," in both cost and risk terms?

<details>
<summary>Answers</summary>

1. (a) **Many replicas:** a failed request hit one of N identical processes, so
   the line you need is on one box among many — you'd have to grep them all. (b)
   **Ephemeral containers:** a container's local logs die with it, so the logs
   from a crashed/OOM-killed/redeployed instance are simply gone unless they were
   *shipped* elsewhere first. (Also: multiple services scatter one request's
   story across processes.)
2. **Emit → Collect → Transport/process → Store/index → Query/visualize.** The
   app is responsible only for **emit** — writing structured JSON to
   stdout/stderr. Everything downstream (agent, transport, store, UI) is the
   platform's job, which is why the app must never write its own files.
3. A correlation/request id is a single unique id identifying one request across
   every service and log line it produces. You must (1) **accept-or-generate it
   at the edge** and bind it to the log context so every local line carries it,
   and (2) **propagate it on every outbound call** (e.g. `X-Request-ID` header /
   message field) so downstream services bind the *same* id instead of making
   their own.
4. **Sample** the high-frequency boring line — keep, say, 1% of successful
   `request_end` lines (you still see the pattern) — and log the batch not the
   loop. You must **never sample `WARNING`/`ERROR`/`CRITICAL`**: they're rare and
   each one may be the thing you needed, so keep 100% of them.
5. (a) **`SecretStr` (module 03)** — a passive guard that renders as `**********`
   even if accidentally logged. (b) A **redaction processor** in the structlog
   chain that scrubs known sensitive keys (`password`, `token`, `authorization`,
   …) from every event before rendering — active defense in depth so a careless
   `log.info(**body)` can't leak.
6. **Cost:** central logs are ingested, indexed, and stored; keeping everything
   forever is prohibitively expensive and slows queries. **Risk:** retained
   sensitive data is a standing breach/compliance liability — data you no longer
   have can't leak. So logs age through a lifecycle (hot → warm → cold → delete)
   with a hard maximum driven by cost and legal requirements.

</details>

## Cumulative review

Closed-book. This covers modules 00-05. Write each answer before expanding — and
if one exposes a gap, go redo that module's exercises rather than just reading
the answer.

1. (00) A background job calls a flaky third-party API inside a bare
   `try/except: pass`. Name what's wrong with the *swallowing* and what should
   happen instead across three axes: what the job does, what gets logged and at
   what level (module 04), and how you'd later *see* it happened once logs are
   centralized (module 05).
2. (01) An endpoint returns a raw stack trace with a `500` when a downstream call
   fails. State the two separate problems (leaking internals; and what a good
   response should contain instead), and how a `request_id` ties the safe client
   response back to the full server-side log.
3. (02+03) You need a `DATABASE_URL` and a `STRIPE_KEY` in your app. For each,
   say where it should come from, what type it should be in your `Settings`, and
   what must be true so neither ever appears in a log line or an error response.
4. (04) Explain why `log.info(f"user {uid} logged in")` is worse than
   `log.info("user_login", user_id=uid)` on *three* distinct axes that only
   fully bite once logs are centralized across many services.
5. (05) A request fails somewhere across three services and you have exactly one
   piece of information: a `request_id` from the client's error response. Walk
   through, concretely, how you find the root cause — and name every earlier-
   module discipline that had to already be in place for that to work.
6. (00+04+05) Distinguish, with an example each, when a situation should be
   logged at `WARNING` vs `ERROR`, why getting this wrong makes centralized logs
   *and* future alerts (module 08) worse, and how sampling must treat the two
   differently.

<details>
<summary>Answers</summary>

1. **Swallowing (00):** `except: pass` makes a real failure invisible — the job
   reports success it didn't achieve, and you can't diagnose or alert. Instead:
   the job should let transient failures **retry** (or fail loudly), not silently
   continue. **Logging (04):** log the failure at `ERROR` with `log.exception`
   (traceback) and structured fields (`job_id`, `error_type`) — a handled-and-
   retried transient could be `WARNING`, an exhausted-retries failure is `ERROR`.
   **Centralized (05):** because it's structured JSON on stdout shipped to the
   central store, you later query `event=job_failed` across all workers and see
   every occurrence, correlated by `request_id`/`job_id` — impossible if it was
   swallowed or `print`ed.
2. Problem one: **leaking internals (01)** — a stack trace exposes framework,
   file paths, and logic to the client, a security/UX failure. Problem two: it's
   the wrong *shape* — a good `5xx` response is a generic, safe message plus a
   `request_id`. The `request_id` is the bridge: the client (or their bug report)
   carries the id, and you query the central logs for that id to get the *full*
   traceback and context server-side — safe outside, complete inside.
3. **`DATABASE_URL`:** from an environment variable/secret store (12-factor, not
   hardcoded), typed as a URL/`SecretStr`-wrapped value in `Settings`, injected
   at startup. **`STRIPE_KEY`:** from a secret store/env, typed as **`SecretStr`**
   specifically. For neither to leak: use `SecretStr` (renders `**********`), add
   a redaction processor (05), never interpolate them into messages, and never
   echo config into error responses (01).
4. (a) **Unqueryable:** the f-string buries `uid` in prose, so you can't filter
   `user_id=…` across the central store. (b) **Unaggregatable / high-cardinality
   event:** every message string is unique, so you can't count "how many logins"
   or group by event — and as a Loki label the unique messages would explode the
   index. (c) **Inconsistent across services:** free-text phrasing varies per
   service, so there's no shared field to join on; `user_login` + `user_id` gives
   a stable event name and a consistent field every service can share.
5. Query the central store (05) for `request_id=<id>` across all services, sorted
   by time — this returns every line of that one request from every service in
   order, so you read the story to the failing line and its `log.exception`
   traceback. For that to work, these had to already be true: the id was
   **generated at the edge and propagated** on every outbound call (05); every
   service emits **structured JSON to stdout** that the pipeline shipped (04/05);
   the failure was **logged at `ERROR` with a traceback**, not swallowed (00/04);
   the client got the id back in a **safe error response** (01); and no secret/PII
   in those lines forced redaction (03/05).
6. **`WARNING`:** a handled, still-working situation — a retry that eventually
   succeeded, a cache miss served from the DB (graceful degradation, module 00).
   **`ERROR`:** an operation actually failed and a user/task was affected — an
   exhausted retry, an unhandled exception. Getting it wrong (logging normal
   things at `ERROR`) floods the central store with false errors, making real
   ones un-findable, and — since alerts (08) fire on `ERROR` — directly causes
   alert fatigue. Sampling must **keep 100% of `WARNING`/`ERROR`** (rare,
   important) and **sample only high-volume `INFO`** — so mislabeling a routine
   event as `ERROR` also defeats your volume control by making it un-sampleable.

</details>

## Next

[06-monitoring-and-metrics](../06-monitoring-and-metrics/README.md) — logs tell
you *what happened* in detail, one event at a time, but they're expensive to
aggregate for questions like "what's our error *rate* right now?" or "is p99
latency climbing?". The next module adds the second pillar of observability:
**metrics** — cheap, always-on numeric time series (counters, gauges,
histograms) that answer "how much / how many / how fast" at a glance, and how to
instrument a FastAPI app with `prometheus-client`.
