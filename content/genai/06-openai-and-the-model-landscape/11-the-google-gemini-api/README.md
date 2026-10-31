# Module 11: The Google Gemini API

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**, at folder position 11. [Module 09: Vision and Audio Inputs](../09-vision-and-audio-inputs/README.md) and [Module 10: The Anthropic Claude API](../10-the-anthropic-claude-api/README.md) gave you two providers' shapes; this module adds a third, Google's **Gemini API**, learned from Google's official documentation, and finishes with a **three-way comparison table**. It reuses the vocabulary of Module 10 (stand-in server, tool loop, stream accumulator) so you can see which ideas are universal and which are provider quirks. The OpenAI-style facts in the table come straight from OpenAI's published OpenAPI spec and error-codes guide; the topics have their own modules ([Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md), [Module 03: Streaming Responses](../03-streaming-responses/README.md), [Module 06: Function Calling Basics](../06-function-calling-basics/README.md)), which this module links rather than repeats.

After this module you can:

- build a `generateContent` request (the model in the URL, `contents` made of `parts`, a separate `systemInstruction`, `generationConfig`, `safetySettings`) and read the response (`candidates`, `finishReason`, `promptFeedback`, `usageMetadata`);
- explain the API-key header and the two ways to run Gemini models: the Gemini Developer API and Google Cloud's enterprise offering;
- read a streamed response (`streamGenerateContent`, server-sent events) and merge it into one result, including a stream that ends too early;
- run a function-calling loop (`functionDeclarations`, `functionCall` and `functionResponse` parts) and handle thought signatures;
- send images and files as parts, respect the inline-size limit, and estimate image tokens from the docs' rule;
- fill in a table that compares OpenAI-style, Anthropic and Gemini APIs on request shape, roles, system prompts, tool calls, streaming and errors, without ranking them.

Why it matters: a third provider is where "just swap the base URL" stops working. The differences are structural (the model in the path, `parts` instead of strings, a 200 response that carries no answer, function results that look like user messages), and each one is a bug waiting in a shared abstraction layer ([Module 17: Provider Abstraction and Model Routing](../17-provider-abstraction-and-model-routing/README.md) builds one).

> [!note] How to read this module. You cannot call a provider from this curriculum environment, so nothing here was sent to Google. Everything runs against **a local stand-in that mimics the documented shape; the model behind it is scripted, not a real model**. Every field, header, endpoint and rule below was read from the Gemini API documentation and API reference fetched in **Oct 2026** (ai.google.dev). That documentation was in the middle of a transition when I read it: the pages title the `generateContent` guides "Gemini Generate Content API (Legacy)", and the migration guide says that while `generateContent` "remains fully supported, we recommend the Interactions API for all new development". This module teaches `generateContent` because it is the stateless request/response shape that lines up directly with the OpenAI and Anthropic APIs (which is the point of the comparison) and because a great deal of existing code and SDK material uses it; read the migration guide before you choose for a new project. Model names, limits, prices and feature availability are deliberately not stated as facts: look them up on the day you build.

## Concept

> [!key] A Gemini request is a list of `contents`, each a role (`user` or `model`) holding a list of `parts` where every part carries exactly one kind of data (text, inline bytes, a file reference, a function call, a function response); the model is named in the URL, the system prompt is a separate `systemInstruction`, and the answer comes back as `candidates` whose `finishReason` and `promptFeedback` can say "stopped" even when the HTTP status says 200.

## Explanation

### What you send

**URL, method and key.** The API reference lists two methods on the same resource: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` and `...:streamGenerateContent`. The model is part of the path (`models/{model}`), not a body field. The API overview states: "All requests to the Gemini API must include a `x-goog-api-key` header with your API key." Some older samples in the reference put the key in the URL (`?key=...`); a key in a URL ends up in logs and proxies, so use the header. The SDKs read `GEMINI_API_KEY` or `GOOGLE_API_KEY` from the environment (the latter wins if both are set). `v1beta` is the version the SDKs default to; the API-versions page says `v1` is the stable version and some features (for example context caching and the Live API in the table I read) were `v1beta` only.

The key page adds two points. New keys created in Google AI Studio from May 28, 2026 are "authorization keys" bound to a service account, and the API "rejects requests from unrestricted standard keys". And the usual rules apply with extra force: keep keys out of source control and **never ship them in client-side code**; call the API from a backend.

**Body.** The reference lists the fields (the ones used here):

| Field | Notes from the reference |
| --- | --- |
| `contents[]` | required; the conversation so far; for a single turn, one item; each item is `{role, parts[]}` where `role` "must be either 'user' or 'model'" and can be left out for one-shot requests |
| `systemInstruction` | optional; a `Content` with parts; "currently, text only" |
| `generationConfig` | optional; `maxOutputTokens`, `stopSequences` (up to 5), `candidateCount`, `responseMimeType` and a JSON schema, `temperature`/`topP`/`topK`, `seed`, `thinkingConfig`, `mediaResolution`, ... "not all parameters are configurable for every model" |
| `safetySettings[]` | optional; one `{category, threshold}` per harm category |
| `tools[]`, `toolConfig` | function declarations and built-in tools; how they may be used |
| `cachedContent` | name of a cached context to use |

Sampling parameters deserve a note because the three providers disagree: the reference says `temperature`, `topP` and `topK` are "no longer supported and silently ignored" on the newest model family it names, whereas Anthropic's `2026-10-21` API version rejects them with a 400, and OpenAI-style requests carry `temperature` as an ordinary top-level field (support varies by model). A silent ignore is the dangerous one: nothing tells you your tuning did nothing. REST accepts proto-JSON names in either camelCase or snake_case (the docs' samples mix `systemInstruction` and `system_instruction`, `inlineData` and `inline_data`); the stand-in below accepts both.

### Parts, roles and why there is no `system` or `tool` role

`Content.role` is `user` or `model`. There is no `system` role (the system prompt is the separate `systemInstruction`) and no `tool` role: a function's result is sent as a part of a **user** content, per the function-calling guide's example. (The Tool reference text mentions a "function" role; the guide's code and the Content reference say `user`/`model`, and following the guide is what works with the SDKs.)

A `Part` "can only contain one of the accepted types": `text`, `inlineData` (`mimeType` plus base64 `data`), `fileData` (a `fileUri` for an uploaded file), `functionCall`, `functionResponse`, `executableCode`, `codeExecutionResult`, plus metadata such as `thought` and `thoughtSignature`. So where the other providers have a string-or-list `content`, Gemini always has a list.

### What comes back

```
{ "candidates": [ { "content": {"role": "model", "parts": [...]},
                    "finishReason": "STOP", "index": 0, "safetyRatings": [...] } ],
  "promptFeedback": {...},                       <- only when the PROMPT was blocked
  "usageMetadata": {"promptTokenCount": ..., "candidatesTokenCount": ..., "totalTokenCount": ...},
  "modelVersion": "...", "responseId": "..." }
```

Three habits this shape forces:

1. **An HTTP 200 is not an answer.** If the prompt is blocked, `promptFeedback.blockReason` is set and "no candidates are returned". If the reply is blocked, the candidate's `finishReason` is `SAFETY` (or another stop value), and per the safety guide "the content that was blocked is not returned". Code that does `response.candidates[0].content.parts[0].text` crashes on both.
2. **`finishReason` has no "tool call" value.** The enum includes `STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`, `LANGUAGE`, `OTHER`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `MALFORMED_FUNCTION_CALL`, `UNEXPECTED_TOOL_CALL`, `TOO_MANY_TOOL_CALLS`, `MISSING_THOUGHT_SIGNATURE`, `MALFORMED_RESPONSE`, `CONTINUATION` and several image-related values; a normal tool call ends with `STOP`. You detect a tool call by finding `functionCall` parts. `CONTINUATION` means the per-request token limit was reached but generation is not finished and can be resumed with the returned `continuationToken`.
3. **Usage lives in `usageMetadata`:** `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount` (for thinking models), `cachedContentTokenCount`, `toolUsePromptTokenCount`, and `totalTokenCount` (prompt + tool-use prompt + thoughts + candidates). The response also carries `modelVersion`, a `responseId`, and a `modelStatus` that reports the model's stage and, if applicable, its retirement time: a field worth logging.

### Safety settings

Each setting is a category and a threshold. The adjustable categories in the guide are harassment, hate speech, sexually explicit and dangerous content (`HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_SEXUALLY_EXPLICIT`, `HARM_CATEGORY_DANGEROUS_CONTENT`); thresholds are `OFF`, `BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`. The guide says content is blocked by the **probability** of being unsafe, not its severity; that "if the threshold is not set, the default block threshold is Off for Gemini 2.5 and later models"; that built-in protections (the guide names child safety) are always on; and that less restrictive settings may be reviewed under the terms of service. There "should not be more than one setting for each category", which the local checker below enforces.

### Streaming

`streamGenerateContent` "uses Server-Sent Events (SSE) to push chunks of the response", and the docs' curl examples add `?alt=sse` to the URL. The response body is "a stream of `GenerateContentResponse` instances": each event is a **complete response object** holding the next piece, not a differently shaped delta. That makes Gemini's stream the simplest to parse and the easiest to get subtly wrong: you must merge pieces yourself (concatenate adjacent text, keep function-call parts whole), take `finishReason` from the chunk that has it, and take `usageMetadata` from the last chunk that carries one. The docs I read do not show raw bytes of the events or say how usage is spread over chunks, so Block 2's framing (`data: {json}` plus a blank line, usage on the last event) is the stand-in's reading, labelled as such. Without `alt=sse` the method returns a different framing which this module does not cover.

There is no named event for errors or a `[DONE]` marker in the pages I read. The practical consequence is the check Block 3 implements: a stream that ends without any `finishReason` is **incomplete** ("if empty, the model has not stopped generating tokens", says the Candidate reference).

### Function calling

You declare functions inside a tool: `"tools": [{"functionDeclarations": [{"name", "description", "parameters"}]}]` (parameters are a subset of the OpenAPI schema; `parametersJsonSchema` takes plain JSON Schema, and the two are mutually exclusive). The model answers with a `functionCall` part (`name`, `args` as an object, and, for the newest models, an `id`). You run the function and send the result back as a `functionResponse` part (`name`, `response` as an object, and the matching `id`) in a `user` content. The guide's four steps are: declare, call, execute (your job), call again with the result. The `response` object is free-form ("any keys of their choice"), and "if the function call failed to execute, the response can have an 'error' key".

Rules worth memorising: **always echo the exact `id`** from the `functionCall` in the `functionResponse` ("Gemini 3 now always returns a unique `id`"); several calls in one turn (parallel calling) arrive as several parts and are answered by several `functionResponse` parts in one `user` content; `toolConfig.functionCallingConfig.mode` is `AUTO` (default with only function declarations), `ANY` (always call), `NONE` (never) or `VALIDATED`, optionally with `allowedFunctionNames`.

**Thought signatures.** Because the API is stateless, the guide says, "models use thought signatures to maintain context across multi-turn conversations" (it names the Gemini 3 and 2.5 series). For Gemini 3 any part of a response may carry a `thoughtSignature`, "passing back thought signatures is mandatory for function calling", and you must "always send the `thought_signature` back to the model inside its original Part" and never merge parts that carry signatures. The SDKs do this for you; if you build requests by hand you must append the model's `content` **exactly as received**. The `MISSING_THOUGHT_SIGNATURE` finish reason exists for this case. This is the same lesson as Anthropic's unmodified thinking blocks, with a different surface.

### Multimodal parts

Images and audio go in as `inlineData` (base64) or as `fileData` that references a file you uploaded. From the image guide (checked Oct 2026): inline data limits "your total request size (text prompts, system instructions, and inline bytes) to 20MB"; larger requests should upload the file first; supported image types include PNG, JPEG, WEBP, HEIC and HEIF; up to 3,600 images per request. The token rule is documented as rough: 258 tokens if both sides are at most 384 px, otherwise 768 × 768 tiles of 258 tokens, with tiles estimated from a "crop unit" of `floor(min(width, height) / 1.5)`; the guide's example is a 960 × 540 image (crop unit 360, 3 × 2 = 6 tiles). The guide also says Gemini 3 added a `media_resolution` setting that controls the maximum tokens per image or video frame, so treat the rule as a starting estimate. Block 1 implements it and Block 7 asserts the guide's example. For the OpenAI and Anthropic accounting see [Module 09](../09-vision-and-audio-inputs/README.md) and [Module 10](../10-the-anthropic-claude-api/README.md); for depth, [Track 16, Module 12: Vision: How LLMs See Images](../../16-speech-and-multimodal-models/12-vision-how-llms-see-images/README.md).

### Errors and retries

The errors page lists backend codes with a gRPC-style `status` string (checked Oct 2026): 400 `INVALID_ARGUMENT` (malformed body, or a newer-API feature on an older endpoint), 400 `FAILED_PRECONDITION` (the free tier is not available in your region and billing is not enabled), 402 `RESOURCE_EXHAUSTED` (prepay credits depleted: "Don't retry this request"), 403 `PERMISSION_DENIED`, 404 `NOT_FOUND` (for example a referenced file), 429 `RESOURCE_EXHAUSTED` (rate limits: RPM, TPM, RPD, spend), 499 `CANCELLED`, 500 `INTERNAL` (the example given is an input context that is too long), 503 `UNAVAILABLE`, 504 `DEADLINE_EXCEEDED`. The body is `{"error": {"code", "message", "status", "details": [...]}}` with `details` holding structured items such as `ErrorInfo` (the docs' example for a bad key is a **400** with reason `API_KEY_INVALID`, not a 401). Note that **two different failures share `RESOURCE_EXHAUSTED`**: 429 is retryable after a wait, 402 is not. Retry on 429, 500, 503 and 504 with backoff and jitter; never on the other 4xx codes. The pages I read do not document a `Retry-After` header for Gemini, so the client in Block 3 uses backoff only.

### Developer API versus the Cloud offering

The migration page ("Gemini Developer API vs. Gemini platform", checked Oct 2026) says Google offers two products for Gemini models. The **Gemini Developer API** "provides the fastest path to build, productionize, and scale"; "most developers should use the Gemini Developer API unless there is a need for specific enterprise controls". The **Gemini platform API** is the Google Cloud product: "a comprehensive ecosystem of enterprise ready features and services" backed by Google Cloud. In older material this Cloud product is called Vertex AI, and the SDK parameter is still `vertexai=True` in the `generateContent` examples (the Interactions examples use `enterprise=True`), but the page I read uses the "Gemini platform" name, so expect both names in the wild. Both are reachable through the same `google-genai` SDK; what changes:

| | Gemini Developer API | Gemini platform (Google Cloud) |
| --- | --- | --- |
| Auth | API key (`x-goog-api-key`) | Google Cloud service accounts (IAM); the page says "You'll need to use Google Cloud service accounts to authenticate" |
| SDK construction | `genai.Client()` | `genai.Client(vertexai=True, project="your-project-id", location="us-central1")` |
| Where it runs | the Gemini API service | your Cloud project and region; supported regions "may differ"; the Interactions API on the platform supported only the `global` location during preview |
| Carry-over | | "Any models you created in Google AI Studio need to be retrained"; delete the API key you no longer need |

The REST path and credentials for the Cloud product are in Google Cloud's own documentation, not on the pages I fetched, so this module does not show them. The design consequence is the same as for any provider split: put the client construction (key versus project and location) behind configuration, keep the request and response handling identical, and test both.

### Where `generateContent` sits now

The Interactions API (the migration guide's "Why migrate?") adds server-side history through `previous_interaction_id` (with `store=true` by default, `store=false` for stateless use), typed "steps" for intermediate events, and background execution for long tasks. `generateContent` stays stateless: you resend the whole history, exactly like the Chat Completions and Messages APIs. If you design a provider abstraction, the stateless shape is the common denominator; treat server-side state as a provider-specific optimisation.

### Side by side: OpenAI-style, Anthropic and Gemini

Drawn from OpenAI's OpenAPI spec (commit of 2026-10-24), Anthropic's and Google's documentation, all checked Oct 2026. It describes shapes, not quality: no provider is ranked, and "differs" does not mean "worse".

| | OpenAI-style (Chat Completions) | Anthropic (Messages) | Gemini (`generateContent`) |
| --- | --- | --- | --- |
| **Request shape** | | | |
| Endpoint, model | `POST /v1/chat/completions`, model in the body | `POST /v1/messages`, model in the body | `POST /v1beta/models/{model}:generateContent`, **model in the URL** |
| Auth | bearer token | bearer token (or legacy `x-api-key`) plus required `anthropic-version` header | `x-goog-api-key` header |
| Conversation field | `messages[]` | `messages[]` | `contents[]` |
| Content | string or array of parts | string or array of blocks | **always** an array of `parts`, one data field each |
| Output cap | `max_completion_tokens` (optional) | `max_tokens` (**required**) | `generationConfig.maxOutputTokens` (optional) |
| Sampling | `temperature` etc. at top level | not accepted from API version `2026-10-21` | `generationConfig.temperature` etc.; silently ignored on the newest models named in the reference |
| **Roles** | | | |
| Roles | `system`/`developer`, `user`, `assistant`, `tool` | `user`, `assistant` (restricted mid-conversation `system`) | `user`, `model` |
| **System prompt** | | | |
| Where | a message in `messages` | top-level `system` | top-level `systemInstruction` (a `Content`, text only) |
| **Tool calls** | | | |
| Declare | `tools: [{type: "function", function: {name, description, parameters}}]` | `tools: [{name, description, input_schema}]` | `tools: [{functionDeclarations: [{name, description, parameters}]}]` |
| Model's call | `tool_calls[]`, arguments as a JSON **string** | `tool_use` block, `input` object | `functionCall` part, `args` object, `id` on newer models |
| Your result | a `role: "tool"` message per call, `tool_call_id` | `tool_result` blocks first in one `user` message, `tool_use_id`, `is_error` | `functionResponse` parts in one `user` content, `id`, `response` object (an `error` key by convention) |
| Detect a call | `finish_reason == "tool_calls"` | `stop_reason == "tool_use"` | `functionCall` parts present (`finishReason` is `STOP`) |
| Control | `tool_choice` | `tool_choice` | `toolConfig.functionCallingConfig.mode` and `allowedFunctionNames` |
| Hidden reasoning state | Chat Completions only counts reasoning tokens; the Responses API returns `reasoning` items to include in `input` when you manage context yourself ([Module 05: Reasoning Models and Test-Time Compute](../05-reasoning-models-and-test-time-compute/README.md)) | `thinking` blocks with `signature`, pass back unmodified | `thoughtSignature` on parts, mandatory for function calling on Gemini 3 |
| **Response and stop** | | | |
| Shape | `choices[].message` | `content[]` blocks | `candidates[].content.parts[]` |
| Stop signal | `finish_reason` | `stop_reason` | `candidates[].finishReason`, plus `promptFeedback.blockReason` |
| Usage | `prompt_tokens`, `completion_tokens` | `input_tokens`, `output_tokens`, cache fields | `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount` |
| Safety signal | refusal text or content-filter finish | `stop_reason: "refusal"` | `safetySettings` in, `blockReason` / `finishReason: SAFETY` out |
| **Streaming** | | | |
| How | `stream: true` | `stream: true` | a separate method, `:streamGenerateContent`, `?alt=sse` for SSE |
| Event shape | `data: {chunk}` with `choices[].delta` | named events (`message_start`, `content_block_delta`, ...) | each event is a **full** `GenerateContentResponse` |
| End | `data: [DONE]` | `message_stop` | the chunk with a `finishReason` (no marker documented) |
| **Errors** | | | |
| Body | `{"error": {"message", "type", "param", "code"}}` | `{"type": "error", "error": {"type", "message"}, "request_id"}` | `{"error": {"code", "message", "status", "details"}}` |
| Overload / quota | 503 `server_is_overloaded`; 429 codes | 529 `overloaded_error`; 429 | 503 `UNAVAILABLE`; 429 and 402 both `RESOURCE_EXHAUSTED` |

The row to remember is "Detect a call": three providers, three different signals. The one most likely to bite a shared abstraction layer is that Gemini reports "done, and also here is a function call" with the same `STOP` it uses for plain text.

## Code

Plain Python 3.13 standard library. Seven blocks form one file: paste them in order into `gemini_lab.py` and run it. Block 2 (the stand-in) is collapsed. Each block prints under a numbered header and the output is pasted from a real run (deterministic: four runs gave identical output).

### Block 1: URL, headers, the smallest body, a local checker

```python
import base64
import hashlib
import json
import math
import os
import re
import struct

# Configuration, not constants.
MODEL = os.environ.get("GEMINI_MODEL", "your-gemini-model-id")     # the model id goes in the URL path
HOST = "https://generativelanguage.googleapis.com"                  # the local run points at a stand-in instead
API_VERSION_PATH = "v1beta"                                          # api-versions page: the SDKs default to v1beta

def endpoint(model, stream=False):
    """The model is part of the URL, not the body. Streaming is a different METHOD, asked for as SSE."""
    method = "streamGenerateContent?alt=sse" if stream else "generateContent"
    return f"/{API_VERSION_PATH}/models/{model}:{method}"

def request_headers(api_key):
    return {"x-goog-api-key": api_key, "Content-Type": "application/json"}

# ---- building blocks: Content = {role, parts[]}, and a Part holds exactly ONE kind of data -----
def content(role, *parts):
    return {"role": role, "parts": list(parts)}

def text(t):
    return {"text": t}

def inline_data(mime, b64):
    return {"inlineData": {"mimeType": mime, "data": b64}}

PART_KINDS = {"text", "inlineData", "fileData", "functionCall", "functionResponse",
              "executableCode", "codeExecutionResult"}
HARM_CATEGORIES = {"HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH",
                   "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"}
THRESHOLDS = {"OFF", "BLOCK_NONE", "BLOCK_ONLY_HIGH", "BLOCK_MEDIUM_AND_ABOVE", "BLOCK_LOW_AND_ABOVE",
              "HARM_BLOCK_THRESHOLD_UNSPECIFIED"}
FUNCTION_NAME = re.compile(r"^[A-Za-z0-9_:.\-]{1,128}$")             # from the FunctionDeclaration reference

def generate_body(user_text, *, system=None, tools=None, safety=None, **generation_config):
    body = {"contents": [content("user", text(user_text))]}
    if system:
        body["systemInstruction"] = {"parts": [text(system)]}          # a separate field, text only
    if generation_config:
        body["generationConfig"] = generation_config                   # maxOutputTokens, temperature, ...
    if tools:
        body["tools"] = [{"functionDeclarations": tools}]              # note the extra wrapper level
    if safety:
        body["safetySettings"] = safety
    return body

def check_request(body):
    """Cheap local checks taken from the generateContent reference (my checks, not the server's)."""
    problems = []
    contents = body.get("contents")
    if not contents:
        problems.append("contents is required and must not be empty")
    for i, c in enumerate(contents or []):
        if c.get("role", "user") not in ("user", "model"):
            problems.append(f"contents[{i}].role must be 'user' or 'model'")
        if not c.get("parts"):
            problems.append(f"contents[{i}].parts must not be empty")
        for j, p in enumerate(c.get("parts", [])):
            kinds = [k for k in p if k in PART_KINDS]
            if len(kinds) != 1:
                problems.append(f"contents[{i}].parts[{j}] must hold exactly one data field, found {kinds}")
    si = body.get("systemInstruction")
    if si and any(set(p) - {"text"} for p in si.get("parts", [])):
        problems.append("systemInstruction is text only")
    seen = set()
    for s in body.get("safetySettings", []):
        if s.get("category") not in HARM_CATEGORIES or s.get("threshold") not in THRESHOLDS:
            problems.append(f"bad safety setting {s}")
        if s.get("category") in seen:
            problems.append(f"more than one safety setting for {s.get('category')}")
        seen.add(s.get("category"))
    for t in body.get("tools", []):
        for d in t.get("functionDeclarations", []):
            if not FUNCTION_NAME.match(d.get("name", "")):
                problems.append(f"function name {d.get('name')!r} is not allowed")
            if "parameters" in d and "parametersJsonSchema" in d:
                problems.append("parameters and parametersJsonSchema are mutually exclusive")
    if len(body.get("generationConfig", {}).get("stopSequences", [])) > 5:
        problems.append("stopSequences allows at most 5 entries")
    return problems

WEATHER_DECL = {
    "name": "get_weather",
    "description": "Get the current weather for a city.",
    "parameters": {"type": "object",
                   "properties": {"city": {"type": "string", "description": "City name, e.g. Paris"}},
                   "required": ["city"]},
}

def gemini_image_tokens(width, height):
    """Image page, 'Token calculation' (checked Oct 2026), a ROUGH rule: 258 tokens if both sides are <= 384 px;
    otherwise 768x768 tiles at 258 tokens each, with tiles ~ ceil(w/crop) x ceil(h/crop), crop = floor(min(w,h)/1.5).
    Gemini 3 adds a media_resolution setting that changes the accounting; see that guide."""
    if width <= 384 and height <= 384:
        return 258
    crop = math.floor(min(width, height) / 1.5)
    return 258 * math.ceil(width / crop) * math.ceil(height / crop)

if __name__ == "__main__":
    print("=== 1. the URL, the headers, the smallest body, and a local checker ===")
    print("POST", HOST + endpoint(MODEL))
    print("POST", HOST + endpoint(MODEL, stream=True))
    print(json.dumps(request_headers("<your-key-here>")))
    body = generate_body("Hello, Gemini", system="You are terse.", maxOutputTokens=64)
    print(json.dumps(body, indent=2))
    print("problems:", check_request(body))
    print("--- things the checker catches ---")
    bad = {"contents": [{"role": "assistant", "parts": [{"text": "x", "inlineData": {"mimeType": "image/png", "data": "AA=="}}]}],
           "safetySettings": [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                              {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF"}],
           "tools": [{"functionDeclarations": [{"name": "get weather"}]}]}
    for p in check_request(bad):
        print(" -", p)
```

Output:

```
=== 1. the URL, the headers, the smallest body, and a local checker ===
POST https://generativelanguage.googleapis.com/v1beta/models/your-gemini-model-id:generateContent
POST https://generativelanguage.googleapis.com/v1beta/models/your-gemini-model-id:streamGenerateContent?alt=sse
{"x-goog-api-key": "<your-key-here>", "Content-Type": "application/json"}
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Hello, Gemini"
        }
      ]
    }
  ],
  "systemInstruction": {
    "parts": [
      {
        "text": "You are terse."
      }
    ]
  },
  "generationConfig": {
    "maxOutputTokens": 64
  }
}
problems: []
--- things the checker catches ---
 - contents[0].role must be 'user' or 'model'
 - contents[0].parts[0] must hold exactly one data field, found ['text', 'inlineData']
 - more than one safety setting for HARM_CATEGORY_HARASSMENT
 - function name 'get weather' is not allowed
```

Note the extra level in `tools` (a tool *contains* `functionDeclarations`), the model in the URL, and that streaming is a different method plus a query string, not a body flag.

### Block 2: the local stand-in (plumbing)

**A local stand-in that mimics the documented shape; the model behind it is scripted, not a real model.** It checks the key, parses `models/{model}:generateContent` and `:streamGenerateContent` from the path, normalises snake_case names, validates the body with Block 1's checker (so it exercises the plumbing, not the rules), answers with `candidates`, `usageMetadata`, `promptFeedback` and `finishReason` signals, streams SSE, and can inject faults (429/503/402 and a dropped stream). If a `get_weather` function is declared and the text mentions weather in a city, it returns `functionCall` parts with ids; with a `thinkingConfig` it adds a `thoughtSignature` and expects it back. The words `BLOCKME_PROMPT` and `BLOCKME_REPLY` trigger the two block signals. Token counts are whitespace-separated pieces of JSON, **not** a tokenizer; error messages are its own words (the shape and status strings are the documented ones); and returning `MISSING_THOUGHT_SIGNATURE` as a 200 finish reason is the stand-in's reading of the finish-reason table, since the docs do not say which HTTP status accompanies it.

<details>
<summary>The stand-in server (about 210 lines)</summary>

```python
import http.server
import threading
import urllib.parse

# ---------------------------------------------------------------------------
# A LOCAL STAND-IN that mimics the documented generateContent / streamGenerateContent
# shapes: contents + parts, systemInstruction, functionCall / functionResponse parts,
# promptFeedback and finishReason safety signals, usageMetadata, SSE streaming, and the
# Google-style error body. The model behind it is SCRIPTED (a few if-statements).
# Error wording is the stand-in's own; the error SHAPE and the status strings are the documented ones.
# It validates requests with this module's own check_request(), so what it exercises is the
# plumbing (framing, loops, retries), not the validation rules themselves.
# ---------------------------------------------------------------------------
GRPC_STATUS = {400: "INVALID_ARGUMENT", 402: "RESOURCE_EXHAUSTED", 403: "PERMISSION_DENIED", 404: "NOT_FOUND",
               429: "RESOURCE_EXHAUSTED", 499: "CANCELLED", 500: "INTERNAL", 503: "UNAVAILABLE",
               504: "DEADLINE_EXCEEDED"}

# REST accepts proto-JSON names in camelCase or snake_case (the docs' samples use both).
SNAKE = {"system_instruction": "systemInstruction", "generation_config": "generationConfig",
         "safety_settings": "safetySettings", "tool_config": "toolConfig",
         "function_declarations": "functionDeclarations", "inline_data": "inlineData", "mime_type": "mimeType",
         "file_data": "fileData", "function_call": "functionCall", "function_response": "functionResponse",
         "max_output_tokens": "maxOutputTokens", "stop_sequences": "stopSequences",
         "candidate_count": "candidateCount", "thinking_config": "thinkingConfig",
         "thought_signature": "thoughtSignature"}
USER_DATA = {"args", "response", "parameters", "parametersJsonSchema", "properties"}   # never rename user keys

def normalize(obj):
    if isinstance(obj, list):
        return [normalize(x) for x in obj]
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            k = SNAKE.get(k, k)
            out[k] = v if k in USER_DATA else normalize(v)
        return out
    return obj

def error_obj(status, message, reason=None):
    err = {"code": status, "message": message, "status": GRPC_STATUS[status], "details": []}
    if reason:
        err["details"].append({"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": reason,
                               "domain": "googleapis.com",
                               "metadata": {"service": "generativelanguage.googleapis.com"}})
    return {"error": err}

def n_tokens(obj):
    return len(json.dumps(obj, sort_keys=True).split())            # crude stand-in for a tokenizer

def signature_for(call):
    return base64.b64encode(hashlib.sha256(json.dumps(call, sort_keys=True).encode()).digest()[:9]).decode()

def prompt_tokens(body):
    total = n_tokens(body["systemInstruction"]) if "systemInstruction" in body else 0
    for c in body["contents"]:
        for p in c["parts"]:
            if "inlineData" in p and p["inlineData"]["mimeType"] == "image/png":
                raw = base64.b64decode(p["inlineData"]["data"])
                total += gemini_image_tokens(*struct.unpack(">II", raw[16:24]))
            else:
                total += n_tokens(p)
    return total

def script(body, srv):
    """Return (parts, finishReason, promptFeedback)."""
    last = body["contents"][-1]
    user_text = " ".join(p["text"] for p in last["parts"] if "text" in p)
    thinking = "thinkingConfig" in body.get("generationConfig", {})
    if "BLOCKME_PROMPT" in user_text:
        return [], None, {"blockReason": "SAFETY", "safetyRatings": [
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "probability": "HIGH"}]}
    if "BLOCKME_REPLY" in user_text:
        return [], "SAFETY", None
    responses = [p["functionResponse"] for p in last["parts"] if "functionResponse" in p]
    if responses:
        previous = [c for c in body["contents"][:-1] if c["role"] == "model"][-1]
        calls = [p for p in previous["parts"] if "functionCall" in p]
        if thinking and any(p.get("thoughtSignature") != signature_for(p["functionCall"]) for p in calls):
            return [], "MISSING_THOUGHT_SIGNATURE", None
        said = []
        for r in responses:
            out = r["response"]
            said.append("error: " + str(out["error"]) if "error" in out else str(out.get("result", out)))
        return [{"text": "Here is what I found: " + "; ".join(said) + "."}], "STOP", None
    tools = {d["name"] for t in body.get("tools", []) for d in t.get("functionDeclarations", [])}
    cities = re.findall(r"\b(?:in|and)\s+([A-Z][a-z]+)", user_text)
    if "get_weather" in tools and "weather" in user_text.lower() and cities:
        parts = [{"text": "I'll check the weather."}]
        for city in cities:
            srv.call_counter += 1
            call = {"id": f"call_standin_{srv.call_counter:02d}", "name": "get_weather", "args": {"city": city}}
            part = {"functionCall": call}
            if thinking:
                part["thoughtSignature"] = signature_for(call)
            parts.append(part)
        return parts, "STOP", None                     # note: STOP, there is no 'tool call' finish reason
    media = [p["inlineData"] for p in last["parts"] if "inlineData" in p]
    said = f"(scripted) You said: {user_text}"
    if media:
        said += f" [and sent {len(media)} part(s): {', '.join(m['mimeType'] for m in media)}]"
    return [{"text": said}], "STOP", None

class StandInGemini(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, inline_limit=20 * 1024 * 1024):
        super().__init__(("127.0.0.1", 0), _Handler)
        self.faults, self.requests = [], []
        self.call_counter = self.resp_counter = 0
        self.inline_limit = inline_limit

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

    def _json(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=UTF-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _fail(self, status, message, reason=None):
        self._json(status, error_obj(status, message, reason))

    def do_POST(self):
        srv = self.server
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        srv.resp_counter += 1
        if srv.faults and srv.faults[0].get("status"):
            f = srv.faults.pop(0)
            return self._fail(f["status"], f.get("message", "injected fault"))
        url = urllib.parse.urlsplit(self.path)
        m = re.fullmatch(r"/v1(?:beta)?/models/([^:/]+):(generateContent|streamGenerateContent)", url.path)
        key = self.headers.get("x-goog-api-key") or urllib.parse.parse_qs(url.query).get("key", [""])[0]
        if not key:
            return self._fail(400, "API key not valid. Please pass a valid API key.", "API_KEY_INVALID")
        if not m or m.group(1) == "unknown-model":
            return self._fail(404, "models/%s is not found for API version %s" % (m and m.group(1), API_VERSION_PATH))
        if len(raw) > srv.inline_limit:
            return self._fail(400, f"request is {len(raw):,} bytes; inline data limit is {srv.inline_limit:,}")
        try:
            body = normalize(json.loads(raw))
        except ValueError:
            return self._fail(400, "Invalid JSON payload received.")
        problems = check_request(body)
        if problems:
            return self._fail(400, "; ".join(problems))
        srv.requests.append(body)

        parts, finish, feedback = script(body, srv)
        out_tokens = sum(n_tokens(p) for p in parts)
        cap = body.get("generationConfig", {}).get("maxOutputTokens")
        if finish == "STOP" and cap and len(parts) == 1 and "text" in parts[0] and out_tokens > cap:
            parts = [{"text": " ".join(parts[0]["text"].split()[:max(1, cap - 2)])}]
            finish, out_tokens = "MAX_TOKENS", cap
        usage = {"promptTokenCount": prompt_tokens(body), "candidatesTokenCount": out_tokens}
        if "thinkingConfig" in body.get("generationConfig", {}):
            usage["thoughtsTokenCount"] = 5
        usage["totalTokenCount"] = sum(usage.values())
        base = {"modelVersion": m.group(1), "responseId": f"resp_standin_{srv.resp_counter:03d}"}
        if feedback:
            resp = {"promptFeedback": feedback, "usageMetadata": usage, **base}
        else:
            cand = {"index": 0, "finishReason": finish}
            if parts:
                cand["content"] = {"role": "model", "parts": parts}
            resp = {"candidates": [cand], "usageMetadata": usage, **base}
        if m.group(2) == "generateContent":
            return self._json(200, resp)
        self._stream(resp, parts)

    def _stream(self, resp, parts):
        fault = self.server.faults.pop(0) if self.server.faults else {}
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        pieces = []
        for p in parts:
            if "text" in p:
                pieces += [{"text": t} for t in re.findall(r"(?:\S+\s*){1,3}", p["text"])]
            else:
                pieces.append(p)                      # a functionCall part arrives whole, in one event
        events = []
        for i, piece in enumerate(pieces):
            last = i == len(pieces) - 1
            cand = {"index": 0, "content": {"role": "model", "parts": [piece]}}
            if last:
                cand["finishReason"] = resp["candidates"][0]["finishReason"]
            ev = {"candidates": [cand], "modelVersion": resp["modelVersion"], "responseId": resp["responseId"]}
            if last:
                ev["usageMetadata"] = resp["usageMetadata"]
            events.append(ev)
        if not events:
            events = [resp]                           # blocked prompt / blocked reply: one event says why
        for i, ev in enumerate(events):
            if fault.get("drop_after") == i:
                return                                # connection closes with no finishReason: a truncated stream
            self.wfile.write(f"data: {json.dumps(ev)}\r\n\r\n".encode())
            self.wfile.flush()
```

</details>

### Block 3: client, SSE reader, stream merger and tool loop

`Gemini._open` retries 429/500/503/504 with backoff and jitter and never retries 402 or other 4xx. `first_candidate` turns the "200 but no answer" cases into one exception. `StreamReader` merges chunks. `run_tool_loop` looks for `functionCall` parts, appends the model's content verbatim, and answers with one user content.

```python
import copy
import random
import time
import urllib.error
import urllib.request

class ApiError(Exception):
    """The Google-style error body: {"error": {"code", "message", "status", "details"}}."""
    def __init__(self, code, status, message, reason=None):
        super().__init__(f"{code} {status}: {message}")
        self.code, self.status, self.message, self.reason = code, status, message, reason

class Blocked(Exception):
    """HTTP 200, but the prompt or the reply was stopped by a safety or policy signal."""
    def __init__(self, where, reason):
        super().__init__(f"{where} blocked: {reason}")
        self.where, self.reason = where, reason

class IncompleteStream(Exception):
    """The stream ended without any finishReason: the model had not finished."""

# 402 is also RESOURCE_EXHAUSTED, but the errors page says not to retry it (credits are gone).
RETRYABLE = {429, 500, 503, 504}

class Gemini:
    def __init__(self, base, api_key, *, max_retries=2, sleep=time.sleep, rng=None):
        self.base, self.api_key, self.max_retries = base, api_key, max_retries
        self.sleep, self.rng, self.retries_made = sleep, rng or random.Random(0), 0

    def _open(self, model, body, stream):
        req = urllib.request.Request(self.base + endpoint(model, stream), data=json.dumps(body).encode(),
                                     method="POST", headers=request_headers(self.api_key))
        for attempt in range(self.max_retries + 1):
            try:
                return urllib.request.urlopen(req, timeout=10)
            except urllib.error.HTTPError as err:
                e = json.loads(err.read() or b"{}").get("error", {})
                reason = (e.get("details") or [{}])[0].get("reason")
                api_err = ApiError(err.code, e.get("status", "?"), e.get("message", ""), reason)
                if err.code not in RETRYABLE or attempt == self.max_retries:
                    raise api_err
                self.retries_made += 1
                self.sleep(min(8.0, 0.5 * 2 ** attempt) * (0.5 + self.rng.random() / 2))

    def generate(self, model, body):
        with self._open(model, body, stream=False) as resp:
            return json.loads(resp.read())

    def stream_chunks(self, model, body):
        """Each SSE event's data is one complete GenerateContentResponse."""
        with self._open(model, body, stream=True) as resp:
            data = []
            for raw in resp:
                line = raw.decode("utf-8").rstrip("\r\n")
                if line.startswith("data:"):
                    data.append(line[5:].removeprefix(" "))
                elif line == "" and data:
                    yield json.loads("\n".join(data))
                    data = []
            if data:
                yield json.loads("\n".join(data))

NORMAL_FINISH = {"STOP", "MAX_TOKENS"}       # anything else (SAFETY, RECITATION, MALFORMED_FUNCTION_CALL, ...) is a stop

def first_candidate(resp):
    feedback = resp.get("promptFeedback") or {}
    if feedback.get("blockReason"):
        raise Blocked("prompt", feedback["blockReason"])          # no candidates are returned in this case
    candidates = resp.get("candidates") or []
    if not candidates:
        raise Blocked("reply", "no candidates")
    cand = candidates[0]
    if cand.get("finishReason") not in NORMAL_FINISH:
        raise Blocked("reply", cand.get("finishReason"))
    return cand

def text_of(cand):
    return "".join(p["text"] for p in cand.get("content", {}).get("parts", []) if "text" in p and not p.get("thought"))

class StreamReader:
    """Merge streamed GenerateContentResponse chunks into one response shaped like the non-streamed one."""
    def __init__(self):
        self.parts, self.finish, self.usage, self.feedback, self.meta = [], None, None, None, {}

    def feed(self, chunk):
        self.meta.update({k: chunk[k] for k in ("modelVersion", "responseId") if k in chunk})
        self.feedback = chunk.get("promptFeedback") or self.feedback
        self.usage = chunk.get("usageMetadata") or self.usage              # the last one wins
        for cand in chunk.get("candidates", []):
            for part in cand.get("content", {}).get("parts", []):
                if set(part) == {"text"} and self.parts and set(self.parts[-1]) == {"text"}:
                    self.parts[-1]["text"] += part["text"]                  # glue adjacent plain-text pieces
                else:
                    self.parts.append(copy.deepcopy(part))
            self.finish = cand.get("finishReason") or self.finish

    def result(self):
        if self.feedback:
            return {"promptFeedback": self.feedback, "usageMetadata": self.usage, **self.meta}
        if self.finish is None:
            raise IncompleteStream("stream ended before any finishReason arrived")
        cand = {"index": 0, "finishReason": self.finish}
        if self.parts:
            cand["content"] = {"role": "model", "parts": self.parts}
        return {"candidates": [cand], "usageMetadata": self.usage, **self.meta}

def stream_response(gem, model, body):
    reader = StreamReader()
    for chunk in gem.stream_chunks(model, body):
        reader.feed(chunk)
    return reader.result()

def part_kind(part):
    return next(k for k in part if k in PART_KINDS)

def run_tool_loop(gem, model, functions, user_text, *, tools, max_turns=6, use_stream=False, **config):
    """Gemini's loop has no 'tool_calls' finish reason: you look for functionCall PARTS."""
    contents = [content("user", text(user_text))]
    trace = []
    for _ in range(max_turns):
        body = {"contents": contents, "tools": [{"functionDeclarations": tools}]}
        if config:
            body["generationConfig"] = config
        resp = stream_response(gem, model, body) if use_stream else gem.generate(model, body)
        cand = first_candidate(resp)
        parts = cand["content"]["parts"]
        trace.append((cand["finishReason"], [part_kind(p) for p in parts]))
        contents.append(cand["content"])                         # the model's turn, verbatim (keeps thoughtSignature)
        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        if not calls:
            return resp, contents, trace
        answers = []
        for call in calls:
            try:
                out = {"result": functions[call["name"]](**call["args"])}
            except Exception as exc:                              # report it to the model, do not crash the loop
                out = {"error": f"{type(exc).__name__}: {exc}"}
            fr = {"name": call["name"], "response": out}
            if "id" in call:
                fr["id"] = call["id"]                            # echo the id the API gave you
            answers.append({"functionResponse": fr})
        contents.append(content("user", *answers))               # function results travel in a USER content
    raise RuntimeError(f"no final answer after {max_turns} turns")
```

### Block 4: a plain call, safety signals, errors and retries

```python
if __name__ == "__main__":
    srv = StandInGemini().start()
    try:
        print("=== 2. a plain call, safety signals, and the error body ===")
        gem = Gemini(srv.base, "stand-in-key", sleep=lambda s: None)
        resp = gem.generate(MODEL, generate_body("Hello, Gemini", system="You are terse.", maxOutputTokens=64))
        print(json.dumps(resp, indent=2))
        print("text:", text_of(first_candidate(resp)))

        snake = {"system_instruction": {"parts": [{"text": "Be brief."}]},
                 "contents": [{"role": "user", "parts": [{"text": "hi"}]}],
                 "generation_config": {"max_output_tokens": 32}}
        print("snake_case field names accepted too:", text_of(first_candidate(gem.generate(MODEL, snake))))

        cut = gem.generate(MODEL, generate_body("Tell me something long and wonderful", maxOutputTokens=4))
        print("maxOutputTokens=4 ->", cut["candidates"][0]["finishReason"], "|", repr(text_of(cut["candidates"][0])))

        for label, prompt in (("prompt blocked", "BLOCKME_PROMPT please"), ("reply blocked", "BLOCKME_REPLY please")):
            resp = gem.generate(MODEL, generate_body(prompt))
            try:
                first_candidate(resp)
            except Blocked as err:
                where = "promptFeedback" if "promptFeedback" in resp else "candidates[0].finishReason"
                print(f"{label:<15} -> HTTP 200, but {err}  (read from {where}; has candidates: {'candidates' in resp})")

        safety = [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"}]
        ok = gem.generate(MODEL, generate_body("Hi", safety=safety))
        print("safetySettings accepted ->", ok["candidates"][0]["finishReason"])

        print("\n--- errors: one body shape (code, message, status, details) ---")
        attempts = [
            ("no API key", Gemini(srv.base, "", sleep=lambda s: None), MODEL, generate_body("hi")),
            ("unknown model", gem, "unknown-model", generate_body("hi")),
            ("role 'assistant'", gem, MODEL, {"contents": [{"role": "assistant", "parts": [{"text": "x"}]}]}),
            ("two settings, one category", gem, MODEL, generate_body("hi", safety=safety * 2)),
        ]
        for label, g, model, body in attempts:
            try:
                g.generate(model, body)
            except ApiError as err:
                print(f"{label:<27} -> {err.code} {err.status}: {err.message}" + (f" [{err.reason}]" if err.reason else ""))

        print("\n=== 3. retries: backoff with jitter, and the 402 that must not be retried ===")
        waits = []
        g = Gemini(srv.base, "k", sleep=waits.append)
        srv.faults += [{"status": 429}, {"status": 503}]
        print("outcome:", g.generate(MODEL, generate_body("hi"))["candidates"][0]["finishReason"],
              "| waits:", [round(w, 3) for w in waits], "| retries:", g.retries_made)
        srv.faults += [{"status": 503}] * 3
        try:
            g.generate(MODEL, generate_body("hi"))
        except ApiError as err:
            print("three 503s in a row ->", err, "| total retries:", g.retries_made)
        for status in (402, 400):
            before = g.retries_made
            srv.faults.append({"status": status})
            try:
                g.generate(MODEL, generate_body("hi"))
            except ApiError as err:
                print(f"{status} is never retried:", err.status, "| retries unchanged:", g.retries_made == before)
    finally:
        srv.stop()
```

Output:

```
=== 2. a plain call, safety signals, and the error body ===
{
  "candidates": [
    {
      "index": 0,
      "finishReason": "STOP",
      "content": {
        "role": "model",
        "parts": [
          {
            "text": "(scripted) You said: Hello, Gemini"
          }
        ]
      }
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 8,
    "candidatesTokenCount": 6,
    "totalTokenCount": 14
  },
  "modelVersion": "your-gemini-model-id",
  "responseId": "resp_standin_001"
}
text: (scripted) You said: Hello, Gemini
snake_case field names accepted too: (scripted) You said: hi
maxOutputTokens=4 -> MAX_TOKENS | '(scripted) You'
prompt blocked  -> HTTP 200, but prompt blocked: SAFETY  (read from promptFeedback; has candidates: False)
reply blocked   -> HTTP 200, but reply blocked: SAFETY  (read from candidates[0].finishReason; has candidates: True)
safetySettings accepted -> STOP

--- errors: one body shape (code, message, status, details) ---
no API key                  -> 400 INVALID_ARGUMENT: API key not valid. Please pass a valid API key. [API_KEY_INVALID]
unknown model               -> 404 NOT_FOUND: models/unknown-model is not found for API version v1beta
role 'assistant'            -> 400 INVALID_ARGUMENT: contents[0].role must be 'user' or 'model'
two settings, one category  -> 400 INVALID_ARGUMENT: more than one safety setting for HARM_CATEGORY_HARASSMENT
```

```
=== 3. retries: backoff with jitter, and the 402 that must not be retried ===
outcome: STOP | waits: [0.461, 0.879] | retries: 2
three 503s in a row -> 503 UNAVAILABLE: injected fault | total retries: 4
402 is never retried: RESOURCE_EXHAUSTED | retries unchanged: True
400 is never retried: INVALID_ARGUMENT | retries unchanged: True
```

The two blocked cases are the ones to study: both are HTTP 200, but one has **no `candidates` key at all** (the prompt was refused, the reason is in `promptFeedback`), and the other has a candidate **with no `content`** (the reply was refused, the reason is its `finishReason`). A client that checks only the HTTP status or only `finishReason` misses one of them. The error rows show the single Google-style body for different causes (including the documented 400 for a bad key), and the retry section shows the one subtle rule: 402 and 429 are both `RESOURCE_EXHAUSTED`, but only 429 is worth retrying.

> [!example] Worked case: two 200s that are not answers. A request containing `BLOCKME_PROMPT` gets `{"promptFeedback": {"blockReason": "SAFETY", ...}, "usageMetadata": ...}` and no `candidates` key. A request containing `BLOCKME_REPLY` gets one candidate with `"finishReason": "SAFETY"` and no `content`. The naive `resp["candidates"][0]["content"]["parts"][0]["text"]` raises `KeyError: 'candidates'` on the first and `KeyError: 'content'` on the second; `first_candidate` turns both into one `Blocked` exception carrying where and why, which you can show to the user or log.

### Block 5: streaming

```python
if __name__ == "__main__":
    print("=== 4. streaming: SSE events that are whole responses ===")
    srv = StandInGemini().start()
    try:
        gem = Gemini(srv.base, "stand-in-key", sleep=lambda s: None)
        ask = generate_body("Tell me about Paris in a few friendly words please", maxOutputTokens=64)

        print("--- the raw stream, first 3 events (one JSON GenerateContentResponse per 'data:' line) ---")
        with gem._open(MODEL, ask, stream=True) as resp:
            shown = 0
            for raw in resp:
                line = raw.decode().rstrip()
                if line.startswith("data:") and shown < 3:
                    chunk = json.loads(line[5:])
                    print(f"data: parts={chunk['candidates'][0]['content']['parts']} "
                          f"finishReason={chunk['candidates'][0].get('finishReason')} usage={'usageMetadata' in chunk}")
                    shown += 1

        chunks = list(gem.stream_chunks(MODEL, ask))
        streamed = stream_response(gem, MODEL, ask)
        plain = gem.generate(MODEL, ask)
        print(f"\n{len(chunks)} events; finishReason appears only on the last:",
              [c["candidates"][0].get("finishReason") for c in chunks][-3:])
        print("usageMetadata appears only on the last event:", [("usageMetadata" in c) for c in chunks][-3:])
        for key in ("candidates", "usageMetadata"):
            print(f"merged stream {key} == non-streamed {key}:", streamed[key] == plain[key])
        print("merged text:", text_of(first_candidate(streamed)))

        print("\n--- a function call arrives as one whole part ---")
        ask_tool = generate_body("What is the weather in Paris?", tools=[WEATHER_DECL])
        merged = stream_response(gem, MODEL, ask_tool)
        print([next(k for k in p if k in PART_KINDS) for p in merged["candidates"][0]["content"]["parts"]],
              "| finishReason:", merged["candidates"][0]["finishReason"])

        print("\n--- the connection drops before the model finished ---")
        srv.faults.append({"drop_after": 2})
        try:
            stream_response(gem, MODEL, ask)
        except IncompleteStream as err:
            print("IncompleteStream:", err)
        print("--- a blocked prompt, streamed ---")
        try:
            first_candidate(stream_response(gem, MODEL, generate_body("BLOCKME_PROMPT")))
        except Blocked as err:
            print(err)
    finally:
        srv.stop()
```

Output:

```
=== 4. streaming: SSE events that are whole responses ===
--- the raw stream, first 3 events (one JSON GenerateContentResponse per 'data:' line) ---
data: parts=[{'text': '(scripted) You said: '}] finishReason=None usage=False
data: parts=[{'text': 'Tell me about '}] finishReason=None usage=False
data: parts=[{'text': 'Paris in a '}] finishReason=None usage=False

5 events; finishReason appears only on the last: [None, None, 'STOP']
usageMetadata appears only on the last event: [False, False, True]
merged stream candidates == non-streamed candidates: True
merged stream usageMetadata == non-streamed usageMetadata: True
merged text: (scripted) You said: Tell me about Paris in a few friendly words please

--- a function call arrives as one whole part ---
['text', 'functionCall'] | finishReason: STOP

--- the connection drops before the model finished ---
IncompleteStream: stream ended before any finishReason arrived
--- a blocked prompt, streamed ---
prompt blocked: SAFETY
```

Every event is a whole `GenerateContentResponse`, so merging is just bookkeeping: glue adjacent text pieces, keep function-call parts whole, and read `finishReason` and `usageMetadata` from the last event. The merged result equals the non-streamed one, which is the property to test whenever you write a stream parser. The truncated stream is detected only because the reader insists on seeing a `finishReason`: with no error event to rely on, "the connection closed" and "the model finished" would otherwise look the same.

### Block 6: the tool loop, parallel calls, errors, thought signatures

```python
def outline(contents):
    """One line per Content: role and the kind of every part."""
    for c in contents:
        print(f"   {c['role']:<6} {[part_kind(p) for p in c['parts']]}")

if __name__ == "__main__":
    print("=== 5. the tool loop: functionCall and functionResponse parts ===")
    srv = StandInGemini().start()
    try:
        gem = Gemini(srv.base, "stand-in-key", sleep=lambda s: None)
        def get_weather(city):
            if city == "Atlantis":
                raise LookupError("no such city")
            return f"18 C and sunny in {city}"
        funcs = {"get_weather": get_weather}

        final, contents, trace = run_tool_loop(gem, MODEL, funcs, "What is the weather in Paris?", tools=[WEATHER_DECL])
        print("turns (finishReason, part kinds):", trace)
        outline(contents)
        print("model's call part  :", contents[1]["parts"][1])
        print("our response part  :", contents[2]["parts"][0])
        print("final text:", text_of(final["candidates"][0]))

        print("\n--- two calls in ONE model turn -> ONE user content with two functionResponse parts ---")
        final, contents, _ = run_tool_loop(gem, MODEL, funcs, "Compare the weather in Paris and Rome.",
                                           tools=[WEATHER_DECL], use_stream=True)
        outline(contents)
        print("call ids    :", [p["functionCall"]["id"] for p in contents[1]["parts"] if "functionCall" in p])
        print("response ids:", [p["functionResponse"]["id"] for p in contents[2]["parts"]])

        print("\n--- a function that raises: the 'error' key of the response object ---")
        final, contents, _ = run_tool_loop(gem, MODEL, funcs, "What is the weather in Atlantis?", tools=[WEATHER_DECL])
        print("functionResponse sent:", contents[2]["parts"][0]["functionResponse"])
        print("final text:", text_of(final["candidates"][0]))

        print("\n--- thought signatures: send the model's turn back whole ---")
        think = {"thinkingConfig": {"includeThoughts": False}}
        final, contents, trace = run_tool_loop(gem, MODEL, funcs, "What is the weather in Paris?",
                                               tools=[WEATHER_DECL], **think)
        sig = contents[1]["parts"][1]["thoughtSignature"]
        print("signature on the functionCall part:", sig, "| usage thoughtsTokenCount:",
              final["usageMetadata"].get("thoughtsTokenCount"))
        print("verbatim echo ->", trace[-1][0])
        stripped = [dict(c) for c in contents[:3]]
        stripped[1] = {"role": "model", "parts": [{"functionCall": p["functionCall"]} if "functionCall" in p else p
                                                  for p in contents[1]["parts"]]}      # an app that rebuilt the part
        body = {"contents": stripped, "tools": [{"functionDeclarations": [WEATHER_DECL]}], "generationConfig": think}
        resp = gem.generate(MODEL, body)
        print("signature dropped ->", resp["candidates"][0]["finishReason"], "(HTTP 200, no content)")
        try:
            first_candidate(resp)
        except Blocked as err:
            print("surfaced by the client as:", err)
    finally:
        srv.stop()
```

Output:

```
=== 5. the tool loop: functionCall and functionResponse parts ===
turns (finishReason, part kinds): [('STOP', ['text', 'functionCall']), ('STOP', ['text'])]
   user   ['text']
   model  ['text', 'functionCall']
   user   ['functionResponse']
   model  ['text']
model's call part  : {'functionCall': {'id': 'call_standin_01', 'name': 'get_weather', 'args': {'city': 'Paris'}}}
our response part  : {'functionResponse': {'name': 'get_weather', 'response': {'result': '18 C and sunny in Paris'}, 'id': 'call_standin_01'}}
final text: Here is what I found: 18 C and sunny in Paris.

--- two calls in ONE model turn -> ONE user content with two functionResponse parts ---
   user   ['text']
   model  ['text', 'functionCall', 'functionCall']
   user   ['functionResponse', 'functionResponse']
   model  ['text']
call ids    : ['call_standin_02', 'call_standin_03']
response ids: ['call_standin_02', 'call_standin_03']

--- a function that raises: the 'error' key of the response object ---
functionResponse sent: {'name': 'get_weather', 'response': {'error': 'LookupError: no such city'}, 'id': 'call_standin_04'}
final text: Here is what I found: error: LookupError: no such city.

--- thought signatures: send the model's turn back whole ---
signature on the functionCall part: iQyGWlUZ5cBX | usage thoughtsTokenCount: 5
verbatim echo -> STOP
signature dropped -> MISSING_THOUGHT_SIGNATURE (HTTP 200, no content)
surfaced by the client as: reply blocked: MISSING_THOUGHT_SIGNATURE
```

Read the outlines: the function result is a **`user` content** made only of `functionResponse` parts; two parallel calls produce one model content with two `functionCall` parts and one user content with two `functionResponse` parts, matched by id. A raising function becomes `{"error": ...}` inside `response`, by the docs' convention. In the signature test the loop appended the model's content untouched, so the signature went back; a client that rebuilt the part without it gets the stop value instead of an answer (in the stand-in), which is why the loop keeps the model's content verbatim.

### Block 7: multimodal parts, the inline-size limit and the image-token rule

```python
import zlib

def flat_png(width, height, value=200):
    """A valid greyscale PNG built with struct + zlib (one repeated scanline, so big sizes are cheap)."""
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    row = b"\x00" + bytes([value]) * width
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(row * height, 9)) + chunk(b"IEND", b""))

INLINE_LIMIT = 20 * 1024 * 1024        # image guide: inline data keeps the WHOLE request under 20 MB (checked Oct 2026)

def check_inline_size(body, limit=INLINE_LIMIT):
    size = len(json.dumps(body).encode())
    if size >= limit:
        raise ValueError(f"request is {size:,} bytes; upload the file and send a fileData part instead")
    return size

def file_part(mime, uri):
    return {"fileData": {"mimeType": mime, "fileUri": uri}}        # a reference to an uploaded file

if __name__ == "__main__":
    print("=== 6. multimodal parts, inline-size limit, and the image-token rule ===")
    srv = StandInGemini(inline_limit=50_000).start()
    try:
        gem = Gemini(srv.base, "stand-in-key", sleep=lambda s: None)
        png = flat_png(960, 540)
        b64 = base64.b64encode(png).decode()
        body = {"contents": [content("user", inline_data("image/png", b64), text("Describe this image."))]}
        print("parts:", [part_kind(p) for p in body["contents"][0]["parts"]],
              "| request bytes:", check_inline_size(body))
        resp = gem.generate(MODEL, body)
        print("stand-in:", text_of(resp["candidates"][0]))
        print("promptTokenCount:", resp["usageMetadata"]["promptTokenCount"],
              "= image", gemini_image_tokens(960, 540), "+ 4 words of text (the stand-in's crude count)")

        big = base64.b64encode(random.Random(0).randbytes(60_000)).decode()
        too_big = {"contents": [content("user", inline_data("application/pdf", big), text("Summarise."))]}
        try:
            gem.generate(MODEL, too_big)
        except ApiError as err:
            print("\nlarge inline payload ->", err.code, err.status, "|", err.message)
        print("the fix is a reference, not bytes:", json.dumps(file_part("application/pdf", "<uri returned by the upload>")))
    finally:
        srv.stop()

    print("\nrough image tokens per the image guide's rule (Gemini 3 'media_resolution' changes this):")
    assert gemini_image_tokens(960, 540) == 6 * 258          # the guide's own worked example: 3 x 2 = 6 tiles
    for w, h in ((200, 200), (384, 384), (385, 385), (960, 540), (1920, 1080), (4000, 3000)):
        crop = math.floor(min(w, h) / 1.5)
        tiles = 1 if w <= 384 and h <= 384 else math.ceil(w / crop) * math.ceil(h / crop)
        print(f"  {w:>5}x{h:<5} crop unit {crop:>4} -> {tiles} tile(s) -> {gemini_image_tokens(w, h):>5} tokens")
```

Output:

```
=== 6. multimodal parts, inline-size limit, and the image-token rule ===
parts: ['inlineData', 'text'] | request bytes: 1728
stand-in: (scripted) You said: Describe this image. [and sent 1 part(s): image/png]
promptTokenCount: 1552 = image 1548 + 4 words of text (the stand-in's crude count)

large inline payload -> 400 INVALID_ARGUMENT | request is 80,128 bytes; inline data limit is 50,000
the fix is a reference, not bytes: {"fileData": {"mimeType": "application/pdf", "fileUri": "<uri returned by the upload>"}}

rough image tokens per the image guide's rule (Gemini 3 'media_resolution' changes this):
    200x200   crop unit  133 -> 1 tile(s) ->   258 tokens
    384x384   crop unit  256 -> 1 tile(s) ->   258 tokens
    385x385   crop unit  256 -> 4 tile(s) ->  1032 tokens
    960x540   crop unit  360 -> 6 tile(s) ->  1548 tokens
   1920x1080  crop unit  720 -> 6 tile(s) ->  1548 tokens
   4000x3000  crop unit 2000 -> 4 tile(s) ->  1032 tokens
```

The last table shows why the rule is only an estimate: a 4000 × 3000 photo comes out *cheaper* than a 1920 × 1080 frame because the crop unit grows with the image. Compare it with the 32-pixel patch rule in Module 09 and the 28-pixel rule in Module 10: three providers, three accountings, so a cost estimator must be per provider and refreshed from the docs.

### Not executed: the official SDK spelling

Not executed in this module's verification (needs the `google-genai` package and an API key). The package, import paths, method and parameter names are from the Gemini docs fetched for this module.

```python
import os
from google import genai
from google.genai import types

client = genai.Client()                 # reads GEMINI_API_KEY (or GOOGLE_API_KEY) from the environment

response = client.models.generate_content(
    model=os.environ["GEMINI_MODEL"],   # from configuration
    contents="Explain how AI works in a few words",
    config=types.GenerateContentConfig(system_instruction="You are terse."),
)
print(response.text)

for chunk in client.models.generate_content_stream(
    model=os.environ["GEMINI_MODEL"], contents="Explain how AI works"
):
    print(chunk.text, end="")

# The same SDK against the Google Cloud product ("Gemini platform"), per the migration page:
cloud = genai.Client(vertexai=True, project="your-project-id", location="us-central1")
```

## Visual diagram

```
One generateContent round trip

 your app                                                generativelanguage.googleapis.com
 ┌─────────────────────────────────────┐ POST /v1beta/models/{model}:generateContent ┌────────────────────────┐
 │ header: x-goog-api-key              │ ────────────────────────────────────────────►│ checks key, model path │
 │ body:                               │                                              │ runs the model         │
 │   systemInstruction {parts:[text]}  │                                              └───────────┬────────────┘
 │   contents: [ {role, parts:[...]} ] │   200 + candidates / promptFeedback                       │
 │   generationConfig, safetySettings  │ ◄────────────────────────────────────────────────────────┘
 │   tools:[{functionDeclarations}]    │        or  {error:{code,message,status,details}}
 └─────────────────────────────────────┘
   part = exactly one of: text | inlineData | fileData | functionCall | functionResponse | ...

200 does not mean "you have an answer"

   response ──► promptFeedback.blockReason set? ──yes──► no candidates, prompt refused
        │no
        ▼
   candidates[0].finishReason
        ├─ STOP ............ normal (also when parts contain a functionCall!)
        ├─ MAX_TOKENS ...... truncated
        ├─ SAFETY / RECITATION / BLOCKLIST ... content withheld, no parts
        └─ MALFORMED_FUNCTION_CALL / MISSING_THOUGHT_SIGNATURE ... fix your request or loop

The tool loop (look at the PARTS, not at finishReason)

   user ► contents ───────────────► model
                                      │ parts contain functionCall(id=A), functionCall(id=B)
                                      ▼
        model content ── append VERBATIM (keeps thoughtSignature)
                                      │ you run both functions
                                      ▼
        user content: [ functionResponse(id=A), functionResponse(id=B) ] ──► model ... text parts only ► done

Streaming: each event = a whole GenerateContentResponse

   data:{parts:[text "Tell me "]} ► data:{parts:[text "about "]} ► data:{parts:[text "Paris"], finishReason:STOP, usageMetadata}
   merge: glue text, keep functionCall parts whole, finishReason + usage from the last event
   connection ends with no finishReason? ► IncompleteStream
```

## Practice

### 1. Port a request

This request is written in the OpenAI style. Rewrite it for `generateContent` (list every change).

```json
{"model": "your-gemini-model-id", "max_tokens": 100,
 "messages": [{"role": "system", "content": "You are terse."},
              {"role": "user", "content": "Hi"}],
 "tools": [{"type": "function", "function": {"name": "get_weather", "description": "Weather", "parameters": {"type": "object"}}}]}
```

<details>
<summary>Answer</summary>

The model leaves the body and goes in the URL (`/v1beta/models/your-gemini-model-id:generateContent`). `messages` becomes `contents`, and each `content` string becomes a list of `parts` (`[{"text": "Hi"}]`). The `system` message leaves the list and becomes `systemInstruction: {"parts": [{"text": "You are terse."}]}`. `max_tokens` becomes `generationConfig.maxOutputTokens` (and is optional). The tool loses its `type`/`function` wrapper and is nested under `functionDeclarations`: `tools: [{"functionDeclarations": [{"name": "get_weather", "description": "Weather", "parameters": {"type": "object"}}]}]`. Headers: `x-goog-api-key` instead of a bearer token.

</details>

### 2. Convert a tool conversation

Write `openai_to_gemini(messages)` that converts an OpenAI-style history with `developer`/`system`, `assistant` messages carrying `tool_calls`, and `tool` messages into `(systemInstruction, contents)`. Two traps: OpenAI `tool` messages carry only a `tool_call_id`, but Gemini's `functionResponse` needs the function **name**; and Gemini's `response` must be an object.

<details>
<summary>Answer</summary>

Append this to the lab file:

```python
def openai_to_gemini(messages):
    """OpenAI-style chat history -> (systemInstruction, contents) for generateContent."""
    system, contents, names = [], [], {}            # names: tool_call_id -> function name
    for m in messages:
        role = m["role"]
        if role in ("system", "developer"):
            system.append(m["content"])
        elif role == "user":
            contents.append(content("user", text(m["content"])))
        elif role == "assistant":
            parts = [text(m["content"])] if m.get("content") else []
            for call in m.get("tool_calls") or []:
                names[call["id"]] = call["function"]["name"]
                parts.append({"functionCall": {"id": call["id"], "name": call["function"]["name"],
                                               "args": json.loads(call["function"]["arguments"])}})
            contents.append(content("model", *parts))                  # 'assistant' becomes 'model'
        elif role == "tool":
            part = {"functionResponse": {"id": m["tool_call_id"], "name": names[m["tool_call_id"]],
                                         "response": {"result": m["content"]}}}   # response must be an OBJECT
            if contents and contents[-1]["role"] == "user" and "functionResponse" in contents[-1]["parts"][0]:
                contents[-1]["parts"].append(part)                      # parallel results share one user content
            else:
                contents.append(content("user", part))
    instruction = {"parts": [text("\n\n".join(system))]} if system else None
    return instruction, contents

if __name__ == "__main__":
    print("=== 7. an OpenAI-style history, converted ===")
    history = [
        {"role": "developer", "content": "You are terse."},
        {"role": "user", "content": "Weather in Paris and Rome?"},
        {"role": "assistant", "content": None, "tool_calls": [
            {"id": "call_1", "type": "function", "function": {"name": "get_weather", "arguments": "{\"city\": \"Paris\"}"}},
            {"id": "call_2", "type": "function", "function": {"name": "get_weather", "arguments": "{\"city\": \"Rome\"}"}}]},
        {"role": "tool", "tool_call_id": "call_1", "content": "18 C"},
        {"role": "tool", "tool_call_id": "call_2", "content": "21 C"},
    ]
    instruction, contents = openai_to_gemini(history)
    print(json.dumps({"systemInstruction": instruction, "contents": contents}, indent=1))
    print("checker problems:", check_request({"systemInstruction": instruction, "contents": contents}))
```

Output of that last part:

```
=== 7. an OpenAI-style history, converted ===
{
 "systemInstruction": {
  "parts": [
   {
    "text": "You are terse."
   }
  ]
 },
 "contents": [
  {
   "role": "user",
   "parts": [
    {
     "text": "Weather in Paris and Rome?"
    }
   ]
  },
  {
   "role": "model",
   "parts": [
    {
     "functionCall": {
      "id": "call_1",
      "name": "get_weather",
      "args": {
       "city": "Paris"
      }
     }
    },
    {
     "functionCall": {
      "id": "call_2",
      "name": "get_weather",
      "args": {
       "city": "Rome"
      }
     }
    }
   ]
  },
  {
   "role": "user",
   "parts": [
    {
     "functionResponse": {
      "id": "call_1",
      "name": "get_weather",
      "response": {
       "result": "18 C"
      }
     }
    },
    {
     "functionResponse": {
      "id": "call_2",
      "name": "get_weather",
      "response": {
       "result": "21 C"
      }
     }
    }
   ]
  }
 ]
}
checker problems: []
```

The function name comes from remembering each `tool_call_id` when you convert the assistant message that issued it. The parallel results end up in one `user` content, and `assistant` becomes `model`.

</details>

### 3. Merge a stream by hand

Three chunks arrive: `{"text": "Let me "}`, then `{"text": "check."}`, then a chunk carrying a `functionCall` part (id `c1`, `get_weather`, `{"city": "Paris"}`) together with `finishReason: "STOP"` and a `usageMetadata` of 25 prompt, 37 candidate and 62 total tokens. What are the merged `parts`, `finishReason` and usage? Then check with `StreamReader`.

<details>
<summary>Answer</summary>

Adjacent plain-text pieces are glued: the first part is `{"text": "Let me check."}`; the function call stays its own part; `finishReason` is `STOP` (taken from the last chunk) and the usage is the last chunk's. Note that `STOP` is also the reason for a response that ends in a function call, so the loop must look at the parts.

```python
if __name__ == "__main__":
    print("=== 8. reassembling streamed chunks by hand, then by code ===")
    def chunk(parts, finish=None, usage=None):
        cand = {"index": 0, "content": {"role": "model", "parts": parts}}
        if finish:
            cand["finishReason"] = finish
        out = {"candidates": [cand], "modelVersion": "m", "responseId": "r1"}
        if usage:
            out["usageMetadata"] = usage
        return out
    chunks = [
        chunk([{"text": "Let me "}]),
        chunk([{"text": "check."}]),
        chunk([{"functionCall": {"id": "c1", "name": "get_weather", "args": {"city": "Paris"}}}], "STOP",
              {"promptTokenCount": 25, "candidatesTokenCount": 37, "totalTokenCount": 62}),
    ]
    reader = StreamReader()
    for c in chunks:
        reader.feed(c)
    print(json.dumps(reader.result(), indent=1))
```

Output:

```
=== 8. reassembling streamed chunks by hand, then by code ===
{
 "candidates": [
  {
   "index": 0,
   "finishReason": "STOP",
   "content": {
    "role": "model",
    "parts": [
     {
      "text": "Let me check."
     },
     {
      "functionCall": {
       "id": "c1",
       "name": "get_weather",
       "args": {
        "city": "Paris"
       }
      }
     }
    ]
   }
  }
 ],
 "usageMetadata": {
  "promptTokenCount": 25,
  "candidatesTokenCount": 37,
  "totalTokenCount": 62
 },
 "modelVersion": "m",
 "responseId": "r1"
}
```

</details>

### 4. Image tokens by hand

Using the image guide's rule as coded in Block 1, how many tokens for 1280 × 720, for 300 × 300 and for 500 × 300? Which of the three surprised you?

<details>
<summary>Answer</summary>

1280 × 720: not both sides at most 384, so tiles: crop unit `floor(720 / 1.5) = 480`; `ceil(1280 / 480) = 3` and `ceil(720 / 480) = 2`, 6 tiles, 6 x 258 = 1,548 tokens. 300 × 300: both sides are at most 384, so a flat 258. 500 × 300: crop unit `floor(300 / 1.5) = 200`, `ceil(500 / 200) = 3` and `ceil(300 / 200) = 2`, 6 tiles, 1,548 tokens. The surprise is that the 500 × 300 image (150,000 pixels) costs exactly as much as the 1280 × 720 one (921,600 pixels): the rule counts tiles, and the crop unit scales with the short side. That is also why the guide calls it rough.

</details>

### 5. Which signal, and what do you do?

For each case say where the signal appears and what the client should do: (a) a prompt that violates policy; (b) an answer cut off at the token cap; (c) the model returns a `functionCall`; (d) the connection closes mid-answer; (e) HTTP 402; (f) HTTP 429.

<details>
<summary>Answer</summary>

(a) HTTP 200, `promptFeedback.blockReason` set, no `candidates`: tell the user the request was refused; do not retry unchanged. (b) `finishReason: MAX_TOKENS`: the text is truncated; raise the cap, continue, or flag it. (c) `finishReason` is still `STOP`; the `functionCall` is in the parts: run it and answer with a `functionResponse` in a `user` content, echoing the `id`. (d) No `finishReason` was ever seen: raise an incomplete-stream error and retry or continue from the partial text. (e) `RESOURCE_EXHAUSTED` because credits are gone: do not retry, alert a human. (f) `RESOURCE_EXHAUSTED` because of a rate limit: back off with jitter and retry.

</details>

### Checkpoint quiz

1. Where does the model name go in a Gemini request, and where does the system prompt go?
2. What roles can a `Content` have, and which role carries a `functionResponse`?
3. A response has HTTP 200 and no `candidates` key. What happened, and where do you look?
4. Why is `finishReason: STOP` not enough to know the model is done and no tool needs running?
5. What is the difference between the 402 and 429 errors, given that both are `RESOURCE_EXHAUSTED`?

<details>
<summary>Answers</summary>

1. The model is in the URL path (`models/{model}:generateContent`); the system prompt is the top-level `systemInstruction` field (a `Content`, text only).
2. `user` and `model`. A `functionResponse` part is sent in a `user` content (there is no `tool` role).
3. The prompt was blocked: `promptFeedback.blockReason` is set and no candidates are returned. Show the user a refusal and do not retry unchanged.
4. A normal function call also ends with `STOP`; the call is a `functionCall` part. The loop has to inspect the parts.
5. 429 is a rate or spend limit that clears with time: retry with backoff. 402 means prepaid credits are depleted: the docs say not to retry until credits are added.

</details>

> [!check]
> - I can build a `generateContent` request with the model in the URL, `contents`/`parts`, `systemInstruction` and `generationConfig`
> - I can tell a blocked prompt, a blocked reply and a truncated reply apart in a 200 response
> - I can merge a streamed response and detect a stream that ended too early
> - I can run the function-calling loop, including parallel calls, ids and thought signatures
> - I can explain the Developer API versus the Google Cloud offering and what changes in client construction
> - I can fill in the three-way comparison table for request, roles, system prompt, tools, streaming and errors

## Project

**Make the stand-in and client speak the rest of the tool vocabulary.** Extend Blocks 2 and 3 (no reference solution; the design is yours).

1. Implement `toolConfig.functionCallingConfig` in the stand-in: `mode` `AUTO`, `ANY` (always return a function call, restricted to `allowedFunctionNames` when given), `NONE` (never), and make the client expose it. Write tests for each mode, including `ANY` with an allow-list that excludes the function the text asks for.
2. Implement `candidateCount > 1` in both directions: several candidates in the response, and a client option to pick one (and a test that the loop refuses ambiguity).
3. Implement the `CONTINUATION` finish reason from the reference: the stand-in stops at a cumulative token cap with a `continuationToken`; the client resends the same `contents` plus the token and a larger `maxOutputTokens` until a normal finish, and merges the text. Read the reference's note about the cap being cumulative.
4. Add `stopSequences` (at most 5) and test that the stop string is not included in the output, as the reference says.
5. Log one record per call: `responseId`, `modelVersion`, `modelStatus` if present, `finishReason`, the usage fields, retries, wall time. Never log the key or full prompts by default.
6. Write one parametrised test that runs the same four scenarios (plain, stream, tool, blocked) against this stand-in; leave a clear seam where the Module 10 stand-in could be plugged in later.

Stretch: add a `fileData` upload flow to the stand-in (an upload endpoint returning a URI) and make the client switch from `inlineData` to `fileData` automatically when the request would exceed the inline limit.

## Interview questions

> [!interview] A shared LLM wrapper works for OpenAI and Anthropic but crashes on Gemini with an `IndexError` or `KeyError` in production, only for some requests. What do you suspect, and how do you fix the abstraction?

<details>
<summary>What a strong answer covers</summary>

- Gemini can return HTTP 200 with no `candidates` (blocked prompt, reason in `promptFeedback.blockReason`) or a candidate with no `content` (finish reason `SAFETY` and similar); code that indexes `candidates[0].content.parts[0].text` fails.
- Normalise: one internal result type with `text`, `tool_calls`, `stop`, `blocked: {where, reason}`, `usage`; map each provider's signals into it.
- Tool detection differs: `functionCall` parts with `STOP`, not a distinct stop reason.
- Streaming differs too: whole responses per event, no end marker, so detect incompleteness yourself.
- Test the failure shapes, not just the happy path (the stand-in here is the approach).

</details>

> [!interview] You get intermittent 429s from the Gemini API and, separately, 402s. How do you handle each?

<details>
<summary>What a strong answer covers</summary>

- Both are `RESOURCE_EXHAUSTED` but mean different things: 429 is a rate or spend limit (RPM, TPM, RPD): back off exponentially with jitter, cap attempts and total time, reduce concurrency, and consider batching.
- 402 means prepaid credits are depleted: never retry, page a human, add credits or enable auto-reload.
- Read the `status`, `message` and `details`, not just the HTTP code; log request context.
- Mention that the docs' pages do not document a `Retry-After` header for this API, so a client should not depend on one.
- Also: 500 can mean the input was too long, which retrying will not fix.

</details>

> [!interview] Gemini Developer API or the Google Cloud offering: how do you decide, and what does the code look like?

<details>
<summary>What a strong answer covers</summary>

- Google's own guidance: most developers start with the Developer API; choose the Cloud product when you need enterprise controls (IAM, project and region control, existing Cloud commitments, compliance).
- Code difference: both use the same SDK; client construction changes (API key versus project/location with the cloud flag), and authentication moves from an API key to Google Cloud service accounts.
- Region availability may differ; models tuned in AI Studio need retraining on the platform; delete the unused API key.
- Keep the construction behind configuration, keep request/response handling identical, test both, and note the product naming has changed (Vertex AI in older material, "Gemini platform" in the page read here).
- Also mentions the stateless `generateContent` versus the newer Interactions API as a separate decision.

</details>

## Common mistakes & troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `KeyError: 'candidates'` | the prompt was blocked (200 with `promptFeedback`) | check `promptFeedback.blockReason` first |
| answer is empty but `candidates` exists | `finishReason` is `SAFETY`, `RECITATION`, or another stop; no `content` | check `finishReason` before reading parts |
| tool loop never ends, or stops after the first call | waiting for a `finishReason` that signals a tool call | look for `functionCall` parts |
| 400 on a follow-up after a function call | the `functionResponse` is missing the `id`, or its `response` is not an object | echo the exact `id`; wrap the value in an object |
| `MISSING_THOUGHT_SIGNATURE` or degraded multi-turn behaviour | the model's content was rebuilt without its signature | append the model's `content` exactly as received |
| 400 `API key not valid` with a key that "looks right" | wrong key type or restriction, a stray space or newline, or an unrestricted standard key | check the key in AI Studio; load it from the environment without whitespace |
| works on `v1beta`, 404 or 400 on `v1` | the feature is not in the stable version | check the API-versions table |
| streamed text looks fine but the answer is cut | the connection closed before the final event | require a `finishReason`; retry or continue |
| huge request fails with 400 | inline bytes plus text exceeded the 20 MB total | upload the file and send `fileData` |

## Further reading & sources

- [Generating content](https://ai.google.dev/api/generate-content) - every request and response field used here: `Content`, `Part`, `GenerationConfig`, `SafetySetting`, `Candidate`, `FinishReason`, `UsageMetadata`, and the two methods.
- [Gemini API reference](https://ai.google.dev/api) - the overview page: the primary endpoints (including the Interactions API) and the `x-goog-api-key` header.
- [Text generation](https://ai.google.dev/gemini-api/docs/generate-content/text-generation) - the generateContent (legacy) page: system instructions, multi-turn use and the streaming example with `?alt=sse`.
- [Function calling with the Gemini API](https://ai.google.dev/gemini-api/docs/generate-content/function-calling) - declarations, the four-step loop, parallel calls, modes and thought signatures.
- [Safety settings](https://ai.google.dev/gemini-api/docs/generate-content/safety-settings) - categories, thresholds, `promptFeedback` and `finishReason` safety signals.
- [API errors](https://ai.google.dev/gemini-api/docs/generate-content/api-errors) - the status table and the error body with `details`.
- [Gemini Developer API vs. Gemini platform](https://ai.google.dev/gemini-api/docs/migrate-to-cloud) - the two products, the SDK constructors and the migration considerations.
- [Migrating to the Interactions API](https://ai.google.dev/gemini-api/docs/migrate-to-interactions) - Google's recommended successor and how it differs from `generateContent`.

## Next

[Module 12: Open-Weight Models: Llama, Mistral, Qwen](../12-open-weight-models-llama-mistral-qwen/README.md) leaves the hosted APIs for models whose weights you can download and run yourself, and what their licences do and do not allow.
