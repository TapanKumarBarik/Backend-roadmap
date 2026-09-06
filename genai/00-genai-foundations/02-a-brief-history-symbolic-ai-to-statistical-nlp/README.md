# Module 02: A Brief History — Symbolic AI to Statistical NLP

## Why this matters

It's tempting to skip history and get to the API calls. Don't — for one
specific reason: **the two big failed approaches failed for reasons that
still constrain what you build today.** Rule-based systems failed because
language has an unbounded number of exceptions; statistical n-gram models
failed because context is long and data is finite. Every design decision
in a modern LLM is a response to one of those two walls, and you will
personally re-encounter both of them:

- Write enough prompt rules ("if the user asks X, respond Y; unless Z…")
  and you have rebuilt an expert system, complete with its brittleness.
  Track 07 covers when a prompt has become a rule base that should have
  been code or a fine-tune.
- The n-gram wall — "you can only condition on so much context before the
  data runs out" — is the direct ancestor of today's context-window
  conversations in track 01.

This module also has you **build a working language model from scratch**
in about 30 lines of Python. It generates real (bad) text. That model is
a genuine ancestor of GPT — same task, same chain rule from module 01,
just a vastly weaker way of estimating the probabilities.

## Concepts

### Era 1: Symbolic AI and hand-written rules (1950s-1980s)

The founding assumption was that intelligence is symbol manipulation:
encode knowledge as explicit rules and facts, and reasoning falls out.

**ELIZA** (1966) is the famous demonstration and the famous cautionary
tale. It simulated a psychotherapist with a few dozen pattern-matching
rules — spot "I am X", reply "How long have you been X?". It had no model
of meaning whatsoever, and people still formed emotional attachments to
it. The lesson named after it, the **ELIZA effect** — humans readily
attribute understanding to systems that merely produce fluent-looking
language — is the single most relevant piece of 1960s AI for anyone
shipping a chatbot in the 2020s.

**Expert systems** (1970s-80s) scaled the idea commercially: encode a
domain specialist's knowledge as if-then rules. They genuinely worked in
narrow domains. They collapsed because of the **knowledge acquisition
bottleneck** — every rule had to be elicited from a human and hand-coded,
rules interacted in unforeseen ways as the base grew, and maintenance
cost scaled worse than linearly. A system with 10,000 rules became
impossible to reason about.

The fundamental problem for *language* specifically: rules need
exceptions, exceptions need exceptions, and natural language's tail of
special cases never terminates.

### Era 2: The statistical turn (late 1980s-2000s)

The shift was to stop hand-writing knowledge and start *estimating it
from data*. Instead of rules about what's grammatical, count what people
actually wrote. The reframing that mattered: language processing as a
**probability estimation problem** — exactly the `P(x)` framing from
module 01.

This era's workhorse is the **n-gram language model**. Module 01 gave the
chain rule:

```
P(t₁...tₙ) = P(t₁) · P(t₂|t₁) · ... · P(tₙ|t₁...tₙ₋₁)
```

The final terms condition on hundreds of previous tokens, which you can
never count reliably. The n-gram approach applies the **Markov
assumption**: only the last `n-1` tokens matter.

```
P(tᵢ | t₁...tᵢ₋₁)  ≈  P(tᵢ | tᵢ₋ₙ₊₁...tᵢ₋₁)
```

With `n=2` (a bigram model), predicting the next word depends only on the
current word. Now the probabilities are just counting:

```
P(sat | cat) = count("cat sat") / count("cat")
```

That's the whole model. It's estimable from a corpus, it's fast, and it
genuinely works well enough that n-gram models powered production speech
recognition and machine translation for two decades.

### Why n-grams hit a wall

Three walls, all of which modern architectures are designed to get past:

**1. Sparsity.** Most valid word sequences never appear in any corpus. If
`count("cat sat") == 0`, the model assigns probability zero, and by the
chain rule the *entire document* gets probability zero. The fix is
**smoothing** — steal a little probability mass from seen events and
redistribute it to unseen ones (add-one/Laplace smoothing is the simplest
form; Kneser-Ney was the sophisticated standard). Smoothing is a patch on
a structural problem, not a solution.

**2. No generalization across similar words.** The model learns about
"cat" and "dog" as completely unrelated symbols. Having seen "the cat
sat" a thousand times tells it *nothing* about "the dog sat." Every word
is an island. This is precisely the problem embeddings solve in module
03, and it's the single biggest conceptual leap in this whole history.

**3. Context length scales catastrophically.** Want to condition on 5
words instead of 2? With a 50,000-word vocabulary, a 5-gram model has
50,000⁵ ≈ 3×10²² possible contexts. You will never have enough data. In
practice n-gram models stalled around n=5. **A model that could actually
use 100 words of context was impossible by this approach** — which is
what makes today's 128K-token context windows a difference in kind, not
degree.

### What carried forward

Nothing about the modern era discards the statistical framing — an LLM is
still estimating `P(next token | context)`. What changed is *how* the
estimate is produced: instead of counting exact string matches, a neural
network learns a compressed, generalizing function. Module 03 takes the
first step (words become vectors, so similar words share evidence), and
tracks 02-03 take the rest.

## Reference

| Term | Means |
|---|---|
| Symbolic AI | Intelligence as explicit rule/symbol manipulation |
| ELIZA effect | Humans attributing understanding to merely fluent systems |
| Expert system | Hand-encoded domain rules; failed on the knowledge acquisition bottleneck |
| Markov assumption | Only the last `n-1` tokens matter for the next prediction |
| n-gram | A contiguous sequence of `n` tokens; a model conditioning on `n-1` previous |
| Sparsity | Most valid sequences never appear in training data |
| Smoothing | Redistributing probability mass to unseen n-grams |
| Perplexity | Standard language model quality metric; roughly "how many options is the model choosing between" — lower is better |

| Task | Code |
|---|---|
| Count n-grams | `collections.Counter(zip(*[tokens[i:] for i in range(n)]))` |
| Nested count table | `collections.defaultdict(Counter)` |
| Sample from a distribution | `random.choices(population, weights=counts)` |
| Perplexity | `math.exp(-sum(log_probs) / len(log_probs))` |

## Hands-on exercises

Standard library only — no installs.

### 1. Build a bigram language model from scratch

```python
import random
from collections import defaultdict, Counter

corpus = """the cat sat on the mat the cat ate the fish the dog sat on
the log the dog ate the bone the cat saw the dog the dog saw the cat"""

tokens = corpus.split()

# P(next | current), stored as raw counts
bigrams = defaultdict(Counter)
for cur, nxt in zip(tokens, tokens[1:]):
    bigrams[cur][nxt] += 1

print("after 'the':", bigrams["the"].most_common())
print("after 'cat':", bigrams["cat"].most_common())
```

Run it. You've just built the same *kind* of object an LLM produces — a
distribution over next tokens given context. The only difference is how
it's estimated.

### 2. Generate text by sampling

```python
def generate(bigrams, start, n_words=12, seed=1):
    rng = random.Random(seed)
    word, out = start, [start]
    for _ in range(n_words):
        choices = bigrams.get(word)
        if not choices:
            break
        nxt = rng.choices(list(choices), weights=list(choices.values()))[0]
        out.append(nxt)
        word = nxt
    return " ".join(out)

print(generate(bigrams, "the"))
```

This is autoregressive generation — sample, append, condition on the new
state, repeat. Exactly the loop an LLM runs, at a vastly smaller scale.
Run it a few times with different seeds and note how it produces locally
plausible but globally incoherent text. Write one sentence explaining
*why* it loses coherence, in terms of the Markov assumption.

### 3. Trigrams — better locally, worse on sparsity

```python
trigrams = defaultdict(Counter)
for a, b, c in zip(tokens, tokens[1:], tokens[2:]):
    trigrams[(a, b)][c] += 1

print("contexts learned:", len(trigrams))
print("after ('the','cat'):", trigrams[("the", "cat")].most_common())

# Now the sparsity problem, made visible:
print("after ('the','bone'):", trigrams[("the", "bone")].most_common())  # empty
```

Count how many distinct contexts the bigram model has vs. the trigram
model on this same tiny corpus. Then answer: if the corpus were 100x
bigger, would the trigram model's *coverage problem* be solved, or just
moved?

### 4. Watch a zero probability destroy a document

```python
def sequence_prob(bigrams, seq):
    p = 1.0
    for cur, nxt in zip(seq, seq[1:]):
        total = sum(bigrams[cur].values())
        p *= (bigrams[cur][nxt] / total) if total else 0.0
    return p

print(sequence_prob(bigrams, "the cat sat".split()))      # non-zero
print(sequence_prob(bigrams, "the cat flew".split()))     # 0.0
```

"the cat flew" is a perfectly grammatical English sentence, and the model
says it is *impossible*. Explain in one sentence why a single unseen
bigram zeroes the whole sequence (hint: the chain rule is a product).

### 5. Implement add-one smoothing

Fix exercise 4 so no sequence gets probability zero. Add-one (Laplace)
smoothing pretends every possible next word was seen one extra time:

```
P(next | cur) = (count(cur, next) + 1) / (count(cur) + V)
```

where `V` is the vocabulary size.

```python
V = len(set(tokens))

def smoothed_prob(bigrams, cur, nxt, V):
    # your code here
    ...

# Verify: "the cat flew" should now be small but non-zero.
```

<details><summary>Reference solution</summary>

```python
def smoothed_prob(bigrams, cur, nxt, V):
    return (bigrams[cur][nxt] + 1) / (sum(bigrams[cur].values()) + V)

def smoothed_sequence_prob(bigrams, seq, V):
    p = 1.0
    for cur, nxt in zip(seq, seq[1:]):
        p *= smoothed_prob(bigrams, cur, nxt, V)
    return p
```

Note the tradeoff you just made: every unseen bigram now has equal
probability. The model thinks "the cat flew" and "the cat the" are
exactly as likely, because counting alone gives it no notion that *flew*
is a verb and *the* is not. That's wall #2, and module 03 is where it
gets solved.
</details>

### 6. Compute perplexity

Perplexity measures how "surprised" the model is by held-out text —
roughly, the effective number of choices it's deciding between at each
step. Lower is better.

```python
import math

def perplexity(bigrams, seq, V):
    logs = []
    for cur, nxt in zip(seq, seq[1:]):
        logs.append(math.log(smoothed_prob(bigrams, cur, nxt, V)))
    return math.exp(-sum(logs) / len(logs))

print(perplexity(bigrams, "the cat sat on the mat".split(), V))   # seen text
print(perplexity(bigrams, "the dog flew to mars".split(), V))     # unseen text
```

Note this uses **logs, then exponentiates** — the numerical-stability
point from module 01, applied. Which sequence has higher perplexity, and
does that match your intuition about which the model "expected"?

### 7. Diagnose and fix: an accidental expert system

A colleague's support chatbot prompt has grown to 300 lines:

```
If the user mentions "refund", respond with policy A.
If the user mentions "refund" AND is outside 30 days, respond with policy B.
If the user mentions "refund" AND is outside 30 days AND is a Pro subscriber, respond with policy C.
If the user mentions "return" treat as "refund" unless they also say "faulty"...
```

Name the historical system this has become, predict the specific failure
mode it will hit as it grows, and suggest what should hold this logic
instead.

<details><summary>Answer</summary>

It's an expert system, rebuilt in a prompt. It will hit the knowledge
acquisition bottleneck: rules will interact in unanticipated ways, nobody
will be able to predict the effect of adding rule 301, and the ordering
of rules will start silently mattering.

Deterministic business logic (dates, subscription tier, entitlement)
belongs in code, which is testable and auditable; the LLM should handle
the language — understanding the request and phrasing the response —
with the resolved policy passed in as data. Track 07 covers this split,
and track 10 gives the agent/tool version where the model *calls* a
`get_refund_policy(user_id, order_date)` function instead of reasoning
about eligibility itself.
</details>

## Independent challenge

Build a trigram language model over a real corpus of at least ~50,000
words — Project Gutenberg is the classic free source; a concatenation of
this repo's own `backend/` READMEs also works and is funnier. Implement
add-one smoothing and perplexity, then produce a short write-up:

1. Generated samples at `n=2`, `n=3`, `n=4`, side by side.
2. Perplexity on held-out text for each `n`.
3. The fraction of test-set contexts that were never seen in training,
   for each `n`.

The point of item 3 is the payoff: watch coverage collapse as `n` grows,
and connect it in a paragraph to why scaling n-grams to real context
lengths was hopeless.

## Common mistakes & troubleshooting

- **Treating history as trivia.** The two walls (rule brittleness,
  context/sparsity) recur constantly in modern work — exercise 7 is a
  live example of the first one.
- **Multiplying raw probabilities over a long sequence.** Underflows to
  zero. Sum logs instead (exercise 6).
- **Thinking smoothing fixes sparsity.** It fixes the *symptom* (zero
  probabilities). It does nothing about the underlying inability to
  generalize between similar words — the model still can't transfer
  anything learned about "cat" to "dog."
- **Assuming bigger `n` is straightforwardly better.** Quality improves
  locally, but the number of possible contexts grows exponentially while
  your data doesn't, so coverage collapses. This tradeoff is the whole
  reason the field needed a different approach.

## Checkpoint quiz

1. What is the ELIZA effect, and why does it matter for someone shipping
   an LLM product today?
2. What killed expert systems?
3. State the Markov assumption as used in n-gram models.
4. Why does one unseen bigram set an entire sequence's probability to
   zero?
5. What does smoothing fix, and what does it *not* fix?
6. Why can't you just use `n=20` to get long context in an n-gram model?
7. What does perplexity measure, and is lower or higher better?

<details><summary>Answers</summary>

1. Humans attribute genuine understanding to systems that merely produce
   fluent language. It matters because users will over-trust your
   chatbot's confident output — the same root risk as hallucination
   (track 15), coming from the human side rather than the model side.
2. The knowledge acquisition bottleneck: every rule had to be
   hand-elicited and hand-coded, rules interacted unpredictably at scale,
   and maintenance cost grew faster than the system's capability.
3. `P(tᵢ | t₁...tᵢ₋₁) ≈ P(tᵢ | tᵢ₋ₙ₊₁...tᵢ₋₁)` — only the previous `n-1`
   tokens are assumed to matter.
4. The chain rule makes the sequence probability a *product* of
   conditionals, and any factor of zero zeroes the product.
5. It fixes zero probabilities for unseen n-grams. It does not fix the
   inability to generalize between similar words — "cat" and "dog" remain
   unrelated symbols.
6. The number of possible contexts grows exponentially with `n`
   (`V^(n-1)`), so with any realistic vocabulary and corpus almost every
   20-gram context would be unseen; coverage collapses to nothing.
7. Roughly the effective number of choices the model is deciding between
   per token — how surprised it is by held-out text. Lower is better.
</details>

## Next

[Module 03: Word2Vec and the Embedding Revolution](../03-word2vec-and-the-embedding-revolution/README.md)
