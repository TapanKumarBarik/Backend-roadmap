# Module 10: pgvector and Postgres

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. [Module 03](../03-cosine-similarity-and-distance-metrics/README.md) taught the four ways to turn two vectors into a number, [Module 05](../05-generating-embeddings-at-scale/README.md) built the pipeline that produces vectors reliably, and [Module 09: The Vector Database Landscape](../09-the-vector-database-landscape/README.md) covers the other options. This module goes deep on the one most backend teams already run: **Postgres with the pgvector extension**.

After this module you can:

- create a `vector(n)` column, load embeddings into it, upsert them idempotently, and query them with `ORDER BY embedding <=> $1 LIMIT k`;
- say which operator is which metric, and why `<#>` returns a *negative* number;
- explain exact scan, HNSW and IVFFlat, set their build and query parameters, and create the index at the right moment with the matching operator class;
- predict why a `WHERE` clause can make an indexed query return fewer than `k` rows, and fix it;
- measure the recall of an index against exact search in your own database instead of trusting a default.

Why it matters: for many products the first vector store is "a column in the database we already have", which is a good choice when vectors should live next to the rows they describe, in the same transactions and backups. It stays a good choice only if you know the few ways it quietly returns slower or worse answers than you expect. Each one is demonstrated below.

> [!note] How the claims here are sourced. Every default value, parameter name and rule comes from the pgvector README (the `master` branch, whose install instructions pin `v0.8.7`) or the pgvector-python README, both fetched and read in Oct 2026, or from output produced by this module's code. This machine already had Docker and a `pgvector/pgvector:pg16` image, so the SQL was **executed for real** on pgvector **0.8.6** and Postgres **16.14**; nothing was pulled or installed. Per the pgvector CHANGELOG (checked Oct 2026), 0.8.7 fixes an IVFFlat build buffer overflow and an `avg` error on empty input, neither of which this module touches. The Python client in block 12 is **not executed** (its packages are not installed here). No timings were measured, so none are claimed.

## Concept

> [!key] pgvector adds a `vector(n)` column type, four distance operators (`<->` L2, `<#>` negative inner product, `<=>` cosine distance, `<+>` L1) and two optional approximate indexes (HNSW, IVFFlat) to Postgres, so semantic search is the ordinary query `ORDER BY embedding <=> $1 LIMIT k` and `WHERE`, joins and transactions work as usual. The price of an approximate index is that it can miss true neighbours, and that a `WHERE` clause is applied after the index has produced its candidates.

## Explanation

### Why teams choose pgvector, and what they give up

The README's pitch is "store your vectors with the rest of your data", with ACID compliance, point-in-time recovery and JOINs (per the pgvector README, checked Oct 2026). Concretely:

- **One system, one transaction.** A chunk's text, metadata and embedding are written, updated and deleted together, so they cannot drift apart. Block 3 shows a failed transaction leaving nothing behind.
- **Joins and ordinary filters.** "The most similar posts by authors on this team" is one query, not a vector search plus a lookup in a second system (block 3).
- **Operations you already have.** The README says pgvector uses the write-ahead log, so replication and point-in-time recovery work, and suggests existing tools such as `pg_stat_statements` for monitoring. It lists clients for many languages.
- **No sync job** between two datastores.

What you give up: you scale the way Postgres scales. The README's scaling advice is to shrink the working set (`halfvec`, binary quantization), scale vertically, add replicas, or shard with Citus, PgDog or another approach. There are two approximate index types, and the index shares memory and CPU with the rest of your workload. For the dedicated alternatives, see Module 09 (The Vector Database Landscape); this module is about doing the "stay in Postgres" option well.

> [!model] A B-tree answers "which rows match exactly?". An approximate vector index answers "which rows are probably the nearest?", and *probably* is a dial you set (`ef_search`, `probes`) that trades recall for speed. Nearly every surprise below is that dial sitting somewhere you did not expect.

### The type, the operators and the query shape

Run `CREATE EXTENSION vector;` once per database. A `vector(3)` column stores three single-precision floats per row. The README says a vector takes `4 * dimensions + 8` bytes, holds only finite numbers, and can have up to 16,000 dimensions, but the approximate indexes only accept `vector` columns of up to 2,000 dimensions (`halfvec`: 4,000). The declared size is enforced: four numbers into `vector(3)` fail with `expected 3 dimensions, not 4` (block 2).

| Operator | Meaning | Index operator class | To show a similarity |
| --- | --- | --- | --- |
| `<->` | L2 (Euclidean) distance | `vector_l2_ops` | not needed, smaller is closer |
| `<#>` | **negative** inner product | `vector_ip_ops` | `(embedding <#> q) * -1` |
| `<=>` | cosine distance | `vector_cosine_ops` | `1 - (embedding <=> q)` |
| `<+>` | L1 (taxicab) distance | `vector_l1_ops` (listed under HNSW only) | not needed |

(per the pgvector README, checked Oct 2026; it also lists `<~>` Hamming and `<%>` Jaccard for the `bit` type, not used here). In the README's words, `<#>` is negative "since Postgres only supports `ASC` order index scans on operators": to make "largest inner product first" sort ascending, the sign is flipped.

That is why the query shape is always an ascending sort with a limit:

```sql
SELECT id, body FROM chunks ORDER BY embedding <=> $1 LIMIT 5;
```

> [!model] The `ORDER BY` is a fixed slot that holds exactly one thing: a bare distance operator, ascending, with a `LIMIT`. Anything you want to *show* (a similarity, a percentage) is computed in the `SELECT` list. Anything else in the `ORDER BY` turns the index off.

The README's troubleshooting section says an index is used only when the query has an `ORDER BY` and a `LIMIT`, and the `ORDER BY` is "the result of a distance operator (not an expression) in ascending order". A distance filter such as `WHERE embedding <-> q < 5` also needs the `ORDER BY` and `LIMIT` to use an index. Block 9 shows what each violation looks like in a plan.

> [!pitfall] `ORDER BY embedding <#> $1 DESC` looks natural ("biggest inner product first") but `<#>` is already negated, so `DESC` returns the *least* similar row first. Block 2 shows it.

Which operator to use is Module 03's decision, not a pgvector one: on unit-length vectors `<->`, `<#>` and `<=>` rank identically (block 6 confirms it inside real pgvector), and the README recommends inner product for best exact-search performance on normalized vectors. Match the operator to how the model was trained.

### Exact scan first

With no index pgvector computes the distance to every row and sorts: exact neighbours, perfect recall. That is the default, and the README adds the sentence that matters most for evaluation: "Unlike typical indexes, you will see different results for queries after adding an approximate index." A B-tree never changes your answers; HNSW and IVFFlat can. Exact search is therefore your **ground truth**: the README's monitoring advice is to compare approximate results with exact ones using `SET LOCAL enable_indexscan = off`, which is how every recall figure below was computed.

Exact scan is also a real plan, not a toy. It is right for a small table, and the planner can choose it by itself when a `WHERE` keeps only a tiny fraction of rows (block 10). Without an index you can still add parallel workers (`max_parallel_workers_per_gather`, per the README). When to leave exact search is the subject of [Module 13: Exact vs. Approximate Search](../13-exact-vs-approximate-search/README.md).

### Two approximate indexes

| | HNSW | IVFFlat |
| --- | --- | --- |
| What it is (README) | a multilayer graph | vectors divided into lists; a query searches the lists closest to it |
| Speed-recall trade-off | better | lower |
| Build time and memory | slower, more memory | faster, less memory |
| Needs data before it is built? | no, there is no training step | **yes**: create it after the table has data |
| Build options | `m` (16 by default), `ef_construction` (64 by default) | `lists` (no default stated; examples use 100) |
| Query option | `hnsw.ef_search` (40 by default) | `ivfflat.probes` (1 by default) |
| Starting advice | use the build defaults unless recall is low | `lists` = rows / 1000 up to 1M rows, `sqrt(rows)` above; `probes` = `sqrt(lists)` |

(per the pgvector README, checked Oct 2026; both index `vector` up to 2,000 and `halfvec` up to 4,000 dimensions). How the graph and the clusters work is the topic of [Module 14: HNSW Explained](../14-hnsw-explained/README.md) and [Module 15: IVF, Product Quantization and Other Indexes](../15-ivf-product-quantization-and-other-indexes/README.md); here you only need the dials.

**HNSW.** `m` is the maximum number of connections per layer and `ef_construction` the candidate-list size while building; the README says a higher `ef_construction` gives better recall at the cost of build time and insert speed. At query time `hnsw.ef_search` is the candidate-list size for the search: higher is better recall, slower. It is also a ceiling on how many rows an indexed query can return, since the README's FAQ says results are "limited by the size of the dynamic candidate list". Block 8 shows `ef_search = 5` with `LIMIT 10` returning five rows.

**IVFFlat.** The README names "three keys to achieving good recall": create the index *after* the table has data, choose a sensible number of `lists`, and set a sensible `probes` at query time. People skip the first. IVFFlat's build runs k-means over the rows that exist at that moment (one of its progress phases is `performing k-means`), so on an empty table there is nothing to cluster. Postgres says so with a notice (`ivfflat index created with little data`) and block 7 measures the damage on the same 20,000 rows. The README adds that `probes` can be set to the number of lists to make the search exact.

> [!pitfall] Creating an IVFFlat index in the same migration that creates the table gives you an index that works, returns rows, raises no error, and has poor recall. Load first, then index. HNSW has no such step.

### One index per metric, and the operator class must match

An index serves one distance function. The README says to "add an index for each distance function you want to use", each with its own operator class (table above). A query benefits only if its operator is the one the index was built with; otherwise Postgres does an exact scan and sort, which is correct but slow, with no error. Block 9 prints the plans: a `vector_cosine_ops` index is used by `<=>` and ignored by `<->`; after a second index with `vector_ip_ops` is built, `<#>` uses that one.

### Filtering: the `WHERE` clause runs after the index

The README: "filtering is applied *after* the index is scanned. If a condition matches 10% of rows, with HNSW and the default `hnsw.ef_search` of 40, only 4 rows will match on average." The index hands back about 40 candidates, the filter discards the 90% that do not match, and `LIMIT 10` gets whatever is left. Block 10 measures 3.84 rows on average, and some queries return none. The README's remedies, in its order:

1. **Index the filter column** (B-tree or multicolumn). Postgres can then search the matching rows exactly; the README says this works well when the condition matches a low percentage of rows. (README only, not run here.)
2. **Iterative index scans**, added in 0.8.0: `SET hnsw.iterative_scan = strict_order;` or `relaxed_order` (and `ivfflat.iterative_scan = relaxed_order`). The scan continues until enough rows are found or it hits `hnsw.max_scan_tuples` (20,000 by default) or `ivfflat.max_probes`. *Strict* keeps results in exact distance order; *relaxed* allows them slightly out of order for better recall, and a materialized CTE can restore strict order.
3. **Partial indexes** when you filter on a few distinct values and **partitioning** when you filter on many.
4. For **multi-tenant** apps, a shared approximate index lets one tenant's vectors affect the recall and speed of the others; the README suggests list partitioning or separate tables.

The FAQ adds that dead tuples can also reduce the result, and that `NULL` vectors are not indexed (nor zero vectors for cosine distance). Filtered search in general is the topic of [Module 16: Metadata Filtering and Hybrid Queries](../16-metadata-filtering-and-hybrid-queries/README.md); this module gives you pgvector's symptoms and switches.

### Smaller vectors: `halfvec`

The README documents several ways to shrink the working set. The simplest is the `halfvec` type (half-precision elements, `2 * dimensions + 8` bytes per vector, indexable up to 4,000 dimensions). You can also keep the table as `vector` and index a *cast* of it, so the index is smaller while the stored data stays full precision ("half-precision indexing"):

```sql
CREATE INDEX ON items USING hnsw ((embedding::halfvec(3)) halfvec_l2_ops);
```

Queries must repeat the same cast or the planner will not match the index (block 11). The README also documents binary quantization (`binary_quantize`, a `bit` index with Hamming distance, then a re-rank by the original vectors) and indexing a `subvector`. Those are **not run here**; they trade recall for size, so measure them on your own data.

### Operating it

| Topic | What the README says (checked Oct 2026) | Run here? |
| --- | --- | --- |
| Loading | `COPY ... FROM STDIN WITH (FORMAT BINARY)` for bulk loads; add indexes *after* loading the initial data | text-format `COPY`, block 5 |
| HNSW build speed | much faster when the graph fits in `maintenance_work_mem`; a notice appears when it no longer fits; do not set it so high the server runs out of memory | no |
| Parallel builds | `max_parallel_maintenance_workers` (2 by default), maybe `max_parallel_workers` (8 by default); in Docker, `--shm-size` must be at least `maintenance_work_mem` for parallel HNSW builds | set to 0, blocks 7 to 11 |
| Live tables | `CREATE INDEX CONCURRENTLY`, so writes are not blocked | no |
| Progress | `pg_stat_progress_create_index` | no |
| Debugging a query | `EXPLAIN (ANALYZE, BUFFERS)` | `EXPLAIN (COSTS OFF)`, blocks 6 to 11 |
| Vacuum | can be slow for HNSW; reindex first (`REINDEX INDEX CONCURRENTLY`) | no |
| Recall monitoring | compare with exact search using `SET LOCAL enable_indexscan = off` | every recall figure here |
| Memory | indexes need not fit in memory but perform better if they do; `pg_relation_size('index_name')` gives the size | sizes, blocks 7, 8, 11 |
| Upgrades | install the new version, then `ALTER EXTENSION vector UPDATE;` per database; check with `SELECT extversion FROM pg_extension WHERE extname = 'vector';` | version query, block 2 |
| Per-query settings | `SET LOCAL hnsw.ef_search = 100;` inside a transaction | block 4 |

## Code

Python 3.13 and numpy 2.4.6 only, plus the `docker` command. The Python code reaches Postgres by piping SQL into `psql` inside the container, so no database driver is needed. Every random generator is seeded. HNSW and IVFFlat builds are not bit-for-bit repeatable (blocks 7 and 8 build twice to show it), so if you re-run these blocks expect recall figures to move in the second decimal place while the shapes stay the same.

### 1. Start a throwaway pgvector

```bash
docker run -d --rm --name pgvector-demo -e POSTGRES_PASSWORD=demo pgvector/pgvector:pg16
docker exec pgvector-demo pg_isready -U postgres
```

`pgvector/pgvector` is the image the README links for Docker, and `pg16` is one of the tags it lists; per that tag list `pg16` currently corresponds to pgvector 0.8.7, while the image on this machine, which produced every output below, has 0.8.6. I ran exactly these commands except for the container name, which I made unique so it could not clash with other containers here, and I passed it to the Python code through the `PGV_CONTAINER` environment variable that `pgv.py` reads. No port is published. Cleanup is `docker stop pgvector-demo`; `--rm` deletes the container when it stops.

### 2. The operators, the query shape and the dimension check, in real pgvector

Save as `tiny.sql` and run `docker exec -i pgvector-demo psql -U postgres -X -q < tiny.sql`.

```sql
CREATE EXTENSION vector;
SELECT extversion FROM pg_extension WHERE extname = 'vector';

-- 1. A vector column and the four distance operators (query vector: [3,1,2])
CREATE TABLE items (id bigserial PRIMARY KEY, name text, embedding vector(3));
INSERT INTO items (name, embedding)
VALUES ('a', '[1,2,3]'), ('b', '[4,5,6]'), ('c', '[6,2,4]'), ('d', '[-3,-1,-2]');

SELECT id, name,
       embedding <->  '[3,1,2]' AS l2,
       embedding <#>  '[3,1,2]' AS neg_ip,
       embedding <=>  '[3,1,2]' AS cosine_dist,
       embedding <+>  '[3,1,2]' AS l1
FROM items ORDER BY id;

-- 2. The query shape: ORDER BY <distance operator> (ascending) LIMIT k, once per operator
SELECT 'l2' AS op, array_agg(id ORDER BY d) AS top3
  FROM (SELECT id, embedding <-> '[3,1,2]' AS d FROM items ORDER BY d LIMIT 3) t
UNION ALL
SELECT 'neg_ip', array_agg(id ORDER BY d)
  FROM (SELECT id, embedding <#> '[3,1,2]' AS d FROM items ORDER BY d LIMIT 3) t
UNION ALL
SELECT 'cosine', array_agg(id ORDER BY d)
  FROM (SELECT id, embedding <=> '[3,1,2]' AS d FROM items ORDER BY d LIMIT 3) t
UNION ALL
SELECT 'l1', array_agg(id ORDER BY d)
  FROM (SELECT id, embedding <+> '[3,1,2]' AS d FROM items ORDER BY d LIMIT 3) t;

-- 3. Turning distances back into the scores you may expect (README recipes)
SELECT id, (embedding <#> '[3,1,2]') * -1 AS inner_product,
       1 - (embedding <=> '[3,1,2]') AS cosine_similarity
FROM items ORDER BY id;

-- 4. The classic bug: DESC on a negative inner product returns the LEAST similar row first
SELECT id, name FROM items ORDER BY embedding <#> '[3,1,2]' DESC LIMIT 1;

-- 5. A wrong-sized vector is rejected by the column type
INSERT INTO items (name, embedding) VALUES ('bad', '[1,2,3,4]');
```

Output (trailing blanks trimmed):

```
 extversion
------------
 0.8.6
(1 row)

 id | name |         l2         | neg_ip |     cosine_dist     | l1
----+------+--------------------+--------+---------------------+----
  1 | a    |  2.449489742783178 |    -11 |  0.2142857142857143 |  4
  2 | b    |  5.744562646538029 |    -29 | 0.11673988938389968 |  9
  3 | c    | 3.7416573867739413 |    -28 |                   0 |  6
  4 | d    |  7.483314773547883 |     14 |                   2 | 12
(4 rows)

   op   |  top3
--------+---------
 l2     | {1,3,2}
 neg_ip | {2,3,1}
 cosine | {3,2,1}
 l1     | {1,3,2}
(4 rows)

 id | inner_product | cosine_similarity
----+---------------+--------------------
  1 |            11 | 0.7857142857142857
  2 |            29 | 0.8832601106161003
  3 |            28 |                  1
  4 |           -14 |                 -1
(4 rows)

 id | name
----+------
  4 | d
(1 row)

ERROR:  expected 3 dimensions, not 4
```

Four different winners for the same query: `<->` and `<+>` pick `a` (closest tip), `<#>` picks `b` (the biggest inner product, 29, so the smallest negative), and `<=>` picks `c`, which is the query doubled (`[6,2,4]` against `[3,1,2]`), so its cosine distance is 0 although it is 3.74 away in L2. The README's two recipes turn distances back into scores. `ORDER BY embedding <#> q DESC LIMIT 1` returns row 4, the vector pointing the opposite way: the `DESC` bug. The extension version query returned `0.8.6`, and the last statement shows the type enforcing its declared size.

### 3. One database: a join, a rolled-back transaction, and an idempotent upsert

Save as `relational.sql` and run it the same way, in the same database (it needs the extension from block 2).

```sql
-- One database: vectors next to ordinary tables, joins and transactions
CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE posts (id serial PRIMARY KEY, author_id int NOT NULL REFERENCES authors (id),
                    title text NOT NULL, embedding vector(3) NOT NULL);
INSERT INTO authors VALUES (1, 'Asha'), (2, 'Ben');
INSERT INTO posts (author_id, title, embedding) VALUES
    (1, 'Intro to indexes', '[1,2,3]'), (1, 'Vacuum and bloat', '[4,5,6]'),
    (2, 'Query planning',   '[6,2,4]'), (2, 'Backups',          '[-3,-1,-2]');

-- A similarity query with a JOIN and an ordinary WHERE
SELECT p.title, a.name AS author, p.embedding <=> '[3,1,2]' AS cosine_dist
FROM posts p JOIN authors a ON a.id = p.author_id
WHERE a.name = 'Ben'
ORDER BY p.embedding <=> '[3,1,2]' LIMIT 2;

-- A transaction: the second insert violates a foreign key, so the first one disappears too
BEGIN;
INSERT INTO posts (author_id, title, embedding) VALUES (1, 'Draft', '[0,0,1]');
INSERT INTO posts (author_id, title, embedding) VALUES (99, 'Orphan', '[0,1,0]');
ROLLBACK;
SELECT count(*) AS posts_after_rollback FROM posts;

-- Upsert keyed on (model, content_hash): Module 05's cache key, enforced by the database
CREATE TABLE chunks (id bigserial PRIMARY KEY, model text NOT NULL, content_hash text NOT NULL,
                     body text NOT NULL, embedding vector(3) NOT NULL, UNIQUE (model, content_hash));
INSERT INTO chunks (model, content_hash, body, embedding) VALUES ('m1', 'h1', 'hello', '[1,2,3]')
    ON CONFLICT (model, content_hash) DO UPDATE SET embedding = EXCLUDED.embedding;
INSERT INTO chunks (model, content_hash, body, embedding) VALUES ('m1', 'h1', 'hello', '[9,9,9]')
    ON CONFLICT (model, content_hash) DO UPDATE SET embedding = EXCLUDED.embedding;
SELECT count(*) AS rows, max(embedding::text) AS stored FROM chunks;
```

Output (trailing blanks trimmed):

```
     title      | author | cosine_dist
----------------+--------+-------------
 Query planning | Ben    |           0
 Backups        | Ben    |           2
(2 rows)

ERROR:  insert or update on table "posts" violates foreign key constraint "posts_author_id_fkey"
DETAIL:  Key (author_id)=(99) is not present in table "authors".
 posts_after_rollback
----------------------
                    4
(1 row)

 rows | stored
------+---------
    1 | [9,9,9]
(1 row)
```

The join returns only Ben's posts, ranked by cosine distance. In the transaction the first insert succeeds and the second violates the foreign key, so after `ROLLBACK` the table still has four rows and the draft vector is gone. The upsert wrote the same `(model, content_hash)` twice and left one row holding the second embedding. That uniqueness constraint is Module 05's cache key moved into the database, which makes re-running an embedding pipeline safe.

### 4. The settings, and their defaults as the server reports them

Save as `settings.sql` and run it the same way (each `psql` run is a fresh session, which matters for the first statement).

```sql
-- A brand-new session has not loaded pgvector's library yet, so its settings do not exist yet
SHOW hnsw.ef_search;
-- Any use of the extension loads it
SELECT '[1,2,3]'::vector AS touch_the_extension;
SELECT name, setting FROM pg_settings WHERE name LIKE 'hnsw.%' OR name LIKE 'ivfflat.%' ORDER BY name;

-- SET LOCAL, and set_config(name, value, is_local), last until the end of the transaction
BEGIN;
SET LOCAL hnsw.ef_search = 100;
SELECT current_setting('hnsw.ef_search') AS after_set_local,
       set_config('hnsw.ef_search', '150', true) AS set_config_returned;
SELECT current_setting('hnsw.ef_search') AS after_set_config;
COMMIT;
SELECT current_setting('hnsw.ef_search') AS after_commit;
```

Output (trailing blanks trimmed):

```
ERROR:  unrecognized configuration parameter "hnsw.ef_search"
 touch_the_extension
---------------------
 [1,2,3]
(1 row)

           name           | setting
--------------------------+---------
 hnsw.ef_search           | 40
 hnsw.iterative_scan      | off
 hnsw.max_scan_tuples     | 20000
 hnsw.scan_mem_multiplier | 1
 ivfflat.iterative_scan   | off
 ivfflat.max_probes       | 32768
 ivfflat.probes           | 1
(7 rows)

 after_set_local | set_config_returned
-----------------+---------------------
 100             | 150
(1 row)

 after_set_config
------------------
 150
(1 row)

 after_commit
--------------
 40
(1 row)
```

The four defaults the README states all match the server: `hnsw.ef_search` 40, `ivfflat.probes` 1, `hnsw.max_scan_tuples` 20,000 and `hnsw.scan_mem_multiplier` 1. The README does not state the other two defaults; the server reports `iterative_scan` as `off` for both index types (iterative scans are opt-in) and `ivfflat.max_probes` as 32768. Two more observations: pgvector's settings do not exist in a brand-new session until the extension's library has been loaded, so the first `SHOW` fails; and `SET LOCAL` and `set_config(..., true)` both revert at the end of the transaction, which is why the Python client uses the latter.

### 5. Helpers for the experiments

The next blocks use a 20,000-row table of 32-dimensional unit vectors, clustered the way text embeddings are (not uniform noise), plus 100 query vectors drawn the same way and a random `category_id` from 0 to 9 per row. Save the helper file below as `pgv.py` next to the step files. Queries are read from a `queries` table through a scalar subquery (the README's "nearest neighbors to a row" shape), which keeps plans short; `explain` hides the sub-plan that fetches the query vector.

<details><summary>pgv.py (plumbing; open to copy)</summary>

```python
"""pgv.py - helpers shared by the steps below. Needs numpy and the `docker` CLI, nothing else.
It runs SQL by piping it into `psql` inside a running pgvector container, so no Postgres driver is needed."""
import os
import subprocess

import numpy as np

CONTAINER = os.environ.get("PGV_CONTAINER", "pgvector-demo")
K = 10                      # neighbours per query


def psql(sql):
    """Run a SQL script in the container; return its rows ('|'-separated) plus any NOTICE text."""
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres",
           "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
    res = subprocess.run(cmd, input=sql, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip())
    return res.stdout + res.stderr


def vec_text(v):
    """pgvector's text format '[x1,x2,...]'. Nine significant digits round-trip a float32 exactly."""
    return "[" + ",".join(f"{x:.9g}" for x in v) + "]"


def make_corpus(n=20_000, dim=32, n_clusters=40, n_queries=100, seed=0, noise=1.5):
    """Clustered unit-length float32 vectors (text embeddings are clustered, not uniform noise), 100 query
    vectors drawn the same way, and a random category 0-9 per row, independent of the vector."""
    rng = np.random.default_rng(seed)
    centres = rng.normal(size=(n_clusters, dim))

    def draw(m):
        pts = centres[rng.integers(0, n_clusters, size=m)] + noise * rng.normal(size=(m, dim))
        pts /= np.linalg.norm(pts, axis=1, keepdims=True)
        return pts.astype(np.float32)

    return draw(n), draw(n_queries), rng.integers(0, 10, size=n)


X, Q, CAT = make_corpus()


def ensure_loaded():
    """Create and fill `docs` (20,000 rows) and `queries` (100 rows) unless they are already there."""
    exists = psql("SELECT to_regclass('docs') IS NOT NULL;").strip() == "t"
    if exists and psql("SELECT count(*) FROM docs;").strip() == str(len(X)):
        return
    psql("CREATE EXTENSION IF NOT EXISTS vector;")
    lines = ["DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS queries;",
             "CREATE TABLE docs (id int PRIMARY KEY, category_id int, embedding vector(32));",
             "CREATE TABLE queries (qid int PRIMARY KEY, embedding vector(32));",
             "COPY docs (id, category_id, embedding) FROM STDIN;"]
    lines += [f"{i}\t{CAT[i]}\t{vec_text(X[i])}" for i in range(len(X))]
    lines += [r"\.", "COPY queries (qid, embedding) FROM STDIN;"]
    lines += [f"{i}\t{vec_text(Q[i])}" for i in range(len(Q))]
    lines += [r"\.", "ANALYZE docs; ANALYZE queries;"]
    psql("\n".join(lines) + "\n")


def reset_indexes():
    """Drop every index the steps create, so each step starts from the bare table."""
    psql("DROP INDEX IF EXISTS ivf, hnsw_cos, hnsw_ip, hnsw_f32, hnsw_f16;")


def run(settings=(), where="", op="<=>", cast="", table="docs"):
    """Top-K ids for every query vector, in one psql session: {qid: [ids in returned order]}.
    `settings` are SET statements; `cast` (e.g. '::halfvec(32)') is applied to both sides of the operator."""
    stmts = list(settings)
    w = f"WHERE {where} " if where else ""
    for i in range(len(Q)):
        stmts.append(f"SELECT {i}, id FROM {table} {w}"
                     f"ORDER BY embedding{cast} {op} (SELECT embedding{cast} FROM queries WHERE qid = {i}) LIMIT {K};")
    res = {i: [] for i in range(len(Q))}
    for line in psql("\n".join(stmts) + "\n").splitlines():
        if "|" in line:
            qid, doc_id = line.split("|")
            res[int(qid)].append(int(doc_id))
    return res


def recall(res, exact):
    """(mean fraction of the exact top-K that was returned, mean number of rows returned)."""
    hits = [len(set(res[i]) & set(exact[i])) / len(exact[i]) for i in res]
    return float(np.mean(hits)), float(np.mean([len(res[i]) for i in res]))


def explain(sql, settings=""):
    """The query plan without cost numbers, and without the sub-plan that just fetches the query vector."""
    lines = psql(f"{settings}EXPLAIN (COSTS OFF) {sql}").rstrip().splitlines()
    return "\n".join(l for l in lines if not any(s in l for s in ("InitPlan", "on queries", "qid = ")))
```

</details>

### 6. Exact scan: pgvector against numpy, and the identities from Module 03

```python
import numpy as np
from pgv import *

ensure_loaded()
reset_indexes()
n_docs, n_queries = psql("SELECT count(*), (SELECT count(*) FROM queries) FROM docs;").strip().split("|")
print(f"docs: {n_docs} rows of 32 dimensions, queries: {n_queries}")

# 1. With no index every query is an exact scan. Is pgvector's exact answer numpy's exact answer?
exact = run()
ref = {i: [int(j) for j in np.argsort(-(X.astype(np.float64) @ Q[i].astype(np.float64)))[:K]] for i in range(len(Q))}
print("pgvector <=> top-10 identical (same order) to numpy cosine top-10:", sum(exact[i] == ref[i] for i in exact), "of", len(Q), "queries")

# 2. The unit-vector identities from Module 03, through four real operators
for op, name in [("<->", "L2"), ("<#>", "negative inner product"), ("<=>", "cosine"), ("<+>", "L1")]:
    res = run(op=op)
    same = sum(res[i] == exact[i] for i in res)
    overlap = np.mean([len(set(res[i]) & set(exact[i])) for i in res])
    print(f"{op}  {name:<22} same ordered top-10 as <=> in {same:>3} of {len(Q)} queries, mean overlap {overlap:.1f} of {K}")

# 3. What an exact scan looks like to the planner
print(explain("SELECT id FROM docs ORDER BY embedding <=> (SELECT embedding FROM queries WHERE qid = 0) LIMIT 10;"))
```

Output:

```
docs: 20000 rows of 32 dimensions, queries: 100
pgvector <=> top-10 identical (same order) to numpy cosine top-10: 100 of 100 queries
<->  L2                     same ordered top-10 as <=> in 100 of 100 queries, mean overlap 10.0 of 10
<#>  negative inner product same ordered top-10 as <=> in 100 of 100 queries, mean overlap 10.0 of 10
<=>  cosine                 same ordered top-10 as <=> in 100 of 100 queries, mean overlap 10.0 of 10
<+>  L1                     same ordered top-10 as <=> in   0 of 100 queries, mean overlap 5.7 of 10
Limit
  ->  Sort
        Sort Key: ((docs.embedding <=> $0))
        ->  Seq Scan on docs
```

With no index, pgvector's `<=>` top-10 matches a float64 numpy brute force in all 100 queries, in the same order. `<->`, `<#>` and `<=>` return the same ordered top-10 in all 100, as Module 03's identities predict for unit vectors; `<+>` (L1) returns the same order in none and shares 5.7 of 10 ids on average. The plan is a `Seq Scan` feeding a `Sort`: every row is visited.

### 7. IVFFlat: probes, and building the index too early

```python
import numpy as np
from pgv import *

ensure_loaded()
reset_indexes()
exact = run()                                    # no index yet: exact
build = "SET max_parallel_maintenance_workers = 0; "     # one build worker, to keep the experiment simple

# README starting point for lists: rows / 1000 up to 1M rows  ->  20,000 / 1000 = 20.
# Build the index twice on the same data to see how much a rebuild changes the recall.
PROBES = (1, 2, 5, 10, 20)
tables = []
for attempt in (1, 2):
    reset_indexes()
    psql(build + "CREATE INDEX ivf ON docs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);")
    tables.append({p: run([f"SET ivfflat.probes = {p};"]) for p in PROBES})
print("index size:", psql("SELECT pg_size_pretty(pg_relation_size('ivf'));").strip())

print("\nIVFFlat, lists = 20, built AFTER loading 20,000 rows (two separate builds)")
print("probes  recall@10 (build 1)  recall@10 (build 2)  rows returned")
for p in PROBES:
    r1, rows = recall(tables[0][p], exact)
    r2, _ = recall(tables[1][p], exact)
    print(f"{p:>6}  {r1:>19.3f}  {r2:>19.3f}  {rows:>13.1f}")

q0 = "SELECT id FROM docs ORDER BY embedding <=> (SELECT embedding FROM queries WHERE qid = 0) LIMIT 10;"
print("\nplan with probes = 20 (= lists):")
print(explain(q0, "SET ivfflat.probes = 20; "))

# The same index definition on an EMPTY table that is filled afterwards
psql("DROP TABLE IF EXISTS docs_early; CREATE TABLE docs_early (LIKE docs INCLUDING ALL);")
print("\ncreating the index on the empty table:")
print(psql(build + "CREATE INDEX ON docs_early USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);").strip())
psql("INSERT INTO docs_early SELECT * FROM docs; ANALYZE docs_early;")
print("\nsame 20,000 rows, same lists = 20, but the index was built before the data arrived")
print("probes  recall@10")
for p in (1, 5, 20):
    res = run([f"SET ivfflat.probes = {p};"], table="docs_early")
    print(f"{p:>6}  {recall(res, exact)[0]:>9.3f}")
psql("DROP TABLE docs_early;")
```

Output:

```
index size: 3000 kB

IVFFlat, lists = 20, built AFTER loading 20,000 rows (two separate builds)
probes  recall@10 (build 1)  recall@10 (build 2)  rows returned
     1                0.634                0.620           10.0
     2                0.749                0.751           10.0
     5                0.907                0.905           10.0
    10                0.983                0.984           10.0
    20                1.000                1.000           10.0

plan with probes = 20 (= lists):
Limit
  ->  Index Scan using ivf on docs
        Order By: (embedding <=> $0)

creating the index on the empty table:
NOTICE:  ivfflat index created with little data
DETAIL:  This will cause low recall.
HINT:  Drop the index until the table has more data.

same 20,000 rows, same lists = 20, but the index was built before the data arrived
probes  recall@10
     1      0.276
     5      0.724
    20      1.000
```

Recall@10 is the share of the exact top-10 the index returned. `lists = 20` is the README's starting rule (20,000 / 1,000). Raising `probes` buys recall: about 0.62 to 0.63 at one probe, 0.98 at ten, and 1.000 at twenty, which is every list and therefore an exact search. The two builds differ by 0.014 at `probes = 1` here (and by up to 0.04 in other runs I made), so treat gaps of a few hundredths between single builds as noise.

Two results to read closely. First, the README says that with `probes` equal to the number of lists the planner will not use the index; here `EXPLAIN` still shows an `Index Scan` at `probes = 20`, although the results were exact. I did not investigate why and a larger table may behave differently, so check your own plan instead of relying on either description. Second, building the *same* index on the empty table and then loading the same rows printed the notice and cut recall at `probes = 1` to 0.276 from about 0.62, and at `probes = 5` to 0.724 from about 0.91. Across every run I made while developing this module, the early-built index stayed between 0.25 and 0.29 at one probe and the late-built one between 0.62 and 0.66. Only `probes = 20` was unaffected, since it scans everything.

### 8. HNSW: `ef_search`, and what a rebuild changes

```python
import numpy as np
from pgv import *

ensure_loaded()
reset_indexes()
exact = run()
build = "SET max_parallel_maintenance_workers = 0; "

# No WITH clause: the default m and ef_construction. Build it twice to see how much a rebuild changes the recall.
sizes, tables = [], []
for attempt in (1, 2):
    reset_indexes()
    psql(build + "CREATE INDEX hnsw_cos ON docs USING hnsw (embedding vector_cosine_ops);")
    sizes.append(psql("SELECT pg_size_pretty(pg_relation_size('hnsw_cos'));").strip())
    tables.append({ef: run([f"SET hnsw.ef_search = {ef};"]) for ef in (5, 10, 20, 40, 100, 200)})
print("HNSW (default m and ef_construction) index sizes for two builds of the same data:", sizes)

print("\nef_search  recall@10 (build 1)  recall@10 (build 2)  rows returned")
for ef in (5, 10, 20, 40, 100, 200):
    r1, rows = recall(tables[0][ef], exact)
    r2, _ = recall(tables[1][ef], exact)
    print(f"{ef:>9}  {r1:>19.3f}  {r2:>19.3f}  {rows:>13.1f}")

# An approximate index changes the answers: compare the default setting with the exact scan, per query
changed = sum(set(tables[1][40][i]) != set(exact[i]) for i in exact)
print(f"\nwith ef_search = 40, {changed} of {len(Q)} queries return a different set of 10 ids than the exact scan")
```

Output:

```
HNSW (default m and ef_construction) index sizes for two builds of the same data: ['8496 kB', '8496 kB']

ef_search  recall@10 (build 1)  recall@10 (build 2)  rows returned
        5                0.448                0.451            5.0
       10                0.760                0.780           10.0
       20                0.885                0.891           10.0
       40                0.956                0.953           10.0
      100                0.993                0.992           10.0
      200                0.999                0.999           10.0

with ef_search = 40, 29 of 100 queries return a different set of 10 ids than the exact scan
```

Recall climbs with `ef_search`: about 0.77 at 10, 0.95 at the default of 40, 0.99 at 100 and 0.999 at 200. With `ef_search = 5` and `LIMIT 10` only five rows come back, so the candidate list really is a ceiling on the result size. The two builds differ by up to 0.02 (at `ef_search = 10`) and by 0.003 at the default. At the default setting 29 of the 100 queries return a set of ten ids that is not identical to the exact one: that is what the README means by seeing different results after adding an approximate index.

### 9. Does the planner use the index? Operator classes and query shapes

```python
from pgv import *

ensure_loaded()
reset_indexes()
build = "SET max_parallel_maintenance_workers = 0; "
psql(build + "CREATE INDEX hnsw_cos ON docs USING hnsw (embedding vector_cosine_ops);")

q = "(SELECT embedding FROM queries WHERE qid = 0)"
cases = {
    "1. operator matches the index (<=> with vector_cosine_ops)":
        f"SELECT id FROM docs ORDER BY embedding <=> {q} LIMIT 10;",
    "2. a different operator (<->) on the cosine index":
        f"SELECT id FROM docs ORDER BY embedding <-> {q} LIMIT 10;",
    "3. the distance wrapped in an expression, DESC":
        f"SELECT id FROM docs ORDER BY 1 - (embedding <=> {q}) DESC LIMIT 10;",
    "4. no LIMIT":
        f"SELECT id FROM docs ORDER BY embedding <=> {q};",
}
for title, sql in cases.items():
    print(title)
    print(explain(sql))
    print()

# One index per distance function: add an inner-product index next to the cosine one
psql(build + "CREATE INDEX hnsw_ip ON docs USING hnsw (embedding vector_ip_ops);")
print("5. with a second index built with vector_ip_ops, the <#> query")
print(explain(f"SELECT id FROM docs ORDER BY embedding <#> {q} LIMIT 10;"))
```

Output:

```
1. operator matches the index (<=> with vector_cosine_ops)
Limit
  ->  Index Scan using hnsw_cos on docs
        Order By: (embedding <=> $0)

2. a different operator (<->) on the cosine index
Limit
  ->  Sort
        Sort Key: ((docs.embedding <-> $0))
        ->  Seq Scan on docs

3. the distance wrapped in an expression, DESC
Limit
  ->  Sort
        Sort Key: (('1'::double precision - (docs.embedding <=> $0))) DESC
        ->  Seq Scan on docs

4. no LIMIT
Sort
  Sort Key: ((docs.embedding <=> $0))
  ->  Seq Scan on docs

5. with a second index built with vector_ip_ops, the <#> query
Limit
  ->  Index Scan using hnsw_ip on docs
        Order By: (embedding <#> $0)
```

Only case 1 reads the index. A different operator (case 2), a distance wrapped in an expression with `DESC` (case 3) and a missing `LIMIT` (case 4) all fall back to `Seq Scan` plus `Sort`, with no error and correct results. With a second index built with `vector_ip_ops`, the `<#>` query uses `hnsw_ip` (case 5): one index per metric.

### 10. Filtering: fewer rows than `LIMIT`, and the fixes

> [!example] The same HNSW index and the same 100 queries, now with `WHERE category_id = 3` (about 10% of rows) and then a filter that keeps 1%. "Empty" counts queries that returned no rows at all. Recall is measured against an exact scan with the same filter.

```python
import numpy as np
from pgv import *

ensure_loaded()
reset_indexes()
psql("SET max_parallel_maintenance_workers = 0; CREATE INDEX hnsw_cos ON docs USING hnsw (embedding vector_cosine_ops);")
q = "(SELECT embedding FROM queries WHERE qid = 0)"


def report(label, flt, settings, exact_f):
    res = run(settings, where=flt)
    rows = [len(v) for v in res.values()]
    print(f"{label:<34} {np.mean(rows):>8.2f} {min(rows):>4} {max(rows):>4} {sum(r == 0 for r in rows):>6} "
          f"{recall(res, exact_f)[0]:>9.3f}")


def header(title):
    return f"{title:<34} {'avg rows':>8} {'min':>4} {'max':>4} {'empty':>6} {'recall@10':>9}"


# --- A filter that keeps about 10% of the rows (categories are random 0-9) ---
flt = "category_id = 3"
print(f"rows matching '{flt}': {psql(f'SELECT count(*) FROM docs WHERE {flt};').strip()} of {len(X)}")
print(explain(f"SELECT id FROM docs WHERE {flt} ORDER BY embedding <=> {q} LIMIT 10;"))

exact_f = run(["SET enable_indexscan = off;"], where=flt)     # ground truth: exact scan with the filter
print("\n" + header("10% filter, LIMIT 10"))
report("default (ef_search = 40)", flt, [], exact_f)
report("ef_search = 100", flt, ["SET hnsw.ef_search = 100;"], exact_f)
report("ef_search = 200", flt, ["SET hnsw.ef_search = 200;"], exact_f)
report("iterative_scan = strict_order", flt, ["SET hnsw.iterative_scan = strict_order;"], exact_f)
report("iterative_scan = relaxed_order", flt, ["SET hnsw.iterative_scan = relaxed_order;"], exact_f)

# --- A filter that keeps about 1% of the rows ---
flt = "id % 100 = 7"
exact_f = run(["SET enable_indexscan = off;"], where=flt)
print(f"\nrows matching '{flt}': {psql(f'SELECT count(*) FROM docs WHERE {flt};').strip()} of {len(X)}")
print("plan the planner picks by itself:")
print(explain(f"SELECT id FROM docs WHERE {flt} ORDER BY embedding <=> {q} LIMIT 10;"))

no_seq = ["SET enable_seqscan = off;"]                          # force the planner to use the HNSW index
print("\n" + header("1% filter, LIMIT 10"))
report("planner's own choice", flt, [], exact_f)
report("index forced, default", flt, no_seq, exact_f)
report("index forced, ef_search = 200", flt, no_seq + ["SET hnsw.ef_search = 200;"], exact_f)
report("index forced, strict_order", flt, no_seq + ["SET hnsw.iterative_scan = strict_order;"], exact_f)
report("index forced, relaxed_order", flt, no_seq + ["SET hnsw.iterative_scan = relaxed_order;"], exact_f)
```

Output:

```
rows matching 'category_id = 3': 1945 of 20000
Limit
  ->  Index Scan using hnsw_cos on docs
        Order By: (embedding <=> $0)
        Filter: (category_id = 3)

10% filter, LIMIT 10               avg rows  min  max  empty recall@10
default (ef_search = 40)               3.84    0    9      3     0.384
ef_search = 100                        8.48    2   10      0     0.832
ef_search = 200                        9.96    8   10      0     0.982
iterative_scan = strict_order         10.00   10   10      0     0.924
iterative_scan = relaxed_order        10.00   10   10      0     0.964

rows matching 'id % 100 = 7': 200 of 20000
plan the planner picks by itself:
Limit
  ->  Sort
        Sort Key: ((docs.embedding <=> $0))
        ->  Seq Scan on docs
              Filter: ((id % 100) = 7)

1% filter, LIMIT 10                avg rows  min  max  empty recall@10
planner's own choice                  10.00   10   10      0     1.000
index forced, default                  0.31    0    2     77     0.031
index forced, ef_search = 200          1.83    0    5     14     0.183
index forced, strict_order            10.00   10   10      0     0.961
index forced, relaxed_order           10.00   10   10      0     0.996
```

At 10%, the default `ef_search = 40` returns 3.84 rows on average (the README's arithmetic says about 4), between 0 and 9, and three queries return nothing. `ef_search = 100` gives 8.48 and 200 gives 9.96, never a guarantee. Iterative scans return 10 rows for every query; `relaxed_order` has the higher recall (0.964 against 0.924) because it may return rows slightly out of order, which the README documents and I did not measure.

At 1% the planner makes a different and better choice by itself: it abandons the vector index, filters during an exact `Seq Scan` and sorts, so every query gets 10 rows with recall 1.000. Forcing the index with `enable_seqscan = off` (the README's way to encourage an index) shows what the index alone would have done: 0.31 rows on average, with 77 of 100 queries returning nothing (the README arithmetic gives 0.4). Iterative scans repair even that: 10 rows each, recall 0.961 (strict) and 0.996 (relaxed). The symptom depends on which plan you got, so read `EXPLAIN` before tuning.

### 11. `halfvec`: a smaller index, and the cast that must match

```python
from pgv import *

ensure_loaded()
reset_indexes()
exact = run()
build = "SET max_parallel_maintenance_workers = 0; "
q = "(SELECT embedding{c} FROM queries WHERE qid = 0)"

print("table size:", psql("SELECT pg_size_pretty(pg_relation_size('docs'));").strip())

psql(build + "CREATE INDEX hnsw_f32 ON docs USING hnsw (embedding vector_cosine_ops);")
size32 = psql("SELECT pg_size_pretty(pg_relation_size('hnsw_f32'));").strip()
rec32 = {ef: recall(run([f"SET hnsw.ef_search = {ef};"]), exact)[0] for ef in (40, 100)}

reset_indexes()
psql(build + "CREATE INDEX hnsw_f16 ON docs USING hnsw ((embedding::halfvec(32)) halfvec_cosine_ops);")
size16 = psql("SELECT pg_size_pretty(pg_relation_size('hnsw_f16'));").strip()
rec16 = {ef: recall(run([f"SET hnsw.ef_search = {ef};"], cast="::halfvec(32)"), exact)[0] for ef in (40, 100)}

print(f"\n{'index':<36} {'size':>8} {'recall@10, ef=40':>17} {'recall@10, ef=100':>18}")
print(f"{'vector_cosine_ops on vector(32)':<36} {size32:>8} {rec32[40]:>17.3f} {rec32[100]:>18.3f}")
print(f"{'halfvec_cosine_ops on ::halfvec(32)':<36} {size16:>8} {rec16[40]:>17.3f} {rec16[100]:>18.3f}")

print("\nquery written to match the index expression:")
print(explain(f"SELECT id FROM docs ORDER BY embedding::halfvec(32) <=> {q.format(c='::halfvec(32)')} LIMIT 10;"))
print("\nquery that forgets the cast:")
print(explain(f"SELECT id FROM docs ORDER BY embedding <=> {q.format(c='')} LIMIT 10;"))
```

Output:

```
table size: 3584 kB

index                                    size  recall@10, ef=40  recall@10, ef=100
vector_cosine_ops on vector(32)       8504 kB             0.952              0.992
halfvec_cosine_ops on ::halfvec(32)   7216 kB             0.951              0.990

query written to match the index expression:
Limit
  ->  Index Scan using hnsw_f16 on docs
        Order By: ((embedding)::halfvec(32) <=> $0)

query that forgets the cast:
Limit
  ->  Sort
        Sort Key: ((docs.embedding <=> $0))
        ->  Seq Scan on docs
```

On this table the half-precision index is about 15% smaller (7,216 kB against 8,504 kB) with the same recall at both `ef_search` settings, within build noise. I measured only 32 dimensions, so I make no claim about the saving at other sizes. The query that repeats the cast `embedding::halfvec(32)` uses the index; the one that forgets it falls back to `Seq Scan` plus `Sort`.

### 12. A Python client with psycopg and pgvector (not executed)

> [!example] This is how application code talks to the same kind of table. It is **not executed here**: psycopg and the pgvector Python package are not installed on this machine, and I installed nothing. The names `register_vector` and `Vector` come from the pgvector-python README's Psycopg 3 section; `autocommit=True` with `conn.transaction()` and the `"psycopg[binary]"` install form come from the Psycopg 3 documentation, all checked Oct 2026. The file passes `python -m py_compile`, and every SQL statement in it has the same form as one executed in blocks 2 to 4, except the commented-out `CREATE INDEX CONCURRENTLY`, which was not run anywhere.

```python
"""NOT EXECUTED in this module's verification: psycopg and the pgvector Python package are not installed on the
machine used here and nothing was installed. Names are taken from the pgvector-python README (checked Oct 2026).

    pip install "psycopg[binary]" pgvector
"""
import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector

DIM = 384                      # must equal the output size of your embedding model
DSN = "postgresql://postgres:demo@localhost:5432/postgres"   # the container needs a published port: docker run -p 5432:5432 ...

with psycopg.connect(DSN, autocommit=True) as conn:
    conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    register_vector(conn)                       # after the extension exists; teaches psycopg the vector type
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS chunks (
            id           bigserial PRIMARY KEY,
            model        text NOT NULL,
            content_hash text NOT NULL,         -- the cache key from Module 05
            body         text NOT NULL,
            embedding    vector({DIM}) NOT NULL,
            UNIQUE (model, content_hash)
        )""")

    def upsert(model, content_hash, body, vec):
        """Idempotent write: re-running the embedding pipeline does not create duplicates."""
        conn.execute(
            """INSERT INTO chunks (model, content_hash, body, embedding) VALUES (%s, %s, %s, %s)
               ON CONFLICT (model, content_hash) DO UPDATE SET embedding = EXCLUDED.embedding""",
            (model, content_hash, body, Vector(vec)))

    def search(query_vec, k=5, ef_search=100):
        """Top-k chunks by cosine distance. The setting is local to the transaction, as in the README's SET LOCAL."""
        with conn.transaction():                # BEGIN ... COMMIT, even though the connection is autocommit
            conn.execute("SELECT set_config('hnsw.ef_search', %s, true)", (str(ef_search),))
            return conn.execute(
                """SELECT id, body, embedding <=> %s AS distance
                   FROM chunks ORDER BY embedding <=> %s LIMIT %s""",
                (Vector(query_vec), Vector(query_vec), k)).fetchall()

    # Build the index AFTER the first bulk load; use CONCURRENTLY on a live table (README).
    # conn.execute("CREATE INDEX CONCURRENTLY ON chunks USING hnsw (embedding vector_cosine_ops)")
```

Three details worth copying. `register_vector(conn)` comes after `CREATE EXTENSION`, because it teaches the driver about a type that must already exist. `set_config('hnsw.ef_search', %s, true)` is the parameterised form of `SET LOCAL` (block 4 ran it), so the setting cannot leak to the next user of a pooled connection. And `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, one reason the connection is in autocommit mode.

### What these numbers do and do not show

Everything measured here is one synthetic corpus: 20,000 vectors, 32 dimensions, 40 clusters, one seed. The recall figures belong to that data and those settings, not to pgvector in general, and real embeddings at hundreds of dimensions will sit elsewhere on every curve. What transfers is the shape: recall rises as the dial turns, an `ef_search` below `LIMIT` caps the result, a filter thins what an index returns, an IVFFlat index built on no data is poor, and a mismatched operator silently gives an exact scan. Run this harness on your own vectors before deciding anything.

## Visual diagram

```
  Where pgvector sits

  WRITE PATH (Module 05)                                READ PATH
  ┌────────────┐    ┌───────────────────┐               ┌─────────────────────┐
  │ chunk text │───►│ embed: batched,   │               │ user query text     │
  │ + metadata │    │ cached by hash    │               └──────────┬──────────┘
  └────────────┘    └─────────┬─────────┘                          ▼
                              ▼                          embed with the SAME model
                  INSERT .. ON CONFLICT / COPY                     │
                              │                                    │
  ┌───────────────────────────▼────────────────────────────────────▼──────────┐
  │ Postgres table chunks(id, model, content_hash, body, category_id,         │
  │                       embedding vector(n))                                │
  │                                                                           │
  │  B-tree on filter columns      HNSW or IVFFlat index on embedding         │
  │                                (one per operator class you query with)    │
  │  same transactions, joins, backups and replication as your other data     │
  └───────────────────────────────────────────────────────────────────────────┘
      SELECT .. FROM chunks JOIN .. WHERE .. ORDER BY embedding <=> $1 LIMIT k


  Why a filtered query can return fewer than k rows (measured: 10% filter, ef_search = 40)

  ┌──────────────────┐     ┌───────────────────────┐     ┌─────────────────────────┐
  │ HNSW index scan  │────►│ WHERE category_id = 3 │────►│ rows returned           │
  │ ~40 candidates   │     │ keeps ~10% of them    │     │ ~4 on average (3.84),   │
  │ (ef_search)      │     │                       │     │ range 0 to 9            │
  └────────▲─────────┘     └───────────────────────┘     └────────────┬────────────┘
           │                                                          │
           └─ iterative_scan on: fewer than LIMIT survived? ◄─────────┘
              keep scanning, up to LIMIT rows or hnsw.max_scan_tuples (20,000)


  Choosing a path

  how many rows, and how selective is the WHERE?
      │
      ├── few rows, or a filter that keeps a tiny fraction ──► no vector index: exact scan
      │        (the planner may pick this itself: block 10, the 1% filter)
      │
      └── many rows, weak or no filter
              │
              ├── best speed-recall trade-off, more memory, slower build ──► HNSW
              │        dial: hnsw.ef_search   (up = better recall, slower)
              │        can be built on an empty table
              │
              └── faster build, less memory, lower trade-off ──► IVFFlat
                       dial: ivfflat.probes   (up = better recall, slower)
                       build it AFTER the data is loaded
```

## Practice

### 1. Predict, then check

Using the four rows of block 2 (`a=[1,2,3]`, `b=[4,5,6]`, `c=[6,2,4]`, `d=[-3,-1,-2]`) and the query `[3,1,2]`, say which row each of `<->`, `<#>`, `<=>` and `<+>` ranks first, without running anything. Then check against block 2.

<details><summary>Answer</summary>

`<->` and `<+>` rank `a` first: its tip is closest (L2 2.449, L1 4). `<#>` ranks `b` first: its inner product with the query is 29, the largest, so its negative (-29) is the smallest. `<=>` ranks `c` first: `c` is exactly twice the query, so the angle is zero and the cosine distance is 0, although `c` is 3.74 away in L2. Row `d` points the opposite way and is last for cosine (distance 2) and for inner product (the value is +14).

</details>

### 2. Size an IVFFlat index from the README's rules

Using the README's starting advice (`lists` = rows / 1000 up to 1M rows and `sqrt(rows)` above; `probes` = `sqrt(lists)`), give the starting `lists` and `probes` for tables of 20,000, 1,000,000 and 4,000,000 rows. What would you do before trusting them?

<details><summary>Answer</summary>

20,000 rows: 20 lists, `sqrt(20)` is about 4.5, so start around 4 or 5 probes. 1,000,000 rows: 1,000 lists, `sqrt(1000)` is about 31.6, so about 32 probes. 4,000,000 rows: `sqrt(4,000,000)` is 2,000 lists, `sqrt(2000)` is about 44.7, so about 45 probes. They are starting points, not tuned values: build the index on the loaded data, measure recall against an exact scan for several `probes` values (block 7), and keep the smallest setting that meets your recall target.

</details>

### 3. How many rows will a filtered query return?

An HNSW table has a filter that keeps 5% of the rows. With the default `ef_search` and `LIMIT 10`, about how many rows do you expect? What `ef_search` would the "average" arithmetic suggest to reach 10, and why is that still not a guarantee?

<details><summary>Answer</summary>

The README's arithmetic gives `40 x 0.05 = 2` rows on average. To expect 10 survivors you would need `ef_search` of about `10 / 0.05 = 200`. It is not a guarantee because that is the *average number of survivors*, and the query returns `min(survivors, 10)`, which averages below 10 whenever the number of survivors varies. Block 10 shows it at 10%: `ef_search = 100` is the "average is 10" setting and returned 8.48 rows on average, with some queries returning 2. Iterative scans (`hnsw.iterative_scan`) are the setting that targets the guarantee, bounded by `hnsw.max_scan_tuples`.

</details>

### 4. Find the bugs

Each has a bug or a silent performance problem. Say what is wrong and fix it.

1. `SELECT id FROM docs ORDER BY 1 - (embedding <=> $1) DESC LIMIT 5;`
2. `SELECT id FROM docs ORDER BY embedding <#> $1 DESC LIMIT 5;`
3. An index created `USING hnsw (embedding vector_l2_ops)`, queried with `ORDER BY embedding <=> $1 LIMIT 5`.
4. An index created `USING hnsw ((embedding::halfvec(384)) halfvec_cosine_ops)`, queried with `ORDER BY embedding <=> $1 LIMIT 5`.

<details><summary>Answer</summary>

1. The `ORDER BY` is an expression, so the index is not used (block 9, case 3, shows `Seq Scan` plus `Sort`). Order by the bare distance, ascending, and compute the similarity in the select list: `SELECT id, 1 - (embedding <=> $1) AS similarity FROM docs ORDER BY embedding <=> $1 LIMIT 5;`.
2. `<#>` is the negative inner product, so `DESC` returns the *least* similar rows first (block 2 returned row `d`). Drop the `DESC`.
3. The operator does not match the operator class: `<=>` needs `vector_cosine_ops`. Block 9, case 2, shows the same failure with the operators swapped: an exact scan and sort, no error. Build the index with `vector_cosine_ops`, or query with `<->` if L2 is what you want.
4. The query does not repeat the index expression, so the planner cannot match it (block 11, "forgets the cast"). Cast both sides, for example `ORDER BY embedding::halfvec(384) <=> $1::halfvec(384) LIMIT 5`.

</details>

### Checkpoint quiz

1. Why does `<#>` return the negative inner product?
2. On unit-length vectors, which of `<->`, `<#>`, `<=>` and `<+>` give the same ranking, and what did block 6 measure for each?
3. A filtered query on an indexed table returns four rows with `LIMIT 10`. Give the cause and two fixes.
4. When must an IVFFlat index be created relative to loading data, and what does it look like when you get it wrong?
5. A colleague says "an index never changes query results, it only changes speed". Is that true for pgvector?

<details><summary>Answers</summary>

1. Postgres only supports ascending-order index scans on operators, so pgvector flips the sign: the largest inner product becomes the smallest value and sorts first (per the README). Multiply by -1 to show the real inner product.
2. `<->`, `<#>` and `<=>` give the same ordered top-10 (100 of 100 queries in block 6), because for unit vectors `L2^2 = 2 - 2 cos` and the inner product equals the cosine. `<+>` (L1) matched in none and shared 5.7 of 10 ids on average.
3. The `WHERE` is applied after the index returns its `ef_search` candidates (about 40 by default), so only the matching fraction survives. Fixes: iterative scans (`hnsw.iterative_scan`), a larger `ef_search`, an index on the filter column so Postgres can search the matching rows exactly, or a partial index or partitioning.
4. After the table has data. Built on an empty table, Postgres prints `ivfflat index created with little data` ("This will cause low recall") and queries still run; block 7 measured recall at `probes = 1` of 0.276 against about 0.62 for the same index built after loading.
5. False for approximate indexes. The README says that, unlike typical indexes, you will see different results after adding one, and block 8 found 29 of 100 queries with a different set of ids at the default `ef_search`. Only an exact scan has perfect recall.

</details>

> [!check]
> - I can write `ORDER BY embedding <=> $1 LIMIT k` and say why it must be a bare, ascending distance operator with a limit.
> - I can explain why `<#>` is negative and what goes wrong with `DESC`.
> - I can describe how exact scan, HNSW and IVFFlat differ, name the build and query parameters of each, and say when each index must be built.
> - I can pick the operator class that matches my query operator and prove the index is used with `EXPLAIN`.
> - I can explain why a filter makes an indexed query return fewer than `k` rows and name three fixes.
> - I can measure recall against an exact scan by turning index scans off.

## Project

Build a small semantic search over a corpus of your choice (a few thousand text chunks) with Postgres as the only datastore, and decide with measurements which index to ship. Reuse the embedding pipeline from Module 05 so the table is keyed by model and content hash and a re-run adds no duplicates. The deliverable is a short report plus the harness that produced it. The harness should load the data with `COPY`; hold out a set of query vectors; compute recall@10 of an HNSW index and an IVFFlat index against an exact scan for at least four values of each query-time dial, building each index twice; repeat the evaluation with a filter that keeps about half the rows, about 10% and about 1%, comparing the default settings, iterative scans, and one filter-aware layout of your choice (B-tree, partial index or partitioning); and record the Postgres and pgvector versions. Show the `EXPLAIN` output that proves which plan produced each result. Finish with a recommendation (index type, build parameters, query settings, what you would monitor in production) and two sentences on what your numbers do not tell you about other data. No code is given; design the schema and the harness yourself.

## Interview questions

> [!interview] Your team already runs Postgres, and a colleague proposes a dedicated vector database for a retrieval feature. Argue for keeping the vectors in Postgres, and say what evidence would change your mind.

<details><summary>What a strong answer covers</summary>

- The concrete benefits: one transaction for the row and its embedding, joins and ordinary filters in the same query, existing backups, point-in-time recovery and replication through the write-ahead log, existing monitoring tools, and no second store to keep in sync.
- Honest limits: scaling follows Postgres (vertical, replicas, sharding with extra tooling); two approximate index types only; the index competes with the rest of the workload for memory; indexable dimensions are capped (2,000 for `vector`, 4,000 for `halfvec`) with half-precision and quantization as the documented workarounds.
- Treats "fast enough" as something to measure: build on representative data and compare recall and latency with the requirement, including filtered queries.
- Names what would change the decision: volume beyond what one node can serve, a needed capability the extension lacks, a need to isolate the vector workload from transactional traffic, or measured recall and latency that miss the target after tuning.

</details>

> [!interview] After adding an HNSW index, `WHERE tenant_id = 42 ORDER BY embedding <=> $1 LIMIT 10` returns three rows. Diagnose and fix it.

<details><summary>What a strong answer covers</summary>

- The mechanism: the approximate index returns about `ef_search` candidates (40 by default) and the filter is applied afterwards, so a selective filter leaves few rows; the expectation is roughly `ef_search x selectivity`.
- How to confirm: `EXPLAIN` showing an index scan with a filter, a count of returned rows, and a comparison with an exact result (`enable_indexscan = off`).
- Fixes with trade-offs: iterative scans (strict keeps exact ordering, relaxed gives better recall but may be slightly out of order, both bounded by `hnsw.max_scan_tuples`); a larger `ef_search` (slower, never a guarantee); an index on the filter column; a partial index for a few values; partitioning or per-tenant tables for many values and for tenant isolation.
- Notes that for very selective filters the planner may already choose an exact plan, so the symptom depends on the plan.

</details>

> [!interview] The top-10 for a query changed after you created an index and changed slightly again after you rebuilt it. Is something broken? How do you quantify and control it?

<details><summary>What a strong answer covers</summary>

- Nothing is broken: an approximate index trades recall for speed by design, results can differ from the exact scan, and a rebuild can change the structure slightly.
- Quantify: recall@k against an exact scan (`SET LOCAL enable_indexscan = off`) on a held-out set of real queries, reported with the settings and the pgvector and Postgres versions.
- Control: the dials, `ef_search` (and `m`, `ef_construction` at build time) for HNSW, `lists` and `probes` for IVFFlat, with IVFFlat built after the data is loaded.
- Treats small differences between single builds as noise unless the evaluation is large enough, and re-measures after data growth or upgrades.
- Mentions the opposite failure: a mismatched operator or a query shape that defeats the index returns exact but slow results with no error, so check plans.

</details>

## Common mistakes & troubleshooting

- **A similarity query is slow and `EXPLAIN` shows `Seq Scan` plus `Sort`.** The index is not matched: a different operator than the operator class, an expression or `DESC` in the `ORDER BY`, no `LIMIT`, or (for an expression index such as `halfvec`) a missing cast. Fix the query or build the matching index (blocks 9 and 11). The README adds that on a small table a table scan may simply be faster.
- **Fewer rows than `LIMIT`.** Either `hnsw.ef_search` is smaller than `LIMIT` (five rows at `ef_search = 5`, block 8), or a `WHERE` thins the candidates (block 10), or, per the README, dead tuples reduced them. For IVFFlat the README also points to too little data for the number of lists and to the `probes` setting. Enable iterative scans, raise the dial, or change the layout.
- **Poor recall after creating an IVFFlat index, with the notice `ivfflat index created with little data`.** The index was built before the table had data. `DROP INDEX index_name;` and recreate it after loading (block 7).
- **`ERROR: unrecognized configuration parameter "hnsw.ef_search"` on `SHOW`.** The extension's library has not been loaded in this session yet; use a vector in any statement first (block 4).
- **`ERROR: expected 3 dimensions, not 4`.** The vector does not match the column's declared size. Check that the embedding model is the one the column was sized for, and store the model name in the row (Module 05's cache key).
- **Recall differs from run to run after a rebuild.** Builds are not repeatable to the last decimal (blocks 7 and 8). Evaluate with a large query set and do not chase differences of a few hundredths from single builds.
- **Some rows never appear in results.** The README notes that `NULL` vectors are not indexed (nor zero vectors for cosine distance). Fix the input or keep them out of the table.
- **A parallel HNSW build fails in Docker after raising `maintenance_work_mem`.** From the README, not reproduced here: make `--shm-size` at least as large as `maintenance_work_mem`.

## Further reading & sources

- [pgvector: Open-source vector similarity search for Postgres](https://github.com/pgvector/pgvector) - the README every default, parameter name and rule in this module comes from (operators, HNSW and IVFFlat options, iterative scans, `halfvec`, performance and troubleshooting notes).
- [pgvector CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md) - release notes used to date features (iterative scans arrived in 0.8.0) and to compare the 0.8.6 image used here with the 0.8.7 README.
- [pgvector-python](https://github.com/pgvector/pgvector-python) - the Python package behind the client example: installation, `register_vector`, `Vector` and the Psycopg 3 section.
- [pgvector on Docker Hub](https://hub.docker.com/r/pgvector/pgvector) - the Docker image, built on the official Postgres image, that the code blocks ran against.
- [Psycopg 3: Transactions management](https://www.psycopg.org/psycopg3/docs/basic/transactions.html) - documents `autocommit` and the `Connection.transaction()` context used in the client example.
- [PostgreSQL documentation: Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) - how to read the query plans that decide whether a vector index is used.
- [PostgreSQL documentation: CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html) - reference for `CONCURRENTLY` and for partial and expression indexes, on which the README's filtering and half-precision advice builds.
- [Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs (Malkov and Yashunin)](https://arxiv.org/abs/1603.09320) - the paper behind pgvector's HNSW index, cited in the README; Module 14 explains it.

## Next

[Module 11: Chroma and Local Development](../11-chroma-and-local-development/README.md)
