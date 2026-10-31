# Module 06: The Transformer Moment (2017)

## Why this matters

In 2017 a Google team published a paper whose title is an argument:
**"Attention Is All You Need."** The "all" is the claim. Attention had
been an *add-on* to recurrent networks for three years (module 05); the
paper's proposal was to delete the recurrence and keep only the
attention.

This sounds like a minor simplification. It was the most consequential
architectural decision in modern AI, and the reason is not accuracy —
early transformers were only modestly better at translation than the
LSTMs they replaced. **The reason is that it made training embarrassingly
parallel.** Module 04's wall 2 (`hₜ` depends on `hₜ₋₁`, so nothing can be
computed out of order) simply evaporates: every position is processed
simultaneously, which turns training into a stack of large matrix
multiplications — precisely the operation GPUs are built to do thousands
of at once.

That unlocked training runs on data volumes that were previously
impossible, which is what made GPT-2, GPT-3, and everything after them
feasible. Every model in tracks 03-16 is a transformer. This module is
the architectural overview; track 02 builds it component by component.

## Concepts

### What was dropped, and what replaced it

```
BEFORE (2014-2017): RNN + attention          AFTER (2017): transformer

  x₁   x₂   x₃   x₄                           x₁   x₂   x₃   x₄
   │    │    │    │                            │    │    │    │
   ▼    ▼    ▼    ▼                            ▼    ▼    ▼    ▼
 ┌───┐┌───┐┌───┐┌───┐                        ┌──────────────────┐
 │RNN│►│RNN│►│RNN│►│RNN│  ◄─ serial          │  SELF-ATTENTION  │
 └───┘└───┘└───┘└───┘        chain           │  all positions   │
   │    │    │    │                          │  see each other  │
   └────┴────┴────┘                          │  AT ONCE         │
      attention                              └──────────────────┘
      bolted on                                │    │    │    │
                                               ▼    ▼    ▼    ▼
 t=4 waits for t=3                           every position computed
 GPU mostly idle                             in parallel -> GPU saturated
```

The transformer keeps attention and throws away the recurrent chain. With
no chain, there is no ordering constraint, so a sequence of length 1,000
is one big matrix operation rather than 1,000 dependent steps.

### Self-attention: the key generalization

Module 05's attention was **cross-attention** — a decoder querying an
encoder. The transformer's central move is to apply attention *within* a
single sequence: every position attends to every other position of the
same sequence. That's **self-attention**.

```
 "The animal didn't cross the street because it was too tired"
                                            ▲
                                            │ what does "it" refer to?
   ┌────────────────────────────────────────┘
   │  self-attention lets "it" query every other word
   │  and discover that "animal" is the answer
   ▼
 The  animal  didn't  cross  the  street  because  it  was  too  tired
  .02   .51     .03    .04   .02   .21      .03   ─    .05  .04   .05
        ▲▲▲                   ▲▲▲
     strong link          weaker competitor
```

The same mechanism, applied within one sequence, is what builds
**contextual** representations — the fix for module 03's static-embedding
limitation. "bank" in *"river bank"* now gets a different vector than
"bank" in *"bank account"*, because in each case it attended to different
neighbours. This is the single biggest capability jump from Word2Vec.

### The architecture at a glance

```
        ENCODER STACK (Nx)              DECODER STACK (Nx)
   ┌─────────────────────────┐     ┌──────────────────────────┐
   │                         │     │                          │
   │  ┌───────────────────┐  │     │  ┌────────────────────┐  │
   │  │  self-attention   │  │     │  │ MASKED self-attn   │  │
   │  └─────────┬─────────┘  │     │  └─────────┬──────────┘  │
   │      add & norm         │     │       add & norm         │
   │  ┌─────────▼─────────┐  │     │  ┌─────────▼──────────┐  │
   │  │   feed-forward    │  │  ┌─►│  │  cross-attention   │  │
   │  └─────────┬─────────┘  │  │  │  └─────────┬──────────┘  │
   │      add & norm         │  │  │       add & norm         │
   └────────────┬────────────┘  │  │  ┌─────────▼──────────┐  │
                │               │  │  │   feed-forward     │  │
                └───────────────┘  │  └─────────┬──────────┘  │
              encoder output       │       add & norm         │
              feeds every          └────────────┬─────────────┘
              decoder layer                     ▼
                                          output probabilities
   ▲                                            
   │  + POSITIONAL ENCODING added to inputs at the bottom of BOTH
   │    stacks -- without it the model is order-blind (module 05 ex. 6)
```

Four components, each covered properly in track 02:

- **Self-attention** — positions exchange information.
- **Feed-forward network** — a small MLP applied to each position
  independently; where much of the model's factual knowledge is thought
  to live.
- **Add & norm** — residual connections plus layer normalization, which
  are what make it possible to stack dozens of these blocks without
  training collapsing.
- **Positional encoding** — order information, injected at the input,
  because attention alone is order-blind.

"Nx" matters: the block is *repeated*. GPT-3 stacks 96 of them. Depth is
where capability comes from.

### Masked self-attention: why generation needs a blindfold

The decoder has one critical modification. When training a model to
predict the next token, every position must only see positions *before*
it — otherwise predicting token 5 is trivial, because the model can just
look at token 5.

```
   CAUSAL MASK — position i may only attend to positions <= i

           The  cat  sat  on  the  mat
      The [ ✓ ] ✗    ✗    ✗   ✗    ✗
      cat [ ✓ ][ ✓ ] ✗    ✗   ✗    ✗
      sat [ ✓ ][ ✓ ][ ✓ ] ✗   ✗    ✗       ✓ = allowed
       on [ ✓ ][ ✓ ][ ✓ ][✓ ] ✗    ✗       ✗ = masked to -inf
      the [ ✓ ][ ✓ ][ ✓ ][✓ ][ ✓ ] ✗           (softmax -> 0)
      mat [ ✓ ][ ✓ ][ ✓ ][✓ ][ ✓ ][ ✓ ]

   without this, the model "cheats" by reading the answer
```

This single mask is the difference between BERT (no mask, sees both
directions, great at *understanding*) and GPT (masked, left-to-right,
can *generate*). Track 03 is built on this distinction.

### Why parallelism was the real breakthrough

```
 TRAINING TIME per sequence of length n

   RNN/LSTM   ████████████████████████████████  O(n) SERIAL steps
                                                cannot be shortened
                                                by adding hardware

   Transformer ████                             O(1) serial steps
                                                (one big parallel op)
                                                more GPUs = faster
```

An RNN's `O(n)` sequential dependency is a *wall-clock* cost you cannot
buy your way out of. The transformer converts it into `O(1)` sequential
steps with more total work per step — and total work is exactly what
extra GPUs solve.

The trade is real, not free: self-attention costs `O(n²)` in compute and
memory (module 05 exercise 5), where an RNN was `O(n)`. The field
accepted a worse asymptotic cost in sequence length in exchange for
parallelism, and then spent the next eight years attacking that `n²`
(FlashAttention, sparse attention, sliding windows — tracks 05 and 14).

### What actually followed

```
 2017  Transformer            65M params    translation only
 2018  BERT                  340M           understanding tasks
 2018  GPT-1                 117M           "maybe generation scales?"
 2019  GPT-2                 1.5B           coherent paragraphs; withheld
 2020  GPT-3                 175B           few-shot learning emerges
 2022  ChatGPT                  --          RLHF + a chat UI
 2023+ GPT-4, Llama, Claude, Gemini, Mistral, ...

   SAME ARCHITECTURE THROUGHOUT. What changed was scale,
   data, and alignment -- not the fundamental design.
```

That last line is worth internalizing. The architecture you'll build in
track 02 is, in its essentials, the one running every model you'll call
in track 06.

## Reference

| Term | Means |
|---|---|
| Transformer | Attention-only architecture; no recurrence |
| Self-attention | Positions of one sequence attend to each other |
| Cross-attention | Decoder queries encoder outputs |
| Causal / masked attention | Position `i` may only see positions `≤ i` |
| Encoder stack | Bidirectional; builds representations (BERT) |
| Decoder stack | Causal; generates tokens (GPT) |
| Feed-forward network | Per-position MLP inside each block |
| Residual connection | `x + sublayer(x)`; makes deep stacks trainable |
| Layer normalization | Stabilizes activations across a layer |
| Positional encoding | Injects order; mandatory since attention is order-blind |
| Nx | The block is repeated N times — depth is where capability lives |

| Task | Code (Hugging Face) |
|---|---|
| Load a pretrained transformer | `AutoModel.from_pretrained("gpt2")` |
| Load its tokenizer | `AutoTokenizer.from_pretrained("gpt2")` |
| Count parameters | `sum(p.numel() for p in model.parameters())` |
| Inspect config | `model.config` |
| Get attention matrices | `model(**inputs, output_attentions=True).attentions` |
| Generate text | `model.generate(**inputs, max_new_tokens=20)` |

## Hands-on exercises

Install once: `pip install torch transformers`

### 1. Look inside a real transformer

```python
from transformers import AutoModel, AutoConfig

model = AutoModel.from_pretrained("gpt2")
cfg = model.config

print(f"layers (Nx):       {cfg.n_layer}")
print(f"attention heads:   {cfg.n_head}")
print(f"hidden size:       {cfg.n_embd}")
print(f"context window:    {cfg.n_positions}")
print(f"vocab size:        {cfg.vocab_size}")
print(f"total parameters:  {sum(p.numel() for p in model.parameters()):,}")

print("\nfirst block's submodules:")
for name, _ in model.h[0].named_children():
    print("  ", name)
```

Map each printed submodule onto the architecture diagram above. Which
diagram component does `attn` correspond to? `mlp`? `ln_1` and `ln_2`?

### 2. Prove positional encoding is doing something

```python
import torch
from transformers import AutoModel, AutoTokenizer

tok = AutoTokenizer.from_pretrained("gpt2")
model = AutoModel.from_pretrained("gpt2")

a = tok("dog bites man", return_tensors="pt")
b = tok("man bites dog", return_tensors="pt")

ha = model(**a).last_hidden_state.mean(dim=1)
hb = model(**b).last_hidden_state.mean(dim=1)

cos = torch.nn.functional.cosine_similarity(ha, hb).item()
print(f"cosine similarity: {cos:.4f}")
```

Module 03 exercise 7 got exactly **1.0000** for these two sentences with
averaged Word2Vec vectors. Record what you get here. Explain the
difference in one sentence, naming the component responsible.

### 3. See contextual embeddings resolve an ambiguous word

```python
import torch
from transformers import AutoModel, AutoTokenizer

tok = AutoTokenizer.from_pretrained("bert-base-uncased")
model = AutoModel.from_pretrained("bert-base-uncased")

def vec_for(sentence, word):
    ids = tok(sentence, return_tensors="pt")
    out = model(**ids).last_hidden_state[0]
    toks = tok.convert_ids_to_tokens(ids["input_ids"][0])
    return out[toks.index(word)]

river = vec_for("i sat on the river bank watching water", "bank")
money = vec_for("i deposited cash at the bank downtown", "bank")
money2 = vec_for("the bank approved my mortgage loan", "bank")

cs = torch.nn.functional.cosine_similarity
print(f"river-bank  vs money-bank : {cs(river, money, dim=0):.3f}")
print(f"money-bank  vs money-bank2: {cs(money, money2, dim=0):.3f}")
```

The same word, three sentences, three different vectors. Confirm the two
financial senses are closer to each other than either is to the river
sense — then state what Word2Vec (module 03) would have produced instead,
and why this matters for semantic search in track 08.

### 4. Visualize a real causal mask

```python
import torch

def causal_mask(n):
    return torch.tril(torch.ones(n, n))

n = 6
words = ["The", "cat", "sat", "on", "the", "mat"]
m = causal_mask(n)

print("      " + " ".join(f"{w[:4]:>4}" for w in words))
for i, w in enumerate(words):
    row = " ".join(f"{'  ok' if m[i][j] else '   x'}" for j in range(n))
    print(f"{w[:5]:>5} {row}")

print("\nvisible positions per row:", m.sum(dim=1).tolist())
```

Answer: what would go wrong during *training* if this mask were removed
but everything else stayed the same? Be specific about what the model
would learn.

<details><summary>Answer</summary>

Without the mask, when predicting the token at position `i` the model can
attend to position `i` itself and everything after it — the answer is
directly visible in its input. It would learn the trivial identity
shortcut ("copy the token I'm being asked to predict") and reach near-zero
training loss while learning nothing about language.

At inference time those future tokens don't exist yet, so the model would
produce garbage. This is a data-leakage bug, and the causal mask is the
structural fix — it is why decoder-only models can be trained on raw text
with no labels at all.
</details>

### 5. Read real attention weights

```python
import torch
from transformers import AutoModel, AutoTokenizer

tok = AutoTokenizer.from_pretrained("gpt2")
model = AutoModel.from_pretrained("gpt2", output_attentions=True)

text = "The animal didn't cross the street because it was too tired"
ids = tok(text, return_tensors="pt")
out = model(**ids)

toks = tok.convert_ids_to_tokens(ids["input_ids"][0])
it_pos = [i for i, t in enumerate(toks) if "it" in t][0]

# layer 5, head 3 -- pick a few and compare
attn = out.attentions[5][0, 3]
weights = attn[it_pos]

print(f'what "{toks[it_pos]}" (position {it_pos}) attends to:')
for i in torch.argsort(weights, descending=True)[:5]:
    print(f"  {weights[i]:.3f}  {toks[i]}")

print(f"\nlayers: {len(out.attentions)}, heads per layer: {out.attentions[0].shape[1]}")
print(f"total attention matrices: {len(out.attentions) * out.attentions[0].shape[1]}")
```

Try several layer/head combinations. Most will look like noise — that's
the honest finding from module 05's caveat, and you should see it
yourself rather than take my word for it. Report how many of the ~144
matrices you'd call interpretable.

### 6. Measure the parallelism claim

```python
import torch, torch.nn as nn, time

d, batch = 128, 16
lstm = nn.LSTM(d, d, batch_first=True)
attn = nn.MultiheadAttention(d, num_heads=8, batch_first=True)

print(f"{'len':>6} {'LSTM ms':>10} {'attention ms':>14} {'speedup':>9}")
for n in [32, 128, 512, 1024]:
    x = torch.randn(batch, n, d)

    t0 = time.perf_counter(); lstm(x); t_l = time.perf_counter() - t0
    t0 = time.perf_counter(); attn(x, x, x); t_a = time.perf_counter() - t0

    print(f"{n:>6} {t_l*1000:>10.1f} {t_a*1000:>14.1f} {t_l/t_a:>8.1f}x")
```

On CPU the advantage is modest; on a GPU it is dramatic, because that's
where thousands of cores can actually be saturated. Note where the
attention column starts growing faster (the `O(n²)` term catching up) and
explain the tradeoff the field accepted in one sentence.

## Independent challenge

Write a **side-by-side architecture report** comparing three real models
you load from Hugging Face: `gpt2` (decoder-only), `bert-base-uncased`
(encoder-only), and `t5-small` (encoder-decoder).

For each, extract programmatically: layer count, head count, hidden size,
vocabulary size, context window, total parameters, and whether attention
is masked. Present it as one table.

Then write two paragraphs: what each architecture's masking choice makes
it good at, and — given only these numbers — which you would choose for
(a) classifying support tickets, (b) writing product descriptions, (c)
translating documentation. Justify each from the architecture, not from
brand familiarity.

## Common mistakes & troubleshooting

- **Thinking the transformer was better because it was more accurate.**
  It was competitive on accuracy and *transformative* on parallelism.
  Conflating the two makes the history incoherent.
- **Forgetting positional encoding is mandatory.** Without it a
  transformer is a set-processor, not a sequence-processor (module 05
  exercise 6).
- **Assuming attention is cheaper than recurrence.** It's `O(n²)` versus
  `O(n)` — asymptotically *worse* in sequence length. The win is that the
  work is parallel.
- **Reading attention heads as if each has a clean meaning.** A handful
  are interpretable; most aren't (exercise 5).
- **Confusing "encoder/decoder" with "input/output."** They're
  architectural roles defined by masking. GPT is decoder-only and still
  reads your prompt; BERT is encoder-only and still produces outputs.
- **Using `bert-base` for text generation.** Its bidirectional attention
  has no left-to-right generation story — this is a common beginner
  mistake and track 03 module 11 explains exactly why it fails.

## Checkpoint quiz

1. What did the transformer remove, and what was the primary benefit?
2. Why was parallelism more important than an accuracy improvement?
3. What is the difference between self-attention and cross-attention?
4. What does the causal mask do, and what breaks without it during
   training?
5. Which architectural choice separates BERT from GPT?
6. What is the asymptotic cost the field accepted in exchange for
   parallelism?
7. What does "Nx" mean in the architecture diagram, and why does it
   matter?

<details><summary>Answers</summary>

1. It removed recurrence, keeping only attention. The benefit was that
   all positions can be computed simultaneously, making training
   parallelizable across GPU cores.
2. Because an RNN's serial dependency is a wall-clock cost that adding
   hardware cannot reduce. Parallelism made training on internet-scale
   data feasible, and scale is what produced the capability jumps of
   GPT-2/3 — a modest accuracy edge would have changed nothing.
3. Self-attention: a sequence attends to itself. Cross-attention: one
   sequence (decoder) queries another (encoder output).
4. It prevents position `i` from attending to positions after `i`.
   Without it the model sees the token it's meant to predict, learns a
   trivial copy shortcut, gets near-zero training loss, and produces
   garbage at inference when future tokens don't exist.
5. Masking. BERT is unmasked/bidirectional (encoder-only, for
   understanding); GPT is causally masked (decoder-only, for generation).
6. `O(n²)` compute and memory in sequence length, versus `O(n)` for an
   RNN — asymptotically worse, but parallel.
7. The block is repeated N times. Depth is where model capability comes
   from — GPT-3 stacks 96 of them versus the original paper's 6.
</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - the paper itself. It is unusually readable; Figure 1 is the diagram this module redraws, and section 4 states the parallelism argument directly.
- [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/) - the single most-recommended explainer of this architecture, and deservedly so. Read it before track 02.
- [The Annotated Transformer (Harvard NLP)](https://nlp.seas.harvard.edu/annotated-transformer/) - the entire paper reimplemented in PyTorch, line by line alongside the text. This is what track 02 builds toward.
- [Transformer Explainer (Georgia Tech)](https://poloclub.github.io/transformer-explainer/) - a live GPT-2 in the browser with every intermediate tensor visualized; hover over the attention matrices from exercise 5 instead of printing them.
- [Let's build GPT: from scratch, in code, spelled out (Karpathy, 2hr)](https://www.youtube.com/watch?v=kCc8FmEb1nY) - builds a working transformer from an empty file. If you do only one thing outside this curriculum, do this.
- [BertViz](https://github.com/jessevig/bertviz) - interactive attention-head visualization for real models; makes exercise 5's "most heads are noise" finding immediately visual.
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index) - the library used in every exercise here and in track 06.
- [Formal Algorithms for Transformers (Phuong & Hutter, 2022)](https://arxiv.org/abs/2207.09238) - precise pseudocode for every transformer variant, if you prefer specifications to prose.

## Next

[Module 07: The Scaling Era — GPT-1 to ChatGPT](../07-the-scaling-era-gpt-1-to-chatgpt/README.md)
