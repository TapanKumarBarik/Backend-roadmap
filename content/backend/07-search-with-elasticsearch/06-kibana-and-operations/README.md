# Module 06: Kibana and Operations

## Why this matters

You've spent five modules talking to Elasticsearch entirely through curl and
Python — the right way to *build* a search feature. But you also need to
*operate* one, and operating means two things curl alone does badly: **seeing**
your data and queries interactively, and **keeping the cluster healthy over
time**. That's this module.

**Kibana** is the official UI for Elasticsearch. It's where you'll explore data
without writing a client, run and iterate on Query DSL in a console with
autocomplete, and build the dashboards that turn a pile of indexed documents
into something a human (or a stakeholder) can read at a glance. It's also the
front end for the operational concerns: **index lifecycle management (ILM)** for
time-series data that would otherwise grow without bound, **aliases** that let
you swap indexes underneath running application code (the missing piece from the
module-01 reindex story), and **cluster health monitoring** so "why is it
yellow/red" stops being a mystery. This is the module that takes you from
"I wrote a query" to "I run this in production."

## Concepts

### Kibana, and the two tools you'll live in

Kibana is a web app (from your Docker Compose, at `http://localhost:5601`) that
talks to Elasticsearch's REST API on your behalf. It has many features; two
matter most while learning:

```
  ┌──────────── Kibana  (localhost:5601) ─────────────┐
  │  Dev Tools · Discover · Lens · Dashboards · ILM UI │
  └────────────────────────┬───────────────────────────┘
                           │  REST / JSON — the SAME API as curl
                   ┌───────▼────────┐
                   │  Elasticsearch │  (localhost:9200)
                   └────────────────┘
```

- **Dev Tools → Console.** This is the single most useful tool in Kibana for a
  developer. It's a two-pane editor: you type Query DSL on the left (with
  **autocomplete** for endpoints and query keywords, and syntax checking) and
  see the JSON response on the right. Every `curl` in this track can be typed in
  Console as `GET /shop/_search { ... }` — no `-H` headers, no quoting hell,
  and you can click the wrench to convert to/from curl. **Use Console for all
  interactive query development;** save curl for scripts. It also has a history
  and lets you run one request with Ctrl/Cmd+Enter.
- **Discover.** A point-and-click data browser over a **Data View** (Kibana's
  saved definition of which indexes to look at and which field is the time
  field). You pick a data view, get a searchable, filterable table of documents
  with a time-range picker and a field sidebar showing top values per field.
  It's how you eyeball "what's actually in this index" and do ad-hoc filtering
  without writing DSL. For time-based data it shows a document-count histogram
  over time at the top.

Before Discover or dashboards can show anything, you create a **Data View**
(older Kibana called these "index patterns"): a name/pattern like `shop*` plus,
for time-series data, which field is the `@timestamp`. A data view can span many
indexes via a wildcard — which is exactly how you query "all the daily log
indexes at once."

### Building a visualization and a dashboard

A **visualization** is a saved chart backed by an Elasticsearch aggregation —
and this is the payoff of module 04: **every Kibana chart is an aggregation with
a picture on top.** A bar chart of "products per brand" is a `terms`
aggregation on `brand`; a line chart of "documents over time" is a
`date_histogram`; a metric showing "average price" is an `avg` aggregation. When
you understand aggregations, Kibana visualizations are just a UI for choosing
the bucket (X axis / split) and metric (Y axis / value).

The modern builder is **Lens** (drag-and-drop): you pick a chart type, drag a
field to an axis, and Kibana infers a sensible aggregation (drag `brand` to the
X axis → it proposes a `terms` agg; drag `price` to Y → it proposes `avg` or
`sum`, which you can change). A **dashboard** is a saved collection of these
visualizations laid out on one page, with a shared time range and filter bar, so
selecting a time window or clicking a bar filters the whole board. That
click-to-filter interactivity is why dashboards beat static reports.

The mental model to carry: **when a chart looks wrong, debug the aggregation
behind it.** A "brand" bar chart with a bucket per *word* means you charted a
`text` field instead of its `.keyword` — the exact module-01/04 mistake,
surfacing in the UI.

### Aliases: the indirection that makes reindexing invisible

Module 01 left a thread hanging: to change a mapping you reindex into a new
index — but then application code pointing at the old index name breaks. The fix
is an **alias**: a pointer/second name for one or more indexes. Application code
queries the *alias*, never a concrete index name, and you repoint the alias
atomically when you swap indexes:

```
POST /_aliases
{ "actions": [
  { "remove": { "index": "products_v1", "alias": "products" } },
  { "add":    { "index": "products_v2", "alias": "products" } }
]}
```

Because that repoint is **atomic**, there's no moment where `products` points at
nothing — a zero-downtime mapping migration. Aliases also let you:

- **Fan out reads** across several indexes (an alias over `logs-2026-*`).
- **Split reads and writes**: a `write_index` designation marks which index new
  documents go to (essential for the rollover pattern below).
- **Attach a filter** so an alias exposes only a subset of an index (e.g. a
  per-tenant view).

Rule to adopt permanently: **application code should talk to an alias, not a
raw index name.** It costs nothing up front and buys you painless reindexing
forever.

### Index Lifecycle Management (ILM) for data that grows forever

Search over a product catalog is bounded — a few hundred thousand documents that
change slowly. But **logs, metrics, and events grow without limit**, and you
can't keep one ever-growing index (it becomes a giant unsplittable shard, module
05) or hand-manage thousands of daily indexes. **ILM** automates the lifecycle
of time-series indexes through phases:

- **Hot** — actively written and queried; on fast storage.
- **Warm** — no longer written, still queried occasionally; can be shrunk /
  force-merged / moved to cheaper nodes.
- **Cold / Frozen** — rarely queried old data, minimal resources.
- **Delete** — removed after a retention period (e.g. delete logs older than 90
  days).

```
  index age ─────────────────────────────────────────►
  ┌───────┐   ┌───────┐   ┌───────────┐   ┌────────┐
  │  HOT  │─► │ WARM  │─► │ COLD/     │─► │ DELETE │
  │ write │   │ query │   │ FROZEN    │   │ removed│
  │+query │   │ only  │   │ rare query│   │        │
  └───────┘   └───────┘   └───────────┘   └────────┘
       ▲ rollover at max size/age/docs starts a fresh hot index
```

ILM works together with **rollover**: writes go to an alias, and when the
current backing index hits a size/age/doc-count condition (e.g. 50GB or 1 day),
ILM creates a fresh index and repoints the write alias to it — so each backing
index stays a sensible size. In modern Elasticsearch this is packaged as a
**data stream**: you write to the data stream name, and it manages a hidden
sequence of backing indexes with an ILM policy automatically. The concept to
retain: **you don't manually manage log indexes; you define a policy (roll over
at size X, delete after Y days) and Elasticsearch enforces it.** This is what
keeps a logging cluster from filling its disk.

### Cluster health: reading green / yellow / red for real

Module 00 told you yellow-on-a-single-node is normal. Now the full picture,
because in operations you must diagnose health precisely:

- **Green** — all primary *and* replica shards are assigned. Full redundancy.
- **Yellow** — all **primary** shards are assigned (so all data is available and
  fully queryable), but one or more **replicas** are not. You haven't lost data
  or availability; you've lost redundancy. Causes: a single-node cluster (no
  place for replicas — expected), a node down, or not enough nodes for the
  configured replica count.
- **Red** — at least one **primary** shard is unassigned, meaning **some data is
  missing/unavailable** and some queries return partial or failed results. This
  is the real emergency.

The key operational distinction: **yellow is about redundancy; red is about
availability.** A yellow single-node dev cluster is fine forever; a red
production cluster is an incident. When you see red, the tools are
`GET /_cluster/health?level=indices` (which index is red),
`GET /_cat/shards?v` (which shard is unassigned), and — the crucial one —
`GET /_cluster/allocation/explain`, which tells you *why* a shard can't be
assigned (disk watermark exceeded, no matching node, allocation filtering,
corrupted shard). Other everyday operational reads: `GET /_cat/nodes?v`,
`GET /_cat/indices?v`, and disk usage via `GET /_cat/allocation?v` — because a
**disk watermark** (default: stop allocating at 85% full, and go read-only at
95%) is one of the most common real causes of a cluster suddenly refusing
writes or going yellow/red. If writes start failing, check disk *first*.

## Command reference

Most of these you'll also click in Kibana; knowing the API underneath is what
lets you automate and debug.

| Task | API / Kibana | Notes |
|---|---|---|
| Interactive query editor | Kibana → Dev Tools → Console | Autocomplete; `GET /idx/_search {}` |
| Browse data | Kibana → Discover (needs a Data View) | Field sidebar, time picker |
| Build charts | Kibana → Visualize/Lens → Dashboard | Charts are aggregations |
| Create/repoint alias | `POST /_aliases` (actions) | Atomic swap; app talks to alias |
| List aliases | `GET /_cat/aliases?v` | |
| Create ILM policy | `PUT /_ilm/policy/<name>` | Hot/warm/cold/delete phases |
| Create data stream template | `PUT /_index_template/<name>` (+ILM) | Auto-rollover backing indexes |
| Cluster health | `GET /_cluster/health?pretty` | green/yellow/red + counts |
| Health per index | `GET /_cluster/health?level=indices` | Which index is red/yellow |
| Why is a shard unassigned | `GET /_cluster/allocation/explain` | The red-cluster diagnostic |
| Nodes / disk | `GET /_cat/nodes?v`, `GET /_cat/allocation?v` | Disk watermark checks |

Aliases for a zero-downtime reindex (Console syntax):

```
# products_v2 already built and reindexed (module 01). Swap the alias atomically:
POST /_aliases
{ "actions": [
    { "remove": { "index": "products_v1", "alias": "products" } },
    { "add":    { "index": "products_v2", "alias": "products" } }
]}
```

A minimal ILM policy (roll over at 1 day or 5GB, delete after 30 days):

```
PUT /_ilm/policy/logs-policy
{ "policy": { "phases": {
    "hot":    { "actions": { "rollover": { "max_age": "1d", "max_primary_shard_size": "5gb" } } },
    "delete": { "min_age": "30d", "actions": { "delete": {} } }
}}}
```

Python — operational reads and an alias swap:

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")

h = es.cluster.health()
print(h["status"], h["number_of_nodes"], h["unassigned_shards"])

# atomic alias swap for a zero-downtime reindex
es.indices.update_aliases(actions=[
    {"remove": {"index": "products_v1", "alias": "products"}},
    {"add":    {"index": "products_v2", "alias": "products"}},
])
# application code always queries the alias:
print(es.search(index="products", query={"match_all": {}})["hits"]["total"])
```

## Hands-on exercises

You need both containers up (`docker compose up -d`), Kibana included. Kibana
takes a minute or two after Elasticsearch is healthy; browse to
`http://localhost:5601`.

### 1. Run a query in Dev Tools Console

In Kibana, open **Dev Tools** (wrench/hammer icon, or the left menu →
Management → Dev Tools). In the left pane type:

```
GET /shop/_search
{
  "size": 0,
  "aggs": { "by_brand": { "terms": { "field": "brand" } } }
}
```

Put the cursor in the request and press **Ctrl+Enter** (Cmd+Enter on macOS).
Expected: the right pane shows the aggregation buckets — the same result as the
curl from module 04, but with autocomplete as you typed and no shell quoting.
Note the little wrench menu → "Copy as cURL." Console is now your query
scratchpad.

### 2. Create a Data View and explore in Discover

Go to the left menu → **Discover**. If prompted, **create a data view**: name it
`shop`, index pattern `shop`, and since `shop` has a `created` date field, pick
`created` as the timestamp field (or "I don't want to use the time filter" if it
complains about the tiny date range). Save.

Expected: Discover shows the `shop` documents as a table. Try the field sidebar
on the left — click `brand` and it shows top values with percentages
(a `terms` agg under the hood). Type `running` in the search bar; the table
filters. This is code-free exploration.

### 3. Build a bar chart (a `terms` agg with a picture)

Left menu → **Visualize Library** (or **Dashboard → Create → New visualization
→ Lens**). Choose the `shop` data view. Drag `brand` to the horizontal axis and
`Records`/`Count` to the vertical axis (Lens proposes a bar chart).

Expected: a bar per brand with counts — visually identical information to
exercise 1's aggregation. Change the vertical axis from Count to
`Average of price` and watch it become the "avg price per brand" chart from
module 04's nested aggregation. Confirm to yourself: **the chart is the
aggregation.**

### 4. Diagnose and fix: a chart bucketed by word instead of value

In Lens, try to put the **`name`** field (the `text` field) on the X axis of a
bar chart.

Expected: Kibana either refuses (offering only `name.keyword` if it exists) or,
if `name` had fielddata, buckets by individual *words* (`trail`, `running`,
`shoes` as separate bars) — nonsense for a "products by name" chart. Explain
what's happening and fix it.

<details>
<summary>Answer</summary>

`name` is an analyzed `text` field, tokenized into terms — so a `terms`
aggregation on it (which is what the bar chart's X axis is) buckets by
individual tokens, not by whole product names, and it's disabled/expensive by
default anyway. This is the module-01/04 lesson surfacing in the UI. Fix: chart
the **`name.keyword`** sub-field (Kibana usually offers only the keyword variant
for aggregatable string fields) so each whole name is one bucket. The rule from
module 04 — "aggregate on `keyword`, not `text`" — is exactly what makes a
Kibana chart correct.

</details>

### 5. Assemble a dashboard

Create a **Dashboard**, then **Add** the visualizations you built (brand bar
chart, avg-price metric, a date histogram over `created` if the dates
cooperate). Arrange them, set a time range if using a time field, and **Save**.

Expected: one page summarizing the catalog. Click a bar in the brand chart —
the whole dashboard filters to that brand (interactivity). This is the
deliverable shape you'll build for real in the capstone.

### 6. Set up an alias and query through it

In Console:

```
POST /_aliases
{ "actions": [ { "add": { "index": "shop", "alias": "catalog" } } ] }

GET /_cat/aliases?v
GET /catalog/_search
{ "size": 1 }
```

Expected: `catalog` now points at `shop`, and searching the alias returns the
same data. From now on, imagine your application always queries `catalog`, never
`shop` directly.

### 7. Zero-downtime reindex via alias swap

Simulate a mapping migration end to end:

```
PUT /shop_v2
{ "mappings": { "properties": {
    "name":{"type":"text","fields":{"raw":{"type":"keyword"}}},
    "brand":{"type":"keyword"},"category":{"type":"keyword"},
    "price":{"type":"scaled_float","scaling_factor":100},
    "rating":{"type":"float"},"in_stock":{"type":"boolean"},
    "created":{"type":"date"} }}}

POST /_reindex
{ "source": { "index": "shop" }, "dest": { "index": "shop_v2" } }

POST /_aliases
{ "actions": [
    { "remove": { "index": "shop", "alias": "catalog" } },
    { "add":    { "index": "shop_v2", "alias": "catalog" } }
]}

GET /catalog/_count
```

Expected: `catalog` now transparently points at `shop_v2`; any application
querying `catalog` never noticed the switch. This is the production answer to
"how do I change a mapping without downtime," completing the module-01 story.

### 8. Create an ILM policy and a data stream

```
PUT /_ilm/policy/logs-policy
{ "policy": { "phases": {
    "hot":    { "actions": { "rollover": { "max_age": "1d", "max_docs": 1000 } } },
    "delete": { "min_age": "7d", "actions": { "delete": {} } }
}}}

PUT /_index_template/logs-template
{ "index_patterns": ["logs-demo*"],
  "data_stream": {},
  "template": { "settings": { "index.lifecycle.name": "logs-policy" } } }

PUT /_data_stream/logs-demo
GET /_data_stream/logs-demo
```

Expected: a data stream `logs-demo` exists with a backing index (something like
`.ds-logs-demo-...-000001`). Index a few documents into `logs-demo` (with a
`@timestamp`) and observe that you write to the *stream* name while
Elasticsearch manages the hidden backing indexes — the auto-rollover pattern.
In Kibana → Stack Management → Index Lifecycle Policies you can see the policy;
under Data Streams you can see the stream. (At `max_docs: 1000` you can force a
rollover by indexing enough docs, or `POST /logs-demo/_rollover` manually.)

### 9. Diagnose and fix: read a yellow (and reason about a red) cluster

```
GET /_cluster/health?pretty
GET /_cluster/health?level=indices
GET /_cat/shards?v
```

Your single-node cluster is yellow. Identify exactly which shards are
unassigned and why, then answer: what would you check *first* if this were
**red** instead, and what's the one everyday cause that turns a healthy cluster
red or read-only without any node failing?

<details>
<summary>Answer</summary>

Yellow because the **replica** shards are unassigned — a replica can't be placed
on the same node as its primary and there's only one node, so every index with
`number_of_replicas ≥ 1` has unassigned replicas. `_cat/shards` shows those rows
as `UNASSIGNED` with reason `CLUSTER_RECOVERED`/`INDEX_CREATED`; all `p`
(primary) rows are `STARTED`, so all data is available — hence yellow, not red.
Setting replicas to 0 (single-node dev) would make it green. If it were **red**,
a *primary* shard is unassigned → some data is unavailable; check first with
`GET /_cluster/allocation/explain` to learn *why* the primary can't allocate.
The everyday cause that turns a cluster read-only/red without a node dying is
the **disk watermark**: past ~85% full Elasticsearch stops allocating shards,
and past ~95% (`flood_stage`) it flips indices to read-only — so failing writes
or stuck allocation almost always means "check disk usage first"
(`GET /_cat/allocation?v`).

</details>

### 10. Do an operational read from Python

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")
h = es.cluster.health(level="indices")
print("cluster:", h["status"])
for name, idx in h["indices"].items():
    print(f"  {name}: {idx['status']} (unassigned={idx['unassigned_shards']})")
print(es.cat.aliases(format="json"))
```

Expected: prints each index's health color and unassigned shard count, and lists
your aliases (`catalog`, etc.). Operational monitoring is just these same API
reads on a schedule (the real thing pairs with track 08's observability).

## Independent challenge

No click-path or code given.

**Task:** Deliver a small operational package for the `shop`/`catalog` data,
end to end:

1. A Kibana **dashboard** with at least: product count by brand, average price
   by category, and a metric showing total in-stock products. State, for each
   chart, which module-04 aggregation it corresponds to.
2. An **alias** the "application" uses, plus a demonstrated **zero-downtime**
   swap to a reindexed copy with an improved mapping — proving the dashboard
   still works against the alias afterward without reconfiguration.
3. A written answer: your cluster is suddenly **red** and writes are failing.
   List, in order, the exact API calls you'd run to diagnose it and the two most
   likely root causes given a single-node dev box.

Reach back to module 04 (every chart is an aggregation — name them), module 01
(why the reindex/alias dance is the only way to change a mapping), and module 00
(the shard/replica model that explains the health colors).

<details>
<summary>Hint</summary>

For (1): "count by brand" = `terms` on `brand`; "avg price by category" =
`terms` on `category` with a nested `avg` on `price`; "total in-stock" = a
`filter` (or `term in_stock=true`) with a `value_count`/`Count` metric. Build
them in Lens on a `catalog` data view (point the data view at the alias so it
survives the swap). For (2): reuse exercise 7's reindex + `POST /_aliases`
atomic remove/add, then reload the dashboard. For (3): `GET
/_cluster/health?level=indices` → find the red index → `GET /_cat/shards?v` →
find the unassigned primary → `GET /_cluster/allocation/explain`; the two usual
single-node culprits are disk watermark (`_cat/allocation?v` shows >85-95% full)
and a corrupted/failed shard with no replica to recover from.

</details>

## Common mistakes & troubleshooting

- **Confusing yellow with an emergency.** Yellow = replicas unassigned
  (redundancy lost, data still fully available); red = a primary unassigned
  (data unavailable — the real incident). Don't page anyone over a yellow
  single-node dev cluster.
- **Charting a `text` field.** A bar chart on an analyzed field buckets by
  word (or is refused). Chart the `.keyword` sub-field — the module-04 rule in
  the UI.
- **Application code pointing at a raw index name.** Then every reindex/mapping
  change is a breaking change. Always query an **alias** so swaps are invisible
  and atomic.
- **Hand-managing time-series indexes.** One ever-growing index becomes a giant
  shard; thousands of tiny daily ones over-shard. Use ILM + rollover / data
  streams and let a policy manage size and retention.
- **Ignoring disk watermarks.** At ~85% full allocation stops; at ~95% indices
  go read-only. Failing writes or unassignable shards with no node down almost
  always means disk — check `_cat/allocation` first.
- **Not using `allocation/explain` on a red cluster.** It tells you the exact
  reason a shard won't assign; guessing wastes an outage.
- **Editing Data Views/timestamps carelessly in Kibana.** Discover shows
  nothing if the time range excludes your data or the wrong field is set as the
  time field — check the time picker before concluding the index is empty.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is a Kibana **Data View** (index pattern), and why does Discover show
   nothing even when the underlying index has documents — name the two settings
   to check first?
2. What is the practical difference between a **yellow** and a **red** cluster,
   and which one actually warrants paging someone?
3. Why should application code query an **alias** rather than a raw index name?
   What does that make possible during a reindex?
4. What problem does **ILM** (with rollover / data streams) solve for
   time-series data, and what are the two failure modes of hand-managing those
   indexes yourself?
5. What are the disk **watermarks** at roughly 85% and 95%, and why is disk the
   first thing to check when writes fail or shards won't assign with no node
   down?
6. On a red cluster, which API tells you the exact reason a shard won't assign,
   and why is that better than guessing during an outage?

<details>
<summary>Answers</summary>

1. A Data View is the Kibana object that tells Kibana which index (or pattern
   of indices, e.g. `logs-*`) to read and which field is the time field.
   Discover can show nothing because (a) the **time range** in the picker
   excludes your data, or (b) the wrong (or no) **time field** was configured
   on the Data View. Check the time picker and the time field before concluding
   the index is empty.
2. **Yellow** means replica shards are unassigned — redundancy is reduced but
   all data is still fully available and searchable. **Red** means a *primary*
   shard is unassigned — some data is actually unavailable. Red is the real
   incident worth paging over; a yellow single-node dev cluster is normal.
3. Querying an alias decouples application code from the physical index name, so
   a reindex or mapping change (create new index → reindex → repoint the alias)
   is an invisible, atomic swap rather than a breaking change to every caller.
4. ILM automates size- and age-based rollover and retention for continuously
   growing time-series data. Hand-managing it fails two ways: one ever-growing
   index becomes a single giant shard (unmanageable, slow), while thousands of
   tiny per-day indices over-shard the cluster with fixed per-shard overhead.
   A policy plus rollover/data streams keeps shard sizes and retention sane.
5. At the ~85% **high watermark** Elasticsearch stops allocating new shards to
   that node; at the ~95% **flood-stage watermark** it forces affected indices
   to read-only to protect the node. So failing writes or shards that won't
   assign with every node still up almost always mean disk — check
   `_cat/allocation` first.
6. The **cluster allocation explain** API (`_cluster/allocation/explain`)
   reports the specific reason a given shard cannot be allocated. During an
   outage that's far faster and safer than guessing, because it points you
   directly at the cause (disk, no valid node, corrupted shard, etc.).

</details>

## Further reading & sources

- [Kibana Guide](https://www.elastic.co/guide/en/kibana/current/index.html) - the official Kibana documentation home.
- [Run Elasticsearch API requests (Dev Tools Console)](https://www.elastic.co/guide/en/kibana/current/console-kibana.html) - the interactive query editor you develop in.
- [Create a data view](https://www.elastic.co/guide/en/kibana/current/data-views.html) - how Discover and visualizations know which indices and time field to use.
- [Aliases](https://www.elastic.co/guide/en/elasticsearch/reference/current/aliases.html) - the indirection that makes zero-downtime reindexing and rollover possible.
- [ILM: Manage the index lifecycle](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-lifecycle-management.html) - hot/warm/cold/delete phases and rollover for time-series data.
- [Fix a red or yellow cluster: allocation explain](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster-allocation-explain.html) - the diagnostic that tells you why a shard won't allocate, plus disk-watermark causes.

## Next

[07-capstone-project](../07-capstone-project/README.md) — you now have every
piece: mappings, full-text and relevance-tuned search, fuzzy matching,
aggregations/facets, scalable pagination and bulk loading, and Kibana
operations. The capstone puts them together into a complete, realistic search
feature — with no solution code provided.
