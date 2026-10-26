# Module 10: The Anthropic Claude API

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**, at folder position 10. The earlier modules built the OpenAI-style picture: [Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md), [Module 03: Streaming Responses](../03-streaming-responses/README.md) and [Module 06: Function Calling Basics](../06-function-calling-basics/README.md) (this module takes the OpenAI-side facts for its comparison directly from OpenAI's published OpenAPI spec and error-codes guide, so it stands on its own), and [Module 09: Vision and Audio Inputs](../09-vision-and-audio-inputs/README.md) showed typed content parts. This module learns a **second provider's API from its official documentation**, and ends with a side-by-side table so the differences are explicit rather than folklore.

After this module you can:

- authenticate to the Messages API and explain the `anthropic-version` header;
- write a valid request (top-level `system`, the required `max_tokens`, messages made of content blocks) and read the response (`content` blocks, `stop_reason`, `usage`);
- parse the server-sent event stream, rebuild the final message from it, and survive in-stream errors and event types you have never seen;
- run the tool loop (`tool_use` out, `tool_result` back) and say precisely how it differs from the OpenAI-style loop;
- explain prompt caching, extended or adaptive thinking and image blocks **as the docs describe them**, with the cost arithmetic as tested functions;
- build a client with retries and a stand-in server to test it against, without an API key.

Why it matters: most production systems end up talking to more than one provider, and the failures are rarely in the happy path. They are in the details this module makes you read: a required field, a header you did not know existed, a tool result in the wrong position, a stream that dies after a 200, a tool argument you parsed too early.

> [!note] How to read this module. You cannot call a provider from this curriculum environment, so nothing here was sent to Anthropic. Everything runs against **a local stand-in that mimics the documented shape; the model behind it is scripted, not a real model**. Every field, header, event name and rule below was read from Anthropic's documentation fetched in **Oct 2026** (platform.claude.com/docs: API overview, versioning, Create a Message, Working with Messages, Streaming, tool use, prompt caching, extended thinking, vision, errors, rate limits). The docs are the source of truth and move quickly (the latest API version was dated 2026-10-21 when I read it). Model names, limits, prices and which model supports which feature are deliberately *not* stated here as facts: look them up on the day you build.

## Concept

> [!key] The Messages API is a stateless request/response API over a list of typed **content blocks**: the system prompt is a top-level field, `max_tokens` is required, and the same block vocabulary (`text`, `image`, `tool_use`, `tool_result`, `thinking`) flows in both directions. Tool use therefore is not a separate message role; it is blocks inside ordinary `user` and `assistant` messages, and the response's `stop_reason` tells your loop what to do next.

## Explanation

### What you send

**Endpoint and headers.** `POST https://api.anthropic.com/v1/messages`. The API overview lists the headers (checked Oct 2026):

| Header | Meaning |
| --- | --- |
| `Authorization: Bearer <token>` | your API key (or a short-lived token from Workload Identity Federation); required unless `x-api-key` is set |
| `x-api-key: <key>` | "Legacy fallback for `Authorization`, still supported"; most cURL examples in the docs still use it |
| `anthropic-version` | **required**; the API version, for example `2026-10-21`; the SDKs send it for you |
| `content-type: application/json` | required |
| `anthropic-workspace-id` | needed when your key is not scoped to one workspace |

Three behaviours to know. First, the version header is a contract: the versioning page promises that for a given version Anthropic keeps existing inputs and outputs, but may add optional inputs, add output values, add new enum-like values (the page names streaming event types) and change conditions for specific errors. So your code must **tolerate additions** and you should upgrade the version on purpose, with tests. Second, versions change behaviour: the page says that from `2026-10-21` the `temperature`, `top_p` and `top_k` parameters are removed and a request that sends any of them gets a 400 (the docs' older examples still show `2023-06-01`, which is the version where the current streaming format began). Third, API keys are secrets: the Authentication page distinguishes personal keys, service-account keys and legacy workspace keys, and recommends a secrets manager and rotation.

**Body.** The Create a Message reference lists the parameters. The ones this module uses:

| Field | Notes from the reference |
| --- | --- |
| `model` | a model id string; keep it in configuration. The Models API (`GET /v1/models`) lists what is available |
| `max_tokens` | **required**; "the maximum number of tokens to generate before stopping"; the model may stop earlier; different models have different maximums |
| `messages` | required; alternating `user` and `assistant` turns; consecutive turns of the same role "will be combined into a single turn"; up to 100,000 messages; content is a string (shorthand for one `text` block) or an array of blocks |
| `system` | optional; a string or an array of text blocks; this is where the system prompt goes |
| `stream` | `true` for server-sent events |
| `stop_sequences` | custom strings that end generation; `stop_reason` becomes `stop_sequence` |
| `tools`, `tool_choice` | tool definitions and how the model may use them |
| `thinking`, `output_config` | reasoning controls (see below); `output_config` also holds `effort` and a JSON-schema output `format` |
| `metadata.user_id` | an opaque id (uuid or hash) for abuse detection; "do not include any identifying information such as name, email address, or phone number" |
| `cache_control` | prompt-caching marker (top level, or on individual blocks) |

The maximum request size for the Messages API is 32 MB; larger returns 413 `request_too_large`. Two things the OpenAI-style habit gets wrong: there is **no `system` role message to start the list** (a first message with role `system` is invalid; the docs describe a later, restricted `system`-role message mid-conversation on some models), and **`max_tokens` has no default**.

### What comes back

The response is one `message` object:

```
{ "id": "msg_...", "type": "message", "role": "assistant",
  "content": [ {"type": "text", "text": "..."}, ... ],      <- a list of blocks
  "model": "...", "stop_reason": "end_turn", "stop_sequence": null,
  "usage": {"input_tokens": 12, "output_tokens": 6, ...} }
```

`stop_reason` is how a loop decides what to do (values from the reference, checked Oct 2026):

| `stop_reason` | Meaning | What your code does |
| --- | --- | --- |
| `end_turn` | natural stopping point | return the answer |
| `max_tokens` | hit your `max_tokens` (or the model's maximum) | the text is cut off: raise the cap, continue, or flag it |
| `stop_sequence` | one of your `stop_sequences` matched (see the `stop_sequence` field) | return |
| `tool_use` | the model wants tools run | run them, send `tool_result`, loop |
| `pause_turn` | a long-running turn was paused | send the response back as-is to let it continue |
| `refusal` | classifiers intervened; `stop_details` names a policy category | stop, surface it, do not blindly retry |
| `model_context_window_exceeded` | the context window was exceeded | shorten or summarise the history |

`usage` reports `input_tokens` and `output_tokens`, plus cache fields. The reference says the counts "will not match one-to-one with the exact visible content" of a request, and that **total input tokens is the sum of `input_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens`**. With caching on, `input_tokens` alone is only the part *after* the last cache breakpoint, which is a classic source of "my usage looks too small" bugs.

### Streaming events

Set `"stream": true` and the body becomes server-sent events (SSE, a standard text format: `event:` line, `data:` line, blank line; see the [WHATWG spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)). The Streaming page documents this flow:

1. `message_start`: a `message` object with an empty `content`; `stop_reason` is `null`; `usage` already has the input tokens.
2. For each content block: `content_block_start`, one or more `content_block_delta`, `content_block_stop`. Each carries an `index` matching the block's position in the final `content` array.
3. One or more `message_delta`: top-level changes, carrying `stop_reason` and `usage`. The docs warn that the usage there is **cumulative**.
4. `message_stop`.

`ping` events can appear anywhere; an `error` event can arrive **after the 200** (the docs' example is `overloaded_error`, which maps to HTTP 529 outside streaming); and under the versioning policy new event types may be added, so "your code should handle unknown event types gracefully". Delta types: `text_delta` (a piece of text), `input_json_delta` (a piece of a tool call's JSON, as a **partial string**; you accumulate the strings and parse once at `content_block_stop`), `thinking_delta` and `signature_delta` (just before a thinking block closes), plus `citations_delta`. Compare the OpenAI-style stream ([Module 03: Streaming Responses](../03-streaming-responses/README.md)): unnamed `data:` frames and a literal `data: [DONE]` at the end; the versioning page records that Anthropic removed its own `[DONE]` event in version `2023-06-01`.

> [!pitfall] Do not `json.loads` a tool call's `partial_json` as it arrives. A fragment such as `{"city":` is not valid JSON, and the docs say current models emit one complete key and value at a time, so there can be pauses between fragments. Concatenate, and parse at `content_block_stop`.

### Tool use: the loop

The docs' framing: "Tool use is a contract between your application and the model." You describe tools (`name`, `description`, `input_schema` as JSON Schema); the model never runs anything. When it wants a tool it answers with `stop_reason: "tool_use"` and one or more `tool_use` blocks (`id`, `name`, `input` as a JSON **object**). Your code runs the function and sends the results in the **next user message** as `tool_result` blocks (`tool_use_id`, `content`, optional `is_error`). The canonical loop is a `while` on `stop_reason == "tool_use"`.

The docs state formatting rules that cause real 400s:

- tool results must immediately follow their `tool_use` blocks: no message in between;
- in the user message, `tool_result` blocks must come **first** in the content array; any text comes after them;
- one assistant turn with several `tool_use` blocks (parallel calls) is answered by **one** user message with several `tool_result` blocks;
- a failing tool is reported with `"is_error": true` and an instructive message, not by crashing your loop;
- tool results can carry untrusted content (web pages, email, uploads): keep it inside `tool_result` blocks and read [Module 12: Prompt Injection Attacks](../../07-prompt-engineering/12-prompt-injection-attacks/README.md).

The docs also give the contrast with other APIs themselves: "Unlike APIs that separate tool use or use special roles like `tool` or `function`, the Claude API integrates tools directly into the `user` and `assistant` message structure." Tools are also sorted by who runs them: your own functions (this loop), Anthropic-defined schemas that you still run (bash, text editor, computer use, and others), and **server tools** that Anthropic runs for you (web search and similar), where you do not build a `tool_result`.

### Vision input blocks

Images are `image` blocks with a `source` of type `base64` (`media_type` plus `data`), `url`, or `file` (an id from the Files API). Supported media types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. From the Vision page (checked Oct 2026): up to 100 images per request for models with a 200k-token context window and 600 for others; each image up to 8000 × 8000 pixels; 10 MB per image base64-encoded on the direct API; the 32 MB request cap can bind first; animations are unsupported (first frame only). Cost is in **28 × 28 pixel patches**: an image costs `ceil(width/28) × ceil(height/28)` visual tokens, after the image is downsized to the model tier's limit (the page lists a long-edge cap and a token cap per tier and says high-resolution tiers can cost up to roughly three times more). The page advises putting images before text. Block 7 below tests the formula against the page's own table. For the OpenAI-side accounting (32 px patches, tiles, `detail`) see [Module 09](../09-vision-and-audio-inputs/README.md); for how models see images, [Track 16, Module 12: Vision: How LLMs See Images](../../16-speech-and-multimodal-models/12-vision-how-llms-see-images/README.md).

### Prompt caching (as the docs describe it)

Caching reuses a **prefix** of your prompt. The page says the prefix is `tools`, then `system`, then `messages`, "up to and including the block designated with `cache_control`". You mark it with `"cache_control": {"type": "ephemeral"}` on a block, or once at the top level for automatic caching of the last cacheable block. The default lifetime is 5 minutes, refreshed each time the entry is read, and a 1-hour option exists at extra cost. Other documented facts: up to 4 explicit breakpoints; a 20-block lookback window; a minimum cacheable prompt length that depends on the model (shorter prompts are processed without caching **and no error is returned**, so check the usage fields); changing tool definitions invalidates the whole cache, and the page's invalidation table and troubleshooting notes also list thinking and effort settings, `tool_choice` and the presence of images.

How you know it worked: the response `usage` has `cache_creation_input_tokens` (written now) and `cache_read_input_tokens` (read now); if both are 0 the prompt was not cached. The pricing section lists multipliers on the base input price: a 5-minute write 1.25x, a 1-hour write 2x, a read 0.1x, with some models listed at a lower read multiplier. Prices themselves are not repeated here; Block 7 uses the multipliers with unit prices. Rule of thumb that follows from the arithmetic: put the stable material (tool definitions, long instructions, reference documents) first, the varying part last, and put the breakpoint at the end of the stable part. A timestamp inside the cached prefix means you pay for a fresh write on every call and never get a read.

### Thinking (as the docs describe it)

A `thinking` request parameter turns on model reasoning before the answer. What is accepted **depends on the model**, and the docs keep a per-model table: `{"type": "adaptive"}` lets the model decide when and how much to think, steered by `output_config.effort` (`low` to `max`); `{"type": "enabled", "budget_tokens": N}` is the older manual mode (N at least 1,024 and below `max_tokens`) that the docs mark deprecated on some models and rejected with a 400 on newer ones; some models reject `{"type": "disabled"}`. Responses contain `thinking` blocks (with a `signature`) before the text. Three rules matter for code: thinking tokens count toward `max_tokens` and are billed as output (`usage.output_tokens_details.thinking_tokens` breaks them out); when you continue a tool loop you must pass thinking blocks back **exactly as received**, because a modified block gets a 400; and changing the thinking configuration between requests invalidates cached message prefixes. Streaming delivers them as `thinking_delta` and `signature_delta`.

### Errors, retries and limits

The errors page lists the status codes and their `error.type`: 400 `invalid_request_error`, 401 `authentication_error`, 402 `billing_error`, 403 `permission_error`, 404 `not_found_error`, 413 `request_too_large`, 429 `rate_limit_error`, 500 `api_error`, 504 `timeout_error`, 529 `overloaded_error`. The body is always `{"type": "error", "error": {"type": ..., "message": ...}, "request_id": ...}`, and every response carries a `request-id` header: log it, support will ask for it. A 429 may carry `retry-after`, but **not** the one for reaching a spend cap, which keeps failing until access resumes. Rate-limit state is in `anthropic-ratelimit-*` headers (requests, tokens, input tokens, output tokens: limit, remaining, reset). The official SDK retries transient failures twice by default with exponential backoff and honours `retry-after`. For long requests the docs recommend streaming (or the Batches API) rather than one long blocking request, since idle connections get dropped. [Module 16: Pricing, Rate Limits and Quotas](../16-pricing-rate-limits-and-quotas/README.md) goes deeper on limits.

### Side by side: OpenAI-style Chat Completions and Anthropic Messages

Drawn from OpenAI's OpenAPI spec (commit of 2026-10-24) and error-codes guide, and the Anthropic pages above, all checked Oct 2026. It describes shapes, not quality, and no provider is ranked.

| | OpenAI-style (Chat Completions) | Anthropic (Messages) |
| --- | --- | --- |
| **Request** | | |
| Endpoint, auth | `POST /v1/chat/completions`; bearer token | `POST /v1/messages`; bearer token (or legacy `x-api-key`) **plus a required `anthropic-version` header** |
| System prompt | a message with role `system` or `developer` inside `messages` | top-level `system` (string or text blocks); not a first message |
| Output cap | `max_completion_tokens`, optional (`max_tokens` is deprecated) | `max_tokens`, **required** |
| Sampling knobs | `temperature` and others accepted (per model) | not accepted at all from API version `2026-10-21` (400) |
| Message content | string, or array of parts (`text`, `image_url`, `input_audio`, `file`) | string, or array of blocks (`text`, `image`, `document`, `tool_use`, `tool_result`, `thinking`, ...) |
| Roles | `system`/`developer`, `user`, `assistant`, `tool` | `user`, `assistant` (and a restricted mid-conversation `system`); tool output is a block in a `user` message |
| Several answers | `n` choices | one message per request |
| **Response** | | |
| Shape | `choices[]`, each with a `message` | one message with a `content[]` array of blocks |
| Stop signal | `finish_reason`: `stop`, `length`, `tool_calls`, `content_filter` (and deprecated `function_call`) | `stop_reason`: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `model_context_window_exceeded` |
| Usage | `prompt_tokens`, `completion_tokens`, `total_tokens` | `input_tokens`, `output_tokens`, cache fields; total input = read + creation + `input_tokens` |
| **Errors** | | |
| Body | `{"error": {"message", "type", "param", "code"}}` | `{"type": "error", "error": {"type", "message"}, "request_id"}` |
| Overload, billing | 503 `service_unavailable_error` / `server_is_overloaded`; 429 with codes such as `credit_balance_exhausted` | 529 `overloaded_error`; 402 `billing_error` |
| Retry hints | `Retry-After` when present | `retry-after` (not on spend-cap 429s); `request-id` header and `request_id` in the body |
| **Streaming** | | |
| Frames | unnamed `data: {chunk}` lines; chunk has `choices[].delta` | named events (`event:` + `data:`): `message_start`, `content_block_*`, `message_delta`, `message_stop`, `ping`, `error` |
| End | literal `data: [DONE]` | `message_stop` event |
| Usage | extra final chunk only if `stream_options.include_usage` | input tokens in `message_start`; cumulative output tokens in `message_delta` |
| Mid-stream error | a `data:` frame holding an `error` object; the stream may just end | `event: error` frame (for example `overloaded_error`) |
| **Tools** | | |
| Declare | `{"type": "function", "function": {"name", "description", "parameters"}}` | `{"name", "description", "input_schema"}` |
| Model's call | `message.tool_calls[]`, `function.arguments` is a JSON **string** | `tool_use` blocks, `input` is a JSON **object** |
| Your result | one `{"role": "tool", "tool_call_id", "content"}` message per call | `tool_result` blocks (`tool_use_id`, optional `is_error`) first in **one** `user` message |
| Loop condition | `finish_reason == "tool_calls"` | `stop_reason == "tool_use"` |
| Force or limit | `tool_choice` `none`/`auto`/`required`/named function; `parallel_tool_calls` | `tool_choice` `auto`/`any`/`tool`/`none`; `disable_parallel_tool_use` |
| Streamed arguments | `tool_calls[].function.arguments` fragments, matched by index | `input_json_delta.partial_json` fragments, matched by block index |

## Code

Plain Python 3.13 standard library. Seven blocks form one file: paste them in order into `claude_lab.py` and run it. Block 2 (the stand-in server) is collapsed. Each block prints under a numbered header and the output is pasted from a real run (the run is deterministic: four runs gave identical output).

### Block 1: headers, the smallest valid request, a local checker

The checker encodes rules from the Create a Message reference so you can catch a bad request before it costs a round trip. Error wording is mine; the rules are the documented ones.

```python
import json
import os
import re

# Configuration, not constants: both values are documented to change over time.
API_VERSION = os.environ.get("ANTHROPIC_VERSION", "2026-10-21")   # the 'anthropic-version' header
MODEL = os.environ.get("CLAUDE_MODEL", "your-claude-model-id")      # look up current ids on the models page
BASE_URL = "https://api.anthropic.com"                              # the local run points at a stand-in instead

def request_headers(api_key, version=API_VERSION, style="bearer"):
    """Headers the API overview documents. 'Authorization: Bearer <key>' is the current form;
    'x-api-key' is described as a legacy fallback that is still supported."""
    auth = {"Authorization": f"Bearer {api_key}"} if style == "bearer" else {"x-api-key": api_key}
    return {**auth, "anthropic-version": version, "content-type": "application/json"}

# Parameters that API version 2026-10-21 rejects with a 400 (versioning page, checked Oct 2026)
REMOVED_IN_2026_10_21 = ("temperature", "top_p", "top_k")
TOOL_NAME = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")                    # from the Create a Message reference

def check_request(body, version=API_VERSION):
    """Cheap local checks taken from the Create a Message reference (my checks, not the server's)."""
    problems = []
    if not isinstance(body.get("max_tokens"), int) or body["max_tokens"] < 0:
        problems.append("max_tokens is REQUIRED and must be an integer >= 0")
    msgs = body.get("messages")
    if not msgs:
        problems.append("messages must be a non-empty list")
    else:
        for i, m in enumerate(msgs):
            if m.get("role") not in ("user", "assistant", "system"):
                problems.append(f"messages[{i}].role must be 'user' or 'assistant'")
            if m.get("role") == "system" and i == 0:
                problems.append("a system message cannot be the first entry in messages: use the top-level system field")
    for t in body.get("tools", []):
        if not TOOL_NAME.match(t.get("name", "")) or "input_schema" not in t:
            problems.append(f"tool {t.get('name')!r} needs a name matching [a-zA-Z0-9_-]{{1,128}} and an input_schema")
    th = body.get("thinking") or {}
    if th.get("type") == "enabled" and not 1024 <= th.get("budget_tokens", 0) < body.get("max_tokens", 0):
        problems.append("thinking.budget_tokens must be >= 1024 and < max_tokens")
    if version >= "2026-10-21":
        problems += [f"{p} is removed in API version 2026-10-21" for p in REMOVED_IN_2026_10_21 if p in body]
    return problems

def message_request(user_text, *, system=None, max_tokens=256, tools=None, stream=False, **extra):
    body = {"model": MODEL, "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": user_text}]}
    if system:
        body["system"] = system                        # top-level field, NOT a message
    if tools:
        body["tools"] = tools
    if stream:
        body["stream"] = True
    return {**body, **extra}

WEATHER_TOOL = {
    "name": "get_weather",
    "description": "Get the current weather for a city.",
    "input_schema": {"type": "object",
                     "properties": {"city": {"type": "string", "description": "City name, e.g. Paris"}},
                     "required": ["city"]},
}

if __name__ == "__main__":
    print("=== 1. the smallest valid request ===")
    print(json.dumps(request_headers("<your-key-here>"), indent=2))
    body = message_request("Hello, Claude", system="You are terse.", max_tokens=64)
    print(json.dumps(body, indent=2))
    print("problems:", check_request(body))
    print("--- things the checker catches ---")
    print(check_request({"model": MODEL, "messages": [{"role": "system", "content": "hi"}]}))
    print(check_request({**body, "temperature": 0.2}))
    print(check_request({**body, "temperature": 0.2}, version="2023-06-01"))
    print(check_request({**body, "thinking": {"type": "enabled", "budget_tokens": 500}}))
```

Output:

```
=== 1. the smallest valid request ===
{
  "Authorization": "Bearer <your-key-here>",
  "anthropic-version": "2026-10-21",
  "content-type": "application/json"
}
{
  "model": "your-claude-model-id",
  "max_tokens": 64,
  "messages": [
    {
      "role": "user",
      "content": "Hello, Claude"
    }
  ],
  "system": "You are terse."
}
problems: []
--- things the checker catches ---
['max_tokens is REQUIRED and must be an integer >= 0', 'a system message cannot be the first entry in messages: use the top-level system field']
['temperature is removed in API version 2026-10-21']
[]
['thinking.budget_tokens must be >= 1024 and < max_tokens']
```

### Block 2: the local stand-in (plumbing)

**A local stand-in that mimics the documented shape; the model behind it is scripted, not a real model.** It checks credentials and the version header, validates the body (including the tool-result rules and the "thinking blocks must be unmodified" rule), answers with a message object, can stream the documented event sequence, fakes cache accounting, and can inject faults (a 429 with `retry-after`, a 529, an error event in the middle of a stream). Its "model" is a few `if` statements: if a `get_weather` tool is offered and the text mentions weather in a city, it calls the tool; if the last message holds tool results, it quotes them; otherwise it echoes. Token counts are whitespace-separated pieces of JSON, **not** a tokenizer. The error messages are its own words; the error shape and type names are the documented ones.

<details>
<summary>The stand-in server (about 250 lines)</summary>

```python
import hashlib
import http.server
import threading
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# A LOCAL STAND-IN that mimics the documented Messages API shapes: request
# validation, the message object, tool_use / tool_result, thinking blocks with a
# signature, usage with cache fields, and the SSE event sequence.
# The model behind it is SCRIPTED (a few if-statements); it is not a model.
# Error wording is the stand-in's own; the error *shape* and the type names are
# the documented ones.
# ---------------------------------------------------------------------------
ERROR_TYPES = {400: "invalid_request_error", 401: "authentication_error", 413: "request_too_large",
               429: "rate_limit_error", 500: "api_error", 529: "overloaded_error"}

class Bad(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status

def n_tokens(block):
    """Crude stand-in for a tokenizer: whitespace-separated pieces of the block's JSON."""
    return len(json.dumps(block, sort_keys=True).split())

def prompt_blocks(body):
    """Flatten tools -> system -> messages, the order the caching docs say the cached prefix follows."""
    out = list(body.get("tools", []))
    system = body.get("system")
    if isinstance(system, str):
        out.append({"type": "text", "text": system})
    elif system:
        out += list(system)
    for m in body["messages"]:
        out += [{"type": "text", "text": m["content"]}] if isinstance(m["content"], str) else list(m["content"])
    return out

def sign(thinking_text):
    return "sig-" + hashlib.sha256(thinking_text.encode()).hexdigest()[:12]

def validate(body, version):
    if not version:
        raise Bad("anthropic-version header is required")
    for p in ("temperature", "top_p", "top_k"):
        if version >= "2026-10-21" and p in body:
            raise Bad(f"{p}: not supported with anthropic-version {version}")
    if not isinstance(body.get("max_tokens"), int):
        raise Bad("max_tokens: Field required")
    msgs = body.get("messages")
    if not msgs:
        raise Bad("messages: at least one message is required")
    for i, m in enumerate(msgs):
        if m.get("role") not in ("user", "assistant", "system"):
            raise Bad(f"messages.{i}.role: must be 'user' or 'assistant'")
        if m["role"] == "system" and i == 0:
            raise Bad("messages.0: a system message cannot be the first entry; use the top-level system field")
        if i + 1 < len(msgs) and isinstance(m["content"], list):
            ids = [b["id"] for b in m["content"] if b.get("type") == "tool_use"]
            if ids:
                nxt = msgs[i + 1]["content"]
                kinds = [b.get("type") for b in nxt] if isinstance(nxt, list) else []
                got = [b.get("tool_use_id") for b in nxt if b.get("type") == "tool_result"] if kinds else []
                if msgs[i + 1]["role"] != "user" or sorted(got) != sorted(ids):
                    raise Bad(f"messages.{i}: tool_use ids were found without tool_result blocks immediately after: {ids}")
                if "tool_result" in kinds and kinds != sorted(kinds, key=lambda k: k != "tool_result"):
                    raise Bad(f"messages.{i + 1}: tool_result blocks must come first in the content array")
    last_assistant = next((m for m in reversed(msgs) if m["role"] == "assistant"), None)
    if last_assistant and isinstance(last_assistant["content"], list):
        for b in last_assistant["content"]:
            if b.get("type") == "thinking" and b.get("signature") != sign(b.get("thinking", "")):
                raise Bad("`thinking` or `redacted_thinking` blocks in the latest assistant message cannot be "
                          "modified. These blocks must remain as they were in the original response.")

def scripted_reply(body, server):
    last = body["messages"][-1]
    blocks = [{"type": "text", "text": last["content"]}] if isinstance(last["content"], str) else last["content"]
    results = [b for b in blocks if b["type"] == "tool_result"]
    tools = {t["name"] for t in body.get("tools", [])}
    user_text = " ".join(b["text"] for b in blocks if b["type"] == "text")
    if results:
        parts = [("error: " if r.get("is_error") else "") + str(r.get("content", "")) for r in results]
        return [{"type": "text", "text": "Here is what I found: " + "; ".join(parts) + "."}], "end_turn"
    cities = re.findall(r"\b(?:in|and)\s+([A-Z][a-z]+)", user_text)
    if "get_weather" in tools and "weather" in user_text.lower() and cities:
        content = [{"type": "text", "text": "I'll check the weather."}]
        for city in cities:
            server.tool_counter += 1
            content.append({"type": "tool_use", "id": f"toolu_standin_{server.tool_counter:02d}",
                            "name": "get_weather", "input": {"city": city}})
        return content, "tool_use"
    return [{"type": "text", "text": f"(scripted) You said: {user_text}"}], "end_turn"

def usage_for(body, out_tokens, server):
    """input_tokens = tokens AFTER the last cache breakpoint, as the caching docs define it."""
    blocks = prompt_blocks(body)
    total = sum(n_tokens(b) for b in blocks)
    marks = [i for i, b in enumerate(blocks) if b.get("cache_control")]
    if body.get("cache_control"):
        marks.append(len(blocks) - 1)                     # top-level (automatic) caching: last block
    usage = {"input_tokens": total, "output_tokens": out_tokens}
    if not marks:
        return usage
    prefix_blocks = blocks[:max(marks) + 1]
    prefix = sum(n_tokens(b) for b in prefix_blocks)
    key = hashlib.sha256(json.dumps(prefix_blocks, sort_keys=True).encode()).hexdigest()
    usage.update(cache_creation_input_tokens=0, cache_read_input_tokens=0)
    if prefix >= server.min_cache_tokens:                 # shorter prompts are processed without caching, no error
        usage["input_tokens"] = total - prefix
        if key in server.cache:
            usage["cache_read_input_tokens"] = prefix
        else:
            server.cache.add(key)
            usage["cache_creation_input_tokens"] = prefix
    return usage

class StandInAnthropic(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, min_cache_tokens=40):
        super().__init__(("127.0.0.1", 0), _Handler)
        self.faults, self.cache, self.requests = [], set(), []
        self.tool_counter = self.msg_counter = 0
        self.min_cache_tokens = min_cache_tokens

    @property
    def base(self):
        return f"http://127.0.0.1:{self.server_address[1]}"

    def start(self):
        threading.Thread(target=self.serve_forever, daemon=True).start()
        return self

    def stop(self):
        self.shutdown()
        self.server_close()

class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, status, obj, extra=None):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("request-id", f"req_standin_{self.server.msg_counter:03d}")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _fail(self, status, message, extra=None):
        err = {"type": "error", "error": {"type": ERROR_TYPES[status], "message": message},
               "request_id": f"req_standin_{self.server.msg_counter:03d}"}
        self._json(status, err, extra)

    def _event(self, name, data):
        self.wfile.write(f"event: {name}\ndata: {json.dumps(data)}\n\n".encode())
        self.wfile.flush()

    def do_POST(self):
        srv = self.server
        body_bytes = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        srv.msg_counter += 1
        if srv.faults and srv.faults[0].get("status"):
            f = srv.faults.pop(0)
            return self._fail(f["status"], f.get("message", "injected fault"),
                              {"retry-after": f["retry_after"]} if "retry_after" in f else None)
        bearer = self.headers.get("Authorization", "").startswith("Bearer ")
        if not (bearer or self.headers.get("x-api-key")):
            return self._fail(401, "missing credentials: send Authorization: Bearer <key> (or the legacy x-api-key)")
        if self.path != "/v1/messages":
            return self._fail(400, "unknown route")
        try:
            body = json.loads(body_bytes)
            validate(body, self.headers.get("anthropic-version"))
        except Bad as err:
            return self._fail(err.status, str(err))
        except ValueError:
            return self._fail(400, "request body is not valid JSON")
        srv.requests.append({"version": self.headers.get("anthropic-version"), "body": body})

        content, stop = scripted_reply(body, srv)
        if body.get("thinking", {}).get("type") in ("adaptive", "enabled", "between_tools"):
            text = "(scripted reasoning) decide whether a tool is needed"
            content = [{"type": "thinking", "thinking": text, "signature": sign(text)}] + content
        out_tokens = sum(n_tokens(b) for b in content)
        if stop == "end_turn" and out_tokens > body["max_tokens"]:
            words = content[-1]["text"].split()
            content[-1]["text"] = " ".join(words[:max(1, body["max_tokens"] - 2)])
            stop, out_tokens = "max_tokens", body["max_tokens"]
        message = {"id": f"msg_standin_{srv.msg_counter:03d}", "type": "message", "role": "assistant",
                   "content": content, "model": body.get("model"), "stop_reason": stop, "stop_sequence": None,
                   "usage": usage_for(body, out_tokens, srv)}
        if not body.get("stream"):
            return self._json(200, message)
        return self._stream(message)

    def _stream(self, message):
        fault = self.server.faults.pop(0) if self.server.faults else {}
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("request-id", f"req_standin_{self.server.msg_counter:03d}")
        self.end_headers()                                  # no Content-Length: the stream ends when the socket closes
        start = {**message, "content": [], "stop_reason": None,
                 "usage": {**message["usage"], "output_tokens": 1}}
        sent = 0
        def emit(name, data):
            nonlocal sent
            if fault.get("stream_error_after") == sent:
                self._event("error", {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}})
                raise ConnectionAbortedError
            self._event(name, data)
            sent += 1
        try:
            emit("message_start", {"type": "message_start", "message": start})
            for i, block in enumerate(message["content"]):
                kind = block["type"]
                empty = {"text": {"type": "text", "text": ""},
                         "thinking": {"type": "thinking", "thinking": ""},
                         "tool_use": {**block, "input": {}}}[kind]
                emit("content_block_start", {"type": "content_block_start", "index": i, "content_block": empty})
                if i == 0:
                    emit("ping", {"type": "ping"})
                    emit("x_future_event", {"type": "x_future_event"})    # clients must ignore unknown events
                if kind == "text":
                    pieces = re.findall(r"(?:\S+\s*){1,3}", block["text"])
                    deltas = [{"type": "text_delta", "text": p} for p in pieces]
                elif kind == "thinking":
                    pieces = re.findall(r"(?:\S+\s*){1,3}", block["thinking"])
                    deltas = [{"type": "thinking_delta", "thinking": p} for p in pieces]
                    deltas.append({"type": "signature_delta", "signature": block["signature"]})
                else:
                    raw = json.dumps(block["input"])
                    deltas = [{"type": "input_json_delta", "partial_json": ""}] + \
                             [{"type": "input_json_delta", "partial_json": raw[j:j + 8]} for j in range(0, len(raw), 8)]
                for d in deltas:
                    emit("content_block_delta", {"type": "content_block_delta", "index": i, "delta": d})
                emit("content_block_stop", {"type": "content_block_stop", "index": i})
            emit("message_delta", {"type": "message_delta",
                                   "delta": {"stop_reason": message["stop_reason"], "stop_sequence": None},
                                   "usage": {"output_tokens": message["usage"]["output_tokens"]}})
            emit("message_stop", {"type": "message_stop"})
        except ConnectionError:                  # the injected error above, or a client that hung up early
            pass
```

</details>

### Block 3: the client, an SSE parser, a stream accumulator and the tool loop

This is the part you would keep. `Claude._open` is the retry logic: `429` and `5xx` are retried, using `retry-after` when the server sends it and exponential backoff with jitter otherwise; anything else is raised at once. `parse_sse` is a generic SSE reader. `StreamAccumulator` rebuilds the message from the event flow. `run_tool_loop` is the `while stop_reason == "tool_use"` loop from the docs.

```python
import copy
import random
import time

class ApiError(Exception):
    """The documented error envelope: {"type": "error", "error": {"type", "message"}, "request_id"}."""
    def __init__(self, status, etype, message, request_id=None, retry_after=None):
        super().__init__(f"{status} {etype}: {message}")
        self.status, self.etype, self.message = status, etype, message
        self.request_id, self.retry_after = request_id, retry_after

RETRYABLE = {429, 500, 502, 503, 504, 529}      # rate limit, server trouble, overloaded; never 400/401/403/404/413

class Claude:
    def __init__(self, base, api_key, *, version=API_VERSION, style="bearer", max_retries=2,
                 sleep=time.sleep, rng=None):
        self.base, self.api_key, self.version, self.style = base, api_key, version, style
        self.max_retries, self.sleep, self.rng = max_retries, sleep, rng or random.Random(0)
        self.retries_made = 0

    def _request(self, body):
        return urllib.request.Request(self.base + "/v1/messages", data=json.dumps(body).encode(), method="POST",
                                      headers=request_headers(self.api_key, self.version, self.style))

    @staticmethod
    def _error(err):
        payload = json.loads(err.read() or b"{}")
        e = payload.get("error", {})
        return ApiError(err.code, e.get("type", "unknown"), e.get("message", ""),
                        payload.get("request_id"), err.headers.get("retry-after"))

    def _open(self, body):
        """POST with retries. Wait = Retry-After if the server sent one, else exponential backoff + jitter."""
        for attempt in range(self.max_retries + 1):
            try:
                return urllib.request.urlopen(self._request(body), timeout=10)
            except urllib.error.HTTPError as err:
                api_err = self._error(err)
                if err.code not in RETRYABLE or attempt == self.max_retries:
                    raise api_err
                wait = float(api_err.retry_after) if api_err.retry_after else \
                    min(8.0, 0.5 * 2 ** attempt) * (0.5 + self.rng.random() / 2)
                self.retries_made += 1
                self.sleep(wait)

    def create(self, **body):
        with self._open(body) as resp:
            return json.loads(resp.read())

    def stream_events(self, **body):
        """Yield (event_name, data) pairs from the SSE stream; raise on an in-stream error event."""
        with self._open({**body, "stream": True}) as resp:
            for name, data in parse_sse(resp):
                if name == "error":
                    e = data["error"]
                    raise ApiError(200, e["type"], e["message"])     # HTTP status was already 200
                yield name, data

def parse_sse(lines):
    event, data = None, []
    for raw in lines:
        line = raw.decode("utf-8").rstrip("\r\n")
        if line == "":
            if data:
                yield event or "message", json.loads("\n".join(data))
            event, data = None, []
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].removeprefix(" "))

class StreamAccumulator:
    """Rebuilds the final message object from the documented event sequence."""
    def __init__(self):
        self.message, self.json_buffers = None, {}

    def feed(self, name, ev):
        if name == "message_start":
            self.message = copy.deepcopy(ev["message"])
        elif name == "content_block_start":
            self.message["content"].append(copy.deepcopy(ev["content_block"]))
        elif name == "content_block_delta":
            block, d = self.message["content"][ev["index"]], ev["delta"]
            if d["type"] == "text_delta":
                block["text"] += d["text"]
            elif d["type"] == "thinking_delta":
                block["thinking"] += d["thinking"]
            elif d["type"] == "signature_delta":
                block["signature"] = d["signature"]
            elif d["type"] == "input_json_delta":
                self.json_buffers[ev["index"]] = self.json_buffers.get(ev["index"], "") + d["partial_json"]
        elif name == "content_block_stop":
            block = self.message["content"][ev["index"]]
            if block["type"] == "tool_use":
                block["input"] = json.loads(self.json_buffers.pop(ev["index"], "") or "{}")   # parse ONCE, at the end
        elif name == "message_delta":
            self.message["stop_reason"] = ev["delta"]["stop_reason"]
            self.message["stop_sequence"] = ev["delta"].get("stop_sequence")
            self.message["usage"].update(ev["usage"])          # usage in message_delta is CUMULATIVE
        # message_stop, ping and any event type we do not know: nothing to do

def stream_message(client, **body):
    acc, seen = StreamAccumulator(), []
    for name, ev in client.stream_events(**body):
        seen.append(name)
        acc.feed(name, ev)
    return acc.message, seen

def run_tool_loop(client, tool_functions, user_text, *, tools, max_turns=6, use_stream=False, **extra):
    """The Messages API loop: keep going while stop_reason == 'tool_use'."""
    messages = [{"role": "user", "content": user_text}]
    trace = []
    for _ in range(max_turns):
        body = {"model": MODEL, "max_tokens": 256, "messages": messages, "tools": tools, **extra}
        msg = stream_message(client, **body)[0] if use_stream else client.create(**body)
        trace.append((msg["stop_reason"], [b["type"] for b in msg["content"]]))
        messages.append({"role": "assistant", "content": msg["content"]})      # the WHOLE content, unmodified
        if msg["stop_reason"] != "tool_use":
            return msg, messages, trace                                         # end_turn, max_tokens, refusal, ...
        results = []
        for block in msg["content"]:
            if block["type"] != "tool_use":
                continue
            try:
                out, is_error = str(tool_functions[block["name"]](**block["input"])), False
            except Exception as exc:                                            # tell the model, do not crash
                out, is_error = f"{type(exc).__name__}: {exc}", True
            result = {"type": "tool_result", "tool_use_id": block["id"], "content": out}
            if is_error:
                result["is_error"] = True
            results.append(result)
        messages.append({"role": "user", "content": results})                   # tool_result blocks FIRST in the list
    raise RuntimeError(f"no final answer after {max_turns} turns")
```

### Block 4: a plain call, the error envelope, and retries

```python
def show_message(msg):
    print(json.dumps(msg, indent=2))

if __name__ == "__main__":
    srv = StandInAnthropic().start()
    try:
        print("=== 2. a plain call, the message object, and the error envelope ===")
        client = Claude(srv.base, "stand-in-key", sleep=lambda s: None)
        msg = client.create(**message_request("Hello, Claude", system="You are terse.", max_tokens=64))
        show_message(msg)
        print("version header the server saw:", srv.requests[-1]["version"])

        legacy = Claude(srv.base, "stand-in-key", style="x-api-key", sleep=lambda s: None)
        print("legacy x-api-key header works too:", legacy.create(**message_request("Hi", max_tokens=32))["stop_reason"])

        short = client.create(**message_request("Tell me something long and wonderful", max_tokens=4))
        print("max_tokens=4 ->", short["stop_reason"], "|", repr(short["content"][0]["text"]))

        print("\n--- errors: same envelope every time ---")
        attempts = [
            ("no max_tokens", client, {"model": MODEL, "messages": [{"role": "user", "content": "hi"}]}),
            ("no version header", Claude(srv.base, "k", version="", sleep=lambda s: None), message_request("hi")),
            ("no credentials", Claude(srv.base, "", style="x-api-key", sleep=lambda s: None), message_request("hi")),
            ("temperature on 2026-10-21", client, message_request("hi", temperature=0.2)),
            ("system as first message", client, {"model": MODEL, "max_tokens": 16,
                                             "messages": [{"role": "system", "content": "x"}]}),
        ]
        for label, c, body in attempts:
            try:
                c.create(**body)
            except ApiError as err:
                print(f"{label:<26} -> {err.status} {err.etype}: {err.message}")
        old = Claude(srv.base, "k", version="2023-06-01", sleep=lambda s: None)
        print("temperature on 2023-06-01  ->", old.create(**message_request("hi", temperature=0.2))["stop_reason"],
              "(accepted: the stand-in follows the versioning page)")

        print("\n=== 3. retries: Retry-After first, then backoff with jitter ===")
        waits = []
        c = Claude(srv.base, "k", sleep=waits.append)
        srv.faults += [{"status": 429, "retry_after": "2"}, {"status": 529}]
        print("outcome:", c.create(**message_request("hi"))["stop_reason"],
              "| waits:", [round(w, 3) for w in waits], "| retries:", c.retries_made)
        srv.faults += [{"status": 529}] * 3
        try:
            c.create(**message_request("hi"))
        except ApiError as err:
            print("three 529s in a row ->", err, "| total retries now:", c.retries_made)
        srv.faults.clear()
        before = c.retries_made
        try:
            c.create(**message_request("hi", temperature=0.5))
        except ApiError as err:
            print("a 400 is never retried:", err.status, "| retries unchanged:", c.retries_made == before)
    finally:
        srv.stop()
```

Output:

```
=== 2. a plain call, the message object, and the error envelope ===
{
  "id": "msg_standin_001",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "(scripted) You said: Hello, Claude"
    }
  ],
  "model": "your-claude-model-id",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 11,
    "output_tokens": 8
  }
}
version header the server saw: 2026-10-21
legacy x-api-key header works too: end_turn
max_tokens=4 -> max_tokens | '(scripted) You'

--- errors: same envelope every time ---
no max_tokens              -> 400 invalid_request_error: max_tokens: Field required
no version header          -> 400 invalid_request_error: anthropic-version header is required
no credentials             -> 401 authentication_error: missing credentials: send Authorization: Bearer <key> (or the legacy x-api-key)
temperature on 2026-10-21  -> 400 invalid_request_error: temperature: not supported with anthropic-version 2026-10-21
system as first message    -> 400 invalid_request_error: messages.0: a system message cannot be the first entry; use the top-level system field
temperature on 2023-06-01  -> end_turn (accepted: the stand-in follows the versioning page)
```

```
=== 3. retries: Retry-After first, then backoff with jitter ===
outcome: end_turn | waits: [2.0, 0.922] | retries: 2
three 529s in a row -> 529 overloaded_error: injected fault | total retries now: 4
a 400 is never retried: 400 | retries unchanged: True
```

What the output shows. Every failure, whatever its cause, arrives in the same envelope, so one `ApiError` class is enough. The `anthropic-version` and credentials errors are separate and cheap to test. `max_tokens=4` shows what a cut-off looks like: `stop_reason: "max_tokens"` with a truncated string, not an error, which is why you must look at `stop_reason` before trusting a text. In the retry section the first wait is the server's `retry-after: 2`; the second is jittered backoff (`0.5 s x 2` scaled to between half and full, so 0.922 from the seeded generator). Three `529`s in a row exhaust the retries and the last one is raised, and a `400` is not retried because repeating a malformed request cannot succeed.

### Block 5: streaming

```python
from collections import Counter

if __name__ == "__main__":
    print("=== 4. streaming: raw events, accumulation, unknown events, in-stream errors ===")
    srv = StandInAnthropic().start()
    try:
        client = Claude(srv.base, "stand-in-key", sleep=lambda s: None)
        ask = dict(**message_request("What is the weather in Paris?", tools=[WEATHER_TOOL], max_tokens=128))

        print("--- the first 14 lines of the raw stream (SSE: 'event:' line, 'data:' line, blank line) ---")
        with client._open({**ask, "stream": True}) as resp:
            for _, raw in zip(range(14), resp):
                print(raw.decode().rstrip())

        srv.tool_counter = 0
        streamed, seen = stream_message(client, **ask)
        srv.tool_counter = 0
        plain = client.create(**ask)
        print("\nevent counts:", dict(Counter(seen)))
        for key in ("content", "stop_reason", "usage"):
            print(f"streamed {key} == non-streamed {key}:", streamed[key] == plain[key])
        print("final tool_use input (parsed once, after content_block_stop):", streamed["content"][1]["input"])
        print("stop_reason:", streamed["stop_reason"], "| usage:", streamed["usage"])

        print("\n--- an error arrives INSIDE a 200 stream ---")
        srv.faults.append({"stream_error_after": 5})
        acc = StreamAccumulator()
        try:
            for name, ev in client.stream_events(**ask):
                acc.feed(name, ev)
        except ApiError as err:
            partial = acc.message["content"][0]["text"] if acc.message["content"] else ""
            print("raised:", err)
            print("partial text received before the error:", repr(partial))
    finally:
        srv.stop()
```

Output:

```
=== 4. streaming: raw events, accumulation, unknown events, in-stream errors ===
--- the first 14 lines of the raw stream (SSE: 'event:' line, 'data:' line, blank line) ---
event: message_start
data: {"type": "message_start", "message": {"id": "msg_standin_001", "type": "message", "role": "assistant", "content": [], "model": "your-claude-model-id", "stop_reason": null, "stop_sequence": null, "usage": {"input_tokens": 33, "output_tokens": 1}}}

event: content_block_start
data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}

event: ping
data: {"type": "ping"}

event: x_future_event
data: {"type": "x_future_event"}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "I'll check the "}}

event counts: {'message_start': 1, 'content_block_start': 2, 'ping': 1, 'x_future_event': 1, 'content_block_delta': 6, 'content_block_stop': 2, 'message_delta': 1, 'message_stop': 1}
streamed content == non-streamed content: True
streamed stop_reason == non-streamed stop_reason: True
streamed usage == non-streamed usage: True
final tool_use input (parsed once, after content_block_stop): {'city': 'Paris'}
stop_reason: tool_use | usage: {'input_tokens': 33, 'output_tokens': 16}

--- an error arrives INSIDE a 200 stream ---
raised: 200 overloaded_error: Overloaded
partial text received before the error: "I'll check the "
```

Three things to see. The raw stream is plain text you could read with `curl`: `event:` names the type, `data:` carries JSON that repeats the type. The accumulated message equals the non-streamed one: content, `stop_reason` and `usage` (the cumulative `output_tokens` from `message_delta` replaced the placeholder `1` from `message_start`). The unknown `x_future_event` and the `ping` are counted but ignored; that is the behaviour the versioning policy asks of you. The in-stream error shows why "HTTP 200" is not "success": the error came after the stream began, and the partial text received before it is all you have.

### Block 6: the tool loop, parallel calls, errors, ordering rules, thinking blocks

```python
def outline(messages):
    """One line per message: role and the types of its blocks (strings count as one text block)."""
    for m in messages:
        kinds = ["text"] if isinstance(m["content"], str) else [b["type"] for b in m["content"]]
        print(f"   {m['role']:<9} {kinds}")

if __name__ == "__main__":
    print("=== 5. the tool loop: tool_use, tool_result, errors, parallel calls, thinking blocks ===")
    srv = StandInAnthropic().start()
    try:
        client = Claude(srv.base, "stand-in-key", sleep=lambda s: None)
        def get_weather(city):
            if city == "Atlantis":
                raise LookupError("no such city")
            return f"18 C and sunny in {city}"
        funcs = {"get_weather": get_weather}

        final, messages, trace = run_tool_loop(client, funcs, "What is the weather in Paris?", tools=[WEATHER_TOOL])
        print("turns (stop_reason, block types):", trace)
        outline(messages)
        print("final text:", final["content"][0]["text"])

        print("\n--- two tool calls in ONE assistant turn -> ONE user message with two tool_result blocks ---")
        final, messages, trace = run_tool_loop(client, funcs, "Compare the weather in Paris and Rome.",
                                               tools=[WEATHER_TOOL], use_stream=True)
        outline(messages)
        print("tool_use ids :", [b["id"] for b in messages[1]["content"] if b["type"] == "tool_use"])
        print("answered ids :", [b["tool_use_id"] for b in messages[2]["content"]])

        print("\n--- a tool that raises: the loop sends is_error and the model is told ---")
        final, messages, _ = run_tool_loop(client, funcs, "What is the weather in Atlantis?", tools=[WEATHER_TOOL])
        print("tool_result sent:", messages[2]["content"][0])
        print("final text:", final["content"][0]["text"])

        print("\n--- breaking the rules the docs state ---")
        asked = [{"role": "user", "content": "What is the weather in Paris?"}]
        first = client.create(model=MODEL, max_tokens=128, messages=asked, tools=[WEATHER_TOOL])
        tool_use = next(b for b in first["content"] if b["type"] == "tool_use")
        bad_order = asked + [{"role": "assistant", "content": first["content"]},
                             {"role": "user", "content": [{"type": "text", "text": "Here are the results:"},
                                                          {"type": "tool_result", "tool_use_id": tool_use["id"],
                                                           "content": "18 C"}]}]
        for label, msgs in (("text before tool_result", bad_order),
                            ("no tool_result at all", asked + [{"role": "assistant", "content": first["content"]},
                                                                 {"role": "user", "content": "never mind"}])):
            try:
                client.create(model=MODEL, max_tokens=128, messages=msgs, tools=[WEATHER_TOOL])
            except ApiError as err:
                print(f"{label:<24} -> {err.status} {err.message[:78]}")

        print("\n--- thinking blocks must be echoed back unmodified ---")
        extra = {"thinking": {"type": "adaptive"}}
        final, messages, trace = run_tool_loop(client, funcs, "What is the weather in Paris?",
                                               tools=[WEATHER_TOOL], **extra)
        print("assistant turns:", trace)
        t = messages[1]["content"][0]
        print("first block of the tool_use turn:", t["type"], "| signature:", t["signature"])
        tampered = [dict(m) for m in messages[:3]]
        tampered[1] = {"role": "assistant", "content": [{**t, "thinking": "edited by my app"}] + messages[1]["content"][1:]}
        try:
            client.create(model=MODEL, max_tokens=128, messages=tampered, tools=[WEATHER_TOOL], **extra)
        except ApiError as err:
            print("tampered thinking ->", err.status, err.message)
    finally:
        srv.stop()
```

Output:

```
=== 5. the tool loop: tool_use, tool_result, errors, parallel calls, thinking blocks ===
turns (stop_reason, block types): [('tool_use', ['text', 'tool_use']), ('end_turn', ['text'])]
   user      ['text']
   assistant ['text', 'tool_use']
   user      ['tool_result']
   assistant ['text']
final text: Here is what I found: 18 C and sunny in Paris.

--- two tool calls in ONE assistant turn -> ONE user message with two tool_result blocks ---
   user      ['text']
   assistant ['text', 'tool_use', 'tool_use']
   user      ['tool_result', 'tool_result']
   assistant ['text']
tool_use ids : ['toolu_standin_02', 'toolu_standin_03']
answered ids : ['toolu_standin_02', 'toolu_standin_03']

--- a tool that raises: the loop sends is_error and the model is told ---
tool_result sent: {'type': 'tool_result', 'tool_use_id': 'toolu_standin_04', 'content': 'LookupError: no such city', 'is_error': True}
final text: Here is what I found: error: LookupError: no such city.

--- breaking the rules the docs state ---
text before tool_result  -> 400 messages.2: tool_result blocks must come first in the content array
no tool_result at all    -> 400 messages.1: tool_use ids were found without tool_result blocks immediately aft

--- thinking blocks must be echoed back unmodified ---
assistant turns: [('tool_use', ['thinking', 'text', 'tool_use']), ('end_turn', ['thinking', 'text'])]
first block of the tool_use turn: thinking | signature: sig-2423bd437318
tampered thinking -> 400 `thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified. These blocks must remain as they were in the original response.
```

Read the outlines: the assistant turn is `['text', 'tool_use']`, and the next message is a **user** message made only of `tool_result` blocks. Two parallel calls give one assistant message with two `tool_use` blocks and one user message with two `tool_result` blocks, matched by id. The failing tool produced `is_error: true` and the "model" (scripted) reported it. The two rule-breaking requests are rejected by the stand-in with the documented phrasing (`tool_use ids were found without tool_result blocks immediately after`); a real server's text may differ. In the last case the loop appended `msg["content"]` untouched, so the thinking block went back unmodified, and editing it is refused with the sentence the errors page quotes.

### Block 7: prompt-caching usage and cost, and image blocks

```python
import base64
import math
import struct

# ---- prompt caching: usage fields and a cost formula --------------------------------
# Multipliers from the prompt-caching page, checked Oct 2026: a 5-minute cache write bills 1.25x the
# base input price, a 1-hour write 2x, a cache read 0.1x. The page lists per-model exceptions
# (some models read at 0.05x or 0.025x), so these are configuration.
CACHE_MULT = {"write_5m": 1.25, "write_1h": 2.0, "read": 0.1}

def input_cost_units(usage, ttl="5m"):
    """Input cost in units of 'one ordinary input token'. Total prompt = read + creation + input_tokens."""
    write = CACHE_MULT["write_5m" if ttl == "5m" else "write_1h"]
    return (usage["input_tokens"]
            + write * usage.get("cache_creation_input_tokens", 0)
            + CACHE_MULT["read"] * usage.get("cache_read_input_tokens", 0))

# ---- vision: image content blocks ----------------------------------------------------
DOCS_1X1_PNG = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC")

def image_block_base64(b64, media_type="image/png"):
    return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}}

def image_block_url(url):
    return {"type": "image", "source": {"type": "url", "url": url}}

def visual_tokens(width, height):
    """The vision page: patches are 28x28 pixels, an image costs ceil(w/28) x ceil(h/28) visual tokens."""
    return math.ceil(width / 28) * math.ceil(height / 28)

if __name__ == "__main__":
    print("=== 6. prompt caching: what usage reports, and what it does to the bill ===")
    srv = StandInAnthropic(min_cache_tokens=40).start()
    try:
        client = Claude(srv.base, "stand-in-key", sleep=lambda s: None)
        manual = "You are a support assistant for ACME. " + "Policy sentence about refunds and shipping. " * 12
        system = [{"type": "text", "text": manual, "cache_control": {"type": "ephemeral"}}]
        def ask(text, system=system):
            return client.create(**message_request(text, system=system, max_tokens=64))["usage"]
        rows = [("first call", ask("Where is my order?")),
                ("same prefix again", ask("Can I return shoes?")),
                ("prefix edited", ask("Can I return shoes?", system=[{**system[0], "text": manual + " Extra."}])),
                ("too short to cache", ask("hi", system=[{"type": "text", "text": "Be brief.",
                                                         "cache_control": {"type": "ephemeral"}}]))]
        for label, u in rows:
            total = u["input_tokens"] + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)
            print(f"{label:<20} input={u['input_tokens']:>3}  creation={u['cache_creation_input_tokens']:>3}  "
                  f"read={u['cache_read_input_tokens']:>3}  total prompt={total:>3}  cost units={input_cost_units(u):7.1f}")
    finally:
        srv.stop()
    prefix, question, n = 2000, 50, 10
    uncached = n * (prefix + question)
    cached = input_cost_units({"input_tokens": question, "cache_creation_input_tokens": prefix}) + \
        (n - 1) * input_cost_units({"input_tokens": question, "cache_read_input_tokens": prefix})
    print(f"\nILLUSTRATIVE: {n} calls, {prefix}-token shared prefix, {question}-token question:")
    print(f"  without caching {uncached:,.0f} units, with a 5-minute cache {cached:,.0f} units "
          f"({cached / uncached:.2f}x)")
    for ttl, w in (("5m", 1.25), ("1h", 2.0)):
        hits = math.ceil((w - 1) / (1 - CACHE_MULT["read"]))
        print(f"  {ttl} cache: extra write cost {w - 1:.2f}x the prefix, each hit saves "
              f"{1 - CACHE_MULT['read']:.1f}x -> pays back after {hits} hit(s)")

    print("\n=== 7. image blocks, and the 28x28 visual-token formula ===")
    raw = base64.b64decode(DOCS_1X1_PNG)
    print("the docs' example image decodes to a PNG:", raw[:8] == b"\x89PNG\r\n\x1a\n",
          "| size:", struct.unpack(">II", raw[16:24]))
    content = [image_block_base64(DOCS_1X1_PNG),
               {"type": "text", "text": "Describe this image."}]        # image first, then text (vision page advice)
    shown = {**content[0], "source": {**content[0]["source"], "data": f"<{len(DOCS_1X1_PNG)} chars of base64>"}}
    print("base64 form:", json.dumps(shown))
    print("URL form   :", json.dumps(image_block_url("https://example.com/cat.png")))
    srv = StandInAnthropic().start()
    try:
        client = Claude(srv.base, "stand-in-key", sleep=lambda s: None)
        reply = client.create(model=MODEL, max_tokens=64, messages=[{"role": "user", "content": content}])
        print("stand-in accepted the image + text request ->", reply["stop_reason"],
              "(scripted: it reads only the text block)")
    finally:
        srv.stop()
    # (original size, size the docs say it is downsized to, tokens the docs' table lists) - 'standard' tier
    table = [((200, 200), (200, 200), 64), ((1000, 1000), (1000, 1000), 1296), ((1092, 1092), (1092, 1092), 1521),
             ((1920, 1080), (1456, 819), 1560), ((2000, 1500), (1269, 952), 1564), ((3840, 2160), (1456, 819), 1560)]
    print(f"{'original':>11} {'downsized to':>13} {'formula':>8} {'docs table':>11}")
    for orig, down, docs in table:
        got = visual_tokens(*down)
        assert got == docs, (orig, got, docs)
        print(f"{orig[0]:>5}x{orig[1]:<5} {down[0]:>6}x{down[1]:<6} {got:>8,} {docs:>11,}")
    print("all rows match the page's table (checked Oct 2026); the resize rule that produces 'downsized to' is the page's, not coded here")
```

Output:

```
=== 6. prompt caching: what usage reports, and what it does to the bill ===
first call           input=  7  creation= 86  read=  0  total prompt= 93  cost units=  114.5
same prefix again    input=  7  creation=  0  read= 86  total prompt= 93  cost units=   15.6
prefix edited        input=  7  creation= 86  read=  0  total prompt= 93  cost units=  114.5
too short to cache   input= 12  creation=  0  read=  0  total prompt= 12  cost units=   12.0

ILLUSTRATIVE: 10 calls, 2000-token shared prefix, 50-token question:
  without caching 20,500 units, with a 5-minute cache 4,800 units (0.23x)
  5m cache: extra write cost 0.25x the prefix, each hit saves 0.9x -> pays back after 1 hit(s)
  1h cache: extra write cost 1.00x the prefix, each hit saves 0.9x -> pays back after 2 hit(s)
```

```
=== 7. image blocks, and the 28x28 visual-token formula ===
the docs' example image decodes to a PNG: True | size: (1, 1)
base64 form: {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "<92 chars of base64>"}}
URL form   : {"type": "image", "source": {"type": "url", "url": "https://example.com/cat.png"}}
stand-in accepted the image + text request -> end_turn (scripted: it reads only the text block)
   original  downsized to  formula  docs table
  200x200      200x200          64          64
 1000x1000    1000x1000      1,296       1,296
 1092x1092    1092x1092      1,521       1,521
 1920x1080    1456x819       1,560       1,560
 2000x1500    1269x952       1,564       1,564
 3840x2160    1456x819       1,560       1,560
all rows match the page's table (checked Oct 2026); the resize rule that produces 'downsized to' is the page's, not coded here
```

The caching table is the stand-in's accounting, but the identities are the documented ones: `total prompt = input + creation + read`; a repeated prefix turns the creation tokens into read tokens; editing the prefix (even by one word) forces a new write; and a prompt under the minimum is silently uncached (both cache fields zero). The "ILLUSTRATIVE" lines use unit prices and the page's multipliers; with those multipliers a 5-minute cache pays for itself after one hit and a 1-hour cache after two. Real prices and any per-model multiplier exceptions are on the pricing pages.

> [!example] Worked case: reading a cached response. The second row of the table has `input_tokens=7`, `cache_creation_input_tokens=0` and `cache_read_input_tokens=86`. The prompt was 93 tokens in total (7 + 0 + 86), but only 7 are billed at the base rate and 86 at the read multiplier of 0.1, so the cost is 7 + 8.6 = 15.6 units against 93 for an uncached request. A dashboard that logged only `input_tokens` would have recorded 7 and concluded the prompt was tiny.

### Not executed: the official SDK spelling

Not executed in this module's verification (needs the `anthropic` package and an API key). Names are from the Anthropic docs fetched for this module; the SDK reads `ANTHROPIC_API_KEY` from the environment and sends the version header itself.

```python
import os
import anthropic

client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY

message = client.messages.create(
    model=os.environ["CLAUDE_MODEL"],   # from configuration
    max_tokens=1024,                    # required
    system="You are terse.",
    messages=[{"role": "user", "content": "Hello, Claude"}],
)
for block in message.content:
    if block.type == "text":
        print(block.text)

with client.messages.stream(
    model=os.environ["CLAUDE_MODEL"],
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final = stream.get_final_message()  # the same object create() returns
```

The docs also describe a Tool Runner in the SDKs that runs the loop of Block 3 for you; use it once you understand what it automates.

## Visual diagram

```
One Messages API round trip

 your app                                              api.anthropic.com
 ┌────────────────────────────────┐   POST /v1/messages   ┌───────────────────────────────┐
 │ headers: Authorization (or     │ ─────────────────────►│ validates version + key       │
 │   x-api-key), anthropic-version│                       │ runs the model                │
 │ body: model, max_tokens (REQ)  │                       └───────────────┬───────────────┘
 │   system (top-level)           │                                       │
 │   messages: [ {role, content} ]│   200 + message  or   4xx/5xx + error │
 │   tools, thinking, stream ...  │ ◄─────────────────────────────────────┘
 └────────────────────────────────┘
   content = string | [ text | image | tool_use | tool_result | thinking ]

The tool loop (stop_reason decides)

   user ──► [messages + tools] ──► model
                                     │ stop_reason = "tool_use"
                                     ▼
              assistant: [ text, tool_use(id=A), tool_use(id=B) ]   <- append it VERBATIM
                                     │ you run both functions
                                     ▼
              user: [ tool_result(A), tool_result(B) ]              <- results FIRST, one message
                                     │
                                     ▼
              model ... stop_reason = "end_turn"  ──► final text

The stream, as a timeline

 message_start ─ content_block_start[0] ─ ping ─ delta ─ delta ─ content_block_stop[0]
              ─ content_block_start[1: tool_use] ─ input_json_delta "" ─ "{\"ci" ─ "ty\": ..."
              ─ content_block_stop[1]  (parse the JSON NOW)
              ─ message_delta (stop_reason, cumulative usage) ─ message_stop
        error event can appear anywhere, after the 200; unknown event types: ignore them
```

## Practice

### 1. Find the three bugs

```json
{
  "model": "your-claude-model-id",
  "messages": [
    {"role": "system", "content": "You are terse."},
    {"role": "user", "content": "What is the weather in Paris?"}
  ],
  "tools": [{"name": "get weather", "parameters": {"type": "object"}}]
}
```

<details>
<summary>Answer</summary>

(1) `max_tokens` is missing and it is required. (2) The system prompt is a message with role `system` as the first entry; it must be the top-level `system` field (a first `system` message is invalid). (3) The tool is wrong twice: the name has a space (names must match `^[a-zA-Z0-9_-]{1,128}$`) and the schema key is `input_schema`, not `parameters` (that is the OpenAI spelling). Block 1's `check_request` reports the first two and the tool problem.

</details>

### 2. Convert an OpenAI-style history

Write `openai_to_anthropic(messages)` that turns an OpenAI-style chat history (with `developer`/`system` messages, an assistant message holding `tool_calls`, and `tool` messages) into the `(system, messages)` pair the Messages API wants. Remember: the arguments are a JSON string there and an object here, and parallel results share one user message.

<details>
<summary>Answer</summary>

Append this to the lab file:

```python
def openai_to_anthropic(messages):
    """OpenAI-style chat history -> (system, messages) for the Messages API."""
    system, out = [], []
    for m in messages:
        role = m["role"]
        if role in ("system", "developer"):
            system.append(m["content"])                              # leaves the list, becomes the top-level field
        elif role == "user":
            out.append({"role": "user", "content": m["content"]})
        elif role == "assistant":
            blocks = [{"type": "text", "text": m["content"]}] if m.get("content") else []
            for call in m.get("tool_calls") or []:
                blocks.append({"type": "tool_use", "id": call["id"], "name": call["function"]["name"],
                               "input": json.loads(call["function"]["arguments"])})   # JSON STRING -> object
            out.append({"role": "assistant", "content": blocks})
        elif role == "tool":
            block = {"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": m["content"]}
            prev = out[-1] if out else None
            if prev and prev["role"] == "user" and isinstance(prev["content"], list) \
                    and prev["content"][0]["type"] == "tool_result":
                prev["content"].append(block)                         # parallel results share ONE user message
            else:
                out.append({"role": "user", "content": [block]})
    return ("\n\n".join(system) or None), out

if __name__ == "__main__":
    print("=== 8. an OpenAI-style history, converted ===")
    history = [
        {"role": "developer", "content": "You are terse."},
        {"role": "user", "content": "Weather in Paris and Rome?"},
        {"role": "assistant", "content": None, "tool_calls": [
            {"id": "call_1", "type": "function", "function": {"name": "get_weather", "arguments": "{\"city\": \"Paris\"}"}},
            {"id": "call_2", "type": "function", "function": {"name": "get_weather", "arguments": "{\"city\": \"Rome\"}"}}]},
        {"role": "tool", "tool_call_id": "call_1", "content": "18 C"},
        {"role": "tool", "tool_call_id": "call_2", "content": "21 C"},
    ]
    system, messages = openai_to_anthropic(history)
    print(json.dumps({"system": system, "messages": messages}, indent=1))
    validate({"model": MODEL, "max_tokens": 64, "system": system, "messages": messages}, API_VERSION)
    print("the stand-in's validator accepts it: True")
```

Output of that last part:

```
=== 8. an OpenAI-style history, converted ===
{
 "system": "You are terse.",
 "messages": [
  {
   "role": "user",
   "content": "Weather in Paris and Rome?"
  },
  {
   "role": "assistant",
   "content": [
    {
     "type": "tool_use",
     "id": "call_1",
     "name": "get_weather",
     "input": {
      "city": "Paris"
     }
    },
    {
     "type": "tool_use",
     "id": "call_2",
     "name": "get_weather",
     "input": {
      "city": "Rome"
     }
    }
   ]
  },
  {
   "role": "user",
   "content": [
    {
     "type": "tool_result",
     "tool_use_id": "call_1",
     "content": "18 C"
    },
    {
     "type": "tool_result",
     "tool_use_id": "call_2",
     "content": "21 C"
    }
   ]
  }
 ]
}
the stand-in's validator accepts it: True
```

The three transformations are the ones in the comparison table: the system text leaves the list, `arguments` is parsed from a string into `input`, and the `tool` messages collapse into one `user` message of `tool_result` blocks, matched by id.

</details>

### 3. Rebuild a stream by hand

A stream delivers a text block whose two `text_delta` events are `Let me` and ` check.`, then a `tool_use` block (`id` `toolu_1`, `name` `get_weather`) whose `input_json_delta` fragments are `""`, `{"city":` and ` "Paris"}`; `message_start` reported 25 input tokens, and `message_delta` carries `stop_reason` `tool_use` and `output_tokens` 37. Write the final `content`, `stop_reason` and `usage` by hand, then check with `StreamAccumulator`.

<details>
<summary>Answer</summary>

Text block: `Let me` + ` check.` = `Let me check.` The tool block: concatenate the fragments to `{"city": "Paris"}` and parse once at `content_block_stop` to get `input = {"city": "Paris"}`. `stop_reason` is `tool_use` (from `message_delta`), and `usage.output_tokens` is 37, the cumulative value from `message_delta`, which replaces the 1 in `message_start`. Running the accumulator over the events:

```python
if __name__ == "__main__":
    print("=== 9. reassembling a stream by hand, then by code ===")
    events = [
        ("message_start", {"type": "message_start", "message": {"id": "msg_x", "type": "message", "role": "assistant",
            "content": [], "model": "m", "stop_reason": None, "stop_sequence": None,
            "usage": {"input_tokens": 25, "output_tokens": 1}}}),
        ("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}),
        ("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Let me"}}),
        ("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " check."}}),
        ("content_block_stop", {"type": "content_block_stop", "index": 0}),
        ("content_block_start", {"type": "content_block_start", "index": 1,
            "content_block": {"type": "tool_use", "id": "toolu_1", "name": "get_weather", "input": {}}}),
        ("content_block_delta", {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": ""}}),
        ("content_block_delta", {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "{\"city\":"}}),
        ("content_block_delta", {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": " \"Paris\"}"}}),
        ("content_block_stop", {"type": "content_block_stop", "index": 1}),
        ("message_delta", {"type": "message_delta", "delta": {"stop_reason": "tool_use", "stop_sequence": None}, "usage": {"output_tokens": 37}}),
        ("message_stop", {"type": "message_stop"}),
    ]
    acc = StreamAccumulator()
    for name, ev in events:
        acc.feed(name, ev)
    print(json.dumps(acc.message, indent=1))
```

Output:

```
=== 9. reassembling a stream by hand, then by code ===
{
 "id": "msg_x",
 "type": "message",
 "role": "assistant",
 "content": [
  {
   "type": "text",
   "text": "Let me check."
  },
  {
   "type": "tool_use",
   "id": "toolu_1",
   "name": "get_weather",
   "input": {
    "city": "Paris"
   }
  }
 ],
 "model": "m",
 "stop_reason": "tool_use",
 "stop_sequence": null,
 "usage": {
  "input_tokens": 25,
  "output_tokens": 37
 }
}
```

</details>

### 4. Caching arithmetic

With the multipliers from Block 7 (5-minute write 1.25, 1-hour write 2.0, read 0.1), a shared prefix of 4,000 tokens and a 100-token question: what is the input cost in units for 8 calls with no caching, with a 5-minute cache, and with a 1-hour cache, assuming all calls land inside the cache lifetime? After how many calls is each cache cheaper than no caching?

<details>
<summary>Answer</summary>

No caching: 8 x 4,100 = 32,800 units. 5-minute cache: first call 1.25 x 4,000 + 100 = 5,100; each of the other 7 calls 0.1 x 4,000 + 100 = 500; total 5,100 + 3,500 = 8,600 units. 1-hour cache: first call 2 x 4,000 + 100 = 8,100; others 500 each; total 8,100 + 3,500 = 11,600 units. Break-even: with a 5-minute cache the second call already makes it cheaper (5,100 + 500 = 5,600 < 8,200). With a 1-hour cache the second call is 8,100 + 500 = 8,600, still above 8,200 uncached; the third call (9,100 < 12,300) is where it wins, which matches Block 7's "pays back after 2 hits". These use the page's multipliers (checked Oct 2026) and assume the cache is not evicted; the real discount depends on model and on hit rates.

</details>

### 5. Why did it stop?

For each case say which `stop_reason` you expect and what the loop should do: (a) the model answered fully; (b) the answer ends mid-sentence; (c) the response contains a `tool_use` block; (d) a long server-tool turn hit its iteration limit.

<details>
<summary>Answer</summary>

(a) `end_turn`: return it. (b) `max_tokens`: the text is truncated; raise `max_tokens`, or continue the generation, or tell the user it was cut off; do not treat it as complete. (c) `tool_use`: run the tools, append the assistant content verbatim, send the `tool_result` blocks, call again. (d) `pause_turn`: send the conversation back, including the paused response, so the model continues; this is a server-tool case, not a client-tool one.

</details>

### Checkpoint quiz

1. Name two request fields that a Chat Completions habit would get wrong on the Messages API.
2. What does `stop_reason: "tool_use"` mean and what do you send next?
3. Why must you not parse `input_json_delta.partial_json` as it arrives?
4. What is the total input token count of a response whose `usage` shows `input_tokens: 7`, `cache_creation_input_tokens: 0`, `cache_read_input_tokens: 86`?
5. A request that worked yesterday now returns 400 after you bumped `anthropic-version` to `2026-10-21`. Name a likely cause.

<details>
<summary>Answers</summary>

1. `max_tokens` is required (there is no default), and the system prompt is the top-level `system` field rather than a first message; also `tool_choice`/tool definitions use `input_schema`, and sampling parameters are rejected from `2026-10-21`.
2. The model wants one or more tools run. Append the assistant message (all its content, unmodified), run each tool, and send one `user` message whose first blocks are `tool_result` blocks, one per `tool_use` id, then call the API again.
3. A fragment such as `{"city":` is not valid JSON; the pieces are only complete after `content_block_stop`, so concatenate and parse once there.
4. 93: total input = `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` = 7 + 0 + 86. `input_tokens` is only the part after the last cache breakpoint.
5. The request sends `temperature`, `top_p` or `top_k`, which that version rejects with a 400 (other changes in that version concern document and citation blocks); remove them or keep the older version for that request.

</details>

> [!check]
> - I can write a valid Messages API request, including the version header and the required `max_tokens`
> - I can read a response: content blocks, `stop_reason`, and the `usage` identity with cache fields
> - I can parse an SSE stream, rebuild the final message and tolerate pings, unknown events and in-stream errors
> - I can run the tool loop, including parallel calls, `is_error` and the result-ordering rules
> - I can explain prompt caching, thinking and image blocks as the docs describe them and compute the cost with stated multipliers
> - I can list the differences between the OpenAI-style and Anthropic APIs for request, response, errors, streaming and tools

## Project

**Harden the client: make every `stop_reason` and every stream failure a decision.** Extend Blocks 2 and 3 (do not look for a reference solution; the design is yours).

1. Extend the stand-in with a header or body flag that makes it return each of the seven documented `stop_reason` values, and one more that returns a malformed JSON body once.
2. Write `handle(message)` that returns one of `DONE`, `NEEDS_TOOLS`, `TRUNCATED`, `CONTINUE_PAUSED`, `REFUSED`, `TOO_LONG` for each reason, and wire it into `run_tool_loop`. `pause_turn` must resend the conversation including the paused response.
3. Implement stream recovery from the Streaming page: when a stream dies after some text, capture the partial text and issue a continuation request (the docs give two variants depending on the model generation: continue from an `assistant` prefill, or add a `user` message saying the previous response was interrupted and where it ended). Tool-use and thinking blocks cannot be partially recovered; decide and document what your client does then.
4. Add a log record per call: `request-id`, model, version header, stop reason, usage fields, retries, wall time. Never log the API key or full prompts by default.
5. Test it all against the stand-in, including a test that proves a thinking block survives the tool loop byte for byte, and a test that your retry logic does not retry a 400.

Stretch: add an `openai_to_anthropic` and `anthropic_to_openai` pair for text and tool messages, and a property test that round-trips random histories (this is the seed of the provider-abstraction layer in the module on [Module 17: Provider Abstraction and Model Routing](../17-provider-abstraction-and-model-routing/README.md)).

## Interview questions

> [!interview] Walk me through a tool call on the Anthropic Messages API and how it differs from the OpenAI Chat Completions flow.

<details>
<summary>What a strong answer covers</summary>

- The contract: the model only emits a request; your code runs the function.
- Anthropic: the response has `stop_reason: "tool_use"` and `tool_use` blocks with an `id`, `name` and an `input` object; you reply with a `user` message of `tool_result` blocks (`tool_use_id`, content, optional `is_error`), results first, one message for all parallel calls; the assistant content is appended unmodified.
- OpenAI-style: `finish_reason: "tool_calls"`, `tool_calls[]` on the assistant message with `arguments` as a JSON string, and one `role: "tool"` message per call.
- Consequences: converting between them (parse or serialise arguments, regroup results), different streaming deltas for arguments, and different error-reporting channels.
- Mentions server tools (Anthropic runs them, no `tool_result` from you) and the injection risk of tool results.

</details>

> [!interview] Your streaming client intermittently crashes with a JSON decode error on tool calls, and sometimes users see half an answer after a long pause. What are the likely causes?

<details>
<summary>What a strong answer covers</summary>

- Parsing partial JSON per delta instead of accumulating `partial_json` and parsing at `content_block_stop`.
- Not handling `error` events that arrive after a 200, and not distinguishing them from a clean `message_stop`.
- Not ignoring `ping` or unknown event types, which the versioning policy says can appear.
- Idle-connection drops on long generations: use streaming plus timeouts and keep-alives; recover by continuing from the captured partial text, knowing tool-use and thinking blocks cannot be partially recovered.
- Instrumentation: log the event sequence and the request id.

</details>

> [!interview] An agent resends a 20,000-token system prompt and a large tool list on every call, and the bill is dominated by input tokens. How do you reduce it, and how do you check it worked?

<details>
<summary>What a strong answer covers</summary>

- Prompt caching: stable prefix first (tools, then system, then messages), breakpoint at the end of the stable part, nothing volatile such as timestamps before the breakpoint.
- Know the limits: minimum cacheable length per model, 5-minute default lifetime (refreshed on use), the 1-hour option at higher write cost, up to four breakpoints, the 20-block lookback.
- Verify with the usage fields: `cache_creation_input_tokens` on the first call, `cache_read_input_tokens` afterwards, both zero means it was silently not cached; remember `input_tokens` is only the part after the last breakpoint.
- Do the arithmetic with the multipliers on the pricing page and the expected hit rate; changes to tool definitions or thinking settings invalidate parts of the cache.
- Other levers: shorter prompts, fewer tools per call, batching non-urgent work through the Batches API.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| 400 on a request that looks fine | `max_tokens` missing; a `system` message first; text before `tool_result`; sampling parameters on `2026-10-21`; edited thinking block | read the error message (it names the field); compare with Block 1's checker |
| 400 mentioning `tool_use` ids without `tool_result` | the user message after a `tool_use` turn does not answer every id, or something sits between them | answer all ids in the very next user message, results first |
| garbled or missing tool arguments in streaming | parsing `partial_json` per delta | accumulate by `index`, parse at `content_block_stop` |
| "usage looks too small" | reading only `input_tokens` with caching on | add `cache_creation_input_tokens` and `cache_read_input_tokens` |
| caching never hits | a changing value (timestamp, request id) inside the cached prefix; prompt under the minimum; the 5-minute lifetime expired | move the breakpoint before the changing part; check both cache fields are non-zero |
| works without streaming, times out with large `max_tokens` | long idle connection dropped | stream (or use the Batches API) |
| retries make a rate-limit problem worse | retrying without honouring `retry-after`, or retrying a spend-cap 429 | wait the stated time; a 429 without `retry-after` can mean a spend cap, which only a human can fix |
| stream ends with HTTP 200 but no `message_stop` | an `error` event or a dropped connection | treat a stream without `message_stop` as failed |

## Further reading & sources

- [API overview](https://platform.claude.com/docs/en/api/overview) - endpoints, the authentication headers, the version header, request-size limits, response headers and the cloud-platform options.
- [Versions](https://platform.claude.com/docs/en/api/versioning) - the compatibility promise, the version history and the breaking changes in 2026-10-21 that this module's checker encodes.
- [Create a Message](https://platform.claude.com/docs/en/api/messages/create) - the reference for every request field, content block, stop reason, usage field and stream event used here.
- [Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming) - the event flow, delta types, in-stream errors and the recovery guidance that Blocks 3 and 5 implement.
- [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) - `tool_use` and `tool_result` formatting rules, `is_error`, and the note on differences from other APIs.
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) - `cache_control`, the cached-prefix order, lifetimes, the usage fields and the pricing multipliers used in Block 7.
- [Claude API errors](https://platform.claude.com/docs/en/api/errors) - status codes, the error body shape, request ids and request-size limits.
- [openai/openai-openapi](https://github.com/openai/openai-openapi) - OpenAI's published spec, the source for the OpenAI-style column of the comparison table.

## Next

[Module 11: The Google Gemini API](../11-the-google-gemini-api/README.md) takes the same ideas to a third provider (`contents` and `parts`, `systemInstruction`, function declarations) and extends the comparison to a three-way table.
