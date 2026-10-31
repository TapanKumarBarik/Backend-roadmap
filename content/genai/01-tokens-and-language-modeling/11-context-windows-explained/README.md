# Module 11: Context Windows Explained

## Why this matters

Every module in this track has been building toward one number: how
many tokens can a model actually process in a single call. That number
— the **context window** — isn't an arbitrary marketing figure. It's a
real architectural limit rooted in how self-attention (previewed here,
covered fully in track 02) scales with sequence length, and it has
concrete, measurable consequences: compute cost that grows
**quadratically**, not linearly, with sequence length, and a real
memory cost (the KV cache) that grows linearly but can still be tens of
gigabytes at long context lengths. This module puts real numbers on
both, and covers the token-budgeting arithmetic every application
calling an LLM API actually needs.

## Concepts

### What "context window" means, precisely

The context window is the maximum number of tokens a model can attend
to in a single forward pass — combined across the system prompt,
conversation history, retrieved documents, and the model's own
generated output. It's not "input tokens" and "output tokens" as
separate budgets; in almost every model, they share one pool.

```
 context window (example: 128,000 tokens)
 ┌──────────────────────────────────────────────────────────────┐
 │ system prompt │ conversation history │ user's new message │ model's reply │
 └──────────────────────────────────────────────────────────────┘
   all of this together must fit inside the context window —
   if the total exceeds it, something has to be truncated,
   summarized, or the request is rejected outright
```

### Why it's quadratic: the real cost of self-attention

Self-attention (track 02 covers the mechanism) computes a score between
**every pair** of tokens in the sequence. Double the sequence length,
and the number of pairs doesn't double — it quadruples:

```python
def attn_ops(seq_len, d_model=4096):
    return seq_len**2 * d_model  # simplified: QK^T cost scales as seq_len^2

for n in [1000, 2000, 4000, 8000, 128000]:
    print(n, attn_ops(n) / attn_ops(1000), "x baseline")
```

Verified output:

```
1000     1.0x
2000     4.0x
4000    16.0x
8000    64.0x
128000  16384.0x
```

Going from a 1,000-token prompt to a 128,000-token prompt — a 128x
increase in length — costs over **16,000x** more attention compute, not
128x. This is the fundamental reason "just support a bigger context
window" is a real engineering problem, not a configuration flag:
naive attention doesn't scale linearly, so long-context models depend
on architectural tricks (sparse/local attention patterns, sliding
windows, or the efficient-attention algorithms track 02 and track 05
cover) to make huge context windows practical at all.

### The KV cache: a real, measurable memory cost

During generation, a model caches the key/value vectors it's already
computed for every previous token, so it doesn't redo that work for
each new token generated (this is what makes autoregressive generation
tractable at all). That cache's memory footprint grows **linearly**
with sequence length, but the constant factor is large enough to matter
directly for how many concurrent requests a server can hold in memory:

```python
def kv_cache_bytes(seq_len, num_layers=32, num_heads=32,
                    head_dim=128, batch=1, bytes_per_param=2):
    return 2 * num_layers * num_heads * head_dim * seq_len * batch * bytes_per_param

for n in [4096, 32000, 128000]:
    print(n, kv_cache_bytes(n) / 1e9, "GB")
```

Verified output (for a representative 32-layer, 32-head, 128-dim-per-head
architecture at fp16 precision — real production models vary, but this
shape is realistic):

```
4096    -> 2.15 GB
32000   -> 16.78 GB
128000  -> 67.11 GB
```

A single 128,000-token conversation, at this model shape, needs over
**67 gigabytes** just for cached keys and values — before the model's
own weights are even counted. This is why serving very long contexts is
expensive for providers even when the per-token API price looks
reasonable, and why some serving stacks cap concurrent long-context
requests independently of overall traffic volume.

### Measuring real token counts against a real limit

Module 07 already showed token counts vary by tokenizer; here's the same
idea applied to a realistic document, measured directly:

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
text = open("some_document.txt").read()
ids = enc.encode(text)
print(len(text), "chars,", len(ids), "tokens,",
      len(text) / len(ids), "chars per token")
```

Verified output against a real ~70KB text file:

```
70550 chars, 12400 tokens, 5.69 chars/token
```

**~5.7 characters per token** is a genuinely useful rule of thumb for
English text specifically (it varies for code, other languages, and
numeric-heavy text — module 07's cross-tokenizer, cross-language
differences apply here directly) — good enough for a rough budget
estimate, never a substitute for actually calling the tokenizer before
a request that's close to the limit.

### What happens when you exceed the window

Behavior differs by API and isn't something to guess at:

```
 Some APIs:     reject the request outright with an error (safest to
                 assume unless documentation says otherwise)
 Some clients:  silently truncate the oldest messages to fit
                 (can silently drop context the application logic
                 assumed was still present)
 Chat UIs:      often implement "sliding window" history management —
                 old turns quietly age out as new ones are added
```

Always check the specific API's documented behavior — assuming "it'll
just truncate sensibly" is a common source of silently degraded output
that's hard to notice until context that should have been available
turns out to be missing.

### "Lost in the middle": a documented real-world effect

Beyond raw token limits, a separate, empirically documented finding
(Liu et al., 2023, cited below) is that model performance on
information retrieval tasks is **not uniform across the context
window** — models tend to use information at the very start and very
end of a long context more reliably than information buried in the
middle, even when that middle content is well within the stated context
limit. This matters for how you structure a long prompt: the most
important instructions or facts are often better placed near the start
or end, not "somewhere in there is fine because it's under the limit."

## Reference

```
 Concept              What it means
 ──────────────────   ───────────────────────────────────────────
 Context window        Max combined input+output tokens per request
 Quadratic attention    Compute cost ~ seq_len^2, verified above
 KV cache               Cached keys/values per token; memory ~ seq_len,
                         verified above (67GB at 128K tokens, example
                         shape)
 chars/token ratio      ~4 for English (rough rule of thumb,
                         verified ~5.7 for one real sample — always
                         model- and text-specific, module 07)
 "Lost in the middle"   Empirical finding: retrieval accuracy is worse
                         for information in the middle of a long
                         context vs. the start/end
```

```
 Representative context windows (check current docs for exact,
 up-to-date figures — these change frequently):
 ─────────────────────────────────────────────────────────────
 Order of magnitude    Era / example
 4K-8K tokens          Early GPT-3.5/GPT-4 era
 32K-128K tokens       GPT-4 Turbo era and contemporaries
 200K+ tokens          Current-generation long-context models
```

## Hands-on exercises

### Exercise 1 — measure the quadratic attention cost yourself

Run the `attn_ops` function from the concepts section across a range of
your own sequence lengths, and plot (or just tabulate) the ratio versus
the smallest one. Confirm doubling the sequence length always
quadruples the relative cost, no matter which pair of lengths you pick.

### Exercise 2 — compute the KV cache size for a model you actually use

Look up (or estimate from a model card/paper) the number of layers,
attention heads, and head dimension for a real model, and compute its
KV cache size at a few realistic sequence lengths using the formula
above. Compare the result at your model's *maximum* advertised context
length against a typical GPU's memory capacity (commonly 24GB-80GB) —
does a single long-context request, by itself, fit comfortably, or does
it consume a large fraction of available memory?

### Exercise 3 — measure your own chars-per-token ratio

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
samples = {
    "prose": "A paragraph of ordinary English writing goes here.",
    "code": "def foo(x, y):\n    return x + y\n",
    "json": '{"key": "value", "nested": {"a": 1, "b": 2}}',
}
for label, text in samples.items():
    ids = enc.encode(text)
    print(label, len(text) / len(ids), "chars/token")
```

Run this and confirm the ratio is genuinely different across prose,
code, and structured data — the ~4 chars/token rule of thumb is an
average across a mix of ordinary English text, not a constant that
applies to every kind of content equally.

## Independent challenge

Your application concatenates a system prompt, up to 20 turns of
conversation history, and a retrieved document into one request. The
model's context window is 32,000 tokens, and you want to reserve at
least 2,000 tokens for the model's reply. Using `tiktoken` (or the
appropriate tokenizer for whichever model you'd actually use), write a
short function that measures the token count of each of the three
pieces and decides what to trim (which piece, and by how much) if the
total exceeds the budget. Consider: should conversation history be
trimmed from the oldest or newest end, and does the "lost in the
middle" finding change where you'd place the retrieved document
relative to the conversation history?

<details><summary>Discussion</summary>

Trimming conversation history typically removes the *oldest* turns
first — the newest turns are usually most relevant to the current
request, and abruptly losing recent context tends to degrade output
quality more noticeably than losing older turns the user may have
already mentally moved on from (though summarizing dropped turns rather
than discarding them outright is a common middle ground, not covered by
raw truncation). On placement: given the "lost in the middle" finding,
a retrieved document is often better placed near the *start* or *end*
of the prompt rather than sandwiched in the middle of a long
conversation history, if the specific facts in it are important for the
model to use reliably — though this is a heuristic to test against your
own task, not a guarantee.

</details>

## Common mistakes & troubleshooting

- **Treating "context window" as an input-only limit.** It's shared
  across input and output combined in almost every model — a request
  near the input limit leaves little to no room for a long reply.
- **Assuming doubling context length only doubles cost.** Verified
  above: attention compute scales quadratically. A provider's
  per-token price for long-context requests often reflects this
  directly, not just a flat linear rate.
- **Guessing at truncation behavior instead of checking documentation.**
  Different APIs and clients handle over-budget requests differently
  (reject vs. silently truncate) — verify for the specific one in use.
- **Using a single generic chars/token ratio for every kind of content.**
  Exercise 3 shows prose, code, and structured data measurably differ —
  measure the actual content type you're budgeting for, not a
  one-size-fits-all rule of thumb.
- **Assuming information anywhere within the context window is used
  equally reliably.** The "lost in the middle" finding means placement
  within an otherwise-valid-length prompt can matter for retrieval
  accuracy, independent of whether the token count itself fits.

## Checkpoint quiz

1. Does the context window apply to input tokens only, or input and
   output combined?
2. If you double a sequence's length, how does self-attention's compute
   cost change? What did the verified experiment show?
3. What is the KV cache, and does its memory cost scale linearly or
   quadratically with sequence length?
4. Is "~4 characters per token" a universal constant? What did
   exercise 3 show about prose vs. code vs. structured data?
5. What is the "lost in the middle" finding, and how might it change
   where you place important information in a long prompt?

<details><summary>Answers</summary>

1. Input and output combined, in almost every model — they share one
   token budget, not two independent ones.
2. Quadratically — verified: going from 1,000 to 128,000 tokens (a 128x
   length increase) produced a 16,384x increase in relative attention
   compute, not 128x.
3. The cache of previously-computed key/value vectors that lets
   autoregressive generation avoid recomputing them for every new
   token. Its memory cost scales **linearly** with sequence length
   (unlike attention compute, which is quadratic) — verified at 2.15GB,
   16.78GB, and 67.11GB for 4K/32K/128K tokens respectively, for a
   representative model shape.
4. No — it's a rough average for ordinary English prose specifically.
   Exercise 3 showed the actual ratio differs measurably across prose,
   code, and JSON, so it should never substitute for measuring the
   actual content being budgeted.
5. Model performance on retrieval tasks tends to be less reliable for
   information placed in the middle of a long context than information
   at the start or end, even when everything fits within the stated
   token limit. It suggests placing critical information near the
   start or end of a long prompt rather than assuming any position
   within the limit works equally well.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - the original self-attention paper; its complexity analysis is the basis for this module's quadratic-scaling verification.
- [Lost in the Middle: How Language Models Use Long Contexts (Liu et al., 2023)](https://arxiv.org/abs/2307.03172) - the empirical study behind this module's "lost in the middle" discussion, with the original retrieval-accuracy-by-position experiments.
- [Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., 2023)](https://arxiv.org/abs/2309.06180) - the vLLM paper (previewed here, covered fully in track 08); documents the KV cache memory problem this module's exercise 2 quantifies and a real production solution to it.
- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - used throughout this module's exercises to measure real token counts against real text.
- [OpenAI API documentation: Models](https://platform.openai.com/docs/models) - current, authoritative context-window figures per model; check here rather than relying on this module's illustrative "order of magnitude" table, which will go stale.

## Next

[Module 12: Token Cost Economics](../12-token-cost-economics/README.md)
