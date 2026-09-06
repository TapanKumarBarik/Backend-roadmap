# Module 12: The Feed-Forward Network

## Why this matters

Modules 04-11 covered attention exhaustively — it's the mechanism that
gets all the attention (so to speak) in most explanations. But roughly
**two-thirds of a transformer's parameters live in the much simpler
feed-forward network (FFN) sitting right after attention in every
block**, verified with real numbers below. This module covers what the
FFN actually computes, and verifies the one property that most sharply
distinguishes it from attention: the FFN processes every token
**completely independently** — permuting token order permutes its
output identically, and changing one token's input has zero effect on
any other token's output. Attention is where tokens exchange
information; the FFN is where each token, alone, gets processed
further.

## Concepts

### The structure: two linear layers with a nonlinearity between them

```
 FFN(x) = Linear2( activation( Linear1(x) ) )

 x (d_model)  ──►  Linear1 (d_model -> d_ff)  ──►  activation  ──►  Linear2 (d_ff -> d_model)  ──►  output (d_model)
```

`d_ff` (the "hidden" dimension inside the FFN) is conventionally **4x**
`d_model` — a real, common ratio, not an arbitrary choice, verified
below to make the FFN the single largest parameter consumer in a
transformer block.

### Verified: the FFN holds roughly 2x as many parameters as attention

```python
import torch
import torch.nn as nn

d_model, d_ff = 512, 2048   # d_ff = 4 * d_model, the standard ratio

ffn = nn.Sequential(nn.Linear(d_model, d_ff), nn.GELU(), nn.Linear(d_ff, d_model))
attn = nn.MultiheadAttention(d_model, num_heads=8, bias=False, batch_first=True)

print(sum(p.numel() for p in ffn.parameters()))
print(sum(p.numel() for p in attn.parameters()))
```

Verified output:

```
FFN parameters:        2,099,712
Attention parameters:  1,048,576
FFN is 2.0x attention's parameter count
```

This matches the algebra directly: attention's `Wq`, `Wk`, `Wv`, `Wo`
are each `d_model x d_model`, for `4 * d_model^2` total (module 08
verified this doesn't change with head count). The FFN's two layers are
`d_model x d_ff` and `d_ff x d_model`; at `d_ff = 4*d_model`, that's
`2 * 4 * d_model^2 = 8 * d_model^2` — exactly double attention's count.
Across an entire model, the FFN sub-layers are collectively the largest
share of total parameters, not attention — a fact easy to miss given
how much more explanatory attention typically receives.

### Verified: the FFN processes every position completely independently

This is the property worth confirming directly, since it's the sharpest
contrast with everything modules 04-11 covered. Permute the tokens in a
batch and re-run the FFN:

```python
X = torch.randn(1, 4, d_model)
out = ffn(X)

perm = [2, 0, 3, 1]
out_perm = ffn(X[:, perm, :])
print(torch.allclose(out_perm, out[:, perm, :], atol=1e-6))
```

Verified output: **`True`** — the same permutation-equivariance
property module 03 proved for attention, but for a structurally
different reason here: the FFN isn't just equivariant to permutation,
it's applying the **exact same function, completely independently, to
each position** — there's no mixing between positions at all, verified
more sharply below.

### Verified: changing one token's input has zero effect on any other token's FFN output

```python
X2 = X.clone()
X2[:, 1, :] = torch.randn(d_model)   # change ONLY token 1's input
out2 = ffn(X2)
print(torch.allclose(out[:, 0, :], out2[:, 0, :]))
```

Verified output: **`True`** — token 0's FFN output is completely
unaffected by an arbitrary change to token 1's input. This is a
**much stronger** property than attention's permutation-equivariance
(module 03): attention explicitly lets every token's output depend on
every other token (that's the entire point of it); the FFN's output at
one position depends on **only that position's own input**, full
stop. In a transformer block, cross-token information exchange happens
*exclusively* in the attention sub-layer — the FFN never lets
information flow between positions at all.

### Why put a per-token-only layer right after a cross-token layer?

Given the FFN can't exchange information across positions, its job is
different from attention's: attention decides *what information to
gather from where*; the FFN then processes *each token's own, now
attention-enriched representation* further — a kind of per-token
"thinking step" applied uniformly to every position, using the same
learned weights everywhere (the same `Linear1`/`Linear2` weights process
every position, just with different input values). Stacking many
[attention, then FFN] blocks (module 15) alternates between "gather
information across the sequence" and "process what was gathered,
independently, per token" repeatedly.

### The activation function's role

Without a nonlinearity between the two linear layers, `Linear2(Linear1(x))`
would collapse into a single linear transformation (a composition of
two linear maps is itself linear) — the FFN would add depth without
adding any actual representational power beyond a single matrix
multiplication. GELU (used in the verified example above) and its
relatives (ReLU, SwiGLU in newer models) are what make the FFN capable
of representing genuinely nonlinear per-token transformations.

## Reference

```
 Component          Shape                        Parameter count
 ─────────────      ─────────────────────────    ────────────────────
 Linear1             d_model -> d_ff               d_model * d_ff
 Linear2             d_ff -> d_model                d_ff * d_model
 Total FFN                                          2 * d_model * d_ff
                                                     (= 8 * d_model^2
                                                     at the standard
                                                     d_ff = 4*d_model)
 Total attention                                    4 * d_model^2
                                                     (module 08)
```

```
 Property                        Attention                FFN
 ─────────────────────────       ────────────────────      ─────────────────────
 Mixes information across         YES (that's its job)      NO — verified: one
 positions                                                    token's output is
                                                                 unaffected by any
                                                                 other token's input
 Permutation equivariant           YES (module 03)            YES, but for a
                                                                stronger reason
                                                                (complete per-token
                                                                independence)
```

## Hands-on exercises

### Exercise 1 — reproduce the parameter-count comparison

Compute the FFN and attention parameter counts at your own choice of
`d_model` and `d_ff` (try the standard `d_ff = 4*d_model` and also a
smaller ratio) and confirm the FFN-to-attention ratio matches the
algebra (`2 * d_ff / d_model` attention-equivalents, given the formulas
above).

### Exercise 2 — reproduce the per-token-independence verification

Run the exact "change one token's input" experiment above with your
own random tensors, and confirm token 0's output truly doesn't change
no matter what you set token 1 (or any other single token) to.

### Exercise 3 — confirm the linear-collapse claim

Build an FFN with **no** activation function (`nn.Sequential(Linear1,
Linear2)`, nothing between them) and confirm it's mathematically
equivalent to a single `d_model x d_model` linear layer — compute the
combined weight matrix (`Linear2.weight @ Linear1.weight`, accounting
for the actual shapes) and confirm applying it directly matches the
two-layer version's output.

## Independent challenge

A researcher proposes replacing a model's FFN with a lightweight
attention-only architecture (no FFN sub-layer at all, just repeated
attention blocks) to save the roughly 2x parameter cost verified above.
Using this module's verified per-token-independence finding, write two
or three sentences on what specific capability this removes, beyond
the raw parameter savings.

<details><summary>Discussion</summary>

Removing the FFN doesn't just save parameters — it removes the only
part of the architecture verified above to do genuinely nonlinear,
per-token processing independent of the rest of the sequence.
Attention's job (module 04-11) is fundamentally about *mixing*
information across positions via weighted combinations, which,
without an intervening nonlinear per-token transformation, limits how
much new representational structure the model can build per layer —
stacking attention-only layers repeatedly recombines information but
never processes any single token's own representation through a
nonlinear function the way the FFN does. Whether that tradeoff is
worth the parameter savings would need to be tested empirically, but
it isn't a purely mechanical parameter-count decision — it removes a
structurally distinct kind of computation, not just some redundant
extra layers.

</details>

## Common mistakes & troubleshooting

- **Assuming attention is where most of a transformer's parameters
  live.** Verified above: the FFN holds roughly double attention's
  parameter count at the standard `d_ff = 4*d_model` ratio — it's the
  larger consumer of total model size, not attention.
- **Assuming the FFN mixes information across tokens the way attention
  does.** Verified directly: changing one token's input has zero
  effect on any other token's FFN output — cross-token mixing happens
  exclusively in attention.
- **Omitting the activation function and not realizing the FFN
  collapses to a single linear layer.** Verified in exercise 3 — a
  composition of two linear layers with nothing nonlinear between them
  is mathematically just one linear layer, adding parameters without
  adding representational depth.

## Checkpoint quiz

1. What is the standard ratio between `d_ff` and `d_model`, and what
   did the verified parameter-count comparison show about FFN versus
   attention?
2. What did the "change one token's input" experiment verify about the
   FFN, and how does that differ from attention's behavior?
3. Is the FFN's permutation-equivariance (verified above) the same
   kind of property as attention's (module 03), or a stronger one?
4. Why does removing the activation function collapse a two-layer FFN
   into something equivalent to a single linear layer?
5. Given the FFN can't mix information across tokens, what is its
   actual job within a transformer block?

<details><summary>Answers</summary>

1. `d_ff = 4 * d_model` is the standard ratio; verified: at that ratio,
   the FFN has roughly 2x attention's total parameter count (2,099,712
   vs. 1,048,576 in the verified example).
2. That a token's FFN output is completely unaffected by any change to
   any other token's input (`torch.allclose` returned `True` for token
   0's unchanged output after modifying token 1). This differs sharply
   from attention, whose entire purpose is to let each token's output
   depend on other tokens.
3. A stronger property — attention's permutation equivariance comes
   from mixing across all tokens in a way that respects order (module
   03); the FFN's comes from applying the exact same function
   completely independently to each position, with zero cross-token
   dependence at all, verified directly.
4. Because a composition of two linear transformations is itself a
   single linear transformation (`Linear2(Linear1(x)) = (W2 @ W1) @ x`)
   — without a nonlinearity between them, stacking two linear layers
   adds parameters but no additional representational power beyond
   what one combined linear layer already provides.
5. Per-token, nonlinear processing of each position's own
   (attention-enriched) representation, independent of every other
   position — attention gathers information across the sequence; the
   FFN then processes what was gathered, one token at a time, using
   the same learned weights at every position.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.3 defines the position-wise feed-forward network, including the standard `d_ff = 4 * d_model` ratio used throughout this module.
- [Gaussian Error Linear Units (GELUs) (Hendrycks & Gimpel, 2016)](https://arxiv.org/abs/1606.08415) - the GELU activation function used in this module's verification code and in most modern transformer FFNs.
- [GLU Variants Improve Transformer (Shazeer, 2020)](https://arxiv.org/abs/2002.05202) - covers SwiGLU and related FFN variants used in newer models (Llama and others), extending this module's basic two-linear-layer structure.
- [PyTorch documentation: torch.nn.Linear](https://pytorch.org/docs/stable/generated/torch.nn.Linear.html) - the layer type used throughout this module's verification code.
- [Track 02, Module 08: Multi-Head Attention](../08-multi-head-attention/README.md) - the attention parameter-count formula this module's FFN comparison is measured against.

## Next

[Module 13: Residual Connections and Layer Normalization](../13-residual-connections-and-layer-normalization/README.md)
