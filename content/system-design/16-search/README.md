# Track: Search

Full-text search, inverted indexes, relevance, indexing pipelines and scaling search to high QPS.

Part of **Phase 6** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLbu9hGadb_zQ). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Every lesson below is **Live** with full notes, diagrams, and multi-language code.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Full-Text Search Basics: Why SQL LIKE Fails, Tokenizers & Analyzers](01-full-text-search-basics/README.md) | Explain why `LIKE '%term%'` scans tables and build text analysis pipelines | **Live** |
| 02 | [Inverted Indexes: Postings Lists, Positions & Segments Explained](02-inverted-indexes/README.md) | Trace postings lists, FST term dictionaries, immutable Lucene segments, and merges | **Live** |
| 03 | [Elasticsearch / OpenSearch Architecture: Shards, Replicas, Sizing](03-elasticsearch-opensearch-architecture/README.md) | Size primary/replica shards, avoid oversharding, and route scatter-gather queries | **Live** |
| 04 | [Search Ranking & Relevance: TF-IDF, BM25, Boosting, Learning to Rank](04-search-ranking-relevance/README.md) | Tune BM25 ($k_1, b$), field boosts, and Learning-to-Rank rerankers for relevance | **Live** |
| 05 | [Filtering & Faceting: Filter Context, Aggregations, Doc Values](05-filtering-faceting/README.md) | Separate cached filter context from scoring queries and use columnar doc values | **Live** |
| 06 | [Indexing Pipelines: CDC, Bulk Writes & Zero-Downtime Reindexing](06-indexing-pipelines/README.md) | Sync DBs to search via Outbox/CDC, bulk indexing, and alias-swapped zero-downtime reindexing | **Live** |
| 07 | [Search Consistency: Refresh Delays, Read-Your-Writes & Drift](07-search-consistency/README.md) | Handle near-real-time refresh lag, read-your-writes UX, and reconciliation against truth | **Live** |
| 08 | [Autocomplete at Scale: Tries, Edge N-Grams & Caching](08-autocomplete-at-scale/README.md) | Build sub-30ms typeahead using edge n-grams, FSTs/tries, and prefix caching | **Live** |
| 09 | [Vector Search Fundamentals: Embeddings, Cosine Similarity, HNSW, IVF](09-vector-search-fundamentals/README.md) | Compare exact k-NN vs approximate HNSW/IVF graphs and cosine vs dot-product similarity | **Live** |
| 10 | [Vector Index Tuning: HNSW M, ef_search & int8 Quantisation](10-vector-index-tuning/README.md) | Trade recall, latency, and RAM using HNSW `M`/`ef_search` and `int8`/PQ quantization | **Live** |
| 11 | [Hybrid Search: BM25 + Vectors with Reciprocal Rank Fusion](11-hybrid-search/README.md) | Combine lexical BM25 and dense vector retrieval cleanly with Reciprocal Rank Fusion (RRF) | **Live** |
| 12 | [Search Scaling: Replicas, Routing & Caching to 10,000 QPS](12-search-scaling/README.md) | Scale search to 10k+ QPS with shard routing keys, read replicas, and request/query caches | **Live** |

Start here → [Full-Text Search Basics: Why SQL LIKE Fails, Tokenizers & Analyzers](01-full-text-search-basics/README.md)

Back to the course index: [../README.md](../README.md)
