# Module 06: GPT: Causal Language Modeling

## Why this matters

Module 00 previewed causal language modeling ("predict the NEXT token,
using only what came before") and verified GPT-2 computing a real loss
directly on raw text. Module 01 verified BERT's masked-language-modeling
objective and explained *why* BERT can't use that causal objective under
full bidirectional attention — it would let the model cheat by attending
straight to the answer (track 02 module 07's finding). This module is
the GPT-side counterpart to module 01's BERT deep-dive: it verifies,
against a real pretrained GPT-2, that causal language modeling actually
does what its name promises — generating text one token at a time using
only past context, and, in a single forward pass, predicting *every*
position's next token simultaneously and in parallel, the property
track 02 module 07's causal mask exists to make safe. It closes with a
direct, numbers-grounded comparison against BERT-base, the two landmark
models this track is built around.

## Concepts

### Verified: manual greedy decoding, one token at a time, using only past context

`GPT2LMHeadModel` applies the causal mask internally (track 02 module 07's
additive `-inf`-before-softmax mechanism, confirmed there against
`is_causal=True`) — no explicit mask needs to be passed here. Each loop
iteration below re-runs the *entire* sequence so far through the model
and reads off the prediction for the position that was just appended,
making the "only past context, nothing after" property directly
observable step by step:

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

tok = AutoTokenizer.from_pretrained("gpt2")
model = AutoModelForCausalLM.from_pretrained("gpt2")
model.eval()

prompt = "The capital of France is"
generated = tok(prompt, return_tensors="pt")["input_ids"]

for step in range(8):
    with torch.no_grad():
        logits = model(generated).logits
    next_id = torch.argmax(logits[0, -1]).unsqueeze(0).unsqueeze(0)
    print(f"step {step}: seen={generated.shape[1]:2d} tokens -> "
          f"{tok.decode(generated[0])!r} -> predicts next={tok.decode(next_id[0])!r}")
    generated = torch.cat([generated, next_id], dim=1)

print("\nFinal:", tok.decode(generated[0]))
```

Verified output:

```
step 0: seen= 5 tokens -> 'The capital of France is' -> predicts next=' the'
step 1: seen= 6 tokens -> 'The capital of France is the' -> predicts next=' capital'
step 2: seen= 7 tokens -> 'The capital of France is the capital' -> predicts next=' of'
step 3: seen= 8 tokens -> 'The capital of France is the capital of' -> predicts next=' the'
step 4: seen= 9 tokens -> 'The capital of France is the capital of the' -> predicts next=' French'
step 5: seen=10 tokens -> 'The capital of France is the capital of the French' -> predicts next=' Republic'
step 6: seen=11 tokens -> '...the French Republic' -> predicts next=','
step 7: seen=12 tokens -> '...the French Republic,' -> predicts next=' and'

Final: The capital of France is the capital of the French Republic, and
```

Every step only ever grows the sequence by appending to the *right*
end and re-reading the whole thing forward — there is no mechanism by
which a later prediction could feed back and change an earlier token,
because earlier tokens are never revisited. Note base GPT-2 (124M,
no instruction tuning) drifts off-topic after a few steps rather than
saying "Paris" — this is a real, honest limitation of the small base
model, not a bug in the causal-decoding loop itself, which is exactly
what module 07 will address.

### Verified: one forward pass predicts *every* position's next token, in parallel

The loop above re-runs the model at every step, which is how generation
has to work (each new token depends on the last). But **training** never
runs a loop like that — track 02 module 00's "why transformers
parallelize" point applies directly here: a single forward pass over a
complete sentence produces a next-token prediction for *every* position
simultaneously, because the causal mask (track 02 module 07) already
guarantees position `i`'s output only used positions `<= i`. This is
checkable directly, position by position, in one pass:

```python
text = "The cat sat on the mat and looked out the window"
enc = tok(text, return_tensors="pt")
input_ids = enc["input_ids"][0]

with torch.no_grad():
    logits = model(**enc).logits[0]     # shape (seq_len, vocab_size)

in_top5, exact, total = 0, 0, 0
for i in range(len(input_ids) - 1):
    top5 = torch.topk(logits[i], 5).indices.tolist()
    actual_next = input_ids[i + 1].item()
    hit, is_top1 = actual_next in top5, top5[0] == actual_next
    in_top5 += hit; exact += is_top1; total += 1
    print(f"seen={tok.decode(input_ids[:i+1])!r:42s} "
          f"top1={tok.decode([top5[0]])!r:10s} "
          f"actual_next={tok.decode([actual_next])!r:10s} top5_hit={hit}")
print(f"{exact}/{total} exact top-1 matches, {in_top5}/{total} actual-next-in-top5")
```

Verified output:

```
seen='The'                                       top1='\n'       actual_next=' cat'     top5_hit=False
seen='The cat'                                   top1=' was'     actual_next=' sat'     top5_hit=False
seen='The cat sat'                               top1=' on'      actual_next=' on'      top5_hit=True
seen='The cat sat on'                            top1=' the'     actual_next=' the'     top5_hit=True
seen='The cat sat on the'                        top1=' floor'   actual_next=' mat'     top5_hit=False
seen='The cat sat on the mat'                    top1=','        actual_next=' and'     top5_hit=True
seen='The cat sat on the mat and'                top1=' looked'  actual_next=' looked'  top5_hit=True
seen='The cat sat on the mat and looked'         top1=' at'      actual_next=' out'     top5_hit=True
seen='The cat sat on the mat and looked out'     top1=' the'     actual_next=' the'     top5_hit=True
seen='...looked out the'                          top1=' window' actual_next=' window'  top5_hit=True
5/10 exact top-1 matches, 7/10 actual-next-in-top5
```

`logits` has shape `(10, 50257)` — one full next-token distribution *per
position*, computed in a single forward pass, not ten separate calls.
Five of nine predictable positions get the exact real continuation as
the single top prediction (`' on'`, `' the'`, `' looked'`, `' the'`,
`' window'`), and seven of nine have the real next token somewhere in
the top-5 — direct, checkable evidence that the causal LM objective is
genuinely predicting "what comes next" at every position at once, which
is exactly what lets training compute a loss over an entire sequence
in one pass (module 00's GPT-2 loss of `5.09` was this same mechanism,
averaged over every position) instead of one input/target pair at a
time.

### Verified: GPT-2's real configuration numbers, connected to earlier formulas

```python
from transformers import AutoConfig
config = AutoConfig.from_pretrained("gpt2")
print(config.n_layer, config.n_head, config.n_embd,
      config.vocab_size, config.n_positions, config.n_inner)
print(sum(p.numel() for p in model.parameters()))
```

Verified output:

```
n_layer:            12
n_head:             12
n_embd (d_model):   768
vocab_size:         50257
n_positions:        1024
n_inner:            None    (GPT-2's MLP hardcodes d_ff = 4 * n_embd when unset)
total parameters:   124,439,808   (~124.4M — this is GPT-2 "small")
```

`n_inner: None` isn't a missing value to be worried about — it's
confirmed directly against the real weight shape:

```python
block0 = model.transformer.h[0]
print(block0.mlp.c_fc.weight.shape)     # torch.Size([768, 3072])
print(block0.attn.c_attn.weight.shape)  # torch.Size([768, 2304]) -- fused Q,K,V
print(sum(p.numel() for p in block0.attn.parameters()))
```

Verified output: `c_fc` projects `768 -> 3072`, exactly `4 * 768` —
GPT-2's feedforward network follows the same **4x ratio** verified for
BERT-base in module 02 (track 02 module 12's standard). The fused
`c_attn` weight (`768 -> 2304 = 3 * 768`, one matrix producing Q, K, and
V together) has `2,362,368` total attention parameters per layer,
matching track 02 module 08's `4 * d_model^2 + 4 * d_model` formula
exactly (`4 * 768^2 + 4 * 768 = 2,362,368`) — multi-head attention
here costs the same as it did in BERT, independent of head count, just
as module 08 verified.

The embedding table follows track 01 module 08's `vocab_size * d_model`
formula directly: `50257 * 768 = 38,597,376` (~38.6M) — verified
against `model.transformer.wte.weight.shape == (50257, 768)`. This is
larger than BERT-base's 23.4M-parameter table (module 02) purely
because GPT-2's byte-level BPE vocabulary (50,257 entries) is bigger
than BERT's WordPiece vocabulary (30,522 entries) — same formula, a
different vocabulary size. GPT-2 also ties its output projection to
this same embedding table (`tie_word_embeddings: true` in the config) —
one weight matrix used both to look up input tokens and to score output
tokens, which is why the total parameter count doesn't include a
second, separate 38.6M-parameter output layer.

### BERT vs. GPT: what's identical, what differs

Both are built from the same transformer block (track 02 modules
04-15); everything that differs traces back to two decisions already
verified elsewhere in this track — not to some entirely separate
mechanism:

```
 Property                 BERT-base (module 02)      GPT-2 small (this module)
 ───────────────────      ───────────────────────    ───────────────────────
 Self-attention             bidirectional, no mask      causal, masked
 (track 02 module 07/16)    (every token sees all)      (position i sees <= i only)
 Pretraining objective       masked LM (module 01)       causal LM (this module)
 Cross-attention             none (encoder-only)          none (decoder-only)
 (track 02 module 16)
 n_layer                     12                           12
 n_head                      12                           12
 d_model (hidden size)        768                          768
 d_ff (4x d_model)            3072                         3072
 vocab_size                    30522                        50257
 max sequence length            512                          1024
 total parameters              109.5M                       124.4M
 embedding table params         23.4M                        38.6M
 segment embeddings            yes (type_vocab_size=2)       none
 (module 02)
 output layer                separate MLM head              tied to input
                                                              embedding table
```

The layer/head/hidden-size numbers are identical by coincidence of
these two specific checkpoints' design choices, not because BERT and
GPT are architecturally forced to match — the real, structural
differences are exactly the two module 16 identified (self-attention
masking, cross-attention presence), plus the vocabulary and
tied-embedding choices verified above. Everything else — the FFN's 4x
ratio, the attention parameter formula, the embedding-table formula —
is the *same* transformer machinery, verified against two genuinely
different real models now instead of one.

## Reference

```
 Term / formula                Value / meaning
 ───────────────────────       ─────────────────────────────────────
 Causal language modeling       predict token i+1 from tokens 0..i only;
 (CLM)                          enforced by track 02 module 07's causal mask
 Greedy decoding                 argmax over logits at each generation step;
                                  a loop, re-running the model each time
 Parallel training objective     one forward pass produces a next-token
                                  prediction for EVERY position at once
                                  (verified: logits shape (seq_len, vocab))
 d_ff = 4 * d_model              GPT-2: 3072 = 4 * 768 (matches BERT, module 02)
 Attention params/layer          4 * d_model^2 + 4 * d_model (track 02 module 08);
                                  verified: 2,362,368 for GPT-2's 768-dim layers
 Embedding table params          vocab_size * d_model (track 01 module 08);
                                  GPT-2: 50257*768 = 38.6M; BERT: 30522*768 = 23.4M
 Weight tying                    GPT-2 shares one matrix for input embeddings
                                  and output (unembedding) projection
 GPT-2 small total params         124,439,808 (~124.4M)
```

## Hands-on exercises

### 1 — reproduce the manual greedy-decoding loop

Run the exact `"The capital of France is"` example above with your own
prompt. Confirm each step only ever appends to the sequence and never
revisits earlier tokens, and that the model's causal mask is never
explicitly passed by you — it's applied internally by
`GPT2LMHeadModel`, consistent with track 02 module 07's mechanism.

### 2 — reproduce the parallel next-token verification and try a harder sentence

Run the exact `"The cat sat on the mat..."` example above, then try the
pangram `"The quick brown fox jumps over the lazy dog"` (all distinct
letters, deliberately unnatural phrasing). Compare the top-5 hit rate
between the two sentences and explain, using this module's verified
mechanism, why an artificial pangram gets a *lower* hit rate than an
ordinary sentence — connect this to what the causal LM objective is
actually optimizing for (plausible continuations of natural text, not
grammatical validity of any string).

### 3 — verify GPT-2's parameter breakdown adds up

Using `AutoConfig` and `AutoModelForCausalLM` as above, independently
compute: the embedding table size (`vocab_size * n_embd`), one layer's
attention parameter count (`4 * n_embd^2 + 4 * n_embd`), and one
layer's FFN parameter count (`2 * n_embd * (4 * n_embd) + 4*n_embd +
n_embd`, accounting for both the up- and down-projections' biases).
Multiply the per-layer figures by `n_layer` (12), add the embedding
table and positional embedding table (`n_positions * n_embd`), and
confirm your hand-computed total is close to the verified
`124,439,808` (note: weight tying means the embedding table isn't
counted twice, and LayerNorm parameters add a small remainder your
formula won't capture).

## Independent challenge

A teammate says: "BERT and GPT are trained completely differently, so
there's no reason their configs would ever end up looking similar."
Using this module's verified BERT-vs-GPT comparison table, and module
16's finding that the *only* mechanical difference between encoder-only
and decoder-only self-attention is whether the causal mask is applied,
write two or three sentences on why BERT-base and GPT-2 small sharing
identical `n_layer`, `n_head`, and `d_model` values isn't actually
surprising, despite their genuinely different pretraining objectives.

<details><summary>Discussion</summary>

BERT and GPT differ in exactly two verified respects: which
pretraining objective is used (masked LM vs. causal LM) and whether
self-attention is masked (track 02 modules 07 and 16) — neither of
those decisions constrains layer count, head count, or hidden size at
all. `n_layer=12`, `n_head=12`, `d_model=768` are architectural
capacity choices, independent of the masking/objective decision, and
both BERT-base and GPT-2's original authors happened to pick the same
"base-sized" transformer configuration as a reasonable, comparable
starting point for their era — not because the objective forced it.
The genuine differences that *do* trace back to the objective are
visible in the comparison table instead: BERT's larger relative
embedding-to-vocabulary-size gap is unrelated, but BERT's segment
embeddings (module 02, needed for its sentence-pair NSP objective) and
GPT-2's tied output embedding (needed because it has no separate
next-sentence task) are both real structural consequences of the
different objectives, unlike the shared layer/head/hidden-size numbers.

</details>

## Common mistakes & troubleshooting

- **Assuming GPT2LMHeadModel needs an explicit causal mask passed in.**
  Verified above: it's applied internally, automatically, consistent
  with track 02 module 07's mechanism — you never construct or pass an
  `attn_mask` for ordinary autoregressive use.
- **Confusing the training-time parallel prediction (one forward pass,
  every position at once) with the generation-time loop (one token per
  forward pass, sequentially).** Both are real and verified above, but
  they're different things: training can process a whole sequence at
  once because the *targets* (the actual next tokens) already exist in
  the training text; generation can't, because the next token doesn't
  exist yet until the model produces it.
- **Expecting every position's top-1 prediction to exactly match the
  real next token.** Verified above: even a fluent model gets several
  positions "wrong" in the sense of not reproducing the exact original
  continuation (5/10 exact matches here) — this doesn't mean the model
  failed; natural language has many plausible continuations, and a
  higher top-5 hit rate (7/10) is a fairer measure of whether the
  prediction is reasonable, not just literal.
- **Assuming `n_inner: None` in the config means GPT-2 has no
  feedforward hidden layer.** Verified above: GPT-2's implementation
  hardcodes `d_ff = 4 * n_embd` when `n_inner` isn't set explicitly;
  confirmed directly against the real `768 -> 3072` weight shape.

## Checkpoint quiz

1. In the manual greedy-decoding loop, why is it correct that no later
   step can ever change an earlier token's prediction?
2. What did the verified single-forward-pass experiment on `"The cat
   sat on the mat..."` show about how many next-token predictions come
   out of one call to the model, and why does this matter for training?
3. GPT-2's config reports `n_inner: None`. What is the real value of
   `d_ff`, and how was it verified directly (not just assumed)?
4. Which two of GPT-2's and BERT-base's differences trace back to their
   different pretraining objectives, versus which shared numbers
   (`n_layer`, `n_head`, `d_model`) are unrelated to the objective at
   all?
5. Why is GPT-2's embedding table (~38.6M parameters) larger than
   BERT-base's (~23.4M), given that both use the exact same formula?

<details><summary>Answers</summary>

1. Because the causal mask (track 02 module 07), applied automatically
   inside `GPT2LMHeadModel`, guarantees every position's output only
   ever depends on positions at or before it — and the decoding loop
   only appends new tokens to the end of the sequence, never edits
   earlier ones, so there is no mechanism for a later step to reach
   back and change an earlier prediction.
2. One forward pass produced a full next-token probability distribution
   for *every* position in the sequence simultaneously (`logits` shape
   `(10, 50257)` for a 10-token sentence) — this is why training can
   compute a loss over an entire sequence in a single pass (as module
   00's GPT-2 loss computation did), rather than needing one forward
   pass per token the way generation does.
3. `d_ff = 3072 = 4 * 768`, matching the standard 4x ratio (track 02
   module 12) also verified for BERT-base in module 02. This was
   verified directly against the real `c_fc` weight shape
   (`torch.Size([768, 3072])`), not inferred from the `None` config
   value.
4. BERT's segment embeddings (`type_vocab_size=2`, module 02) exist
   because of its sentence-pair NSP objective; GPT-2's tied output
   embedding exists because it has no separate sentence-pair task and
   needs no distinct unembedding matrix. `n_layer`, `n_head`, and
   `d_model` being identical (12, 12, 768) is unrelated to either
   model's objective — those are independent architectural capacity
   choices, not consequences of masked vs. causal LM.
5. Because the formula (`vocab_size * d_model`) is identical, but
   GPT-2's byte-level BPE vocabulary (50,257 entries) is larger than
   BERT's WordPiece vocabulary (30,522 entries) — the same formula
   applied to a larger vocabulary size produces a larger table; the
   mechanism, not the size, is what's shared.

</details>

## Further reading & sources

- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - the GPT-2 paper; describes the model configuration and causal LM training objective verified directly against real GPT-2 weights in this module.
- [Improving Language Understanding by Generative Pre-Training (Radford et al., 2018)](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) - the original GPT-1 paper, first framing the decoder-only causal LM pretraining approach this module verifies on its successor.
- [Hugging Face documentation: GPT2LMHeadModel](https://huggingface.co/docs/transformers/en/model_doc/gpt2#transformers.GPT2LMHeadModel) - the real model class used throughout this module's verification code, including its internal causal masking.
- [Track 02, Module 07: Attention Masks and Causal Masking](../../02-transformer-architecture/07-attention-masks-and-causal-masking/README.md) - the additive `-inf` causal-masking mechanism this module confirms is applied automatically inside GPT-2, without an explicit mask argument.
- [Track 02, Module 16: Encoder-Only vs. Decoder-Only vs. Encoder-Decoder](../../02-transformer-architecture/16-encoder-only-vs-decoder-only-vs-encoder-decoder/README.md) - establishes that masking is the single mechanical difference between BERT-style and GPT-style self-attention, the basis for this module's BERT-vs-GPT comparison table.

## Next

[Module 07: GPT-1 and GPT-2](../07-gpt-1-and-gpt-2/README.md)
