# Module 17: Provider Abstraction and Model Routing

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**, one module before the capstone. By now you have seen three vendors' APIs: the OpenAI API ([Module 00](../00-the-openai-api-your-first-call/README.md) to [Module 07](../07-structured-outputs-and-json-schema/README.md)), [Module 10: The Anthropic Claude API](../10-the-anthropic-claude-api/README.md) and [Module 11: The Google Gemini API](../11-the-google-gemini-api/README.md). They do the same job with different JSON. This module is about writing application code that does not care which one it is talking to, and about deciding, request by request, which one it should talk to.

It builds on [Module 16](../16-pricing-rate-limits-and-quotas/README.md) (retries, `Retry-After`, the difference between a 429 that means "wait" and one that means "you are out of money"), on [Module 15](../15-on-device-and-edge-inference/README.md) (a local model is just another route) and on [Track 01, Module 12](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md) (cost per token). Module 10 and Module 11 were written in parallel with this one; I re-state here only the few request and response fields the adapters need and link to them for the rest. The next module is the [capstone](../18-capstone-project/README.md).

After this module you can:

- explain why teams abstract providers (outages, prices, capability gaps, data residency) and why a thin, owned abstraction beats a universal one;
- define a normalised request, response, stream-event and error type, and write three adapters that put it on the wire in the documented OpenAI, Anthropic and Gemini shapes;
- test that the same application code, including a tool-calling loop and streaming, works unchanged against all three, using local stand-in servers;
- build an error taxonomy that says, for each kind of failure, whether to retry the same provider, fail over to the next, or give up, and a fallback chain with a circuit breaker;
- compare routing policies (static rules, capability- and cost-aware, cascade, eval-driven, canary and shadow traffic) on cost and accuracy, and say what each one needs in order to work;
- add the observability hooks (request ids, token counts, latency, chosen route) that make a routed system debuggable.

## Concept

> [!key] Put one thin interface that you own between your application and every provider: normalised request, response, stream event and error types, one adapter per vendor shape, and a small router that picks and orders the routes. Then outages, price changes and new models become configuration and tests rather than rewrites, as long as you abstract only what every call needs and keep provider-specific features reachable on purpose.

## Explanation

Provider facts below come from the official pages named in each bullet, fetched and read for this module (checked Oct 2026). **They are the source of truth and may have changed since.** I give wire shapes and field names, not model names, prices or limits. The three servers in the Code section are local stand-ins that mimic these documented shapes; the model behind them is scripted.

### Why abstract, and why not to over-abstract

Reasons that hold up in practice:

- **Outages and overload.** Every provider has them; Module 16 listed OpenAI's 503 `server_is_overloaded` and Anthropic's 529 `overloaded_error` ([Claude API errors](https://platform.claude.com/docs/en/api/errors)); Gemini's troubleshooting page names 503 `UNAVAILABLE`. A second route turns an incident into a latency blip.
- **Rate limits and quotas.** A rate limit or an exhausted quota on one provider is an ordinary event; another provider may have headroom (Module 16).
- **Price and model churn.** Prices, model names and deprecations change on the provider's schedule. If the model id lives in configuration and the application talks to your interface, a switch is a config change plus an evaluation run.
- **Capability gaps.** Tool support, context window, structured-output behaviour, streaming details and modalities differ. Routing on capabilities is only possible if capabilities are data you can read.
- **Data residency and policy.** Some traffic may only go to certain regions or vendors. Treat that as a hard constraint on the route list, never as a preference (Module 15 made the same point about privacy).

Reasons to stay thin:

- **Compatibility layers are not a substitute.** Anthropic's [OpenAI-SDK compatibility page](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk) says the layer "is primarily intended to test and compare model capabilities, and is not considered a long-term or production-ready solution for most use cases", that the function-calling `strict` parameter "is ignored" there, and that the native API is needed for features such as prompt caching. Google's [OpenAI-compatibility page](https://ai.google.dev/gemini-api/docs/openai) says that if you are not already using the OpenAI libraries, "we recommend that you call the Gemini API directly." Pointing one SDK at three base URLs is a way to try models, not an architecture.
- **A lowest-common-denominator interface loses the features you chose a provider for** (caching controls, extended thinking, citations, batch). Keep an explicit escape hatch for provider-specific options, and keep the shared surface small: messages, tools, streaming, usage, errors.
- **Every abstraction has a conformance cost.** Each adapter is code you own and must test against a changing wire format. Abstract what you actually route between today, not every provider that exists.

Gateways and routing libraries exist; I read the documentation of two. [LiteLLM's README](https://github.com/BerriAI/litellm) describes "an open source AI Gateway that gives you a single, unified interface to call 100+ LLM providers ... using the OpenAI format", usable as a Python SDK or as a proxy server with virtual keys, spend tracking, guardrails and load balancing. [OpenRouter's Model Fallbacks page](https://openrouter.ai/docs/guides/routing/model-fallbacks) describes a `models` parameter: "Provide an array of model IDs in priority order. If the first model returns an error, OpenRouter will automatically try the next model in the list", for providers that are "down, rate-limited, or refuse to reply due to content moderation". Whether to adopt one or build your own is a build-or-buy decision; either way you still need your own error policy, evaluations and budget (Module 16), which is what this module builds.

### The shapes you are abstracting

The same turn on the wire, reduced to the fields the adapters use (Chat Completions for the OpenAI shape, taken from the [OpenAI OpenAPI specification](https://github.com/openai/openai-openapi) and API reference; the Anthropic Messages API; Gemini `generateContent`; all from the references in Further reading):

| | OpenAI Chat Completions | Anthropic Messages | Gemini generateContent |
| --- | --- | --- | --- |
| Endpoint | `POST /v1/chat/completions` | `POST /v1/messages` | `POST /v1beta/models/{model}:generateContent` |
| Auth | `Authorization: Bearer ...` | `Authorization: Bearer ...` (`x-api-key` is documented as a legacy fallback) plus a required `anthropic-version` header | `x-goog-api-key` header |
| System prompt | a message with role `system` | top-level `system` (string or blocks) | top-level `systemInstruction` |
| Assistant role | `assistant` | `assistant` | `model` (roles are `user` or `model`) |
| Output cap | `max_completion_tokens` (`max_tokens` is deprecated) | `max_tokens`, **required** | `generationConfig.maxOutputTokens` |
| Tool definition | `tools[].function` with `parameters` (JSON Schema) | `tools[]` with `input_schema` | `tools[].functionDeclarations[]` with `parameters`, or `parametersJsonSchema` for plain JSON Schema |
| Tool call in a response | `message.tool_calls[].function.arguments`, a **JSON string** | a `tool_use` block with `input`, an **object** | a `functionCall` part with `args`, an object; `id` optional |
| Tool result | a message with role `tool` and `tool_call_id` | a `user` message with a `tool_result` block and `tool_use_id` | a `user` content with a `functionResponse` part (`name`, `response`) |
| Stop signal | `finish_reason`: `stop`, `length`, `tool_calls`, `content_filter` | `stop_reason`: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `model_context_window_exceeded` ([stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)) | `finishReason`: `STOP`, `MAX_TOKENS`, `SAFETY`, ... (no tool-call value in the list) |
| Usage | `usage.prompt_tokens`, `completion_tokens` | `usage.input_tokens`, `output_tokens` | `usageMetadata.promptTokenCount`, `candidatesTokenCount` (plus `thoughtsTokenCount`) |
| Streaming | `stream: true`; `data:` chunks; ends with literal `data: [DONE]` | `stream: true`; named events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, `ping` | `...:streamGenerateContent?alt=sse`; a stream of `GenerateContentResponse` chunks |
| Request id | `x-request-id` response header | `request-id` header and `request_id` in error bodies | `responseId` in the body |
| Error body | `{"error": {"message", "type", "param", "code"}}` | `{"type": "error", "error": {"type", "message"}, "request_id"}` | `{"error": {"code", "message"}}` with snake_case codes (as documented for the newer Interactions API; see the note below) |

Details worth knowing before writing an adapter:

- **Tool arguments arrive in different forms.** OpenAI documents `arguments` as a string "in JSON format. Note that the model does not always generate valid JSON, and may hallucinate parameters not defined by your function schema. Validate the arguments in your code before calling your function." Anthropic streams tool input as "partial JSON strings, whereas the final `tool_use.input` is always an object". The adapters parse once, tolerate invalid JSON, and the application sees a dict.
- **Stop reasons are not one vocabulary.** Gemini's finish-reason list has no tool-call value, so an adapter derives "the model called a tool" from the presence of `functionCall` parts. Gemini also reports a blocked prompt as an empty `candidates` list with `promptFeedback.blockReason`. The adapters map each vendor's value to five normalised ones (`end`, `length`, `tool_calls`, `filtered`, `other`) and keep the raw string for debugging.
- **Streams differ in framing and in how they fail.** OpenAI: "`[DONE]` is literal text, not a JSON chunk", an optional final usage chunk when `stream_options.include_usage` is set, and a failure after the stream started "may contain a JSON object with an `error` field instead of a completion chunk". Anthropic: an `event: error` frame (its example is `overloaded_error`, "normally ... an HTTP 529 in a non-streaming context"), cumulative usage in `message_delta`, and "new event types may be added, and your code should handle unknown event types gracefully." Gemini streams whole `GenerateContentResponse` chunks (the reference shows `alt=sse` and says the body is "a stream of `GenerateContentResponse` instances" but does not spell out the frame layout; the stand-in sends one `data: <JSON>` frame per chunk, which is my assumption, so check it against a live response). The adapters turn all three into one event type.
- **Gemini's documentation is moving.** In the Oct 2026 docs the function-calling guide and error page are written for a newer Interactions API, while the `generateContent` reference is still published under "Core APIs". This module targets `generateContent`; check which one your project uses. The `generateContent` error body is not shown on the pages I read, so the Gemini stand-in uses the `{"error": {"code", "message"}}` shape from the API-errors page, and the classifier below leans on HTTP status plus whatever codes are present.

### Normalised types

Five small types carry everything the application needs, and nothing a provider invented. `Request` holds messages, a system prompt, tools and an output cap. `Message` has a role (`user`, `assistant`, `tool`), text, the tool calls an assistant made, and, for tool results, the call id and tool name (Gemini matches by name). `Response` has text, parsed tool calls, a normalised stop reason, usage and the request id. `StreamEvent` has four kinds: `text`, `tool_start`, `tool_args`, `done`; a `collect` function folds a stream into the same `Response` a non-streaming call returns. `Usage.output_tokens` includes hidden reasoning tokens where the provider reports them, because they are billed as output (Module 16). Where a provider's id is optional (Gemini's `functionCall.id`), the adapter synthesises one.

> [!pitfall] Leaking the abstraction. The moment application code reads `choices[0]` or `content[0].text` the abstraction is gone. Test it the way this module does: run one application function against every adapter and assert the same behaviour, so a vendor field in business code fails a test.

### Errors, fallback and the circuit breaker

Module 16 showed that status codes alone mislead. The taxonomy below collapses each vendor's documented signals into ten kinds, and each kind says what is allowed:

| Kind | Typical documented signal | Retry the same provider? | Fail over to the next? |
| --- | --- | --- | --- |
| `rate_limit` | 429, usually with `Retry-After` | yes, after the hint | yes, if the wait is long |
| `overloaded` | OpenAI 503, Anthropic 529, Gemini 503 | yes, with backoff | yes |
| `timeout`, `server` | 504 / 408, network errors, 500 | yes (see the idempotency note in Module 16) | yes |
| `quota` | out of money, spend cap or daily quota: `credit_balance_exhausted`, `enforced_spend_limit_reached`, Gemini `payment_required` and `quota_exceeded`, Anthropic's user-set limit (HTTP 400) | **no** | yes, and alert a human |
| `auth` | 401 / 403 | no | yes (one provider's key is broken), and alert |
| `context_length` | a 400 about the context window; a "window exceeded" stop reason | no | only to a route with a bigger window |
| `unsupported` | the route cannot do what the request needs (checked before sending) | no | yes |
| `content_filter` | a successful response whose stop reason is a block (`content_filter`, `refusal`, `SAFETY`, an empty candidate list) | no | no by default: it is a policy outcome, not a fault |
| `invalid_request` | other 400s | no | no: the same request would fail anywhere |

Two honest limits. There is no stable machine code for "context window exceeded" across the three vendors, so the classifier checks a code where I could find one (`context_length_exceeded` appears in OpenAI's OpenAPI specification, in an enum for agent-session errors, but not on the error-codes page I read for the chat endpoint) and falls back to a message heuristic (the one regular expression in the code that I would expect to need maintenance). Treat the OpenAI row in the block 6 table as an assumed shape. And the content-filter row is a default: a product may prefer to send a refused prompt to a different provider, but that is a policy decision with safety implications, not a retry.

The router's loop: skip routes whose capabilities cannot serve the request (tools, context window), skip providers whose circuit is open, try a route up to a small number of attempts honouring the error's allowances, then move on. A **circuit breaker** counts consecutive failures per provider and, once it opens, skips that provider without calling it until a cooldown has passed, then lets one trial request through. It saves latency (no waiting on a provider you already know is down) and avoids hammering a recovering one. **Streaming** adds one rule: fall back only before the first event reaches the user. After text has been shown it cannot be taken back, and OpenAI's guide says the same: "don't automatically replay a request after consuming output."

### Routing policies

Fallback reacts to failure. Routing decides where a healthy request should go.

| Policy | How it decides | Needs | Typical failure |
| --- | --- | --- | --- |
| Static rules | by task type, tenant, feature, language | someone who knows the traffic | rules rot when traffic or models change |
| Capability, cost and latency aware | filter by what the route can do, then rank by cost or latency | a table of route capabilities, prices (Module 16) and a difficulty estimate | the estimate is noisy; prices drift |
| Cascade | try the cheap route; accept or escalate | a verifier (tests, schema check, judge) | verifier errors (below); escalation adds latency and pays for both calls |
| Eval-driven | for each task type, pick the cheapest route that meets a quality bar on your labelled examples | an evaluation set per task and a re-run schedule | small eval sets are noisy; scores go stale when models update |
| Canary | send a small slice of real users to the candidate | monitoring that sees quality, not just errors | users in the slice absorb the risk |
| Shadow | mirror requests to the candidate, compare, never show its answer | a grader and storage for pairs | cost of double calls; only measures what the grader can see |

Sources for the ideas: Anthropic's ["Building effective agents"](https://www.anthropic.com/engineering/building-effective-agents) calls routing a workflow that "classifies an input and directs it to a specialized followup task", with the example of sending easy and common questions to smaller, cost-efficient models and hard or unusual ones to more capable models. The FrugalGPT paper describes three ways to cut inference cost (prompt adaptation, LLM approximation and an LLM cascade) and proposes a learned cascade; RouteLLM trains router models on human preference data to choose between a stronger and a weaker model. Google's [SRE Workbook](https://sre.google/workbook/canarying-releases/) defines canarying as "a partial and time-limited deployment of a change in a service and its evaluation", where the part receiving the change is "the canary" and the remainder is "the control". Shadow traffic is the same idea with the change evaluated off the user's path.

The simulation in block 7 compares these on one synthetic workload. Treat its numbers as a demonstration of mechanisms (a noisy verifier caps a cascade; a small eval set mis-ranks routes that are close to the bar; a shadow test needs enough samples), not as a measurement of any real model.

### Observability

A routed system needs every decision logged. Emit one event per attempt with: a trace id for the logical request, the provider and model that served it, the attempt number, outcome and error kind, the provider's request id, token counts, and latency. OpenAI's [API overview](https://developers.openai.com/api/reference/overview) recommends logging request ids ("`x-request-id`: Unique identifier for this API request (used in troubleshooting)") and lets you supply your own with `X-Client-Request-Id`; Anthropic says every response includes a `request-id` header that also appears as `request_id` in error bodies; Gemini responses carry a `responseId`. Alert on error rate by kind and provider, fallback rate, cascade escalation rate and cost per request by route. Do not log prompts by default; they are often the most sensitive data you hold.

## Code

Blocks 1 to 8 are cumulative: copy them in order into one file (`router_lab.py`) and run it. Standard library only, executed with Python 3.13; the pasted outputs are from those runs and reproduce (everything is seeded or deterministic; latencies are recorded but not printed because they vary). **Every price, skill number, traffic mix and failure rate below is invented for illustration. The servers are local stand-ins that mimic the documented wire shapes; the model behind them is scripted (it can call a `get_weather` tool and then summarise the result), not a real model.** Nothing here calls a provider.

### 1. Normalised types, the error taxonomy and the classifier

```python
"""llm_types.py - the normalised request / response / stream-event / error types. Standard library only."""
import http.client, itertools, json, math, random, re, threading, time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime


@dataclass(frozen=True)
class ToolSpec:                    # a function the model may call; `parameters` is a JSON Schema object
    name: str
    description: str
    parameters: dict

@dataclass(frozen=True)
class ToolCall:                    # a call the model made; `arguments` is already parsed JSON
    id: str
    name: str
    arguments: dict

@dataclass(frozen=True)
class Message:
    role: str                      # "user" | "assistant" | "tool"
    text: str = ""
    tool_calls: tuple = ()         # assistant messages: the ToolCalls it made
    tool_call_id: str = ""         # tool messages: which call this answers ...
    tool_name: str = ""            # ... and that call's name (Gemini needs the name)

@dataclass(frozen=True)
class Request:
    messages: tuple
    system: str = ""
    tools: tuple = ()
    max_tokens: int = 256

@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0         # for models that hide reasoning, this includes it (it is billed as output)

@dataclass
class Response:
    text: str
    tool_calls: tuple
    stop: str                      # "end" | "length" | "tool_calls" | "filtered" | "other"  (the NORMALISED reason)
    usage: Usage
    provider: str
    request_id: str = ""
    raw_stop: str = ""             # the provider's own string, kept for debugging

@dataclass
class StreamEvent:                 # the one event type every adapter's stream is translated into
    kind: str                      # "text" | "tool_start" | "tool_args" | "done"
    text: str = ""                 # text delta, or a fragment of a tool call's JSON arguments
    index: int = 0                 # which tool call (tool_start / tool_args)
    id: str = ""
    name: str = ""
    stop: str = ""                 # done: normalised stop reason
    usage: Usage | None = None     # done
    request_id: str = ""           # done


# ---- error taxonomy: what KIND of failure, and what each kind allows ---------------------------------------------------
#  kind              retry the same provider?  fail over to the next provider?
POLICY = {"rate_limit": (True, True), "overloaded": (True, True), "timeout": (True, True), "server": (True, True),
          "quota": (False, True),     "auth": (False, True),       "context_length": (False, True),
          "unsupported": (False, True), "content_filter": (False, False), "invalid_request": (False, False)}


class LLMError(Exception):
    def __init__(self, kind, provider, message="", status=None, retry_after=None):
        super().__init__(f"{provider}: {kind} (HTTP {status}) {message}".strip())
        self.kind, self.provider, self.status, self.retry_after = kind, provider, status, retry_after
        self.retry_same, self.failover = POLICY[kind]


class AllRoutesFailed(Exception):
    def __init__(self, errors):
        super().__init__("; ".join(str(e) for e in errors) or "no route was eligible")
        self.errors = errors


QUOTA_CODES = {"credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded",
                 "organization_usage_limit_exceeded", "insufficient_quota", "enforced_spend_limit_reached",
                 "billing_error", "payment_required", "quota_exceeded"}
CONTEXT_HINT = re.compile(r"context (length|window)|too long|maximum context", re.I)   # a HEURISTIC: no stable code across vendors


def parse_retry_after(value):              # RFC 9110: seconds or an HTTP-date (re-stated from Module 16)
    if not value:
        return None
    if value.strip().isdigit():
        return float(value)
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, (when.replace(tzinfo=when.tzinfo or timezone.utc) - datetime.now(timezone.utc)).total_seconds())


def classify(provider, status, headers, body):
    """Map (HTTP status, headers, error body) from any of the three vendors to one LLMError kind."""
    err = body.get("error", {}) if isinstance(body, dict) else {}
    err = err if isinstance(err, dict) else {}
    details = err.get("details") if isinstance(err.get("details"), dict) else {}
    markers = {str(x) for x in (err.get("code"), err.get("type"), details.get("error_code"), err.get("status")) if x}
    message = str(err.get("message", ""))
    ra = parse_retry_after(headers.get("retry-after"))
    if markers & QUOTA_CODES or status == 402:
        kind = "quota"                                           # a 429 here means "out of money or quota", not "slow down"
    elif status in (401, 403):
        kind = "auth"
    elif status in (408, 504):
        kind = "timeout"
    elif status == 429:
        kind = "rate_limit"
    elif status in (503, 529) or "overloaded" in " ".join(markers).lower():
        kind = "overloaded"
    elif status >= 500:
        kind = "server"
    elif "context_length_exceeded" in markers or (status in (400, 413) and CONTEXT_HINT.search(message)):
        kind = "context_length"
    elif "You have reached your specified" in message:           # Anthropic: a spend limit YOU set arrives as HTTP 400
        kind = "quota"
    else:
        kind = "invalid_request"
    return LLMError(kind, provider, message[:80], status, ra)
```

### 2. Three adapters

Each adapter builds a request, parses a response, parses a stream and nothing else. Application code never imports them directly.

```python
"""adapters.py - three adapters, one per documented wire shape (OpenAI Chat Completions, Anthropic Messages, Gemini
generateContent; shapes from the official references, checked Oct 2026). Each adapter does four jobs: build the HTTP
request, parse a response, parse a stream, classify an error. Application code never sees a provider field."""


def sse_events(lines):
    """Server-sent events: yield (event_name_or_None, data_string) for each blank-line-terminated frame."""
    event, data = None, []
    for raw in lines:
        line = raw.rstrip("\r\n")
        if line == "":
            if data:
                yield event, "\n".join(data)
            event, data = None, []
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].strip())
    if data:
        yield event, "\n".join(data)


def loads(text):                         # a model "does not always generate valid JSON" (OpenAI's schema note): never crash on it
    try:
        return json.loads(text) if text else {}
    except json.JSONDecodeError:
        return {"_invalid_json": text}


class OpenAIStyle:
    name = "openai"
    STOP = {"stop": "end", "length": "length", "tool_calls": "tool_calls", "content_filter": "filtered"}

    def __init__(self, api_key="standin-key"): self.key = api_key

    def build(self, req, model, stream):
        msgs = [{"role": "system", "content": req.system}] if req.system else []
        for m in req.messages:
            if m.role == "assistant":
                d = {"role": "assistant", "content": m.text or None}
                if m.tool_calls:
                    d["tool_calls"] = [{"id": c.id, "type": "function", "function": {"name": c.name, "arguments": json.dumps(c.arguments)}}
                                       for c in m.tool_calls]
                msgs.append(d)
            elif m.role == "tool":
                msgs.append({"role": "tool", "tool_call_id": m.tool_call_id, "content": m.text})
            else:
                msgs.append({"role": "user", "content": m.text})
        body = {"model": model, "messages": msgs, "max_completion_tokens": req.max_tokens}
        if req.tools:
            body["tools"] = [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}
                             for t in req.tools]
        if stream:
            body.update(stream=True, stream_options={"include_usage": True})
        return "/openai/v1/chat/completions", {"Authorization": f"Bearer {self.key}"}, body

    def parse(self, headers, body):
        ch = body["choices"][0]
        calls = tuple(ToolCall(c["id"], c["function"]["name"], loads(c["function"]["arguments"])) for c in ch["message"].get("tool_calls") or [])
        u = body["usage"]
        return Response(ch["message"].get("content") or "", calls, self.STOP.get(ch["finish_reason"], "other"),
                        Usage(u["prompt_tokens"], u["completion_tokens"]), self.name, headers.get("x-request-id", ""), ch["finish_reason"])

    def parse_stream(self, lines, headers):
        stop, usage = "other", Usage()
        for _, data in sse_events(lines):
            if data == "[DONE]":                                 # literal text, not JSON (OpenAI reference)
                break
            chunk = json.loads(data)
            if "error" in chunk:                                 # a failure can arrive as a data frame after the stream started
                raise classify(self.name, 500, {}, chunk)
            if chunk.get("usage"):
                usage = Usage(chunk["usage"]["prompt_tokens"], chunk["usage"]["completion_tokens"])
            for ch in chunk["choices"]:
                delta = ch["delta"]
                if delta.get("content"):
                    yield StreamEvent("text", delta["content"])
                for tc in delta.get("tool_calls") or []:
                    if tc.get("id"):
                        yield StreamEvent("tool_start", index=tc["index"], id=tc["id"], name=tc["function"]["name"])
                    if tc["function"].get("arguments"):
                        yield StreamEvent("tool_args", tc["function"]["arguments"], index=tc["index"])
                if ch.get("finish_reason"):
                    stop = self.STOP.get(ch["finish_reason"], "other")
        yield StreamEvent("done", stop=stop, usage=usage, request_id=headers.get("x-request-id", ""))


class AnthropicStyle:
    name = "anthropic"
    VERSION = "2026-10-21"                                       # the value in the Oct 2026 reference example: read the versions page
    STOP = {"end_turn": "end", "stop_sequence": "end", "max_tokens": "length", "model_context_window_exceeded": "length",
            "tool_use": "tool_calls", "refusal": "filtered"}

    def __init__(self, api_key="standin-key"): self.key = api_key

    def build(self, req, model, stream):
        msgs = []
        for m in req.messages:
            if m.role == "assistant":
                blocks = ([{"type": "text", "text": m.text}] if m.text else []) + \
                         [{"type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments} for c in m.tool_calls]
                msgs.append({"role": "assistant", "content": blocks})
            elif m.role == "tool":                               # tool results travel in a USER message, one block per call
                block = {"type": "tool_result", "tool_use_id": m.tool_call_id, "content": m.text}
                if msgs and msgs[-1]["role"] == "user" and isinstance(msgs[-1]["content"], list):
                    msgs[-1]["content"].append(block)
                else:
                    msgs.append({"role": "user", "content": [block]})
            else:
                msgs.append({"role": "user", "content": m.text})
        body = {"model": model, "max_tokens": req.max_tokens, "messages": msgs}      # max_tokens is REQUIRED here
        if req.system:
            body["system"] = req.system
        if req.tools:
            body["tools"] = [{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in req.tools]
        if stream:
            body["stream"] = True
        return "/anthropic/v1/messages", {"Authorization": f"Bearer {self.key}", "anthropic-version": self.VERSION}, body

    def parse(self, headers, body):
        text = "".join(b["text"] for b in body["content"] if b["type"] == "text")
        calls = tuple(ToolCall(b["id"], b["name"], b["input"]) for b in body["content"] if b["type"] == "tool_use")
        u = body["usage"]
        return Response(text, calls, self.STOP.get(body["stop_reason"], "other"), Usage(u["input_tokens"], u["output_tokens"]),
                        self.name, headers.get("request-id", ""), body["stop_reason"])

    def parse_stream(self, lines, headers):
        stop, usage, tool_index = "other", Usage(), {}           # tool_index: Anthropic block index -> our 0,1,2 tool numbering
        for event, data in sse_events(lines):
            d = json.loads(data)
            if event == "message_start":
                usage.input_tokens = d["message"]["usage"]["input_tokens"]
            elif event == "content_block_start" and d["content_block"]["type"] == "tool_use":
                tool_index[d["index"]] = len(tool_index)
                yield StreamEvent("tool_start", index=tool_index[d["index"]], id=d["content_block"]["id"], name=d["content_block"]["name"])
            elif event == "content_block_delta":
                if d["delta"]["type"] == "text_delta":
                    yield StreamEvent("text", d["delta"]["text"])
                elif d["delta"]["type"] == "input_json_delta":   # partial JSON strings; parse only after the block ends
                    yield StreamEvent("tool_args", d["delta"]["partial_json"], index=tool_index[d["index"]])
            elif event == "message_delta":                       # usage here is cumulative
                stop = self.STOP.get(d["delta"]["stop_reason"], "other")
                usage.output_tokens = d["usage"]["output_tokens"]
            elif event == "error":                               # e.g. overloaded_error, normally HTTP 529
                raise classify(self.name, 529 if d["error"]["type"] == "overloaded_error" else 500, {}, d)
            # ping and unknown event types are ignored on purpose: the docs say new event types may appear
        yield StreamEvent("done", stop=stop, usage=usage, request_id=headers.get("request-id", ""))


class GeminiStyle:
    name = "gemini"
    FILTERED = {"SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"}

    def __init__(self, api_key="standin-key"): self.key = api_key

    def build(self, req, model, stream):
        contents = []
        for m in req.messages:
            if m.role == "assistant":
                parts = ([{"text": m.text}] if m.text else []) + [{"functionCall": {"name": c.name, "args": c.arguments}} for c in m.tool_calls]
                contents.append({"role": "model", "parts": parts})
            elif m.role == "tool":                               # a functionResponse part, matched by NAME (the id is optional)
                part = {"functionResponse": {"name": m.tool_name, "response": {"result": m.text}}}
                if contents and contents[-1]["role"] == "user" and "functionResponse" in contents[-1]["parts"][0]:
                    contents[-1]["parts"].append(part)
                else:
                    contents.append({"role": "user", "parts": [part]})
            else:
                contents.append({"role": "user", "parts": [{"text": m.text}]})
        body = {"contents": contents, "generationConfig": {"maxOutputTokens": req.max_tokens}}
        if req.system:
            body["systemInstruction"] = {"parts": [{"text": req.system}]}
        if req.tools:                                            # parametersJsonSchema takes plain JSON Schema
            body["tools"] = [{"functionDeclarations": [{"name": t.name, "description": t.description, "parametersJsonSchema": t.parameters}
                                                       for t in req.tools]}]
        method = "streamGenerateContent?alt=sse" if stream else "generateContent"
        return f"/gemini/v1beta/models/{model}:{method}", {"x-goog-api-key": self.key}, body

    def _stop(self, cand, has_calls):
        if has_calls:
            return "tool_calls"                                  # the finish-reason list has no tool-call value: derive it from the parts
        fr = cand.get("finishReason", "")
        return "end" if fr == "STOP" else "length" if fr == "MAX_TOKENS" else "filtered" if fr in self.FILTERED else "other"

    def _usage(self, body):
        u = body.get("usageMetadata", {})                        # thinking tokens are billed as output
        return Usage(u.get("promptTokenCount", 0), u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0))

    def parse(self, headers, body):
        if not body.get("candidates"):                           # no candidates: the PROMPT was blocked (promptFeedback)
            return Response("", (), "filtered", self._usage(body), self.name, body.get("responseId", ""), body.get("promptFeedback", {}).get("blockReason", ""))
        cand = body["candidates"][0]
        parts = cand["content"]["parts"]
        calls = tuple(ToolCall(p["functionCall"].get("id") or f"call_{i}", p["functionCall"]["name"], p["functionCall"].get("args", {}))
                      for i, p in enumerate(x for x in parts if "functionCall" in x))
        return Response("".join(p.get("text", "") for p in parts), calls, self._stop(cand, bool(calls)), self._usage(body),
                        self.name, body.get("responseId", ""), cand.get("finishReason", ""))

    def parse_stream(self, lines, headers):
        n_calls, has_calls, stop, usage, rid = 0, False, "other", Usage(), ""
        for _, data in sse_events(lines):                        # each frame is one GenerateContentResponse
            chunk = json.loads(data)
            rid = chunk.get("responseId", rid)
            if "usageMetadata" in chunk:
                usage = self._usage(chunk)
            for cand in chunk.get("candidates", []):
                for p in cand["content"]["parts"]:
                    if "text" in p:
                        yield StreamEvent("text", p["text"])
                    elif "functionCall" in p:                    # arrives whole, not in fragments
                        has_calls = True
                        fc = p["functionCall"]
                        yield StreamEvent("tool_start", index=n_calls, id=fc.get("id") or f"call_{n_calls}", name=fc["name"])
                        yield StreamEvent("tool_args", json.dumps(fc.get("args", {})), index=n_calls)
                        n_calls += 1
                if cand.get("finishReason"):
                    stop = self._stop(cand, has_calls)
        yield StreamEvent("done", stop=stop, usage=usage, request_id=rid)


def collect(events, provider=""):
    """Fold a stream of normalised events into the same Response a non-streaming call returns."""
    text, calls, done = [], {}, None
    for ev in events:
        if ev.kind == "text":
            text.append(ev.text)
        elif ev.kind == "tool_start":
            calls[ev.index] = {"id": ev.id, "name": ev.name, "args": ""}
        elif ev.kind == "tool_args":
            calls[ev.index]["args"] += ev.text
        elif ev.kind == "done":
            done = ev
    tool_calls = tuple(ToolCall(c["id"], c["name"], loads(c["args"])) for _, c in sorted(calls.items()))
    return Response("".join(text), tool_calls, done.stop, done.usage, provider, done.request_id)
```

### 3. The stand-in server

Plumbing, collapsed. One `ThreadingHTTPServer` on `127.0.0.1` and an ephemeral port speaks the three shapes under three URL prefixes, checks that each request carries the vendor's credential header, can queue injected faults per provider (an HTTP error, or an error frame after streaming has started), and counts calls.

<details><summary>Show the stand-in server</summary>

```python
"""standin3.py - ONE local server (127.0.0.1, ephemeral port) that speaks three documented wire shapes under three URL
prefixes. A LOCAL STAND-IN that mimics the documented shapes; the model behind it is SCRIPTED (it can call get_weather
and then summarise the result), not a real model. It can also inject faults so fallback logic can be tested."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def scripted(last, has_tools):
    """The fake model. last = ("user", text) | ("tool", result_text) -> ("tool", name, args) | ("text", string)."""
    kind, text = last
    if kind == "tool":
        d = loads(text)
        return ("text", f"It is {d.get('temp_c', '?')} C and {d.get('sky', 'unknown')} in {d.get('city', '?')}.")
    if has_tools and "weather" in text.lower():
        return ("tool", "get_weather", {"city": text.rstrip("?. ").split(" in ")[-1] if " in " in text else "Paris"})
    return ("text", "You asked: " + text[:40])


def pieces(s, n=3):                                  # split a string into up to n fragments (for streaming)
    k = max(1, math.ceil(len(s) / n))
    return [s[i:i + k] for i in range(0, len(s), k)] or [""]


def err_body(style, status, kind, message):          # the documented error shapes, one per vendor
    if style == "openai":
        return {"error": {"message": message, "type": kind, "param": None, "code": kind}}
    if style == "anthropic":
        return {"type": "error", "error": {"type": kind, "message": message}, "request_id": "req_stub"}
    return {"error": {"code": kind, "message": message}}


class StandIn3:
    def __init__(self):
        self.faults = {"openai": [], "anthropic": [], "gemini": []}       # queued faults, consumed one per request
        self.calls = {"openai": 0, "anthropic": 0, "gemini": 0}
        self.rid = itertools.count(1)
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a): pass

            def _send(self, status, headers, payload):
                data = json.dumps(payload).encode()
                self.send_response(status)
                for k, v in {**headers, "Content-Type": "application/json", "Content-Length": str(len(data))}.items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
                style = self.path.split("/")[1]
                stream = body.get("stream") is True or ":streamGenerateContent" in self.path
                n = next(outer.rid)
                rid_header = {"openai": {"x-request-id": f"req_oa_{n}"}, "anthropic": {"request-id": f"req_an_{n}"}, "gemini": {}}[style]
                outer.calls[style] += 1
                auth = {"openai": "Authorization", "anthropic": "Authorization", "gemini": "x-goog-api-key"}[style]
                if not self.headers.get(auth):
                    return self._send(401, rid_header, err_body(style, 401, "authentication_error", "missing credentials"))
                fault = outer.faults[style].pop(0) if outer.faults[style] else None
                if fault and "status" in fault:
                    return self._send(fault["status"], {**rid_header, **fault.get("headers", {})}, fault["body"])
                # ---- read the request into (last turn, tools?, max tokens) ----
                if style == "openai":
                    last_msg, has_tools, max_tokens = body["messages"][-1], bool(body.get("tools")), body.get("max_completion_tokens", 256)
                    last = ("tool", last_msg["content"]) if last_msg["role"] == "tool" else ("user", last_msg["content"])
                    in_tokens = sum(len(str(m.get("content") or "").split()) for m in body["messages"])
                elif style == "anthropic":
                    if "max_tokens" not in body:
                        return self._send(400, rid_header, err_body(style, 400, "invalid_request_error", "max_tokens: Field required"))
                    c = body["messages"][-1]["content"]
                    last = ("tool", c[0]["content"]) if isinstance(c, list) and c[0]["type"] == "tool_result" else ("user", c)
                    has_tools, max_tokens = bool(body.get("tools")), body["max_tokens"]
                    in_tokens = len(json.dumps(body["messages"]).split())
                else:
                    part = body["contents"][-1]["parts"][0]
                    last = ("tool", part["functionResponse"]["response"]["result"]) if "functionResponse" in part else ("user", part["text"])
                    has_tools, max_tokens = bool(body.get("tools")), body["generationConfig"]["maxOutputTokens"]
                    in_tokens = len(json.dumps(body["contents"]).split())
                result = scripted(last, has_tools)
                text = result[1] if result[0] == "text" else ""
                words = text.split()
                cut = len(words) > max_tokens
                text = " ".join(words[:max_tokens])
                out_tokens = 12 if result[0] == "tool" else len(text.split())
                events = outer.render(style, result, text, cut, in_tokens, out_tokens, n)       # list of (event_name, json)
                if not stream:
                    return self._send(200, rid_header, events[-1][1])
                self.send_response(200)
                for k, v in {**rid_header, "Content-Type": "text/event-stream"}.items():
                    self.send_header(k, v)
                self.end_headers()
                for i, (name, obj) in enumerate(events[:-1]):
                    if fault and fault.get("midstream") and i == 2:                        # inject an error AFTER output started
                        bad = err_body(style, 529, "overloaded_error", "Overloaded")
                        frame = f"event: error\ndata: {json.dumps(bad)}\n\n" if style == "anthropic" else f"data: {json.dumps(bad)}\n\n"
                        self.wfile.write(frame.encode()); self.wfile.flush()
                        return
                    frame = (f"event: {name}\n" if name else "") + f"data: {json.dumps(obj) if obj != '[DONE]' else obj}\n\n"
                    self.wfile.write(frame.encode()); self.wfile.flush()

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def render(self, style, result, text, cut, in_tokens, out_tokens, n):
        """Return [(sse_event_name, payload), ...]; the LAST item is the complete non-streaming response body."""
        is_tool = result[0] == "tool"
        if style == "openai":
            stop = "tool_calls" if is_tool else "length" if cut else "stop"
            usage = {"prompt_tokens": in_tokens, "completion_tokens": out_tokens, "total_tokens": in_tokens + out_tokens}
            call = {"id": "call_1", "type": "function", "function": {"name": result[1], "arguments": json.dumps(result[2])}} if is_tool else None
            full = {"id": f"chatcmpl-{n}", "object": "chat.completion", "created": 0, "model": "stub", "usage": usage,
                    "choices": [{"index": 0, "finish_reason": stop, "message": {"role": "assistant", "content": None if is_tool else text,
                                                                               "tool_calls": [call] if call else None}}]}
            chunk = lambda delta, fin=None: ("", {"id": f"chatcmpl-{n}", "object": "chat.completion.chunk", "created": 0, "model": "stub",
                                                 "choices": [{"index": 0, "delta": delta, "finish_reason": fin}]})
            if is_tool:
                head = chunk({"role": "assistant", "content": None, "tool_calls": [{"index": 0, "id": "call_1", "type": "function",
                                                                                      "function": {"name": result[1], "arguments": ""}}]})
                body = [chunk({"tool_calls": [{"index": 0, "function": {"arguments": f}}]}) for f in pieces(json.dumps(result[2]))]
            else:
                head = chunk({"role": "assistant", "content": ""})
                body = [chunk({"content": (" " if i else "") + w}) for i, w in enumerate(text.split())]
            tail = [chunk({}, stop), ("", {"id": f"chatcmpl-{n}", "object": "chat.completion.chunk", "choices": [], "usage": usage}), ("", "[DONE]")]
            return [head, *body, *tail, ("", full)]
        if style == "anthropic":
            stop = "tool_use" if is_tool else "max_tokens" if cut else "end_turn"
            content = [{"type": "tool_use", "id": "toolu_1", "name": result[1], "input": result[2]}] if is_tool else [{"type": "text", "text": text}]
            full = {"id": f"msg_{n}", "type": "message", "role": "assistant", "model": "stub", "content": content, "stop_reason": stop,
                    "stop_sequence": None, "usage": {"input_tokens": in_tokens, "output_tokens": out_tokens}}
            ev = [("message_start", {"type": "message_start", "message": {**full, "content": [], "stop_reason": None,
                                                                             "usage": {"input_tokens": in_tokens, "output_tokens": 1}}})]
            if is_tool:
                ev.append(("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_1", "name": result[1], "input": {}}}))
                ev += [("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": f}}) for f in pieces(json.dumps(result[2]))]
            else:
                ev += [("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}), ("ping", {"type": "ping"})]
                ev += [("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": (" " if i else "") + w}}) for i, w in enumerate(text.split())]
            ev += [("content_block_stop", {"type": "content_block_stop", "index": 0}),
                   ("message_delta", {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None}, "usage": {"output_tokens": out_tokens}}),
                   ("message_stop", {"type": "message_stop"}), ("", full)]
            return ev
        stop = "MAX_TOKENS" if cut else "STOP"                                  # gemini
        usage = {"promptTokenCount": in_tokens, "candidatesTokenCount": out_tokens, "totalTokenCount": in_tokens + out_tokens}
        parts = [{"functionCall": {"name": result[1], "args": result[2]}}] if is_tool else [{"text": text}]
        cand = lambda p, fin=None: {"candidates": [{"content": {"role": "model", "parts": p}, "index": 0, **({"finishReason": fin} if fin else {})}], "responseId": f"resp_{n}"}
        full = {**cand(parts, stop), "usageMetadata": usage, "modelVersion": "stub"}
        if is_tool:
            return [("", full), ("", full)]
        words = text.split()
        chunks = [("", cand([{"text": w + " "}])) for w in words[:-1]] + [("", {**cand([{"text": words[-1]}], stop), "usageMetadata": usage})] if words else [("", full)]
        return chunks + [("", full)]

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()
        self.httpd.server_close()
```

</details>

### 4. The client: transport, routes, circuit breaker and the router loop

```python
"""client.py - HTTP transport and the LLM facade: one call interface, retries, ordered fallback, a circuit breaker, hooks."""


class Http:
    def __init__(self, port, timeout=5.0): self.port, self.timeout = port, timeout

    def _open(self, path, headers, body):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=self.timeout)
        conn.request("POST", path, json.dumps(body), {"Content-Type": "application/json", **headers})
        return conn, conn.getresponse()

    def call(self, path, headers, body):                                  # -> (status, lower-case headers, parsed JSON)
        try:
            conn, r = self._open(path, headers, body)
            raw = r.read()
            conn.close()
        except (OSError, http.client.HTTPException) as e:
            raise LLMError("timeout", "network", str(e)) from e
        return r.status, {k.lower(): v for k, v in r.getheaders()}, json.loads(raw) if raw else {}

    def stream(self, path, headers, body):                                # -> (status, headers, line iterator | parsed error body)
        try:
            conn, r = self._open(path, headers, body)
        except (OSError, http.client.HTTPException) as e:
            raise LLMError("timeout", "network", str(e)) from e
        hdrs = {k.lower(): v for k, v in r.getheaders()}
        if r.status != 200:
            raw = r.read()
            conn.close()
            return r.status, hdrs, json.loads(raw) if raw else {}

        def lines():
            try:
                while True:
                    line = r.readline().decode()
                    if not line:
                        break
                    yield line
            finally:
                conn.close()
        return r.status, hdrs, lines()


@dataclass(frozen=True)
class Route:                                                               # one place a request may go (config, not code)
    provider: str
    model: str
    max_context: int = 100_000
    tools: bool = True
    in_per_m: float = 1.0                                                  # ILLUSTRATIVE USD per 1M tokens
    out_per_m: float = 3.0


class Breaker:
    """Per-provider circuit breaker: after `threshold` consecutive failures, skip the provider for `cooldown` seconds."""
    def __init__(self, clock, threshold=3, cooldown=30.0):
        self.clock, self.threshold, self.cooldown, self.fails, self.opened = clock, threshold, cooldown, {}, {}

    def allows(self, p):                                                   # after the cooldown, one trial request is let through
        return p not in self.opened or self.clock() - self.opened[p] >= self.cooldown

    def ok(self, p):
        self.fails[p] = 0
        self.opened.pop(p, None)

    def bad(self, p):
        self.fails[p] = self.fails.get(p, 0) + 1
        if self.fails[p] >= self.threshold:
            self.opened[p] = self.clock()


class LLM:
    def __init__(self, adapters, http, clock=time.monotonic, sleep=time.sleep, rng=None, hooks=(), attempts=2, max_wait=2.0):
        self.adapters, self.http, self.clock, self.sleep = adapters, http, clock, sleep
        self.rng, self.hooks, self.attempts, self.max_wait = rng or random.Random(0), list(hooks), attempts, max_wait
        self.breaker, self.n = Breaker(clock), itertools.count(1)

    def _emit(self, **ev):
        for h in self.hooks:
            h(ev)

    def _eligible(self, route, req, need):                                 # capability check BEFORE spending a request
        if req.tools and not route.tools:
            return LLMError("unsupported", route.provider, "no tool support")
        if need > route.max_context:
            return LLMError("context_length", route.provider, f"needs ~{need}, window {route.max_context}")
        return None

    def _walk(self, req, routes, attempt_fn):
        """Shared retry + fallback loop. attempt_fn(route) returns a result or raises LLMError."""
        trace, errors = f"r{next(self.n)}", []
        need = sum(len(m.text.split()) for m in req.messages) + req.max_tokens
        for route in routes:
            bad = self._eligible(route, req, need)
            if bad or not self.breaker.allows(route.provider):
                self._emit(trace=trace, provider=route.provider, outcome="skipped", why=bad.kind if bad else "breaker_open")
                errors.append(bad or LLMError("server", route.provider, "circuit open"))
                continue
            for attempt in range(1, self.attempts + 1):
                t0 = self.clock()
                try:
                    result = attempt_fn(route)
                    self.breaker.ok(route.provider)
                    self._emit(trace=trace, provider=route.provider, model=route.model, attempt=attempt, outcome="ok",
                               latency_s=self.clock() - t0, request_id=getattr(result, "request_id", ""), usage=getattr(result, "usage", None))
                    return result, trace, route
                except LLMError as e:
                    if e.kind not in ("invalid_request", "content_filter"):      # the request's fault, not the provider's
                        self.breaker.bad(route.provider)
                    self._emit(trace=trace, provider=route.provider, model=route.model, attempt=attempt, outcome="error", kind=e.kind, status=e.status)
                    if not e.retry_same and not e.failover:
                        raise                                                    # would fail anywhere: tell the caller
                    wait = e.retry_after if e.retry_after is not None else self.rng.uniform(0, 0.5 * 2 ** attempt)
                    if e.retry_same and attempt < self.attempts and wait <= self.max_wait:
                        self.sleep(wait + self.rng.uniform(0, 0.1))              # Retry-After is a minimum; add jitter
                        continue
                    errors.append(e)
                    break                                                        # give up on this route, try the next
        raise AllRoutesFailed(errors)

    def complete(self, req, routes):
        def once(route):
            a = self.adapters[route.provider]
            path, headers, body = a.build(req, route.model, stream=False)
            status, hdrs, data = self.http.call(path, headers, body)
            if status != 200:
                raise classify(route.provider, status, hdrs, data)
            resp = a.parse(hdrs, data)
            if resp.stop == "filtered":
                raise LLMError("content_filter", route.provider, resp.raw_stop)
            return resp
        return self._walk(req, routes, once)[0]

    def stream(self, req, routes):
        """Yield StreamEvents. Falls back only BEFORE the first event: output already shown cannot be replayed."""
        def once(route):
            a = self.adapters[route.provider]
            path, headers, body = a.build(req, route.model, stream=True)
            status, hdrs, lines = self.http.stream(path, headers, body)
            if status != 200:
                raise classify(route.provider, status, hdrs, lines)
            events = a.parse_stream(lines, hdrs)
            try:
                first = next(events)                                             # pulling the first event surfaces early failures here
            except StopIteration:
                raise LLMError("server", route.provider, "empty stream")
            return itertools.chain([first], events)
        events, trace, route = self._walk(req, routes, once)
        try:
            for ev in events:
                if ev.kind == "done":
                    self._emit(trace=trace, provider=route.provider, outcome="stream_done", request_id=ev.request_id, usage=ev.usage, stop=ev.stop)
                yield ev
        except LLMError as e:                                                    # after output started: report it, do not replay
            self.breaker.bad(route.provider)
            self._emit(trace=trace, provider=route.provider, outcome="error_mid_stream", kind=e.kind)
            raise
```

### 5. One application function, three providers, streaming and not

`ask` is ordinary application code: a tool loop that streams the final answer. It mentions no provider. The second part prints the same normalised request as each adapter puts it on the wire, so you can see exactly what the abstraction hides.

```python
# ---- application code: provider-neutral. It imports no vendor shape and never mentions a provider. ---------------------
WEATHER = ToolSpec("get_weather", "Get the current weather for a city",
                   {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]})
TOOLS = {"get_weather": lambda city: json.dumps({"city": city, "temp_c": 18, "sky": "cloudy"})}      # a fake local tool


def ask(llm, routes, question, stream=True):
    """A tool loop: ask, run any tool calls, ask again, until the model answers. The same function serves every provider."""
    messages, shown = [Message("user", question)], []
    for _ in range(4):
        req = Request(tuple(messages), system="Be brief.", tools=(WEATHER,), max_tokens=100)
        if stream:
            events = []
            for ev in llm.stream(req, routes):
                events.append(ev)
                if ev.kind == "text":
                    shown.append(ev.text)                    # what a UI would paint as it arrives
            resp = collect(events)
        else:
            resp = llm.complete(req, routes)
            shown = [resp.text] if resp.text else shown
        if not resp.tool_calls:
            return resp, "".join(shown).strip(), messages
        messages.append(Message("assistant", resp.text, resp.tool_calls))
        for c in resp.tool_calls:
            messages.append(Message("tool", TOOLS[c.name](**c.arguments), tool_call_id=c.id, tool_name=c.name))
    raise RuntimeError("tool loop did not finish")


with StandIn3() as server:
    llm = LLM({"openai": OpenAIStyle(), "anthropic": AnthropicStyle(), "gemini": GeminiStyle()}, Http(server.port))
    print(f"{'provider':<10}{'mode':<11}{'tool call made':<30}{'final answer':<36}{'in/out tokens'}")
    answers = set()
    for provider in ("openai", "anthropic", "gemini"):
        for stream in (False, True):
            resp, shown, msgs = ask(llm, [Route(provider, "stub-model")], "What is the weather in Paris?", stream)
            call = msgs[1].tool_calls[0]
            answers.add((call.name, json.dumps(call.arguments, sort_keys=True), resp.text))
            print(f"{provider:<10}{'stream' if stream else 'complete':<11}{call.name + json.dumps(call.arguments):<30}{resp.text:<36}"
                  f"{resp.usage.input_tokens}/{resp.usage.output_tokens}  stop={resp.stop}")
    print("\nsix runs (3 providers x streaming on/off), one application function; identical tool call and answer:", len(answers) == 1)
```

```
provider  mode       tool call made                final answer                        in/out tokens
openai    complete   get_weather{"city": "Paris"}  It is 18 C and cloudy in Paris.     14/8  stop=end
openai    stream     get_weather{"city": "Paris"}  It is 18 C and cloudy in Paris.     14/8  stop=end
anthropic complete   get_weather{"city": "Paris"}  It is 18 C and cloudy in Paris.     35/8  stop=end
anthropic stream     get_weather{"city": "Paris"}  It is 18 C and cloudy in Paris.     35/8  stop=end
gemini    complete   get_weather{"city": "Paris"}  It is 18 C and cloudy in Paris.     33/8  stop=end
gemini    stream     get_weather{"city": "Paris"}  It is 18 C and cloudy in Paris.     33/8  stop=end

six runs (3 providers x streaming on/off), one application function; identical tool call and answer: True
```

```python
# The SAME normalised request, as each adapter puts it on the wire (second turn: the tool result goes back).
call = ToolCall("call_1", "get_weather", {"city": "Paris"})
second = Request((Message("user", "Weather in Paris?"), Message("assistant", "", (call,)),
                  Message("tool", '{"temp_c": 18}', tool_call_id="call_1", tool_name="get_weather")), system="Be brief.", tools=(WEATHER,), max_tokens=100)
for a in (OpenAIStyle(), AnthropicStyle(), GeminiStyle()):
    path, headers, body = a.build(second, "stub-model", stream=False)
    print(f"{a.name}: POST {path}")
    print("  extra headers:", sorted(k for k in headers if k not in ("Authorization", "x-goog-api-key")) or "(none)",
          "| auth via:", "Authorization" if "Authorization" in headers else "x-goog-api-key")
    print("  top-level keys:", list(body))
    key = "messages" if "messages" in body else "contents"
    for m in body[key][-2:]:
        print("   ", json.dumps(m, separators=(",", ":")))
```

```
openai: POST /openai/v1/chat/completions
  extra headers: (none) | auth via: Authorization
  top-level keys: ['model', 'messages', 'max_completion_tokens', 'tools']
    {"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_weather","arguments":"{\"city\": \"Paris\"}"}}]}
    {"role":"tool","tool_call_id":"call_1","content":"{\"temp_c\": 18}"}
anthropic: POST /anthropic/v1/messages
  extra headers: ['anthropic-version'] | auth via: Authorization
  top-level keys: ['model', 'max_tokens', 'messages', 'system', 'tools']
    {"role":"assistant","content":[{"type":"tool_use","id":"call_1","name":"get_weather","input":{"city":"Paris"}}]}
    {"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","content":"{\"temp_c\": 18}"}]}
gemini: POST /gemini/v1beta/models/stub-model:generateContent
  extra headers: (none) | auth via: x-goog-api-key
  top-level keys: ['contents', 'generationConfig', 'systemInstruction', 'tools']
    {"role":"model","parts":[{"functionCall":{"name":"get_weather","args":{"city":"Paris"}}}]}
    {"role":"user","parts":[{"functionResponse":{"name":"get_weather","response":{"result":"{\"temp_c\": 18}"}}}]}
```

The three adapters produced the same tool call and the same answer in both modes. Note the token counts differ (14, 35, 33 in): the stand-in counts the words of whatever the wire format sends, and the wire formats carry different amounts of structure. Token counts are never comparable across providers (Module 16).

### 6. Error taxonomy and fallback scenarios

First the taxonomy applied to documented error shapes from all three vendors; then fallback chains, a circuit breaker and streaming failures against the stand-in with injected faults. The `sleeps` are the waits the router would make (recorded, not slept, and seeded).

```python
# ---- 1. the error taxonomy: documented error shapes from three vendors -> one kind, one policy -------------------------
cases = [   # (vendor, HTTP status, headers, body)   shapes follow each vendor's error documentation (checked Oct 2026)
    ("openai",    429, {"retry-after": "3"}, err_body("openai", 429, "rate_limit_error", "Rate limit reached for requests")),
    ("openai",    429, {}, {"error": {"type": "insufficient_quota", "code": "credit_balance_exhausted", "message": "no credits"}}),
    ("openai",    503, {"retry-after": "2"}, {"error": {"type": "service_unavailable_error", "code": "server_is_overloaded", "message": "x"}}),
    ("openai",    400, {}, {"error": {"type": "invalid_request_error", "code": "context_length_exceeded", "message": "x"}}),
    ("anthropic", 429, {}, {"type": "error", "error": {"type": "rate_limit_error", "message": "monthly threshold", "details": {"error_code": "enforced_spend_limit_reached"}}}),
    ("anthropic", 529, {}, err_body("anthropic", 529, "overloaded_error", "Overloaded")),
    ("anthropic", 400, {}, err_body("anthropic", 400, "invalid_request_error", "You have reached your specified API usage limits")),
    ("anthropic", 413, {}, err_body("anthropic", 413, "request_too_large", "Request exceeds the maximum allowed number of bytes")),
    ("gemini",    429, {}, err_body("gemini", 429, "rate_limit_exceeded", "per-minute limit")),
    ("gemini",    429, {}, err_body("gemini", 429, "quota_exceeded", "daily quota")),
    ("gemini",    402, {}, err_body("gemini", 402, "payment_required", "Prepay credit balance is depleted")),
    ("gemini",    503, {}, err_body("gemini", 503, "service_unavailable", "overloaded")),
    ("gemini",    401, {}, err_body("gemini", 401, "authentication", "API key invalid")),
]
print(f"{'vendor':<10}{'HTTP':<6}{'vendor error':<31}{'-> kind':<17}{'retry same':<12}{'fail over'}")
for vendor, status, hdrs, body in cases:
    e = classify(vendor, status, hdrs, body)
    shown = (body["error"].get("details") or {}).get("error_code") or body["error"].get("code") or body["error"].get("type")
    print(f"{vendor:<10}{status:<6}{shown:<31}{e.kind:<17}{str(e.retry_same):<12}{e.failover}")


# ---- 2. fallback chains against the stand-in, with injected faults ----------------------------------------------------
class FakeClock:
    def __init__(self): self.t = 0.0
    def now(self): return self.t


def scenario(label, faults, routes, server, req=None, clock=None, rounds=1, stream=False):
    """Run one logical request (or `rounds` of them) through a fresh LLM and print a compact trace from the hooks."""
    for p in server.faults: server.faults[p] = list(faults.get(p, []))
    server.calls.update(openai=0, anthropic=0, gemini=0)
    events, sleeps, clock = [], [], clock or FakeClock()
    llm = LLM({"openai": OpenAIStyle(), "anthropic": AnthropicStyle(), "gemini": GeminiStyle()}, Http(server.port),
              clock=clock.now, sleep=sleeps.append, rng=random.Random(1), hooks=[events.append])
    req = req or Request((Message("user", "hello there"),), max_tokens=50)
    outcome = "ok"
    for _ in range(rounds):
        try:
            r = collect(llm.stream(req, routes)) if stream else llm.complete(req, routes)
        except (LLMError, AllRoutesFailed) as e:
            outcome = type(e).__name__ + (f"({e.kind})" if isinstance(e, LLMError) else "")
    short = {"openai": "oa", "anthropic": "an", "gemini": "ge"}
    trace = " ".join(f"{short[e['provider']]}#{e.get('attempt', '-')}:" + (e.get("kind") or e.get("why") or e["outcome"])
                     if e["outcome"] != "error_mid_stream" else f"{short[e['provider']]}:MID-STREAM-{e['kind']}"
                     for e in events if e["outcome"] != "stream_done")
    print(label)
    print(f"    trace:  {trace}")
    print(f"    result: {outcome}; sleeps={[round(s, 2) for s in sleeps]}; server calls {dict(server.calls)}")
    return llm, events, sleeps, server.calls.copy()


CHAIN = [Route("openai", "m1"), Route("anthropic", "m2"), Route("gemini", "m3")]
def fault(style, status, kind, headers=None, message="injected"): return {"status": status, "headers": headers or {}, "body": err_body(style, status, kind, message)}

print()
with StandIn3() as srv:
    scenario("429 + Retry-After 1, retry same provider", {"openai": [fault("openai", 429, "rate_limit_error", {"retry-after": "1"})]}, CHAIN, srv)
    scenario("two 503s -> fail over to the 2nd provider", {"openai": [fault("openai", 503, "service_unavailable_error")] * 2}, CHAIN, srv)
    scenario("429 credit_balance_exhausted -> no retry", {"openai": [{"status": 429, "body": {"error": {"type": "insufficient_quota", "code": "credit_balance_exhausted", "message": "x"}}}]}, CHAIN, srv)
    scenario("400 invalid request -> raised, no fail-over", {"openai": [fault("openai", 400, "invalid_request_error")]}, CHAIN, srv)
    scenario("401 on the first -> 2nd; 2nd 529 -> 3rd", {"openai": [fault("openai", 401, "authentication_error")], "anthropic": [fault("anthropic", 529, "overloaded_error")] * 2}, CHAIN, srv)
    scenario("every provider down", {p: [fault(p, 503, "service_unavailable")] * 2 for p in ("openai", "anthropic", "gemini")}, CHAIN, srv)

    # circuit breaker: 3 consecutive failures open it; the next request does not even touch the provider; after the cooldown one trial is let through
    clk = FakeClock()
    llm, ev, _, calls = scenario("breaker: repeated failures on the first provider", {"openai": [fault("openai", 500, "api_error")] * 6}, CHAIN, srv, clock=clk, rounds=3)
    print(f"    breaker open for openai: {not llm.breaker.allows('openai')}")
    srv.faults["openai"] = []
    llm.complete(Request((Message("user", "again"),), max_tokens=50), CHAIN)
    print(f"    next request skipped openai (server saw {srv.calls['openai'] - calls['openai']} more calls): {srv.calls['openai'] == calls['openai']}")
    clk.t += 31
    llm.complete(Request((Message("user", "later"),), max_tokens=50), CHAIN)
    print(f"    after the cooldown one trial went through and closed it: {llm.breaker.allows('openai') and srv.calls['openai'] == calls['openai'] + 1}")

    # streaming: a failure BEFORE the first event can fall back; one AFTER output started cannot be replayed
    print()
    scenario("stream: 503 before any output -> fall back", {"openai": [fault("openai", 503, "service_unavailable_error")] * 2}, CHAIN, srv, stream=True)
    scenario("stream: error frame after output began", {"openai": [{"midstream": True}]}, CHAIN, srv, stream=True)
```

```
vendor    HTTP  vendor error                   -> kind          retry same  fail over
openai    429   rate_limit_error               rate_limit       True        True
openai    429   credit_balance_exhausted       quota            False       True
openai    503   server_is_overloaded           overloaded       True        True
openai    400   context_length_exceeded        context_length   False       True
anthropic 429   enforced_spend_limit_reached   quota            False       True
anthropic 529   overloaded_error               overloaded       True        True
anthropic 400   invalid_request_error          quota            False       True
anthropic 413   request_too_large              invalid_request  False       False
gemini    429   rate_limit_exceeded            rate_limit       True        True
gemini    429   quota_exceeded                 quota            False       True
gemini    402   payment_required               quota            False       True
gemini    503   service_unavailable            overloaded       True        True
gemini    401   authentication                 auth             False       True

429 + Retry-After 1, retry same provider
    trace:  oa#1:rate_limit oa#2:ok
    result: ok; sleeps=[1.01]; server calls {'openai': 2, 'anthropic': 0, 'gemini': 0}
two 503s -> fail over to the 2nd provider
    trace:  oa#1:overloaded oa#2:overloaded an#1:ok
    result: ok; sleeps=[0.22]; server calls {'openai': 2, 'anthropic': 1, 'gemini': 0}
429 credit_balance_exhausted -> no retry
    trace:  oa#1:quota an#1:ok
    result: ok; sleeps=[]; server calls {'openai': 1, 'anthropic': 1, 'gemini': 0}
400 invalid request -> raised, no fail-over
    trace:  oa#1:invalid_request
    result: LLMError(invalid_request); sleeps=[]; server calls {'openai': 1, 'anthropic': 0, 'gemini': 0}
401 on the first -> 2nd; 2nd 529 -> 3rd
    trace:  oa#1:auth an#1:overloaded an#2:overloaded ge#1:ok
    result: ok; sleeps=[0.92]; server calls {'openai': 1, 'anthropic': 2, 'gemini': 1}
every provider down
    trace:  oa#1:overloaded oa#2:overloaded an#1:overloaded an#2:overloaded ge#1:overloaded ge#2:overloaded
    result: AllRoutesFailed; sleeps=[0.22, 0.3, 0.73]; server calls {'openai': 2, 'anthropic': 2, 'gemini': 2}
breaker: repeated failures on the first provider
    trace:  oa#1:server oa#2:server an#1:ok oa#1:server oa#2:server an#1:ok oa#-:breaker_open an#1:ok
    result: ok; sleeps=[0.22, 0.3]; server calls {'openai': 4, 'anthropic': 3, 'gemini': 0}
    breaker open for openai: True
    next request skipped openai (server saw 0 more calls): True
    after the cooldown one trial went through and closed it: True

stream: 503 before any output -> fall back
    trace:  oa#1:overloaded oa#2:overloaded an#1:ok
    result: ok; sleeps=[0.22]; server calls {'openai': 2, 'anthropic': 1, 'gemini': 0}
stream: error frame after output began
    trace:  oa#1:ok oa:MID-STREAM-overloaded
    result: LLMError(overloaded); sleeps=[]; server calls {'openai': 1, 'anthropic': 0, 'gemini': 0}
```

### 7. Routing policies on a synthetic workload

A seeded workload of 6,000 requests over five task types; three models with invented prices, context windows and per-task skills. Each request's outcome under each model is drawn once, so the policies are compared on identical traffic. `accuracy` counts a request no eligible model can take as wrong.

```python
# ---- routing: a seeded simulation of six policies on cost and accuracy. EVERY number is an ASSUMPTION for illustration. ----
TASKS = {"faq": 0.35, "extract": 0.20, "summarize": 0.20, "reasoning": 0.15, "code": 0.10}          # traffic mix
DIFFICULTY = {"faq": (2, 5), "extract": (2, 4), "summarize": (3, 4), "reasoning": (4, 3), "code": (4, 3)}   # Beta(a, b), 0 easy .. 1 hard
TOKENS = {"faq": (400, 120), "extract": (800, 80), "summarize": (2500, 250), "reasoning": (700, 600), "code": (900, 500)}   # (in, out)
MODELS = {   # USD per 1M tokens (in, out), context window, and a "skill" per task: P(correct) = sigmoid(10 * (skill - difficulty))
    "small":  dict(price=(0.15, 0.60), ctx=16_000,  skill={"faq": .70, "extract": .65, "summarize": .45, "reasoning": .25, "code": .25}),
    "medium": dict(price=(1.00, 4.00), ctx=64_000,  skill={"faq": .85, "extract": .80, "summarize": .70, "reasoning": .50, "code": .55}),
    "large":  dict(price=(8.00, 24.0), ctx=200_000, skill={"faq": .95, "extract": .90, "summarize": .90, "reasoning": .85, "code": .85}),
}
ORDER = ["small", "medium", "large"]                                                              # cheapest first
ACCEPT_IF_CORRECT, ACCEPT_IF_WRONG = 0.93, 0.30                                                     # the cascade's verifier: P(accept | answer is right / wrong)
sigmoid = lambda x: 1 / (1 + math.exp(-x))
p_correct = lambda m, task, d: sigmoid(10 * (MODELS[m]["skill"][task] - d))


def draw(rng, n):
    out = []
    for _ in range(n):
        task = rng.choices(list(TASKS), list(TASKS.values()))[0]
        d = rng.betavariate(*DIFFICULTY[task])
        tin, tout = TOKENS[task]
        long = task == "summarize" and rng.random() < 0.10                                          # 10% of summaries are 30k-token documents
        out.append(dict(task=task, d=d, tin=30_000 if long else tin, tout=tout,
                        ok={m: rng.random() < p_correct(m, task, d) for m in ORDER},               # what each model WOULD get right
                        accept={m: rng.random() for m in ORDER}))                                  # one uniform per model for the verifier
    return out


def call_cost(m, r):
    (pi, po) = MODELS[m]["price"]
    return (r["tin"] * pi + r["tout"] * po) / 1e6


def fits(m, r): return r["tin"] + r["tout"] <= MODELS[m]["ctx"]


def run(policy, reqs):
    """-> accuracy, USD per 1k requests, mean calls per request, share of final answers per model. A request no model can take = wrong."""
    right = cost = calls = 0
    final = {m: 0 for m in ORDER}
    for r in reqs:
        chain = policy(r)                                   # a list of models to try, in order; the policy decides when to stop
        used = None
        for m in chain:
            if not fits(m, r):
                continue
            cost += call_cost(m, r); calls += 1; used = m
            if m == chain[-1] or accepted(m, r, chain):
                break
        if used:
            right += r["ok"][used]; final[used] += 1
    n = len(reqs)
    return right / n, cost / n * 1000, calls / n, {m: final[m] / n for m in ORDER}


def accepted(m, r, chain):
    """Single-model chains are final. In a cascade a NOISY verifier looks at each answer and accepts or rejects it."""
    if len(chain) == 1:
        return True
    return r["accept"][m] < (ACCEPT_IF_CORRECT if r["ok"][m] else ACCEPT_IF_WRONG)


# ---- the policies -----------------------------------------------------------------------------------------------------
always = lambda m: (lambda r: [m])
static = lambda r: [{"faq": "small", "extract": "small", "summarize": "medium"}.get(r["task"], "large")]          # hand-written rules
cascade = lambda r: ORDER                                                                                    # try cheap first, escalate


def capability_cost_aware(seed=5, target=0.85, noise=0.12):
    rng = random.Random(seed)
    def policy(r):                                         # cheapest model predicted to clear the target, from a noisy difficulty estimate
        d_hat = r["d"] + rng.gauss(0, noise)
        for m in ORDER:
            if fits(m, r) and p_correct(m, r["task"], d_hat) >= target:
                return [m]
        return ["large"]
    return policy


def eval_driven(n_eval, seed=9, target=0.88):
    """Measure each model on n_eval labelled examples per task, then route each task to the cheapest model that scored >= target."""
    ev, pick = random.Random(seed), {}
    for task in TASKS:
        scores = {m: sum(ev.random() < p_correct(m, task, ev.betavariate(*DIFFICULTY[task])) for _ in range(n_eval)) / n_eval for m in ORDER}
        pick[task] = next((m for m in ORDER if scores[m] >= target), "large")
    return (lambda r: [pick[r["task"]]]), pick


requests = draw(random.Random(2026), 6000)
policies = {"always small": always("small"), "always large": always("large"), "static rules": static, "capability+cost aware": capability_cost_aware(),
            "cascade (small>medium>large)": cascade, "eval-driven (n=300, one draw)": eval_driven(300)[0]}
print(f"{'policy':<30}{'accuracy':>9}{'USD/1k req':>11}{'calls/req':>10}   final answer from small / medium / large")
for name, pol in policies.items():
    acc, usd, calls, share = run(pol, requests)
    print(f"{name:<30}{acc:>9.1%}{usd:>11.2f}{calls:>10.2f}   {share['small']:>5.0%} / {share['medium']:>5.0%} / {share['large']:>5.0%}")


# How much does the SIZE of the eval set matter? Repeat the whole "measure, then pick" step with 100 different eval draws.
rng = random.Random(1)
true_acc = {t: {m: sum(p_correct(m, t, rng.betavariate(*DIFFICULTY[t])) for _ in range(20000)) / 20000 for m in ORDER} for t in TASKS}
oracle = {t: next((m for m in ORDER if true_acc[t][m] >= 0.88), "large") for t in TASKS}
print("\ncheapest model that truly clears 88% (the 'oracle'):", "  ".join(f"{t}: {oracle[t]} ({true_acc[t][oracle[t]]:.3f})" for t in TASKS))
print(f"{'eval examples per task x model':<32}{'tasks routed like oracle (of 5)':>32}{'mean accuracy':>15}{'mean USD/1k':>13}")
for n_eval in (15, 60, 300):
    match, accs, usds = 0, [], []
    for seed in range(100):
        pol, picks = eval_driven(n_eval, seed=seed)
        acc, usd, _, _ = run(pol, requests)
        match += sum(picks[t] == oracle[t] for t in TASKS); accs.append(acc); usds.append(usd)
    print(f"{n_eval:<32}{match / 100:>32.1f}{sum(accs) / 100:>15.1%}{sum(usds) / 100:>13.2f}")
```

```
policy                         accuracy USD/1k req calls/req   final answer from small / medium / large
always small                      64.0%       0.29      0.98     98% /    0% /    0%
always large                      95.8%      17.23      1.00      0% /    0% /  100%
static rules                      90.1%       6.00      1.00     56% /   20% /   24%
capability+cost aware             91.7%       8.05      1.00     52% /   19% /   30%
cascade (small>medium>large)      84.7%       4.03      1.39     70% /   21% /   10%
eval-driven (n=300, one draw)     92.5%      13.46      1.00     56% /    0% /   44%

cheapest model that truly clears 88% (the 'oracle'): faq: small (0.952)  extract: small (0.891)  summarize: large (0.967)  reasoning: large (0.871)  code: large (0.870)
eval examples per task x model   tasks routed like oracle (of 5)  mean accuracy  mean USD/1k
15                                                           3.9          92.6%        11.00
60                                                           4.3          92.0%        10.60
300                                                          4.5          92.4%        11.87
```

How to read it. `always small` is cheap and wrong; `always large` is the accuracy ceiling at the highest price, so every other policy is a way of giving up a little accuracy for a lot of money. `static rules` and `capability+cost aware` land close to each other; the aware policy buys about 1.6 points of accuracy for about two dollars per thousand requests more, using a noisy difficulty estimate. The cascade is the cheapest of the sensible policies but the least accurate, because its verifier accepts 30% of wrong answers (Exercise 1 varies that). The eval-driven table repeats the whole "measure, then pick" step with 100 independent eval draws: with 15 examples per cell it routes about 3.9 of 5 task types like the oracle, with 300 about 4.5 of 5, and the fifth type sits so close to the quality bar (extract, 89.1% against 88%) that no practical eval size settles it. Mean accuracy barely moves across eval sizes (92.0% to 92.6%) while mean cost moves from about 10.6 to 11.9 dollars per thousand requests, because the mis-ranked routes are near-ties: expect noise exactly where the choice matters least, and put your eval effort where scores are far from the bar.

### 8. Shadow traffic, canaries and observability hooks

A shadow test mirrors requests to the candidate and grades both answers; the promote rule is "the 95% lower bound of (candidate minus primary) is no worse than -3 points". The table shows, for 200 simulated shadow runs at each size, how often the rule promotes.

```python
# ---- shadow traffic and canaries: deciding whether to promote a cheaper route, with numbers --------------------------------
# SHADOW: mirror n live requests to the candidate, grade both answers, never show the candidate's answer to a user.
# Rule: promote when the 95% lower bound of (candidate - primary) accuracy is no worse than -3 points (a non-inferiority margin).
def shadow_trial(rng, task, cand, prim, n):
    diffs = []
    for _ in range(n):
        d = rng.betavariate(*DIFFICULTY[task])                       # one request, answered by both routes
        diffs.append(int(rng.random() < p_correct(cand, task, d)) - int(rng.random() < p_correct(prim, task, d)))
    mean = sum(diffs) / n
    se = math.sqrt(sum((x - mean) ** 2 for x in diffs) / (n - 1) / n)
    return mean - 1.96 * se                                          # lower confidence bound on the accuracy difference

print(f"{'candidate vs primary':<34}{'true gap':>9}   P(promote) when shadowing n requests")
print(f"{'':<43}" + "".join(f"{'n=' + str(n):>9}" for n in (50, 200, 800, 1600)))
for task, cand, prim in (("summarize", "medium", "large"), ("faq", "small", "large"), ("faq", "medium", "large")):
    gap = true_acc[task][cand] - true_acc[task][prim]
    rates = []
    for n in (50, 200, 800, 1600):
        rng = random.Random(100 + n)
        rates.append(sum(shadow_trial(rng, task, cand, prim, n) >= -0.03 for _ in range(200)) / 200)
    print(f"{task + ': ' + cand + ' vs ' + prim:<34}{gap:>+9.3f}   " + "".join(f"{r:>9.0%}" for r in rates))

# CANARY: the candidate really serves a slice of users, so its flaws are felt. Exposure is simple arithmetic:
for share in (0.01, 0.05, 0.25):
    gap = true_acc["summarize"]["medium"] - true_acc["summarize"]["large"]
    print(f"canary {share:>4.0%} of summarize traffic on a candidate that is {abs(gap):.1%} worse: "
          f"about {1000 * share * abs(gap):.1f} extra wrong answers per 1,000 summarize requests")

# ---- observability: one hook, one event per attempt, the fields you will want during an incident ------------------------
events = []
with StandIn3() as server:
    llm = LLM({"openai": OpenAIStyle(), "anthropic": AnthropicStyle(), "gemini": GeminiStyle()}, Http(server.port), hooks=[events.append])
    for p in ("openai", "anthropic", "gemini"):
        llm.complete(Request((Message("user", "hello there"),), max_tokens=50), [Route(p, f"{p}-model")])
print("\nhook events (latency_s is recorded in each event but varies per run, so it is not printed):")
for e in events:
    print(f"  trace={e['trace']} provider={e['provider']:<10} model={e['model']:<16} attempt={e['attempt']} outcome={e['outcome']} "
          f"request_id={e['request_id']} tokens={e['usage'].input_tokens}/{e['usage'].output_tokens} latency_recorded={e['latency_s'] >= 0}")
```

```
candidate vs primary               true gap   P(promote) when shadowing n requests
                                                n=50    n=200    n=800   n=1600
summarize: medium vs large           -0.107          0%       0%       0%       0%
faq: small vs large                  -0.042         10%       2%       0%       0%
faq: medium vs large                 -0.008         53%      65%      98%     100%
canary   1% of summarize traffic on a candidate that is 10.7% worse: about 1.1 extra wrong answers per 1,000 summarize requests
canary   5% of summarize traffic on a candidate that is 10.7% worse: about 5.4 extra wrong answers per 1,000 summarize requests
canary  25% of summarize traffic on a candidate that is 10.7% worse: about 26.8 extra wrong answers per 1,000 summarize requests

hook events (latency_s is recorded in each event but varies per run, so it is not printed):
  trace=r1 provider=openai     model=openai-model     attempt=1 outcome=ok request_id=req_oa_1 tokens=2/4 latency_recorded=True
  trace=r2 provider=anthropic  model=anthropic-model  attempt=1 outcome=ok request_id=req_an_2 tokens=5/4 latency_recorded=True
  trace=r3 provider=gemini     model=gemini-model     attempt=1 outcome=ok request_id=resp_3 tokens=6/4 latency_recorded=True
```

A candidate that is truly 10.7 points worse is never promoted. One that is 4.2 points worse (just outside the margin) is promoted 10% of the time with 50 shadow samples, and almost never with a few hundred. A candidate that is truly fine (0.8 points worse) is promoted only about half the time with 50 samples and nearly always with 800 or more: **small shadow samples cannot prove safety, and they cannot reject a marginal candidate either.** The canary lines are arithmetic: the slice of users on the candidate absorbs its flaws, so size the slice by the harm you can tolerate, not by statistics alone. The last block shows the event each attempt emits; the request ids are the provider's own (`req_oa_1` is the stand-in's `x-request-id`, `req_an_2` its `request-id`, `resp_3` the body's `responseId`).

### Using the real SDKs (NOT EXECUTED)

Not executed: it needs the packages and API keys. These are the official entry points as shown in the docs I fetched (the OpenAI call appears on Anthropic's compatibility page; the Gemini call in Google's `generateContent` reference; check each SDK's current documentation for options). An SDK-based adapter would replace `Http` in block 4 and translate each SDK's exceptions into `LLMError`; remember that SDKs retry on their own, so disable one retry layer (Module 16).

```python
# NOT EXECUTED (needs the packages and API keys). Model ids come from configuration, not code.
import os
from openai import OpenAI
from google import genai
import anthropic

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
openai_client.chat.completions.create(model=MODEL_A, messages=[{"role": "user", "content": "Hello"}])

anthropic_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
anthropic_client.messages.create(model=MODEL_B, max_tokens=256, messages=[{"role": "user", "content": "Hello"}])

gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
gemini_client.models.generate_content(model=MODEL_C, contents="Hello")
```

## Visual diagram

```
  application code (knows only Request / Response / StreamEvent / LLMError)
          │
          ▼
  ┌─────────────────────────── LLM facade ──────────────────────────────────────────────────────┐
  │  Router: picks and orders routes            routes = [ (provider, model, window, tools, $) ]  │
  │     static rules │ cost/latency/capability │ cascade │ eval-driven │ canary │ shadow         │
  │          │                                                                                   │
  │          ▼   for each route, in order:                                                        │
  │   capability filter ──► breaker open? ──► attempt (retry per error kind) ──► next route       │
  │          │                    │                  │                                            │
  │   unsupported /          skip, no call      rate_limit / overloaded / timeout: wait, retry   │
  │   context_length                            quota / auth / context: fail over, alert         │
  │                                             invalid_request / content_filter: raise          │
  │          └──────────────► hooks: trace id, provider, model, attempt, outcome, kind,          │
  │                                  request id, tokens, latency                                 │
  └────────────┬──────────────────────┬──────────────────────┬──────────────────────────────────┘
               ▼                      ▼                      ▼
        OpenAIStyle adapter    AnthropicStyle adapter   GeminiStyle adapter      (build / parse / parse_stream)
         POST /chat/completions   POST /messages        POST ...:generateContent
         tool args = JSON string  tool_use input = obj  functionCall args = obj
         stream: data: ... [DONE] stream: named events  stream: data: <chunk>
               │                      │                      │
               └──── all three streams become the same StreamEvents: text | tool_start | tool_args | done ────


  a cascade (block 7):                     a shadow test (block 8):

  request ──► small ──► verifier ──ok──► answer          live request ──► primary ──► answer to the user
                 │ reject                                       │
                 ▼                                              └─ mirror ─► candidate ──► grader ──► (primary vs candidate)
              medium ──► verifier ──ok──► answer                                                        stored, never shown
                 │ reject
                 ▼
               large ───────────────────► answer         cost = every call made;  accuracy = last accepted answer
```

## Practice

### 1. How good must the cascade's verifier be?

Re-run the cascade with the verifier wrongly accepting 0%, 10%, 30% and 60% of wrong answers (`ACCEPT_IF_WRONG`). What happens to accuracy, cost and calls per request, and why can a perfect-verifier cascade beat `always large` in this simulation?

<details><summary>Answer</summary>

```python
# Exercise 1: the cascade is only as good as its verifier. Vary how often the verifier wrongly accepts a wrong answer.
print(f"{'P(accept | wrong answer)':<26}{'accuracy':>9}{'USD/1k req':>12}{'calls/req':>11}")
for wrong in (0.0, 0.10, 0.30, 0.60):
    ACCEPT_IF_WRONG = wrong                        # run() reads this module-level number each time
    acc, usd, calls, _ = run(cascade, requests)
    print(f"{wrong:<26.2f}{acc:>9.1%}{usd:>12.2f}{calls:>11.2f}")
ACCEPT_IF_WRONG = 0.30                             # restore
```

```
P(accept | wrong answer)   accuracy  USD/1k req  calls/req
0.00                          96.8%        6.36       1.58
0.10                          92.8%        5.57       1.51
0.30                          84.7%        4.03       1.39
0.60                          74.1%        2.25       1.22
```

Every point of verifier error is an escalation that does not happen, so accuracy falls and cost falls with it: the cascade's savings are partly paid for in wrong answers that looked right. With a perfect verifier the cascade is more accurate than the large model alone (96.8% against 95.8%) because in this simulation each model's mistakes are independent, so a cheap model's correct answer can rescue a request the large model would have got wrong. Real models' errors are correlated (hard questions are hard for all of them), so do not expect that bonus in production. Measure your verifier's false-accept rate before trusting a cascade.

</details>

### 2. Why not just restart on the next provider?

The first provider fails after it has already streamed some text. Simulate a naive wrapper that restarts the whole answer on the next provider and print what the user's screen shows.

<details><summary>Answer</summary>

```python
# Exercise 2: why the facade does not "just retry on the next provider" once output has started.
with StandIn3() as server:
    llm = LLM({"openai": OpenAIStyle(), "anthropic": AnthropicStyle(), "gemini": GeminiStyle()}, Http(server.port))
    req = Request((Message("user", "hello there"),), max_tokens=50)
    server.faults["openai"] = [{"midstream": True}]                 # openai fails AFTER it has already streamed some text
    shown = []                                                      # what a user's screen would show
    try:
        for ev in llm.stream(req, [Route("openai", "m")]):
            if ev.kind == "text":
                shown.append(ev.text)
    except LLMError as e:
        print("stream failed after showing:", repr("".join(shown)), "| error kind:", e.kind)
        for ev in llm.stream(req, [Route("anthropic", "m")]):       # a naive wrapper restarts on the next provider
            if ev.kind == "text":
                shown.append(ev.text)
    print("screen after a naive restart:", repr("".join(shown)))
```

```
stream failed after showing: 'You' | error kind: overloaded
screen after a naive restart: 'YouYou asked: hello there'
```

The user sees the first provider's partial answer glued to a full second answer. The facade therefore falls back only before the first event and otherwise raises the error to the caller, who can choose: show an error, discard and restart with clear UI, or (if the product allows) resume from the partial text with an instruction to continue. That is a product decision, not a transport one.

</details>

### 3. Route a prompt that does not fit

A prompt of 70,000 words goes to a chain of three routes with windows of 16,000, 64,000 and 200,000 tokens. Which routes are tried?

<details><summary>Answer</summary>

```python
# Exercise 3: a long prompt and a chain of three windows. Which routes are skipped, and why?
long_req = Request((Message("user", "word " * 70_000),), max_tokens=100)
chain = [Route("openai", "small", max_context=16_000), Route("anthropic", "medium", max_context=64_000), Route("gemini", "large", max_context=200_000)]
events = []
with StandIn3() as server:
    llm = LLM({"openai": OpenAIStyle(), "anthropic": AnthropicStyle(), "gemini": GeminiStyle()}, Http(server.port), hooks=[events.append])
    llm.complete(long_req, chain)
    print({p: n for p, n in server.calls.items()})
for e in events:
    print(e["provider"], e["outcome"], e.get("why", ""))
```

```
{'openai': 0, 'anthropic': 0, 'gemini': 1}
openai skipped context_length
anthropic skipped context_length
gemini ok 
```

The first two routes are skipped before any request is sent, so the server saw one call, not three. This is the cheapest kind of fallback: use route metadata (windows, tool support) to avoid requests that cannot succeed. The check is an estimate (words, not real tokens, plus the output cap), so keep a margin, and still handle a `context_length` error from the provider for estimates that were too low.

</details>

### Checkpoint quiz

1. Name four things the shared interface should cover and two it should leave to an escape hatch.
2. OpenAI returns tool arguments as a JSON string and Anthropic returns an object. Where should the parsing happen and what must it tolerate?
3. Why does the Gemini adapter derive "the model called a tool" from the response parts rather than the finish reason?
4. A route returns a 429 with a spend-cap code. What should the router do, and what must it not do?
5. Why may the router fall back before the first stream event but not after?
6. A cascade saved 60% of the cost in testing and quality complaints followed in production. Name two likely causes.

<details><summary>Answers</summary>

1. Shared: messages, tools, streaming, usage, errors (also the system prompt and output cap). Escape hatch: provider-specific features such as prompt-caching controls, extended thinking, citations, batch.
2. In the adapter, once, so the application sees a dict. It must tolerate invalid JSON (OpenAI's schema says the model does not always generate valid JSON), partial JSON during streaming (parse only when the block ends), and a missing id (Gemini's is optional).
3. Gemini's documented finish-reason list has no tool-call value, so the adapter checks for `functionCall` parts.
4. Do not retry it (retrying cannot fix it); fail over to the next route if the policy allows, and alert a human. It must not loop on the same provider, and it must not hide the failure from monitoring.
5. Before the first event nothing has been shown, so another route can answer cleanly. After output has started, replaying would show duplicated or inconsistent text (Exercise 2).
6. The verifier's false-accept rate was higher on production traffic than on the test set, so wrong answers were accepted; or the traffic mix differed (more hard requests, where the cheap model fails confidently). Also possible: the verifier measures format, not correctness.

</details>

> [!check]
> - I can say why a thin, owned interface is better than a universal one, and what belongs behind an escape hatch.
> - I can describe the normalised request, response, stream-event and error types and the job of an adapter.
> - I can map a failure to retry-same, fail-over or give-up, and explain the circuit breaker.
> - I can compare static, cost-aware, cascade, eval-driven, canary and shadow routing and name what each needs.
> - I can name the fields an observability hook must emit and the metrics to alert on.

## Project

Extend the lab into `router_lab/`: a package with tests that you could hand to a teammate. Requirements: add a fourth adapter for a local OpenAI-compatible server (llama.cpp's `llama serve` is described in [Module 15](../15-on-device-and-edge-inference/README.md)), expressed only as a new `Route` plus whatever differences you discover; an explicit, tested `extras` escape hatch that passes provider-specific options to one adapter without touching the others; a record-and-replay layer that stores real or stand-in request and response pairs so you can evaluate routing policies offline against recorded traffic; a cascade whose verifier is a real check (a JSON-schema validation or a unit test) rather than a probability; and a routing configuration file in which model ids, prices, windows and data-residency tags live, with a test that fails if a route has no price or no residency tag. Test: the conformance suite (the same application function against every adapter, streaming and not); every error kind in the taxonomy, with a documented sample body for each vendor; a data-residency test proving traffic tagged EU never reaches a route tagged otherwise even when every EU route is down; and a policy-comparison report that reproduces from a seed. Finish with a design note: which failures your design cannot handle (a silent quality regression after a vendor model update, a vendor changing a header), and what monitoring you would add. No code is given.

## Interview questions

> [!interview] Your product calls one LLM provider. Management asks for a second provider "for resilience". What do you build, and what do you not build?

<details><summary>What a strong answer covers</summary>

- A thin interface for the shared surface (messages, tools, streaming, usage, errors) with one adapter per vendor and conformance tests; provider-specific features behind an explicit escape hatch; model ids and prices in configuration.
- An error taxonomy with retry and fail-over rules (do not fail over invalid requests; treat quota and billing as alerts), a circuit breaker, capability and context filtering, and the streaming rule (fall back only before output starts).
- Notes that a second provider changes behaviour, so prompts and evaluations must be re-checked per route; resilience that has never been exercised is a hope, so schedule failover drills with fault injection.
- Does not build: a universal feature set, an OpenAI-compatibility shim as the production path (the vendors themselves say it is not meant for that), or automatic failover for data that may not leave a region.

</details>

> [!interview] Design a router that sends easy requests to a cheap model and hard ones to an expensive model. How do you know it works, and how do you keep it working?

<details><summary>What a strong answer covers</summary>

- Options: static rules by task, a difficulty classifier, or a cascade with a verifier; trade-offs (estimate noise, verifier false accepts, added latency and double cost on escalation).
- Evaluation: labelled examples per task type, measuring accuracy and cost per route; awareness that eval sets are noisy near the quality bar and that model updates make scores stale.
- Rollout: shadow traffic to compare without user impact, then a canary sized by tolerable harm; promotion rules with a non-inferiority margin and enough samples.
- Operations: log the route decision and reason, monitor quality by route, re-run evals on a schedule and on every model change, and keep an instant switch back to the strong model.

</details>

> [!interview] Mid-stream, the provider sends an error. What should the client do, and why?

<details><summary>What a strong answer covers</summary>

- Recognises that the HTTP status was already 200, so the error arrives as an event or data frame (Anthropic `event: error`, OpenAI an `error` object in a data frame) and the adapter must detect it.
- Does not blindly retry or fail over once text has been shown: duplicates or inconsistent text; decides per product between an error, a clean restart, or a resume that continues from the partial text.
- Classifies the error kind (overloaded versus invalid), feeds the circuit breaker, logs the request id and the partial usage, and tells the user clearly.

</details>

## Common mistakes & troubleshooting

- **Vendor fields leaking into business code.** Someone reads `choices[0].message.content` in a handler. Make the conformance test fail for it; keep adapters the only place that knows vendor shapes.
- **Failing over everything.** An invalid request or a content-filter outcome fails on every provider and burns money and latency. Use the taxonomy: fail over faults, not requests that are wrong.
- **Retrying a billing 429.** See Module 16. Classify by body code, not status.
- **Fallback that changes behaviour silently.** The second provider answers differently (format, refusals, tool use). Evaluate every route on your tasks, tag responses with the route that served them, and alert on fallback rate.
- **A cascade tuned on a friendly test set.** Verifier false-accept rate and traffic mix in production differ from the test. Measure both, on production samples, before and after launch.
- **Streaming replay duplicates text.** Fall back only before the first event (Exercise 2).
- **Token counts compared across providers.** Tokenizers differ, and so does what is counted; compare cost per task, not tokens (Module 16).
- **Hard-coded model ids and prices.** They change on the provider's schedule. Keep them in configuration with a date and a test; pin snapshots where the provider offers them, and re-run evaluations before upgrading.
- **A breaker that never closes, or never opens.** Test both: simulate repeated failures and then recovery, as block 6 does, and make the cooldown and threshold configuration, not constants.
- **Logging prompts for observability.** Log ids, counts, timings and decisions; log content only with an explicit policy.

## Further reading & sources

- [Create chat completion | OpenAI API Reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) - the request and response shape behind the OpenAI-style adapter: messages, tools, `finish_reason`, usage.
- [Create a Message - Claude API Reference](https://platform.claude.com/docs/en/api/messages/create) - the Messages API request and response, tool definitions with `input_schema`, `tool_use` and `tool_result` blocks.
- [Generating content | Gemini API | Google AI for Developers](https://ai.google.dev/api/generate-content) - the `generateContent` and `streamGenerateContent` reference: `contents`, `Part` (`functionCall`, `functionResponse`), `FinishReason`, `usageMetadata`.
- [Streaming messages - Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/streaming) - Anthropic's event flow, partial tool-input JSON, mid-stream `error` events and the "handle unknown event types" rule.
- [OpenAI SDK compatibility - Claude Platform Docs](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk) - the vendor's own statement that its compatibility layer is for testing and comparison, and which features it drops.
- [API errors | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/api-errors) - Gemini's error codes (including `payment_required` and `quota_exceeded`), blocked-generation codes and the mid-stream error event.
- [FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance (arXiv:2305.05176)](https://arxiv.org/abs/2305.05176) - the paper behind LLM cascades and cost-aware model selection.
- [RouteLLM: Learning to Route LLMs with Preference Data (arXiv:2406.18665)](https://arxiv.org/abs/2406.18665) - learned routers that choose between a stronger and a weaker model to balance cost and quality.

## Next

[Module 18: Capstone Project](../18-capstone-project/README.md)
