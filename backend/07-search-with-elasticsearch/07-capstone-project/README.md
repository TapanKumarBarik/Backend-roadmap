# Module 07: Capstone Project

## Why this matters

Every module in this track taught one layer of search in isolation: standing up
a cluster and understanding the inverted index (00), designing mappings and
analyzers (01), writing term and full-text queries (02), tuning relevance with
BM25 and field boosts (03), building facets and typo-tolerant queries with
aggregations and fuzzy matching (04), paginating and bulk-loading at scale (05),
and operating the whole thing through Kibana with ILM and monitoring (06). Real
search work never arrives one concept at a time — it arrives as "build the
search behind this product, make it fast, relevant, and typo-forgiving, and be
able to operate it." This capstone is that.

There is no solution code here and no step-by-step script. You design and build
a complete search feature end to end, make the mapping and relevance trade-offs
yourself, and justify them. If you can build this without peeking back at the
earlier modules, you own this track. If you get stuck, the stuck *is the
signal* — go redo the exercises in whichever module the gap points to (each
requirement below names it), then come back.

## The project

Build the complete search backend for a **product catalog search experience** —
the kind of thing behind any store or marketplace where a shopper types into a
search box and expects relevant, typo-forgiving results with filters, facets,
and fast paging. You will ingest a real corpus, design its mapping, write and
tune the queries, build the faceted-navigation and autocomplete pieces, make it
fast under load, and operate it in Kibana.

Use Elasticsearch and Kibana in Docker — the same stack you've used all track —
and drive it from either curl/Kibana Dev Tools or a thin Python client
(`elasticsearch-py`); the search logic is the point, not the framing HTTP layer.
A products catalog is the suggested domain, but a job board, a movie database,
or a documentation/knowledge-base search are equally good — pick one and commit
to it.

### The corpus

Get a **real, non-trivial corpus** — at least a few thousand documents, ideally
tens of thousands so pagination and performance decisions actually bite (a
public products/movies/jobs dataset, or generate one). Each document should have
a mix of field types you have to think about: free-text fields (title,
description), exact-match/keyword fields (brand, category, SKU, status), numeric
fields (price, rating), and a date (created/updated). This heterogeneity is what
forces real mapping decisions (module 01) rather than letting dynamic mapping
guess for you.

### What you must build

1. **A deliberate mapping and analyzer design (module 01).** Turn off or tame
   dynamic mapping and define the index explicitly. Every field's type is a
   decision you can defend: `text` (analyzed, for full-text) vs `keyword` (exact,
   for filters/aggregations/sorting) vs the `text`-with-`keyword`-subfield
   pattern where you need both. Choose analyzers per field, and set your shard
   count deliberately for the corpus size (remember the over-sharding trap from
   module 00). Load the corpus with the **bulk API** (module 05), not one
   document at a time.

2. **Full-text search that behaves (modules 02-03).** The main search box runs a
   `multi_match` across the text fields with the right type (`best_fields` vs
   `cross_fields`) and a sensible `minimum_should_match`. Then **tune relevance**
   deliberately: boost the title over the description, and layer in at least one
   `function_score` or boosting signal that reflects a business goal (e.g.
   higher-rated or in-stock or more-recent items rank higher). You must be able
   to explain *why* a given result ranks where it does using `_explain` — not
   "the boost is bigger."

3. **Faceted navigation and typo tolerance (module 04).** Return **facets**
   alongside results using aggregations (e.g. counts by brand, by category, and a
   price-range or `stats` aggregation) so the UI can show "Brand (42)". Make the
   search **typo-tolerant** with fuzziness (`AUTO`) and/or a completion/edge-ngram
   **autocomplete** suggester, so `labtop` still finds laptops and typing `sam`
   suggests `Samsung`. Combine a full-text query with **filters** correctly —
   filters constrain, they don't score, and they're cacheable.

4. **Scalable pagination and performance (module 05).** Support both the
   shallow "page N of results" path and a **deep-scroll** path done correctly
   with `search_after` + a Point In Time (not `from`/`size` into the thousands —
   you must be able to say why deep `from` is a trap). **Profile** at least one
   slow query and make a measured improvement. Decide `_source` filtering / stored
   fields so you're not shipping payloads you don't render.

5. **Operability in Kibana (module 06).** Everything is reachable and
   observable: a Kibana **data view** over your index, a **dashboard** with a
   couple of visualizations built from your aggregations (top brands, price
   distribution, indexing/volume over time), and an **ILM policy** or documented
   index-lifecycle plan appropriate to the data. Know how to check cluster/index
   health and where you'd look when a query is slow.

6. **A short design doc (1-2 pages)** covering:
   - your mapping decisions — which fields are `text` vs `keyword` vs both, which
     analyzers, and your shard-count reasoning for this corpus size;
   - your relevance strategy — the field boosts and business-signal boost, with a
     worked `_explain` on one query showing the score breakdown;
   - how facets, filters, and typo-tolerance fit together in one query;
   - your pagination strategy and the one profiled/optimized query (before/after);
   - the operational picture — what the dashboard shows and your lifecycle plan.

### Acceptance checklist

Tick every box before you call it done:

- [ ] Elasticsearch and Kibana run in Docker; the whole thing stands up from a
      documented command sequence (or a `docker-compose.yml`), and the corpus
      loads via the **bulk API**.
- [ ] The index has an **explicit mapping** (not left to dynamic mapping), with
      each `text`/`keyword`/dual-field choice defensible, and a deliberately
      chosen shard count.
- [ ] The main search is a tuned `multi_match` with a justified type and
      `minimum_should_match`; searching a real phrase returns sensible results.
- [ ] Relevance is **deliberately boosted** (title over description **plus** at
      least one business signal), and you can produce an `_explain` that accounts
      for a result's rank.
- [ ] A results response returns **facets** (aggregation counts) usable by a UI,
      alongside the hits, in one request.
- [ ] Search is **typo-tolerant** (fuzziness and/or an autocomplete suggester):
      a misspelled query still finds the right documents; prefix typing suggests
      completions.
- [ ] Filters constrain results **without affecting score**, and can be combined
      with the full-text query.
- [ ] Deep pagination is implemented with **`search_after` + PIT** (no skips or
      dupes under concurrent indexing), and you can state why deep `from`/`size`
      is the wrong tool.
- [ ] At least one query is **profiled** and measurably improved; `_source`/field
      selection is deliberate.
- [ ] Kibana has a **data view and a dashboard** with visualizations built from
      your aggregations, plus an **ILM policy** or written lifecycle plan.
- [ ] The design doc exists and covers mapping, relevance (with a worked
      `_explain`), facets/filters/fuzzy, pagination, and operations.

### Hints

<details>
<summary>How do I stop dynamic mapping from making bad decisions?</summary>

Module 01: define the mapping explicitly before you index a single document, and
set `dynamic` to `strict` (or `false`) so a field you didn't plan for fails
loudly instead of becoming a silent, mistyped phantom field. The classic trap is
a field you filter/aggregate/sort on landing as `text` (analyzed) — it becomes
unusable for exact match. Use the `text` field with a `.keyword` sub-field when
you genuinely need both full-text search *and* exact filtering/sorting on the
same field (e.g. a brand you both search and facet by).

</details>

<details>
<summary>My boost is huge but the ranking still isn't what I want.</summary>

Module 03: boosts are **relative and multiplicative on top of BM25**, not
overrides — a big field boost doesn't guarantee order because BM25 already
saturates term frequency and normalizes for field length. Stop guessing and run
`_explain` on a document that's ranked wrong; it shows you exactly which clause
contributed what. For a business signal (rating, recency, in-stock), reach for
`function_score` with a `field_value_factor` or a decay function rather than
piling on query-time boosts, and tune the *modifier*/*factor* so the signal
nudges rather than dominates the text relevance.

</details>

<details>
<summary>How do facets, filters, and fuzziness live in one query?</summary>

Module 02/04: put the scoring full-text part (`multi_match`, with `fuzziness:
AUTO`) in the `must`/`should` of a `bool` query, and put the facet selections the
user clicked (brand = X, price ≤ Y) in `filter` — `filter` is a non-scoring,
cacheable context, which is both correct (a filter shouldn't change relevance)
and fast. Compute the facets themselves with `aggs` in the same request; note the
subtlety that an aggregation over the *filtered* result set counts differently
from one that ignores the current facet selection — decide which behaviour your
UI wants (often a `filter`/`post_filter` split).

</details>

<details>
<summary>Autocomplete vs fuzziness — which do I need?</summary>

Module 04: they solve different problems. **Fuzziness** (`AUTO`) forgives typos
in a submitted search (`labtop` → `laptop`). **Autocomplete** suggests
completions as the user types the first few characters (`sam` → `Samsung`) and
is best served by a completion suggester or an `edge_ngram` analyzer on a
dedicated field — *not* by running a wildcard/prefix query, which doesn't scale.
A polished search box usually has both. Build the one your acceptance box needs
first, then add the other if time allows.

</details>

<details>
<summary>Why is deep pagination a trap, and what do I do instead?</summary>

Module 05: `from: 10000, size: 10` forces every shard to produce the top 10,010
and the coordinating node to sort and discard 10,000 — cost grows with page
depth and eventually hits `index.max_result_window`. For deep scroll (export,
infinite scroll), sort by a tiebroken key and page with **`search_after`** using
the last hit's sort values, anchored to a **Point In Time** so the result set
doesn't shift under you while indexing continues. Keep classic `from`/`size` only
for the first handful of shallow pages a human actually clicks.

</details>

## Further reading & sources

- [Search your data](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-your-data.html) - the reference hub tying together queries, aggregations, pagination, and highlighting for a full search feature.
- [Query DSL](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html) - the complete query language you'll assemble the `multi_match` + `bool` + `function_score` search from.
- [Completion suggester](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-suggesters.html#completion-suggester) - the autocomplete-oriented option for the type-ahead requirement.
- [Elasticsearch: The Definitive Guide](https://www.elastic.co/guide/en/elasticsearch/guide/current/index.html) - the free book-length treatment covering mapping, relevance, and aggregations end to end.
- [Tune for search speed](https://www.elastic.co/guide/en/elasticsearch/reference/current/tune-for-search-speed.html) - practical levers for the profile-and-optimize requirement.
- [Set up a data stream](https://www.elastic.co/guide/en/elasticsearch/reference/current/set-up-a-data-stream.html) - the modern ILM-backed lifecycle pattern for the operability deliverable.

## Next

You've completed **07-search-with-elasticsearch** — you can now design a mapping,
write relevance-tuned and typo-tolerant full-text queries with facets, paginate
and load at scale, and operate the cluster in Kibana. Head back to the track
index and the master curriculum to pick your next track:

- Track index: [../README.md](../README.md)
- Master curriculum: [../../README.md](../../README.md)

The natural next step is
**[08-observability-and-operational-readiness](../../08-observability-and-operational-readiness/README.md)** —
having built systems that store, move, and now *search* data, you turn to seeing
inside them in production: structured logging, metrics, tracing, error handling,
and graceful shutdown.
