# Module 01: From Word2Vec to Sentence Embeddings

## Roadmap

[Module 00](../00-what-an-embedding-is/README.md) built word vectors by counting. This module learns them the way word2vec does, by prediction, and trains the real algorithm (skip-gram with negative sampling) in plain numpy.
The word2vec *story* (the distributional idea, the famous analogies) is in [Track 00, Module 03](../../00-genai-foundations/03-word2vec-and-the-embedding-revolution/README.md) and is not repeated.
Here you watch the loss fall, check the neighbours, and then find the wall word vectors hit: they cannot represent a sentence, or a word with two meanings. That wall is why retrieval uses *contextual* models and *bi-encoder* sentence embeddings,
whose architecture is taught in [Track 03, Module 05](../../03-landmark-models-bert-gpt-and-moe/05-sentence-transformers-and-bi-encoders/README.md) (BERT itself: [Module 01](../../03-landmark-models-bert-gpt-and-moe/01-bert-masked-language-modeling/README.md) and [Module 02](../../03-landmark-models-bert-gpt-and-moe/02-bert-architecture-deep-dive/README.md) there).

After this module you can write and debug a negative-sampling trainer, explain what the loss measures, show concretely why averaging word vectors fails, and explain in one breath why modern search embeds whole sentences with a model trained for it.
Next: [Module 02](../02-embedding-models-compared/README.md) compares embedding models.

## Concept

> [!key] Word2vec learns a vector per word by training a tiny classifier to tell real neighbours from random words, then keeping the weights. One vector per word means a sentence built from them forgets word order and context, and a word like "bank" gets a single compromise vector. Contextual models, fine-tuned as bi-encoders on sentence pairs, are the fix.

## Explanation

### Predict the neighbours, keep the weights

Skip-gram slides a window over text. For each **centre** word, the words within the window are its **contexts**. From `the customer opened an account at the bank` with a window of 2, the centre word `opened` yields the pairs
`(opened, the)`, `(opened, customer)`, `(opened, an)`, `(opened, account)`. Training adjusts vectors so that each real pair scores high. The prediction task is a pretext; the vectors are what you keep.

### Negative sampling: one huge question becomes k+1 small yes/no questions

Asking "which of the V vocabulary words is the context?" needs a softmax over every word for every pair, which is expensive. Negative sampling replaces it with logistic regression:
for each real pair `(w, c)` (label 1) draw `k` random **noise** words `n` (label 0), and minimise `loss = -log sigmoid(w . c) - sum over the k noise words n of log sigmoid(-w . n)`.
`sigmoid` squashes a dot product into (0, 1). The first term rewards a large `w . c`; the second rewards small `w . n`. Details from the paper (Mikolov et al., 2013, "Distributed Representations of Words and Phrases and their Compositionality", linked below),
which I read for this module: noise words are drawn from the unigram frequency distribution raised to the power 3/4, which the authors found worked significantly better than plain frequency or uniform; and `k` of 5 to 20 is useful for small datasets, 2 to 5 for large ones.

Each word gets **two** vectors: one used when it is the centre, one when it is a context. Training updates both; afterwards you keep the centre vectors and discard the context ones.

> [!model] Each training step is a small party game: a real neighbour must score high, five strangers must score low. Words that keep the same friends end up with similar vectors, because the same set of context vectors has to rate both of them highly.

### What real word2vec does that this module skips

The paper also **subsamples** very frequent words (it discards them with a probability that grows with their frequency, with a threshold typically around 10^-5), and the first word2vec paper reports learning vectors from a 1.6-billion-word corpus in under a day. Ours has no subsampling and 23k tokens, and trains in mini-batches with a fixed window.
Treat the results below as a demonstration that the algorithm works, not as a measure of its quality.

### Why averaging word vectors is a weak sentence embedding

The classic way to get a sentence vector from word vectors is to average them. Averaging is **commutative**: shuffle the words and the result is identical. That causes three problems:

- **Order is lost.** "The customer approved the loan" and "the loan approved the customer" get exactly the same vector.
- **Small, decisive words barely register.** "not" is one word among many; one extra vector in the average moves it little.
- **Meaning is not context-dependent.** Each word contributes its fixed, all-contexts vector, so ambiguity is baked in.

### Polysemy: one spelling, one vector

A word2vec model has one row per word, so `bank` (the lender) and `bank` (the side of a river) share it. During training the row is pulled toward both sets of neighbours and ends up as a blend, near neither meaning. You will measure that below.

### Contextual embeddings

A **contextual** model computes a word's vector from the whole sentence, so `bank` in two sentences gets two different vectors. ELMo (Peters et al., 2018) did this, computing representations from "learned functions of the internal states of a deep bidirectional language model" (its abstract);
BERT (Devlin et al., 2018) did it with a Transformer ([Track 03, Module 01](../../03-landmark-models-bert-gpt-and-moe/01-bert-masked-language-modeling/README.md)). [Track 00, Module 06](../../00-genai-foundations/06-the-transformer-moment/README.md) shows the `bank` effect with a real model.

### Sentence embeddings: a model trained to make whole sentences comparable

Contextual token vectors are not automatically good *sentence* vectors. The Sentence-BERT paper (Reimers and Gurevych, 2019) measured this: it computed cosine similarity between sentence vectors and checked rank correlation (Spearman, times 100) with human similarity ratings, averaged over seven semantic textual similarity datasets (its Table 1).

| Method (no task-specific tuning for the first three) | Average score |
|---|---|
| Average of GloVe word vectors | 61.32 |
| Average of raw BERT output vectors | 54.81 |
| Raw BERT `[CLS]` vector | 29.19 |
| SBERT-NLI-base (fine-tuned) | 74.89 |

So *averaging a contextual model's outputs* still lost to averaging old static word vectors; only fine-tuning the model for sentence similarity, with a siamese setup trained on sentence pairs, fixed it.
The result is a **bi-encoder**: each text goes through the encoder *independently* and becomes one vector, so you can embed every document once, store the vectors, and at query time embed only the query. The paper states the practical gain: finding the most similar pair in 10,000 sentences takes about 65 hours with BERT's pairwise approach
and about 5 seconds with SBERT, on its hardware. The cached-vector trick is exactly what vector databases (later in this track) exploit. Track 03 Module 05 measures it and contrasts it with cross-encoders, so it is not repeated here.

What changed besides the architecture is the **training signal**. Word2vec uses "this word appeared near that one". Sentence embedding models train on pairs of texts that should be close (SBERT used natural language inference pairs; E5, in Module 02's reading, used weakly supervised text pairs), so "close" means "means the same thing or answers the question", which is what search needs.

## Code

Only `numpy` and the standard library; paste the blocks in order into one file. Everything is seeded, so your output should match this page. The corpus is made-up and tiny, which flatters the method (clean domains) and starves it (23k tokens), so judge the shape of the results, not the exact numbers.

### 1. A corpus with one deliberately ambiguous word

```python
import random
import numpy as np

rng = random.Random(1)

PERSON = ["customer", "teller", "manager", "clerk"]
MONEY = ["money", "cash", "loan", "deposit", "mortgage", "savings", "interest"]
WATER = ["river", "stream", "water", "mud", "reeds", "grass", "shore"]
CREATURE = ["fish", "heron", "fisherman", "boat"]
BAKING = ["bread", "flour", "dough", "butter", "cake"]

def finance():
    p, m, m2 = rng.choice(PERSON), rng.choice(MONEY), rng.choice(MONEY)
    return rng.choice([
        f"the {p} opened an account at the bank",
        f"the bank approved the {m} for the {p}",
        f"the {p} counted the {m} at the bank",
        f"she kept the {m} in her account",
        f"the {p} said the {m} was not approved",
        f"the {m} and the {m2} were safe in the account",
    ])

def river():
    c, w, w2 = rng.choice(CREATURE), rng.choice(WATER), rng.choice(WATER)
    return rng.choice([
        f"the {c} stayed near the {w} bank",
        f"the {c} sat on the bank of the {w}",
        f"the {w} washed the {w2} from the bank",
        f"the {w} and the {w2} met along the shore",
        f"the {c} watched the {w} flow past",
        f"the {c} was not near the {w}",
    ])

def kitchen():
    b, b2 = rng.choice(BAKING), rng.choice(BAKING)
    return rng.choice([
        f"the baker mixed the {b} in a bowl",
        f"she baked the {b} in the oven",
        f"the {b} was warm and soft",
        f"he cut the {b} with a knife",
        f"the {b} and the {b2} were not ready",
    ])

domains = {"finance": finance, "river": river, "kitchen": kitchen}
tagged = [(d, domains[d]().split()) for d in (rng.choice(list(domains)) for _ in range(3000))]
corpus = [s for _, s in tagged]
vocab = sorted({w for s in corpus for w in s})
w2i = {w: i for i, w in enumerate(vocab)}
V = len(vocab)
counts = np.zeros(V)
for s in corpus:
    for w in s:
        counts[w2i[w]] += 1

print("sentences:", len(corpus), "| tokens:", int(counts.sum()), "| vocabulary:", V)
print("'bank' in finance sentences:", sum(s.count("bank") for d, s in tagged if d == "finance"),
      "| in river sentences:", sum(s.count("bank") for d, s in tagged if d == "river"))

window = 2
pairs = []
for s in corpus:
    ids = [w2i[w] for w in s]
    for pos, c in enumerate(ids):
        for off in range(-window, window + 1):
            if off != 0 and 0 <= pos + off < len(ids):
                pairs.append((c, ids[pos + off]))        # (centre word, one context word)
pairs = np.array(pairs)
print("training pairs (centre, context):", pairs.shape)
```

```
sentences: 3000 | tokens: 23278 | vocabulary: 71
'bank' in finance sentences: 493 | in river sentences: 519
training pairs (centre, context): (75112, 2)
```

`bank` appears about equally often in finance sentences (493) and river sentences (519), so neither meaning is a rare special case.

### 2. Check the gradient before trusting the trainer

```python
def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))

# Loss for ONE training pair: w = centre vector, c = true context vector, negs = k noise-word vectors.
def pair_loss(w, c, negs):
    return -np.log(sigmoid(w @ c)) - np.log(sigmoid(-(negs @ w))).sum()

# Check the gradient we will use in training against finite differences before trusting it.
rg = np.random.default_rng(0)
w, c, negs = rg.normal(size=8), rg.normal(size=8), rg.normal(size=(5, 8))
analytic = (sigmoid(w @ c) - 1) * c + (sigmoid(negs @ w)[:, None] * negs).sum(axis=0)
numeric = np.array([(pair_loss(w + e, c, negs) - pair_loss(w - e, c, negs)) / 2e-6 for e in np.eye(8) * 1e-6])
print("max |analytic - numeric| for d loss / d w:", float(np.abs(analytic - numeric).max()))
```

Output: `max |analytic - numeric| for d loss / d w: 1.4061152242561548e-09`

A hand-derived gradient with a sign error still gives a "loss going down" curve sometimes; agreement to 1e-9 with a numerical estimate is a much stronger signal. The formulas are `(sigmoid(w.c) - 1) * c` for the true context and `sigmoid(w.n) * n` for each noise word.

### 3. Train skip-gram with negative sampling

```python
def train_sgns(pairs, V, counts, dim=16, k_neg=5, epochs=30, lr=0.05, batch=128, seed=0):
    """Skip-gram with negative sampling. For each (centre w, true context c) pair, pull w and c together
    and push w away from k_neg random 'noise' words. Loss per pair:
        -log sigmoid(w . c)  -  sum over noise words n of  log sigmoid(-w . n)
    """
    rng = np.random.default_rng(seed)
    W = (rng.random((V, dim)) - 0.5) / dim        # centre-word vectors: small random start (these are kept)
    Cx = np.zeros((V, dim))                       # context-word vectors: start at zero (discarded afterwards)
    noise = counts ** 0.75
    noise /= noise.sum()                          # noise distribution: unigram frequency ^ 0.75
    history = []
    for ep in range(epochs):
        step_lr = lr * (1 - ep / epochs) + 1e-4   # simple linear decay
        total = 0.0
        for s in range(0, len(pairs), batch):
            b = pairs[s:s + batch]
            c, o = b[:, 0], b[:, 1]
            neg = rng.choice(V, size=(len(b), k_neg), p=noise)
            w = W[c]
            pos = np.einsum("bd,bd->b", w, Cx[o])
            ngs = np.einsum("bd,bkd->bk", w, Cx[neg])
            total += -np.log(sigmoid(pos)).sum() - np.log(sigmoid(-ngs)).sum()
            g_pos = sigmoid(pos) - 1.0            # d loss / d (w . c)
            g_neg = sigmoid(ngs)                  # d loss / d (w . n)
            grad_w = g_pos[:, None] * Cx[o] + np.einsum("bk,bkd->bd", g_neg, Cx[neg])
            np.add.at(Cx, o, -step_lr * g_pos[:, None] * w)
            np.add.at(Cx, neg, -step_lr * g_neg[:, :, None] * w[:, None, :])
            np.add.at(W, c, -step_lr * grad_w)
        history.append(total / len(pairs))
    return W, history

pairs = pairs[np.random.default_rng(0).permutation(len(pairs))]    # shuffle once so batches mix all domains
W, history = train_sgns(pairs, V, counts)
print("loss before any learning (context vectors all zero): (1 + 5) * ln 2 =", round(6 * np.log(2), 3))
for ep in (0, 1, 2, 4, 9, 14, 19, 24, 29):
    print(f"epoch {ep + 1:2d}  mean loss per pair = {history[ep]:.3f}")
```

```
loss before any learning (context vectors all zero): (1 + 5) * ln 2 = 4.159
epoch  1  mean loss per pair = 2.566
epoch  2  mean loss per pair = 2.434
epoch  3  mean loss per pair = 2.401
epoch  5  mean loss per pair = 2.326
epoch 10  mean loss per pair = 2.145
epoch 15  mean loss per pair = 1.972
epoch 20  mean loss per pair = 1.836
epoch 25  mean loss per pair = 1.774
epoch 30  mean loss per pair = 1.745
```

The loss falls steadily from the theoretical starting point. With all context vectors at zero every score is 0, `sigmoid(0)` is 0.5, and each of the `1 + k` terms costs `ln 2`, so the first batch starts at `(1 + 5) * ln 2 = 4.159`.
Epoch 1's average (2.566) is already lower because it includes learning during the epoch. The loss cannot reach 0: a word's neighbours vary from sentence to sentence, and the noise words are random.

### 4. Do the neighbours make sense?

```python
def cosine(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))

def neighbours(word, k=5, vecs=None):
    vecs = W if vecs is None else vecs
    q = vecs[w2i[word]]
    scored = sorted(((w, cosine(q, vecs[w2i[w]])) for w in vocab if w != word), key=lambda t: -t[1])
    return [(w, round(s, 2)) for w, s in scored[:k]]

for w in ["money", "river", "bread", "teller", "fish", "bank"]:
    print(f"{w:>7} ->", neighbours(w))
```

```
  money -> [('mortgage', 1.0), ('cash', 0.99), ('savings', 0.99), ('deposit', 0.99), ('loan', 0.99)]
  river -> [('stream', 1.0), ('grass', 1.0), ('reeds', 0.99), ('water', 0.99), ('mud', 0.99)]
  bread -> [('dough', 1.0), ('cake', 1.0), ('butter', 0.99), ('flour', 0.99), ('knife', 0.65)]
 teller -> [('manager', 1.0), ('customer', 1.0), ('clerk', 1.0), ('mortgage', 0.63), ('savings', 0.62)]
   fish -> [('fisherman', 1.0), ('boat', 1.0), ('heron', 0.99), ('stayed', 0.56), ('near', 0.55)]
   bank -> [('washed', 0.67), ('flow', 0.58), ('sat', 0.57), ('watched', 0.55), ('account', 0.52)]
```

The first five rows are what you want: words cluster by what they are used for, though nothing labelled them. This is an easy test (three clean domains where every word in a domain is interchangeable), so the near-1.0 scores say more about the corpus than about the algorithm.
Note the last row, which is not a clean cluster.

### 5. Measure the `bank` problem

```python
groups = {"finance": ["money", "cash", "loan", "deposit", "mortgage", "savings", "interest", "teller", "customer", "manager", "clerk"],
          "river":   ["river", "stream", "water", "mud", "reeds", "grass", "shore", "fish", "heron", "fisherman", "boat"],
          "kitchen": ["bread", "flour", "dough", "butter", "cake", "baker", "oven", "bowl", "knife"]}
centroid = {g: np.mean([W[w2i[w]] for w in ws], axis=0) for g, ws in groups.items()}

print(f"{'word':>8}  " + "  ".join(f"{g:>8}" for g in groups) + "      (cosine to each domain's average vector)")
for w in ["money", "account", "shore", "fish", "bread", "bank"]:
    print(f"{w:>8}  " + "  ".join(f"{cosine(W[w2i[w]], centroid[g]):8.2f}" for g in groups))
```

```
    word   finance     river   kitchen      (cosine to each domain's average vector)
   money      0.94      0.39      0.46
 account      0.65      0.32      0.59
   shore      0.39      0.88      0.42
    fish      0.40      0.77      0.42
   bread      0.48      0.41      0.94
    bank      0.37      0.44      0.30
```

Unambiguous words sit firmly in one domain (`money` 0.94 finance, `shore` 0.88 river, `bread` 0.94 kitchen). `bank` is far from both of its domains (0.37 and 0.44), nowhere near as close as `money` or `shore`: one vector had to serve two jobs. Its five nearest neighbours in block 4 lean toward the river
(`washed`, `flow`, `sat`, `watched`), with a single finance word, `account`, in fifth place, even though the counts are balanced; I did not investigate why, and it would be wrong to read it as "the model chose river". What held across the five training seeds I tried (0 to 4) is the substance: `bank` scored between 0.35 and 0.38 against finance and between 0.43 and 0.45 against river, far below the 0.77 to 0.94 that the unambiguous words in the table score against their own domain.
(Also note `account` is closer to kitchen (0.59) than to river (0.32): a tiny corpus rewards shared sentence shapes like `the X and the Y were ...`, not only topic.)

### 6. What averaging does to a sentence

```python
def sent_vec(text):
    """The classic baseline: a sentence is the plain average of its word vectors."""
    return np.mean([W[w2i[w]] for w in text.split()], axis=0)

base = "the manager said the loan was approved"
tests = [("word order swapped", "the customer approved the loan", "the loan approved the customer"),
         ("negation added",     base, "the manager said the loan was not approved"),
         ("synonym swapped",    base, "the manager said the cash was approved"),
         ("topic changed (river)", base, "the heron said the river was approved"),
         ("topic changed (kitchen)", base, "the baker said the dough was approved")]
for label, a, b in tests:
    print(f"{cosine(sent_vec(a), sent_vec(b)):.4f}  {label:<24} {a!r} vs {b!r}")
```

```
1.0000  word order swapped       'the customer approved the loan' vs 'the loan approved the customer'
0.9793  negation added           'the manager said the loan was approved' vs 'the manager said the loan was not approved'
0.9999  synonym swapped          'the manager said the loan was approved' vs 'the manager said the cash was approved'
0.8983  topic changed (river)    'the manager said the loan was approved' vs 'the heron said the river was approved'
0.9011  topic changed (kitchen)  'the manager said the loan was approved' vs 'the baker said the dough was approved'
```

> [!example] Swapping the words gives similarity 1.0000: the two sentences have different meanings (the roles are reversed) and identical vectors. Adding `not` (0.9793) moves the vector far less than changing the topic does (about 0.90), so for a search system "approved" and "not approved" are near-duplicates.
> The synonym swap (0.9999) is the good case: it should be near 1, and it is. Two caveats keep this honest: these sentences use only words from our tiny vocabulary, and a real corpus would give different numbers; but order-invariance is exact arithmetic, not an artefact.

### 7. What the modern route looks like (not executed)

Not executed in this module's verification (needs the `sentence-transformers` package and a model download, which the environment used to verify this module did not have). [Track 03, Module 05](../../03-landmark-models-bert-gpt-and-moe/05-sentence-transformers-and-bi-encoders/README.md) ran this same model and printed real results.

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
texts = ["The customer opened an account at the bank.",
         "The fisherman sat on the river bank.",
         "A person set up a savings account."]
vecs = model.encode(texts)             # one vector per whole sentence, shape (3, 384)
print(model.similarity(vecs, vecs))    # 3 x 3 similarity matrix
```

I am deliberately not printing an output here. What to check when you run it: the first and third sentence should score closer to each other than either does to the second, because the model reads whole sentences, unlike block 6.

## Visual diagram

```
 ONE TRAINING STEP OF SKIP-GRAM WITH NEGATIVE SAMPLING     (window = 2, k = 5 noise words)

   the  customer  [opened]  an  account  at  the  bank
                      │
   centre word w = opened; its neighbours within 2 positions are the real contexts

 ┌───────────────────────────────┐     ┌──────────────────────────────────────────┐
 │ real pair   (opened, account) │     │ score = sigmoid(w . c)                   │
 │ noise pair  (opened, mud)     │ ──► │ real pair  -> push score up (toward 1)   │
 │ noise pair  (opened, oven)    │     │ noise pair -> push score down (toward 0) │
 │ ... 5 noise words in all      │     │ then update w (kept) and c (dropped)     │
 └───────────────────────────────┘     └──────────────────────────────────────────┘
   noise words are drawn with probability proportional to (word frequency) ^ 0.75

 WHY ONE VECTOR PER WORD CANNOT SERVE "BANK" OR A WHOLE SENTENCE

 STATIC (word2vec)                                        CONTEXTUAL + BI-ENCODER
 ┌────────────────────────────┐                           ┌────────────────────────────┐
 │ "...account at the bank"   │ ──┐                       │ "...account at the bank"   │  ──► [encoder] ──► vector A
 └────────────────────────────┘   │                       └────────────────────────────┘
                                  ├─► one row W[bank]
 ┌────────────────────────────┐   │   (a blend of both)   ┌────────────────────────────┐
 │ "...sat on the river bank" │ ──┘                       │ "...sat on the river bank" │  ──► [encoder] ──► vector B
 └────────────────────────────┘                           └────────────────────────────┘

                                                          A and B differ: the whole sentence is read
```

## Practice

### 1. Does a bigger vector help?

Train with `dim=2, 4, 16, 32`. For each, print the final loss, and a purity score: for every word in the `groups` lists from block 5, take its 5 nearest neighbours *among the grouped words* and measure the share in its own group. What do you conclude about the loss versus the neighbours?

<details><summary>Answer</summary>

Final loss: 2.390 (`dim=2`), 2.034 (`dim=4`), 1.745 (`dim=16`), 1.741 (`dim=32`). Purity: 0.968, 0.961, 1.0, 1.0.
Loss improves a lot up to 16 dimensions and then stops (16 to 32 gains 0.004), so 16 is enough capacity for this corpus. Purity barely moves even at 2 dimensions: with three tidy domains, almost any embedding passes. A test that cannot tell a 2-dimensional model from a 16-dimensional one is a weak test, which is the lesson for Module 02.

</details>

### 2. Break the trainer on purpose

Set `lr=0.5`, then `lr=0.1`, then `k_neg=15` with the default `lr`, and finally `k_neg=15, lr=0.01`. What happens to the loss? Why might batching make this worse?

<details><summary>Answer</summary>

`lr=0.5`, `lr=0.1`, `lr=0.2` and `k_neg=15` at the default `lr` all end in `nan` (numpy prints overflow warnings), while `k_neg=15, lr=0.01` trains normally (final loss 2.633, purity 0.948). The default `lr=0.05` sits just below the cliff.
My explanation, which I did not isolate experimentally: `np.add.at` *sums* the updates of every pair in the batch that touches the same row, and a word like `the` appears many times per batch of 128, so its effective step is many times `lr`; more noise words (`k_neg=15`) add more terms to each update. The usual remedies are a smaller learning rate (as tested) or averaging rather than summing the updates within a batch (not tested here).

</details>

### 3. Put some order back

Build a sentence vector by concatenating the mean of the first half of the words with the mean of the second half. Compare it with the plain mean on the swapped pair from block 6, the negation pair, and the pair `the loan was approved` / `the manager said the loan was approved` (same claim, longer sentence).

<details><summary>Answer</summary>

Swapped pair: plain mean 1.0, halves 0.8079. Negation: 0.9793 vs 0.9349. Same claim in a longer sentence: 0.9243 vs 0.7597.
So the halves trick does notice reordering, but it also treats a harmless change of sentence length as a big change (0.76), because every word shifts position. Hand-made fixes to averaging trade one weakness for another; learning the combination (a trained sentence encoder) is the real answer.

</details>

### 4. Give each sense its own word

After building `tagged` in block 1, rename `bank` to `bank_river` in the river sentences only, rebuild the vocabulary and pairs, retrain, and print the neighbours of `bank` and `bank_river`.

<details><summary>Answer</summary>

`bank` -> `account` 0.67, `money` 0.62, `savings` 0.61, `mortgage` 0.61, `deposit` 0.61. `bank_river` -> `washed` 0.73, `sat` 0.62, `flow` 0.58, `of` 0.57, `watched` 0.56.
With labelled senses, each vector is clean. But you needed to know the senses in advance and label the text, which does not scale. Contextual models avoid this by computing a vector per occurrence. Note also `of` among the neighbours of `bank_river`: real word2vec subsamples frequent function words, which this trainer does not.

</details>

### Checkpoint quiz

1. Why does negative sampling avoid computing a softmax over the whole vocabulary?
2. What should the loss be on the very first batch of block 3, and why?
3. Why can the loss never reach zero in this setup?
4. Name the three failures of averaging word vectors shown in this module.
5. Why is a bi-encoder's ability to embed documents once so important for search?

<details><summary>Answers</summary>

1. It turns "which word is the context" into `1 + k` binary decisions: the real context (label 1) and `k` sampled noise words (label 0), each needing only a dot product and a sigmoid.
2. `(1 + k) * ln 2 = 4.159` for `k = 5`: all context vectors start at zero, every score is 0, `sigmoid(0) = 0.5`, and each of the six terms costs `ln 2`.
3. A word's real neighbours vary from sentence to sentence, and the noise words are random draws, so some pairs can never be scored perfectly.
4. Word order is lost (exactly, because averaging is commutative); small decisive words like `not` barely move the vector; and every word carries one fixed meaning, so ambiguity (`bank`) is baked in.
5. Document vectors can be computed and stored ahead of time; at query time only the query is embedded and compared with stored vectors, instead of re-running a model on every query-document pair (the paper's example: about 65 hours versus about 5 seconds for 10,000 sentences).

</details>

> [!check]
> - I can write the negative-sampling loss and say what each term does
> - I can explain why the first-batch loss is (1 + k) ln 2 and why it never reaches 0
> - I can show with a number why averaging loses order, and say what it does to negation
> - I can explain polysemy in a static model and how contextual and bi-encoder models change it

## Project

Probe the weaknesses of an embedding yourself. Write 20 sentence pairs where a good sentence embedding should say "different" (word-order swaps, negations, `bank`-style ambiguity) and 20 where it should say "same" (paraphrases, synonym swaps). Score every pair with the average-of-word-vectors baseline from this module trained on a corpus of your choosing, and, if you can install it, with a pretrained sentence-embedding model.
Report, per category, where each approach separates the pairs and where it fails, and propose one change to your probe set that would make it harder. No code or answer is provided; the point is a failure analysis you can defend with numbers.

## Interview questions

> [!interview] Explain negative sampling. Why is it used, and what does the loss look like?

<details><summary>What a strong answer covers</summary>

Full softmax over a large vocabulary is expensive per training pair. Negative sampling reframes it as binary classification: raise the score (sigmoid of the dot product) for the true centre-context pair and lower it for `k` noise words drawn from a smoothed frequency distribution (unigram to the 3/4 power in the original paper).
Mention two vectors per word (centre and context), that you keep the centre vectors, and that `k` is a hyperparameter (more for small corpora). Bonus: you validated the gradient numerically.

</details>

> [!interview] Why is the average of word vectors a poor sentence embedding, and what replaced it for search?

<details><summary>What a strong answer covers</summary>

Averaging is order-invariant and context-free: swapped words give the identical vector, negation barely changes it, and ambiguous words carry one compromise vector. Raw contextual outputs are not automatically better either (Sentence-BERT's table showed averaged BERT outputs below averaged GloVe).
What replaced it: a transformer encoder fine-tuned so that cosine similarity between whole-sentence vectors reflects similarity (a bi-encoder trained on sentence pairs), with the added benefit that documents can be embedded once and stored.

</details>

> [!interview] A user searches "bank interest rates" and gets articles about riverbanks. What went wrong and how would you diagnose it?

<details><summary>What a strong answer covers</summary>

Likely a static or weak embedding that blends senses, or a query too short to disambiguate. Diagnose by embedding the query and a few labelled relevant and irrelevant passages and looking at the scores; check whether the model is contextual and trained for retrieval; try a longer or rewritten query; consider hybrid keyword plus vector search (later in the curriculum).
A strong answer builds a small labelled evaluation set rather than reasoning from one example (Module 02).

</details>

## Common mistakes & troubleshooting

- **The loss becomes `nan` and numpy prints `RuntimeWarning: overflow encountered in exp`.** The learning rate is too high for batch-summed updates. In this trainer `lr=0.05` works and `lr=0.1` does not (Exercise 2). Lower it, or reduce `batch`.
- **The loss falls but neighbours look random.** Too little data or too few epochs. One epoch of this corpus already gives decent neighbours; a corpus a tenth the size would not. The loss tells you the optimiser works, not that the vectors are good.
- **Function words (`of`, `the`) show up among neighbours.** The trainer does not subsample frequent words, which the original method does (Exercise 4 shows `of` near `bank_river`).
- **`KeyError` on a word.** Static embeddings cover only words seen in training. Handle unknown words explicitly, or use a model with subword tokens.
- **Two different sentences get cosine 1.0.** If you average word vectors that is expected, not a bug (block 6).

## Further reading & sources

- [Efficient Estimation of Word Representations in Vector Space (Mikolov et al., 2013)](https://arxiv.org/abs/1301.3781) - the original word2vec paper defining the skip-gram architecture trained in this module.
- [Distributed Representations of Words and Phrases and their Compositionality (Mikolov et al., 2013)](https://arxiv.org/abs/1310.4546) - introduces negative sampling, the 3/4-power noise distribution, and subsampling of frequent words; the source of the details quoted above.
- [word2vec Explained: deriving Mikolov et al.'s negative-sampling word-embedding method (Goldberg and Levy, 2014)](https://arxiv.org/abs/1402.3722) - a readable derivation of the objective whose gradient block 2 checks.
- [Deep contextualized word representations (Peters et al., 2018)](https://arxiv.org/abs/1802.05365) - ELMo, an early demonstration that a word's vector should depend on its sentence.
- [BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - the contextual encoder that Sentence-BERT builds on.
- [Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks (Reimers and Gurevych, 2019)](https://arxiv.org/abs/1908.10084) - source of the Table 1 numbers and the 65-hours-versus-5-seconds comparison, and the origin of bi-encoder sentence embeddings.
- [Sentence Transformers documentation: Usage](https://www.sbert.net/docs/sentence_transformer/usage/usage.html) - the library behind block 7, including `encode()` and `similarity()`.

## Next

[Module 02: Embedding Models Compared](../02-embedding-models-compared/README.md)
