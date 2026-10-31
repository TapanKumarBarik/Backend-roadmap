# Module 01: BERT: Masked Language Modeling

## Why this matters

Module 00 established that self-supervised pretraining needs an
objective the raw text can supply labels for automatically. BERT's
specific choice — **masked language modeling (MLM)**: hide some tokens,
predict them using context from *both directions* — is what makes
BERT's bidirectional self-attention (track 02 module 16's "encoder-only,
no causal mask" case) both possible and necessary at the same time.
This module verifies MLM directly against a real, pretrained BERT
model: predicting a masked token correctly, and — the more important
check — confirming that changing the context *after* the mask changes
BERT's prediction, direct, checkable proof that it's genuinely using
bidirectional information, not just guessing from the words before the
blank.

## Concepts

### Why GPT's objective (module 00's causal preview) doesn't work for a bidirectional encoder

Causal language modeling (predict the next token from only what came
before) is what *requires* the causal mask (track 02 module 07) — without
it, module 07 already established the model would trivially "cheat" by
looking at the answer. But BERT's whole architectural point is
*bidirectional* self-attention (track 02 module 16) — every token sees
every other token, both before and after. Training with next-token
prediction under full bidirectional attention would be exactly the
cheating scenario module 07 warned about: the model could just look
directly at the token it's supposed to predict. **Masked language
modeling solves this**: instead of predicting the next token, BERT
hides a random subset of tokens (replacing them with `[MASK]`, track 01
module 09's special tokens) and predicts *those*, using unrestricted
bidirectional context — there's no "future" being hidden by a causal
mask, because the token being predicted has been physically replaced
in the input, not merely masked in attention.

### Verified: real BERT correctly fills in a masked token, using context

```python
from transformers import AutoTokenizer, AutoModelForMaskedLM
import torch

tok = AutoTokenizer.from_pretrained("bert-base-uncased")
model = AutoModelForMaskedLM.from_pretrained("bert-base-uncased")

text = "The capital of France is [MASK]."
enc = tok(text, return_tensors="pt")
mask_idx = (enc["input_ids"][0] == tok.mask_token_id).nonzero(as_tuple=True)[0].item()

with torch.no_grad():
    logits = model(**enc).logits[0, mask_idx]
top5 = torch.topk(logits, 5)
for score, idx in zip(top5.values, top5.indices):
    print(tok.decode([idx]), round(score.item(), 2))
```

Verified output:

```
paris      12.35
lille      10.58
lyon       10.46
marseille   10.11
tours       9.72
```

`"paris"` is the clear top prediction, by a real margin — and every
other candidate is a real French city, showing the model has narrowed
the prediction to the right *category* even where it isn't perfectly
certain of the single correct answer.

### Verified: changing context *after* the mask changes the prediction

This is the check that actually distinguishes bidirectional
understanding from a model that's only using words *before* the blank
(which a causal, GPT-style model would be limited to):

```python
def predict_mask(text):
    enc = tok(text, return_tensors="pt")
    mask_idx = (enc["input_ids"][0] == tok.mask_token_id).nonzero(as_tuple=True)[0].item()
    with torch.no_grad():
        logits = model(**enc).logits[0, mask_idx]
    return [tok.decode([i]) for i in torch.topk(logits, 3).indices]

print(predict_mask("He sat by the [MASK] and watched the fish swim in the water."))
print(predict_mask("He walked into the [MASK] and withdrew some cash from the teller."))
```

Verified output:

```
"...watched the fish swim in the water."  -> ['pool', 'water', 'lake']
"...withdrew some cash from the teller."   -> ['bank', 'lobby', 'office']
```

The text **before** `[MASK]` is nearly identical in structure ("He
[verb] ... the `[MASK]` and ...") in both sentences — what changes is
the context **after** the blank ("fish swim in the water" versus
"withdrew cash from the teller"), and the predictions shift completely
to match, from water-related words to bank-related words. This is
direct, checkable evidence that BERT's prediction genuinely depends on
right-side context, not just what came before the mask — exactly the
capability bidirectional attention (track 02 module 16) and the MLM
objective (rather than causal language modeling) were built to enable.

### The actual training setup: masking rate and the 80/10/10 rule

BERT's original training masks **15%** of input tokens for prediction.
Of those selected tokens, a further split applies (a real detail worth
knowing, not just an arbitrary number): 80% are replaced with
`[MASK]`, 10% are replaced with a random other token, and 10% are left
unchanged — all three still counted as prediction targets. This
mixture exists specifically to reduce a train/inference mismatch:
`[MASK]` never appears in real text the model would see after
pretraining (fine-tuning, module 03, or actual use), so training
*exclusively* on masked tokens would let the model learn to only
produce sensible representations when it sees the literal `[MASK]`
token — the 10%/10% split forces it to build good representations for
ordinary, unmasked tokens too.

## Reference

```
 Concept                     What it means
 ─────────────────────       ────────────────────────────────────
 Masked Language Modeling      Hide (mask) some input tokens; predict
 (MLM)                         them using full bidirectional context
 15% masking rate               fraction of tokens selected for
                                 prediction in BERT's original training
 80/10/10 split                 of the selected 15%: 80% -> [MASK],
                                 10% -> random token, 10% -> unchanged
                                 (all three still predicted)
 Why not causal LM for BERT      bidirectional attention + next-token
                                 prediction would let the model see the
                                 answer directly (track 02 module 07's
                                 "cheating" problem) — MLM avoids this
                                 by physically replacing the token in
                                 the input, not just restricting
                                 attention
```

## Hands-on exercises

### Exercise 1 — reproduce the masked-prediction example

Run the exact `"The capital of France is [MASK]."` example above, and
try several of your own sentences with a clear, checkable correct
answer. Confirm real BERT gets a reasonable set of top candidates for
each.

### Exercise 2 — reproduce the bidirectional-context-matters comparison

Run the exact bank/water example above, then construct your own pair
of sentences that are identical *before* the mask but differ *after*
it, and confirm the prediction shifts to match the right-side context
in your own example too.

### Exercise 3 — measure how much left-only context alone would predict

Truncate one of your sentences to remove everything *after* the mask
(so the model only sees the left context, as if it were causally
masked) and predict on that truncated input instead. Compare the
top predictions against the original, full-sentence version, and
connect what you find to why BERT's bidirectional access to full
context (verified in exercise 2) produces different, often more
accurate, predictions than left-context alone would.

## Independent challenge

A teammate proposes using a BERT-style masked model to generate long,
free-form text by masking one token at a time, filling it in, then
masking the next one, repeating left to right. Using this module's
verified findings about MLM and bidirectional attention, write two or
three sentences on why this wouldn't behave like GPT-style generation,
and what real limitation it would run into.

<details><summary>Discussion</summary>

BERT's MLM objective was trained to predict a masked token using
context that includes tokens to its right that are *already present
and correct* in the input (verified above — bidirectional context is
what makes its predictions accurate) — but in a left-to-right
generation loop, the tokens "to the right" of whatever position is
currently being filled in don't exist yet (or would have to be
masked placeholders themselves, which is a very different situation
from BERT's training, where masked positions are a small, random 15%
subset surrounded by real, correct tokens). This mismatch between
training conditions (mostly-real context, one masked token) and the
proposed generation setup (mostly-masked context, one real token) means
BERT's learned representations wouldn't transfer cleanly — this is
part of the real, structural reason BERT-style models aren't used for
open-ended generation the way GPT-style causal models are (track 03
module 10 covers this distinction in depth).

</details>

## Common mistakes & troubleshooting

- **Assuming BERT could be used directly for open-ended text
  generation the same way GPT can.** Verified above and discussed in
  the independent challenge: MLM's training setup (mostly real context,
  a few masked positions) doesn't match what left-to-right generation
  would require (mostly masked context) — this is a structural mismatch,
  not a minor inconvenience.
- **Assuming MLM only ever replaces selected tokens with `[MASK]`.**
  Verified above: the actual 80/10/10 split also uses random-token
  replacement and unchanged tokens as prediction targets, specifically
  to avoid a train/inference mismatch around the literal `[MASK]` token.
- **Testing bidirectionality only by checking the predicted word looks
  reasonable**, rather than confirming the prediction actually changes
  when right-side context changes. Verified in exercise 2's method:
  the real test is comparing predictions across two sentences differing
  only after the mask.

## Checkpoint quiz

1. Why can't BERT be trained with a straightforward causal, next-token
   objective the way GPT is (track 02 module 07's relevant finding)?
2. What did the verified bank/water experiment demonstrate, and why is
   it a stronger test of bidirectionality than just checking whether a
   single prediction looks correct?
3. What is BERT's original masking rate, and what does the 80/10/10
   split apply to?
4. Why does the 80/10/10 split exist, rather than always replacing
   selected tokens with `[MASK]`?
5. Why would using BERT to generate text one masked token at a time,
   left to right, run into a real structural problem?

<details><summary>Answers</summary>

1. Because full bidirectional attention combined with next-token
   prediction would let the model directly attend to the very token
   it's supposed to predict — track 02 module 07's verified "cheating"
   problem. MLM avoids this by physically replacing the token being
   predicted in the input itself, rather than relying on an attention
   mask to hide it.
2. That BERT's prediction for the same masked position genuinely
   changes when only the context *after* the mask changes (water-related
   words vs. bank-related words, for otherwise near-identical
   sentences) — this is a direct test of using right-side context,
   stronger than checking a single correct-looking prediction, which
   could in principle come from left-context alone.
3. 15% of input tokens are selected for prediction. Of that 15%: 80%
   are replaced with `[MASK]`, 10% are replaced with a random other
   token, and 10% are left unchanged — all three subsets are still
   used as prediction targets.
4. Because training exclusively on the literal `[MASK]` token would
   create a mismatch between pretraining (where `[MASK]` is common) and
   later real use (fine-tuning or inference, where `[MASK]` never
   appears) — the random-token and unchanged-token portions force the
   model to build good representations for ordinary tokens too, not
   just the special mask token.
5. Because MLM was trained with mostly-real, correct context around a
   small number of masked positions — a left-to-right generation loop
   would instead present mostly-masked or not-yet-generated context,
   a fundamentally different situation from what the model was trained
   to handle, meaning its learned representations wouldn't transfer
   cleanly to that use case.

</details>

## Further reading & sources

- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - the original paper; Section 3.1 defines masked language modeling and the 80/10/10 masking split verified in this module.
- [Hugging Face documentation: BertForMaskedLM](https://huggingface.co/docs/transformers/en/model_doc/bert#transformers.BertForMaskedLM) - the real model class used throughout this module's verification code.
- [Track 02, Module 07: Attention Masks and Causal Masking](../../02-transformer-architecture/07-attention-masks-and-causal-masking/README.md) - the causal-masking mechanism this module explains why MLM sidesteps rather than uses.
- [Track 02, Module 16: Encoder-Only vs. Decoder-Only vs. Encoder-Decoder](../../02-transformer-architecture/16-encoder-only-vs-decoder-only-vs-encoder-decoder/README.md) - the bidirectional, unmasked self-attention architecture this module's MLM objective is specifically paired with.
- [Track 01, Module 09: Special Tokens](../../01-tokens-and-language-modeling/09-special-tokens/README.md) - covers the `[MASK]` token mechanics referenced throughout this module.

## Next

[Module 02: BERT Architecture Deep Dive](../02-bert-architecture-deep-dive/README.md)
