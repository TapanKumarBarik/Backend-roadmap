# Module 14: The Complete Transformer Block

## Why this matters

Modules 04-13 built every individual piece: attention (04-08), position
(09-11), the FFN (12), and residual connections plus layer
normalization (13). This module assembles all of them into one
complete, working transformer block — verified to preserve shape
end-to-end, verified to integrate causal masking (module 07) correctly,
and verified to compose cleanly when stacked (a direct preview of
module 15-16). This is the single unit every real transformer repeats,
unmodified in its basic structure, dozens or hundreds of times.

## Concepts

### The block, assembled

```
 x (n, d_model)
   │
   ├──────────────────────┐
   │                       │  (residual path — module 13)
   ▼                       │
 LayerNorm ──► Attention ──┘
   │                       (attn_out added back to x)
   ▼
 x = x + attn_out
   │
   ├──────────────────────┐
   │                       │  (second residual path)
   ▼                       │
 LayerNorm ──► FFN ────────┘
   │                       (ffn_out added back to x)
   ▼
 x = x + ffn_out
   │
   ▼
 output (n, d_model)  — SAME shape as input
```

Two sub-layers (attention, then FFN), each wrapped in its own
pre-norm-style (module 13) residual connection.

### Verified: a working, complete implementation

```python
import torch
import torch.nn as nn

class TransformerBlock(nn.Module):
    def __init__(self, d_model, num_heads, d_ff):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, num_heads, batch_first=True)
        self.ln2 = nn.LayerNorm(d_model)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff), nn.GELU(), nn.Linear(d_ff, d_model)
        )

    def forward(self, x, attn_mask=None):
        h = self.ln1(x)
        attn_out, _ = self.attn(h, h, h, attn_mask=attn_mask, need_weights=False)
        x = x + attn_out          # residual around attention (module 13)
        h2 = self.ln2(x)
        x = x + self.ffn(h2)      # residual around the FFN (module 13)
        return x
```

Every piece here is something modules 04-13 verified individually:
`nn.MultiheadAttention` (modules 04-08), `LayerNorm` and the `x + ...`
residual pattern (module 13), the two-linear-layers-with-GELU FFN
(module 12). Nothing new is introduced at this step — only assembly.

### Verified: shape is preserved end to end

```python
d_model, num_heads, d_ff = 16, 4, 64
block = TransformerBlock(d_model, num_heads, d_ff)
x = torch.randn(1, 5, d_model)
out = block(x)
print(x.shape, out.shape, x.shape == out.shape)
```

Verified output: `torch.Size([1, 5, 16])` for both input and output —
**`True`**. This is the property that makes stacking possible at all
(module 15): a block that changed shape couldn't be fed directly into
an identical copy of itself.

### Verified: causal masking (module 07) integrates directly

```python
n = 5
causal_mask = torch.triu(torch.ones(n, n) * float("-inf"), diagonal=1)
out_causal = block(x, attn_mask=causal_mask)
print(out_causal.shape)
```

Verified output: `torch.Size([1, 5, 16])` — the exact same additive
`-inf` mask verified in module 07 passes straight through to the
block's internal attention call, with no special handling needed
elsewhere in the block. Masking is entirely the attention sub-layer's
concern; the residual and FFN paths are unaffected by whether or how
attention is masked.

### Verified: stacking multiple blocks preserves shape all the way through

```python
blocks = nn.ModuleList([TransformerBlock(d_model, num_heads, d_ff) for _ in range(6)])
h = x
for b in blocks:
    h = b(h, attn_mask=causal_mask)
print(h.shape)
```

Verified output: `torch.Size([1, 5, 16])` — after 6 independent blocks
(different random weights each), the shape is still exactly what it
started as. This is what module 15's "stacking blocks into a model"
actually is: this exact loop, run many more times (real models commonly
stack dozens), each block refining the representation further without
ever changing its shape.

### What each part contributes, restated in one place

```
 Sub-component            What it does                        Verified module
 ──────────────────       ──────────────────────────────       ────────────────
 LayerNorm (pre-attn)      normalizes token scale               module 13
 Attention                 mixes information across positions   modules 04-08
 Residual (around attn)    preserves gradient flow at depth     module 13
 LayerNorm (pre-FFN)       normalizes token scale again          module 13
 FFN                       per-token nonlinear processing        module 12
 Residual (around FFN)     preserves gradient flow at depth       module 13
```

## Reference

```
 Property                        Verified
 ─────────────────────           ─────────────────────────────────────
 Shape preservation               (1,5,16) in -> (1,5,16) out, exactly
 Causal masking integration        module 07's additive -inf mask
                                    passes straight through, no special
                                    handling elsewhere in the block
 Stacking (6 blocks)                shape still (1,5,16) after 6
                                    independent blocks in sequence
 Total parameters (this            3,280 (attention + 2x LayerNorm +
 example configuration)             FFN combined)
```

## Hands-on exercises

### Exercise 1 — reproduce the complete block and verify shape preservation

Build the exact `TransformerBlock` class above with your own choice of
`d_model`, `num_heads`, `d_ff`, and sequence length, and confirm input
and output shapes match exactly.

### Exercise 2 — verify the residual paths are actually contributing

Zero out the attention sub-layer's output weights (so `attn_out` is
always exactly `0`) and confirm the block's output for the
attention step becomes exactly `x` (the residual path alone, since
`x + 0 = x`). Do the same for the FFN's final linear layer. This
directly confirms the residual connections are doing exactly what
module 13 claims — passing the input straight through when the
sub-layer contributes nothing.

### Exercise 3 — stack a deeper model and check gradient flow

Stack 20-30 `TransformerBlock` instances (module 13's depth range) and
measure the gradient magnitude reaching the very first block's input,
similar to module 13's experiment. Confirm the full block (with its
built-in residual connections and layer normalization) maintains a
healthy gradient magnitude at this depth, connecting module 13's
isolated finding to the complete, assembled block.

## Independent challenge

A teammate proposes simplifying the block by applying only one
LayerNorm per block (shared between the attention and FFN sub-layers)
instead of two separate ones, to save a small number of parameters.
Using this module's verified block structure and module 13's
per-token-normalization finding, write two or three sentences on what
this change would actually do to each sub-layer's input, and whether
that seems like a safe simplification.

<details><summary>Discussion</summary>

Sharing one LayerNorm would mean the FFN sub-layer receives its input
normalized based on statistics computed *before* the attention
sub-layer's residual addition, rather than being renormalized to
account for whatever attention's contribution changed about the
running representation's scale (verified in module 13: values can
drift as they accumulate across residual additions). This isn't
obviously catastrophic, but it removes exactly the "re-normalize before
each sub-layer processes it" guarantee module 13 verified — the FFN
would be operating on a representation whose scale reflects the
pre-attention state, not its actual current state, which is a real
behavioral change worth testing rather than assuming is harmless purely
because it saves a small number of parameters.

</details>

## Common mistakes & troubleshooting

- **Applying the residual connection around the wrong quantity** (e.g.,
  adding the *normalized* input back instead of the original `x`).
  Verified above: the residual path uses the raw, pre-normalization
  `x`, with `LayerNorm` applied only to the copy fed into the
  sub-layer — this is what keeps the direct gradient path (module 13)
  purely linear in the pre-norm convention.
- **Forgetting attention masking is entirely local to the attention
  sub-layer.** Verified above: the causal mask passes straight into
  `self.attn(...)`'s `attn_mask` argument — no other part of the block
  needs to know about or handle masking.
- **Assuming a block with zeroed-out sub-layer weights would produce
  zero output.** Verified in exercise 2: it produces the *input*
  passed straight through (via the residual connection), not zero —
  a useful sanity check that residual wiring is correct.
- **Testing shape preservation only once, on a single random input.**
  Confirm it holds across multiple sequence lengths and batch sizes,
  since a subtle reshape bug can sometimes only appear for specific
  shapes.

## Checkpoint quiz

1. List the block's operations in order, from input to output.
2. What did the verified shape-preservation check confirm, and why
   does that property matter for stacking (module 15)?
3. Where does causal masking (module 07) get applied within the block,
   and does any other part of the block need to handle it?
4. What did zeroing out a sub-layer's output weights (exercise 2)
   confirm about how the residual connection behaves?
5. Why might sharing a single LayerNorm between the attention and FFN
   sub-layers (instead of two separate ones) change the FFN's actual
   input, even if it saves parameters?

<details><summary>Answers</summary>

1. LayerNorm, then attention, then add the result back to the original
   input (residual); LayerNorm again, then the FFN, then add that
   result back to the current running value (a second residual).
2. That the block's output shape exactly matches its input shape
   (`(1,5,16)` in both cases). This matters because stacking many
   blocks (module 15) requires each block's output to be a valid input
   to the next identical block — a shape change would break that chain.
3. Entirely within the attention sub-layer, passed as the `attn_mask`
   argument to `self.attn(...)`. No other part of the block (the
   residual paths, the LayerNorms, or the FFN) needs any special
   handling for masking.
4. That the block's output for that step becomes exactly the original
   input `x`, not zero — confirming the residual connection passes the
   input straight through when the sub-layer's own contribution is
   zero, exactly as module 13's `output = x + Sublayer(x)` formula
   predicts.
5. Because the FFN would then be normalized based on statistics
   computed before the attention sub-layer's residual addition, rather
   than reflecting the representation's actual current scale after
   attention has contributed to it — module 13 verified that values
   can drift in scale as they accumulate across residual additions, and
   a shared LayerNorm would lose the re-normalization step that
   specifically addresses this before the FFN processes it.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.1 defines the complete encoder/decoder block structure this module assembles and verifies.
- [PyTorch documentation: torch.nn.TransformerEncoderLayer](https://pytorch.org/docs/stable/generated/torch.nn.TransformerEncoderLayer.html) - a real, production implementation of the same block structure verified in this module, with a `norm_first` flag selecting pre-norm vs. post-norm (module 13).
- [On Layer Normalization in the Transformer Architecture (Xiong et al., 2020)](https://arxiv.org/abs/2002.04745) - the pre-norm vs. post-norm gradient-stability analysis this module's block implementation follows (pre-norm).
- [Track 02, Module 13: Residual Connections and Layer Normalization](../13-residual-connections-and-layer-normalization/README.md) - the individually-verified components this module assembles into one complete block.
- [Track 02, Module 07: Attention Masks and Causal Masking](../07-attention-masks-and-causal-masking/README.md) - the masking mechanism verified here to integrate directly into the block's attention sub-layer.

## Next

[Module 15: Stacking Blocks Into a Model](../15-stacking-blocks-into-a-model/README.md)
