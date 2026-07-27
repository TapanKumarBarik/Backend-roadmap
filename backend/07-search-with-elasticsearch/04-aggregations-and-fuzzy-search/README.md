# Module 04: Aggregations and Fuzzy Search

## Why this matters

A search results page is more than a ranked list. Look at any e-commerce or
log-analytics UI and you'll see two more things: **facets** ("Brand: Summit
(42), Pace (17)… Price: under $50 (9), $50-100 (23)…") that both summarize the
results and let users drill in, and **typo tolerance**, so a user who types
`runing shoez` still gets running shoes. Both are core to a search feature that
feels professional, and both are this module.

Facets come from **aggregations** — Elasticsearch's analytics engine, which
groups and computes over your documents in the same request that returns hits.
Aggregations are also how the entire log/metrics side of Elasticsearch works
("events per minute," "p99 latency by service"), so this is a doubly important
tool. Typo tolerance comes from **fuzzy** matching, built on edit distance.
And underpinning the performance of both is the **query context vs filter
context** distinction from module 03 — revisited here from the angle that
actually pays your latency bills: *why filters are faster and cacheable, and
why you should filter before you aggregate.*

## Concepts

### Aggregations: buckets and metrics

An **aggregation** runs alongside a query and computes summaries over the
matching documents. Two fundamental families:

- **Metric aggregations** compute a *number* over a set of documents:
  `avg`, `min`, `max`, `sum`, `stats` (all of those at once), `cardinality`
  (approximate distinct count), `percentiles` (p50/p95/p99 — the log-analytics
  staple). "Average price of the matching products," "p99 request latency."
- **Bucket aggregations** *group* documents into buckets, each with a
  `doc_count`: `terms` (one bucket per distinct value — the engine behind
  faceted navigation), `range`/`histogram` (numeric buckets like price bands),
  `date_histogram` (time buckets — "events per hour," the backbone of every
  log dashboard). Buckets can be **nested**: inside each `terms` bucket you can
  run a metric (avg price per brand) or another bucket agg (price histogram per
  brand). This nesting is what makes aggregations expressive.

A defining feature: you can ask for aggregations **and** search hits in one
request, or ask for *only* aggregations by setting `"size": 0` (return no
document hits, just the computed buckets/metrics). For a facet sidebar you
almost always want `size: 0` on the facet sub-requests — you don't need the
documents again, just the counts. Aggregations run over the documents matching
the query, which is the mechanism behind "these facet counts reflect my current
search/filters."

Two accuracy caveats worth knowing early: `terms` aggregation counts on a
sharded index are **approximate by default** (each shard returns its top N and
they're merged, which can slightly misreport counts for low-frequency terms —
tunable with `shard_size`), and `cardinality` is an **approximate** distinct
count (the HyperLogLog algorithm — fast and low-memory, trading a small error).
For a single-shard local index you won't see the terms approximation, but on a
real cluster you must know it exists. And `terms` aggregations require a
`keyword`/numeric field, never an analyzed `text` field — the exact module-01
lesson, now for aggregations.

### Query context vs filter context — the performance angle

Module 03 introduced this split for *relevance* (filters don't affect
`_score`). Here's why it's also the biggest single latency lever you control.

When a clause runs in **query context**, Elasticsearch computes a relevance
`_score` for every matching document — real arithmetic (BM25) per doc, and the
result is inherently query-specific, so it can't be reused.

When a clause runs in **filter context**, there's no scoring — the answer for
each document is a plain yes/no. That yes/no set can be represented compactly
and, crucially, **cached**: Elasticsearch keeps a **query cache** of filter
results (as bitsets) keyed by the filter, so the *second* time you run
`in_stock = true` or `category = "footwear"` — which happens constantly, since
facet filters repeat across users — it's essentially free. Scored queries get
no such reuse.

The practical rules that fall out of this:

1. **Anything that is a hard yes/no condition belongs in `filter`**, not
   `must`: `term`, `terms`, `range` on price/date, `exists`, geo bounds. Only
   the genuinely "how relevant" part (the user's full-text `match`) belongs in
   query context.
2. **Filter first, then aggregate.** Aggregations run over the query's matching
   set, so narrowing that set with cheap cached filters *before* aggregating
   makes the aggregation faster (fewer docs to bucket) — and keeps the facet
   counts consistent with what the user is looking at.
3. A common pattern for facets: use **`post_filter`** when you want the facet
   *counts* to reflect the broad search but the *hits* to reflect the user's
   selected facet — a subtlety you'll meet in the exercises and lean on in the
   capstone.

Internalize the mental cost model: **a `match` costs scoring work every time; a
`filter` costs almost nothing the second time.** Design queries so the
repeated, boolean parts are filters.

### Fuzzy search: typo tolerance via edit distance

Users misspell. **Fuzzy** matching finds terms within a small **edit distance**
(Levenshtein distance) of the query term — the number of single-character
insertions, deletions, substitutions, or transpositions needed to turn one word
into another. `runing → running` is edit distance 1 (insert an `n`);
`shoez → shoes` is 1 (substitute `z`→`s`); `from → form` is 1 (a transposition).

You enable it with `fuzziness`:

- **`fuzziness: 1` or `2`** — allow up to that many edits. Two is the practical
  maximum; beyond it, matches become noise (too many unrelated words are within
  3 edits).
- **`fuzziness: "AUTO"`** — the recommended default: it scales the allowed
  edits by term length (0 edits for very short terms of 1-2 chars, 1 for
  3-5 chars, 2 for longer). This avoids the trap where a 1-edit allowance on a
  3-letter word matches half the dictionary.

Two ways to invoke it:

```json
{ "match": { "name": { "query": "runing shoez", "fuzziness": "AUTO" } } }   // fuzzy full-text
{ "fuzzy": { "brand": { "value": "sumit", "fuzziness": 1 } } }              // fuzzy on a term
```

Prefer **`match` with `fuzziness`** for user-facing search boxes (it's analyzed
and multi-term); the raw `fuzzy` query is a term-level tool. Costs to respect:
fuzzy matching is **more expensive** than exact matching (the engine expands
your term into all the index terms within the edit distance and searches them
all), and it can **hurt precision** (match things you didn't mean). Two
mitigations: `prefix_length` (require the first N characters to match exactly —
big speedup and precision win, since typos in the first letter are rare) and
`max_expansions` (cap how many variant terms are considered). Fuzzy is a
scalpel, not a default-on switch for every field.

### Fuzzy vs. the other "approximate" tools (don't confuse them)

- **`fuzzy`/`fuzziness`** — typo tolerance via edit distance on *whole terms*.
  For misspellings.
- **`match_phrase_prefix`** and the `completion` suggester — **autocomplete**
  (matching a *prefix* as the user types), a different problem you'll build in
  the capstone. `runni` → `running` is prefix, not edit distance.
- **wildcard/regex** (`run*`) — pattern matching. Powerful but a **performance
  trap** (especially leading wildcards `*run`), covered as an anti-pattern in
  module 05. Don't reach for wildcard when you meant fuzzy or prefix.

Keeping these straight prevents the classic mistake of using a slow leading
wildcard to do a job fuzzy or prefix matching does faster and better.

## Command reference

| Aggregation / feature | DSL | Purpose |
|---|---|---|
| `terms` | `{"terms":{"field":"brand"}}` | Facet counts per distinct value (keyword!) |
| `range` | `{"range":{"field":"price","ranges":[...]}}` | Price bands, etc. |
| `histogram` | `{"histogram":{"field":"price","interval":50}}` | Fixed-width numeric buckets |
| `date_histogram` | `{"date_histogram":{"field":"created","calendar_interval":"month"}}` | Time buckets |
| `avg`/`min`/`max`/`sum`/`stats` | `{"avg":{"field":"price"}}` | Metrics over the set |
| `cardinality` | `{"cardinality":{"field":"sku"}}` | Approx distinct count |
| `percentiles` | `{"percentiles":{"field":"latency"}}` | p50/p95/p99 |
| nested aggs | `terms` with sub-`aggs` | Metric/bucket per bucket |
| `"size": 0` | top-level | Aggregations only, no hits |
| filter context | `bool.filter` | Cacheable yes/no; no scoring |
| `post_filter` | top-level | Filter hits *after* aggs computed |
| fuzzy full-text | `match` + `"fuzziness":"AUTO"` | Typo-tolerant search box |
| fuzzy term | `fuzzy` + `prefix_length`/`max_expansions` | Term-level typo tolerance |

Faceted search request — hits + facet counts + a metric, filtered — in curl:

```bash
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": {
    "bool": {
      "must":   [ { "match": { "name": "running" } } ],
      "filter": [ { "range": { "price": { "lte": 200 } } } ]
    }
  },
  "aggs": {
    "by_brand":   { "terms": { "field": "brand" } },
    "price_bands":{ "range": { "field": "price",
                     "ranges": [ {"to":100}, {"from":100,"to":150}, {"from":150} ] } },
    "avg_price":  { "avg": { "field": "price" } }
  }
}'
```

Fuzzy search box in curl:

```bash
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "match": { "name": {
    "query": "runing shoez", "fuzziness": "AUTO", "prefix_length": 1
  }}}}'
```

Python — facets with `size=0`, and a nested aggregation:

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")

r = es.search(index="products", size=0,
    query={"bool": {"filter": [{"term": {"in_stock": True}}]}},
    aggs={
        "by_brand": {
            "terms": {"field": "brand"},
            "aggs": {"avg_price": {"avg": {"field": "price"}}}  # metric per bucket
        }
    })
for b in r["aggregations"]["by_brand"]["buckets"]:
    print(b["key"], b["doc_count"], round(b["avg_price"]["value"], 2))
```

## Hands-on exercises

Rebuild a richer `shop` index so aggregations have something to chew on.

### 1. Seed a dataset with variety

```bash
curl -XDELETE "localhost:9200/shop"
curl -XPUT "localhost:9200/shop" -H 'Content-Type: application/json' -d '{
  "mappings":{"properties":{
    "name":{"type":"text"},"brand":{"type":"keyword"},
    "category":{"type":"keyword"},"price":{"type":"scaled_float","scaling_factor":100},
    "rating":{"type":"float"},"in_stock":{"type":"boolean"},
    "created":{"type":"date"}}}}'
curl -XPOST "localhost:9200/shop/_bulk" -H 'Content-Type: application/json' -d '
{"index":{}}
{"name":"Trail Running Shoes","brand":"Summit","category":"footwear","price":129.99,"rating":4.6,"in_stock":true,"created":"2026-05-01"}
{"index":{}}
{"name":"Road Running Shoes","brand":"Pace","category":"footwear","price":149.50,"rating":4.2,"in_stock":true,"created":"2026-06-01"}
{"index":{}}
{"name":"Hiking Boots","brand":"Summit","category":"footwear","price":179.00,"rating":4.8,"in_stock":false,"created":"2026-03-01"}
{"index":{}}
{"name":"Running Socks","brand":"Pace","category":"apparel","price":14.99,"rating":4.0,"in_stock":true,"created":"2026-07-01"}
{"index":{}}
{"name":"Trail Jacket","brand":"Summit","category":"apparel","price":89.00,"rating":4.5,"in_stock":true,"created":"2026-04-01"}
'
curl -XPOST "localhost:9200/shop/_refresh"
```

### 2. A `terms` facet (the brand sidebar)

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "aggs": { "by_brand": { "terms": { "field": "brand" } } }
}'
```

Expected: buckets `Summit` (3) and `Pace` (2), no document hits (because
`size: 0`). This is exactly the data behind a "Brand" facet.

### 3. Metric aggregations

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "aggs": { "price_stats": { "stats": { "field": "price" } },
            "distinct_brands": { "cardinality": { "field": "brand" } } }
}'
```

Expected: `price_stats` with min/max/avg/sum/count, and `distinct_brands`
count 2. Note `cardinality` is approximate (exact here at this tiny scale).

### 4. Nested aggregation: average price per category

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "aggs": { "by_category": {
    "terms": { "field": "category" },
    "aggs": { "avg_price": { "avg": { "field": "price" } } }
  }}}'
```

Expected: `footwear` and `apparel` buckets, each with its own `avg_price`
sub-metric. Nesting a metric inside a bucket = "this number, per group."

### 5. Range and date_histogram buckets

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "aggs": {
    "price_bands": { "range": { "field": "price",
       "ranges": [ {"to":50}, {"from":50,"to":150}, {"from":150} ] } },
    "per_month": { "date_histogram": { "field": "created", "calendar_interval": "month" } }
  }
}'
```

Expected: three price bands with counts, and one bucket per calendar month
present in the data. `date_histogram` is the backbone of every time-series/log
dashboard you'll build in module 06.

### 6. Facets that respect the current search (filter + aggregate)

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "query": { "bool": { "filter": [ { "term": { "in_stock": true } } ] } },
  "aggs": { "by_brand": { "terms": { "field": "brand" } } }
}'
```

Expected: brand counts now reflect *only in-stock* products (Summit 2 — the
boots are out of stock; Pace 2). The aggregation ran over the filtered set —
which is why facet counts update as users apply filters.

### 7. Fuzzy search catches the typos

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"name":"runing shoez"}}}'
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"name":{"query":"runing shoez","fuzziness":"AUTO"}}}}'
```

Expected: the first (no fuzziness) returns **0 hits** — `runing` and `shoez`
aren't terms in the index. The second, with `fuzziness: "AUTO"`, finds the
running shoes: `runing→running` and `shoez→shoes` are each 1 edit. That's typo
tolerance in one flag.

### 8. See fuzzy's precision cost, then rein it in

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"name":{"query":"boats","fuzziness":2}}}}'
```

Expected: with `fuzziness: 2`, `boats` may match `Boots` (edit distance 2:
`a→o` … actually `boats`→`boots` is 1 substitution) *and* potentially other
loosely-related terms — demonstrating over-matching. Add `"prefix_length": 2`
and observe the match set tighten (and the query speed up), because now the
first two characters must be exact. This is the precision/recall dial.

### 9. Diagnose and fix: the aggregation that errors, and the one that lies

Part A — this errors:

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{"size":0,"aggs":{"by_name":{"terms":{"field":"name"}}}}'
```

Part B — a colleague filters in the wrong place and gets facet counts that
don't match the hits. They put the in-stock condition in `must` and are
surprised the `_score` sorting changed *and* they lost caching. Explain both.

<details>
<summary>Answer</summary>

Part A errors with "Text fields are not optimised for … aggregations … set
`fielddata=true` … or use a keyword field instead." `name` is an analyzed
`text` field; `terms` aggregations need a `keyword` (or numeric) field so each
value is one indivisible bucket. Fix: aggregate on a `keyword` field/sub-field
(e.g. add `name.raw` and use `by_name: {terms: {field: "name.raw"}}`), or
aggregate on `brand`/`category` which are already `keyword`. (Enabling
`fielddata` is possible but memory-dangerous and almost never the right answer
— it's the module-01 `text`/`keyword` lesson resurfacing.)

Part B: an exact yes/no condition like `in_stock=true` in `must` runs in
**query context**, so (1) it contributes to `_score` — perturbing relevance
ranking they didn't intend — and (2) it can't use the **query cache**, so the
repeated filter isn't reused across requests. Move it to `bool.filter`: same
inclusion/exclusion, no scoring effect, and cacheable. This is the module-03
context split, now showing its performance teeth.

</details>

### 10. `post_filter` for facet UX

```bash
curl "localhost:9200/shop/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "match": { "name": "running" } },
  "aggs": { "by_brand": { "terms": { "field": "brand" } } },
  "post_filter": { "term": { "brand": "Pace" } }
}'
```

Expected: the `by_brand` aggregation shows counts for **all** brands matching
"running" (so the user still sees "Summit (n)" as a clickable option), while the
returned **hits** are restricted to `Pace`. `post_filter` applies *after*
aggregations are computed — the standard trick for "keep showing me the other
facet options even though I've selected one."

## Independent challenge

No queries given.

**Task:** Build the data for a complete faceted search results page for the
`shop` index (or a blog index of your own), in as few requests as sensible:

1. Full-text, typo-tolerant search over product names (a user typing `jaket`
   should still find the Trail Jacket).
2. A results list restricted to in-stock products, where that restriction is
   placed so it neither affects relevance scoring nor forfeits caching.
3. Facet counts for brand and for price bands (under 50 / 50-150 / 150+),
   reflecting the search terms.
4. The average rating of the matching products.
5. Sorted so the most relevant come first — but if the user instead chose "sort
   by price ascending," a variant query that pays no scoring cost.

Reach back to module 03 for the filter-vs-must placement in requirement 2 and
the no-score sort in requirement 5, and to module 01 for why the facet fields
in requirement 3 must be `keyword`.

<details>
<summary>Hint</summary>

One `_search`: `bool` with `must` = `match name` + `fuzziness:"AUTO"`
(requirements 1), `filter` = `term in_stock=true` (requirement 2 — filter
context). `aggs` = a `terms` on `brand` and a `range` on `price`
(requirement 3) plus an `avg` on `rating` (requirement 4). For requirement 5,
the default returns by `_score`; the price-ascending variant adds
`"sort":[{"price":"asc"}]`, which makes `_score` null and skips scoring.

</details>

## Common mistakes & troubleshooting

- **`terms` aggregation on a `text` field.** Errors (or, if `fielddata`
  enabled, is memory-dangerous and buckets by word). Aggregate on `keyword`.
- **Putting boolean conditions in `must` instead of `filter`.** Costs scoring
  work and loses query-cache reuse, and can perturb relevance. Gate in
  `filter`.
- **Forgetting `size: 0` for pure facet requests.** You pay to fetch and score
  document hits you don't use. Set `size: 0` when you only want aggregations.
- **Treating `terms`/`cardinality` counts as exact on a multi-shard index.**
  They're approximate by design; tune `shard_size` or know the error exists.
- **Fuzzy on everything, always.** It's slower and hurts precision. Use
  `fuzziness: "AUTO"`, add `prefix_length`, and don't fuzzy fields where exact
  matching is expected.
- **Confusing fuzzy, prefix/autocomplete, and wildcard.** Edit distance
  (typos) ≠ prefix (as-you-type) ≠ wildcard (patterns, and slow). Pick the tool
  that matches the actual need; never use a leading wildcard for typo tolerance.
- **`post_filter` vs `filter` confusion.** `filter` narrows *both* hits and
  aggregations; `post_filter` narrows only the hits, after aggs are computed.
  Use `post_filter` only for the "keep other facet options visible" UX.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the difference between a **bucket** aggregation and a **metric**
   aggregation? Give one example of each.
2. Why does a `terms` aggregation belong on a `keyword` field and not on a
   `text` field, and what goes wrong if you run it on `text`?
3. Why do you set `size: 0` on a request that only needs facet counts, and what
   does it save you?
4. Why are `terms` and `cardinality` counts described as *approximate* on a
   multi-shard index, and what knob influences their accuracy?
5. What does `fuzziness: "AUTO"` do, and why are `prefix_length` and *not*
   fuzzing every field important for precision and performance?
6. Distinguish fuzzy matching, prefix/autocomplete, and wildcard queries — what
   is each actually for, and why is a *leading* wildcard the wrong tool for
   typo tolerance?
7. What is the difference between `filter` and `post_filter`, and when is
   `post_filter` the right choice?

<details>
<summary>Answers</summary>

1. A **bucket** aggregation groups documents into buckets (e.g. `terms` by
   brand, `date_histogram` by day, `range` by price band). A **metric**
   aggregation computes a number over a set of documents (e.g. `avg`, `sum`,
   `max`, `cardinality`). Buckets are the "group by," metrics are the
   "aggregate function," and metrics are usually nested inside buckets.
2. `terms` needs the verbatim value as a single token, which lives in
   doc-values on a `keyword` field. On an analyzed `text` field it either
   errors (fielddata disabled by default) or, if fielddata is enabled, buckets
   by individual *word* and is memory-dangerous. Aggregate on the `.keyword`
   sub-field.
3. `size: 0` tells Elasticsearch to return no document hits — only the
   aggregations. It saves the cost of fetching and scoring hit documents you
   were going to throw away, which is pure waste for a pure-facet request.
4. Each shard computes its own top terms / distinct-count estimate and the
   coordinating node merges them, so a term that's just below the cutoff on
   each shard can be under- or over-counted, and `cardinality` uses a
   probabilistic (HyperLogLog) estimate. `shard_size` (how many terms each
   shard returns before merging) trades accuracy for cost.
5. `fuzziness: "AUTO"` allows an edit distance that scales with term length
   (short terms tolerate fewer typos, longer terms more), which is safer than a
   fixed distance. `prefix_length` requires the first N characters to match
   exactly, which both improves precision and drastically cuts the number of
   terms considered; not fuzzing every field avoids the slowdown and
   precision loss on fields where exact matching is expected.
6. **Fuzzy** = tolerate typos via edit distance (`runing` → `running`).
   **Prefix/autocomplete** = match the beginning of a term as the user types
   (`run` → `running`, `runner`). **Wildcard** = arbitrary patterns (`r*n`),
   and it's slow. A *leading* wildcard (`*unning`) can't use the index
   efficiently and doesn't model typos at all — use fuzzy for typo tolerance.
7. `filter` narrows *both* the returned hits and the documents the
   aggregations see; `post_filter` is applied only to the hits *after*
   aggregations are computed. Use `post_filter` for the faceted-navigation UX
   where you want to filter the visible results by one facet while still
   showing the counts for the other facet options.

</details>

## Cumulative review

Closed-book, mixing modules 00-04. Cover the answers; if a question from an
earlier module stumps you, go redo that module's exercises rather than peeking.

1. (00) Explain why an inverted index makes both a `match` search *and* a
   `terms` aggregation fundamentally different operations from a relational
   full-table scan.
2. (01) A field must support faceting (counts per value), full-text search, and
   alphabetical sorting. Give the exact mapping and say which query/agg uses
   which (sub-)field.
3. (02) A `term` query for `"Running"` on a `text` field returns nothing but a
   `match` for `"running"` works. Explain the mechanism in terms of analysis on
   both the index and query sides.
4. (03) State the difference between query context and filter context in both
   *relevance* terms and *performance* terms, and give one clause that belongs
   in each.
5. (03+04) You want "products matching the user's words, in-stock only, brand
   facet counts for all brands (not just in-stock), higher-rated ranked
   higher." Name where each requirement goes: `must`, `filter`, `should`,
   `function_score`, aggregation, or `post_filter` — and why.
6. (04) Distinguish fuzzy matching, prefix/autocomplete, and wildcard search by
   the problem each solves, and name the one that's a performance anti-pattern
   and why.
7. (00+04) Why are `terms` aggregation counts approximate on a multi-shard
   index, connecting it back to what a shard actually is?

<details>
<summary>Answers</summary>

1. Both operations exploit the inverted index / columnar structures rather than
   reading every document: `match` jumps straight to the postings lists for its
   terms (cost scales with matching terms, not doc count), and a `terms`
   aggregation groups using per-field data structures (doc values) rather than
   scanning and parsing every row. A relational full scan reads and evaluates
   every row.
2. `{"type":"text","fields":{"raw":{"type":"keyword"}}}`. Full-text search uses
   the base `text` field with `match`; faceting uses `field.raw` (keyword) with
   a `terms` agg; alphabetical sorting uses `field.raw` in `sort`.
3. On the index side the `text` field's analyzer lowercased/tokenized the value
   (stored term `running`); `term` doesn't analyze the query, so it looks for
   the literal `Running` (capital) which isn't in the index → 0 hits. `match`
   analyzes the query the same way (`Running`→`running`), so query and index
   terms line up.
4. Relevance: query context computes and contributes `_score`; filter context
   is pure yes/no and contributes nothing to `_score`. Performance: query
   context does per-doc scoring (not reusable); filter context is cacheable
   (bitset query cache), so repeated filters are ~free. `must`/`match` →
   query context; `term in_stock`/`range price` → filter context.
5. `match` (user's words) → `must` (scored). in-stock-only hits → but brand
   facet must show *all* brands, so the in-stock restriction goes in
   `post_filter` (narrows hits only, after aggs) rather than `filter`; the
   `by_brand` `terms` agg computes over the pre-post_filter set. Higher-rated
   ranked higher → `function_score` with `field_value_factor` on rating. (If you
   wanted facet counts to *also* reflect in-stock, you'd use `filter` instead of
   `post_filter` — the choice depends on desired facet UX.)
6. Fuzzy = typo tolerance via edit distance on whole terms. Prefix/autocomplete
   = matching the start of a term as the user types. Wildcard = pattern
   matching (`run*`), and leading wildcards (`*run`) are the anti-pattern
   because they can't use the inverted index efficiently and scan huge term
   sets. Use fuzzy/prefix instead where possible.
7. A shard is an independent Lucene index holding a subset of documents. A
   `terms` agg asks each shard for its top-N terms and merges them; a term
   that's globally in the top-N but not top-N on some shard can be
   under-counted. Hence approximate counts, tunable with `shard_size`.

</details>

## Next

[05-pagination-and-performance-optimization](../05-pagination-and-performance-optimization/README.md)
— you can search, rank, facet, and tolerate typos. Next you'll make it *fast
and scalable*: why `from`/`size` deep pagination collapses at scale and what
`search_after` does instead, how to choose shard counts, loading data
efficiently with the bulk API, and the wildcard/other query anti-patterns that
quietly destroy latency.
