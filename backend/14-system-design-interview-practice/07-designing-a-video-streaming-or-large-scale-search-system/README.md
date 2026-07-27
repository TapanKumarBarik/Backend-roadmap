# Module 07: Designing a Video Streaming or Large-Scale Search System

## Why this matters

The final two problems before the capstone push two dimensions that the earlier
systems only touched — **massive binary data and global bandwidth** (video
streaming) and **large-scale indexing and relevance** (full-text search) — and
each rounds out the classic interview set with a specialization worth knowing
cold. Video streaming (YouTube, Netflix) is where **object storage, CDNs,
transcoding pipelines, and adaptive bitrate** stop being buzzwords and become the
core of the design: the files are enormous, the audience is global, and the whole
game is getting bytes from storage to a player's screen without buffering.
Search (the design generalization of everything you built in
**07-search-with-elasticsearch**) is where the **inverted index, relevance
ranking, and distributed scatter-gather query** define the problem: the challenge
isn't storing data, it's *finding* the right data in milliseconds across billions
of documents.

They're grouped here because both are "large-scale specialization" problems that
reuse the whole toolkit — estimation, caching, partitioning, async processing,
replication — but bring one dominant new concept each (bandwidth/CDN for video,
the inverted index for search). Covering both gives you range: an interviewer who
asks "design YouTube" and one who asks "design Google search" are testing
different muscles, and after this module you can drive either. This module runs
two designs in parallel; treat each half as its own framework pass.

## Concepts

### Video: requirements, scale, and the bandwidth problem

**Functional:** upload a video; transcode it into multiple resolutions/formats;
stream it smoothly to viewers worldwide; (often) recommendations, comments,
view counts.

**Non-functional:** massively **read-heavy** (views ≫ uploads), **latency-
sensitive on playback** (buffering is the enemy — startup <2 s, no rebuffering),
**global** (viewers everywhere), huge **storage and bandwidth**, eventual
consistency fine (a new upload appearing a minute late is acceptable).

The defining number is **bandwidth**, not QPS. A minute of HD video is tens of
MB; at hundreds of millions of concurrent viewers the egress is enormous —
petabits. No origin server or datacenter can serve that directly, which is the
entire reason video architecture is built around **CDNs and edge delivery**.
Estimation:

```
1 hour of 1080p ≈ ~2-3 GB.  1M concurrent viewers at ~5 Mbps each
  = 5 × 10^12 bits/sec = ~5 Tbps of egress   ← origin can't do this; CDN must
Storage: 500 hrs uploaded/min × ~2 GB/hr × (×~5 for all transcoded renditions)
  → petabytes/day of new content → object store + tiering, not a database
```

### Video: upload, transcoding, and adaptive bitrate

The write path is an **asynchronous processing pipeline**, and the read path is
**edge-cached blob delivery**:

- **Upload → object store.** The raw upload goes to an **object store** (S3-style
  blob storage), not a database — videos are large opaque blobs. Uploads use
  **chunked/resumable** transfer (recall large-file uploads from
  **06-background-processing-and-realtime**) so a dropped connection doesn't
  restart a 4 GB upload.
- **Transcoding pipeline (async, queue-driven).** A worker fleet takes the raw
  video and **transcodes** it into multiple resolutions (240p…4K) and codecs, and
  **segments** each rendition into small chunks (e.g. 2–10 s each). This is heavy,
  parallelizable batch work — a classic queue + worker fan-out
  (**06-background-processing-and-realtime**). The video is "ready" once its
  renditions are transcoded and pushed toward the CDN.
- **Adaptive bitrate streaming (ABR).** The player is served a **manifest**
  (HLS/DASH) listing the available renditions and their chunk URLs. The client
  measures its own bandwidth and **switches rendition per chunk** — dropping to
  480p when the network degrades, climbing back to 1080p when it recovers — so
  playback continues without buffering. This is why video is chunked and
  multi-rendition: ABR needs interchangeable per-segment choices.
- **CDN delivery.** Chunks are served from **CDN edge nodes** close to the viewer
  (recall CDNs/edge caching from **05-caching-and-performance**). Popular content
  is cached at the edge; the origin object store is hit only on a cache miss. The
  CDN is what makes global, low-latency, high-bandwidth playback possible — the
  origin never serves viewers directly at scale.

### Search: requirements, the inverted index, and query flow

**Functional:** given a text query, return the most **relevant** documents, fast,
with pagination; support filters and typo tolerance; keep the index fresh as
documents change.

**Non-functional:** **low query latency** (<100–200 ms) over **billions of
documents**, high query throughput, relevance quality matters as much as speed,
eventual consistency on freshness is usually fine (a new doc searchable seconds
later is okay).

The one concept that defines search is the **inverted index** (the heart of
**07-search-with-elasticsearch**): instead of storing documents and scanning them,
you store, for each *term*, the list of documents containing it (a "postings
list"). A query for "distributed systems" intersects the postings lists for
"distributed" and "systems" — turning search from an impossible full scan into a
fast lookup-and-merge.

```
Document → analyzer (tokenize, lowercase, stem, remove stopwords) → terms
Term "distributed" → [doc3, doc17, doc42, …]   (postings list)
Term "systems"     → [doc17, doc42, doc88, …]
Query "distributed systems" → intersect postings → candidates → rank → top-K
```

### Search: relevance, sharding, and distributed query

Finding candidate documents is half the job; **ranking** them is the other half,
and doing it across a huge corpus requires **partitioning the index**:

- **Relevance ranking.** Candidates are scored so the best match is first.
  Classic signals: **TF-IDF / BM25** (term frequency weighted by how rare the term
  is across the corpus), plus document signals (recency, popularity, quality) and,
  in modern systems, ML ranking models. The interview point is that search returns
  a *ranked* result, and the ranking function is a real design surface — recall
  the relevance-scoring work from **07-search-with-elasticsearch**.
- **Sharding the index (partition + replicate).** Billions of documents don't fit
  or compute on one node, so the index is split into **shards** (each holding a
  subset of documents), and each shard is **replicated** for availability and read
  throughput. A query is **scatter-gather**: broadcast to all shards, each returns
  its local top-K, and a coordinator **merges** them into a global top-K. This is
  the same scatter-gather shape as the feed's pull model, applied to ranked
  retrieval.
- **Index freshness (near-real-time).** Indexing new/updated documents is an
  **async pipeline**: document changes flow through a queue to indexers that update
  the shards, so the index is *eventually* consistent with the source of truth —
  a new document is searchable seconds later, which is fine. Reads (queries) hit
  the index; writes (indexing) happen on a separate path, exactly the read/write
  separation you've applied throughout the track.
- **Caching hot queries.** Popular queries repeat constantly, so a **query-result
  cache** (cache-aside on the query string, module 04/05) serves them from memory,
  and the 80/20 rule means a small cache captures a large share of traffic.

## Command reference

Two designs, side by side — the concept map for each.

Video streaming:

| Concern | Mechanism |
|---|---|
| Store the video | **Object/blob store** (S3-style), not a DB; metadata in a DB |
| Upload reliability | **Chunked/resumable** upload |
| Prepare for playback | **Transcoding** pipeline (async, queue + workers) → renditions |
| Smooth playback | **Adaptive bitrate (ABR)**: manifest + per-chunk rendition switching |
| Global low-latency delivery | **CDN edge nodes**; origin hit only on miss |
| Dominant scaling constraint | **Bandwidth (egress)**, not QPS |

Full-text search:

| Concern | Mechanism |
|---|---|
| Fast lookup | **Inverted index** (term → postings list) |
| Text processing | **Analyzer**: tokenize, lowercase, stem, stopwords |
| Ranking | **TF-IDF / BM25** + doc signals (+ ML) → top-K |
| Scale the corpus | **Shard** the index + **replicate** shards |
| Query at scale | **Scatter-gather**: broadcast → per-shard top-K → merge |
| Freshness | Async **indexing pipeline**; eventually consistent |
| Hot queries | **Query-result cache** (cache-aside) |

Video read/write paths:

```
UPLOAD (write, async):
  client ──chunked──► object store (raw) ──► [enqueue transcode job]
    ──► transcode workers → renditions (240p…4K) segmented into chunks
    ──► push to CDN origin;  metadata (title, renditions, status) → DB

PLAYBACK (read):
  player ──► request manifest (HLS/DASH) ──► lists renditions + chunk URLs
  player measures bandwidth ──► fetches chunks from nearest CDN edge
    ──► edge hit: serve from edge;  edge miss: pull from origin, cache, serve
    ──► ABR: switch rendition per chunk as bandwidth changes
```

Search query path:

```
QUERY (read, scatter-gather):
  query ──► analyzer (tokenize/normalize) ──► coordinator
    ──► broadcast to all index shards (each replicated)
    ──► each shard: look up postings, score (BM25), return local top-K
    ──► coordinator merges shard results → global top-K → paginate
    ──► (cache the result for hot queries)

INDEX (write, async):
  doc change ──► queue ──► indexer ──► update shard's inverted index (NRT)
```

## Hands-on exercises

Written design exercises — run each half as its own framework pass.

### 1. Estimate video egress

1M concurrent viewers each streaming at ~5 Mbps. Compute total egress in Tbps.
Then state, in one sentence, why this single number makes a CDN non-optional and
what role the origin object store still plays.

### 2. Design the transcoding pipeline

Sketch the async pipeline from raw upload to CDN-ready renditions: the object
store, the queue, the worker fleet, segmentation, and the "ready" state. Explain
why transcoding is done asynchronously off the upload request and why the video
is segmented into small chunks (tie to ABR).

### 3. Explain adaptive bitrate

A viewer on a train has fluctuating bandwidth. Walk through how ABR keeps
playback smooth: what the manifest contains, how the client decides which
rendition to fetch for the next chunk, and what happens when bandwidth drops
mid-video. Why does this require multiple renditions and chunked segments?

### 4. Estimate search storage and shard count

You must index **10 billion documents**, and your index shards hold ~50M
documents each. How many shards do you need, and why do you also replicate each?
Then explain how a single query is answered across all those shards
(scatter-gather) and where the latency floor comes from.

### 5. Build the inverted index by hand

For the three documents `d1="the cat sat"`, `d2="the dog sat"`, `d3="cats and
dogs"`, write the analyzer output (tokenize, lowercase, stem, drop stopwords) and
the resulting inverted index (term → postings). Then show which docs a query for
`"sat"` and for `"cat"` return, and note where stemming changed the result.

### 6. Rank the candidates

Given a query matching 10,000 documents, explain why you must **rank** and can't
just return them, what TF-IDF/BM25 measures, and two document-level signals beyond
term matching you'd fold into the score. Where does the ranking happen in the
scatter-gather flow (per-shard, coordinator, or both)?

### 7. Keep the index fresh

A document is edited and must become searchable. Describe the async indexing path
from source-of-truth change to updated shard, why the index is only *eventually*
consistent with the source, and why that's acceptable for search. Contrast this
read/write separation with the query path.

### 8. Diagnose and fix a flawed design

Pick either system and fix it. **Video:** "We store uploaded videos as BLOBs in
Postgres and stream them by `SELECT`ing the blob and sending the bytes from our
single app server to every viewer. We transcode synchronously during the upload
request. There's one resolution: 1080p." **Search:** "We answer every query with
`SELECT * FROM documents WHERE body LIKE '%term%'` on the primary Postgres, scan
all rows, and return them in insertion order. One database, no index, no ranking."

<details>
<summary>Solution</summary>

**Video design, fixed:**

1. **Videos as Postgres BLOBs is wrong storage.** Large binary blobs belong in an
   **object store**; keep only *metadata* (title, renditions, status) in the DB.
2. **Serving bytes from a single app server can't meet global bandwidth.** At
   Tbps-scale egress, delivery must go through a **CDN** with edge caching; the
   origin object store is hit only on edge miss — the app server never streams to
   viewers directly.
3. **Synchronous transcoding during upload** blocks the request for minutes and
   doesn't scale. Transcoding is an **async queue + worker pipeline**; the upload
   returns immediately and the video becomes "ready" when renditions finish.
4. **Single 1080p rendition breaks playback on weak networks.** Produce
   **multiple renditions** and **segment** them so **ABR** can switch per chunk —
   otherwise viewers on poor connections buffer constantly.

**Search design, fixed:**

1. **`LIKE '%term%'` scans every row** — O(corpus) per query, impossible at
   billions of docs. Build an **inverted index** (term → postings) so lookup is a
   fast intersect-and-merge, not a scan.
2. **One database, no sharding** can't hold or compute over billions of docs.
   **Shard** the index across nodes and **replicate** shards; answer queries with
   **scatter-gather** (per-shard top-K → merged global top-K).
3. **"Insertion order" ignores relevance.** Search must **rank** (TF-IDF/BM25 +
   doc signals) and return **top-K**, not arbitrary order.
4. **No analyzer** means no case-folding, stemming, or stopword handling, so
   "Cats" won't match "cat." Add an **analyzer** on both indexing and query.
5. **Querying the primary directly** couples reads to the write DB; use a separate
   **async indexing pipeline** feeding the index, keeping the query path off the
   source-of-truth database.

</details>

## Independent challenge

No solution given. Design a **live-streaming** system (Twitch-style) — not
pre-recorded video, but a broadcaster's feed delivered to millions of concurrent
viewers with only a few seconds of latency, plus a live chat overlay. This
combines the video pipeline here (ingest, transcode, ABR, CDN) with the real-time
delivery fabric from **06-designing-a-chat-and-notification-system** (the chat and
the low-latency constraint), and it breaks the assumption that transcoding can be
leisurely and async — now it must happen *continuously* on a live stream within a
tight latency budget. Decide how ingest and real-time transcoding work, how you
fan a single live stream out to millions of viewers through the CDN, and how the
latency budget differs from on-demand video.

<details>
<summary>Hint</summary>

The key shift from on-demand is that the pipeline runs *continuously and under a
deadline*: the broadcaster's stream is ingested, transcoded into renditions, and
segmented **on the fly**, and each fresh segment is pushed to the CDN as soon as
it exists — so the transcoding fleet from this module becomes a low-latency
streaming pipeline rather than a batch one. Fan-out to millions of viewers is
still the CDN's job (all viewers of one stream request the same recent segments,
so edge caching is extremely effective — a single broadcaster to millions is a
near-ideal CDN cache-hit pattern), which is why live video scales despite the
latency pressure. The chat overlay is exactly the module-06 problem (websocket
connection fabric, pub/sub per channel), and the interesting tension is the
**latency budget**: on-demand tolerates seconds of startup and long buffers,
while live must keep only a few seconds of buffered segments or the stream feels
delayed — so you trade buffer depth (smoothness) against latency (liveness), the
opposite balance from module 07's on-demand case.

</details>

## Common mistakes & troubleshooting

- **Storing video blobs in a database.** Videos belong in an **object store**;
  the database holds only metadata. Blobs in Postgres don't scale and can't be
  CDN-served.
- **Serving video from origin servers.** At Tbps egress the origin can't reach
  viewers directly; a **CDN** with edge caching is mandatory, origin only on miss.
- **Synchronous transcoding.** Blocking the upload on a multi-minute transcode.
  Transcoding is an **async queue + worker pipeline**; the upload returns first.
- **A single rendition / no segmentation.** Breaks ABR; viewers on weak networks
  buffer. Produce multiple renditions and small chunks.
- **Bandwidth vs. QPS confusion (video).** The scaling constraint for video is
  **egress bandwidth**, not request rate — size the design around bytes/sec.
- **Scanning instead of indexing (search).** `LIKE '%term%'` or full scans are
  O(corpus). The **inverted index** is the entire point of search.
- **Forgetting to rank.** Returning matches in arbitrary/insertion order.
  Search returns a **ranked top-K** (BM25 + signals).
- **Skipping the analyzer.** Without tokenizing/lowercasing/stemming, queries
  miss obvious matches ("Cats" ≠ "cat"). Analyze on both index and query.
- **Coupling the query path to the write DB.** Index via an **async pipeline** and
  serve queries from the index; don't query the source-of-truth database directly.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the dominant scaling constraint for video streaming, and why does it
   make a CDN non-optional rather than a nice-to-have?
2. Why is transcoding done asynchronously off the upload request, and why is each
   rendition segmented into small chunks?
3. Explain adaptive bitrate streaming: what the manifest provides, how the client
   chooses a rendition per chunk, and what it does when bandwidth drops.
4. Where do the raw video bytes live versus the video metadata, and why the split?
5. What is an inverted index, and why is it fundamentally faster than scanning
   documents for a query term?
6. Describe scatter-gather query across a sharded index. Where does per-shard
   ranking happen and where does the final merge happen?
7. Why can a search index be eventually consistent with the source of truth, and
   what pipeline keeps it fresh without coupling to the query path?

<details>
<summary>Answers</summary>

1. **Egress bandwidth.** At millions of concurrent viewers streaming multi-Mbps
   video, total egress reaches Tbps — far beyond any origin/datacenter's capacity
   — so content must be served from **CDN edge nodes** close to viewers, with the
   origin object store hit only on a cache miss.
2. Transcoding a video into many renditions/codecs takes minutes and is heavy
   batch work, so it can't block the upload request — it runs on an **async queue
   + worker pipeline** and marks the video "ready" when done. Segmenting into small
   chunks lets the player fetch and **switch renditions per chunk** (ABR) and
   enables efficient edge caching.
3. The **manifest** (HLS/DASH) lists the available renditions and their chunk
   URLs. The client **measures its own bandwidth** and picks the highest rendition
   it can sustain for the next chunk; when bandwidth **drops**, it switches to a
   lower rendition for subsequent chunks so playback continues without buffering.
4. Raw/encoded video bytes live in an **object/blob store** (and are pushed to the
   CDN); **metadata** (title, renditions, status, view count) lives in a database.
   The split is because blobs are large and opaque (object storage's job) while
   metadata is small, queryable, and relational.
5. An **inverted index** maps each term to the list of documents containing it
   (postings list). A query becomes a **lookup and merge of postings lists**
   instead of a scan of every document, turning O(corpus) work into O(matching
   docs) — the difference between impossible and milliseconds at billions of docs.
6. A query is broadcast to **all shards** (each holding a subset of docs, and
   replicated). Each shard looks up postings, **scores/ranks locally** (BM25), and
   returns its **local top-K**; a **coordinator merges** those into the global
   top-K and paginates. Ranking happens per-shard; the merge happens at the
   coordinator.
7. Because a new/edited document becoming searchable a few seconds later is
   acceptable — freshness isn't a strong-consistency requirement. An **async
   indexing pipeline** (document change → queue → indexer → shard update) keeps the
   index near-real-time on a separate path from queries, so indexing load never
   couples to or blocks the read/query path.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — you've now driven the
full classic problem set: estimation, the framework, and seven canonical designs
across read-heavy, write-heavy, real-time, storage, and search. The capstone is
the open-ended integration test: a fresh, uncovered problem to take end to end
through the whole framework with no solution given — the real measure of whether
this track transferred.
