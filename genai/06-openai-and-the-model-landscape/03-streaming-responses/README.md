# Module 03: Streaming Responses

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**. [Module 00: The OpenAI API: Your First Call](../00-the-openai-api-your-first-call/README.md) made the first request, [Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md) covered that endpoint's request and response, and [Module 02: The Responses API and Statefulness](../02-the-responses-api-and-statefulness/README.md) covered the newer endpoint and its stored state. This module sends the same requests with `stream=true` and deals with what comes back: not one JSON document but a long-lived response made of small events.

After this module you can:

- explain why streaming improves *perceived* latency without making the model faster, and measure time to first token (TTFT) against total time;
- read the Server-Sent Events (SSE) wire format byte by byte, and write a parser that gives the same events no matter where the network cuts the stream;
- recognise the two documented event dialects (Chat Completions chunks and Responses typed events) and rebuild text and tool-call arguments from their deltas;
- say how a stream ended (complete, incomplete, failed, truncated, cancelled) and what that means for usage, retries and partial output.

Why it matters: every chat UI streams, and every production bug in a stream client is a boundary bug: a character split across two packets, a `[DONE]` that is not JSON, a connection that dies after the 200 status was already sent. All of them are reproduced and fixed below.

> [!note] How the claims here are sourced. Wire shapes, field names and rules come from the OpenAI OpenAPI spec (`openai/openai-openapi`, version `2.3.0`, last commit 24 Oct 2026), the Streaming, Function calling, Background mode, Latency optimization and Reasoning guides, and the `openai-python` README and source, all fetched and read on 26 Oct 2026; the SSE rules come from the WHATWG HTML Standard (last updated 26 Oct 2026). **No API call was made.** Every stream below is *synthetic*: written by hand in the documented shape and served by a local stand-in that mimics those shapes, with a scripted "model". The parsing, accumulation, cancellation, retry and timing logic is genuinely executed; no real-model output or behaviour is shown. The official docs are the source of truth and may have changed since.

## Concept

> [!key] Streaming turns one HTTP response into an ordered series of small events (SSE: `text/event-stream`, `data:` lines, a blank line after each event), so the first words can be shown while the rest is still being generated. Your client must parse that byte stream incrementally and independently of packet boundaries, rebuild complete text and tool-call arguments from the deltas, and check *how* the stream ended, because the HTTP status was already 200 before anything could go wrong.

## Explanation

### Why stream

A model produces text one token at a time (Track 01, [Module 15: Next-Token Prediction: From Logits to Probabilities](../../01-tokens-and-language-modeling/15-next-token-prediction-from-logits-to-probabilities/README.md)). Without streaming, the API waits for the last token and then sends one response. The streaming guide says so directly: by default "we generate the model's entire output before sending it back in a single HTTP response", and streaming "lets you start printing or processing the beginning of the model's output while it continues generating the full response".

Three durations describe what the user experiences:

- **Time to first token (TTFT)**: from sending the request to the first visible piece of text. It includes network time, any queueing, the model reading the prompt, and, for reasoning models, the time spent thinking before any visible output ([Module 05: Reasoning Models and Test-Time Compute](../05-reasoning-models-and-test-time-compute/README.md)).
- **Inter-token gap**: the time between later pieces.
- **Total time**: roughly `TTFT + (n_tokens - 1) x gap`.

Streaming does not shrink the total. It moves what the user sees to the front: with streaming the wait before something appears is TTFT, without it the wait is the total. The Latency optimization guide calls streaming "the single most effective approach" to making users wait less, and adds that once you account for the user reading, it genuinely reduces overall latency because "the user will finish reading a response sooner". The same guide suggests streaming to your back end and sending processed chunks to the front end when output needs moderation or translation first.

> [!model] A stream is one long HTTP response whose body is delivered in installments. The status line and headers arrive first, then the body trickles in, and the response is only "done" when the server says so in a form you can check.

Long outputs are where it matters most (block 5 prints the arithmetic with *illustrative* numbers): at the same TTFT, a 50-token answer and a 5,000-token answer feel completely different without streaming. Streaming also lets you stop early, show tool progress, and process the output in pieces.

### What streaming does not do

- **It does not change the model's work or the total time.** The same tokens are generated; you receive them sooner.
- **It makes moderation harder.** The guide warns that "partial completions may be more difficult to evaluate" and that moderation scores requested with a generation request "arrive after the full generated output is available", not with the partial deltas.
- **It moves failures.** By the time something breaks, the HTTP status (200) is already sent. Errors arrive as an `error` frame inside the stream, or as a connection that simply ends.
- **It costs a little extra on the wire.** Delta events carry a random `obfuscation` string by default, added "to normalize payload sizes as a mitigation to certain side-channel attacks"; `stream_options.include_obfuscation: false` removes it if you trust the network path. Your parser must ignore fields it does not know either way.

### The wire format: Server-Sent Events

SSE is an old, simple web standard. A streaming response has `Content-Type: text/event-stream` and a UTF-8 body made of lines. The WHATWG HTML Standard (section 9.2) fixes the rules, and every row below is one of them:

| Line | What the parser does |
|---|---|
| `data: X` | appends `X` to the event's data buffer; several `data:` lines are joined with `\n` |
| `event: T` | names the event; without it the event type is `message` |
| `id: X` | sets the last event ID (ignored if `X` contains a NUL character); it persists across events |
| `retry: N` | sets a reconnection time in milliseconds, only if `N` is all ASCII digits |
| `: anything` | a comment, ignored; servers send them as keep-alives |
| a blank line | **dispatches** the event, if its data buffer is not empty |
| any other `name: value` | ignored; field names are case-sensitive |

Around those rules: a line ends with LF, CR or CRLF (all three are legal, and nothing else ends a line); the text is UTF-8 and one leading byte-order mark is dropped; after the first `:` exactly one space is removed; a line with no colon is a field name with an empty value; and if the stream ends before the blank line, "the incomplete event is not dispatched". The standard also warns that proxies "known to, in certain cases, drop HTTP connections after a short timeout" are the reason for comment keep-alives, and that block buffering "can cause delays in event dispatch".

A blank line, not a packet boundary, is the event boundary. A single event can arrive split over several TCP packets, and one packet can hold several events. Everything in the next section follows from that.

### Two dialects at OpenAI

Both endpoints stream over SSE, with different event shapes. The table is from the OpenAPI spec and the guides (checked 26 Oct 2026):

| | Chat Completions | Responses |
|---|---|---|
| Frame | `data: {json}` only | `event: <type>` line plus `data: {json}` |
| JSON object | `chat.completion.chunk`: `id`, `object`, `created`, `model`, `choices[]`, `usage` | one typed event: `type`, `sequence_number`, plus type-specific fields |
| Text | `choices[i].delta.content`, a string piece | `response.output_text.delta` with `delta`, `item_id`, `output_index`, `content_index` |
| Tool call | `delta.tool_calls[]`: `index`, and optionally `id`, `type`, `function.name`, `function.arguments` | `response.output_item.added` (a `function_call` item), then `response.function_call_arguments.delta` events, then `.done` and `response.output_item.done` |
| End | `finish_reason` on the last content chunk, then the literal frame `data: [DONE]` | `response.completed`, `response.incomplete` or `response.failed`, each carrying the whole response |
| Usage | opt in with `stream_options: {"include_usage": true}` | `response.usage` inside the terminal event |
| Failure | a `data:` frame holding an object with an `error` field; the stream "may end without the marker" | an `error` event (`code`, `message`, `param`) |

Per the spec, the Chat Completions terminal frame is `data: [DONE]` followed by a blank line; "`[DONE]` is literal text, not a JSON chunk, and this frame has no `event: done` field". The Responses reference example ends with the `response.completed` frame and shows no `[DONE]`. A chat stream, as the spec's streaming example shows it (model name replaced by a placeholder):

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"model-a","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"model-a","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"model-a","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}

data: [DONE]
```

A Responses stream, condensed from the reference example (most fields left out):

```
event: response.created
data: {"type":"response.created","response":{"id":"resp_1","status":"in_progress","output":[]},"sequence_number":0}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"Hi","sequence_number":4,"logprobs":[]}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","usage":{"input_tokens":37,"output_tokens":11,"total_tokens":48}},"sequence_number":13}
```

The docs say to identify an event by its `type` property, and the `event:` line repeats it. A background-mode example in the guides also skips events of type `keepalive` when tracking a cursor, even though the OpenAPI event list I read does not include that type. So the rule is: **ignore event types you do not know**; do not crash on them.

### Parsing: three decisions

The parser in block 1 is about 100 lines. Almost all of its design is three decisions about *where the cuts may fall*.

1. **Work on bytes, not text.** The network hands you chunks that can end anywhere, including in the middle of a multi-byte character (a UTF-8 character such as an emoji is up to four bytes). Decoding each chunk separately raises an error or, with `errors="replace"`, silently corrupts the text.
2. **End lines only at CR, LF or CRLF, and remember a trailing CR.** Those bytes are ASCII, and ASCII bytes never appear inside a multi-byte UTF-8 character, so cutting lines first and decoding each complete line afterwards is safe. A chunk may also end exactly between the CR and the LF of a CRLF; the parser must treat the LF that follows as part of the same terminator, not as a second, blank line (which would dispatch an event early).
3. **Dispatch only on a blank line, and drop an unfinished event.** `close()` reports whether the stream stopped mid-event, which is how the client later tells "finished" from "cut off".

> [!pitfall] Three tempting shortcuts, all wrong. `chunk.decode()` per network chunk raises `UnicodeDecodeError` when a chunk ends inside a character. `str.splitlines()` also splits on U+2028, U+0085 and other characters that are legal inside a JSON string but are not SSE line endings. And `json.loads(event.data)` on the last chat frame raises, because `[DONE]` is not JSON. Block 2 reproduces the first two against the same fixtures and shows how many splits each one gets wrong.

### Accumulating deltas

A delta is a piece, not a snapshot. To rebuild the whole:

- **Text.** Append `delta.content` (Chat) or `delta` (Responses) in arrival order. Key by choice `index` when `n > 1`; key Responses text by `(output_index, content_index)`.
- **Tool calls.** The `arguments` of a call arrive as string fragments of a JSON document; you concatenate the strings and only then parse. In a Chat chunk each fragment carries an `index` (the only required field in the schema) that says which call it extends; `id`, `type` and `function.name` are optional in the schema (you will typically see them on a call's first fragment, but the schema does not promise it). The `openai-python` SDK's own accumulator (read in its source) concatenates every string field except `index` and `type`. In a Responses stream, `response.output_item.added` announces a function-call item with empty `arguments`, `response.function_call_arguments.delta` events extend it by `output_index`, and `response.function_call_arguments.done` carries the final string. The function-calling guide's own snippet does the same with a dict keyed by `output_index`.
- **Trust, then verify.** When a `.done` event gives the final value, compare it with your concatenation. They should agree; if they do not, you have a bug (or lost an event), and you should find out in a test, not in production.

> [!pitfall] The schema itself warns that "the model does not always generate valid JSON, and may hallucinate parameters not defined by your function schema. Validate the arguments in your code before calling your function." A half-received argument string is *always* invalid JSON. Never run a tool from a partial call; wait for the call to be complete, parse it, validate it. [Module 06: Function Calling Basics](../06-function-calling-basics/README.md) covers the tool loop.

### Usage in streams

- **Chat Completions** reports token usage only if asked: with `stream_options: {"include_usage": true}` an extra chunk "will be streamed before the `data: [DONE]` message", its `usage` shows totals "for the entire request", and its `choices` is "always an empty array". Every other chunk then has `usage: null`. Without the option there is no usage in the stream at all.
- **Responses** puts `usage` inside the response object of the terminal event (`response.completed` and friends), including `output_tokens_details.reasoning_tokens` (Module 05 reads it).
- **If the stream is interrupted or cancelled, you may not receive the final usage chunk.** The spec says exactly that. A stream that never finished has no authoritative token count on your side; log what you have and reconcile with the provider's usage reporting.

> [!pitfall] With `include_usage` the last chunk has an empty `choices` list, so the common snippet `chunk.choices[0].delta.content` raises `IndexError` on the final chunk. Guard with `if chunk.choices:`.

### How a stream ends: five outcomes

Do not treat "the loop finished" as "the answer is complete". The connection can end for several reasons:

| Outcome | How you know | What it means |
|---|---|---|
| **complete** | Chat: `[DONE]` seen and `finish_reason` is `stop` or `tool_calls`. Responses: `response.completed` | The model finished. Safe to use, to run tool calls, to store |
| **incomplete** | Chat: `finish_reason` is `length` or `content_filter`. Responses: `response.incomplete` with `incomplete_details.reason` | The server ended it on purpose (for example `max_output_tokens`). The text is real but cut off |
| **failed** | An `error` frame or event, or `response.failed` | The generation failed after streaming began |
| **truncated** | The connection ended with no terminal marker | A network or server fault. The spec: an interrupted stream "may end without the marker" |
| **cancelled** | You closed the connection | You chose to stop; there is no usage and no marker |

### Cancellation and disconnects

A client cancels a foreground stream by closing the connection. In the Python SDK, `Stream` objects support a context manager and `close()`, which "close the response and release the connection" (SDK source). The only *explicit* cancel call in the pages I read is `POST /v1/responses/{id}/cancel`, and the spec says "only responses created with the `background` parameter set to `true` can be cancelled". I found no statement in those pages about whether tokens generated after a client disconnects are billed or how soon generation stops, so treat that as unknown and check the provider's usage reporting.

The same problem repeats inside your own system. If your server streams to a browser and proxies an upstream model stream, a closed browser tab must close the upstream request too; otherwise you keep generating (and possibly paying for) tokens nobody reads. Block 6 shows the stand-in noticing a hung-up client and stopping early.

Keep partial output carefully. Partial **text** is a valid prefix and can be shown with a "stopped" marker. A partial **tool call** is not usable. A stored message should record its outcome next to its text.

### Retries and resuming

- **Before the first byte, retrying is ordinary.** A connection error, or an HTTP error status such as 429 or 5xx, arrives before any event. The SDK README says that connection errors, 408, 409, 429 and 5xx responses are retried by default, 2 times, with a short exponential backoff, and "requests are retried only when their body can be safely resent".
- **After events have been delivered, a blind retry is dangerous.** The README states that "stream consumption is not automatically retried, because replaying a request could duplicate output already delivered to your application." Worse, a new request generates a *new* answer (sampling is random), so you cannot splice it onto the old prefix. Block 6 shows `'Hello ' + 'Hello w...'`. The choices are to discard the partial text and start again (the user sees the text restart), or to use a resumable mechanism.
- **The documented resumable mechanism is background mode.** Create the response with `background: true` and `stream: true`, keep the `sequence_number` of the last event you handled as a cursor, and if the connection drops reconnect with `GET /v1/responses/{id}?stream=true&starting_after=<cursor>`. The guide notes that background mode currently has a higher TTFT than a synchronous request, and that SDK support for resuming was "coming soon" in the snippets I read; the documented route is the HTTP one. Keep-alive events must not advance the cursor.
- **SSE's own `Last-Event-ID` header** is part of the standard (the browser `EventSource` sends it when reconnecting), but the pages I read document `starting_after`, not `Last-Event-ID`, for OpenAI streams. Do not assume it is honoured.
- **Timeouts.** The SDK README gives a 10-minute default request timeout and says read timeouts during a stream raise `APITimeoutError` (other transport failures raise `APIConnectionError`). A streaming read timeout bounds the *gap between bytes*, which is why keep-alives exist.

## Code

Seven blocks. Save each under the name in its first comment, in one folder; later blocks import earlier ones. All of it uses only the standard library, and every output below was produced by running exactly this code with Python 3.13 on 26 Oct 2026.

### 1. The parser

```python
"""sse.py - an incremental Server-Sent Events parser, written from the WHATWG HTML Standard,
section 9.2.6 "Interpreting an event stream".

It works on BYTES, so a network chunk may end anywhere: inside a UTF-8 character, inside a line,
between a CR and its LF, or inside the byte-order mark.
"""
import re
from dataclasses import dataclass
from typing import List, Optional

BOM = b"\xef\xbb\xbf"
_EOL = re.compile(rb"\r\n|\r|\n")   # CRLF, lone CR, lone LF - nothing else ends an SSE line
_DIGITS = re.compile(r"[0-9]+")     # str.isdigit() would also accept a superscript two


@dataclass(frozen=True)
class SSEEvent:
    event: str          # "message" when the frame had no `event:` field
    data: str           # the `data:` lines joined with "\n"
    last_event_id: str  # "" until the server sends an `id:` field; it persists across events


class SSEParser:
    def __init__(self) -> None:
        self._buf = bytearray()
        self._at_start = True        # still waiting to learn whether the stream begins with a BOM
        self._skip_lf = False        # the last line ended with CR; an LF right after it is the same terminator
        self._data: List[str] = []
        self._event_type = ""
        self._last_id = ""
        self.retry_ms: Optional[int] = None   # a stream-level reconnection time, not a per-event field

    def feed(self, chunk: bytes) -> List[SSEEvent]:
        """Add bytes to the stream and return the events that became complete."""
        self._buf += chunk
        if self._at_start:
            if len(self._buf) < 3 and BOM.startswith(bytes(self._buf)):
                return []                          # these bytes could still turn out to be a BOM
            if self._buf.startswith(BOM):
                del self._buf[:3]
            self._at_start = False
        pos = 0
        if self._skip_lf and self._buf:
            if self._buf[0] == 0x0A:
                pos = 1
            self._skip_lf = False
        out: List[SSEEvent] = []
        while True:
            m = _EOL.search(self._buf, pos)
            if m is None:
                break
            line = bytes(self._buf[pos:m.start()])
            pos = m.end()
            if m.group() == b"\r" and pos == len(self._buf):
                self._skip_lf = True               # an LF may still be on its way in the next chunk
            # Lines are cut at ASCII bytes only (CR, LF), and those bytes never occur inside a
            # multi-byte UTF-8 character, so each complete line can be decoded on its own.
            event = self._line(line.decode("utf-8", errors="replace"))
            if event is not None:
                out.append(event)
        del self._buf[:pos]
        return out

    def close(self) -> bool:
        """Call when the connection ends. True means the stream stopped in the middle of an event
        (or of a line) and that unfinished event is discarded, as the standard requires."""
        truncated = bool(self._buf) or bool(self._data) or bool(self._event_type)
        self._buf.clear()
        self._data, self._event_type = [], ""
        return truncated

    def _line(self, line: str) -> Optional[SSEEvent]:
        if line == "":
            return self._dispatch()
        if line.startswith(":"):
            return None                            # a comment; servers use these as keep-alives
        name, colon, value = line.partition(":")   # no colon -> the whole line is the field name
        if colon and value.startswith(" "):
            value = value[1:]                      # exactly one leading space is dropped
        if name == "event":
            self._event_type = value
        elif name == "data":
            self._data.append(value)
        elif name == "id":
            if "\x00" not in value:
                self._last_id = value
        elif name == "retry":
            if _DIGITS.fullmatch(value):
                self.retry_ms = int(value)
        return None                                # unknown field names are ignored (and are case-sensitive)

    def _dispatch(self) -> Optional[SSEEvent]:
        if not self._data:                         # nothing buffered: no event, and the event type resets
            self._event_type = ""
            return None
        event = SSEEvent(self._event_type or "message", "\n".join(self._data), self._last_id)
        self._data, self._event_type = [], ""
        return event
```

### 2. Byte-exact fixtures, every split, a seeded fuzz, and two broken parsers

The fixtures are real bytes: four examples taken from the standard itself, CRLF and CR-only streams, a byte-order mark, an invalid UTF-8 byte, a JSON string containing U+2028 and U+0085, field edge cases, an unfinished final event, and chat and Responses streams in the documented shapes. Each is parsed whole, one byte at a time, at **every** possible 2-way split, and at 2,000 random multi-way splits (including empty chunks) with a fixed seed. The result must always be the same events.

```python
"""test_sse.py - byte-exact fixtures, every-offset splits, a seeded fuzz, and two deliberately broken parsers."""
import codecs
import json
import random

from sse import SSEEvent, SSEParser


def E(data, event="message", id=""):
    return SSEEvent(event, data, id)


# A chat.completion.chunk frame in the documented shape (synthetic: written by hand from the schema).
CHUNK = ('{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"model-a",'
         '"choices":[{"index":0,"delta":%s,"logprobs":null,"finish_reason":%s}]}')
CHAT = [CHUNK % ('{"role":"assistant","content":""}', "null"),
        CHUNK % ('{"content":"H\U000000e9llo"}', "null"),                  # the e-acute is 2 bytes in UTF-8
        CHUNK % ('{"content":" \U00004e16\U0000754c \U0001F642"}', "null"),  # CJK: 3 bytes each; emoji: 4 bytes
        CHUNK % ("{}", '"stop"'),
        '{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"model-a",'
        '"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":5,"total_tokens":14}}',
        "[DONE]"]
RESP = [("response.created", '{"type":"response.created","sequence_number":0}'),
        ("response.output_text.delta", '{"type":"response.output_text.delta","delta":"Hi","sequence_number":1}'),
        ("response.output_text.delta", '{"type":"response.output_text.delta","delta":" \U00002603","sequence_number":2}'),
        ("response.completed", '{"type":"response.completed","sequence_number":3}')]
SEP = "\U00002028"   # LINE SEPARATOR: legal inside JSON text, but str.splitlines() treats it as a line end
NEL = "\U00000085"   # NEXT LINE: same story

# name -> (raw bytes, expected events, expected retry_ms, expected "stopped mid-event")
FIXTURES = {
    "spec: three data lines": (b"data: YHOO\ndata: +2\ndata: 10\n\n", [E("YHOO\n+2\n10")], None, False),
    "spec: comment, ids, leading space":
        (b": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n\n",
         [E("first event", id="1"), E("second event"), E(" third event")], None, False),
    "spec: empty data blocks":
        (b"data\n\ndata\ndata\n\ndata:", [E(""), E("\n")], None, True),
    "spec: space after colon is optional": (b"data:test\n\ndata: test\n\n", [E("test"), E("test")], None, False),
    "CRLF line endings": (b"event: ping\r\ndata: 1\r\n\r\ndata: 2\r\n\r\n", [E("1", "ping"), E("2")], None, False),
    "CRLF, two data lines": (b"data: a\r\ndata: b\r\n\r\n", [E("a\nb")], None, False),
    "lone CR line endings": (b"data: a\r\rdata: b\r\r", [E("a"), E("b")], None, False),
    "mixed CRLF, CR, LF": (b"data: a\r\n\rdata: b\n\n", [E("a"), E("b")], None, False),
    "multi-byte UTF-8": ("data: h\U000000e9llo \U00004e16\U0000754c \U0001F642\n\n".encode(),
                         [E("h\U000000e9llo \U00004e16\U0000754c \U0001F642")], None, False),
    "byte-order mark first": (b"\xef\xbb\xbfdata: x\n\n", [E("x")], None, False),
    "invalid UTF-8 becomes U+FFFD": (b"data: a\xffb\n\n", [E("a\U0000fffdb")], None, False),
    "U+2028 and U+0085 inside JSON text":
        (("data: " + json.dumps({"t": "a" + SEP + "b" + NEL + "c"}, ensure_ascii=False) + "\n\n").encode(),
         [E('{"t": "a' + SEP + 'b' + NEL + 'c"}')], None, False),
    "field rules (case, NUL in id, retry)":
        (b"Data: ignored\nevent: x\ndata: y\nfoo: bar\nretry: 3000\nretry: 12x\nid: 7\nid: 8\x009\n\n",
         [E("y", "x", "7")], 3000, False),
    "data lines with an empty one": (b"data: a\ndata:\ndata: c\n\n", [E("a\n\nc")], None, False),
    "no blank line at the end": (b"data: complete\n\ndata: cut off", [E("complete")], None, True),
    "chat completions, LF": (("".join("data: %s\n\n" % d for d in CHAT)).encode(),
                             [E(d) for d in CHAT], None, False),
    "chat completions, CRLF + comment":
        ((": keep-alive\r\n\r\n" + "".join("data: %s\r\n\r\n" % d for d in CHAT)).encode(),
         [E(d) for d in CHAT], None, False),
    "responses: event + data frames": (("".join("event: %s\ndata: %s\n\n" % (t, d) for t, d in RESP)).encode(),
                                       [E(d, t) for t, d in RESP], None, False),
}


def cut(raw, offsets):
    offsets = [0] + sorted(offsets) + [len(raw)]
    return [raw[a:b] for a, b in zip(offsets, offsets[1:])]


def run_suite(make_parser, label):
    counts = {"whole": [0, 0], "byte-at-a-time": [0, 0], "every 2-way split": [0, 0], "random splits": [0, 0]}
    whole_ok, split_fail = set(), set()
    rng = random.Random(20261026)

    def attempt(kind, name, chunks, want):
        counts[kind][1] += 1
        try:
            p = make_parser()
            events = []
            for c in chunks:
                events += p.feed(c)
            got = (events, p.retry_ms, p.close())
        except Exception:        # a parser that crashes on a split has failed that split
            got = None
        if got == want:
            counts[kind][0] += 1
            if kind == "whole":
                whole_ok.add(name)
        elif kind != "whole":
            split_fail.add(name)

    for name, (raw, events, retry, partial) in FIXTURES.items():
        want = (events, retry, partial)
        attempt("whole", name, [raw], want)
        attempt("byte-at-a-time", name, [raw[i:i + 1] for i in range(len(raw))], want)
        for i in range(len(raw) + 1):
            attempt("every 2-way split", name, [raw[:i], raw[i:]], want)
        for _ in range(2000):
            k = rng.randint(1, 12)
            offsets = [rng.randint(0, len(raw)) for _ in range(k)]   # duplicates give empty chunks
            attempt("random splits", name, cut(raw, offsets), want)
    print(label)
    for kind, (ok, n) in counts.items():
        print("  %-18s %6d / %-6d correct" % (kind, ok, n))
    only = sorted(whole_ok & split_fail)
    print("  right on the whole stream but wrong for some split:", only if only else "none")
    print("  total runs: %d, correct: %d" % (sum(n for _, n in counts.values()), sum(ok for ok, _ in counts.values())))


class DecodePerChunk(SSEParser):
    """BUG 1: decodes every network chunk on its own, so a chunk that ends inside a character raises."""
    def __init__(self):
        super().__init__()
        self._tail = ""

    def feed(self, chunk):
        text = self._tail + chunk.decode("utf-8")
        *lines, self._tail = text.split("\n")
        return [e for e in (self._line(l.rstrip("\r")) for l in lines) if e is not None]


class SplitlinesParser(SSEParser):
    """BUG 2: decodes correctly across chunks, but str.splitlines() ends a line at more than CR / LF / CRLF,
    and a CR at the end of one chunk followed by an LF at the start of the next looks like two line ends."""
    def __init__(self):
        super().__init__()
        self._dec = codecs.getincrementaldecoder("utf-8")()
        self._tail = ""

    def feed(self, chunk):
        text = self._tail + self._dec.decode(chunk)
        lines = text.splitlines()
        self._tail = lines.pop() if lines and not text.endswith(("\n", "\r")) else ""
        return [e for e in (self._line(l) for l in lines) if e is not None]


if __name__ == "__main__":
    print("fixtures:", len(FIXTURES), "| bytes:", sum(len(v[0]) for v in FIXTURES.values()))
    run_suite(SSEParser, "SSEParser (this module)")
    run_suite(DecodePerChunk, "BUG 1: decode each chunk separately")
    run_suite(SplitlinesParser, "BUG 2: incremental decode + str.splitlines()")
```

Output:

```
fixtures: 18 | bytes: 2795
SSEParser (this module)
  whole                  18 / 18     correct
  byte-at-a-time         18 / 18     correct
  every 2-way split    2813 / 2813   correct
  random splits       36000 / 36000  correct
  right on the whole stream but wrong for some split: none
  total runs: 38849, correct: 38849
BUG 1: decode each chunk separately
  whole                  12 / 18     correct
  byte-at-a-time          7 / 18     correct
  every 2-way split    2667 / 2813   correct
  random splits       21151 / 36000  correct
  right on the whole stream but wrong for some split: ['U+2028 and U+0085 inside JSON text', 'chat completions, CRLF + comment', 'chat completions, LF', 'multi-byte UTF-8', 'responses: event + data frames']
  total runs: 38849, correct: 23837
BUG 2: incremental decode + str.splitlines()
  whole                  13 / 18     correct
  byte-at-a-time         11 / 18     correct
  every 2-way split    2707 / 2813   correct
  random splits       25130 / 36000  correct
  right on the whole stream but wrong for some split: ['CRLF line endings', 'CRLF, two data lines']
  total runs: 38849, correct: 27861
```

The real parser is right in all 38,849 runs. Broken parser 1 even fails some whole-stream fixtures (it ignores lone CR, the byte-order mark and the unfinished-event rule, and raises on invalid UTF-8), and the "right on the whole stream but wrong for some split" line lists the fixtures that are right when parsed whole but wrong for some split: the ones with multi-byte characters. Broken parser 2 survives characters split across chunks, but fails the U+2028 / U+0085 fixture even whole, and fails CRLF streams only when a cut lands between the CR and the LF. These are exactly the failures a local test misses, because a local test server usually sends each event in one packet.

### 3. Documented-shape streams and the accumulators

`shapes.py` builds SSE bytes in the documented shapes (synthetic, hand-written from the schemas). It is plumbing, so it is collapsed.

<details>
<summary>shapes.py (synthetic builders)</summary>

```python
"""shapes.py - builders for SSE bytes in the DOCUMENTED shapes.

SYNTHETIC: hand-written from the OpenAI OpenAPI spec and guides (checked 26 Oct 2026), not captured from a
real model. Field names and nesting follow the documentation; the text, ids and token counts are invented.
"""
import json


def j(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def sse(data, event=None):
    """One SSE frame as bytes: optional `event:` line, one `data:` line, blank line."""
    head = "event: %s\n" % event if event else ""
    return (head + "data: %s\n\n" % data).encode("utf-8")


# ---- Chat Completions: data-only frames of type chat.completion.chunk, ended by the literal [DONE] ----
def chat_chunk(delta, finish=None, usage="absent", index=0, choices=True):
    obj = {"id": "chatcmpl-demo", "object": "chat.completion.chunk", "created": 1694268190, "model": "model-a",
           "choices": [{"index": index, "delta": delta, "logprobs": None, "finish_reason": finish}] if choices else []}
    if usage != "absent":          # with include_usage every chunk carries `usage`: null, except the last one
        obj["usage"] = usage
    return sse(j(obj))


def chat_text_stream(pieces, include_usage=True, usage=None):
    mid = None if include_usage else "absent"
    frames = [chat_chunk({"role": "assistant", "content": ""}, usage=mid)]
    frames += [chat_chunk({"content": p}, usage=mid) for p in pieces]
    frames.append(chat_chunk({}, finish="stop", usage=mid))
    if include_usage:
        frames.append(chat_chunk({}, usage=usage or {"prompt_tokens": 12, "completion_tokens": len(pieces),
                                                     "total_tokens": 12 + len(pieces)}, choices=False))
    frames.append(sse("[DONE]"))
    return frames


def chat_tool_stream():
    """Two parallel tool calls whose argument fragments are interleaved on purpose (the docs do not say whether
    real streams interleave; an accumulator keyed by `index` must cope either way)."""
    def tc(index, id=None, name=None, args=None):
        fn = {}
        if name is not None:
            fn["name"] = name
        if args is not None:
            fn["arguments"] = args
        call = {"index": index, "function": fn}
        if id:
            call.update({"id": id, "type": "function"})
        return {"tool_calls": [call]}
    return [
        chat_chunk(dict(tc(0, "call_a", "get_weather", ""), role="assistant", content=None), usage=None),
        chat_chunk(tc(0, args='{"loc'), usage=None),
        chat_chunk(tc(1, "call_b", "get_time", ""), usage=None),
        chat_chunk(tc(0, args='ation":"Par'), usage=None),
        chat_chunk(tc(1, args='{"city":'), usage=None),
        chat_chunk(tc(0, args='is, France"}'), usage=None),
        chat_chunk(tc(1, args='"Oslo"}'), usage=None),
        chat_chunk({}, finish="tool_calls", usage=None),
        chat_chunk({}, usage={"prompt_tokens": 50, "completion_tokens": 31, "total_tokens": 81}, choices=False),
        sse("[DONE]"),
    ]


# ---- Responses API: typed events, `event:` line equal to the JSON `type`, a running sequence_number ----
class _Seq:
    def __init__(self):
        self.n = -1

    def __call__(self, type, **fields):
        self.n += 1
        body = dict(type=type, **fields)
        body["sequence_number"] = self.n
        return sse(j(body), event=type)


USAGE = {"input_tokens": 37, "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0},
         "output_tokens": 11, "output_tokens_details": {"reasoning_tokens": 0}, "total_tokens": 48}


def responses_text_stream(pieces, usage=USAGE, terminal="response.completed"):
    ev = _Seq()
    text = "".join(pieces)
    base = {"id": "resp_demo", "object": "response", "model": "model-a"}
    msg = {"id": "msg_1", "type": "message", "role": "assistant"}
    frames = [ev("response.created", response=dict(base, status="in_progress", output=[], usage=None)),
              ev("response.in_progress", response=dict(base, status="in_progress", output=[], usage=None)),
              ev("response.output_item.added", output_index=0, item=dict(msg, status="in_progress", content=[])),
              ev("response.content_part.added", item_id="msg_1", output_index=0, content_index=0,
                 part={"type": "output_text", "text": "", "annotations": []})]
    frames += [ev("response.output_text.delta", item_id="msg_1", output_index=0, content_index=0, delta=p, logprobs=[])
               for p in pieces]
    part = {"type": "output_text", "text": text, "annotations": []}
    frames += [ev("response.output_text.done", item_id="msg_1", output_index=0, content_index=0, text=text, logprobs=[]),
               ev("response.content_part.done", item_id="msg_1", output_index=0, content_index=0, part=part),
               ev("response.output_item.done", output_index=0, item=dict(msg, status="completed", content=[part]))]
    final = dict(base, status="completed" if terminal == "response.completed" else "incomplete",
                 output=[dict(msg, status="completed", content=[part])], usage=usage)
    if terminal == "response.incomplete":
        final["incomplete_details"] = {"reason": "max_output_tokens"}
    frames.append(ev(terminal, response=final))
    return frames


def responses_tool_stream(arg_pieces, usage=USAGE):
    ev = _Seq()
    args = "".join(arg_pieces)
    base = {"id": "resp_demo", "object": "response", "model": "model-a"}
    call = {"id": "fc_1", "type": "function_call", "call_id": "call_1", "name": "get_weather"}
    frames = [ev("response.created", response=dict(base, status="in_progress", output=[], usage=None)),
              ev("response.output_item.added", output_index=0, item=dict(call, arguments=""))]
    frames += [ev("response.function_call_arguments.delta", item_id="fc_1", output_index=0, delta=p)
               for p in arg_pieces]
    frames += [ev("response.function_call_arguments.done", item_id="fc_1", output_index=0, arguments=args),
               ev("response.output_item.done", output_index=0, item=dict(call, arguments=args)),
               ev("response.completed", response=dict(base, status="completed", usage=usage,
                                                      output=[dict(call, arguments=args)]))]
    return frames
```

</details>

The accumulators rebuild text, tool calls and usage and decide the outcome:

```python
"""accumulate.py - rebuild complete objects from streamed deltas, and decide how the stream ended."""
import json

from sse import SSEEvent


class StreamError(Exception):
    """The server sent an error object inside the stream (after a 200 response had already started)."""


class ChatAccumulator:
    """Chat Completions: frames are chat.completion.chunk JSON objects; the literal `[DONE]` ends the stream."""

    def __init__(self):
        self.role, self.text, self.refusal, self.finish = {}, {}, {}, {}
        self.tool_calls = {}      # (choice index, tool index) -> {"id", "type", "name", "arguments"}
        self.usage = None         # only present when the request set stream_options.include_usage
        self.saw_done = False

    def feed(self, ev: SSEEvent):
        if ev.data == "[DONE]":            # literal text, NOT JSON - check before json.loads
            self.saw_done = True
            return
        obj = json.loads(ev.data)
        if "error" in obj:                 # a failure after streaming started arrives as a data frame
            raise StreamError(obj["error"])
        if obj.get("usage"):               # `usage` is null on every chunk but the last one
            self.usage = obj["usage"]
        for ch in obj.get("choices", []):  # empty on the usage chunk; several entries when n > 1
            i, delta = ch["index"], ch.get("delta") or {}
            if delta.get("role"):
                self.role[i] = delta["role"]
            if delta.get("content"):
                self.text[i] = self.text.get(i, "") + delta["content"]
            if delta.get("refusal"):
                self.refusal[i] = self.refusal.get(i, "") + delta["refusal"]
            for frag in delta.get("tool_calls") or []:
                call = self.tool_calls.setdefault((i, frag["index"]),
                                                  {"id": None, "type": None, "name": "", "arguments": ""})
                call["id"] = frag.get("id") or call["id"]
                call["type"] = frag.get("type") or call["type"]
                fn = frag.get("function") or {}
                call["name"] += fn.get("name") or ""
                call["arguments"] += fn.get("arguments") or ""
            if ch.get("finish_reason"):
                self.finish[i] = ch["finish_reason"]

    def outcome(self):
        if not self.saw_done:
            return "truncated"             # the connection ended without the documented terminal frame
        if any(f in ("length", "content_filter") for f in self.finish.values()):
            return "incomplete"
        return "complete"


class ResponsesAccumulator:
    """Responses API: typed events. Identify them by the JSON `type` (the `event:` line repeats it)."""

    def __init__(self):
        self.text, self.text_done = {}, {}            # (output_index, content_index) -> str
        self.args, self.args_done = {}, {}            # output_index -> str
        self.items = {}                               # output_index -> output item
        self.status = None                            # completed | incomplete | failed (terminal events only)
        self.usage = self.incomplete_reason = None
        self.last_seq = -1
        self.unknown = 0

    def feed(self, ev: SSEEvent):
        obj = json.loads(ev.data)
        t = obj.get("type", ev.event)
        if "sequence_number" in obj:
            assert obj["sequence_number"] > self.last_seq, "sequence_number went backwards"
            self.last_seq = obj["sequence_number"]
        oi = obj.get("output_index")
        if t == "response.output_item.added":
            self.items[oi] = obj["item"]
            if obj["item"].get("type") == "function_call":
                self.args[oi] = obj["item"].get("arguments", "")
        elif t == "response.output_text.delta":
            key = (oi, obj["content_index"])
            self.text[key] = self.text.get(key, "") + obj["delta"]
        elif t == "response.output_text.done":
            self.text_done[(oi, obj["content_index"])] = obj["text"]
        elif t == "response.function_call_arguments.delta":
            self.args[oi] = self.args.get(oi, "") + obj["delta"]
        elif t == "response.function_call_arguments.done":
            self.args_done[oi] = obj["arguments"]
        elif t == "response.output_item.done":
            self.items[oi] = obj["item"]
        elif t in ("response.completed", "response.incomplete", "response.failed"):
            self.status = t.split(".")[1]
            resp = obj["response"]
            self.usage = resp.get("usage")
            self.incomplete_reason = (resp.get("incomplete_details") or {}).get("reason")
        elif t == "error":
            raise StreamError(obj)
        elif not t.startswith("response."):
            self.unknown += 1                         # e.g. a keepalive: ignore types you do not know
        # other response.* events (created, in_progress, content_part.*, reasoning summaries, ...) need no state here

    def outcome(self):
        names = {"completed": "complete", "incomplete": "incomplete", "failed": "failed"}
        return names.get(self.status, "truncated")    # no terminal event means the stream was cut

    def disagreements(self):
        """Trust but verify: the concatenated deltas must equal the server's own `.done` values."""
        bad = [k for k, v in self.text_done.items() if self.text.get(k) != v]
        bad += [k for k, v in self.args_done.items() if self.args.get(k) != v]
        return bad
```

Run every shape through the parser with a different random chunking each time:

```python
"""test_accumulate.py - feed documented-shape streams through the parser and the accumulators,
splitting the bytes at random offsets each time."""
import json
import random

from accumulate import ChatAccumulator, ResponsesAccumulator, StreamError
from shapes import (chat_text_stream, chat_tool_stream, j, responses_text_stream, responses_tool_stream, sse)
from sse import SSEParser


def run(frames, acc, rng, cut_stream=None):
    raw = b"".join(frames)
    if cut_stream is not None:
        raw = raw[:cut_stream]
    p = SSEParser()
    offsets = sorted(rng.randint(0, len(raw)) for _ in range(rng.randint(1, 15)))
    pieces = [raw[a:b] for a, b in zip([0] + offsets, offsets + [len(raw)])]
    try:
        for piece in pieces:
            for ev in p.feed(piece):
                acc.feed(ev)
    except StreamError as e:
        return "outcome=failed (%s)" % e.args[0]
    return "outcome=%s, cut mid-event=%s" % (acc.outcome(), p.close())


rng = random.Random(7)

print("1. Chat text, include_usage=true")
a = ChatAccumulator()
print("  ", run(chat_text_stream(["Hel", "lo", " w\U000000f6rld", " \U0001F642"]), a, rng))
print("  text:", a.text, "| usage:", a.usage)

print("2. Chat text, include_usage not set")
a = ChatAccumulator()
print("  ", run(chat_text_stream(["Hi"], include_usage=False), a, rng), "| usage:", a.usage)

print("3. Chat tool calls (two parallel calls, fragments interleaved)")
a = ChatAccumulator()
print("  ", run(chat_tool_stream(), a, rng), "| finish:", a.finish)
for key, call in sorted(a.tool_calls.items()):
    print("  ", key, call["id"], call["name"], call["arguments"], "->", json.loads(call["arguments"]))

print("4. Chat stream cut before [DONE] (connection dropped)")
a = ChatAccumulator()
frames = chat_text_stream(["Hel", "lo", " there"])
cut_at = len(b"".join(frames[:3])) + 20          # inside the third chunk
print("  ", run(frames, a, rng, cut_stream=cut_at), "| text so far:", repr(a.text.get(0)), "| usage:", a.usage)

print("5. Chat: an error object inside a 200 stream")
a = ChatAccumulator()
frames = chat_text_stream(["Hel"])[:2] + [sse(j({"error": {"message": "stand-in failure", "type": "server_error"}}))]
print("  ", run(frames, a, rng))

print("6. Responses text")
a = ResponsesAccumulator()
print("  ", run(responses_text_stream(["Hi", " there", " \U00002603"]), a, rng))
print("   text:", a.text, "| disagreements:", a.disagreements(), "| usage:", a.usage["output_tokens"], "output tokens")

print("7. Responses function call")
a = ResponsesAccumulator()
pieces = ['{"', 'location', '":"', 'Paris', ',', ' France', '"}']
print("  ", run(responses_tool_stream(pieces), a, rng))
print("   args:", a.args, "| item:", a.items[0]["name"], "| disagreements:", a.disagreements())

print("8. Responses ended as response.incomplete")
a = ResponsesAccumulator()
print("  ", run(responses_text_stream(["Hi"], terminal="response.incomplete"), a, rng), "| reason:", a.incomplete_reason)

print("9. Responses cut before any terminal event")
a = ResponsesAccumulator()
frames = responses_text_stream(["Hi", " there"])
print("  ", run(frames, a, rng, cut_stream=len(b"".join(frames[:6]))), "| usage:", a.usage)

print("10. An unknown event type is ignored")
a = ResponsesAccumulator()
frames = responses_text_stream(["Hi"])
frames.insert(2, sse(j({"type": "keepalive"}), event="keepalive"))
print("  ", run(frames, a, rng), "| unknown events seen:", a.unknown)
```

Output:

```
1. Chat text, include_usage=true
   outcome=complete, cut mid-event=False
  text: {0: 'Hello wörld 🙂'} | usage: {'prompt_tokens': 12, 'completion_tokens': 4, 'total_tokens': 16}
2. Chat text, include_usage not set
   outcome=complete, cut mid-event=False | usage: None
3. Chat tool calls (two parallel calls, fragments interleaved)
   outcome=complete, cut mid-event=False | finish: {0: 'tool_calls'}
   (0, 0) call_a get_weather {"location":"Paris, France"} -> {'location': 'Paris, France'}
   (0, 1) call_b get_time {"city":"Oslo"} -> {'city': 'Oslo'}
4. Chat stream cut before [DONE] (connection dropped)
   outcome=truncated, cut mid-event=True | text so far: 'Hello' | usage: None
5. Chat: an error object inside a 200 stream
   outcome=failed ({'message': 'stand-in failure', 'type': 'server_error'})
6. Responses text
   outcome=complete, cut mid-event=False
   text: {(0, 0): 'Hi there ☃'} | disagreements: [] | usage: 11 output tokens
7. Responses function call
   outcome=complete, cut mid-event=False
   args: {0: '{"location":"Paris, France"}'} | item: get_weather | disagreements: []
8. Responses ended as response.incomplete
   outcome=incomplete, cut mid-event=False | reason: max_output_tokens
9. Responses cut before any terminal event
   outcome=truncated, cut mid-event=False | usage: None
10. An unknown event type is ignored
   outcome=complete, cut mid-event=False | unknown events seen: 1
```

Case 3 rebuilt two interleaved parallel tool calls into valid JSON. Case 4 shows a cut stream: the text so far is intact, `usage` is `None`, and `close()` reports the half-received frame. Case 5 shows that an error object inside a 200 stream surfaces as an exception, not as text.

### 4. A local stand-in, and a client that reads it

> [!example] **This is a local stand-in that mimics the documented shape; the model behind it is scripted, not a real model.** It speaks HTTP/1.1 with chunked transfer encoding on 127.0.0.1 and plays back the byte schedule you give it, so timing, cancellation and failure behaviour can be exercised without a provider. Port numbers and timings are machine-dependent and are never printed.

<details>
<summary>standin.py (the stand-in server)</summary>

```python
"""standin.py - a LOCAL STAND-IN that mimics the documented streaming wire shapes.

The model behind it is SCRIPTED, not a real model. It binds 127.0.0.1 on an ephemeral port, speaks HTTP/1.1
with chunked transfer encoding (like a real streaming endpoint), and plays back the episodes you give it.
"""
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


class StandIn(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, scripts, stored=None):
        super().__init__(("127.0.0.1", 0), _Handler)
        self.scripts = scripts      # request "model" -> list of episodes; request n uses episode n (the last repeats)
        self.stored = stored or {}  # response id -> [(sequence_number, frame bytes)] for the resume route
        self.requests = {}          # model -> how many requests arrived
        self.progress = {}          # model -> {"writes": frames written, "aborted": client went away}

    @property
    def port(self):
        return self.server_address[1]

    def start(self):
        threading.Thread(target=self.serve_forever, daemon=True).start()
        return self

    def stop(self):
        self.shutdown()
        self.server_close()


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        # Streaming servers disable Nagle's algorithm so small frames leave immediately.
        self.request.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

    def log_message(self, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except ConnectionError:      # the client hung up; on Windows this includes ConnectionAbortedError
            pass

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _begin_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _chunk(self, data):
        self.wfile.write(b"%x\r\n%s\r\n" % (len(data), data))   # HTTP chunk framing, unrelated to SSE framing
        self.wfile.flush()

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        name, srv = req["model"], self.server
        n = srv.requests[name] = srv.requests.get(name, 0) + 1
        episodes = srv.scripts[name]
        ep = episodes[min(n, len(episodes)) - 1]
        prog = srv.progress[name] = {"writes": 0, "aborted": False}
        if ep.get("status", 200) != 200:
            return self._json(ep["status"], ep["body"])
        if not req.get("stream"):
            time.sleep(sum(s[1] for s in ep["steps"] if s[0] == "wait"))   # same compute time, delivered at the end
            return self._json(200, ep["json"])
        self._begin_stream()
        try:
            for step in ep["steps"]:
                if step[0] == "wait":
                    time.sleep(step[1])
                elif step[0] == "send":
                    self._chunk(step[1])
                    prog["writes"] += 1
                elif step[0] == "cut":
                    self.close_connection = True        # hang up without the terminating zero-length chunk
                    return
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except OSError:                                 # the client closed its socket
            prog["aborted"] = True

    def do_GET(self):                                   # GET /v1/responses/{id}?stream=true&starting_after=N
        url = urlparse(self.path)
        events = self.server.stored[url.path.rsplit("/", 1)[1]]
        after = int(parse_qs(url.query).get("starting_after", ["-1"])[0])
        self._begin_stream()
        for seq, frame in events:
            if seq > after:
                self._chunk(frame)
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()
```

</details>

<details>
<summary>stream_client.py (a streaming client on http.client)</summary>

```python
"""stream_client.py - open a streaming request with http.client and hand out SSE events as bytes arrive."""
import http.client
import json

from sse import SSEParser


class HTTPStatusError(Exception):
    def __init__(self, status, body):
        super().__init__("HTTP %d" % status)
        self.status, self.body = status, body


class EventStream:
    """Iterate to receive events. Call close() (or leave a `with` block) to cancel: that closes the TCP connection."""

    def __init__(self, port, payload, path="/v1/chat/completions", method="POST", timeout=10.0):
        self.conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
        body = json.dumps(payload) if method == "POST" else None
        self.conn.request(method, path, body=body,
                          headers={"Content-Type": "application/json", "Accept": "text/event-stream"})
        self.resp = self.conn.getresponse()
        if self.resp.status != 200:            # errors before the stream starts are ordinary JSON responses
            body = self.resp.read()
            self.conn.close()
            raise HTTPStatusError(self.resp.status, body)
        self.parser = SSEParser()
        self.broken = False                    # the connection died before the body ended cleanly
        self.cut_mid_event = False             # ... and the last event was left unfinished

    def __iter__(self):
        try:
            while True:
                try:
                    chunk = self.resp.read1(65536)      # returns as soon as some bytes are available
                except (http.client.IncompleteRead, ConnectionError, TimeoutError):
                    self.broken = True
                    break
                if not chunk:
                    break
                yield from self.parser.feed(chunk)
            self.cut_mid_event = self.parser.close()
        finally:
            self.close()

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
```

</details>

### 5. Time to first token against total time

The stand-in's schedule is fixed: the first token after 0.30 s, then one token every 0.05 s, 20 tokens in all. The three clients below receive the *same* bytes; only what they do with them differs.

```python
"""demo_ttft.py - time to first token vs total time, against a stand-in that streams on a schedule."""
import http.client
import json
import time

from accumulate import ChatAccumulator
from shapes import chat_text_stream
from standin import StandIn
from stream_client import EventStream

WORDS = ["w%02d " % i for i in range(20)]            # 20 scripted "tokens"
FIRST, GAP = 0.30, 0.05                              # seconds before the first token, then between tokens
frames = chat_text_stream(WORDS)                     # role chunk, 20 content chunks, finish chunk, usage chunk, [DONE]
n = len(WORDS)
steps = [("wait", FIRST), ("send", frames[0]), ("send", frames[1])]
for f in frames[2:n + 1]:
    steps += [("wait", GAP), ("send", f)]
steps += [("send", f) for f in frames[n + 1:]]
final_json = {"object": "chat.completion", "choices": [{"index": 0, "finish_reason": "stop",
              "message": {"role": "assistant", "content": "".join(WORDS)}}]}
server = StandIn({"scheduled": [{"steps": steps, "json": final_json}]}).start()
req = {"model": "scheduled", "stream": True, "stream_options": {"include_usage": True}}
scheduled_total = FIRST + (n - 1) * GAP
print("stand-in schedule: first token at %.3f s, last token at %.3f s" % (FIRST, scheduled_total))

# 1. a streaming client: consume events as they arrive
t0, first, acc = time.perf_counter(), None, ChatAccumulator()
with EventStream(server.port, req) as stream:
    for ev in stream:
        acc.feed(ev)
        if first is None and acc.text.get(0):
            first = time.perf_counter() - t0
total = time.perf_counter() - t0
print("streaming client:  first >= schedule: %s | total >= schedule: %s | first < total/2: %s"
      % (first >= FIRST, total >= scheduled_total, first < total / 2))
print("                   outcome: %s | text rebuilt correctly: %s | usage: %s"
      % (acc.outcome(), acc.text[0] == "".join(WORDS), acc.usage))

# 2. the same stream read by a client that waits for the whole body (what a buffering proxy or a missing
#    stream=True flag amounts to): the bytes are identical, the user sees nothing until the end
conn = http.client.HTTPConnection("127.0.0.1", server.port)
t0 = time.perf_counter()
conn.request("POST", "/v1/chat/completions", json.dumps(req), {"Content-Type": "application/json"})
body = conn.getresponse().read()
buffered_first = time.perf_counter() - t0
print("buffering client:  first visible text arrives with the last byte: %s" % (buffered_first >= scheduled_total))

# 3. no stream flag at all: one JSON body, after the same compute time
t0 = time.perf_counter()
conn = http.client.HTTPConnection("127.0.0.1", server.port)
conn.request("POST", "/v1/chat/completions", json.dumps({"model": "scheduled"}), {"Content-Type": "application/json"})
text = json.loads(conn.getresponse().read())["choices"][0]["message"]["content"]
print("non-streaming:     first visible text after >= schedule: %s | same text: %s"
      % (time.perf_counter() - t0 >= scheduled_total, text == "".join(WORDS)))
server.stop()

# The arithmetic behind it (ILLUSTRATIVE numbers, not measurements of any model):
#   total = ttft + (n_tokens - 1) * inter_token_gap       user waits `total` without streaming, `ttft` with it
ttft, gap = 0.40, 0.02
print("\nshare of the wait spent on a blank screen (ILLUSTRATIVE ttft=%.2f s, gap=%.2f s):" % (ttft, gap))
print(" tokens   total (s)   no streaming   streaming")
for n_tok in (50, 500, 5000):
    total = ttft + (n_tok - 1) * gap
    print("%7d %11.2f %12.0f%% %10.1f%%" % (n_tok, total, 100.0, 100 * ttft / total))
```

Output (only deterministic facts are printed; the raw timings vary by machine and are not):

```
stand-in schedule: first token at 0.300 s, last token at 1.250 s
streaming client:  first >= schedule: True | total >= schedule: True | first < total/2: True
                   outcome: complete | text rebuilt correctly: True | usage: {'prompt_tokens': 12, 'completion_tokens': 20, 'total_tokens': 32}
buffering client:  first visible text arrives with the last byte: True
non-streaming:     first visible text after >= schedule: True | same text: True

share of the wait spent on a blank screen (ILLUSTRATIVE ttft=0.40 s, gap=0.02 s):
 tokens   total (s)   no streaming   streaming
     50        1.38          100%       29.0%
    500       10.38          100%        3.9%
   5000      100.38          100%        0.4%
```

### 6. Cancel, retry, truncation and resume

```python
"""demo_cancel_retry.py - cancelling, retrying and resuming a stream, against the stand-in."""
import json
import time

from accumulate import ChatAccumulator, ResponsesAccumulator
from shapes import chat_text_stream, responses_text_stream
from standin import StandIn
from stream_client import EventStream, HTTPStatusError

RETRYABLE = {408, 409, 429, 500, 502, 503, 504}     # openai-python retries 408, 409, 429 and >=500 by default


def chat_request(model):
    return {"model": model, "stream": True, "stream_options": {"include_usage": True}}


def run_chat(port, model, max_attempts=3):
    """Retry only while nothing has reached the caller: a connection error or an HTTP error status."""
    for attempt in range(1, max_attempts + 1):
        try:
            stream = EventStream(port, chat_request(model))
        except HTTPStatusError as e:
            if e.status in RETRYABLE and attempt < max_attempts:
                continue                              # a real client sleeps here: exponential backoff plus jitter
            raise
        acc = ChatAccumulator()
        with stream:
            for ev in stream:
                acc.feed(ev)
        return acc, attempt, stream                   # once events have flowed, the caller decides what a retry means


def spread(frames, gap):
    steps = [("send", frames[0])]
    for f in frames[1:]:
        steps += [("wait", gap), ("send", f)]
    return steps


long_frames = chat_text_stream(["t%03d " % i for i in range(200)])
hello = chat_text_stream(["Hel", "lo ", "w\U000000f6rld"])
cut_inside_char = hello[3][:hello[3].index(b"\xc3") + 1]            # only the first byte of the 2-byte o-umlaut
resp_frames = responses_text_stream(["alpha ", "beta ", "gamma ", "delta"])
stored = [(json.loads(f.split(b"data: ", 1)[1])["sequence_number"], f) for f in resp_frames]

server = StandIn({
    "long": [{"steps": spread(long_frames, 0.005)}],
    "flaky": [{"status": 429, "body": {"error": {"message": "stand-in: slow down", "type": "rate_limit"}}},
              {"steps": [("send", f) for f in hello]}],
    "cutoff": [{"steps": [("send", f) for f in hello[:3]] + [("send", cut_inside_char), ("cut",)]},
               {"steps": [("send", f) for f in hello]}],
    "bg": [{"steps": [("send", f) for f in resp_frames[:7]] + [("cut",)]}],
}, stored={"resp_demo": stored}).start()

print("A. cancel after 5 deltas")
acc = ChatAccumulator()
with EventStream(server.port, chat_request("long")) as stream:
    for ev in stream:
        acc.feed(ev)
        if len(acc.text.get(0, "").split()) == 5:      # each scripted delta is one word
            break                                      # leaving the `with` block closes the connection
print("   kept: %r | outcome: %s | usage received: %s" % (acc.text[0], acc.outcome(), acc.usage is not None))
deadline = time.time() + 5
while not server.progress["long"]["aborted"] and time.time() < deadline:
    time.sleep(0.02)
print("   server noticed the disconnect: %s | stopped before writing all %d frames: %s"
      % (server.progress["long"]["aborted"], len(long_frames), server.progress["long"]["writes"] < len(long_frames)))

print("B. HTTP 429 before the first byte: safe to retry")
acc, attempts, _ = run_chat(server.port, "flaky")
print("   attempts: %d | server saw %d requests | outcome: %s | text: %r"
      % (attempts, server.requests["flaky"], acc.outcome(), acc.text[0]))

print("C. connection cut mid-stream, in the middle of a character")
acc, attempts, stream = run_chat(server.port, "cutoff")
print("   attempts: %d | outcome: %s | text so far: %r | cut mid-event: %s | usage: %s"
      % (attempts, acc.outcome(), acc.text[0], stream.cut_mid_event, acc.usage))
again, _, _ = run_chat(server.port, "cutoff")
print("   blind retry that appends: %r" % (acc.text[0] + again.text[0]))
print("   discard and restart:      %r" % again.text[0])

print("D. resume a background response with the documented cursor (stand-in for GET ...?stream=true&starting_after=N)")
acc = ResponsesAccumulator()
with EventStream(server.port, {"model": "bg", "stream": True, "background": True}, path="/v1/responses") as s1:
    for ev in s1:
        acc.feed(ev)
print("   first connection: outcome %s | cursor (last sequence_number) = %d | text %r"
      % (acc.outcome(), acc.last_seq, acc.text[(0, 0)]))
try:
    with EventStream(server.port, {}, path="/v1/responses/resp_demo?stream=true&starting_after=%d" % (acc.last_seq - 1),
                     method="GET") as s2:
        for ev in s2:
            acc.feed(ev)
except AssertionError as e:
    print("   starting_after one too low replays an event -> caught: %s" % e)
with EventStream(server.port, {}, path="/v1/responses/resp_demo?stream=true&starting_after=%d" % acc.last_seq,
                 method="GET") as s2:
    for ev in s2:
        acc.feed(ev)
print("   resumed: outcome %s | text %r | .done values agree: %s | usage output_tokens: %d"
      % (acc.outcome(), acc.text[(0, 0)], acc.disagreements() == [], acc.usage["output_tokens"]))
server.stop()
```

Output:

```
A. cancel after 5 deltas
   kept: 't000 t001 t002 t003 t004 ' | outcome: truncated | usage received: False
   server noticed the disconnect: True | stopped before writing all 204 frames: True
B. HTTP 429 before the first byte: safe to retry
   attempts: 2 | server saw 2 requests | outcome: complete | text: 'Hello wörld'
C. connection cut mid-stream, in the middle of a character
   attempts: 1 | outcome: truncated | text so far: 'Hello ' | cut mid-event: True | usage: None
   blind retry that appends: 'Hello Hello wörld'
   discard and restart:      'Hello wörld'
D. resume a background response with the documented cursor (stand-in for GET ...?stream=true&starting_after=N)
   first connection: outcome truncated | cursor (last sequence_number) = 6 | text 'alpha beta gamma '
   starting_after one too low replays an event -> caught: sequence_number went backwards
   resumed: outcome complete | text 'alpha beta gamma delta' | .done values agree: True | usage output_tokens: 11
```

### 7. The official SDK (not executed)

> [!note] **NOT EXECUTED (needs the `openai` package and an API key).** Method and parameter names were checked against the `openai-python` README, the OpenAPI spec and the streaming guide read on 26 Oct 2026. `model-a` is a placeholder: take a real ID from the Models page ([Module 04: Model Families and Generations](../04-model-families-and-generations/README.md)). No output is shown because none was produced.

```python
import os
from openai import OpenAI

client = OpenAI()                      # reads OPENAI_API_KEY from the environment
MODEL = os.environ["MODEL_ID"]         # a model ID from the Models page, e.g. "model-a"

# Responses API: typed events
with client.responses.create(model=MODEL, input="Say hello.", stream=True) as stream:
    for event in stream:
        if event.type == "response.output_text.delta":
            print(event.delta, end="", flush=True)
        elif event.type == "response.completed":
            print("\nusage:", event.response.usage)
        elif event.type == "error":
            print("error:", event.message)

# Chat Completions: chunks, with usage on the final chunk
stream = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": "Say hello."}],
    stream=True,
    stream_options={"include_usage": True},
)
for chunk in stream:
    if chunk.choices:                  # the usage chunk has choices == []
        print(chunk.choices[0].delta.content or "", end="", flush=True)
    if chunk.usage:
        print("\nusage:", chunk.usage)
```

### What these numbers do and do not show

They show that the parser, the accumulators, the outcome logic, and the cancel, retry and resume mechanics behave as designed under every chunking tried, for streams that follow the documented shapes. They do not show how a real model streams, how a real server behaves under load, what intermediaries do to your stream, or what any provider bills after a disconnect. Real streams will also contain event types and fields this module never built; the rule is to ignore what you do not recognise. Check the current API reference before relying on a field.

## Visual diagram

```
 CLIENT                                                       SERVER (decoding tokens)
   │  POST ...  stream=true                                       │
   │─────────────────────────────────────────────────────────────►│  queue, read the prompt (and think)
   │                                                              │          ┐ time to
   │◄──────── 200  Content-Type: text/event-stream ───────────────│          ┘ first token
   │◄──────── data: {"delta":{"role":"assistant"}}                │
   │◄──────── data: {"delta":{"content":"Hel"}}   <- first visible text: TTFT ends
   │◄──────── data: {"delta":{"content":"lo"}}                    │  one frame per token (or small group)
   │◄──────── data: {"delta":{},"finish_reason":"stop"}           │
   │◄──────── data: {"choices":[],"usage":{...}}                  │  only with include_usage
   │◄──────── data: [DONE]                                        │  Chat Completions' terminal marker
   │◄──────── (connection closes)                                 │

 NETWORK CHUNKS (cut anywhere)             PARSER PIPELINE
 ...da|ta: {"x":"h\xc3|\xa9"}\r|\n\r\n...
          │
          ▼
 ┌─────────────────────────┐  cut lines only at CR, LF or CRLF (ASCII bytes, never inside a character)
 │ 1  line splitter, bytes │  keep the unfinished tail; remember "the last byte was CR"
 └────────────┬────────────┘
              ▼  complete lines
 ┌─────────────────────────┐  decode each line as UTF-8, then:
 │ 2  field parser         │  ""  -> dispatch the event        ":..."       -> comment, ignore
 └────────────┬────────────┘  name: value -> event / data / id / retry
              ▼  SSEEvent(event, data, last_event_id)
 ┌─────────────────────────┐  data == "[DONE]" ?  stop  :  json.loads(data)
 │ 3  accumulator          │  text += delta    args[index] += fragment    usage    outcome
 └─────────────────────────┘

 HOW DID IT END?
   Chat       [DONE] and finish_reason stop / tool_calls   -> complete
              finish_reason length / content_filter         -> incomplete
              an error frame                                -> failed
              connection closed with no [DONE]              -> truncated      (usage probably missing)
   Responses  response.completed -> complete    response.incomplete -> incomplete
              response.failed or an error event -> failed    no terminal event -> truncated
   You closed the connection                                -> cancelled
```

## Practice

### 1. Parse by hand

For each byte string, write the list of events (event type, data) the parser returns, then check with block 1. `\r\n` and `\n` are the two-character and one-character line ends.

1. `data: a\r\ndata: b\r\n\r\n`
2. `event: x\ndata: 1\n\n: note\n\ndata: 2`
3. `data:  two spaces\n\n`
4. `id: 5\ndata\n\n`

<details><summary>Answer</summary>

1. One event, type `message`, data `"a\nb"`: two `data:` lines are joined with a newline.
2. One event, type `x`, data `"1"`. The comment-only block dispatches nothing. The final `data: 2` is not followed by a blank line, so it is discarded, and `close()` returns `True`.
3. One event with data `" two spaces"` (one leading space): only a single space after the colon is removed.
4. One event with an empty data string `""` and last event ID `"5"`: a line with no colon is a field named `data` with an empty value, and the data buffer is then not empty (it holds one empty line), so the event is dispatched.

</details>

### 2. Find the bugs

```python
buffer = ""
for chunk in response.iter_bytes():
    buffer += chunk.decode("utf-8")
    for block in buffer.split("\n\n"):
        if block.startswith("data: "):
            event = json.loads(block[6:])
            text += event["choices"][0]["delta"].get("content", "")
```

List every bug you can find (there are at least five).

<details><summary>Answer</summary>

1. `chunk.decode()` per chunk raises when a chunk ends inside a multi-byte character; decode complete lines, or use an incremental decoder.
2. `split("\n\n")` assumes LF-only line endings; CRLF and CR streams (legal SSE) never match.
3. The buffer is never trimmed, so every loop iteration re-processes old blocks and the text is appended many times; it also treats the last, incomplete block as complete, so `json.loads` is handed half a JSON object.
4. `json.loads("[DONE]")` raises `JSONDecodeError`; check for the literal `[DONE]` first.
5. `event["choices"][0]` raises `IndexError` on the usage chunk (`choices == []`) and `KeyError` on an `error` frame; `delta` may also lack `content`, which `.get` handles but `delta["content"]` would not, and `content` can be `null` (use `or ""`).
6. There is no check of how the stream ended: no terminal marker, no `finish_reason`, no handling of an `error` object, so a truncated stream looks like a finished one.
7. Multi-line `data:` events, comments, `event:` names and `id:` are all ignored.

</details>

### 3. The arithmetic of waiting

A model has a TTFT of 0.5 s and produces 30 tokens per second after that (illustrative numbers). (a) How long does a 600-token answer take in total? (b) What does the user stare at a blank screen for, with and without streaming? (c) The user closes the page 5 s after sending the request. How many tokens has the model generated by then, at the least, if the server is not told?

<details><summary>Answer</summary>

(a) `0.5 + 599 / 30 = 20.47 s` (about 20.5 s). (b) Without streaming, about 20.5 s. With streaming, 0.5 s. (c) At 5 s, `30 x (5 - 0.5) = 135` tokens have been generated on top of the first one, about 136 tokens, and generation continues to the end (600 tokens) unless the server stops when the connection closes. The 464 or so tokens after the disconnect are the ones that a proper disconnect handler saves; block 6 (case A) shows the stand-in stopping early. Whether the provider bills them is not stated in the pages read for this module.

</details>

### 4. Retry or not?

For each situation say whether an automatic retry is safe, and what you would do instead if not. (a) HTTP 429 before any event. (b) The connection is reset after 40 text deltas. (c) A background response stream drops after `sequence_number` 118. (d) The stream ends with `finish_reason: "length"`. (e) A `response.failed` event arrives.

<details><summary>Answer</summary>

(a) Safe: nothing was delivered; back off (with jitter) and retry. (b) Not blindly: the user already saw 40 deltas, and a new request produces different text. Either discard the partial text and restart visibly, or, if you designed for it (background mode), resume from the cursor. (c) Resume with `GET /v1/responses/{id}?stream=true&starting_after=118`, advance the cursor only on events that carry `sequence_number`, and drop duplicates by checking the number is increasing. (d) Not a transport failure: the server ended the answer on purpose. Retrying the same request gives the same limit. Raise the limit, shorten the prompt, or continue with a follow-up request. (e) Treat as failed. A retry may be reasonable, but it is a new generation, not a continuation; log the error code and message first.

</details>

### Checkpoint quiz

1. Why can an SSE parser not decode each network chunk to text as it arrives?
2. A chat stream ends and your loop exits without an exception. Name two different things that might have happened besides "the model finished".
3. Where is the token usage in a Chat Completions stream, and when will it be missing?
4. What is the difference between `response.output_text.delta` and `response.output_text.done`, and why compare them?
5. Why is it unsafe to run a tool call as soon as its `name` arrives?

<details><summary>Answers</summary>

1. A multi-byte UTF-8 character can be split between two chunks; the first half is not valid text on its own. Cut lines at ASCII CR/LF bytes first, then decode each complete line.
2. The stream was truncated (the connection ended with no `[DONE]`), or it ended on purpose but incompletely (`finish_reason` of `length` or `content_filter`), or an `error` frame ended it. Check for the terminal marker and the finish reason.
3. In an extra chunk before `[DONE]`, with an empty `choices` list, only if the request set `stream_options.include_usage`. It is missing if you did not ask, and may be missing if the stream is interrupted or cancelled.
4. The delta is one piece; the done event carries the finished text of that part. If your concatenated deltas differ from the done text, you lost or duplicated an event; the comparison catches that.
5. The arguments arrive later as fragments and are not valid JSON until the call is complete; even then the model may produce invalid or unexpected arguments, so parse and validate first.

</details>

> [!check]
> - I can describe the SSE format: field lines, the blank-line dispatch, comments, CR/LF/CRLF, and the one-space rule.
> - I can explain why a parser must work on bytes and why a trailing CR needs state.
> - I can tell the Chat Completions chunk shape from the Responses typed events and name each one's terminal signal.
> - I can rebuild text and tool-call arguments from deltas, keyed correctly, and verify them against `.done` values.
> - I can say how a stream ended and decide whether a retry, a restart or a resume is appropriate.
> - I can measure TTFT against total time and explain what streaming does and does not change.

## Project

Build a **streaming relay**: a small HTTP server that accepts a streaming request from a client, forwards it to the stand-in (or any SSE source), and relays the events to the client with as little added delay as possible. It must (1) forward the bytes without buffering whole events, yet parse them well enough to keep a running summary (outcome, characters of text, usage if present, TTFT, total time); (2) close the upstream connection promptly when the downstream client disconnects, and prove it with the stand-in's `aborted` flag; (3) send an SSE comment line as a keep-alive whenever the upstream has been silent for a configurable interval; (4) turn an upstream that dies mid-stream into a clearly marked final event for the client instead of a silent end; and (5) write one summary line per stream. Test it with a seeded fuzz that cuts both directions of the byte stream at random offsets, including inside UTF-8 characters, and with a stand-in script that stalls, truncates and errors. No code is given: design the interfaces yourself, and write down which of the five outcomes each test exercises.

## Interview questions

> [!interview] Users report that the chat feature "freezes for ten seconds and then shows the whole answer at once", although the code sets `stream=true`. How do you find the cause?

<details><summary>What a strong answer covers</summary>

- The bytes may arrive in time and be held back later: measure TTFT at each hop (provider to server, server to proxy, proxy to browser) with the same instrumented client, instead of guessing.
- Likely culprits: a reverse proxy or CDN buffering the response, compression or a framework middleware that collects the body, a client that calls `read()`/`text()` instead of iterating, an HTTP library that buffers by default, or an event handler that only repaints at the end. The SSE standard itself warns that block buffering "can cause delays in event dispatch".
- A proxy configured for streaming also needs the right headers and no response buffering; keep-alive comments help idle-timeout proxies.
- Distinguishes TTFT from total time, and checks whether the model is a reasoning model that is simply thinking before the first visible token (Module 05).

</details>

> [!interview] Design the failure behaviour of a streaming chat endpoint that your own browser clients call. What happens on a dropped connection, on a retry, and when the user closes the tab?

<details><summary>What a strong answer covers</summary>

- Separates before-first-byte failures (ordinary retry with backoff and jitter) from mid-stream failures (the user has already seen text).
- Mid-stream options with trade-offs: discard and restart visibly; mark the message as interrupted and let the user ask to continue; or use a resumable design such as background mode with a sequence-number cursor, noting its higher TTFT.
- Never appends a regenerated answer to a partial one; records each message's outcome (complete, incomplete, failed, truncated, cancelled).
- Propagates a client disconnect to the upstream request so tokens are not generated for nobody, and says honestly that billing after a disconnect must be checked rather than assumed.
- Idempotency and duplicate protection (event numbers, increasing sequence check), keep-alives, and timeouts on the gap between bytes.

</details>

> [!interview] How do you rebuild tool calls from a stream, and when is it safe to execute them?

<details><summary>What a strong answer covers</summary>

- Chat: accumulate `delta.tool_calls` fragments keyed by `index` (and choice index), concatenating `arguments` strings; `id` and `name` typically arrive with the first fragment. Responses: key by `output_index` with `output_item.added` plus `function_call_arguments.delta`, and compare with `.done`.
- Executes only after the call is complete (the finish reason is `tool_calls`, or the `.done` events), then parses and validates the JSON against the function's schema, because the model may emit invalid arguments.
- Handles several calls in one response, and never acts on a truncated or incomplete stream.
- May stream partial arguments to the UI for progress only, clearly as a display.

</details>

## Common mistakes & troubleshooting

- **All the text appears at once.** Something between the server and the user buffers the body: a proxy, a compression layer, an HTTP client that reads the whole response, or UI code that only renders at the end. Measure TTFT at each hop (block 5 shows a buffering client versus a streaming one on identical bytes).
- **`JSONDecodeError` on the last frame.** The Chat Completions stream ends with the literal `data: [DONE]`. Check for it before `json.loads`.
- **`UnicodeDecodeError`, or mojibake such as `Ã©`, in streamed text.** Chunks were decoded one by one. Decode complete lines from a byte buffer (block 1) and run the fuzz in block 2.
- **Event type, data or IDs go missing for a few events after a CRLF stream.** A lone-CR/LF boundary bug. Treat CRLF as one terminator even when the CR and LF arrive in different chunks.
- **The same sentence appears twice after a reconnect.** A retry appended a new generation to a partial one. Discard the partial text, or resume with a cursor and check that `sequence_number` only increases.
- **`IndexError: list index out of range` on `chunk.choices[0]`.** With `include_usage` the final chunk has `choices == []`. Guard it.
- **No usage in the response.** You did not set `stream_options.include_usage` (Chat), or the stream was cut or cancelled before the final chunk (both APIs).
- **A tool call's arguments are not valid JSON.** The stream was truncated, you parsed before the call was complete, or the model produced invalid JSON; validate, and refuse to run an incomplete call.
- **The connection hangs forever.** There is no read timeout between bytes, or an intermediary dropped an idle connection. Set a timeout on the gap between reads and handle keep-alive comments.
- **A parser that is fine locally breaks in production.** Local servers send whole events per packet; production networks cut anywhere. Test with the every-offset and random-split harness.

## Further reading & sources

- [HTML Living Standard: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html) - the normative SSE rules (line endings, fields, dispatch, comments, keep-alive advice) that block 1 implements.
- [OpenAI: Streaming API responses](https://developers.openai.com/api/docs/guides/streaming-responses) - the guide to `stream=true`, the typed Responses events and the moderation caveat.
- [OpenAI API reference: Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events) - the full list of typed events and their fields.
- [OpenAI API reference: Chat Completions streaming events](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events) - the `chat.completion.chunk` object, `[DONE]` and `stream_options`.
- [OpenAI: Function calling (streaming section)](https://developers.openai.com/api/docs/guides/function-calling) - how streamed function-call arguments are announced, extended and finalised.
- [OpenAI: Background mode](https://developers.openai.com/api/docs/guides/background) - cancelling, `background` plus `stream`, and resuming with `starting_after`.
- [OpenAI: Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization) - where streaming sits among the principles for making users wait less.
- [openai/openai-python](https://github.com/openai/openai-python) - the SDK README (streaming, retries, timeouts, errors) and source (`_streaming.py`, `_deltas.py`) this module read for the reference decoder and accumulator.

## Next

[Module 04: Model Families and Generations](../04-model-families-and-generations/README.md)
