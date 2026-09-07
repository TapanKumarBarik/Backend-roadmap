# Module 10: Why Decoder-Only Won

## Why this matters

This track has now run real code against all three transformer
architecture families: encoder-only (BERT, modules 01-04), a
bi-encoder variant of encoder-only (module 05), and decoder-only (GPT-1
through GPT-4, modules 06-09). One family was conspicuously absent from
having its own dedicated model: encoder-decoder (T5, BART, the original
"Attention Is All You Need" architecture). That's not an oversight —
it's the fact this module explains. Look at what's actually being
released and adopted since 2020: GPT-3, GPT-4, Llama, Mistral, PaLM,
Claude, Gemini — every one of them decoder-only. Encoder-decoder models
still exist and still do real work, but they lost the race to become
*the* general-purpose architecture. This module verifies, with real
code rather than received wisdom, the two concrete mechanical reasons
why: a decoder-only model can be prompted into any task without a
task-specific head (something an encoder-only model provably cannot
do, demonstrated below by trying to make BERT generate text), and its
autoregressive generation is what KV-caching was built for, with the
caching advantage growing — not staying fixed — as sequences get
longer.

## Concepts

### The three families, one more time — but now asking "which one generalizes?"

```
 ENCODER-ONLY (BERT)          DECODER-ONLY (GPT)         ENCODER-DECODER (T5)
 ───────────────────          ──────────────────         ─────────────────────
 bidirectional attention      causal (left-to-right)     encoder: bidirectional
 trained: masked-token        attention                  decoder: causal +
   fill-in                    trained: predict the         cross-attention into
 great at: understanding        next token                 encoder output
   a fixed input (embed,      great at: generating        trained: map one text
   classify)                    open-ended text             sequence to another
 CANNOT generate text         ONE stack handles both      needs TWO stacks
   left-to-right at all         understanding and           (encoder + decoder)
   (verified below)             generation, via prompting  great at: well-defined
                                                              seq2seq tasks
                                                              (translation,
                                                              summarization)
```

Modules 01-05 (encoder-only) and 06-09 (decoder-only) each verified
their own family in depth. Encoder-decoder's own defining trait —
*two* stacks, connected by cross-attention (Module 07 of Track 02
verified cross-attention's query-length-tracking signature) — is what
this module contrasts both single-stack families against.

### Verified: BERT cannot generate coherent open-ended text — it was never trained to

GPT's causal training objective — predict token *N+1* from tokens
*1..N* — **is** the generation procedure. Sampling from a decoder-only
model IS how it was trained, just run repeatedly. BERT's masked
language modeling objective is different in kind: it fills in blanks
scattered through an already-complete sequence, using context from
*both directions*. There is no well-defined "next token" for BERT to
predict, because during training every position could see everything
around it.

What happens if you *force* BERT into a GPT-like generation loop
anyway — repeatedly appending a `[MASK]` token at the end and taking
its top prediction, the closest possible imitation of autoregressive
generation using only BERT's own objective?

```python
import torch
from transformers import BertTokenizer, BertForMaskedLM

tok = BertTokenizer.from_pretrained('bert-base-uncased')
model = BertForMaskedLM.from_pretrained('bert-base-uncased')
model.eval()

prompt = 'the history of artificial intelligence began'
ids = tok(prompt, return_tensors='pt').input_ids
generated = ids[:, :-1]  # drop [SEP]

for step in range(8):
    inp = torch.cat([generated, torch.tensor([[tok.mask_token_id]])], dim=1)
    with torch.no_grad():
        logits = model(inp).logits
    next_id = logits[0, -1].argmax().item()
    generated = torch.cat([generated, torch.tensor([[next_id]])], dim=1)

print(tok.decode(generated[0]))
```

Verified output:

```
[CLS] the history of artificial intelligence began and is now and now and now and
```

Real, run output — not a hypothetical. Within a handful of steps this
degenerates into a repetition loop ("and now and now and now"). This
isn't a bug in the code; it's the honest consequence of forcing a
bidirectional, fill-in-the-blank model into a role its training
objective never prepared it for. Contrast this with module 06/07's GPT-2
generation, which produces grammatical (if sometimes repetitive at
greedy decoding) continuations by design — because next-token
prediction *is* what it was trained to do. This is the first concrete
answer to "why decoder-only": **one architecture that natively handles
both understanding and generation beats two architectures that each
handle only one**, because the single architecture can be prompted
into any task — classification, summarization, translation, dialogue —
using the one thing it does natively: continue text. Module 08 already
demonstrated this directly (GPT-3 doing classification via a text
prompt, zero gradient updates). BERT cannot be prompted this way at
all; it needs a task-specific fine-tuned head (module 03) for every
new task.

### Verified: KV-caching is a decoder-only-shaped optimization, and its payoff grows with length

Autoregressive generation has a specific, exploitable structure:
generating token *N+1* needs attention over tokens *1..N*, and those
tokens' key/value projections never change once computed — only the
new token contributes something new. **Caching** those key/value
vectors instead of recomputing the whole sequence's attention at every
single step is what `use_cache=True` does in Hugging Face's
`generate()`. Measuring the real difference on GPT-2, generating
different lengths of new text:

```python
import time, torch
from transformers import GPT2LMHeadModel, GPT2Tokenizer

tok = GPT2Tokenizer.from_pretrained('gpt2')
model = GPT2LMHeadModel.from_pretrained('gpt2')
model.eval()

prompt = 'The history of artificial intelligence began'
ids = tok(prompt, return_tensors='pt').input_ids

def gen(use_cache, n_new):
    with torch.no_grad():
        return model.generate(ids, max_new_tokens=n_new, use_cache=use_cache,
                               do_sample=False, pad_token_id=tok.eos_token_id)

for n_new in (30, 90, 150):
    times = []
    for use_cache in (True, False):
        gen(use_cache, 5)  # warmup
        t0 = time.time()
        gen(use_cache, n_new)
        times.append(time.time() - t0)
    print(f'new_tokens={n_new:4d}  cached={times[0]:.3f}s  uncached={times[1]:.3f}s  ratio={times[1]/times[0]:.2f}x')
```

Verified output (CPU, gpt2-small):

```
new_tokens=  30  cached=0.668s  uncached=0.868s  ratio=1.30x
new_tokens=  90  cached=2.040s  uncached=3.714s  ratio=1.82x
new_tokens= 150  cached=3.733s  uncached=8.135s  ratio=2.18x
```

The speedup **isn't a fixed constant** — it grows from 1.30x to 2.18x
as generation gets longer, because without caching, generating token
*N* re-runs full self-attention over all *N-1* previous tokens from
scratch every single step (quadratic total work across a generation),
while caching makes each new step's work independent of how much has
already been generated (linear total work). This optimization is
inherently shaped around decoder-only autoregressive generation — it
exploits exactly the "one new token per step, past tokens never
change" structure that causal generation has and encoder-decoder's
*encoder* half does not (the encoder runs once over the whole input,
non-incrementally; only an encoder-decoder model's *decoder* half
benefits the same way, per Hugging Face's own
`EncoderDecoderCache` design, cited below). A decoder-only model gets
this benefit for its *entire* forward pass; an encoder-decoder model
gets it for only half.

### Encoder-decoder didn't disappear — it lost a specific race

None of this means T5/BART-style models are bad or unused. Where the
task genuinely is "map one complete input sequence to one complete
output sequence" — machine translation, summarization — encoder-decoder
remains a legitimate, competitive design, and T5's own paper (cited
below) reports strong results across a wide range of such tasks using
exactly this architecture. What encoder-decoder lost is the race to
become **the one general-purpose architecture an entire industry
standardizes on**, for reasons this module just verified: a decoder-only
model handles both understanding and generation through prompting
alone (no per-task head, no second stack), scales its inference
optimizations across its whole forward pass rather than half of it, and
— as Module 08 covered and the cited scaling-laws paper formalizes —
autoregressive decoder-only models are the architecture family whose
scaling behavior with data and compute has been most extensively
studied and exploited at the frontier-lab scale that produced GPT-3
and its successors.

## Reference

```
 Property                        Encoder-only     Decoder-only     Encoder-decoder
 ──────────────────────────────  ───────────────  ───────────────  ─────────────────
 Can generate open-ended text     No (verified      Yes              Yes (via its
                                   above: degen-                       decoder half)
                                   erates into
                                   repetition)
 Needs a task-specific head       Yes (module 03)   No (prompting,   Yes, for most
   for a new task                                    module 08)       non-seq2seq
                                                                       uses
 Benefits from KV-caching         N/A (no auto-     Across its       Only its decoder
                                   regressive         entire forward   half (encoder
                                   generation)         pass             runs once)
 Stacks required                 1                  1                2 (+ cross-
                                                                       attention)
 Representative models           BERT, RoBERTa,     GPT-3/4, Llama,  T5, BART
                                  DeBERTa (module     Mistral, PaLM
                                  04), Sentence-
                                  BERT (module 05)
 Still the right choice for...    Embeddings,        General-purpose  Well-defined
                                  classification,     assistants,      seq2seq tasks
                                  retrieval           chat, agents     (translation,
                                                                        summarization)
```

## Hands-on exercises

### 1. Extend BERT's forced pseudo-generation and watch the failure mode

Run the verified `[MASK]`-appending loop above yourself, then extend it
from 8 to 20 steps. Confirm the repetition pattern doesn't just
continue — it can shift to a different repeated phrase, or loop even
more tightly. This is a real, checkable property of forcing a
bidirectional model into a role its objective doesn't support, not a
one-off fluke of the 8-step run shown in this module.

### 2. Reproduce the KV-cache benchmark at a length this module didn't test

Add a fourth `n_new` value (try 250) to the cached-vs-uncached
benchmark above. Confirm the `ratio` continues increasing past the
150-token value shown in this module (2.18x), consistent with
uncached generation's per-step cost growing with sequence length while
cached generation's per-step cost stays roughly constant.

### 3. Read the T5 paper's own framing of its task-to-task-via-text-to-text design

Open "Exploring the Limits of Transfer Learning with a Unified
Text-to-Text Transformer" (cited below) and find the passage
describing how *every* task — including classification — is cast as
text-to-text in T5's framework. Compare this to how module 08's GPT-3
prompting achieved a similar "one model, no per-task head" property,
and write one or two sentences on the key difference: T5 still needs
task-specific *fine-tuning* per dataset, while GPT-3's in-context
learning needed zero gradient updates at all.

## Independent challenge

A colleague proposes: "We need a general-purpose chatbot. BERT is a
well-understood, extensively documented model with strong embeddings —
let's fine-tune BERT with a text-generation head bolted onto its
output and use that as our chatbot's core." Using this module's
verified findings, explain what's architecturally strained about this
proposal, and what you'd recommend instead.

<details><summary>Discussion</summary>

BERT's bidirectional attention means every position, including ones
"after" the point you'd want to generate from, already saw full
context during pretraining — there is no clean notion of "predict what
comes next given only what came before" baked into its weights, which
this module verified directly: forcing BERT into an autoregressive
loop produces text that degenerates into repetition within a handful
of steps, using nothing but BERT's own actual behavior. Bolting a
generation head onto BERT and fine-tuning it would need to teach the
model an entirely new left-to-right generative skill essentially from
scratch, fighting its bidirectional pretraining rather than building on
it. A decoder-only checkpoint (GPT-2-scale or larger, open-weight)
already has exactly the right pretraining objective for open-ended
generation, needs no architectural surgery, and — per module 08 — can
even be steered toward chatbot-style behavior via prompting or
lightweight fine-tuning rather than reinventing a generation mechanism
BERT was never built to have.

</details>

## Common mistakes & troubleshooting

- **Assuming "decoder-only won" means encoder-only models are
  obsolete.** They're not — module 05 covered bi-encoders (Sentence-
  BERT) built on encoder-only backbones, still the standard for
  embeddings, semantic search, and classification, where you need a
  fixed-size representation of a complete input rather than open-ended
  generation.
- **Treating the KV-cache speedup as a fixed multiplier.** This
  module's own verified numbers show it growing (1.30x -> 1.82x ->
  2.18x) as generation length increases — quoting a single ratio
  without stating the sequence length it was measured at is
  incomplete.
- **Assuming any transformer with an output vocabulary can "generate"
  coherent text via greedy decoding.** BERT technically has logits over
  a vocabulary at every position, and `argmax` will always return
  *some* token — but this module's verified output shows that doesn't
  mean the result is coherent generation; the training objective has to
  actually support it.
- **Conflating "encoder-decoder lost the general-purpose race" with
  "encoder-decoder is worse at every task."** T5's own paper (cited
  below) reports strong, competitive results on translation and
  summarization specifically — tasks that are naturally "map one
  sequence to another." The claim this module verifies is narrower and
  specific: decoder-only won the race to be *the one architecture an
  entire industry standardizes on for general-purpose use*.
- **Assuming KV-caching helps an encoder-decoder model's encoder half
  the same way it helps a decoder.** It doesn't — the encoder runs once
  over the whole input non-incrementally; only the decoder half
  benefits from caching, per Hugging Face's own `EncoderDecoderCache`
  documentation cited below.

## Checkpoint quiz

1. What did the verified `[MASK]`-appending experiment on BERT actually
   show, and why does that happen given BERT's training objective?
2. In the KV-cache benchmark, did the speedup ratio stay constant as
   `n_new` increased from 30 to 150? What are the actual verified
   numbers, and why does the ratio change that way?
3. Name one property a decoder-only model has that lets it be
   "prompted" into a new task without fine-tuning, and name the module
   in this track that first verified it.
4. Does an encoder-decoder model like T5 benefit from KV-caching across
   its *entire* forward pass? Why or why not?
5. Is it accurate to say encoder-decoder architectures are strictly
   worse than decoder-only at every task? What's the more precise
   claim this module makes?

<details><summary>Answers</summary>

1. It showed the forced generation degenerating into a repetition loop
   ("and now and now and now") within a handful of steps. This happens
   because BERT's masked-language-modeling objective trains it to fill
   in blanks using bidirectional context, not to predict a genuinely
   novel "next" token from only what came before — there's no
   well-defined next-token target in its training at all.
2. No — it grew from 1.30x (30 new tokens) to 1.82x (90) to 2.18x
   (150). This happens because uncached generation's total work grows
   roughly with the square of sequence length (each step re-attends
   over everything so far), while cached generation's total work grows
   linearly (each step only computes the new token's contribution),
   so the gap between them widens as generation gets longer.
3. In-context learning via prompting — verified directly in module 08,
   where GPT-3 performed classification from a text prompt alone, with
   a SHA-256 checksum confirming zero weight updates occurred.
4. Only for its decoder half. The encoder runs once, non-incrementally,
   over the complete input — there's no repeated "generate one more
   token" loop on the encoder side for caching to accelerate; per
   Hugging Face's `EncoderDecoderCache` design, only the decoder's
   self-attention benefits the way a decoder-only model's entire stack
   does.
5. No. T5's own paper reports strong results on tasks like translation
   and summarization using exactly the encoder-decoder architecture.
   The precise claim is narrower: decoder-only became the industry's
   general-purpose, one-architecture-for-everything standard, not that
   encoder-decoder is worse at every task.

</details>

## Further reading & sources

- [Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer (T5 paper, Raffel et al., 2019)](https://arxiv.org/abs/1910.10683) - the primary encoder-decoder counterexample this module contrasts against; shows encoder-decoder remains strong on genuine seq2seq tasks even as decoder-only became the general-purpose standard.
- [Scaling Laws for Neural Language Models (Kaplan et al., 2020)](https://arxiv.org/abs/2001.08361) - the study formalizing how autoregressive (decoder-only) transformer loss scales predictably with model size, data, and compute, cited here as the scaling-behavior evidence for why the frontier-lab industry standardized on this family.
- [Language Models are Few-Shot Learners (GPT-3 paper, Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the source of the in-context-learning finding this module reuses from module 08, as direct evidence of "one architecture, no per-task head."
- [Hugging Face Transformers: KV cache strategies](https://huggingface.co/docs/transformers/en/kv_cache) - the authoritative documentation for `use_cache`/`DynamicCache` behavior benchmarked in this module, including the `EncoderDecoderCache` class confirming caching only accelerates an encoder-decoder model's decoder half.

## Next

[Module 11: Llama and the Open-Weight Lineage](../11-llama-and-the-open-weight-lineage/README.md)
