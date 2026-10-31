# Module 12: Token Cost Economics

## Why this matters

Modules 07-11 established that token counts vary by tokenizer, model,
and content type, and that longer contexts cost disproportionately more
compute. This module turns that into the number that actually shows up
on an invoice. LLM APIs are billed per token, almost always with
**separate, asymmetric rates for input and output tokens** — a detail
that changes which optimizations actually save money. This module
builds a real, runnable cost calculator using verified token counts
from `tiktoken`, and covers the two discount mechanisms (prompt caching,
batch processing) that materially change unit economics for real
workloads. Exact prices are never memorized here — they change
frequently and must be checked against a provider's current pricing
page — but the *structure* of how token costs compose is stable and
worth understanding precisely.

## Concepts

### The bill is `(input tokens x input rate) + (output tokens x output rate)` — and the rates differ

Every major LLM API bills input and output tokens at **different**
rates, and output is consistently priced higher — often by a factor of
3-5x, though the exact multiple varies by provider and model and
changes over time (always check current pricing directly rather than
assuming a specific ratio). This asymmetry exists because generating
each output token requires a full forward pass, while a batch of input
tokens can be processed in parallel during the initial prompt encoding.

```
 cost = (input_tokens  × price_per_input_token)
      + (output_tokens × price_per_output_token)

 price_per_output_token  >  price_per_input_token   (almost always)
```

**Practical consequence**: a prompt-engineering change that shortens
your *output* by 100 tokens usually saves more money than a change that
shortens your *input* by the same 100 tokens — the asymmetry means
output-token efficiency (concise system prompts asking for concise
answers, structured output formats instead of verbose prose) is
disproportionately valuable compared to input-token trimming alone.

### A real, measured example

Verified token counts for one real system/user/reply exchange, using
`cl100k_base`:

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")

system = "You are a helpful coding assistant. Answer concisely..."
user = "Write a Python function that computes the nth Fibonacci number using memoization."
reply = "Here is a Python function using memoization:\n\ndef fib(n, memo={}): ..."

print(len(enc.encode(system)))  # 18
print(len(enc.encode(user)))    # 14
print(len(enc.encode(reply)))   # 76
```

Verified output: **18 + 14 = 32 input tokens, 76 output tokens.** Notice
the reply — a short function plus one sentence of explanation — already
outweighs the entire input by more than 2x. For a chat application, this
ratio (output tokens often exceeding input tokens, sometimes by a lot)
is completely ordinary, and it's exactly why the input/output rate
asymmetry above matters in practice, not just in theory.

### Cost calculator, built on real counts

```python
def estimate_cost(input_tokens, output_tokens,
                   price_per_1k_input, price_per_1k_output):
    return (input_tokens / 1000) * price_per_1k_input + \
           (output_tokens / 1000) * price_per_1k_output

# Illustrative rates only — ALWAYS check the provider's current
# pricing page before using real numbers for a budget decision.
cost = estimate_cost(32, 76, price_per_1k_input=0.003, price_per_1k_output=0.015)
print(f"${cost:.5f} per request")
```

This pattern — separate multiplication for input and output, summed —
is the actual structure behind every provider's pricing page, no matter
what the specific per-1K or per-1M rates happen to be this month.

### Scaling a single request's cost to a real workload

The real budgeting question is almost never "what does one call cost"
— it's "what does this feature cost at production volume":

```python
cost_per_request = estimate_cost(32, 76, 0.003, 0.015)
requests_per_day = 50_000
monthly_cost = cost_per_request * requests_per_day * 30
print(f"${monthly_cost:,.2f} per month at {requests_per_day:,} requests/day")
```

At the illustrative rates above, 50,000 requests/day of this shape
would cost roughly $2,000/month — small individually, real at scale.
This is the calculation worth running *before* shipping a feature that
calls an LLM in a hot path, not after the first invoice arrives.

### Two real discount mechanisms that change the math

**Prompt caching**: several providers offer a substantially reduced rate
for input tokens that repeat *exactly* across consecutive requests
(a long, unchanging system prompt or a large retrieved document reused
across a conversation). This rewards structuring prompts so the stable,
reusable part comes first and the request-specific part comes last —
the opposite order breaks the cache on every request, since caching
requires an exact prefix match.

```
 GOOD for caching:      [stable system prompt][stable docs][new user turn]
                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ reused verbatim
                         across requests -> eligible for a cache discount

 BAD for caching:       [new user turn][stable system prompt][stable docs]
                         putting the varying part FIRST breaks the
                         prefix match for every request that follows
```

**Batch processing**: providers commonly offer a meaningfully lower rate
(often around half the synchronous price, though — as always — check
current terms) for requests submitted as an asynchronous batch with a
relaxed turnaround-time guarantee (hours, not seconds). This is a real
lever for workloads that don't need an immediate response — bulk
classification, offline evaluation, dataset labeling — and is
frequently left unused simply because a team defaults to the
synchronous API for everything.

## Reference

```
 Concept                  What it means
 ───────────────────      ─────────────────────────────────────────
 Input token rate          Price per input token — typically the
                            lower of the two rates
 Output token rate          Price per output token — typically 3-5x
                            the input rate (verify current multiple)
 Prompt caching            Reduced rate for an exactly-repeated prefix
                            across consecutive requests
 Batch processing          Reduced rate for asynchronous, relaxed-
                            latency request submission
 cost = input*rate_in
      + output*rate_out    The universal structure behind every
                            provider's per-request pricing
```

```
 Optimization lever          Effect on cost
 ──────────────────────      ──────────────────────────────────────
 Shorter system prompt        Reduces input cost every request; larger
                               relative effect if NOT cache-eligible
 Concise output format         Reduces output cost — often the bigger
 (e.g. structured JSON vs      lever given the output-rate premium
 verbose prose)
 Stable-prefix prompt          Enables caching discount on the
 structuring                   repeated portion
 Move non-urgent workloads     Enables batch discount
 off the synchronous API
```

## Hands-on exercises

### Exercise 1 — measure your own real conversation's token split

Take a real prompt/response pair from something you've actually used an
LLM for recently (or reuse the Fibonacci example above), measure both
sides with `tiktoken`, and compute what fraction of the total tokens is
input vs. output:

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
input_tokens = len(enc.encode("<your prompt>"))
output_tokens = len(enc.encode("<the actual reply>"))
total = input_tokens + output_tokens
print(f"input: {input_tokens} ({input_tokens/total:.0%})")
print(f"output: {output_tokens} ({output_tokens/total:.0%})")
```

### Exercise 2 — build and run the cost calculator

Implement `estimate_cost` from the concepts section, and — using
whatever current rates you find on a real provider's pricing page
(don't reuse this module's illustrative numbers, which will be stale by
the time you read this) — compute the actual monthly cost of exercise
1's request shape at three different volumes: 1,000, 50,000, and
1,000,000 requests/day.

### Exercise 3 — quantify the caching-eligible prefix advantage

Using a real system prompt plus a few varying user turns (or the
example above), compute what fraction of *total* input tokens across 10
requests is the stable, cacheable prefix vs. the varying suffix. Assume
the cacheable portion gets a hypothetical 90% discount and the rest is
billed normally — compute the total cost with and without caching and
compare.

```python
system_prompt_tokens = 18   # stable across all 10 requests
varying_tokens_per_request = 14  # different each time

total_without_caching = (system_prompt_tokens + varying_tokens_per_request) * 10
total_with_caching = (
    system_prompt_tokens  # paid once, cached for the rest (illustrative)
    + system_prompt_tokens * 0.1 * 9  # 90% discount on 9 repeat hits
    + varying_tokens_per_request * 10
)
print(total_without_caching, total_with_caching)
```

Confirm the savings grow with the number of requests sharing the same
stable prefix — caching matters more the more a prompt's stable portion
dominates its total size, and the more requests reuse it.

## Independent challenge

A team is deciding between two designs for a customer-support chatbot:
(A) a very long, detailed system prompt (2,000 tokens) with a short,
targeted user turn each time, reused verbatim across every request in a
session; or (B) a short system prompt (200 tokens) that dynamically
assembles different few-shot examples into the prompt on every request
based on the user's message (rarely repeating exactly). Using this
module's concepts — input/output rate asymmetry, and prompt-caching
eligibility specifically — write two or three sentences on which design
is likely cheaper at scale, and what assumption your answer depends on.

<details><summary>Discussion</summary>

Design (A)'s large-but-*stable* prompt is exactly the shape that
benefits most from prompt caching — paying full price once and a
steep discount on every repeat within a session — while design (B)'s
dynamically-assembled prompt breaks the exact-prefix match on nearly
every request, so its smaller raw size may not translate into a
smaller actual bill once caching eligibility is accounted for. The
answer depends heavily on session length (how many requests reuse (A)'s
prefix before it changes) and on whether the two designs actually
produce similar output-token counts, since output cost dominates a good
chunk of the total either way — this is exactly the kind of assumption
worth checking with real measured numbers (exercises 1-3) rather than
deciding from prompt length alone.

</details>

## Common mistakes & troubleshooting

- **Assuming input and output tokens cost the same.** They almost never
  do — output is typically priced meaningfully higher, which changes
  which optimizations are worth prioritizing (see the "practical
  consequence" note above).
- **Optimizing input length while ignoring output length.** Given the
  rate asymmetry, a verbose model reply often costs more than a verbose
  prompt of similar token count — asking for concise or structured
  output is frequently the higher-leverage change.
- **Restructuring a prompt so the varying part comes first**, breaking
  prompt-caching eligibility without realizing it — always put the
  stable, reusable portion of a prompt first if caching matters for
  your workload.
- **Defaulting every workload to the synchronous API** even when a
  batch/asynchronous option with a real discount exists and the
  workload doesn't need an immediate response.
- **Using a remembered price from months ago.** Token pricing changes
  frequently across providers — always verify against the current
  pricing page before making a real budget decision, never from memory
  or an old blog post.

## Checkpoint quiz

1. Do input and output tokens usually cost the same rate? Which is
   typically priced higher, and why?
2. In the verified Fibonacci example, how many input tokens and how
   many output tokens were measured, and what does that ratio suggest
   about where cost tends to concentrate in a chat application?
3. What prompt structure is required for prompt caching to actually
   apply, and what breaks it?
4. What's the tradeoff batch processing offers, and when is it not a
   good fit?
5. Why shouldn't you reuse a specific per-token price you read
   somewhere in the past for a real budget calculation?

<details><summary>Answers</summary>

1. No — output tokens are typically priced higher than input tokens
   (often by a multiple, though the exact ratio varies and changes over
   time), because generating each output token requires a full
   sequential forward pass while input tokens can be processed in
   parallel during prompt encoding.
2. 32 input tokens (18 system + 14 user), 76 output tokens — output
   outweighed input by more than 2x in this example, illustrating that
   for chat-style applications, output-token cost frequently dominates
   the total, not input-token cost.
3. The stable, reusable portion of the prompt must come *first*, as an
   exact-match prefix across consecutive requests. Putting the varying,
   request-specific content before the stable content breaks the
   exact-prefix match and disqualifies the request from the caching
   discount.
4. Batch processing offers a meaningfully lower per-token rate in
   exchange for relaxed turnaround time (hours instead of seconds) — a
   good fit for bulk, non-time-sensitive workloads (offline
   classification, dataset labeling), and a poor fit for anything
   needing an immediate, synchronous response.
5. Because token pricing changes frequently across providers and
   models — a number that was accurate months ago may be stale or
   simply wrong today; always check the provider's current pricing
   page directly before a real budget decision.

</details>

## Further reading & sources

- [OpenAI API Pricing](https://openai.com/api/pricing/) - the authoritative, current source for input/output token rates per model; check here rather than any cached figure, including this module's own illustrative numbers.
- [Anthropic API Pricing](https://www.anthropic.com/pricing) - current per-model input/output rates and prompt-caching discount terms for Claude models.
- [Anthropic documentation: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) - documents the exact-prefix-match requirement and cache-hit discount mechanics referenced in this module's caching discussion.
- [OpenAI documentation: Batch API](https://platform.openai.com/docs/guides/batch) - documents the asynchronous batch-processing discount and turnaround-time tradeoff covered in this module.
- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - used throughout this module's exercises to measure real, verifiable token counts before estimating cost.

## Next

[Module 13: Tokenization Pitfalls and Failure Modes](../13-tokenization-pitfalls-and-failure-modes/README.md)
