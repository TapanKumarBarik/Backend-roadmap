# Module 09: The Vector Database Landscape

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. You can already turn text into vectors ([Module 00](../00-what-an-embedding-is/README.md), [Module 02](../02-embedding-models-compared/README.md)), compare them ([Module 03](../03-cosine-similarity-and-distance-metrics/README.md)), reason about what dimension costs ([Module 04](../04-the-curse-of-dimensionality/README.md)) and embed a whole corpus dependably ([Module 05](../05-generating-embeddings-at-scale/README.md)). Modules 06-08 decide what text gets embedded and what metadata travels with it ([Module 08](../08-chunk-overlap-and-metadata/README.md) covers the metadata). This module asks the next question: where do all those vectors live, and who answers "what is nearest to this?"

After this module you can:

- say what a vector database adds over `X @ q` plus `np.argpartition`, capability by capability;
- place any product in one of five categories (in-process library, embedded store, extension of a general database, purpose-built engine, managed service) and say what each category leaves you to own;
- apply an eight-question decision framework to your own project instead of reading a ranking;
- explain why a filtered top-k can return fewer than k results, and name the strategies engines use to avoid it;
- read and run a `MiniVectorStore` of about 240 lines (add, upsert, delete, filtered query, save and load) and recognise the same primitives in every product.

Why it matters: a poor fit rarely raises an error. It shows up as latency that creeps up as the data grows, results that lag behind your writes, or filtered queries that quietly return too few hits. Reversing the choice means re-indexing everything. The product modules come next: [pgvector and Postgres](../10-pgvector-and-postgres/README.md), [Chroma and local development](../11-chroma-and-local-development/README.md), [Pinecone, Weaviate and Qdrant](../12-pinecone-weaviate-and-qdrant/README.md). The index algorithms behind the speed are in [Module 13](../13-exact-vs-approximate-search/README.md), and filter strategies get their full treatment in [Module 16](../16-metadata-filtering-and-hybrid-queries/README.md). This module is the map; those are the territory.

A note on sources. Statements about products come from official documentation fetched while writing this module and are marked "checked Oct 2026". Product docs change, so recheck before you rely on one. This module does not rank products and does not quote prices or benchmarks: both depend on your workload and go stale quickly.

## Concept

> [!key] A vector database is the storage-engine layer wrapped around the nearest-neighbour search you can already write in numpy: durable records, optional approximate indexes, metadata filters, safe updates and deletes, many clients, and more than one machine. Choose by which of those you need and where you want it to run, not by a ranking, and keep your vectors rebuildable from your own data so the choice stays reversible.

## Explanation

### Start from the array you already have

Module 03 ended with exact search in a few lines: `scores = X @ q`, then `argpartition` to keep the best k. That is a complete nearest-neighbour search. It is exact, there is no index to build and no service to run. Its cost is easy to state:

- **Memory** is `N × D × bytes per number` for the vectors alone (block 8 turns that into a function).
- **Time** per query grows with N, because every query reads every vector. Block 8 times a single query at 10,000, 100,000 and 500,000 vectors (384 dimensions, float32): on the machine that ran this module, five times the data took roughly five times as long. Your numbers will differ; the method is what to keep. Measure your own N, your own D and your own latency budget.

Many internal tools never leave this regime, and that is a legitimate place to stay. What the array does not give you is everything around the search.

> [!model] A vector database is two things stacked. The bottom layer is a **search index**: the algorithm that finds near neighbours (an exact scan, an HNSW graph, IVF clusters; Modules 13-15). The top layer is a **database**: ids, metadata, durable storage, updates, deletes, concurrent clients, backups, access control. Libraries such as FAISS give you the bottom layer. Products differ in how much of the top layer they build for you, and where they run it.

The FAISS documentation makes the split visible. Its README describes "a library for efficient similarity search and clustering of dense vectors" in which vectors "are identified by an integer", and its FAQ says it does not support string ids "(or any datatype other than 64-bit ints)". Mapping your document ids to those integers, storing the metadata, and saving everything consistently is your job. That job is what the rest of this module calls the database layer.

### What a database adds, capability by capability

| Capability | A numpy array | What a vector database or engine adds | In `MiniVectorStore` (below) |
| --- | --- | --- | --- |
| Persistence | gone when the process exits; `np.save` is a snapshot you manage | durable writes and recovery. pgvector inherits Postgres: its README lists ACID compliance and point-in-time recovery, and says the write-ahead log allows replication | `save` / `load` snapshot with torn-write detection; **no log**, so writes since the last save are lost on a crash |
| Approximate indexes | exact scan only, cost grows with N | graph or cluster indexes that trade some recall for speed. Redis offers FLAT, HNSW and SVS-VAMANA; MongoDB offers HNSW-based ANN and exact (ENN) | an `Index` interface and one exact implementation |
| Metadata filtering | you write the masks | a filter language plus a strategy for combining it with the index (next section) | filters with three strategies: pre, post, iterative |
| Create, update, delete | rewrite the array; keep ids and rows aligned yourself | upsert, delete by id or by filter, without rebuilding everything | `add`, `upsert`, `delete`, tombstones, `compact` |
| Concurrency | none | many clients at once, with defined rules. Even a library states them: hnswlib's `add_items` is "Thread-safe with other add_items calls, but not with knn_query" | none; single-threaded |
| Scale out | one machine's RAM | sharding and replicas. Qdrant splits a collection into shards, Weaviate offers leaderless replication, Milvus separates storage from compute | none |
| Backup and restore | copy files and hope nobody is writing | snapshots and point-in-time recovery. A Qdrant snapshot is a tar archive of one collection on one node | copy two files |
| Access control and tenancy | none | namespaces, per-tenant shards, partitions, roles. Authentication and roles differ by product: read that product's docs | none |

Read the last column honestly. Persistence, create/update/delete and filtering are things you can build in an afternoon, and the code below does. The other rows are where most of a database's engineering lives. That is the real answer to "why not just use numpy": you can, until one of those rows becomes a requirement.

### The five categories

Categories describe the **deployment shape**, not quality. Several products appear in more than one row because they ship more than one shape.

| Category | Examples in this module | Where it runs | What you get | What you still own |
| --- | --- | --- | --- | --- |
| 1. In-process library | FAISS, hnswlib | inside your Python process | the index algorithm, fast | ids, metadata, durability, update policy, concurrency rules |
| 2. Embedded or local-first store | Chroma, LanceDB (open source), Milvus Lite | inside your process, data in a local folder or file | a database-shaped API (collections, metadata, upsert, delete) with no server | backups, single-process limits, the move to a server or cloud later |
| 3. Vector support inside a general database | pgvector (Postgres), Elasticsearch, OpenSearch, Redis, MongoDB | the server you probably already run | vectors next to your other data, that product's operations story, often text-plus-vector queries | tuning a general system for a new workload; the extension's limits |
| 4. Purpose-built engine | Qdrant, Weaviate, Milvus | a server or cluster you operate, or the vendor's hosted version | filter-aware indexes, sharding and replication designed around vectors | deploying, upgrading, sizing and monitoring one more stateful service |
| 5. Fully managed service | Pinecone | the vendor's cloud, behind an API | no servers to size or patch | API and data-model limits, consistency behaviour, cost model, an exit plan |

> [!pitfall] Do not classify a product forever by the first tutorial you read. Chroma documents an in-memory client, a persistent local client, an HTTP client and a cloud offering; Milvus documents Lite, a server and a distributed architecture; LanceDB documents local paths, object storage and an enterprise tier. "Which product" and "which deployment shape" are two separate decisions.

#### What the official docs say (checked Oct 2026)

Every bullet below is something the linked page states; nothing is a measurement made for this module. Once you have written `upsert`, `delete` and a filtered query yourself, these pages are easy to read: the names change, the questions do not.

**In-process libraries**

- **FAISS** ([README](https://github.com/facebookresearch/faiss), [FAQ](https://github.com/facebookresearch/faiss/wiki/FAQ)): ids are 64-bit integers only. Its FAQ says filtering has "limited support", must be based on vector ids, and that "it is always more efficient to search on an index that contains just the relevant elements". For a discrete attribute with few values it suggests one index per value.
- **hnswlib** ([README](https://github.com/nmslib/hnswlib)): documents `save_index` / `load_index`, a `filter` function for `knn_query`, and `mark_deleted`, which "marks the element as deleted, so it will be omitted from search results". Its changelog describes the `allow_replace_deleted` option, which lets new elements take the place of deleted ones, as a way "to control the size of the index".

**Embedded or local-first stores**

- **Chroma** ([clients](https://docs.trychroma.com/docs/run-chroma/clients), [update and upsert](https://docs.trychroma.com/docs/collections/update-data), [delete](https://docs.trychroma.com/docs/collections/delete-data)): `PersistentClient` saves the database to a folder on your machine (default `.chroma`) and loads it on start; an ephemeral client keeps nothing. `upsert` "updates existing items, or adds them if they don't yet exist"; `update` on a missing id logs an error and ignores it; `delete` works by ids or by a `where` filter.
- **LanceDB** ([quickstart](https://docs.lancedb.com/quickstart)): the open-source version is used "as an embedded library" pointed at a local path. Its connection strings also accept object-storage URIs (`s3://`, `gs://`, `az://`) and a `db://` form for its enterprise product.
- **Milvus Lite** ([Milvus README](https://github.com/milvus-io/milvus)): created by instantiating a client "with a local file name for persisting data". The same README describes full Milvus as a distributed architecture that separates compute and storage (see the purpose-built engines below).

**Vector support inside a general database**

- **pgvector** ([README](https://github.com/pgvector/pgvector)): "Store your vectors with the rest of your data", with exact and approximate search, ACID compliance, point-in-time recovery and JOINs. For tenant isolation it recommends list partitioning or separate tables, and warns that sharing an approximate index between tenants means one tenant's vectors "can affect recall (and speed) for other tenants".
- **Elasticsearch and OpenSearch** ([Elastic](https://www.elastic.co/docs/solutions/search/vector/knn/filtered-knn-search), [OpenSearch](https://docs.opensearch.org/latest/vector-search/filter-search-knn/index/)): both document the same split. A filter placed inside the kNN clause "is applied during approximate kNN search to ensure that k matching documents are returned" (Elastic); a filter applied afterwards "can return fewer than k results" (Elastic) or "significantly fewer than k results for a restrictive filter" (OpenSearch).
- **Redis** ([vector search concepts](https://redis.io/docs/latest/develop/ai/search-and-query/vectors/)): vectors and metadata live in hashes or JSON documents; filters can use text, numeric, tag and geo fields; for filtered queries it picks, by heuristics, between paging through nearest neighbours ("batches") and scoring every vector that passes the filter ("ad-hoc brute force").
- **MongoDB Atlas Vector Search** ([overview](https://www.mongodb.com/docs/vector-search/)): a `$vectorSearch` aggregation stage; ANN using HNSW and exact (ENN) search; pre-filtering on fields you add to the vector search index, which is "separate from your other database indexes".

**Purpose-built engines**

- **Qdrant** ([indexing](https://qdrant.tech/documentation/manage-data/indexing/), [distributed deployment](https://qdrant.tech/documentation/scaling/distributed_deployment/), [snapshots](https://qdrant.tech/documentation/snapshots/)): its "filterable HNSW" extends the graph "with additional edges based on indexed payload values", and the docs advise creating payload indexes before ingesting data. `shard_number` "cannot be changed without recreating the collection" (resharding is offered on its cloud). A snapshot is a tar archive of one collection on one node, so a multi-node cluster needs one per node.
- **Weaviate** ([filtering](https://docs.weaviate.io/weaviate/concepts/filtering), [replication](https://docs.weaviate.io/weaviate/concepts/replication-architecture)): filtered search is "based on the concept of pre-filtering": an inverted index builds an allow-list that the HNSW search respects, and it offers an option to "automatically switch to a flat (brute-force) vector search when a filter becomes too restrictive". Replication is "tunable and leaderless", with consistency levels ONE, QUORUM and ALL.

- **Milvus** ([README](https://github.com/milvus-io/milvus)): the server product is described as a "fully-distributed and K8s-native architecture" in which compute and storage are separate.

**Fully managed**

- **Pinecone** ([data freshness](https://docs.pinecone.io/guides/index-data/check-data-freshness), [indexing overview](https://docs.pinecone.io/guides/index-data/indexing-overview)): "Pinecone is eventually consistent, so there can be a slight delay before new or changed records are visible to queries", with log sequence numbers to check whether a write is visible. Records are partitioned into namespaces, and the docs suggest one namespace per customer for multitenancy. Records can carry metadata that you filter on at query time.

### Filtering: where the categories really differ

"Nearest neighbours that also satisfy a metadata condition" sounds like one operation. Underneath there are a few strategies, and the choice changes both speed and whether you get k results.

- **Post-filter.** Find the nearest candidates, then drop the ones that fail the filter. Cheap, and it can return fewer than k. pgvector's README states the arithmetic: "If a condition matches 10% of rows, with HNSW and the default `hnsw.ef_search` of 40, only 4 rows will match on average." Since 0.8.0 it offers iterative index scans that "automatically scan more of the index until enough results are found". Elasticsearch and OpenSearch describe the same post-filter hazard for a filter placed outside the kNN clause.
- **Pre-filter, then exact.** Work out the matching set first, then search only inside it. Always returns k if k rows match, and exact on that subset. It is cheap when the set is small and expensive when it is large. OpenSearch's scoring-script filter is documented this way ("pre-filtering a document set and then running an exact k-NN search").
- **Filter during the search.** The index traversal itself respects the filter. Elasticsearch's filter inside `knn`, OpenSearch's efficient filtering, Weaviate's allow-list and Qdrant's filter-aware graph edges all describe this.
- **Adaptive.** Pick a strategy per query from the filter's selectivity: Redis's batches versus ad-hoc brute force, Weaviate's flat-search switch, OpenSearch's fallback to exact search when an efficient-filter ANN search returns fewer than k although more than k documents match.
- **Partition.** Make the filter value part of the layout: pgvector's README suggests partial indexes and table partitioning, and FAISS's FAQ suggests one index per attribute value.

Block 7 implements the first, second and a simple version of the iterative strategy on top of an exact index, so you can watch each one behave.

> [!pitfall] Vendors use "pre-filtering" for two different things. Elasticsearch and Weaviate use it for a filter that is known before the approximate search starts and is applied while it runs; in this module `pre` means the stricter "filter first, then score only the matches exactly". Read what the engine actually does with the filter, not the label.

> [!pitfall] A filtered top-k returning fewer than k results is not an error and not a bug in the engine. It is the arithmetic of "search first, filter second". The opposite trap also exists: pre-filtering always returns k hits, even when the best of them are poor matches (block 7 shows a best score of 0.41 where an unfiltered query would have scored 0.76). Decide what an acceptable minimum score is and apply a threshold; remember that scores depend on the metric (Module 03).

Modules [13](../13-exact-vs-approximate-search/README.md) and [16](../16-metadata-filtering-and-hybrid-queries/README.md) go deep on how approximate indexes and filters interact.

### A decision framework, not a ranking

No product is "the best". The same product can be an excellent fit for one project and a poor one for the next. The framework is eight questions to answer in writing before you compare products.

| # | Factor | Ask | Write down |
| --- | --- | --- | --- |
| 1 | Dataset size and growth | How many vectors now and in a year, how many dimensions, what precision? | `N × D × bytes` (block 8), then add whatever index overhead the product documents. Redis's HNSW parameter `M`, for example, is documented as raising both accuracy and memory use |
| 2 | Query rate and latency | Peak queries per second? What is the p95 latency budget? Interactive or batch? | exact-scan milliseconds at your N (block 8) against your budget, at your real concurrency |
| 3 | Filtering and hybrid needs | Which filters appear on every query? How selective? Do you also need keyword matching? | the fraction of records each filter keeps, and whether the filter correlates with the query (block 7) |
| 4 | Update pattern | Append-only, periodic rebuild, or constant upserts and deletes? How soon must a write be searchable? | writes and deletes per day, read-your-writes requirement, any deadline for physically removing data |
| 5 | Operational burden | Who is paged when it breaks? Can the team run a stateful service? | on-call, upgrades, backup ownership, skills in the team |
| 6 | Existing stack | What do you already run and know? Must vectors join or share transactions with other rows? | the systems already in production and the joins you need |
| 7 | Durability and consistency | What can you afford to lose, and how fast must you recover? Is eventual consistency acceptable? | recovery point and time targets, a tested restore, replica behaviour |
| 8 | Cost | What does it cost to run at your size and to leave? | your own estimate from each vendor's current pricing page and your numbers from rows 1-4, plus the people time |

How to use the answers:

1. **Find the hard constraints first.** Data that may not leave your network rules out some deployment shapes. A need for transactions across vectors and relational rows points at a general database. A footprint larger than one machine's memory rules out a plain in-process scan. Every filter-heavy query needs a filtering strategy you have tested.
2. **Pick the simplest shape that satisfies them,** then shortlist two or three candidates in that shape. "Simplest" means the least new infrastructure and the least to build, not the smallest feature list.
3. **Test candidates on your data** (next section), not on someone's benchmark.
4. **Keep an exit.** Vectors are derived data. Keep the source text, the metadata, the embedding model identifier and, ideally, the vectors themselves in a store you control. Module 05's embedding cache is exactly that: with it, a migration is a re-index, not a re-embedding bill.

#### Three worked scenarios (invented for illustration)

| Scenario | Size (raw vectors, block 8) | Factors that dominate | Shapes worth shortlisting |
| --- | --- | --- | --- |
| Internal wiki search for one team: 40,000 chunks, 1536 dimensions | 0.25 GB | 5 (nobody wants to run a server), 6 | exact search in process (array or a flat index), an embedded store, or an extension if Postgres is already there. Measure exact-scan latency first; it may be all you need |
| Multi-tenant SaaS: 3,000 tenants of about 20,000 chunks, 768 dimensions, every query filtered by tenant, updates all day | 184.32 GB in total, 61.4 MB per tenant | 3 (tenant filter on every query), 4 (freshness), 7 (isolation, backups) | managed namespaces, an engine with tenant-aware shards, or Postgres with partitions. Test tenant-filtered recall, write visibility and delete behaviour |
| Product catalogue: 200 million items, 768 dimensions, constant updates | 614.40 GB at float32 | 1 (does not fit one machine at float32), 4, 5 | quantisation or disk-backed indexes (Module 15), a distributed engine or a managed service. Budget for operations or pay a vendor to carry them |

These are reasoning examples, not recommendations: change the numbers and the shortlist changes.

#### Testing a candidate honestly

Build a small **golden set** of real queries with their real filters (the Module 03 Project did this). Use exact search as the **ground truth**: `BruteForceIndex` is that oracle, and **recall@10** is the fraction of the true top 10 the candidate returns. Measure latency at realistic concurrency with your most and least selective filters. Run **write tests** (upsert then query at once, delete then query, replace a vector and check the old one is gone) and a **restore test** (back up, destroy, restore, compare answers). Only then compare cost, using your own sizes.

## Code

Everything below uses numpy and the standard library. The blocks are cumulative: copy them into one file, in order, and run it. Outputs were produced with Python 3.13 and numpy 2.4.6; every random generator is seeded, so everything reproduces except the millisecond timings in block 8, which depend on your machine. Block 7 emulates the documented filtering strategies on an exact index; it was not run against any of the products named above.

### 1. The index interface, a filter matcher, and exact search

The store will talk to its index through one method, `search(vectors, query, k, allowed)`. An approximate index would implement the same method, plus hooks to hear about inserts and deletes.

```python
import io, json, os, tempfile, time, uuid
from dataclasses import dataclass
import numpy as np

def l2_normalize(x, eps=1e-12):
    """Row-wise unit length (same helper as Module 03). All-zero rows stay all-zero instead of NaN."""
    n = np.linalg.norm(x, axis=-1, keepdims=True)
    return x / np.maximum(n, eps)

class BruteForceIndex:
    """Exact search behind the interface every index in the store must offer:

        search(vectors, query, k, allowed) -> (rows, scores)

    vectors: (n, d) float32, one row per record.  query: (d,).  allowed: (n,) bool, which rows may be returned.
    Result: at most k rows, best first (higher score = better), and only rows where allowed is True.
    An approximate index (HNSW, IVF, ...) would keep its own structure and need hooks to hear about
    inserts and deletes; this one has no state, so it needs none.
    """
    def search(self, vectors, query, k, allowed):
        rows = np.flatnonzero(allowed)
        if rows.size == 0 or k <= 0:
            return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.float32)
        # Only the allowed rows are scored. If everything is allowed, skip the gather copy.
        scores = vectors @ query if rows.size == len(vectors) else vectors[rows] @ query
        k = min(k, rows.size)
        part = np.argpartition(-scores, k - 1)[:k]                          # the k best, unordered (Module 03)
        order = part[np.lexsort((rows[part], -scores[part]))]               # best first; ties -> lower row
        return rows[order], scores[order]

class CountingIndex(BruteForceIndex):
    """Same answers, but remembers how many rows were scored: lets us see what filtering first saves."""
    def __init__(self):
        self.rows_scored = 0
    def search(self, vectors, query, k, allowed):
        self.rows_scored += int(np.count_nonzero(allowed))
        return super().search(vectors, query, k, allowed)

_MISSING = object()
_OPS = {
    "$eq": lambda v, a: v == a,   "$ne": lambda v, a: v != a,
    "$gt": lambda v, a: v > a,    "$gte": lambda v, a: v >= a,
    "$lt": lambda v, a: v < a,    "$lte": lambda v, a: v <= a,
    "$in": lambda v, a: v in a,
}

def matches(meta, where):
    """True if the record's metadata satisfies every condition (AND). A missing field never matches.
    where = {"lang": "en", "year": {"$gte": 2020, "$lt": 2024}}"""
    for field, cond in where.items():
        value = meta.get(field, _MISSING)
        if value is _MISSING:
            return False
        for op, arg in (cond.items() if isinstance(cond, dict) else [("$eq", cond)]):
            if not _OPS[op](value, arg):        # "2020" == 2020 is just False (silent); "2020" >= 2019 raises TypeError
                return False
    return True

@dataclass
class Hit:
    id: str
    score: float
    metadata: dict
```

### 2. The store: add, upsert, delete, compact, query

Records are `(id, vector, metadata)`. Vectors are normalised on the way in (Module 03), so the score is cosine similarity and higher is better. A deleted record becomes a **tombstone**: the row stays, an `alive` flag turns off, and `compact()` later squeezes the gaps out.

```python
class MiniVectorStore:
    """A tiny vector store: records are (id, vector, metadata). Higher score = more similar.
    With normalize=True (default) vectors are scaled to unit length on the way in, so the score is
    cosine similarity (Module 03: for unit vectors dot product and cosine are the same number)."""

    def __init__(self, dim, index=None, normalize=True):
        self.dim, self.normalize = dim, normalize
        self.index = index if index is not None else BruteForceIndex()
        self._vecs = np.zeros((16, dim), dtype=np.float32)     # capacity buffer; rows [0, _n) are in use
        self._alive = np.zeros(16, dtype=bool)                 # False = tombstone (deleted row)
        self._n = 0
        self._ids, self._meta = [], []                         # row -> id / metadata (None when deleted)
        self._row_of = {}                                      # id -> row, live records only
        self.last_candidates = None                            # size of the candidate list the last query pulled

    # ---- write path -------------------------------------------------------------------------
    def _prepare(self, vector):
        v = np.asarray(vector, dtype=np.float32)
        if v.shape != (self.dim,):
            raise ValueError(f"expected a vector of shape ({self.dim},), got {v.shape}")
        if not np.isfinite(v).all():
            raise ValueError("vector contains NaN or inf")
        if self.normalize:
            if not np.any(v):
                raise ValueError("zero vector has no direction; this is a data bug (empty input?)")
            v = l2_normalize(v)
        return v

    @staticmethod
    def _clean(metadata):
        # Round-trip through JSON now, so what you query is what you get back after save/load.
        return json.loads(json.dumps(metadata or {}))

    def _append(self, id, v, meta):
        if self._n == len(self._vecs):                         # grow by doubling: O(1) amortised per add
            self._vecs = np.vstack([self._vecs, np.zeros_like(self._vecs)])
            self._alive = np.concatenate([self._alive, np.zeros_like(self._alive)])
        row = self._n
        self._vecs[row], self._alive[row] = v, True
        self._ids.append(id); self._meta.append(meta)
        self._row_of[id] = row
        self._n += 1

    def add(self, id, vector, metadata=None):
        """Insert a NEW record. Refuses an id that already exists (use upsert to replace)."""
        if not isinstance(id, str):
            raise TypeError("ids must be strings")
        if id in self._row_of:
            raise ValueError(f"id {id!r} already exists; use upsert()")
        self._append(id, self._prepare(vector), self._clean(metadata))

    def upsert(self, id, vector, metadata=None):
        """Insert, or REPLACE the whole record (vector and metadata) if the id exists. No merging."""
        if not isinstance(id, str):
            raise TypeError("ids must be strings")
        v, meta = self._prepare(vector), self._clean(metadata)
        row = self._row_of.get(id)
        if row is None:
            self._append(id, v, meta)
        else:
            self._vecs[row], self._meta[row] = v, meta

    def delete(self, ids):
        """Delete records by id; unknown ids are ignored. Returns how many were really deleted.
        The row becomes a tombstone (excluded from every search); compact() reclaims the space."""
        count = 0
        for id in ids:
            row = self._row_of.pop(id, None)
            if row is not None:
                self._alive[row], self._ids[row], self._meta[row] = False, None, None
                count += 1
        return count

    def compact(self):
        """Squeeze tombstones out. Rows move, ids do not. Returns the number of rows reclaimed."""
        keep = np.flatnonzero(self._alive[:self._n])
        reclaimed = self._n - keep.size
        self._vecs[:keep.size] = self._vecs[keep]
        self._vecs[keep.size:self._n] = 0                      # do not leave deleted vectors lying around
        self._alive[:] = False
        self._alive[:keep.size] = True
        self._ids = [self._ids[r] for r in keep]
        self._meta = [self._meta[r] for r in keep]
        self._n = keep.size
        self._row_of = {id: r for r, id in enumerate(self._ids)}
        cap = max(16, 1 << (self._n - 1).bit_length()) if self._n else 16      # shrink the buffer too
        if cap < len(self._vecs):
            self._vecs, self._alive = self._vecs[:cap].copy(), self._alive[:cap].copy()
        return reclaimed

    # ---- read path --------------------------------------------------------------------------
    def __len__(self):
        return len(self._row_of)

    def __contains__(self, id):
        return id in self._row_of

    def stats(self):
        return {"live": len(self), "rows_used": self._n, "tombstones": self._n - len(self), "capacity": len(self._vecs)}

    def get(self, id):
        """(stored vector, metadata) for an id; KeyError if absent. The vector is the normalised copy."""
        row = self._row_of[id]
        return self._vecs[row].copy(), dict(self._meta[row])

    def _where_mask(self, alive, where):
        if not where:
            return alive
        mask = np.zeros_like(alive)
        for row in np.flatnonzero(alive):                      # O(n) Python loop. Real engines index the metadata.
            mask[row] = matches(self._meta[row], where)
        return mask

    def query(self, vector, k=10, where=None, mode="pre", candidates=None):
        """Top-k most similar live records, optionally restricted by a metadata filter.

        mode="pre"       filter FIRST, then search only the rows that match: always k hits if k rows match.
        mode="post"      search the `candidates` nearest rows (default k) and THEN filter: may return < k.
        mode="iterative" like post, but keep doubling `candidates` until k hits survive or rows run out.
        """
        q = self._prepare(vector)
        vecs, alive = self._vecs[:self._n], self._alive[:self._n]
        if mode == "pre" or not where:
            allowed = self._where_mask(alive, where)
            rows, scores = self.index.search(vecs, q, k, allowed)
            self.last_candidates = int(allowed.sum())             # pre: the rows that passed the filter
        elif mode in ("post", "iterative"):
            c, total = candidates or k, int(alive.sum())
            while True:
                rows, scores = self.index.search(vecs, q, c, alive)       # the filter knows nothing about this step
                ok = [i for i, r in enumerate(rows) if matches(self._meta[r], where)]
                if mode == "post" or len(ok) >= k or c >= total:
                    break
                c *= 2
            rows, scores = rows[ok][:k], scores[ok][:k]
            self.last_candidates = c
        else:
            raise ValueError("mode must be 'pre', 'post' or 'iterative'")
        return [Hit(self._ids[r], float(s), dict(self._meta[r])) for r, s in zip(rows, scores)]
```

### 3. Persistence: two files that must agree

`save` writes `<path>.npz` (the vectors) and `<path>.json` (ids, metadata, settings). Each file is written to a temporary name and renamed into place, so a reader never sees half a file. The two renames are still two steps, so both files carry the same random `save_id` and `load` refuses a mismatched pair.

```python
def _write_atomically(path, payload: bytes):
    """Write to a temp file in the same folder, flush it to disk, then rename over the target.
    A reader sees the old file or the new file, never half of one."""
    tmp = f"{path}.tmp"
    with open(tmp, "wb") as f:
        f.write(payload)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)

def save(store, path):
    """Write <path>.npz (the vectors) and <path>.json (ids, metadata, settings). Tombstones are dropped.
    Both files carry the same random save_id so load() can tell if they came from different saves."""
    live = np.flatnonzero(store._alive[:store._n])
    save_id = uuid.uuid4().hex
    buf = io.BytesIO()
    np.savez(buf, vectors=store._vecs[live], save_id=np.array(save_id))
    _write_atomically(f"{path}.npz", buf.getvalue())
    header = {"format": 1, "dim": store.dim, "normalize": store.normalize, "count": int(live.size),
              "save_id": save_id, "ids": [store._ids[r] for r in live], "metadata": [store._meta[r] for r in live]}
    _write_atomically(f"{path}.json", json.dumps(header).encode("utf-8"))        # written last = the commit

def load(path, index=None):
    with open(f"{path}.json", encoding="utf-8") as f:
        header = json.load(f)
    with np.load(f"{path}.npz", allow_pickle=False) as z:
        vectors, npz_save_id = z["vectors"], str(z["save_id"])
    if header.get("format") != 1:
        raise ValueError(f"unknown format version {header.get('format')!r}")
    if npz_save_id != header["save_id"]:
        raise ValueError("the .npz and .json files come from different saves (torn write or mixed-up copy)")
    if vectors.shape != (header["count"], header["dim"]) or len(header["ids"]) != header["count"]:
        raise ValueError("file contents disagree with the header's count/dim")
    store = MiniVectorStore(header["dim"], index=index, normalize=header["normalize"])
    n = header["count"]
    store._vecs = np.zeros((max(16, n), header["dim"]), dtype=np.float32)
    store._alive = np.zeros(len(store._vecs), dtype=bool)
    store._vecs[:n], store._alive[:n], store._n = vectors, True, n
    store._ids, store._meta = list(header["ids"]), list(header["metadata"])
    store._row_of = {id: r for r, id in enumerate(store._ids)}
    return store
```

### 4. Does it agree with an independent reference?

The reference scores every record in a Python loop from the **raw** vectors in float64, using the cosine formula, and sorts everything. It shares no code with the store.

```python
rng = np.random.default_rng(0)
N, D = 5_000, 64
raw = rng.standard_normal((N, D)).astype(np.float32) * rng.uniform(0.5, 3.0, size=(N, 1)).astype(np.float32)  # varied lengths
langs = rng.choice(["en", "de", "fr", "ja"], size=N, p=[0.5, 0.2, 0.2, 0.1])
years = rng.integers(2015, 2026, size=N)

store = MiniVectorStore(D)
for i in range(N):
    store.add(f"doc{i}", raw[i], {"lang": str(langs[i]), "year": int(years[i])})
print("stored:", len(store), "| stats:", store.stats())

def reference_topk(q, k, rows):
    """Independent check: float64 cosine on the RAW vectors, one record at a time, full sort."""
    q64 = q.astype(np.float64)
    scored = [(float(raw[i].astype(np.float64) @ q64 / (np.linalg.norm(raw[i].astype(np.float64)) * np.linalg.norm(q64))), i)
              for i in rows]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [(f"doc{i}", s) for s, i in scored[:k]]

queries = rng.standard_normal((50, D)).astype(np.float32)
same_ids, worst = 0, 0.0
for q in queries:
    got = [(h.id, h.score) for h in store.query(q, k=10)]
    ref = reference_topk(q, 10, range(N))
    same_ids += [g[0] for g in got] == [r[0] for r in ref]
    worst = max(worst, max(abs(g[1] - r[1]) for g, r in zip(got, ref)))
print(f"unfiltered: {same_ids}/50 queries return the same ten ids in the same order as the reference")
print(f"            largest score difference vs the float64 reference: {worst:.1e}")

where = {"lang": "en", "year": {"$gte": 2020}}
rows_ok = [i for i in range(N) if langs[i] == "en" and years[i] >= 2020]
same_ids = sum([h.id for h in store.query(q, k=10, where=where)] == [r[0] for r in reference_topk(q, 10, rows_ok)]
               for q in queries)
print(f"filtered (lang=en, year>=2020 matches {len(rows_ok)} of {N}): {same_ids}/50 identical to the reference")

q = queries[0]
print("query scale does not matter:", [h.id for h in store.query(q * 1000, k=3)] == [h.id for h in store.query(q, k=3)])
try:
    store.add("zero", np.zeros(D))
except ValueError as e:
    print("zero vector ->", e)
```

Output:

```
stored: 5000 | stats: {'live': 5000, 'rows_used': 5000, 'tombstones': 0, 'capacity': 8192}
unfiltered: 50/50 queries return the same ten ids in the same order as the reference
            largest score difference vs the float64 reference: 8.3e-08
filtered (lang=en, year>=2020 matches 1341 of 5000): 50/50 identical to the reference
query scale does not matter: True
zero vector -> zero vector has no direction; this is a data bug (empty input?)
```

All 50 unfiltered and 50 filtered queries return the same ids in the same order as the reference. The largest score difference is float32 rounding.

### 5. Delete and upsert semantics

```python
# --- delete -------------------------------------------------------------------------------------
probe = raw[42]                                   # the exact vector of doc42
print("before delete: top hit for doc42's own vector ->", store.query(probe, k=1)[0].id, f"(score {store.query(probe, k=1)[0].score:.3f})")
print("delete returns:", store.delete(["doc42", "doc43", "no-such-id"]), "(the unknown id is ignored)")
print("delete again  :", store.delete(["doc42"]), "| len:", len(store), "| 'doc42' in store:", "doc42" in store)
print("after delete : top hit ->", store.query(probe, k=1)[0].id)
try:
    store.get("doc42")
except KeyError as e:
    print("get('doc42') -> KeyError", e)
print("stats with tombstones :", store.stats())

before = [(h.id, round(h.score, 6)) for h in store.query(queries[1], k=5)]
print("compact() reclaimed   :", store.compact(), "rows | stats:", store.stats())
after = [(h.id, round(h.score, 6)) for h in store.query(queries[1], k=5)]
print("same answers after compact:", before == after)
store.add("doc42", raw[42], {"lang": "en", "year": 2021})                  # an id can be reused after delete
print("re-added doc42 -> top hit:", store.query(probe, k=1)[0].id)

# --- add vs upsert -----------------------------------------------------------------------------
try:
    store.add("doc7", raw[7])
except ValueError as e:
    print("add on existing id ->", e)
_, old_meta = store.get("doc7")
print("doc7 before upsert:", old_meta, "| top hit for its old vector:", store.query(raw[7], k=1)[0].id)
new_vec = rng.standard_normal(D).astype(np.float32)
store.upsert("doc7", new_vec, {"lang": "de"})                              # note: no "year" key this time
_, meta7 = store.get("doc7")
print("doc7 after upsert :", meta7, "<- replaced, not merged (the year is gone)")
print("old vector now finds:", store.query(raw[7], k=1)[0].id, "| new vector finds:", store.query(new_vec, k=1)[0].id)
print("len unchanged by upsert:", len(store))
```

Output:

```
before delete: top hit for doc42's own vector -> doc42 (score 1.000)
delete returns: 2 (the unknown id is ignored)
delete again  : 0 | len: 4998 | 'doc42' in store: False
after delete : top hit -> doc1629
get('doc42') -> KeyError 'doc42'
stats with tombstones : {'live': 4998, 'rows_used': 5000, 'tombstones': 2, 'capacity': 8192}
compact() reclaimed   : 2 rows | stats: {'live': 4998, 'rows_used': 4998, 'tombstones': 0, 'capacity': 8192}
same answers after compact: True
re-added doc42 -> top hit: doc42
add on existing id -> id 'doc7' already exists; use upsert()
doc7 before upsert: {'lang': 'fr', 'year': 2021} | top hit for its old vector: doc7
doc7 after upsert : {'lang': 'de'} <- replaced, not merged (the year is gone)
old vector now finds: doc2546 | new vector finds: doc7
len unchanged by upsert: 4999
```

Deleted records vanish from queries immediately, `delete` is idempotent, and `compact()` changes no answers. `upsert` **replaces** the whole record: the old vector stops matching and the old metadata keys are gone. A product might merge metadata instead; check which one yours does.

### 6. Persistence round trip and a torn write

```python
store.delete([f"doc{i}" for i in range(100, 150)])          # leave 50 tombstones behind on purpose
print("before save:", store.stats())

with tempfile.TemporaryDirectory() as folder:
    path = os.path.join(folder, "mini")
    save(store, path)
    for name in sorted(os.listdir(folder)):
        print(f"  {name:<10}{os.path.getsize(os.path.join(folder, name)):>10,} bytes")
    print(f"  (vectors alone: {len(store)} x {D} x 4 bytes = {len(store) * D * 4:,} bytes)")

    loaded = load(path)
    print("after load :", loaded.stats(), "<- tombstones were dropped by save()")
    same = all([(h.id, h.score, h.metadata) for h in store.query(q, k=10)] ==
               [(h.id, h.score, h.metadata) for h in loaded.query(q, k=10)] for q in queries)
    print("all 50 queries identical (ids, scores, metadata) after the round trip:", same)
    print("metadata types survive:", type(loaded.get("doc5")[1]["year"]).__name__, loaded.get("doc5")[1])

    # Simulate a crash between the two renames: the .npz is from save #2, the .json still from save #1.
    store.upsert("doc5", rng.standard_normal(D).astype(np.float32), {"lang": "ja", "year": 2025})
    save(store, os.path.join(folder, "second"))
    os.replace(os.path.join(folder, "second.npz"), os.path.join(folder, "mini.npz"))
    try:
        load(path)
    except ValueError as e:
        print("torn pair detected ->", e)
```

Output:

```
before save: {'live': 4949, 'rows_used': 4999, 'tombstones': 50, 'capacity': 8192}
  mini.json    201,965 bytes
  mini.npz   1,267,586 bytes
  (vectors alone: 4949 x 64 x 4 bytes = 1,266,944 bytes)
after load : {'live': 4949, 'rows_used': 4949, 'tombstones': 0, 'capacity': 4949} <- tombstones were dropped by save()
all 50 queries identical (ids, scores, metadata) after the round trip: True
metadata types survive: int {'lang': 'en', 'year': 2021}
torn pair detected -> the .npz and .json files come from different saves (torn write or mixed-up copy)
```

The vector file is the matrix plus a small header (1,267,586 bytes against 1,266,944 bytes of raw numbers), `save` dropped the 50 tombstones, and answers survive the round trip exactly. Everything since the last `save()` would be lost in a crash, which is the biggest gap between this store and a database with a write-ahead log.

### 7. Filter first or search first?

> [!example] The filter `lang == "ja"` keeps about 10% of the records and has nothing to do with what the query means. We ask for k = 10 three ways. In `post` mode the index returns its 40 nearest candidates and the filter runs afterwards, which is the pgvector arithmetic from the README quote above. Then a second case: the query lives in category A and the filter asks for category B.

```python
# ---- Case 1: a filter that has nothing to do with the query (about 10% of records have lang == "ja") ----
counter = CountingIndex()
fstore = MiniVectorStore(D, index=counter)
for i in range(N):
    fstore.add(f"doc{i}", raw[i], {"lang": str(langs[i]), "year": int(years[i])})
print(f"records with lang == 'ja': {int((langs == 'ja').sum())} of {N}")

qs = rng.standard_normal((200, D)).astype(np.float32)
K, C = 10, 40
where = {"lang": "ja"}
results = {}
for mode in ("pre", "post", "iterative"):
    counter.rows_scored = 0
    sizes, cands, ids = [], [], []
    for q in qs:
        hits = fstore.query(q, k=K, where=where, mode=mode, candidates=C)
        sizes.append(len(hits)); cands.append(fstore.last_candidates); ids.append([h.id for h in hits])
    results[mode] = ids
    print(f"{mode:<10} hits per query: min {min(sizes):>2}  mean {np.mean(sizes):5.2f}  max {max(sizes):>2}"
          f" | queries with a full {K}: {sum(s == K for s in sizes):>3}/200"
          f" | rows scored per query: {counter.rows_scored / 200:8.1f}")
print("iterative gives exactly the same answer as pre-filtering:", results["iterative"] == results["pre"])
print("post-filter hits are a subset of the pre-filter hits   :",
      all(set(p) <= set(r) for p, r in zip(results["post"], results["pre"])))

# ---- Case 2: a filter that is correlated with the query (the query lives in one category) ----
def make_clusters(per=1000):
    centres = l2_normalize(rng.standard_normal((3, D))) * 6.0
    vecs, cats = [], []
    for c, name in enumerate("ABC"):
        vecs.append(centres[c] + rng.standard_normal((per, D)))
        cats += [name] * per
    return centres, np.vstack(vecs).astype(np.float32), cats

centres, cvecs, cats = make_clusters()
cstore = MiniVectorStore(D)
for i, (v, c) in enumerate(zip(cvecs, cats)):
    cstore.add(f"c{i}", v, {"category": c})
query_in_A = centres[0] + 0.3 * rng.standard_normal(D)

top = cstore.query(query_in_A, k=K)
print("\nquery lives in category A. Unfiltered top-10 categories:", sorted({h.metadata['category'] for h in top}),
      f"| best score {top[0].score:.2f}")
for mode, cand in (("post", 100), ("iterative", 100), ("pre", None)):
    hits = cstore.query(query_in_A, k=K, where={"category": "B"}, mode=mode, candidates=cand)
    best = f"{hits[0].score:.2f}" if hits else "n/a"
    print(f"filter category == 'B', mode={mode:<9}: {len(hits):>2} hits, best score {best:>4}, "
          f"candidate list size {cstore.last_candidates}")
```

Output:

```
records with lang == 'ja': 528 of 5000
pre        hits per query: min 10  mean 10.00  max 10 | queries with a full 10: 200/200 | rows scored per query:    528.0
post       hits per query: min  0  mean  4.12  max 10 | queries with a full 10:   2/200 | rows scored per query:   5000.0
iterative  hits per query: min 10  mean 10.00  max 10 | queries with a full 10: 200/200 | rows scored per query:  13550.0
iterative gives exactly the same answer as pre-filtering: True
post-filter hits are a subset of the pre-filter hits   : True

query lives in category A. Unfiltered top-10 categories: ['A'] | best score 0.76
filter category == 'B', mode=post     :  0 hits, best score  n/a, candidate list size 100
filter category == 'B', mode=iterative: 10 hits, best score 0.41, candidate list size 1600
filter category == 'B', mode=pre      : 10 hits, best score 0.41, candidate list size 1000
```

Read the numbers:

- **Independent filter.** `post` returned 4.12 hits per query on average (40 candidates times the 10.56% of records that match is about 4.2), only 2 of 200 queries got a full 10, and one query got none. `pre` always returned 10, and scored only the 528 matching rows instead of all 5,000. `iterative` also always returned 10 and gave exactly the same answer as `pre`, but it re-scans the whole index each time it doubles the candidate list, so with an exact index it costs more. Its value is with an approximate index, where pre-filtering is the hard part.
- **Correlated filter.** None of the query's 100 nearest neighbours is in category B, so `post` with 100 candidates returns nothing. `iterative` had to grow its candidate list to 1,600 before ten B records appeared. `pre` returns ten B records, but their best score is 0.41 against 0.76 for the unfiltered best: they are the nearest B records, and not necessarily good matches.

### 8. When is the numpy array enough?

`footprint_gb` is the lower bound for any product: raw vectors only, before ids, metadata, index structures, replicas or free space. The loop times the exact scan from block 1 on random unit vectors.

```python
def footprint_gb(n_vectors, dim, bytes_per_dim=4):
    """Raw vector storage only: no ids, metadata, index structure, replicas or free space."""
    return n_vectors * dim * bytes_per_dim / 1e9

for label, n, d, b in [("internal wiki, 40k chunks, 1536-d float32", 40_000, 1536, 4),
                       ("support archive, 2M chunks, 768-d float32", 2_000_000, 768, 4),
                       ("same, stored as float16", 2_000_000, 768, 2),
                       ("SaaS, 3,000 tenants x 20k chunks, 768-d", 60_000_000, 768, 4),
                       ("catalogue, 200M items, 768-d float32", 200_000_000, 768, 4)]:
    print(f"{label:<44} {footprint_gb(n, d, b):9.2f} GB")
print(f"{'... one SaaS tenant (20k chunks)':<44} {footprint_gb(20_000, 768) * 1000:9.1f} MB")

def best_ms(fn, repeat=5):
    best = float("inf")
    for _ in range(repeat):
        t0 = time.perf_counter(); fn(); best = min(best, time.perf_counter() - t0)
    return best * 1000

index, D2, K2 = BruteForceIndex(), 384, 10
print(f"\nexact single-query latency, D={D2}, float32, k={K2} (best of 5; your machine will differ)")
print(f"{'N':>9}{'matrix MB':>11}{'ms/query':>10}")
for n in (10_000, 100_000, 500_000):
    X = np.empty((n, D2), dtype=np.float32)
    for start in range(0, n, 50_000):                              # fill in chunks to keep peak memory low
        X[start:start + 50_000] = rng.standard_normal((min(50_000, n - start), D2), dtype=np.float32)
    X = l2_normalize(X)
    q = X[123].copy()
    allowed = np.ones(n, dtype=bool)
    assert index.search(X, q, K2, allowed)[0][0] == 123            # sanity: a vector finds itself
    print(f"{n:>9,}{X.nbytes / 1e6:>11.1f}{best_ms(lambda: index.search(X, q, K2, allowed)):>10.1f}")
    del X
```

Output:

```
internal wiki, 40k chunks, 1536-d float32         0.25 GB
support archive, 2M chunks, 768-d float32         6.14 GB
same, stored as float16                           3.07 GB
SaaS, 3,000 tenants x 20k chunks, 768-d         184.32 GB
catalogue, 200M items, 768-d float32            614.40 GB
... one SaaS tenant (20k chunks)                  61.4 MB

exact single-query latency, D=384, float32, k=10 (best of 5; your machine will differ)
        N  matrix MB  ms/query
   10,000       15.4       0.2
  100,000      153.6       5.0
  500,000      768.0      26.1
```

The scan time grows roughly in proportion to the data (compare the 100,000 and 500,000 rows); the exact milliseconds are specific to the machine. The footprint table is the quick check for "does it even fit": the 200 million item catalogue needs 614.40 GB of raw float32 numbers before any index.

### What `MiniVectorStore` leaves out

An approximate index and the hooks it needs; any concurrency control (do not query while another thread upserts); a write-ahead log, so a crash loses everything since the last `save()`; an index on the metadata (the filter is an O(N) Python loop); memory-mapped or disk-resident data for collections larger than RAM; quantisation (Module 15); batching; and authentication. Each missing item is a row of the capability table, and each is the reason a database product exists.

## Visual diagram

```
  THE LANDSCAPE: where the search runs and what you still own

  YOUR PROCESS ◄──────────────────────────────────────────────────────────────► SOMEONE ELSE'S CLOUD
  most control, most to build                                          least to build, least control

  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐
  │ 1 in-process│  │ 2 embedded /│  │ 3 inside a    │  │ 4 purpose-    │  │ 5 managed   │
  │   library   │  │ local-first │  │ general DB    │  │ built engine  │  │   service   │
  │             │  │   store     │  │               │  │               │  │             │
  │ FAISS       │  │ Chroma      │  │ pgvector      │  │ Qdrant        │  │ Pinecone    │
  │ hnswlib     │  │ LanceDB OSS │  │ Elasticsearch │  │ Weaviate      │  │             │
  │             │  │ Milvus Lite │  │ OpenSearch    │  │ Milvus        │  │             │
  │             │  │             │  │ Redis, Mongo  │  │               │  │             │
  └─────────────┘  └─────────────┘  └───────────────┘  └───────────────┘  └─────────────┘
   you own:          you own:         you own:            you own:           you own:
   ids, metadata,    backups,         tuning another      one more stateful  API limits,
   storage, updates, one-process      system for a new    service to run     consistency
   concurrency       limits           workload                               behaviour, exit

  Products blur the lines: Milvus, Chroma and LanceDB each ship more than one shape.


  THE TWO LAYERS INSIDE ANY OF THEM

  ┌──────────────────────────────────────────────────────────────────────────┐
  │ DATABASE LAYER   ids · metadata · persistence · upsert/delete · filters  │
  │                  concurrency · backups · access control · sharding       │
  ├──────────────────────────────────────────────────────────────────────────┤
  │ SEARCH INDEX     exact scan · HNSW graph · IVF clusters · quantisation   │
  └──────────────────────────────────────────────────────────────────────────┘
        a library gives you the bottom row;  a database product gives you both


  FILTERED SEARCH, k = 10, filter keeps 10% of records, candidate list = 40

  POST-FILTER           40 nearest ──► drop non-matching ──► ~4 left   (can be 0)
  PRE-FILTER + EXACT    filter first ──► score only matches ──► 10 hits, exact
  FILTER IN THE SEARCH  index traversal skips non-matching ──► 10 hits, approximate index
  ITERATIVE POST        40 ──► too few? 80 ──► 160 ──► ... until 10 survive


  CHOOSING (questions, not a ranking)

   footprint = N × D × bytes ─► fits one machine's RAM and exact scan meets the latency budget?
        │ yes ─► exact search is a valid answer (array, flat index, extension in exact mode)
        │ no
        ▼
   already run Postgres / Elastic / OpenSearch / Redis / Mongo, and need joins or transactions?
        │ yes ─► try that extension first, test its filtering, keep an exit plan
        │ no
        ▼
   every query filtered (tenant, language, permissions) or text + vector together?
        │ yes ─► shortlist products whose filter strategy you have tested on YOUR filters
        ▼
   nobody to run a stateful service? ─► managed: test freshness, deletes, exit.   Beyond one machine? ─► distributed or managed
```

## Practice

### 1. Budget the memory

How many 768-dimension float32 vectors fit in 8 GB of raw storage? How many if you store float16 instead? Why will the number you can really store be smaller than both?

<details><summary>Answer</summary>

```python
budget_gb, dim = 8, 768
print("768-d float32 vectors that fit in 8 GB of raw storage:", int(budget_gb * 1e9 // (dim * 4)))
print("same budget, float16 (2 bytes per number)            :", int(budget_gb * 1e9 // (dim * 2)))
```

Output:

```
768-d float32 vectors that fit in 8 GB of raw storage: 2604166
same budget, float16 (2 bytes per number)            : 5208333
```

Each vector is `768 × 4 = 3,072` bytes (or 1,536 bytes at float16). The real capacity is smaller because the raw numbers are only part of the footprint: ids, metadata, the index structure (Redis's docs say higher values of the HNSW parameter `M` "increase accuracy, but also increase memory usage and index build time"), replicas and headroom for updates and compaction all take space. Treat `footprint_gb` as a lower bound.

</details>

### 2. Predict, then measure: a rare filter

A filter keeps 2% of the records, and the post-filter candidate list is 40. How many hits per query do you expect for k = 10? Then raise the candidate list to 500 (expected survivors 500 × 0.02 = 10). Do all queries now get 10?

<details><summary>Answer</summary>

Expected hits with 40 candidates: `40 × 0.02 = 0.8`. With 500 candidates the expected number of survivors equals k, which sounds sufficient but is not: the count varies from query to query, so many queries still fall short.

```python
rare = rng.random(N) < 0.02
rstore = MiniVectorStore(D)
for i in range(N):
    rstore.add(f"doc{i}", raw[i], {"rare": bool(rare[i])})
print(f"{int(rare.sum())} of {N} records match the filter ({rare.mean():.1%})")
for cand in (40, 500):
    sizes = [len(rstore.query(q, k=10, where={"rare": True}, mode="post", candidates=cand)) for q in qs]
    print(f"post-filter, candidates={cand:>3}: mean hits {np.mean(sizes):5.2f}, queries with a full 10: {sum(s == 10 for s in sizes):>3}/200")
```

Output:

```
100 of 5000 records match the filter (2.0%)
post-filter, candidates= 40: mean hits  0.82, queries with a full 10:   0/200
post-filter, candidates=500: mean hits  8.77, queries with a full 10: 114/200
```

So 0.82 hits per query matches the prediction, and even with 500 candidates only 114 of 200 queries reached 10. Sizing the candidate list so that the expected count equals k gives roughly a coin flip. Real fixes are pre-filtering or exact fallback, iterative scans, a much larger candidate list, or partitioning on the filter value.

</details>

### 3. The filter that silently matches nothing

Query with `where={"year": 2021}` and then `where={"year": "2021"}`. What happens, and what happens with `{"year": {"$gte": "2021"}}`? How would you stop this class of bug in a real system?

<details><summary>Answer</summary>

```python
print("year == 2021   ->", len(fstore.query(qs[0], k=5, where={"year": 2021})), "hits")
print("year == '2021' ->", len(fstore.query(qs[0], k=5, where={"year": "2021"})), "hits  (no error!)")
try:
    fstore.query(qs[0], k=5, where={"year": {"$gte": "2021"}})
except TypeError as e:
    print("year >= '2021' -> TypeError:", e)
```

Output:

```
year == 2021   -> 5 hits
year == '2021' -> 0 hits  (no error!)
year >= '2021' -> TypeError: '>=' not supported between instances of 'int' and 'str'
```

Equality across types is just `False`, so the string filter matches nothing and raises nothing. An ordering comparison across types raises, which is the better failure. Prevent it by validating metadata against a declared schema at write time (field names and types), casting query inputs to the schema's types, and logging or alerting when a filtered query returns zero hits.

</details>

### 4. Delete half the records

Delete every other record from a 5,000-record store. What do `stats()` report before and after `compact()`, and do answers change?

<details><summary>Answer</summary>

```python
hstore = MiniVectorStore(D)
for i in range(N):
    hstore.add(f"doc{i}", raw[i], {})
hstore.delete([f"doc{i}" for i in range(0, N, 2)])                 # delete every other record
print("after deleting half:", hstore.stats())
hits_before = [h.id for h in hstore.query(qs[0], k=5)]
hstore.compact()
print("after compact()    :", hstore.stats())
print("same top-5 after compact:", hits_before == [h.id for h in hstore.query(qs[0], k=5)])
print("only odd-numbered ids can appear:", all(int(h.id[3:]) % 2 == 1 for h in hstore.query(qs[0], k=50)))
```

Output:

```
after deleting half: {'live': 2500, 'rows_used': 5000, 'tombstones': 2500, 'capacity': 8192}
after compact()    : {'live': 2500, 'rows_used': 2500, 'tombstones': 0, 'capacity': 4096}
same top-5 after compact: True
only odd-numbered ids can appear: True
```

Before `compact()` the deleted rows are still in the buffer (`rows_used` is 5,000 for 2,500 live records), which is why a delete is not the same as freeing space and why products run compaction or vacuum jobs. After it the rows are gone and the buffer shrinks, with identical answers. Deleted vectors also linger in memory until then: if a delete must physically remove data by a deadline, check when your product actually does it.

</details>

### Checkpoint quiz

1. Name three capabilities of a vector database that `MiniVectorStore` does not provide.
2. pgvector's README says a filter matching 10% of rows, with `hnsw.ef_search` at its default of 40, returns about 4 matching rows on average. Which part of block 7 reproduces the same arithmetic, and is that a measurement of pgvector?
3. Why does `upsert` drop old metadata keys, and what does that imply when you port code between products?
4. A filter keeps 0.5% of records and an engine post-filters a candidate list of 100. How many hits per query should you expect, and name three ways to fix it.
5. Why should your vector database not be the only place your embeddings (or their source text) live?

<details><summary>Answers</summary>

1. Any three of: approximate indexes, concurrency control, a write-ahead log for crash safety, sharding or replication, backups and point-in-time recovery, access control, an index on metadata, data larger than RAM.
2. `post` mode with 40 candidates: it returned 4.12 hits on average for a filter keeping 10.56% of records (`40 × 0.1056 ≈ 4.2`). It is not a measurement of pgvector; it shows the same arithmetic on an exact index with an emulated strategy.
3. `upsert` is defined here as replace-the-record, which is simple and predictable. A product could merge instead, which would need a way to delete a single key. When porting code, check whether your product's update replaces or merges metadata.
4. `100 × 0.005 = 0.5` hits per query on average. Fixes: pre-filter (or exact scan of the matching subset), iterative scans that grow the candidate list, a much larger candidate list, or partitioning or separate indexes per filter value.
5. Vectors are derived data. A model change forces a full re-embed (Module 05), a product change forces a re-index, and a bad deploy can lose an index. If you keep text, metadata, model id and vectors in your own store, any of those is a rebuild rather than a loss.

</details>

> [!check]
> - I can list what a vector database adds over `X @ q` plus `argpartition`, and which parts `MiniVectorStore` covers.
> - I can name the five deployment shapes and say what each leaves me to own.
> - I can explain post-filter, pre-filter, filter-during-search and iterative strategies, and why post-filtering returns fewer than k.
> - I can use the eight-question framework to shortlist deployment shapes without ranking products.
> - I can estimate raw vector footprint from N, D and bytes per number.
> - I can describe a test plan (recall against exact search, write visibility, delete, restore) for a candidate.

## Project

Extend `MiniVectorStore` with a second, **approximate** index behind the same `search` interface. Choose a simple method: random-hyperplane buckets, or k-means partitions probed at query time (a preview of Modules 13-15). Then:

1. Measure recall@10 against `BruteForceIndex` on at least 200 queries, together with the number of rows scored per query, for two or three settings of your method's main knob.
2. Make it honour `allowed` and see how `pre`, `post` and `iterative` filtering behave on it with the filters from block 7. Say which strategy your approximate index makes hardest, and why.
3. Decide what upsert and delete must do to your index structure (a deleted record that is still in a bucket, a vector that moves between buckets) and add the hooks to the interface. Test with a reference.
4. Add a minimum-score threshold option to `query`, and show what it does to the correlated-filter case.
5. Write a one-page decision record for a scenario you invent (numbers for N, D, update rate, filters, team size and consistency needs). Use the eight questions to choose a **deployment shape**, not a product name. List what you would test first and what result would make you change your mind.

No code is given; design the interface changes yourself.

## Interview questions

> [!interview] Your team already runs Postgres, and a colleague wants to adopt a dedicated vector database for a RAG feature with about 500,000 documents. How do you decide?

<details><summary>What a strong answer covers</summary>

- Starts from requirements, not products: footprint (`N × D × bytes`), latency budget and concurrency, filters, update pattern, operations capacity, consistency needs.
- Notes the case for the existing system: one fewer service to run, transactions and joins with relational data, existing backups and access control; and states what must be tested rather than assumed (filtered recall, index build and update behaviour at this size, latency under load).
- Names what would justify a dedicated engine: scale beyond one machine, heavy filtering needs that the extension handles poorly in tests, operational needs the general system does not meet, or a managed service the team prefers to operate.
- Proposes a time-boxed evaluation on a golden query set, with exact search as ground truth and a recall@10 measurement, plus write, delete and restore tests.
- Keeps an exit plan: source text, metadata, model id and vectors stored outside the vector database.

</details>

> [!interview] Users filter by tenant and report that search sometimes returns only two or three results even though they have thousands of documents. Diagnose it.

<details><summary>What a strong answer covers</summary>

- Suspects post-filtering with a fixed candidate list: the index returns its nearest candidates across all tenants and the tenant filter removes most of them, so the count depends on how many survive.
- Gives the arithmetic (candidate list size times the fraction of data that matches) and notes it is worse when the tenant is small or its data is far from the query.
- Lists fixes: engines or settings that filter during the search, pre-filtering with exact fallback for selective filters, iterative scans, a larger candidate list, or per-tenant partitions, namespaces or indexes.
- Mentions tenant isolation in a shared approximate index can also affect recall, citing the product's own guidance, and says how to confirm: compare with exact search restricted to the tenant.

</details>

> [!interview] Right after an upsert the next query does not return the new document, and a deleted document occasionally still appears. What could be going on, and how do you design around it?

<details><summary>What a strong answer covers</summary>

- Eventual consistency: some services document a delay before writes are visible (Pinecone's docs say so and offer log sequence numbers to check), and replicas can lag.
- Deletion mechanics: tombstones or marked-deleted entries are excluded at query time but may linger, and caches in the application can serve stale results.
- Design: decide whether read-your-writes is required; if so, use a product mode or consistency level that gives it, or poll a freshness signal before reading; avoid tests that write then read without waiting.
- Test it explicitly: write, query, delete, query, under load and on replicas; and treat deletion deadlines (privacy) as a requirement to verify, not assume.

</details>

## Common mistakes & troubleshooting

- **A top-k query returns fewer than k results.** Almost always a filter applied after the nearest-neighbour step (block 7, Exercise 2). pgvector's FAQ also lists dead tuples as a cause. Check the filter strategy, enlarge the candidate list, enable iterative scans where offered, or pre-filter.
- **A filter matches nothing and nothing complains.** A type or spelling mismatch between the stored metadata and the filter value (`"2021"` versus `2021`; Exercise 3). Validate against a schema and alert on zero-hit filtered queries.
- **Recall is fine without a filter and poor with one.** The filter is correlated with the query or the index is shared across groups. Test with a golden set that includes your real filters, compare with exact search on the filtered subset, and consider partitions.
- **A deleted or updated record still shows up.** Eventual consistency, a replica that lags, a tombstone not yet compacted, or an application cache. Test deletes explicitly (Exercise 4 shows tombstones in a store you can inspect).
- **Latency creeps up as data grows.** An exact scan grows with N (block 8). Re-measure at ten times the size before launch.
- **`load` raises "different saves".** The two files came from different `save()` calls: a crash between renames, or one file copied without the other. Restore both from the same backup.
- **Memory use is well above `N × D × 4`.** That formula is a lower bound. Add ids, metadata, index structures, replicas and headroom.
- **Search quality changed after a migration.** Metric or normalisation differs between systems (Module 03), or vectors from different models share an index (Module 05).

## Further reading & sources

- [GitHub - pgvector/pgvector: Open-source vector similarity search for Postgres](https://github.com/pgvector/pgvector) - the README is the source for the post-filtering arithmetic (10% of rows with `hnsw.ef_search` 40 gives about 4), iterative index scans, ACID and point-in-time recovery, and tenant-isolation advice.
- [FAQ · facebookresearch/faiss Wiki](https://github.com/facebookresearch/faiss/wiki/FAQ) - states that Faiss ids are 64-bit integers only, that filtering is limited and id-based, and the one-index-per-value workaround; the clearest example of a library that gives you only the index layer.
- [GitHub - nmslib/hnswlib: Header-only C++/python library for fast approximate nearest neighbors](https://github.com/nmslib/hnswlib) - the README documents save and load, `mark_deleted`, a search-time `filter`, and its thread-safety rules, which show what "concurrency" means for an in-process library.
- [Chroma Clients - Chroma Docs](https://docs.trychroma.com/docs/run-chroma/clients) - documents the in-memory, persistent, HTTP and cloud client shapes behind one API, the model for the embedded category.
- [Indexing - Qdrant](https://qdrant.tech/documentation/manage-data/indexing/) - explains why a vector index and a payload index cannot solve filtered search separately and describes the filterable HNSW graph.
- [Filtering | Weaviate Documentation](https://docs.weaviate.io/weaviate/concepts/filtering) - a clear description of pre-filtering versus post-filtering, allow-lists and the switch to flat search for restrictive filters.
- [Filter approximate kNN results | Elastic Docs](https://www.elastic.co/docs/solutions/search/vector/knn/filtered-knn-search) - shows the same query returning k hits with a filter inside the kNN clause and fewer than k with the filter outside it.
- [Check data freshness - Pinecone Docs](https://docs.pinecone.io/guides/index-data/check-data-freshness) - the managed-service view of consistency: eventual consistency, and how to tell whether a write is visible to queries.

## Next

[Module 10: pgvector and Postgres](../10-pgvector-and-postgres/README.md)
