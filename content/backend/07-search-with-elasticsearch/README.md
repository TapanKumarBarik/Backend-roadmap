# 07 - Search with Elasticsearch

This track is about a different problem from the ones before it: not storing
data correctly (track 04) or making it fast to fetch by key (track 05), but
making a large body of text **searchable** — the way a search box is, where a
user types a few words, maybe misspelled, and expects the most relevant matches
back instantly, with filters and facets to narrow down. A relational database is
the wrong tool for that; Elasticsearch is built for it, around an inverted index
and a relevance model (BM25) instead of B-trees and exact lookups. Across eight
modules you go from standing up a cluster and understanding *why* it ranks the
way it does, through designing mappings, writing and tuning full-text queries,
building facets and typo-tolerance, paginating and loading at scale, and finally
operating the whole thing in Kibana — ending in a capstone that ties it all
together.

This track comes after **04-databases-and-data-layer** and depends on it: you
should already be comfortable modelling data and reasoning about indexes and
query patterns in a relational store, because much of the value here is
understanding what Elasticsearch does *differently* and when a search engine
belongs alongside (not instead of) your database.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Elasticsearch fundamentals](00-elasticsearch-fundamentals/README.md) | Stand up a cluster in Docker and explain the inverted index, documents/indices/shards, and why BM25 (TF/IDF, saturation, length norm) ranks the way it does | 75-100 min |
| 01 | [Indexes and mappings](01-indexes-and-mappings/README.md) | Design explicit mappings and analyzers — `text` vs `keyword` vs dual fields, `dynamic: strict` — so fields stay searchable and don't become silent phantoms | 75-100 min |
| 02 | [Basic and full-text search](02-basic-and-full-text-search/README.md) | Write term and full-text queries (`match`, `multi_match`, `bool`), and reason about how analyzer choice, stemming, and stop words change the result set | 75-100 min |
| 03 | [Relevance scoring and boosting](03-relevance-scoring-and-boosting/README.md) | Tune ranking with field boosts and `function_score`, and use `_explain` to account for exactly why a document scored where it did | 60-90 min |
| 04 | [Aggregations and fuzzy search](04-aggregations-and-fuzzy-search/README.md) | Build facets and metrics with aggregations, and make search typo-tolerant with fuzziness and autocomplete suggesters | 75-100 min |
| 05 | [Pagination and performance optimization](05-pagination-and-performance-optimization/README.md) | Page correctly with `search_after` + PIT instead of deep `from`/`size`, bulk-load at scale, and profile and speed up slow queries | 75-100 min |
| 06 | [Kibana and operations](06-kibana-and-operations/README.md) | Operate the cluster through Kibana — data views, dashboards, ILM policies, and index/cluster health — instead of only curl | 60-90 min |
| 07 | [Capstone project](07-capstone-project/README.md) | Build a complete product-catalog search backend that integrates mapping, tuned relevance, facets, typo-tolerance, scalable pagination, and Kibana operations | 4-6 hrs |

Two **cumulative reviews** land along the way — one at the end of module 01
(closing out fundamentals and mapping design) and one at the end of module 04
(covering search, relevance, aggregations, and fuzzy matching). Do them
closed-book: they're checkpoints that tell you whether the earlier material
actually stuck before you build on it.

## How to work through this

- Go in order. Every module builds on the ones before it — mappings depend on
  the fundamentals, relevance tuning depends on knowing how full-text search and
  BM25 behave, and the capstone depends on all of it. Skipping ahead means
  guessing at trade-offs you haven't earned yet.
- Each module README has the same shape: why it matters, concepts, a command
  reference with real requests, progressive hands-on exercises (do them — many
  include a "diagnose and fix" scenario), an independent challenge with no code
  given, common mistakes/troubleshooting, and a checkpoint quiz. Modules 01 and
  04 also carry a cumulative review.
- **Take the quizzes and cumulative reviews closed-book.** If you can't answer
  without scrolling up, that's the signal to redo the exercises, not to look up
  the answer. The point is to know it, not to have seen it.
- All exercises run locally against Elasticsearch and Kibana in Docker — no
  cloud account or paid tier required.
- The capstone has no solution code. If you get stuck there, the module that
  taught the piece you're stuck on is named in every requirement — go back and
  redo its exercises.

Start here → [00-elasticsearch-fundamentals/README.md](00-elasticsearch-fundamentals/README.md)

Back to the master index: [../README.md](../README.md)
