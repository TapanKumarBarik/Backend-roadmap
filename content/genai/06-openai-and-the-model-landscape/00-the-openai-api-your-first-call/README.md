# Module 00: The OpenAI API: Your First Call

## Roadmap

You are at the start of Track 06, **OpenAI & the Model Landscape**. [Track 05](../../05-gpus-and-genai-hardware/README.md) was about the hardware you would need to run a model yourself. This track starts with the other path: renting a model through an HTTP API, then widening to the other providers, open-weight models and the economics of choosing between them. Tokens, chat templates and context windows come from Track 01 ([Module 10: Chat Templates and Message Formatting](../../01-tokens-and-language-modeling/10-chat-templates-and-message-formatting/README.md) and [Module 11: Context Windows Explained](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md)); this module assumes you have read them but needs no machine-learning background beyond that.

After this module you can:

- send one chat-style request over raw HTTP with nothing but the Python standard library, and read the response fields that matter (`id`, `model`, the text, `finish_reason`, `usage`);
- keep an API key out of source code, git and logs by reading it from an environment variable;
- read a status code and an error object and decide whether to fix the request, fix the credentials, wait and retry, or stop and call a human;
- find, log and use request ids when something goes wrong;
- say precisely what the official SDK adds on top of those HTTP calls.

Why it matters: every later module in this track (streaming, tools, structured output, embeddings, routing across providers) is a variation on the same HTTP exchange. If the exchange is clear, the SDK stops being magic and failures stop being mysterious.

Next in the track: [Module 01](../01-chat-completions-deep-dive/README.md) takes the request apart parameter by parameter, and [Module 02](../02-the-responses-api-and-statefulness/README.md) covers the newer stateful API.

> [!note] How this module was verified. No call to a real provider was made while writing it: there were no API keys. The wire format comes from the official OpenAPI spec (`openai/openai-openapi`, commit `8243cc8`, dated 24 Oct 2026) and from the official docs pages and the `openai-python` README, all fetched on 26 Oct 2026. The runnable code talks to **a local stand-in that mimics the documented shape; the model behind it is scripted, not a real model**. The parsing, error handling and key-handling code is genuinely executed; no real-model output appears anywhere. The official docs are the source of truth and may have changed since this was checked.

## Concept

> [!key] An LLM API is a stateless HTTP endpoint: you POST JSON (a model name and a list of messages) with your secret key in an `Authorization` header, and you get JSON back (the generated text, why it stopped, how many tokens it used). Everything you need to run it in production (status codes, error objects, request ids) is ordinary HTTP, and an SDK is a convenience wrapper around exactly that exchange.

## Explanation

### What an HTTP LLM API is

You send text and settings in an HTTP request. The provider runs the model on its own hardware and sends back generated text plus bookkeeping. Three consequences shape everything else:

1. **Each request is independent.** The docs' conversation-state guide puts it directly: "each text generation request is independent and stateless". If you want the model to know what was said earlier, you send it again (Module 01), or opt in to server-held state with the newer API (Module 02).
2. **Responses take seconds, and the time varies.** A client with no timeout can hang forever, and a long generation is better streamed than awaited ([Module 03](../03-streaming-responses/README.md)).
3. **You pay per token.** The response reports how many tokens were used (`usage`), which is how you meter cost ([Module 12 of Track 01](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md) covers the economics).

The model is somewhere else, so the failure modes are the ones every networked system has: bad credentials, bad requests, throttling, overload, dropped connections.

### Which endpoint this module calls, and why

The official docs have moved on to a newer endpoint. As checked on 26 Oct 2026:

- the developer quickstart's first example calls `client.responses.create(...)`;
- the text-generation guide says: "If you're building any text generation app, we recommend using the Responses API over the older Chat Completions API";
- the migration guide says: "While Chat Completions remains supported, Responses is recommended for all new projects";
- the `openai-python` README calls Chat Completions "the previous standard (supported indefinitely)".

This module still uses the **Chat Completions** request and response shape (`messages` in, `choices` out), for two reasons. The HTTP lessons here (authentication, status codes, error objects, request ids, timeouts) are identical for both endpoints, and the messages/choices shape is the one Module 01 dissects and the one you will meet in a great deal of existing code. [Module 02](../02-the-responses-api-and-statefulness/README.md) shows the Responses shape and when to prefer it. Do not read this choice as a recommendation to start a new project on the older endpoint without reading the migration guide first.

### Authentication: a secret key in the environment

The API authenticates with **HTTP Bearer authentication**: every request carries the header `Authorization: Bearer <your key>`. (The OpenAPI spec declares the scheme as `http` / `bearer`; the scheme itself is defined in [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html).) You create keys in the dashboard. The API reference says:

> "Remember that your API key is a secret. Don't share it with others or expose it in any client-side code such as browsers or apps. Load API keys from an environment variable or key management service on the server."

So the rules are:

- **Never in source code, and never in git.** A key committed once stays in the repository history even after you delete the line, so treat it as leaked. The safety guide says: "If you believe an API key has been exposed, misused, or otherwise compromised, revoke it promptly and replace it with a new key."
- **Never in client-side code** (a browser page, a mobile app). Anyone can read it. Your server holds the key and calls the API on behalf of your users.
- **Never in logs or URLs.** Log headers through a redactor (Exercise 2).
- **Read it from the environment** (or a secret manager) at startup and fail loudly if it is missing. The quickstart's setup is `export OPENAI_API_KEY="your_api_key_here"` on macOS and Linux. In PowerShell, `$env:OPENAI_API_KEY = "your_api_key_here"` sets it for the current session. The official SDKs read `OPENAI_API_KEY` by themselves ("Each OpenAI SDK automatically reads your API key from the system environment").
- **If you use a `.env` file**, add it to `.gitignore`. The `openai-python` README suggests `python-dotenv` "so that your API key is not stored in source control".
- **Limit the blast radius.** The production best-practices guide recommends "setting an expiration date when you create a project API key and establishing a regular key rotation process", and separate projects for staging and production, each with its own rate and spend limits.

> [!pitfall] Deleting a committed key from the file does not remove it from git history. Revoke it in the dashboard, create a new one, and only then clean up the repository.

### Base URL and the anatomy of a request

| Part | Value | Source |
| --- | --- | --- |
| Method | `POST` | OpenAPI spec |
| URL | base `https://api.openai.com/v1` plus path `/chat/completions` | spec `servers` entry; the path is the endpoint |
| Header | `Authorization: Bearer <key>` | API reference, Authentication |
| Header | `Content-Type: application/json` | JSON body |
| Header (optional) | `OpenAI-Organization`, `OpenAI-Project` | API reference, Authentication (see below) |
| Header (optional) | `X-Client-Request-Id` | API reference, Debugging requests |
| Body, required | `model` (string) and `messages` (array) | spec `CreateChatCompletionRequest.required` |
| Body, everything else | optional: sampling, length, tools, ... | Module 01 and later |

The `model` string is a model id. Do not hard-code one in your source. The set of ids, their snapshots, context windows and prices change; read them from the [models page](https://developers.openai.com/api/docs/models), look up what your key can use with `GET /v1/models`, and keep the choice in configuration. The spec's model object has `id`, `object`, `created`, `owned_by` and a `shutdown_date` (null if none is announced); it has no context-window field, so that number comes from the docs. The text-generation guide advises "pinning your production applications to specific model snapshots" and running evaluations when you change them, because behaviour can differ between snapshots.

### Anatomy of a response

A successful call returns `200` and a JSON object. The fields, from the spec's `CreateChatCompletionResponse` (the five the spec marks required are `id`, `object`, `created`, `model`, `choices`):

| Field | Meaning (spec wording, shortened) | You should |
| --- | --- | --- |
| `id` | "A unique identifier for the chat completion" | log it |
| `object` | always `chat.completion` | ignore |
| `created` | Unix timestamp in seconds | ignore, or log |
| `model` | "The model used for the chat completion" | log it: it tells you which model actually answered |
| `choices[i].message.content` | the text; a string **or null** | read defensively |
| `choices[i].message.refusal` | a refusal message, or null | check it |
| `choices[i].message.tool_calls` | tool calls the model requested ([Module 06](../06-function-calling-basics/README.md)) | check it |
| `choices[i].finish_reason` | why generation stopped: `stop`, `length`, `content_filter`, `tool_calls`, or `function_call` (deprecated) | branch on it (Module 01) |
| `usage` | `prompt_tokens`, `completion_tokens`, `total_tokens`, plus detail objects | log it for cost; treat as optional |

The five fields you must read on every call are the text, `finish_reason`, `usage`, `id` and `model`, plus the `x-request-id` header below.

> [!pitfall] `completion.choices[0].message.content` works on the happy path only. The spec allows `content` to be null (a tool call, a refusal), and `usage` is not in the response's required list. Code that assumes a non-empty string crashes on exactly the responses you most need to understand. Exercise 1 builds the defensive version.

### Errors: status codes, error objects and what to do

A non-2xx status means the request did not produce a completion. The body is normally an **error object** with exactly four fields (the spec's `Error` schema marks all four required), wrapped like this: `{"error": {"message": "...", "type": "...", "param": null, "code": null}}`. `param` names the offending request parameter when there is one; `code` is a machine-readable string, or null. Two cautions from the spec: for `401` and `403` the documented content type may be `text/plain` ("JSON-encoded error text containing an error object and the HTTP status"), and gateways in front of any API can return an HTML page. Parse defensively.

Decide by **HTTP status first**. Branch on `error.code` only for codes the error-codes guide documents.

| Status | What the docs say it means | Action |
| --- | --- | --- |
| 400 | invalid request or incompatible parameters | fix the request; retrying the same body fails the same way |
| 401 | missing or revoked key, wrong key, no organization membership, or IP not on the allowlist | fix credentials |
| 403 | for example a country or region that is not supported, or an organization policy | fix access; retrying does not help |
| 404 | the model or a referenced resource was not found or is unavailable to this caller | check the id, and whether your project may use it |
| 429 | rate limit reached, `slow_down` (traffic rose too quickly), or a billing/quota condition | read `error.code`; wait or stop (below) |
| 500 | an error on the provider's side | retry after a brief wait |
| 503 | `server_is_overloaded`: the requested model is temporarily overloaded | follow `Retry-After`, then retry |

A `429` is two different problems with one number. The error-codes guide lists billing, spend and quota conditions under it (`credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded`; "the broader `error.type` can still be `insufficient_quota`") and states: "Retrying billing, spend, or quota errors won't restore API access." Retry the throttling kind; stop and alert a human for the money kind.

When retrying is right, the rate-limits guide gives the recipe: a `Retry-After` header (integer seconds, may be omitted) is "a minimum: wait at least that long and add a small random delay so multiple clients don't retry at the same time"; without it, "fall back to exponential backoff with jitter. Limit both the number of attempts and the total time spent retrying." This module only classifies errors. The full retry machinery is built in [Module 05 of Track 08](../../08-embeddings-and-vector-databases/05-generating-embeddings-at-scale/README.md) for embeddings, and rate limits are the subject of [Module 16: Pricing, Rate Limits and Quotas](../16-pricing-rate-limits-and-quotas/README.md).

> [!model] Think of a status code as a triage tag. 4xx says "the problem is on your side; change something before you try again" (the exceptions are 408/409/429, where waiting can help). 5xx says "the problem is on their side; waiting may fix it". The error object is the doctor's note; the status code is what you act on first.

One more case belongs to retry logic, and it is my reasoning rather than a docs statement: a `POST` that times out may still have been processed. If the first request finished and only the response was lost, retrying means a second generation and a second charge. That is a reason to set sensible timeouts, to cap retries, and to log a client request id for every attempt.

### Request ids: your handle for support

Every response carries an `x-request-id` header, which the API reference describes as the "unique identifier for this API request (used in troubleshooting)". It adds: "OpenAI recommends logging request IDs in production deployments for more efficient troubleshooting with the support team". The same page lists other useful headers: `openai-processing-ms` (time spent processing), `openai-version` (the REST API version, "currently `2020-10-01`") and a family of `x-ratelimit-*` headers (remaining requests and tokens, and when they reset).

You can also supply your own id in an `X-Client-Request-Id` request header. The format is yours to choose, but "it must contain only ASCII characters and be no more than 512 characters long; otherwise, the request will fail with a 400 error", and it helps most when no response arrives: "In cases like timeouts or network issues when you can't get the `X-Request-Id` response header, you can share the `X-Client-Request-Id` value with the support team."

Do not confuse the two ids. The body's `id` (`chatcmpl-...`) names the completion object; `x-request-id` names the HTTP request. Log both, with the model, status, latency and `usage`. Do not log prompts by default, since they often contain user data.

### Organizations and projects

Only as far as the docs state it: your account belongs to one or more **organizations**, and an organization contains **projects**. The production guide speaks of creating "a project API key" and of setting "custom rate and spend limits per project". If you "belong to more than one organization or access projects through a legacy user API key", you pass `OpenAI-Organization` and `OpenAI-Project` headers to say which one a request counts against; their ids are on the dashboard settings pages. The production guide suggests separate projects for staging and production. The mechanics of limits and tiers are in Module 16.

### What the official SDK wraps for you

The official Python SDK is generated from the same OpenAPI spec ("It is generated from our OpenAPI specification", per its README). Compare what you write by hand in the Code section with what the README documents the SDK doing (checked 26 Oct 2026):

| By hand in this module | The SDK |
| --- | --- |
| `load_api_key()` | reads `OPENAI_API_KEY` by default |
| base URL constant | `base_url` option or `OPENAI_BASE_URL` environment variable |
| `json.dumps` / `json.loads` | typed request parameters and typed response objects |
| `ApiError`, `classify()` | `APIStatusError` subclasses: 400 `BadRequestError`, 401 `AuthenticationError`, 403 `PermissionDeniedError`, 404 `NotFoundError`, 422 `UnprocessableEntityError`, 429 `RateLimitError`, >=500 `InternalServerError`; `APIConnectionError` when there is no response |
| reading `x-request-id` | a public `_request_id` property on response objects; `request_id` on `APIStatusError` |
| nothing (no retries) | "Certain errors are automatically retried 2 times by default, with a short exponential backoff": connection errors, 408, 409, 429 and >=500 |
| `timeout=` argument | a `timeout` option; "By default requests time out after 10 minutes" |

Two warnings follow from that table. If you write your own retry loop on top of an SDK that already retries, the loops multiply: set `max_retries=0` on one of them. And the SDK's ten-minute default timeout is far longer than most interactive features can wait, so set one deliberately.

## Code

Python 3.10 or newer, standard library only. Save the two files below in one folder. `standin.py` is plumbing (a local HTTP server that speaks the documented shape), so it is collapsed; `first_call.py` is the part to read. Both were run with Python 3.13, and the output below is what that run printed. The stand-in uses a fixed timestamp, fixed request ids and fake word-count token accounting so that the output reproduces.

<details>
<summary>standin.py: a local stand-in for the chat endpoint (plumbing)</summary>

```python
"""standin.py - a LOCAL STAND-IN that mimics the documented shape of the OpenAI
Chat Completions endpoint (POST /v1/chat/completions) and the models list
(GET /v1/models). The "model" behind it is a script, not a real model.
Standard library only."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):     # e.g. a client that timed out and hung up
        pass

FIXED_CREATED = 1_700_000_000          # fixed clock so printed output reproduces


def error_body(message, etype, param=None, code=None):
    # The documented error object has exactly these four fields.
    return {"error": {"message": message, "type": etype, "param": param, "code": code}}


class StandIn:
    def __init__(self, api_key):
        self.api_key = api_key
        self.faults = []          # queued (status, body, headers, delay_s), served before normal replies
        self.requests_seen = 0
        self.last = {}            # headers + parsed body of the most recent request
        self._server = None

    # ---- lifecycle -------------------------------------------------------
    def start(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):          # keep the console quiet
                pass

            def _send(self, status, body, headers=None, raw=None, ctype="application/json"):
                data = raw if raw is not None else json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("x-request-id", f"req_standin_{outer.requests_seen:04d}")
                self.send_header("openai-version", "2020-10-01")
                self.send_header("openai-processing-ms", "5")      # fixed, for reproducible output
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(data)

            def _gate(self):
                """Common steps: count, record, authenticate, serve queued faults."""
                outer.requests_seen += 1
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                outer.last = {"headers": {k.lower(): v for k, v in self.headers.items()}, "raw": raw}
                if self.headers.get("Authorization") != f"Bearer {outer.api_key}":
                    self._send(401, error_body("Incorrect API key provided.", "invalid_request_error"))
                    return None
                if outer.faults:
                    status, body, headers, delay = outer.faults.pop(0)
                    time.sleep(delay)
                    if isinstance(body, str):               # e.g. an HTML page from a gateway
                        self._send(status, None, headers, raw=body.encode(), ctype="text/html")
                    else:
                        self._send(status, body, headers)
                    return None
                return raw

            def do_GET(self):
                if self._gate() is None:
                    return
                if self.path == "/v1/models":
                    data = [{"id": mid, "object": "model", "created": FIXED_CREATED,
                             "owned_by": "local-standin", "shutdown_date": None}
                            for mid in ("standin-small", "standin-large")]
                    self._send(200, {"object": "list", "data": data})
                else:
                    self._send(404, error_body("Unknown URL (stand-in).", "invalid_request_error"))

            def do_POST(self):
                raw = self._gate()
                if raw is None:
                    return
                if self.path != "/v1/chat/completions":
                    return self._send(404, error_body("Unknown URL (stand-in).", "invalid_request_error"))
                try:
                    req = json.loads(raw)
                except ValueError:
                    return self._send(400, error_body("Body is not valid JSON.", "invalid_request_error"))
                outer.last["body"] = req
                if not req.get("model"):
                    return self._send(400, error_body("Missing required parameter: 'model'.",
                                                      "invalid_request_error", param="model"))
                msgs = req.get("messages")
                if not isinstance(msgs, list) or not msgs:
                    return self._send(400, error_body("Missing required parameter: 'messages'.",
                                                      "invalid_request_error", param="messages"))
                last_user = next((m["content"] for m in reversed(msgs) if m.get("role") == "user"), "")
                reply = f"(scripted) You asked: {last_user[:50]}"
                # Fake accounting: whitespace-separated words, NOT real tokens.
                prompt_tokens = sum(len(str(m.get("content", "")).split()) + 3 for m in msgs)
                completion_tokens = len(reply.split())
                self._send(200, {
                    "id": f"chatcmpl-standin-{outer.requests_seen:04d}",
                    "object": "chat.completion",
                    "created": FIXED_CREATED,
                    "model": req["model"],
                    "choices": [{"index": 0,
                                 "message": {"role": "assistant", "content": reply,
                                             "refusal": None, "annotations": []},
                                 "logprobs": None,
                                 "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": prompt_tokens,
                              "completion_tokens": completion_tokens,
                              "total_tokens": prompt_tokens + completion_tokens},
                })

        self._server = QuietServer(("127.0.0.1", 0), Handler)   # port 0 = pick a free port
        self._server.daemon_threads = True
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return self

    @property
    def base_url(self):
        return f"http://127.0.0.1:{self._server.server_address[1]}/v1"

    def stop(self):
        self._server.shutdown()
        self._server.server_close()
```

</details>

```python
"""first_call.py - one chat-style request over raw HTTP with urllib (standard library only).
Run it next to standin.py. It talks to the LOCAL STAND-IN, never to a real provider."""
import json
import os
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass

from standin import StandIn

DOCUMENTED_BASE_URL = "https://api.openai.com/v1"    # the `servers` entry in the OpenAPI spec
DEMO_KEY = "demo-key-for-local-stand-in"             # fake; only the stand-in accepts it


def load_api_key(name="OPENAI_API_KEY"):
    key = os.environ.get(name)
    if not key:
        raise RuntimeError(f"{name} is not set. Export it in your shell; never hard-code it or commit it.")
    return key


@dataclass
class Response:
    status: int
    body: object            # parsed JSON, or the raw text if the body was not JSON
    headers: dict           # header names lower-cased

    @property
    def request_id(self):
        return self.headers.get("x-request-id")


class ConnectionFailed(Exception):
    """No HTTP response at all: DNS, refused connection, TLS, or a timeout."""


class ApiError(Exception):
    """The server answered with a 4xx/5xx status."""

    def __init__(self, status, body, headers):
        err = body.get("error") if isinstance(body, dict) else None
        err = err if isinstance(err, dict) else {}
        self.status, self.headers = status, headers
        self.request_id = headers.get("x-request-id")
        self.message = err.get("message") or str(body)[:80]
        self.type, self.code, self.param = err.get("type"), err.get("code"), err.get("param")
        ra = headers.get("retry-after", "")
        self.retry_after = int(ra) if ra.isdigit() else None     # documented as integer seconds
        super().__init__(f"HTTP {status}: {self.message} (request id {self.request_id})")


def request(method, url, api_key, payload=None, timeout=10.0, extra_headers=None):
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    headers.update(extra_headers or {})
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status, raw, hdrs = resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:                  # 4xx/5xx still carry a body worth reading
        status, raw, hdrs = e.code, e.read(), e.headers
    except OSError as e:                                 # URLError, timeouts, refused connections
        raise ConnectionFailed(f"{type(e).__name__}: no HTTP response") from None
    hdrs = {k.lower(): v for k, v in hdrs.items()}
    try:
        body = json.loads(raw)
    except ValueError:                                   # e.g. an HTML error page from a gateway
        body = raw.decode("utf-8", "replace")
    if status >= 400:
        raise ApiError(status, body, hdrs)
    return Response(status, body, hdrs)


@dataclass
class Completion:
    id: str
    model: str
    text: str | None          # `content` may be null (tool calls, refusals)
    finish_reason: str
    usage: dict | None        # not in the spec's `required` list, so treat it as optional
    refusal: str | None


def read_completion(body):
    for field in ("id", "object", "created", "model", "choices"):      # required by the spec
        if field not in body:
            raise ValueError(f"response is missing required field {field!r}")
    choice = body["choices"][0]
    msg = choice["message"]
    return Completion(body["id"], body["model"], msg.get("content"), choice["finish_reason"],
                      body.get("usage"), msg.get("refusal"))


BILLING_CODES = {"credit_balance_exhausted", "organization_spend_limit_exceeded",
                 "project_spend_limit_exceeded", "organization_usage_limit_exceeded"}


def classify(err):
    """Decide by HTTP status first; use `code` only for codes the error-codes guide documents."""
    if err.status in (401, 403):
        return "fix-credentials-or-access"
    if err.status == 429 and (err.code in BILLING_CODES or err.type == "insufficient_quota"):
        return "needs-a-human (retrying cannot help)"
    if err.status == 429 or err.status >= 500:
        return "retry-with-backoff"
    return "fix-the-request"


def main():
    server = StandIn(DEMO_KEY).start()
    try:
        # In real life you run `export OPENAI_API_KEY=...` in your shell. This line only simulates that.
        os.environ["OPENAI_API_KEY"] = DEMO_KEY
        api_key = load_api_key()
        base = server.base_url            # real use: DOCUMENTED_BASE_URL
        chat_url = base + "/chat/completions"

        print("== 1. the request")
        payload = {"model": "standin-small",
                   "messages": [{"role": "developer", "content": "Answer in one short sentence."},
                                {"role": "user", "content": "What is an HTTP API?"}]}
        print("POST", DOCUMENTED_BASE_URL + "/chat/completions", "(here: a local port instead)")
        print("Authorization: Bearer ***redacted***   Content-Type: application/json")
        print(json.dumps(payload, indent=2))

        print("\n== 2. the response")
        resp = request("POST", chat_url, api_key, payload,
                       extra_headers={"X-Client-Request-Id": "demo-0001"})
        print("status:", resp.status)
        print("headers:", {k: v for k, v in resp.headers.items()
                           if k in ("content-type", "x-request-id", "openai-version", "openai-processing-ms")})
        print(json.dumps(resp.body, indent=2))
        print("stand-in saw our client request id:", server.last["headers"].get("x-client-request-id"))

        print("\n== 3. the fields you must read")
        c = read_completion(resp.body)
        print("id:", c.id)
        print("model:", c.model)
        print("text:", c.text)
        print("finish_reason:", c.finish_reason)
        print("usage:", c.usage)
        print("request id (header):", resp.request_id)

        print("\n== 4. models endpoint")
        models = request("GET", base + "/models", api_key).body
        print([m["id"] for m in models["data"]], "| object:", models["object"])

        print("\n== 5. errors")
        slow_down = {"error": {"message": "Your request rate increased too quickly. Please reduce the request rate "
                                          "and gradually increase it again.",
                               "type": "rate_limit_error", "param": None, "code": "slow_down"}}
        no_credit = {"error": {"message": "Your organization has no prepaid credits remaining (stand-in text).",
                               "type": "insufficient_quota", "param": None, "code": "credit_balance_exhausted"}}
        overloaded = {"error": {"message": "The model is temporarily overloaded. Please retry your request after a brief delay.",
                                "type": "service_unavailable_error", "param": None, "code": "server_is_overloaded"}}
        server_err = {"error": {"message": "The server had an error while processing your request.",
                                "type": "server_error", "param": None, "code": None}}
        cases = [
            ("wrong API key", dict(key="not-the-key"), None),
            ("missing messages", dict(payload={"model": "standin-small"}), None),
            ("429 slow_down", {}, (429, slow_down, {"Retry-After": "2"}, 0)),
            ("429 no credit", {}, (429, no_credit, {}, 0)),
            ("503 overloaded", {}, (503, overloaded, {"Retry-After": "1"}, 0)),
            ("500", {}, (500, server_err, {}, 0)),
            ("502 HTML page", {}, (502, "<html><body>Bad gateway</body></html>", {}, 0)),
        ]
        texts = []
        print(f"{'case':<17}{'status':>6} {'code':<25} {'param':<9} {'retry_after':<11} action")
        for label, opts, fault in cases:
            if fault:
                server.faults.append(fault)
            try:
                request("POST", chat_url, opts.get("key", api_key), opts.get("payload", payload))
            except ApiError as e:
                texts.append(str(e))
                print(f"{label:<17}{e.status:>6} {str(e.code):<25} {str(e.param):<9} {str(e.retry_after):<11} {classify(e)}")
        bad = [t for t in texts if DEMO_KEY in t]
        print("error messages containing the API key:", len(bad))

        print("\n== 6. no key, and a timeout")
        print("urllib's default timeout (socket.getdefaulttimeout()):", socket.getdefaulttimeout())
        del os.environ["OPENAI_API_KEY"]
        try:
            load_api_key()
        except RuntimeError as e:
            print("RuntimeError:", e)
        server.faults.append((200, {}, {}, 0.5))             # the stand-in sleeps 0.5 s before answering
        try:
            request("POST", chat_url, api_key, payload, timeout=0.1)
        except ConnectionFailed as e:
            print("ConnectionFailed:", e)
    finally:
        server.stop()


if __name__ == "__main__":
    main()
```

Run it with `python first_call.py`. Verified output (the key is a fake placeholder; nothing leaves your machine):

```
== 1. the request
POST https://api.openai.com/v1/chat/completions (here: a local port instead)
Authorization: Bearer ***redacted***   Content-Type: application/json
{
  "model": "standin-small",
  "messages": [
    {
      "role": "developer",
      "content": "Answer in one short sentence."
    },
    {
      "role": "user",
      "content": "What is an HTTP API?"
    }
  ]
}

== 2. the response
status: 200
headers: {'content-type': 'application/json', 'x-request-id': 'req_standin_0001', 'openai-version': '2020-10-01', 'openai-processing-ms': '5'}
{
  "id": "chatcmpl-standin-0001",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "standin-small",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "(scripted) You asked: What is an HTTP API?",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 16,
    "completion_tokens": 8,
    "total_tokens": 24
  }
}
stand-in saw our client request id: demo-0001

== 3. the fields you must read
id: chatcmpl-standin-0001
model: standin-small
text: (scripted) You asked: What is an HTTP API?
finish_reason: stop
usage: {'prompt_tokens': 16, 'completion_tokens': 8, 'total_tokens': 24}
request id (header): req_standin_0001

== 4. models endpoint
['standin-small', 'standin-large'] | object: list

== 5. errors
case             status code                      param     retry_after action
wrong API key       401 None                      None      None        fix-credentials-or-access
missing messages    400 None                      messages  None        fix-the-request
429 slow_down       429 slow_down                 None      2           retry-with-backoff
429 no credit       429 credit_balance_exhausted  None      None        needs-a-human (retrying cannot help)
503 overloaded      503 server_is_overloaded      None      1           retry-with-backoff
500                 500 None                      None      None        retry-with-backoff
502 HTML page       502 None                      None      None        retry-with-backoff
error messages containing the API key: 0

== 6. no key, and a timeout
urllib's default timeout (socket.getdefaulttimeout()): None
RuntimeError: OPENAI_API_KEY is not set. Export it in your shell; never hard-code it or commit it.
ConnectionFailed: TimeoutError: no HTTP response
```

What to notice:

- **Section 2** is the whole exchange: a 200 status, the request id in a header, and the JSON body. The `created` value and the request ids are fixed by the stand-in; a real API returns real ones. The `usage` numbers come from the stand-in's fake word counting, not a tokenizer.
- **Section 3** reads the five fields defensively: `text` and `usage` can be `None`.
- **Section 5** shows that the action comes from the status code. The `429` with `credit_balance_exhausted` is classified differently from the `429` with `slow_down`, and a gateway's HTML page (a `502`) still produces a clean `ApiError` instead of a crash. The `Retry-After` values were read from the headers.
- **The key never appears** in any error message (0 of 7), and `load_api_key()` fails with an actionable message when the variable is missing.
- **Section 6** shows why a timeout is not optional: `urllib` waits forever by default (`None`), and a 0.1 s timeout against a stand-in that sleeps for 0.5 s produces `ConnectionFailed`.

> [!example] The same call with the official SDK. **NOT EXECUTED (needs the `openai` package and a real API key).** Every name below was checked against the `openai-python` README fetched on 26 Oct 2026; no output is shown because none was produced. `OPENAI_MODEL` is my own variable name for a model id you looked up on the models page.

```python
import os
import openai
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],   # also the default; explicit makes the dependency visible
    max_retries=2,                          # README: default is 2
    timeout=30.0,                           # README: default is 10 minutes
)

try:
    completion = client.chat.completions.create(
        model=os.environ["OPENAI_MODEL"],
        messages=[
            {"role": "developer", "content": "Answer in one short sentence."},
            {"role": "user", "content": "What is an HTTP API?"},
        ],
    )
except openai.APIStatusError as e:          # any 4xx or 5xx (RateLimitError is a subclass)
    print(e.status_code, e.request_id)
    raise
except openai.APIConnectionError:           # no HTTP response at all
    raise

choice = completion.choices[0]
print(choice.message.content, choice.finish_reason, completion.usage, completion._request_id)
```

The raw HTTP equivalent with `curl` (also **NOT EXECUTED**, it needs a real key and a real model id):

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Client-Request-Id: demo-0001" \
  -d '{"model": "YOUR_MODEL_ID", "messages": [{"role": "user", "content": "What is an HTTP API?"}]}'
```

## Visual diagram

```
   YOUR SERVER                                                     PROVIDER API
  ┌──────────────────────────────┐   POST https://api.openai.com/v1/chat/completions
  │ key  = os.environ[...]       │   Authorization: Bearer <key>        (secret: never logged)
  │ body = {model, messages}     │   Content-Type: application/json
  │ timeout = 30 s   (always)    │   X-Client-Request-Id: <your id>     (optional)
  └──────────────┬───────────────┘ ─────────────────────────────────────────────►
                 │                                                   authenticate, validate,
                 │                                                   run the model, count tokens
                 │                ◄──────────────────────────────────────────────
                 ▼
        ┌─────────────────┐
        │  status < 400 ? │
        └───┬─────────┬───┘
       yes  │         │  no (4xx / 5xx), or no response at all
            ▼         ▼
  ┌──────────────────┐   ┌───────────────────────────────────────────┐
  │ read defensively │   │ body: {"error": {message, type, param,    │
  │  id, model       │   │        code}}   (or text, or an HTML page)│
  │  content | None  │   │ headers: x-request-id, Retry-After?       │
  │  finish_reason   │   └─────────────────────┬─────────────────────┘
  │  usage | None    │                         ▼
  │ log x-request-id │       decide by STATUS first, then error.code
  └──────────────────┘         400 / 404 / 422   fix the request
                               401 / 403         fix the key or the access
                               429 + billing     stop, alert a human
                               429 / 5xx         wait >= Retry-After, plus jitter,
                                                 capped attempts, then retry
                               no response       timeout / connection error: retry, capped
```

## Practice

### 1. Read a response without trusting it

Write `next_step(body)` that takes a chat completion body (a plain dict) and returns what the caller should do: use the text, show a refusal, run a tool call, treat an empty message as an error, or flag truncation (`finish_reason == "length"`) or filtering (`"content_filter"`). Test it on five hand-written bodies (normal, refusal, tool call, truncated, empty). None of them includes a `usage` field.

<details><summary>Answer</summary>

```python
def next_step(body):
    """Decide what the caller should do with a chat completion body (a plain dict)."""
    choice = body["choices"][0]
    msg = choice["message"]
    if msg.get("refusal"):
        return "show the refusal text to the user"
    if msg.get("tool_calls"):
        return "run the requested tool(s) and send the results back"
    if msg.get("content") is None:
        return "no text and no tool call: log the request id and treat as an error"
    if choice["finish_reason"] == "length":
        return "text was cut off at the token limit: raise the limit or shorten the prompt"
    if choice["finish_reason"] == "content_filter":
        return "content was omitted by a filter"
    return "use the text"

def body(content, finish="stop", **message_extra):
    msg = {"role": "assistant", "content": content, **message_extra}
    return {"id": "chatcmpl-x", "object": "chat.completion", "created": 0, "model": "m",
            "choices": [{"index": 0, "message": msg, "finish_reason": finish}]}   # note: no `usage`

cases = {
    "normal": body("Paris."),
    "refusal": body(None, refusal="I can't help with that."),
    "tool call": body(None, "tool_calls", tool_calls=[{"id": "call_1", "type": "function",
                      "function": {"name": "get_weather", "arguments": "{}"}}]),
    "truncated": body("The capital of France is", "length"),
    "empty": body(None),
}
for name, b in cases.items():
    print(f"{name:<10} -> {next_step(b)}")
```

Output:

```
normal     -> use the text
refusal    -> show the refusal text to the user
tool call  -> run the requested tool(s) and send the results back
truncated  -> text was cut off at the token limit: raise the limit or shorten the prompt
empty      -> no text and no tool call: log the request id and treat as an error
```

The order of the checks matters: a refusal or a tool call has `content: null`, so the "empty" check must come after them. Neither `usage` nor `content` is assumed.

</details>

### 2. Keep the key out of the logs

Write `safe_headers(headers)` that replaces the `Authorization` value, and show with the `logging` module that a naive log line leaks the key while the safe one does not.

<details><summary>Answer</summary>

```python
import io, logging

DEMO_KEY = "demo-key-for-local-stand-in"

def safe_headers(headers):
    """Copy of a header dict that is safe to log."""
    return {k: ("Bearer ***redacted***" if k.lower() == "authorization" else v) for k, v in headers.items()}

stream = io.StringIO()
logging.basicConfig(stream=stream, level=logging.INFO, format="%(message)s")
sent = {"Authorization": f"Bearer {DEMO_KEY}", "Content-Type": "application/json", "X-Client-Request-Id": "demo-0001"}

logging.info("naive log : %s", sent)
logging.info("safe log  : %s", safe_headers(sent))
for line in stream.getvalue().splitlines():
    print(("LEAK  " if DEMO_KEY in line else "clean ") + line)
```

Output:

```
LEAK  naive log : {'Authorization': 'Bearer demo-key-for-local-stand-in', 'Content-Type': 'application/json', 'X-Client-Request-Id': 'demo-0001'}
clean safe log  : {'Authorization': 'Bearer ***redacted***', 'Content-Type': 'application/json', 'X-Client-Request-Id': 'demo-0001'}
```

Redact at the point where you build the log line, not afterwards by searching for patterns. The best protection is that the key is only ever held in one place (the function that builds the request headers).

</details>

### 3. Read the spec, not a blog post

Download the OpenAPI spec pinned to the commit used in this module and print the documented base URL, the security scheme, and the `required` fields of the request, response, error and usage schemas. This exercise needs network access to `raw.githubusercontent.com` (it was run for this module on 26 Oct 2026).

<details><summary>Answer</summary>

```python
import json, urllib.request

# Pinned to one commit of github.com/openai/openai-openapi so the output below reproduces.
URL = "https://raw.githubusercontent.com/openai/openai-openapi/8243cc8fa6f04430fb1f1a6a2cb926fbeb4f7f26/openapi.json"
with urllib.request.urlopen(URL, timeout=60) as r:
    spec = json.load(r)
schemas = spec["components"]["schemas"]

def required_of(name):
    s = schemas[name]
    req = list(s.get("required", []))
    for part in s.get("allOf", []):                 # the request schema is built from allOf parts
        req += part.get("required", [])
    return req

print("servers:", [s["url"] for s in spec["servers"]])
print("security scheme:", spec["components"]["securitySchemes"]["ApiKeyAuth"])
for name in ("CreateChatCompletionRequest", "CreateChatCompletionResponse", "Error", "CompletionUsage"):
    print(f"{name} required: {required_of(name)}")
```

Output:

```
servers: ['https://api.openai.com/v1']
security scheme: {'type': 'http', 'scheme': 'bearer'}
CreateChatCompletionRequest required: ['model', 'messages']
CreateChatCompletionResponse required: ['choices', 'created', 'id', 'model', 'object']
Error required: ['type', 'message', 'param', 'code']
CompletionUsage required: ['prompt_tokens', 'completion_tokens', 'total_tokens']
```

Only `model` and `messages` are required in a request. In the response, `usage` is not required (although if present, its three counters are), which is why Exercise 1 and the Code section treat it as optional. Pinning to a commit makes the result reproducible; the `main` branch moves.

</details>

### Checkpoint quiz

1. Where does the API key go in an HTTP request, and where must it never appear?
2. Name the five response fields you should read on every successful call, and say which can be null or missing.
3. A request returns `429`. What two different problems can that be, and how do you tell them apart?
4. What is the difference between the `id` in the response body and the `x-request-id` header? When is `X-Client-Request-Id` useful?
5. Why is it risky to retry a timed-out request without any limits?

<details><summary>Answers</summary>

1. In the `Authorization: Bearer <key>` request header, with the key read from an environment variable or secret manager. It must never be in source code, git, client-side code, logs or URLs.
2. The text (`choices[0].message.content`), `finish_reason`, `usage`, `id` and `model`. The text can be null (tool call or refusal) and `usage` is not marked required in the spec.
3. A temporary rate limit or traffic ramp (`rate_limit_error` / `slow_down`, wait and retry) versus a billing, spend or quota condition (`error.code` such as `credit_balance_exhausted`, retrying cannot help). Tell them apart by `error.code` (and `error.type`), and honour `Retry-After` for the first kind.
4. The body `id` names the completion object; `x-request-id` names the HTTP request and is what support asks for. `X-Client-Request-Id` is an id you generate; it lets you identify a request even when you never received a response, such as after a timeout.
5. The first attempt may have completed on the server with only the response lost, so each retry can cost another generation; unbounded retries also amplify an outage and can hit rate limits harder. Cap attempts and total time, and use jittered backoff.

</details>

> [!check]
> - I can build a chat request by hand (URL, headers, JSON body) and say which parts are required.
> - I can keep an API key out of code, git and logs.
> - I can read a response without assuming `content` or `usage` is present.
> - I can map a status code to fix, wait or stop, and tell the two kinds of `429` apart.
> - I can find and log `x-request-id` and use `X-Client-Request-Id`.
> - I can say what the SDK adds and why its retries and my retries must not be nested.

## Project

Build `llm_http.py`, a small reusable client module for a chat-style endpoint, plus a test file, and run it against the stand-in from the Code section. It must: load the key from the environment and refuse to start without it; set a timeout on every request; attach a fresh `X-Client-Request-Id` (ASCII, at most 512 characters) to every attempt and log it together with the `x-request-id`, the status, the latency and the `usage`; parse bodies that are JSON, `text/plain` or HTML without crashing; raise one typed exception per outcome (bad request, bad credentials, throttled, billing stop, server trouble, no response, malformed success body); accept `Retry-After` both as integer seconds and as an HTTP-date (RFC 9110 allows both; the OpenAI docs describe integer seconds); and never contain the key in any exception message, log line or `repr`. Extend the stand-in with a success response that is valid JSON but lacks `choices`, and make your client reject it with a clear error. Your tests should prove each of those properties, including the key-leak property by searching all captured output. No code is given: design the module boundaries yourself.

## Interview questions

> [!interview] Walk me through what happens on the wire when an application calls a hosted LLM chat endpoint, and what you would log for every call.

<details><summary>What a strong answer covers</summary>

- An HTTPS `POST` to the endpoint under the base URL, with a Bearer `Authorization` header, a JSON content type, and a body containing at least the model and the messages; a JSON response with the choices, the finish reason and the usage.
- Statelessness: each request carries its own context.
- Logging: timestamp, endpoint, model (requested and returned), status, latency, `x-request-id`, your own client request id, token usage, finish reason; not the key, and not prompt text by default.
- Timeouts, because the call takes seconds and a missing timeout can hang a worker forever.

</details>

> [!interview] Your service starts getting `429` responses from the provider. What do you do?

<details><summary>What a strong answer covers</summary>

- Read the status and `error.code` first: a throttle (`rate_limit_error`, `slow_down`) is retryable; a billing, spend or quota code is not and should page a human.
- For throttles: honour `Retry-After` as a minimum, add jitter, use exponential backoff as a fallback, cap attempts and total time, and avoid stacking your retries on the SDK's retries.
- Look at the cause: concurrency or bursts, a shared key across services, batching more inputs per request, a client-side rate limiter, and the account's limits and tiers.
- Observability: count 429s by code, and watch the `x-ratelimit-*` headers to slow down before hitting the limit.

</details>

> [!interview] A teammate wants to call the API directly from the browser so the backend is not needed. What do you say?

<details><summary>What a strong answer covers</summary>

- The key would ship to every user's browser; anyone can read it and spend your money. The provider's own guidance: do not expose keys in client-side code, and load them on the server.
- Put a thin backend in front: it holds the key, authenticates and rate-limits your own users, validates inputs, applies per-user quotas and logs request ids.
- Mitigations if a key leaks: revoke and rotate immediately; use expiring, project-scoped keys, separate staging and production projects, and spend limits.
- Optional: mention the provider's other documented credential options (short-lived access tokens) as something to check in the current docs rather than something to assume.

</details>

## Common mistakes & troubleshooting

- **`401` although the key looks right.** The environment variable is not set in the shell, IDE run configuration or container that actually runs the code (print only `bool(os.environ.get("OPENAI_API_KEY"))`, never the key); the key was revoked or belongs to a different project; there is a stray space or newline; or an IP allowlist rejects your address. On Windows, `setx` only affects terminals opened afterwards.
- **`404` for a model that exists.** The model id has a typo, your project may not be allowed to use it, or the id is retired. Check `GET /v1/models` with the same key and read the models page; keep the id in configuration.
- **`KeyError` or `TypeError` on `choices[0].message.content`.** The message was a refusal or a tool call (`content` is null) or the call failed. Branch on `finish_reason` and check `refusal` and `tool_calls` first.
- **The script hangs.** No timeout was set. `urllib` and many HTTP libraries wait indefinitely by default; set a timeout on every call.
- **Retries make an outage worse, or the bill higher.** Retries without a cap, without jitter, or on non-retryable errors (billing, bad request); or both your code and the SDK retrying.
- **A `429` that never recovers.** It is probably a billing, spend or quota condition (`error.code`), not a throttle. Fix the account side.
- **The key shows up in a log or an error report.** A request-dump or debug logger printed the headers. Redact at the source (Exercise 2), and treat any leaked key as compromised: revoke it.
- **Parsing crashes on an error page.** A proxy or gateway returned HTML; the body is not always the documented error object. Parse defensively and keep the status code and request id.

## Further reading & sources

- [API Overview | OpenAI API Reference](https://developers.openai.com/api/reference/overview) - the source for authentication, the organization and project headers, `x-request-id`, `X-Client-Request-Id` and the response headers quoted in this module.
- [Error codes | OpenAI API](https://developers.openai.com/api/docs/guides/error-codes) - the table of 400/401/403/429/500/503 causes, the billing-related `error.code` values and the Python SDK exception names.
- [Rate limits | OpenAI API](https://developers.openai.com/api/docs/guides/rate-limits) - the `Retry-After` and `x-ratelimit-*` headers and the retry recipe (minimum wait, jitter, bounded attempts) used for the classification here.
- [Create chat completion | OpenAI API Reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) - the endpoint's request and response reference; the stand-in mirrors its documented shape.
- [openai/openai-openapi: OpenAPI specification for the OpenAI API](https://github.com/openai/openai-openapi) - the published OpenAPI specification (required fields, schemas, status codes) that Exercise 3 reads and that the official SDKs are generated from.
- [openai/openai-python: The official Python library for the OpenAI API](https://github.com/openai/openai-python) - the official Python SDK README: default API-key handling, retries, timeouts, exception classes and `_request_id`.
- [Production best practices | OpenAI API](https://developers.openai.com/api/docs/guides/production-best-practices) - guidance on keeping API keys out of code, key expiry and rotation, and staging versus production projects.
- [RFC 6750: The OAuth 2.0 Authorization Framework: Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html) - defines the `Authorization: Bearer` scheme the API uses.

## Next

[Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md)
