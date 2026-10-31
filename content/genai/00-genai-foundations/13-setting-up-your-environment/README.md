# Module 13: Setting Up Your Environment

## Why this matters

Every remaining track in this curriculum assumes a working Python
environment with API access. This module builds it once, properly, with
two things most tutorials skip and both of which will bite you:

- **Cost guardrails.** An agent loop (track 10) with a bug can burn
  through real money while you're at lunch. A runaway `while` loop
  calling a frontier model is the single most common expensive mistake
  in this field. You will set hard limits *before* you write your first
  loop.
- **Secret hygiene.** Committing an API key to a public repo gets it
  scraped and used within minutes — this is automated, not theoretical.

There's also a practical point: you can do most of this curriculum for
**under $10 total**, and several tracks for free, if you set up
local models alongside the paid APIs. This module shows both paths.

## Concepts

### What you actually need

```
 ┌──────────────────────────────────────────────────────────┐
 │  REQUIRED                                                │
 │   Python 3.10+          (3.11 or 3.12 recommended)       │
 │   a virtual environment  -- per project, always          │
 │   one LLM API key        -- OpenAI or Anthropic          │
 │   .env + .gitignore      -- secrets never in code        │
 ├──────────────────────────────────────────────────────────┤
 │  STRONGLY RECOMMENDED                                    │
 │   a spend limit set in the provider dashboard            │
 │   Ollama                 -- free local models            │
 │   Jupyter or a REPL      -- fast iteration               │
 ├──────────────────────────────────────────────────────────┤
 │  NOT NEEDED YET                                          │
 │   a GPU                  -- tracks 04/05/14 only, and    │
 │                             rentable by the hour         │
 │   a vector database      -- track 08 installs one        │
 │   LangChain              -- track 11; don't install now  │
 └──────────────────────────────────────────────────────────┘
```

That last box matters. Installing a framework before you need it is how
people end up debugging LangChain when they meant to learn LLMs.

### The cost model, so nothing surprises you

Pricing changes constantly; the *shape* doesn't. Two facts to internalize
(from module 08):

1. **Output tokens cost more than input tokens** — typically 3-5x —
   because each output token needs its own forward pass (decode) while
   the prompt is processed in one parallel pass (prefill).
2. **Small models are 10-50x cheaper than frontier models** and are
   entirely adequate for most exercises in this curriculum.

```
 A ROUGH SENSE OF SCALE (order of magnitude, not current prices)

 small model    ~$0.15 / 1M input tokens    ~$0.60 / 1M output
 frontier model ~$3-15 / 1M input tokens    ~$15-75 / 1M output

 one exercise in this curriculum ≈ 1,000 in + 300 out tokens
   on a small model    ≈ $0.0004      (2,500 exercises per $1)
   on a frontier model ≈ $0.008       (125 exercises per $1)

 ► default to the small model for learning.
   reach for frontier only when comparing quality.
```

### The three guardrails, in order of importance

```
 1. PROVIDER-SIDE HARD LIMIT      ◄── do this first, in the dashboard
    a monthly cap the provider enforces.
    the ONLY one that survives your own buggy code.

 2. CLIENT-SIDE BUDGET TRACKER
    count tokens per run; raise/exit past a threshold.
    catches runaway loops before the monthly cap does.

 3. max_tokens ON EVERY CALL
    bounds the cost of any single request.
```

Guardrail 1 is non-negotiable and takes two minutes. Do it before your
first API call, not after your first surprise bill.

### Local models: the free path

Ollama runs open-weight models on your own machine — no API key, no cost,
no rate limits, and it exposes an **OpenAI-compatible endpoint**, so the
same code works against both.

```
 tradeoffs

 API (OpenAI/Anthropic)          LOCAL (Ollama)
 ──────────────────────          ──────────────
 ✓ frontier quality              ✓ free, unlimited
 ✓ no hardware needed            ✓ private -- data never leaves
 ✓ fast                          ✓ works offline
 ✗ costs money                   ✗ noticeably weaker models
 ✗ data leaves your machine      ✗ slow on CPU
 ✗ rate limits                   ✗ needs ~8GB RAM for a 7B model

 use BOTH: iterate locally, verify on the API.
```

A 7-8B local model is genuinely fine for tracks 01-03 and much of 07-09.
It will not be fine for complex agent reasoning (tracks 10-12), where
the quality gap is largest.

### Secret hygiene

```
 project/
 ├── .env              ◄── your keys live here.   NEVER COMMITTED.
 ├── .env.example      ◄── same keys, empty values. Committed.
 ├── .gitignore        ◄── contains ".env"
 └── code.py           ◄── reads os.environ, never a literal key

 THE RULE: if a key has ever been committed -- even in a commit you
 amended away -- it is compromised. Rotate it, don't hide it.
 Git history is not a secret store, and public repos are scraped
 by bots continuously.
```

## Reference

| Task | Command |
|---|---|
| Check Python version | `python --version` |
| Create a venv | `python -m venv .venv` |
| Activate (macOS/Linux) | `source .venv/bin/activate` |
| Activate (Windows) | `.venv\Scripts\activate` |
| Install core packages | `pip install openai anthropic python-dotenv tiktoken` |
| Freeze dependencies | `pip freeze > requirements.txt` |
| Install Ollama model | `ollama pull llama3.1:8b` |
| Run a local model | `ollama run llama3.1:8b` |
| Serve Ollama's API | `ollama serve` (usually automatic) |

| Environment variable | Used for |
|---|---|
| `OPENAI_API_KEY` | OpenAI SDK, picked up automatically |
| `ANTHROPIC_API_KEY` | Anthropic SDK, picked up automatically |
| `OPENAI_BASE_URL` | Point the OpenAI SDK at Ollama or another provider |

## Hands-on exercises

### 1. Create the project skeleton

```bash
mkdir genai-practice && cd genai-practice
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install openai anthropic python-dotenv tiktoken

printf '.env\n.venv/\n__pycache__/\n*.pyc\n' > .gitignore
printf 'OPENAI_API_KEY=\nANTHROPIC_API_KEY=\n' > .env.example
cp .env.example .env               # now edit .env and paste your key

git init && git add . && git status
```

Look carefully at that final `git status`. **Confirm `.env` is not
listed.** If it is, your `.gitignore` isn't working and you must fix it
before committing anything.

### 2. Set the provider-side spend limit

Go to your provider's dashboard and set a hard monthly cap — $5 or $10 is
ample for this curriculum.

- OpenAI: Settings → Limits → set a hard limit
- Anthropic: Settings → Limits → set a monthly spend cap

This is the only guardrail that survives your own bugs. Do it now, then
write down the limit you set.

### 3. Your first API call

```python
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI()                       # reads OPENAI_API_KEY

resp = client.chat.completions.create(
    model="gpt-4o-mini",                # small + cheap: the default for learning
    messages=[{"role": "user", "content": "Reply with exactly: setup works"}],
    max_tokens=10,                      # guardrail 3, on every call
    temperature=0,
)

print(resp.choices[0].message.content)
print(f"tokens: {resp.usage.prompt_tokens} in, "
      f"{resp.usage.completion_tokens} out")
```

Note `resp.usage` — every response reports its token counts. That's what
makes exercise 5's budget tracker possible.

### 4. Install Ollama and run the same code against it

```bash
# install from https://ollama.com, then:
ollama pull llama3.1:8b        # ~4.7GB
ollama run llama3.1:8b         # interactive; /bye to exit
```

Now the useful part — the *same code*, no API key, no cost:

```python
from openai import OpenAI

local = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

resp = local.chat.completions.create(
    model="llama3.1:8b",
    messages=[{"role": "user", "content": "Reply with exactly: local works"}],
    max_tokens=10,
    temperature=0,
)
print(resp.choices[0].message.content)
```

Only `base_url` and `model` changed. Write one sentence on why an
OpenAI-compatible endpoint is more useful than a bespoke local API.

### 5. Build the budget tracker

```python
import tiktoken
from openai import OpenAI

PRICES = {  # $ per token -- update to current rates
    "gpt-4o-mini": {"in": 0.15 / 1e6, "out": 0.60 / 1e6},
    "gpt-4o":      {"in": 2.50 / 1e6, "out": 10.00 / 1e6},
}

class Budget:
    def __init__(self, limit_usd):
        self.limit, self.spent, self.calls = limit_usd, 0.0, 0

    def record(self, model, usage):
        p = PRICES[model]
        cost = usage.prompt_tokens * p["in"] + usage.completion_tokens * p["out"]
        self.spent += cost
        self.calls += 1
        if self.spent > self.limit:
            raise RuntimeError(
                f"budget exceeded: ${self.spent:.4f} > ${self.limit:.2f} "
                f"after {self.calls} calls")
        return cost

budget = Budget(limit_usd=0.50)
client = OpenAI()

def ask(prompt, model="gpt-4o-mini", **kw):
    r = client.chat.completions.create(
        model=model, messages=[{"role": "user", "content": prompt}],
        max_tokens=kw.pop("max_tokens", 200), **kw)
    cost = budget.record(model, r.usage)
    print(f"  [${cost:.6f} | total ${budget.spent:.4f} | call {budget.calls}]")
    return r.choices[0].message.content

print(ask("Name three primary colours."))
print(ask("Name three secondary colours."))
```

Now test that the guardrail actually fires: set `limit_usd=0.000001` and
confirm it raises. **A guardrail you haven't seen trigger is not a
guardrail** — this is the same discipline as testing your backups.

### 6. Count tokens before you send them

```python
import tiktoken

enc = tiktoken.encoding_for_model("gpt-4o-mini")

def estimate(prompt, max_out=300, model="gpt-4o-mini"):
    n_in = len(enc.encode(prompt))
    p = PRICES[model]
    return n_in, n_in * p["in"] + max_out * p["out"]

long_prompt = "Summarize the following:\n" + ("lorem ipsum dolor sit " * 500)
n, cost = estimate(long_prompt)
print(f"{n} input tokens, worst-case cost ${cost:.5f}")
print(f"1,000 such requests: ${cost*1000:.2f}")
```

This is track 01's tokenizer put to practical use. Always estimate before
running anything in a loop over a dataset.

### 7. Diagnose and fix: the leaked key

A colleague pushed a commit containing `OPENAI_API_KEY = "sk-proj-..."`.
They notice an hour later and push a follow-up commit removing the line.
They ask if that's sufficient.

<details><summary>Answer</summary>

No. The key remains in git history — `git log -p` reveals it, and if the
repo is public, automated scrapers monitoring GitHub's event firehose
have very likely already found and used it. Minutes matter; an hour is a
long time.

Correct response, in order:

1. **Revoke the key immediately** in the provider dashboard. This is the
   only step that actually stops the exposure. Everything else is
   cleanup.
2. Issue a new key; put it in `.env`; confirm `.env` is gitignored.
3. Check the provider's usage dashboard for unexpected activity.
4. Optionally scrub history (`git filter-repo`, or BFG) — but treat this
   as tidying, not remediation, since forks and clones may already exist.

The general principle: **a committed secret is a compromised secret.**
Rotate first, clean up second.
</details>

## Independent challenge

Build a small **`llm.py` helper module** you'll reuse for the rest of this
curriculum. Requirements:

- One `ask()` function that works against OpenAI, Anthropic *and* Ollama,
  selected by a parameter or environment variable.
- Automatic token counting and cumulative cost tracking, with a
  configurable hard limit that raises.
- Retry with exponential backoff on rate-limit and transient errors.
- A `max_tokens` default on every call.
- Optional response caching keyed by a hash of (model, prompt,
  parameters) — identical calls during development shouldn't cost twice.

Then test it: make the budget fire, make a retry happen (point it at a
bad URL), and confirm the cache returns instantly on a repeat call.

That caching requirement isn't busywork — you'll re-run the same prompt
dozens of times while developing, and caching turns that from a cost into
a free operation.

## Common mistakes & troubleshooting

- **Skipping the provider-side spend limit.** It's the only guardrail
  that survives your own bugs. Two minutes, now.
- **Hardcoding keys "temporarily."** Temporary code gets committed. Use
  `.env` from the first line you write.
- **Committing `.env`.** Check `git status` before your first commit
  (exercise 1), not after.
- **Assuming a removed key is a safe key.** Rotate it (exercise 7).
- **Working outside a virtual environment.** Dependency conflicts across
  projects are guaranteed otherwise, and this curriculum installs a lot
  of packages.
- **Using a frontier model for every exercise.** 20-50x the cost for no
  learning benefit. Default to the small model.
- **Omitting `max_tokens`.** One malformed prompt can generate until it
  hits the model's maximum, at full price.
- **Installing everything up front.** Each track installs what it needs.
  Don't `pip install langchain` today.

## Checkpoint quiz

1. Which guardrail survives a bug in your own code, and why?
2. Why do output tokens cost more than input tokens?
3. What single change points the OpenAI SDK at a local Ollama model?
4. What's the correct first action when an API key is committed?
5. Why default to a small model while learning?
6. What does `resp.usage` provide, and what can you build with it?
7. Name two things you should *not* install yet, and why.

<details><summary>Answers</summary>

1. The provider-side hard spend limit — it's enforced by the provider, so
   no client-side loop, exception, or logic error can exceed it.
2. Each output token requires its own full forward pass (the decode
   phase), while the entire prompt is processed in one parallel pass
   (prefill) — so output is more compute per token (module 08).
3. Setting `base_url="http://localhost:11434/v1"` (plus a model name);
   Ollama exposes an OpenAI-compatible endpoint.
4. Revoke the key immediately. History scrubbing is cleanup, not
   remediation — a committed secret is compromised.
5. It's 20-50x cheaper and entirely adequate for learning; the exercises
   teach mechanisms, not frontier-model quality.
6. Prompt and completion token counts per response — enough to build a
   cumulative cost tracker and budget guardrail (exercise 5).
7. A GPU (only tracks 04/05/14 need one, and it's rentable hourly) and
   LangChain (track 11 — and track 10 deliberately builds agents by hand
   first). Also acceptable: a vector database, which track 08 sets up.
</details>

## Further reading & sources

- [OpenAI: Quickstart](https://platform.openai.com/docs/quickstart) - the official setup path, including where to find and revoke API keys.
- [OpenAI: Rate limits](https://platform.openai.com/docs/guides/rate-limits) - what the tiers mean and how to handle 429s properly with backoff, which exercise 5's challenge asks you to implement.
- [Anthropic: Getting started](https://docs.anthropic.com/en/docs/get-started) - equivalent setup for Claude, worth having as a second provider for comparison exercises.
- [Ollama](https://ollama.com/) - the free local-model path; the model library page lists what fits in a given amount of RAM.
- [Ollama OpenAI compatibility](https://ollama.com/blog/openai-compatibility) - the documentation behind exercise 4's one-line switch between local and hosted models.
- [GitHub: Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) - the cleanup procedure for exercise 7, with GitHub's own warning that rotation comes first.
- [Python: venv documentation](https://docs.python.org/3/library/venv.html) - the authoritative reference on virtual environments.
- [tiktoken](https://github.com/openai/tiktoken) - the tokenizer used in exercise 6 and throughout track 01.
- [LLM pricing comparison (Artificial Analysis)](https://artificialanalysis.ai/models) - current cost and quality benchmarks across providers, useful when choosing a default model.

## Next

[Module 14: Capstone Project](../14-capstone-project/README.md)
