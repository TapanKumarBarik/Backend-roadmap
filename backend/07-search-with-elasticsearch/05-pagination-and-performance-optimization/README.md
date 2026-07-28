# Module 05: Pagination and Performance Optimization

## Why this matters

Everything so far worked because your indexes had a handful of documents. In
production you have millions, and three things that were invisible at small
scale become the difference between a snappy search and a cluster on fire:
**how you paginate**, **how many shards you chose**, and **how you load and
query data**. This is the module where Elasticsearch stops being a toy and you
learn the failure modes that page on-call engineers at 3am.

Deep pagination is the classic one. `from=10000&size=10` looks innocent and
works fine on page one; on page 1,000 it can bring a cluster to its knees, and
the reason is structural, not a config you forgot. Over-sharding (module 00's
warning, now made concrete) silently taxes every query. Indexing documents one
at a time when you should bulk-load wastes hours and hammers the cluster.
And a single leading-wildcard query can scan millions of terms. None of these
throw errors — they just make everything slow — so you have to *know* them.
This module is the operational maturity that separates "I can write a query"
from "I can run a search system."

## Concepts

### Why `from`/`size` deep pagination breaks down

The obvious way to paginate is `from` (offset) and `size` (page length):
`from=0&size=10` for page 1, `from=10&size=10` for page 2, and so on. It works,
and for the first several pages it's completely fine. The problem is *deep*
pages, and it's rooted in how a distributed sorted result is built.

To return `from=10000&size=10` (results 10,001-10,010), Elasticsearch cannot
just skip to result 10,001 — the results are spread across shards and only
become a single global order after merging. So **each shard must produce its
top `from + size` results** (here 10,010), send them all to the coordinating
node, which merges and sorts *all of them* to find the correct window, then
throws away the first 10,000. With 5 shards that's 5 × 10,010 = ~50,050
documents materialized, sorted, and mostly discarded — **to return 10 rows.**
The cost grows with `from`, linearly, on every shard. Push `from` to 100,000
and you're sorting half a million rows per query.

Because this is a genuine resource risk (memory, CPU), Elasticsearch enforces a
hard ceiling: `index.max_result_window`, **default 10,000**. Ask for
`from + size > 10000` and you get an error, by design, telling you to stop
paginating this way. That error is a feature — it's the system refusing to let
you shoot yourself.

The takeaway: **`from`/`size` is fine for shallow, jump-to-any-page UIs over a
bounded number of pages. It is the wrong tool for scrolling through large result
sets.** For that you need `search_after`.

### `search_after`: paginate by sort value, not offset

`search_after` paginates by remembering **where the last page ended**, not how
many rows to skip. You sort by a set of fields that uniquely and stably order
documents (crucially including a **tiebreaker** — typically the document
`_id` or `_shard_doc` — so ties are ordered deterministically), and the next
page asks for "documents that sort *after* these values":

```json
// page 1
{ "size": 10, "sort": [ {"price": "asc"}, {"_id": "asc"} ] }
// -> note the last hit's sort values, e.g. [149.5, "abc123"]

// page 2: give the previous page's last sort values
{ "size": 10, "sort": [ {"price": "asc"}, {"_id": "asc"} ],
  "search_after": [149.5, "abc123"] }
```

Why this is efficient: each shard can use its sorted index to *seek* directly to
the point after `[149.5, "abc123"]` and read the next 10 — no materializing
10,000 rows to throw away. The cost of page 1,000 is the same as page 2. This is
how "load more" / infinite scroll and full-dataset exports should work.

```
  from=9990 size=10 (5 shards)
    each shard builds top 10,000 ─► coordinator sorts ~50,000 ─► keeps 10, discards rest
    cost grows with page depth  ─► errors past max_result_window (10,000)

  search_after [149.5,"abc123"] size=10
    each shard SEEKS past the cursor ─► reads next 10 ─► merges 50
    page 1,000 costs the same as page 2   (forward-only, needs a tiebreaker)
```

The trade-off: `search_after` gives you **forward, sequential** paging — you
can't jump directly to "page 500," only walk from where you are. That's fine for
infinite scroll and exports (the real large-pagination use cases) and is exactly
why it doesn't hit the deep-pagination wall. It also needs a consistent sort
that includes a tiebreaker, or documents with equal sort values can be skipped
or duplicated across pages.

(You may see the older **Scroll API** mentioned. It's for one-off deep exports
and holds a point-in-time snapshot; it's now largely superseded by
`search_after` combined with a **Point In Time (PIT)** for stable pagination
over a changing index. Reach for `search_after`+PIT, not Scroll, for new code.)

### Choosing shard count: the over-sharding tax

Module 00 warned that primary shard count is fixed at creation and that "more
shards" is not "more better." Here's the concrete cost model:

- Every shard is a full Lucene index with **fixed overhead**: file handles,
  memory for its data structures, and — the killer — a **per-shard cost on
  every query**. A search fans out to *every* shard, each does work, and the
  coordinating node merges all their responses. Ten shards means ten sets of
  that overhead and ten sub-responses to merge, *per query*, even if the index
  is tiny.
- So an index split into 20 shards holding 1,000 documents each is
  **dramatically slower** than the same 20,000 documents in one shard: you've
  multiplied per-query coordination overhead 20× for no benefit, because a
  single shard could easily hold and search 20,000 docs. This "over-sharding"
  is the most common self-inflicted Elasticsearch performance problem.
- The official rule of thumb: aim for shards in the **tens-of-GB range**
  (roughly 10-50GB each), and keep the total shard count per node proportional
  to heap (a common guideline is **under ~20 shards per GB of heap**). For most
  small-to-medium indexes, **1 primary shard is correct**; add shards only when
  one shard would exceed the size guideline or when you genuinely need to spread
  load across many nodes.
- Under-sharding is possible too (a single 2TB shard can't be split across nodes
  and is slow to recover), but for the datasets in this curriculum
  **over-sharding is the mistake you'll actually make.** When in doubt on a
  small index, fewer shards.

For time-series data (logs), the modern answer is **data streams / rollover**
(module 06): keep each backing index a sensible size and roll over to a new one
by age or size, rather than one giant index or thousands of tiny daily ones.

### Bulk indexing: never index one document at a time

Indexing via a single `POST /_doc` per document has per-request overhead (HTTP
round trip, parsing, refresh pressure) that dominates when you have many
documents. The **Bulk API** (`_bulk`) sends many index/update/delete operations
in one request:

```
POST /_bulk
{"index":{"_index":"products","_id":"1"}}
{"name":"...", ...}
{"index":{"_index":"products","_id":"2"}}
{"name":"...", ...}
```

Note the format: **two lines per document** — an action/metadata line, then the
source line — newline-delimited JSON (NDJSON), and the body **must end with a
newline**. Bulk indexing is often **10-100× faster** than one-by-one. Practical
rules:

- **Batch size**: a few thousand documents or a few MB per bulk request is a
  good starting point — not one giant 1GB request (memory pressure) and not
  50-document batches (overhead). Tune to your document size.
- **Inspect the response**: a bulk request returns HTTP 200 even if *some* items
  failed. You must check the top-level `"errors": true/false` and per-item
  status — a partial failure is silent otherwise. This is a real, common data
  bug.
- **For big loads**, temporarily set `refresh_interval` higher (or `-1` to
  disable) and reduce replicas to 0, then restore them after — refreshing and
  replicating on every batch is wasted work during a bulk backfill.
- **`elasticsearch-py` gives you `helpers.bulk`** which handles batching,
  serialization, and error collection for you — use it rather than hand-rolling
  the NDJSON.

```
  one-at-a-time:  [doc]→HTTP  [doc]→HTTP  [doc]→HTTP ...   (N round trips)

  _bulk — one request, NDJSON (action line + source line per doc):
    {"index":{"_id":1}}\n {..doc..}\n {"index":{"_id":2}}\n {..doc..}\n
    └─► single request ─► often 10-100× faster
        returns HTTP 200 even if some items fail ─► must check "errors": true
```

### Query anti-patterns that quietly destroy latency

Some queries are slow by nature. Recognize and avoid:

- **Leading wildcards** (`*shoes`, `*.png`). A wildcard query scans the term
  dictionary; a *trailing* wildcard (`shoe*`) can still use the sorted terms to
  narrow the scan, but a **leading** wildcard forces scanning *every term in the
  field* — potentially millions. Never use leading wildcards on large fields.
  If you need "ends with" or "contains," model it differently: an
  **edge n-gram / completion** field for autocomplete (capstone), a reversed
  field for suffix search, or reconsider whether you want fuzzy/prefix instead.
- **Regexp and unbounded wildcard** queries — same term-scan cost; use only on
  low-cardinality fields or with an anchored prefix.
- **Huge `terms` lookups** — a `terms` filter with tens of thousands of values
  is heavy; use the **terms lookup** feature or a join-like redesign.
- **Scripting in the hot path** — `script` queries/sorts run per document and
  can't use the index; fine for small filtered sets, ruinous over millions.
- **Returning giant `_source`** for every hit when you only need a few fields —
  use `_source` filtering (`"_source": ["name","price"]`) or `fields` to cut
  payload and I/O.
- **Deep `from`/`size`** — covered above; the anti-pattern that has its own
  error message.

The unifying principle: **the fast path uses the inverted index / doc values to
avoid touching most documents.** Anything that forces a scan of all terms or all
documents (leading wildcard, unrestricted script, deep offset) throws that
advantage away. When a query is slow, ask "what is forcing this to look at
everything?"

### Profiling: measure, don't guess

Elasticsearch has a **Profile API** (`"profile": true` on a search) that breaks
down where time went, per shard and per query component — analogous to SQL's
`EXPLAIN ANALYZE`. And the **Search Slow Log** (an index setting) records
queries exceeding a threshold. When something is slow, profile it rather than
guessing; the profile output tells you which clause and which phase (query vs
fetch) is the cost.

## Command reference

| Feature | DSL / API | Notes |
|---|---|---|
| Shallow paging | `"from": 0, "size": 10` | Fine for early pages only |
| Result window limit | `index.max_result_window` | Default 10,000; the deep-page wall |
| Deep/scroll paging | `"search_after": [...]` + stable `sort` | Include a tiebreaker (`_id`) |
| Stable snapshot | `POST /idx/_pit?keep_alive=1m` | Point In Time for consistent paging |
| Bulk load | `POST /_bulk` (NDJSON, trailing newline) | Check `"errors"` in response |
| Python bulk helper | `helpers.bulk(es, actions)` | Batches + collects errors |
| Tune for backfill | `refresh_interval: -1`, `number_of_replicas: 0` | Restore after load |
| Limit fields returned | `"_source": ["name","price"]` | Cut payload |
| Profile a query | `"profile": true` | Per-component timing |
| Change replicas (live) | `PUT /idx/_settings {number_of_replicas}` | Replicas are changeable; primaries are not |

`search_after` in curl (two requests):

```bash
# page 1 — note sort includes a tiebreaker _id
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 2, "sort": [ {"price":"asc"}, {"_id":"asc"} ]
}'
# take the last hit's "sort": e.g. [129.99, "AbC123"], then:
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 2, "sort": [ {"price":"asc"}, {"_id":"asc"} ],
  "search_after": [129.99, "AbC123"]
}'
```

The deep-pagination error, on purpose:

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "from": 10000, "size": 10
}'
# -> "Result window is too large, from + size must be less than or equal to: [10000] ..."
```

Bulk indexing and the `elasticsearch-py` helper:

```python
from elasticsearch import Elasticsearch, helpers
es = Elasticsearch("http://localhost:9200")

def gen(n):
    for i in range(n):
        yield {"_index": "big", "_id": i,
               "name": f"Product {i}", "price": (i % 500) + 0.99}

# helpers.bulk batches, serializes, and returns (success_count, errors)
success, errors = helpers.bulk(es, gen(50000), chunk_size=2000, raise_on_error=False)
print("indexed:", success, "errors:", len(errors) if isinstance(errors, list) else errors)

# search_after pagination
page = es.search(index="big", size=100, sort=[{"price": "asc"}, {"_id": "asc"}])
last = page["hits"]["hits"][-1]["sort"]
next_page = es.search(index="big", size=100,
                      sort=[{"price": "asc"}, {"_id": "asc"}], search_after=last)
```

## Hands-on exercises

Use your cluster from earlier modules.

### 1. Bulk-load a realistic amount of data

Save this as `load.py` and run it (needs `pip install "elasticsearch>=8,<9"`):

```python
from elasticsearch import Elasticsearch, helpers
import random
es = Elasticsearch("http://localhost:9200")
es.indices.delete(index="big", ignore_unavailable=True)
es.indices.create(index="big", mappings={"properties": {
    "name": {"type": "text", "fields": {"raw": {"type": "keyword"}}},
    "price": {"type": "scaled_float", "scaling_factor": 100},
    "brand": {"type": "keyword"}}})
brands = ["Summit","Pace","Vertex","Nomad","Cirrus"]
def gen():
    for i in range(20000):
        yield {"_index":"big","_id":i,
               "name":f"Trail Product {i}","price":round(random.uniform(5,300),2),
               "brand":random.choice(brands)}
print(helpers.bulk(es, gen(), chunk_size=2000))
es.indices.refresh(index="big")
print(es.count(index="big"))
```

Expected: it loads 20,000 docs in a second or two (try the same one-at-a-time
and feel the difference), prints a success count of 20000 and 0 errors, and a
final count of 20000.

### 2. Shallow pagination works fine

```bash
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{"from":0,"size":5,"sort":[{"price":"asc"},{"_id":"asc"}]}'
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{"from":20,"size":5,"sort":[{"price":"asc"},{"_id":"asc"}]}'
```

Expected: fast, correct pages. Note the `sort` values on each hit — you'll use
them for `search_after`.

### 3. Hit the deep-pagination wall on purpose

```bash
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{"from":10000,"size":10}'
```

Expected: an error — "Result window is too large, from + size must be less than
or equal to: [10000]". Read it. This is Elasticsearch stopping you from the
resource blowup described in Concepts, not a bug to work around by raising the
limit.

### 4. Paginate deep correctly with `search_after`

```bash
# page 1
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{"size":3,"sort":[{"price":"asc"},{"_id":"asc"}]}'
```

Copy the **last** hit's `"sort"` array (e.g. `[5.02, "17431"]`) into the next
call:

```bash
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{"size":3,"sort":[{"price":"asc"},{"_id":"asc"}],"search_after":[5.02,"17431"]}'
```

Expected: the next 3 documents in price order, with no offset cost — and you
could repeat this past result 10,000 without ever hitting the wall. That's the
whole point.

### 5. Prove `search_after` scales where `from` doesn't

Conceptually compare: `from=10&size=10` makes each shard build 20 results;
`from=9990&size=10` makes each shard build 10,000. `search_after` always builds
`size` results per page regardless of depth. You can't easily time this on one
small shard, but write down, for a 5-shard index at page 1,000
(`from=9990,size=10`), how many documents each shard materializes vs how many
`search_after` materializes. (Answer: ~10,000 per shard for `from`, exactly
`size`=10 per shard for `search_after`.)

### 6. See the over-sharding tax

Create the *same* data volume as two indexes with wildly different shard counts:

```bash
curl -XPUT "localhost:9200/few_shards" -H 'Content-Type: application/json' -d '{"settings":{"number_of_shards":1,"number_of_replicas":0}}'
curl -XPUT "localhost:9200/many_shards" -H 'Content-Type: application/json' -d '{"settings":{"number_of_shards":20,"number_of_replicas":0}}'
curl -XPOST "localhost:9200/_reindex" -H 'Content-Type: application/json' -d '{"source":{"index":"big"},"dest":{"index":"few_shards"}}'
curl -XPOST "localhost:9200/_reindex" -H 'Content-Type: application/json' -d '{"source":{"index":"big"},"dest":{"index":"many_shards"}}'
curl "localhost:9200/_cat/shards/many_shards?v"
```

Expected: `many_shards` has 20 shards each holding ~1,000 tiny docs. On this
single node they all sit on one machine, so every query still pays 20× the
per-shard overhead and merge cost for zero benefit. `_cat/shards` shows the
absurdity — 20 near-empty shards for 20k docs. In production this pattern is a
top cause of slow clusters. Delete `many_shards` when done.

### 7. Use the Profile API

```bash
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{
  "profile": true,
  "query": { "match": { "name": "trail" } }
}'
```

Expected: a large `profile` section breaking the query into components with
`time_in_nanos` per phase and per shard. This is your `EXPLAIN ANALYZE`: when a
query is slow, this tells you *which* part is slow.

### 8. Feel the leading-wildcard anti-pattern

```bash
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"wildcard":{"name.raw":"*product 1234"}}}'
curl "localhost:9200/big/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"wildcard":{"name.raw":"trail product 1234*"}}}'
```

Expected: both may return results here, but the **leading** wildcard (`*product
…`) must scan every term in `name.raw`, while the **trailing** one
(`trail product 1234*`) can seek in the sorted term dictionary. On 20k docs both
feel instant; at millions the leading-wildcard version is the one that times
out. Internalize the difference now — never anchor a wildcard with `*` on the
left over a large field.

### 9. Diagnose and fix: the silent bulk failure

Run a bulk request where some documents violate the mapping, and only *some*
succeed:

```bash
curl -XPUT "localhost:9200/strict_num" -H 'Content-Type: application/json' -d '{"mappings":{"properties":{"n":{"type":"integer"}}}}'
curl -XPOST "localhost:9200/strict_num/_bulk" -H 'Content-Type: application/json' --data-binary '
{"index":{"_id":"1"}}
{"n":10}
{"index":{"_id":"2"}}
{"n":"not a number"}
{"index":{"_id":"3"}}
{"n":30}
'
curl "localhost:9200/strict_num/_count"
```

The bulk call returns HTTP 200. But the count is 2, not 3. Explain how a "200
OK" hid a failed document, and how you should have caught it.

<details>
<summary>Answer</summary>

The Bulk API returns HTTP **200 even when individual items fail** — the
transport succeeded; the *items* are reported individually. Doc 2's `n` value
`"not a number"` can't be parsed as an `integer`, so that one item failed
(a `mapper_parsing_exception`) while docs 1 and 3 succeeded — hence count 2,
not 3, with no top-level error status code. You catch it by inspecting the
response body: the top-level `"errors": true` flag and each item's `status`
/`error`. In `elasticsearch-py`, `helpers.bulk(..., raise_on_error=True)` (the
default) raises, or `stats_only=False` returns the list of failed items. Never
assume a 200 from `_bulk` means every document indexed — always check
`"errors"`. This silent partial failure is a genuinely common data-loss bug in
ingestion pipelines. (Note the `--data-binary` flag: it preserves the newlines
that NDJSON bulk format requires; `-d` would strip them and break the request.)

</details>

### 10. Tune an index for a big backfill, then restore

```bash
curl -XPUT "localhost:9200/big/_settings" -H 'Content-Type: application/json' -d '{"index":{"refresh_interval":"-1","number_of_replicas":0}}'
# ... run your bulk load here ...
curl -XPUT "localhost:9200/big/_settings" -H 'Content-Type: application/json' -d '{"index":{"refresh_interval":"1s","number_of_replicas":1}}'
curl -XPOST "localhost:9200/big/_refresh"
```

Expected: with refresh disabled and replicas at 0 during load, indexing is
faster (no per-batch refresh, no replication work); afterward you restore normal
refresh and redundancy and do one final refresh. Note this is exactly the kind
of setting `number_of_replicas` you *can* change on a live index — unlike the
primary shard count.

## Independent challenge

No code given.

**Task:** You must export **every** document from the `big` index (all 20,000)
to a file, in a stable order, and you must do it in a way that would still work
if the index had 20 million documents. Then, separately, build a normal
search-results endpoint that lets a user page forward through results 10 at a
time indefinitely. For both:

1. Choose the correct pagination mechanism and justify *why* the naive
   `from`/`size` approach fails for these.
2. Ensure pages don't skip or duplicate documents even though other processes
   might be indexing concurrently.
3. Include the tiebreaker needed for a stable total order.
4. Confirm you never trip `max_result_window`.

Reach back to module 03's no-score sort (a pure export doesn't need relevance
scoring) and to module 00's shard model (why the offset cost is *per shard*).

<details>
<summary>Hint</summary>

Use `search_after` with a `sort` that includes a unique tiebreaker (`_id` or
`_shard_doc`), looping: take each page's last `sort` values as the next page's
`search_after`, until a page returns fewer than `size` hits. For requirement 2
(no skips/dupes under concurrent indexing), open a **Point In Time**
(`POST /big/_pit?keep_alive=1m`) and pass the `pit.id` in the search so you page
over a stable snapshot. Because you never use `from`, you never approach
`max_result_window`. For the export, sorting by `_shard_doc` (or `_doc`) and not
requesting `_score` is the cheapest stable order.

</details>

## Common mistakes & troubleshooting

- **Deep `from`/`size` pagination.** Cost grows per shard with the offset and
  errors past `max_result_window` (10,000). Use `search_after` (+PIT) for deep
  or full-dataset paging; keep `from`/`size` for shallow jump-to-page UIs only.
- **Raising `max_result_window` to "fix" deep pagination.** That just moves the
  cliff and invites the memory blowup the limit prevents. Change the *approach*,
  not the limit.
- **`search_after` without a unique tiebreaker in the sort.** Documents with
  equal sort values can be skipped or duplicated across pages. Always add
  `_id`/`_shard_doc`.
- **Over-sharding.** Many tiny shards multiply per-query overhead. For small
  indexes use 1 primary shard; size shards toward tens of GB. Primary count is
  fixed at creation — reindex to change it.
- **Indexing one document at a time.** Orders of magnitude slower than `_bulk`.
  Use `_bulk`/`helpers.bulk`, a few MB per batch, and drop refresh/replicas
  during big backfills.
- **Trusting a 200 from `_bulk`.** Partial item failures don't change the HTTP
  status. Always check `"errors"` and per-item results.
- **Leading wildcards / unbounded regex / scripts in the hot path.** They force
  full term or document scans. Use prefix/edge-ngram/completion for
  autocomplete, fuzzy for typos, and profile anything slow.
- **Using `-d` instead of `--data-binary` for `_bulk` in curl.** `-d` strips the
  newlines NDJSON requires and the request fails or misbehaves.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Mechanically, why does `from=100000&size=10` cost far more than
   `from=0&size=10`, and why is the cost paid *per shard*?
2. What does `search_after` do differently that avoids that cost, and what does
   it give up in exchange? What must the `sort` always include?
3. Your colleague sets an index to 30 primary shards for 50,000 small
   documents "to make it fast." Explain why this is likely to make search
   *slower*, and what shard count you'd suggest.
4. Give three practical rules for loading a few million documents efficiently
   with the Bulk API.
5. A `_bulk` request returns HTTP 200 but your document count is lower than the
   number you sent. What happened and how do you detect it?
6. Why is `*shoes` a performance anti-pattern while `shoes*` is usually fine,
   and what would you use instead of a leading wildcard for autocomplete?

<details>
<summary>Answers</summary>

1. To honor an offset, each shard must produce its top `from + size` sorted
   results (100,010) and send them to the coordinating node, which merges and
   sorts them all and discards the first 100,000 — enormous wasted work that
   scales with `from`. It's per shard because the global order only exists after
   merging, so every shard must contribute its full `from + size` prefix.
2. `search_after` seeks directly to the point after the previous page's sort
   values using the sorted index, reading only `size` results per page
   regardless of depth — constant cost. It gives up random access (you can only
   page forward sequentially, not jump to page N). The `sort` must include a
   unique tiebreaker (e.g. `_id`/`_shard_doc`) for a stable, gap-free order.
3. 30 shards for 50k tiny docs means ~1,600 docs/shard: each query fans out to
   30 shards and merges 30 responses, paying 30× the fixed per-shard/coordination
   overhead for data a single shard could trivially hold — so it's slower, not
   faster. Use 1 primary shard here; size shards toward tens of GB and only add
   shards when one would exceed that or you need multi-node spread.
4. (a) Use `_bulk`/`helpers.bulk` with batches of a few thousand docs / a few MB
   (not one-by-one, not one giant request); (b) during the backfill set
   `refresh_interval: -1` and `number_of_replicas: 0`, restoring them after;
   (c) check the response `"errors"` flag / per-item status so partial failures
   aren't silent.
5. Some individual items failed (e.g. a mapping-parse error) while others
   succeeded; the Bulk API still returns HTTP 200 because the transport
   succeeded. Detect it by inspecting the response body's top-level `"errors":
   true` and each item's `status`/`error` (or let `helpers.bulk` raise/collect
   errors) — never rely on the HTTP status alone.
6. A leading wildcard `*shoes` can't use the sorted term dictionary to narrow
   the search, so it must scan *every* term in the field — O(terms). `shoes*`
   anchors a prefix and can seek within the sorted terms, so it only scans the
   matching range. For autocomplete use a prefix-oriented approach —
   `match_phrase_prefix`, an edge n-gram field, or the `completion` suggester —
   not a leading wildcard.

</details>

## Further reading & sources

- [Paginate search results](https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html) - `from`/`size`, `search_after`, and why deep offsets are capped by `max_result_window`.
- [Point in time API](https://www.elastic.co/guide/en/elasticsearch/reference/current/point-in-time-api.html) - the stable snapshot that pairs with `search_after` for consistent deep paging.
- [Bulk API](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-bulk.html) - the NDJSON format and the per-item error reporting behind silent partial failures.
- [Tune for indexing speed](https://www.elastic.co/guide/en/elasticsearch/reference/current/tune-for-indexing-speed.html) - batch sizing, `refresh_interval`, and replica tuning for backfills.
- [Size your shards](https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html) - the official guidance behind the over-sharding tax and shard-size targets.
- [Profile API](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-profile.html) - the per-component timing breakdown for diagnosing slow queries.

## Next

[06-kibana-and-operations](../06-kibana-and-operations/README.md) — you can now
search fast and load data at scale. Next you'll get eyes on the system:
exploring and visualizing data in **Kibana**, managing index lifecycles (ILM)
and aliases for time-series data, and reading cluster health/monitoring so you
know *why* the color went yellow or red before it becomes an incident.
