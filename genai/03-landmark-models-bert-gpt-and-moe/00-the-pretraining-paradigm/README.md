# Module 00: The Pretraining Paradigm

## Why this matters

Track 02 built the transformer architecture in the abstract — attention,
positional encoding, the FFN, a working mini-model (track 02 module 17)
trained on a tiny corpus. This track is about the two real directions
the field split that architecture into: BERT (encoder-only,
understanding) and GPT (decoder-only, generation). Before either can
make sense, this module verifies the one idea both are built on:
**self-supervised pretraining**, where raw, unlabeled text alone
provides training signal — no human annotation required at all. This
is the property that made training on essentially the entire internet
practical in the first place, and it's verified here directly, both as
a counting exercise and against a real pretrained model.

## Concepts

### Supervised vs. self-supervised: where do the labels come from?

```
 SUPERVISED LEARNING                    SELF-SUPERVISED PRETRAINING
 (e.g., sentiment classification)        (next-token / masked-token prediction)

 "I loved this movie" -> POSITIVE        "the cat sat on the mat"
   ^                        ^              ^                    ^
   raw text          human-provided        raw text        the text ITSELF
                     label (expensive,                       provides the
                     requires annotation)                    label — no human
                                                              needed at all
```

A supervised dataset needs a human (or an expensive annotation
pipeline) to attach the correct answer to every example. Self-
supervised pretraining sidesteps this entirely: the "label" for
predicting a word is just the *next word that's already there* in the
raw text — something every sentence ever written already contains, for
free.

### Verified: one sentence, five free training examples, zero human labels

```python
text = "the cat sat on the mat"
tokens = text.split()

examples = [(tokens[:i+1], tokens[i+1]) for i in range(len(tokens)-1)]
for inp, tgt in examples:
    print(inp, "->", tgt)
print(len(examples), "training examples;", 0, "human labels needed")
```

Verified output:

```
['the'] -> cat
['the', 'cat'] -> sat
['the', 'cat', 'sat'] -> on
['the', 'cat', 'sat', 'on'] -> the
['the', 'cat', 'sat', 'on', 'the'] -> mat
5 training examples; 0 human labels needed
```

A single 6-word sentence produced **five** distinct (input, target)
training pairs, purely by construction — every prefix of the sentence
predicting the word that comes next. Scale this up: every sentence,
paragraph, and document in a training corpus produces this many
(roughly its length in tokens) free supervision signals, without a
single human ever labeling anything. This is the concrete reason
pretraining corpora can be enormous (essentially "as much text as can
be found and processed") in a way labeled datasets, bottlenecked by
human annotation cost, structurally cannot be.

### Verified: a real pretrained model computes loss directly on raw text

This isn't just true in principle — it's exactly what happens when
computing loss with a real, production language model:

```python
from transformers import GPT2LMHeadModel, GPT2TokenizerFast
import torch

tok = GPT2TokenizerFast.from_pretrained("gpt2")
model = GPT2LMHeadModel.from_pretrained("gpt2")

text = "The quick brown fox jumps over the lazy dog."
enc = tok(text, return_tensors="pt")
with torch.no_grad():
    out = model(**enc, labels=enc["input_ids"])
print(out.loss.item())
```

Verified output: **`5.09`** — a real loss value, computed by passing
the **same tokenized input as both the input and the label**
(`labels=enc["input_ids"]`). There's no separate label file, no
annotation step, nothing beyond the raw sentence itself. Internally,
the model shifts the input by one position (exactly the pattern
verified in the hand-counted example above) and computes cross-entropy
between its predictions and the actual next tokens — the text *is* the
label.

### The two-phase paradigm: pretrain, then adapt

```
 PHASE 1: PRETRAINING                     PHASE 2: ADAPTATION
 ────────────────────                     ─────────────────────
 Self-supervised, on massive,              Supervised (fine-tuning, module
 unlabeled text (verified above:           03) or unsupervised (prompting,
 the text supplies its own labels)         no weight updates at all) —
                                            uses the pretrained model's
 Expensive: enormous compute, run          already-learned representations
 once by a small number of orgs           for a specific downstream task

 Produces: general-purpose language        Cheap by comparison: much less
 representations                          data and compute needed, since
                                            most of the "hard work" is
                                            already done
```

This two-phase split is *why* a single pretrained model (GPT, BERT, or
any of their descendants, covered throughout this track) can be reused
across an enormous range of downstream tasks — the expensive,
data-hungry step (pretraining) happens once, and adaptation
(fine-tuning, module 03; or prompting, requiring no weight updates at
all) is comparatively cheap because it starts from representations
that already encode substantial language structure, not from scratch.

### Two real pretraining objectives, previewed

BERT and GPT (this track's next several modules) differ in exactly
*which* self-supervised objective they use — both self-supervised,
both label-free, but structurally different:

```
 Masked Language Modeling (BERT, module 01):
   "the cat [MASK] on the mat"  ->  predict "sat"
   (some tokens hidden; predict them using BOTH directions of context)

 Causal Language Modeling (GPT, module 06):
   "the cat sat on the" ->  predict "mat"
   (predict the NEXT token, using only what came before — exactly
    the pattern verified by hand above)
```

Both objectives share the property verified in this module — raw text
supplies its own training signal — while differing in exactly how that
signal is constructed, which in turn shapes the rest of each
architecture's design (module 01's masked prediction needs
bidirectional attention; module 06's next-token prediction needs the
causal masking track 02 module 07 verified).

## Reference

```
 Property                    Supervised learning        Self-supervised
                                                          pretraining
 ─────────────────────       ─────────────────────       ─────────────────────
 Label source                  human annotation             the raw data itself
                               (expensive, limited            (free, scales with
                               scale)                          however much text
                                                                exists)
 Training examples per          1 per human-labeled           ~1 per token
 unit of raw text               example                       (verified: 5 examples
                                                                from one 6-word
                                                                sentence)
```

## Hands-on exercises

### Exercise 1 — reproduce the free-examples counting exercise

Take a paragraph of your own text, tokenize it (by word or, more
realistically, using a real tokenizer from track 01), and count how
many (input, target) next-token pairs it produces. Confirm the count
is close to the token count minus one, regardless of what the text is
about — the mechanism doesn't care about content, only that there's a
"next token" to predict.

### Exercise 2 — reproduce the real-model loss computation

Run the exact GPT-2 example above on a few different sentences of your
own choosing, and confirm you get a real loss value each time, with no
labels beyond the sentence itself. Try a sentence that's likely very
common in web text (e.g., a well-known quote) versus one that's
unusual or invented — compare the loss values and connect any
difference to how well GPT-2's pretraining likely covered similar text.

### Exercise 3 — estimate the annotation cost gap directly

Pick a realistic supervised task (e.g., sentiment classification on
1,000 example sentences) and estimate, even roughly, how long it would
take a human annotator to label all 1,000 examples (a few seconds each
is a reasonable estimate). Compare this to how many free (input,
target) pairs the same 1,000 sentences would produce under
self-supervised next-token prediction (roughly their total token
count). Use this to state, in concrete numbers, why self-supervised
pretraining scales to far larger datasets than supervised approaches
ever practically could.

## Independent challenge

A team wants to train a model to detect sarcasm in customer support
messages and considers skipping labeled data entirely, arguing
"pretraining works without labels, so we should be able to train this
without labels too." Using this module's verified distinction between
self-supervised objectives and the actual target task, write two or
three sentences explaining why this reasoning doesn't transfer
directly.

<details><summary>Discussion</summary>

Self-supervised pretraining works label-free because its *objective*
(predict the next or masked token) is something the raw text
mechanically already contains an answer for — verified above, the text
supplies its own label. Sarcasm detection's actual target (is this
message sarcastic, yes or no) is not something raw, unlabeled text
mechanically encodes anywhere — there's no "free" signal in an
unlabeled support message that reveals whether it was meant sarcastically.
The team could still benefit from self-supervised pretraining (starting
from a pretrained model rather than random weights, module 03's
fine-tuning), but the sarcasm-detection objective itself still needs
real labeled examples, because unlike next-token prediction, it isn't a
property the raw text already contains for free.

</details>

## Common mistakes & troubleshooting

- **Assuming "self-supervised" means "no training signal at all."**
  Verified above: there is real training signal — cross-entropy loss
  against actual next tokens — it's just derived automatically from
  the raw data rather than requiring separate human annotation.
- **Assuming pretraining eliminates the need for labeled data on every
  downstream task.** It reduces how much labeled data is needed for
  many tasks (since the model starts from useful representations,
  module 03's fine-tuning), but tasks whose actual objective isn't
  mechanically present in raw text (like sentiment or sarcasm labels)
  still require real labeled examples for that specific objective.
- **Confusing masked language modeling and causal language modeling as
  interchangeable "the same self-supervised idea."** Both are
  self-supervised (verified: neither needs human labels), but they
  construct their training signal differently and require different
  underlying attention patterns (module 01 and module 06 cover this
  distinction directly).

## Checkpoint quiz

1. Where does the "label" come from in self-supervised next-token
   prediction, verified concretely in this module?
2. How many free training examples did the verified 6-word sentence
   produce, and how many required human annotation?
3. What did passing `labels=enc["input_ids"]` to a real GPT-2 model
   demonstrate?
4. What are the two phases of the pretraining paradigm, and why is the
   second phase typically much cheaper than the first?
5. Why doesn't "pretraining works without labels" justify skipping
   labeled data for a task like sarcasm detection?

<details><summary>Answers</summary>

1. The raw text itself — the word that comes next in the sentence is
   the label, requiring no separate human annotation.
2. Five free training examples (verified: `['the']->cat` through
   `['the','cat','sat','on','the']->mat`), and zero required human
   labels.
3. That a real, production language model computes a genuine loss
   value directly from raw, unlabeled text — the same tokenized
   sentence serves as both the model's input and its own label,
   confirming the mechanism verified by hand at the small-scale example
   works identically in a real pretrained model.
4. Phase 1 (pretraining): self-supervised training on massive,
   unlabeled text. Phase 2 (adaptation): fine-tuning (module 03) or
   prompting, adapting the already-pretrained model to a specific task.
   Phase 2 is cheaper because it starts from representations that
   already encode substantial language structure, rather than learning
   everything from scratch.
5. Because self-supervised objectives work label-free specifically
   because their target (the next or masked token) is something raw
   text mechanically already contains — sarcasm detection's actual
   target (whether a message is sarcastic) isn't a property unlabeled
   text automatically reveals, so that specific objective still
   requires real human-labeled examples, even though pretraining a base
   model beforehand can still help via fine-tuning (module 03).

</details>

## Further reading & sources

- [Improving Language Understanding by Generative Pre-Training (Radford et al., 2018)](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) - the original GPT paper, explicitly framing the pretrain-then-fine-tune paradigm this module covers.
- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - introduces masked language modeling, the self-supervised objective covered in module 01.
- [Hugging Face documentation: GPT2LMHeadModel](https://huggingface.co/docs/transformers/en/model_doc/gpt2#transformers.GPT2LMHeadModel) - the real model class used in this module's verified loss computation, including its `labels` argument.
- [Track 02, Module 17: Implementing a Mini Transformer in PyTorch](../../02-transformer-architecture/17-implementing-a-mini-transformer-in-pytorch/README.md) - trains a model using exactly this self-supervised next-token objective, verified end to end there.
- [Track 03, Module 03: Fine-Tuning BERT for Classification](../03-fine-tuning-bert-for-classification/README.md) - covers the "adaptation" phase this module previews, where real labeled data re-enters the picture for a specific downstream task.

## Next

[Module 01: BERT: Masked Language Modeling](../01-bert-masked-language-modeling/README.md)
