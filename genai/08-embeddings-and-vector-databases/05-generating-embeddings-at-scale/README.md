# Module 05: Generating Embeddings at Scale

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. The earlier modules covered what an embedding is ([Module 00](../00-what-an-embedding-is/README.md)), which models produce them ([Module 02](../02-embedding-models-compared/README.md)), how vectors are compared ([Module 03](../03-cosine-similarity-and-distance-metrics/README.md)) and what dimension costs ([Module 04](../04-the-curse-of-dimensionality/README.md)). This module is about the unglamorous part in between: getting a real corpus through an embedding model reliably, cheaply, and without redoing work.

After this module you can:

- build an embedding pipeline in plain Python that batches, truncates, retries with exponential backoff and jitter, caches by content hash, runs in parallel, and counts tokens;
- make it idempotent and resumable, so a crash or a rerun re-does only the work that is actually missing;
- handle one bad document without losing the other thousands in its batch;
- explain why batch size has a sweet spot and measure it for your own provider or model;
- test all of the above without an API key, using a deterministic fake embedder with injectable latency and failures.

Why it matters: embedding is the first step of a retrieval system that costs real money and time, and it fails in boring ways (rate limits, timeouts, one malformed record). A naive loop re-embeds everything on every run, dies at 80%, and hammers the API when it errors. [Module 06](../06-chunking-fixed-size-strategies/README.md) decides *what* text gets embedded; this module decides *how* to embed it dependably.

## Concept

> [!key] Treat embedding a corpus as an idempotent batch job: key every text by a hash of what determines its vector (at least the model and the text), send only what the cache has not seen, batch and retry sensibly, and commit each finished batch. Then a crash, a rerun or a small edit costs only the work that is genuinely new.

## Explanation

### The shape of the job

Every stage below exists because something goes wrong without it:

1. **Prepare.** Reject texts the model can never accept (empty), and shorten texts that exceed the model's input limit, counting how many were shortened.
2. **Deduplicate and check the cache.** Duplicate texts are embedded once; texts already embedded by this model are skipped.
3. **Plan batches.** Group the remaining texts under the provider's per-request limits.
4. **Call with retries.** Retry errors that can go away (rate limits, server errors, timeouts) with a growing, randomized wait; never retry errors that cannot (invalid input).
5. **Isolate bad items.** If a batch is rejected because of one input, split it until that input is alone.
6. **Commit per batch.** Write results to durable storage in one transaction per finished batch. That write is the checkpoint.
7. **Report.** Cache hits, retries, failures, tokens and cost.

### Batching, and why batch size has a sweet spot

A request has a fixed cost that does not depend on how many texts it carries (connection, queueing, authentication, model dispatch), plus a cost per text. Sending texts one at a time pays the fixed cost every time; sending them in batches pays it once per batch. Embeddings APIs accept a list of inputs for exactly this reason: the OpenAI embeddings guide's own examples pass a list of strings as `input`. Throughput therefore rises quickly as batches grow and then flattens, because the per-text cost dominates. Several forces pull the other way:

- **Per-request limits.** Providers cap the number of inputs and the total tokens in one request, and the caps differ per model and change over time. Read your provider's current documentation; do not copy numbers from a tutorial.
- **Blast radius.** A failed request is retried as a whole. The bigger the batch, the more work one failure wastes, and the more likely it is that something in the batch makes the request fail (a timeout, an input the API dislikes).
- **Rate limits come in two currencies.** Limits are usually counted in requests per minute and tokens per minute. OpenAI's rate-limits guide notes that if you are hitting the request limit with token headroom to spare, putting more inputs in each request raises throughput.
- **Padding.** For a model you run yourself, a batch is padded to its longest text, so mixing a 5-token text and a 500-token text wastes most of the compute. Sorting by length before batching keeps similar lengths together.

> [!model] A delivery van. Each trip has a fixed cost (loading, driving) and a per-parcel cost, so one parcel per trip wastes the van. But a van so full that one wrong address sends the whole load back is worse. The right load depends on how often a trip fails and how much a failed trip costs.

Block 7 sweeps batch size on a virtual clock. In the fake's cost model, throughput climbs from 18 items per second at batch size 1 to a peak of 165.5 at 64, then falls; at 512 several whole batches exhaust their retries and 1,951 of the 4,000 items are lost. Sorting by length at batch size 64 almost halves the run time compared with arrival order.

> [!pitfall] The sweet spot in block 7 comes from the cost model I wrote (request overhead, padded tokens, a per-item failure chance), not from any real API. It demonstrates the shape of the trade-off and the method; it is not a recommendation of 64. Measure your own provider and model with a small sweep (the Project).

### Input limits and truncation

Every embedding model accepts a maximum number of tokens per input. What happens beyond it depends on the provider and settings (an error, or silent cutting); check the documentation. Two rules hold regardless:

- **Count with the model's own tokenizer.** The code here counts whitespace-separated words as a stand-in so it can run anywhere. Real tokens differ from words, so a limit expressed in tokens cannot be checked with `len(text.split())`.
- **Truncate on purpose, and count it.** Silently cutting a document means its tail is invisible to search. The pipeline reports `truncated`; a high number is a signal to split the documents into chunks instead ([Module 06](../06-chunking-fixed-size-strategies/README.md)).

> [!pitfall] The cache key is computed from the text that was actually embedded, after truncation. So an edit that falls past the truncation point changes nothing: the key is the same, the cache says "done", and the edit never reaches the index. Exercise 1 shows it happening.

### Rate limits, retries, backoff and jitter

Three kinds of failure need three different responses:

| Failure | Typical signal | Response |
| --- | --- | --- |
| Rate limited | HTTP 429 (RFC 6585), often with a `Retry-After` header (RFC 9110) | wait, then retry |
| Server trouble, timeout, dropped connection | 5xx, timeout | wait, then retry |
| Invalid input | 400-class | do **not** retry the same input; isolate it |

**Exponential backoff** means the maximum wait doubles with each failed attempt (`base`, `2·base`, `4·base`, up to a cap), so a brief hiccup recovers fast while a long outage is not hammered. **Jitter** means the actual wait is a random value inside that window. Without it, every client that failed together retries together, and the retries collide again; with it they spread out (Exercise 2 counts 50 clients retrying in one 10 ms slot without jitter versus 13 with it). The AWS Architecture Blog compares jitter variants; this module uses "full jitter", a uniform random wait between zero and the window.

OpenAI's rate-limits guide gives practical rules that this pipeline follows. Treat `Retry-After` as a minimum and add a small random delay on top. If the header is missing, fall back to exponential backoff with jitter. Limit both the number of attempts and the total time spent retrying. Do not retry quota or billing errors, which need a human. If you retry in your application, turn off the SDK's automatic retries, or the two loops multiply requests. The guide also warns that unsuccessful requests count toward your per-minute limit, so resending in a tight loop makes things worse.

### Caching by content hash

The cache key must contain everything that changes the output vector, and nothing that does not.

- **Always:** the model identifier and the exact text. Same text, different model, must be a different key; otherwise one model's vectors are served for another (Exercise 3).
- **If they apply:** the output dimension if you can request several, the task or input type if the model distinguishes queries from documents, any text prefix you add, and a model version if the name is an alias that can point at different weights over time.
- **Never:** the document id, a timestamp, or the file path. Those make every run look new and the cache never hits.

Hash with SHA-256 so keys are fixed-length and safe to store. The same trick deduplicates the corpus: two documents with identical text share a key, so the text is embedded once. A changed model name or changed text simply produces new keys, so the correct thing happens automatically: only new content is embedded and old vectors remain valid for the model that made them.

### Idempotent, resumable pipelines and checkpoints

An operation is **idempotent** if doing it twice has the same effect as doing it once. Writes keyed by content hash are idempotent: storing the same key and value again changes nothing. That gives resumability without any bookkeeping.

- **The cache is the checkpoint.** On restart the pipeline recomputes the to-do list as "texts whose key is not in the store". It does not need to know where it stopped or which process died.
- **Commit per batch, in one transaction.** A crash mid-batch leaves nothing half-written. The most work lost is whatever was in flight, roughly `workers × batch size` texts.
- **Do not checkpoint with a position counter** ("processed 8,000 documents") when workers run in parallel: batches finish out of order, so a counter either skips unfinished work or repeats finished work.
- **Handle failure per item, not per job.** One bad document must not abort a million. The pipeline splits a rejected batch in half repeatedly (bisection) until the poison item stands alone, records it in a `failures` table as permanent, and carries on. On resume, permanent failures are skipped (no wasted requests); failures from exhausted retries are not permanent and are tried again.

### Parallelism

Calling a remote API is waiting on the network, so threads are enough; the global interpreter lock is released while a thread sleeps or waits on a socket. Block 8 shows near-linear speed-up with the number of workers when requests are independent and slow. In real life the provider's rate limits cap the benefit: past some number of workers you buy 429s, not speed. Raise workers until the 429 rate starts to climb, then stop. Keep one writer (the main thread here) for the database so no locking is needed, and consume results in completion order.

### Tracking cost in tokens

Hosted embedding APIs commonly bill by input tokens (the OpenAI embeddings guide says usage is priced per input token). So record tokens, not just documents: tokens embedded this run, tokens avoided by the cache, and tokens sent in failed attempts. Whether failed attempts are billed varies by provider, so check the billing documentation instead of assuming. Compute cost as `tokens / 1,000,000 × price` with the price from the provider's current pricing page. The code uses a placeholder price of 1.00 so the arithmetic is visible; it is not any vendor's price. Reconcile your own count against the provider's usage dashboard, because your tokenizer may differ from theirs.

## Code

Standard library only. The blocks are cumulative: copy them in order into one file (call it `embed_pipeline.py`) and run it. Outputs were produced with Python 3.13; seeds are fixed, so everything is reproducible except wall-clock timings (block 8), which depend on your machine. Nothing here calls a real API: the embedder is a fake whose vectors are a deterministic function of (model, text), so the whole pipeline can be tested offline.

### 1. A fake embedding provider with injectable failures

The fake enforces limits like a real API (batch size, input length, empty and malformed inputs raise `InvalidInputError`), takes a `sleep` function so tests can use a virtual clock, and injects rate limits and failures from a seed. A failure depends only on the seed, the exact batch contents and the attempt number, so it does not depend on thread timing.

```python
import hashlib, json, math, os, random, sqlite3, tempfile, threading, time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

class RateLimitError(Exception):        # like HTTP 429: try again later
    def __init__(self, retry_after):
        super().__init__(f"rate limited (retry after {retry_after}s)")
        self.retry_after = retry_after

class TransientError(Exception):        # like a 5xx or a timeout: try again
    pass

class InvalidInputError(Exception):     # like a 400: the same input will fail every time
    pass

def count_tokens(text):
    """Crude stand-in for a real tokenizer: one token per whitespace-separated word."""
    return len(text.split())

class VirtualClock:
    """A fake clock: sleeping only advances a counter, so experiments run instantly and reproducibly."""
    def __init__(self):
        self.now = 0.0
    def sleep(self, seconds):
        self.now += seconds

class FakeEmbedder:
    """Deterministic stand-in for an embeddings API: the same text always gives the same unit vector.
    Latency, rate limits and failures are injectable. Failures are seeded and depend only on
    (seed, exact batch contents, attempt number), so results do not depend on thread timing."""
    def __init__(self, model="fake-embed-v1", dim=8, max_batch=64, max_input_tokens=32,
                 overhead_s=0.02, per_token_s=0.0, p_rate_limit=0.0, p_fail_per_item=0.0,
                 seed=0, sleep=time.sleep):
        self.model, self.dim, self.max_batch, self.max_input_tokens = model, dim, max_batch, max_input_tokens
        self.overhead_s, self.per_token_s = overhead_s, per_token_s
        self.p_rate_limit, self.p_fail_per_item = p_rate_limit, p_fail_per_item
        self.seed, self.sleep = seed, sleep
        self._lock = threading.Lock()
        self._attempts = {}
        self.usage = Counter()               # calls, tokens_sent (every valid attempt), tokens_ok (successes)

    def embed(self, texts):
        with self._lock:
            self.usage["calls"] += 1
        if len(texts) > self.max_batch:
            raise InvalidInputError(f"batch of {len(texts)} exceeds the limit of {self.max_batch} inputs")
        for i, t in enumerate(texts):
            if not t.strip():
                raise InvalidInputError(f"input {i} is empty")
            if "\x00" in t:
                raise InvalidInputError(f"input {i} contains a NUL character")
            if count_tokens(t) > self.max_input_tokens:
                raise InvalidInputError(f"input {i} is {count_tokens(t)} tokens; limit is {self.max_input_tokens}")
        lengths = [count_tokens(t) for t in texts]
        # A padded batch costs (items x longest item), the way a self-hosted model on a GPU behaves.
        self.sleep(self.overhead_s + self.per_token_s * len(texts) * max(lengths))
        key = hashlib.sha256("\x1f".join(texts).encode("utf-8")).hexdigest()
        with self._lock:
            n = self._attempts[key] = self._attempts.get(key, 0) + 1
            self.usage["tokens_sent"] += sum(lengths)
        r = random.Random(f"{self.seed}:{key}:{n}").random()
        p_fail = 1 - (1 - self.p_fail_per_item) ** len(texts)       # any bad item can sink the whole request
        if r < self.p_rate_limit:
            raise RateLimitError(retry_after=0.05)
        if r < self.p_rate_limit + p_fail:
            raise TransientError("simulated 503")
        with self._lock:
            self.usage["tokens_ok"] += sum(lengths)
        return [self._vector(t) for t in texts]

    def _vector(self, text):
        rng = random.Random(f"{self.model}\x00{text}")               # deterministic per (model, text)
        v = [rng.gauss(0, 1) for _ in range(self.dim)]
        norm = math.sqrt(sum(x * x for x in v))
        return [x / norm for x in v]

emb = FakeEmbedder()
first, again = emb.embed(["hello vector world"])[0], emb.embed(["hello vector world"])[0]
print("vector (first 4 of 8 numbers):", [round(x, 3) for x in first[:4]], "| same text again, identical:", first == again)
try:
    emb.embed(["word " * 40])
except InvalidInputError as e:
    print("over-long input ->", type(e).__name__ + ":", e)
```

Output:

```
vector (first 4 of 8 numbers): [-0.352, -0.201, -0.126, 0.697] | same text again, identical: True
over-long input -> InvalidInputError: input 0 is 40 tokens; limit is 32
```

### 2. Building blocks: cache key, truncation, retry, store

`call_with_retry` implements the table above. `VectorStore` is SQLite used as a content-addressed cache with a `failures` table; vectors are stored as JSON text for readability (for a real corpus store float32 bytes instead, which is smaller and faster).

```python
def content_key(model, text):
    """Cache key. It must include everything that changes the output: here the model name and the text."""
    return hashlib.sha256(f"{model}\x00{text}".encode("utf-8")).hexdigest()

def truncate_to_tokens(text, limit):
    """Keep the first `limit` tokens. Returns (text, was_truncated). Silent truncation loses content,
    so count it and look at the number (the real fix for long documents is chunking, Module 06)."""
    words = text.split()
    if len(words) <= limit:
        return text, False
    return " ".join(words[:limit]), True

class Stats:
    """Thread-safe counters."""
    def __init__(self):
        self._c, self._lock = Counter(), threading.Lock()
    def add(self, name, n=1):
        with self._lock:
            self._c[name] += n
    def snapshot(self):
        with self._lock:
            return dict(self._c)

def call_with_retry(fn, *args, rng, sleep, stats, max_attempts=6, base=0.05, cap=1.0):
    """Retry only errors that can go away. Exponential backoff with full jitter: wait a random time in
    [0, min(cap, base * 2**(attempt-1))]. A server-sent Retry-After is treated as a minimum."""
    for attempt in range(1, max_attempts + 1):
        stats.add("requests")
        try:
            return fn(*args)
        except (RateLimitError, TransientError) as e:
            if attempt == max_attempts:
                raise                                        # out of attempts: let the caller decide
            is_429 = isinstance(e, RateLimitError)
            stats.add("retries_429" if is_429 else "retries_5xx")
            floor = e.retry_after if is_429 else 0.0
            sleep(floor + rng.uniform(0, min(cap, base * 2 ** (attempt - 1))))
        # InvalidInputError is deliberately NOT caught: retrying the same bad input is pointless.

class VectorStore:
    """SQLite as a content-addressed cache and the pipeline's checkpoint. Only the main thread touches it."""
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS vectors (key TEXT PRIMARY KEY, vec TEXT NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS failures "
                        "(key TEXT PRIMARY KEY, permanent INTEGER NOT NULL, error TEXT NOT NULL)")
        self.db.commit()
    def _present(self, table, keys, where=""):
        keys, found = list(keys), set()
        for i in range(0, len(keys), 500):
            chunk = keys[i:i + 500]
            q = f"SELECT key FROM {table} WHERE key IN ({','.join('?' * len(chunk))}) {where}"
            found.update(row[0] for row in self.db.execute(q, chunk))
        return found
    def have(self, keys):
        return self._present("vectors", keys)
    def known_bad(self, keys):
        return self._present("failures", keys, "AND permanent = 1")
    def commit_batch(self, ok, bad):
        """One transaction per finished batch = one checkpoint. Re-running it changes nothing (idempotent)."""
        with self.db:
            self.db.executemany("INSERT OR REPLACE INTO vectors VALUES (?, ?)", [(k, json.dumps(v)) for k, v in ok])
            self.db.executemany("INSERT OR REPLACE INTO failures VALUES (?, ?, ?)", bad)
            self.db.executemany("DELETE FROM failures WHERE key = ?", [(k,) for k, _ in ok])
    def vector(self, key):
        row = self.db.execute("SELECT vec FROM vectors WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None
    def count(self):
        return self.db.execute("SELECT COUNT(*) FROM vectors").fetchone()[0]
    def fingerprint(self):
        rows = self.db.execute("SELECT key, vec FROM vectors ORDER BY key").fetchall()
        return hashlib.sha256(json.dumps(rows).encode()).hexdigest()[:12]
```

### 3. The pipeline

`run` prepares and deduplicates, skips what the store already has, plans batches, executes them on a thread pool, and commits each finished batch. `crash_after_batches` simulates a process dying mid-job.

```python
class SimulatedCrash(Exception):
    pass

def plan_batches(items, max_items, max_tokens, sort_by_length=True):
    """items: [(key, text)]. Fill each batch until the item cap or the token budget would be exceeded.
    Sorting by length first keeps similar-length texts together, so padding waste is small."""
    if sort_by_length:
        items = sorted(items, key=lambda kt: count_tokens(kt[1]))
    batches, cur, cur_tokens = [], [], 0
    for key, text in items:
        t = count_tokens(text)
        if cur and (len(cur) >= max_items or cur_tokens + t > max_tokens):
            batches.append(cur)
            cur, cur_tokens = [], 0
        cur.append((key, text))
        cur_tokens += t
    if cur:
        batches.append(cur)
    return batches

class EmbeddingPipeline:
    def __init__(self, embedder, store, batch_size=32, max_batch_tokens=10_000, workers=1,
                 sleep=time.sleep, seed=0, sort_by_length=True, **retry):
        self.embedder, self.store = embedder, store
        self.batch_size, self.max_batch_tokens, self.workers = batch_size, max_batch_tokens, workers
        self.sleep, self.seed, self.sort_by_length, self.retry = sleep, seed, sort_by_length, retry

    def _embed(self, batch, stats):
        """Embed one batch. Returns (ok, bad): ok = [(key, vector)], bad = [(key, permanent, error)]."""
        rng = random.Random(f"{self.seed}:{batch[0][0]}")            # deterministic jitter per batch
        try:
            vectors = call_with_retry(self.embedder.embed, [t for _, t in batch],
                                      rng=rng, sleep=self.sleep, stats=stats, **self.retry)
            return [(k, v) for (k, _), v in zip(batch, vectors)], []
        except InvalidInputError as e:
            if len(batch) == 1:                                       # found the poison item
                return [], [(batch[0][0], 1, str(e))]
            stats.add("bisect_splits")                                # otherwise halve the batch and try again
            mid = len(batch) // 2
            a_ok, a_bad = self._embed(batch[:mid], stats)
            b_ok, b_bad = self._embed(batch[mid:], stats)
            return a_ok + b_ok, a_bad + b_bad
        except (RateLimitError, TransientError) as e:                 # retries exhausted: not permanent
            return [], [(k, 0, f"gave up after retries: {e}") for k, _ in batch]

    def run(self, docs, crash_after_batches=None):
        """docs: [(doc_id, text)]. Returns (stats, {doc_id: key}). Safe to re-run: finished work is skipped."""
        stats, model = Stats(), self.embedder.model
        limit = self.embedder.max_input_tokens
        key_of, texts, bad_now = {}, {}, []
        for doc_id, text in docs:
            prepared, was_cut = truncate_to_tokens(text, limit)
            if not prepared.strip():                                  # cheap local check: never spend a request on it
                bad_now.append((content_key(model, text), 1, "empty text (skipped locally)"))
                stats.add("rejected_locally")
                continue
            key = content_key(model, prepared)
            key_of[doc_id], texts[key] = key, prepared
            stats.add("truncated", was_cut)
        stats.add("docs", len(docs)); stats.add("unique_texts", len(texts))

        have, known_bad = self.store.have(texts), self.store.known_bad(texts)
        todo = [(k, t) for k, t in texts.items() if k not in have and k not in known_bad]
        stats.add("cache_hits", len(have)); stats.add("skipped_known_bad", len(known_bad))
        stats.add("tokens_saved_by_cache", sum(count_tokens(texts[k]) for k in have))
        self.store.commit_batch([], bad_now)

        batches = plan_batches(todo, self.batch_size, self.max_batch_tokens, self.sort_by_length)
        stats.add("batches_planned", len(batches))
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            futures = [pool.submit(self._embed, b, stats) for b in batches]
            for n, fut in enumerate(as_completed(futures), 1):
                ok, bad = fut.result()
                self.store.commit_batch(ok, bad)                      # the checkpoint
                stats.add("embedded", len(ok)); stats.add("failed", len(bad))
                stats.add("tokens_embedded", sum(count_tokens(texts[k]) for k, _ in ok))
                if crash_after_batches is not None and n >= crash_after_batches:
                    for f in futures:
                        f.cancel()
                    raise SimulatedCrash(f"process died after committing {n} batches")
        return stats.snapshot(), key_of
```

### 4. A toy corpus and the backoff schedule

The corpus has 300 documents with duplicates, two empty texts and one text containing a NUL byte. The table shows the retry windows and example waits: the window doubles to a cap, and the actual wait is a random point inside it.

```python
# A seeded toy corpus: 300 documents of 3-40 "words", with some duplicates and some poison.
vocab = ("vector index query chunk token model batch cache retry shard latency recall metric "
         "embed cosine corpus filter search store limit quota rate worker queue").split()
def make_corpus(n=300, seed=42):
    r = random.Random(seed)
    docs = [(f"doc-{i:04d}", " ".join(r.choices(vocab, k=r.randint(3, 40)))) for i in range(n)]
    docs[10] = ("doc-0010", docs[3][1])                       # exact duplicate of doc-0003
    docs[11] = ("doc-0011", docs[3][1])                       # ... and again
    docs[20] = ("doc-0020", "")                               # empty: caught locally, no request wasted
    docs[21] = ("doc-0021", "   ")
    # a NUL byte in the middle of a long-ish text: the API rejects it and our local checks do not catch it
    docs[100] = ("doc-0100", " ".join(r.choices(vocab, k=14)) + " bad\x00byte " + " ".join(r.choices(vocab, k=14)))
    return docs
docs = make_corpus()
print(len(docs), "documents;", sum(count_tokens(t) > 32 for _, t in docs), "longer than the 32-token limit")

# The backoff schedule: the *window* doubles each attempt up to a cap; the actual wait is random inside it.
rng = random.Random(1)
print("attempt  window (s)        three sample waits (s)")
for attempt in range(1, 8):
    window = min(1.0, 0.05 * 2 ** (attempt - 1))
    waits = ", ".join(f"{rng.uniform(0, window):.3f}" for _ in range(3))
    print(f"{attempt:>7}  [0, {window:<6.2f}]      {waits}")
```

Output:

```
300 documents; 79 longer than the 32-token limit
attempt  window (s)        three sample waits (s)
      1  [0, 0.05  ]      0.007, 0.042, 0.038
      2  [0, 0.10  ]      0.026, 0.050, 0.045
      3  [0, 0.20  ]      0.130, 0.158, 0.019
      4  [0, 0.40  ]      0.011, 0.334, 0.173
      5  [0, 0.80  ]      0.610, 0.002, 0.356
      6  [0, 1.00  ]      0.722, 0.229, 0.945
      7  [0, 1.00  ]      0.901, 0.031, 0.025
```

### 5. Crash, resume, rerun, edit

Four runs over the same database file, each with a fresh embedder and pipeline object (a restart). The fake is configured to fail often (15% of attempts rate-limited, a 0.4% failure chance per item) so retries actually happen.

```python
workdir = tempfile.mkdtemp(prefix="embed_demo_")
DB = os.path.join(workdir, "embeddings.sqlite3")
NO_SLEEP = lambda seconds: None                               # demos do not need to really wait
PRICE_PER_MILLION = 1.00                                      # a PLACEHOLDER unit price, not any vendor's real price

def make_pipeline(path=DB, **embedder_kw):
    """A fresh embedder + pipeline over the same database file: this is what 'restarting the process' means."""
    settings = dict(p_rate_limit=0.15, p_fail_per_item=0.004, seed=7, overhead_s=0.001, sleep=NO_SLEEP)
    settings.update(embedder_kw)
    emb = FakeEmbedder(**settings)
    return emb, EmbeddingPipeline(emb, VectorStore(path), batch_size=16, sleep=NO_SLEEP)

def show(title, stats, emb):
    keep = ["docs", "unique_texts", "truncated", "rejected_locally", "cache_hits", "skipped_known_bad", "embedded", "failed",
            "batches_planned", "requests", "retries_429", "retries_5xx", "bisect_splits"]
    print(f"--- {title}")
    print("   " + ", ".join(f"{k}={stats.get(k, 0)}" for k in keep))
    paid, saved = stats.get("tokens_embedded", 0), stats.get("tokens_saved_by_cache", 0)
    print(f"   tokens: embedded={paid}, avoided by cache={saved}, sent incl. failed attempts={emb.usage['tokens_sent']}"
          f"  -> cost {paid / 1e6 * PRICE_PER_MILLION:.6f} units instead of {(paid + saved) / 1e6 * PRICE_PER_MILLION:.6f}")

# Run 1: the process "crashes" after 5 batches have been committed.
emb1, pipe1 = make_pipeline()
try:
    pipe1.run(docs, crash_after_batches=5)
except SimulatedCrash as e:
    print("run 1 crashed:", e, "| vectors safely stored:", pipe1.store.count())

# Run 2: restart. Nothing tells the new process what finished; the cache is the checkpoint.
emb2, pipe2 = make_pipeline()
stats2, key_of = pipe2.run(docs)
show("run 2 (resume after crash)", stats2, emb2)

# Run 3: same corpus, nothing changed.
emb3, pipe3 = make_pipeline()
stats3, _ = pipe3.run(docs)
show("run 3 (nothing changed)", stats3, emb3)
fingerprint_resumed = pipe3.store.fingerprint()

# Run 4: edit 5 documents (by prepending a word) and add 10 new ones; only those 15 should be embedded.
docs4 = list(docs)
for i in (50, 51, 52, 53, 54):
    docs4[i] = (docs4[i][0], "revised " + docs4[i][1])
docs4 += [(f"doc-{1000 + j}", f"brand new document number {j} about vectors") for j in range(10)]
emb4, pipe4 = make_pipeline()
stats4, _ = pipe4.run(docs4)
show("run 4 (5 edited + 10 new docs)", stats4, emb4)

print("failures recorded:", pipe4.store.db.execute("SELECT permanent, error FROM failures").fetchall())
```

Output:

```
run 1 crashed: process died after committing 5 batches | vectors safely stored: 80
--- run 2 (resume after crash)
   docs=300, unique_texts=296, truncated=79, rejected_locally=2, cache_hits=80, skipped_known_bad=0, embedded=215, failed=1, batches_planned=14, requests=26, retries_429=1, retries_5xx=3, bisect_splits=4
   tokens: embedded=5604, avoided by cache=687, sent incl. failed attempts=7151  -> cost 0.005604 units instead of 0.006291
--- run 3 (nothing changed)
   docs=300, unique_texts=296, truncated=79, rejected_locally=2, cache_hits=295, skipped_known_bad=1, embedded=0, failed=0, batches_planned=0, requests=0, retries_429=0, retries_5xx=0, bisect_splits=0
   tokens: embedded=0, avoided by cache=6291, sent incl. failed attempts=0  -> cost 0.000000 units instead of 0.006291
--- run 4 (5 edited + 10 new docs)
   docs=310, unique_texts=306, truncated=79, rejected_locally=2, cache_hits=290, skipped_known_bad=1, embedded=15, failed=0, batches_planned=1, requests=1, retries_429=0, retries_5xx=0, bisect_splits=0
   tokens: embedded=203, avoided by cache=6160, sent incl. failed attempts=203  -> cost 0.000203 units instead of 0.006363
failures recorded: [(1, 'input 0 contains a NUL character'), (1, 'empty text (skipped locally)'), (1, 'empty text (skipped locally)')]
```

How to read it. Run 1 died with 80 vectors committed. Run 2 found them (`cache_hits=80`) and embedded the remaining 215, retrying 4 requests along the way, and isolated the one poison document by bisection (`bisect_splits=4`, `failed=1`). Run 3 made zero requests. Run 4 embedded exactly the 15 texts that were new or edited. `truncated=79` counts documents cut to the 32-token limit. The cost line shows the cache paying for itself: a naive rerun would pay for every token every time.

### 6. Did the crash change any result? And bisecting a poison item

The first test compares a fingerprint (hash of every key and vector) of the crash-and-resume database with a clean run on a fresh database. The second puts one bad item in a batch of 8.

```python
# 1. Did the crash and resume change any result? Compare with a clean run on a fresh database.
emb_c, pipe_c = make_pipeline(path=":memory:", p_rate_limit=0.0, p_fail_per_item=0.0)
pipe_c.run(docs)
print("fingerprint after crash + resume:", fingerprint_resumed)
print("fingerprint of a clean run      :", pipe_c.store.fingerprint())
print("identical:", fingerprint_resumed == pipe_c.store.fingerprint())

# 2. A poison item inside a batch of 8: bisection finds it with a handful of extra requests.
eight = [(f"p{i}", f"ordinary text number {i}") for i in range(8)]
eight[5] = ("p5", "this one has a bad\x00byte")
emb_p, pipe_p = make_pipeline(path=":memory:", p_rate_limit=0.0, p_fail_per_item=0.0)
pipe_p.batch_size = 8
stats_p, _ = pipe_p.run(eight)
print({k: stats_p[k] for k in ("embedded", "failed", "requests", "bisect_splits")})
print(pipe_p.store.db.execute("SELECT permanent, error FROM failures").fetchall())
```

Output:

```
fingerprint after crash + resume: 8de4e48c6c85
fingerprint of a clean run      : 8de4e48c6c85
identical: True
{'embedded': 7, 'failed': 1, 'requests': 7, 'bisect_splits': 3}
[(1, 'input 0 contains a NUL character')]
```

Seven requests for eight items: one failed request for the whole batch, then the halves are tried (`bisect_splits=3` in total as the bad item is narrowed down), costing about `2·log2(batch size)` extra requests, not a rerun of everything.

### 7. Batch size sweep on a virtual clock

```python
# Batch-size sweep on a virtual clock: 4,000 short texts, one worker, no real waiting.
# Cost model of the fake (my assumptions, not a measured API):
#   every request costs 0.05 s overhead + 0.0002 s per padded token (items x longest item in the batch);
#   each item has a 0.4% chance of making its whole request fail, which then must be retried.
sweep_docs = [(f"s{i}", " ".join(random.Random(i).choices(vocab, k=random.Random(i * 7).randint(3, 40))))
              for i in range(4000)]

def run_sweep(batch_size, sort_by_length=True):
    clock = VirtualClock()
    emb = FakeEmbedder(max_batch=512, max_input_tokens=64, overhead_s=0.05, per_token_s=0.0002,
                       p_fail_per_item=0.004, seed=3, sleep=clock.sleep)
    pipe = EmbeddingPipeline(emb, VectorStore(":memory:"), batch_size=batch_size, max_batch_tokens=10**9,
                             sleep=clock.sleep, sort_by_length=sort_by_length)
    stats, _ = pipe.run(sweep_docs)
    return stats, clock.now

print(f"{'batch':>6} {'requests':>9} {'retries':>8} {'gave up':>8} {'virtual s':>10} {'items/s':>9}")
for size in (1, 2, 4, 8, 16, 32, 64, 128, 256, 512):
    st, secs = run_sweep(size)
    retries = st.get("retries_5xx", 0) + st.get("retries_429", 0)
    print(f"{size:>6} {st['requests']:>9} {retries:>8} {st.get('failed', 0):>8} {secs:>10.1f} {st.get('embedded', 0) / secs:>9.1f}")

st_sorted, t_sorted = run_sweep(64, sort_by_length=True)
st_unsorted, t_unsorted = run_sweep(64, sort_by_length=False)
print(f"\nbatch 64, sorted by length: {t_sorted:.1f} s | in arrival order: {t_unsorted:.1f} s  (padding waste)")
```

Output:

```
 batch  requests  retries  gave up  virtual s   items/s
     1      4014       15        0      218.3      18.3
     2      2015       15        0      118.4      33.8
     4      1016       16        0       68.6      58.3
     8       514       14        0       43.9      91.2
    16       261       11        0       31.6     126.6
    32       145       20        0       28.0     143.0
    64        75       12        0       24.2     165.5
   128        52       20        0       31.0     129.0
   256        32       16        0       34.6     115.7
   512        39       31     1951      100.9      20.3

batch 64, sorted by length: 24.2 s | in arrival order: 45.6 s  (padding waste)
```

### 8. Parallel workers

Real threads and real 30 ms sleeps, best of three runs. Your numbers will differ.

```python
# Parallelism: real threads and real (short) sleeps. 40 batches of 8 texts, 30 ms per request, best of 3 runs.
par_docs = [(f"q{i}", f"unique parallel text number {i}") for i in range(320)]
print(f"{'workers':>8} {'wall time':>10} {'speed-up':>9}")
base = None
for workers in (1, 2, 4, 8):
    walls = []
    for _ in range(3):
        pipe = EmbeddingPipeline(FakeEmbedder(overhead_s=0.03, max_batch=8), VectorStore(":memory:"),
                                 batch_size=8, workers=workers)
        t0 = time.perf_counter()
        pipe.run(par_docs)
        walls.append(time.perf_counter() - t0)
    wall = min(walls)
    base = base or wall
    print(f"{workers:>8} {wall:>9.2f}s {base / wall:>8.1f}x")
```

Output:

```
 workers  wall time  speed-up
       1      1.22s      1.0x
       2      0.61s      2.0x
       4      0.31s      4.0x
       8      0.16s      7.8x
```

### Using a real provider (not executed)

Only the `embedder` object changes. This adapter is **not executed in this module's verification** (it needs an API key and network access) and is written from the public shape of the OpenAI Python SDK; check the current SDK documentation for exact names and behaviour before relying on it.

```python
# NOT EXECUTED in this module's verification (needs an API key and network access).
import openai

class ProviderEmbedder:
    """Adapts an SDK client to the interface the pipeline expects: .model, .max_input_tokens, .embed(texts)."""
    def __init__(self, model, max_input_tokens):          # take max_input_tokens from the provider's docs
        self.client = openai.OpenAI(max_retries=0)         # our pipeline owns retries, so avoid nested retry loops
        self.model, self.max_input_tokens = model, max_input_tokens

    def embed(self, texts):
        try:
            response = self.client.embeddings.create(model=self.model, input=texts)
        except openai.RateLimitError as e:                 # HTTP 429
            header = e.response.headers.get("retry-after")
            raise RateLimitError(retry_after=float(header) if header else 1.0) from e
        except openai.BadRequestError as e:                # HTTP 400: bad input
            raise InvalidInputError(str(e)) from e
        except (openai.APIConnectionError, openai.APITimeoutError, openai.InternalServerError) as e:
            raise TransientError(str(e)) from e
        return [item.embedding for item in response.data]  # one vector per input, in order
```

Also replace `count_tokens` with the model's real tokenizer (`tiktoken` for OpenAI models, the model's own tokenizer for Hugging Face models); neither is installed where this module was verified.

### What this pipeline leaves out

A single machine and a list in memory (stream large corpora from disk with a generator); a proactive client-side rate limiter such as a token bucket, which avoids 429s instead of reacting to them; async I/O instead of threads; compact vector storage; progress logging and metrics; and a policy for what to do with the `failures` table (alert, quarantine, fix and re-run). Some providers also offer asynchronous batch endpoints for non-urgent bulk work; OpenAI's rate-limits guide describes its Batch API for that purpose, and you should check whether it covers your embedding model.

## Visual diagram

```
  corpus: [(doc_id, text), ...]
        │
        ▼
  ┌───────────────┐   empty text ──────────► failures table (permanent), no request spent
  │ 1. prepare    │   over the limit ──────► truncate (counted: `truncated`)
  └───────┬───────┘
          ▼
  ┌───────────────┐   key = sha256(model + text)
  │ 2. dedupe +   │   already stored ──────► skip  (tokens avoided by cache)
  │    cache check│   known-bad ───────────► skip
  └───────┬───────┘   otherwise ───────────► to-do list
          ▼
  ┌───────────────┐   sort by length, cap items AND tokens per batch
  │ 3. plan       │
  └───────┬───────┘
     ┌────┴─────┬──────────┐
     ▼          ▼          ▼            N worker threads (waiting on the network)
  batch 1    batch 2    batch 3  ...
     │
     │  call_with_retry
     │    429 / 5xx ─► wait  U(0, min(cap, base·2^n))  (+ Retry-After) ─► try again
     │    400       ─► bisect: halve the batch until the poison item is alone ─► failures table
     ▼
  ┌───────────────┐
  │ 4. commit     │   main thread, ONE SQLite transaction per finished batch = the checkpoint
  └───────────────┘


  Crash and resume (numbers from block 5)

  run 1   [b1][b2][b3][b4][b5] ✖ process dies      stored 80 vectors; in-flight work is lost
  run 2   skip 80 ──► embed 215 ──► isolate 1 poison item          retries: 4, requests: 26
  run 3   skip all 295                                             requests: 0
  run 4   skip 290 ──► embed the 15 new/edited texts               requests: 1
```

## Practice

### 1. The invisible edit

In block 5, run 4 edited documents by *prepending* a word. Instead, run the corpus once, then append the word `revised` to the end of documents 50 to 54 and run again. How many texts are re-embedded, and why not five?

<details><summary>Answer</summary>

```python
store = VectorStore(":memory:")
pipe = EmbeddingPipeline(FakeEmbedder(sleep=NO_SLEEP), store, batch_size=16, sleep=NO_SLEEP)
pipe.run(docs)                                               # first full run

appended = list(docs)
for i in (50, 51, 52, 53, 54):                               # five edits, each appended at the END of the text
    appended[i] = (appended[i][0], appended[i][1] + " revised")
stats, _ = pipe.run(appended)
print("embedded:", stats.get("embedded", 0), "| cache hits:", stats["cache_hits"])
print("token counts of docs 50-54:", [count_tokens(docs[i][1]) for i in (50, 51, 52, 53, 54)], "(limit is 32)")
```

Output:

```
embedded: 2 | cache hits: 293
token counts of docs 50-54: [39, 8, 36, 33, 27] (limit is 32)
```

Only 2. Documents 50, 52 and 53 already exceed the 32-token limit (39, 36 and 33 tokens), so they are truncated before hashing and the appended word is cut off: the key is unchanged, the cache reports a hit, and the edit never reaches the index. Documents 51 and 54 are short enough that the appended word survives, so they change. This is the cost of truncating silently; the fix is to chunk long documents so the whole text is embedded ([Module 06](../06-chunking-fixed-size-strategies/README.md)), and to monitor `truncated`.

</details>

### 2. Why jitter matters

Simulate 50 clients that are all rate-limited at the same instant and retry with exponential backoff. For the first four attempts, how many clients land in the busiest 10 ms slot with no jitter, and with full jitter?

<details><summary>Answer</summary>

```python
rng = random.Random(11)
CLIENTS, BASE = 50, 0.05
print(f"{CLIENTS} clients are rate-limited at t=0 and all retry; busiest 10 ms slot per attempt")
print(f"{'attempt':>8} {'no jitter':>10} {'full jitter':>12}")
t_plain = t_jit = [0.0] * CLIENTS
for attempt in range(1, 5):
    window = BASE * 2 ** (attempt - 1)
    t_plain = [t + window for t in t_plain]                           # everyone waits exactly the same time
    t_jit = [t + rng.uniform(0, window) for t in t_jit]               # everyone waits a random time
    busiest = lambda times: max(Counter(int(t / 0.010) for t in times).values())
    print(f"{attempt:>8} {busiest(t_plain):>10} {busiest(t_jit):>12}")
```

Output:

```
50 clients are rate-limited at t=0 and all retry; busiest 10 ms slot per attempt
 attempt  no jitter  full jitter
       1         50           13
       2         50            8
       3         50            5
       4         50            4
```

Without jitter every client waits exactly the same time, so all 50 retry together every time and the provider sees the same burst again. With full jitter the retries spread over the window and the burst shrinks with each attempt.

</details>

### 3. The cache key that forgot the model

Replace `content_key` with one that hashes only the text. Embed 50 documents with `model-A`, then the same 50 with `model-B` against the same store. What happens?

<details><summary>Answer</summary>

```python
good_key = content_key
content_key = lambda model, text: hashlib.sha256(text.encode("utf-8")).hexdigest()    # BUG: model name left out

shared_db = ":memory:"
store = VectorStore(shared_db)
EmbeddingPipeline(FakeEmbedder(model="model-A", sleep=NO_SLEEP), store, sleep=NO_SLEEP).run(docs[:50])
stats, key_of = EmbeddingPipeline(FakeEmbedder(model="model-B", sleep=NO_SLEEP), store, sleep=NO_SLEEP).run(docs[:50])
vec_b_expected = FakeEmbedder(model="model-B")._vector(docs[0][1])
print("model-B run: cache hits =", stats["cache_hits"], "| embedded =", stats.get("embedded", 0))
print("vector served for model-B equals a real model-B vector:", store.vector(key_of["doc-0000"]) == vec_b_expected)

content_key = good_key                                                                 # restore the correct key
```

Output:

```
model-B run: cache hits = 46 | embedded = 0
vector served for model-B equals a real model-B vector: False
```

Every document is a cache hit, so nothing is embedded, and "model-B" now serves model-A's vectors without any error. Mixing vectors from different models in one index silently ruins retrieval (their coordinates mean different things; it is the last item in Module 03's troubleshooting list). The model name must be in the key.

</details>

### Checkpoint quiz

1. Why is the cache itself enough to resume after a crash, with no separate "last processed id"?
2. A run reports `cache_hits=0` on the second run of an unchanged corpus. Name two likely causes in the key.
3. Which errors should be retried, and which should not? Why must "invalid input" be isolated rather than retried?
4. What does jitter add on top of exponential backoff?
5. Why can too large a batch reduce throughput even though each request amortizes more overhead?

<details><summary>Answers</summary>

1. Because each stored vector is keyed by its content, "what is left to do" can be recomputed at any time as "texts whose key is not stored". Finished work is found automatically and unfinished work is simply not there.
2. The key includes something that changes between runs (a timestamp, a run id, a randomly generated document id), or the text is normalized differently each time; or the cache is not persisted (a new empty database on every run).
3. Retry rate limits (429) and transient server errors or timeouts, since waiting can fix them. Do not retry invalid input (400) or quota and billing errors, since the same request will fail the same way. Invalid input is isolated by splitting the batch so the rest of the batch still succeeds.
4. A random spread of retry times, so clients that failed together do not all retry together.
5. A failed request wastes the entire batch and larger batches are more likely to fail (and to hit per-request limits), so beyond some size the expected cost per successfully embedded item rises (block 7: 165.5 items/s at 64, 20.3 at 512).

</details>

> [!check]
> - I can list the stages of an embedding pipeline and what each protects against.
> - I can explain exponential backoff, jitter and `Retry-After`, and which errors to retry.
> - I can design a cache key and say what must and must not be in it.
> - I can explain why content-addressed writes make a pipeline idempotent and resumable.
> - I can isolate one bad document from a batch by bisection.
> - I can say why batch size has a sweet spot and how to measure it for my provider.

## Project

Turn the pipeline into a command-line tool, `embed_corpus.py`, that embeds every `.txt` file in a directory (one document per file, or one per paragraph, your choice) into a SQLite database, with options for batch size, number of workers, database path and a model name. Use the fake embedder, then add a second embedder behind the same interface that you can run locally if you have a model available. Write tests that kill the process mid-run (for example by calling `os._exit` after N batches) and prove that the resumed database fingerprint equals an uninterrupted run; that changing one file re-embeds exactly one text; that the same text under two model names produces two cache entries; that a file containing a bad byte ends up in the failures table while the rest succeed; and that the tool's token and cost report matches a hand count on a tiny corpus. Finish with a batch-size and worker sweep using latency and failure rates you choose (watch how the best batch size moves as the failure rate rises), and write a paragraph on how you would redo the sweep against a real provider (what to vary, what to measure, which limits to read first). No code is given; design the module boundaries yourself.

## Interview questions

> [!interview] Design a job that embeds 50 million documents, must survive crashes and rate limits, and must be cheap to re-run when a few thousand documents change. What are the main pieces?

<details><summary>What a strong answer covers</summary>

- Content-hash keys over (model, normalized-or-exact text, plus any parameters that affect output) to dedupe and cache; store vectors durably so the store is the checkpoint.
- Batches planned under request and token limits; retries for 429 and 5xx with exponential backoff, jitter and `Retry-After`; no retries for invalid input.
- Per-item failure isolation (bisection, dead-letter table), commit per batch, idempotent writes, resume by recomputing the to-do set.
- Bounded parallelism tuned against the provider's limits, a client-side rate limiter, and metrics (tokens, cache hit rate, retries, failures, cost).
- Operational points: pin the model version, store the model id with every vector, plan for a full re-embed when the model changes, reconcile token counts with the provider's usage.

</details>

> [!interview] You scale an embedding job from 4 to 32 workers and throughput barely improves while error logs fill with 429s. What is happening and what do you do?

<details><summary>What a strong answer covers</summary>

- The provider's request or token rate limit is the bottleneck, so extra workers just produce rejected requests (which still count toward limits).
- Check whether the limit is requests per minute or tokens per minute; if requests, send more inputs per request; if tokens, more workers cannot help.
- Respect `Retry-After`, add jitter, cap total retry time, avoid nested retry loops with the SDK, and add a client-side limiter so the pipeline stays under the limit instead of bouncing off it.
- Find the worker count where the 429 rate begins to rise and settle slightly below it; consider an asynchronous bulk endpoint if the work is not urgent.

</details>

> [!interview] Why must the model name be part of an embedding cache key, and what else belongs there?

<details><summary>What a strong answer covers</summary>

- Different models produce incomparable vectors; a key without the model silently serves the wrong vectors after a model change.
- Also include anything else that changes the output: requested dimension, query versus document input type, prefixes or instructions added to the text, preprocessing and truncation settings (the key should reflect the text actually embedded), and a version if the model name is an alias.
- Exclude volatile identifiers (document id, path, timestamp) so unchanged content hits the cache.
- Notes the consequence: a model change is a full re-embed into a separate index or namespace, never a mix.

</details>

## Common mistakes & troubleshooting

- **Every rerun re-embeds everything.** Something volatile is in the key (document id, timestamp, path), or the database is created fresh each run. Print `cache_hits` and compare two keys for the same text.
- **After switching models, results look wrong but nothing errored.** The key lacks the model, so old vectors were served (Exercise 3), or two models' vectors share an index. Put the model in the key and keep one index per model.
- **A lot of 429s and little progress.** Too many workers for the provider's limits, retries without jitter, or SDK retries stacked on yours. Lower workers, add jitter and `Retry-After`, disable duplicate retry loops.
- **One bad document aborts the whole run.** There is no per-item isolation. Bisect rejected batches and record permanent failures.
- **A resumed job skips documents that were never embedded.** Progress was tracked with a counter or offset while workers finish out of order. Derive the to-do list from what is stored.
- **Edited documents do not change in search.** Check `truncated`: the edit may be beyond the input limit (Exercise 1). Chunk long documents.
- **Totals disagree with the provider's bill.** Your tokenizer differs from theirs, or failed attempts are billed. Treat your count as an estimate and reconcile with the usage dashboard.

## Further reading & sources

- [Rate limits | OpenAI API](https://developers.openai.com/api/docs/guides/rate-limits) - the source for the retry rules used here (`Retry-After` as a minimum plus jitter, limit attempts and total time, no nested retry loops, failed requests count toward limits) and for the requests-versus-tokens batching advice.
- [Vector embeddings | OpenAI API](https://developers.openai.com/api/docs/guides/embeddings) - shows embeddings requests taking a list of inputs and states that usage is priced per input token; check its current model table for input limits instead of copying numbers.
- [Exponential Backoff And Jitter | AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) - why retries need randomness and a comparison of full, equal and decorrelated jitter; the "full jitter" used in `call_with_retry`.
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) - defines the `Retry-After` header and the 5xx and 4xx status classes the retry logic switches on.
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585.html) - defines status 429 Too Many Requests.
- [concurrent.futures - Python documentation](https://docs.python.org/3/library/concurrent.futures.html) - `ThreadPoolExecutor` and `as_completed`, used for the parallel batches.
- [sqlite3 - Python documentation](https://docs.python.org/3/library/sqlite3.html) - transactions via the connection context manager, the basis of the one-commit-per-batch checkpoint.

## Next

[Module 06: Chunking: Fixed-Size Strategies](../06-chunking-fixed-size-strategies/README.md)
