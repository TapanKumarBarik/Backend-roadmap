# Module 03: Word2Vec and the Embedding Revolution

## Why this matters

Module 02 ended on a specific wall: an n-gram model learns "cat" and
"dog" as unrelated symbols, so a thousand observations of "the cat sat"
teach it *nothing* about "the dog sat." Every word is an island, and
evidence never transfers between them.

Word2Vec (2013) broke that wall, and the idea it introduced is the one
that everything downstream in this curriculum runs on. **Represent each
word as a dense vector of numbers, positioned so that words used in
similar contexts land near each other.** Suddenly "cat" and "dog" are
close in space, evidence generalizes between them, and — surprisingly —
the geometry of that space encodes meaning well enough that you can do
*arithmetic* on it: `king - man + woman ≈ queen`.

This matters far beyond history. Embeddings are not a superseded step;
they are load-bearing infrastructure in the modern stack:

- The first layer of every transformer (track 02) is an embedding lookup.
- Semantic search and RAG (tracks 08-09) are *entirely* built on
  embedding similarity — that's what a vector database stores.
- "Why did my RAG pipeline retrieve the wrong document?" is almost always
  an embedding question, and you'll be far better at debugging it having
  built the intuition here.

## Concepts

### The problem: one-hot vectors carry no meaning

Before embeddings, the standard way to feed a word to a model was
**one-hot encoding**: a vector as long as your vocabulary, all zeros
except a single 1 at that word's index.

```
vocabulary: [cat, dog, car, the, sat]

cat = [1, 0, 0, 0, 0]
dog = [0, 1, 0, 0, 0]
car = [0, 0, 1, 0, 0]
```

Two fatal properties:

1. **Every pair of words is equally distant.** The dot product of any two
   distinct one-hot vectors is exactly 0. "cat" is precisely as similar
   to "dog" as it is to "car" — which is to say, not at all. The
   representation encodes identity and nothing else.
2. **Dimensionality explodes.** A 50,000-word vocabulary means 50,000-
   dimensional vectors that are 99.998% zeros.

### The distributional hypothesis

The insight that fixes this is old (Firth, 1957) and is usually quoted as
**"you shall know a word by the company it keeps."** Words that appear in
similar contexts tend to have similar meanings.

You already use this constantly. Read: *"I poured the glarch into my mug
and drank it while it was still hot."* You now know a great deal about
`glarch` — it's a hot beverage — purely from its neighbors. Word2Vec
industrializes exactly this inference over billions of sentences.

### Word2Vec: learning vectors by predicting context

Word2Vec turns the hypothesis into a training objective. Two variants:

- **CBOW** (Continuous Bag of Words) — given the surrounding context
  words, predict the missing center word. ("the ___ sat on the mat" →
  "cat")
- **Skip-gram** — the reverse: given the center word, predict the
  surrounding context words. ("cat" → "the", "sat", "on") Slower, but
  better on rare words, and the more commonly used of the two.

Here is the part that surprises people: **the prediction task is
throwaway.** Nobody wants a model that guesses context words. The model
is a pretext — what you actually keep is the *weight matrix* it learned
along the way, whose rows are the word vectors. Forcing a network to
predict context makes it discover, as a side effect, a representation
where similar words are near each other. This "train on a fake task,
keep the internal representation" pattern is called **self-supervised
learning**, and it is exactly how BERT and GPT are pretrained (tracks
03-04). Word2Vec is where the field learned the trick.

Vectors are typically 100-300 dimensions — dense (every entry carries
information) rather than sparse, and small enough to be practical.

### The famous vector arithmetic

Because directions in the learned space turn out to correspond to
semantic relationships, you can do algebra on meaning:

```
vec("king") - vec("man") + vec("woman")  ≈  vec("queen")
vec("Paris") - vec("France") + vec("Italy")  ≈  vec("Rome")
```

The intuition: subtracting `man` from `king` isolates something like
"royalty minus maleness"; adding `woman` re-applies gender in the other
direction. There's a consistent "capital-of" direction, a "plural"
direction, a "past-tense" direction.

Two honest caveats, because this result is routinely overstated:

- The relationships are approximate and the classic examples are
  cherry-picked. Plenty of analogies simply don't work.
- **Embeddings absorb the biases of their training corpus.** The widely
  cited result that `doctor - man + woman` lands near `nurse` in
  corpora-trained embeddings is not a quirk; it's the model faithfully
  reproducing statistical associations in human-written text. This is the
  earliest, clearest instance of a theme that runs through track 15:
  these systems reflect their data, including the parts you didn't want.

### The limitation that set up what came next

Word2Vec produces **static** embeddings: one vector per word, forever.
But "bank" in *"river bank"* and *"bank account"* are different words
that happen to share a spelling, and Word2Vec is forced to average them
into a single compromise vector.

Fixing that requires a representation that depends on the *sentence the
word appears in* — a **contextual** embedding. That's precisely what
attention (module 05, then track 02) provides, and it's why BERT and GPT
represent a genuine step change rather than a bigger Word2Vec.

## Reference

| Term | Means |
|---|---|
| One-hot encoding | Sparse vector, all zeros except a 1 at the word's index |
| Embedding | Dense, low-dimensional learned vector representing a word |
| Distributional hypothesis | Words in similar contexts have similar meanings |
| CBOW | Predict center word from context |
| Skip-gram | Predict context words from center word |
| Self-supervised learning | Training on a pretext task to learn a useful representation |
| Static embedding | One fixed vector per word regardless of sentence |
| Contextual embedding | Vector depends on the surrounding sentence (track 02) |
| Cosine similarity | Angle-based similarity between vectors; 1 = identical direction |

| Task | Code |
|---|---|
| Train Word2Vec | `gensim.models.Word2Vec(sentences, vector_size=100, sg=1)` |
| Get a word's vector | `model.wv["cat"]` |
| Nearest neighbours | `model.wv.most_similar("cat")` |
| Similarity between two words | `model.wv.similarity("cat", "dog")` |
| Vector arithmetic | `model.wv.most_similar(positive=["king","woman"], negative=["man"])` |
| Load pretrained vectors | `gensim.downloader.load("glove-wiki-gigaword-100")` |

## Hands-on exercises

Install once: `pip install gensim numpy`

### 1. Feel the one-hot problem numerically

```python
import numpy as np

vocab = ["cat", "dog", "car", "the", "sat"]
onehot = {w: np.eye(len(vocab))[i] for i, w in enumerate(vocab)}

def cos(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))

print("cat vs dog:", cos(onehot["cat"], onehot["dog"]))   # 0.0
print("cat vs car:", cos(onehot["cat"], onehot["car"]))   # 0.0
```

Both zero. Write one sentence stating why this makes generalization
impossible for the n-gram models of module 02.

### 2. Train Word2Vec on a small corpus

```python
from gensim.models import Word2Vec

sentences = [
    "the cat sat on the mat".split(),
    "the dog sat on the log".split(),
    "the cat ate the fish".split(),
    "the dog ate the bone".split(),
    "a cat chased a mouse".split(),
    "a dog chased a cat".split(),
    "the kitten drank the milk".split(),
    "the puppy drank the water".split(),
] * 50          # tiny corpus, so repeat it to give training signal

model = Word2Vec(sentences, vector_size=50, window=3, min_count=1,
                 sg=1, epochs=100, seed=1, workers=1)

print("vector shape:", model.wv["cat"].shape)
print("cat ~ dog:", round(model.wv.similarity("cat", "dog"), 3))
print("cat ~ the:", round(model.wv.similarity("cat", "the"), 3))
print("nearest to 'cat':", model.wv.most_similar("cat", topn=3))
```

This corpus is far too small for good vectors — that's fine and
deliberate. The point is that `cat` and `dog` should now be measurably
more similar to each other than either is to `the`, purely because they
appeared in similar slots. Compare against exercise 1's flat zeros.

### 3. Use real pretrained embeddings

Small corpora give weak vectors. Download real ones (~130MB, one-time):

```python
import gensim.downloader as api

wv = api.load("glove-wiki-gigaword-100")   # 400k words, 100 dimensions

for pair in [("cat", "dog"), ("cat", "car"), ("cat", "kitten"),
             ("king", "queen"), ("breakfast", "cereal")]:
    print(f"{pair[0]:10s} ~ {pair[1]:10s} {wv.similarity(*pair):.3f}")

print("\nnearest to 'python':")
for word, score in wv.most_similar("python", topn=8):
    print(f"  {word:15s} {score:.3f}")
```

Look at the neighbours of `python` specifically. You should see both
snake-related and programming-related words mixed together — that's the
static-embedding limitation from the concepts section, visible in one
output. Write a sentence about what a *contextual* embedding would do
differently here.

### 4. Reproduce the famous analogy

```python
result = wv.most_similar(positive=["king", "woman"], negative=["man"], topn=3)
print("king - man + woman =", result)

for pos, neg in [(["paris", "italy"], ["france"]),
                 (["walking", "swim"], ["walk"]),
                 (["bigger", "small"], ["big"])]:
    print(pos, "-", neg, "=", wv.most_similar(positive=pos, negative=neg, topn=1))
```

Then try to *break* it — find three analogies of your own that fail.
Write one sentence on what the failures suggest about whether the model
"understands" the relationship or has captured a statistical regularity.

### 5. Observe bias in the embedding space

```python
print(wv.most_similar(positive=["doctor", "woman"], negative=["man"], topn=5))
print(wv.most_similar(positive=["programmer", "woman"], negative=["man"], topn=5))
```

Record what you get. Then answer, in a short paragraph: the model was
never given any instruction about gender and professions — so where did
this come from, and what does that imply for a résumé-screening or
candidate-matching feature built on embedding similarity? (Track 15
returns to this with concrete mitigations; the goal here is to have seen
it firsthand.)

### 6. Build a tiny semantic search engine

This is RAG's retrieval step (track 09) in miniature — no vector database
needed yet.

```python
import numpy as np

docs = [
    "How to reset your account password",
    "Our refund and return policy explained",
    "Troubleshooting slow internet connections",
    "Setting up two-factor authentication",
    "Shipping times and delivery estimates",
]

def embed(text, wv):
    vecs = [wv[w] for w in text.lower().split() if w in wv]
    return np.mean(vecs, axis=0)          # crude: average the word vectors

doc_vecs = np.array([embed(d, wv) for d in docs])

def search(query, top_k=2):
    q = embed(query, wv)
    sims = doc_vecs @ q / (np.linalg.norm(doc_vecs, axis=1) * np.linalg.norm(q))
    for i in np.argsort(-sims)[:top_k]:
        print(f"  {sims[i]:.3f}  {docs[i]}")

search("I forgot my login credentials")
search("when will my package arrive")
```

Neither query shares many literal words with the document it should
match — that's the whole point of semantic search. Note the crude
averaging step: it throws away word order entirely, which is exactly why
track 08 uses purpose-built *sentence* embedding models instead.

### 7. Diagnose and fix: the averaging trap

```python
print(round(float(cos(embed("the dog bit the man", wv),
                      embed("the man bit the dog", wv))), 4))
```

Run it. Explain the result, and say what property of `embed()` causes it.

<details><summary>Answer</summary>

The similarity is exactly **1.0** — the two sentences are identical in
this representation. Averaging word vectors is order-invariant: both
sentences contain the same multiset of words, so their means are the same
vector.

This is a genuine, load-bearing limitation, not a toy problem. It's why
production semantic search uses sentence-embedding models (Sentence-BERT
and successors, track 08) that encode word order via attention, rather
than averaging static word vectors. If a RAG pipeline is retrieving
documents that share vocabulary but not meaning, this class of bug is
where to look first.
</details>

## Independent challenge

Build a **document deduplication tool**. Given a folder of text files
(this repo's `genai/` module READMEs are a convenient corpus), embed each
one, compute pairwise cosine similarity, and report every pair above a
threshold you choose.

Then write up:

1. Your chosen threshold and *why* — show the score distribution that
   justified it, don't just pick 0.8.
2. Two false positives it produced, and your diagnosis of each.
3. A paragraph on how averaging word vectors limited your results, and
   what you'd swap in to fix it.

No starter code. You have everything from exercises 3, 6 and 7.

## Common mistakes & troubleshooting

- **Expecting good vectors from a small corpus.** Word2Vec needs a lot of
  text to work. Exercise 2's vectors are deliberately weak — use
  pretrained ones (exercise 3) for anything real.
- **Averaging word vectors to represent a sentence.** Order-invariant and
  lossy (exercise 7). Fine for a demo, wrong for production — use a
  sentence embedding model.
- **Trusting analogy arithmetic as evidence of understanding.** It's a
  striking statistical regularity, cherry-picked in most write-ups, and
  it fails often (exercise 4).
- **Forgetting embeddings encode corpus bias.** They reproduce
  associations present in human text, including ones you'd never
  deliberately encode (exercise 5). Any ranking or matching feature built
  on them inherits this.
- **Using cosine similarity without normalizing, or Euclidean distance by
  accident.** For embeddings, direction carries the meaning and magnitude
  usually doesn't — cosine is almost always what you want.

## Checkpoint quiz

1. Why is the cosine similarity of any two distinct one-hot vectors zero,
   and why is that fatal?
2. State the distributional hypothesis in one sentence.
3. What's the difference between CBOW and skip-gram?
4. In Word2Vec, what is actually kept after training, and what is thrown
   away?
5. What does "static embedding" mean, and give a concrete word where it
   causes a problem.
6. Where does embedding bias come from?
7. Why does averaging word vectors fail to distinguish "dog bites man"
   from "man bites dog"?

<details><summary>Answers</summary>

1. Distinct one-hot vectors have a dot product of 0 because they never
   share a non-zero index. It's fatal because the representation encodes
   only identity — no two words are more related than any other pair, so
   nothing a model learns about one word can transfer to a similar one.
2. Words that appear in similar contexts tend to have similar meanings.
3. CBOW predicts the center word from its surrounding context; skip-gram
   predicts the surrounding context from the center word.
4. The learned embedding weight matrix (the word vectors) is kept; the
   context-prediction output layer — the pretext task itself — is
   discarded. This is self-supervised learning.
5. One fixed vector per word regardless of sentence. "bank" (river vs.
   financial) or "python" (snake vs. language) must collapse distinct
   senses into a single averaged vector.
6. From the training corpus — the model reproduces statistical
   associations present in human-written text; it is not given, and does
   not need, any explicit instruction to do so.
7. The averaging operation is order-invariant: both sentences contain the
   same set of words, so their mean vectors are identical (cosine
   similarity exactly 1.0).
</details>

## Next

[Module 04: RNNs, LSTMs and the Sequence Problem](../04-rnns-lstms-and-the-sequence-problem/README.md)
