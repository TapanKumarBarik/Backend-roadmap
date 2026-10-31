# Module 00: What an Embedding Is

## Roadmap

This is the first module of [Track 08: Embeddings & Vector Databases](../README.md). It builds directly on
three earlier ideas: a model never sees text, only token IDs ([Track 01, Module 08](../../01-tokens-and-language-modeling/08-vocabulary-size-tradeoffs/README.md)
counted what one row per token costs); vectors and dot products ([Track 02, Module 01](../../02-transformer-architecture/01-the-math-you-actually-need-vectors-matrices-dot-products/README.md));
and an embedding table as a matrix you index by row ([Track 02, Module 02](../../02-transformer-architecture/02-embeddings-as-lookup-tables/README.md)).
The history of the idea is told once in [Track 00, Module 03](../../00-genai-foundations/03-word2vec-and-the-embedding-revolution/README.md);
this module does not repeat it, it builds a small embedding space by hand so you can see what is inside one.

After this module you can explain what an embedding is without hand-waving, build one from nothing but counting and linear algebra,
read a nearest-neighbour list and an analogy result critically, and say why most "RAG is returning garbage" bugs start here.
Next: [Module 01](../01-from-word2vec-to-sentence-embeddings/README.md) learns the vectors by prediction (word2vec) instead of counting, and gets to whole sentences.

## Concept

> [!key] An embedding is a list of numbers (a point in a space) assigned to a thing, learned so that things used in similar ways land close together. "Close means similar" is not magic: it is exactly what the training data and objective rewarded, no more.

## Explanation

### The problem: one-hot vectors say nothing

The obvious way to give a word to a program is an ID, or equivalently a **one-hot vector**: as long as the vocabulary, all zeros except a 1 at the word's position.

```
 vocabulary: [cat, dog, car, ...]            (V words -> V numbers per word)
 cat = [1, 0, 0, ...]     dog = [0, 1, 0, ...]     car = [0, 0, 1, ...]

 cat . dog = 0      cat . car = 0      <- "cat is like dog" and "cat is like car"
                                          are indistinguishable
```

Three problems follow. The vectors are huge (a 50,000-word vocabulary means 50,000 numbers per word, almost all zero). Every pair of distinct words is
equally unrelated, so nothing you learn about `cat` transfers to `dog`. And the vectors carry no information beyond identity. An embedding fixes all three:
a short, **dense** vector (every number carries signal) in which distance means something.

### The idea: position is meaning

An embedding assigns each item a point in a space with a fixed number of coordinates. That number is the **dimension**. Items that behave alike get nearby points.

> [!model] Think of a map where "nearby" means "used the same way". The map is not drawn by a person; it is fitted to data. So it contains exactly the distinctions the data and the objective made worthwhile, and nothing else.

Four consequences worth stating plainly:

- **Dimension is a budget.** Each extra dimension lets the space keep one more independent distinction, and costs storage and compute for every vector you ever store. Real text-embedding models use anywhere from a few hundred to a few thousand dimensions
  ([Track 03, Module 05](../../03-landmark-models-bert-gpt-and-moe/05-sentence-transformers-and-bi-encoders/README.md) verified a 384-dimensional sentence model); "more" is not automatically "better" (Modules 02 and 04).
- **Individual axes usually mean nothing.** Rotate the whole space and every distance is unchanged, so dimension 7 is not "royalty". Meaning lives in directions and distances, not in single coordinates.
- **"Similar" is defined by the objective.** A model trained so that a question lands near its answer is a different space from one trained so that paraphrases land near each other.
- **Embeddings are only defined for what the model saw.** A word that never appeared has no row (the `KeyError` in the troubleshooting list at the end).

### Where "meaning" comes from: the company a word keeps

The trick that makes this learnable without labels is the distributional idea: words that appear in similar surroundings tend to be used similarly. You do not need a dictionary,
only a lot of text and a way to turn "similar surroundings" into numbers. The simplest way is counting, which is what this module does:

1. Count, for every word, which other words appear within a couple of positions of it (a **co-occurrence matrix**).
2. Rescale the counts so that surprising pairs matter more than merely frequent ones (**PPMI**, defined in the code).
3. Compress each long, sparse row into `k` numbers with **SVD** (singular value decomposition, a standard matrix factorisation that keeps the strongest patterns). The `k` numbers are the embedding.

Module 01 gets similar vectors by training a small network to predict neighbours instead of counting them. Levy, Goldberg and Dagan (2015, linked below) found that count-based methods given the same
design choices performed comparably to the prediction-based ones on their benchmarks, which is why counting is a fair way to see the idea.

### Two kinds of embedding you will meet (do not mix them up)

- The **input embedding table** inside an LLM: one row per token, a component of the model, trained jointly with everything else ([Track 02, Module 02](../../02-transformer-architecture/02-embeddings-as-lookup-tables/README.md)).
- An **embedding model**: a separate model whose job is to output one vector for a whole word, sentence or passage so you can search and compare. This track is about these.

> [!pitfall] Pulling a token's row out of an LLM's input table is not "the embedding of a sentence". A sentence vector for search comes from a model trained for that purpose (Module 01). Averaging raw token rows is a weak substitute, and you will see why in Module 01.

### Where embeddings show up

| Use | What gets embedded | "Close" is meant to say | Covered in |
|---|---|---|---|
| Semantic search | Documents and the query | Same topic or answers the question, even with no shared words | Modules 02-03, 05 |
| RAG | Chunks of your documents and the user question | This chunk is relevant to this question | Modules 06-08, [Track 09](../../09-retrieval-augmented-generation/README.md) |
| Recommendations | Users, products, songs (co-occurrence in baskets or listening history, the same recipe as below) | People who liked X will like Y | not in this track |
| Clustering and deduplication | Tickets, reviews, articles | Same issue or near-duplicate | not in this track |
| Features for a classifier | Any text | Same label tends to sit in the same region | not in this track |

The same recipe (turn "what it co-occurs with" into a vector) works for products in shopping baskets as for words in sentences. Only the thing being counted changes.

### What to expect from the demo, honestly

The corpus below is made-up and generated from templates, deliberately so that the structure is clean (animals, foods, vehicles, and an eight-word people grid of gender by status by age). That makes the results
easy to read and **flatters the method**. Real text is messier, words have several meanings, and real analogies are far less reliable than the famous `king - man + woman = queen`. The original paper that popularised
vector offsets reports answering almost 40% of its syntactic analogy questions (its abstract, linked below). We will show where ours work and where they break.

## Code

Only `numpy` and the standard library. Paste the blocks in order into one file (they share variables). Everything is seeded, so your output should match what is printed here exactly.

### 1. A small made-up corpus

```python
import random
import numpy as np

rng = random.Random(0)          # seeded: the corpus is identical on every run

ANIMALS = {"cat": "purred on the sofa", "dog": "barked at the gate", "rabbit": "hopped in the garden",
           "horse": "galloped across the field", "cow": "gave milk every morning"}
PETS = {"cat", "dog", "rabbit"}
FOODS = {"apple": "was sweet and crunchy", "bread": "was baked this morning", "rice": "was boiled in water",
         "cheese": "was sharp and salty", "soup": "was served hot"}
VEHICLES = {"car": "stopped at the light", "bus": "carried forty passengers", "truck": "hauled heavy cargo",
            "train": "ran along the track", "bicycle": "had two pedals"}
PEOPLE = {  # word: (gender, status, age) - a 2 x 2 x 2 grid, so every word differs from its neighbours in one way
    "king": ("m", "royal", "adult"), "queen": ("f", "royal", "adult"),
    "prince": ("m", "royal", "young"), "princess": ("f", "royal", "young"),
    "man": ("m", "common", "adult"), "woman": ("f", "common", "adult"),
    "boy": ("m", "common", "young"), "girl": ("f", "common", "young"),
}

def animal_sentence():
    a, b, f = rng.choice(list(ANIMALS)), rng.choice(list(ANIMALS)), rng.choice(list(FOODS))
    home = "in the house with the family" if a in PETS else "on the farm with the farmer"
    return rng.choice([f"the {a} chased the {b}", f"the {a} ate the {f}",
                       f"the {a} {ANIMALS[a]}", f"the {a} lives {home}"])

def food_sentence():
    f, g = rng.choice(list(FOODS)), rng.choice(list(FOODS))
    return rng.choice([f"she cooked the {f} and the {g}", f"he bought the {f} at the market",
                       f"the {f} {FOODS[f]}"])

def vehicle_sentence():
    v, w = rng.choice(list(VEHICLES)), rng.choice(list(VEHICLES))
    return rng.choice([f"the {v} was faster than the {w}", f"he parked the {v} near the station",
                       f"the {v} {VEHICLES[v]}"])

def person_sentence():
    p = rng.choice(list(PEOPLE))
    gender, status, age = PEOPLE[p]
    pron, poss = ("he", "his") if gender == "m" else ("she", "her")
    options = [f"the {p} said {pron} loved {poss} home",
               f"the {p} walked to the town and {pron} met a friend",
               f"the {p} was young and played all day" if age == "young" else f"the {p} was old and wise"]
    options.append(f"the {p} wore a golden crown in the castle" if status == "royal"
                   else f"the {p} worked in the village and {pron} went home")
    if status == "royal":
        options.append(f"the {p} ruled the kingdom from the throne")
    return rng.choice(options)

generators = [animal_sentence, food_sentence, vehicle_sentence, person_sentence]
corpus = [rng.choice(generators)().split() for _ in range(2000)]
vocab = sorted({w for s in corpus for w in s})
w2i = {w: i for i, w in enumerate(vocab)}
V = len(vocab)

print("sentences:", len(corpus), "| tokens:", sum(len(s) for s in corpus), "| vocabulary:", V)
for s in corpus[:4]:
    print("  ", " ".join(s))
```

Output:

```
sentences: 2000 | tokens: 14022 | vocabulary: 112
   the boy said he loved his home
   he parked the bicycle near the station
   the train ran along the track
   he bought the soup at the market
```

14,022 tokens is tiny: real embedding models see billions. Keep that in mind for every result below.

### 2. One-hot, then the co-occurrence matrix

```python
# one-hot: every pair of different words is exactly as far apart as every other pair
eye = np.eye(V)
print("one-hot dot products: cat.dog =", eye[w2i["cat"]] @ eye[w2i["dog"]],
      "| cat.car =", eye[w2i["cat"]] @ eye[w2i["car"]],
      "| cat.cat =", eye[w2i["cat"]] @ eye[w2i["cat"]])

# co-occurrence counts: how often does word j appear within 2 positions of word i?
window = 2
C = np.zeros((V, V))
for sent in corpus:
    ids = [w2i[w] for w in sent]
    for pos, i in enumerate(ids):
        for off in range(1, window + 1):
            if pos + off < len(ids):
                j = ids[pos + off]
                C[i, j] += 1
                C[j, i] += 1

print("co-occurrence matrix:", C.shape, "| non-zero cells:", int((C > 0).sum()), "of", C.size)
ctx = ["chased", "purred", "barked", "stopped", "wore", "she"]
print(" " * 8 + "".join(f"{c:>8}" for c in ctx))
for w in ["cat", "dog", "car", "king", "queen"]:
    print(f"{w:>8}" + "".join(f"{int(C[w2i[w], w2i[c]]):>8}" for c in ctx))
```

Output:

```
one-hot dot products: cat.dog = 0.0 | cat.car = 0.0 | cat.cat = 1.0
co-occurrence matrix: (112, 112) | non-zero cells: 738 of 12544
          chased  purred  barked stopped    wore     she
     cat      46      36       0       0       0       0
     dog      48       0      26       0       0       0
     car       0       0       0      26       0       0
    king       0       0       0       0      15       0
   queen       0       0       0       0      12      17
```

Each row is already a crude embedding: 112 numbers describing what a word keeps company with. `cat` and `dog` share `chased`; `king` and `queen` share `wore`. But the rows are long, mostly zero (94% of cells), and raw counts overweight frequent words.

### 3. PPMI and SVD: the embedding matrix

```python
def ppmi(C, alpha=0.75):
    """Positive pointwise mutual information: log(P(w,c) / (P(w) P(c))), floored at 0.
    alpha < 1 smooths the context distribution so rare contexts are not over-rewarded."""
    total = C.sum()
    p_wc = C / total
    p_w = C.sum(1, keepdims=True) / total
    p_c = C.sum(0, keepdims=True) ** alpha
    p_c = p_c / p_c.sum()
    with np.errstate(divide="ignore", invalid="ignore"):
        pmi = np.log(p_wc / (p_w * p_c))
    pmi[~np.isfinite(pmi)] = 0.0          # pairs never seen together -> 0
    return np.maximum(pmi, 0.0)

P = ppmi(C)
U, S, Vt = np.linalg.svd(P)               # P = U @ diag(S) @ Vt
print("largest singular values:", np.round(S[:8], 1))

def embed_matrix(k):
    """Keep the first k directions: row i is the k-dimensional embedding of word i."""
    return U[:, :k] * np.sqrt(S[:k])

E = embed_matrix(12)
print("embedding matrix:", E.shape, "| cat =", np.round(E[w2i["cat"]][:6], 2), "...")
```

Output:

```
largest singular values: [17.1 13.4 12.6 12.  11.5 11.1 10.9 10.7]
embedding matrix: (112, 12) | cat = [-0.44  0.42 -0.39 -0.43 -0.32  0.13] ...
```

PMI asks "does this pair appear more often than chance would predict?"; flooring at zero keeps only positive associations. SVD then keeps the `k` strongest directions of that matrix. `E` has 112 rows of 12 numbers: that is the embedding space.
`k = 12` is our choice, not a law.

### 4. Nearest neighbours, and what dimension buys

```python
import itertools

nouns = [w for d in (ANIMALS, FOODS, VEHICLES, PEOPLE) for w in d]
kind = {w: name for name, d in (("animal", ANIMALS), ("food", FOODS), ("vehicle", VEHICLES), ("person", PEOPLE))
        for w in d}

def cosine(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))

def neighbours(E, word, k=4, among=None, query=None, skip=()):
    q = E[w2i[word]] if query is None else query
    scored = [(w, cosine(q, E[w2i[w]])) for w in (among or vocab) if w != word and w not in skip]
    scored.sort(key=lambda t: -t[1])
    return [(w, round(s, 3)) for w, s in scored[:k]]

print("whole vocabulary, nearest to 'cat':", neighbours(E, "cat", 6))
for w in ["cat", "cow", "king", "girl", "car", "apple"]:
    print(f"nouns nearest to {w!r}:", neighbours(E, w, 4, among=nouns))

print("\n k  energy_kept   nearest-noun-is-same-kind")
for k in (1, 2, 3, 4, 8, 12, 24, 48):
    Ek = embed_matrix(k)
    same = np.mean([kind[neighbours(Ek, w, 1, among=nouns)[0][0]] == kind[w] for w in nouns])
    print(f"{k:2d}  {(S[:k] ** 2).sum() / (S ** 2).sum():12.2f}  {same:.2f}")
```

Here `cosine` is the cosine of the angle between two vectors (1 means the same direction, 0 unrelated); [Module 03](../03-cosine-similarity-and-distance-metrics/README.md) treats it and its alternatives properly, so for now read it as "closeness score".

Output:

```
whole vocabulary, nearest to 'cat': [('farm', 0.931), ('horse', 0.928), ('dog', 0.921), ('sofa', 0.916), ('rabbit', 0.89), ('purred', 0.821)]
nouns nearest to 'cat': [('horse', 0.928), ('dog', 0.921), ('rabbit', 0.89), ('cow', 0.783)]
nouns nearest to 'cow': [('horse', 0.792), ('cat', 0.783), ('dog', 0.719), ('rabbit', 0.606)]
nouns nearest to 'king': [('queen', 0.996), ('prince', 0.994), ('princess', 0.989), ('woman', 0.838)]
nouns nearest to 'girl': [('boy', 0.999), ('woman', 0.991), ('man', 0.99), ('princess', 0.873)]
nouns nearest to 'car': [('train', 0.985), ('bread', 0.615), ('truck', 0.611), ('bicycle', 0.607)]
nouns nearest to 'apple': [('cheese', 1.0), ('soup', 0.998), ('bread', 0.971), ('rice', 0.966)]

 k  energy_kept   nearest-noun-is-same-kind
 1          0.08  0.35
 2          0.13  0.87
 3          0.17  0.91
 4          0.21  1.00
 8          0.34  1.00
12          0.44  1.00
24          0.65  1.00
48          0.88  1.00
```

What this shows, including the unflattering parts:

- Words land beside words used the same way: `king` with `queen`/`prince`/`princess`, `apple` with other foods, `girl` with `boy`. Nothing told the method these were categories.
- "Similar" blends two things: substitutes (`horse`, `dog`) and associated words that merely share sentences (`farm`, `sofa`, `purred`). In the whole-vocabulary list, `farm` even outranks `dog`, for no reason I can offer beyond noise in 12 dimensions and 14k tokens. Do not over-read a single neighbour list.
- The first neighbour is right for every noun at `k >= 4`, but beyond it quality is uneven: `car`'s second to fourth neighbours (`bread`, `truck`, `bicycle`) are scored almost identically (0.615 to 0.607), so that ordering means nothing. The "same kind" test only checks first neighbours; it is easy, and saturates at `k = 4`.
- `k = 1` is a single number per word and gets the kind right only 35% of the time. Dimension is the budget for distinctions, and the first few buy the most.

### 5. Analogy arithmetic: where it works and where it does not

```python
def analogy(E, a, b, c, k=3, exclude_inputs=True):
    """a is to b as c is to ?   ->  words nearest to  b - a + c"""
    target = E[w2i[b]] - E[w2i[a]] + E[w2i[c]]
    skip = (a, b, c) if exclude_inputs else ()
    return neighbours(E, None, k, query=target, skip=skip)

for a, b, c in [("man", "king", "woman"), ("boy", "prince", "girl"), ("cat", "purred", "dog"), ("man", "king", "cow")]:
    print(f"{a}:{b} :: {c}:?  ->", analogy(E, a, b, c))
print("man:king :: woman:? with inputs NOT excluded ->", analogy(E, "man", "king", "woman", 3, exclude_inputs=False))

# a fair test: every ordered pair of word-pairs that differ by the same attribute
relations = {"gender": [("king", "queen"), ("prince", "princess"), ("man", "woman"), ("boy", "girl")],
             "status": [("king", "man"), ("queen", "woman"), ("prince", "boy"), ("princess", "girl")],
             "age":    [("king", "prince"), ("queen", "princess"), ("man", "boy"), ("woman", "girl")]}

def analogies_solved(E):
    out = {}
    for rel, pairs in relations.items():
        quads = list(itertools.permutations(pairs, 2))           # 4 x 3 = 12 questions per relation
        hits = sum(analogy(E, a, b, c, 1)[0][0] == d for (a, b), (c, d) in quads)
        out[rel] = f"{hits}/{len(quads)}"
    return out

print("\n k  analogies solved (whole vocabulary, inputs excluded)")
for k in (4, 8, 12, 16, 24, 48):
    print(f"{k:2d}", analogies_solved(embed_matrix(k)))
```

Output:

```
man:king :: woman:?  -> [('queen', 0.998), ('prince', 0.997), ('princess', 0.989)]
boy:prince :: girl:?  -> [('queen', 0.994), ('king', 0.994), ('princess', 0.99)]
cat:purred :: dog:?  -> [('barked', 0.974), ('farmer', 0.944), ('family', 0.944)]
man:king :: cow:?  -> [('horse', 0.723), ('sofa', 0.683), ('farm', 0.649)]
man:king :: woman:? with inputs NOT excluded -> [('king', 0.998), ('queen', 0.998), ('prince', 0.997)]

 k  analogies solved (whole vocabulary, inputs excluded)
 4 {'gender': '8/12', 'status': '5/12', 'age': '6/12'}
 8 {'gender': '5/12', 'status': '7/12', 'age': '7/12'}
12 {'gender': '10/12', 'status': '8/12', 'age': '11/12'}
16 {'gender': '10/12', 'status': '10/12', 'age': '10/12'}
24 {'gender': '12/12', 'status': '10/12', 'age': '11/12'}
48 {'gender': '12/12', 'status': '12/12', 'age': '12/12'}
```

Read this carefully, because analogies are the most over-sold part of the story:

- `man:king :: woman:?` gives `queen`, and `cat:purred :: dog:?` gives `barked`. The gap between king and man really is a direction that transfers.
- `boy:prince :: girl:?` fails: `queen` and `king` beat `princess` (0.994, 0.994, 0.99). The scores are within 0.004 of each other, so the winner is fragile.
- `man:king :: cow:?` returns `horse`, which is meaningless. The arithmetic always returns something; there is no "no answer".
- If you do not exclude the input words, the answer to `man:king :: woman:?` is `king` itself. Published analogy results exclude the inputs; this is part of why they look better than the geometry alone justifies.
- Accuracy changes with `k` in a ragged way (`k = 8` is worse than `k = 4` on gender) and only reaches 36/36 at `k = 48` on this perfectly regular grid. A corpus that was not built as a grid has no such guarantee.

### 6. A tiny semantic search with zero shared words

```python
STOP = {"the", "a", "and", "in", "at", "on", "of", "to", "with", "was", "from", "than", "he", "she", "his", "her", "said"}

def embed_text(text, E):
    """A text is the mean of its (non-stopword, known) word vectors."""
    ids = [w2i[w] for w in text.split() if w in w2i and w not in STOP]
    return E[ids].mean(axis=0) if ids else np.zeros(E.shape[1])

docs = ["the queen ruled the kingdom from the throne", "the prince was young and played all day",
        "the dog barked at the gate", "the horse galloped across the field",
        "the bus carried forty passengers", "the train ran along the track",
        "she cooked the rice and the soup", "he bought the cheese at the market"]
D = np.array([embed_text(d, E) for d in docs])

for q in ["the princess wore a golden crown", "a cat purred on the sofa", "a truck hauled cargo",
          "he cooked the apple", "a rabbit hopped in the garden"]:
    sims = np.array([cosine(embed_text(q, E), d) for d in D])
    best = int(np.argmax(sims))
    shared = (set(q.split()) & set(docs[best].split())) - STOP
    print(f"{q!r:36} -> {docs[best]!r:46} cos={sims[best]:.2f} shared words={sorted(shared)}")
```

Output:

```
'the princess wore a golden crown'   -> 'the queen ruled the kingdom from the throne'  cos=0.56 shared words=[]
'a cat purred on the sofa'           -> 'the horse galloped across the field'          cos=0.91 shared words=[]
'a truck hauled cargo'               -> 'the train ran along the track'                cos=0.26 shared words=[]
'he cooked the apple'                -> 'she cooked the rice and the soup'             cos=0.96 shared words=['cooked']
'a rabbit hopped in the garden'      -> 'the dog barked at the gate'                   cos=0.51 shared words=[]
```

> [!example] The princess query returns the queen document although the two share no word (a keyword search for `princess` would find nothing). Four of five top results are the right kind of thing. Note two traps. The scores run from 0.26 to 0.96, so a raw cosine is not comparable across queries and you cannot set one threshold ("above 0.5 is relevant") on it.
> And `a cat purred...` returned the horse document rather than the dog one, which is a defensible but not obviously better answer. Both are what the mean-of-word-vectors shortcut can do; Module 01 shows where it breaks.

## Visual diagram

```
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│ the cat purred    │    │ co-occurrence C   │    │ PPMI matrix P     │    │ SVD: P = U S Vt   │
│ the dog barked    │───►│ 112 x 112 counts  │───►│ together more     │───►│ keep first k cols │
│ the queen wore    │    │ window = 2        │    │ often than chance │    │ E = U_k sqrt(S_k) │
└───────────────────┘    └───────────────────┘    └───────────────────┘    └───────────────────┘
 2,000 sentences          738 non-zero cells       negatives set to 0       k = 12, our choice
                                                                                     │
                                                                                     ▼
                                                                      ┌─────────────────────────────┐
                                                                      │ E: 112 words x 12 numbers   │
                                                                      │ row i = embedding of word i │
                                                                      └─────────────────────────────┘

      PARALLELOGRAM BEHIND  b - a + c   (man : king :: woman : ?)

          man ──────── "royal" direction ────────► king
           │                                        │
           │ "female"                               │ "female"
           │ direction                              │ direction
           ▼                                        ▼
         woman ─────── "royal" direction ───────► queen   <- the point nearest to
                                                             king - man + woman
         The sides match only if the corpus made "royal" and "female" consistent directions.
         Here that held for man:king::woman (queen) and failed for boy:prince::girl.
```

## Practice

### 1. Change the window and watch "similar" change

Re-run blocks 2-4 with `window = 1` and then `window = 5`. Compare the whole-vocabulary neighbours of `cat`. What kind of neighbour appears as the window grows?

<details><summary>Answer</summary>

With `window = 1`, `cat`'s nearest words are mostly other animals (`horse` 0.998, `rabbit` 0.995, `dog` 0.995, plus the function word `on` 0.996): words that fill the same slot. With `window = 5` the list becomes `farmer`, `on`, `lives`, `with`, `farm`: words from the same sentences, not substitutes.
A narrow window captures "can replace this word", a wide window captures "is about the same topic". Which one you want depends on the task. Both are "similarity", which is why you must say which kind you need.

</details>

### 2. Give the method too little evidence

Append three sentences about an unseen word to `corpus` (`"the zebra ran in the field"` twice and `"a zebra ate the apple"`, each `.split()`), recompute `vocab`, `w2i` and `V`, rerun blocks 2-4, and look at the neighbours of `zebra`.

<details><summary>Answer</summary>

Among nouns the nearest are `rabbit` (0.862), `dog` (0.702), `cat` (0.572), then `rice` (0.546): roughly animal-like, but already drifting. Over the whole vocabulary the top five are `house`, `garden`, `castle`, `crown`, `rabbit`, which is mostly noise.
Three sightings is not enough to place a word reliably. Real systems have the same problem with rare words and misspellings; this is one reason subword tokens (Track 01) matter.

</details>

### 3. More dimensions are not always better

Run block 6 with `E = embed_matrix(24)` and with `embed_matrix(48)`, and print `cosine(E[w2i["purred"]], E[w2i["barked"]])` at `k = 12, 24, 48`.

<details><summary>Answer</summary>

At `k = 24`, two of the five queries now return the queen document, which is wrong (`a cat purred on the sofa` -> queen, cos=0.17; `a truck hauled cargo` -> queen, cos=0.04), and `cos(purred, barked)` falls from 0.71 (`k = 12`) to 0.02 (`k = 24`), then 0.14 (`k = 48`).
The extra dimensions encode details specific to individual rare words (`purred` and `barked` each get their own direction), so words that should generalise (cat sounds) stop looking alike, and a mean of such vectors is noise.
The same extra dimensions helped the analogy test (36/36 at `k = 48`). The best `k` depends on the task and on how much data you have; here a very small corpus punishes large `k`.

</details>

### 4. What does a vector database have to hold?

How much RAM do 5 million float32 vectors need at 384, 768 and 1536 dimensions? (float32 is 4 bytes.)

<details><summary>Answer</summary>

`5_000_000 * d * 4` bytes gives 7.68 GB (384), 15.36 GB (768) and 30.72 GB (1536), decimal gigabytes, before any index overhead. Storage grows linearly with dimension, which is one reason Module 02 treats dimension as a selection criterion, not a free quality dial.

</details>

### Checkpoint quiz

1. Why do one-hot vectors make it impossible to say `cat` is more like `dog` than like `car`?
2. In this module, what did the number of SVD directions `k` control?
3. `man:king :: woman:?` returned `king` when the input words were not excluded. What does that tell you about published analogy examples?
4. Why is "the nearest neighbour is the same kind of word" a weak test of an embedding?
5. What is the difference between an LLM's input embedding table and an embedding model?

<details><summary>Answers</summary>

1. Every pair of distinct one-hot vectors has dot product 0, so all pairs are equally unrelated (verified: `cat.dog` and `cat.car` are both 0.0).
2. The embedding dimension: how many numbers describe each word, and so how many independent distinctions the space can keep.
3. The input words are very close to the target, so honest evaluation must exclude them; examples that look clean often depend on that rule, and the margin between the right and wrong answers is usually small.
4. It only checks the single closest word and the four kinds in our corpus have completely different contexts, so it saturated at `k = 4` while analogy accuracy kept improving up to `k = 48`.
5. The input table is an internal component, one row per token, trained with the model. An embedding model is a separate model that outputs one vector for a whole text, trained so that distance supports search and comparison.

</details>

> [!check]
> - I can explain why one-hot vectors cannot express similarity
> - I can describe the count, rescale, compress recipe and what `k` controls
> - I can read a nearest-neighbour list and name two reasons not to trust one result
> - I can explain why analogy examples are fragile and what "excluding the inputs" hides

## Project

Build the same pipeline on text you did not write. Take at least 50,000 words of real prose (for example the Markdown files of this repository, with code blocks removed), tokenise it simply, and produce `k`-dimensional embeddings with counting, PPMI and SVD.
Report neighbours for ten words you pick in advance, vary `k` and the window and record what changes, and write down three cases where the results are wrong or surprising and your best explanation for each. No code is provided and there is no reference solution: the deliverable is your evidence and your honesty about the failures.

## Interview questions

> [!interview] What is an embedding, and why is it better than a one-hot encoding for words or documents?

<details><summary>What a strong answer covers</summary>

A dense, fixed-length vector learned so that distance reflects similarity under some objective. One-hot vectors are as long as the vocabulary, mostly zero, mutually orthogonal, and carry no notion of similarity, so nothing generalises between related items. Embeddings are short, dense and let a model or a search system transfer what it knows across related items.
A strong answer adds that "similar" is defined by the training objective, and that axes are not individually interpretable.

</details>

> [!interview] A teammate shows `king - man + woman = queen` as proof that embeddings "understand" meaning. How do you respond?

<details><summary>What a strong answer covers</summary>

It shows the space has a roughly consistent direction for some relations, which is real and useful, but it is not understanding. Mention excluding the input words, cherry-picked examples, a fixed answer set, and that the original paper reported answering only about 40% of its syntactic analogy questions.
Anything the data made regular (like our gender-by-status grid) works; irregular relations do not. Bias is also encoded the same way. Offer to evaluate on the task you actually care about instead.

</details>

> [!interview] You halve an embedding's dimension to save storage. What do you gain and what might you lose?

<details><summary>What a strong answer covers</summary>

Storage and per-comparison compute scale linearly with dimension, so halving halves them. The risk is losing fine distinctions the dropped directions carried; in our demo the first few directions bought the coarse structure and later ones bought finer relations. You must measure on your own retrieval task, because the effect depends on how the model was trained and on your data (Module 02 does this properly).

</details>

## Common mistakes & troubleshooting

- **`KeyError: 'road'` (or any unseen word).** An embedding exists only for words that were in the corpus. Check `w in w2i` first and decide what to do for unknown words (skip, or use a model with subword tokens).
- **`RuntimeWarning: divide by zero` inside PPMI.** `log(0)` for pairs that never co-occur. The `np.errstate` plus the `isfinite` line in block 3 handles it; if you remove them you get `-inf` and a failed SVD.
- **Unrelated words score high cosines.** PPMI is never negative, so the first singular direction has the same sign for every word (all 112 here) and every vector shares a large common component. With `k = 2` the average cosine over all word pairs in this corpus is 0.65; at `k = 12` it is 0.15. Subtracting the mean vector (`E - E.mean(0)`) takes the `k = 12` figure to 0.00 and makes scores easier to read.
- **Neighbours are function words or sentence-mates, not synonyms.** A wide window measures topic, not substitutability (Exercise 1). Narrow it, or drop stopwords.
- **Search results look right on five queries and wrong on the sixth.** With a small corpus rankings are noisy; judge on a labelled set, not on examples you chose (Module 02 builds one).

## Further reading & sources

- [Improving Distributional Similarity with Lessons Learned from Word Embeddings (Levy, Goldberg and Dagan, TACL 2015)](https://aclanthology.org/Q15-1016/) - shows that much of the gain attributed to word embeddings comes from design choices and hyperparameters that count-based methods can use too; the justification for building embeddings by counting in this module.
- [Linguistic Regularities in Continuous Space Word Representations (Mikolov, Yih and Zweig, NAACL 2013)](https://aclanthology.org/N13-1090/) - the paper behind the vector-offset "King - Man + Woman" result, including its reported accuracy of almost 40% on syntactic analogy questions.
- [Efficient Estimation of Word Representations in Vector Space (Mikolov et al., 2013)](https://arxiv.org/abs/1301.3781) - the original word2vec paper, evaluated on syntactic and semantic word-relationship questions; Module 01 builds its training method.
- [word2vec Explained: deriving Mikolov et al.'s negative-sampling word-embedding method (Goldberg and Levy, 2014)](https://arxiv.org/abs/1402.3722) - a short derivation note that makes the prediction-based approach readable; a bridge to Module 01.
- [numpy.linalg.svd documentation](https://numpy.org/doc/stable/reference/generated/numpy.linalg.svd.html) - the function used to compress the PPMI matrix.
- [TensorFlow Embedding Projector](https://projector.tensorflow.org/) - an interactive viewer for real embedding spaces; the quickest way to feel neighbourhoods in a space with real data.

## Next

[Module 01: From Word2Vec to Sentence Embeddings](../01-from-word2vec-to-sentence-embeddings/README.md)
