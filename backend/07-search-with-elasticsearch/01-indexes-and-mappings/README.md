# Module 01: Indexes and Mappings

## Why this matters

In track 04 you never got to skip schema design — `CREATE TABLE` forced you to
declare every column's type up front, and getting a type wrong (storing a
number as `TEXT`) produced obvious, immediate pain. Elasticsearch is more
forgiving on the surface and far more dangerous because of it: you can `POST` a
JSON document to an index that doesn't exist yet, and Elasticsearch will
happily create the index *and* guess a schema (a **mapping**) from your first
document. It feels magical. It is also how most real Elasticsearch relevance
and aggregation bugs are born.

The mapping is the schema of an index: it declares each field's **type**, and
the type decides *how the field is stored, whether it's analyzed into terms,
whether you can aggregate or sort on it, and how it can be searched.* The
single most consequential decision in this entire track is understanding the
**`text` vs `keyword`** distinction — get it wrong and either your full-text
search returns nothing or your "group by category" aggregation explodes into
thousands of meaningless buckets. This module is where you take control of the
schema instead of letting Elasticsearch guess, and where you learn why the
guess is so often wrong.

## Concepts

### An index, and why you define its mapping deliberately

An **index** is the top-level container for related documents — the rough
analog of a table (module 00). Its **mapping** is the definition of its fields
and their types, analogous to a table's column definitions. You can create an
index and its mapping explicitly:

```json
PUT /products
{
  "mappings": {
    "properties": {
      "name":  { "type": "text" },
      "sku":   { "type": "keyword" },
      "price": { "type": "double" },
      "in_stock": { "type": "boolean" }
    }
  }
}
```

The key idea: **you should almost always define the mapping before indexing
data**, because the mapping controls behavior you can't easily change later.
Most field mappings are **immutable once created** — you cannot change
`name` from `text` to `keyword` on an existing field. To "change" it you create
a new index with the corrected mapping and **reindex** the data into it (a
first-class operation, `_reindex`, covered in the exercises). This immutability
is exactly why guessing is dangerous: a bad guess bakes in until you reindex.

### `text` vs `keyword`: the distinction everything hinges on

These are two completely different string types with opposite purposes.
Confusing them is the number-one Elasticsearch mistake, so slow down here.

**`text`** is for **full-text search** — human-readable prose you want to
*search within*. A `text` field is run through an **analyzer** (module 02) at
index time: the string is lowercased, split into tokens, and possibly stemmed,
and those *terms* go into the inverted index. `"The Quick Brown Fox"` in a
`text` field becomes the terms `[the, quick, brown, fox]`. This is what lets
`match` queries find the document by any of those words in any order. But
because the original string was shredded into terms:

- You generally **cannot sort or aggregate** on a `text` field (it's disabled
  by default — the terms aren't the original value, and aggregating on
  fielddata is memory-expensive and usually meaningless).
- You cannot match the whole value exactly as a unit easily.

**`keyword`** is for **exact-value, structured strings** — identifiers, status
codes, tags, enum-like categories, email addresses. A `keyword` field is **not
analyzed**: the entire string is stored as a *single term*, verbatim.
`"Running Shoes"` in a `keyword` field is the single term `"Running Shoes"` —
not split, not lowercased. This is exactly what you want for:

- **Exact match** (`term` query): `status = "shipped"`.
- **Aggregations**: "count products per category" needs each category to be one
  indivisible bucket — `keyword` gives you that. On a `text` field the same
  aggregation would (if enabled) bucket by individual *words*.
- **Sorting**: sort by `sku` or `last_name.keyword`.

Rule of thumb: **if a human reads it as a sentence and searches within it →
`text`. If a machine matches it exactly, or you group/sort/filter by its whole
value → `keyword`.** A product *name* is usually `text` (users search "brown
fox"), a product *SKU*, *brand*, *status*, or *category* is `keyword`.

### The multi-field pattern: having it both ways

Very often you need both behaviors for the same field. A product name should be
**full-text searchable** ("wireless headphones") *and* **sortable/aggregatable**
(sort alphabetically, or facet by exact name). You don't choose — you index the
field two ways at once using a **multi-field** (`fields`):

```json
PUT /products
{
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "fields": {
          "raw": { "type": "keyword" }
        }
      }
    }
  }
}
```

Now the same source value is stored twice: `name` is analyzed `text` (use it in
`match` queries), and `name.raw` is an un-analyzed `keyword` (use it to sort or
aggregate). This is *the* idiomatic Elasticsearch pattern and you'll use it
constantly. In fact, dynamic mapping (below) creates this pattern automatically
for strings — a field `name` becomes `text` with a `name.keyword` sub-field —
which is convenient but has a sharp edge worth knowing.

### Dynamic mapping and its pitfalls

If you index a document into an index with no explicit mapping for a field,
Elasticsearch **dynamically** infers a type from the value:

| JSON value | Guessed type |
|---|---|
| `"hello world"` | `text` with a `.keyword` sub-field |
| `42` | `long` |
| `42.5` | `float`/`double` |
| `true` | `boolean` |
| `"2026-07-27"` | `date` (date detection is on by default!) |
| `"2026-07-27T10:00:00Z"` | `date` |

Convenient, but the pitfalls are real and common:

- **Date detection surprises.** A string that *looks* like a date is mapped as
  `date`. So a field that sometimes holds `"2026-01-01"` and sometimes holds
  `"N/A"` will map as `date` from the first doc, then **reject** the `"N/A"`
  document with a mapping-parse error. A product "version" field like
  `"2020"` might become a date, not text.
- **Type locked by the first document.** If the first document has
  `"price": 9` (integer → `long`) and a later one has `"price": 9.99`, the
  later float may be truncated or rejected depending on settings — the type was
  fixed by the first doc's shape.
- **Mapping explosion.** If documents contain unpredictable keys (e.g. you
  index a big blob of user-supplied JSON, or use dynamic keys like
  `metrics.<hostname>`), Elasticsearch keeps adding fields to the mapping — one
  per distinct key — until you hit the field limit (default 1000) and indexing
  starts failing. Logs and telemetry pipelines hit this constantly.
- **The `text`+`keyword` default may not be what you want.** A giant blob of
  body text gets a useless `body.keyword` sub-field that (a) wastes space and
  (b) errors if the value exceeds `ignore_above` (256 chars by default the
  `.keyword` simply isn't indexed for that doc — a silent gotcha when you later
  try to aggregate on it and some values are missing).

You control this with the `dynamic` setting on the mapping:

- `"dynamic": true` (default) — add new fields automatically.
- `"dynamic": "runtime"` — add them as *runtime fields* (queryable, not indexed
  — cheaper, no mapping explosion).
- `"dynamic": "false"` — ignore unknown fields (store in `_source`, but not
  indexed/searchable — they silently won't be findable).
- `"dynamic": "strict"` — **reject** documents with unknown fields. This is the
  safest choice for a well-understood schema: it turns "silently unsearchable"
  into a loud error you'll actually notice.

The professional default: **define your mapping explicitly and set
`dynamic: strict` (or at least `false`)** for indexes with a known shape, so a
typo'd field name (`titel` instead of `title`) fails loudly instead of silently
becoming an unsearchable field.

### Numeric, date, and other core types (briefly)

Beyond strings, the common types you'll declare:

- Numeric: `long`, `integer`, `short`, `byte`, `double`, `float`,
  `scaled_float` (stores a float as a scaled long — great for prices/money).
- `date` — stored as a `long` (ms since epoch) internally; accepts multiple
  formats via the `format` option.
- `boolean`.
- `object` — nested JSON becomes dot-path fields (`author.name`) — flattened by
  default.
- `nested` — for arrays of objects where you must preserve which sub-values go
  together (a subtlety about arrays of objects "losing" their pairing; you'll
  meet it if you index arrays of objects and need to query them as units).
- Specialized: `ip`, `geo_point`, `completion` (autocomplete — capstone),
  `dense_vector` (semantic search — beyond this track).

For money, prefer `scaled_float` with a `scaling_factor` of 100 (store cents
precisely) rather than `float`, echoing the track-04 lesson about never storing
money as a naive float.

## Command reference

| Action | REST | Notes |
|---|---|---|
| Create index with mapping | `PUT /products` + body | Define mapping up front |
| View an index's mapping | `GET /products/_mapping` | See what ES actually stored/guessed |
| Add a field to existing mapping | `PUT /products/_mapping` + body | Can *add* fields, not change existing ones |
| Check a specific field | `GET /products/_mapping/field/name` | |
| Delete an index | `DELETE /products` | Irreversible |
| Reindex into a new index | `POST /_reindex` + `{source,dest}` | The way to "change" a mapping |
| See how text would be analyzed | `POST /products/_analyze` | Preview tokenization (module 02) |

Explicit mapping with the multi-field pattern and strict dynamic control, via
curl:

```bash
curl -XPUT "localhost:9200/products" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "name":     { "type": "text",
                    "fields": { "raw": { "type": "keyword" } } },
      "sku":      { "type": "keyword" },
      "brand":    { "type": "keyword" },
      "category": { "type": "keyword" },
      "description": { "type": "text" },
      "price":    { "type": "scaled_float", "scaling_factor": 100 },
      "in_stock": { "type": "boolean" },
      "created":  { "type": "date" }
    }
  }
}'
```

The same in Python (`elasticsearch-py`):

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")

mapping = {
    "dynamic": "strict",
    "properties": {
        "name":     {"type": "text", "fields": {"raw": {"type": "keyword"}}},
        "sku":      {"type": "keyword"},
        "brand":    {"type": "keyword"},
        "category": {"type": "keyword"},
        "description": {"type": "text"},
        "price":    {"type": "scaled_float", "scaling_factor": 100},
        "in_stock": {"type": "boolean"},
        "created":  {"type": "date"},
    },
}

# create_if_missing pattern
if not es.indices.exists(index="products"):
    es.indices.create(index="products", mappings=mapping)

print(es.indices.get_mapping(index="products"))
```

## Hands-on exercises

Use the cluster from module 00 (`docker compose up -d`).

### 1. Watch dynamic mapping guess (the thing you're learning to avoid)

Index into a brand-new index with no mapping, then inspect what ES invented:

```bash
curl -XPOST "localhost:9200/guessed/_doc/1" -H 'Content-Type: application/json' -d '{
  "title": "Wireless Headphones",
  "price": 79,
  "released": "2026-07-27",
  "tags": "audio"
}'
curl "localhost:9200/guessed/_mapping?pretty"
```

Expected: `title` → `text` **with** a `title.keyword` sub-field; `price` →
`long` (because you sent `79`, an integer!); `released` → `date` (date
detection); `tags` → `text`+`keyword`. Note the two things already wrong for a
real catalog: `price` is a `long` (so `79.99` later will be trouble) and every
string carries a `.keyword` you may not want.

### 2. Feel the "type locked by first doc" trap

```bash
curl -XPOST "localhost:9200/guessed/_doc/2" -H 'Content-Type: application/json' -d '{
  "title": "Cheap Cable",
  "price": 4.99
}'
```

Expected: ES coerces `4.99` into the `long` field and **truncates it to 4** (or
in stricter setups errors). Check:

```bash
curl "localhost:9200/guessed/_doc/2?pretty"
curl "localhost:9200/guessed/_search?pretty" -H 'Content-Type: application/json' -d '{"query":{"range":{"price":{"gte":4.5}}}}'
```

The `_source` still shows `4.99` (source is stored verbatim) but the *indexed*
value was truncated to `4`, so a `range` query on `price >= 4.5` **misses this
document**. This is a genuinely nasty silent bug: the doc looks right but
doesn't behave right. The cause is dynamic mapping locking `price` as `long`
from doc 1.

### 3. Diagnose and fix: date detection rejects a document

```bash
curl -XPOST "localhost:9200/events/_doc/1" -H 'Content-Type: application/json' -d '{"code":"2026-01-01"}'
curl -XPOST "localhost:9200/events/_doc/2" -H 'Content-Type: application/json' -d '{"code":"PENDING"}'
```

The second call fails. Read the error, explain it, and fix it so both
documents index and `code` behaves as an exact-match keyword.

<details>
<summary>Answer</summary>

Doc 1's `code` value `"2026-01-01"` looks like a date, so **date detection**
dynamically mapped `code` as type `date`. Doc 2's `"PENDING"` can't be parsed
as a date, so it's rejected with a `mapper_parsing_exception`
(`failed to parse date field`). `code` is really an identifier/enum, not a
date. Fix by defining the mapping explicitly *before* indexing (delete and
recreate, since the field type is locked):

```bash
curl -XDELETE "localhost:9200/events"
curl -XPUT "localhost:9200/events" -H 'Content-Type: application/json' -d '{
  "mappings": { "properties": { "code": { "type": "keyword" } } }
}'
curl -XPOST "localhost:9200/events/_doc/1" -H 'Content-Type: application/json' -d '{"code":"2026-01-01"}'
curl -XPOST "localhost:9200/events/_doc/2" -H 'Content-Type: application/json' -d '{"code":"PENDING"}'
```

Both index now, and `code` is an exact-match keyword. You can also disable date
detection globally with `"date_detection": false` in the mapping.

</details>

### 4. Create the catalog index properly

Run the explicit-mapping curl from the Command reference to create `products`
with `dynamic: strict` and the multi-field `name`. Then confirm:

```bash
curl "localhost:9200/products/_mapping?pretty"
```

Expected: `name` is `text` with a `name.raw` keyword sub-field; `price` is
`scaled_float`; `dynamic` is `strict`.

### 5. Index real catalog documents

```bash
curl -XPOST "localhost:9200/products/_doc/1" -H 'Content-Type: application/json' -d '{
  "name":"Trail Running Shoes","sku":"TRS-100","brand":"Summit",
  "category":"footwear","description":"Lightweight shoes for trail running",
  "price":129.99,"in_stock":true,"created":"2026-03-01"
}'
curl -XPOST "localhost:9200/products/_doc/2" -H 'Content-Type: application/json' -d '{
  "name":"Road Running Shoes","sku":"RRS-200","brand":"Summit",
  "category":"footwear","description":"Cushioned shoes for road running",
  "price":149.50,"in_stock":false,"created":"2026-04-15"
}'
curl -XPOST "localhost:9200/products/_refresh"
```

Expected: both `"result":"created"`. Note `price` now stores `129.99`
correctly (scaled_float), unlike the `guessed` index.

### 6. See the `text` vs `keyword` behavior split directly

Full-text `match` on the analyzed `name` (finds by any word):

```bash
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "match": { "name": "running" } }
}'
```

Expected: both shoes match — `name` is `text`, so `running` is a term in the
inverted index.

Now try the same word against the `keyword` sub-field with a `term` query:

```bash
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "query": { "term": { "name.raw": "running" } }
}'
```

Expected: **zero hits** — `name.raw` is `keyword`, stored as the single term
`"Trail Running Shoes"`, so it only matches an exact, whole-string `term` of
`"Trail Running Shoes"`. This is the `text`/`keyword` distinction in one
experiment.

### 7. Aggregate on `keyword`, and see why `text` can't

Group products by brand (works, because `brand` is `keyword`):

```bash
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "aggs": { "by_brand": { "terms": { "field": "brand" } } }
}'
```

Expected: one bucket, `Summit`, `doc_count: 2`. Now try aggregating on the
`text` field `name`:

```bash
curl "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "aggs": { "by_name": { "terms": { "field": "name" } } }
}'
```

Expected: an **error** — "Text fields are not optimised for operations that
require per-document field data like aggregations and sorting… set
`fielddata=true`… or use a keyword field instead." That error *is* the lesson:
aggregate on `name.raw`, not `name`.

### 8. Diagnose and fix: the mapping explosion

```bash
curl -XPOST "localhost:9200/metrics/_doc" -H 'Content-Type: application/json' -d '{"host_a_cpu": 12}'
curl -XPOST "localhost:9200/metrics/_doc" -H 'Content-Type: application/json' -d '{"host_b_cpu": 55}'
curl -XPOST "localhost:9200/metrics/_doc" -H 'Content-Type: application/json' -d '{"host_c_mem": 71}'
curl "localhost:9200/metrics/_mapping?pretty"
```

Explain what's growing and why this is dangerous at scale, then say how you'd
model this correctly.

<details>
<summary>Answer</summary>

Each document uses a *different* key (`host_a_cpu`, `host_b_cpu`, …), and with
default `dynamic: true` Elasticsearch adds a **new field to the mapping for
every distinct key**. With thousands of hosts you'd get thousands of fields,
eventually hitting the default 1000-field limit and failing all indexing —
"mapping explosion." The mapping should describe a fixed *shape*, not encode
data in field names. Model it as data instead:
`{"host":"a","metric":"cpu","value":12}` with a fixed mapping
(`host` keyword, `metric` keyword, `value` long). Now the number of fields is
constant no matter how many hosts you have, and you can aggregate
`terms` on `host`. Defensively, set `dynamic: strict` (or `"runtime"`) so a new
unexpected key fails loudly instead of silently bloating the mapping.

</details>

### 9. Reindex to "change" a mapping

You realize `products.category` should also be full-text searchable, not just
`keyword`. You can't change the existing field, so reindex into a corrected
index:

```bash
curl -XPUT "localhost:9200/products_v2" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "name": {"type":"text","fields":{"raw":{"type":"keyword"}}},
      "sku":{"type":"keyword"}, "brand":{"type":"keyword"},
      "category":{"type":"text","fields":{"raw":{"type":"keyword"}}},
      "description":{"type":"text"},
      "price":{"type":"scaled_float","scaling_factor":100},
      "in_stock":{"type":"boolean"}, "created":{"type":"date"}
    }
  }
}'
curl -XPOST "localhost:9200/_reindex" -H 'Content-Type: application/json' -d '{
  "source": { "index": "products" },
  "dest":   { "index": "products_v2" }
}'
curl "localhost:9200/products_v2/_count"
```

Expected: reindex reports `"created": 2`, and `products_v2` has 2 docs with the
new mapping. In production you'd then point an **alias** (module 06) at
`products_v2` so application code doesn't change. This reindex-into-new-index
pattern is how *all* mapping changes happen — internalize it now.

### 10. Do it in Python

```python
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")

# aggregate on the keyword sub-field, not the text field
resp = es.search(index="products", size=0,
                 aggs={"by_brand": {"terms": {"field": "brand"}}})
for b in resp["aggregations"]["by_brand"]["buckets"]:
    print(b["key"], b["doc_count"])

# full-text on the analyzed field
resp = es.search(index="products", query={"match": {"name": "running"}})
print(resp["hits"]["total"]["value"], "hits")
```

Expected: prints `Summit 2`, then `2 hits`.

## Independent challenge

No mapping given — design it yourself.

**Task:** You're indexing **blog posts** for a search feature. Each post has: a
title, author name, body (long article text), a list of tags, a publish
timestamp, a status (`draft`/`published`/`archived`), and a view count. Design
and create an explicit mapping (`PUT /blog`) that supports *all* of these
requirements simultaneously:

1. Full-text search across title and body.
2. Sort results alphabetically by title, and facet (aggregate) counts by
   author and by tag.
3. Filter to only `published` posts (exact match) and to a publish-date range.
4. Sort by view count.
5. A new field accidentally named `titel` in a document must **fail loudly**,
   not be silently ignored.

Reach back to module 00's TF-IDF discussion to justify *why* body must be
`text`, and to this module's multi-field pattern for the title requirement.
Then index two posts and prove each requirement with a query or aggregation.

<details>
<summary>Hint</summary>

`title` and `body` are `text` (full-text). `title` also needs `.raw`
(`keyword`) for the alphabetical sort — a multi-field. `author` and `tags`
are `keyword` (faceting/exact). `status` is `keyword` (exact filter). The
publish timestamp is `date`; `views` is an integer/`long`. Requirement 5 is
`"dynamic": "strict"` at the mapping root — that turns the typo'd `titel` into a
rejected document instead of a silent phantom field. Facet by author with a
`terms` agg on `author`; the date range uses a `range` query on the date field.

</details>

## Common mistakes & troubleshooting

- **Letting dynamic mapping guess for a schema you actually know.** Define the
  mapping explicitly and use `dynamic: strict`/`false` so typos and unexpected
  fields fail loudly instead of becoming silent phantom fields.
- **Using `text` where you needed `keyword` (or vice versa).** Aggregations,
  sorts, and exact `term` matches need `keyword`; full-text `match` needs
  `text`. Symptom of getting it wrong: an "aggregations not supported on text"
  error, or a `term` query returning nothing because the value was analyzed.
- **Aggregating/sorting on the analyzed field instead of the `.keyword`
  sub-field.** Use `name.raw` / `field.keyword`, not the `text` field itself.
- **Date detection mapping an identifier as a `date`.** A date-looking string
  in the first doc locks the field to `date` and later non-date values are
  rejected. Map it explicitly as `keyword`, or set `date_detection: false`.
- **Storing money as `float`.** Use `scaled_float` (scaling_factor 100) or
  integer cents — floats lose precision, same lesson as track 04.
- **Expecting to change a field's type in place.** You can't; most mappings are
  immutable. Reindex into a new index with the corrected mapping (and swap an
  alias). You *can* add brand-new fields, just not retype existing ones.
- **Mapping explosion from data-in-field-names.** Model varying keys as data
  (`{metric, value}` documents), not as an ever-growing set of fields.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the practical difference between a `text` field and a `keyword`
   field, and which one do you need for aggregating, sorting, or an exact
   `term` match?
2. What is dynamic mapping, and why is letting Elasticsearch guess the mapping
   for a schema you already know a risky default? What does `dynamic: strict`
   buy you?
3. A `multi-field` maps the same source value two ways at once. Give the
   canonical example (`text` + `.keyword`) and explain when each sub-field is
   used.
4. Why can't you change an existing field's type in place, and what is the
   standard procedure for correcting a wrong mapping without downtime?
5. Why should money be stored as `scaled_float` (or integer cents) rather than
   `float`?
6. What is a "mapping explosion," what commonly causes it, and how do you model
   varying keys to avoid it?

<details>
<summary>Answers</summary>

1. A `text` field is run through an analyzer and broken into terms for
   full-text `match` search; it is not stored in a form you can aggregate,
   sort, or exact-match efficiently. A `keyword` field is stored verbatim as a
   single token. Aggregations, sorting, and exact `term` matches need
   `keyword`; full-text `match` needs `text`.
2. Dynamic mapping is Elasticsearch inferring a field's type from the first
   document that contains it. It's risky because a single odd first value
   (e.g. a date-looking id) locks in the wrong type, and typos silently become
   new phantom fields. `dynamic: strict` makes unexpected fields fail loudly
   (rejected) instead of being silently added.
3. The canonical multi-field maps a field as `text` (analyzed, for `match`)
   with a `.keyword` sub-field (verbatim, for aggregations/sorting/exact
   `term`). You search the `text` field and aggregate/sort on `field.keyword`.
4. Most mappings are immutable because the field's data is already written into
   the inverted index/doc-values in that type's on-disk form; changing the
   type would invalidate existing data. The fix is to create a new index with
   the corrected mapping, reindex into it, and swap an **alias** so application
   code never sees the change. (You *can* add brand-new fields — just not
   retype existing ones.)
5. Floats can't represent many decimal values exactly, so arithmetic and
   comparisons drift. `scaled_float` (with a scaling_factor like 100) or plain
   integer cents keep money exact — the same lesson as the relational track.
6. A mapping explosion is an index accumulating a huge number of fields, which
   bloats cluster state and memory. It's typically caused by encoding *data in
   field names* (e.g. one field per metric id) combined with dynamic mapping.
   Model the varying keys as data instead — documents like
   `{ "metric": "...", "value": ... }` — so the field count stays bounded.

</details>

## Cumulative review

Closed-book. Cover the answers, write yours down, and only then check. These
mix module 00 and module 01 — if a question from module 00 stumps you, go redo
that module's exercises rather than peeking.

1. (00) Explain, using the inverted-index concept, why `match` on a `text`
   field can find a document by a middle word but a `term` query on that
   field's `.keyword` sub-field cannot.
2. (00) Your single-node cluster is yellow and you created a `products` index
   with 1 primary and 1 replica. How many shards are unassigned and why? Would
   the *color* change if you dropped the replica count to 0?
3. (01) Give the rule of thumb for choosing `text` vs `keyword`, then classify
   these four fields: a product SKU, an article body, an order status, a
   product name that must be both searchable and sortable.
4. (01) Why can't you sort by a `text` field by default, and what's the
   standard pattern that lets a single source field be both full-text
   searchable *and* sortable?
5. (00+01) A teammate indexes a document, immediately searches, gets zero hits,
   *then* also notices their `price` range filter misses a document they know
   exists. These are two *different* root causes. Name both.
6. (01) You must change a field from `keyword` to `text`. Walk through the
   exact steps, and name the module-06 tool that makes the switch invisible to
   application code.

<details>
<summary>Answers</summary>

1. On a `text` field the string is analyzed into individual terms
   (`trail`, `running`, `shoes`), each in the inverted index, so `match
   "running"` finds it. The `.keyword` sub-field stores the whole string as one
   term (`"Trail Running Shoes"`), so a `term` query only matches that exact
   full string, never a single interior word.
2. Two shards exist (1 primary + 1 replica); the primary is assigned and the
   replica is unassigned (nowhere to put it on one node) → 1 unassigned →
   yellow. Dropping replicas to 0 leaves only the assigned primary, so health
   goes **green** (no unassigned shards) — though you've given up redundancy.
3. Rule: human-readable prose searched *within* → `text`; exact-matched,
   grouped, or sorted whole values → `keyword`. SKU → `keyword`; article body →
   `text`; order status → `keyword`; product name → `text` with a `.raw`
   `keyword` multi-field.
4. A `text` field is stored as analyzed terms, not the original value, and
   sorting/aggregating on it is disabled by default (needs expensive fielddata
   and is semantically wrong — you'd sort by tokens). The pattern is a
   **multi-field**: index it as `text` and add a `keyword` sub-field
   (`title.raw`) for sorting/aggregating.
5. (a) Near-real-time refresh gap — the just-indexed doc wasn't refreshed into
   a searchable segment yet (~1s), so the immediate search found nothing.
   (b) Dynamic mapping locked `price` as `long` from an integer first value, so
   a later `9.99` was truncated to `9` in the index and the `range` filter
   misses it. Different causes: one is timing, one is mapping.
6. Create a new index with the corrected mapping (`category` as `text`),
   `POST /_reindex` from the old index into it, verify counts, then point an
   **alias** (module 06) that application code uses at the new index — so the
   swap is invisible to callers. You can't retype the field in place.

</details>

## Next

[02-basic-and-full-text-search](../02-basic-and-full-text-search/README.md) —
you can now define exactly how each field is stored. Next you'll learn to
*query* it: term vs match queries, and the analyzer machinery that turns text
into terms — the piece that finally explains why `Running`, `running`, and
`runs` do or don't find the same documents.
