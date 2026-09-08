# Module 02: The Pretraining Objective and Loss

## Why this matters

Module 00 named "pretraining" as Stage 1 and Module 01 covered what
data goes into it, but neither said precisely what the model is
actually being trained *to do* with that data, or how "the model got
better" is measured. This module answers both concretely: the
objective is **causal language modeling** — predict the next token,
given everything before it — and the measurement is **cross-entropy
loss**, usually reported as **perplexity**. This sounds almost too
simple to be the entire mechanism behind everything Track 03 built and
everything this track will fine-tune, so this module proves, with a
real pretrained model and real numbers, that this simple objective
really does produce something that behaves like language understanding:
a real GPT-2 assigns real, substantially lower loss to a coherent
English sentence than to the exact same words scrambled into nonsense.
That gap — not an assumption, a measured number — is the entire
signal every later stage in this track (SFT, RLHF, DPO) builds on top
of.

## Concepts

### The causal language modeling objective

Given a sequence of tokens, a causal (autoregressive) language model is
trained to predict each token from only the tokens that came *before*
it — never the tokens after. This is "causal" in the same sense Track
02 covered for attention masking: position *i*'s prediction is a
function of positions `0..i` only.

```
 sequence:   The   quick  brown   fox    jumps
 position:    0      1      2      3      4

 predict position 1 from: [The]                    -> target: quick
 predict position 2 from: [The, quick]              -> target: brown
 predict position 3 from: [The, quick, brown]        -> target: fox
 predict position 4 from: [The, quick, brown, fox]    -> target: jumps

 at NO point does predicting position i see position i+1 or later —
 that's what makes this a valid training signal for a model that will
 later generate text one token at a time, left to right
```

Practically, this means a single sequence of length *T* gives *T-1*
separate next-token-prediction training examples for free, computed in
one forward pass — the model produces a probability distribution over
the vocabulary at every position simultaneously, and every position's
prediction is scored against what token actually came next in the real
text.

### Verified: input_ids and label shifting, with real tensor shapes

"The labels are the inputs, shifted by one position" is the standard
one-line description of causal LM training — verified concretely, with
a real tokenizer and real token IDs:

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

tok = AutoTokenizer.from_pretrained('gpt2')
text = "The quick brown fox jumps over the lazy dog near the river bank."
input_ids = tok(text, return_tensors='pt')['input_ids']
print("input_ids shape:", tuple(input_ids.shape))
print("tokens:", [t.replace('Ġ', '_') for t in tok.convert_ids_to_tokens(input_ids[0])])

shifted_context = input_ids[:, :-1]   # positions 0..T-2: what the model has seen
shifted_targets = input_ids[:, 1:]    # positions 1..T-1: what it must predict
for i in range(shifted_context.shape[1]):
    ctx_tok = tok.convert_ids_to_tokens([shifted_context[0, i].item()])[0].replace('Ġ', '_')
    tgt_tok = tok.convert_ids_to_tokens([shifted_targets[0, i].item()])[0].replace('Ġ', '_')
    print(f"position {i}: last context token={ctx_tok!r:>10}  ->  predicts next={tgt_tok!r}")
```

Verified output:

```
input_ids shape: (1, 14)
tokens: ['The', '_quick', '_brown', '_fox', '_jumps', '_over', '_the', '_lazy', '_dog', '_near', '_the', '_river', '_bank', '.']
position 0: last context token=     'The'  ->  predicts next='_quick'
position 1: last context token=  '_quick'  ->  predicts next='_brown'
position 2: last context token=  '_brown'  ->  predicts next='_fox'
position 3: last context token=    '_fox'  ->  predicts next='_jumps'
position 4: last context token=  '_jumps'  ->  predicts next='_over'
position 5: last context token=   '_over'  ->  predicts next='_the'
position 6: last context token=    '_the'  ->  predicts next='_lazy'
position 7: last context token=   '_lazy'  ->  predicts next='_dog'
position 8: last context token=    '_dog'  ->  predicts next='_near'
position 9: last context token=   '_near'  ->  predicts next='_the'
position 10: last context token=    '_the'  ->  predicts next='_river'
position 11: last context token=  '_river'  ->  predicts next='_bank'
position 12: last context token=   '_bank'  ->  predicts next='.'
```

(GPT-2's byte-pair tokenizer marks a leading space with the character
`Ġ`, printed here as `_` for readability — `_quick` is the token for
"the word quick, preceded by a space".) A 14-token sequence produces 13
real (context, target) pairs in this single forward pass — this is
`transformers`' `labels=input_ids` convention doing exactly this shift
internally when you pass a model its own `input_ids` as `labels`; it is
not a separate, differently-prepared dataset.

### Cross-entropy loss and perplexity

At each position, the model outputs a probability distribution over the
entire vocabulary (50,257 tokens for GPT-2). **Cross-entropy loss**
measures how much probability mass the model put on the *actual* next
token — low loss means the model assigned high probability to what
really came next; high loss means it was confidently wrong or diffusely
uncertain. Averaged over a sequence, `torch.exp(loss)` gives
**perplexity** — informally, "the model was as uncertain as if it were
guessing uniformly among this many tokens at each step." Lower
perplexity is better; a perplexity of 1 would mean the model was
perfectly certain and always correct.

### Verified: coherent text gets a real, substantially lower loss than scrambled text

The core empirical claim of this whole module: a pretrained model finds
grammatical, coherent English measurably more "expected" (lower loss)
than the identical set of words in random order — direct evidence that
next-token prediction training produces something that behaves like a
model of real language structure, not just a model of which words
co-occur.

```python
import random
random.seed(0)
model = AutoModelForCausalLM.from_pretrained('gpt2')
model.eval()

coherent = "The quick brown fox jumps over the lazy dog near the river bank."
words = coherent.rstrip('.').split()
random.shuffle(words)
scrambled = " ".join(words) + "."

def sequence_loss_and_ppl(text):
    ids = tok(text, return_tensors='pt')['input_ids']
    with torch.no_grad():
        out = model(ids, labels=ids)
    return out.loss.item(), torch.exp(out.loss).item(), ids.shape[1]

for name, text in [("coherent", coherent), ("scrambled", scrambled)]:
    loss, ppl, n = sequence_loss_and_ppl(text)
    print(f"{name:>9}: n_tokens={n:3d}  loss={loss:.4f}  perplexity={ppl:.2f}   text={text!r}")
```

Verified output:

```
 coherent: n_tokens= 14  loss=4.7145  perplexity=111.55   text='The quick brown fox jumps over the lazy dog near the river bank.'
scrambled: n_tokens= 14  loss=8.6060  perplexity=5464.36   text='quick the near over river brown fox lazy dog jumps The bank the.'
```

Same 14 tokens, same vocabulary, same model, same weights — the only
difference is word order. The coherent sentence's loss (4.71) is
roughly half the scrambled sentence's loss (8.61), and because
perplexity is an *exponential* of loss, that difference compounds into
a roughly 49x difference in perplexity (111.55 vs. 5464.36). This is
not a designed-in rule anywhere in GPT-2's architecture — there is no
"grammar checker" module. It is an emergent consequence of training
purely on next-token prediction over real text: predicting "dog" after
"the lazy" is genuinely more probable in real English than predicting
"the" after "quick," and enough exposure to real text during
pretraining (module 01's cleaned corpus) makes the model's output
distribution reflect that.

## Reference

```
 Term                    Meaning
 ──────────────────────  ────────────────────────────────────────────
 Causal language          Predict each token from only the tokens
 modeling (CLM)           before it, never the tokens after — the
                          pretraining objective for GPT-family models
 Autoregressive            Same idea: each output depends on previous
                          outputs/inputs only, one step at a time
 input_ids                 The tokenized sequence fed into the model
 Label shifting             labels[i] = input_ids[i+1] in effect —
                          verified above with real token-by-token
                          context/target pairs
 Cross-entropy loss         Per-position measure of how much probability
                          the model assigned to the actual next token;
                          lower = better, verified: coherent 4.71 vs.
                          scrambled 8.61 on the same 14 tokens
 Perplexity                exp(cross-entropy loss); an "effective
                          branching factor" interpretation. Verified:
                          111.55 (coherent) vs. 5464.36 (scrambled)
 Vocabulary size            Number of possible tokens the model chooses
                          among at each position (50,257 for GPT-2)
```

## Hands-on exercises

### 1. Reproduce the coherent-vs-scrambled gap on a different sentence

Pick a different grammatical English sentence (at least 10 words),
scramble its words with `random.shuffle`, and run the exact
loss/perplexity code above on both versions. Confirm the coherent
version gets a real, verifiably lower loss. Try 2-3 different random
shuffles of the same sentence and report whether the scrambled loss is
consistently higher, not just for one unlucky shuffle.

### 2. Compare `gpt2` and `gpt2-medium` on the same coherent sentence

Load `gpt2-medium` and compute its loss/perplexity on the same coherent
sentence from the verified example. Report the real numbers side by
side with `gpt2`'s. Is the larger model's loss lower or higher on this
sentence, and does that match what module 03 (scaling laws) will claim
about model size and loss?

### 3. Manually verify one position's cross-entropy term

For the coherent sentence, extract the model's logits at position 6
(context "...over the", predicting "lazy") using
`model(input_ids).logits`, apply `softmax`, and read off the
probability the model assigned to the actual token "_lazy". Compute
`-log(that probability)` by hand and confirm it's a plausible
contributor to the sequence's average loss of 4.71 (some positions
will be much easier — e.g. "_dog" after "lazy" — and some much harder;
the reported loss is an average across all positions).

## Independent challenge

A teammate says: "Cross-entropy loss and perplexity are basically the
same metric reported two different ways, so it doesn't matter which
one a paper reports." Using this module's verified numbers, explain
what's true and what's misleading about that claim — specifically,
what does the ~49x perplexity gap versus the ~1.8x loss gap (8.61/4.71)
on the same two sentences tell you about how these two numbers relate?

<details><summary>Discussion</summary>

It's true that perplexity is a deterministic, monotonic function of
loss (`perplexity = exp(loss)`) — they always agree on *which* of two
sequences is more "surprising" to the model, so as an ordering they
carry the same information, and the teammate is right that a paper
reporting one instead of the other isn't hiding anything. What's
misleading is treating the two numbers as similarly *sized* or equally
easy to eyeball differences in: because perplexity is an exponential of
loss, a modest-looking loss difference compounds into a dramatically
larger perplexity difference — this module's own verified numbers show
exactly that: the loss gap (4.71 vs. 8.61) is under 2x, but the
resulting perplexity gap (111.55 vs. 5464.36) is nearly 49x. A reader
skimming loss values might reasonably think two models differing by
"only" 0.5 loss are close in quality; the same gap reported in
perplexity can look enormous, and vice versa. Neither number is wrong —
they're the same underlying quantity — but comparing loss differences
across papers/models as if they were linearly comparable to perplexity
differences (or assuming a "small" loss gap means a "small" practical
difference) is exactly the mistake this module's own 1.8x-vs-49x gap
should make you suspicious of.

</details>

## Common mistakes & troubleshooting

- **Assuming the model "sees" future tokens during any part of
  training.** Causal masking (module 02, Track 02's attention modules)
  guarantees position i's prediction only ever depends on positions
  `0..i`. If you build a training loop that accidentally lets a
  position attend to later positions (e.g. forgetting a causal mask in
  a custom model), you get a data leak that makes loss look artificially
  low and useless as a real training signal.
- **Confusing `input_ids` and `labels` as needing separate tensors you
  must manually shift.** In `transformers`, passing `labels=input_ids`
  (the same tensor) to a causal LM does the shift-by-one internally —
  this module's manual shifting code was to make that internal step
  visible, not to imply you must always do it by hand.
- **Treating perplexity differences as the same "size" as loss
  differences.** The Independent Challenge above exists specifically
  because this is a common and easy mistake — perplexity's
  exponential relationship to loss means small loss gaps can be huge
  perplexity gaps.
- **Assuming a lower loss on one specific sentence generalizes to "the
  model understands grammar."** This module's verified result is real
  but is a single (coherent, scrambled) pair; Exercise 1 asks you to
  check it holds up across multiple sentences and shuffles before
  treating it as a general property rather than one example.
- **Forgetting perplexity depends on tokenization.** Comparing
  perplexity across models with *different* tokenizers (different
  vocabulary sizes, different subword splits) is not a fair
  apples-to-apples comparison — the same text can tokenize into a
  different number of tokens under a different tokenizer, changing
  what "per-token" perplexity even measures.

## Checkpoint quiz

1. What is the causal language modeling objective, in one sentence, and
   what does "causal" specifically forbid?
2. In the verified label-shifting example, what token did the model
   need to predict from the context `["The", "_quick", "_brown"]`?
3. What were the verified loss and perplexity values for the coherent
   sentence versus its scrambled version, and what does the
   substantially larger *relative* gap in perplexity versus loss tell
   you about the relationship between the two metrics?
4. Why does a single training sequence of length T produce T-1 training
   examples "for free" in one forward pass, rather than requiring T-1
   separate forward passes?
5. Is a lower cross-entropy loss always better? What does a
   perplexity of exactly 1 mean, conceptually?

<details><summary>Answers</summary>

1. Predict each next token using only the tokens that came before it in
   the sequence. "Causal" specifically forbids a position's prediction
   from depending on any token at or after its own position — no
   looking ahead.
2. "_fox" (context `The _quick _brown` predicts the next token, which
   the verified output shows is `_fox`).
3. Loss: 4.7145 (coherent) vs. 8.6060 (scrambled) — roughly 1.8x.
   Perplexity: 111.55 vs. 5464.36 — roughly 49x. Because perplexity is
   `exp(loss)`, it's an exponential function of loss, so a moderate
   absolute/relative difference in loss compounds into a much larger
   relative difference in perplexity — the two metrics always agree on
   ordering but disagree sharply on how large a gap "looks."
4. Because computing next-token predictions at every position is done
   in a single parallel forward pass over the whole sequence (every
   position's logits are produced simultaneously, each conditioned only
   on its own causal-masked prefix) — not by re-running the model once
   per position.
5. Yes, in the sense that it always means the model assigned more
   probability, on average, to the tokens that actually came next in
   real text — that's a well-defined training/measurement goal.
   Perplexity of exactly 1 means the model was perfectly certain of,
   and always correct about, every next token — an idealized floor
   essentially unreachable on real, genuinely uncertain natural
   language.

</details>

## Further reading & sources

- [Improving Language Understanding by Generative Pre-Training (Radford et al., 2018)](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) - the original GPT paper establishing the causal language modeling pretraining objective this module verifies directly on a real GPT-2 checkpoint.
- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - the GPT-2 paper; reports real perplexity numbers on benchmark datasets, the same metric this module computes on its own toy sentences.
- [Hugging Face: Causal language modeling](https://huggingface.co/docs/transformers/tasks/language_modeling) - documents the `labels=input_ids` convention and internal shift-by-one this module's manual code makes explicit.

## Next

[Module 03: Scaling Laws](../03-scaling-laws/README.md)
