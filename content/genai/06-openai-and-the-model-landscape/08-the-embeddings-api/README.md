# Module 08: The Embeddings API

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**, module 08 of 00-18. Earlier modules made a first request ([Module 00: The OpenAI API: Your First Call](../00-the-openai-api-your-first-call/README.md)) and walked through the text endpoints. This one is the third kind of endpoint you will use constantly: turning text into vectors. The *ideas* behind embeddings live in Track 08, **Embeddings & Vector Databases**, and this module deliberately does not repeat them: what an embedding is ([Module 00: What an Embedding Is](../../08-embeddings-and-vector-databases/00-what-an-embedding-is/README.md)), which model to pick ([Module 02: Embedding Models Compared](../../08-embeddings-and-vector-databases/02-embedding-models-compared/README.md)), how vectors are compared and normalised ([Module 03: Cosine Similarity and Distance Metrics](../../08-embeddings-and-vector-databases/03-cosine-similarity-and-distance-metrics/README.md)) and how to run a whole corpus through a model ([Module 05: Generating Embeddings at Scale](../../08-embeddings-and-vector-databases/05-generating-embeddings-at-scale/README.md)). Here you learn the **API contract**.

After this module you can:

- send an embeddings request with the documented fields and read the response, including how results are matched to inputs;
- state the per-input, per-array and per-request limits the docs give (with their date) and keep them in configuration instead of in your head;
- use `dimensions` and `encoding_format` correctly, and know why a vector you shorten yourself must be renormalised;
- turn token usage into a cost estimate with a formula, and a number you replace with the current price;
- write a small client that batches, retries and caches against a stand-in server, and explain why vectors from different models or settings are never compared.

Why it matters: embeddings are usually the first paid step of a retrieval system, run over millions of texts. Small API facts (a limit, a default, a field) decide whether that job finishes, what it costs and whether the results are even comparable next month.

> [!note] Sources and dates. Request and response fields, limits and error shapes come from the OpenAI OpenAPI spec (`openai/openai-openapi`, commit dated 2026-10-24); behaviour and advice come from OpenAI's [Vector embeddings](https://developers.openai.com/api/docs/guides/embeddings) and [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits) guides and the `openai-python` source; all fetched on 2026-10-26. Limits, model names and prices are perishable: the official docs are the source of truth and may have changed since. No API was called in this module.

## Concept

> [!key] The embeddings endpoint is a small stateless contract: texts in (with a model and optional `dimensions` and `encoding_format`), vectors out (matched to inputs by `index`), billed by input tokens, under per-request limits you read from the docs rather than memorise. Batching, retries and caching are your client's job, and vectors from different models or settings must never be compared.

## Explanation

### The request and response, as documented

`POST /v1/embeddings` takes these fields (from the spec's `CreateEmbeddingRequest`):

| Field | Required | What the spec says |
|---|---|---|
| `model` | yes | "ID of the model to use." A string; the spec's enum lists `text-embedding-ada-002`, `text-embedding-3-small` and `text-embedding-3-large`, and points to the List models API and the model overview page for what your account can use |
| `input` | yes | "a string or array of tokens". Four forms: one string; an array of strings; an array of integers (one pre-tokenised input); an array of arrays of integers. Arrays have 1 to 2048 items |
| `encoding_format` | no | `float` (the default) or `base64` |
| `dimensions` | no | an integer of at least 1; "Only supported in `text-embedding-3` and later models" |
| `user` | no | an end-user identifier that "can help OpenAI to monitor and detect abuse" |

The response (`CreateEmbeddingResponse`) is `{"object": "list", "data": [...], "model": "...", "usage": {"prompt_tokens": n, "total_tokens": n}}`, where each element of `data` is `{"object": "embedding", "index": i, "embedding": [...]}`. Use `index` to match vectors to inputs instead of trusting list order: the spec calls it "the index of the embedding in the list of embeddings", and a client that relies on position breaks the first time anything reorders results (block 4 tests this).

Errors use the usual envelope, `{"error": {"message", "type", "param", "code"}}`. The spec documents a 400 for "Invalid embedding input or request parameters", 401 and 403 for authentication and policy problems, 429 for rate limiting and 500 or 503 for server trouble. For 429 and 503 it documents a `Retry-After` header with "the minimum number of seconds to wait before retrying", which "may be omitted".

### Limits, as documented

The spec's description of `input` states (checked 2026-10-26): "The input must not exceed the max input tokens for the model (8192 tokens for all embedding models), cannot be an empty string, and any array must be 2048 dimensions or less ... In addition to the per-input token limit, all embedding models enforce a maximum of 300,000 tokens summed across all inputs in a single request."

| Limit | Value (spec, checked 2026-10-26) |
|---|---|
| tokens per single input | 8192 |
| items in the `input` array | 1 to 2048 |
| tokens summed over one request | 300,000 |
| empty string | not allowed |

Two requests can hit different limits: 5,000 short notes are limited by the item count (3 requests), 100 documents of 4,000 tokens by the token total (2 requests); block 4 shows both. Keep the numbers in configuration with a "checked on" date, because they are exactly the kind of fact that changes.

The page I read says an input "must not exceed" the limit and documents a 400 for invalid input; I found no statement that the service silently truncates. So treat an over-long input as an error you must prevent: shorten it deliberately, or better, split it into chunks ([Track 08, Module 06: Chunking: Fixed-Size Strategies](../../08-embeddings-and-vector-databases/06-chunking-fixed-size-strategies/README.md)), because silently cutting a document hides its tail from search.

Counting tokens before you send needs the model's own tokenizer. The guide says to use `tiktoken` with the `cl100k_base` encoding for third-generation embedding models; `tiktoken` is not installed where this module was verified, so the code below counts words and punctuation as a crude stand-in. Real counts differ, so compare your estimate with `usage` in the response (block 4).

### `dimensions`, and what shortening does

The guide gives the default lengths: "1536 for `text-embedding-3-small` or 3072 for `text-embedding-3-large`". It says the models were trained "with a technique" (it links the Matryoshka Representation Learning paper) so that developers "can shorten embeddings (i.e. remove some numbers from the end of the sequence) without the embedding losing its concept-representing properties by passing in the `dimensions` API parameter", and makes a vendor claim worth testing on your data: on MTEB, a `text-embedding-3-large` embedding "can be shortened to a size of 256 while still outperforming an unshortened `text-embedding-ada-002` embedding with a size of 1536". The guide's advice: "In general, using the `dimensions` parameter when creating the embedding is the suggested approach", and if you cut a vector yourself, "you need to be sure to normalize the dimensions of the embedding".

Why normalise? The guide says "OpenAI embeddings are normalized to length 1", so cosine similarity equals a dot product and gives the same ranking as Euclidean distance. The first `k` numbers of a unit vector have length *below* 1, so after cutting, dot products shrink and no longer mean cosine. Block 3 measures it: a 16-number prefix has norm 0.33 until you divide by that norm. The spec's own example response for `"dimensions": 3` is `[0.26726124, 0.53452248, 0.80178373]`, whose norm is 1.0, which is evidence (not a statement) that the service returns unit-length vectors at the shortened size; check this on your own account with `np.linalg.norm`. How the service produces shortened vectors internally is not described on the pages I read; the stand-in below implements it as "keep a prefix, then renormalise" for simplicity.

What shortening is, when a *model* supports it and what it costs in retrieval quality is Track 08 material: see the Matryoshka section of [Module 02: Embedding Models Compared](../../08-embeddings-and-vector-databases/02-embedding-models-compared/README.md), and [Module 03](../../08-embeddings-and-vector-databases/03-cosine-similarity-and-distance-metrics/README.md) for normalisation and metrics. Here, the API consequence is storage: block 4 prints 2,000,000 vectors as 24.6 GB at 3072 dimensions, 12.3 GB at 1536 and 2.0 GB at 256 (float32), while usage is priced per input token.

> [!pitfall] `dimensions` is part of the identity of a vector. Vectors made with different `dimensions` have different lengths and live in different spaces; a cache or index that ignores the setting hands back the wrong shape (exercise 2 shows it).

### Encoding formats

With `encoding_format: "float"` each vector is a JSON list of numbers. With `"base64"` it is one string. The spec only says "base64"; the layout is visible in the official Python SDK source (`src/openai/lib/_parsing/_embeddings.py`, main branch, fetched 2026-10-26): it reads the decoded bytes as an array of **float32** (`np.frombuffer(base64.b64decode(data), dtype="float32")`, or `array.array("f", ...)` without numpy). That source also shows that when you do not pass `encoding_format`, the SDK itself asks for `base64` and decodes it for you. If you call the HTTP API directly, you decode it yourself; block 2's `decode` uses explicit little-endian float32 (`"<f4"`), which is what mainstream hardware uses. A float list printed as decimal text takes many more characters than the same numbers as base64 (block 3 prints the difference on the stand-in's vectors; the guide's own example response prints numbers like `-0.006929283495992422`), so base64 mainly saves bandwidth and parsing time on large batches.

### Billing is in tokens

The guide: "Requests are billed based on the number of tokens in the input" and "Usage is priced per input token". The response reports it: `usage.prompt_tokens` and `usage.total_tokens` (equal for embeddings, since there is no generated text). So the cost of a job is a formula, not a mystery:

```
tokens = documents x average_tokens_per_document
cost   = tokens / 1,000,000 x price_per_million_tokens       <- look the price up; it is perishable
```

Block 4 uses an **ILLUSTRATIVE** price of 1.00 per million tokens purely to show arithmetic: 2,000,000 documents of 400 tokens is 800,000,000 tokens, or 800.00 at that made-up price. It is not a real price; take the current one from OpenAI's pricing page. What actually moves the number: re-embedding unchanged text (a content-hash cache fixes this), duplicates, documents so long they should be chunked, and retries (whether failed requests are billed is something to check on the pricing and usage pages rather than assume). Rate limits count requests *and* tokens, so a job can be limited by either; [Module 16: Pricing, Rate Limits and Quotas](../16-pricing-rate-limits-and-quotas/README.md) covers that properly.

### The few client lines you need: batch, retry, cache

[Track 08, Module 05](../../08-embeddings-and-vector-databases/05-generating-embeddings-at-scale/README.md) builds the full pipeline (durable store, resumable runs, isolating a bad item, parallel workers); read it before running a real corpus. This module only needs three ideas, restated:

1. **Batch under both limits.** Walk the texts in order, starting a new request when adding the next text would exceed 2048 items or 300,000 tokens. Check every single text against the 8192 limit first.
2. **Retry only what can go away.** The rate-limits guide says to treat `Retry-After` "as a minimum", add random delay, "limit both the number of attempts and the total time spent retrying", and not to retry "quota, billing, or other errors that require you to take action". It also notes that a hard spend limit returns a 429, which no amount of waiting fixes, and that the official SDKs retry eligible 429 and 503 responses themselves, so "disable SDK retries or account for them in those limits so nested retry loops don't multiply requests". The block 2 client waits `max(Retry-After, jittered exponential backoff)`, caps attempts and total wait, and refuses to retry a 429 that is neither `slow_down` nor accompanied by `Retry-After`.
3. **Cache by what determines the vector.** Key on the model, the `dimensions` and the text. Leave any of them out and you will serve the wrong vector without any error.

### Vectors from different models are not comparable

> [!model] Every embedding model draws its own map. A vector is a location on that map; coordinates from one map mean nothing on another, even when both maps happen to use the same number of coordinates per place.

An embedding model defines its own coordinate system. A vector from model A and a vector from model B are not points in the same space, even if both have 1536 numbers; their similarity score is noise. The same holds for the same model with a different `dimensions`. So store `(model, dimensions)` next to every vector (or per index), refuse to compare when they differ, and treat "upgrading the embedding model" as re-embedding *everything* and rebuilding the index, ideally side by side with the old one until an evaluation says the new one is better. Choosing which model is the evaluation work in [Module 02: Embedding Models Compared](../../08-embeddings-and-vector-databases/02-embedding-models-compared/README.md). Block 4 shows two stand-in models producing unrelated vectors for the same text, and a guard that refuses the comparison.

## Code

Standard library plus numpy; no network. A **local stand-in server mimics the documented request, response, error and `Retry-After` shapes of `POST /v1/embeddings`; the "model" behind it is a deterministic hashed bag of words, not a trained embedding model**. Identical text always gives an identical vector and texts that share words get similar vectors, but nothing understands meaning, so no retrieval-quality conclusion can be drawn from it. The batching, limit enforcement, base64 decoding, retry, caching and accounting logic is genuinely executed.

Save blocks 1-4 in order as one file (for example `embeddings_demo.py`) and run it; the whole file ran for this module, twice, with identical output (timings and ports are not printed).

### Block 1: the stand-in server

<details>
<summary>Open to read the stand-in (about 110 lines; the limits it enforces are the documented ones)</summary>

```python
import base64
import hashlib
import json
import re
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

TOKEN_RE = re.compile(r"\w+|[^\w\s]")


def count_tokens(text):
    """A crude stand-in for a tokenizer (words and punctuation). NOT the model's real tokenizer: counts from a
    real one differ, so treat everything built on this number as an estimate."""
    return len(TOKEN_RE.findall(text))


# Limits as the OpenAI spec states them (createEmbedding, checked 2026-10-26). Read them from config in real code.
DOCUMENTED_LIMITS = {"max_items": 2048, "max_input_tokens": 8192, "max_request_tokens": 300_000}


class EmbeddingStandIn:
    """A local stand-in that mimics the documented shape of POST /v1/embeddings. The 'model' is a deterministic
    hashed bag of words, NOT a trained embedding model: the same text always gives the same vector and texts that
    share words get similar vectors, but nothing here understands meaning. Two stand-in models give unrelated vectors.
    Models: "standin-3" (64 dims, accepts `dimensions`) and "standin-legacy" (32 dims, rejects `dimensions`)."""
    NATIVE = {"standin-3": 64, "standin-legacy": 32}

    def __init__(self, **limits):
        self.limits = DOCUMENTED_LIMITS | limits
        self.failures, self.served, self.shuffle = [], [], False   # failures: queue of (status, retry_after[, code])
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                status, payload, headers = outer.handle(body)
                raw = json.dumps(payload).encode()
                self.send_response(status)
                for k, v in {"Content-Type": "application/json", "Content-Length": str(len(raw)), **headers}.items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(raw)

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}/v1/embeddings"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    @staticmethod
    def _err(status, kind, message, param=None, code=None):         # the documented error envelope
        return status, {"error": {"message": message, "type": kind, "param": param, "code": code}}, {}

    def vector(self, model, text, dimensions=None):
        v = np.zeros(self.NATIVE[model])
        for token in TOKEN_RE.findall(text.lower()):
            n = int.from_bytes(hashlib.blake2b(f"{model}|{token}".encode(), digest_size=8).digest(), "little")
            v[n % len(v)] += 1.0 if (n >> 40) & 1 else -1.0
        v = v[:dimensions] if dimensions else v       # simplification: shorten = keep a prefix, then renormalise
        norm = np.linalg.norm(v)
        return (v / norm if norm else np.eye(len(v))[0]).astype(np.float32)

    def handle(self, body):
        if self.failures:                                            # injected 429 / 503, documented shapes
            status, retry_after, *code = self.failures.pop(0)         # (status, Retry-After seconds or None[, code])
            kind, default = (("rate_limit_error", "slow_down") if status == 429
                             else ("service_unavailable_error", "server_is_overloaded"))
            st, payload, _ = self._err(status, kind, "injected failure", code=code[0] if code else default)
            return st, payload, ({"Retry-After": str(retry_after)} if retry_after else {})
        bad = lambda msg, param=None: self._err(400, "invalid_request_error", msg, param)
        model, texts, dims = body.get("model"), body.get("input"), body.get("dimensions")
        if model not in self.NATIVE:
            return bad(f"unknown model {model!r}", "model")
        if isinstance(texts, str):
            texts = [texts]
        if not isinstance(texts, list) or not texts or not all(isinstance(t, str) for t in texts):
            return bad("input must be a string or a non-empty array of strings (token arrays: not in this stand-in)", "input")
        if len(texts) > self.limits["max_items"]:
            return bad(f"any array must be {self.limits['max_items']} dimensions or less", "input")
        if "" in texts:
            return bad("input cannot be an empty string", "input")
        counts = [count_tokens(t) for t in texts]
        if max(counts) > self.limits["max_input_tokens"]:
            return bad(f"input must not exceed {self.limits['max_input_tokens']} tokens", "input")
        if sum(counts) > self.limits["max_request_tokens"]:
            return bad(f"at most {self.limits['max_request_tokens']} tokens summed across all inputs", "input")
        if dims is not None and (model == "standin-legacy" or not isinstance(dims, int) or not 1 <= dims <= self.NATIVE[model]):
            return bad("'dimensions' is not supported for this model or is out of range", "dimensions")
        fmt = body.get("encoding_format", "float")
        if fmt not in ("float", "base64"):
            return bad("encoding_format must be 'float' or 'base64'", "encoding_format")
        data = []
        for i, text in enumerate(texts):
            v = self.vector(model, text, dims)
            emb = v.tolist() if fmt == "float" else base64.b64encode(v.astype("<f4").tobytes()).decode()
            data.append({"object": "embedding", "index": i, "embedding": emb})
        self.served.append((len(texts), sum(counts)))
        if self.shuffle:
            data.reverse()                                           # clients must use `index`, not list order
        return 200, {"object": "list", "data": data, "model": model,
                     "usage": {"prompt_tokens": sum(counts), "total_tokens": sum(counts)}}, {}
```

</details>

### Block 2: batching, retries and caching in a client

```python
import random


class NotRetryable(ValueError):
    """The request was refused for a reason that retrying cannot fix (HTTP 400, a hard spending limit, ...)."""


class RetriesExhausted(RuntimeError):
    pass


def plan_batches(token_counts, max_items, max_tokens):
    """Greedy, order-preserving batches of indexes that respect both per-request limits."""
    batches, current, used = [], [], 0
    for i, n in enumerate(token_counts):
        if current and (len(current) == max_items or used + n > max_tokens):
            batches.append(current)
            current, used = [], 0
        current.append(i)
        used += n
    return batches + ([current] if current else [])


def decode(item):
    """`embedding` is a list of floats ("float") or a base64 string of little-endian float32 values ("base64")."""
    e = item["embedding"]
    return np.frombuffer(base64.b64decode(e), dtype="<f4") if isinstance(e, str) else np.asarray(e, dtype=np.float32)


class EmbeddingsClient:
    """Batches, retries and caches. Module 05 of Track 08 builds the full pipeline (persistent store, resumable
    runs, poison-item isolation); this is only the part this module's API facts need."""

    def __init__(self, url, model, dimensions=None, encoding_format="float", limits=None, max_attempts=5,
                 max_total_wait=60.0, seed=0):
        self.url, self.model, self.dimensions, self.fmt = url, model, dimensions, encoding_format
        self.max_total_wait = max_total_wait
        self.limits = limits or DOCUMENTED_LIMITS
        self.cache, self.max_attempts, self.rng = {}, max_attempts, random.Random(seed)
        self.sleeps, self.sleep = [], lambda s: None      # a recording fake: the demo does not really wait
        self.stats = {"requests": 0, "retries": 0, "cache_hits": 0, "tokens": 0}

    def key(self, text):                                   # everything that changes the vector belongs in the key
        return hashlib.sha256(f"{self.model}\x1f{self.dimensions}\x1f{text}".encode()).hexdigest()

    def _post(self, texts):
        body = {"model": self.model, "input": texts, "encoding_format": self.fmt}
        if self.dimensions:
            body["dimensions"] = self.dimensions
        waited = 0.0
        for attempt in range(self.max_attempts):
            request = urllib.request.Request(self.url, data=json.dumps(body).encode(), headers={
                "Content-Type": "application/json", "Authorization": "Bearer not-a-real-key"})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    self.stats["requests"] += 1
                    return json.load(response)
            except urllib.error.HTTPError as e:
                error = json.load(e)["error"]
                retry_after = float(e.headers.get("Retry-After") or 0)       # a minimum wait, when sent
                temporary = e.code >= 500 or (e.code == 429 and (error["code"] == "slow_down" or retry_after > 0))
                if not temporary:                    # 400s, and 429s that are not a temporary rate limit
                    raise NotRetryable(f"HTTP {e.code} {error['code'] or error['type']}: {error['message']}") from None
            except urllib.error.URLError:
                retry_after = 0.0
            delay = max(retry_after, self.rng.uniform(0, min(30.0, 0.5 * 2 ** attempt)))   # exponential, full jitter
            if attempt == self.max_attempts - 1 or waited + delay > self.max_total_wait:
                break                                                      # out of attempts or out of time budget
            waited += delay
            self.stats["retries"] += 1
            self.sleeps.append(round(delay, 2))
            self.sleep(delay)
        raise RetriesExhausted(f"gave up after {attempt + 1} attempts and {waited:.1f}s of waiting")

    def embed(self, texts):
        """Return a float32 array, one row per input text, in input order."""
        if any(not isinstance(t, str) or not t.strip() for t in texts):
            raise NotRetryable("inputs must be non-empty strings")               # cheaper to refuse locally
        todo = sorted({t for t in texts if self.key(t) not in self.cache})        # de-duplicate, skip cached
        self.stats["cache_hits"] += sum(self.key(t) in self.cache for t in texts)
        counts = [count_tokens(t) for t in todo]
        if counts and max(counts) > self.limits["max_input_tokens"]:
            raise NotRetryable(f"an input is over {self.limits['max_input_tokens']} tokens: shorten or chunk it")
        for batch in plan_batches(counts, self.limits["max_items"], self.limits["max_request_tokens"]):
            reply = self._post([todo[i] for i in batch])
            self.stats["tokens"] += reply["usage"]["total_tokens"]
            for item in reply["data"]:                                            # match by `index`, not by position
                self.cache[self.key(todo[batch[item["index"]]])] = decode(item)
        return np.stack([self.cache[self.key(t)] for t in texts])
```

`plan_batches` is the batching rule; `decode` handles both encodings; `EmbeddingsClient.embed` de-duplicates, skips cached texts, batches, and matches results by `index`. Waiting is recorded rather than performed (`self.sleep` is a no-op you replace with `time.sleep`), so the demo is instant and deterministic.

### Block 3: the documented shape, one request at a time

```python
server = EmbeddingStandIn()
norm = np.linalg.norm


def raw_call(body):
    request = urllib.request.Request(server.url, data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json", "Authorization": "Bearer not-a-real-key"})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


print("--- 1. the documented request and response shape")
status, reply = raw_call({"model": "standin-3", "input": ["hello world", "hello there"]})
print("status", status, "| top-level keys:", sorted(reply), "| object:", reply["object"])
print("data[0] keys:", sorted(reply["data"][0]), "| indexes:", [d["index"] for d in reply["data"]],
      "| vector length:", len(reply["data"][0]["embedding"]))
print("usage:", reply["usage"], "| model:", reply["model"])

SENTENCE = "the quick brown fox jumps over the lazy dog while the old cat sleeps by the warm fire tonight"
print("--- 2. encoding_format: float vs base64")
_, as_float = raw_call({"model": "standin-3", "input": [SENTENCE], "encoding_format": "float"})
_, as_b64 = raw_call({"model": "standin-3", "input": [SENTENCE], "encoding_format": "base64"})
print("identical after decoding:", np.array_equal(decode(as_float["data"][0]), decode(as_b64["data"][0])),
      "| the base64 field is a", type(as_b64["data"][0]["embedding"]).__name__)
print("characters in the 'embedding' field: float JSON =", len(json.dumps(as_float["data"][0]["embedding"])),
      "| base64 =", len(json.dumps(as_b64["data"][0]["embedding"])), "(64 dims)")

print("--- 3. dimensions, and why you renormalise after cutting a vector yourself")
_, full = raw_call({"model": "standin-3", "input": [SENTENCE]})
_, short = raw_call({"model": "standin-3", "input": [SENTENCE], "dimensions": 16})
v_full, v_short = decode(full["data"][0]), decode(short["data"][0])
cut = v_full[:16]
print(f"native: {len(v_full)} dims, norm {norm(v_full):.4f} | dimensions=16: {len(v_short)} dims, norm {norm(v_short):.4f}")
print(f"cutting the native vector yourself: norm {norm(cut):.4f}; after dividing by that norm: {norm(cut / norm(cut)):.4f}")
print("this stand-in's dimensions=16 equals cut-and-renormalise (by construction):", np.allclose(v_short, cut / norm(cut)))
spec_example = np.array([0.26726124, 0.53452248, 0.80178373])     # the vector in the OpenAPI spec's "dimensions": 3 example
print("norm of the vector in the spec's own dimensions=3 example:", round(float(norm(spec_example)), 6))
status, err = raw_call({"model": "standin-legacy", "input": ["hi"], "dimensions": 8})
print("dimensions on the legacy stand-in ->", status, err["error"]["message"])

print("--- 4. bad requests are 400s: do not retry them")
for label, body in [("empty string", {"model": "standin-3", "input": ["ok", ""]}),
                    ("too many items", {"model": "standin-3", "input": ["x"] * 2049}),
                    ("one input over the token limit", {"model": "standin-3", "input": ["word " * 8193]}),
                    ("unknown encoding", {"model": "standin-3", "input": ["x"], "encoding_format": "hex"})]:
    status, err = raw_call(body)
    print(f"{label:31} -> {status} {err['error']['type']}: {err['error']['message']}")
```

Output:

```
--- 1. the documented request and response shape
status 200 | top-level keys: ['data', 'model', 'object', 'usage'] | object: list
data[0] keys: ['embedding', 'index', 'object'] | indexes: [0, 1] | vector length: 64
usage: {'prompt_tokens': 4, 'total_tokens': 4} | model: standin-3
--- 2. encoding_format: float vs base64
identical after decoding: True | the base64 field is a str
characters in the 'embedding' field: float JSON = 482 | base64 = 346 (64 dims)
--- 3. dimensions, and why you renormalise after cutting a vector yourself
native: 64 dims, norm 1.0000 | dimensions=16: 16 dims, norm 1.0000
cutting the native vector yourself: norm 0.3288; after dividing by that norm: 1.0000
this stand-in's dimensions=16 equals cut-and-renormalise (by construction): True
norm of the vector in the spec's own dimensions=3 example: 1.0
dimensions on the legacy stand-in -> 400 'dimensions' is not supported for this model or is out of range
--- 4. bad requests are 400s: do not retry them
empty string                    -> 400 invalid_request_error: input cannot be an empty string
too many items                  -> 400 invalid_request_error: any array must be 2048 dimensions or less
one input over the token limit  -> 400 invalid_request_error: input must not exceed 8192 tokens
unknown encoding                -> 400 invalid_request_error: encoding_format must be 'float' or 'base64'
```

Section 1 prints the response's keys, which match the spec's. Section 2 shows the two encodings decode to the same numbers. Section 3 is the normalisation lesson: the prefix cut by hand has norm 0.3288 and must be divided by it; the spec's own `dimensions: 3` example has norm 1. Section 4 shows what each documented limit looks like when violated (the message texts are this stand-in's wording; the status and the fact that it is a 400 are the documented part).

### Block 4: the client at work

```python
print("--- 5. batching under the two per-request limits")
client = EmbeddingsClient(server.url, "standin-3")
short_texts = [f"note number {i} about topic {i % 7}" for i in range(5000)]
server.served.clear()
vectors = client.embed(short_texts)
print(f"5000 short texts -> {len(server.served)} requests with items {[n for n, _ in server.served]}")
long_texts = [f"doc{i} " + "lorem ipsum " * 2000 for i in range(100)]            # about 4001 tokens each
server.served.clear()
EmbeddingsClient(server.url, "standin-3").embed(long_texts)
print(f"100 texts of ~4000 tokens -> {len(server.served)} requests, (items, tokens) = {server.served}")
print("every request within both limits:", all(n <= 2048 and t <= 300_000 for n, t in server.served))
server.shuffle = True                                       # the server now returns each `data` list in reverse
fresh = EmbeddingsClient(server.url, "standin-3")
print("correct even when the server reorders `data`:", np.array_equal(fresh.embed(short_texts[:50]), vectors[:50]))
server.shuffle = False

print("--- 6. the cache, and what is in its key")
before = dict(client.stats)
client.embed(short_texts)                                   # everything is cached now
print("second pass over 5000 texts: new requests =", client.stats["requests"] - before["requests"],
      "| cache hits +", client.stats["cache_hits"] - before["cache_hits"])
before = dict(client.stats)
client.embed(short_texts[:4999] + ["note number 4999 was edited"])
print("after editing one text: new requests =", client.stats["requests"] - before["requests"],
      "| tokens billed +", client.stats["tokens"] - before["tokens"])
print("same text, other `dimensions` => other cache key:",
      EmbeddingsClient(server.url, "standin-3", dimensions=16).key("x") != client.key("x"))

print("--- 7. retries: temporary 429 (with and without Retry-After), 503, then success")
retrying = EmbeddingsClient(server.url, "standin-3", seed=0)
server.failures[:] = [(429, 2), (429, None), (503, None)]
retrying.embed(["retry me"])
print("attempts:", retrying.stats["requests"] + retrying.stats["retries"], "| waits (s):", retrying.sleeps,
      "| first wait >= Retry-After:", retrying.sleeps[0] >= 2)
server.failures[:] = [(503, None)] * 9
try:
    EmbeddingsClient(server.url, "standin-3", max_attempts=3).embed(["never works"])
except RetriesExhausted as e:
    print("persistent failure ->", e)
server.failures[:] = [(429, None, "spend_limit_reached")]            # a 429 that waiting will not fix
try:
    EmbeddingsClient(server.url, "standin-3").embed(["no retry for this one"])
except NotRetryable as e:
    print("hard-limit 429 ->", e)
server.failures.clear()
try:
    client.embed(["fine", "   "])
except NotRetryable as e:
    print("blank input ->", e, "(refused locally, no request sent)")
try:
    wrong = {**DOCUMENTED_LIMITS, "max_items": 5000}        # a client configured with a limit the server does not share
    EmbeddingsClient(server.url, "standin-3", limits=wrong).embed([f"t{i}" for i in range(2049)])
except NotRetryable as e:
    print("a client that trusts the wrong limit ->", e)

print("--- 8. usage, and an ILLUSTRATIVE cost estimate")
meter = EmbeddingsClient(server.url, "standin-3")
meter.embed(short_texts[:1000])
print("usage.total_tokens summed over responses:", meter.stats["tokens"],
      "| my own count with the same toy tokenizer:", sum(count_tokens(t) for t in short_texts[:1000]))
ILLUSTRATIVE_USD_PER_MILLION_TOKENS = 1.00           # NOT a real price: look up the current price for your model
docs, avg_tokens = 2_000_000, 400
tokens = docs * avg_tokens
print(f"{docs:,} docs x {avg_tokens} tokens = {tokens:,} tokens -> "
      f"${tokens / 1e6 * ILLUSTRATIVE_USD_PER_MILLION_TOKENS:,.2f} at an ILLUSTRATIVE ${ILLUSTRATIVE_USD_PER_MILLION_TOKENS:.2f} per million")
print("requests needed, lower bound from the two limits:",
      f"{max(-(-docs // DOCUMENTED_LIMITS['max_items']), -(-tokens // DOCUMENTED_LIMITS['max_request_tokens'])):,}")
for dims in (3072, 1536, 256):
    print(f"storing {docs:,} vectors of {dims:>4} float32 dims = {docs * dims * 4 / 1e9:5.1f} GB   (usage is priced per input token)")

print("--- 9. vectors from different models are not comparable")
text = SENTENCE
similar = SENTENCE.replace("old cat", "young cat").replace("warm fire", "warm stove")
mine = EmbeddingsClient(server.url, "standin-3", dimensions=32)       # 32 dims on purpose, to match the legacy model
other = EmbeddingsClient(server.url, "standin-legacy")
a, b, c = mine.embed([text])[0], mine.embed([similar])[0], other.embed([text])[0]
print(f"same model, similar text: cosine {a @ b:.3f} | same text, different model: cosine {a @ c:.3f} (both 32-d unit vectors)")


def compare(tag_a, vec_a, tag_b, vec_b):
    if tag_a != tag_b:
        raise ValueError(f"refusing to compare {tag_a} with {tag_b}: re-embed everything with one model and setting")
    return float(vec_a @ vec_b)


try:
    compare(("standin-3", 32), a, ("standin-legacy", 32), c)
except ValueError as e:
    print(e)
server.close()
```

Output:

```
--- 5. batching under the two per-request limits
5000 short texts -> 3 requests with items [2048, 2048, 904]
100 texts of ~4000 tokens -> 2 requests, (items, tokens) = [(74, 296074), (26, 104026)]
every request within both limits: True
correct even when the server reorders `data`: True
--- 6. the cache, and what is in its key
second pass over 5000 texts: new requests = 0 | cache hits + 5000
after editing one text: new requests = 1 | tokens billed + 5
same text, other `dimensions` => other cache key: True
--- 7. retries: temporary 429 (with and without Retry-After), 503, then success
attempts: 4 | waits (s): [2.0, 0.76, 0.84] | first wait >= Retry-After: True
persistent failure -> gave up after 3 attempts and 1.2s of waiting
hard-limit 429 -> HTTP 429 spend_limit_reached: injected failure
blank input -> inputs must be non-empty strings (refused locally, no request sent)
a client that trusts the wrong limit -> HTTP 400 invalid_request_error: any array must be 2048 dimensions or less
--- 8. usage, and an ILLUSTRATIVE cost estimate
usage.total_tokens summed over responses: 6000 | my own count with the same toy tokenizer: 6000
2,000,000 docs x 400 tokens = 800,000,000 tokens -> $800.00 at an ILLUSTRATIVE $1.00 per million
requests needed, lower bound from the two limits: 2,667
storing 2,000,000 vectors of 3072 float32 dims =  24.6 GB   (usage is priced per input token)
storing 2,000,000 vectors of 1536 float32 dims =  12.3 GB   (usage is priced per input token)
storing 2,000,000 vectors of  256 float32 dims =   2.0 GB   (usage is priced per input token)
--- 9. vectors from different models are not comparable
same model, similar text: cosine 0.913 | same text, different model: cosine -0.089 (both 32-d unit vectors)
refusing to compare ('standin-3', 32) with ('standin-legacy', 32): re-embed everything with one model and setting
```

- **5:** 5,000 short texts take 3 requests (the item cap binds), 100 texts of about 4,000 tokens take 2 (the token cap binds: 74 of them fit under 300,000), and a server that reverses `data` does not confuse the client because it matches by `index`.
- **6:** a second pass makes no requests, editing one text costs one request and 5 tokens, and the cache key changes with `dimensions`.
- **7:** a `Retry-After` of 2 produced a wait of at least 2; the waits after that are jittered backoff. A persistent 503 ends in `RetriesExhausted` rather than a loop; a 429 that is not a temporary rate limit is not retried; a blank input never leaves the machine; a client configured with the wrong limit gets a 400, which is why limits belong in a config you keep current.
- **8:** the usage numbers agree here only because the client and the stand-in use the same toy tokenizer. With a real service they will differ; reconcile against `usage` and your usage dashboard, and treat your own count as an estimate. The cost lines use the illustrative price.
- **9:** the same text embedded by two models gives a cosine of -0.089, close to nothing, while a slightly different sentence from the same model gives 0.913. A comparison guard keyed on `(model, dimensions)` refuses the first.

### The same call with the official SDK (NOT EXECUTED)

> [!warning] **Not executed in this module's verification** (needs the `openai` package and an API key). Names follow the Vector embeddings guide, the spec and the SDK source fetched for this module; check the current SDK documentation before relying on them. No output is shown because none was produced.

```python
# NOT EXECUTED: needs `pip install openai` and a real key in the environment.
import os
import numpy as np
from openai import OpenAI

client = OpenAI()                                  # reads OPENAI_API_KEY from the environment
MODEL = os.environ["EMBEDDING_MODEL"]              # an embedding model from the docs; keep it in config

response = client.embeddings.create(model=MODEL, input=["first text", "second text"], dimensions=256)
ordered = sorted(response.data, key=lambda item: item.index)          # match by index
vectors = np.array([item.embedding for item in ordered], dtype=np.float32)
print(vectors.shape, response.usage.prompt_tokens, response.usage.total_tokens)

# If you shorten a vector yourself instead of passing `dimensions`, renormalise (the guide's own advice):
cut = vectors[:, :128]
cut = cut / np.linalg.norm(cut, axis=1, keepdims=True)
```

## Visual diagram

```
 YOUR TEXTS (N)
      │  validate (non-empty, each <= 8192 tokens)   ┌── cache: key = hash(model, dimensions, text)
      ▼                                              │      hit ──────────────────────────────┐
 de-duplicate ──► look up each text ─────────────────┘                                        │
      │ misses                                                                                │
      ▼                                                                                       │
 plan batches:  <= 2048 items  AND  <= 300,000 tokens per request                              │
      │                                                                                       │
      ▼                                                                                       ▼
 POST /v1/embeddings {model, input[], dimensions?, encoding_format?}         rows in input order
      │                                                                                       ▲
      ├─ 200 {object:"list", data:[{index, embedding}], model, usage}  ──► decode ──► cache ──┘
      ├─ 400 / non-temporary 429 ──► stop: fix the request, retrying cannot help
      └─ temporary 429 / 5xx ──► wait max(Retry-After, jittered backoff) ──► retry (capped attempts and time)

 shortening a vector yourself                      what must match to compare two vectors
 ┌──────────────────────────────────┐             ┌───────────────────────────────────────┐
 │ unit vector v, length d  (norm 1)│             │ same model  AND  same dimensions      │
 │ take first k numbers  (norm < 1) │             │ different model => different space,   │
 │ divide by its norm    (norm 1)   │             │ even when the lengths happen to match │
 └──────────────────────────────────┘             └───────────────────────────────────────┘
```

## Practice

### 1. Plan the batches by hand

You must embed 10,000 documents of 700 tokens each. Using the documented limits, how many requests are needed at minimum, and which limit decides it? Check with `plan_batches`.

<details>
<summary>Answer</summary>

By items alone: 10,000 / 2048 rounds up to 5. By tokens: 10,000 x 700 = 7,000,000 tokens, / 300,000 rounds up to 24, and one request holds at most 428 such documents (428 x 700 = 299,600; a 429th would make 300,300). The token limit binds, so the answer is 24. Running block 2's function:

```python
batches = plan_batches([700] * 10_000, DOCUMENTED_LIMITS["max_items"], DOCUMENTED_LIMITS["max_request_tokens"])
print(len(batches), "requests; items per request:", len(batches[0]), "...", len(batches[-1]))
print("by items alone:", -(-10_000 // DOCUMENTED_LIMITS["max_items"]), "requests; by tokens alone:",
      -(-10_000 * 700 // DOCUMENTED_LIMITS["max_request_tokens"]))
```

```
24 requests; items per request: 428 ... 156
by items alone: 5 requests; by tokens alone: 24
```

The last batch is smaller (156 documents) because 10,000 is not a multiple of 428.

</details>

### 2. The cache key that forgot `dimensions`

Subclass `EmbeddingsClient` so that `key` ignores `dimensions`, share one cache between a default-size client and a `dimensions=16` client, and describe what the second client gets.

<details>
<summary>Answer</summary>

```python
class ForgetfulClient(EmbeddingsClient):
    def key(self, text):                                   # BUG: the key forgets `dimensions`
        return hashlib.sha256(f"{self.model}\x1f{text}".encode()).hexdigest()


server = EmbeddingStandIn()
TEXT = "the quick brown fox jumps over the lazy dog while the old cat sleeps by the warm fire tonight"
same_cache = {}
wide = ForgetfulClient(server.url, "standin-3")
wide.cache = same_cache
print("first client (native dims):", wide.embed([TEXT]).shape)
narrow = ForgetfulClient(server.url, "standin-3", dimensions=16)
narrow.cache = same_cache                                  # e.g. a shared on-disk cache
print("second client asked for dimensions=16 and got:", narrow.embed([TEXT]).shape)
print("requests the second client made:", narrow.stats["requests"])
server.close()
```

```
first client (native dims): (1, 64)
second client asked for dimensions=16 and got: (1, 64)
requests the second client made: 0
```

The second client asked for 16-dimensional vectors, made no request at all, and received the cached 64-dimensional one: a wrong-shaped vector that no error reports. Mixed lengths would then break the index (or, worse, be silently padded). Everything that changes the vector belongs in the key: model, `dimensions` and the exact text (and anything you do to it first, such as truncation or prefixes).

</details>

### 3. A cost estimate with a cache

A support system holds 50,000 tickets of about 250 tokens each and re-embeds the whole set every month. About 5% of tickets change between runs. Using the module's ILLUSTRATIVE price of 1.00 per million tokens, what does a full monthly pass cost, and what does a cached pass cost?

<details>
<summary>Answer</summary>

Full pass: 50,000 x 250 = 12,500,000 tokens, or 12,500,000 / 1,000,000 x 1.00 = 12.50. With a content-hash cache only the changed 5% (2,500 tickets, 625,000 tokens) is sent: 0.625, about 0.63. The ratio, 20 to 1, is the lesson; the absolute numbers belong to the made-up price. In a real estimate, substitute the current price, add the first-time cost of the initial load, and remember that new tickets also count.

</details>

### 4. The upgrade that broke search

A team changes `MODEL` in its config to a newer embedding model, keeps the existing vector index and starts embedding new documents and queries with the new model. Search quality collapses. Why, and how do you do the migration safely?

<details>
<summary>Answer</summary>

New queries (and new documents) live in the new model's space while old documents live in the old one, so similarity between them is meaningless, and if the lengths differ the index may reject the vectors. The safe path: store `(model, dimensions)` with each vector or index; build a second index by re-embedding the whole corpus with the new model; evaluate old against new on a gold query set ([Track 08, Module 02](../../08-embeddings-and-vector-databases/02-embedding-models-compared/README.md) shows how); switch queries and reads together; keep the old index until you are sure.

</details>

### Checkpoint quiz

1. Which request fields are required, and what do `encoding_format` and `dimensions` do?
2. State the three size limits on an embeddings request as documented, and the date you read them.
3. Why match response items by `index`?
4. You cut a unit-length vector to its first 256 numbers yourself. What must you do next, and why?
5. Can you compare a vector from one embedding model with one from another?

<details>
<summary>Answers</summary>

1. `model` and `input`. `encoding_format` chooses `float` (default) or `base64` (a float32 byte string). `dimensions` shortens the returned vector, for `text-embedding-3` models and later.
2. 8192 tokens per input, 2048 items per array, 300,000 tokens summed over a request (spec, checked 2026-10-26; always re-read them).
3. The spec documents `index` as each embedding's position in the list; matching by it makes the client correct whatever the order of `data`.
4. Divide by its length (renormalise). A prefix of a unit vector has length below 1, so dot products would no longer equal cosine similarity.
5. No. Different models define different spaces (and a different `dimensions` is a different vector), so store model and dimensions with the vectors and re-embed everything when you change either.

</details>

> [!check]
> - I can write an embeddings request with the documented fields and read `data`, `index` and `usage`
> - I can state the documented limits with the date I read them, and keep them in configuration
> - I can explain what `dimensions` does and why a hand-shortened vector must be renormalised
> - I can estimate a job's token count, request count, cost (with a stated price) and storage
> - I can explain why vectors from different models or settings must never be compared

## Project

Build an **embeddings gateway** with no code given:

- a stand-in `/v1/embeddings` endpoint of your own (deterministic vectors, the documented request validation and error envelope, injectable 429 and 503 failures with and without `Retry-After`, and at least two "models" of different native length);
- a client library on top of it with config-driven limits (with a `checked_on` date), batching, bounded retries, a content-hash cache keyed on model, dimensions and text, and metrics (requests, retries, cache-hit rate, tokens);
- a cost report that takes the price from a config file and refuses to run if the price entry is older than a date you choose;
- a vector store wrapper that records `(model, dimensions)` and refuses mixed-model comparisons or inserts.

Acceptance tests: a 10,000-text run makes the minimum possible number of requests for your limits; a second run makes none; killing the stand-in with a 503 storm ends in a clear error within your time budget; changing only `dimensions` never returns a cached vector of the wrong length; every request respects every limit.

## Interview questions

> [!interview] You must embed 5 million documents with a hosted embeddings API. How do you do it reliably and economically?

<details>
<summary>What a strong answer covers</summary>

Read the current limits (items per request, tokens per request and per input) and keep them in config; chunk documents that are too long; batch under both limits; retry only temporary errors using `Retry-After` as a minimum with jitter and bounded attempts and time; make the job idempotent and resumable with a content-hash cache keyed on model, dimensions and text so a rerun costs nothing; track tokens against `usage`; estimate cost by formula before starting; consider whether a non-urgent bulk interface suits the job. Mentions that vectors must be tagged with their model and settings.

</details>

> [!interview] What does the `dimensions` parameter do, and when would you use it?

<details>
<summary>What a strong answer covers</summary>

It asks the service for a shortened vector from models that support it (the third-generation and later models, per the spec), trading some retrieval quality for storage, memory and search speed; the vendor reports good quality at much smaller sizes on a benchmark and you verify on your own data. Passing it at creation time is the suggested route; if you shorten manually you must renormalise. It does not change per-token pricing, and it is part of the identity of a vector, so a change means re-embedding. The strongest answers mention evaluating on your own queries.

</details>

> [!interview] After switching to a newer embedding model, your retrieval quality dropped. What do you check first?

<details>
<summary>What a strong answer covers</summary>

Whether old and new vectors are being mixed (different spaces, possibly different lengths), meaning the index was not fully rebuilt or queries and documents use different models or `dimensions`; whether normalisation or the metric changed; whether truncation or chunking changed; whether the new model needs a query or document prefix (a model-card fact). Then evaluate old and new on a fixed gold set rather than judging by anecdote. The fix is a complete re-embed into a new index with metadata guarding against mixing.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| 400 saying the input cannot be empty | An empty or whitespace-only text reached the API (often a blank row). Filter before batching |
| 400 about array size or token totals | Your batch exceeds 2048 items or 300,000 tokens. Use `plan_batches` and refresh the limits from the spec |
| 400 about one input's length | A text is over the per-input limit. Chunk it; do not rely on the service to cut it |
| `dimensions` is rejected | The model does not support it ("text-embedding-3 and later" per the spec), or the number is out of range |
| Dot products or distances look wrong after shortening | You cut a vector by hand and did not renormalise |
| `ValueError` or garbage when parsing an embedding | The reply was `base64` and you treated it as a list, or you decoded the bytes as float64 instead of float32 |
| Results are shifted by one position | You matched by list order instead of `index` |
| Search quality drops after a config change | Mixed models or dimensions in one index. Tag vectors, rebuild the index |
| Your token total disagrees with the bill | Your tokenizer is not the model's. Use the model's tokenizer for estimates and reconcile with `usage` |

## Further reading & sources

- [Vector embeddings | OpenAI API](https://developers.openai.com/api/docs/guides/embeddings) - the official guide: request examples, default lengths, the `dimensions` parameter and manual shortening, normalisation, token counting, and per-token billing.
- [Create embeddings | OpenAI API reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create) - the endpoint reference for the request fields and response shape used in this module.
- [openai/openai-openapi](https://github.com/openai/openai-openapi) - the machine-readable spec this module read for exact field names, the 8192 / 2048 / 300,000 limits and the `Retry-After` header description.
- [Rate limits | OpenAI API](https://developers.openai.com/api/docs/guides/rate-limits) - the source for the retry rules (`Retry-After` as a minimum, jitter, bounded attempts, no nested retry loops, no retrying quota errors).
- [openai-python: lib/_parsing/_embeddings.py](https://github.com/openai/openai-python/blob/main/src/openai/lib/_parsing/_embeddings.py) - the official SDK code that shows the base64 encoding is a float32 array and that the SDK requests it by default.
- [Matryoshka Representation Learning (Kusupati et al., 2022)](https://arxiv.org/abs/2205.13147) - the technique the guide links for shortenable embeddings; explained from first principles in Track 08.
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) - defines the `Retry-After` header and the 4xx and 5xx status classes the client switches on.
- [base64 - Python documentation](https://docs.python.org/3/library/base64.html) - the standard-library decoder used for `encoding_format: "base64"`.

## Next

[Module 09: Vision and Audio Inputs](../09-vision-and-audio-inputs/README.md)
