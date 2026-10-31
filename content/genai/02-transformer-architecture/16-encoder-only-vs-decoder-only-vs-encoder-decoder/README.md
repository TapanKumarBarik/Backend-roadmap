# Module 16: Encoder-Only vs. Decoder-Only vs. Encoder-Decoder

## Why this matters

Modules 04-15 built one transformer block and stacked it into a model —
but "the transformer" actually splits into three real architectural
families, distinguished by exactly two things this module verifies
directly: whether self-attention is masked (module 07) or not, and
whether a third kind of attention — **cross-attention**, queries from
one sequence, keys and values from a different one entirely — is
present at all. Track 03 covers BERT (encoder-only) and GPT
(decoder-only) in depth; this module verifies the mechanical
distinction between all three families precisely, including the one
concrete, checkable property that separates cross-attention from
everything modules 04-15 covered: **its output length always matches
the query sequence, never the key/value sequence.**

### encoder-only, decoder-only, encoder-decoder

```
 ENCODER-ONLY (BERT)              DECODER-ONLY (GPT)             ENCODER-DECODER (T5,
                                                                   original Transformer)
 bidirectional self-attn          causal self-attn                encoder: bidirectional
 (every token sees every           (module 07 — position i          self-attn
 other token, module 07's          can only see j <= i)            decoder: causal
 "no mask" case)                                                    self-attn PLUS
                                                                     cross-attention
                                                                     into the encoder's
                                                                     output
```

## Concepts

### Verified: encoder-style (bidirectional) vs. decoder-style (causal) self-attention

Both use exactly the same scaled dot-product attention mechanism
(module 06) — the only difference is whether module 07's causal mask is
applied:

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)
n_enc, d = 6, 8
enc_x = torch.randn(1, n_enc, d)

enc_out = F.scaled_dot_product_attention(enc_x, enc_x, enc_x)               # BERT-style: no mask
dec_out = F.scaled_dot_product_attention(enc_x, enc_x, enc_x, is_causal=True)  # GPT-style: causal mask

print(enc_out.shape, dec_out.shape)
print(torch.allclose(enc_out, dec_out))
```

Verified: identical shapes, but **different values** (`allclose`
returns `False`) — every architectural difference between BERT-style
and GPT-style self-attention traces back to exactly the masking
decision verified in module 07, not to any other mechanism.

### Verified: cross-attention is a genuinely different operation, with a checkable signature

Encoder-decoder models (T5, the original Transformer's decoder) add a
third attention computation per decoder layer: **cross-attention**,
where queries come from the decoder's own sequence, but keys and values
come from the *encoder's* output — a completely different sequence,
potentially a completely different length:

```python
n_enc, n_dec, d = 6, 4, 8
enc_x = torch.randn(1, n_enc, d)
dec_x = torch.randn(1, n_dec, d)

enc_out = F.scaled_dot_product_attention(enc_x, enc_x, enc_x)
dec_self_out = F.scaled_dot_product_attention(dec_x, dec_x, dec_x, is_causal=True)

# cross-attention: Q from the decoder, K/V from the ENCODER's output
cross_out = F.scaled_dot_product_attention(dec_self_out, enc_out, enc_out)
print(cross_out.shape)
```

Verified output: `torch.Size([1, 4, 8])` — **the decoder's sequence
length (4), not the encoder's (6)**. This is the checkable signature of
cross-attention: unlike self-attention (where Q, K, and V always come
from the same sequence and therefore share the same length), cross-
attention's *output* length always matches the **query** sequence's
length, regardless of how long the key/value sequence is. Verified
further, deliberately swapping which sequence provides queries:

```python
swapped = F.scaled_dot_product_attention(enc_x, dec_x, dec_x)  # Q from encoder (len 6), K/V from decoder (len 4)
print(swapped.shape)
```

Verified output: `torch.Size([1, 6, 8])` — output length follows
whichever sequence supplied the queries, confirmed directly by swapping
the roles and watching the output length change to match.

### Why this distinction matters architecturally

Cross-attention is what lets a decoder "look back" at an entirely
different, already-fully-processed sequence (an encoded source
sentence, in the original Transformer's translation setup) while still
generating its own output causally. This is a structurally different
capability from self-attention (module 04-08), which always mixes a
sequence with itself. A pure decoder-only model (GPT) never has this —
everything it attends to (module 07's causal self-attention) comes from
its own single, growing sequence, including whatever "context" was
supplied by concatenating it into the same prompt (track 01's chat
templates) rather than through a separate encoder pathway.

### Summarizing the three families by their actual mechanisms

```
 Family              Self-attention type       Cross-attention?    Real example
 ──────────────      ────────────────────       ─────────────────   ─────────────
 Encoder-only          bidirectional (no          no                 BERT
                       mask, module 07)
 Decoder-only           causal (masked,             no                 GPT, Llama
                       module 07)
 Encoder-decoder         encoder: bidirectional      YES — decoder      T5, original
                        decoder: causal              queries attend      Transformer
                                                       into encoder
                                                       output
```

## Reference

```
 Property                       Verified behavior
 ─────────────────────────      ──────────────────────────────────────
 Self-attention output length     always matches the single shared
                                  input sequence's length
 Cross-attention output length     always matches the QUERY sequence's
                                    length, independent of the key/value
                                    sequence's length (verified: 4 when
                                    Q comes from the 4-length sequence,
                                    6 when Q comes from the 6-length
                                    sequence, K/V held at the other
                                    length in each case)
 Bidirectional vs. causal          same mechanism (module 06), only
 self-attention                    the mask (module 07) differs;
                                    verified same shape, different
                                    values
```

## Hands-on exercises

### Exercise 1 — reproduce the bidirectional-vs-causal comparison

Run the exact `enc_out`/`dec_out` comparison above with your own random
input, and confirm the shapes match but the values differ.

### Exercise 2 — reproduce the cross-attention length-signature verification

Run the cross-attention example with several different `(n_enc,
n_dec)` combinations of your own choosing, and confirm the output
length always matches whichever sequence supplied the queries — never
the key/value sequence's length.

### Exercise 3 — build a minimal encoder-decoder block using module 14's pieces

Extend module 14's `TransformerBlock` into a `DecoderBlock` that adds a
second attention sub-layer between the causal self-attention and the
FFN — this second sub-layer takes the decoder's current hidden state as
queries and a separately-provided encoder output as keys/values (cross-
attention, verified above). Confirm the full block still preserves the
decoder's own sequence length in its output, using an encoder output of
a different length as the cross-attention source.

## Independent challenge

A teammate proposes building a document-summarization model as
decoder-only (concatenating the document and the desired summary into
one sequence, GPT-style) rather than encoder-decoder (T5-style, with
the document processed by a bidirectional encoder and cross-attention
into the decoder). Using this module's verified distinctions, write
two or three sentences on what specific capability the decoder-only
approach gives up, and why an encoder-decoder design might process the
source document differently.

<details><summary>Discussion</summary>

A decoder-only design processes the document itself under a *causal*
mask (verified above to differ in actual values, not just architecture
diagrams, from bidirectional attention) — meaning each document token,
while being "read" as part of the prompt, can only attend to earlier
document tokens, not later ones, even though the whole document is
already fully available. An encoder-decoder design processes the source
document with a *bidirectional* encoder specifically so every document
token can incorporate context from the entire document (both directions)
before the decoder ever starts generating, then lets the decoder
attend into that fully-contextualized representation via cross-
attention. The decoder-only approach isn't necessarily worse in
practice (module 11 in track 03 covers why decoder-only architectures
have become dominant regardless), but it does give up "fully
bidirectional processing of the source before generation begins" as an
architectural property — cross-attention into a bidirectional encoder
is a structurally different capability, not just a re-framing of the
same computation.

</details>

## Common mistakes & troubleshooting

- **Assuming encoder-only and decoder-only differ in more than the
  mask.** Verified above: both use the exact same scaled dot-product
  attention mechanism; the entire architectural difference traces back
  to whether module 07's causal mask is applied.
- **Confusing cross-attention with self-attention with an unusual
  input.** Verified above: cross-attention's defining, checkable
  property is that its output length tracks the *query* sequence,
  independent of the key/value sequence's length — self-attention can
  never exhibit this, since Q, K, and V always share one sequence and
  therefore one length.
- **Assuming a decoder-only model has some hidden equivalent of
  cross-attention.** It doesn't — everything a decoder-only model
  attends to comes from its own single sequence (module 07's causal
  self-attention only); any "external" information has to be
  concatenated into that same sequence (track 01's chat templates),
  not supplied through a separate attention pathway.

## Checkpoint quiz

1. What is the single mechanical difference between encoder-only and
   decoder-only self-attention?
2. What did the verified cross-attention experiment show about output
   length, and how does that differ from self-attention?
3. Does a pure decoder-only model (GPT-style) have any cross-attention
   sub-layer?
4. In the verified "swapped" experiment, what determined the output's
   sequence length?
5. Name the three architectural families this module distinguishes,
   and one real example model of each.

<details><summary>Answers</summary>

1. Whether the causal mask (module 07) is applied — encoder-only uses
   bidirectional (unmasked) self-attention; decoder-only uses causal
   (masked) self-attention. Both use the identical underlying attention
   mechanism (module 06); verified to produce the same shape but
   different values.
2. That the output length always matches the length of whichever
   sequence supplied the **queries**, regardless of the key/value
   sequence's length (verified: 4 when queries came from the
   4-length sequence, 6 when queries came from the 6-length sequence).
   Self-attention can never show this, since Q, K, V all share one
   sequence and therefore one length by construction.
3. No — a decoder-only model only has causal self-attention operating
   on its own single sequence; there's no separate encoder output for
   it to cross-attend into.
4. Which sequence supplied the queries — verified directly by swapping
   which input played the query role and confirming the output length
   changed to match.
5. Encoder-only (bidirectional self-attention only, no cross-attention)
   — BERT. Decoder-only (causal self-attention only, no
   cross-attention) — GPT/Llama. Encoder-decoder (bidirectional encoder
   self-attention, plus causal decoder self-attention, plus
   cross-attention from decoder into encoder output) — T5 and the
   original Transformer.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.2.3 explicitly describes the three attention configurations (encoder self-attention, decoder self-attention, and encoder-decoder/cross-attention) this module verifies numerically.
- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - the canonical encoder-only architecture, covered in depth in track 03.
- [Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer (Raffel et al., 2020)](https://arxiv.org/abs/1910.10683) - T5, a widely-used encoder-decoder architecture using the cross-attention mechanism verified in this module.
- [PyTorch documentation: torch.nn.functional.scaled_dot_product_attention](https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html) - the same function used throughout modules 05-16 to verify every attention variant in this track, including cross-attention here.
- [Track 02, Module 07: Attention Masks and Causal Masking](../07-attention-masks-and-causal-masking/README.md) - the exact masking mechanism this module's encoder-vs-decoder distinction is built on.

## Next

[Module 17: Implementing a Mini Transformer in PyTorch](../17-implementing-a-mini-transformer-in-pytorch/README.md)
