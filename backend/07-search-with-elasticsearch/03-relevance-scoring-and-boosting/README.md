# Module 03: Relevance Scoring and Boosting

## Why this matters

Module 02 got you the *right documents*. This module gets them in the *right
order* — and for a search product, order is the whole game. Users look at the
top three results and rarely scroll; if the best match is ranked seventh, it
effectively doesn't exist. Relevance ranking is the difference between a search
box people trust and one they abandon.

The number that drives ordering is `_score`, and up to now it's been a
black box. Here you open it. You'll learn how **BM25** — the algorithm behind
`_score` — turns the TF-IDF intuition from module 00 into a concrete number,
how to *read* the `_explain` output to see exactly why document A beat document
B, and how to deliberately reshape ranking with **boosting** (a title match
should count more than a body match; a recent or in-stock product should float
up). Crucially you'll also learn when *not* to score at all — the difference
between "how well does this match" (query context) and "does this match, yes or
no" (filter context), which is both a relevance concept and, as module 04 will
show, a big performance lever.

## Concepts

### `_score`, query context, and filter context

Every hit in a search response carries a `_score`: a positive float where
**higher means more relevant**, and results are sorted by it descending by
default. `_score` is computed by the scoring clauses of your query. But not
every clause scores:

- **Query context** — "how *well* does this document match?" Clauses here
  (like a `match`, or a `bool.must`/`bool.should`) contribute to `_score`.
- **Filter context** — "does this document match, yes or no?" Clauses here
  (like a `bool.filter`, or a `bool.must_not`) are pure include/exclude. They
  do **not** affect `_score` (a filtered-in doc gets `_score` contribution of
  0 from the filter), and — because the answer is a cacheable boolean and no
  scoring math runs — they're **faster and cacheable**. Module 04 explores the
  performance side; here the point is the *relevance* side: a `range` on price
  or a `term` on `in_stock` usually shouldn't influence how relevant a document
  is, so it belongs in `filter`, not `must`.

This is why the idiomatic full-text-with-constraints query puts the `match` in
`must` (it should rank) and the `in_stock`/`price` conditions in `filter` (they
should gate, not rank). Getting this split right is both a correctness and a
performance habit.

### BM25: TF, IDF, and the two corrections that matter

Module 00 gave you the intuition: a document scores high when it contains the
query terms **often** (term frequency, TF) and those terms are **rare** across
the index (inverse document frequency, IDF). BM25 is the formula
Elasticsearch/Lucene actually use, and it refines that intuition with two
corrections you can feel in real results:

1. **IDF — rare terms dominate.** IDF is computed from how many documents
   contain the term: the fewer, the higher the weight. Practically, a match on
   a distinctive term (`photosynthesis`) contributes far more to `_score` than
   a match on a common one (`the`, `shoes` in a shoe catalog). This is why
   adding a rare word to a query can completely reorder results.

2. **TF saturation — diminishing returns.** In raw TF-IDF, a term appearing 100
   times scores ~100× a single occurrence, which lets keyword-stuffed documents
   win. BM25 applies **saturation**: each additional occurrence adds less than
   the last, approaching a ceiling. The 2nd mention matters a lot more than the
   20th. A parameter `k1` (default ~1.2) controls how fast it saturates.

3. **Length normalization.** A term appearing 3 times in a 10-word title is
   more significant than 3 times in a 2,000-word article. BM25 divides by a
   function of the field's length relative to the average field length, so
   short fields that match aren't drowned out by long ones. A parameter `b`
   (default 0.75) controls how strong this normalization is.

You do **not** need to memorize the formula. You need the three levers in your
head: **rarer term → higher score; more occurrences → higher but with
diminishing returns; shorter field for the same match → higher score.** Those
three explain almost every "why did this rank above that" you'll encounter.

### Reading `_explain`: the EXPLAIN of ranking

When you must know *why* document A outranks document B, don't theorize —
ask Elasticsearch. Two tools:

- **`"explain": true`** on a `_search` request adds a per-hit `_explanation`
  tree showing how each clause contributed to the score.
- **`GET /index/_explain/<id>`** with a query body explains the score for **one
  specific document** against that query — ideal for "why is *this* doc scored
  so low / not matching?"

The explanation tree breaks the score into the BM25 components — you'll see
labels like `idf`, `tf`, `boost`, and the field-length norm, each with numbers.
Reading it, you can literally see "document A scored higher because the term's
`tf` was higher and the field was shorter." This is the single best way to
build real intuition for scoring; the exercises make you read it.

### Boosting: reshaping relevance on purpose

Default BM25 ranking is a strong starting point but rarely the final answer for
a real product. **Boosting** lets you tell Elasticsearch which matches matter
more. Three common mechanisms:

**1. Field boost in `multi_match`.** A match in the title usually means more
than a match in the body. Use `^` to weight fields:

```json
{ "multi_match": {
    "query": "running shoes",
    "fields": ["name^3", "description"]   // a name match counts 3x a description match
}}
```

**2. Clause boost in `bool`.** In a `bool` query, `should` clauses add optional
score. You can give some more weight, e.g. boost recent or premium items:

```json
{ "bool": {
    "must":   [ { "match": { "name": "shoes" } } ],
    "should": [ { "match": { "brand": { "query": "Summit", "boost": 2 } } } ]
}}
```

A `should` clause that matches *adds* to the score (a document isn't required
to match it, but matching it ranks the doc higher). This is how "matches the
query AND is from a preferred brand → rank higher" is expressed.

**3. `function_score` for non-text signals.** Sometimes relevance depends on
factors BM25 knows nothing about: recency, popularity, rating, price. A
**`function_score`** query multiplies (or replaces) the text `_score` with a
function of field values — e.g. newer documents or higher-rated ones get a
multiplier. Common building blocks: `field_value_factor` (score scales with a
numeric field like `rating` or `sales`), and **decay functions** (`gauss`,
`exp`, `linear`) that smoothly reduce score as a field (date, geo distance,
price) moves away from an ideal — "prefer results near this location / close to
this price / published recently." This is how you blend text relevance with
business signals.

A warning that saves real incidents: **boosts are relative, not absolute, and
they interact.** A `name^10` boost doesn't mean "name matches are always first"
— a strong body match on a rare term can still win. Tune boosts against real
queries and *look at `_explain`*, don't just crank numbers and hope.

### `constant_score` and when you don't want ranking at all

Sometimes you want a clause to contribute a *fixed* score regardless of BM25 —
"any document with this tag gets exactly 2 points." Wrap a filter in
**`constant_score`** to give every matching doc the same score (default 1, or a
set `boost`). And when you don't want relevance ranking at all — say a pure
filtered list sorted by price — skip scoring entirely: put everything in
`filter` context and add an explicit `sort`. If you `sort` by a field, `_score`
isn't even computed (it comes back `null`), which is faster. Relevance ranking
is powerful, but the fastest query is the one that doesn't score when it
doesn't need to.

## Command reference

| Feature | DSL | Purpose |
|---|---|---|
| See scores | default `_search` | Each hit has `_score`; sorted desc |
| Explain a search | `"explain": true` | Per-hit `_explanation` score tree |
| Explain one doc | `GET /idx/_explain/<id>` + query | Why this doc (mis)scores |
| Field boost | `"fields":["name^3","description"]` | Weight fields in `multi_match` |
| Clause boost | `"match":{"f":{"query":"x","boost":2}}` | Weight a specific clause |
| Optional scoring clause | `bool.should` | Matching adds to score, not required |
| Value-based scoring | `function_score` + `field_value_factor` | Score by rating/popularity |
| Recency/proximity | `function_score` + `gauss`/`exp`/`linear` | Decay by date/distance/price |
| Fixed score | `constant_score` | Same score for all matches of a filter |
| No scoring | `filter` context + `sort` | Fastest; `_score` is null |

A realistic tuned query in curl — text relevance with field boosts, an
optional brand boost, and a recency decay:

```bash
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": {
    "function_score": {
      "query": {
        "bool": {
          "must":   [ { "multi_match": {
                          "query": "running shoes",
                          "fields": ["name^3", "description"] } } ],
          "should": [ { "term": { "brand": { "value": "Summit", "boost": 2 } } } ],
          "filter": [ { "term": { "in_stock": true } } ]
        }
      },
      "functions": [
        { "gauss": { "created": { "origin": "now", "scale": "90d", "decay": 0.5 } } }
      ],
      "boost_mode": "multiply"
    }
  }
}'
```

Python — run a search *with explain* and print the score breakdown:

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")

r = es.search(index="products", explain=True,
              query={"multi_match": {"query": "running shoes",
                                     "fields": ["name^3", "description"]}})
for h in r["hits"]["hits"]:
    print(round(h["_score"], 3), h["_source"]["name"])
    # h["_explanation"] is the full BM25 breakdown tree

# explain ONE document against a query
exp = es.explain(index="products", id="1",
                 query={"match": {"name": "running"}})
print(exp["matched"], round(exp["explanation"]["value"], 3))
```

## Hands-on exercises

Rebuild a small, deliberately-skewed `docs` index so scoring differences are
visible and explainable.

### 1. Seed documents with different term frequencies and lengths

```bash
curl -XDELETE "localhost:9200/docs"
curl -XPUT "localhost:9200/docs" -H 'Content-Type: application/json' -d '{
  "mappings":{"properties":{
    "title":{"type":"text"},"body":{"type":"text"},
    "brand":{"type":"keyword"},"rating":{"type":"float"},
    "created":{"type":"date"}}}}'
curl -XPOST "localhost:9200/docs/_bulk" -H 'Content-Type: application/json' -d '
{"index":{"_id":1}}
{"title":"Running","body":"A short note about running.","brand":"Summit","rating":4.8,"created":"2026-07-01"}
{"index":{"_id":2}}
{"title":"Trail guide","body":"Running running running running trails and running more running everywhere running.","brand":"Pace","rating":3.1,"created":"2024-01-01"}
{"index":{"_id":3}}
{"title":"Shoes and gear","body":"General notes on shoes, gear, and occasionally running outdoors.","brand":"Summit","rating":4.2,"created":"2026-06-01"}
'
curl -XPOST "localhost:9200/docs/_refresh"
```

### 2. Baseline: search and read the scores

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"body":"running"}}}'
```

Expected: all three match on `body`. Note the order and scores. Doc 2 repeats
"running" many times (high TF) but is a longer field; doc 1's body is short.
Predict the order, then confirm — and notice BM25's length normalization and TF
saturation both at play (doc 2 doesn't win by the raw 7× ratio you might
expect).

### 3. Read `_explain` to see *why*

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "match": { "body": "running" } }, "explain": true
}'
```

Expected: each hit gains an `_explanation` tree. Find the `idf`, the `tf` (or
`freq`), and the field-length-norm terms. Write down, from the numbers, one
sentence per document explaining its score. This is the core skill of the
module — reading, not guessing.

### 4. Explain a single document against a query

```bash
curl "localhost:9200/docs/_explain/1?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"body":"trails"}}}'
```

Expected: `"matched": false` — doc 1's body doesn't contain `trails` — and an
explanation of the non-match. `_explain/<id>` is how you answer "why isn't
*this specific* document showing up / scoring."

### 5. Field boost changes the winner

Search title and body for "running", first unboosted, then boosting title:

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"multi_match":{"query":"running","fields":["title","body"]}}}'
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"multi_match":{"query":"running","fields":["title^5","body"]}}}'
```

Expected: unboosted, doc 2 (tons of body mentions) may rank at or near the top.
With `title^5`, **doc 1** ("Running" is literally the whole short title) jumps
up, because a title match now counts five times as much. Same documents,
different ranking — deliberately reshaped.

### 6. Optional `should` boost for a preferred brand

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "bool": {
    "must":   [ { "match": { "body": "running" } } ],
    "should": [ { "term": { "brand": { "value": "Summit", "boost": 3 } } } ]
  }}}'
```

Expected: the Summit docs (1 and 3) get an additive score bump from the
matching `should` clause and rank higher than they did in exercise 2, without
excluding the Pace doc. Optional scoring = "prefer, don't require."

### 7. `function_score` with a rating factor

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "function_score": {
    "query": { "match": { "body": "running" } },
    "field_value_factor": { "field": "rating", "factor": 1.0, "modifier": "none" },
    "boost_mode": "multiply"
  }}}'
```

Expected: scores are now the text score **multiplied by** each doc's `rating`,
so the higher-rated docs (1 at 4.8, 3 at 4.2) get pushed above the low-rated
doc 2 (3.1) even though doc 2 has more term occurrences. Blending a business
signal (rating) with text relevance.

### 8. `function_score` recency decay

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "function_score": {
    "query": { "match": { "body": "running" } },
    "functions": [ { "gauss": { "created": { "origin": "now", "scale": "60d", "decay": 0.5 } } } ],
    "boost_mode": "multiply"
  }}}'
```

Expected: the 2024 doc (doc 2) is heavily penalized for age, while the recent
July/June 2026 docs keep most of their score. A Gaussian decay around "now"
implements "prefer recent" smoothly rather than as a hard cutoff.

### 9. `constant_score` / no-score sort

Fixed score for a filter, then a pure sorted list with no scoring:

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"constant_score":{"filter":{"term":{"brand":"Summit"}},"boost":1.0}}}'
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"term":{"brand":"Summit"}},"sort":[{"rating":"desc"}]}'
```

Expected: the first gives every Summit doc `_score: 1.0` (ranking is
meaningless — they're equal). The second returns `"_score": null` on each hit
because sorting by `rating` skips scoring entirely — the fast path when you
don't need relevance.

### 10. Diagnose and fix: a filter is silently reshaping relevance

A colleague wants "products matching 'running', preferring in-stock, but
in-stock shouldn't *exclude* anything and the text relevance should still
dominate." They wrote:

```bash
curl "localhost:9200/docs/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "bool": {
    "must": [ { "match": { "body": "running" } },
              { "term": { "brand": "Summit" } } ]
  }}}'
```

They complain that Pace documents vanished entirely and the scores look off.
Explain what's wrong versus their intent, and fix it two ways depending on
which behavior they actually want.

<details>
<summary>Answer</summary>

Putting `term brand=Summit` in **`must`** makes it a *required, scored* clause:
(a) it **excludes** every non-Summit doc — so the Pace doc disappears, which
they didn't want; and (b) it *adds to `_score`*, so it's also influencing
ranking, which they didn't want either. Two fixes depending on intent:

- If Summit should be **preferred but not required** (their stated goal): move
  it to `should` so matching it boosts rank but non-Summit docs still appear —
  `"should":[{"term":{"brand":{"value":"Summit","boost":2}}}]`, keeping only the
  `match` in `must`.
- If some condition (say `in_stock`) must **gate without affecting score**:
  put it in `filter` context, not `must` — it includes/excludes and contributes
  nothing to `_score` (and is cacheable). `must` is for clauses that should
  both match *and* rank; `filter` for pure gating; `should` for optional
  boosts. Choosing the wrong bucket is exactly this class of bug.

</details>

## Independent challenge

No query given.

**Task:** Build and justify a single relevance-tuned query for a product search
that satisfies all of these, and use `_explain` to *prove* the ordering is what
you intended:

1. The user's words are searched across `name` and `description`, with a name
   match worth clearly more than a description match.
2. Out-of-stock products are excluded entirely, but that exclusion must not
   affect the `_score` of the products that remain.
3. Higher-rated products should rank higher, all else equal.
4. Very old products should be gently pushed down but never removed.
5. Produce, for your top two results, a one-paragraph explanation — grounded in
   the `_explanation` output — of exactly why #1 outranked #2.

Reach back to module 02: the `name`/`description` fields must be `text` for the
`multi_match` to work, and reach back to this module's query-vs-filter-context
concept to place requirement 2 correctly.

<details>
<summary>Hint</summary>

One `function_score` wrapping a `bool`. Inside `bool`: `must` a `multi_match`
with `name^3, description`; `filter` a `term in_stock=true` (requirement 2 —
filter context gates without scoring). In `function_score.functions`: a
`field_value_factor` on `rating` (requirement 3) and a `gauss` decay on the
date with a large `scale` and `decay` near 1.0 so it's *gentle* (requirement 4);
`boost_mode: multiply`. Run with `"explain": true` and read the `idf`/`tf`/norm
plus the function multipliers to write requirement 5.

</details>

## Common mistakes & troubleshooting

- **Putting gating conditions in `must` instead of `filter`.** They then both
  exclude documents *and* perturb `_score`, and you lose caching. Gate in
  `filter`; rank in `must`/`should`.
- **Assuming a big field boost guarantees order.** Boosts are relative and
  interact with IDF/TF/length; a strong match on a rare term elsewhere can
  still win. Verify with `_explain`, don't just crank `^` numbers.
- **Expecting raw term counts to dominate.** BM25 saturates TF and normalizes
  by length, so a keyword-stuffed long document doesn't beat a concise on-topic
  one by the raw ratio. That's a feature.
- **Never reading `_explain`.** Tuning relevance by guessing is slow and
  wrong; the explanation tree tells you the exact contribution of each clause.
- **Using scoring when you don't need it.** A pure filtered list should use
  `filter` context and an explicit `sort` (score becomes `null`, faster) rather
  than a scored query you then re-sort.
- **`function_score` with the wrong `boost_mode`.** `multiply` vs `sum` vs
  `replace` produce very different rankings; if a signal seems to have no or
  too much effect, check `boost_mode` and the function's `factor`/`modifier`.

## Next

[04-aggregations-and-fuzzy-search](../04-aggregations-and-fuzzy-search/README.md)
— you can find documents and rank them well. Next you'll *summarize* them with
bucket and metric aggregations (the counts behind faceted navigation), add
**fuzzy** matching so `runing shoez` still finds the right products, and go
deep on the query-vs-filter-context distinction you met here — this time from
the performance and caching angle.
