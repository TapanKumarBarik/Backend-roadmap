# Module 00: Elasticsearch Fundamentals

## Why this matters

In track 04 you learned to model data in a relational database and ask it
precise questions with SQL. Relational databases are superb at exactly what
they're built for: structured data, transactions, joins, strong consistency.
But there's a whole class of question they answer badly, and the moment your
product grows a search box you run straight into it.

Try this in Postgres: "find every product whose description *mentions*
running shoes, rank the best matches first, tolerate the user typing
`runing shoez`, and highlight the matching words." The naive tool is
`WHERE description LIKE '%running shoes%'`. That query (a) can't use a normal
B-tree index so it scans every row, (b) only matches the exact substring in
that exact order, (c) has no concept of "best match" — every row either
matches or doesn't, there's no ranking, and (d) has no idea `runing` was
meant to be `running`. You can bolt on Postgres full-text search
(`tsvector`/`tsquery`) and get some of this, and for modest needs you should.
But once you want real relevance ranking, typo tolerance, faceted filtering,
autocomplete, and log/analytics aggregations over hundreds of millions of
documents, you reach for a purpose-built search engine.

That engine, for most of the industry, is **Elasticsearch**. This module is
the conceptual foundation: *why* it exists, and the two or three ideas — the
inverted index, relevance scoring, shards and segments — that make everything
in the rest of this track make sense. Skipping the concepts here is the single
most common reason people find Elasticsearch behaving "magically" later. It
isn't magic; it's a small number of mechanical ideas applied consistently.

## Concepts

### What Elasticsearch is (and what it sits on top of)

Elasticsearch is a **distributed, document-oriented search and analytics
engine**. Three words worth unpacking:

- **Document-oriented**: you store JSON documents, not rows in fixed tables.
  A document is roughly analogous to a row, an **index** is roughly analogous
  to a table, and a field is roughly a column — but the analogy leaks (there
  are no joins in the SQL sense, and the same field can be stored several ways
  at once; more on that in module 01).
- **Search and analytics**: it's optimized for *finding* documents by content
  and *aggregating* over them, not for transactional bookkeeping. It is **not**
  a system of record. The canonical architecture is: your relational database
  (track 04) remains the source of truth, and you *index a copy* of the
  searchable data into Elasticsearch. If Elasticsearch loses data, you rebuild
  it from the database. Never make Elasticsearch the only home of data you
  can't afford to lose.
- **Distributed**: it's designed from the ground up to spread data across many
  machines (nodes) and keep serving if some fail. That's why the vocabulary is
  full of shards and replicas.

Under the hood, Elasticsearch is a distributed wrapper around **Apache
Lucene**, a mature Java search *library*. Lucene does the actual work of
building inverted indexes, scoring documents, and reading/writing the
on-disk data structures for a single index on a single machine. Lucene by
itself is just a library you'd embed in a program — it has no network API, no
clustering, no JSON. Elasticsearch wraps Lucene with: a REST/JSON API, a query
language (Query DSL), and — crucially — the distribution layer that shards data
across nodes and replicates it for fault tolerance. When you read that
"a shard is a Lucene index," that's literally true: each shard is one
self-contained Lucene index. Keep this relationship in your head — a
surprising amount of Elasticsearch behavior is really Lucene behavior showing
through.

### The inverted index: the one idea that makes search fast

Here is the mechanism that separates a search engine from a `LIKE '%...%'`
scan. Suppose you have three documents:

```
doc 1: "the quick brown fox"
doc 2: "the lazy brown dog"
doc 3: "quick foxes jump"
```

A relational `LIKE` scan stores these as strings and, to answer "which docs
contain `brown`?", reads *every* document and checks. That's O(number of docs).

An **inverted index** flips the data structure inside out. At index time,
Elasticsearch breaks each document's text into **terms** (tokens) and builds a
map from *term → list of documents containing it*:

```
term      → postings list (which docs, and where)
--------------------------------------------------
brown     → [doc 1, doc 2]
dog       → [doc 2]
fox       → [doc 1]
foxes     → [doc 3]
jump      → [doc 3]
lazy      → [doc 2]
quick     → [doc 1, doc 3]
the       → [doc 1, doc 2]
```

Now "which docs contain `brown`?" is a single lookup of the term `brown` — you
jump straight to `[doc 1, doc 2]` without touching the other documents. This is
why search over 100 million documents can return in milliseconds: the query
cost scales with the number of *matching* terms, not the number of documents.
It's the same reason the index at the back of a textbook lets you find every
mention of "photosynthesis" without reading the whole book — an inverted index
is exactly a book index, built automatically.

The terms in the index are the unit of matching. **A query only matches if its
terms match the terms in the index** — and both go through a text-processing
step called **analysis** (module 02) that decides what a "term" is. This is the
root of the single most common Elasticsearch confusion: you search for
`Running` and get nothing, because the indexed term was lowercased to
`running` and your query wasn't analyzed the same way. Hold that thought; it's
the payoff of module 02.

### Relevance: TF-IDF and BM25 at a conceptual level

Because a search query can match thousands of documents, the engine must rank
them — put the *most relevant* first. Relevance is a computed number, the
`_score`, and understanding roughly how it's computed demystifies why one
result beats another.

The classic intuition is **TF-IDF**, which combines two signals:

- **Term Frequency (TF)** — how often the search term appears in *this*
  document. A document that says "shoes" ten times is probably more about shoes
  than one that says it once. More is better (with diminishing returns).
- **Inverse Document Frequency (IDF)** — how *rare* the term is across the
  whole index. A match on a rare word like "photosynthesis" tells you far more
  than a match on a ubiquitous word like "the." Rarer terms carry more weight;
  common terms carry almost none.

Multiply them and you get the core idea: **a document scores high when it
contains the query's terms often (TF) and those terms are rare across the
corpus (IDF)**. A match on a distinctive term in a document that emphasizes it
ranks above a document that mentions a common term once.

Modern Elasticsearch doesn't use raw TF-IDF; it uses **BM25**, a refined
version of the same two signals. BM25 adds two important corrections:
**saturation** (the 20th occurrence of a term barely adds more than the 10th —
TF has diminishing returns instead of growing without bound) and **length
normalization** (a term appearing 5 times in a 20-word document is more
significant than 5 times in a 5,000-word document). You'll meet BM25 properly
in module 03; for now the takeaway is just: `_score` is TF-style "how much
this doc is about the term" times IDF-style "how rare/informative the term is,"
tuned so long documents and repeated words don't dominate unfairly.

```
  _score(doc, "photosynthesis") is nudged by three factors:

    TF   how often the term appears in THIS doc ──► more  = higher (saturates)
     ×
    IDF  how rare the term is across ALL docs   ──► rarer = higher
     ×
    len  short field for the same match         ──► shorter = higher
```

### Shards and replicas: how one index spans many machines

An Elasticsearch index is not one big file. It's split into **shards**, and
each shard is a full, independent Lucene index holding a subset of the
documents. Two reasons this matters:

- **Scale**: a single machine can only hold and search so much data. Splitting
  an index into, say, 5 shards lets Elasticsearch put those shards on 5
  different nodes, so both storage and query work spread across the cluster. A
  search hits every shard in parallel and the results are merged.
- **The number of primary shards is (effectively) fixed at index creation.**
  You choose it when you create the index and you can't cheaply change it
  later — you'd have to reindex into a new index. Choosing badly is a real,
  common mistake, in *both* directions. Too few shards and you can't spread a
  huge index across nodes. **Too many shards** — the far more common beginner
  error — and each shard is tiny, but every shard carries fixed overhead (its
  own Lucene structures, memory, and per-query coordination cost), so a query
  fans out to dozens of near-empty shards and the coordination overhead
  dominates. You'll see this "over-sharding" performance trap again in
  module 05. For small datasets, **one primary shard is often the right
  answer**, and that's the default in modern Elasticsearch.

```
  index "books"  (1 primary + 1 replica)      single-node cluster
  ┌─────────────┐                             ┌──────── node 1 ────────┐
  │ primary  P0 │ ─────────────────────────►  │  P0  STARTED           │
  │ replica  R0 │ ─ must live on ANOTHER node │  R0  no other node ────┼─► UNASSIGNED
  └─────────────┘                             └────────────────────────┘  → health YELLOW
```

**Replicas** are copies of a shard. A replica shard is a redundant copy of a
primary shard, kept on a *different* node. Replicas do two jobs: **fault
tolerance** (if the node holding a primary dies, a replica is promoted to
primary and no data is lost) and **read throughput** (searches can be served
by either the primary or its replicas, so more replicas means more concurrent
search capacity). Replicas *can* be changed on a live index, unlike primary
shard count. Note: on a single-node cluster (like the Docker setup you'll run
in this track), replicas can't be allocated — there's no *other* node to put
them on — so the cluster health goes **yellow**. Yellow on a single node is
normal and expected, not a problem to fix; you'll see it constantly and
module 06 explains it fully.

### Segments: why documents aren't instantly searchable, and why deletes are lazy

Inside a single shard (one Lucene index), the data is stored in **segments** —
smaller immutable sub-indexes. This detail explains two behaviors that
otherwise look like bugs:

- **Near-real-time, not real-time.** When you index a document, it isn't
  searchable the instant the API call returns. New documents accumulate in an
  in-memory buffer and become searchable only when a **refresh** flushes them
  into a new searchable segment — by default about **once per second**. So a
  document you just indexed may not appear in a search for up to a second. This
  trips people up constantly in tests ("I indexed it, why can't I find it?").
  You can force a refresh (`?refresh=true`) in tests, but you should *not* do
  that in production hot paths — it's expensive.
- **Segments are immutable; deletes and updates are lazy.** Because a segment,
  once written, is never modified, you can't edit a document in place. An
  "update" is really *index a new version + mark the old one deleted*, and a
  delete just *marks* the document as deleted (a tombstone) without removing it
  from the segment. The space is reclaimed later during **merging**, a
  background process that combines small segments into larger ones and
  physically drops the deleted docs. This is why a freshly "cleared" index can
  still show disk usage, and why heavy update/delete workloads generate merge
  activity.

### When to reach for Elasticsearch — and when not to

Elasticsearch earns its keep for:

- **Full-text search** with relevance ranking (product catalogs, documentation,
  content sites) — the `LIKE` problem done properly.
- **Log and event analytics** — ingesting huge volumes of logs/metrics and
  aggregating them (this is the "ELK/Elastic stack" you may have heard of;
  it pairs with Kibana, module 06).
- **Autocomplete / type-ahead** — suggesting completions as a user types.
- **Faceted search / aggregations** — "show counts by brand, price bucket,
  rating" alongside results, computed fast over the whole result set.

Reach for something else when:

- You need **transactions and strong consistency** (money, inventory
  decrements) — that's your relational database's job. Elasticsearch has no
  multi-document ACID transactions.
- The data is **your only copy and must never be lost** — Elasticsearch is a
  secondary index over a source of truth, not the source of truth.
- Your query needs are simple exact-key lookups — a database or key-value store
  is simpler and cheaper.

The healthy mental model for this whole track: your relational database from
track 04 stays the system of record, and Elasticsearch is a fast, denormalized,
searchable *projection* of the parts of that data users need to search.

## Command reference

You won't run many real queries in this conceptual module — the goal is to
stand up a cluster and confirm you can talk to it. But here's the reference
you'll build on for the whole track.

| Action | REST (curl) | Notes |
|---|---|---|
| Check the cluster is up | `curl localhost:9200` | Returns version/cluster info JSON |
| Cluster health | `curl localhost:9200/_cluster/health?pretty` | `status`: green/yellow/red |
| List all indices | `curl localhost:9200/_cat/indices?v` | Human-readable table |
| List nodes | `curl localhost:9200/_cat/nodes?v` | One row per node |
| List shards | `curl localhost:9200/_cat/shards?v` | Shows primary/replica placement |
| Index a document | `curl -XPOST localhost:9200/my-index/_doc -H 'Content-Type: application/json' -d '{...}'` | Auto-generates an id |
| Get a document by id | `curl localhost:9200/my-index/_doc/1` | |
| Force a refresh | `curl -XPOST localhost:9200/my-index/_refresh` | Makes recent docs searchable now |

Bring up a single-node Elasticsearch **and** Kibana with Docker Compose. Save
this as `docker-compose.yml` — you'll reuse it for the whole track:

```yaml
# docker-compose.yml — single-node Elasticsearch + Kibana for local learning
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    container_name: es
    environment:
      - discovery.type=single-node        # don't try to form a multi-node cluster
      - xpack.security.enabled=false      # no auth/TLS — LOCAL LEARNING ONLY
      - ES_JAVA_OPTS=-Xms1g -Xmx1g        # cap heap so it fits a laptop
    ports:
      - "9200:9200"
    healthcheck:
      test: ["CMD-SHELL", "curl -s http://localhost:9200 >/dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12

  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.4
    container_name: kibana
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy
```

> Security note: `xpack.security.enabled=false` disables authentication and
> TLS. That's fine for a throwaway local cluster on your laptop and keeps the
> exercises focused on search, but **never** run a production or
> internet-reachable cluster this way — an open Elasticsearch is one of the
> classic sources of public data leaks.

The Python client (`elasticsearch-py`) — install and connect:

```bash
pip install "elasticsearch>=8,<9"
```

```python
from elasticsearch import Elasticsearch

# Matches the docker-compose above (no auth, plain HTTP, localhost)
es = Elasticsearch("http://localhost:9200")

print(es.info())                       # cluster name + version
print(es.cluster.health())             # dict with 'status', 'number_of_nodes', ...
```

## Hands-on exercises

You need Docker running (from track 02 / `learn/02-docker`). All exercises use
the `docker-compose.yml` above.

### 1. Bring up the cluster

```bash
docker compose up -d
docker compose ps
```

Expected: two containers, `es` and `kibana`. Elasticsearch takes ~30-60s to
become healthy on first start; Kibana takes a minute or two more (it waits for
Elasticsearch). Watch logs with `docker compose logs -f elasticsearch` until
you see a line about the node having started.

### 2. Confirm you can talk to it

```bash
curl localhost:9200
```

Expected: a JSON blob with `"cluster_name"`, `"version": {"number": "8.13.4",
...}`, and the tagline `"You Know, for Search"`. If you get connection refused,
the container isn't healthy yet — wait and retry.

### 3. Read the cluster health and interpret the color

```bash
curl "localhost:9200/_cluster/health?pretty"
```

Expected: `"status"` is almost certainly `"yellow"`, `"number_of_nodes": 1`.
Write down *why* it's yellow before reading on. (Answer: there's one node, so
replica shards have nowhere to go — a replica can't sit on the same node as its
primary. That's expected on a single-node cluster and is not an error.)

### 4. Create an index and watch it in `_cat`

```bash
curl -XPUT "localhost:9200/books"
curl "localhost:9200/_cat/indices?v"
```

Expected: a `books` index listed with `health yellow`, `pri 1` (one primary
shard, the modern default), `rep 1` (one replica — the one that can't be
allocated, hence yellow). Note `docs.count 0`.

### 5. Index your first documents

```bash
curl -XPOST "localhost:9200/books/_doc" -H 'Content-Type: application/json' -d '{
  "title": "The Quick Brown Fox",
  "year": 2019
}'
curl -XPOST "localhost:9200/books/_doc" -H 'Content-Type: application/json' -d '{
  "title": "Lazy Dog Stories",
  "year": 2021
}'
```

Expected: each returns JSON with `"result": "created"`, an auto-generated
`"_id"`, and `"_version": 1`.

### 6. Observe near-real-time: the one-second gap

Index a document and *immediately* count — you're racing the refresh:

```bash
curl -XPOST "localhost:9200/books/_doc" -H 'Content-Type: application/json' -d '{"title":"Instant Book","year":2024}'
curl "localhost:9200/books/_count"
```

Run the `_count` a few times quickly. You may see the count *not* include the
new doc for up to ~1 second, then jump. That gap is the refresh interval — new
docs sit in a buffer until the next refresh turns them into a searchable
segment. This is "near-real-time" in action.

### 7. Force a refresh and confirm

```bash
curl -XPOST "localhost:9200/books/_refresh"
curl "localhost:9200/books/_count"
```

Expected: the count now definitely includes all indexed docs. In real code you
rarely force refreshes (it's costly); in tests you often do so results are
deterministic.

### 8. Do the same from Python

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")

es.index(index="books", document={"title": "Python and the Fox", "year": 2020})
es.indices.refresh(index="books")
print(es.count(index="books"))     # {'count': 4, ...}
print(es.cluster.health()["status"])   # 'yellow'
```

Expected: the count reflects everything indexed so far, and health prints
`yellow`.

### 9. Diagnose and fix: "I indexed it but search finds nothing"

A teammate runs this and is convinced Elasticsearch is broken:

```bash
curl -XPOST "localhost:9200/nrt-demo/_doc" -H 'Content-Type: application/json' -d '{"msg":"hello"}'
curl "localhost:9200/nrt-demo/_search?q=hello"   # returns 0 hits!
```

Reproduce it (run both lines back-to-back, fast). Explain what's happening and
give two fixes.

<details>
<summary>Answer</summary>

Nothing is broken — this is the **near-real-time refresh gap** from concept
"Segments." The document was indexed but hasn't been refreshed into a
searchable segment yet (default refresh interval ~1s), so the immediate
`_search` sees zero hits. Two fixes: (1) wait ~1 second and re-run the search —
it'll appear; (2) force it with a refresh, e.g. index with
`.../_doc?refresh=true` or call `POST /nrt-demo/_refresh` before searching.
In application code you almost always just accept the ~1s delay; only tests and
special "read your own write" cases justify forcing a refresh, because forcing
refreshes constantly destroys indexing throughput.

</details>

### 10. Tear down (or leave it running)

```bash
docker compose down            # stops and removes containers (data in the
                               # anonymous volume is discarded)
```

If you want to keep going straight into module 01, leave it up instead. You'll
use this same cluster for the entire track.

## Independent challenge

No commands given — reason it through using this module's concepts.

**Task:** Without looking anything up, predict the following and then verify
each against your running cluster with `_cat` and `_cluster/health`:

1. You create an index `logs-2026` with 3 primary shards and 1 replica on your
   **single-node** Docker cluster. What color will the cluster health be, and
   exactly how many shards will be *unassigned*, and why?
2. You then start a *second* Elasticsearch node (imagine it — or reason about
   it). What happens to the health color and the unassigned shards, and why?
3. You index 50 documents into `logs-2026`. Roughly how are they distributed
   across the 3 primary shards, and does a search have to touch all 3?

Connect this back to the "Shards and replicas" concept above — in particular,
*why* the replica shards can't be assigned on a single node, and what a replica
is actually *for*.

<details>
<summary>Hint</summary>

A replica shard must live on a *different* node than its primary (otherwise
losing that node loses both). With 3 primaries + 1 replica each you have 3
primary + 3 replica = 6 shards total; on one node the 3 primaries assign fine
(health can't be green because…) and the 3 replicas have nowhere to go
(unassigned → yellow). A search fans out to all primary shards and merges
results, so yes it touches all 3. Documents are routed to shards by a hash of
their id, so they land roughly evenly.

</details>

## Common mistakes & troubleshooting

- **Treating Elasticsearch as a system of record.** It's a secondary,
  rebuildable index over a source of truth (your database). No ACID
  transactions; design so you can always reindex from the database.
- **Panicking about yellow health on a single node.** Yellow just means
  replicas are unassigned because there's only one node. Expected. Red is the
  one to worry about (a *primary* shard is missing → actual data unavailable).
- **"I indexed it but can't find it."** Near-real-time refresh gap (~1s). Wait
  or force a refresh; don't conclude the write failed.
- **Over-sharding small indices.** Every shard has fixed overhead; many tiny
  shards is slower, not faster. For small data, one primary shard is fine.
  Primary shard count is fixed at creation — choose deliberately.
- **Expecting `LIKE`-style substring behavior.** Search matches *terms*
  produced by analysis, not raw substrings. `Running` vs `running` vs
  `runners` behave according to the analyzer, not string equality — the whole
  point of modules 01-02.
- **Running with security disabled anywhere but a throwaway local box.** Fine
  for these exercises; a serious mistake if exposed to a network.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one or two sentences, what problem does an inverted index solve, and why
   is it dramatically faster than `WHERE description LIKE '%term%'`?
2. What is the relationship between Elasticsearch and Apache Lucene? Where does
   "a shard is a Lucene index" fit in?
3. Name the two signals TF-IDF combines and, in plain English, what kind of
   document scores highest.
4. What are the two jobs a *replica* shard does, and why does a single-node
   cluster show yellow health?
5. Why isn't a document searchable the instant you index it, and what is the
   name of the process that makes it searchable?
6. Give one scenario where you should use Elasticsearch and one where you
   should *not*, with the reason for each.

<details>
<summary>Answers</summary>

1. It maps each *term* to the list of documents containing it, so answering
   "which docs contain X" is a direct lookup of X rather than reading every
   document. Cost scales with the number of matching terms, not the number of
   documents — like a book's index versus re-reading the whole book each time.
2. Lucene is the underlying Java search *library* that builds inverted indexes,
   scores, and manages on-disk data for a single index on one machine.
   Elasticsearch wraps Lucene with a JSON/REST API, the Query DSL, and the
   distribution layer (sharding + replication) across many nodes. Each
   Elasticsearch shard literally *is* one independent Lucene index.
3. Term Frequency (how often the term appears in this document) and Inverse
   Document Frequency (how rare the term is across all documents). Highest-
   scoring: a document that contains the query's terms often, where those terms
   are rare/distinctive across the corpus.
4. Fault tolerance (a copy on another node survives if the primary's node dies)
   and read throughput (searches can be served by primaries or replicas). A
   single-node cluster is yellow because a replica can't be placed on the same
   node as its primary, so replicas stay unassigned.
5. New documents sit in an in-memory buffer and only become searchable when a
   **refresh** flushes them into a new searchable segment — by default about
   once per second. Hence "near-real-time."
6. Use it for: full-text/relevance search, log analytics, autocomplete,
   faceted aggregations — things a relational `LIKE`/exact-match model does
   badly at scale. Don't use it for: transactional, strongly-consistent data
   (money/inventory) or as the sole copy of data you can't lose — that's your
   database's job, because Elasticsearch has no ACID transactions and is a
   rebuildable secondary index.

</details>

## Further reading & sources

- [Elasticsearch: What is Elasticsearch?](https://www.elastic.co/guide/en/elasticsearch/reference/current/elasticsearch-intro.html) - the official orientation on what the engine is and the problems it targets.
- [Elasticsearch: The Definitive Guide — Inverted Index](https://www.elastic.co/guide/en/elasticsearch/guide/current/inverted-index.html) - the canonical worked explanation of the data structure this module is built around.
- [Data in: documents and indices](https://www.elastic.co/guide/en/elasticsearch/reference/current/documents-indices.html) - how documents, indices, shards, and near-real-time refresh relate.
- [Practical BM25 (Part 2): The BM25 algorithm and its variables](https://www.elastic.co/blog/practical-bm25-part-2-the-bm25-algorithm-and-its-variables) - Elastic's plain-language walkthrough of TF, IDF, saturation, and length normalization.
- [Apache Lucene](https://lucene.apache.org/core/) - the underlying search library each Elasticsearch shard is an instance of.
- [Scalability and resilience: clusters, nodes, and shards](https://www.elastic.co/guide/en/elasticsearch/reference/current/scalability.html) - how sharding and replication give scale and fault tolerance.

## Next

[01-indexes-and-mappings](../01-indexes-and-mappings/README.md) — now that you
know *why* Elasticsearch exists and how it stores data conceptually, you'll
learn to define the structure of an index: field **mappings**, the pivotal
`text` vs `keyword` distinction, and the dynamic-mapping pitfalls that quietly
wreck relevance and aggregations if you let Elasticsearch guess.
