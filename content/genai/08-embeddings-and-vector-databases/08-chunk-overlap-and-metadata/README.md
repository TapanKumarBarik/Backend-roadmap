# Module 08: Chunk Overlap and Metadata

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. [Module 05](../05-generating-embeddings-at-scale/README.md) made embedding a corpus a dependable, idempotent job. [Module 06](../06-chunking-fixed-size-strategies/README.md) (Chunking: Fixed-Size Strategies) and [Module 07](../07-chunking-semantic-and-structural/README.md) (Chunking: Semantic and Structural) decide where the cuts go. This module is about the two things that live around a cut: what you repeat on both sides of it (**overlap**) and what you remember about every piece you cut (**metadata**). It also uses the cosine similarity from [Module 03](../03-cosine-similarity-and-distance-metrics/README.md).

After this module you can:

- explain why an answer that straddles a chunk boundary is lost, and derive how many words of overlap guarantee it is not;
- compute the chunk count and index-size inflation for any chunk size and overlap, and check the formula against a real chunker and against published numbers;
- measure boundary-straddling recall with and without overlap, using a from-scratch TF-IDF and cosine retriever;
- remove the duplicate hits that overlap creates, and know the neighbour-expansion alternative;
- design a chunk record (ids, source, headings, offsets, timestamps, language, access tags, hashes, model) and say what each field is for;
- build stable chunk ids from content hashes so re-ingesting a document is idempotent, and measure whether a heading path prepended to the embedded text helps.

Why it matters: chunking choices are baked into the index, so changing overlap or metadata later means re-embedding and rewriting the whole collection (Module 05 priced that). Metadata costs a few bytes per chunk on day one and is painful to retrofit. Filtering by metadata *inside* the vector database is [Module 16](../16-metadata-filtering-and-hybrid-queries/README.md); this module decides what to store so that those filters have something to work on.

## Concept

> [!key] A chunk boundary is a cut through meaning: an answer whose sentences fall on both sides of it is retrievable from neither half, so overlap repeats the last O words of each chunk at the start of the next, at the price of an index S/(S-O) times larger. Metadata is what you store beside the text (stable ids, source, position, headings, permissions, hashes, model) so every chunk can be cited, filtered, de-duplicated, debugged and re-indexed without redoing work.

## Explanation

### Why a boundary loses an answer

A retriever returns chunks, not documents. Take two neighbouring sentences: "The Zorvan reactor was built in the north district. It was approved by the Halden committee in 1987." and a cut that falls between them. The question is "Which committee approved the Zorvan reactor?" The first chunk matches the question's words (Zorvan, reactor) and is retrieved, but it ends before the answer. The second chunk contains the answer, but it says "It": nothing in it matches "Zorvan", so it is never retrieved. The retriever found the right place and the reader still cannot answer. Block 4 measures this: at O=0 the top-1 chunk is exactly such a half-answer for every straddling question.

Overlap repeats text across the cut. With an overlap of 3 words, each chunk begins with the last 3 words of the one before, so words near a cut exist in two chunks. Now the precise version.

### How much overlap makes an answer safe

Let a chunk be S words and let each chunk start D = S - O words after the previous one (the *stride*). Windows start at 0, D, 2D, and so on. A piece of evidence L words long starting at word `a` is whole inside the window that starts at `t` exactly when `t <= a` and `t + S >= a + L`, that is, when `a + L - S <= t <= a`. That range holds S - L + 1 whole-number start positions. Window starts are D apart, so the range is guaranteed to contain one when S - L + 1 >= D, which simplifies to:

**L <= O + 1: any evidence up to O + 1 words long always lands whole in at least one chunk.**

For longer evidence, with a random alignment it lands whole with probability (S - L + 1) / D, so it straddles with probability 1 - (S - L + 1) / D. With no overlap that is (L - 1) / S: evidence 26 words long in 100-word chunks straddles a cut one time in four.

> [!example] Chunks of S=100 words with O=25 (stride 75): evidence up to 26 words long is always whole in some chunk. A 40-word passage is whole with probability (100 - 40 + 1) / 75 = 81%, so about one in five such passages is cut. The price is 100 / 75 = 1.33 times as many chunks.

> [!model] Slide a picture frame S words wide along the text in jumps of D words. A fact L words wide is photographed whole whenever the frame covers it. Jumps as big as the frame (O=0) can step right over a fact; jumps of S - O are small enough that every fact up to O + 1 words wide is caught by some frame.

### What overlap costs

A document of W words (W > S) gets `n = ceil((W - S) / (S - O)) + 1` chunks. Every cut after the first repeats exactly O words, so the stored words are `W + (n - 1) * O`. For a long document n - 1 is about W / (S - O), so:

**index inflation = stored words / W -> S / (S - O) = 1 / (1 - O/S)**

Everything that scales with the number of chunks scales with this factor: vectors to store and search, tokens to embed (and pay for; [Module 05](../05-generating-embeddings-at-scale/README.md)), index build time. Overlap of 10% of the chunk size costs 1.11x, 25% costs 1.33x, 50% costs 2x. For scale (plain arithmetic, vectors only, before any index structure): 1,000,000 chunks of 768-dimension float32 vectors take 3.07 GB, and at 25% overlap the same corpus is 1,333,333 chunks and 4.10 GB. Block 1 checks both formulas against the real chunker for every document length up to 699 words, prints the table, and compares the ratio with chunk counts that Microsoft publishes for one sample document: the formula lands within 1% of all three (checked Oct 2026).

Defaults in the wild differ by ten times, which is why overlap is something to measure, not a constant to copy (all checked Oct 2026; vendors change these):

- Azure AI Search suggests starting at 512 tokens with 25% overlap (128 tokens), and its Text Split skill requires the overlap to be less than half the page length.
- OpenAI's vector store `auto` chunking strategy currently uses 800 tokens with 400 tokens of overlap (50%), and a custom strategy may not overlap by more than half the chunk size.
- LangChain's base `TextSplitter` defaults to 4000 characters with 200 characters of overlap (5%).

> [!pitfall] Overlap is not free recall. It buys exactly one thing, whole evidence, and block 4 shows the purchase stops once O reaches the length of the longest piece of evidence you care about, while the cost keeps climbing.

### Diminishing returns

Block 4 sweeps O on a constructed corpus whose evidence is 18 to 34 words long (so `O + 1 >= 34` should be enough). The straddling fraction falls roughly 0.8 percentage points per added overlap word and reaches zero at O=30, but going from O=20 to O=30 adds 0.164 to the inflation factor for 5.7 points of recall, and going from O=30 to O=50 adds 0.521 for nothing. Choose O from the size of the unit you need to keep whole (a sentence pair, a table row, a code block header plus its first lines), not from a percentage. Other ways to cut straddling:

- **Bigger chunks.** The straddle rate is about (L - 1) / S, so doubling S roughly halves it (rerun block 4's `sweep(200, ...)` to see), at the cost of blurrier chunk vectors.
- **Cut at natural boundaries** so evidence is rarely split in the first place: sentences, paragraphs, headings ([Module 07](../07-chunking-semantic-and-structural/README.md)).
- **Neighbour expansion** at query time (described under duplicates, next).

> [!pitfall] Block 4 is a toy, and it is built so one effect shows cleanly. Documents are pseudo-words with planted facts; the retriever matches exact tokens; every question names a unique rare word. So "recall given the evidence fits in a chunk" is always 1.000 here. Real retrievers also miss for reasons overlap cannot touch (paraphrase, ambiguous questions, weak embeddings). Treat the shape of the curve, the formulas and the method as the lesson, not the numbers. Sizes are in words; real chunkers count tokens or characters.

One more detail from the sweep: the formula column (0.250 at O=0) sits slightly above the measured one (0.242). Documents here are about 945 words, so a 100-word chunker makes 9 cuts per document, not 945/100, because the last piece is shorter than S: 9 cuts x 25 straddling words / 945 = 0.239, which matches. The formula is the long-document limit.

### Duplicates from overlap, and how to merge them

With O > 0 the best chunk's neighbours also contain most of the same words, so they score nearly as high. The top-k fills with near-copies, k slots carry fewer distinct passages, and the model reads the same sentences twice. Fix it in the retrieval layer: merge hits that belong to the same document and whose ranges overlap or touch into one passage, keep the best rank, and if you need k passages retrieve more than k first, merge, then cut to k. Block 5 does this with `merge_hits`, which only works because every hit carries a document id and a position, the metadata of the next section.

The same metadata enables an alternative that costs no index space (not measured in this module): cut with O=0, store each chunk's position, and when a chunk is retrieved also fetch its previous and next chunk before building the prompt. You then pay in prompt tokens on every query instead of in storage and embedding cost once per chunk, so which is cheaper depends on how often you query. LlamaIndex ships a variant: its `SentenceWindowNodeParser` keeps the sentences around each node in the node's metadata, and a postprocessor can swap them in before the LLM sees the node.

### Metadata: what to store with every chunk, and why

| Field | What it is for |
| --- | --- |
| `chunk_id` | primary key; upsert and delete target; citation anchor (see stable ids below) |
| `doc_id` | groups the chunks of one document: replace or delete them together, merge adjacent hits, fetch neighbours |
| `source_uri` | link a human can open; the "where did this come from" in a citation |
| `heading_path` | section path such as `Guide > Setup > Resetting`: contextual header, readable citation, filter by section |
| `chunk_index`, `start_char`, `end_char` | order inside the document, neighbour fetch, merging, highlighting the passage in the source (LangChain splitters expose this as `add_start_index`) |
| `page` | "p. 12" in citations for paged sources such as PDFs |
| `doc_updated_at`, `ingested_at` | freshness filters, "newest version wins", incremental sync ("what changed since last run"), debugging which version answered |
| `language` | choose the analyzer or embedding model, filter to the user's language |
| `acl` | access-control tags: who may see this chunk (permission-aware retrieval) |
| `content_hash` | the identity of the text: de-duplicate across documents, detect edits |
| `embed_model` (name and version), `embed_key` | spot vectors from different models in one collection, know when a vector is stale (model changed, header changed) |
| `text` | exactly what you show the user and send to the LLM, without any embedding header |

Hosted retrieval products expose the same ideas. OpenAI's file search returns `file_citation` annotations carrying a `file_id` and `filename`, and lets you filter results by file metadata. The point is not the vendor: citations, filters and re-indexing all need these fields to exist at ingest time.

### Stable chunk ids and idempotent re-ingestion

Three hashes answer three different questions (diagram below):

- `content_hash = sha256(normalised text)`: *is this the same words?*
- `chunk_id = sha256(doc_id, content_hash, occurrence)`, first 128 bits: *which record is this?*
- `embed_key = sha256(model, header + text)`: *is the stored vector still valid?* This is Module 05's cache key, with the contextual header added because the header changes the vector.

A random UUID or auto-increment id makes re-ingestion create duplicates. A position-based id (`doc:chunk_index`) changes for every chunk after an insertion. An id from content is the same every time you ingest the same content, so writing it again is a no-op. Scoping by `doc_id` keeps two documents that share boilerplate as separate records (they may have different URIs and permissions) while `content_hash` still lets you embed the text once. `occurrence` separates a paragraph that appears twice in one document. Truncating to 128 bits is deliberate: at 64 bits the birthday-collision probability is about n^2 / 2^65, roughly 3% at a billion chunks.

Re-ingesting a document is then a set difference between the ids you just computed and the ids already stored for that `doc_id`: ids only in the new set are **added**, ids only in the old set are **removed**, ids in both are **kept**, and a kept chunk is re-embedded only if its `embed_key` changed. Offsets, headings and permissions of kept chunks are refreshed in place. Block 7 walks through seven situations.

> [!pitfall] Content-addressed ids only keep churn low if the *chunks* are stable. With fixed-size chunking an insertion near the top shifts every later boundary, so every later chunk has new text and a new id (Exercise 2). Structure-aware chunks ([Module 07](../07-chunking-semantic-and-structural/README.md)) change only where the document changed. Also, `normalise` is part of the id: change how you clean text and every id changes.

### Contextual chunk headers

A chunk that says "Hold the reset button for 10 seconds" has lost *which product*. The document title and headings still know. Prepend them to the text you embed (and to the text you index for keyword search) while keeping the raw text for display:

- Microsoft's chunking guide lists this under custom combinations: append the document title to chunks from the middle of a document to prevent context loss.
- Anthropic's Contextual Retrieval does a heavier version: Claude writes a short context (usually 50-100 tokens) situating each chunk in its document, and that is prepended before embedding and keyword indexing. Their reported result, averaged over their datasets with one embedding model and top-20 retrieval, was 35% fewer retrieval failures from the contextual embeddings alone, 49% when combined with contextual BM25, and 67% with a reranker added. Those numbers belong to their data and setup; they are not what this module's toy will show.
- Late chunking (Günther et al.) takes a different route: run a long-context embedding model over the whole document, then pool the token vectors per chunk, so each chunk vector already "saw" its neighbours.

Block 8 tests the cheapest version, a heading path, on a corpus where 30 product manuals repeat the same boilerplate and differ in one number. Four arms: no header, section title only, path without the document title, full path. Only the full path helps, because only it contains what the chunk lost (the product name in the H1). Costs: the header adds about 50% more words per chunk here; it counts toward the embedding model's input limit and your chunk-size budget; and `embed_key` includes it, so renaming a heading re-embeds the chunk (block 7, step 5).

> [!pitfall] Block 8 is a best case by construction: sibling chunks differ *only* in the context the header supplies, so the full path reaches 1.000. On a real corpus the gain depends on how much context chunks actually lose, and a header could also hurt if it is long relative to the chunk and dominates the vector (a risk worth testing on your own queries; this module did not measure it).

### Permissions

`acl` tags are stored at ingest and compared with the asking user's groups at query time. Where the comparison happens matters. Filtering *after* ranking is safe but wasteful: the top-k was spent on chunks the user may not see. Filtering *before* ranking returns k allowed results. Block 9 measures both on the toy index. How a vector database applies filters inside an approximate index efficiently is the subject of [Module 16](../16-metadata-filtering-and-hybrid-queries/README.md). Two rules hold regardless: enforce access in the retrieval layer using the identity of the person asking (never ask the model to hide things it was given), and treat the `acl` copy as a cache of the source system's permissions that must be re-synced when they change.

## Code

Python 3.13 with numpy only. The blocks are cumulative: copy them in order into one file, `overlap_metadata.py`, and run it. Every random draw is seeded; the output below is identical across runs and across `PYTHONHASHSEED` values (checked). It takes roughly 10 seconds on a laptop. Blocks 2 to 5 use *words* as the unit and a constructed corpus; blocks 6 to 9 use markdown documents and a small chunk store.

### 1. A chunker with overlap, and the size formula checked against it

`window_ranges` is a deliberately small word-window chunker (real chunkers are [Module 06](../06-chunking-fixed-size-strategies/README.md)'s subject). The asserts check the closed forms for every document length from 1 to 699 words.

```python
import hashlib, json, math, re
from dataclasses import dataclass, asdict
from textwrap import dedent
import numpy as np

def window_ranges(n_words, size, overlap):
    """Word-index windows [start, end) of `size` words; each window starts `size - overlap` after the last."""
    if not 0 <= overlap < size:
        raise ValueError("need 0 <= overlap < size")
    stride, start, ranges = size - overlap, 0, []
    while True:
        end = min(start + size, n_words)
        ranges.append((start, end))
        if end == n_words:                      # this window reaches the end of the document: stop
            break
        start += stride
    return ranges

def n_chunks(W, S, O):
    """Closed form: how many windows a W-word document gets."""
    return 1 if W <= S else math.ceil((W - S) / (S - O)) + 1

# Check the formula, and "stored words = W + (n - 1) * O", against the real chunker.
for S, O in [(10, 0), (10, 2), (100, 25), (200, 50), (64, 31)]:
    for W in range(1, 700):
        r = window_ranges(W, S, O)
        assert len(r) == n_chunks(W, S, O)
        assert sum(e - s for s, e in r) == W + (len(r) - 1) * O
print("formula matches the chunker: 5 (S, O) settings x 699 document lengths")

S, W = 200, 100_000
print(f"\nS = {S} words per chunk, one document of W = {W:,} words")
print(f"{'O':>4} {'O/S':>5} {'chunks':>7} {'stored words':>13} {'inflation':>10} {'S/(S-O)':>8}")
for O in (0, 20, 40, 50, 100):
    n = n_chunks(W, S, O)
    stored = W + (n - 1) * O
    print(f"{O:>4} {O / S:>5.0%} {n:>7,} {stored:>13,} {stored / W:>10.4f} {S / (S - O):>8.4f}")

# Real chunk counts published on Microsoft's "Chunk Documents - Azure AI Search" page (one sample PDF,
# sentence-aware splitting, sizes in characters). Same (size, overlap) pairs, compared with S/(S-O).
azure = [(1000, 200, 172, 216), (2000, 500, 85, 113), (5000, 500, 34, 38)]
print("\nMicrosoft's published counts for one sample document (checked Oct 2026):")
print(f"{'size':>5} {'overlap':>7} {'n (O=0)':>8} {'n (O)':>6} {'measured ratio':>15} {'S/(S-O)':>8}")
for size, ov, n0, n1 in azure:
    print(f"{size:>5} {ov:>7} {n0:>8} {n1:>6} {n1 / n0:>15.3f} {size / (size - ov):>8.3f}")
```

Output:

```
formula matches the chunker: 5 (S, O) settings x 699 document lengths

S = 200 words per chunk, one document of W = 100,000 words
   O   O/S  chunks  stored words  inflation  S/(S-O)
   0    0%     500       100,000     1.0000   1.0000
  20   10%     556       111,100     1.1110   1.1111
  40   20%     625       124,960     1.2496   1.2500
  50   25%     667       133,300     1.3330   1.3333
 100   50%     999       199,800     1.9980   2.0000

Microsoft's published counts for one sample document (checked Oct 2026):
 size overlap  n (O=0)  n (O)  measured ratio  S/(S-O)
 1000     200      172    216           1.256    1.250
 2000     500       85    113           1.329    1.333
 5000     500       34     38           1.118    1.111
```

The inflation column tracks S/(S-O) (it is slightly lower for short documents because the last chunk is short). The three ratios computed from Microsoft's published chunk counts (1.256, 1.329, 1.118) sit within 1% of S/(S-O) (1.250, 1.333, 1.111). Their chunker is sentence-aware and works in characters, so agreement this close says the formula describes what real splitters do.

### 2. A corpus with known answer positions

Each of 100 documents has 8 planted facts. A fact is two sentences: the first names a thing ("the zortalka library was built in..."), the second says who approved it using a pronoun ("it was approved by the linden committee in 1935"). The question is "which committee approved the zortalka library". We know each fact's exact word range, so we can ask: does any chunk contain all of it?

```python
@dataclass
class Fact:
    doc: int      # which document
    start: int    # word index where the evidence begins (inclusive)
    end: int      # word index where it ends (exclusive)
    query: str    # the question whose answer is this fact

FILLER_SYL = ["be", "ro", "tu", "mi", "sa", "ne", "po", "li", "da", "vu", "ge", "ho"]
NAME_SYL = ["ka", "lo", "mir", "ven", "tal", "dre", "sho", "bru", "nel", "pax", "zor", "fim"]
THINGS = ["reactor", "bridge", "tunnel", "library", "harbor", "foundry", "station", "canal"]
AUTHORITIES = ["halden", "orsk", "pelham", "tarn", "vossen", "marek", "linden", "garrow"]

def build_corpus(seed, n_docs=100, facts_per_doc=8, n_filler_words=300):
    """Documents of pseudo-words with fact sentences planted at known positions.
    Each fact is TWO sentences (18 to 34 words together): sentence A names the thing, sentence B names who
    approved it, using a pronoun. The question needs both halves in one chunk."""
    rng = np.random.default_rng(seed)
    pool = sorted({"".join(rng.choice(FILLER_SYL, size=rng.integers(2, 4))) for _ in range(n_filler_words * 3)})
    filler_vocab = [str(w) for w in rng.permutation(pool)[:n_filler_words]]
    zipf = 1 / np.arange(1, len(filler_vocab) + 1)
    zipf /= zipf.sum()
    names = rng.choice(len(NAME_SYL) ** 3, size=n_docs * facts_per_doc, replace=False)   # one unique rare name per fact
    def filler(n):
        return list(rng.choice(filler_vocab, size=n, p=zipf))
    docs, facts, k = [], [], 0
    for d in range(n_docs):
        words = []
        for _ in range(facts_per_doc):
            words += filler(rng.integers(20, 140))
            i = int(names[k]); k += 1
            ent = NAME_SYL[i % 12] + NAME_SYL[(i // 12) % 12] + NAME_SYL[i // 144]
            thing, auth = rng.choice(THINGS), rng.choice(AUTHORITIES)
            a = ["the", ent, thing, "was", "built", "in", "the", filler(1)[0], "district"] + filler(rng.integers(0, 9))
            b = ["it", "was", "approved", "by", "the", auth, "committee", "in", str(rng.integers(1900, 2000))] + filler(rng.integers(0, 9))
            start = len(words)
            words += a + b
            facts.append(Fact(d, start, len(words), f"which committee approved the {ent} {thing}"))
        words += filler(rng.integers(20, 140))
        docs.append([str(w) for w in words])
    return docs, facts

docs, facts = build_corpus(seed=0)
lengths = [f.end - f.start for f in facts]
print(f"{len(docs)} documents, {sum(map(len, docs)):,} words, {len(facts)} planted facts (= {len(facts)} questions)")
print(f"evidence length: min {min(lengths)}, mean {np.mean(lengths):.1f}, max {max(lengths)} words")
f = facts[3]
print("\nquestion :", f.query)
print("evidence :", " ".join(docs[f.doc][f.start:f.end]))
```

Output:

```
100 documents, 94,519 words, 800 planted facts (= 800 questions)
evidence length: min 18, mean 26.1, max 34 words

question : which committee approved the zortalka library
evidence : the zortalka library was built in the nemiho district tube begero line gerotu nemine mimiro it was approved by the linden committee in 1935 ligeli libebe
```

### 3. A TF-IDF and cosine retriever in numpy

Term frequency (sublinear: 1 + log tf) times smoothed inverse document frequency, each row scaled to length 1, so a dot product is the cosine similarity of [Module 03](../03-cosine-similarity-and-distance-metrics/README.md). The `allowed` argument will be used in block 9.

```python
TOKEN = re.compile(r"[a-z0-9]+")

class TfidfIndex:
    """From-scratch TF-IDF + cosine retriever. Rows are L2-normalised, so a dot product IS cosine similarity."""
    def __init__(self, texts):
        tokens = [TOKEN.findall(t.lower()) for t in texts]
        self.vocab = {w: i for i, w in enumerate(sorted({w for t in tokens for w in t}))}
        tf = np.zeros((len(texts), len(self.vocab)), dtype=np.float32)
        for row, toks in enumerate(tokens):
            for w in toks:
                tf[row, self.vocab[w]] += 1
        df = (tf > 0).sum(axis=0)
        self.idf = (np.log((1 + len(texts)) / (1 + df)) + 1).astype(np.float32)   # smoothed idf
        self.matrix = self._weigh(tf)

    def _weigh(self, tf):
        w = np.where(tf > 0, 1 + np.log(np.maximum(tf, 1)), 0) * self.idf           # sublinear tf x idf
        return w / np.maximum(np.linalg.norm(w, axis=1, keepdims=True), 1e-9)

    def scores(self, queries):
        q = np.zeros((len(queries), len(self.vocab)), dtype=np.float32)
        for row, text in enumerate(queries):
            for w in TOKEN.findall(text.lower()):
                if w in self.vocab:                                                  # words the corpus never saw are ignored
                    q[row, self.vocab[w]] += 1
        return self._weigh(q) @ self.matrix.T                                        # cosine similarity, queries x chunks

    def search(self, queries, k, allowed=None):
        s = self.scores(queries)
        if allowed is not None:
            s = np.where(allowed, s, -np.inf)                                        # drop forbidden chunks BEFORE ranking
        return np.argsort(-s, axis=1, kind="stable")[:, :k]                         # stable: ties break by row order
```

Nothing is printed; blocks 4, 5, 8 and 9 use it.

### 4. Boundary-straddling recall with and without overlap

For each overlap value: chunk the corpus, index it, ask all 800 questions, and count a question as answered only if some top-5 chunk contains the **whole** evidence. `fits` is the retriever-free ceiling: does any chunk anywhere contain it? The corpus is regenerated for 5 seeds and averaged.

```python
def chunk_corpus(docs, S, O, seed):
    chunks = [(d, s, e) for d, w in enumerate(docs) for s, e in window_ranges(len(w), S, O)]
    return [chunks[i] for i in np.random.default_rng(seed).permutation(len(chunks))]   # shuffle: ties must not favour document order

def holds(chunk, fact):
    """True if the chunk contains the WHOLE evidence span, the only thing that lets a reader answer."""
    return chunk[0] == fact.doc and chunk[1] <= fact.start and fact.end <= chunk[2]

def touches(chunk, fact):
    return chunk[0] == fact.doc and chunk[1] < fact.end and fact.start < chunk[2]

def evaluate(docs, facts, S, O, k=5, seed=0):
    chunks = chunk_corpus(docs, S, O, seed)
    index = TfidfIndex([" ".join(docs[d][s:e]) for d, s, e in chunks])
    top = index.search([f.query for f in facts], k)
    by_doc = {}
    for c in chunks:
        by_doc.setdefault(c[0], []).append(c)
    fits = np.array([any(holds(c, f) for c in by_doc[f.doc]) for f in facts])         # does ANY chunk hold the evidence? (no retriever)
    found = np.array([any(holds(chunks[j], f) for j in top[i]) for i, f in enumerate(facts)])
    half = np.array([touches(chunks[top[i, 0]], f) and not holds(chunks[top[i, 0]], f) for i, f in enumerate(facts)])
    return fits, found, half, sum(e - s for _, s, e in chunks) / sum(map(len, docs))

def sweep(S, overlaps, K=5, seeds=range(5)):
    rows = {O: [] for O in overlaps}
    for seed in seeds:
        docs, facts = build_corpus(seed)
        L = np.array([f.end - f.start for f in facts])
        for O in overlaps:
            fits, found, half, infl = evaluate(docs, facts, S, O, K, seed)
            formula = np.minimum(1, (S - L + 1) / (S - O)).mean()           # P(an L-word span lies inside some window)
            rows[O].append((infl, 1 - formula, 1 - fits.mean(), found.mean(), found[fits].mean(), (half & ~fits).sum() / max((~fits).sum(), 1)))
    print(f"S = {S} words, top-{K}, 800 questions per corpus, mean over {len(seeds)} corpora (seeds {seeds[0]}-{seeds[-1]})")
    print(f"{'O':>3} {'inflation':>9} {'straddle (formula)':>19} {'straddle (measured)':>20} {'recall@5':>9} {'recall@5 | fits':>16}")
    for O in overlaps:
        m = np.mean(rows[O], axis=0)
        print(f"{O:>3} {m[0]:>9.3f} {m[1]:>19.3f} {m[2]:>20.3f} {m[3]:>9.3f} {m[4]:>16.3f}")
    return rows

rows = sweep(100, [0, 10, 20, 30, 34, 50])
print(f"\nAt O=0, for {np.mean(rows[0], axis=0)[5]:.0%} of the questions whose evidence straddles a boundary, the top-1 chunk "
      "touches the evidence but holds only part of it: the right place was found and the answer was still lost.")
```

Output:

```
S = 100 words, top-5, 800 questions per corpus, mean over 5 corpora (seeds 0-4)
  O inflation  straddle (formula)  straddle (measured)  recall@5  recall@5 | fits
  0     1.000               0.250                0.242     0.758            1.000
 10     1.105               0.166                0.154     0.847            1.000
 20     1.234               0.064                0.057     0.943            1.000
 30     1.398               0.002                0.000     1.000            1.000
 34     1.477               0.000                0.000     1.000            1.000
 50     1.919               0.000                0.000     1.000            1.000

At O=0, for 100% of the questions whose evidence straddles a boundary, the top-1 chunk touches the evidence but holds only part of it: the right place was found and the answer was still lost.
```

Reading it: with no overlap, 24% of the questions have evidence split across two chunks, and recall@5 is exactly 0.758 because the retriever never recovers them. Each added word of overlap rescues about 0.8 points until O=30, where straddling is gone. The formula column (from the derivation) tracks the measured one, and "recall | fits" is 1.000 throughout, which is the toy-retriever caveat from the Explanation. With 4,000 questions the sampling error on a rate near 0.24 is about 0.007.

### 5. Duplicate hits and merging

```python
def merge_hits(hits):
    """hits: [(doc, start, end)] in rank order. Merge overlapping or touching ranges of the same document
    into one passage; return passages best-ranked first."""
    tagged = sorted((d, s, e, rank) for rank, (d, s, e) in enumerate(hits))
    merged = []
    for d, s, e, rank in tagged:
        if merged and merged[-1][0] == d and s <= merged[-1][2]:       # overlaps or touches the previous passage
            merged[-1][2] = max(merged[-1][2], e)
            merged[-1][3] = min(merged[-1][3], rank)
        else:
            merged.append([d, s, e, rank])
    return [tuple(m[:3]) for m in sorted(merged, key=lambda m: m[3])]

docs, facts = build_corpus(0)
queries = [f.query for f in facts]
S, O = 100, 50
chunks = chunk_corpus(docs, S, O, 0)
index = TfidfIndex([" ".join(docs[d][s:e]) for d, s, e in chunks])
top5, top15 = index.search(queries, 5), index.search(queries, 15)

q = next(i for i, row in enumerate(top5) if len(merge_hits([chunks[j] for j in row])) < 5)    # first question with an overlapping pair
print(f"S={S}, O={O}. Question {q} -> top-5 chunks as (doc, start, end):")
print("  raw   :", [chunks[j] for j in top5[q]])
print("  merged:", merge_hits([chunks[j] for j in top5[q]]))

raw_passages = [merge_hits([chunks[j] for j in row]) for row in top5]             # merge the 5 you retrieved
filled = [merge_hits([chunks[j] for j in row])[:5] for row in top15]               # over-fetch 15, merge, keep 5 passages
print(f"\nover {len(facts)} questions (O={O}, top-5):")
print(f"  raw top-5 chunks    : 5.0 passages, {5 * S} words sent to the model")
print(f"  merged top-5 chunks : {np.mean([len(p) for p in raw_passages]):.2f} distinct passages, "
      f"{np.mean([sum(e - s for _, s, e in p) for p in raw_passages]):.0f} words sent")
print(f"  over-fetch 15, merge, keep 5 passages: {np.mean([len(p) for p in filled]):.2f} passages, "
      f"{np.mean([sum(e - s for _, s, e in p) for p in filled]):.0f} words sent")
```

Output:

```
S=100, O=50. Question 1 -> top-5 chunks as (doc, start, end):
  raw   : [(0, 100, 200), (0, 50, 150), (70, 600, 700), (26, 400, 500), (19, 800, 861)]
  merged: [(0, 50, 200), (70, 600, 700), (26, 400, 500), (19, 800, 861)]

over 800 questions (O=50, top-5):
  raw top-5 chunks    : 5.0 passages, 500 words sent to the model
  merged top-5 chunks : 3.90 distinct passages, 435 words sent
  over-fetch 15, merge, keep 5 passages: 5.00 passages, 563 words sent
```

At 50% overlap the five slots of a top-5 carry only 3.9 distinct passages, and over-fetching 15 chunks before merging fills all five slots with distinct ones. Merging also trims the prompt: 435 words instead of 500 for the same five hits.

### 6. A chunk record, three hashes, and a heading-path parser

`ChunkRecord` is the schema. `sections` turns markdown into (heading path, body, character offsets); it is a minimal stand-in for [Module 07](../07-chunking-semantic-and-structural/README.md)'s structural chunking (one chunk per heading with body text, no splitting of long sections).

```python
def sha256_hex(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

@dataclass(frozen=True)
class ChunkRecord:
    chunk_id: str                 # stable: first 128 bits of sha256(doc_id, content_hash, occurrence)
    doc_id: str                   # stable id of the source document (NOT its file name)
    source_uri: str               # where a human can open the original
    chunk_index: int              # position of the chunk within the document
    heading_path: tuple           # ("Router X200 Guide", "Setup", "Resetting")
    start_char: int               # character offsets of `text` in the source (end exclusive)
    end_char: int
    page: int | None              # for paged sources (PDF); None otherwise
    doc_updated_at: str           # when the SOURCE last changed (ISO 8601, UTC)
    ingested_at: str              # when we wrote this record
    language: str                 # BCP 47 tag, e.g. "en"
    acl: tuple                    # access-control tags: who may see this chunk
    content_hash: str             # sha256 of the normalised text
    embed_model: str              # name@version of the model that made the vector
    embed_key: str                # sha256(embed_model + exactly the text that was embedded)
    text: str                     # exactly what is shown to the user / sent to the LLM

def normalise(text):
    return " ".join(text.split())                          # collapse whitespace; keep case and punctuation

def header_for(path):
    return " > ".join(path)

def embed_input(heading_path, text, with_header=True):
    """The string that is actually embedded: a contextual header, then the chunk text."""
    return f"{header_for(heading_path)}\n{text}" if with_header and heading_path else text

HEADING = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*$", re.M)

def sections(md):
    """Yield (heading_path, body, start_char, end_char) for every heading that has body text under it."""
    marks = list(HEADING.finditer(md))
    path = []
    for i, m in enumerate(marks):
        path = path[:len(m.group(1)) - 1] + [m.group(2)]               # "##" keeps one ancestor, "###" keeps two...
        body_end = marks[i + 1].start() if i + 1 < len(marks) else len(md)
        body = md[m.end():body_end].strip()
        if body:
            start = md.index(body, m.end())
            yield tuple(path), body, start, start + len(body)

def make_records(doc_id, source_uri, md, *, acl=("public",), updated_at="2026-10-01T00:00:00Z",
                 now="2026-10-26T00:00:00Z", language="en", model="toy-tfidf@1", with_header=True, page=None):
    records, seen = [], {}
    for index, (path, body, start, end) in enumerate(sections(md)):
        text = normalise(body)
        content_hash = sha256_hex(text)
        occurrence = seen[content_hash] = seen.get(content_hash, -1) + 1        # same paragraph twice in ONE document
        chunk_id = sha256_hex(f"{doc_id}\x1f{content_hash}\x1f{occurrence}")[:32]
        records.append(ChunkRecord(chunk_id, doc_id, source_uri, index, path, start, end, page, updated_at, now, language,
                                   tuple(acl), content_hash, model,
                                   sha256_hex(model + "\x1f" + embed_input(path, text, with_header)), text))
    return records

GUIDE = dedent("""\
    # Router X200 Guide

    ## Setup

    ### Resetting
    Hold the reset button for 10 seconds until the light blinks. This restores the factory settings.

    ### Firmware updates
    Open the settings menu and choose update. The download is 40 megabytes.

    ## Support

    ### Warranty
    The warranty lasts 24 months from the date of purchase.
    """)
recs = make_records("kb/router-x200", "https://docs.example.com/router-x200", GUIDE, acl=("public",), page=None)
print(f"{len(recs)} chunks. Record 0 as JSON:")
fields = [f'  "{key}": {json.dumps(value)}' for key, value in asdict(recs[0]).items()]   # json.dumps(asdict(r), indent=2), flatter
print("{\n" + ",\n".join(fields) + "\n}")
print("\nembedded string for record 0:", repr(embed_input(recs[0].heading_path, recs[0].text)))
print("source slice matches text   :", normalise(GUIDE[recs[0].start_char:recs[0].end_char]) == recs[0].text)
```

Output:

```
3 chunks. Record 0 as JSON:
{
  "chunk_id": "03878cf7769e55c66d9a6b642e2feceb",
  "doc_id": "kb/router-x200",
  "source_uri": "https://docs.example.com/router-x200",
  "chunk_index": 0,
  "heading_path": ["Router X200 Guide", "Setup", "Resetting"],
  "start_char": 45,
  "end_char": 141,
  "page": null,
  "doc_updated_at": "2026-10-01T00:00:00Z",
  "ingested_at": "2026-10-26T00:00:00Z",
  "language": "en",
  "acl": ["public"],
  "content_hash": "318bd67c42ed228cd41fe44b20f069b093fae20d5e5febd63d455fe0ee995666",
  "embed_model": "toy-tfidf@1",
  "embed_key": "02d259964b08ceba3cddfd61265a52be1eb3e6c3ab470146888f82959b05062c",
  "text": "Hold the reset button for 10 seconds until the light blinks. This restores the factory settings."
}

embedded string for record 0: 'Router X200 Guide > Setup > Resetting\nHold the reset button for 10 seconds until the light blinks. This restores the factory settings.'
source slice matches text   : True
```

### 7. Idempotent ingestion

`ChunkStore` stands in for one vector-database collection. `ingest` computes the set difference described above; the embedder is a deterministic fake so we can count how often it is called.

```python
from collections import Counter
from dataclasses import replace

def fake_vector(text, dim=8):                                  # deterministic stand-in for a real embedding call
    return np.random.default_rng(int(sha256_hex(text)[:8], 16)).normal(size=dim)

class ChunkStore:
    """Stand-in for one vector-database collection: records and vectors keyed by chunk_id."""
    def __init__(self):
        self.records, self.vectors = {}, {}

    def ingest(self, doc_id, new_records, with_header=True):
        stats, new = Counter(), {r.chunk_id: r for r in new_records}
        for cid, r in new.items():
            old = self.records.get(cid)
            if old is None:
                stats["added"] += 1
            if old is None or old.embed_key != r.embed_key:                   # new text, new header or new model
                self.vectors[cid] = fake_vector(embed_input(r.heading_path, r.text, with_header) + r.embed_model)
                stats["embedded"] += 1
            if old is not None and replace(old, ingested_at=r.ingested_at) != r:
                stats["metadata updated"] += 1                               # same text, new offsets / path / ACL ...
            if old is None or replace(old, ingested_at=r.ingested_at) != r:
                self.records[cid] = r                                        # upsert; an identical record is not rewritten
        for cid in [c for c, r in self.records.items() if r.doc_id == doc_id and c not in new]:
            del self.records[cid], self.vectors[cid]                         # chunks of this document that no longer exist
            stats["removed"] += 1
        return stats

store = ChunkStore()
def step(label, md, **kw):
    s = store.ingest("kb/router-x200", make_records("kb/router-x200", "https://docs.example.com/router-x200", md, **kw))
    print(f"{label:<44} {s['added']:>5} {s['removed']:>7} {s['embedded']:>9} {s['metadata updated']:>9} {len(store.records):>8}")

print(f"{'step':<44} {'added':>5} {'removed':>7} {'embedded':>9} {'meta upd.':>9} {'in store':>8}")
doc = GUIDE
step("1. first ingest", doc)
step("2. run it again, nothing changed", doc, now="2026-10-27T00:00:00Z")
doc = doc.replace("24 months", "36 months")
step("3. edit one sentence (24 -> 36 months)", doc)
doc = doc.replace("## Support", "## Safety\nKeep the router away from water.\n\n## Support")
step("4. insert a new section before Support", doc)
doc = doc.replace("### Resetting", "### Factory reset")
step("5. rename a heading, text unchanged", doc)
step("6. upgrade the embedding model", doc, model="toy-tfidf@2")
step("7. the source document is deleted", "")

# Same text in two places: chunk ids differ (different documents), the text hash is shared (so one cached embedding).
a = make_records("kb/router-x200", "u1", GUIDE)[2]
b = make_records("kb/router-x300", "u2", GUIDE)[2]
twice = make_records("kb/faq", "u3", "# FAQ\n## A\nSee the manual.\n## B\nSee the manual.\n")
print("\nwarranty chunk in two documents -> same content_hash:", a.content_hash == b.content_hash, "| same chunk_id:", a.chunk_id == b.chunk_id)
print("same paragraph twice in one document -> same content_hash:", twice[0].content_hash == twice[1].content_hash,
      "| same chunk_id:", twice[0].chunk_id == twice[1].chunk_id)
```

Output:

```
step                                         added removed  embedded meta upd. in store
1. first ingest                                  3       0         3         0        3
2. run it again, nothing changed                 0       0         0         0        3
3. edit one sentence (24 -> 36 months)           1       1         1         0        3
4. insert a new section before Support           1       0         1         1        4
5. rename a heading, text unchanged              0       0         1         4        4
6. upgrade the embedding model                   0       0         4         4        4
7. the source document is deleted                0       4         0         0        0

warranty chunk in two documents -> same content_hash: True | same chunk_id: False
same paragraph twice in one document -> same content_hash: True | same chunk_id: False
```

Step 2 is the idempotency check: a second run (with a later timestamp) adds, removes, embeds and rewrites nothing. Step 3 touches one chunk and only one is re-embedded. Step 4 inserts a section; the three existing chunks keep their ids, and only the Warranty chunk gets new metadata (its `chunk_index` moved), with no re-embedding. Step 5 renames a heading without touching the text: no id changes, but the chunk's `embed_key` does (the header is part of it) so exactly one vector is rebuilt, and all four records get updated metadata (a new `heading_path` for the renamed chunk, new offsets for the rest, because the heading got longer). Step 6 is a model upgrade: same ids, every vector rebuilt. Step 7 shows the deletion path; forgetting it leaves ghost chunks that answer from documents that no longer exist.

### 8. Does a contextual header help?

```python
TOPICS = [   # (section, subsection, body template, question template). Every product's manual repeats this text.
    ("Setup", "Resetting", "Hold the reset button for {n} seconds until the light blinks. This restores the factory settings.",
     "how many seconds do I hold the reset button on the {p}"),
    ("Setup", "Firmware updates", "Open the settings menu and choose update. The download is {n} megabytes and takes a few minutes.",
     "how many megabytes is the firmware update download for the {p}"),
    ("Support", "Warranty", "The warranty lasts {n} months from the date of purchase. Keep the receipt as proof.",
     "how many months does the warranty last on the {p}"),
    ("Support", "Error codes", "Error {n} means the sensor needs recalibration. Restart the device and try again.",
     "which error code means the sensor needs recalibration on the {p}"),
    ("Care", "Battery", "A full charge takes about {n} hours. Do not leave the battery charging overnight.",
     "how many hours does a full charge take on the {p}"),
    ("Care", "Cleaning", "Wipe the housing with a dry cloth. The cleaning cycle runs {n} minutes and needs no water.",
     "how many minutes does the cleaning cycle run on the {p}"),
]

def build_manuals(seed, n_products=30, p_body_names_product=0.25):
    """One markdown manual per product. The body text is the same boilerplate for every product except one number,
    and only a quarter of the sections mention the product by name in the body."""
    rng = np.random.default_rng(seed)
    picks = rng.choice(len(NAME_SYL) ** 2, size=n_products, replace=False)
    manuals, questions = {}, []
    for i, pick in enumerate(picks):
        product = (NAME_SYL[pick % 12] + NAME_SYL[pick // 12]).capitalize() + f" X{rng.integers(100, 999)}"
        md, last_section = f"# {product} User Guide\n", None
        for section, sub, body, question in TOPICS:
            if section != last_section:
                md, last_section = md + f"\n## {section}\n", section
            lead = f"Note for {product} owners: " if rng.random() < p_body_names_product else ""
            text = body.format(n=rng.integers(2, 99))
            md += f"\n### {sub}\n{lead}{text}\n"
            questions.append((question.format(p=product), f"manual-{i}", sub, bool(lead)))
        manuals[f"manual-{i}"] = md
    return manuals, questions

def header_variants(path):
    return {"no header": (), "section title only": path[-1:], "path without document title": path[1:], "full path": path}

def run_header_experiment(seed, p_named=0.25):
    manuals, questions = build_manuals(seed, p_body_names_product=p_named)
    records = [r for doc_id, md in manuals.items() for r in make_records(doc_id, f"https://docs.example.com/{doc_id}", md)]
    order = np.random.default_rng(seed).permutation(len(records))                    # shuffle rows: ties must not favour manual order
    records = [records[i] for i in order]
    out = {}
    for name in header_variants(()):
        texts = [embed_input(header_variants(r.heading_path)[name], r.text) for r in records]
        top = TfidfIndex(texts).search([q[0] for q in questions], 3)
        rank1 = [(records[top[i, 0]].doc_id, records[top[i, 0]].heading_path[-1]) == (doc, sub) for i, (_, doc, sub, _) in enumerate(questions)]
        rank3 = [any((records[j].doc_id, records[j].heading_path[-1]) == (doc, sub) for j in top[i]) for i, (_, doc, sub, _) in enumerate(questions)]
        named = np.array([q[3] for q in questions])
        out[name] = (np.mean([len(t.split()) for t in texts]), np.mean(rank1), np.mean(rank3),
                     np.mean(np.array(rank1)[named]), np.mean(np.array(rank1)[~named]))
    return out

results = [run_header_experiment(seed) for seed in range(5)]
print("30 product manuals x 6 sections = 180 chunks and 180 questions per corpus, mean over 5 corpora")
print(f"{'embedded text':<30} {'words/chunk':>11} {'recall@1':>9} {'recall@3':>9} {'@1 body names product':>22} {'@1 body does not':>17}")
for name in results[0]:
    m = np.mean([r[name] for r in results], axis=0)
    print(f"{name:<30} {m[0]:>11.1f} {m[1]:>9.3f} {m[2]:>9.3f} {m[3]:>22.3f} {m[4]:>17.3f}")
```

Output:

```
30 product manuals x 6 sections = 180 chunks and 180 questions per corpus, mean over 5 corpora
embedded text                  words/chunk  recall@1  recall@3  @1 body names product  @1 body does not
no header                             16.5     0.237     0.290                  1.000             0.010
section title only                    17.8     0.238     0.291                  1.000             0.011
path without document title           19.8     0.240     0.288                  1.000             0.014
full path                             24.8     1.000     1.000                  1.000             1.000
```

Only the arm that adds the product name (via the document title) changes anything: the section title alone and the path without the title add words but no information. When the body already names the product (second-to-last column) the header changes nothing, because there was nothing missing. Exercise 3 varies how often that happens.

### 9. Permissions: filter before or after ranking?

```python
rng = np.random.default_rng(0)
manuals, questions = build_manuals(0)
level = {doc_id: str(rng.choice(["public", "partner", "internal"], p=[0.5, 0.3, 0.2])) for doc_id in manuals}   # one ACL tag per manual
records = [r for doc_id, md in manuals.items() for r in make_records(doc_id, f"https://docs.example.com/{doc_id}", md, acl=(level[doc_id],))]
index = TfidfIndex([embed_input(r.heading_path, r.text) for r in records])
user_groups = {"public"}                                                          # this user may only read "public" chunks
allowed = np.array([bool(user_groups & set(r.acl)) for r in records])
qs, K = [q[0] for q in questions], 10

plain = index.search(qs, K)                                                       # no access control at all
post = [[j for j in row if allowed[j]] for row in plain]                          # rank first, filter afterwards
pre = index.search(qs, K, allowed=allowed)                                        # filter first, then rank
print(f"{allowed.sum()} of {len(records)} chunks are visible to {sorted(user_groups)}; {len(qs)} questions, top-{K}")
print(f"no filter     : {np.mean([(~allowed[row]).any() for row in plain]):.0%} of result lists contain a chunk the user must NOT see")
print(f"post-filter   : safe, but returns {np.mean([len(r) for r in post]):.1f} of {K} results on average; "
      f"{np.mean([len(r) == 0 for r in post]):.0%} of questions get none")
print(f"pre-filter    : safe, and returns {np.mean([allowed[row].sum() for row in pre]):.1f} of {K} results on average")
```

Output:

```
66 of 180 chunks are visible to ['public']; 180 questions, top-10
no filter     : 100% of result lists contain a chunk the user must NOT see
post-filter   : safe, but returns 3.4 of 10 results on average; 10% of questions get none
pre-filter    : safe, and returns 10.0 of 10 results on average
```

Without any filter, every result list would have shown the user chunks they must not see. Filtering after ranking fixes the leak but leaves only 3.4 of the 10 slots filled on average, and 10% of questions get nothing; filtering before ranking fills all 10. (Full is not the same as relevant: for a question about a product the user may not see, those 10 are about other products.) This is a brute-force mask on a toy; doing it inside an approximate index is [Module 16](../16-metadata-filtering-and-hybrid-queries/README.md)'s subject.

## Visual diagram

```
      word  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
  evidence                   ██ ██ ██ ██

 O = 0 (stride 8)
           [-------chunk 0--------]                        [-------chunk 2--------]
                                   [-------chunk 1--------]
                                  ▲ the cut at word 8 splits the evidence: no chunk holds all four words

 O = 3 (stride 5)
           [-------chunk 0--------]      [-------chunk 2--------]      [-chunk 4--]
                          [-------chunk 1--------]      [-------chunk 3--------]
                          ▲ chunk 1 covers words 5-12, so it holds the evidence (words 6-9) whole


  Overlap creates near-copies; metadata lets you merge them             (block 5)

  query ──► nearest chunks, k = 5
            chunk 12   chunk 13   chunk 40   chunk 11   chunk 77     12, 13 and 11 overlap each other
               └──────────┴──────────┴ merge_hits: same doc_id, ranges overlap or touch
            passage 11-13          passage 40   passage 77            fewer, longer, distinct passages
                    │
                    ▼
            prompt context, each passage cited with source_uri + heading_path + page


  Three hashes, three questions                                         (blocks 6 and 7)

  chunk text ──► normalise ──┬──► content_hash = sha256(text)
                              │       "same words?"            de-duplicate across docs, detect edits
                              │
  doc_id ─────────────────────┼──► chunk_id = sha256(doc_id, content_hash, occurrence)[:32]
                              │       "which record?"          upsert key, delete key, citation anchor
                              │
  model + heading path ───────┴──► embed_key = sha256(model, header + text)
                                      "vector still valid?"    re-embed only when this changes


  Ingesting one document = a set difference on chunk_id

  ids from the file just read ──┐
                                ├─ only in new ──► added     embed + insert
  ids stored for this doc_id ───┤
                                ├─ only in old ──► removed   delete record and vector
                                └─ in both ──────► kept      same embed_key? keep the vector : re-embed
                                                             always refresh offsets, path, ACL, timestamps
```

## Practice

### 1. Check the guarantee by brute force

The derivation says evidence up to O + 1 words always fits whole in some chunk. Test it with S=30, O=9 for L=10, 11 and 12: for every start position in a 300-word document, is there a window that contains the span?

<details><summary>Answer</summary>

```python
S, O = 30, 9
for L in (10, 11, 12):
    uncovered = [a for a in range(0, 300 - L)
                 if not any(s <= a and a + L <= e for s, e in window_ranges(300, S, O))]
    print(f"S={S}, O={O}: spans of {L} words: {len(uncovered)} of {300 - L} start positions are never whole in a chunk")
```

Output:

```
S=30, O=9: spans of 10 words: 0 of 290 start positions are never whole in a chunk
S=30, O=9: spans of 11 words: 13 of 289 start positions are never whole in a chunk
S=30, O=9: spans of 12 words: 26 of 288 start positions are never whole in a chunk
```

At L = O + 1 = 10 no start position fails. One word longer and 13 of 289 positions fail, two words longer and 26 of 288: the failing fraction grows by about 1/D = 1/21 per extra word, as the (S - L + 1) / D formula says (the last positions of the document are a little luckier). The guarantee is a sharp threshold, not a rule of thumb.

</details>

### 2. Which id scheme survives an insertion?

For the first manual from block 8, insert one new section at the top and count how many chunk ids are new, under content-based ids (block 6) and position-based ids (`doc_id`, `chunk_index`, text). Then insert 5 words at the top of a 1,000-word document cut into fixed 100-word chunks and count new content-based ids.

<details><summary>Answer</summary>

```python
manuals, _ = build_manuals(0)
md = manuals["manual-0"]
changed = md.replace("\n## Setup\n", "\n## Safety\nKeep the device away from water.\n\n## Setup\n")   # one new section at the top

def ids(md_text, scheme):
    out = set()
    for r in make_records("manual-0", "u", md_text):
        if scheme == "content":
            out.add(r.chunk_id)
        else:
            out.add(sha256_hex(f"manual-0\x1f{r.chunk_index}\x1f{r.text}")[:32])    # position-based id
    return out

for scheme in ("content", "position"):
    before, after = ids(md, scheme), ids(changed, scheme)
    print(f"{scheme + '-based ids':<18} section chunks: {len(after - before)} of {len(after)} ids are new after inserting one section")

words = ("lorem ipsum dolor sit amet " * 200).split()                 # 1,000 words
words = [f"{w}{i}" for i, w in enumerate(words)]                      # make every word unique
edited = ["inserted", "five", "new", "words", "here"] + words
def fixed_ids(ws):
    return {sha256_hex(" ".join(ws[s:e])) for s, e in window_ranges(len(ws), 100, 0)}
print(f"{'content-based ids':<18} fixed-size chunks: {len(fixed_ids(edited) - fixed_ids(words))} of {len(fixed_ids(edited))} ids are new after inserting 5 words at the top")
```

Output:

```
content-based ids  section chunks: 1 of 7 ids are new after inserting one section
position-based ids section chunks: 7 of 7 ids are new after inserting one section
content-based ids  fixed-size chunks: 11 of 11 ids are new after inserting 5 words at the top
```

Content-based ids with section chunks: only the new section is new (1 of 7). A position-based id changes for every chunk after the insertion point and here the insertion is at the top, so all 7 are new, which means 6 needless re-embeds and 6 delete-and-insert operations. The third line is the warning from the Explanation: with fixed-size chunks a 5-word insertion shifts every boundary, so every chunk has new text and all 11 ids change even though they are content-based. The id scheme can only be as stable as the chunker underneath it.

</details>

### 3. When does the header stop paying off?

`build_manuals` takes the fraction of sections whose body names the product. Compare "no header" with "full path" at 10%, 50% and 90%.

<details><summary>Answer</summary>

```python
for p in (0.1, 0.5, 0.9):
    res = [run_header_experiment(seed, p_named=p) for seed in range(5)]
    base, full = (np.mean([r[name][1] for r in res]) for name in ("no header", "full path"))
    print(f"body names the product in {p:.0%} of sections: recall@1 no header {base:.3f} -> full path {full:.3f}")
```

Output:

```
body names the product in 10% of sections: recall@1 no header 0.117 -> full path 1.000
body names the product in 50% of sections: recall@1 no header 0.493 -> full path 1.000
body names the product in 90% of sections: recall@1 no header 0.894 -> full path 1.000
```

The baseline climbs almost one-for-one with the fraction of bodies that already say the product name (the body supplies the context itself), while the header arm stays at 1.000, so the header's advantage in recall@1 shrinks from 0.88 to 0.11 but never goes negative here. If your chunks already carry their context, a header adds embedding cost for little gain; measure before paying it.

</details>

### Checkpoint quiz

1. With S=200 and O=50, how long can a piece of evidence be and still be guaranteed whole in some chunk, and what is the index inflation for a long document?
2. In block 4, "recall | fits" is 1.000 at every overlap, yet overall recall rises from 0.758 to 1.000. What does that tell you about where the lost answers were?
3. A teammate sets O = S/2 "to be safe". Name two costs they pay and one thing it still does not fix.
4. Why is `chunk_id` not simply `sha256(text)`?
5. Block 7, step 5 renames a heading and leaves the text alone. Which things change, and which do not?
6. What is wrong with filtering a top-10 by permissions after ranking, and what is the fix?

<details><summary>Answers</summary>

1. L <= O + 1 = 51 words. Inflation is S/(S-O) = 200/150 = 1.333, so about a third more vectors, tokens embedded and raw vector storage.
2. That none of them were ranking failures: whenever a chunk contained the whole evidence the retriever found it. Every lost answer was a boundary casualty that no retriever could recover, which is why the fix is on the chunking side.
3. It doubles the index (S/(S-O) = 2) and the embedding bill, and it fills top-k with near-duplicate neighbours that need merging. It does not fix evidence longer than O + 1 words, nor anything about paraphrase or ranking quality.
4. Two documents can contain identical text yet need separate records (different URI, permissions, citations), and one document can repeat a paragraph. Scoping by `doc_id` and an occurrence counter keeps records distinct, while `content_hash` is still available to embed identical text once.
5. `chunk_id` and `text` are unchanged. `heading_path` changes, so `embed_key` changes and the vector is rebuilt (1 embed), and the later chunks' `start_char`/`end_char` shift because the new heading is longer (metadata-only updates).
6. The top-k slots were spent on chunks the user cannot see, so fewer than k results survive (3.4 of 10 on average in block 9). Filter before ranking so the k slots are filled from allowed chunks; in a vector database that is metadata filtering inside the index (Module 16).

</details>

> [!check]
> - I can derive the overlap that guarantees evidence of length L lands whole, and its inflation cost.
> - I can compute chunk count and stored size for given S, O and document length.
> - I can design an experiment with planted answers to measure boundary-straddling recall.
> - I can merge overlapping hits, and name the query-time alternative to overlap.
> - I can list the metadata every chunk needs and name what each field is for.
> - I can explain how content-hash ids make re-ingestion idempotent, and when they still churn.
> - I can say what a contextual header adds, what it costs, and when it will not help.

## Project

Build a small ingestion and evaluation harness for a corpus you own (a folder of markdown notes, an exported wiki, or documentation you use daily). It reads every file, chunks it with a configurable size and overlap, stores one metadata record per chunk (at minimum: stable id, document id, source path, heading path, character offsets, content hash, embedding model name and an access tag) in SQLite, and supports re-running without duplicating anything or re-embedding unchanged chunks. Then write 30 questions whose answers you can point to in the source, record each answer's character range, and report: how many answers a given (size, overlap) cuts in two; the recall@5 you measure with a retriever of your choice (the numpy TF-IDF from this module is enough) at three overlap values; the index inflation at each; and the effect of embedding the heading path. Prove the idempotency claims with tests: a second run changes nothing, editing one paragraph re-embeds one chunk, renaming a heading re-embeds only that section's chunks, and deleting a file removes its chunks. Finish with a paragraph on whether you would ship overlap, neighbour expansion or neither for this corpus, and on what you would need to see in real traffic to change your mind. No code is given; design the module boundaries yourself.

## Interview questions

> [!interview] How would you choose the chunk overlap for a RAG system, and what does it cost?

<details><summary>What a strong answer covers</summary>

- States the mechanism: a cut can split a piece of evidence, so neither chunk is a complete answer; overlap guarantees evidence up to O + 1 units long is whole in some chunk.
- States the cost as S/(S-O): more vectors, more embedding tokens, more storage, more near-duplicate hits; gives numbers (25% is 1.33x, 50% is 2x).
- Sizes the overlap from the evidence unit, not a default percentage; notes returns stop once O covers it; mentions that vendors' defaults differ widely.
- Measures: build a labelled set with answer positions, compare the fraction of answers cut in two and recall@k at several overlaps, plus the inflation.
- Names alternatives: larger or structure-aware chunks, neighbour expansion at query time, merging overlapping hits.

</details>

> [!interview] Design the metadata and the ingestion logic for a RAG index over a company wiki that changes daily. Re-indexing must be cheap and safe to re-run.

<details><summary>What a strong answer covers</summary>

- Record fields and why: doc id, source URI, heading path, offsets and index, page, source-modified and ingested timestamps, language, ACL tags, content hash, embedding model and version.
- Stable ids derived from content (scoped by document, with an occurrence counter), not from UUIDs, timestamps or positions; separate the identity hash from the "is the vector valid" key (model, header, text).
- Ingest as a diff: added, removed, kept; upsert so re-runs are no-ops; re-embed only on a changed embed key; delete chunks of deleted documents; refresh metadata in place.
- Recognises limits: fixed-size chunking churns ids on insertions, structure-aware chunking is more stable; a model change means a full re-embed into a new collection.
- Operational points: batch and retry per Module 05, record the model for every vector, reconcile counts after a run.

</details>

> [!interview] Users report that a chatbot answered with a document they should not have been able to read. Where in a RAG system can that happen and how do you prevent it?

<details><summary>What a strong answer covers</summary>

- Access control must be enforced in retrieval, using the asking user's identity against per-chunk ACL tags stored at ingest; asking the model to withhold content is not a control.
- Filtering after ranking is safe but returns fewer than k results; filtering before ranking (metadata filter inside the vector search) keeps k results and avoids wasted slots.
- Stale tags: the ACL copy must be re-synced when source permissions change; track `doc_updated_at` and permission-change events, and consider a re-check against the source of truth at answer time.
- Other leak paths: caches keyed without the user's identity, citations and snippets, logs, and chunks shared across tenants via content-hash de-duplication (keep per-tenant records, share only embeddings).

</details>

## Common mistakes & troubleshooting

- **The same passage appears two or three times in the prompt.** Overlapping chunks all scored high. Merge hits whose ranges overlap or touch before building the context (block 5).
- **The index is much larger than the document size suggests.** Overlap inflation is S/(S-O), so 50% overlap doubles it. Compute `n_chunks` for your settings before a large run.
- **The chunker loops forever or a provider rejects the request.** Overlap must be smaller than the chunk size (`window_ranges` raises); Azure's Text Split skill and OpenAI's static strategy cap it at half.
- **Re-running ingestion doubles the collection.** Chunk ids come from a UUID, a counter, a timestamp or a path. Derive them from document id and content hash.
- **A small edit re-embeds most of the document.** Either the chunker is fixed-size and an insertion shifted every boundary (Exercise 2), the normalisation changed, or the embedding header changed. Compare `chunk_id` and `embed_key` sets between runs to see which.
- **Answers cite text that was deleted from the source.** The deletion path is missing: chunks whose document no longer exists must be removed (block 7, step 7).
- **Vectors from two models sit in one collection.** Retrieval looks plausible and is wrong. Store `embed_model` on every record and check it at query time and in audits.
- **A user sees a chunk they should not.** Permission filtering happens after ranking in a cache, in a log, or against stale `acl` tags. Filter inside retrieval with the asker's identity and re-sync tags when source permissions change.
- **Source offsets do not match the text.** Offsets were computed on the normalised text instead of the original. Block 6 computes them on the original and normalises only the stored text.

## Further reading & sources

- [Contextual retrieval in AI systems (Anthropic)](https://www.anthropic.com/research/contextual-retrieval) - the contextual-embeddings and contextual-BM25 method behind the header section, with the 35%, 49% and 67% failure-rate reductions quoted there and the conditions under which they were measured.
- [Late Chunking: Contextual Chunk Embeddings Using Long-Context Embedding Models](https://arxiv.org/abs/2409.04701) - the paper that keeps chunk context by embedding the whole document first and pooling per chunk; the alternative to prepending text.
- [Chunk Documents - Azure AI Search | Microsoft Learn](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-chunk-documents) - source of the 512-token, 25% overlap starting point, the "overlap must be less than half" rule, the published chunk counts used in block 1, and the advice to append the document title to mid-document chunks.
- [Create vector store file | OpenAI API Reference](https://developers.openai.com/api/reference/resources/vector_stores/subresources/files/methods/create) - documents the `auto` chunking strategy (800 tokens, 400 overlap), the 100 to 4096 token chunk-size range and the half-of-chunk-size cap on overlap.
- [File search | OpenAI API](https://developers.openai.com/api/docs/guides/tools-file-search) - shows `file_citation` annotations and filtering search results by file metadata, as an example of metadata serving citations and filters.
- [TextSplitter | langchain_text_splitters | LangChain Reference](https://reference.langchain.com/python/langchain-text-splitters/base/TextSplitter) - the `chunk_size`, `chunk_overlap` (in characters) and `add_start_index` parameters and their defaults.
- [Node Parser Modules | LlamaIndex Developer Documentation](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/) - the `SentenceWindowNodeParser`, which keeps the surrounding sentences in node metadata, a framework version of neighbour expansion.
- [hashlib - Secure hashes and message digests](https://docs.python.org/3/library/hashlib.html) - `sha256` as used for content hashes, chunk ids and embedding keys.

## Next

[Module 09: The Vector Database Landscape](../09-the-vector-database-landscape/README.md)
