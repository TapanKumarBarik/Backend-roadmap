# Module 02: Basic and Full-Text Search

## Why this matters

Everything so far has been setup: standing up a cluster (00) and defining how
fields are stored (01). Now you actually *search*. And the very first thing
you'll hit is the confusion that module 00 warned you about and module 01 set
up: **why does searching for `Running` sometimes find a document and sometimes
find nothing, on what looks like the same data?**

The answer is **analysis** — the text-processing pipeline that turns a string
into the terms stored in the inverted index. Both the *document* (at index
time) and your *query* (at search time) go through analysis, and matching
happens on the resulting *terms*, not on the strings you typed. If the two
sides don't produce the same terms, you get zero results and it feels like a
bug. Once you understand analysis, 90% of "why doesn't my search work" evaporates,
and the difference between a `term` query and a `match` query — the two you'll
reach for most — becomes obvious rather than arbitrary. This module is the
conceptual heart of using Elasticsearch as a search engine.

## Concepts

### Analysis: how a string becomes terms

When you index a value into a `text` field, Elasticsearch runs it through an
**analyzer**, which has three stages:

1. **Character filters** (optional) — transform the raw text before
   tokenizing, e.g. strip HTML tags, or map `&` → `and`.
2. **Tokenizer** (exactly one) — splits the stream into **tokens**. The
   standard tokenizer splits on whitespace and punctuation and drops most
   punctuation: `"The Quick-Brown Fox!"` → `[The, Quick, Brown, Fox]`.
3. **Token filters** (zero or more) — transform the tokens. The standard
   analyzer's key filter **lowercases** everything: `[the, quick, brown, fox]`.
   Others can remove **stop words** (`the`, `a`, `is`), apply **stemming**
   (reduce words to a root), add synonyms, etc.

The output tokens are the **terms** that go into the inverted index. So the
document `"The Quick Brown Fox"` in a field using the **standard analyzer** (the
default for `text`) is stored as the terms `[the, quick, brown, fox]` — note the
lowercasing.

```
  "The Quick-Brown Fox!"
        │
   char filters  ─► (optional) strip HTML, map & → and
        │
   tokenizer     ─► [The] [Quick] [Brown] [Fox]
        │
   token filters ─► lowercase (+ optional stopwords / stemming)
        ▼
   indexed terms ─► [the] [quick] [brown] [fox]
```

The crucial, non-obvious rule: **the same analysis is applied to your query
text at search time** (for analyzed queries like `match`). So when you `match`
the query string `"Brown"`, it's analyzed to the term `brown`, which matches
the stored term `brown`. That's *why* case doesn't matter for `match` on a
`text` field: both sides are lowercased by the same analyzer. This symmetry is
the whole game.

### `term` vs `match`: the two query families you must not confuse

This is module 02's version of module 01's `text`/`keyword` distinction, and
the two pairs line up:

**`term` query — NOT analyzed.** It looks for your value as an *exact term* in
the inverted index, with no processing. `term` is for **`keyword` fields** and
other exact types (numbers, booleans, dates). Use it for `status = "shipped"`,
`sku = "TRS-100"`, `in_stock = true`.

The classic trap: running a `term` query against a **`text`** field with a
capital or multi-word value. If you `term`-search `name` (a `text` field) for
`"Running"`, ES looks for the *exact term* `Running` — but analysis stored the
term as lowercase `running`, so you get **zero hits**. The value wasn't
analyzed on the query side (term never analyzes), but it *was* on the index
side. Mismatch → nothing. This single mistake accounts for an enormous share of
"my search is broken" reports.

**`match` query — ANALYZED.** It runs your query text through the field's
analyzer, producing terms, then looks those terms up. `match` is for **`text`
fields** — full-text search. `match "Running Shoes"` on a `text` field analyzes
to `[running, shoes]` and finds documents containing *either* term (by default,
OR), scored by relevance. Because both sides go through the same analyzer, case
and punctuation stop mattering and word order is flexible.

Line them up:

| | Analyzed? | Use on | Answers |
|---|---|---|---|
| `term` | No — exact | `keyword`, numbers, dates, booleans | "is this field *exactly* X?" |
| `match` | Yes — via analyzer | `text` | "does this text *contain* these words?" |

Mnemonic: **`term` for `keyword`, `match` for `text`.** If you remember only
one thing from this module, remember that pairing.

```
  text field "name" indexed as: [running] [shoes]   (analyzer lowercased them)

  match "Running" ─► analyzed ─► [running]  ─► term exists ─► HIT ✓
  term  "Running" ─► NOT analyzed ─► "Running" ─► no such term ─► 0 hits ✗
```

### `match` in depth: operator, and why word order is flexible

By default `match` combines its analyzed terms with **OR**: `match "trail
running"` matches docs containing `trail` *or* `running` (a doc with just
`running` still matches, scored lower than one with both). You can require all
terms:

```json
{ "query": { "match": { "name": { "query": "trail running", "operator": "and" } } } }
```

Now only docs containing *both* `trail` and `running` match. There's also
`minimum_should_match` for "at least N of the terms."

Because `match` matches on independent terms, **word order and adjacency don't
matter** — `"running trail"` matches `"trail running shoes"` just fine. When
order/adjacency *does* matter (you want the phrase "trail running" as a
contiguous unit, not `trail ... running` scattered), use a **`match_phrase`**
query, which requires the terms in sequence:

```json
{ "query": { "match_phrase": { "description": "trail running" } } }
```

`match_phrase` relies on the token *positions* the analyzer records, and only
matches when the terms appear adjacent and in order. Great for exact-phrase
search; too strict for general search boxes.

### Stemming, stop words, and why analyzer choice changes results

The **standard** analyzer lowercases and tokenizes but does **not** stem and
does **not** remove stop words (in recent versions the standard analyzer keeps
stop words). So with the standard analyzer, `run`, `running`, and `runs` are
three *different* terms — a `match` for `run` will **not** find a document that
only says `running`.

The **`english`** analyzer adds English-specific token filters: it **stems**
(`running`, `runs`, `ran` → roughly `run`) and removes English **stop words**
(`the`, `a`, `of`, `is`). Under the `english` analyzer, a `match` for `run`
*does* find `running`, because both reduce to the stem `run`. This is why
**the analyzer you choose changes which documents match** — the exact behavior
module 00 promised you'd understand.

The catch and the lesson: **the query is analyzed with the field's analyzer.**
If the `description` field was indexed with the `english` analyzer, your `match`
query text is *also* run through `english` (stemmed the same way), so the two
sides line up. But if you indexed with `standard` and then expect stemming, it
won't happen — and if you index with one analyzer and (via a custom
`search_analyzer`) search with an incompatible one, terms won't line up and
you'll get surprising misses. **Index-time and search-time analysis must agree**
for matching to work; they do by default because the field's analyzer is used
for both.

You set a field's analyzer in the mapping:

```json
{ "mappings": { "properties": {
  "description": { "type": "text", "analyzer": "english" }
}}}
```

### The `_analyze` API: your debugging superpower

Whenever a search returns unexpected results, **don't guess about analysis —
inspect it.** The `_analyze` API shows you exactly what terms a piece of text
produces under a given analyzer. This turns "why doesn't `Running` match" from
a mystery into a two-command investigation: analyze the document value, analyze
the query value, compare the term lists. If they don't overlap, that's your
answer. You'll use `_analyze` constantly; treat it as the `EXPLAIN` of search.

### Structured filters alongside full-text (a preview)

Real search is rarely pure text — it's "documents matching these words *and*
`in_stock = true` *and* `price < 200`." You combine a full-text `match` with
exact filters using a **`bool`** query (`must` for scoring clauses, `filter`
for non-scoring exact conditions). We introduce `bool` here just enough to
combine a `match` with a `term`/`range`; module 04 goes deep on *why* the
`filter` context is faster and cacheable, and module 03 on how the scoring
clauses rank results.

## Command reference

| Query / API | Purpose | Notes |
|---|---|---|
| `match` | Full-text search on `text` | Analyzes query, OR by default |
| `match` + `"operator":"and"` | Require all terms | |
| `match_phrase` | Phrase (terms adjacent, in order) | Uses token positions |
| `term` | Exact term match | For `keyword`/number/bool/date — never analyzed |
| `terms` | Match any of several exact values | `{"terms":{"status":["a","b"]}}` |
| `range` | Numeric/date range | `gte/gt/lte/lt` |
| `multi_match` | `match` across several fields at once | `"fields":["name","description"]` |
| `bool` | Combine clauses (`must`/`filter`/`should`/`must_not`) | |
| `_analyze` | Show terms a text produces under an analyzer | The debugging tool |

Query DSL examples (curl):

```bash
# full-text match on a text field
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "match": { "name": "trail running" } }
}'

# exact match on a keyword field
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "term": { "brand": "Summit" } }
}'

# phrase (adjacent, in order)
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "match_phrase": { "description": "trail running" } }
}'

# combine full-text with exact filters
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": {
    "bool": {
      "must":   [ { "match": { "name": "running" } } ],
      "filter": [ { "term": { "in_stock": true } },
                  { "range": { "price": { "lte": 140 } } } ]
    }
  }
}'

# inspect analysis — THE debugging tool
curl "localhost:9200/_analyze?pretty" -H 'Content-Type: application/json' -d '{
  "analyzer": "standard",
  "text": "The Quick-Brown FOXES!"
}'
```

Python (`elasticsearch-py`):

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")

# full-text
r = es.search(index="products", query={"match": {"name": "trail running"}})
for h in r["hits"]["hits"]:
    print(round(h["_score"], 3), h["_source"]["name"])

# analyze to debug term production
print([t["token"] for t in
       es.indices.analyze(analyzer="english", text="Running runners ran")["tokens"]])
# -> ['run', 'runner', 'ran']  (english stems; note 'ran' isn't fully reduced)
```

## Hands-on exercises

Recreate a clean `catalog` index so analyzer behavior is unambiguous. Note the
two `text` fields use *different* analyzers on purpose.

### 1. Create an index with two different analyzers

```bash
curl -XDELETE "localhost:9200/catalog"
curl -XPUT "localhost:9200/catalog" -H 'Content-Type: application/json' -d '{
  "mappings": { "properties": {
    "name":        { "type": "text", "analyzer": "standard" },
    "description": { "type": "text", "analyzer": "english" },
    "brand":       { "type": "keyword" },
    "price":       { "type": "scaled_float", "scaling_factor": 100 },
    "in_stock":    { "type": "boolean" }
  }}}'
```

### 2. Index sample documents

```bash
curl -XPOST "localhost:9200/catalog/_bulk" -H 'Content-Type: application/json' -d '
{"index":{"_id":1}}
{"name":"Trail Running Shoes","description":"Lightweight shoes built for running on trails","brand":"Summit","price":129.99,"in_stock":true}
{"index":{"_id":2}}
{"name":"Road Runner Sneakers","description":"Cushioned sneakers for runners who run roads","brand":"Pace","price":149.50,"in_stock":false}
{"index":{"_id":3}}
{"name":"Hiking Boots","description":"Waterproof boots for mountain hikes","brand":"Summit","price":179.00,"in_stock":true}
'
curl -XPOST "localhost:9200/catalog/_refresh"
```

Expected: `_bulk` returns `"errors":false`. (You'll formalize the bulk API in
module 05; here it's just a fast way to load three docs.)

### 3. Inspect analysis to *predict* matching

Before searching, see the terms each analyzer produces:

```bash
curl "localhost:9200/catalog/_analyze?pretty" -H 'Content-Type: application/json' -d '{"field":"name","text":"Trail Running Shoes"}'
curl "localhost:9200/catalog/_analyze?pretty" -H 'Content-Type: application/json' -d '{"field":"description","text":"built for running on trails"}'
```

Expected: `name` (standard) → `[trail, running, shoes]` (lowercased, **not**
stemmed). `description` (english) → roughly `[built, run, trail]` (`running`
stemmed to `run`, `for`/`on` removed as stop words). Write down the difference —
it predicts the next two exercises.

### 4. `match` finds by any word, case-insensitively

```bash
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"name":"RUNNING shoes"}}}'
```

Expected: doc 1 (`Trail Running Shoes`) is the top hit; the uppercase `RUNNING`
still matched because `match` analyzed it to `running`. Doc 3 (`Hiking Boots`)
doesn't match at all.

### 5. Diagnose and fix: `term` on a `text` field returns nothing

```bash
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"term":{"name":"Running"}}}'
```

You get **zero hits** even though doc 1 obviously contains "Running". Explain
precisely why, and give two different correct queries that *do* find it.

<details>
<summary>Answer</summary>

`term` does **not** analyze its input — it looks for the exact term `Running`
(capital R) in the inverted index. But the `name` field's standard analyzer
lowercased the document's tokens to `running`, so the term `Running` does not
exist in the index → zero hits. The index side was analyzed; the query side
(term) was not; the two don't line up. Two fixes: (a) use `match`, which
analyzes the query so `Running` → `running` and matches:
`{"match":{"name":"Running"}}`; (b) if you truly need an exact term match, do
it against a `keyword` (sub-)field with the value as-stored, e.g. lowercase it
yourself, or query `term` on `name` with the lowercased value `"running"`
(which works, but you almost certainly wanted `match`). The real lesson:
**`term` is for `keyword`; use `match` for `text`.**

</details>

### 6. See stemming change the result set

Search the **english**-analyzed `description` for the singular/root word:

```bash
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"description":"run"}}}'
```

Expected: docs 1 and 2 both match — even though doc 1 says "running" and doc 2
says "run"/"runners". The `english` analyzer stemmed `running`, `runners`, and
`run` all toward the stem `run`, so a query for `run` finds them all. Now try
the same word on the **standard**-analyzed `name`:

```bash
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"name":"run"}}}'
```

Expected: **zero hits** — `name` uses the standard analyzer (no stemming), so
its terms are `running`/`runner`, and `run` is a different term. Same word, same
data, opposite result — because of the analyzer. That's the module in one
comparison.

### 7. `match_phrase` vs `match` — adjacency matters

```bash
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"description":"running trails"}}}'
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match_phrase":{"description":"running trails"}}}'
```

Expected: the `match` finds doc 1 (contains both stems, order irrelevant). The
`match_phrase` for "running trails" likely **doesn't** match doc 1, whose text
is "running on trails" — the stemmed terms `run` and `trail` aren't adjacent
(there's `on` between them, and phrase matching respects positions). Try
`match_phrase` for `"running on trails"` and it matches. Phrase = order +
adjacency.

### 8. Combine full-text with structured filters (`bool`)

"In-stock products under 160 that match 'running'":

```bash
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "bool": {
    "must":   [ { "match": { "description": "running" } } ],
    "filter": [ { "term": { "in_stock": true } },
                { "range": { "price": { "lte": 160 } } } ]
  }}}'
```

Expected: doc 1 only (doc 2 matches the text but `in_stock:false`; doc 3 isn't
about running). The `must` clause scores; the `filter` clauses just include/
exclude without affecting `_score` (module 04 explains why that's faster).

### 9. `multi_match` across fields

Users type into one box; search both `name` and `description`:

```bash
curl "localhost:9200/catalog/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "multi_match": {
    "query": "waterproof running",
    "fields": ["name", "description"]
  }}}'
```

Expected: doc 3 (`waterproof` in its description) and the running docs all
match; each document is scored by its best-matching field. `multi_match` is the
workhorse for a single search box over several fields (you'll tune per-field
boosts in module 03).

### 10. Diagnose and fix: analyzer mismatch produces zero results

A colleague built an autocomplete-ish index and can't understand why an exact
lowercase query misses:

```bash
curl -XPUT "localhost:9200/tags" -H 'Content-Type: application/json' -d '{
  "mappings": { "properties": { "label": { "type": "keyword" } } }
}'
curl -XPOST "localhost:9200/tags/_doc/1?refresh=true" -H 'Content-Type: application/json' -d '{"label":"Trail Running"}'
curl "localhost:9200/tags/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"match":{"label":"trail running"}}}'
```

The `match` returns **zero hits**. Use `_analyze` to prove the cause, then give
the correct query *and* the mapping change that would make `match` work as they
expected.

<details>
<summary>Answer</summary>

`label` is a **`keyword`** field, so it is **not analyzed** — the whole value
is stored as the single term `"Trail Running"` (original case, one token). The
`match` query analyzes `"trail running"` into `[trail, running]` and looks for
those terms — neither of which exists in the index (the only term is the
literal `"Trail Running"`), so zero hits. Prove it:
`GET /tags/_analyze {"field":"label","text":"Trail Running"}` returns a single
token `Trail Running`, confirming no tokenization. Correct query for the current
mapping: an exact `term` on the full value —
`{"term":{"label":"Trail Running"}}` (must match case exactly too). If they
actually want word-level, case-insensitive full-text on `label`, the field
should be `text` (or add a `text` multi-field), and then `match` works. This is
the mirror image of exercise 5: there a `term` was wrongly used on `text`; here
a `match` is wrongly used on `keyword`. **`term`↔`keyword`, `match`↔`text`.**

</details>

## Independent challenge

No queries given.

**Task:** Using the `catalog` index (or rebuild it), demonstrate — with
evidence from the `_analyze` API, not just search results — the following, and
write a one-sentence explanation of each:

1. A single search query that finds a document by a word it *doesn't literally
   contain* (e.g. finds "running" documents when the user typed "ran"), and
   explain via `_analyze` why it works.
2. A query that *looks* like it should match but returns nothing purely because
   of a `term`/analyzer mismatch — then the corrected version.
3. A search over a single box that queries three fields at once and requires
   that *all* the user's words appear (not just any).

Reach back to module 01: explain which of your fields must be `text` vs
`keyword` for each of the above to be possible, and why the `english` analyzer
choice from this module is what makes requirement 1 achievable at all.

<details>
<summary>Hint</summary>

For (1), the `english`-analyzed `description` stems `ran`/`running`/`runs`
toward a shared root, so `match "ran"` on it can hit a "running" doc; prove it
with `_analyze analyzer=english text="ran running runs"` and compare tokens.
For (2), reuse the exercise-5 shape: a `term` on a `text` field with a
capitalized value returns nothing; the fix is `match` (or `term` on a `keyword`
sub-field with the exact stored value). For (3), `multi_match` with
`"operator":"and"` (or `"type":"cross_fields"`) over `["name","description"]`.

</details>

## Common mistakes & troubleshooting

- **`term` on a `text` field.** Returns nothing because `term` isn't analyzed
  but the stored terms were (lowercased/tokenized). Use `match` for `text`, or
  `term` on a `keyword` field. This is the single most common cause of
  "zero results on data I can see."
- **`match` on a `keyword` field expecting word-level matching.** The value is
  one un-tokenized term, so multi-word `match` won't line up. Make the field
  `text` (or a `text` multi-field) if you want word matching.
- **Expecting stemming from the standard analyzer.** Standard lowercases and
  tokenizes but doesn't stem; `run` won't match `running`. Use the `english`
  (or another language) analyzer if you want stemming.
- **Not using `_analyze` when debugging.** Guessing about term production
  wastes hours. Analyze the document value and the query value; compare the
  term lists. It's the `EXPLAIN` of search.
- **`match_phrase` where `match` was wanted (or vice versa).** Phrase requires
  adjacency/order and will miss scattered words; plain `match` ignores order.
  Pick based on whether the phrase must be contiguous.
- **Assuming index-time and search-time analysis can differ freely.** They must
  produce compatible terms or matching fails; by default the field's analyzer
  is used for both, which is what keeps them aligned.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Describe the three stages of an analyzer and give the terms the *standard*
   analyzer produces from `"The Quick-Brown FOX!"`.
2. State the `term`↔`match` rule and explain why a `term` query for `"Running"`
   on a standard-analyzed `text` field returns zero hits.
3. Why is a `match` query case-insensitive on a `text` field, mechanically?
   (Name what happens to *both* the document and the query.)
4. What does the `english` analyzer do that the `standard` analyzer doesn't,
   and how does that change which documents a `match "run"` finds?
5. When would you use `match_phrase` instead of `match`, and what analyzer
   feature does it rely on?
6. You get unexpected search results. Which single API do you reach for first,
   and what exactly do you compare with it?

<details>
<summary>Answers</summary>

1. Character filters (transform raw text, e.g. strip HTML) → tokenizer (split
   into tokens, one tokenizer) → token filters (transform tokens, e.g.
   lowercase, stop words, stemming). Standard analyzer on `"The Quick-Brown
   FOX!"` → `[the, quick, brown, fox]` (split on whitespace/punctuation,
   lowercased, no stemming).
2. `term` for `keyword`/exact types, `match` for `text`. `term` doesn't analyze
   its input, so it looks for the literal term `Running`; but the field's
   analyzer lowercased the stored token to `running`, so `Running` isn't in the
   index → zero hits.
3. `match` runs the query through the same analyzer as the field, so both the
   indexed document and the query text are lowercased to the same terms; the
   comparison is term-to-term on already-lowercased terms, so original case is
   irrelevant.
4. The `english` analyzer stems words to a root (`running`/`runs`/`ran` → ~
   `run`) and removes English stop words. So `match "run"` on an
   english-analyzed field also finds documents that only contain `running` or
   `runs`; on a standard-analyzed field those are distinct terms and `run`
   misses them.
5. Use `match_phrase` when the words must appear adjacent and in order (an exact
   phrase like "trail running"), not scattered. It relies on the token
   **positions** the analyzer records.
6. The `_analyze` API. Compare the terms produced from the document's field
   value against the terms produced from your query text (under the same
   analyzer); if they don't overlap, that mismatch is why nothing matched.

</details>

## Further reading & sources

- [Text analysis](https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis.html) - the reference on analyzers, char filters, tokenizers, and token filters.
- [match query](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-query.html) - full-text matching, `operator`, and `minimum_should_match`.
- [term query](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-term-query.html) - exact-term matching and the standard warning against using it on `text` fields.
- [Analyze API](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-analyze.html) - the `_analyze` endpoint for inspecting exactly which terms text produces.
- [match_phrase query](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-query-phrase.html) - position-aware phrase matching for adjacent, in-order terms.
- [Boolean query](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-bool-query.html) - combining `must`/`should`/`filter`/`must_not` clauses.

## Next

[03-relevance-scoring-and-boosting](../03-relevance-scoring-and-boosting/README.md)
— you can now find the right documents. Next: getting them in the right
*order*. You'll learn how BM25 turns matches into a `_score`, how to read
`_explain` to see exactly why one result outranks another, and how to boost
fields and clauses to shape relevance deliberately.
