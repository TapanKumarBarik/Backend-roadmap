# Module 02: The Responses API and Statefulness

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**. [Module 00](../00-the-openai-api-your-first-call/README.md) covered the HTTP exchange and [Module 01](../01-chat-completions-deep-dive/README.md) the Chat Completions endpoint, where **your code** holds the conversation. This module covers the endpoint the current docs recommend for new work, the **Responses API**, and its main new idea: the server can hold state for you. The price of that convenience is that you have to understand what is stored, for how long, and what happens to your application when it is gone. That makes this module as much about data retention and privacy as about request shapes.

After this module you can:

- describe how the Responses API relates to Chat Completions, as the official migration guide states it;
- read a response as a list of typed items and extract the text without assuming where it is;
- hold conversation state three ways (replayed by the client, `previous_response_id`, a Conversation object), and show with a test that they are equivalent in what the model is shown and in what you are billed;
- list the documented rules (instructions are not carried over, `store` defaults to true, 30-day retention, Zero Data Retention forces `store=false`) and design the application so that a vanished server-side state is an inconvenience, not an outage;
- state, quoting the docs, what server-side state means for privacy and deletion;
- translate a text-only Chat Completions request to a Responses request and know which fields have no top-level counterpart.

Next: [Module 03: Streaming Responses](../03-streaming-responses/README.md) covers the event stream for both endpoints.

> [!note] How this module was verified. No real provider was called. Request and response shapes come from the official OpenAPI spec (`openai/openai-openapi`, commit `8243cc8`, 24 Oct 2026); behaviour and retention statements are quoted from the official docs fetched on 26 Oct 2026: the migration guide, the conversation-state guide, the data-controls guide and the API reference. The runnable code uses **a local stand-in that mimics the documented shape and state semantics; the model behind it is scripted, not a real model**. The tests prove that *my code* handles the documented rules, not that the real service behaves exactly like the stand-in. Retention periods, defaults and eligibility change; the official docs are the source of truth and may have changed since.

## Concept

> [!key] The Responses API takes typed items in (`input`) and returns typed items out (`output`), and it lets you keep conversation state in three places (your own database, a chain of stored responses via `previous_response_id`, or a server-side Conversation) with the same model-visible context and the same token bill in each; so the real decision is about control, retention and privacy, and a design that keeps its own log survives any server-side state disappearing.

## Explanation

### What the Responses API is, and how it relates to Chat Completions

The migration guide (checked 26 Oct 2026) says: "The Responses API is our new API primitive, an evolution of Chat Completions which brings added simplicity and powerful agentic primitives to your integrations." It also says: "**While Chat Completions remains supported, Responses is recommended for all new projects.**" The `openai-python` README calls Responses "the primary API for interacting with OpenAI models" and calls Chat Completions "the previous standard (supported indefinitely)". The guide lists what Responses contains: built-in tools ("web search, file search, computer use, code interpreter, and remote MCPs"), "seamless multi-turn interactions", and native multimodal support for text and images.

The guide also makes claims about performance and cost: a 3% improvement on SWE-bench with the same prompt and setup for a reasoning model ("our internal evals"), and a "40% to 80% improvement" in cache utilization ("in internal tests"). Those are the vendor's own numbers, which this module did not reproduce. Treat them as hypotheses to test on your own traffic, not as facts about your application.

The endpoint is `POST /v1/responses`. Where Chat Completions has a `messages` array in and `choices` out, Responses has typed **items** in and out. In the guide's words, "an Item is a union of many types, representing the range of possibilities of model actions. A `message` is a type of Item, as is a `function_call` or `function_call_output`. Unlike a Chat Completions Message, where many concerns are glued together into one object, Items are distinct from one another and better represent the basic unit of model context."

### The request

The guide's mapping, with the spec's field names. The Source column says where each row comes from; a row marked "my reading" is mine, not the docs'.

| Chat Completions | Responses | Source |
| --- | --- | --- |
| `messages[]` | `input`: a string, or an array of input items | migration guide |
| developer or system guidance | top-level `instructions`, or message items "when you need to preserve an existing transcript" | migration guide |
| assistant message from a previous turn | an output `message` item in `response.output`, passed back in `input` if you manage state yourself | migration guide |
| `n` | not available: "make separate requests if you need multiple candidate outputs" | migration guide |
| `response_format` | `text.format` | migration guide |
| `reasoning_effort`, `verbosity` | `reasoning.effort`, `text.verbosity` (nested objects) | spec |
| `max_completion_tokens` | `max_output_tokens`, minimum 16 | my reading: the token-counting guide names the two together as the corresponding limits |
| `stop`, `seed`, `frequency_penalty`, `presence_penalty`, `logit_bias`, `logprobs` | **no top-level field of that name** in the Responses request schema | the schema comparison below |
| `stream` events (`delta` chunks) | typed events such as `response.created`, `response.output_text.delta`, `response.completed` | migration guide; Module 03 |
| function tool definitions | different shape ("externally tagged" versus "internally tagged"); `strict` defaults differ | migration guide; Module 06 |

The "no top-level field" row is a finding from the code in this module, not a statement that the capability is gone: the spec has no top-level request field with those names, so check the reference before assuming either way. The guide adds two behavioural notes: "Starting with GPT-5.4, Chat Completions does not support tool calling with `reasoning_effort` values other than `none`", and that some of its newest models require Responses for tool calling (per the migration page, checked 26 Oct 2026; model availability is exactly the kind of fact that changes).

### The response

The response object has an `id` (a `resp_...` string), `object: "response"`, `created_at`, a `status`, an `error` object, `incomplete_details`, the `output` array, and `usage`. The spec lists the statuses `completed`, `failed`, `in_progress`, `cancelled`, `queued` and `incomplete`; `incomplete_details.reason` says why a response is incomplete (for example `max_output_tokens`). Two naming differences from Chat Completions matter in code: usage counts are `input_tokens` / `output_tokens` / `total_tokens`, not `prompt_tokens` / `completion_tokens`, and there is no `choices` array.

`output` is a list of typed items. The text guide is blunt about it: "The `output` array often has more than one item in it! It can contain tool calls, data about reasoning tokens generated by reasoning models, and other items. It is not safe to assume that the model's text output is present at `output[0].content[0].text`." A `message` item has `role: "assistant"` and a `content` list whose parts are `output_text` or `refusal`. Other item types in the spec's output union include `reasoning`, `function_call`, the results of built-in tool calls, and MCP items.

Some SDKs add an `output_text` property that joins all text. The spec describes it as an "SDK-only convenience property", supported in the Python and JavaScript SDKs. If you use raw HTTP, as in this module's code, aggregate the text yourself: join every `output_text` part of every `message` item. The stand-in does not include an `output_text` field, to make that point.

> [!pitfall] Treating every `output` entry as a message, or reading `output[0]`, is the first item on the migration guide's list of common errors ("Treating every `output` entry as a message. Reasoning, tool, and function calls are separate Item types."). The demo shows the `KeyError` this causes.

### Three ways to hold the state

| | Client-held | `previous_response_id` | Conversation object |
| --- | --- | --- | --- |
| What you send | all items, every turn | only the new input, plus the previous response's `id` | only the new input, plus `conversation` |
| Where the items live | your database | stored responses on the server | a Conversation on the server |
| Docs on lifetime | yours to decide | "Response objects are saved for 30 days by default" | "Conversation objects and items in them are not subject to the 30 day TTL" |
| `store=false` possible | yes, and it works | then there is nothing to chain from | n/a |
| Cost | whole context billed each turn | same | same |
| Control over trimming | full | limited (compaction options exist; see the docs) | limited (same) |

The conversation-state guide describes each. Client-held: "To manually share context across generated responses, include the model's previous response output as input, and append that input to your next request." `previous_response_id` "lets you chain responses and create a threaded conversation" (and you can fork: two follow-ups from the same response). Conversations: "The Conversations API works with the Responses API to persist conversation state as a long-running object with its own durable identifier." Items in it "can be messages, tool calls, tool outputs, and other data".

The documented rules, each of which the demo turns into a test:

1. **`instructions` are not carried over.** The text guide: with `previous_response_id`, "the `instructions` used on previous turns will not be present in the context". The spec adds: "This makes it simple to swap out system (or developer) messages in new responses." Send them on every call.
2. **The whole context is billed every turn.** "Even when using `previous_response_id`, all previous input tokens for responses in the chain are billed as input tokens in the API." Server-held state saves you bytes on the wire and code in your app; it does not make the prompt cheaper.
3. **`previous_response_id` and `conversation` are exclusive.** The spec: "Cannot be used in conjunction with `conversation`."
4. **`store` defaults to true.** The spec: "Whether to store the generated model response for later retrieval via API. Defaults to true when omitted. If set to true, response data will be stored for at least 30 days." Note "at least": the exact deletion moment is not promised, so do not build logic on day 30.0.
5. **A response you did not store cannot be retrieved or chained.** That follows from what `store` means. (The stand-in returns 404; the spec lists 404 for a referenced resource that is not found, and I did not confirm the exact real error body.)
6. **Zero Data Retention forces `store=false`.** The data-controls guide: "When Zero Data Retention is enabled for an organization, the `store` parameter will always be treated as `false`, even if the request attempts to set the value to `true`." The migration guide adds that such organizations "cannot use the Responses API in a stateful way", and that encrypted reasoning items (`store: false` plus replaying every returned reasoning item) keep reasoning context without server storage.
7. **Replay everything for reasoning models.** For manual state with reasoning models, the guide's advice is to preserve every item in `output`; dropping reasoning, function call or function call output items is another entry on its list of migration errors.

> [!pitfall] The defaults for Chat Completions are stated inconsistently in the docs I fetched. The migration guide says "Chat completions are stored by default for new accounts", while the spec's `store` parameter for Chat Completions has `default: false`. I cannot tell you which is right for your account. Set `store` explicitly on every call, in both APIs.

### Privacy and data retention of server-side state

Quoted from the data-controls guide (checked 26 Oct 2026), because this is the part of the module where memory is the wrong source:

- **Training.** "Your data is your data. As of March 1, 2023, data sent to the OpenAI API is not used to train or improve OpenAI models (unless you explicitly opt in to share data with us)."
- **Abuse monitoring logs.** "By default, abuse monitoring logs are generated for all API feature usage and retained for up to 30 days, unless longer retention is required by law, or is reasonably necessary to protect our services or any third party from harm." They "may contain certain customer content, such as prompts and responses". The endpoint table lists 30 days of abuse-monitoring retention for `/v1/responses` and `/v1/chat/completions`, and the guide says the controls that exclude content from these logs (Modified Abuse Monitoring, Zero Data Retention) need prior approval, so `store=false` alone is not documented as switching them off.
- **Application state for Responses.** "Except as noted below, the Responses API has a 30 day Application State retention period by default, or when the `store` parameter is set to `true`. In those cases, response data will be stored for at least 30 days."
- **Conversations.** In the endpoint table, `/v1/conversations` and its items have retention "Until deleted" and are not Zero Data Retention eligible ("No"), while `/v1/responses` and `/v1/chat/completions` are eligible ("Yes, see below for limitations").
- **Other stored state.** "Background mode stores response data to disk for roughly 10 minutes to enable polling." Data sent to a remote MCP server "is subject to their data retention policies". Prompt caching "may store encrypted key/value tensors in GPU-local storage as application state", not retained after a 24-hour expiration.
- **Deleting.** The API has `DELETE /v1/responses/{response_id}`. For conversations, the reference says: "Delete a conversation. Items in the conversation will not be deleted." Read that literally: deleting the conversation object is documented as not deleting its items. Items have their own delete endpoint (`DELETE /v1/conversations/{conversation_id}/items/{item_id}`). Before you promise a user that their data is gone, test the exact sequence you rely on and read the current reference.

What this means in practice (my recommendations, and not legal advice):

- Choose `store` on purpose for each call site, and write the choice down. If you do not need server-side state, say `store=False` and keep the state yourself.
- Know where each user's data lives: your database, stored responses (30 days or more), conversations (until deleted), abuse-monitoring logs (up to 30 days), and any third-party tool provider. Put that map in your privacy documentation.
- Keep a log you control, with your own retention, and design so the chain can be rebuilt from it. The demo's `ResilientChat` does exactly that.
- Minimise what you send: do not put secrets or unnecessary personal data in prompts, stored or not.
- Build a deletion path (responses, conversation items, your own copies) and test it, as Exercise 2 does against the stand-in.

### Built-in tools

The migration guide lists the Responses built-in tools as web search, file search, computer use, code interpreter and remote MCP servers (and its examples also mention image generation). This module does not demonstrate them: each has its own guide ([Tools](https://developers.openai.com/api/docs/guides/tools)), its own data-handling notes (see the bullets above), and, for your own functions, [Module 06](../06-function-calling-basics/README.md).

### Choosing, and migrating

Guidance from the migration guide (checked 26 Oct 2026): it recommends Responses for all new projects, says "Chat Completions remains supported, so you can migrate one user flow at a time", and gives a checklist: start with a text-generation flow; update the endpoint, request body and output handling; decide on `previous_response_id`, manual item replay or Conversations; add `store: false` for stateless or ZDR flows; migrate function definitions and structured outputs; update streaming consumers; "compare behavior, latency, token usage, and errors before routing more traffic to Responses".

My decision rules, built on that guidance and on the schema comparison:

- **New project, text or tools or reasoning models:** Responses.
- **Existing Chat Completions integration that works:** it is supported; migrate flow by flow when you want built-in tools, server-side state, or newer models whose tool calling needs Responses. Use the migration guide's checklist, and shadow-test.
- **You rely on `n`, `stop`, `seed`, penalties or `logit_bias`:** the Responses request schema has no such top-level field. Decide whether the feature matters before migrating.
- **State:** client-held when you need portability across providers (Module 17), tight control of what the model sees (trimming, Module 01), auditability, or Zero Data Retention. `previous_response_id` for short-lived threads where convenience wins and 30-day storage is acceptable. A Conversation for long-lived threads across sessions or devices, if "until deleted" storage on the provider's side is acceptable to your privacy review.

## Code

Python 3.10 or newer, standard library only; all files go in one folder. Everything was run with Python 3.13 and the outputs below are what that run printed. The stand-in (collapsed, it is plumbing) implements the documented semantics listed in its docstring on a **virtual clock** so that retention can be tested in milliseconds; its model is a script that reports what it was shown. Token counts are the stand-in's fake word counts.

<details>
<summary>standin_responses.py: a local stand-in for /v1/responses, /v1/conversations and a minimal /v1/chat/completions (plumbing)</summary>

```python
"""standin_responses.py - a LOCAL STAND-IN that mimics the DOCUMENTED shape and state semantics of
POST /v1/responses (+ GET/DELETE /v1/responses/{id}, POST /v1/conversations, GET .../items) and a minimal
POST /v1/chat/completions. The "model" behind it is a script, not a real model. Standard library only.

Documented semantics it emulates (OpenAI docs, checked 26 Oct 2026):
  * input is a string or a list of typed items; output is a list of typed items
  * previous_response_id: the earlier response's input+output items are prepended; its `instructions` are NOT
  * conversation: the conversation's items are prepended, and this response's items are appended afterwards
  * previous_response_id cannot be combined with conversation
  * store defaults to true; stored responses are kept (here: exactly 30 days, on a virtual clock);
    store=false responses cannot be retrieved or chained; Zero Data Retention forces store=false
  * every earlier input token in the context is billed again as input tokens
The raw JSON has NO `output_text` field (that is an SDK-only convenience)."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_TIME = 1_700_000_000
DAY = 86_400


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass


def err(status, message, param=None, code=None):
    return status, {"error": {"message": message, "type": "invalid_request_error", "param": param, "code": code}}


def message_item(role, text):
    kind = "output_text" if role == "assistant" else "input_text"
    return {"type": "message", "role": role, "content": [{"type": kind, "text": text}]}


def text_of(item):
    c = item.get("content")
    return c if isinstance(c, str) else "".join(p.get("text", "") for p in c or [])


class StandInResponses:
    def __init__(self, api_key):
        self.api_key = api_key
        self.clock = 0.0                 # virtual seconds; tests advance it to simulate retention
        self.zdr = False                 # simulate an organization with Zero Data Retention
        self.responses, self.conversations = {}, {}
        self.seen = []                   # what the scripted model was shown on each call: [(role, text), ...]
        self.counter, self._server = 0, None

    # ---- HTTP plumbing ---------------------------------------------------------------------------
    def start(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _serve(self, method):
                raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                if self.headers.get("Authorization") != f"Bearer {outer.api_key}":
                    status, body = err(401, "Incorrect API key provided.")
                else:
                    try:
                        status, body = outer.route(method, self.path, json.loads(raw) if raw else {})
                    except ValueError:
                        status, body = err(400, "Body is not valid JSON.")
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = lambda self: self._serve("GET")        # noqa: E731
            do_POST = lambda self: self._serve("POST")      # noqa: E731
            do_DELETE = lambda self: self._serve("DELETE")  # noqa: E731

        self._server = QuietServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return self

    @property
    def base_url(self):
        return f"http://127.0.0.1:{self._server.server_address[1]}/v1"

    def stop(self):
        self._server.shutdown()
        self._server.server_close()

    def route(self, method, path, body):
        path = path.split("?")[0].removeprefix("/v1")
        parts = path.strip("/").split("/")
        if method == "POST" and path == "/responses":
            return self.create_response(body)
        if method == "POST" and path == "/chat/completions":
            return self.create_chat(body)
        if parts[0] == "responses" and len(parts) == 2 and method in ("GET", "DELETE"):
            rec = self._lookup(parts[1])
            if rec is None:
                return err(404, f"Response with id '{parts[1]}' not found.", param="response_id")
            if method == "GET":
                return 200, rec["response"]
            del self.responses[parts[1]]
            return 200, {"id": parts[1], "object": "response.deleted", "deleted": True}
        if method == "POST" and path == "/conversations":
            self.counter += 1
            cid = f"conv_standin_{self.counter:04d}"
            self.conversations[cid] = [self._canon(i) for i in body.get("items") or []]
            return 200, {"id": cid, "object": "conversation", "metadata": {}, "created_at": self._now()}
        if parts[0] == "conversations" and len(parts) == 3 and parts[2] == "items" and method == "GET":
            if parts[1] not in self.conversations:
                return err(404, "Conversation not found.", param="conversation_id")
            return 200, {"object": "list", "data": self.conversations[parts[1]]}
        return err(404, "Unknown URL (stand-in).")

    # ---- the scripted model ----------------------------------------------------------------------
    def _now(self):
        return int(BASE_TIME + self.clock)

    def _lookup(self, rid):
        rec = self.responses.get(rid)
        return rec if rec and self.clock < rec["expires_at"] else None

    @staticmethod
    def _canon(item):
        if item.get("type", "message") == "message":
            return message_item(item["role"], text_of(item))
        return item

    def _run_model(self, view):
        """view: list of (role, text). Returns reply text. The reply reports what the 'model' was shown."""
        self.seen.append(list(view))
        instr = next((t for r, t in view if r in ("developer", "system")), None)
        users = [t for r, t in view if r == "user"]
        return (f"I see {len(view)} message(s); instructions: {instr[:14] if instr else 'none'}; "
                f"first user: '{users[0][:20]}'; last user: '{users[-1][:20]}'.")

    def create_response(self, req):
        allowed = {"model", "input", "instructions", "previous_response_id", "conversation", "store",
                   "max_output_tokens", "temperature", "top_p"}
        for name in req:
            if name not in allowed:
                return err(400, f"Unrecognized or unsupported request argument: '{name}'.", param=name)
        if not isinstance(req.get("model"), str):
            return err(400, "Missing required parameter: 'model'.", param="model")
        inp = req.get("input")
        if not inp:
            return err(400, "Missing required parameter: 'input'.", param="input")
        if req.get("max_output_tokens") is not None and req["max_output_tokens"] < 16:
            return err(400, "max_output_tokens must be at least 16.", param="max_output_tokens")
        prev, conv = req.get("previous_response_id"), req.get("conversation")
        if prev and conv:
            return err(400, "'previous_response_id' cannot be used together with 'conversation'.",
                       param="previous_response_id")
        new_items = [message_item("user", inp)] if isinstance(inp, str) else []
        for item in ([] if isinstance(inp, str) else inp):
            if item.get("type", "message") not in ("message", "reasoning"):
                return err(400, f"Unsupported item type '{item.get('type')}' (stand-in).", param="input")
            new_items.append(self._canon(item))
        cid = conv if isinstance(conv, str) else (conv or {}).get("id")
        if prev:
            rec = self._lookup(prev)
            if rec is None:
                return err(404, f"Previous response with id '{prev}' not found.", param="previous_response_id")
            base = rec["chain"]
        elif cid:
            if cid not in self.conversations:
                return err(404, f"Conversation '{cid}' not found.", param="conversation")
            base = self.conversations[cid]
        else:
            base = []
        context = base + new_items                                   # what the chain/conversation contributes
        view = [("developer", req["instructions"])] if req.get("instructions") else []
        view += [(i["role"], text_of(i)) for i in context if i["type"] == "message"]
        if not any(r == "user" for r, _ in view):
            return err(400, "The input contains no user message (stand-in).", param="input")
        text = self._run_model(view)
        words, cap = text.split(" "), req.get("max_output_tokens")
        status, details = "completed", None
        if cap and len(words) > cap:
            text, status, details = " ".join(words[:cap]), "incomplete", {"reason": "max_output_tokens"}
        self.counter += 1
        rid = f"resp_standin_{self.counter:04d}"
        output = []
        if "THINK" in next(t for r, t in reversed(view) if r == "user"):                                   # scripted: some models also emit reasoning items
            output.append({"id": f"rs_standin_{self.counter:04d}", "type": "reasoning", "summary": []})
        output.append({"id": f"msg_standin_{self.counter:04d}", "type": "message", "status": "completed",
                       "role": "assistant", "content": [{"type": "output_text", "text": text,
                                                         "annotations": [], "logprobs": []}]})
        in_tok = sum(len(t.split()) + 3 for _, t in view)            # the whole context is billed again
        out_tok = len(text.split())
        resp = {"id": rid, "object": "response", "created_at": self._now(), "status": status, "error": None,
                "incomplete_details": details, "instructions": req.get("instructions"), "model": req["model"],
                "output": output, "previous_response_id": prev, "conversation": {"id": cid} if cid else None,
                "parallel_tool_calls": True, "metadata": {}, "tools": [], "tool_choice": "auto",
                "temperature": req.get("temperature", 1.0), "top_p": req.get("top_p", 1.0),
                "usage": {"input_tokens": in_tok, "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0},
                          "output_tokens": out_tok, "output_tokens_details": {"reasoning_tokens": 0},
                          "total_tokens": in_tok + out_tok}}
        chain = context + [self._canon(o) if o["type"] == "message" else o for o in output]   # NOT the instructions
        store = req.get("store")
        store = True if store is None else store
        if cid:
            self.conversations[cid] = chain                          # items persist with the conversation
        elif store and not self.zdr:
            self.responses[rid] = {"response": resp, "chain": chain, "expires_at": self.clock + 30 * DAY}
        return 200, resp

    def create_chat(self, req):
        msgs = req.get("messages")
        if not isinstance(req.get("model"), str) or not msgs:
            return err(400, "'model' and 'messages' are required.", param="messages")
        view = [("developer" if m["role"] == "system" else m["role"], text_of(m)) for m in msgs]
        text = self._run_model(view)
        in_tok, out_tok = sum(len(t.split()) + 3 for _, t in view), len(text.split())
        self.counter += 1
        return 200, {"id": f"chatcmpl-standin-{self.counter:04d}", "object": "chat.completion", "created": self._now(),
                     "model": req["model"],
                     "choices": [{"index": 0, "message": {"role": "assistant", "content": text, "refusal": None},
                                  "finish_reason": "stop"}],
                     "usage": {"prompt_tokens": in_tok, "completion_tokens": out_tok, "total_tokens": in_tok + out_tok}}
```

</details>

### 1. The shape, three state modes, the documented rules, retention, ZDR and migration

```python
"""responses_demo.py - the Responses API shape and its state options, against a LOCAL STAND-IN
(scripted model, documented semantics). Needs standin_responses.py in the same folder."""
import json
import urllib.error
import urllib.request

from standin_responses import StandInResponses

KEY, MODEL = "demo-key-for-local-stand-in", "standin-small"
DAY = 86_400


class ApiError(Exception):
    def __init__(self, status, body):
        err = body.get("error", {})
        self.status, self.param = status, err.get("param")
        super().__init__(f"HTTP {status}: {err.get('message')}")


def call(base, method, path, payload=None):
    req = urllib.request.Request(base + path, method=method, data=None if payload is None else json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, json.loads(e.read())) from None


def output_text(resp):
    """Aggregate the text of all `message` items. The raw JSON has no `output_text` field (SDK-only helper)."""
    return "".join(part["text"] for item in resp["output"] if item["type"] == "message"
                   for part in item["content"] if part["type"] == "output_text")


TURNS = ["My name is Ada.", "I like tea.", "What is my name?"]
INSTR = "Be terse."


def run_client_held(base):
    """We keep the items and replay them; nothing needs to be stored on the server (store=False)."""
    history, usage = [], []
    for text in TURNS:
        history.append({"role": "user", "content": text})
        r = call(base, "POST", "/responses", {"model": MODEL, "instructions": INSTR, "input": history, "store": False})
        history += r["output"]                               # replay the output items, as the docs' example does
        usage.append(r["usage"]["input_tokens"])
    return output_text(r), usage


def run_chained(base):
    """The server holds the items; we send only the new input and the previous response id."""
    prev, usage = None, []
    for text in TURNS:
        payload = {"model": MODEL, "instructions": INSTR, "input": text}
        if prev:
            payload["previous_response_id"] = prev
        r = call(base, "POST", "/responses", payload)
        prev = r["id"]
        usage.append(r["usage"]["input_tokens"])
    return output_text(r), usage


def run_conversation(base):
    """A durable conversation object holds the items."""
    conv = call(base, "POST", "/conversations", {})
    usage = []
    for text in TURNS:
        r = call(base, "POST", "/responses", {"model": MODEL, "instructions": INSTR, "input": text,
                                              "conversation": conv["id"]})
        usage.append(r["usage"]["input_tokens"])
    return output_text(r), usage


class ResilientChat:
    """Prefer server-held state, but keep our own log so a vanished previous response is not fatal."""

    def __init__(self, base):
        self.base, self.log, self.prev, self.fallbacks = base, [], None, 0

    def ask(self, text):
        self.log.append({"role": "user", "content": text})
        common = {"model": MODEL, "instructions": INSTR, "store": True}
        resp = None
        if self.prev:
            try:
                resp = call(self.base, "POST", "/responses", {**common, "input": text, "previous_response_id": self.prev})
            except ApiError as e:
                if e.status != 404:
                    raise
                self.fallbacks += 1                      # the server forgot: rebuild the context from our own log
        if resp is None:
            resp = call(self.base, "POST", "/responses", {**common, "input": self.log})
        self.log += resp["output"]
        self.prev = resp["id"]
        return resp


def chat_to_responses(body, use_instructions=True):
    """Translate a TEXT-ONLY chat request into a Responses request; refuse what has no documented mapping."""
    if "n" in body:
        raise ValueError("n: Responses returns one generation; make separate requests")
    for name in ("response_format", "tools", "tool_choice", "functions"):
        if name in body:
            raise ValueError(f"{name}: the shape differs (text.format / tool definitions); migrate it by hand")
    for name in ("stop", "seed", "frequency_penalty", "presence_penalty", "logit_bias", "logprobs"):
        if name in body:
            raise ValueError(f"{name}: no top-level counterpart in the Responses request schema; decide what to do")
    msgs, instructions = list(body["messages"]), None
    if use_instructions:
        k = 0
        while k < len(msgs) and msgs[k]["role"] in ("system", "developer"):
            k += 1
        instructions = "\n\n".join(m["content"] for m in msgs[:k]) or None
        msgs = msgs[k:]
    if any(not isinstance(m["content"], str) for m in msgs):
        raise ValueError("only plain-text messages are handled here")
    out = {"model": body["model"], "input": msgs}
    if instructions:
        out["instructions"] = instructions
    if body.get("max_completion_tokens") is not None:
        if body["max_completion_tokens"] < 16:
            raise ValueError("max_output_tokens has a documented minimum of 16")
        out["max_output_tokens"] = body["max_completion_tokens"]
    for name in ("temperature", "top_p", "store"):
        if name in body:
            out[name] = body[name]
    return out


def main():
    server = StandInResponses(KEY).start()
    base = server.base_url
    try:
        print("== 1. one call, and the typed output")
        r = call(base, "POST", "/responses", {"model": MODEL, "instructions": INSTR, "input": "Say hi."})
        print("top-level keys:", sorted(r))
        print("id:", r["id"], "| object:", r["object"], "| status:", r["status"], "| 'output_text' in raw JSON:", "output_text" in r)
        print("output item types:", [i["type"] for i in r["output"]], "| text:", output_text(r))
        r = call(base, "POST", "/responses", {"model": MODEL, "input": "THINK about it."})
        print("another call, output item types:", [i["type"] for i in r["output"]])
        try:
            r["output"][0]["content"][0]["text"]
        except KeyError as e:
            print("output[0].content[0].text ->", type(e).__name__, e, "(do not assume the first item is the message)")
        print("aggregated text:", output_text(r))

        print("\n== 2. the same 3-turn conversation, three ways to hold the state")
        results = {}
        for name, fn in (("client-held", run_client_held), ("previous_response_id", run_chained), ("conversation", run_conversation)):
            start = len(server.seen)
            text, usage = fn(base)
            results[name] = (text, usage, server.seen[start:])
            print(f"{name:<21} input_tokens per turn {usage}")
        views = [v[2] for v in results.values()]
        print("last reply (client-held):", results["client-held"][0])
        print("model saw identical contexts in all three modes:", views[0] == views[1] == views[2])
        print("same input_tokens in all three modes:", results["client-held"][1] == results["previous_response_id"][1] == results["conversation"][1])

        print("\n== 3. the documented rules")
        a = call(base, "POST", "/responses", {"model": MODEL, "instructions": INSTR, "input": "My name is Ada."})
        b = call(base, "POST", "/responses", {"model": MODEL, "previous_response_id": a["id"], "input": "What is my name?"})
        print("instructions are not carried over :", output_text(b))
        c = call(base, "POST", "/responses", {"model": MODEL, "previous_response_id": a["id"], "input": "I like tea."})
        print("fork from the same response       :", output_text(c))
        s = call(base, "POST", "/responses", {"model": MODEL, "input": "Do not keep me.", "store": False})
        for label, path_or_payload in (("GET a store=false response", None), ("chain from it", {"previous_response_id": s["id"]})):
            try:
                if path_or_payload is None:
                    call(base, "GET", "/responses/" + s["id"])
                else:
                    call(base, "POST", "/responses", {"model": MODEL, "input": "hi", **path_or_payload})
            except ApiError as e:
                print(f"{label:<34}: {e}")
        try:
            call(base, "POST", "/responses", {"model": MODEL, "input": "hi", "previous_response_id": a["id"], "conversation": "conv_x"})
        except ApiError as e:
            print("previous_response_id + conversation:", e)
        call(base, "DELETE", "/responses/" + c["id"])
        try:
            call(base, "POST", "/responses", {"model": MODEL, "input": "hi", "previous_response_id": c["id"]})
        except ApiError as e:
            print("chain from a deleted response     :", e.status)

        print("\n== 4. retention: 31 days later")
        conv = call(base, "POST", "/conversations", {})
        call(base, "POST", "/responses", {"model": MODEL, "input": "Remember the word kiwi.", "conversation": conv["id"]})
        server.clock += 31 * DAY
        for label, payload in (("previous_response_id", {"previous_response_id": a["id"]}), ("conversation", {"conversation": conv["id"]})):
            try:
                r = call(base, "POST", "/responses", {"model": MODEL, "input": "What was the word?", **payload})
                print(f"{label:<21}: ok, the model saw {len(server.seen[-1])} messages")
            except ApiError as e:
                print(f"{label:<21}: {e}")
        print("client-held state       : always works; the items are in our own database")

        print("\n== 5. Zero Data Retention forces store=false, so a chain breaks; fall back to our own log")
        server.zdr = True
        chat = ResilientChat(base)
        for text in TURNS:
            chat.ask(text)
        print("fallbacks to full replay:", chat.fallbacks, "| the model still saw", len(server.seen[-1]), "messages on the last call")
        server.zdr = False

        print("\n== 6. migrating a chat request")
        chat_body = {"model": MODEL, "max_completion_tokens": 200, "messages": [
            {"role": "developer", "content": INSTR}, {"role": "user", "content": "My name is Ada."},
            {"role": "assistant", "content": "Hi Ada."}, {"role": "user", "content": "What is my name?"}]}
        old = call(base, "POST", "/chat/completions", chat_body)
        for use_instr in (True, False):
            new_body = chat_to_responses(chat_body, use_instructions=use_instr)
            new = call(base, "POST", "/responses", new_body)
            print(f"use_instructions={use_instr!s:<5} keys={sorted(new_body)} same text: "
                  f"{old['choices'][0]['message']['content'] == output_text(new)}, "
                  f"same tokens: {old['usage']['prompt_tokens'] == new['usage']['input_tokens']}")
        for bad in ({"n": 2}, {"stop": ["x"]}, {"max_completion_tokens": 5}):
            try:
                chat_to_responses({**chat_body, **bad})
            except ValueError as e:
                print("refused:", e)
    finally:
        server.stop()


if __name__ == "__main__":
    main()
```

Verified output:

```
== 1. one call, and the typed output
top-level keys: ['conversation', 'created_at', 'error', 'id', 'incomplete_details', 'instructions', 'metadata', 'model', 'object', 'output', 'parallel_tool_calls', 'previous_response_id', 'status', 'temperature', 'tool_choice', 'tools', 'top_p', 'usage']
id: resp_standin_0001 | object: response | status: completed | 'output_text' in raw JSON: False
output item types: ['message'] | text: I see 2 message(s); instructions: Be terse.; first user: 'Say hi.'; last user: 'Say hi.'.
another call, output item types: ['reasoning', 'message']
output[0].content[0].text -> KeyError 'content' (do not assume the first item is the message)
aggregated text: I see 1 message(s); instructions: none; first user: 'THINK about it.'; last user: 'THINK about it.'.

== 2. the same 3-turn conversation, three ways to hold the state
client-held           input_tokens per turn [12, 40, 68]
previous_response_id  input_tokens per turn [12, 40, 68]
conversation          input_tokens per turn [12, 40, 68]
last reply (client-held): I see 6 message(s); instructions: Be terse.; first user: 'My name is Ada.'; last user: 'What is my name?'.
model saw identical contexts in all three modes: True
same input_tokens in all three modes: True

== 3. the documented rules
instructions are not carried over : I see 3 message(s); instructions: none; first user: 'My name is Ada.'; last user: 'What is my name?'.
fork from the same response       : I see 3 message(s); instructions: none; first user: 'My name is Ada.'; last user: 'I like tea.'.
GET a store=false response        : HTTP 404: Response with id 'resp_standin_0016' not found.
chain from it                     : HTTP 404: Previous response with id 'resp_standin_0016' not found.
previous_response_id + conversation: HTTP 400: 'previous_response_id' cannot be used together with 'conversation'.
chain from a deleted response     : 404

== 4. retention: 31 days later
previous_response_id : HTTP 404: Previous response with id 'resp_standin_0013' not found.
conversation         : ok, the model saw 3 messages
client-held state       : always works; the items are in our own database

== 5. Zero Data Retention forces store=false, so a chain breaks; fall back to our own log
fallbacks to full replay: 2 | the model still saw 6 messages on the last call

== 6. migrating a chat request
use_instructions=True  keys=['input', 'instructions', 'max_output_tokens', 'model'] same text: True, same tokens: True
use_instructions=False keys=['input', 'max_output_tokens', 'model'] same text: True, same tokens: True
refused: n: Responses returns one generation; make separate requests
refused: stop: no top-level counterpart in the Responses request schema; decide what to do
refused: max_output_tokens has a documented minimum of 16
```

What to notice:

- **Section 1.** The raw JSON has no `output_text` field, a response can start with a `reasoning` item, and `output[0].content[0].text` raises `KeyError`. `output_text()` joins the text parts instead.
- **Section 2 is the equivalence test.** Client-held replay, `previous_response_id` and a Conversation all show the scripted model the same context on every turn (`True`), and the billed `input_tokens` are identical ([12, 40, 68]). The state moved; the prompt did not get smaller.
- **Section 3.** With `previous_response_id`, the second turn shows "instructions: none" because they were not re-sent. A fork sees the shared history but not its sibling. A `store=false` response cannot be read or chained from, and the two options cannot be combined.
- **Section 4.** After 31 days on the virtual clock the chained response is gone, the Conversation still works, and the client-held log never depended on the server. The stand-in expires responses at exactly 30 days, while the docs promise only "at least 30 days".
- **Section 5.** With Zero Data Retention simulated, every chain attempt fails with 404 and `ResilientChat` rebuilds the context from its own log (2 fallbacks in 3 turns); the model still saw all 6 messages on the last call.
- **Section 6.** The translator maps a text-only chat request to a Responses request in both styles (instructions or message items); the scripted model gives the same text and the same token count through both endpoints. It refuses what the docs do not map one-to-one.

### 2. Compare the two request schemas (needs network)

```python
"""schema_diff.py - which request fields exist in Chat Completions, in Responses, or in both (needs network)."""
import json
import textwrap
import urllib.request

# Pinned to one commit of github.com/openai/openai-openapi so the output reproduces; `main` moves.
URL = "https://raw.githubusercontent.com/openai/openai-openapi/8243cc8fa6f04430fb1f1a6a2cb926fbeb4f7f26/openapi.json"
with urllib.request.urlopen(URL, timeout=60) as r:
    SCHEMAS = json.load(r)["components"]["schemas"]


def request_fields(name):
    """Property names of a request schema, following $ref and allOf."""
    node = SCHEMAS[name]
    names = set(node.get("properties", {}))
    for part in node.get("allOf", []):
        names |= request_fields(part["$ref"].rsplit("/", 1)[1]) if "$ref" in part else set(part.get("properties", {}))
    return names


chat, resp = request_fields("CreateChatCompletionRequest"), request_fields("CreateResponse")
for label, names in (("in both", chat & resp), ("only in Chat Completions", chat - resp), ("only in Responses", resp - chat)):
    print(textwrap.fill(f"{label}: " + ", ".join(sorted(names)), width=110, subsequent_indent="    "), "\n")
```

Verified output:

```
in both: metadata, model, moderation, parallel_tool_calls, prompt_cache_key, prompt_cache_options,
    prompt_cache_retention, safety_identifier, service_tier, store, stream, stream_options, temperature,
    tool_choice, tools, top_logprobs, top_p, user 

only in Chat Completions: audio, frequency_penalty, function_call, functions, logit_bias, logprobs,
    max_completion_tokens, max_tokens, messages, modalities, n, prediction, presence_penalty,
    reasoning_effort, response_format, seed, stop, verbosity, web_search_options 

only in Responses: access_programs, background, context_management, conversation, include, input,
    instructions, max_output_tokens, max_tool_calls, previous_response_id, prompt, reasoning, text, truncation 
```

This is the source of the "no top-level field" rows in the mapping table. `logprobs` is in the Chat-only list, but the Responses schema has `top_logprobs` and an `include` field (whose documented values include `message.output_text.logprobs`), so log probabilities are not simply missing; they are requested differently. Re-run it against the current `main` branch before relying on it.

> [!example] The same three state modes with the official SDK. **NOT EXECUTED (needs the `openai` package and a real API key).** Method and parameter names were checked against the `openai-python` README and its `api.md` files fetched on 26 Oct 2026 (`client.responses.create`, `.retrieve`, `.delete`; `client.conversations.create`, `.delete`, `.items.list`, `.items.delete`) and against the docs' conversation-state examples. No output is shown because none was produced. `OPENAI_MODEL` is my own variable name for a model id you looked up on the models page.

```python
import os
from openai import OpenAI

client = OpenAI()                       # reads OPENAI_API_KEY
MODEL, INSTR = os.environ["OPENAI_MODEL"], "Be terse."

# 1) client-held state: replay the items yourself, store nothing on the server
history = [{"role": "user", "content": "My name is Ada."}]
r1 = client.responses.create(model=MODEL, instructions=INSTR, input=history, store=False)
history += r1.output                    # keep every output item, including reasoning items
history.append({"role": "user", "content": "What is my name?"})
r2 = client.responses.create(model=MODEL, instructions=INSTR, input=history, store=False)
print(r2.output_text)

# 2) server-held state via previous_response_id (instructions must be sent again)
a = client.responses.create(model=MODEL, instructions=INSTR, input="My name is Ada.")
b = client.responses.create(model=MODEL, instructions=INSTR, previous_response_id=a.id,
                            input=[{"role": "user", "content": "What is my name?"}])

# 3) a durable Conversation
conv = client.conversations.create()
c = client.responses.create(model=MODEL, instructions=INSTR, input="My name is Ada.", conversation=conv.id)

# cleaning up is your job
client.responses.delete(a.id)
```

## Visual diagram

```
  Same conversation, three places to keep the state (turn 3 shown)

  CLIENT-HELD                    PREVIOUS_RESPONSE_ID               CONVERSATION
  ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
  │ you store the items     │    │ the server stores items │    │ the server stores items │
  │ [u1 a1 u2 a2 u3]        │    │ of resp_1, resp_2 ...   │    │ in conv_1               │
  └────────────┬────────────┘    └────────────┬────────────┘    └────────────┬────────────┘
               │ input = all items            │ input = [u3]                 │ input = [u3]
               │ store = false is fine        │ previous_response_id         │ conversation = conv_1
               ▼                              ▼ = resp_2                     ▼
  ┌───────────────────────────────────────────────────────────────────────────────────────┐
  │ the model is shown:  instructions + u1 a1 u2 a2 u3   (identical in all three modes)   │
  │ usage.input_tokens counts ALL of it, so the bill is the same in all three modes       │
  └───────────────────────────────────────────────────────────────────────────────────────┘
  instructions: send them on EVERY call. previous_response_id does not carry them over.

  Lifetime of the stored state (per the docs, checked 26 Oct 2026)
  client-held           yours: your database, your retention rules, portable to any provider
  previous_response_id  stored for at least 30 days by default (store=true); store=false: not stored
                        Zero Data Retention organizations: store is always treated as false
  conversation          items kept until deleted, no 30-day TTL; not Zero-Data-Retention eligible

  Reading a response                      Chain breaks (HTTP 404 in the stand-in)
  output = [ reasoning, message,          previous_response_id of a store=false response
             function_call, ... ]         previous_response_id older than the retention window
  message.content = [ output_text,        previous_response_id of a deleted response
                      refusal ]           Zero Data Retention forced store=false
  text = join(all output_text parts)      -> keep your own log; replay it when the chain breaks
```

## Practice

### 1. Extract text without trusting the shape

Write `extract(resp)` returning `(text, problems)` for a raw Responses body: join all `output_text` parts of all `message` items, skip other item types, and report refusals, `incomplete` status (with the reason) and `failed` status. Test it on six hand-written bodies.

<details><summary>Answer</summary>

```python
def extract(resp):
    """Return (text, problems) from a raw Responses body (a plain dict)."""
    texts, problems = [], []
    for item in resp.get("output", []):
        if item.get("type") != "message":                 # reasoning, tool calls, ... are not text
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text":
                texts.append(part["text"])
            elif part.get("type") == "refusal":
                problems.append("refusal: " + part["refusal"])
    if resp.get("status") == "incomplete":
        problems.append("incomplete: " + str((resp.get("incomplete_details") or {}).get("reason")))
    if resp.get("status") == "failed":
        problems.append("failed: " + str((resp.get("error") or {}).get("code")))
    return "".join(texts), problems

def msg(*parts):
    return {"type": "message", "role": "assistant", "content": list(parts)}
text = lambda t: {"type": "output_text", "text": t, "annotations": [], "logprobs": []}   # noqa: E731

cases = {
    "normal": {"status": "completed", "output": [msg(text("Paris."))]},
    "reasoning first": {"status": "completed", "output": [{"type": "reasoning", "summary": []}, msg(text("Paris."))]},
    "two text parts": {"status": "completed", "output": [msg(text("Par"), text("is."))]},
    "incomplete": {"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"},
                   "output": [msg(text("The capital of"))]},
    "refusal": {"status": "completed", "output": [msg({"type": "refusal", "refusal": "I can't help with that."})]},
    "failed": {"status": "failed", "error": {"code": "server_error", "message": "x"}, "output": []},
}
for name, body in cases.items():
    print(f"{name:<16}", extract(body))
```

Output:

```
normal           ('Paris.', [])
reasoning first  ('Paris.', [])
two text parts   ('Paris.', [])
incomplete       ('The capital of', ['incomplete: max_output_tokens'])
refusal          ('', ["refusal: I can't help with that."])
failed           ('', ['failed: server_error'])
```

The order of items and the number of text parts do not matter, and a truncated answer comes back with its text and a problem, so the caller can decide. This is what the SDK's `output_text` helper does for the happy path, minus the problem reporting.

</details>

### 2. Prove that deleting works

Write `forget(base, response_ids)` that deletes stored responses and then verifies, by trying to read each one, that none is still readable. Run it against the stand-in with three responses of one user and one of another.

<details><summary>Answer</summary>

```python
from responses_demo import ApiError, MODEL, call          # responses_demo.py and standin_responses.py from the Code section
from standin_responses import StandInResponses

def forget(base, response_ids):
    """Delete stored responses and verify they are really gone. Returns (deleted, still_readable)."""
    deleted = 0
    for rid in response_ids:
        call(base, "DELETE", "/responses/" + rid)
        deleted += 1
    still = []
    for rid in response_ids:
        try:
            call(base, "GET", "/responses/" + rid)
            still.append(rid)
        except ApiError as e:
            assert e.status == 404
    return deleted, still

server = StandInResponses("demo-key-for-local-stand-in").start()
try:
    base = server.base_url
    ids = [call(base, "POST", "/responses", {"model": MODEL, "input": f"private note {i}"})["id"] for i in range(3)]
    kept = call(base, "POST", "/responses", {"model": MODEL, "input": "another user's note"})["id"]
    print("readable before:", [call(base, "GET", "/responses/" + i)["id"] for i in ids])
    print("forget ->", forget(base, ids))
    print("the other user's response still readable:", call(base, "GET", "/responses/" + kept)["id"] == kept)
finally:
    server.stop()
```

Output (run in the folder with `responses_demo.py`):

```
readable before: ['resp_standin_0001', 'resp_standin_0002', 'resp_standin_0003']
forget -> (3, [])
the other user's response still readable: True
```

The verification step is the point: a delete you did not check is a hope, not a deletion. Against the real service, remember the other places data can live (abuse-monitoring logs, conversations and their items, your own copies), and re-read the reference for each delete endpoint, because the conversation delete is documented as leaving items.

</details>

### 3. A safe chaining policy

The docs promise "at least 30 days", not an exact expiry. Write a policy that chains from a previous response only while it is younger than the documented floor minus a margin, and otherwise replays your local log (or tells the user the thread is lost if you have no log).

<details><summary>Answer</summary>

```python
DOCS_MINIMUM_DAYS = 30        # the docs: stored "for at least 30 days" -- a floor, not an exact expiry

def chain_is_safe(age_days, margin_days=5):
    """Only chain from a response younger than the documented floor minus a margin."""
    return age_days < DOCS_MINIMUM_DAYS - margin_days

def next_request(age_days, local_log_available):
    if chain_is_safe(age_days):
        return "previous_response_id=<id>, input=<new message only>"
    if local_log_available:
        return "input=<full local log>, no previous_response_id (this starts a fresh chain)"
    return "cannot continue: start a new conversation and tell the user"

print(f"{'age (days)':>10}  decision")
for age in (1, 20, 24, 25, 29, 31, 90):
    print(f"{age:>10}  {next_request(age, local_log_available=True)}")
print(f"{'90 (no log)':>10}  {next_request(90, local_log_available=False)}")
```

Output:

```
age (days)  decision
         1  previous_response_id=<id>, input=<new message only>
        20  previous_response_id=<id>, input=<new message only>
        24  previous_response_id=<id>, input=<new message only>
        25  input=<full local log>, no previous_response_id (this starts a fresh chain)
        29  input=<full local log>, no previous_response_id (this starts a fresh chain)
        31  input=<full local log>, no previous_response_id (this starts a fresh chain)
        90  input=<full local log>, no previous_response_id (this starts a fresh chain)
90 (no log)  cannot continue: start a new conversation and tell the user
```

Replaying starts a fresh chain, so the next response is a new 30-day clock. The margin protects against clock skew and against the vagueness of "at least". The policy keys on the age of the newest response, and I did not find a documented statement about whether older members of a chain must also still exist.

</details>

### Checkpoint quiz

1. Where is the model's text in a Responses body, and why is `output[0].content[0].text` unsafe?
2. You use `previous_response_id` and the second answer ignores your formatting instructions. What is the likely cause?
3. Does `previous_response_id` reduce the input tokens you are billed for? What does the stand-in's test show?
4. Name three ways a `previous_response_id` can stop working, and the fallback that makes each harmless.
5. A user asks you to delete their data. List the places a Responses-based application may hold it, according to the docs.

<details><summary>Answers</summary>

1. In the `output_text` parts of the `message` items in `output`. The array can start with other items (reasoning, tool calls), so a fixed index can hit an item that has no `content`; join the text parts of all message items.
2. `instructions` are not carried over with `previous_response_id`; they have to be sent on every call.
3. No. The docs say all previous input tokens in the chain are billed as input tokens, and the demo shows identical `input_tokens` in all three modes.
4. The response was created with `store=false`; it is older than the retention window (30 days or more); it was deleted; Zero Data Retention forced `store=false`. The fallback is to keep your own log and replay it as `input` without `previous_response_id`.
5. Your own database and logs; stored responses (30 days or more, deletable); Conversations and their items (until deleted, items have their own delete); abuse-monitoring logs (up to 30 days); third parties such as MCP servers; plus prompt-caching state with a short expiry.

</details>

> [!check]
> - I can explain how Responses relates to Chat Completions and quote the docs' recommendation.
> - I can extract text from `output` without assuming its position.
> - I can hold state three ways and show the model sees the same context in each.
> - I can list the documented rules: instructions, billing, exclusivity, `store`, retention, Zero Data Retention.
> - I can design a fallback so server-side state disappearing is not an outage.
> - I can say where data may live and how to delete it, with the caveats the docs state.
> - I can translate a text-only chat request and name what has no top-level counterpart.

## Project

Build a small `ChatService` with a swappable `StateBackend`: `ClientHeld` (SQLite, replays all items), `Chained` (`previous_response_id`) and `Conversation`. Each backend implements `ask(user_id, text)`, `forget(user_id)` and `storage_map(user_id)` (which says where that user's data currently lives). Run it against the stand-in with the virtual clock and prove: the model sees the same context under every backend; `Chained` falls back to replay when the stand-in drops a response (store false, expiry, deletion, ZDR); `forget` leaves nothing readable on the server and nothing in SQLite, including conversation items; a per-user cost report shows identical input tokens across backends. Add fault injection to the stand-in (a 429 with `Retry-After`, a 503, a timeout) and make the service retry only where retrying is safe. Finish with a one-page data-flow note for a privacy reviewer, quoting only what you verified in the docs. No code is given.

## Interview questions

> [!interview] Compare client-held state, `previous_response_id` and Conversations. When would you use each?

<details><summary>What a strong answer covers</summary>

- Same context shown to the model and the same input-token bill in all three; the difference is who stores the items and for how long (yours; at least 30 days by default; until deleted).
- Client-held: portability, trimming control, auditability, Zero Data Retention; the cost is that you build and secure the storage.
- Chained: convenience for short threads; `instructions` must be re-sent; breaks if the response was not stored, expired, was deleted, or under ZDR; needs a fallback.
- Conversations: long-lived threads across sessions; "until deleted", not ZDR eligible, and a documented caveat on deletion (items); verify deletion behaviour.

</details>

> [!interview] A privacy reviewer asks what is retained when your app calls the Responses API. How do you answer?

<details><summary>What a strong answer covers</summary>

- Distinguish training use (not used without opt-in, per the docs), abuse-monitoring logs (up to 30 days by default, even with `store=false`), application state (stored responses, at least 30 days when `store` is true or omitted; conversations until deleted), and third-party tool providers.
- Zero Data Retention changes endpoint behaviour (`store` forced to false) and has eligibility limits; conversations are not eligible.
- Your own controls: explicit `store`, minimal prompts, a deletion path that you test, your own log with your own retention.
- Cites the docs with a date, says what is not known (for example exact expiry beyond "at least 30 days"), and does not give legal advice.

</details>

> [!interview] You are migrating a Chat Completions service to Responses. What changes in the code and what do you check before shifting traffic?

<details><summary>What a strong answer covers</summary>

- Endpoint and body: `messages` to `input` and `instructions`; `max_completion_tokens` to `max_output_tokens`; `response_format` to `text.format`; tool definition shape; streaming consumers to typed events.
- Output: read `output` items, aggregate text, handle refusal and incomplete status; `usage` field names change.
- Fields with no top-level counterpart (`n`, `stop`, `seed`, penalties, `logit_bias`) and what to do about each.
- State and retention decisions, `store` explicit; shadow traffic, comparing behaviour, latency, token usage and errors, as the migration checklist says; migrate one flow at a time.

</details>

## Common mistakes & troubleshooting

- **`KeyError` or `IndexError` reading `output[0]...`.** The first item is not the message. Aggregate the text parts of all `message` items.
- **A follow-up turn ignores your system prompt.** `instructions` were not re-sent with `previous_response_id`.
- **A 400 mentioning `previous_response_id` and `conversation`.** They cannot be combined; pick one.
- **A 404 on `previous_response_id` that worked yesterday.** The response was not stored, was deleted, aged out, or the organization is under Zero Data Retention. Keep your own log and replay it.
- **The bill did not shrink after adopting server-side state.** It does not: previous input tokens are billed again. Trim the context yourself (Module 01) or look at the provider's compaction options in the docs.
- **A Chat Completions request fails on `/responses`.** `messages`, `max_completion_tokens`, `response_format` and `n` are Chat names. Translate them (Code section 1, part 6) and read the field comparison.
- **A reasoning model loses its thread after a manual replay.** You dropped reasoning or tool items from the history. Replay every item in `output`.
- **Someone assumes `store=false` means nothing is kept.** Abuse-monitoring logs are documented with 30-day retention by default, and `store=false` alone is not documented as turning them off.
- **A deletion request is "done" but data remains.** Conversation deletion is documented as not deleting items; delete items, and verify.

## Further reading & sources

- [Migrate to the Responses API | OpenAI API](https://developers.openai.com/api/docs/guides/migrate-to-responses) - the official comparison of Chat Completions and Responses, the items model, the field mapping, the state options and the migration checklist quoted throughout.
- [Conversation state | OpenAI API](https://developers.openai.com/api/docs/guides/conversation-state) - manual state, `previous_response_id`, the Conversations API, the 30-day retention and billing statements.
- [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data) - training use, abuse-monitoring retention, Zero Data Retention, and the per-endpoint retention table used in the privacy section.
- [Create a model response | OpenAI API Reference](https://developers.openai.com/api/reference/resources/responses/methods/create) - the request and response reference for `/v1/responses`, including `input`, `instructions`, `previous_response_id`, `conversation` and `store`.
- [Delete a conversation | OpenAI API Reference](https://developers.openai.com/api/reference/resources/conversations/methods/delete) - the endpoint whose description states that items in the conversation will not be deleted.
- [Using tools | OpenAI API](https://developers.openai.com/api/docs/guides/tools) - the guide to the built-in tools that this module only names.
- [openai/openai-openapi: OpenAPI specification for the OpenAI API](https://github.com/openai/openai-openapi) - the spec that `schema_diff.py` reads; the final word on field names, statuses and item types.
- [openai/openai-python: The official Python library for the OpenAI API](https://github.com/openai/openai-python) - the SDK README and `api.md` files used to check the NOT EXECUTED snippet.

## Next

[Module 03: Streaming Responses](../03-streaming-responses/README.md)
