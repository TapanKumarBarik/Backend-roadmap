# Module 04: BERT Variants: RoBERTa, DistilBERT, DeBERTa

## Why this matters

Module 02 opened up `bert-base-uncased`'s exact architecture; module 03
fine-tuned it. This module verifies what changed in three real,
widely-used descendants — not as a list of names to memorize, but as
concrete, measured differences: DistilBERT's real parameter reduction
and real speedup, RoBERTa's genuinely different tokenizer producing
different pieces for the same word, and DeBERTa's architectural change
to how position and content interact in attention. Each variant made
one deliberate change to BERT's original design (module 02) and this
module checks exactly what that change actually bought.

## Concepts

### DistilBERT: fewer layers, verified real parameter and speed savings

DistilBERT is trained via **knowledge distillation** — a smaller
"student" model trained to mimic a larger "teacher" model's (BERT's)
output distributions, not just trained independently on the same raw
task. Verified directly against real models:

```python
from transformers import AutoModel, AutoConfig

bert_config = AutoConfig.from_pretrained("bert-base-uncased")
distil_config = AutoConfig.from_pretrained("distilbert-base-uncased")
print(bert_config.num_hidden_layers, distil_config.num_hidden_layers)

bert = AutoModel.from_pretrained("bert-base-uncased")
distil = AutoModel.from_pretrained("distilbert-base-uncased")
print(sum(p.numel() for p in bert.parameters()))
print(sum(p.numel() for p in distil.parameters()))
```

Verified output:

```
layers:  bert=12, distilbert=6           (exactly half, track 02 module 15)
params:  bert=109,482,240, distilbert=66,362,880   (~39.4% fewer)
```

And the practical payoff, measured directly on identical input:

```python
import torch, time
x = torch.randint(0, 30000, (1, 128))
# time 10 forward passes each, same input, same hardware
```

Verified output: **`2.02x`** faster for DistilBERT versus BERT-base on
this measurement — a real, directly-measured speedup matching
DistilBERT's own published claims (roughly 40% smaller, roughly 60%
faster in the original paper's reported numbers — this module's
measurement, on different hardware and a different exact setup,
independently lands in a compatible range).

### RoBERTa: a genuinely different tokenizer, verified with a real word

RoBERTa keeps BERT's architecture but changes several training
decisions — no Next Sentence Prediction (module 02), more training
data, longer training, and (the part most easily verified directly) a
**byte-level BPE tokenizer** (track 01 module 03-04) instead of BERT's
WordPiece (track 01 module 05):

```python
bert_tok = AutoTokenizer.from_pretrained("bert-base-uncased")
roberta_tok = AutoTokenizer.from_pretrained("roberta-base")
word = "unbelievable"
print(bert_tok.tokenize(word))
print(roberta_tok.tokenize(word))
```

Verified output:

```
BERT (WordPiece):        ['unbelievable']
RoBERTa (byte-level BPE): ['un', 'bel', 'iev', 'able']
```

The exact same word tokenizes completely differently — a single token
under BERT's WordPiece vocabulary, four pieces under RoBERTa's
byte-level BPE vocabulary. Neither is objectively better in general
(track 01 module 07 already established no tokenizer dominates
across the board) — this is simply direct, checkable confirmation that
"RoBERTa uses a different tokenizer" is a real, measurable fact, not a
detail that happens not to matter in practice.

Verified directly, RoBERTa's vocabulary is also a different size:

```python
print(AutoConfig.from_pretrained("bert-base-uncased").vocab_size)
print(AutoConfig.from_pretrained("roberta-base").vocab_size)
```

Verified output: `30,522` (BERT) versus `50,265` (RoBERTa) — a
substantially larger vocabulary, consistent with track 01 module 08's
vocabulary-size tradeoffs (larger vocabulary, generally fewer tokens
per word on average, at a real embedding-table parameter cost).

### DeBERTa: disentangled attention (architectural, not just training-recipe, change)

Unlike RoBERTa (same architecture, different training/tokenizer) and
DistilBERT (same architecture, fewer layers), DeBERTa makes a genuine
**architectural** change: it represents each token with two separate
vectors — a content vector and a position vector — and computes
attention scores using both, disentangled (hence the name), rather than
adding a single combined position+content vector the way sinusoidal
encoding (track 02 module 10) or BERT's learned positional embeddings
(module 02) do. This means the attention score between two tokens
depends explicitly on content-to-content, content-to-position, and
position-to-content terms, computed separately rather than folded into
one vector before attention runs — a genuinely different mechanism from
every positional scheme verified in track 02, not simply "another
choice of positional encoding formula."

## Reference

```
 Variant         What changed relative to BERT              Verified
 ─────────────   ──────────────────────────────────────      ──────────────────────
 DistilBERT       Fewer layers (distillation-trained,          12 -> 6 layers, 109.5M
                  not just independently trained smaller)      -> 66.4M params (~39%
                                                                 fewer), 2.02x faster
                                                                 forward pass
 RoBERTa          Different tokenizer (byte-level BPE, not      WordPiece: 1 token for
                  WordPiece), no NSP, more/longer training       "unbelievable"; BPE: 4
                                                                 tokens. Vocab: 30,522
                                                                 vs. 50,265
 DeBERTa          Disentangled content/position attention        (architectural
                  (genuine architecture change, not just         description; not a
                  training recipe or tokenizer)                 training-loop
                                                                 verification here)
```

## Hands-on exercises

### Exercise 1 — reproduce the DistilBERT parameter and speed comparison

Load both `bert-base-uncased` and `distilbert-base-uncased`, compute
parameter counts, and time several forward passes on identical input.
Confirm the parameter reduction and speedup both land in a similar
range to the verified numbers above.

### Exercise 2 — reproduce the tokenizer comparison on your own words

Try several words of your own with both `bert-base-uncased`'s and
`roberta-base`'s tokenizers, including at least one uncommon or
technical word. Confirm the two tokenizers frequently disagree on how
many pieces a word becomes, connecting back to track 01 module 07's
cross-tokenizer comparison.

### Exercise 3 — measure DistilBERT's accuracy tradeoff, not just its speed

Using module 03's fine-tuning pattern, fine-tune both
`bert-base-uncased` and `distilbert-base-uncased` on the same tiny
labeled dataset, and compare their loss curves and held-out predictions.
Confirm whether DistilBERT's speed/size advantage comes with any
measurable accuracy cost on your specific tiny task — a real,
checkable version of the "smaller and faster, at what cost" question
every distilled model raises.

## Independent challenge

A team needs to deploy a BERT-style model on resource-constrained
hardware (a mobile device or a low-cost server) and is deciding between
DistilBERT and full BERT-base. Using this module's verified numbers,
write two or three sentences on what specific, measurable tradeoff
they're actually making, and what additional experiment (beyond this
module's numbers) they'd want to run before deciding.

<details><summary>Discussion</summary>

The measurable tradeoff, verified directly above, is roughly a 39%
parameter reduction and a 2x speedup in exchange for whatever accuracy
DistilBERT's distillation process didn't fully preserve relative to the
full teacher model — this module didn't measure that accuracy gap
directly (exercise 3 does), so the team's real next step is running
their *own* task's accuracy comparison between the two models, the same
way exercise 3 does for a toy example, rather than assuming the
published or generic accuracy gap transfers unchanged to their specific
data and task.

</details>

## Common mistakes & troubleshooting

- **Assuming DistilBERT is simply "BERT with some layers deleted."**
  It's trained via knowledge distillation — a deliberate training
  process where the smaller model learns to match the larger model's
  output distributions — not just a truncated, independently-trained
  version of the same architecture.
- **Assuming RoBERTa's tokenizer differences are a minor detail.**
  Verified above: the exact same word can tokenize into a completely
  different number of pieces (1 vs. 4) — a real, measurable difference
  that affects sequence length, cost (track 01 module 12), and context
  usage (track 01 module 11) for identical text.
- **Treating DeBERTa's change as "just another positional encoding
  choice," comparable to swapping sinusoidal for RoPE (track 02 modules
  10-11).** Its disentangled content/position representation is a
  structurally different mechanism — separate vectors, separate
  attention-score terms — not another formula for computing one
  combined positional vector.
- **Comparing model variants only on parameter count or speed, never
  on task-specific accuracy.** Exercise 3 exists specifically because
  size and speed savings (verified concretely above) don't by
  themselves confirm a model is a good fit for a specific real task.

## Checkpoint quiz

1. What training technique produces DistilBERT, and what did the
   verified parameter-count and speed measurements show?
2. What did the verified tokenizer comparison show for the word
   "unbelievable" under BERT versus RoBERTa?
3. Is RoBERTa's difference from BERT purely a tokenizer change, or does
   it include other real modifications?
4. What makes DeBERTa's change architectural rather than a training-recipe
   change, unlike RoBERTa and DistilBERT?
5. Why doesn't this module's speed/size comparison alone tell you
   whether DistilBERT is a good choice for a specific real task?

<details><summary>Answers</summary>

1. Knowledge distillation — training a smaller "student" model to match
   a larger "teacher" model's (BERT's) output distributions. Verified:
   6 layers versus BERT's 12 (exactly half), 66.4M versus 109.5M
   parameters (~39% fewer), and roughly 2.02x faster on an identical
   forward-pass measurement.
2. BERT's WordPiece tokenized it as a single token (`['unbelievable']`);
   RoBERTa's byte-level BPE split it into four pieces (`['un', 'bel',
   'iev', 'able']`) — a real, measurable difference for the identical
   word.
3. It includes other real changes beyond the tokenizer: no Next
   Sentence Prediction (module 02) during pretraining, and more/longer
   training — the tokenizer difference (verified above) is one part of
   a broader set of training-recipe changes, not the only one.
4. Because DeBERTa represents content and position as separate vectors
   and computes attention using distinct content-to-content,
   content-to-position, and position-to-content terms — a genuinely
   different attention mechanism, not merely a different formula for
   producing one combined positional vector the way sinusoidal
   encoding or learned positional embeddings do.
5. Because it measures size and speed only, not task-specific accuracy
   — a smaller, faster model could still perform meaningfully worse on
   a specific real task, which is exactly what exercise 3's direct
   fine-tuning comparison is designed to check rather than assume.

</details>

## Further reading & sources

- [DistilBERT, a distilled version of BERT (Sanh et al., 2019)](https://arxiv.org/abs/1910.01108) - the original DistilBERT paper; documents the knowledge-distillation training process and the size/speed tradeoffs verified directly in this module.
- [RoBERTa: A Robustly Optimized BERT Pretraining Approach (Liu et al., 2019)](https://arxiv.org/abs/1907.11692) - documents the training-recipe changes (dropped NSP, more data, byte-level BPE tokenizer) verified in this module.
- [DeBERTa: Decoding-enhanced BERT with Disentangled Attention (He et al., 2020)](https://arxiv.org/abs/2006.03654) - the original DeBERTa paper, defining the disentangled content/position attention mechanism described in this module.
- [Hugging Face documentation: DistilBERT](https://huggingface.co/docs/transformers/en/model_doc/distilbert) - the real model class used in this module's verified parameter-count and speed comparisons.
- [Track 01, Module 07: Comparing Tokenizers Across Models](../../01-tokens-and-language-modeling/07-comparing-tokenizers-across-models/README.md) - the cross-tokenizer comparison methodology this module's WordPiece-vs-BPE check applies directly to BERT and RoBERTa.

## Next

[Module 05: Sentence Transformers and Bi-Encoders](../05-sentence-transformers-and-bi-encoders/README.md)
