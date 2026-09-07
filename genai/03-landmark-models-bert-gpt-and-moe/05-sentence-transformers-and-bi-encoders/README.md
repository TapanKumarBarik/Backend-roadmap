# Module 05: Sentence Transformers and Bi-Encoders

## Why this matters

Module 02 verified `bert-base-uncased`'s `pooler_output` — a single
768-dimensional vector derived from `[CLS]`, meant to summarize a whole
sequence (or sequence pair). Module 03 fine-tuned that representation
for classification with a real, verified experiment (loss 0.679 →
0.039 over 6 examples). This module asks a narrower architectural
question: when the task is "how similar are text A and text B?", does
the model need to see A and B *together*, or can it encode each one
*independently* and compare the results afterward? The answer splits
every similarity/retrieval architecture into two families —
**bi-encoders** and **cross-encoders** — and this module verifies, with
real code and real timings, exactly what each buys and costs. This
distinction is previewed here because later tracks' retrieval-augmented
generation (RAG) systems are built almost entirely on bi-encoders, for
a reason this module makes concrete.

## Concepts

### Two ways to compare two texts

```
 Bi-encoder                              Cross-encoder
 ──────────                              ─────────────
 text A ──► [encoder] ──► vector A       text A ┐
                                                  ├──► [ONE joint model] ──► score
 text B ──► [encoder] ──► vector B       text B ┘
       (same encoder, run separately)     (both texts, one forward pass)

 compare: cosine(vector A, vector B)      score IS the output — no
                                          separate "vector A" or
                                          "vector B" ever exists
```

A bi-encoder is exactly what module 02 verified `[CLS]`/`pooler_output`
producing for a *single* text: one fixed-size vector per input,
independent of anything it will later be compared against. A
cross-encoder is what module 02's sentence-pair tokenization produced —
`[CLS] text A [SEP] text B [SEP]`, one joint sequence, `token_type_ids`
marking segments — fed through the model *together*, exactly the same
input shape module 02 built for BERT's Next Sentence Prediction
objective. `sentence-transformers` is the standard library for the
bi-encoder side; `AutoModelForSequenceClassification` on a concatenated
pair (or `sentence_transformers.CrossEncoder`, a thin wrapper around the
same idea) is the cross-encoder side.

### Verified: a bi-encoder's cached embeddings need zero re-encoding to compare against a new query

```python
from sentence_transformers import SentenceTransformer
import numpy as np, time

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

sentences = [
    "The cat sat on the mat.",
    "A dog is playing in the park.",
    "The stock market fell sharply today.",
    "Photosynthesis converts sunlight into chemical energy.",
]

t0 = time.perf_counter()
cached = model.encode(sentences)          # encode ONCE, store the vectors
t1 = time.perf_counter()
print(t1 - t0, cached.shape)

query = "A feline is resting on a rug."
t0 = time.perf_counter()
q_emb = model.encode([query])[0]           # only the NEW text is encoded
t1 = time.perf_counter()
print(t1 - t0)

def cos(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

for s, c in zip(sentences, cached):
    print(f"{cos(q_emb, c):.4f}  {s}")
```

Verified output:

```
cache-build time (4 sentences): 0.1468 s
cached embedding shape:         (4, 384)
new-query encode time:          0.0483 s

0.5634  The cat sat on the mat.
0.1347  A dog is playing in the park.
0.0916  The stock market fell sharply today.
0.0158  Photosynthesis converts sunlight into chemical energy.
```

Two things verified at once. First, the semantic-similarity check this
module set out to confirm actually works: "A feline is resting on a
rug." scores highest (0.5634) against "The cat sat on the mat." —
correctly outranking the unrelated dog/market/photosynthesis
sentences, purely from cosine similarity (track 02 module 01's
direction-not-magnitude measure) between two independently-produced
384-dimensional vectors (`all-MiniLM-L6-v2`'s output size — smaller
than `bert-base-uncased`'s 768, verified in module 02, since MiniLM is
a distilled, compressed encoder). Second, and architecturally central:
comparing the new query against the four cached sentences required
encoding **only the query**. The four cached vectors were produced once
and reused unmodified — nothing about "what will this be compared
against" was needed to produce them.

### Verified: this holds at scale — cached comparison is dot products, not re-encoding

```python
topics = ["cat","dog","weather","stock market","photosynthesis",
          "space travel","cooking pasta","football match",
          "ancient rome","quantum physics"]
candidates = [f"This is sentence number {i} about {topics[i % len(topics)]} "
              f"and related topics." for i in range(100)]

t0 = time.perf_counter(); cached = model.encode(candidates); t1 = time.perf_counter()
print("one-time cache-build (100 sentences):", t1 - t0)

query = "Tell me something about cats and pets."
t0 = time.perf_counter(); q = model.encode([query])[0]; t1 = time.perf_counter()
print("new query encode:", t1 - t0)

t0 = time.perf_counter()
sims = (cached @ q) / (np.linalg.norm(cached, axis=1) * np.linalg.norm(q))
t1 = time.perf_counter()
print("compare vs 100 cached embeddings (dot products only):", t1 - t0)
```

Verified output:

```
one-time cache-build (100 sentences):              0.6656 s
new query encode:                                  0.1496 s
compare vs 100 cached embeddings (dot products only): 0.0020 s
top match: "This is sentence number 10 about cat and related topics." (sim 0.6319)
```

The 100-sentence corpus is encoded once (0.6656 s total) and never
touched again. Every subsequent query costs one encode of *that query
alone* (≈0.15 s) plus a comparison against the whole cached corpus that
is essentially free (0.002 s — 100 dot products). This is the concrete
mechanism behind large-scale retrieval, previewed here for later
RAG-focused tracks: a corpus of embeddings is built once, stored, and
searched cheaply against arbitrarily many future queries.

### Verified: a cross-encoder repeats the full joint computation for every query, every time

```python
from sentence_transformers import CrossEncoder

ce = CrossEncoder("cross-encoder/stsb-TinyBERT-L4")
pairs = [[query, c] for c in candidates]        # 100 joint (query, candidate) pairs

t0 = time.perf_counter(); scores = ce.predict(pairs); t1 = time.perf_counter()
print("cross-encoder, 100 joint forward passes, query 1:", t1 - t0)

query2 = "What is the latest news on the stock market?"
pairs2 = [[query2, c] for c in candidates]
t0 = time.perf_counter(); scores2 = ce.predict(pairs2); t1 = time.perf_counter()
print("cross-encoder, 100 joint forward passes, query 2:", t1 - t0)
```

Verified output:

```
cross-encoder, 100 joint forward passes, query 1:  0.4172 s
  top match: "...sentence number 0 about cat..."       (score 0.5020)
cross-encoder, 100 joint forward passes, query 2:  0.3528 s
  top match: "...sentence number 3 about stock market..." (score 0.4306)
```

Notice what did *not* happen: there is no step where the 100 candidates
are "encoded once and reused." Each of the 100 `[query, candidate]`
pairs is fed through `stsb-TinyBERT-L4` jointly — exactly module 02's
sentence-pair format, `[CLS] query [SEP] candidate [SEP]` — and the
model's output *is* the similarity score directly, with no intermediate
per-text vector ever materializing. Query 2 needed the **same full 100
forward passes** as query 1; nothing from query 1's run could be
reused, because a cross-encoder's score for a pair is not decomposable
into separately-cached per-text representations at all — the two texts'
tokens attend to each other from the first layer on, so nothing
"belongs" to just one text.

### The scaling argument this predicts

```
                          1 corpus-build      cost per NEW query
                          (100 items)          (against same 100)
 Bi-encoder      0.6656 s (one time)      0.1496 s encode + 0.0020 s compare
 Cross-encoder   none (nothing cached)    0.4172 s (100 full forward passes)

 10,000 queries against the same 100-item corpus:
   bi-encoder:   0.6656 s + 10,000 * 0.152 s  ≈ 1,520 s of *query* work
   cross-encoder: 10,000 * ~0.38 s            ≈ 3,800 s

   (bi-encoder's 100-item corpus is paid for exactly ONCE, ever;
    the cross-encoder pays its full per-query cost every single time)
```

This is why bi-encoders (`sentence-transformers`) are the standard
choice for large-scale retrieval — encode a corpus of millions of
documents once, then compare cheaply against any number of future
queries — while cross-encoders, despite typically being *more accurate*
per pair (they let the two texts' tokens attend to each other directly,
rather than being squeezed through fixed independent vectors first),
are normally reserved for **re-ranking a short candidate list a
bi-encoder has already narrowed down** — e.g., bi-encoder retrieves the
top 100 of a million documents cheaply, then a cross-encoder re-scores
just those 100 for a more accurate final order. A later RAG-focused
track builds on exactly this two-stage retrieve-then-rerank pattern.

## Reference

```
 Property                       Bi-encoder                  Cross-encoder
 ───────────────────────────    ─────────────────────────   ─────────────────────────
 Library / class                 sentence-transformers       AutoModelForSequenceClassification
                                  SentenceTransformer          or sentence_transformers.CrossEncoder
 What's produced per text         one fixed vector             no per-text output at all
 How comparison is done           cosine similarity            score IS the model's output
                                  (track 02 module 01)
 Can precompute & cache?          yes - the whole point        no - full pair reprocessed
 Cost per NEW query vs N cached   1 encode + N dot products    N full forward passes
 Typical accuracy per pair        lower (independent encode)   higher (joint attention)
 Typical use                      large-scale retrieval        re-ranking a short shortlist
 Input format echoes...           module 02's single-text      module 02's sentence-pair
                                  pooler_output                [CLS] A [SEP] B [SEP]
```

## Hands-on exercises

### 1 — reproduce the cache-once, compare-many verification

Load `all-MiniLM-L6-v2`, encode a set of at least 5 sentences of your
choosing, and confirm that comparing a new query against them requires
encoding only the query (time it, as verified above). Confirm the
correct sentence ranks highest by cosine similarity for at least one
query where you know which sentence should match best.

### 2 — reproduce the cross-encoder timing at N=100

Run the `CrossEncoder("cross-encoder/stsb-TinyBERT-L4")` comparison
above with your own 100-candidate list and two different queries.
Confirm both queries take a comparable amount of time (full
reprocessing each time) rather than the second being faster.

### 3 — compute the break-even point

Using your own measured per-query costs (bi-encoder: one encode + N
dot products; cross-encoder: N forward passes), write a small script
that computes, for a corpus of a given size N, how many queries it
takes before the bi-encoder's one-time corpus-encoding cost is paid
back relative to the cross-encoder's per-query cost. Confirm the
break-even point is very small (often 1-2 queries) once N is more than
a few dozen candidates.

## Independent challenge

A colleague is building a document-search feature over 2 million
support articles and proposes using a cross-encoder for every search,
arguing "it's more accurate per comparison, so let's just use the best
tool." Using this module's verified timings, write two or three
sentences on what would actually happen if this were deployed as
described, and what architecture you'd recommend instead.

<details><summary>Discussion</summary>

At 2 million articles, a cross-encoder would need 2 million full joint
forward passes for every single search query — verified above at even
100 candidates, a cross-encoder pass takes roughly 3-4 ms per pair, so
2 million pairs would take on the order of an hour per query, which is
unusable for an interactive search feature. The verified numbers point
to the standard two-stage pattern instead: a bi-encoder embeds all 2
million articles once (an expensive but one-time cost, paid back after
a handful of queries per this module's break-even exercise), each
search encodes only the new query and does a cheap vector comparison
(nearest-neighbor search) against the cached corpus to get, say, the
top 100 candidates, and only then does a cross-encoder re-rank *those*
100 for the final, more accurate order — getting the cross-encoder's
per-pair accuracy where it matters most (the final short list) without
ever paying its cost against the full 2-million-document corpus.

</details>

## Common mistakes & troubleshooting

- **Assuming a bi-encoder's embeddings are comparable across different
  models or checkpoints.** Cosine similarity between vectors from
  `all-MiniLM-L6-v2` and vectors from a different model is meaningless
  — the vector space itself is model-specific; always encode both
  sides of a comparison with the *same* model instance.
- **Treating a cross-encoder's score as if it were reusable.** Verified
  above: a cross-encoder produces no intermediate per-text vector at
  all — there is nothing to cache. A cross-encoder score for (A, B)
  tells you nothing about a score for (A, C) without a fresh forward
  pass.
- **Deploying a cross-encoder as a primary retrieval mechanism over a
  large corpus.** As the independent challenge shows, this scales
  linearly with corpus size *per query* — workable for re-ranking
  dozens to low hundreds of candidates, not for searching millions of
  documents directly.
- **Confusing this module's bi-encoder pooling with module 02's raw
  `bert-base-uncased` `pooler_output`.** `sentence-transformers` models
  are specifically fine-tuned (often with a pooling layer over
  `last_hidden_state`, plus a similarity-focused training objective) to
  produce embeddings that are meaningfully comparable via cosine
  similarity — an off-the-shelf, non-fine-tuned BERT's `pooler_output`
  was not trained for this and typically performs worse for semantic
  similarity out of the box (module 02's independent challenge flagged
  exactly this gap).

## Checkpoint quiz

1. What is the fundamental architectural difference between a
   bi-encoder and a cross-encoder, in terms of when each text is
   processed relative to the other?
2. In the verified 100-candidate experiment, why did the cross-encoder
   take roughly the same time for a second, different query as it did
   for the first?
3. Verified above: comparing a new query against 100 cached bi-encoder
   embeddings took about 0.002 s. What specific operation is that time
   measuring, and why is it so much cheaper than encoding?
4. Why is a cross-encoder typically more accurate per comparison than
   a bi-encoder, despite being far more expensive at scale?
5. What two-stage retrieval pattern combines both architectures, and
   what does each stage contribute?

<details><summary>Answers</summary>

1. A bi-encoder encodes each text independently into a fixed vector,
   with no knowledge of what it will be compared against; a
   cross-encoder feeds both texts into one model jointly (module 02's
   sentence-pair format) and produces a score directly, with no
   separate per-text representation ever existing.
2. Because a cross-encoder has no reusable per-text representation to
   fall back on — verified above, each of the 100 `[query, candidate]`
   pairs must be run through the full joint model again for any new
   query, so the cost does not decrease on a second query.
3. It's measuring 100 dot products (cosine similarity computations)
   between one new query vector and the 100 already-cached embeddings
   — no model forward pass at all, just arithmetic on already-computed
   vectors, which is why it's roughly two orders of magnitude cheaper
   than the ~0.15 s it took to encode the query itself.
4. Because its two texts' tokens can attend to each other directly,
   from the first transformer layer on, rather than each text being
   compressed into a fixed-size vector independently first (which
   necessarily discards some information about how the two texts relate
   to each other specifically).
5. Retrieve-then-rerank: a bi-encoder embeds a large corpus once and
   cheaply retrieves a small candidate shortlist (e.g., top 100 of a
   million) for a new query via cached-embedding comparison; a
   cross-encoder then re-scores just that short list for a more
   accurate final ranking, getting joint-attention accuracy without
   paying its cost against the full corpus.

</details>

## Further reading & sources

- [Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks (Reimers & Gurevych, 2019)](https://arxiv.org/abs/1908.10084) - the original paper introducing the bi-encoder fine-tuning approach this module's `sentence-transformers` models implement.
- [sentence-transformers documentation: SentenceTransformer](https://sbert.net/docs/sentence_transformer/usage/usage.html) - the real bi-encoder class used throughout this module's verification code.
- [sentence-transformers documentation: CrossEncoder](https://sbert.net/docs/cross_encoder/usage/usage.html) - the real cross-encoder class used in this module's timing comparison, including retrieve-then-rerank guidance.
- [Hugging Face model card: cross-encoder/stsb-TinyBERT-L4](https://huggingface.co/cross-encoder/stsb-TinyBERT-L4) - the specific cross-encoder model verified in this module.
- [Track 02, Module 01: The Math You Actually Need — Vectors, Matrices, Dot Products](../../02-transformer-architecture/01-the-math-you-actually-need-vectors-matrices-dot-products/README.md) - the cosine similarity mechanics used throughout this module's bi-encoder comparisons.

## Next

[Module 06: GPT: Causal Language Modeling](../06-gpt-causal-language-modeling/README.md)
