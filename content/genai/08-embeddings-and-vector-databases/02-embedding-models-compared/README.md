# Module 02: Embedding Models Compared

## Roadmap

[Module 00](../00-what-an-embedding-is/README.md) showed what an embedding is and [Module 01](../01-from-word2vec-to-sentence-embeddings/README.md) showed why retrieval uses models trained to embed whole sentences.
This module answers the next practical question: with dozens of embedding models on offer, **how do you choose one?** It is deliberately not a ranking. Rankings go stale within months and a ranking built on someone else's data cannot tell you what will happen on yours.
It teaches the criteria, what the MTEB benchmark does and does not measure, how to cut vector size with Matryoshka-style truncation, and how to build the evaluation harness that decides the question for your data.
Prerequisites: Modules 00 and 01, plus the bi-encoder idea from [Track 03, Module 05](../../03-landmark-models-bert-gpt-and-moe/05-sentence-transformers-and-bi-encoders/README.md).

After this module you can write a model-selection checklist, run any `embed(texts) -> np.ndarray` function through a recall@k and MRR harness with honest error bars, and judge whether a smaller vector is safe to use.
Calling hosted embedding APIs is Track 06's job ([Module 08](../../06-openai-and-the-model-landscape/08-the-embeddings-api/README.md)), and batching at scale is [Module 05](../05-generating-embeddings-at-scale/README.md) of this track.
Next: [Module 03](../03-cosine-similarity-and-distance-metrics/README.md) covers the similarity scores this module has been using without much explanation.

## Concept

> [!key] There is no best embedding model, only the best fit for your languages, domain, length limits, budget and licence. Shortlist on hard constraints, then decide with a labelled evaluation of your own data, with error bars, because public benchmarks average over tasks that are not yours.

## Explanation

### Why "just pick the top of a leaderboard" fails

The MTEB paper (Muennighoff et al., 2022) benchmarked 33 models and reports that no particular text embedding method dominates across all tasks. If the benchmark's authors found no universal winner, a single number cannot tell you which model fits your corpus. A leaderboard is a way to build a shortlist; the decision comes from your data.

### The comparison checklist

| Criterion | What to ask | Why it matters |
|---|---|---|
| Output dimension | How many numbers per vector? Can it be truncated safely? | Storage is `N x d x 4` bytes in float32 and every search touches every dimension. Dimension is a cost, not a quality score (Module 04). |
| Max input tokens | How many tokens before the input is silently cut off, counted with whose tokenizer? | Text past the limit is not embedded at all. This interacts with chunk size (Modules 06-08). |
| Languages | English only or multilingual? Which languages? | A model that never saw your language retrieves poorly in it. In MTEB's original release only 10 of 58 datasets are multilingual. |
| Domain fit | Is it trained on text like yours: code, legal, medical, product titles, chat? | General benchmarks average over domains that may not include yours. |
| Query/document asymmetry | Does it expect different prefixes or prompts for queries and for documents? | A missing or wrong prefix gives worse results with no error (next section). |
| Open weights or hosted API | Run it yourself, or call a vendor? | Control, privacy and data residency; per-token billing versus your own hardware; network latency and rate limits; and a hosted model can be changed or retired, forcing a full re-embedding. |
| Latency and cost | Seconds per 1,000 documents at index time and per query at query time, at your batch size | Index time is paid once per corpus and again at every model change; query time is in your user's path. Measure it, spec sheets do not transfer. |
| Licence | Do the weights' or API's terms allow your commercial use? | "Open weights" does not mean "permissive licence". Read the model card. |
| Lock-in | Can vectors from two models be mixed? | No. Switching models means re-embedding the whole corpus (shown in the code below). |

A workable procedure: (1) cut the field with hard constraints (licence, hosting, languages, length), (2) build a labelled set from your own data, (3) run every survivor through the same harness, (4) measure latency and cost, (5) check whether the differences exceed the noise, (6) record the choice **together with the model name, version, prefix and any truncation**, next to the stored vectors.

### Asymmetric queries and documents

A query ("how do I get my money back") and the passage that answers it ("Refunds are issued to...") do not look alike. Some models handle this by treating the two sides differently: the same encoder, but a short prefix marks which side the text is on. The E5 paper (Wang et al., 2022) does this: it uses a shared encoder and "break[s] the symmetry by adding two prefix identifiers 'query:' and 'passage:'",
and says this asymmetric design "turns out to be important for some retrieval tasks where there exist paraphrases of the query in the target corpus". The `sentence-transformers` documentation exposes the same idea as `encode_query()` and `encode_document()`, which apply the model's configured prompts automatically.

> [!pitfall] Prefix mistakes fail silently. Embed documents without the document prefix, or queries with the document prefix, and you still get vectors of the right shape and plausible-looking scores, only worse retrieval. Apply prefixes in exactly one place (the harness below has `query_prefix` and `doc_prefix` arguments for this), take them from the model card, and never mix settings between indexing and querying.

### What MTEB measures, and what it cannot tell you

MTEB, the Massive Text Embedding Benchmark, scores a model on 8 task types, each with its own main metric (from the paper):

| Task | What the embedding is used for | Main metric |
|---|---|---|
| Retrieval | rank a corpus for a query (reuses BEIR) | nDCG@10 |
| Semantic textual similarity | match human similarity ratings | Spearman correlation of cosine similarity |
| Classification | features for logistic regression | accuracy |
| Clustering | group texts | v-measure |
| Pair classification | duplicate or paraphrase yes/no | average precision |
| Reranking | order a candidate list | MAP |
| Summarization | score machine summaries against human ones | Spearman correlation of cosine similarity |
| Bitext mining | find translation pairs | F1 |

The original release has 58 datasets and 112 languages; its authors describe adding a new model as less than 10 lines of code, and the open-source `mteb` package (repository linked below) lets you run chosen tasks on your own model. Limits, from the paper's own appendix and its main table, then from my reading:

- **Long documents are missing.** The authors state that the longest MTEB datasets have a few hundred words. If your chunks are longer, the benchmark says little about them.
- **Tasks are unbalanced, and the average follows the counts.** In the English main table there are 15 retrieval datasets, 12 classification, 11 clustering, 10 STS, 4 reranking, 3 pair classification and 1 summarization, and the authors note that the overall average is therefore biased toward tasks with many datasets, notably retrieval, classification and clustering.
- **The language coverage is thin outside English.** The 112 languages come from 10 multilingual datasets (the paper's count), so "multilingual" on a model card is a claim to test on your language.
- **An average hides the spread.** One number summarises very different tasks (the paper's own finding is that no method wins everywhere), and says nothing about cost, latency, memory or licence.
- **Public datasets can leak into training.** This is my own reasoning, not a finding I verified: if a model was trained on data overlapping a public benchmark, its score on that benchmark overstates what it will do on text it has never seen. Another reason to evaluate on your private data.
- **It is a moving target.** I could not read leaderboard contents for this module (the page is a JavaScript application and my fetch returned only its title and loading messages), so no ranking is quoted anywhere here. Open [the leaderboard](https://huggingface.co/spaces/mteb/leaderboard) yourself and treat what you see as a shortlist generator.

### Matryoshka truncation: cutting a vector short

If embeddings are expensive to store and search, can you keep only the first `m` of `d` numbers? For a model not trained for it, do not assume so: nothing guarantees that the early coordinates are special, and block 5 shows what happens when they are not.
**Matryoshka Representation Learning** (Kusupati et al., 2022) trains a model so that its first `m` dimensions are themselves a good embedding, for several nested values of `m`, so one vector can be used at several sizes; the paper's abstract states it adds no inference cost, and the paper notes normalisation must be handled for each nested size. In use you **truncate, then renormalise to unit length** so cosine scores and indexes that expect unit vectors keep working.
The paper also describes **adaptive retrieval**: shortlist candidates with a short prefix, then re-rank the shortlist with the full vector. Whether a particular model supports truncation is stated on its model card and must be checked with your harness.

What decides success is where the information sits *in the coordinates*, and the code below isolates exactly that on synthetic data. Real models are not synthetic; this shows the mechanism, not a number to expect.

### Evaluating on your own data

You need three things: a corpus, queries, and for each query the documents that should be returned (a "gold" set). Metrics:

- **recall@k**: the share of a query's relevant documents found in the top `k`, averaged over queries.
- **MRR** (mean reciprocal rank): the average of `1 / rank` of the first relevant document (1.0 if always first).
- MTEB's retrieval metric is nDCG@10; this module uses recall@k and MRR because they are simple to read and to compute by hand.

Three habits make the numbers trustworthy: know the **chance level** (what a random embedder scores); break ties **against** the system (otherwise a model that returns identical scores can get lucky from document order); and report **uncertainty**, because a small gold set gives wide error bars.

## Code

Only `numpy` and the standard library; paste the blocks in order into one file. The "models" below are **deterministic stand-ins that I wrote**, not real embedding models: they are there so the harness can be run and tested without downloads. Their scores say nothing about any real model.

### 1. A toy gold set

```python
import re
import zlib
import numpy as np

docs = [
    "To reset your password, open Settings, choose Security and click Reset password.",       # 0
    "Refunds are issued to the original payment method within five to ten business days.",    # 1
    "You can cancel your subscription at any time from the Billing page.",                     # 2
    "Two-factor authentication adds a second step when you sign in.",                          # 3
    "Invoices are emailed on the first day of each month and can be downloaded as PDF.",       # 4
    "Our data centres are located in Europe and North America.",                               # 5
    "API requests are limited to 100 per minute per key; higher limits are available on request.",  # 6
    "Exports can be scheduled to run nightly and delivered to an S3 bucket.",                  # 7
    "To invite a teammate, go to Members and enter their email address.",                      # 8
    "Deleting a project permanently removes its files after thirty days.",                     # 9
    "The mobile app supports offline mode and syncs when you reconnect.",                      # 10
    "Single sign-on is available with SAML on the Enterprise plan.",                           # 11
    "If a payment fails, we retry the card three times over seven days.",                      # 12
    "Change the email address on your account under Profile settings.",                        # 13
    "Webhooks notify your server when a build finishes or fails.",                             # 14
    "We encrypt data at rest and in transit.",                                                 # 15
    "Storage can be increased by upgrading to a larger plan.",                                 # 16
    "Contact support through the in-app chat, available weekdays from nine to five.",          # 17
    "Dark mode can be turned on in Appearance settings.",                                      # 18
    "You can restore deleted files from the trash for up to thirty days.",                     # 19
    "Team roles control who can edit, comment or only view a project.",                        # 20
    "A free trial lasts fourteen days and needs no credit card.",                              # 21
    "The status page shows current outages and past incidents.",                               # 22
    "Download your data at any time with the account export tool.",                            # 23
]

# (query, kind, set of relevant document indices)
labelled = [
    ("I forgot my login credentials",            "paraphrase", {0}),
    ("how do I get my money back",               "paraphrase", {1}),
    ("stop paying for the service",              "paraphrase", {2}),
    ("extra protection when logging in",         "paraphrase", {3}),
    ("where can I find my bills",                "paraphrase", {4}),
    ("is my information stored in the EU",       "paraphrase", {5}),
    ("recover a file I deleted by accident",     "paraphrase", {19, 9}),
    ("works without internet",                   "paraphrase", {10}),
    ("my card was declined",                     "paraphrase", {12}),
    ("get notified when a build breaks",         "paraphrase", {14}),
    ("I'm running out of space",                 "paraphrase", {16}),
    ("talk to a human",                          "paraphrase", {17}),
    ("try before buying",                        "paraphrase", {21}),
    ("rate limit for the API",                   "lexical",    {6}),
    ("automatic nightly export to S3",           "lexical",    {7, 23}),
    ("invite a teammate by email",               "lexical",    {8}),
    ("SSO with SAML",                            "lexical",    {11}),
    ("is data encrypted",                        "lexical",    {15}),
    ("who can edit a project",                   "lexical",    {20}),
    ("dark mode settings",                       "lexical",    {18}),
    ("paswrod reset",                            "typo",       {0}),
    ("refnd time",                               "typo",       {1}),
]
queries = [q for q, _, _ in labelled]
kinds = [k for _, k, _ in labelled]
relevant = [r for _, _, r in labelled]
print("documents:", len(docs), "| queries:", len(queries),
      "| by kind:", {k: kinds.count(k) for k in dict.fromkeys(kinds)})
```

Output: `documents: 24 | queries: 22 | by kind: {'paraphrase': 13, 'lexical': 7, 'typo': 2}`

Twenty-two queries is small, which is the point: you will see how much noise that implies. The `kind` tag lets you break results down: a model that wins on paraphrases and loses on exact-term queries is a different choice from one with the opposite profile.

### 2. The harness: it accepts any `embed(texts) -> np.ndarray`

```python
def normalize(M):
    n = np.linalg.norm(M, axis=1, keepdims=True)
    return M / np.where(n == 0, 1.0, n)            # an all-zero vector stays all-zero (score 0 against everything)

def score_vectors(Q, D, relevant, ks=(1, 3, 5)):
    """Rank every document for every query and compute recall@k and MRR.
    Ties are broken AGAINST the system (relevant documents sort last among equal scores)."""
    S = normalize(Q) @ normalize(D).T
    ranks_first, recalls = [], {k: [] for k in ks}
    for qi in range(len(Q)):
        is_rel = np.array([d in relevant[qi] for d in range(len(D))])
        order = np.lexsort((is_rel, -S[qi]))                 # primary key: -score; ties: non-relevant first
        position = np.empty(len(D), dtype=int)
        position[order] = np.arange(1, len(D) + 1)           # 1-based rank of every document
        rel_ranks = np.sort(position[is_rel])
        ranks_first.append(rel_ranks[0])
        for k in ks:
            recalls[k].append(np.mean(rel_ranks <= k))       # share of the relevant documents found in the top k
    out = {f"recall@{k}": float(np.mean(v)) for k, v in recalls.items()}
    out["mrr"] = float(np.mean(1.0 / np.array(ranks_first)))
    out["first_rank"] = ranks_first                          # per query, for diagnosis and confidence intervals
    return out

def evaluate(embed, docs, queries, relevant, query_prefix="", doc_prefix="", ks=(1, 3, 5)):
    """Works with ANY embed(list[str]) -> np.ndarray of shape (n, d). Prefixes are applied here, in one place."""
    D = np.asarray(embed([doc_prefix + d for d in docs]), dtype=float)
    Q = np.asarray(embed([query_prefix + q for q in queries]), dtype=float)
    assert D.shape[0] == len(docs) and Q.shape[0] == len(queries) and D.shape[1] == Q.shape[1], "bad embed() shape"
    assert np.isfinite(D).all() and np.isfinite(Q).all(), "embed() returned NaN or inf"
    assert np.allclose(embed(queries[:2]), embed(queries[:2])), "embed() is not deterministic"
    return score_vectors(Q, D, relevant, ks)
```

No output; this block only defines functions. Three design decisions deserve attention: ranking uses cosine similarity (normalise, then dot product; Module 03 explains why); ties are resolved against the system; and `evaluate` asserts shape, finiteness and determinism so a broken wrapper fails loudly instead of producing a plausible wrong table.

### 3. Four stand-in embedders (not real models)

```python
# ---- STAND-INS, NOT REAL MODELS. Each is a deterministic function with the same signature a real model wrapper would have.
STOP = {"a", "an", "the", "to", "of", "and", "or", "in", "on", "at", "for", "is", "are", "be", "can", "you", "your", "my",
        "i", "do", "how", "with", "from", "by", "it", "we", "our", "when", "if", "any", "up", "so"}

def tokens(text):
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOP]

def hashed(features, d):
    v = np.zeros(d)
    for f in features:
        h = zlib.crc32(f.encode())                    # crc32 is stable across runs (Python's hash() is not)
        v[h % d] += 1.0 if (h >> 16) & 1 else -1.0    # signed feature hashing
    return v

def random_embed(texts, d=64, seed=0):
    """Floor: a fixed random vector per text. Any real model must beat this."""
    return np.array([np.random.default_rng([zlib.crc32(t.encode()), seed]).normal(size=d) for t in texts])

def bow_embed(texts, d=512):
    """Stand-in for 'keyword-like' retrieval: hashed bag of words. Cannot match words that differ."""
    return np.array([hashed(tokens(t), d) for t in texts])

def char3_embed(texts, d=512):
    """Stand-in for 'subword-aware' retrieval: hashed character trigrams. Tolerates typos and word endings."""
    def grams(t):
        out = []
        for w in tokens(t):
            w = f" {w} "
            out += [w[i:i + 3] for i in range(len(w) - 2)]
        return out
    return np.array([hashed(grams(t), d) for t in texts])

CONCEPTS = {  # a tiny hand-written 'meaning' map. Real models learn this from data; this one was written for THIS toy set.
    "AUTH": ["password", "credentials", "login", "logging", "sign", "authentication", "protection", "security"],
    "MONEY": ["refunds", "refund", "money", "payment", "paying", "pay", "card", "billing", "invoices", "bills", "credit", "declined"],
    "STOP": ["cancel", "stop", "unsubscribe"],
    "SPACE": ["storage", "space"],
    "OFFLINE": ["offline", "internet", "reconnect"],
    "DELETE": ["deleted", "deleting", "restore", "recover", "accident", "trash"],
    "HUMAN": ["support", "human", "chat", "contact", "talk"],
    "TRIAL": ["trial", "try", "free"],
    "EU": ["europe", "eu"],
    "BREAK": ["fails", "breaks", "failed", "broken"],
}
WORD2CONCEPT = {w: c for c, ws in CONCEPTS.items() for w in ws}

def concept_embed(texts, d=512):
    """Stand-in for a 'semantic' model: words map to shared concepts before hashing. Hand-built, so it flatters itself here."""
    return np.array([hashed([WORD2CONCEPT.get(t, t) for t in tokens(x)], d) for x in texts])

embedders = {"random": random_embed, "bag-of-words": bow_embed, "char-3grams": char3_embed, "concept-map": concept_embed}
```

No output. `concept_embed` was written *after* reading the gold set, so it is tuned to this toy data and a real model could not be expected to match it; its job is to play the part of "an embedder that understands paraphrase" so the table has something to show.

### 4. Run the harness, with chance level, a breakdown and error bars

```python
results = {name: evaluate(fn, docs, queries, relevant) for name, fn in embedders.items()}

print(f"{'embedder (STAND-IN)':<20}{'recall@1':>9}{'recall@3':>9}{'recall@5':>9}{'MRR':>8}")
for name, r in results.items():
    print(f"{name:<20}{r['recall@1']:9.2f}{r['recall@3']:9.2f}{r['recall@5']:9.2f}{r['mrr']:8.2f}")

chance = [evaluate(lambda t, s=s: random_embed(t, seed=s), docs, queries, relevant) for s in range(200)]
print("\naverage over 200 different random embedders:",
      f"recall@1 = {np.mean([c['recall@1'] for c in chance]):.2f}, recall@5 = {np.mean([c['recall@5'] for c in chance]):.2f}",
      f"(pure chance: 1/{len(docs)} = {1 / len(docs):.2f} and 5/{len(docs)} = {5 / len(docs):.2f})")

print("\nrecall@1 by query kind (fraction of queries whose single best result is relevant):")
print(f"{'':<20}" + "".join(f"{k:>12}" for k in dict.fromkeys(kinds)))
for name, r in results.items():
    first = np.array(r["first_rank"])
    row = [np.mean(first[[i for i, k in enumerate(kinds) if k == kind]] == 1) for kind in dict.fromkeys(kinds)]
    print(f"{name:<20}" + "".join(f"{v:12.2f}" for v in row))

def bootstrap_interval(first_rank, n_boot=2000, seed=0):
    """95% bootstrap interval for recall@1: resample the QUERIES with replacement."""
    hits = (np.array(first_rank) == 1).astype(float)
    rng = np.random.default_rng(seed)
    means = [hits[rng.integers(0, len(hits), len(hits))].mean() for _ in range(n_boot)]
    return np.percentile(means, [2.5, 97.5])

print("\nrecall@1 with a 95% bootstrap interval over the 22 queries:")
for name, r in results.items():
    lo, hi = bootstrap_interval(r["first_rank"])
    print(f"{name:<20}{r['recall@1']:.2f}   [{lo:.2f}, {hi:.2f}]")

def paired_difference(rank_a, rank_b, n_boot=2000, seed=0):
    """Same resampled queries for both systems: bootstrap interval for (recall@1 of A) - (recall@1 of B)."""
    a, b = (np.array(rank_a) == 1).astype(float), (np.array(rank_b) == 1).astype(float)
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n_boot):
        idx = rng.integers(0, len(a), len(a))
        diffs.append(a[idx].mean() - b[idx].mean())
    return a.mean() - b.mean(), np.percentile(diffs, [2.5, 97.5])

print("\npaired recall@1 difference (same queries for both systems), with 95% interval:")
for x, y in [("concept-map", "char-3grams"), ("char-3grams", "bag-of-words")]:
    diff, (lo, hi) = paired_difference(results[x]["first_rank"], results[y]["first_rank"])
    print(f"{x} minus {y}: {diff:+.2f}  [{lo:+.2f}, {hi:+.2f}]")

worst = results["concept-map"]["first_rank"]
print("\nconcept-map: queries whose first relevant document is not ranked first:")
for q, rk in zip(queries, worst):
    if rk > 1:
        print(f"  rank {rk:>2}  {q!r}")
```

```
embedder (STAND-IN)  recall@1 recall@3 recall@5     MRR
random                   0.07     0.11     0.41    0.22
bag-of-words             0.36     0.48     0.48    0.47
char-3grams              0.41     0.50     0.64    0.54
concept-map              0.73     0.91     0.95    0.85

average over 200 different random embedders: recall@1 = 0.04, recall@5 = 0.21 (pure chance: 1/24 = 0.04 and 5/24 = 0.21)

recall@1 by query kind (fraction of queries whose single best result is relevant):
                      paraphrase     lexical        typo
random                      0.00        0.29        0.00
bag-of-words                0.15        0.86        0.50
char-3grams                 0.15        1.00        0.50
concept-map                 0.77        0.86        0.50

recall@1 with a 95% bootstrap interval over the 22 queries:
random              0.07   [0.00, 0.23]
bag-of-words        0.36   [0.23, 0.59]
char-3grams         0.41   [0.27, 0.64]
concept-map         0.73   [0.59, 0.91]

paired recall@1 difference (same queries for both systems), with 95% interval:
concept-map minus char-3grams: +0.32  [+0.09, +0.55]
char-3grams minus bag-of-words: +0.05  [+0.00, +0.14]

concept-map: queries whose first relevant document is not ranked first:
  rank  2  'how do I get my money back'
  rank  2  'extra protection when logging in'
  rank  4  'where can I find my bills'
  rank  2  'rate limit for the API'
  rank 24  'refnd time'
```

How to read this (about the harness, not about models):

- **Know the chance level.** The single random embedder got recall@5 of 0.41, but that was a lucky draw: averaged over 200 random embedders it is 0.21, exactly `5/24`. On a small gold set even the floor wobbles.
- **The breakdown is where the information is.** Bag-of-words and char-3grams look almost identical overall (0.36 vs 0.41 recall@1) but both solve almost none of the paraphrase queries (0.15) and nearly all of the exact-term ones; the stand-in that "knows" paraphrases wins on those (0.77). A choice made from the overall average alone would hide this.
- **Compare on the same queries.** The single-model intervals overlap heavily (bag-of-words [0.23, 0.59], char-3grams [0.27, 0.64]), but overlap alone does not settle it, so the paired bootstrap resamples the queries once and compares both systems on them. The concept map's lead over char-3grams (+0.32, interval [+0.09, +0.55]) is probably real; char-3grams over bag-of-words (+0.05, interval [+0.00, +0.14]) reaches zero, so there is no evidence of a difference with 22 queries.
- **Tie-breaking is doing real work.** Bag-of-words recall@3 and recall@5 are both 0.48: a query that shares no word with its right document scores exactly 0 against every document, all scores tie, and the pessimistic rule puts the relevant document last (rank 24). Exercise 2 shows what the optimistic rule would have reported.
- `refnd time` gets rank 24 with the concept map: no typo tolerance and no shared feature, so every score ties at 0 again. Looking at the failures one by one is worth more than the average.

### 5. Truncating vectors: what decides whether it works

```python
def unit(M):
    return M / np.linalg.norm(M, axis=1, keepdims=True)

def top_k(Q, D, k=10):
    S = Q @ D.T
    idx = np.argpartition(-S, k, axis=1)[:, :k]
    return np.take_along_axis(idx, np.argsort(-np.take_along_axis(S, idx, axis=1), axis=1), axis=1)

d, n_docs, n_q = 256, 5000, 500
rng = np.random.default_rng(0)
scale = np.exp(-np.arange(d) / 32)                     # per-coordinate spread: big in the first coordinates, tiny later
D_front, Q_front = unit(rng.normal(size=(n_docs, d)) * scale), unit(rng.normal(size=(n_q, d)) * scale)
R, _ = np.linalg.qr(rng.normal(size=(d, d)))           # a random rotation: changes coordinates, not geometry
D_rot, Q_rot = D_front @ R, Q_front @ R
D_flat, Q_flat = unit(rng.normal(size=(n_docs, d))), unit(rng.normal(size=(n_q, d)))
sets = {"front": (D_front, Q_front), "rotated": (D_rot, Q_rot), "spread": (D_flat, Q_flat)}
full = {name: top_k(Q, D) for name, (D, Q) in sets.items()}      # ground truth: exact search with all 256 dimensions

print("rotation check: same full-vector top-10 before and after rotating?",
      bool(np.mean([set(a) == set(b) for a, b in zip(full['front'], top_k(Q_rot, D_rot))]) == 1.0))

def overlap(found, truth):
    return float(np.mean([len(set(a) & set(b)) / len(b) for a, b in zip(found, truth)]))

print("\n   m  bytes/vec  variance |  front-loaded   | rotated | spread | front, NOT")
print("     (float32)  kept      |  ov@10   top1   |  ov@10  | ov@10  | renormalized")
for m in (256, 128, 64, 32, 16, 8):
    cols = {}
    for name, (D, Q) in sets.items():
        found = top_k(unit(Q[:, :m]), unit(D[:, :m]))                    # truncate, then renormalize to length 1
        cols[name] = (overlap(found, full[name]), float(np.mean(found[:, 0] == full[name][:, 0])))
    raw = overlap(top_k(Q_front[:, :m], D_front[:, :m]), full["front"])   # truncate only (dot product on shorter vectors)
    kept = (scale[:m] ** 2).sum() / (scale ** 2).sum()
    print(f"{m:4d}  {4 * m:8d}  {kept:7.2f}  |  {cols['front'][0]:.2f}   {cols['front'][1]:.2f}   |  {cols['rotated'][0]:.2f}   | {cols['spread'][0]:.2f}   | {raw:.2f}")
```

```
rotation check: same full-vector top-10 before and after rotating? True

   m  bytes/vec  variance |  front-loaded   | rotated | spread | front, NOT
     (float32)  kept      |  ov@10   top1   |  ov@10  | ov@10  | renormalized
 256      1024     1.00  |  1.00   1.00   |  1.00   | 1.00   | 1.00
 128       512     1.00  |  1.00   1.00   |  0.59   | 0.19   | 1.00
  64       256     0.98  |  0.96   0.93   |  0.37   | 0.07   | 0.96
  32       128     0.86  |  0.75   0.57   |  0.21   | 0.03   | 0.77
  16        64     0.63  |  0.38   0.20   |  0.09   | 0.01   | 0.43
   8        32     0.39  |  0.13   0.03   |  0.04   | 0.01   | 0.18
```

`ov@10` is the share of the exact full-dimension top-10 that the truncated search also returns (a recall measured against full-vector search), and `top1` is how often both agree on the single best document. Three sets of 5,000 unit-length "document" vectors and 500 queries are compared:

- **front-loaded**: variation concentrated in the first coordinates, which is the property Matryoshka training aims to give. Keeping 64 of 256 dimensions (a quarter of the storage) keeps 96% of the top-10 and 93% of the top-1 choices.
- **rotated**: the *same* vectors multiplied by a random rotation. The first line of output confirms the full-vector neighbours are unchanged (rotation preserves all angles), yet truncating to 64 dimensions now keeps only 37%. The geometry is identical; only the coordinate system changed. This is why an ordinary model's vector cannot be assumed truncatable: nothing made its early coordinates special.
- **spread**: variation equal in every coordinate; truncation loses roughly in proportion to what is cut, and at 64 dimensions 7% survives.

The last column answers a question the checklist raises. Skipping renormalisation (plain dot product of the truncated vectors) did **not** hurt the overlap with the full ranking here; it was marginally better (0.77 vs 0.75 at 32 dimensions), because a partial dot product is itself an estimate of the full dot product. So do not expect renormalising to improve retrieval quality. Renormalise because it makes scores true cosines of the truncated vectors (comparable across queries, usable with thresholds) and because indexes configured for unit-length vectors assume it.

### 6. Shortlist with the prefix, re-rank with the full vector; and why you cannot mix models

```python
def funnel(Q, D, m, shortlist, k=10):
    """Stage 1: cheap search with the first m dimensions -> shortlist. Stage 2: re-rank the shortlist with all dimensions."""
    cand = top_k(unit(Q[:, :m]), unit(D[:, :m]), shortlist)
    out = []
    for qi in range(len(Q)):
        s = D[cand[qi]] @ Q[qi]
        out.append(cand[qi][np.argsort(-s)[:k]])
    return np.array(out)

print("shortlist of 100 by the first m dims, then exact re-rank (full-search top-10 is the target):")
print("   m   front-loaded ov@10 / top1   rotated ov@10 / top1   spread ov@10 / top1")
for m in (64, 32, 16):
    cells = []
    for name, (D, Q) in sets.items():
        found = funnel(Q, D, m, shortlist=100)
        cells.append(f"{overlap(found, full[name]):.2f} / {np.mean(found[:, 0] == full[name][:, 0]):.2f}")
    print(f"{m:4d}   {cells[0]:>24}   {cells[1]:>20}   {cells[2]:>18}")

mixed = top_k(Q_rot, D_front)           # queries embedded by 'model B' (rotated), documents by 'model A' (original)
print("\nqueries from the rotated space against documents from the original space: overlap@10 =",
      round(overlap(mixed, full["front"]), 3))
```

```
shortlist of 100 by the first m dims, then exact re-rank (full-search top-10 is the target):
   m   front-loaded ov@10 / top1   rotated ov@10 / top1   spread ov@10 / top1
  64                1.00 / 1.00            0.88 / 0.97          0.31 / 0.43
  32                1.00 / 1.00            0.64 / 0.82          0.17 / 0.23
  16                0.93 / 0.99            0.39 / 0.53          0.09 / 0.13

queries from the rotated space against documents from the original space: overlap@10 = 0.0
```

> [!example] With a front-loaded vector, a 32-dimension first pass (one eighth of the storage to scan) plus a re-rank of 100 candidates recovers the exact top-10 completely; the same shortlist size on the rotated or spread vectors misses much of it. This is the adaptive-retrieval idea from the Matryoshka paper, shown on synthetic data.
> The final line is the lock-in warning in miniature: "model A" and "model B" encode identical geometry, and mixing their vectors returns essentially nothing correct (0.0 where chance would be 0.002). Vectors from different models, or the same model with different truncation, belong in different indexes.

## Visual diagram

```
 MODEL SELECTION PIPELINE

 ┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐    RECORD NEXT TO THE VECTORS
 │ 1 hard constraints    │    │ 2 gold set from YOUR  │    │ 3 one harness for all │
 │ licence, hosting,     │──► │ data: queries plus    │──► │ candidates: recall@k, │    - model name + version
 │ languages, length     │    │ the right documents   │    │ MRR, per-kind scores  │    - query / document prefixes
 └───────────────────────┘    └───────────────────────┘    └───────────┬───────────┘    - truncation + normalisation
                                                                       ▼                - gold-set version + date
 ┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
 │ 6 decide; store the   │    │ 5 is the gap bigger   │    │ 4 latency + cost on   │
 │ record next to the    │◄── │ than the error bars?  │◄── │ your hardware or      │
 │ vectors               │    │ (paired bootstrap)    │    │ your vendor           │
 └───────────────────────┘    └───────────────────────┘    └───────────────────────┘

  WHERE THE INFORMATION SITS IN THE COORDINATES  (same geometry, different basis)

   front-loaded: [██████████▓▓▓▓▒▒▒░░░░░ . . . ]   first m coordinates carry most of it  -> prefix is usable
                  1                          256
   rotated:      [▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒]   spread over all coordinates            -> cutting loses it

   truncate to m, then renormalise:   v[:m] / |v[:m]|     (same index, same model, same m for queries and documents)
```

## Practice

### 1. Size the index

For 10 million documents, how many GB of float32 vectors do dimensions 384, 768, 1536 and 3072 take (decimal GB, 1 GB = 10^9 bytes), and how much does truncating each to 256 save?

<details><summary>Answer</summary>

`10_000_000 * d * 4 / 1e9` gives 15.36, 30.72, 61.44 and 122.88 GB. At 256 dimensions every case is 10.24 GB, saving 33%, 67%, 83% and 92%. This is the raw vectors only, before index structures, replicas or metadata (Modules 14-16). Whether the truncation is *allowed* for a given model is a separate question for the harness.

</details>

### 2. Break the harness on purpose

Replace the tie rule in `score_vectors` with `order = np.argsort(-S[qi], kind="stable")` (ties resolved by document order) and re-run block 4. What changes, and for which embedder?

<details><summary>Answer</summary>

Bag-of-words moves from recall@5 0.48 to 0.75 and MRR from 0.47 to 0.57; concept-map recall@5 moves from 0.95 to 1.00; the random and char-3grams rows are unchanged, and recall@1 is unchanged everywhere.
The cause is the exact ties: when every score is 0 the relevant document is ranked by its index alone, so some queries "succeed" by luck of position. An evaluation that can reward a system for returning nothing useful is broken; pessimistic ties remove the incentive.

</details>

### 3. Cut the wrong end

In block 5, truncate to the *last* `m` coordinates instead of the first, renormalise, and compute `overlap` against `full["front"]` for `m` in 128, 64, 32, 16.

<details><summary>Answer</summary>

The overlap is 0.0 at every size. The last coordinates of the front-loaded set have almost no variance, so after renormalising they say nothing about which documents are close in the full space.
Truncation only works when the information is placed where you keep it, which is why it is a property to verify per model, not a universal trick.

</details>

### Checkpoint quiz

1. Why is "pick the model at the top of the MTEB leaderboard" not a decision procedure?
2. A teammate embeds documents with the model's document prefix but forgets the query prefix. What is the symptom?
3. In block 5, why does rotating the vectors change truncation results but not full-vector neighbours?
4. Why does the harness break ties against the system?
5. Your gold set has 30 queries and model A beats model B by 4 points of recall@1. What do you do?

<details><summary>Answers</summary>

1. The benchmark averages over tasks, datasets and languages that are not yours, over-weights tasks with many datasets, lacks very long documents, says nothing about cost or licence, and its authors found no method that wins everywhere.
2. No error; shapes and scores look normal, but retrieval is worse than it should be. You find it only by evaluating, which is why prefixes are applied in one place and checked on a gold set.
3. A rotation preserves all angles and lengths, so full-vector similarities are unchanged, but it mixes the coordinates together, spreading the information that was concentrated in the first ones; a prefix then holds less of it.
4. Otherwise a system returning identical scores (for example all zeros) is rewarded or punished by document order, which has nothing to do with embedding quality.
5. Compute a bootstrap interval; with 30 queries a 4-point gap is almost certainly noise. Add queries, or choose on the other criteria (cost, latency, licence) instead of on that gap.

</details>

> [!check]
> - I can list the criteria for comparing embedding models and explain why each matters
> - I can name what MTEB measures and three things it does not tell me
> - I can run any embed function through a recall@k / MRR harness and report error bars
> - I can explain when truncating a vector is safe and why I must still renormalise

## Project

Build the evaluation for a retrieval task you care about. Collect at least 50 real documents (your notes, FAQs or docs) and write at least 40 queries with their relevant documents, tagged by kind (paraphrase, exact term, typo, multi-document). Wrap two or more real embedding options behind the `embed(texts)` signature (for example a local open-weight model and a hosted API, or two sizes of one family), and extend the harness to record latency per 1,000 documents.
Report recall@k, MRR and bootstrap intervals per query kind, state the chance level, and decide, including what you would need to change your mind. No code or solution is provided: the deliverable is a recommendation that someone else could re-run.

## Interview questions

> [!interview] How would you choose an embedding model for a new retrieval system?

<details><summary>What a strong answer covers</summary>

Cut by hard constraints first (licence, hosted versus self-hosted and data privacy, languages, input length, dimension and budget). Then build a labelled gold set from real queries and documents, run all candidates through one harness with recall@k/MRR, break results down by query type, add bootstrap intervals, measure latency and cost, and check query/document prefix requirements.
Use public benchmarks only to build the shortlist. Record the model, version, prefix and truncation alongside the vectors and plan for the re-embedding cost of any future change.

</details>

> [!interview] What does MTEB tell you, and what does it not?

<details><summary>What a strong answer covers</summary>

It gives a broad, standardised comparison over 8 task types, 58 datasets and many languages, with an open-source runner. It does not cover very long documents, its average is weighted toward task types with many datasets, language coverage outside English is limited, it ignores cost, latency and licence, scores are averages that hide per-task weaknesses, and public data may overlap with training.
It narrows candidates; your own labelled data decides.

</details>

> [!interview] A vendor says its model supports Matryoshka truncation. How do you use that safely?

<details><summary>What a strong answer covers</summary>

Confirm it from the model documentation, since only models trained for it have useful prefixes. Truncate to the first `m` coordinates, renormalise to unit length, and apply the same `m` to queries and documents. Measure recall against the full vector on your gold set at each candidate `m`, not on a public benchmark, and consider a two-stage search (shortlist with the prefix, re-rank with the full vector).
Remember the storage and speed saving is linear in `m`, store `m` in the index metadata, and never mix truncation levels in one index.

</details>

## Common mistakes & troubleshooting

- **Retrieval is mysteriously worse than the model card suggests.** Check the query and document prefixes first, then input truncation (are documents longer than the model's limit?), then whether queries and documents went through the same normalisation.
- **Recall looks great, but only for some queries.** Check whether failing queries score identically (for example all 0) against every document; with optimistic tie handling these hide in the average (Exercise 2).
- **Two models differ by a few points and you cannot decide.** Compute a bootstrap interval or a paired difference; if it spans zero, you have no evidence. Add queries or decide on cost and licence.
- **Scores from a truncated index are on a different scale than before.** You forgot to renormalise after truncating.
- **Search returns nonsense after switching model.** Old vectors and new queries come from different spaces (block 6). Re-embed everything and rebuild the index; never mix.

## Further reading & sources

- [MTEB: Massive Text Embedding Benchmark (Muennighoff et al., 2022)](https://arxiv.org/abs/2210.07316) - the benchmark paper: task types, metrics, the "no method dominates" finding, and the appendix on limitations cited above.
- [MTEB Leaderboard (Hugging Face Space)](https://huggingface.co/spaces/mteb/leaderboard) - the live leaderboard; this module quotes no rankings because they change, so read it directly and treat it as a shortlist generator.
- [embeddings-benchmark/mteb on GitHub](https://github.com/embeddings-benchmark/mteb) - the open-source benchmark code for running chosen tasks on your own model.
- [Matryoshka Representation Learning (Kusupati et al., 2022)](https://arxiv.org/abs/2205.13147) - the method behind truncatable embeddings, including the adaptive-retrieval idea and the note on per-size normalisation.
- [Text Embeddings by Weakly-Supervised Contrastive Pre-training (Wang et al., 2022)](https://arxiv.org/abs/2212.03533) - the E5 paper, source of the "query:" / "passage:" prefix design and the note that the asymmetry matters for some retrieval tasks.
- [Sentence Transformers documentation: Usage](https://www.sbert.net/docs/sentence_transformer/usage/usage.html) - documents `encode()`, `similarity()` and the prompt-aware `encode_query()` / `encode_document()`.
- [Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks (Reimers and Gurevych, 2019)](https://arxiv.org/abs/1908.10084) - the origin of the bi-encoder recipe that most models in this comparison follow.

## Next

[Module 03: Cosine Similarity and Distance Metrics](../03-cosine-similarity-and-distance-metrics/README.md)
