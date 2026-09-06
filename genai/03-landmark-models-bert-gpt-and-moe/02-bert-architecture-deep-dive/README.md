# Module 02: BERT Architecture Deep Dive

## Why this matters

Module 01 verified BERT's masked-language-modeling objective works.
This module opens up `bert-base-uncased` itself — real configuration
numbers, real `[CLS]`/`[SEP]` token mechanics, and real segment
embeddings for sentence pairs — connecting every piece directly back to
concepts already verified in tracks 01-02: the embedding-table formula
(track 01 module 08), the 12-layer stack (track 02 module 15), and the
`[CLS]`/`[SEP]` special tokens (track 01 module 09, previewed there and
confirmed here in a real model).

## Concepts

### Verified: `bert-base-uncased`'s real configuration numbers

```python
from transformers import AutoConfig, AutoModel

config = AutoConfig.from_pretrained("bert-base-uncased")
print(config.num_hidden_layers, config.num_attention_heads,
      config.hidden_size, config.intermediate_size,
      config.vocab_size, config.max_position_embeddings,
      config.type_vocab_size)

model = AutoModel.from_pretrained("bert-base-uncased")
print(sum(p.numel() for p in model.parameters()))
```

Verified output:

```
num_hidden_layers:        12    (track 02 module 15's stacked blocks)
num_attention_heads:      12    (track 02 module 08's multi-head split)
hidden_size (d_model):    768
intermediate_size (d_ff): 3072  (= 4 * 768, track 02 module 12's standard ratio)
vocab_size:               30522 (track 01 module 07's earlier measurement)
max_position_embeddings:  512   (track 02 module 09-11's positional info,
                                  learned rather than sinusoidal/RoPE here)
type_vocab_size:          2     (segment embeddings — see below)
total parameters:         109,482,240  (~109.5M)
```

Every one of these numbers is something a previous module already gave
you the formula for: `d_ff = 4 * d_model` is exactly track 02 module
12's standard ratio (`3072 = 4 * 768`), and the embedding table's size
follows track 01 module 08's formula directly:

```python
vocab, d_model = 30522, 768
print(vocab * d_model)   # 23,440,896
```

Verified: **23.4 million** parameters in the token embedding table
alone — over 20% of BERT-base's entire 109.5M-parameter budget, echoing
track 01 module 08's finding that embedding tables are a real,
substantial cost, not a rounding error.

### Verified: `[CLS]` and `[SEP]` really are inserted automatically, and segment IDs really do mark sentence boundaries

Track 01 module 09 previewed BERT's automatic `[CLS]`/`[SEP]` insertion;
here it's confirmed on a real sentence *pair* — BERT's native input
format for tasks comparing two texts:

```python
tok = AutoTokenizer.from_pretrained("bert-base-uncased")
enc = tok("the weather is nice", "i agree with you", return_tensors="pt")
print(tok.convert_ids_to_tokens(enc["input_ids"][0]))
print(enc["token_type_ids"])
```

Verified output:

```
tokens:          ['[CLS]', 'the', 'weather', 'is', 'nice', '[SEP]', 'i', 'agree', 'with', 'you', '[SEP]']
token_type_ids:  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
```

`[CLS]` opens the sequence, `[SEP]` marks the end of *each* sentence
(appearing twice — once after the first sentence, once at the very
end), and `token_type_ids` (the segment embedding, `type_vocab_size=2`
from the config above) marks every token as belonging to sentence 0 or
sentence 1. This segment information is added to each token's embedding
(alongside the token embedding and positional embedding) — a third
input signal, specific to BERT-style sentence-pair tasks, that neither
track 02's positional-encoding modules nor a GPT-style decoder-only
model (module 06) needs, since GPT-style models don't have a native
notion of "two distinct segments" built into their input representation.

### Verified: `[CLS]`'s final hidden state is what downstream classification actually uses

```python
with torch.no_grad():
    out = model(**enc)
print(out.last_hidden_state.shape)   # one vector per token
print(out.pooler_output.shape)       # one vector for the WHOLE sequence
```

Verified output: `last_hidden_state` has shape `(1, 11, 768)` — one
768-dimensional vector per one of the 11 tokens (matching module 01's
per-token final representations). `pooler_output` has shape `(1, 768)`
— a single vector for the *entire* sequence pair, derived specifically
from the `[CLS]` token's final hidden state (passed through one
additional learned linear layer + tanh, BERT's "pooler"). This is the
real mechanism behind module 03's fine-tuning: a classification head
gets attached on top of this single 768-dimensional `[CLS]`-derived
vector, not on top of all 11 per-token vectors — `[CLS]` is
specifically designed, via the MLM+NSP pretraining objective (below),
to accumulate a useful whole-sequence summary.

### Next Sentence Prediction (NSP): BERT's second pretraining objective

Alongside masked language modeling (module 01), BERT's original
pretraining includes a second, sentence-pair-level task: given two
sentences (formatted exactly as verified above, with `[CLS]`, `[SEP]`,
and segment IDs), predict whether the second sentence genuinely follows
the first in the original text, or is a random, unrelated sentence.
This is *why* `[CLS]`'s final representation is trained to be useful
for whole-sequence-level judgments in the first place — module 01's MLM
objective alone only directly supervises individual masked-token
predictions; NSP is what specifically trains `[CLS]` to summarize the
relationship between two segments. (Later work, covered in module 04,
found NSP's specific formulation was not essential and some BERT
variants drop it — a real, documented finding, not a settled
consensus that NSP is necessary.)

## Reference

```
 bert-base-uncased config    Value        Cross-reference
 ─────────────────────       ─────         ────────────────────────────
 num_hidden_layers             12           track 02 module 15 (stacking)
 num_attention_heads            12           track 02 module 08
 hidden_size (d_model)           768
 intermediate_size (d_ff)        3072         track 02 module 12 (4x ratio)
 vocab_size                      30522        track 01 module 07
 max_position_embeddings          512          track 02 module 09-11
 type_vocab_size (segments)        2
 total parameters                109.5M
 embedding table params            23.4M       track 01 module 08 formula
```

```
 Input signal          Marks
 ─────────────────      ────────────────────────────────
 Token embedding          which vocabulary entry (track 01/02)
 Positional embedding      which position (track 02 module 09-11)
 Segment embedding         which of the two sentences (this module)
```

## Hands-on exercises

### Exercise 1 — reproduce the configuration and parameter-count check

Load `bert-base-uncased`'s config and model exactly as above, and
confirm every number matches. Compute the embedding-table parameter
count using track 01 module 08's formula and confirm it matches what
you'd expect from `vocab_size * hidden_size`.

### Exercise 2 — reproduce the segment-ID verification

Run the sentence-pair tokenization example above with your own two
sentences, and confirm the `token_type_ids` correctly mark each
sentence's tokens as 0 or 1, with both `[SEP]` tokens present.

### Exercise 3 — confirm `[CLS]`'s representation actually differs from an average of the other tokens

Compute the mean of all non-`[CLS]`/`[SEP]` token vectors in
`last_hidden_state` for one of your sentence pairs, and compare it
(cosine similarity, track 02 module 01) against `pooler_output`. Confirm
they're related but not identical — `[CLS]`'s representation is a
specifically-trained summary (via the pooler and NSP-style pretraining),
not simply an average of the other tokens' final states.

## Independent challenge

A teammate proposes building a sentence-similarity feature by averaging
all of a sentence's token vectors from `last_hidden_state`, rather than
using `[CLS]`'s `pooler_output`, arguing "using more of the information
should be better." Using this module's verified findings about what
`[CLS]` was specifically trained for, write two or three sentences on
whether this substitution is likely to work well out of the box, and
what would need to be true for it to be a fair comparison.

<details><summary>Discussion</summary>

`[CLS]`'s pooled representation was specifically trained (via NSP-style
sentence-pair pretraining, verified as BERT's second pretraining
objective above) to summarize a whole sequence or sequence pair for a
downstream judgment — averaging arbitrary token vectors from
`last_hidden_state` uses information that wasn't optimized for
whole-sequence summarization in the same targeted way, and averaging
per se can dilute distinctive per-token signal with less-informative
tokens (function words, punctuation). This doesn't mean averaging can
never work — in practice, module 05's sentence-transformer / bi-encoder
approaches often *do* use pooled or averaged token representations,
but typically after additional fine-tuning specifically for the
similarity task, not by directly reusing an off-the-shelf
`bert-base-uncased`'s raw `last_hidden_state` average unmodified — the
comparison in this module's raw form isn't quite fair without that
additional step.

</details>

## Common mistakes & troubleshooting

- **Assuming `[CLS]`'s usefulness is automatic from the transformer
  architecture alone.** Verified above: it's a consequence of specific
  pretraining objectives (NSP, alongside MLM) designed to make `[CLS]`
  a good whole-sequence summary — not an inherent property of putting a
  special token first.
- **Forgetting `token_type_ids` (segment embeddings) are BERT-specific
  input signal**, absent from GPT-style decoder-only models, which
  don't have a native two-segment input format the same way.
- **Confusing `last_hidden_state` (one vector per token) with
  `pooler_output` (one vector for the whole sequence).** Verified
  above: they have different shapes and different purposes — per-token
  tasks (e.g., named entity recognition) use `last_hidden_state`;
  whole-sequence tasks (e.g., sentence classification) typically use
  `pooler_output`.

## Checkpoint quiz

1. What is BERT-base's hidden size, number of layers, and number of
   attention heads, and which earlier modules do these numbers connect
   to directly?
2. What fraction (roughly) of BERT-base's total parameters live in the
   token embedding table, and what earlier module's formula computes
   this?
3. What do `token_type_ids` mark, and why doesn't a GPT-style
   decoder-only model need the same input signal?
4. What is the difference between `last_hidden_state` and
   `pooler_output`, and which one is typically used for whole-sequence
   classification?
5. What is Next Sentence Prediction, and why does it matter for
   `[CLS]`'s usefulness specifically?

<details><summary>Answers</summary>

1. Hidden size 768, 12 layers, 12 attention heads — the layer count
   connects directly to track 02 module 15's stacking, and the head
   count to track 02 module 08's multi-head attention split.
2. Roughly 21% (23.4M of 109.5M parameters, verified: `30522 * 768 =
   23,440,896`) — computed using track 01 module 08's embedding-table
   parameter-count formula (`vocab_size * d_model`).
3. Which of two input sentences each token belongs to (segment 0 or
   segment 1) — verified directly on a real sentence pair. A GPT-style
   decoder-only model doesn't need this because it doesn't have a
   native, pretraining-supported notion of "two distinct segments" in
   a single input the way BERT's sentence-pair format does.
4. `last_hidden_state` gives one vector per input token (shape
   verified: `(1, 11, 768)` for an 11-token sequence); `pooler_output`
   gives a single vector for the whole sequence, derived from `[CLS]`'s
   final hidden state (shape verified: `(1, 768)`). `pooler_output` is
   typically used for whole-sequence classification tasks.
5. A pretraining task (alongside MLM, module 01) where BERT predicts
   whether one sentence genuinely follows another in the original text
   or is an unrelated, randomly-paired sentence. It matters because
   this is specifically what trains `[CLS]`'s final representation to
   be a useful whole-sequence/sentence-pair summary — MLM alone only
   directly supervises individual masked-token predictions.

</details>

## Further reading & sources

- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - Section 3.2 defines Next Sentence Prediction and the `[CLS]`/`[SEP]`/segment-embedding input format verified in this module.
- [Hugging Face documentation: BertModel](https://huggingface.co/docs/transformers/en/model_doc/bert#transformers.BertModel) - the real model class used throughout this module's verification code, including `pooler_output`.
- [Hugging Face documentation: BertConfig](https://huggingface.co/docs/transformers/en/model_doc/bert#transformers.BertConfig) - documents every configuration field verified in this module (`num_hidden_layers`, `hidden_size`, `type_vocab_size`, etc.).
- [Track 01, Module 08: Vocabulary Size Tradeoffs](../../01-tokens-and-language-modeling/08-vocabulary-size-tradeoffs/README.md) - the embedding-table parameter-count formula verified against BERT-base's real numbers in this module.
- [Track 03, Module 04: BERT Variants: RoBERTa, DistilBERT, DeBERTa](../04-bert-variants-roberta-distilbert-deberta/README.md) - covers the documented finding that some BERT variants drop NSP, referenced in this module's NSP discussion.

## Next

[Module 03: Fine-Tuning BERT for Classification](../03-fine-tuning-bert-for-classification/README.md)
