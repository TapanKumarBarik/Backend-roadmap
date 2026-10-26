# Module 16: Pricing, Rate Limits and Quotas

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**. Modules 00 to 14 showed how to call models; module 15 showed the other option, running one on the user's device. This module is about the part of every API integration that decides whether it survives contact with production: what a request costs, how many requests you may send, and what your code does when the answer is "not now" or "no more".

It links to, and does not re-teach, three earlier modules: [Track 01, Module 12: Token Cost Economics](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md) (the input/output cost formula and the two discount mechanisms), [Track 08, Module 05: Generating Embeddings at Scale](../../08-embeddings-and-vector-databases/05-generating-embeddings-at-scale/README.md) (the theory of exponential backoff and jitter) and [Module 15](../15-on-device-and-edge-inference/README.md) (the cloud side of a hybrid is what this module prices). [Module 17](../17-provider-abstraction-and-model-routing/README.md) uses the error taxonomy built here.

After this module you can:

- explain how API pricing is structured (input, output, cached input, cache writes, batch, reasoning tokens, per-unit charges) without memorising any price, and build and test a cost estimator;
- name the units providers limit you in (requests, tokens, images, per minute and per day), the response headers that report them, and what each provider's documentation says a 429 means;
- tell apart the 429 that means "wait" from the 429 that means "you are out of money", and code the difference;
- implement a client-side token-bucket limiter, a concurrency limiter, and a retry policy that honours `Retry-After`, adds jitter and caps both attempts and total waiting, and test all three against a stand-in server;
- put budgets, alerts and a kill switch in front of your client, and rank the real levers for lowering a bill.

Why it matters: cost and rate limits are the two production failures that arrive silently (a bill) or all at once (a wall of 429s), and both are mostly a matter of arithmetic and discipline you can test before launch.

## Concept

> [!key] A cloud model call is a metered, rate-limited resource. Cost is a sum of token and unit lines whose rates you read from the provider's pricing page and keep out of your code; limits are token buckets measured in requests and tokens that you stay under on purpose, and when they push back you obey the server's hint (`Retry-After`), add jitter, cap your retries, and never retry the 429s that mean "out of money". Put your own budget, alert and kill switch in front of all of it.

## Explanation

Everything provider-specific below comes from the official pages named in each bullet, which I fetched and read for this module (checked Oct 2026). **They are the source of truth and may have changed since; I give structure and header names, not prices, limits or model names.** All dollar figures in the code are invented round numbers.

### Part 1: How API pricing is structured

Read the three pricing pages side by side and the same skeleton appears. The bill for one request is a sum of lines:

```
cost = sum over token lines of (tokens x rate for that line)  +  sum over unit lines of (units x unit price)

token lines:  uncached input | cached-input reads | cache writes | output (visible + hidden reasoning)
unit lines:   images | audio minutes or characters | tool calls (per 1k) | storage (per GB-day) | fine-tuning training
modifiers:    batch discount | processing tier (flex, fast) | long-context rate | regional/data-residency uplift
```

What the pages say (each bullet cites its page):

- **Per-token, input and output priced separately.** OpenAI's [pricing page](https://developers.openai.com/api/docs/pricing) quotes text models "per 1M tokens" with columns for input, output and cached input; some models add cache-write columns for different cache lifetimes. Gemini's [pricing table](https://ai.google.dev/gemini-api/docs/pricing) has an "Output price (including thinking tokens)" row and a "Context caching price" row. Anthropic's [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) lists a base input price, cache-write and cache-read prices, and an output price per model. The asymmetry and the basic formula are in [Track 01, Module 12](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md).
- **Hidden reasoning tokens are billed as output.** OpenAI's [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning): reasoning tokens "are not visible via the API" but "still occupy space in the model's context window and are billed as output tokens", and it warns that when generation hits `max_output_tokens` "you could incur costs for input and reasoning tokens without receiving a visible response". Gemini's row label says its output price includes thinking tokens. So the visible answer length is not the billed length; read the usage object.
- **Prompt caching has two prices, not one.** OpenAI's [prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching): the unchanged tokens at the start of a prompt (the prefix) can be reused, "Cache reuse requires the entire rendered prefix to match", a prefix must meet a minimum cacheable length, and the response's `usage` reports `cached_tokens`. Reads cost a fraction of the normal input rate, and the guide and the pricing pages show that on some models writing a prefix to the cache costs more than normal input, with a choice of cache lifetime. Anthropic's pricing page makes the same split (write and read prices, two lifetimes) and works out the break-even: caching pays off after one read for the short lifetime and after two for the long one. The code below computes the break-even for any multipliers.
- **Batch is a separate, cheaper lane.** OpenAI's [Batch guide](https://developers.openai.com/api/docs/guides/batch) offers "asynchronous groups of requests" at a lower cost than synchronous calls with "a separate pool of significantly higher rate limits, and a clear 24-hour turnaround time"; Anthropic's [Message Batches page](https://platform.claude.com/docs/en/build-with-claude/batch-processing) and Gemini's [batch page](https://ai.google.dev/gemini-api/docs/batch-api) describe the same trade (a discount, up to 24 hours). OpenAI's [Flex processing](https://developers.openai.com/api/docs/guides/flex-processing) similarly trades "slower response times and occasional resource unavailability" for lower cost, and the pricing page has further tabs named Fast and Ultrafast (read the page for what each one trades). All of them state the discount percentage on their own pages; I leave it there.
- **Everything that is not text has its own unit.** The OpenAI page prices tools "per 1k calls", file-search storage "per GB per day", voice sessions per second, and fine-tuning with separate training, input, output and cached-input columns; it states "Tokens used for built-in tools are billed at the chosen model's per-token rates", so a tool call costs both its fee and the tokens it adds. Anthropic's page says web search is charged per search "plus standard token costs", and that declaring tools adds system-prompt tokens that "are added to your normal input and output tokens".
- **Modifiers stack.** OpenAI and Anthropic both list regional or data-residency endpoints as carrying an uplift on the token price, and Anthropic says its cache multipliers "stack with other pricing modifiers, including the Batch API discount and data residency". Some models also price long prompts at a different rate.
- **A "token" is not a fixed unit.** Anthropic's pricing page says its newer tokenizer produces more tokens for the same text than the previous one. Price per token is therefore not comparable across models or generations: compare cost per completed task, measured from usage objects (see [Track 01, Module 12](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md) and [Module 04 of this track](../04-model-families-and-generations/README.md) for model generations).

> [!pitfall] Treating a price as a constant in code. Prices, discounts, cache multipliers and even the set of billed lines change by model and over time. Keep a price table in configuration with a date, a source URL and a test that fails loudly if a model has no entry, and log token usage per call so you can re-price history.

### Part 2: How limits are described

Rate limits are quotas over a time window. The pages differ in names but agree on the structure.

- **Units.** OpenAI: "RPM (requests per minute), RPD (requests per day), TPM (tokens per minute), TPD (tokens per day), IPM (images per minute), and audio minutes per minute for some streaming audio models", and "Rate limits can be hit across any of the options depending on what occurs first". Anthropic measures Messages API limits in requests per minute (RPM), input tokens per minute (ITPM) and output tokens per minute (OTPM). Gemini: requests per minute (RPM), input tokens per minute (TPM) and requests per day (RPD), with the note that "if your RPM limit is 20, making 21 requests within a minute will result in an error, even if you haven't exceeded your TPM or other limits". Gemini's RPD quotas reset "at midnight Pacific time".
- **Scope.** OpenAI limits are "defined at the organization level and at the project level, not user level" and "vary by the model being used"; some model families share one limit. Anthropic enforces at the organization level with optional workspace limits. Gemini: "applied per project, not per API key".
- **Tiers.** All three tie limits to a usage tier that rises automatically with payment history or spend (OpenAI: Free, Build, Launch, Grow; Anthropic: Evaluation, then Start, Build, Scale, and Custom; Gemini: Free, Tier 1 to 3). Higher tiers get higher limits. Tier names and thresholds are perishable: look them up on the page, and look up your own limits in the console.
- **Token buckets, enforced over short windows.** Anthropic: "The API uses the token bucket algorithm to do rate limiting. This means that your capacity is continuously replenished up to your maximum limit, rather than being reset at fixed intervals", and "a rate of 60 requests per minute (RPM) might be enforced as 1 request per second. Short bursts of requests can exceed the limit". A per-minute number is a rate, not a license to send 60 requests in the first second.
- **How tokens are counted differs, and it matters.** OpenAI: "Your rate limit is calculated as the maximum of max_tokens and the estimated number of tokens based on the character count of your request. Try to set the max_tokens value as close to your expected response size as possible." Anthropic: output limits count "only the actual tokens generated" and "The max_tokens parameter does not factor into OTPM rate limit calculations", and for most models cached input reads do not count toward ITPM. The same client code can be throttled by an oversized `max_tokens` on one provider and not on another.
- **Ramp-rate (acceleration) limits.** OpenAI's `slow_down` error "can occur even when your traffic is within its requests-per-minute and tokens-per-minute limits"; its rule of thumb at the time of checking was to grow traffic by no more than 50% every 15 minutes once it reaches about a million input tokens per minute. Anthropic describes "acceleration limits" for "a sharp increase in usage". Plan launches and backfills as ramps.
- **Separate lanes.** Batch has its own limits (OpenAI counts queued input tokens; Gemini says batch requests "are subject to their own rate limits, separate from the non-batch API calls"), and Priority or fast modes can have dedicated limits too.

### Part 3: Headers, `Retry-After` and what a 429 can mean

**Headers.** The exact names the pages list (checked Oct 2026):

| Provider | Header names |
| --- | --- |
| OpenAI (rate-limits guide) | `x-ratelimit-limit-requests`, `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`, plus `x-ratelimit-limit-project-tokens`, `x-ratelimit-remaining-project-tokens`, `x-ratelimit-reset-project-tokens` when a project-scoped limit applies, and `Retry-After` |
| Anthropic (rate-limits page) | `retry-after`, `anthropic-ratelimit-requests-limit`, `-requests-remaining`, `-requests-reset`, the same three for `anthropic-ratelimit-tokens-*`, `anthropic-ratelimit-input-tokens-*` and `anthropic-ratelimit-output-tokens-*`, and `anthropic-priority-*` variants for Priority Tier |
| Gemini (rate-limits page) | none documented on that page; it says to wait and retry after a short period |

The value formats differ. OpenAI's sample values are durations such as `1s` and `6m0s` for the `reset` headers, and the guide describes `Retry-After` as "the minimum number of seconds to wait before retrying a temporary rate-limit error, when present". Anthropic's `reset` headers are RFC 3339 timestamps, its `remaining` token counts are "rounded to the nearest thousand", and `retry-after` is "The number of seconds to wait until you can retry the request. Earlier retries will fail." The code below parses both dialects into one neutral view, which is the kind of normalisation [module 17](../17-provider-abstraction-and-model-routing/README.md) needs.

**Standards.** Status 429 is defined by [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585): the user "has sent too many requests in a given amount of time", with a response that "MAY include a Retry-After header". [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) defines `Retry-After` as "either an HTTP-date or a number of seconds", so a robust client parses both. A standard for rate-limit headers themselves is only an in-progress IETF Internet-Draft ("RateLimit header fields for HTTP", `draft-ietf-httpapi-ratelimit-headers-11`, dated May 2026, defining `RateLimit-Policy` and `RateLimit`); the providers above still use their own names.

**A 429 is not one thing.** The documented meanings, and what to do:

| What the docs say | Retry? | Source |
| --- | --- | --- |
| Plain rate limit ("Rate limit reached for requests"), often with `Retry-After` | Yes, after at least `Retry-After`, plus jitter | [OpenAI error codes](https://developers.openai.com/api/docs/guides/error-codes); Anthropic rate-limits page |
| Ramp rate (OpenAI `rate_limit_error` with code `slow_down`; Anthropic acceleration limits) | Yes, and reduce the rate, then grow it gradually | OpenAI error codes and rate-limits guide; Anthropic |
| Model overloaded: OpenAI 503 `server_is_overloaded` (may carry `Retry-After`), Anthropic 529 `overloaded_error` | Yes, with backoff | OpenAI rate-limits guide; [Anthropic errors page](https://platform.claude.com/docs/en/api/errors) |
| Credit exhausted, spend limit reached, usage limit reached (OpenAI codes `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded`; Anthropic monthly spend cap, code `enforced_spend_limit_reached`, which "has no retry-after header") | **No.** "Retrying billing, spend, or quota errors won't restore API access." A human must act | OpenAI error codes; Anthropic rate-limits page |
| Anthropic: a spend limit *you* set | **No**, and note it is HTTP **400**, not 429 | Anthropic rate-limits page |
| Gemini: spend-based rate limit over a rolling 10-minute window (returns `429 RESOURCE_EXHAUSTED`) | The page says to wait, retry after a short period and reduce expensive requests; it does not tabulate the error shapes of its other limits, so read the error details your SDK surfaces | Gemini rate-limits page |

Further rules that the OpenAI guide states and this module's client follows: treat `Retry-After` as a minimum and add a small random delay; if it is missing or invalid use exponential backoff with jitter; "Limit both the number of attempts and the total time spent retrying"; disable the SDK's own retries (or count them) so "nested retry loops don't multiply requests"; "unsuccessful requests contribute to your per-minute limit, so continuously resending a request won't work"; and for streaming, an error after output has started should not be replayed automatically. For the theory of backoff and jitter see [Track 08, Module 05](../../08-embeddings-and-vector-databases/05-generating-embeddings-at-scale/README.md).

> [!pitfall] Classifying by status code alone. `if status == 429: retry` turns "your prepaid balance is zero" into an hourly retry storm that can never succeed, and the SDK may do it for you. Look inside the body for the codes in the table, and treat an unknown 429 without `Retry-After` more cautiously than one with it.

### Part 4: Client-side controls

Three tools, used together, so that 429s are the exception rather than the control loop:

1. **A token bucket in front of the call.** Two buckets, one counting requests and one counting estimated tokens, each refilled continuously at the provider's per-minute rate, with a capacity of a second or so of burst. Take from both before sending; if either is short, wait exactly as long as it takes to refill. Set your limit below the provider's (here 60%), because bursts and clock differences are real. Refund what you did not use after the answer arrives.
2. **A concurrency limiter.** A bounded semaphore caps requests in flight. A rate limit says how many per minute; slow responses plus an unbounded worker pool means thousands in flight and a timeout storm. Concurrency is also the lever that works when the provider's numbers are unknown.
3. **A retry policy** with the rules above: classify first, then honour the server's hint, otherwise full jitter, with a cap on attempts, on any single wait, and on total waiting, and a deliberate "defer" outcome when the server asks for longer than you are willing to sleep inside a request.

What this module does not build: adapting the pacing from `remaining` headers, priority queues, or a shared limiter across processes (a Redis-style token bucket). Those are the Project.

### Part 5: Budgets, alerts and kill-switches

Provider-side controls are a backstop, not a budget system. OpenAI offers a **spend alert** ("Sends a notification; API traffic continues") and a **hard spend limit** ("Affected API requests return a 429 error"), and a separate approved monthly usage limit per organization. Anthropic has a monthly spend cap per tier and a limit you can set below it, and Gemini enforces tier caps and spend-based rate limits. All of these are coarse (monthly, organisation or project wide) and they fail by erroring in the middle of production. Your own layer should sit in front of the client and do four things: a **soft limit** that alerts a human once; a **hard cap** that refuses a call before it is sent when its projected cost would cross the cap; a **per-user (or per-tenant) cap**, which the OpenAI guide also recommends ("set a usage limit for individual users within a specified time frame"); and a **runaway detector** that trips a **kill switch** when spend inside a short window is implausible (an agent stuck in a loop is the classic cause). The kill switch must be visible, testable and resettable by an operator.

### Part 6: Cost levers, in the order they usually matter

1. **Do not send it.** Cache whole answers for repeated questions, deduplicate, and cut calls that do not need a model.
2. **Smaller model for the easy majority.** Usually the biggest lever; it needs an evaluation to make sure quality holds ([module 17](../17-provider-abstraction-and-model-routing/README.md) is about routing).
3. **Prompt caching** for any large prefix reused within the cache lifetime: system prompt, tool definitions, a document asked about many times. Keep the stable part first and the changing part last, because the match is by prefix.
4. **Shorter inputs and outputs.** Trim boilerplate, retrieve fewer chunks, ask for concise answers, set `max_tokens` close to what you need (this also reduces rate-limit pressure on providers that count it), and watch reasoning effort on reasoning models.
5. **Batch** everything that can wait: evaluations, enrichment, nightly summaries.
6. **Stop paying for waste:** retries of non-idempotent work, streaming responses that nobody reads, requests that time out client-side while the server still generates.

The Code section puts illustrative numbers on this list.

## Code

All blocks are standard-library Python, are cumulative (copy them in order into one file, `pricing_limits.py`, and run it), and were executed with Python 3.13; the pasted outputs are from those runs. **Every price, limit and workload number is invented for illustration.** The server in block 4 is **a local stand-in that mimics the documented shape of the OpenAI and Anthropic rate-limit headers and 429 bodies; the model behind it is scripted (it always returns 20 words), not a real model.** Nothing here calls a provider.

### 1. A cost estimator, with tests

Reasoning tokens are priced as output (OpenAI's guide; Gemini's table label); the batch discount is assumed to apply to token lines only; every rate is an argument, not a constant.

```python
"""cost.py - a request-cost estimator with tests. Standard library only.
Prices below are ILLUSTRATIVE round numbers, not any provider's price list: read the provider's pricing page."""
import random
from dataclasses import dataclass, replace

M = 1_000_000


@dataclass(frozen=True)
class Price:
    input_per_m: float                 # USD per 1M normal input tokens
    output_per_m: float                # USD per 1M output tokens
    cache_read_mult: float = 0.10      # cached input costs this fraction of the input rate
    cache_write_mult: float = 1.25     # writing a prefix into the cache costs this multiple of the input rate
    batch_mult: float = 0.50           # asynchronous batch costs this fraction of the synchronous token price
    per_image: float = 0.0             # flat USD per input image
    per_audio_minute: float = 0.0
    per_tool_call: float = 0.0         # USD per server-side tool call (a search, say)


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0              # normal (uncached) input tokens
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    output_tokens: int = 0             # visible output
    reasoning_tokens: int = 0          # hidden thinking: priced as output (OpenAI reasoning guide; Gemini's table label)
    images: int = 0
    audio_minutes: float = 0.0
    tool_calls: int = 0

    def __add__(self, other):
        return Usage(*(a + b for a, b in zip(self.__dict__.values(), other.__dict__.values())))


def estimate(u: Usage, p: Price, batch: bool = False) -> dict:
    """Itemised USD. ASSUMPTION: the batch discount applies to token lines only, not to flat fees."""
    tok = {"input": u.input_tokens * p.input_per_m / M,
           "cache_read": u.cache_read_tokens * p.input_per_m * p.cache_read_mult / M,
           "cache_write": u.cache_write_tokens * p.input_per_m * p.cache_write_mult / M,
           "output": u.output_tokens * p.output_per_m / M,
           "reasoning": u.reasoning_tokens * p.output_per_m / M}
    if batch:
        tok = {k: v * p.batch_mult for k, v in tok.items()}
    lines = {**tok, "images": u.images * p.per_image, "audio": u.audio_minutes * p.per_audio_minute,
             "tools": u.tool_calls * p.per_tool_call}
    return {**lines, "total": sum(lines.values())}


def cost(u, p, batch=False):
    return estimate(u, p, batch)["total"]


def cache_breakeven(p: Price) -> int:
    """Smallest number of requests sharing one prefix for which 'write once, then read' beats no caching."""
    n = 1
    while p.cache_write_mult + (n - 1) * p.cache_read_mult >= n:
        n += 1
        if n > 1000:
            raise ValueError("caching never pays off with these multipliers")
    return n


# ---- tests (plain asserts, so they also run under pytest) ------------------------------------------------------------
LARGE = Price(input_per_m=10.0, output_per_m=30.0, per_image=0.002, per_audio_minute=0.006, per_tool_call=0.01)
n_checks = 0


def check(cond, msg):
    global n_checks
    assert cond, msg
    n_checks += 1


close = lambda a, b: abs(a - b) < 1e-9
check(close(cost(Usage(input_tokens=1000, output_tokens=500), LARGE), 0.025), "hand calculation: 0.010 + 0.015")
check(close(cost(Usage(output_tokens=200, reasoning_tokens=300), LARGE), cost(Usage(output_tokens=500), LARGE)), "reasoning == output")
u = Usage(input_tokens=4000, output_tokens=1000, images=2, tool_calls=3)
b, s = estimate(u, LARGE, batch=True), estimate(u, LARGE)
check(close(b["input"], 0.5 * s["input"]) and b["images"] == s["images"] and b["tools"] == s["tools"], "batch halves token lines only")
check(cost(Usage(cache_read_tokens=1000), LARGE) < cost(Usage(input_tokens=1000), LARGE) < cost(Usage(cache_write_tokens=1000), LARGE), "cache ordering")
check(cache_breakeven(LARGE) == 2 and cache_breakeven(replace(LARGE, cache_write_mult=2.0)) == 3, "break-even requests")
for n in (1, 2, 5):                                    # the break-even formula agrees with summing the bills directly
    with_cache = cost(Usage(cache_write_tokens=10_000), LARGE) + (n - 1) * cost(Usage(cache_read_tokens=10_000), LARGE)
    check((with_cache < n * cost(Usage(input_tokens=10_000), LARGE)) == (n >= cache_breakeven(LARGE)), f"direct sums at n={n}")
rng = random.Random(0)                                 # seeded property test: never negative, additive in usage
rand_usage = lambda: Usage(*(rng.randint(0, 5000) for _ in range(5)), images=rng.randint(0, 3), tool_calls=rng.randint(0, 3))
for _ in range(100):
    a, c = rand_usage(), rand_usage()
    check(cost(a, LARGE) >= 0 and close(cost(a + c, LARGE), cost(a, LARGE) + cost(c, LARGE)), "additive")
check(cost(Usage(), LARGE) == 0.0, "zero usage costs nothing")
print(f"{n_checks} cost checks passed; cache break-even: {cache_breakeven(LARGE)} requests at write x1.25, "
      f"{cache_breakeven(replace(LARGE, cache_write_mult=2.0))} at write x2.0 (read x0.1)")
```

```
109 cost checks passed; cache break-even: 2 requests at write x1.25, 3 at write x2.0 (read x0.1)
```

### 2. Worked example: five cost levers on one workload

A support bot: 1,000,000 requests a month, a static system prompt, a short user turn, a long answer. "Alone" applies one lever to the baseline; "cumulative" stacks them in order.

```python
# A worked example of the cost levers. Everything is ILLUSTRATIVE: workload, prices, hit rate and routing share.
SMALL = Price(input_per_m=1.0, output_per_m=3.0)
REQUESTS = 1_000_000                       # per month


def monthly(system=2500, dynamic=500, output=400, mix=((1.0, LARGE),), cache_hit=None, batch_share=0.0):
    """Expected USD per month. cache_hit=None means no caching; otherwise the share of requests whose static
    system prompt is served from the cache (the rest pay a cache write). batch_share = share run as batch jobs."""
    total = 0.0
    for share, price in mix:
        if cache_hit is None:
            u = [(1.0, Usage(input_tokens=system + dynamic, output_tokens=output))]
        else:
            u = [(cache_hit, Usage(cache_read_tokens=system, input_tokens=dynamic, output_tokens=output)),
                 (1 - cache_hit, Usage(cache_write_tokens=system, input_tokens=dynamic, output_tokens=output))]
        per_request = sum(w * ((1 - batch_share) * cost(x, price) + batch_share * cost(x, price, batch=True)) for w, x in u)
        total += share * per_request
    return total * REQUESTS


LEVERS = [
    ("baseline (large model, verbose answers)",        {}),
    ("A  cap output: 400 -> 250 tokens",                {"output": 250}),
    ("B  trim system prompt: 2500 -> 1500 tokens",      {"system": 1500}),
    ("C  cache the static prefix, 90% hit rate",        {"cache_hit": 0.90}),
    ("D  route 70% of traffic to the small model",      {"mix": ((0.7, SMALL), (0.3, LARGE))}),
    ("E  run 25% of volume as batch jobs",              {"batch_share": 0.25}),
]
base = monthly()
print(f"{'lever':<46}{'alone USD':>12}{'saving':>8}   {'cumulative USD':>15}{'saving':>8}")
cum_args, prev = {}, base
for name, args in LEVERS:
    alone = monthly(**args)
    cum_args.update(args)
    cum = monthly(**cum_args)
    print(f"{name:<46}{alone:>12,.0f}{1 - alone / base:>8.0%}   {cum:>15,.0f}{1 - cum / base:>8.0%}")
print(f"\nper request: baseline {base / REQUESTS:.5f} USD -> all levers {cum / REQUESTS:.5f} USD")
```

```
lever                                            alone USD  saving    cumulative USD  saving
baseline (large model, verbose answers)             42,000      0%            42,000      0%
A  cap output: 400 -> 250 tokens                    37,500     11%            37,500     11%
B  trim system prompt: 2500 -> 1500 tokens          32,000     24%            27,500     35%
C  cache the static prefix, 90% hit rate            22,375     47%            15,725     63%
D  route 70% of traffic to the small model          15,540     63%             5,818     86%
E  run 25% of volume as batch jobs                  36,750     12%             5,091     88%

per request: baseline 0.04200 USD -> all levers 0.00509 USD
```

Read it for the shape, not the numbers. Output capping and prompt trimming are cheap and safe. Caching is large here because the static prefix is most of the input. Routing most traffic to a cheaper model is the biggest single lever and the only one that can hurt quality, so it needs an evaluation (module 17). Batch only helps the share of traffic that can wait. Levers overlap, so "alone" savings do not add up to "cumulative" savings.

### 3. Clocks, a token bucket and parsers

A virtual clock makes rate-limit tests instant and exact; the bucket is the refill-continuously algorithm; the parsers handle a `Retry-After` given as seconds or as an HTTP-date, durations like `6m0s`, and both header dialects from Part 3.

```python
"""ratelimit.py - clocks, a token bucket, and parsers for Retry-After and rate-limit headers. Standard library only."""
import contextlib, email.utils, json, math, random, re, threading, time
from datetime import datetime, timedelta, timezone


class FakeClock:
    """Virtual time: sleeping just advances a counter, so rate-limit tests are instant and exact."""
    def __init__(self, t=0.0): self.t = t
    def now(self): return self.t
    def sleep(self, s): self.t += max(0.0, s)


class RealClock:
    def now(self): return time.monotonic()
    def sleep(self, s): time.sleep(max(0.0, s))


class TokenBucket:
    """Refills continuously at per_minute/60 units a second up to `capacity` (the algorithm Anthropic's page says it uses)."""
    def __init__(self, capacity, per_minute, clock):
        self.capacity, self.rate, self.clock = float(capacity), per_minute / 60.0, clock
        self.level, self.last, self.lock = float(capacity), clock.now(), threading.RLock()

    def _refill(self):
        now = self.clock.now()
        self.level, self.last = min(self.capacity, self.level + (now - self.last) * self.rate), now

    def wait_for(self, n):                 # seconds until n units would be available (0 if available now)
        with self.lock:
            self._refill()
            return 0.0 if self.level >= n else (n - self.level) / self.rate

    def try_take(self, n):                 # -> (taken, seconds to wait if not)
        with self.lock:
            self._refill()
            if self.level >= n:
                self.level -= n
                return True, 0.0
            return False, (n - self.level) / self.rate

    def give_back(self, n):                # refund units that were reserved but not used
        with self.lock:
            self._refill()
            self.level = min(self.capacity, self.level + n)

    def remaining(self):
        with self.lock:
            self._refill()
            return int(self.level)

    def seconds_until_full(self):
        with self.lock:
            self._refill()
            return (self.capacity - self.level) / self.rate


WALL0 = datetime(2026, 10, 26, 12, 0, 0, tzinfo=timezone.utc)      # a fixed start so RFC 3339 resets are reproducible


def fmt_duration(seconds):                 # imitates the docs' sample values "1s" and "6m0s"
    if seconds <= 0:
        return "0s"
    if seconds < 1:
        return f"{math.ceil(seconds * 1000)}ms"
    m, s = divmod(math.ceil(seconds), 60)
    return f"{m}m{s}s" if m else f"{s}s"


# ---- client-side helpers: duration, Retry-After and header parsing --------------------------------------------------
def parse_duration(text):                  # "1s", "6m0s", "250ms" -> seconds
    units = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}
    return sum(float(num) * units[unit] for num, unit in re.findall(r"(\d+(?:\.\d+)?)(ms|h|m|s)", text))


def parse_retry_after(value, now_wall):    # RFC 9110: either delay-seconds or an HTTP-date
    if value is None:
        return None
    v = value.strip()
    if v.isdigit():
        return float(v)
    try:
        when = email.utils.parsedate_to_datetime(v)
    except (TypeError, ValueError):
        return None
    return max(0.0, (when.replace(tzinfo=when.tzinfo or timezone.utc) - now_wall).total_seconds())


def normalise_limits(h, now_wall):         # one neutral view of either header dialect (lower-case names)
    if "x-ratelimit-remaining-requests" in h:
        return {"remaining_requests": int(h["x-ratelimit-remaining-requests"]), "remaining_tokens": int(h["x-ratelimit-remaining-tokens"]),
                "reset_requests_s": parse_duration(h["x-ratelimit-reset-requests"]), "reset_tokens_s": parse_duration(h["x-ratelimit-reset-tokens"])}
    if "anthropic-ratelimit-requests-remaining" in h:
        secs = lambda k: max(0.0, (datetime.fromisoformat(h[k]) - now_wall).total_seconds())   # reads a trailing Z on Python 3.11+
        return {"remaining_requests": int(h["anthropic-ratelimit-requests-remaining"]), "remaining_tokens": int(h["anthropic-ratelimit-tokens-remaining"]),
                "reset_requests_s": secs("anthropic-ratelimit-requests-reset"), "reset_tokens_s": secs("anthropic-ratelimit-tokens-reset")}
    return {}


# ---- deterministic tests on a virtual clock -------------------------------------------------------------------------
clk = FakeClock()
b = TokenBucket(capacity=5, per_minute=60, clock=clk)                      # 1 unit per second, holds 5
assert all(b.try_take(1)[0] for _ in range(5)) and b.try_take(1) == (False, 1.0)
clk.sleep(1.0); assert b.try_take(1)[0]                                    # one second later: exactly one more
clk.sleep(1000.0); assert b.remaining() == 5                               # never above capacity
print("token bucket: 5 immediately, then 1 per second, never above capacity")
assert parse_retry_after("56", WALL0) == 56.0 and parse_retry_after("Mon, 26 Oct 2026 12:01:30 GMT", WALL0) == 90.0
assert parse_retry_after("Mon, 26 Oct 2026 11:00:00 GMT", WALL0) == 0.0 and parse_retry_after("soon", WALL0) is None
assert parse_duration("6m0s") == 360.0 and parse_duration("1s") == 1.0 and abs(parse_duration("250ms") - 0.25) < 1e-9
print("Retry-After parsed as seconds and as an HTTP-date; durations like '6m0s' parsed")
```

```
token bucket: 5 immediately, then 1 per second, never above capacity
Retry-After parsed as seconds and as an HTTP-date; durations like '6m0s' parsed
```

### 4. The stand-in: admission rule, HTTP server and transports

Plumbing, collapsed. `LimitCore` is the stand-in's admission control: a request bucket and a token bucket, headers and 429 bodies in the two documented shapes. `StandInServer` puts it behind a `ThreadingHTTPServer` on `127.0.0.1` and an ephemeral port, answers in a chat-completions shape and records the peak number of requests in flight. `ScriptedTransport` replays prepared responses for deterministic retry tests. The stand-in's token rule (prompt tokens plus `max_tokens`, refunded after the answer) is **my simplification**; as Part 2 says, the providers count differently.

<details><summary>Show the stand-in</summary>

```python
"""standin.py - a local stand-in chat server (127.0.0.1, ephemeral port) plus client transports.
It mimics the documented SHAPE of provider rate limits (header names and 429 bodies from the OpenAI and Anthropic pages,
checked Oct 2026). The model behind it is SCRIPTED (it always answers with 20 words); only the limit behaviour is real."""
import http.client
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class LimitCore:
    """The stand-in's admission control: a request bucket (RPM) and a token bucket (TPM). The token charge is estimated up
    front as prompt tokens + max_tokens and the unused part is refunded after the answer (MY simplification; see the text)."""
    def __init__(self, rpm, tpm, clock, dialect="openai", burst_s=6.0):
        self.rpm, self.tpm, self.clock, self.dialect, self.n = rpm, tpm, clock, dialect, 0
        self.req = TokenBucket(max(1.0, rpm * burst_s / 60), rpm, clock)
        self.tok = TokenBucket(tpm * burst_s / 60, tpm, clock)

    def headers(self):
        r, t = self.req, self.tok
        if self.dialect == "openai":
            return {"x-ratelimit-limit-requests": str(self.rpm), "x-ratelimit-limit-tokens": str(self.tpm),
                    "x-ratelimit-remaining-requests": str(r.remaining()), "x-ratelimit-remaining-tokens": str(t.remaining()),
                    "x-ratelimit-reset-requests": fmt_duration(r.seconds_until_full()),
                    "x-ratelimit-reset-tokens": fmt_duration(t.seconds_until_full())}
        stamp = lambda b: (WALL0 + timedelta(seconds=self.clock.now() + b.seconds_until_full())).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {"anthropic-ratelimit-requests-limit": str(self.rpm), "anthropic-ratelimit-requests-remaining": str(r.remaining()),
                "anthropic-ratelimit-requests-reset": stamp(r), "anthropic-ratelimit-tokens-limit": str(self.tpm),
                "anthropic-ratelimit-tokens-remaining": str(round(t.remaining() / 1000) * 1000),   # docs: nearest thousand
                "anthropic-ratelimit-tokens-reset": stamp(t)}

    def _error(self, message, status):
        self.n += 1
        etype = "rate_limit_error" if status == 429 else "invalid_request_error"
        if self.dialect == "openai":
            return {"error": {"message": message, "type": etype, "param": None,
                              "code": "rate_limit_exceeded" if status == 429 else "request_too_large"}}
        return {"type": "error", "error": {"type": etype, "message": message}, "request_id": f"req_stub{self.n:04d}"}

    def _reject(self, kind, wait):
        h = self.headers()
        h["retry-after"] = str(max(1, math.ceil(wait)))                 # whole seconds, as in the docs' sample ("56")
        return 429, self._error(f"Rate limit reached for {kind}. Please try again in {fmt_duration(wait)}.", 429), h

    def admit(self, prompt_tokens, max_tokens):
        """-> (status, error_body_or_None, headers, tokens_reserved)."""
        need = prompt_tokens + max_tokens
        if need > self.tok.capacity:                                   # can never succeed, so not a 'try later'
            return 400, self._error(f"Request needs {need} tokens; the window allows {int(self.tok.capacity)}.", 400), self.headers(), 0
        ok, wait = self.req.try_take(1)                                # a rejected request still uses up request allowance
        if not ok:
            return (*self._reject("requests", wait), 0)
        ok, wait = self.tok.try_take(need)
        if not ok:
            return (*self._reject("tokens", wait), 0)
        return 200, None, self.headers(), need

    def settle(self, reserved, actual_tokens):
        self.tok.give_back(max(0, reserved - actual_tokens))


@dataclass
class Response:
    status: int
    headers: dict = field(default_factory=dict)       # lower-case names
    body: dict | None = None


class StandInServer:
    """POST /v1/chat/completions in a chat-completions shape, gated by `core` (a LimitCore). Records the peak in flight."""
    def __init__(self, core, service_time=0.01):
        self.core, self.service_time = core, service_time
        self.lock, self.in_flight, self.peak, self.counts = threading.Lock(), 0, 0, {}
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass          # keep the console quiet

            def do_POST(self):
                req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
                prompt_tokens = sum(len(m["content"].split()) for m in req["messages"])
                max_tokens = req.get("max_tokens", 256)
                with outer.lock:
                    outer.in_flight += 1
                    outer.peak = max(outer.peak, outer.in_flight)
                try:
                    status, err, headers, reserved = outer.core.admit(prompt_tokens, max_tokens)
                    if status == 200:
                        time.sleep(outer.service_time)                      # pretend to generate
                        done = min(max_tokens, 20)
                        body = {"id": "chatcmpl-stub", "object": "chat.completion",
                                "choices": [{"index": 0, "message": {"role": "assistant", "content": "word " * done}, "finish_reason": "stop"}],
                                "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": done, "total_tokens": prompt_tokens + done}}
                        outer.core.settle(reserved, prompt_tokens + done)
                    else:
                        body = err
                    data = json.dumps(body).encode()
                    self.send_response(status)
                    for k, v in {**headers, "Content-Type": "application/json", "Content-Length": str(len(data))}.items():
                        self.send_header(k, v)
                    self.end_headers()
                    self.wfile.write(data)
                    with outer.lock:
                        outer.counts[status] = outer.counts.get(status, 0) + 1
                finally:
                    with outer.lock:
                        outer.in_flight -= 1

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()
        self.httpd.server_close()


class HttpTransport:
    def __init__(self, port, timeout=5.0):
        self.port, self.timeout = port, timeout

    def send(self, payload):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=self.timeout)
        try:
            conn.request("POST", "/v1/chat/completions", json.dumps(payload), {"Content-Type": "application/json"})
            r = conn.getresponse()
            raw = r.read()
            return Response(r.status, {k.lower(): v for k, v in r.getheaders()}, json.loads(raw) if raw else None)
        finally:
            conn.close()


class ScriptedTransport:
    """Replays prepared Responses (or raises prepared exceptions): deterministic retry tests with no network."""
    def __init__(self, items):
        self.items, self.calls = list(items), 0

    def send(self, payload):
        self.calls += 1
        item = self.items.pop(0)
        if isinstance(item, Exception):
            raise item
        return item
```

</details>

### 5. What the stand-in's 429s look like

```python
# What the stand-in sends. Virtual clock; request bucket holds 5, token bucket holds 500.
clk = FakeClock(); core = LimitCore(rpm=60, tpm=6000, clock=clk, burst_s=5)
print("6 requests at t=0:", [core.admit(10, 40)[0] for _ in range(6)])
status, body, headers, _ = core.admit(10, 40)
print("a 429 as the stand-in sends it (OpenAI-style dialect):")
print("  status", status, "| body:", json.dumps(body))
for k in sorted(headers):
    print(f"  {k}: {headers[k]}")
print("parsed back:", normalise_limits(headers, WALL0 + timedelta(seconds=clk.now())))

# max_tokens is part of the charge here: a big ceiling blocks the next request until the first answer settles
clk = FakeClock(); core = LimitCore(rpm=6000, tpm=6000, clock=clk, burst_s=5)
s1, _, _, reserved = core.admit(20, 400)
s2, _, h2, _ = core.admit(20, 400)
print(f"\nmax_tokens=400: first {s1}, second {s2} (Retry-After {h2['retry-after']}s); tokens left {core.tok.remaining()}")
core.settle(reserved, actual_tokens=70)                                    # the first answer really used 70 tokens
print(f"first answer settles (70 used, {reserved - 70} refunded): tokens left {core.tok.remaining()}, next request -> {core.admit(20, 400)[0]}")

clk = FakeClock(); core = LimitCore(rpm=60, tpm=6000, clock=clk, dialect="anthropic", burst_s=5)
for _ in range(6): last = core.admit(10, 40)
print("\nAnthropic-style dialect, same situation:")
print("  status", last[0], "| body:", json.dumps(last[1]))
print("  headers:", ", ".join(sorted(last[2])))
print("  reset header:", last[2]["anthropic-ratelimit-requests-reset"], "(RFC 3339)")
```

```
6 requests at t=0: [200, 200, 200, 200, 200, 429]
a 429 as the stand-in sends it (OpenAI-style dialect):
  status 429 | body: {"error": {"message": "Rate limit reached for requests. Please try again in 1s.", "type": "rate_limit_error", "param": null, "code": "rate_limit_exceeded"}}
  retry-after: 1
  x-ratelimit-limit-requests: 60
  x-ratelimit-limit-tokens: 6000
  x-ratelimit-remaining-requests: 0
  x-ratelimit-remaining-tokens: 250
  x-ratelimit-reset-requests: 5s
  x-ratelimit-reset-tokens: 3s
parsed back: {'remaining_requests': 0, 'remaining_tokens': 250, 'reset_requests_s': 5.0, 'reset_tokens_s': 3.0}

max_tokens=400: first 200, second 429 (Retry-After 4s); tokens left 80
first answer settles (70 used, 350 refunded): tokens left 430, next request -> 200

Anthropic-style dialect, same situation:
  status 429 | body: {"type": "error", "error": {"type": "rate_limit_error", "message": "Rate limit reached for requests. Please try again in 1s."}, "request_id": "req_stub0001"}
  headers: anthropic-ratelimit-requests-limit, anthropic-ratelimit-requests-remaining, anthropic-ratelimit-requests-reset, anthropic-ratelimit-tokens-limit, anthropic-ratelimit-tokens-remaining, anthropic-ratelimit-tokens-reset, retry-after
  reset header: 2026-10-26T12:00:05Z (RFC 3339)
```

Three things to notice. A request that fails on the token limit still consumed a request unit (the OpenAI guide: "unsuccessful requests contribute to your per-minute limit"). The large `max_tokens=400` blocked the second request until the first one settled and refunded what it had not used. And the same event looks different in the two dialects: durations versus RFC 3339 timestamps, a flat `error` object versus one with a `request_id`.

### 6. The client: classifier, retry policy, limiters, and the client itself

```python
"""client.py - client-side limiter, concurrency limiter, retry policy, and a client that uses them. Standard library only."""
from dataclasses import dataclass


class NonRetryable(Exception):
    def __init__(self, resp): super().__init__(f"HTTP {resp.status}: {sorted(error_markers(resp)) or 'no error code'}"); self.resp = resp

class RetryDeferred(Exception):
    def __init__(self, seconds): super().__init__(f"server asked for {seconds:.0f}s; defer the work"); self.seconds = seconds

class RetriesExhausted(Exception):
    pass

class BudgetExceeded(Exception):
    pass

class KillSwitchTripped(Exception):
    pass


# Codes the docs (OpenAI error-codes page, Anthropic rate-limits page; checked Oct 2026) say retrying cannot fix.
NON_RETRYABLE = {"credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded",
                 "organization_usage_limit_exceeded", "insufficient_quota", "enforced_spend_limit_reached"}
RETRYABLE_STATUS = {429, 500, 502, 503, 504, 529}      # 529: Anthropic's overloaded_error; 599 below = our own network-error marker


def error_markers(resp):
    """Every code-like string in the error body: error.code, error.type, error.details.error_code."""
    err = (resp.body or {}).get("error") if isinstance(resp.body, dict) else None
    if not isinstance(err, dict):
        return set()
    details = err.get("details") if isinstance(err.get("details"), dict) else {}
    return {x for x in (err.get("code"), err.get("type"), details.get("error_code")) if x}


def classify(resp):
    if 200 <= resp.status < 300:
        return "ok"
    if error_markers(resp) & NON_RETRYABLE:            # a 429 can mean "wait" or "you are out of money": look inside
        return "stop"
    return "retry" if resp.status in RETRYABLE_STATUS or resp.status == 599 else "stop"


@dataclass
class RetryPolicy:
    max_attempts: int = 5
    base: float = 0.5               # first backoff window, seconds
    cap: float = 30.0               # largest backoff window
    max_total_wait: float = 60.0    # budget for all sleeping in one call
    max_retry_after: float = 30.0   # a longer server delay is deferred to the caller, not slept through
    extra: float = 0.25             # random extra on top of Retry-After ("a small random delay")


class ClientLimiter:
    """Proactive pacing: take a request unit and an estimated-token amount before sending, so 429s are the exception."""
    def __init__(self, rpm, tpm, clock, burst_s=1.0):
        self.req = TokenBucket(max(1.0, rpm * burst_s / 60), rpm, clock)
        self.tok = TokenBucket(tpm * burst_s / 60, tpm, clock)
        self.clock, self.lock, self.waited = clock, threading.Lock(), 0.0

    def acquire(self, tokens):
        if tokens > self.tok.capacity:
            raise ValueError(f"{tokens} tokens can never fit a bucket of {int(self.tok.capacity)}")
        while True:
            with self.lock:
                wait = max(self.req.wait_for(1), self.tok.wait_for(tokens))
                if wait == 0.0:
                    self.req.try_take(1)
                    self.tok.try_take(tokens)
                    return
            self.clock.sleep(wait)
            self.waited += wait

    def refund_tokens(self, n):
        self.tok.give_back(n)


class ConcurrencyLimiter:
    """At most n requests in flight; remembers the peak so tests can check it."""
    def __init__(self, n):
        self.sem, self.lock, self.in_flight, self.peak = threading.BoundedSemaphore(n), threading.Lock(), 0, 0

    def __enter__(self):
        self.sem.acquire()
        with self.lock:
            self.in_flight += 1
            self.peak = max(self.peak, self.in_flight)

    def __exit__(self, *exc):
        with self.lock:
            self.in_flight -= 1
        self.sem.release()


@dataclass
class Result:
    text: str
    usage: dict
    attempts: int
    statuses: list
    waited: float


class LLMClient:
    def __init__(self, transport, policy=None, limiter=None, concurrency=None, budget=None, price=None,
                 sleep=time.sleep, rng=None, wall=lambda: datetime.now(timezone.utc)):
        self.transport, self.policy = transport, policy or RetryPolicy()
        self.limiter, self.concurrency, self.budget, self.price = limiter, concurrency, budget, price
        self.sleep, self.rng, self.wall = sleep, rng or random.Random(), wall

    def _delay(self, resp, attempt):
        p = self.policy
        ra = parse_retry_after(resp.headers.get("retry-after"), self.wall())
        if ra is not None:                                   # the server's hint is a MINIMUM; add a little jitter
            if ra > p.max_retry_after:
                raise RetryDeferred(ra)
            return ra + self.rng.uniform(0, p.extra)
        return self.rng.uniform(0, min(p.cap, p.base * 2 ** attempt))        # full jitter

    def chat(self, prompt, max_tokens=64, user="anon"):
        est_in = len(prompt.split())
        need = est_in + max_tokens
        if self.budget:                                      # refuse BEFORE spending anything
            self.budget.check(user, cost(Usage(input_tokens=est_in, output_tokens=max_tokens), self.price))
        payload = {"model": "stub", "messages": [{"role": "user", "content": prompt}], "max_tokens": max_tokens}
        statuses, waited = [], 0.0
        with (self.concurrency or contextlib.nullcontext()):
            for attempt in range(self.policy.max_attempts):
                if self.limiter:
                    self.limiter.acquire(need)
                try:
                    resp = self.transport.send(payload)
                except OSError as e:                         # refused, reset, timed out: transient by nature
                    resp = Response(599, {}, {"error": {"message": str(e), "type": "connection_error"}})
                statuses.append(resp.status)
                verdict = classify(resp)
                if verdict == "ok":
                    usage = resp.body["usage"]
                    if self.limiter:
                        self.limiter.refund_tokens(need - usage["total_tokens"])
                    if self.budget:
                        self.budget.record(user, cost(Usage(input_tokens=usage["prompt_tokens"],
                                                            output_tokens=usage["completion_tokens"]), self.price))
                    return Result(resp.body["choices"][0]["message"]["content"], usage, attempt + 1, statuses, waited)
                if self.limiter:
                    self.limiter.refund_tokens(need)         # nothing was generated; the request unit stays spent
                if verdict == "stop":
                    raise NonRetryable(resp)
                if attempt == self.policy.max_attempts - 1:
                    break
                delay = self._delay(resp, attempt)
                if waited + delay > self.policy.max_total_wait:
                    raise RetriesExhausted(f"next wait {delay:.1f}s would exceed the {self.policy.max_total_wait:.0f}s retry budget")
                self.sleep(delay)
                waited += delay
        raise RetriesExhausted(f"gave up after {len(statuses)} attempts: {statuses}")
```

### 7. Retry-policy tests on scripted responses

No network and no real sleeping: the client records the waits it would make. The jitter is seeded, so the numbers reproduce.

```python
# Retry-policy tests on SCRIPTED responses (no network, no real sleeping): the client records the waits it would make.
def resp(status, headers=None, error=None):
    body = {"error": error} if error else None
    return Response(status, {k.lower(): v for k, v in (headers or {}).items()}, body)

OK = Response(200, {}, {"choices": [{"message": {"content": "hi"}}], "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8}})
RATE = {"message": "Rate limit reached for requests", "type": "rate_limit_error", "code": "rate_limit_exceeded"}

def scenario(name, items, policy=None, expect=None, wall=WALL0):
    sleeps = []
    client = LLMClient(ScriptedTransport(items), policy or RetryPolicy(), sleep=sleeps.append, rng=random.Random(42), wall=lambda: wall)
    try:
        r = client.chat("hello there", max_tokens=5)
        outcome = f"ok after {r.attempts} attempt(s)"
    except (NonRetryable, RetryDeferred, RetriesExhausted) as e:
        outcome = f"{type(e).__name__}: {e}"
    print(f"{name:<49} calls={client.transport.calls}  waits={[round(s, 2) for s in sleeps]}")
    print(f"{'':<49} -> {outcome}")
    return sleeps, client.transport.calls, outcome

s, calls, _ = scenario("429 + Retry-After: 2, then success", [resp(429, {"Retry-After": "2"}, RATE), OK])
assert calls == 2 and 2.0 <= s[0] < 2.25                                   # waited the minimum, plus a little jitter
s, calls, _ = scenario("429 without Retry-After x3, then success", [resp(429, None, RATE)] * 3 + [OK])
assert calls == 4 and s[0] <= 0.5 and s[1] <= 1.0 and s[2] <= 2.0 and len(set(s)) == 3   # inside the full-jitter windows
s, calls, o = scenario("429 credit_balance_exhausted", [resp(429, None, {"message": "no credits", "type": "insufficient_quota", "code": "credit_balance_exhausted"}), OK])
assert calls == 1 and s == [] and o.startswith("NonRetryable")
s, calls, o = scenario("Anthropic-style spend-cap 429 (no retry-after)", [resp(429, None, {"type": "rate_limit_error", "message": "monthly threshold", "details": {"error_code": "enforced_spend_limit_reached"}}), OK])
assert calls == 1 and o.startswith("NonRetryable")
s, calls, _ = scenario("Retry-After as an HTTP-date (7 s ahead)", [resp(429, {"Retry-After": "Mon, 26 Oct 2026 12:00:07 GMT"}, RATE), OK])
assert 7.0 <= s[0] < 7.25
s, calls, o = scenario("Retry-After: 3600 (longer than we will wait)", [resp(429, {"Retry-After": "3600"}, RATE), OK])
assert calls == 1 and s == [] and o.startswith("RetryDeferred")
s, calls, _ = scenario("503 server_is_overloaded + Retry-After: 1", [resp(503, {"Retry-After": "1"}, {"message": "overloaded", "type": "service_unavailable_error", "code": "server_is_overloaded"}), OK])
assert calls == 2
s, calls, o = scenario("400 invalid request", [resp(400, None, {"message": "bad", "type": "invalid_request_error"}), OK])
assert calls == 1 and s == []
s, calls, _ = scenario("connection reset, then success", [ConnectionResetError("reset by peer"), OK])
assert calls == 2 and len(s) == 1
s, calls, o = scenario("always 429: attempts and total wait are capped", [resp(429, None, RATE)] * 4, RetryPolicy(max_attempts=4))
assert calls == 4 and len(s) == 3 and sum(s) <= 60 and o.startswith("RetriesExhausted")
s, calls, o = scenario("Retry-After: 20 twice, retry budget 30 s", [resp(429, {"Retry-After": "20"}, RATE)] * 3, RetryPolicy(max_total_wait=30))
assert calls == 2 and len(s) == 1 and o.startswith("RetriesExhausted")
print("\nall retry scenarios behaved as specified")
```

```
429 + Retry-After: 2, then success                calls=2  waits=[2.16]
                                                  -> ok after 2 attempt(s)
429 without Retry-After x3, then success          calls=4  waits=[0.32, 0.03, 0.55]
                                                  -> ok after 4 attempt(s)
429 credit_balance_exhausted                      calls=1  waits=[]
                                                  -> NonRetryable: HTTP 429: ['credit_balance_exhausted', 'insufficient_quota']
Anthropic-style spend-cap 429 (no retry-after)    calls=1  waits=[]
                                                  -> NonRetryable: HTTP 429: ['enforced_spend_limit_reached', 'rate_limit_error']
Retry-After as an HTTP-date (7 s ahead)           calls=2  waits=[7.16]
                                                  -> ok after 2 attempt(s)
Retry-After: 3600 (longer than we will wait)      calls=1  waits=[]
                                                  -> RetryDeferred: server asked for 3600s; defer the work
503 server_is_overloaded + Retry-After: 1         calls=2  waits=[1.16]
                                                  -> ok after 2 attempt(s)
400 invalid request                               calls=1  waits=[]
                                                  -> NonRetryable: HTTP 400: ['invalid_request_error']
connection reset, then success                    calls=2  waits=[0.32]
                                                  -> ok after 2 attempt(s)
always 429: attempts and total wait are capped    calls=4  waits=[0.32, 0.03, 0.55]
                                                  -> RetriesExhausted: gave up after 4 attempts: [429, 429, 429, 429]
Retry-After: 20 twice, retry budget 30 s          calls=2  waits=[20.16]
                                                  -> RetriesExhausted: next wait 20.0s would exceed the 30s retry budget

all retry scenarios behaved as specified
```

### 8. Budgets, alerts and a kill switch

```python
"""budget.py - spend controls in front of the client: soft alert, hard cap, per-user cap, runaway detector, kill switch."""
from collections import defaultdict


class BudgetGuard:
    def __init__(self, soft, hard, per_user, clock, alert=print, window_s=60.0, max_per_window=None):
        self.soft, self.hard, self.per_user, self.clock, self.alert = soft, hard, per_user, clock, alert
        self.window_s, self.max_per_window = window_s, max_per_window
        self.spent, self.by_user, self.recent = 0.0, defaultdict(float), []          # recent = [(time, amount)]
        self.soft_fired, self.killed, self.reason, self.lock = False, False, "", threading.Lock()

    def check(self, user, projected):
        """Call BEFORE sending: refuse work that would cross a limit, and any work once the kill switch is tripped."""
        with self.lock:
            if self.killed:
                raise KillSwitchTripped(self.reason)
            if self.spent + projected > self.hard:
                raise BudgetExceeded(f"hard cap {self.hard} would be exceeded (spent {self.spent:.4f}, this call ~{projected:.4f})")
            if self.by_user[user] + projected > self.per_user:
                raise BudgetExceeded(f"user '{user}' would exceed their cap of {self.per_user}")

    def record(self, user, amount):
        """Call AFTER a response, with the real cost from the usage object."""
        with self.lock:
            now = self.clock.now()
            self.spent += amount
            self.by_user[user] += amount
            self.recent = [(t, a) for t, a in self.recent + [(now, amount)] if t >= now - self.window_s]
            if not self.soft_fired and self.spent >= self.soft:
                self.soft_fired = True
                self.alert(f"ALERT soft limit {self.soft} crossed (spent {self.spent:.4f})")
            if self.max_per_window and sum(a for _, a in self.recent) > self.max_per_window:
                self._trip(f"runaway spend: more than {self.max_per_window} in {self.window_s:.0f}s")

    def _trip(self, reason):
        if not self.killed:
            self.killed, self.reason = True, reason
            self.alert(f"KILL SWITCH {reason}")

    def trip(self, reason="manual"):          # an operator (or an alert handler) can pull it by hand
        with self.lock:
            self._trip(reason)

    def reset(self):
        with self.lock:
            self.killed, self.reason = False, ""


def refused(fn, *args):                       # True if the call raised a budget error
    try:
        fn(*args)
        return False
    except (BudgetExceeded, KillSwitchTripped):
        return True


alerts, clk = [], FakeClock()
guard = BudgetGuard(soft=0.50, hard=1.00, per_user=0.40, clock=clk, alert=alerts.append, window_s=60, max_per_window=0.60)
for _ in range(6):                            # alice spends 0.10 every 30 s; the soft alert fires exactly once
    guard.record("alice", 0.10)
    clk.sleep(30)
assert len(alerts) == 1 and alerts[0].startswith("ALERT soft limit")
print("alice blocked at her per-user cap:", refused(guard.check, "alice", 0.05), "| bob still allowed:", not refused(guard.check, "bob", 0.05))
print("hard cap refuses a 0.50 call when 0.60 is spent:", refused(guard.check, "bob", 0.50))

loop = BudgetGuard(soft=5, hard=10, per_user=10, clock=FakeClock(), alert=alerts.append, window_s=60, max_per_window=0.60)
for _ in range(7):                            # 0.70 inside one minute: a runaway loop
    loop.record("agent", 0.10)
print("runaway loop tripped the kill switch:", refused(loop.check, "anyone", 0.01))
loop.reset()
print("after reset the guard allows calls again:", not refused(loop.check, "anyone", 0.01))
loop.trip("operator pressed the button")
print("alerts raised:")
for a in alerts:
    print("  ", a)

# wired into the client: the cap is enforced BEFORE any request is sent
tight = BudgetGuard(soft=0.5, hard=0.0006, per_user=1, clock=FakeClock(), alert=lambda m: None)
transport = ScriptedTransport([OK] * 10)
client = LLMClient(transport, budget=tight, price=Price(input_per_m=10.0, output_per_m=30.0), sleep=lambda s: None)
done = 0
try:
    for _ in range(10):                       # each scripted call really costs 3 x 10/1e6 + 5 x 30/1e6 = 0.00018
        client.chat("hello there", max_tokens=5)
        done += 1
except BudgetExceeded:
    print(f"\nbudget stopped the loop after {done} calls; requests actually sent: {transport.calls}")
```

```
alice blocked at her per-user cap: True | bob still allowed: True
hard cap refuses a 0.50 call when 0.60 is spent: True
runaway loop tripped the kill switch: True
after reset the guard allows calls again: True
alerts raised:
   ALERT soft limit 0.5 crossed (spent 0.5000)
   KILL SWITCH runaway spend: more than 0.6 in 60s
   KILL SWITCH operator pressed the button

budget stopped the loop after 3 calls; requests actually sent: 3
```

### 9. End to end over real HTTP: three client designs

120 requests from 8 worker threads against the stand-in (50 requests per second, bucket of 50). Real sockets and real sleeping, so timings vary by machine and the script prints only invariants that hold on any reasonable machine (run six times while writing this module with identical output; the run takes about 8 seconds).

```python
# End to end over real HTTP against the local stand-in: 120 requests from 8 worker threads, three client designs.
# Wall-clock timing varies by machine, so only invariants are printed (all of them hold on any reasonable machine).
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

N, THREADS, PROMPT = 120, 8, " ".join(["word"] * 10)


def run(make_client):
    core = LimitCore(rpm=3000, tpm=300_000, clock=RealClock(), burst_s=1.0)        # 50 requests/s, bucket holds 50
    with StandInServer(core, service_time=0.01) as server:
        client = make_client(HttpTransport(server.port))

        def one(_):
            try:
                client.chat(PROMPT, max_tokens=30)
                return "ok"
            except (NonRetryable, RetriesExhausted) as e:
                return type(e).__name__

        with ThreadPoolExecutor(THREADS) as pool:
            outcomes = Counter(pool.map(one, range(N)))
        return outcomes, dict(server.counts), server.peak


naive = run(lambda t: LLMClient(t, RetryPolicy(max_attempts=1)))
retry_only = run(lambda t: LLMClient(t, RetryPolicy(max_attempts=8), rng=random.Random(1)))
conc = ConcurrencyLimiter(4)
disciplined = run(lambda t: LLMClient(t, RetryPolicy(), rng=random.Random(1), concurrency=conc,
                                      limiter=ClientLimiter(rpm=1800, tpm=180_000, clock=RealClock(), burst_s=1.0)))

(o, c, peak) = naive
print("A. no limiter, no retries:        server rejected some requests:", c.get(429, 0) > 0,
      "| every request accounted for:", sum(o.values()) == N, "| some failed for good:", o.get("ok", 0) < N)
(o, c, peak) = retry_only
print("B. retries honouring Retry-After: all", N, "eventually succeeded:", o == {"ok": N},
      "| but wasted attempts hit the server:", c.get(429, 0) > 0)
(o, c, peak) = disciplined
print("C. limiter + 4 concurrent + retry: all", N, "succeeded:", o == {"ok": N},
      "| server rejected nothing:", c.get(429, 0) == 0, "| server saw exactly", N, "requests:", c.get(200, 0) == N,
      "| peak in flight <= 4:", conc.peak <= 4)
```

```
A. no limiter, no retries:        server rejected some requests: True | every request accounted for: True | some failed for good: True
B. retries honouring Retry-After: all 120 eventually succeeded: True | but wasted attempts hit the server: True
C. limiter + 4 concurrent + retry: all 120 succeeded: True | server rejected nothing: True | server saw exactly 120 requests: True | peak in flight <= 4: True
```

The designs, in words. A: no pacing and no retries, so the bucket empties in the first tenth of a second and most requests fail for good. B: retries that honour `Retry-After` finish everything, but they got there by sending requests the server had to reject; the rejected ones counted against the request limit. C: pacing at 60% of the limit with four requests in flight never exceeded the limit, so the server rejected nothing and saw exactly the 120 requests that were needed.

### Using the real SDKs (NOT EXECUTED)

None of this was executed: it needs the package and an API key. Both official Python SDKs retry some errors on their own, which is why Part 3 says to disable or account for that. Check each SDK's current documentation for the exact option names before relying on this.

```python
# NOT EXECUTED (needs the package and an API key). Pattern only: take over retries so there is one retry loop, not two.
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=0)   # the SDK documents a max_retries option
# ... then call client.responses.create(...) or client.chat.completions.create(...) inside LLMClient's transport,
# translating the SDK's rate-limit error (and its response headers) into the Response objects used above.
```

## Visual diagram

```
  one call through the stack (blocks 6 to 9)

  app ──► BudgetGuard.check ──► ConcurrencyLimiter ──► ClientLimiter (RPM bucket + TPM bucket) ──► HTTP ──► provider
            │ over a cap?           │ N in flight           │ wait until both buckets have room            │
            └─► BudgetExceeded      └─ others queue         └─ sleeps exactly as long as needed            │
                KillSwitchTripped                                                                          ▼
                                                                                              status, headers, body
  ◄── result ◄── BudgetGuard.record(real cost from `usage`) ◄── 200 ◄──────────────────────────────────────┤
                                                                                                            │
                                    classify(status + body codes)                                           │
        ┌────────────────────────────────────────────────────┬──────────────────────────────────────────────┘
        ▼                                                    ▼
   RETRY: 429 rate limit, 503, 529, 5xx, network      STOP:  400/401, 429 + credit_balance_exhausted,
        │                                                     *_spend_limit_exceeded, enforced_spend_limit_reached
        ▼
   Retry-After present and <= max?  ──yes──► wait Retry-After + small jitter
        │ no header                   └─no (e.g. 3600 s)──► RetryDeferred (give the work back to the caller)
        ▼
   wait uniform(0, min(cap, base x 2^attempt))   (full jitter)
        └─► give up (RetriesExhausted) after max attempts or when total wait would exceed the retry budget


  a token bucket (continuous refill)

   capacity ┤▇▇▇▇▇▇▇▇▇▇        level drops by the request cost, refills at `rate`/s:
            │▇▇▇▇▇▇                  request ok     -> take n, send
            │▇▇▇            ──►      not enough     -> wait (n - level) / rate, or 429 with Retry-After
          0 ┴───────────► time     idle for a while -> back to full, never above capacity
```

## Practice

### 1. Which cache lifetime for which traffic pattern?

A reused 8,000-token prefix; illustrative multipliers: a short (5-minute) lifetime writes at x1.25, a long (60-minute) lifetime writes at x2.0, reads cost x0.10 either way. A hit refreshes the lifetime (an assumption). For gaps of 1, 4, 10, 30 and 90 minutes between requests, which option is cheapest per request?

<details><summary>Answer</summary>

```python
# Exercise 1: cache lifetime vs request spacing. A reused 8,000-token prefix; ILLUSTRATIVE multipliers:
# short lifetime (5 min) writes at x1.25, long lifetime (60 min) writes at x2.0, reads at x0.10 for both.
# ASSUMPTION: a hit refreshes the lifetime, so a steady stream of requests spaced under the lifetime keeps hitting.
PREFIX = 8000
SHORT, LONG = replace(LARGE, cache_write_mult=1.25), replace(LARGE, cache_write_mult=2.0)

def per_request(gap_min, lifetime_min, price):
    if gap_min < lifetime_min:                                   # steady state: every request is a cache read
        return cost(Usage(cache_read_tokens=PREFIX), price)
    return cost(Usage(cache_write_tokens=PREFIX), price)         # entry expired before the next request: pay the write again

none = cost(Usage(input_tokens=PREFIX), LARGE)
print("milli-USD per request (a tie goes to the first column named)")
print(f"{'gap between requests':>21} {'no cache':>9} {'5-min cache':>12} {'60-min cache':>13}   cheapest")
for gap in (1, 4, 10, 30, 90):
    row = {"no cache": none, "5-min": per_request(gap, 5, SHORT), "60-min": per_request(gap, 60, LONG)}
    print(f"{gap:>18} min {none * 1000:>9.2f} {row['5-min'] * 1000:>12.2f} {row['60-min'] * 1000:>13.2f}   {min(row, key=row.get)}")
```

```
milli-USD per request (a tie goes to the first column named)
 gap between requests  no cache  5-min cache  60-min cache   cheapest
                 1 min     80.00         8.00          8.00   5-min
                 4 min     80.00         8.00          8.00   5-min
                10 min     80.00       100.00          8.00   60-min
                30 min     80.00       100.00          8.00   60-min
                90 min     80.00       100.00        160.00   no cache
```

If the gap is shorter than a lifetime, every request after the first is a cheap read; if the entry expires between requests, each request pays the write premium again, which can cost more than not caching at all (the 5-minute column at 10 minutes: 100 against 80). The dearer, longer lifetime wins at 10 and 30 minutes and loses at 90, where it never hits and writes at x2.0. With the real multipliers from the provider's page, the same code answers the question for your traffic.

</details>

### 2. Predict the time, then run it

(a) A client limited to 60 requests per minute with a bucket of 10 sends 100 small requests. (b) A client limited to 6,000 tokens per minute (bucket of 600) sends 100 requests of 300 tokens each. Predict how long each takes, then run it on the virtual clock.

<details><summary>Answer</summary>

```python
# Exercise 2: predict the time, then run it on the virtual clock.
# (a) 60 RPM, bucket of 10 requests, 100 requests of 40 tokens: burst of 10, then 1 per second.
# (b) same, but the TOKEN limit binds: 6,000 tokens/min (bucket of 600), each request 300 tokens -> 20 requests/min.
for label, rpm, tpm, burst, need in (("(a) request limit binds", 60, 600_000, 10, 40), ("(b) token limit binds  ", 600, 6_000, 6, 300)):
    clk = FakeClock()
    lim = ClientLimiter(rpm=rpm, tpm=tpm, clock=clk, burst_s=burst)
    for _ in range(100):
        lim.acquire(need)
    print(f"{label}: 100 requests took {clk.now():6.1f} virtual seconds")
```

```
(a) request limit binds: 100 requests took   90.0 virtual seconds
(b) token limit binds  : 100 requests took  294.0 virtual seconds
```

(a) The first 10 go immediately, then one per second: 90 seconds. (b) 6,000 tokens a minute is 100 tokens a second, so a 300-token request needs 3 seconds of refill; the bucket covers the first 2 for free and the other 98 take 3 seconds each: 294 seconds. The binding limit is whichever resource runs out first, which is OpenAI's "depending on what occurs first".

</details>

### 3. Retry or stop?

Which of these should the client retry? Check your answers against `classify`.

<details><summary>Answer</summary>

```python
# Exercise 3: should each response be retried?
cases = [
    ("429, plain rate limit",           resp(429, {"Retry-After": "3"}, RATE)),
    ("429, credit balance exhausted",   resp(429, None, {"type": "insufficient_quota", "code": "credit_balance_exhausted", "message": "x"})),
    ("429, ramp-rate slow_down",        resp(429, {"Retry-After": "5"}, {"type": "rate_limit_error", "code": "slow_down", "message": "x"})),
    ("429, monthly spend cap (Anthropic shape)", resp(429, None, {"type": "rate_limit_error", "message": "x", "details": {"error_code": "enforced_spend_limit_reached"}})),
    ("503, server_is_overloaded",       resp(503, {"Retry-After": "2"}, {"type": "service_unavailable_error", "code": "server_is_overloaded", "message": "x"})),
    ("529, overloaded_error",           resp(529, None, {"type": "overloaded_error", "message": "x"})),
    ("400, user-set spend limit reached", resp(400, None, {"type": "invalid_request_error", "message": "You have reached your specified API usage limits"})),
    ("401, bad key",                    resp(401, None, {"type": "authentication_error", "message": "x"})),
]
for name, r in cases:
    print(f"{name:<44} -> {classify(r)}")
```

```
429, plain rate limit                        -> retry
429, credit balance exhausted                -> stop
429, ramp-rate slow_down                     -> retry
429, monthly spend cap (Anthropic shape)     -> stop
503, server_is_overloaded                    -> retry
529, overloaded_error                        -> retry
400, user-set spend limit reached            -> stop
401, bad key                                 -> stop
```

The three spend-cap cases look different on the wire (429 with a billing code, 429 with Anthropic's detail code and no `Retry-After`, and a 400) and all mean "a human must act". Only the throttles and overloads are worth waiting for. Unknown cases deserve a decision too: this classifier retries only statuses it has been told are transient, and stops on everything else.

</details>

### Checkpoint quiz

1. List the token lines and the unit lines of a request's cost, and say which line a hidden reasoning token falls in.
2. Why can a prompt-caching write make the first request more expensive, and how does the break-even calculation work?
3. A provider documents "60 requests per minute". Why can you still get a 429 if you send 20 requests in the first second?
4. What is the difference between `Retry-After` as seconds and as an HTTP-date, and what does the client do with it?
5. Name two 429s that must not be retried and how you recognise them.
6. Why should your own budget guard refuse a call before sending it instead of relying on the provider's hard limit?
7. What is the cost of retrying on a timeout that happened after the server started generating?

<details><summary>Answers</summary>

1. Token lines: uncached input, cache reads, cache writes, output; unit lines: images, audio, tool calls, storage and so on. A hidden reasoning token is billed as an output token (OpenAI's reasoning guide; Gemini's table says its output price includes thinking tokens).
2. Writing a prefix to the cache costs a premium over normal input on the models whose pages show a write price; subsequent reads cost a fraction. The break-even is the smallest `n` for which `write + (n - 1) x read < n` in units of the prefix's normal input cost.
3. Limits are token buckets enforced over short windows; a per-minute rate may be applied as a per-second rate (Anthropic's page says so), so a burst can exceed it.
4. Both are valid under RFC 9110. Seconds is a delay from now; an HTTP-date is an absolute time, so the delay is the date minus the current time (never negative). The client treats it as a minimum wait, adds a little jitter, and defers the work if it is longer than the client is willing to wait.
5. A 429 whose body carries a billing, spend or usage code (`credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded`, `enforced_spend_limit_reached`, or error type `insufficient_quota`); the Anthropic spend-cap 429 also has no `retry-after` header.
6. The provider's limit is monthly and coarse and it fails by erroring in production, after the money is spent; your guard sees per-user and per-window spend and acts before the request leaves.
7. Possibly paying twice: a timeout does not prove the server did no work. I did not find an idempotency mechanism in the pages read for this module, so budget for the duplicate and keep timeouts generous for long generations.

</details>

> [!check]
> - I can write the cost of a request as token lines plus unit lines and say what changes with caching, batch and reasoning.
> - I can name the rate-limit units and the header names in the OpenAI and Anthropic docs, and say how they differ.
> - I can say which 429s to retry and which to stop on, and why.
> - I can describe a token bucket, a concurrency limiter and a retry policy that honours `Retry-After` and caps attempts and total waiting.
> - I can describe a budget guard with a soft limit, a hard cap, per-user caps and a kill switch.
> - I can rank cost levers for a given workload and say which one needs an evaluation.

## Project

Build `budgeted_client.py`: a drop-in wrapper around any provider call that adds a cost meter, a pacing limiter and a budget guard, and a load-test harness that proves it works. Requirements: a price table loaded from a dated configuration file (no prices in code) with a test that fails for a model with no entry; pacing that adapts to the `remaining` and `reset` headers when they are present and falls back to configured limits when they are not; a per-tenant budget that survives a restart (persist it); a kill switch with an operator command to reset it; and a shared limiter that works across several worker processes on one machine (design the sharing mechanism yourself). Write the harness against a stand-in server you build with `http.server`, extended to return the documented-shape billing 429s, 503 overloads with `Retry-After`, and 429s that carry none. Tests to write: a hand-computed bill that matches to the cent; a proof that no request is sent after the cap; a proof that a billing 429 is never retried; a proof that total waiting stays under your retry budget in a sustained outage; and a measurement of how many rejected attempts your design causes compared with retries-only at three offered loads. Finish with a one-page runbook: what an on-call engineer does when the soft alert fires, when the kill switch trips, and when the provider changes a header. No code is given.

## Interview questions

> [!interview] Your service starts returning 429s from the LLM provider during a traffic spike. Walk me through what you check and what the client should do.

<details><summary>What a strong answer covers</summary>

- First classifies the 429: plain rate limit, ramp-rate, or a billing/spend/usage cap (read the error code and whether `Retry-After` is present). Billing caps are not retryable and need a human.
- For plain limits: honour `Retry-After` as a minimum with jitter, cap attempts and total wait, avoid nested SDK and application retry loops, and know that failed requests still count against the limit.
- Looks at which resource is binding (requests, input tokens, output tokens) from the headers and the dashboard, and whether `max_tokens` or large prompts are inflating the token count.
- Fixes the cause rather than the symptom: client-side token bucket and concurrency cap below the limit, a queue with backpressure, batch for non-urgent work, ramping traffic gradually, requesting a tier increase.
- Mentions fallbacks (another model or provider, degraded answers) and alerting on 429 rate.

</details>

> [!interview] Our LLM bill doubled this month and nobody changed the code. How do you find out why, and how do you prevent a repeat?

<details><summary>What a strong answer covers</summary>

- Breaks cost down by line (input, cached, output, reasoning, tools) and by model, feature and tenant, using the usage objects logged per call, and compares token counts per request over time.
- Likely causes: a longer prompt or retrieval depth, a model or tokenizer change, a cache that stopped hitting (prefix changed), reasoning effort or output length growth, a retry storm, a runaway agent loop, traffic growth.
- Prevention: per-call usage logging, budgets with soft alerts and hard caps per tenant, a runaway detector with a kill switch, cost-per-task dashboards, tests that check cache hit rate and tokens per request, and a review step for prompt changes.

</details>

> [!interview] Design a rate limiter for an internal service that fronts a shared LLM API key used by many teams.

<details><summary>What a strong answer covers</summary>

- Token bucket per team for requests and for estimated tokens, refilled continuously, with a burst allowance, enforced centrally (for example in a shared store) so it works across instances; global limit below the provider's.
- Fair sharing and priorities (interactive before batch), concurrency caps, and a queue with timeouts so overload becomes a visible, bounded delay.
- Estimation and settlement: reserve estimated tokens at admission, refund on completion, and note that providers count tokens differently, so verify against the headers.
- Returns the same signals it consumes: 429 with `Retry-After` to its own clients, and its own budget and kill switch per team.
- Observability: per-team usage, rejection rate, wait time, and alerts before the provider's limits are reached.

</details>

## Common mistakes & troubleshooting

- **Retry storms after a billing or spend cap.** The client retries a 429 that cannot succeed (Part 3). Classify by body code, stop on the billing codes, and alert a human.
- **Two retry loops multiplying traffic.** The SDK retries and so does your wrapper. Disable one or count both against the same limits.
- **429s even though you "stay under the limit".** A per-minute limit enforced per second, tokens counted by `max_tokens` on some providers, ramp-rate limits, or another service sharing the key or project. Check which resource the headers show running out and who else uses the key.
- **Sleeping exactly `Retry-After` and everyone retries together.** Add jitter. `Retry-After` is a minimum.
- **Parsing `Retry-After` as an integer only.** RFC 9110 allows an HTTP-date; a naive `int()` crashes or falls back to zero waiting.
- **Costs drift from the invoice.** Prices changed, a billed line (cache write, tool call, reasoning token) is missing from your estimator, the tokenizer differs, or batch/regional modifiers apply. Reconcile against the usage dashboard and keep prices in dated configuration.
- **A budget that only alerts.** An alert at 80% of a monthly cap does not stop a loop that burns the rest in an hour. Add a short-window runaway detector and a kill switch.
- **Timeouts that double-spend.** The client gave up and retried while the server was still generating. Set timeouts for the longest legitimate generation, prefer streaming for long outputs, and count retried work in your cost estimates.

## Further reading & sources

- [Rate limits | OpenAI API](https://developers.openai.com/api/docs/guides/rate-limits) - the source for OpenAI's units, `x-ratelimit-*` headers, `Retry-After` handling, `slow_down` ramp rule, spend alert versus hard limit, and the retry guidance this module's client follows.
- [Pricing | OpenAI API](https://developers.openai.com/api/docs/pricing) - the structure of per-token, cached-input, batch, tool and fine-tuning pricing; read it for current numbers, which this module deliberately omits.
- [Rate limits - Claude Platform Docs](https://platform.claude.com/docs/en/api/rate-limits) - Anthropic's token-bucket statement, RPM/ITPM/OTPM, `anthropic-ratelimit-*` headers, spend caps and the 429 that carries no `retry-after`.
- [Pricing - Claude Platform Docs](https://platform.claude.com/docs/en/about-claude/pricing) - Anthropic's cache write and read pricing, batch discount, tool and data-residency modifiers, and the tokenizer note.
- [Rate limits | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/rate-limits) - Gemini's RPM/TPM/RPD, per-project scope, usage tiers and spend-based limits returning `429 RESOURCE_EXHAUSTED`.
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585) - defines status 429 Too Many Requests and its optional `Retry-After`.
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) - section 10.2.3 defines `Retry-After` as delay-seconds or an HTTP-date.
- [RateLimit header fields for HTTP (Internet-Draft)](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) - the in-progress IETF work on standard `RateLimit` and `RateLimit-Policy` headers, to compare with the providers' own header names.

## Next

[Module 17: Provider Abstraction and Model Routing](../17-provider-abstraction-and-model-routing/README.md)
