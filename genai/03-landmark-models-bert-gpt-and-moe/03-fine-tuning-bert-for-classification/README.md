# Module 03: Fine-Tuning BERT for Classification

## Why this matters

Module 00 introduced the two-phase pretrain-then-adapt paradigm.
Module 02 verified `pooler_output` — `[CLS]`'s specifically-trained,
whole-sequence summary vector — is what a classification head attaches
to. This module actually **runs** that adaptation: loading a
pretrained `bert-base-uncased`, attaching a fresh (randomly
initialized) classification head, and fine-tuning the whole thing on a
tiny labeled dataset — verified to work, with real numbers, in a
handful of training steps. This is the concrete mechanism behind "start
from a pretrained model instead of from scratch," not an abstract
claim.

## Concepts

### What fine-tuning actually adds: one small, new layer on top of everything pretrained

```python
from transformers import AutoModelForSequenceClassification

model = AutoModelForSequenceClassification.from_pretrained(
    "bert-base-uncased", num_labels=2
)
```

This loads all 109.5M of BERT-base's pretrained parameters (module 02)
**and** adds a brand-new, randomly-initialized linear layer
(`classifier.weight`, `classifier.bias`) mapping `pooler_output`'s 768
dimensions down to `num_labels=2` class scores. Verified: the library
itself reports this addition explicitly —

```
classifier.weight | MISSING (newly initialized)
classifier.bias   | MISSING (newly initialized)
```

— confirming everything except this small new head starts from
pretrained weights, not from scratch.

### Verified: fine-tuning on a tiny labeled dataset works, fast

```python
texts = ["I love this movie", "This film is amazing", "Best day ever",
          "I hate this movie", "This film is terrible", "Worst day ever"]
labels = [1, 1, 1, 0, 0, 0]

tok = AutoTokenizer.from_pretrained("bert-base-uncased")
enc = tok(texts, padding=True, return_tensors="pt")
y = torch.tensor(labels)

opt = torch.optim.AdamW(model.parameters(), lr=5e-5)
model.train()

out0 = model(**enc, labels=y)
print(out0.loss.item())

for step in range(20):
    out = model(**enc, labels=y)
    opt.zero_grad()
    out.loss.backward()
    opt.step()
print(out.loss.item())
```

Verified output:

```
loss before fine-tuning:  0.679
loss after 20 steps:      0.039
```

A **6-example** dataset, 20 training steps, and loss dropped by more
than 17x. This is only feasible because most of the model (the
pretrained 109.5M-parameter body) already encodes substantial language
understanding — fine-tuning only needs to teach it the specific
*mapping* from that understanding to these two labels, not language
itself from scratch, which is exactly what module 00's two-phase
paradigm predicts.

### Verified: the fine-tuned model generalizes beyond its training examples

```python
model.eval()
test_enc = tok(["I really enjoyed that", "That was awful"], padding=True, return_tensors="pt")
preds = model(**test_enc).logits.argmax(dim=-1)
print(preds.tolist())
```

Verified output: **`[1, 0]`** — correctly classifying `"I really
enjoyed that"` as positive (1) and `"That was awful"` as negative (0),
**neither sentence appeared anywhere in the 6-example training set**.
This is the real, checkable payoff of fine-tuning a pretrained model:
it correctly generalized the sentiment concept to genuinely new
sentences after seeing only 6 labeled examples — something training a
transformer of this size from random initialization on 6 examples alone
would have essentially no chance of doing.

### Verified: the new classification head is a small addition, not a re-architecture

```python
print(sum(p.numel() for p in model.parameters()))
```

Verified output: **`109,483,778`** — compare against module 02's
verified `109,482,240` for plain `bert-base-uncased`. The difference is
exactly **1,538** parameters (`768 * 2 + 2`, i.e. a `768 -> 2` linear
layer's weight matrix plus bias) — the entire fine-tuning setup adds a
genuinely tiny new component on top of an otherwise-unchanged pretrained
model, confirming fine-tuning is adaptation, not architectural
replacement.

### What actually gets updated during fine-tuning

By default (as run above), **every** parameter in the model —
pretrained body included — is updated during the fine-tuning loop, not
just the new classification head. This is "full fine-tuning." A real,
common alternative — freezing the pretrained body and only training the
new head (or a small subset of parameters, a topic returned to in
later tracks on efficient fine-tuning) — trains far fewer parameters at
the cost of typically needing more labeled data or more steps to reach
comparable accuracy, since the frozen body's representations can't
adjust to the specific task at all.

## Reference

```
 Quantity                          Verified value
 ─────────────────────────         ──────────────────────────────
 New parameters added by the        1,538 (768*2 + 2 — a 768->2
 classification head                 linear layer)
 Loss before fine-tuning              0.679
 Loss after 20 fine-tuning steps       0.039
 Correct predictions on 2             2/2 (both sentences unseen
 held-out sentences                    during training)
```

## Hands-on exercises

### Exercise 1 — reproduce the full fine-tuning experiment

Run the exact 6-example dataset and training loop above, and confirm
loss decreases substantially. Then test the fine-tuned model on your
own new sentences (not in the training set) and check whether the
predictions match your own judgment of their sentiment.

### Exercise 2 — confirm the parameter-count difference exactly

Load plain `bert-base-uncased` (module 02) and
`AutoModelForSequenceClassification.from_pretrained("bert-base-uncased",
num_labels=2)` side by side, compute both total parameter counts, and
confirm the difference matches `768 * num_labels + num_labels` exactly.
Try `num_labels=5` and confirm the added-parameter count scales
accordingly.

### Exercise 3 — compare full fine-tuning against a frozen-body baseline

Repeat the training loop, but freeze every parameter except the new
classification head (`for p in model.bert.parameters(): p.requires_grad
= False`), and train only the head. Compare the resulting loss curve
and held-out predictions against the full-fine-tuning version. Connect
what you find to the "frozen body trains fewer parameters but may need
more data/steps" tradeoff described above.

## Independent challenge

A team wants to fine-tune BERT for a specialized medical text
classification task but only has 20 labeled examples, and worries this
is far too little data. Using this module's verified findings about
what fine-tuning actually does (adapting an already-pretrained model,
not learning language from scratch), write two or three sentences on
why 20 examples might be more viable here than the same number would be
for training a model from random initialization, and what would still
be a reasonable concern with so few examples.

<details><summary>Discussion</summary>

Because the pretrained body already encodes substantial general
language understanding (module 00, module 02), fine-tuning with even a
handful of labeled examples — verified above with just 6 — can teach
the model the specific task mapping without needing to relearn language
itself, which is why 20 examples is a far more realistic amount for
fine-tuning than for training from scratch. A reasonable remaining
concern: with very few examples, the model risks overfitting to
idiosyncrasies of those specific 20 sentences (memorizing them rather
than learning a generalizable pattern) — the loss-dropping-fast result
verified above is a genuinely good sign, but checking generalization on
truly held-out examples (as done above) remains essential, and a
domain like medical text may also differ enough from BERT's original
pretraining corpus that the "already understands language" assumption
transfers less cleanly than for everyday sentiment text.

</details>

## Common mistakes & troubleshooting

- **Assuming fine-tuning trains a new model from scratch.** Verified
  above: the vast majority of parameters (109.48M of 109.48M) come
  pretrained; only a genuinely tiny classification head (1,538
  parameters) is newly initialized.
- **Evaluating only on the training examples themselves.** Verified
  above: the meaningful check is on genuinely new, held-out sentences —
  a model can trivially drive training loss to near-zero by memorizing
  a tiny dataset without confirming it generalizes at all.
- **Forgetting to call `model.eval()` before evaluating**, leaving the
  model in training mode during inference — a real, easy-to-miss
  source of subtly incorrect evaluation results.
- **Assuming freezing the pretrained body (partial fine-tuning) always
  performs as well as full fine-tuning.** It's a real, valid technique
  (exercise 3), but trades off differently — often needing more data
  or steps to reach comparable performance, since the frozen body can't
  adapt its representations to the specific task.

## Checkpoint quiz

1. What new parameters does `AutoModelForSequenceClassification` add on
   top of a pretrained `bert-base-uncased`, and how many are there?
2. What did the verified loss trajectory (0.679 -> 0.039) show, and how
   many examples and training steps produced it?
3. Why is the held-out prediction check (`[1, 0]` on two new sentences)
   a more meaningful verification than the training loss alone?
4. What is "full fine-tuning" versus a frozen-body approach, and what's
   the tradeoff between them?
5. Why can 6 labeled examples be enough to meaningfully fine-tune BERT,
   when the same number would be hopelessly insufficient to train a
   transformer of this size from random initialization?

<details><summary>Answers</summary>

1. A new linear classification layer (`classifier.weight`,
   `classifier.bias`) mapping `pooler_output`'s 768 dimensions to
   `num_labels` class scores — verified to add exactly 1,538 new
   parameters for `num_labels=2` (`768*2 + 2`).
2. That fine-tuning meaningfully reduces loss very quickly — from
   0.679 to 0.039, over 17x lower, using only 6 labeled examples and 20
   training steps.
3. Because low training loss alone can reflect memorization of the
   specific training examples rather than genuine learning — the
   held-out check (sentences never seen during training) verifies the
   model actually generalized the underlying sentiment concept, which
   it did correctly in the verified example (`[1, 0]`, matching
   positive/negative as expected).
4. Full fine-tuning updates every parameter in the model, pretrained
   body included. A frozen-body approach only trains the new
   classification head, leaving the pretrained body's parameters
   unchanged. The tradeoff: freezing trains far fewer parameters (cheaper
   per step) but typically needs more labeled data or training steps to
   reach comparable accuracy, since the frozen representations can't
   adapt to the specific task.
5. Because fine-tuning only needs to teach the model a specific
   task-mapping on top of language understanding it already has from
   pretraining (module 00's two-phase paradigm) — training from random
   initialization would require learning both general language
   structure and the specific task from the same tiny dataset, which 6
   examples cannot realistically provide.

</details>

## Further reading & sources

- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - Section 4 describes fine-tuning BERT for downstream tasks, including the classification-head-on-`[CLS]` pattern verified in this module.
- [Hugging Face documentation: BertForSequenceClassification](https://huggingface.co/docs/transformers/en/model_doc/bert#transformers.BertForSequenceClassification) - the real model class used throughout this module's verification code.
- [Hugging Face documentation: Fine-tuning a pretrained model](https://huggingface.co/docs/transformers/en/training) - a broader, practical guide to the fine-tuning workflow this module verifies a minimal version of directly.
- [Track 03, Module 00: The Pretraining Paradigm](../00-the-pretraining-paradigm/README.md) - the two-phase pretrain-then-adapt framing this module's verified experiment is a direct, working instance of.
- [Track 03, Module 02: BERT Architecture Deep Dive](../02-bert-architecture-deep-dive/README.md) - verifies `pooler_output`, the exact vector this module's classification head attaches to.

## Next

[Module 04: BERT Variants: RoBERTa, DistilBERT, DeBERTa](../04-bert-variants-roberta-distilbert-deberta/README.md)
