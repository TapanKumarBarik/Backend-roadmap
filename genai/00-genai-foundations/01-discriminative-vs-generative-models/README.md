# Module 01: Discriminative vs. Generative Models

## Why this matters

Module 00 drew the distinction in plain language: discriminative models
pick a label, generative models produce content. That's the right
intuition, but it's not yet precise enough to be *useful* — and the
precise version is what makes the rest of this curriculum click.

The real distinction is about **which probability distribution the model
learns**. A discriminative model learns `P(label | input)` — "given this
email, how likely is 'spam'?" A generative model learns `P(input)` or
`P(input, label)` — "how likely is this email *at all*?" That sounds like
a technicality until you notice what it buys you: **if you can model
`P(input)`, you can sample from it.** You can generate new inputs that
look like the ones you trained on. A model of `P(label | input)` simply
has nothing to sample — it only knows how to score things you hand it.

This single fact is the entire foundation of the field. An LLM is a
generative model of text: it learns `P(next token | tokens so far)`,
which chains into a full distribution over documents, which is why you
can *sample* essays and code out of it. Everything from temperature
settings (track 01) to why hallucination is structurally unavoidable
(track 15) follows from "we are sampling from a learned probability
distribution," and this module is where that stops being a slogan.

## Concepts

### The two questions, formally

Given inputs `x` (an email, a sentence, an image) and labels `y` (spam /
not spam):

- A **discriminative** model learns `P(y | x)` directly — the conditional
  probability of the label given the input. It draws a *decision
  boundary* through the input space and never models what the inputs
  themselves look like.
- A **generative** model learns `P(x | y)` and `P(y)`, which combine via
  Bayes' rule into the joint distribution `P(x, y) = P(x | y) · P(y)`.
  From the joint it can *derive* `P(y | x)` when it needs to classify —
  but it can also do something the discriminative model cannot: generate
  new `x`.

The classic textbook pairing that makes this concrete is **logistic
regression (discriminative) vs. naive Bayes (generative)**, both trained
on the same data, both able to classify — but only one able to
hallucinate a new sample. You'll build both below.

### Why "it can sample" is the whole ballgame

Think about what modeling `P(x)` requires. To assign a sensible
probability to *every possible email*, the model must have internalized
an enormous amount about what emails look like: vocabulary, grammar,
formatting, typical topics, how greetings precede bodies. A
discriminative model can achieve excellent spam accuracy by latching onto
a handful of shortcuts ("contains the word 'viagra'") without
understanding email at all.

So the generative task is *strictly harder* and forces a richer internal
representation. Scaled up to "model the probability of any text on the
internet," that pressure to represent everything is where an LLM's
apparent knowledge of history, code, and reasoning comes from. Nobody
taught it facts directly — facts are just what you need in order to
predict text well.

### Language modeling: turning generation into a chain of predictions

Modeling `P(x)` for a whole document at once is intractable — there are
more possible 1,000-word documents than atoms in the universe. The trick
that makes it tractable is the **chain rule of probability**: decompose
the joint probability of a sequence into a product of conditionals.

For a sequence of tokens `t₁ t₂ t₃ ... tₙ`:

```
P(t₁, t₂, ..., tₙ) = P(t₁) · P(t₂|t₁) · P(t₃|t₁,t₂) · ... · P(tₙ|t₁...tₙ₋₁)
```

Every term on the right is the *same kind of question*: "given the tokens
so far, what's the distribution over the next one?" That's a job a single
neural network can be trained to do. Generating text is then just:
sample a token from that distribution, append it, ask again, repeat.

This is worth sitting with, because it dissolves the apparent magic. The
model is not "composing an answer." It is answering the same narrow
question thousands of times in a row, each time conditioned on everything
it has produced so far.

### Generative models that aren't language models

To keep the category straight (module 00 introduced these; here's where
they sit in the `P(x)` framing):

| Model | What it models | Can sample? |
|---|---|---|
| Logistic regression | `P(y \| x)` | No |
| Naive Bayes | `P(x \| y)`, `P(y)` | Yes (crudely) |
| n-gram language model | `P(tₙ \| tₙ₋ₖ...tₙ₋₁)` | Yes |
| LLM (GPT/Llama) | `P(tₙ \| t₁...tₙ₋₁)` | Yes |
| Diffusion model | `P(image)` | Yes |
| BERT | `P(masked token \| context)` | Awkwardly — see track 03 |

BERT is the interesting edge case: it's trained with a generative-style
objective (predict a masked token) but is bidirectional, so it can't
cleanly chain predictions left-to-right to generate a document. It's
built for *understanding*, and track 03 module 11 covers exactly why that
made it lose the generation race.

## Reference

| Concept | Notation | Means |
|---|---|---|
| Discriminative | `P(y \| x)` | Probability of a label given an input |
| Generative (joint) | `P(x, y)` | Probability of an input and label co-occurring |
| Generative (unconditional) | `P(x)` | Probability of an input existing at all |
| Bayes' rule | `P(y\|x) = P(x\|y)P(y) / P(x)` | Converts a generative model into a classifier |
| Chain rule | `P(t₁..tₙ) = ∏ P(tᵢ \| t₁..tᵢ₋₁)` | Decomposes a sequence into next-token predictions |
| Likelihood | `P(x)` under the model | How "normal" the model thinks an input is |

| Task | Code |
|---|---|
| Discriminative classifier | `sklearn.linear_model.LogisticRegression()` |
| Generative classifier | `sklearn.naive_bayes.MultinomialNB()` |
| Predicted class probabilities | `model.predict_proba(X)` |
| Naive Bayes per-class word log-probs | `model.feature_log_prob_` |
| Class priors `P(y)` | `model.class_log_prior_` |

## Hands-on exercises

Install once: `pip install scikit-learn numpy`

### 1. Train both models on the same data

```python
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB

texts = [
    "win a free prize now",       "claim your free money today",
    "free offer click here now",  "cheap pills buy now",
    "meeting at three tomorrow",  "can you review the document",
    "lunch tomorrow at noon",     "the report is attached",
]
labels = [1, 1, 1, 1, 0, 0, 0, 0]   # 1 = spam, 0 = not spam

vec = CountVectorizer()
X = vec.fit_transform(texts)

disc = LogisticRegression().fit(X, labels)   # learns P(y|x)
gen = MultinomialNB().fit(X, labels)         # learns P(x|y) and P(y)

test = vec.transform(["free money now", "the meeting document"])
print("discriminative:", disc.predict_proba(test).round(3))
print("generative:    ", gen.predict_proba(test).round(3))
```

Both classify. Note that they broadly agree — the point of this exercise
is *not* that one is more accurate, it's what happens next.

### 2. Ask each model to generate — and watch one fail

```python
import numpy as np

vocab = np.array(vec.get_feature_names_out())

# The GENERATIVE model knows P(word | class). We can sample from it.
def sample_sentence(nb_model, class_idx, n_words=5, seed=0):
    rng = np.random.default_rng(seed)
    probs = np.exp(nb_model.feature_log_prob_[class_idx])
    probs = probs / probs.sum()
    return " ".join(rng.choice(vocab, size=n_words, p=probs))

print("sampled 'spam':    ", sample_sentence(gen, 1))
print("sampled 'not spam':", sample_sentence(gen, 0))

# The DISCRIMINATIVE model has no equivalent. Try to find one:
print([m for m in dir(disc) if "sample" in m.lower() or "generat" in m.lower()])
# []  -- there is nothing to call. It never modelled what inputs look like.
```

Run it. The sampled sentences are word salad (naive Bayes assumes words
are independent, so there's no grammar) — but they're *recognizably*
spam-flavored vs. work-flavored word salad. That crude sampling is the
same capability that, with a vastly better model of `P(x)`, becomes
ChatGPT. Write one sentence in your own words about why
`LogisticRegression` has no `sample()` method.

### 3. Use the generative model as a novelty detector

A discriminative model *must* assign one of its known labels to anything
you give it. A generative model can tell you the input is weird, because
it models `P(x)`.

```python
weird = vec.transform(["quantum chromodynamics lagrangian"])
print("discriminative says:", disc.predict_proba(weird).round(3))
print("generative joint log-likelihood:",
      gen.joint_log_likelihood(weird).round(2)
      if hasattr(gen, "joint_log_likelihood")
      else gen._joint_log_likelihood(weird).round(2))
```

The discriminative model confidently reports a spam probability for a
physics phrase it has no business judging. The generative model's joint
log-likelihood is very low for *both* classes — it can express "this
doesn't look like anything I was trained on." Explain in one sentence how
this connects to a production LLM confidently answering a question far
outside its training distribution.

### 4. Implement the chain rule by hand

Given these made-up conditional probabilities, compute the total
probability of the sequence `the cat sat`:

```python
P = {
    ("the",):              0.10,   # P(t1 = "the")
    ("the", "cat"):        0.30,   # P(t2 = "cat" | "the")
    ("the", "cat", "sat"): 0.40,   # P(t3 = "sat" | "the cat")
}
# Your code: multiply the three together.
```

Then answer: if each token's probability is roughly 0.1-0.4, what happens
to the total probability of a 500-token document, and why do real systems
work in **log** probabilities instead?

<details><summary>Answer</summary>

`0.10 × 0.30 × 0.40 = 0.012`.

For 500 tokens the product underflows to zero in floating point almost
immediately — multiplying hundreds of numbers below 1 collapses toward
0 faster than a float can represent. Working in log space turns the
product into a sum (`log(a·b) = log a + log b`), which stays numerically
stable. This is why you'll see `log_prob`, `feature_log_prob_`, and
log-likelihoods everywhere in this field rather than raw probabilities.
</details>

### 5. Diagnose and fix: the wrong tool for the job

A teammate needs to flag support tickets that are unlike anything the
company has seen before, so they can be routed to a human. They train a
`LogisticRegression` on the 12 existing ticket categories and plan to
flag anything where the top predicted probability is below 0.5.

Explain what's structurally wrong with this plan, and what class of model
actually fits the requirement.

<details><summary>Answer</summary>

`predict_proba` on a discriminative model returns a distribution over the
*known* classes that always sums to 1 — it answers "which of my 12
categories fits best," never "does any category fit at all." A genuinely
novel ticket can still produce a confident 0.9 for whichever known class
it superficially resembles, so the threshold won't reliably fire.

The requirement is novelty/out-of-distribution detection, which needs a
model of `P(x)` — a generative model, or a purpose-built outlier detector
(e.g. `sklearn.svm.OneClassSVM`, `IsolationForest`). Exercise 3 is this
same lesson in miniature.
</details>

## Independent challenge

Write a script that trains both a `MultinomialNB` and a
`LogisticRegression` on a text dataset of your choosing (sklearn's
`fetch_20newsgroups` with 2-3 categories works well, or paste in your own
labeled examples). Then produce a short written comparison covering:

1. Classification accuracy of each on a held-out split.
2. Three sampled "documents" from the naive Bayes model per class.
3. Each model's behavior on an input from a category you *didn't* train
   on.

The deliverable is the write-up, not the accuracy number — specifically,
a paragraph on what the generative model could do that the
discriminative one couldn't, and whether that capability would matter for
a real product you can name.

## Common mistakes & troubleshooting

- **Thinking "generative" means "better."** For pure classification with
  plenty of labeled data, discriminative models frequently win — they
  spend all their capacity on the decision boundary instead of on
  modeling inputs you don't care about. Generative is *more capable*, not
  more accurate at classification.
- **Reading `predict_proba` as confidence in the real world.** It's a
  distribution over known classes, normalized to sum to 1. High
  probability means "most like this class among my options," not "I am
  sure." This misreading is exactly the bug in exercise 5, and it
  reappears at LLM scale as unwarranted confidence on out-of-distribution
  questions.
- **Multiplying probabilities in a long chain.** Underflow is silent and
  produces zeros. Use log probabilities (exercise 4).
- **Assuming naive Bayes' samples represent what generative modeling can
  do.** Its independence assumption throws away word order entirely, so
  its output is word salad. The gap between that and an LLM is precisely
  the gap tracks 02-04 close.

## Checkpoint quiz

1. Write the probability expression a discriminative model learns, and
   the one a generative model learns.
2. Why can a generative model sample new data while a discriminative one
   cannot?
3. State the chain rule of probability for a token sequence, and explain
   why it makes language modeling tractable.
4. Why does the field work in log probabilities?
5. Give one task where a generative model can do something a
   discriminative model structurally cannot — other than "write text."
6. Why is modeling `P(x)` a harder task that forces a richer internal
   representation?

<details><summary>Answers</summary>

1. Discriminative: `P(y | x)`. Generative: `P(x, y)` (or `P(x | y)` and
   `P(y)`, which combine to it), and for unconditional generation just
   `P(x)`.
2. Sampling requires a distribution over inputs. A discriminative model
   only ever learned a distribution over *labels given* an input, so
   there is no distribution over inputs to draw from.
3. `P(t₁..tₙ) = P(t₁)·P(t₂|t₁)·...·P(tₙ|t₁..tₙ₋₁)`. It decomposes an
   intractable joint distribution over whole documents into a repeated,
   identical, learnable subproblem: predict the next token given the
   prefix.
4. Multiplying many sub-1 probabilities underflows to zero in floating
   point; logs turn the product into a numerically stable sum.
5. Novelty / out-of-distribution detection — it can report that an input
   is unlikely under `P(x)` for every class, which a discriminative model
   cannot express since its outputs always normalize over known classes.
   (Also acceptable: data augmentation, imputing missing features.)
6. To assign sensible probability to every possible input, the model must
   internalize the structure of inputs in general (grammar, formatting,
   topic, world facts), whereas a classifier can hit high accuracy via a
   few shortcut features.
</details>

## Next

[Module 02: A Brief History — Symbolic AI to Statistical NLP](../02-a-brief-history-symbolic-ai-to-statistical-nlp/README.md)
