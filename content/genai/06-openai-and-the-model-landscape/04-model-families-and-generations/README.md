# Module 04: Model Families and Generations

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**. [Module 00: The OpenAI API: Your First Call](../00-the-openai-api-your-first-call/README.md) put a model name in a request, [Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md) and [Module 02: The Responses API and Statefulness](../02-the-responses-api-and-statefulness/README.md) covered the two endpoints, and [Module 03: Streaming Responses](../03-streaming-responses/README.md) the delivery. Every one of them took the `model` string for granted. This module is about that string: what a catalogue of models is made of, how to look it up without memorising it, and how to change models without breaking your product. [Module 05: Reasoning Models and Test-Time Compute](../05-reasoning-models-and-test-time-compute/README.md) then goes deep on one axis of it.

After this module you can:

- describe any model, from any provider, on a handful of durable axes instead of by its marketing name: tier, generation, reasoning or not, modalities, limits, snapshot or alias, lifecycle;
- list models through the API, say what that call does and does not tell you, and name the official pages that hold the rest;
- keep model capabilities in a validated registry, pin snapshots, and select models per task from data;
- compare a candidate model with the current one on your own eval set and make a promote-or-hold decision you can defend;
- apply the rule that closes the module: choose by evaluation on your task, not by name.

Why it matters: model catalogues change faster than application code. Models are added, renamed, superseded and retired on published schedules, and the same name can change behaviour underneath you. An application that hard-codes a model name and a context size is a deadline waiting to arrive.

> [!note] How the claims here are sourced. Everything about the OpenAI catalogue comes from pages fetched and read on 26 Oct 2026: the Models page and three individual model pages, the Deprecations page, the Using GPT-6, Model selection, Reasoning, Reasoning best practices and Evaluation best practices guides, the OpenAPI spec (`openai/openai-openapi`, version `2.3.0`), and the `openai-python` README. Model names, limits and dates appear only where a table says "per the model page, checked 26 Oct 2026"; everything else uses fictional placeholders (`model-a`, `model-b`, ...). **No API call was made.** The model list in block 4 and the "models" in block 5 are local stand-ins and scripted functions, and say nothing about any real model. Prices in the code are illustrative placeholders, not anyone's price list. The official pages are the source of truth and may have changed since.

## Concept

> [!key] A model catalogue changes faster than your code, so do not learn model names; learn the axes (tier, generation, reasoning or not, modalities, context and output limits, snapshot or alias, lifecycle). Keep each model's capabilities as verified data in a registry, pin snapshots, pick models per task from that data, and move to a new model only after it matches or beats the current one on an eval built from your own task.

## Explanation

### Why names are the wrong thing to learn

Block 1 reads the Models page as data (a copy saved on 26 Oct 2026) and counts what is in the list. This is what one provider's catalogue looked like on that day:

- **It is large and mixed.** 101 entries: 36 general text and chat models, 25 speech and audio models, 8 with o-series names, 7 coding agents, 7 image models, plus embeddings, moderation, deep research, open-weight, security-restricted and legacy base models. Most entries are not "the chat model".
- **Many generations are alive at once.** Fourteen generation labels among the general text models, from 3.5 to 6.1.
- **The tier vocabulary changed between generations.** Size words went `Mini, nano, Pro` for the GPT-4.1 to GPT-5.5 families, `Luna, Terra, Sol` for GPT-5.6, and `Astra, Luna, Sol` for GPT-6. The same word, `Sol`, is described by the page as a "flagship" model in GPT-5.6 and as "Near-Astra performance for complex work at a lower cost" in GPT-6.1. A tier name is a label in one generation's taxonomy, not a stable meaning.
- **Some ids look like moving aliases.** Twelve ids end in `-latest`. Names like that suggest the model behind them is replaced over time.

A name encodes a vendor's naming scheme at one moment. What stays useful is the set of questions you ask about any model.

> [!model] A model is a row in a table, not a brand. The columns (tier, generation, reasoning, modalities, limits, snapshot, lifecycle) stay the same for years; the rows come and go. Write code against the columns.

### The axes

| Axis | The question | Where the answer lives | What goes wrong if you guess |
|---|---|---|---|
| **Tier** | Large/flagship or small/fast? | The model's page and the provider's selection guides | Over-paying for easy work, or under-powering hard work. Tiers are relative *within* a generation |
| **Generation** | How new, and what changed? | The provider's migration guide for that generation | A "drop-in upgrade" that is not one (see below) |
| **Reasoning** | Does it think before answering, and how much can you control? | The model page ("reasoning token support", supported effort values) | Wrong parameters, surprise latency and cost ([Module 05](../05-reasoning-models-and-test-time-compute/README.md)) |
| **Modalities and endpoints** | What goes in and out, and through which endpoints? | The model page (modalities, endpoints table, supported features and tools) | Calling an endpoint or feature the model does not support |
| **Limits** | How big is the window, the input, the output? | The model page | Silent truncation or hard errors; hard-coded numbers that go stale |
| **Snapshot or alias** | Is this id frozen, or does it move? | The model page's *Snapshots* section | Behaviour that changes with no change on your side |
| **Lifecycle** | When does it stop working? | The Deprecations page and `shutdown_date` in the models API | An outage on someone else's calendar |

Three of these deserve a closer look, because the pages show surprises.

**Newer is not drop-in.** The Using GPT-6 guide's migration notes (checked 26 Oct 2026) list changes you must handle in code: some models do not accept `none` as a reasoning effort (the reasoning guide says the request "returns HTTP 400"); `temperature`, `top_p` and `top_logprobs` must be removed when reasoning effort is not `none`; defaults are "model-dependent rather than universal"; and for some models, tool calling requires the Responses API, or in Chat Completions works only at one effort setting. None of that is visible in a model's name. It is why an upgrade needs a test, not a string replacement.

**Limits are three numbers, and they vary by snapshot.** A model page lists a context window, a maximum number of input tokens and a maximum number of output tokens. The reasoning guide adds: "Context window lengths are found on the model reference page, and will differ across model snapshots." On the two GPT-6 pages in the table below, `1,050,000 - 128,000 = 922,000`: the maximum input is the window minus the maximum output. That held for both pages that list a maximum input (the third page lists none); it is a pattern to check, not a rule to assume. Reasoning tokens occupy the same window (Module 05), and the windows themselves are covered in Track 01, [Module 11: Context Windows Explained](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md).

**An alias is a promise about names, not about behaviour.** The model page says "Snapshots let you lock in a specific version of the model so that performance and behavior remain consistent". Pages differ in what they offer. Per the model pages, checked 26 Oct 2026:

| Field on the page | GPT-6 Astra | GPT-6 Luna | GPT-5.5 |
|---|---|---|---|
| Model ID | `gpt-6-astra` | `gpt-6-luna` | `gpt-5.5` |
| Default snapshot | `gpt-6-astra` | `gpt-6-luna` | `gpt-5.5-2026-04-23` |
| Context window | 1,050,000 | 1,050,000 | 1,050,000 |
| Maximum input tokens | 922,000 | 922,000 | not listed |
| Max output tokens | 128,000 | 128,000 | 128,000 |
| Knowledge cutoff | Apr 30, 2026 | May 18, 2026 | Dec 01, 2025 |
| `reasoning.effort` values | `low`, `medium`, `high`, `xhigh`, `max` | `none`, `low`, `medium` (default), `high`, `xhigh`, `max` | `none`, `low`, `medium` (default), `high`, `xhigh` |

Two lessons. First, the page's most capable model, its most cost-efficient model of the same generation, and a model from an earlier generation have the *same* window and output limit here, so you cannot infer limits from a tier name. Second, the `gpt-5.5` page lists a dated default snapshot behind the model id, while the other two list a single snapshot named like the model id itself; on those two pages there is nothing dated to pin to, so your protection against silent change is a canary (block 5), not a string. The 2023 study "How is ChatGPT's behavior changing over time?" found that "the behavior of the 'same' LLM service can change substantially in a relatively short amount of time", and recommended continuous monitoring. Read each model's Snapshots section and record what it says.

> [!pitfall] Treating the model page as stable. Every number in the table above has a date next to it because every number can change. Put the value, the date you read it and the URL into your registry, and re-read before you rely on it.

### Lifecycle: models are retired on a schedule

The Deprecations page defines its terms: "deprecation" means retiring a model or endpoint, which "immediately becomes deprecated" and gets a shutdown date; "legacy" marks models that "no longer receive updates", which you can expect to be deprecated "at some point in the future". It also states minimum notice periods: "at least 6 months" for generally available models, at least 3 months for specialized variants, and for preview models "much shorter notice, such as 2 weeks". And it tells you how to watch for it in code: call `GET /v1/models` and check each model's optional `shutdown_date` field, a `YYYY-MM-DD` string or `null`.

Block 2 takes nine notice-and-shutdown pairs from the page and does the arithmetic. The notice actually given ranged from 20 days to 184 days; four of the nine entries gave less than the 180 days of the general rule. Whether each is covered by the page's exceptions cannot be told from its table, so plan for the short end and read each entry. (The Evaluation best practices guide carries its own example: it says the Evals platform becomes read-only on 31 Oct 2026 and shuts down on 30 Nov 2026. Keep your eval set and harness in your own repository, as block 5 does, so that retiring someone's product never retires your tests.)

### Listing models through the API

`GET /v1/models` ("List models") returns, per the API reference and the OpenAPI spec:

```
{"object": "list",
 "data": [{"id": "...", "object": "model", "created": 1686935002, "owned_by": "...", "shutdown_date": null}, ...]}
```

Only `id`, `object`, `created` and `owned_by` are required; `shutdown_date` is "the date when the model will shut down, or null if not announced". A credential without permission gets HTTP 403. `GET /v1/models/{model}` retrieves one entry. The call answers three useful questions: which ids can this credential use right now, are any of them scheduled to shut down, and has something new appeared. It does **not** tell you the context window, modalities, supported features, reasoning options or prices. Those live on the model pages and the pricing page, which is exactly why they belong in a registry you maintain. Block 4 shows both halves: a stand-in serving the documented shape, and a diff against the registry.

Where the official information lives (all checked 26 Oct 2026, and all of them can move):

| You want | Look at |
|---|---|
| What models exist, and what each is for | The Models page, and each model's own page (`/api/docs/models/<id>`) |
| Limits, modalities, endpoints, features, snapshots, reasoning options | That model's page |
| Which ids this credential can use, and any `shutdown_date` | `GET /v1/models` |
| Prices | The Pricing page (not quoted in this module on purpose) |
| What is being retired, when, and the recommended replacement | The Deprecations page |
| What changed in a generation, and migration notes | The Using GPT-6 style migration guide, and the changelog |

Other providers have the same four kinds of page: a catalogue, per-model details, a pricing page and a deprecation policy. Modules [10](../10-the-anthropic-claude-api/README.md), [11](../11-the-google-gemini-api/README.md) and [12](../12-open-weight-models-llama-mistral-qwen/README.md) cover them.

### Capabilities as data: a registry

A registry is one file (JSON here) that records, for every model you might use, the columns from the axes table plus where the facts came from and when you read them. Code then asks the registry instead of hard-coding assumptions:

- **Hard requirements are filters.** A task that needs structured outputs, 300,000 tokens of context and reasoning excludes every model that lacks any of them. `why_not()` returns the reasons, so an exclusion is explainable.
- **The shortlist is a list of candidates to evaluate, not a decision.** Sorting qualifying models by price tells you what to *test*. The registry has no quality column, because quality is a property of your task, not of the model.
- **The choice is data.** `choice: {primary, fallback}` per task is recorded from eval results and changes by editing config. Code asks `resolve(task)`.
- **The registry is validated, and so is the calendar.** `validate()` catches internal contradictions (output limit larger than the window, a deprecated model without a shutdown date, two snapshots claiming one alias, a task pointing at a model that is not registered). `resolve()` adds the calendar: it escalates from info to warning to error as a `shutdown_date` approaches, and flags a fallback that no longer meets the task's requirements.
- **Capabilities can be conditional.** The Luna page says Chat Completions supports function calling only with reasoning effort `none`. A boolean `function_calling: true` hides that; keep a notes field, or model the condition, for capabilities that depend on a parameter.

### Moving to a new model: the canary

The Evaluation best practices guide opens with the reason: "Generative AI is variable. Models sometimes produce different output from the same input, which makes traditional software testing methods insufficient". Its tips fit this module: "Design task-specific evals: Make tests reflect model capability in real-world distributions", and "Log everything: Log as you develop so you can mine your logs for good eval cases". A canary for a model change is that idea applied once, then repeated on a schedule:

1. **An eval set drawn from your own traffic**, with cases you mark critical (a failure there blocks a change on its own).
2. **The same prompts and settings** for the baseline and the candidate, graded by code, not by eye.
3. **A paired comparison**: which cases did the candidate fix, which did it break. Counts of improved and regressed cases matter more than the two averages.
4. **A decision rule written down in advance**: no critical regression, no rise in malformed outputs, pass count not lower beyond a tolerance, then cost and latency within budget. Anything else holds.
5. **Honest statistics.** Twenty cases cannot separate 85% from 90%. Block 5 prints a Wilson interval for the pass rate and an exact sign test on the disagreeing cases; with fewer than six disagreeing cases no sign test can even reach p < 0.05. A small set can catch a big regression, not prove equivalence.
6. **A gradual rollout** after the pass: shadow traffic or a small share first, with the fallback in place.
7. **The same harness on a schedule**, against the alias you actually call, so that a silent change shows up as an alert (block 5, scenario 3).

> [!pitfall] Comparing candidates on a public benchmark instead of your task. The guide itself separates "industry benchmarks for comparing models in isolation" from "specific tests you implement to measure your LLM application's performance", and says its advice is about the third kind.

### The rule

The Model selection guide gives its own recommendations, then says: "Treat the guidance on this page as a starting point. The best way to find the right model for your workflow is to experiment with different models and reasoning settings to see what works", and ends with "keep the lightest setting that meets your quality bar". That is the rule this module exists to make practical: **choose by evaluation on your task, not by name.** The registry narrows the field, the eval decides, the calendar and the canary keep the decision honest.

## Code

Five executed blocks and one SDK snippet, standard library only, each executed block printing deterministic output (dates are passed in, never read from the clock). Save them in one folder with the file names shown; `registry.json` and `registry.py` are used by blocks 4 and 5. Every output below was produced by running exactly this code with Python 3.13 on 26 Oct 2026.

### 1. A catalogue read as data

Run on the Models page's markdown version, saved as `models_page_2026-10-26.md` (fetch your own copy with `curl -sL https://developers.openai.com/api/docs/models.md`, or pass the URL as the argument). The classification rules are regexes over display names. They are a heuristic and will need edits as the page changes; that fragility is the lesson.

```python
"""catalog_scan.py - what does a model catalogue look like as DATA?

Reads the Models page (its markdown version) and summarises the structure of the list. The output below comes
from a copy of the page saved on 26 Oct 2026; pass a URL instead to scan the live page. The regex rules are a
heuristic over display names, which is the point: names are not a reliable schema.
"""
import re
import sys
import urllib.request
from collections import Counter, defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else "https://developers.openai.com/api/docs/models.md"
if SRC.startswith("http"):
    text = urllib.request.urlopen(SRC).read().decode("utf-8")
else:
    text = open(SRC, encoding="utf-8").read()

ENTRY = re.compile(r"^- \[(?P<name>[^\]]+)\]\(/api/docs/models/(?P<slug>[^)]+?)(?:\.md)?\): (?P<desc>.*)$", re.M)
entries = [m.groupdict() for m in ENTRY.finditer(text.split("## Browse our full catalog of models", 1)[1])]

KINDS = [("speech and audio", r"audio|realtime|transcribe|tts|whisper|live"),
         ("image generation", r"image"),
         ("embeddings", r"embedding"),
         ("moderation", r"moderation"),
         ("open-weight", r"gpt-oss"),
         ("coding agents", r"codex"),
         ("deep research", r"deep-research"),
         ("search / computer-use previews", r"search-preview|computer-use"),
         ("legacy base models", r"babbage|davinci"),
         ("security-restricted", r"daybreak|cyber"),
         ("reasoning, o-series names", r"^o\d"),
         ("general text and chat", r"")]


def kind_of(slug):
    return next(k for k, pattern in KINDS if re.search(pattern, slug))


print("entries in the catalogue list:", len(entries))
by_kind = Counter(kind_of(e["slug"]) for e in entries)
for k, n in sorted(by_kind.items(), key=lambda kv: (-kv[1], kv[0])):
    print("  %-34s %3d" % (k, n))

generations, suffixes = defaultdict(set), defaultdict(set)
for e in entries:
    m = re.match(r"GPT-(\d+(?:\.\d+)?o?)(?: (.*))?$", e["name"])
    if m and kind_of(e["slug"]) == "general text and chat":
        generations[m.group(1)].add(e["slug"])
        if m.group(2):
            suffixes[m.group(1)].add(m.group(2))
order = sorted(generations, key=lambda v: ([int(x) for x in re.findall(r"\d+", v)], v))
print("\ngeneration labels among general text models:", ", ".join(order))
print("\nwords after the generation label, by generation (the 'tier' vocabulary):")
for g in order:
    print("  GPT-%-5s %s" % (g, ", ".join(sorted(suffixes[g], key=str.lower)) or "(none)"))

print("\nthe same tier word, described by the page in two generations:")
for e in entries:
    if re.fullmatch(r"GPT-(5\.6|6\.1) Sol", e["name"]):
        print("  %-12s %s" % (e["name"], e["desc"]))

latest = sorted(e["slug"] for e in entries if e["slug"].endswith("-latest"))
print("\nids ending in '-latest' (named like moving aliases):", len(latest))
print(" ", ", ".join(latest))
```

Output (on the 26 Oct 2026 copy):

```
entries in the catalogue list: 101
  general text and chat               36
  speech and audio                    25
  reasoning, o-series names            8
  coding agents                        7
  image generation                     7
  embeddings                           3
  moderation                           3
  search / computer-use previews       3
  security-restricted                  3
  deep research                        2
  legacy base models                   2
  open-weight                          2

generation labels among general text models: 3.5, 4, 4o, 4.1, 4.5, 5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6, 6.1

words after the generation label, by generation (the 'tier' vocabulary):
  GPT-3.5   Turbo
  GPT-4     Turbo, Turbo Preview
  GPT-4o    Mini
  GPT-4.1   Mini, nano
  GPT-4.5   Preview
  GPT-5     Chat, Mini, nano, Pro
  GPT-5.1   Chat
  GPT-5.2   Chat, Pro
  GPT-5.3   Chat
  GPT-5.4   Mini, nano, Pro
  GPT-5.5   Pro
  GPT-5.6   Luna, Sol, Terra
  GPT-6     Astra, Luna, Sol
  GPT-6.1   Sol

the same tier word, described by the page in two generations:
  GPT-5.6 Sol  GPT-5.6 flagship model for complex professional work
  GPT-6.1 Sol  Near-Astra performance for complex work at a lower cost.

ids ending in '-latest' (named like moving aliases): 12
  chat-latest, chatgpt-4o-latest, chatgpt-image-latest, codex-mini-latest, gpt-5-chat-latest, gpt-5.1-chat-latest, gpt-5.2-chat-latest, gpt-5.3-chat-latest, gpt-daybreak-blue-latest, gpt-daybreak-red-latest, omni-moderation-latest, text-moderation-latest
```

### 2. How much warning did past deprecations give?

```python
"""lifecycle.py - how much warning did past deprecations give? The dates are typed in from the Deprecations page
(checked 26 Oct 2026); the arithmetic is the point, not the particular models."""
from datetime import date
from statistics import median

TODAY = date(2026, 10, 26)
NOTICES = [   # (announced, shutdown, what the page lists)
    (date(2026, 4, 22), date(2026, 10, 23), "older GPT snapshots"),
    (date(2026, 5, 8), date(2026, 8, 10), "two chat-latest snapshots"),
    (date(2026, 6, 11), date(2026, 12, 11), "older GPT-5 and o3 snapshots"),
    (date(2026, 7, 20), date(2027, 1, 20), "legacy audio and realtime models"),
    (date(2026, 8, 26), date(2027, 2, 26), "transcription models"),
    (date(2026, 9, 11), date(2026, 10, 1), "one restricted-access model"),
    (date(2026, 10, 1), date(2027, 1, 6), "text-to-speech models"),
    (date(2026, 10, 1), date(2027, 4, 1), "three text models"),
    (date(2026, 10, 14), date(2027, 1, 14), "GPT-4o and GPT-4.1 snapshots"),
]

print("announced    shutdown     notice (days)   days left on %s   what" % TODAY)
days = []
for announced, shutdown, what in NOTICES:
    notice = (shutdown - announced).days
    days.append(notice)
    left = (shutdown - TODAY).days
    print("%s  %s  %8d        %12s        %s" % (announced, shutdown, notice, left if left >= 0 else "shut down", what))
print("\nnotice given, in days: min %d, median %d, max %d" % (min(days), median(days), max(days)))
print("the page's stated minimums: generally available models 6 months (about 180 days), specialized variants")
print("3 months (about 90), preview models as little as 2 weeks (14)")
print("entries giving less than 180 days:", sum(d < 180 for d in days), "of", len(days))
```

```
announced    shutdown     notice (days)   days left on 2026-10-26   what
2026-04-22  2026-10-23       184           shut down        older GPT snapshots
2026-05-08  2026-08-10        94           shut down        two chat-latest snapshots
2026-06-11  2026-12-11       183                  46        older GPT-5 and o3 snapshots
2026-07-20  2027-01-20       184                  86        legacy audio and realtime models
2026-08-26  2027-02-26       184                 123        transcription models
2026-09-11  2026-10-01        20           shut down        one restricted-access model
2026-10-01  2027-01-06        97                  72        text-to-speech models
2026-10-01  2027-04-01       182                 157        three text models
2026-10-14  2027-01-14        92                  80        GPT-4o and GPT-4.1 snapshots

notice given, in days: min 20, median 182, max 184
the page's stated minimums: generally available models 6 months (about 180 days), specialized variants
3 months (about 90), preview models as little as 2 weeks (14)
entries giving less than 180 days: 4 of 9
```

### 3. Capabilities as data

> [!example] **Everything in `registry.json` is fictional and illustrative**: model names, limits, prices and dates. The source URLs end in `.invalid` on purpose. In real use each value comes from the provider's page, with the URL and the date you read it.

```json
{
  "_comment": "ILLUSTRATIVE registry for FICTIONAL models. Replace every value with what the provider's model pages say on the day you check, and set checked_on and source for each entry.",
  "alert_days": {"error": 30, "warn": 90},
  "models": {
    "model-a-2026-09-01": {
      "alias": "model-a", "tier": "large", "generation": 3, "reasoning": true,
      "modalities_in": ["text", "image"], "modalities_out": ["text"],
      "context_window": 400000, "max_output_tokens": 100000,
      "endpoints": ["responses", "chat.completions"],
      "supports": ["streaming", "function_calling", "structured_outputs"],
      "price_per_mtok": {"input": 10.0, "output": 40.0},
      "status": "active", "shutdown_date": null,
      "source": "https://example.invalid/models/model-a", "checked_on": "2026-10-26"
    },
    "model-b-2026-06-15": {
      "alias": "model-b", "tier": "medium", "generation": 3, "reasoning": true,
      "modalities_in": ["text", "image"], "modalities_out": ["text"],
      "context_window": 400000, "max_output_tokens": 64000,
      "endpoints": ["responses", "chat.completions"],
      "supports": ["streaming", "function_calling", "structured_outputs"],
      "price_per_mtok": {"input": 3.0, "output": 12.0},
      "status": "active", "shutdown_date": null,
      "source": "https://example.invalid/models/model-b", "checked_on": "2026-10-26"
    },
    "model-c-2026-06-15": {
      "alias": "model-c", "tier": "small", "generation": 3, "reasoning": false,
      "modalities_in": ["text", "image"], "modalities_out": ["text"],
      "context_window": 128000, "max_output_tokens": 16000,
      "endpoints": ["responses", "chat.completions"],
      "supports": ["streaming", "function_calling", "structured_outputs"],
      "price_per_mtok": {"input": 0.4, "output": 1.6},
      "status": "active", "shutdown_date": null,
      "source": "https://example.invalid/models/model-c", "checked_on": "2026-10-26"
    },
    "model-c-2025-11-02": {
      "alias": null, "tier": "small", "generation": 2, "reasoning": false,
      "modalities_in": ["text"], "modalities_out": ["text"],
      "context_window": 128000, "max_output_tokens": 16000,
      "endpoints": ["responses", "chat.completions"],
      "supports": ["streaming", "function_calling", "structured_outputs"],
      "price_per_mtok": {"input": 0.5, "output": 2.0},
      "status": "deprecated", "shutdown_date": "2026-12-11",
      "source": "https://example.invalid/models/model-c-2025-11-02", "checked_on": "2026-10-26"
    },
    "model-d-2026-04-01": {
      "alias": "model-d", "tier": "small", "generation": 3, "reasoning": false,
      "modalities_in": ["text"], "modalities_out": ["text"],
      "context_window": 32000, "max_output_tokens": 8000,
      "endpoints": ["chat.completions"],
      "supports": ["streaming"],
      "price_per_mtok": {"input": 0.1, "output": 0.4},
      "status": "active", "shutdown_date": null,
      "source": "https://example.invalid/models/model-d", "checked_on": "2026-10-26"
    }
  },
  "tasks": {
    "ticket-triage": {
      "needs": {"supports": ["structured_outputs"], "context_window": 8000},
      "choice": {"primary": "model-c-2025-11-02", "fallback": "model-c-2026-06-15"}
    },
    "contract-review": {
      "needs": {"reasoning": true, "context_window": 300000, "modalities_in": ["text"]},
      "choice": {"primary": "model-a-2026-09-01", "fallback": "model-b-2026-06-15"}
    },
    "chat-assistant": {
      "needs": {"supports": ["streaming", "function_calling"]},
      "choice": {"primary": "model-b-2026-06-15", "fallback": "model-d-2026-04-01"}
    }
  }
}
```

```python
"""registry.py - model capabilities as DATA: load, validate, shortlist for a task, resolve the configured choice."""
import copy
import json
from datetime import date

STATUSES = {"active", "deprecated", "legacy", "retired"}


def load(path="registry.json"):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def validate(reg):
    """Return a list of human-readable problems; an empty list means the registry is internally consistent."""
    problems = []
    aliases = {}
    for mid, m in reg["models"].items():
        if m["max_output_tokens"] >= m["context_window"]:
            problems.append("%s: max_output_tokens must be smaller than context_window" % mid)
        if m["status"] not in STATUSES:
            problems.append("%s: unknown status %r" % (mid, m["status"]))
        if m["status"] == "deprecated" and not m["shutdown_date"]:
            problems.append("%s: deprecated but no shutdown_date" % mid)
        if m["alias"]:
            if m["alias"] in aliases:
                problems.append("%s: alias %r already points at %s" % (mid, m["alias"], aliases[m["alias"]]))
            aliases[m["alias"]] = mid
        if {"input", "output"} - set(m["price_per_mtok"]):
            problems.append("%s: price_per_mtok needs input and output" % mid)
    for name, task in reg["tasks"].items():
        for role, mid in task["choice"].items():
            if mid not in reg["models"]:
                problems.append("task %s: %s model %r is not in the registry" % (name, role, mid))
    return problems


def why_not(needs, m):
    """The reasons a model fails a task's hard requirements (empty list = it qualifies)."""
    why = ["lacks " + s for s in needs.get("supports", []) if s not in m["supports"]]
    if "reasoning" in needs and m["reasoning"] != needs["reasoning"]:
        why.append("reasoning is %s, task needs %s" % (m["reasoning"], needs["reasoning"]))
    if m["context_window"] < needs.get("context_window", 0):
        why.append("context %d < %d" % (m["context_window"], needs["context_window"]))
    why += ["no %s input" % mod for mod in needs.get("modalities_in", []) if mod not in m["modalities_in"]]
    return why


def shortlist(reg, task):
    """Active models that meet the hard requirements, cheapest first. A list of CANDIDATES TO EVALUATE,
    not a decision: quality is not in this registry, it comes from your eval set."""
    needs = reg["tasks"][task]["needs"]
    ok = [(m["price_per_mtok"]["input"] + m["price_per_mtok"]["output"], mid)
          for mid, m in reg["models"].items() if m["status"] == "active" and not why_not(needs, m)]
    return [mid for _, mid in sorted(ok)]


def resolve(reg, task, today):
    """Check the configured choice for a task against the registry and the calendar."""
    needs, choice = reg["tasks"][task]["needs"], reg["tasks"][task]["choice"]
    notes, usable = [], []
    for role in ("primary", "fallback"):
        mid, m = choice[role], reg["models"][choice[role]]
        problems = ["fails requirements: " + ", ".join(why_not(needs, m))] if why_not(needs, m) else []
        if m["status"] == "retired":
            problems.append("retired")
        if m["shutdown_date"]:
            left = (date.fromisoformat(m["shutdown_date"]) - today).days
            level = "ERROR" if left <= reg["alert_days"]["error"] else "WARN" if left <= reg["alert_days"]["warn"] else "info"
            notes.append("%s %s %s shuts down in %d days" % (level, role, mid, left))
            if left <= 0:
                problems.append("already shut down")
        for p in problems:
            notes.append("ERROR %s %s: %s" % (role, mid, p))
        if not problems:
            usable.append(mid)
    return {"use": usable[0] if usable else None, "notes": notes}


if __name__ == "__main__":
    TODAY = date(2026, 10, 26)
    reg = load()
    print("validate(good registry):", validate(reg) or "no problems")

    bad = copy.deepcopy(reg)
    bad["models"]["model-a-2026-09-01"]["max_output_tokens"] = 400000
    bad["models"]["model-c-2025-11-02"]["shutdown_date"] = None
    bad["models"]["model-d-2026-04-01"]["alias"] = "model-c"
    bad["tasks"]["ticket-triage"]["choice"]["fallback"] = "model-c-2099-01-01"
    print("validate(broken copy):")
    for p in validate(bad):
        print("  -", p)

    print("\nwhy each model is excluded from contract-review (needs reasoning, 300k context, text input):")
    for mid, m in reg["models"].items():
        print("  %-20s %s" % (mid, why_not(reg["tasks"]["contract-review"]["needs"], m) or "qualifies"))

    print("\nshortlists (active, qualifying, cheapest first) - candidates to EVALUATE:")
    for task in reg["tasks"]:
        print("  %-16s %s" % (task, shortlist(reg, task)))

    print("\nresolve() on %s:" % TODAY)
    for task in reg["tasks"]:
        r = resolve(reg, task, TODAY)
        print("  %-16s use=%s" % (task, r["use"]))
        for n in r["notes"]:
            print("      " + n)
```

Output:

```
validate(good registry): no problems
validate(broken copy):
  - model-a-2026-09-01: max_output_tokens must be smaller than context_window
  - model-c-2025-11-02: deprecated but no shutdown_date
  - model-d-2026-04-01: alias 'model-c' already points at model-c-2026-06-15
  - task ticket-triage: fallback model 'model-c-2099-01-01' is not in the registry

why each model is excluded from contract-review (needs reasoning, 300k context, text input):
  model-a-2026-09-01   qualifies
  model-b-2026-06-15   qualifies
  model-c-2026-06-15   ['reasoning is False, task needs True', 'context 128000 < 300000']
  model-c-2025-11-02   ['reasoning is False, task needs True', 'context 128000 < 300000']
  model-d-2026-04-01   ['reasoning is False, task needs True', 'context 32000 < 300000']

shortlists (active, qualifying, cheapest first) - candidates to EVALUATE:
  ticket-triage    ['model-c-2026-06-15', 'model-b-2026-06-15', 'model-a-2026-09-01']
  contract-review  ['model-b-2026-06-15', 'model-a-2026-09-01']
  chat-assistant   ['model-c-2026-06-15', 'model-b-2026-06-15', 'model-a-2026-09-01']

resolve() on 2026-10-26:
  ticket-triage    use=model-c-2025-11-02
      WARN primary model-c-2025-11-02 shuts down in 46 days
  contract-review  use=model-a-2026-09-01
  chat-assistant   use=model-b-2026-06-15
      ERROR fallback model-d-2026-04-01: fails requirements: lacks function_calling
```

`ticket-triage` resolves to the deprecated snapshot with a warning because its shutdown is 46 days away (inside the 90-day warning window, outside the 30-day error window). `chat-assistant` works today but its fallback lacks `function_calling`, which `resolve()` reports as an error before an outage makes you discover it.

### 4. Listing models and reconciling with the registry

> [!example] **A local stand-in that mimics the documented shape of `GET /v1/models`; the models in it are fictional.** The credential is a placeholder string, not a key.

```python
"""reconcile.py - list models through GET /v1/models and compare the answer with your registry.

A LOCAL STAND-IN serves the response in the documented shape (object "list", data[] of model objects with
id, object, created, owned_by, shutdown_date). The models in it are fictional.
"""
import json
import threading
import urllib.error
import urllib.request
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer

import registry

API_DATA = [  # what the stand-in returns
    {"id": "model-a-2026-09-01", "object": "model", "created": 1788000000, "owned_by": "stand-in", "shutdown_date": None},
    {"id": "model-b-2026-06-15", "object": "model", "created": 1781000000, "owned_by": "stand-in", "shutdown_date": "2027-03-01"},
    {"id": "model-c-2026-06-15", "object": "model", "created": 1781000001, "owned_by": "stand-in", "shutdown_date": None},
    {"id": "model-c-2025-11-02", "object": "model", "created": 1762000000, "owned_by": "stand-in", "shutdown_date": "2026-12-11"},
    {"id": "model-e-2026-10-20", "object": "model", "created": 1792000000, "owned_by": "stand-in", "shutdown_date": None},
]
KEY = "not-a-real-key"


class Handler(BaseHTTPRequestHandler):
    forbidden = False

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path != "/v1/models":
            status, body = 404, {"error": {"message": "not found"}}
        elif self.headers.get("Authorization") != "Bearer " + KEY:
            status, body = 401, {"error": {"message": "missing or wrong credential"}}
        elif Handler.forbidden:
            status, body = 403, {"error": {"message": "this credential may not list models"}}
        else:
            status, body = 200, {"object": "list", "data": API_DATA}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class ModelListError(Exception):
    pass


def list_models(base_url, key):
    req = urllib.request.Request(base_url + "/v1/models", headers={"Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        raise ModelListError("HTTP %d: %s" % (e.code, json.load(e)["error"]["message"])) from None
    assert body["object"] == "list"
    return body["data"]


def reconcile(reg, listed, today):
    ids = {m["id"]: m for m in listed}
    out = []
    out += ["registered but not listed (retired, renamed, or no access): " + mid
            for mid in reg["models"] if mid not in ids]
    out += ["listed but not registered (new? decide whether to evaluate it): " + mid
            for mid in ids if mid not in reg["models"]]
    for mid, m in reg["models"].items():
        if mid in ids and ids[mid]["shutdown_date"] != m["shutdown_date"]:
            out.append("shutdown_date disagrees for %s: API %s, registry %s"
                       % (mid, ids[mid]["shutdown_date"], m["shutdown_date"]))
    for task, t in reg["tasks"].items():
        for role, mid in t["choice"].items():
            sd = ids.get(mid, {}).get("shutdown_date")
            if sd:
                out.append("task %s %s uses %s, which shuts down in %d days"
                           % (task, role, mid, (date.fromisoformat(sd) - today).days))
    return out


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % server.server_address[1]

    listed = list_models(base, KEY)
    print("models returned:", len(listed), "| fields in each entry:", sorted(listed[0]))
    print("any capability field (context window, modalities, price)?",
          any(k in listed[0] for k in ("context_window", "modalities", "price")))
    print()
    for line in reconcile(registry.load(), listed, date(2026, 10, 26)):
        print("-", line)

    Handler.forbidden = True
    try:
        list_models(base, KEY)
    except ModelListError as e:
        print("\nwith a credential that may not list models ->", e)
    server.shutdown()
```

Output:

```
models returned: 5 | fields in each entry: ['created', 'id', 'object', 'owned_by', 'shutdown_date']
any capability field (context window, modalities, price)? False

- registered but not listed (retired, renamed, or no access): model-d-2026-04-01
- listed but not registered (new? decide whether to evaluate it): model-e-2026-10-20
- shutdown_date disagrees for model-b-2026-06-15: API 2027-03-01, registry None
- task ticket-triage primary uses model-c-2025-11-02, which shuts down in 46 days
- task contract-review fallback uses model-b-2026-06-15, which shuts down in 126 days
- task chat-assistant primary uses model-b-2026-06-15, which shuts down in 126 days

with a credential that may not list models -> HTTP 403: this credential may not list models
```

The list tells you which ids exist, which are unregistered, which are missing, and where the provider's `shutdown_date` disagrees with your records. Notice what it cannot tell you: there is no capability field in the response at all.

### 5. The canary harness

> [!example] **The "models" below are scripted functions that return fixed answers per case; they exercise the harness, not any real model.** The prices come from the illustrative registry.

```python
"""canary.py - decide whether to move a task from a baseline model to a candidate, using YOUR eval set.

The "models" are SCRIPTED stand-ins (fixed answers for each case), so this shows the harness mechanics only;
it says nothing about how any real model behaves.
"""
import json
from dataclasses import dataclass
from math import comb, sqrt

import registry

CATEGORIES = ["billing", "outage", "feature", "abuse"]


@dataclass(frozen=True)
class Case:
    id: str
    prompt: str
    want: str
    critical: bool = False        # a failure here blocks a promotion on its own


TEXTS = {
    "billing": ["I was charged twice this month", "Please send me last year's invoice", "My card was declined but I paid",
                "Cancel my plan and refund me", "The tax on my receipt looks wrong"],
    "outage": ["The API returns 503 for everyone since 9am", "Dashboard will not load for our whole team",
               "All webhooks stopped arriving", "Login is down in every region", "Our exports have hung for hours"],
    "feature": ["Please add dark mode", "Can you support CSV import?", "We need a Slack integration",
                "Add an option to rename projects", "Would love keyboard shortcuts"],
    "abuse": ["Someone is using my account to send spam", "A user is harassing our moderators",
              "Stolen cards are being tested on your form", "This account is phishing our customers",
              "Fake reviews are being posted in bulk"],
}
CASES = [Case("c%02d" % (i * 4 + j + 1), text, cat, critical=(cat in ("outage", "abuse") and i in (0, 2)))
         for j, cat in enumerate(CATEGORIES) for i, text in enumerate(TEXTS[cat])]
CASES.sort(key=lambda c: c.id)


class Scripted:
    """A stand-in model: correct JSON for every case except the ones listed in `wrong` (case id -> raw output)."""
    def __init__(self, name, wrong, tokens, latency_ms):
        self.name, self.wrong, self.tokens, self.latency_ms = name, wrong, tokens, latency_ms

    def answer(self, case):
        return self.wrong.get(case.id, json.dumps({"category": case.want}))


def grade(case, raw):
    """(valid_format, correct)."""
    try:
        cat = json.loads(raw)["category"]
    except (ValueError, KeyError, TypeError):
        return False, False
    return cat in CATEGORIES, cat == case.want


def evaluate(model, cases):
    return {c.id: grade(c, model.answer(c)) for c in cases}


def sign_test_p(improved, regressed):
    """Exact two-sided sign test on the cases where the two models disagree."""
    n, k = improved + regressed, min(improved, regressed)
    return 1.0 if n == 0 else min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n)


def wilson(k, n, z=1.96):
    """95% Wilson score interval for a pass rate."""
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centre - half, centre + half


def compare(base, cand, cases):
    ids = [c.id for c in cases]
    improved = [i for i in ids if cand[i][1] and not base[i][1]]
    regressed = [i for i in ids if base[i][1] and not cand[i][1]]
    return {"base_pass": sum(base[i][1] for i in ids), "cand_pass": sum(cand[i][1] for i in ids),
            "improved": improved, "regressed": regressed, "p": sign_test_p(len(improved), len(regressed)),
            "cand_invalid": sum(not cand[i][0] for i in ids), "base_invalid": sum(not base[i][0] for i in ids)}


def decide(cmp, cases, cost_ratio, tolerance=1):
    critical = {c.id for c in cases if c.critical}
    broken = sorted(critical & set(cmp["regressed"]))
    if broken:
        return "HOLD: regressed on critical case(s) " + ", ".join(broken)
    if cmp["cand_invalid"] > cmp["base_invalid"]:
        return "HOLD: more malformed outputs (%d vs %d)" % (cmp["cand_invalid"], cmp["base_invalid"])
    if cmp["base_pass"] - cmp["cand_pass"] > tolerance:
        return "HOLD: pass count fell by more than %d" % tolerance
    return "PROMOTE to a shadow/canary rollout (no critical regression; cost ratio %.2f)" % cost_ratio


def report(base_model, cand_model, cases, reg):
    base, cand = evaluate(base_model, cases), evaluate(cand_model, cases)
    cmp = compare(base, cand, cases)
    n = len(cases)
    price = lambda mid: reg["models"][mid]["price_per_mtok"]
    cost = lambda mid, toks: (300 * price(mid)["input"] + toks * price(mid)["output"]) / 1e6 * 1000   # per 1000 calls
    cb, cc = cost(base_model.name, base_model.tokens), cost(cand_model.name, cand_model.tokens)
    lo, hi = wilson(cmp["cand_pass"], n)
    print("baseline  %-20s pass %2d/%d   cost per 1k calls $%.2f (ILLUSTRATIVE prices)   latency %d ms"
          % (base_model.name, cmp["base_pass"], n, cb, base_model.latency_ms))
    print("candidate %-20s pass %2d/%d   cost per 1k calls $%.2f                         latency %d ms"
          % (cand_model.name, cmp["cand_pass"], n, cc, cand_model.latency_ms))
    print("  improved: %s   regressed: %s   malformed outputs: base %d, candidate %d"
          % (cmp["improved"] or "none", cmp["regressed"] or "none", cmp["base_invalid"], cmp["cand_invalid"]))
    print("  sign test on %d disagreeing case(s): p = %.3f | candidate's pass rate 95%% interval: %.2f to %.2f"
          % (len(cmp["improved"]) + len(cmp["regressed"]), cmp["p"], lo, hi))
    print("  decision:", decide(cmp, cases, cc / cb))


if __name__ == "__main__":
    reg = registry.load()
    print("eval set: %d cases, %d critical, %d per category\n" % (len(CASES), sum(c.critical for c in CASES), len(CASES) // 4))
    bad_cat = lambda c: json.dumps({"category": "feature" if c.want != "feature" else "billing"})
    by_id = {c.id: c for c in CASES}
    MALFORMED = "Sure! The category is outage."
    baseline = Scripted("model-c-2025-11-02", {"c03": bad_cat(by_id["c03"]), "c07": MALFORMED,
                                               "c09": bad_cat(by_id["c09"])}, tokens=20, latency_ms=420)

    print("Scenario 1: better overall, but breaks a critical case")
    cand1 = Scripted("model-b-2026-06-15", {"c02": bad_cat(by_id["c02"]), "c07": MALFORMED}, tokens=60, latency_ms=900)
    report(baseline, cand1, CASES, reg)

    print("\nScenario 2: a cheaper model that does as well on this set")
    C_WRONG = {"c07": MALFORMED, "c09": bad_cat(by_id["c09"])}      # model-c-2026-06-15 as the harness first sees it
    cand2 = Scripted("model-c-2026-06-15", C_WRONG, tokens=20, latency_ms=300)
    report(baseline, cand2, CASES, reg)

    print("\nHow much can a %d-case set tell you? 95%% interval for a measured pass rate:" % len(CASES))
    for k, n in ((17, 20), (18, 20), (170, 200), (180, 200)):
        lo, hi = wilson(k, n)
        print("  %3d/%-3d = %.2f  ->  %.2f to %.2f" % (k, n, k / n, lo, hi))
    need = next(n for n in range(1, 30) if sign_test_p(n, 0) < 0.05)
    print("fewest disagreeing cases for which a sign test can reach p < 0.05: %d (all in one direction)" % need)

    print("\nScenario 3: a moving alias drifts, a pinned snapshot does not (weekly canary, the same %d cases)" % len(CASES))
    drift = {3: {"c02": bad_cat(by_id["c02"])}, 4: {"c02": bad_cat(by_id["c02"]), "c15": "category: feature"}}
    pinned = Scripted("model-c-2026-06-15", C_WRONG, 20, 300)
    print("  week   alias 'model-c'   pinned snapshot   canary (* = critical case)")
    reference = None
    for week in range(5):
        alias = Scripted("model-c", {**C_WRONG, **drift.get(week, {})}, 20, 300)
        a, p = evaluate(alias, CASES), evaluate(pinned, CASES)
        reference = reference or a                                   # week 0 is the reference run
        lost = [c.id + ("*" if c.critical else "") for c in CASES if reference[c.id][1] and not a[c.id][1]]
        print("  %4d   %9d/%d       %9d/%d       %s"
              % (week, sum(v[1] for v in a.values()), len(CASES), sum(v[1] for v in p.values()), len(CASES),
                 "ALERT, newly failing: " + ", ".join(lost) if lost else "ok"))
```

Output:

```
eval set: 20 cases, 4 critical, 5 per category

Scenario 1: better overall, but breaks a critical case
baseline  model-c-2025-11-02   pass 17/20   cost per 1k calls $0.19 (ILLUSTRATIVE prices)   latency 420 ms
candidate model-b-2026-06-15   pass 18/20   cost per 1k calls $1.62                         latency 900 ms
  improved: ['c03', 'c09']   regressed: ['c02']   malformed outputs: base 1, candidate 1
  sign test on 3 disagreeing case(s): p = 1.000 | candidate's pass rate 95% interval: 0.70 to 0.97
  decision: HOLD: regressed on critical case(s) c02

Scenario 2: a cheaper model that does as well on this set
baseline  model-c-2025-11-02   pass 17/20   cost per 1k calls $0.19 (ILLUSTRATIVE prices)   latency 420 ms
candidate model-c-2026-06-15   pass 18/20   cost per 1k calls $0.15                         latency 300 ms
  improved: ['c03']   regressed: none   malformed outputs: base 1, candidate 1
  sign test on 1 disagreeing case(s): p = 1.000 | candidate's pass rate 95% interval: 0.70 to 0.97
  decision: PROMOTE to a shadow/canary rollout (no critical regression; cost ratio 0.80)

How much can a 20-case set tell you? 95% interval for a measured pass rate:
   17/20  = 0.85  ->  0.64 to 0.95
   18/20  = 0.90  ->  0.70 to 0.97
  170/200 = 0.85  ->  0.79 to 0.89
  180/200 = 0.90  ->  0.85 to 0.93
fewest disagreeing cases for which a sign test can reach p < 0.05: 6 (all in one direction)

Scenario 3: a moving alias drifts, a pinned snapshot does not (weekly canary, the same 20 cases)
  week   alias 'model-c'   pinned snapshot   canary (* = critical case)
     0          18/20              18/20       ok
     1          18/20              18/20       ok
     2          18/20              18/20       ok
     3          17/20              18/20       ALERT, newly failing: c02*
     4          16/20              18/20       ALERT, newly failing: c02*, c15
```

Scenario 1 is the classic trap: the candidate passes more cases overall (18 against 17) but breaks a critical one, so the decision is HOLD. Scenario 2 promotes a cheaper model to a *shadow rollout*, not to production; the printed interval (0.70 to 0.97) is the reminder that 18 of 20 is compatible with many true pass rates. Scenario 3 shows why you pin: the pinned snapshot never moves while the alias loses the critical case in week 3, and only a scheduled run against the alias would have said so.

### 6. The official SDK (not executed)

> [!note] **NOT EXECUTED (needs the `openai` package and an API key).** `client.models.list()` and `client.models.retrieve(...)` are the calls shown in the API reference; `to_dict()` is the documented way to turn a response model into a dictionary, and list methods auto-paginate (SDK README, checked 26 Oct 2026). `shutdown_date` is read with `.get` because it is optional. No output is shown because none was produced.

```python
from openai import OpenAI

client = OpenAI()                                   # reads OPENAI_API_KEY from the environment
for model in client.models.list():
    d = model.to_dict()
    print(d["id"], d.get("shutdown_date"))

one = client.models.retrieve("model-a")             # a model ID from your registry
print(one.to_dict())
```

### What these results do and do not show

They show how to structure the problem: that a catalogue is data with stable axes and unstable values, that a registry can be validated and checked against the calendar and against the listing endpoint, and that a promote-or-hold rule can be written down and run. They do not show the capabilities, prices or quality of any real model, they do not show how a real model behaves on your task, and the scripted scenarios are chosen to illustrate decisions rather than to estimate how often each happens. The only real-world data are the dated observations from the provider's pages in the tables and in blocks 1 and 2.

## Visual diagram

```
 A CATALOGUE IS ROWS; YOUR CODE SHOULD USE THE COLUMNS

             tier    gen  reasoning  input        ctx / out limits  id kind          lifecycle
 model-a     large   3    yes        text,image   400k / 100k       dated snapshot   active
 model-b     medium  3    yes        text,image   400k / 64k        dated snapshot   active
 model-c     small   3    no         text,image   128k / 16k        dated snapshot   active
 model-c old small   2    no         text         128k / 16k        dated snapshot   deprecated, shuts 2026-12-11
                │
                ▼  registry.json: one record per model, with source URL and checked_on
 ┌─────────────────────────────────────────────────────────────────────┐
 │ validate(): contradictions            resolve(): calendar + needs   │
 └───────────────────┬───────────────────────────┬─────────────────────┘
                     ▼                           ▼
   shortlist(task): who qualifies            tasks.<name>.choice: primary + fallback
   (candidates to TEST, not a decision)          ▲ the winner is recorded as config
                     │                           │
 ┌───────────────────┴───────────────────────────┴─────────────────────┐
 │ canary: baseline vs candidate on YOUR eval set                      │
 │ improved, regressed, critical, malformed outputs, cost, latency     │
 └───────────────────┬─────────────────────────────────────┬───────────┘
                     ▼                                     ▼
                   HOLD                              PROMOTE to shadow rollout ──► scheduled canary on the alias

 LIFECYCLE
   announced + deprecated          shutdown_date is set              shut down
   │◄──── notice: the page says >= 6 months (GA), 3 months (specialized), ~2 weeks (preview) ────►│
   check GET /v1/models every day:   > 90 days left: info   <= 90: warn   <= 30: error   (registry thresholds)

 ALIAS vs SNAPSHOT
   "model-c"              ──moves──►  snapshot X   then   snapshot Y     behaviour can change with no change from you
   "model-c-2026-06-15"   ──fixed──►  snapshot X                         same behaviour until its shutdown_date
```

## Practice

### 1. Read a page into a registry entry

A model page (fictional) says: *Model ID `model-x`. Default snapshot `model-x-2026-08-20`. Input: text, image. Output: text. 200,000 context window, 32,000 max output tokens. Endpoints: Responses supported, Chat Completions supported, Embeddings not supported. Supported features: streaming, function calling. Snapshots: `model-x-2026-08-20`, `model-x-2026-03-02` (shutdown 2027-02-02).* Write the registry entries (as in block 3). Which fields can you not fill in from this page, and what do you do about them?

<details><summary>Answer</summary>

Two entries, not one: `model-x-2026-08-20` (with `"alias": "model-x"`, status `active`, `shutdown_date` `null`) and `model-x-2026-03-02` (`"alias": null`, status `deprecated`, `shutdown_date` `"2027-02-02"`). Common fields: `modalities_in` `["text", "image"]`, `modalities_out` `["text"]`, `context_window` 200000, `max_output_tokens` 32000, `endpoints` `["responses", "chat.completions"]`, `supports` `["streaming", "function_calling"]` (structured outputs is *not* listed, so it is not claimed). Not on this page: price (read the pricing page and record its date), whether it is a reasoning model (the page does not say; look for "reasoning token support" or effort values on the real page, and do not guess), tier and generation (your own judgement, recorded as such), and whether the older snapshot has the same limits (the page does not say, so check, because limits "will differ across model snapshots"). Fill `source` and `checked_on` for both.

</details>

### 2. Alert levels

With today = 2026-10-26 and the thresholds in `registry.json` (error at 30 days or fewer, warning at 90 or fewer), classify models whose `shutdown_date` is 2026-11-20, 2027-01-14 and 2027-03-01.

<details><summary>Answer</summary>

2026-11-20 is 25 days away: ERROR. 2027-01-14 is 80 days away: WARN. 2027-03-01 is 126 days away: info. (The block 4 output shows the same 126-day figure.) The thresholds are your policy, not the provider's: pick them from how long a migration, including its eval, takes you, and remember that notice has been as short as 20 days in the block 2 data.

</details>

### 3. Extend the registry

Add a hard requirement `max_output_tokens` to `why_not()` and a task that needs 20,000 output tokens. Which models in `registry.json` fail it?

<details><summary>Answer</summary>

Add to `why_not`:

```python
    if m["max_output_tokens"] < needs.get("max_output_tokens", 0):
        why.append("max output %d < %d" % (m["max_output_tokens"], needs["max_output_tokens"]))
```

With a requirement of 20,000, `model-c-2026-06-15` and `model-c-2025-11-02` (16,000 each) and `model-d-2026-04-01` (8,000) fail; `model-a-2026-09-01` (100,000) and `model-b-2026-06-15` (64,000) qualify. In real use, a limit like this is also a reason to check the model page for *effective* output limits when reasoning tokens share the budget (Module 05).

</details>

### 4. Make the call

A canary run on 40 cases reports: candidate improved 7 cases, regressed 1, no critical case among the regressions, malformed outputs 0 versus 1, and a cost ratio of 0.6. What does the sign test say, and what do you do?

<details><summary>Answer</summary>

Eight cases disagree, so the exact two-sided sign test gives `p = 2 x (C(8,0) + C(8,1)) / 2^8 = 18 / 256 = 0.070`. That is suggestive but not significant at 0.05. The decision rule passes (no critical regression, fewer malformed outputs, lower cost), so promote to a **shadow or small canary rollout**, not to full traffic, keep the fallback, and look at the single regressed case before anyone calls it noise. Note that the rule asked for no regression, not for a significant improvement; if "better" is the claim you need to make, you need more cases.

</details>

### Checkpoint quiz

1. Why does the tier word `Sol` not tell you a model's position in the lineup?
2. What does `GET /v1/models` return, and which three things that you need for routing does it not return?
3. What is the difference between a snapshot and an alias, and what should you do when a model page lists only one snapshot with the same name as the alias?
4. A candidate model passes 19 of 20 eval cases and the current one passes 17. Why is that not enough to switch?
5. Name two checks `resolve()` performs that `validate()` cannot.

<details><summary>Answers</summary>

1. Tier words are labels inside one generation's naming scheme. The catalogue page describes `Sol` as a flagship model in one generation and as a lower-cost, near-flagship model in another.
2. A list of model objects with `id`, `object`, `created`, `owned_by` and an optional `shutdown_date`. It does not return the context window or output limit, the modalities, endpoints and supported features, or the reasoning options and prices. Those come from the model and pricing pages.
3. A snapshot is a specific, dated version meant to keep behaviour consistent; an alias is a name that may be pointed at a different snapshot over time. If only one same-named snapshot is listed, there is nothing dated to pin to, so record what the page says and run a scheduled canary against it to catch changes.
4. Twenty cases give wide uncertainty (the 95% interval for 19/20 still spans roughly 0.76 to 0.99), the difference may come from only two or three cases, and a candidate can break a critical case while improving the average. Compare paired cases, check critical ones, and roll out gradually.
5. It checks the calendar (days until `shutdown_date` against the warn and error thresholds, and whether a model is already shut down) and it re-checks each task's requirements against the chosen primary and fallback models, so a fallback that lacks a required feature is reported.

</details>

> [!check]
> - I can describe a model on the seven axes without using its marketing name.
> - I can say what `GET /v1/models` returns, what it omits, and where the omitted facts are published.
> - I can explain snapshots versus aliases and why a pinned snapshot still needs a lifecycle check.
> - I can read a deprecation notice, compute the time left, and set alert thresholds that fit my migration time.
> - I can keep capabilities in a validated registry and select models per task from it.
> - I can run a baseline-versus-candidate comparison, read the sign test and the interval honestly, and write the decision rule before looking at the result.

## Project

Build a **model governance kit** for a small service of your own with two or three different tasks (for example classification, summarising, and a tool-calling assistant). Create a registry for at least four models you are allowed to use, filled in from the provider's own pages with source URLs and dates; a resolver that picks primary and fallback per task from config and reports requirement and lifecycle problems; a daily job that lists models through the API (or a stand-in you write) and prints a drift report like block 4's; and an eval set of at least 30 cases per task, drawn from realistic inputs, with critical cases marked and graders written as code. Then run a baseline-versus-candidate comparison for one task, write your decision rule before you run it, and report improved and regressed cases, malformed outputs, cost and latency per call using the provider's current prices (cite the page and date), the interval on each pass rate, and what your sample size can and cannot show. Add a scheduled run against the alias you actually call, with an alert. No code is given; decide the file formats and the interfaces yourself, and keep the eval set and harness in your own repository.

## Interview questions

> [!interview] The provider announces that a model your product depends on will shut down in 90 days. Walk through what you do.

<details><summary>What a strong answer covers</summary>

- Confirms the details from the provider's deprecation page and `shutdown_date` rather than from an email alone, and records them in the registry and the issue tracker with the date.
- Shortlists replacements from the registry using hard requirements (features, limits, modalities) and the provider's recommended replacement, then evaluates them on the team's own eval set, including critical cases, with a written decision rule.
- Plans the migration from the shutdown date backwards: eval, shadow traffic, gradual rollout, fallback, with time left for the parameter and prompt changes that a new generation may need.
- Remembers that notice has varied (months for general models, weeks for previews or special cases) and that the alert thresholds should reflect how long the team's own migration takes.
- Treats the new model as a change in behaviour, cost and latency, not just in a string.

</details>

> [!interview] A teammate wants to switch to "the newest and biggest model" because it is described as the most capable. How do you respond?

<details><summary>What a strong answer covers</summary>

- Agrees to evaluate it, not to adopt it: the provider's own selection guide calls its guidance "a starting point" and says to experiment and "keep the lightest setting that meets your quality bar".
- Lists what can differ besides quality: price per token and tokens per answer (reasoning tokens, verbosity), latency, parameter compatibility, endpoint and feature support, limits, and lifecycle.
- Runs the paired comparison on the team's eval set with critical cases, reports the interval and sample-size limits honestly, and checks cost per successful task, not only per call.
- Notes that a large model can be the wrong choice for easy, high-volume work, and a small one the wrong choice for hard, high-stakes work, and that this is decided per task.

</details>

> [!interview] Why pin model snapshots, and what are the costs of pinning?

<details><summary>What a strong answer covers</summary>

- Benefits: behaviour stays consistent between your tests and production; changes happen when you decide, with an eval; incident debugging is simpler because the model is a known quantity. Cites the research showing that the behaviour of the "same" service can drift over months.
- Costs: you must track shutdown dates and migrate on the provider's schedule; you may miss improvements until you upgrade; some models list no dated snapshot at all, so pinning is only as strong as the provider's promise and you still need a scheduled canary.
- Practice: keep the snapshot id, the alias, the date read and the source in a registry; alert on `shutdown_date`; re-run the eval on every candidate and on a schedule against the alias.

</details>

## Common mistakes & troubleshooting

- **A request fails with a "model not found" style error (HTTP 404).** The id is misspelled, retired, or not available to this credential. The API reference describes the 404 for Chat Completions as "the requested model or a referenced resource was not found or is unavailable to this caller". List models with that credential and compare with the registry (block 4).
- **Quality or format changed overnight and no code changed.** You are calling a moving alias. Pin a dated snapshot where one exists, and run a scheduled canary against the alias where it does not.
- **An upgrade started returning HTTP 400.** A parameter that the old model accepted is rejected by the new one: for example `none` as a reasoning effort on a model that does not support it. Check the migration notes and keep supported efforts in the registry.
- **Sampling parameters silently stopped mattering.** Per the Using GPT-6 guide, `temperature`, `top_p` and `top_logprobs` are to be removed when reasoning effort is not `none`. Read the model's guidance instead of assuming that a parameter is always honoured.
- **The bill went up after switching to a "cheaper per token" model.** Cost is tokens times price, and the token count per task can change with the model (reasoning tokens, longer answers). Compare cost per *successful task* on your eval set, with current prices from the pricing page.
- **The eval says "promote" and production says otherwise.** The eval set does not look like production traffic, or it is too small. Draw cases from logs, mark the critical ones, grow the set, and keep reporting intervals.
- **The registry is wrong.** Values were copied once and never re-read. Keep `checked_on` and `source` on every record, and fail a check when a record is older than your policy allows.
- **Nobody noticed a deprecation.** Email goes to one person. Check `shutdown_date` from `GET /v1/models` in a scheduled job and alert a team channel.

## Further reading & sources

- [OpenAI: Models](https://developers.openai.com/api/docs/models) - the catalogue block 1 reads, and the entry point to each model's page (limits, modalities, snapshots, reasoning options).
- [OpenAI: Deprecations](https://developers.openai.com/api/docs/deprecations) - the lifecycle definitions, notice periods and the dated entries used in block 2.
- [OpenAI API reference: List models](https://developers.openai.com/api/reference/resources/models/methods/list) - the response shape of `GET /v1/models`, including `shutdown_date`.
- [OpenAI: Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model) - an example of a generation's migration notes: unsupported parameters, effort values, endpoint differences.
- [OpenAI: Model selection](https://developers.openai.com/api/docs/guides/model-selection) - the guide whose closing advice (start from guidance, then experiment) this module turns into a harness.
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) - why LLM applications need task-specific evals, and how to design them.
- [OpenAI: Pricing](https://developers.openai.com/api/docs/pricing) - where current prices live; deliberately not quoted here, because they change.
- [How is ChatGPT's behavior changing over time? (Chen, Zaharia, Zou)](https://arxiv.org/abs/2307.09009) - the study of how the "same" model service changed across versions, the evidence behind pinning snapshots and monitoring.

## Next

[Module 05: Reasoning Models and Test-Time Compute](../05-reasoning-models-and-test-time-compute/README.md)
