# Module 07: Structured Outputs and JSON Schema

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**, module 07 of 00-18. [Module 06: Function Calling Basics](../06-function-calling-basics/README.md) ended with strict mode as a one-paragraph teaser; this module is the full story of getting JSON you can trust, whether it comes back as a tool call's arguments or as the model's whole answer. It assumes you can make a request in either API style ([Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md), [Module 02: The Responses API and Statefulness](../02-the-responses-api-and-statefulness/README.md)) and know that a model produces text one token at a time ([Track 01: Tokens and Language Modeling](../../01-tokens-and-language-modeling/README.md)).

After this module you can:

- choose between the three levels of "give me JSON" and write the request fields for each in both API styles;
- state the documented limits of the strict-mode JSON Schema subset, and check a schema against them before you send it;
- classify every response (ok, refusal, incomplete, not JSON, wrong shape) instead of assuming success;
- explain, with a working toy, why schema-constrained decoding can guarantee valid output and what the guarantee does not cover;
- use the Pydantic and zod schema helpers (shown, not executed) knowing what they hide.

Why it matters: almost every real LLM feature is a program consuming model output. A parser that fails one time in fifty is an outage generator, and a schema that quietly allows nonsense is a data-quality problem you will find in production.

> [!note] Sources and dates. Everything attributed to "the guide" is from OpenAI's [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs) page; field names come from the OpenAI OpenAPI spec (`openai/openai-openapi`, commit dated 2026-10-24); SDK helper names come from `helpers.md` in `openai-python`. All were fetched on 2026-10-26. The official docs are the source of truth and may have changed since; check them before relying on any limit quoted here. No model was called in this module.

## Concept

> [!key] There are three levels of "give me JSON": ask in the prompt (no guarantee), JSON mode (valid JSON, any shape), and schema-constrained Structured Outputs (your shape). Even the strongest level covers only a *completed* answer to a request the model did not refuse, so your code still classifies and validates every response.

## Explanation

### Three levels

| Level | How you ask | What the docs promise | What you still handle |
|---|---|---|---|
| 1. Ask nicely | Only the prompt: "reply with a JSON object" | Nothing | text around the JSON, code fences, wrong keys, truncation |
| 2. JSON mode | Chat: `response_format: {"type": "json_object"}`. Responses: `text: {"format": {"type": "json_object"}}` | Valid JSON, "except for in some edge cases that you should detect and handle appropriately" | any shape at all; incomplete JSON; refusals |
| 3. Structured Outputs | Chat: `response_format: {"type": "json_schema", "json_schema": {"name", "schema", "strict": true}}`. Responses: `text: {"format": {"type": "json_schema", "name", "schema", "strict": true}}`. Or `strict: true` on a function tool | Output that "adhere[s] to your supplied JSON Schema" | refusals; incomplete output; mistakes of *content*; schemas outside the subset |

Block 1 prints those request fields exactly. Note that the schema moves up one level in the Responses style (no nested `json_schema` object). The spec's field description says `strict` defaults to `false` for both shapes, so set it explicitly instead of relying on a default.

The guide's own comparison: "While both ensure valid JSON is produced, only Structured Outputs ensure schema adherence", and "We recommend always using Structured Outputs instead of JSON mode when possible". The Responses reference text goes further and marks `json_object` as "Not recommended for gpt-4o and newer models". Support depends on the model: the guide has a comparison table of compatible models, so look up yours rather than assuming.

JSON mode has two traps from the guide. You must instruct the model to produce JSON somewhere in the conversation: "If you don't include an explicit instruction to generate JSON, the model may generate an unending stream of whitespace", and the API "will throw an error if the string `JSON` does not appear somewhere in the context". And it "will not guarantee the output matches any specific schema, only that it is valid and parses without errors".

Structured Outputs come in two forms, and the guide says when to use which: "If you are connecting the model to tools, functions, data, etc. in your system, then you should use function calling - If you want to structure the model's output when it responds to the user, then you should use a structured `text.format`." Both use the same schema machinery.

### The supported subset, as documented

Strict mode accepts "a subset of the JSON Schema language". The table restates the guide's "Supported schemas" section (checked 2026-10-26); the right-hand column says what the `lint` function in block 2 does with each rule.

| The page says | Block 2 `lint` |
|---|---|
| Supported types: String, Number, Boolean, Integer, Object, Array, Enum, `anyOf` | unknown `type` is an error |
| String: `pattern`, and `format` of `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid` | other formats are errors |
| Number: `multipleOf`, `maximum`, `exclusiveMaximum`, `minimum`, `exclusiveMinimum` | allowed |
| Array: `minItems`, `maxItems` | allowed |
| "the root level object of a schema must be an object, and not use `anyOf`" | error |
| "all fields or function parameters must be specified as `required`"; optional is emulated "by using a union type with `null`" | error if a property is not in `required` |
| "we require developers to set `additionalProperties: false`" on every object | error if missing |
| "up to 5000 object properties total, with up to 10 levels of nesting" | errors over the limits |
| "total string length of all property names, definition names, enum values, and const values cannot exceed 120,000 characters" | error over the limit |
| "up to 1000 enum values across all enum properties"; over 250 values in one string enum, the total length "cannot exceed 15,000 characters" | errors over the limits |
| "outputs will be produced in the same order as the ordering of keys in the schema" | (a design consequence, below) |
| Not supported yet, composition keywords: `allOf`, `not`, `dependentRequired`, `dependentSchemas`, `if`, `then`, `else` | errors |
| `$defs` and recursion (`"$ref": "#"` or a definition that refers to itself) are supported | `$ref` must resolve |
| Fine-tuned models additionally lose `minLength`, `maxLength`, `pattern`, `format`, `minimum`, `maximum`, `multipleOf`, `patternProperties`, `minItems`, `maxItems` | not modelled |

The guide adds that "If you turn on Structured Outputs by supplying `strict: true` and call the API with an unsupported JSON Schema, you will receive an error": the API is the final judge. The OpenAPI spec corroborates the numbers in a machine-readable block (`x-openai-structured-output-limits`, version 1): 5000 properties, nesting depth 10, 1000 enum values, 120000 characters, a "large enum" threshold of 250 with 15000 characters, and three details the prose lacks: string length is measured in Unicode code points, the property count is scoped to the root or a definition, and a definition referenced many times counts once.

> [!pitfall] Gaps in the documentation, which the linter reports as `warn` rather than guessing. (1) `minLength` and `maxLength` are not in the "supported string properties" list, yet appear among the keywords unsupported *only for fine-tuned models*, which suggests they may work otherwise; the page does not say. (2) "10 levels of nesting" is not defined precisely; block 2 counts nested objects with the root as level 1. (3) Not every keyword you may use is listed (`default`, `examples`, `$schema`): if in doubt, send the schema and let the API answer, or leave the keyword out.

> [!pitfall] The guide's own "optional field" example is `"type": ["string", "null"]` together with `"enum": ["F", "C"]`. A standard JSON Schema validator rejects `null` there, because `null` is not in the enum (block 3 tests exactly this). I did not test what the API returns for that schema. If you validate model output with a standard validator, write the enum as `["F", "C", null]` so both agree.

### Refusals and incomplete output

Even with a schema, the guide says the model "might not generate a valid response that matches the provided JSON schema. This can happen in the case of a refusal... or if for example you reach a max tokens limit and the response is incomplete".

- **Refusal.** "Since a refusal does not necessarily follow the schema you have supplied... the API response will include a new field called `refusal`". Responses style: a content part `{"type": "refusal", "refusal": "..."}` instead of `output_text` (the guide's example has `status: "completed"` and the refusal text in `output[].content[]`). Chat style: `message.refusal` is a string (and `content` is typically `null`; both are nullable in the spec). When streaming, refusals arrive as `response.refusal.delta` events.
- **Truncation.** Responses style: `status: "incomplete"` with `incomplete_details.reason`; the guide's code checks `max_output_tokens`, and for JSON mode also `content_filter`. Chat style: `finish_reason` of `length` or `content_filter`. Whatever text is there is a *prefix* of an answer and will usually not parse.
- **SDK helpers** turn these into exceptions or `None`: `helpers.md` says `chat.completions.parse()` raises `LengthFinishReasonError` or `ContentFilterFinishReasonError` for those finish reasons, and `responses.parse()` returns `output_parsed` as `None` when there is no parsed result, without using commentary as a fallback after a refusal.

Block 4 classifies nine hand-built responses in the documented shapes.

### Why you still validate

1. **The guarantee has a precondition.** It covers a response that finished and was not refused. Block 5 shows that cutting a constrained generation short yields invalid JSON 100% of the time.
2. **Shape is not truth.** The guide: "Structured Outputs can still contain mistakes." A valid enum value can still be the wrong one, and "The model will always try to adhere to the provided schema, which can result in hallucinations if the input is completely unrelated to the schema." Give the model an escape hatch (an `"unknown"` enum value, a nullable field) and tell it when to use it.
3. **The schema cannot say everything.** Cross-field rules (`end` after `start`), uniqueness, and "this id exists in my database" are your code's job. Keywords the subset omits, and `minLength`-style gaps, are not enforced either.
4. **You may not always be at level 3.** A different model, a different provider, an open-weight model behind a gateway, or a request where `strict` was false or defaulted differently. The Function calling guide says that if you omit `strict` on a function, "Responses requests will attempt to normalize your schema into strict mode when possible" and "Chat Completions requests remain non-strict by default".
5. **Your types drift.** The guide: "we strongly recommend using native SDK schema helpers where available" so the schema and your code's types cannot diverge.

The guide lists "No need to validate or retry incorrectly formatted responses" among the benefits of Structured Outputs. Read that as being about *formatting* of finished responses; the five points above are why a thin validation layer is cheap insurance.

### Why a schema can be a guarantee: constrained decoding

A language model does not write a whole answer at once. At each step it produces a score (a *logit*) for every token in its vocabulary, turns the scores into probabilities with softmax, and samples one token ([Module 16: Sampling Strategies: Greedy, Temperature, Top-k, Top-p](../../01-tokens-and-language-modeling/16-sampling-strategies-greedy-temperature-top-k-top-p/README.md)). An unconstrained model can sample any token at any step, so a single stray token breaks the JSON.

**Constrained decoding** adds one step: before softmax, work out which tokens could still lead to a schema-valid completion given the text so far, and set every other logit to minus infinity. Those tokens then have probability exactly zero, so the output *cannot* leave the schema. The set of allowed tokens comes from compiling the schema into a finite-state machine or grammar; the paper cited below describes one published way to do that efficiently. **OpenAI's pages do not say how their feature is implemented**, so this is the intuition for why a guarantee is possible, not a description of their system.

> [!model] A railway with points set in advance. The model is a train that would happily wander off, but the schema has set every junction ahead of it, so the only track that exists at each step is a valid one. It still decides *which* valid track (the content); it cannot choose to leave the rails. And if the line is cut short (token limit) the train stops in a field: valid so far, not arrived.

Each documented restriction is something a mask can express, which is a good way to remember them: `required` plus `additionalProperties: false` means a closed list of keys in a fixed order (hence the key-ordering note); an `enum` means a closed set of value tokens; `minItems` and `maxItems` mean a counter. Block 5 builds this: it compiles a small schema into an automaton, adds a pretend language model whose logits prefer the right tokens without being certain, and compares an unconstrained sampler with a masked one on the same logits.

Two things the toy shows that are easy to miss. Masking renormalises step by step, so the masked decoder is *not* the same as "sample until the output happens to be valid" (the total-variation distance in the output is small here and shrinks as the model improves, but it exists). And the guarantee is a property of the decoder, not of the model: a better model makes unconstrained failures rarer (exercise 2), only the mask makes them impossible.

### Schema design tips

From the guide: "Name keys clearly and intuitively", "Create clear titles and descriptions for important keys in your structure", and "Create and use evals to determine the structure that works best for your use case". From the Function calling guide: "Use enums and object structure to prevent invalid states". From the mechanics above:

- **Enums over free text** wherever the set is closed, with an explicit `"other"` or `"unknown"` value so unrelated input has somewhere to go.
- **Optional means nullable.** Every property is required, so write `"type": ["string", "null"]` for "may be absent" and say in the `description` when to use `null`.
- **Order keys deliberately.** Output follows key order, so put a field the model should think through (`reasoning`, `evidence`) before the field that depends on it (`answer`), as the guide's math example does with `steps` before `final_answer`. This is a consequence of left-to-right generation, not a quality claim.
- **Keep it shallow and small.** Fewer properties and levels are easier for the model, stay inside the limits, and cost fewer input tokens, since the schema is part of the request.
- **Put rules the schema cannot express in code**, and say the important ones in the `description` too.
- **Pin and test.** Change a schema like an API: version it and run your evals before and after.

Prompting for structured output (few-shot examples, delimiters, repair loops) is a prompt-engineering skill covered in [Track 07: Prompt Engineering](../../07-prompt-engineering/README.md), [Module 08: Structured Output Prompting](../../07-prompt-engineering/08-structured-output-prompting/README.md).

## Code

Everything runs with Python's standard library plus numpy, and makes no network calls. Save blocks 1-5 in order as one file (for example `structured_demo.py`) and run it; the whole file ran for this module, twice, with identical output. Responses in block 4 are **hand-written fixtures in the documented shapes (from the spec and the guide's examples), not API output**; the "language model" in block 5 is a **stand-in with made-up logits, not a trained model**.

### Block 1: the three levels as request fields

```python
import json

EVENT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Short event title"},
        "date": {"type": ["string", "null"], "format": "date", "description": "ISO date, or null if the text has none"},
        "kind": {"type": "string", "enum": ["meeting", "deadline", "social", "other"]},
        "attendees": {"type": "array", "items": {"type": "string"}, "maxItems": 20},
        "priority": {"type": "integer", "minimum": 1, "maximum": 5},
    },
    "required": ["title", "date", "kind", "attendees", "priority"],
    "additionalProperties": False,
}


def request_fields(api, level):
    """The request fields that change between the three levels. `api` is "chat" or "responses"."""
    if level == 1:                                   # ask nicely: only the prompt changes
        return {}
    if level == 2:                                   # JSON mode
        return ({"response_format": {"type": "json_object"}} if api == "chat"
                else {"text": {"format": {"type": "json_object"}}})
    if api == "chat":                                # level 3: Structured Outputs
        return {"response_format": {"type": "json_schema",
                                    "json_schema": {"name": "event", "strict": True, "schema": EVENT_SCHEMA}}}
    return {"text": {"format": {"type": "json_schema", "name": "event", "strict": True, "schema": EVENT_SCHEMA}}}


for level in (1, 2, 3):
    for api in ("chat", "responses"):
        fields = request_fields(api, level)
        if fields:
            shown = json.dumps(fields).replace(json.dumps(EVENT_SCHEMA), '"<EVENT_SCHEMA>"')   # display only
        else:
            shown = "{}   <- nothing changes; the instruction lives in the prompt"
        print(f"level {level} {api:9} {shown}")
```

Output:

```
level 1 chat      {}   <- nothing changes; the instruction lives in the prompt
level 1 responses {}   <- nothing changes; the instruction lives in the prompt
level 2 chat      {"response_format": {"type": "json_object"}}
level 2 responses {"text": {"format": {"type": "json_object"}}}
level 3 chat      {"response_format": {"type": "json_schema", "json_schema": {"name": "event", "strict": true, "schema": "<EVENT_SCHEMA>"}}}
level 3 responses {"text": {"format": {"type": "json_schema", "name": "event", "strict": true, "schema": "<EVENT_SCHEMA>"}}}
```

### Block 2: a schema linter for the documented strict-mode rules

```python
REJECTED = {"allOf", "not", "dependentRequired", "dependentSchemas", "if", "then", "else"}  # guide: "not yet supported"
TYPES = {"string", "number", "integer", "boolean", "object", "array", "null"}
STRUCTURE = {"type", "description", "title", "enum", "const", "anyOf", "$ref", "$defs", "properties", "required",
             "additionalProperties", "items"}
PER_TYPE = {"string": {"pattern", "format"},
            "number": {"multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum"},
            "integer": {"multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum"},
            "array": {"minItems", "maxItems"}}
FORMATS = {"date-time", "time", "date", "duration", "email", "hostname", "ipv4", "ipv6", "uuid"}
LIMITS = {"properties": 5000, "depth": 10, "enum_values": 1000, "chars": 120_000,
          "big_enum": 250, "big_enum_chars": 15_000}      # numbers from the guide's "Supported schemas" section


def lint(schema):
    """Check a schema against the restrictions the guide documents for strict mode.
    Returns [(level, path, message)]. ERROR = documented as rejected; warn = not on the documented list."""
    issues, total = [], {"properties": 0, "enum_values": 0, "chars": 0}
    err = lambda path, msg: issues.append(("ERROR", path, msg))
    warn = lambda path, msg: issues.append(("warn", path, msg))

    def walk(node, path, depth):
        if not isinstance(node, dict):
            return err(path, "a schema must be a JSON object")
        types = node.get("type", [])
        types = types if isinstance(types, list) else [types]
        for key in node:
            if key in REJECTED:
                err(f"{path}.{key}", f"`{key}` is documented as not supported")
            elif key not in STRUCTURE and not any(key in PER_TYPE.get(t, ()) for t in types):
                warn(f"{path}.{key}", f"`{key}` is not on the documented list for type {types}")
        for t in types:
            if t not in TYPES:
                err(path, f"unsupported type {t!r}")
        if node.get("format") is not None and node["format"] not in FORMATS:
            err(f"{path}.format", f"format {node['format']!r} is not in the documented list")
        if "enum" in node:
            values = node["enum"]
            chars = sum(len(v) for v in values if isinstance(v, str))
            total["enum_values"] += len(values)
            total["chars"] += chars
            if len(values) > LIMITS["big_enum"] and chars > LIMITS["big_enum_chars"]:
                err(f"{path}.enum", f"{len(values)} values with {chars} characters: over {LIMITS['big_enum_chars']}")
        if isinstance(node.get("const"), str):
            total["chars"] += len(node["const"])
        ref = node.get("$ref")
        if ref is not None and not (ref == "#" or (ref.startswith("#/$defs/") and ref[8:] in defs)):
            err(f"{path}.$ref", f"cannot resolve {ref!r}")
        for i, sub in enumerate(node.get("anyOf", [])):
            walk(sub, f"{path}.anyOf[{i}]", depth)
        if "items" in node:
            walk(node["items"], f"{path}[]", depth)
        if "object" in types or "properties" in node:
            if depth > LIMITS["depth"]:
                err(path, f"object nesting deeper than {LIMITS['depth']} levels (counting the root as 1)")
            props = node.get("properties", {})
            total["properties"] += len(props)
            total["chars"] += sum(len(k) for k in props)
            if node.get("additionalProperties") is not False:
                err(path, "`additionalProperties` must be false")
            missing = [k for k in props if k not in node.get("required", [])]
            if missing:
                err(path, f"every property must be required; not in `required`: {missing}")
            for key, sub in props.items():
                walk(sub, f"{path}.{key}", depth + 1)

    defs = schema.get("$defs", {})
    if schema.get("type") != "object" or "anyOf" in schema:
        err("$", "the root must be an object schema and must not be an `anyOf`")
    walk(schema, "$", 1)
    for name, sub in defs.items():                       # each definition is counted once, however often it is used
        total["chars"] += len(name)
        walk(sub, f"$defs.{name}", 1)
    for key, limit in (("properties", LIMITS["properties"]), ("enum_values", LIMITS["enum_values"]),
                       ("chars", LIMITS["chars"])):
        if total[key] > limit:
            err("$", f"total {key} = {total[key]} is over the documented limit of {limit}")
    return issues


def obj(props, **more):                                   # a strict-style object schema, easy to break on purpose
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False, **more}


def nest(levels):                                         # an object nested `levels` deep, otherwise valid
    node = obj({"leaf": {"type": "string"}})
    for _ in range(levels - 1):
        node = obj({"child": node})
    return node


no_extra = obj({"a": {"type": "string"}})
del no_extra["additionalProperties"]
CASES = [  # (name, schema, how many ERRORs to expect)
    ("the EVENT_SCHEMA above", EVENT_SCHEMA, 0),
    ("optional field via a null union", obj({"a": {"type": ["string", "null"]}}), 0),
    ("additionalProperties missing", no_extra, 1),
    ("a property left out of `required`", obj({"a": {"type": "string"}}, required=[]), 1),
    ("root is an anyOf", {"anyOf": [obj({"a": {"type": "string"}})]}, 1),
    ("allOf is not supported", obj({"a": {"type": "string"}}, allOf=[{}]), 1),
    ("if/then/else are not supported", obj({"a": {"type": "string"}}, **{"if": {}, "then": {}, "else": {}}), 3),
    ("a $ref that does not resolve", obj({"a": {"$ref": "#/$defs/nope"}}), 1),
    ("unknown string format", obj({"a": {"type": "string", "format": "phone"}}), 1),
    ("10 nested levels", nest(10), 0),
    ("11 nested levels", nest(11), 1),
    ("1001 enum values", obj({"a": {"enum": [f"v{i}" for i in range(1001)]}}), 1),
    ("minLength: not on the documented list", obj({"a": {"type": "string", "minLength": 1}}), 0),
]
for name, schema, expected in CASES:
    issues = lint(schema)
    errors = [i for i in issues if i[0] == "ERROR"]
    status = "ok  " if len(errors) == expected else "FAIL"
    note = "; ".join(f"{lvl} {path}: {msg}" for lvl, path, msg in issues)[:95]
    print(f"{status} {name:40} errors={len(errors)} {note}".rstrip())
```

Output:

```
ok   the EVENT_SCHEMA above                   errors=0
ok   optional field via a null union          errors=0
ok   additionalProperties missing             errors=1 ERROR $: `additionalProperties` must be false
ok   a property left out of `required`        errors=1 ERROR $: every property must be required; not in `required`: ['a']
ok   root is an anyOf                         errors=1 ERROR $: the root must be an object schema and must not be an `anyOf`
ok   allOf is not supported                   errors=1 ERROR $.allOf: `allOf` is documented as not supported
ok   if/then/else are not supported           errors=3 ERROR $.if: `if` is documented as not supported; ERROR $.then: `then` is documented as not supp
ok   a $ref that does not resolve             errors=1 ERROR $.a.$ref: cannot resolve '#/$defs/nope'
ok   unknown string format                    errors=1 ERROR $.a.format: format 'phone' is not in the documented list
ok   10 nested levels                         errors=0
ok   11 nested levels                         errors=1 ERROR $.child.child.child.child.child.child.child.child.child.child: object nesting deeper than
ok   1001 enum values                         errors=1 ERROR $: total enum_values = 1001 is over the documented limit of 1000
ok   minLength: not on the documented list    errors=0 warn $.a.minLength: `minLength` is not on the documented list for type ['string']
```

`lint` reports `ERROR` for anything the guide documents as rejected and `warn` for keywords it does not list. It is a preflight check that saves a round trip; the API remains the authority.

### Block 3: a stdlib validator for the same subset

```python
import datetime
import ipaddress
import re
import uuid
from decimal import Decimal


def _fmt_datetime(s):
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})", s)) and \
        _ok(lambda: datetime.datetime.fromisoformat(s.replace("Z", "+00:00").replace("z", "+00:00")))


def _ok(fn):
    try:
        fn()
        return True
    except ValueError:
        return False


FORMAT_CHECKS = {   # deliberately simple stdlib rules: close to, not identical to, the RFCs
    "date-time": _fmt_datetime,
    "date": lambda s: bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s)) and _ok(lambda: datetime.date.fromisoformat(s)),
    "time": lambda s: bool(re.fullmatch(r"\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?", s))
    and _ok(lambda: datetime.time.fromisoformat(s.replace("Z", "+00:00"))),
    "duration": lambda s: bool(re.fullmatch(r"P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?", s)),
    "email": lambda s: bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", s)),
    "hostname": lambda s: bool(re.fullmatch(r"(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*", s)),
    "ipv4": lambda s: _ok(lambda: ipaddress.IPv4Address(s)),
    "ipv6": lambda s: _ok(lambda: ipaddress.IPv6Address(s)),
    "uuid": lambda s: bool(re.fullmatch(r"[0-9a-fA-F-]{36}", s)) and _ok(lambda: uuid.UUID(s)),
}


def same(a, b):
    """JSON equality: True is not 1, and containers compare element by element."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def is_type(value, name):
    if name == "null":
        return value is None
    if name == "boolean":
        return isinstance(value, bool)
    if isinstance(value, bool):
        return False
    return {"string": isinstance(value, str), "object": isinstance(value, dict), "array": isinstance(value, list),
            "number": isinstance(value, (int, float)),
            "integer": isinstance(value, int) or (isinstance(value, float) and value.is_integer())}[name]


def validate(value, schema, root=None, path="$"):
    """Return a list of error strings (empty = valid) for the subset of JSON Schema the guide documents."""
    root = schema if root is None else root
    if "$ref" in schema:
        ref = schema["$ref"]
        target = root if ref == "#" else root["$defs"][ref.removeprefix("#/$defs/")]
        return validate(value, target, root, path)
    errors = []
    if "anyOf" in schema and not any(not validate(value, sub, root, path) for sub in schema["anyOf"]):
        errors.append(f"{path}: matches none of the anyOf alternatives")
    if "type" in schema:
        names = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(is_type(value, n) for n in names):
            return errors + [f"{path}: expected {'|'.join(names)}, got {type(value).__name__}"]
    if "enum" in schema and not any(same(value, v) for v in schema["enum"]):
        errors.append(f"{path}: {value!r} is not one of {schema['enum']}")
    if "const" in schema and not same(value, schema["const"]):
        errors.append(f"{path}: must equal {schema['const']!r}")
    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: does not match pattern {schema['pattern']}")
        if "format" in schema and not FORMAT_CHECKS[schema["format"]](value):
            errors.append(f"{path}: not a valid {schema['format']}")
    if is_type(value, "number") and not isinstance(value, bool):
        d = Decimal(str(value))
        for key, bad in (("minimum", lambda m: d < Decimal(str(m))), ("maximum", lambda m: d > Decimal(str(m))),
                         ("exclusiveMinimum", lambda m: d <= Decimal(str(m))),
                         ("exclusiveMaximum", lambda m: d >= Decimal(str(m))),
                         ("multipleOf", lambda m: d % Decimal(str(m)) != 0)):
            if key in schema and bad(schema[key]):
                errors.append(f"{path}: {value} violates {key} {schema[key]}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: fewer than {schema['minItems']} items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: more than {schema['maxItems']} items")
        for i, item in enumerate(value):
            errors += validate(item, schema.get("items", {}), root, f"{path}[{i}]")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        errors += [f"{path}.{k}: required property is missing" for k in schema.get("required", []) if k not in value]
        for k, v in value.items():
            if k in props:
                errors += validate(v, props[k], root, f"{path}.{k}")
            elif schema.get("additionalProperties") is False:
                errors.append(f"{path}.{k}: additional property is not allowed")
    return errors


good_event = {"title": "Launch review", "date": "2026-11-03", "kind": "meeting", "attendees": ["Ada", "Bob"],
              "priority": 2}
LINKED = {"type": "object", "properties": {"value": {"type": "number"}, "next": {"anyOf": [{"$ref": "#"}, {"type": "null"}]}},
          "required": ["value", "next"], "additionalProperties": False}
DOCS_UNIT = {"type": "object", "properties": {"unit": {"type": ["string", "null"], "enum": ["F", "C"]}},
             "required": ["unit"], "additionalProperties": False}      # the guide's own "optional via null" example
TESTS = [  # (name, instance, schema, expected_valid)
    ("valid event", good_event, EVENT_SCHEMA, True),
    ("null date is allowed by the union", good_event | {"date": None}, EVENT_SCHEMA, True),
    ("missing required key", {k: v for k, v in good_event.items() if k != "kind"}, EVENT_SCHEMA, False),
    ("extra key", good_event | {"mood": "happy"}, EVENT_SCHEMA, False),
    ("enum violation", good_event | {"kind": "party"}, EVENT_SCHEMA, False),
    ("priority above maximum", good_event | {"priority": 9}, EVENT_SCHEMA, False),
    ("priority 3.0 counts as an integer", good_event | {"priority": 3.0}, EVENT_SCHEMA, True),
    ("priority 2.5 is not an integer", good_event | {"priority": 2.5}, EVENT_SCHEMA, False),
    ("True is not the integer 1", good_event | {"priority": True}, EVENT_SCHEMA, False),
    ("bad calendar date", good_event | {"date": "2026-02-30"}, EVENT_SCHEMA, False),
    ("attendees must hold strings", good_event | {"attendees": ["Ada", 7]}, EVENT_SCHEMA, False),
    ("too many attendees", good_event | {"attendees": ["x"] * 21}, EVENT_SCHEMA, False),
    ("linked list, 2 nodes ($ref to #)", {"value": 1, "next": {"value": 2, "next": None}}, LINKED, True),
    ("linked list, bad inner node", {"value": 1, "next": {"value": "2", "next": None}}, LINKED, False),
    ("multipleOf 0.1 accepts 0.3", 0.3, {"type": "number", "multipleOf": 0.1}, True),
    ("exclusiveMinimum rejects the bound", 0, {"type": "number", "exclusiveMinimum": 0}, False),
    ("a pattern is not anchored by itself", "xxabcxx", {"type": "string", "pattern": "abc"}, True),
    ("an anchored pattern rejects", "xx@abc_9", {"type": "string", "pattern": "^@[a-z0-9_]+$"}, False),
    ("uuid format", "123e4567-e89b-12d3-a456-426614174000", {"type": "string", "format": "uuid"}, True),
    ("email format", "not-an-email", {"type": "string", "format": "email"}, False),
    ("date-time needs an offset", "2026-10-26T10:00:00", {"type": "string", "format": "date-time"}, False),
    ("duration", "P1DT2H", {"type": "string", "format": "duration"}, True),
    ("docs' null-union example, value 'C'", {"unit": "C"}, DOCS_UNIT, True),
    ("docs' null-union example, value null", {"unit": None}, DOCS_UNIT, False),
    ("same, with None added to the enum", {"unit": None},
     {**DOCS_UNIT, "properties": {"unit": {"type": ["string", "null"], "enum": ["F", "C", None]}}}, True),
]
wrong = []
for name, instance, schema, expected in TESTS:
    problems = validate(instance, schema)
    if (not problems) != expected:
        wrong.append(name)
print(f"{len(TESTS) - len(wrong)}/{len(TESTS)} validator cases behave as expected; wrong: {wrong}")
for name, instance, schema, _ in TESTS[2:6] + TESTS[-2:-1]:
    print(f"  {name}: {validate(instance, schema)}")
```

Output:

```
25/25 validator cases behave as expected; wrong: []
  missing required key: ['$.kind: required property is missing']
  extra key: ['$.mood: additional property is not allowed']
  enum violation: ["$.kind: 'party' is not one of ['meeting', 'deadline', 'social', 'other']"]
  priority above maximum: ['$.priority: 9 violates maximum 5']
  docs' null-union example, value null: ["$.unit: None is not one of ['F', 'C']"]
```

The last line is the pitfall from the Explanation: the guide's own null-union example rejects `null` under standard semantics. Real projects should use the `jsonschema` package; this version exists to make the rules concrete and testable. Three honest limits: `format` checks are simple stdlib rules, `pattern` uses Python's `re` while JSON Schema specifies the ECMA-262 dialect (so exotic patterns can differ), and nothing here supports keywords outside the documented subset.

### Block 4: classify every response

```python
import json


def classify(api, response, schema):
    """Turn one API response (a dict in the documented shape) into (outcome, detail). Never assumes success."""
    if api == "responses":
        if response.get("status") == "incomplete":                    # e.g. max_output_tokens, content_filter
            return "incomplete", response["incomplete_details"]["reason"]
        if response.get("status") == "failed":
            return "failed", str(response.get("error"))
        parts = [p for item in response["output"] if item["type"] == "message" for p in item["content"]]
        refusal = next((p["refusal"] for p in parts if p["type"] == "refusal"), None)
        text = next((p["text"] for p in parts if p["type"] == "output_text"), None)
    else:
        choice = response["choices"][0]
        if choice["finish_reason"] in ("length", "content_filter"):  # documented finish reasons
            return "incomplete", choice["finish_reason"]
        refusal, text = choice["message"].get("refusal"), choice["message"].get("content")
    if refusal:
        return "refusal", refusal                                     # a refusal need not match your schema
    try:
        data = json.loads(text)
    except (TypeError, json.JSONDecodeError) as e:
        return "not_json", str(e)[:50]
    problems = validate(data, schema)                                 # from block 3
    return ("schema_violation", problems) if problems else ("ok", data)


def responses_shape(status="completed", text=None, refusal=None, reason=None):
    part = {"type": "refusal", "refusal": refusal} if refusal else {"type": "output_text", "text": text}
    return {"status": status, "incomplete_details": {"reason": reason} if reason else None, "error": None,
            "output": [{"type": "message", "role": "assistant", "status": status, "content": [part]}]}


def chat_shape(finish="stop", content=None, refusal=None):
    return {"choices": [{"index": 0, "finish_reason": finish,
                         "message": {"role": "assistant", "content": content, "refusal": refusal}}]}


whole = json.dumps(good_event)
FIXTURES = [  # hand-written from the documented shapes (the spec and the guide's examples), not API output
    ("responses: completed, valid", "responses", responses_shape(text=whole)),
    ("responses: refusal item", "responses", responses_shape(refusal="I'm sorry, I cannot assist with that request.")),
    ("responses: cut off by token limit", "responses",
     responses_shape("incomplete", whole[:40], reason="max_output_tokens")),
    ("responses: stopped by content filter", "responses", responses_shape("incomplete", whole[:10], reason="content_filter")),
    ("responses: valid JSON, wrong shape", "responses",
     responses_shape(text=json.dumps(good_event | {"priority": 9, "mood": "happy"}))),
    ("chat: stop, valid", "chat", chat_shape(content=whole)),
    ("chat: refusal field set", "chat", chat_shape(refusal="I'm sorry, I can't help with that.")),
    ("chat: finish_reason=length", "chat", chat_shape("length", whole[:40])),
    ("chat: JSON with chatter around it", "chat", chat_shape(content="Sure! Here it is: " + whole)),
]
for label, api, response in FIXTURES:
    outcome, detail = classify(api, response, EVENT_SCHEMA)
    print(f"{label:38} -> {outcome:16} {str(detail)[:70]}")
```

Output:

```
responses: completed, valid            -> ok               {'title': 'Launch review', 'date': '2026-11-03', 'kind': 'meeting', 'a
responses: refusal item                -> refusal          I'm sorry, I cannot assist with that request.
responses: cut off by token limit      -> incomplete       max_output_tokens
responses: stopped by content filter   -> incomplete       content_filter
responses: valid JSON, wrong shape     -> schema_violation ['$.priority: 9 violates maximum 5', '$.mood: additional property is n
chat: stop, valid                      -> ok               {'title': 'Launch review', 'date': '2026-11-03', 'kind': 'meeting', 'a
chat: refusal field set                -> refusal          I'm sorry, I can't help with that.
chat: finish_reason=length             -> incomplete       length
chat: JSON with chatter around it      -> not_json         Expecting value: line 1 column 1 (char 0)
```

Five different outcomes from nine responses, and only two are `ok`. A real service maps each outcome to a policy: `refusal` goes to the user, `incomplete` may be retried with a larger limit or a smaller ask, `not_json` and `schema_violation` (which levels 1 and 2 can produce) may be retried with the error appended, within a retry budget.

### Block 5: a toy constrained decoder

```python
import json
from collections import Counter

import numpy as np

EOS = "<eos>"
TOY_SCHEMA = {"type": "object",
              "properties": {"name": {"type": "string", "enum": ["Ada", "Bob", "Eve"]},
                             "age": {"type": "integer", "enum": [7, 30, 42]},
                             "tags": {"type": "array", "items": {"type": "string", "enum": ["x", "y"]},
                                      "minItems": 1, "maxItems": 2}},
              "required": ["name", "age", "tags"], "additionalProperties": False}


def compile_schema(schema):
    """Schema -> token automaton. trans[state] = {token_text: next_state}. Handles only what TOY_SCHEMA uses:
    an object whose properties are all required, string/integer enums, and an array of an enum."""
    trans = [{}]

    def new():
        trans.append({})
        return len(trans) - 1

    def emit(state, text):
        trans[state][text] = nxt = new()
        return nxt

    def build(node, state):
        if "enum" in node:                                  # only the listed values may be written
            end = new()
            for value in node["enum"]:
                trans[state][json.dumps(value)] = end
            return end
        if node["type"] == "object":                        # `required` + additionalProperties:false => exactly these keys
            state = emit(state, "{")
            for i, (key, sub) in enumerate(node["properties"].items()):
                if i:
                    state = emit(state, ",")
                state = build(sub, emit(emit(state, json.dumps(key)), ":"))
            return emit(state, "}")
        lo, hi, end = node["minItems"], node["maxItems"], new()      # array
        state = emit(state, "[")
        for k in range(hi):
            state = build(node["items"], state)
            if k + 1 >= lo:
                trans[state]["]"] = end                    # may close once minItems is reached
            if k + 1 < hi:
                state = emit(state, ",")                   # may not exceed maxItems
        return end

    final = build(schema, 0)
    trans[final][EOS] = new()
    return trans


TRANS = compile_schema(TOY_SCHEMA)
VOCAB = sorted({t for tr in TRANS for t in tr} | {"true", "null", "7.5", '"zzz"'})   # 4 tokens the schema never allows
TOK, EOS_ID = {t: i for i, t in enumerate(VOCAB)}, VOCAB.index(EOS)
S = len(TRANS)                                             # states 0..S-1; state S = "derailed"
NEXT = np.full((S + 1, len(VOCAB)), S)                     # NEXT[state, token] -> state (S if the token is off-grammar)
ALLOWED = np.zeros((S + 1, len(VOCAB)), dtype=bool)
for s, tr in enumerate(TRANS):
    for text, n in tr.items():
        NEXT[s, TOK[text]], ALLOWED[s, TOK[text]] = n, True
print(f"vocabulary: {len(VOCAB)} tokens, automaton: {S} states")

# A stand-in for a language model: logits = noise + a bonus on the tokens that are right at this state.
# It is NOT a trained model; it just prefers the grammar's tokens without being certain.
SKILL = 8.0
LOGITS = np.random.default_rng(0).normal(0.0, 1.0, size=(S + 1, len(VOCAB))) + SKILL * ALLOWED


def probabilities(constrained):
    x = np.where(ALLOWED | ~ALLOWED.any(axis=1, keepdims=True), LOGITS, -np.inf) if constrained else LOGITS
    p = np.exp(x - x.max(axis=1, keepdims=True))
    return p / p.sum(axis=1, keepdims=True)


def sample(constrained, n, max_len, seed):
    """Draw n sequences at once. `constrained` masks every step to the tokens the automaton allows."""
    cdf = probabilities(constrained).cumsum(axis=1)
    rng = np.random.default_rng(seed)
    state, done = np.zeros(n, dtype=int), np.zeros(n, dtype=bool)
    out = np.full((n, max_len), -1)
    for t in range(max_len):
        token = np.minimum((cdf[state] < rng.random(n)[:, None]).sum(axis=1), len(VOCAB) - 1)
        token = np.where(done, -1, token)
        out[:, t] = token
        state = np.where(done, state, NEXT[state, np.maximum(token, 0)])
        done |= token == EOS_ID
    return out


def judge(rows):
    """Classify decoded sequences with the independent stdlib validator from block 3."""
    cache, counts, example = {}, Counter(), {}
    for row in rows:
        stop = np.flatnonzero((row == EOS_ID) | (row < 0))
        text = "".join(VOCAB[t] for t in row[: stop[0] if len(stop) else len(row)])
        if text not in cache:
            try:
                data = json.loads(text)
                cache[text] = "valid" if not validate(data, TOY_SCHEMA) else "JSON, wrong shape"
            except json.JSONDecodeError:
                cache[text] = "not JSON"
        counts[cache[text]] += 1
        example.setdefault(cache[text], text)
    return counts, example


N = 20_000
for constrained in (False, True):
    counts, example = judge(sample(constrained, N, max_len=24, seed=1))
    if not constrained:
        FREE_VALID = counts["valid"]
    print(f"{'constrained  ' if constrained else 'unconstrained'} valid={counts['valid']:6d} "
          f"JSON-but-wrong-shape={counts['JSON, wrong shape']:5d} not-JSON={counts['not JSON']:5d} (of {N})")
    for kind in ("JSON, wrong shape", "not JSON"):
        if kind in example:
            print(f"    e.g. {kind}: {example[kind]}")

# Exact check: enumerate every valid output and its probability under each decoder.
P_FREE, P_MASK = probabilities(False), probabilities(True)
exact = {}


def walk(state, text, p_free, p_mask):
    for token_text, nxt in TRANS[state].items():
        i = TOK[token_text]
        if token_text == EOS:
            exact[text] = (p_free * P_FREE[state, i], p_mask * P_MASK[state, i])
        else:
            walk(nxt, text + token_text, p_free * P_FREE[state, i], p_mask * P_MASK[state, i])


walk(0, "", 1.0, 1.0)
free = np.array([v[0] for v in exact.values()])
mask = np.array([v[1] for v in exact.values()])
print(f"valid outputs: {len(exact)}; sum of constrained probabilities = {mask.sum():.6f}")
print(f"unconstrained decoder: exact chance of producing ANY valid output = {free.sum():.4f} "
      f"(measured above: {FREE_VALID / N:.4f})")
conditioned = free / free.sum()                              # what 'sample until valid' would produce
print(f"total-variation distance, masked decoder vs 'sample until valid' = {0.5 * np.abs(mask - conditioned).sum():.4f}")
counts, _ = judge(sample(True, N, max_len=24, seed=2))
print(f"constrained, second seed: valid={counts['valid']} of {N}")

# The guarantee needs the generation to FINISH.
counts, _ = judge(sample(True, 2_000, max_len=10, seed=3))
print(f"constrained but cut off at 10 tokens: {dict(counts)}")
```

Output:

```
vocabulary: 22 tokens, automaton: 19 states
unconstrained valid= 14929 JSON-but-wrong-shape=   12 not-JSON= 5059 (of 20000)
    e.g. JSON, wrong shape: "Ada"
    e.g. not JSON: {"name":"Eve","age":30,"tags":30true"age""x""Ada""Ada""tags"true"x""Ada"null:"x"
constrained   valid= 20000 JSON-but-wrong-shape=    0 not-JSON=    0 (of 20000)
valid outputs: 54; sum of constrained probabilities = 1.000000
unconstrained decoder: exact chance of producing ANY valid output = 0.7462 (measured above: 0.7464)
total-variation distance, masked decoder vs 'sample until valid' = 0.0030
constrained, second seed: valid=20000 of 20000
constrained but cut off at 10 tokens: {'not JSON': 2000}
```

Reading it:

- **Unconstrained:** with logits that favour the right token at each step, about 25% of 20,000 samples are still not valid. Once one token is wrong the pretend model is lost; the examples show the kinds of damage (keys without colons, `true` where a value should be, a bare string).
- **Constrained, same logits:** 20,000 of 20,000 valid, checked by the independent validator from block 3, again on a second seed. The enumeration shows exactly 54 valid outputs whose constrained probabilities sum to 1.
- **The exact chance** that the unconstrained decoder produces any valid output is 0.7462; the 20,000-sample measurement (0.7464) agrees.
- **Distortion:** the masked decoder differs from "sample until valid" by a total-variation distance of 0.0030 on this toy.
- **Cut off at 10 tokens:** the shortest valid output needs 15 tokens plus the end marker, so all 2,000 constrained generations are `not JSON`. The guarantee needs the generation to finish.

### Pydantic and zod helpers (NOT EXECUTED)

> [!warning] **Not executed in this module's verification** (needs the `openai` package, `pydantic` and an API key; the JavaScript half needs Node, `openai` and `zod`). Names are copied from the Structured Outputs guide and from `helpers.md` in `openai-python`, both fetched for this module; check the current SDK documentation before relying on them. No output is shown because none was produced.

```python
# NOT EXECUTED: pip install openai pydantic, and a real key in the environment.
import os
from openai import OpenAI
from pydantic import BaseModel

client = OpenAI()
MODEL = os.environ["OPENAI_MODEL"]             # look up a model that supports Structured Outputs


class CalendarEvent(BaseModel):                # the Pydantic class IS the schema
    name: str
    date: str
    participants: list[str]


# Responses style (names from the guide): text_format=<model class>, result in output_parsed
response = client.responses.parse(
    model=MODEL,
    input=[{"role": "system", "content": "Extract the event information."},
           {"role": "user", "content": "Alice and Bob are going to a science fair on Friday."}],
    text_format=CalendarEvent,
)
event = response.output_parsed                 # None when there is nothing parsed, e.g. after a refusal

# Chat style (names from helpers.md): response_format=<model class>, result in message.parsed
completion = client.chat.completions.parse(
    model=MODEL,
    messages=[{"role": "system", "content": "Extract the event information."},
              {"role": "user", "content": "Alice and Bob are going to a science fair on Friday."}],
    response_format=CalendarEvent,
)
message = completion.choices[0].message
print(message.parsed if message.parsed else message.refusal)

# For tools: openai.pydantic_function_tool(MyModel) builds a strict function tool from a Pydantic class (helpers.md).
```

The JavaScript equivalent uses zod; the guide shows `zodTextFormat` for the Responses style and mentions `zodResponseFormat` for the chat style, both from `openai/helpers/zod`:

```javascript
// NOT EXECUTED: needs Node, `npm install openai zod` and a real key.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const openai = new OpenAI();
const CalendarEvent = z.object({ name: z.string(), date: z.string(), participants: z.array(z.string()) });

const response = await openai.responses.parse({
  model: process.env.OPENAI_MODEL,
  input: [{ role: "system", content: "Extract the event information." },
          { role: "user", content: "Alice and Bob are going to a science fair on Friday." }],
  text: { format: zodTextFormat(CalendarEvent, "event") },
});
const event = response.output_parsed;
```

What the helpers hide: they convert the class to a JSON Schema for you and parse the reply back, which removes the schema-drift problem. They do not remove the need to handle refusals and truncation, and a class that uses features outside the subset (a discriminated union at the root, for example, which the guide says produces a top-level `anyOf`) still fails at the API.

## Visual diagram

```
 LEVEL 1  ask nicely          prompt only: "reply with JSON"       any text ──► parse? validate? retry?
 LEVEL 2  JSON mode           json_object (+ the word "JSON")      valid JSON, any shape ──► validate against YOUR schema
 LEVEL 3  Structured Outputs  json_schema + strict: true          your shape, if the answer FINISHES

 one decoding step at level 3 (the idea; the docs do not describe a provider's implementation)

 ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
 │ model: scores      │   │ schema automaton:  │   │ mask: forbidden    │   │ softmax, then      │
 │ (logits) for every │──►│ which tokens may   │──►│ tokens get logit   │──►│ sample one token;  │
 │ vocabulary token   │   │ come next here?    │   │ -infinity (p = 0)  │   │ it is always legal │
 └────────────────────┘   └─────────▲──────────┘   └────────────────────┘   └─────────┬──────────┘
                                    │    advance the automaton with the sampled token │
                                    └─────────────────────────────────────────────────┘

 what can still come back, even at level 3

                      ┌─ refusal field / refusal content part ─────────► show it; do not parse
 response ───────────►├─ incomplete (token limit, content filter) ─────► retry with room, or fail
                      ├─ completed ──► json.loads ──► validate(schema) ──► ok ──► business rules
                      └─ completed but fails parse or schema (levels 1-2, or strict off) ──► bounded retry
```

## Practice

### 1. Fix the schema

This schema has four problems under the strict-mode rules. Run `lint` (blocks 1-2) on it, then repair it so the nested `owner` stays optional.

```python
BAD = {"type": "object",
       "properties": {"id": {"type": "string"},
                      "tags": {"type": "array", "items": {"type": "string"}},
                      "owner": {"type": "object", "properties": {"name": {"type": "string"}}}},
       "required": ["id"]}
for level, path, message in lint(BAD):
    print(level, path, message)

OWNER = obj({"name": {"type": "string"}})                    # obj() is the strict-style helper from block 2
FIXED = obj({"id": {"type": "string"},
             "tags": {"type": "array", "items": {"type": "string"}},
             "owner": {"anyOf": [OWNER, {"type": "null"}]}})  # "optional" = required, but allowed to be null
print("after the fix:", lint(FIXED))
```

<details>
<summary>Answer</summary>

Output (the first four lines are `lint`'s findings on `BAD`; the last is `lint` on the fixed schema):

```
ERROR $ `additionalProperties` must be false
ERROR $ every property must be required; not in `required`: ['tags', 'owner']
ERROR $.owner `additionalProperties` must be false
ERROR $.owner every property must be required; not in `required`: ['name']
after the fix: []
```

Both objects lacked `additionalProperties: false`, and `tags`, `owner` and `name` were missing from their `required` lists. The fix makes everything required (`obj()` does that) and expresses "optional owner" as a union with `null`, exactly the emulation the guide describes. The model now always returns an `owner` key, with `null` when there is none.

</details>

### 2. Turn the model's skill up and down

In block 5 change `SKILL` (how strongly the pretend model prefers the right token) to 2, 5, 8 and 11 and re-run. Predict first: what happens to the unconstrained valid rate, to the constrained valid rate, and to the distortion distance?

<details>
<summary>Answer</summary>

| `SKILL` | unconstrained: exact chance of any valid output | measured valid / 20,000 | constrained valid / 20,000 | distortion (total variation) |
|---|---|---|---|---|
| 2 | 0.0000 | 0 | 20,000 | 0.3894 |
| 5 | 0.0109 | 217 | 20,000 | 0.0561 |
| 8 | 0.7462 | 14,929 | 20,000 | 0.0030 |
| 11 | 0.9853 | 19,723 | 20,000 | 0.0001 |

A better model makes unconstrained failures rarer but never impossible; at `SKILL = 11` roughly 1 sample in 70 is still invalid. The mask gives 20,000 of 20,000 at every setting, because the guarantee comes from the decoder, not from the model's quality. The distortion shrinks as the model improves: when the unmasked model already puts almost all its probability on legal tokens, masking changes little. These numbers belong to this toy and say nothing about any real model.

</details>

### 3. Which retry policy for which outcome?

For each outcome from block 4 (`refusal`, `incomplete` with `max_output_tokens`, `incomplete` with `content_filter`, `not_json`, `schema_violation`), say whether to retry and how.

<details>
<summary>Answer</summary>

- `refusal`: do not retry the same request; show or log the refusal text. Re-sending usually repeats it, and trying to wording-hack around a safety refusal is not a retry policy.
- `incomplete` / `max_output_tokens`: retry only if the answer can legitimately be bigger than the limit you set: raise the limit, or ask for less (fewer items, shorter fields). Check the limit is not simply too small for your schema's required fields.
- `incomplete` / `content_filter`: do not blindly retry; surface it, since the content itself is the problem.
- `not_json` and `schema_violation`: retry a bounded number of times (say 2), appending the validator's error list to the conversation, then fail loudly. If you see these at level 3 with `strict: true`, suspect your request (strict not actually on, an old model, a truncation you misread) before you suspect the model.

</details>

### 4. Spot the guarantee

Which of these can a schema-constrained decoder guarantee, and which not? (a) the output parses as JSON; (b) `kind` is one of the four enum values; (c) `date` is a real calendar date that appears in the user's text; (d) `end` is after `start`; (e) the output is not cut off.

<details>
<summary>Answer</summary>

(a) and (b) yes, provided the generation finishes; (e) no, that is a token-limit and refusal matter; (c) the *format* of a date can be constrained (`format: "date"` is in the documented list) but whether it is a date from the text is content, so no; (d) no, cross-field rules are not expressible in the subset, so validate in code.

</details>

### Checkpoint quiz

1. Name the three levels of "give me JSON" and what each one guarantees.
2. Which rules must every object in a strict schema satisfy, and how do you make a field optional?
3. A response has `status: "incomplete"` and `incomplete_details.reason: "max_output_tokens"`. Can you rely on the schema guarantee? Why?
4. Why does the key order of a schema matter?
5. Does the masked decoder in block 5 produce exactly the same distribution as "sample until valid"? What does that tell you?

<details>
<summary>Answers</summary>

1. Prompt-only: nothing. JSON mode: valid JSON of any shape (with edge cases to handle). Structured Outputs: JSON that adheres to your schema, for a finished, non-refused response.
2. `additionalProperties: false` and every property listed in `required`. Optional is emulated with a union including `null`.
3. No. The text is a truncated prefix; the guarantee covers a response that finished. Handle `incomplete` before parsing.
4. Output is produced in the schema's key order, and generation is left to right, so a field placed earlier cannot depend on one placed later: put reasoning or evidence before the answer.
5. No: masking renormalises at each step, so it differs slightly (0.0030 in the toy). The guarantee is about validity, not about matching the distribution you would get by filtering.

</details>

> [!check]
> - I can write the request fields for each level in both API styles
> - I can list the documented limits of the strict-mode subset and spot a violation
> - I can name the ways a request returns without usable JSON, and what to do for each
> - I can explain constrained decoding in terms of masking logits, and what it does not guarantee
> - I know which parts of validation stay in my code even at level 3

## Project

Build a **schema-first extractor** with no code given:

- invent a text-extraction task with three schemas of rising difficulty: a flat one, one with a closed enum, a nullable field and a nested list, and a recursive one;
- write a preflight step that lints each schema against the documented rules and refuses to send a bad one;
- write your own stand-in HTTP endpoint (as in Module 06) that returns scripted responses in the documented shapes for all five outcomes: ok, refusal, incomplete, not JSON, wrong shape;
- implement `extract(text)` with a bounded retry policy per outcome and a final validation layer that includes at least two business rules the schema cannot express;
- add a tiny evaluation: twenty scripted responses in a mix of outcomes, reporting for each outcome how many reached the caller and how many were retried.

Acceptance criteria: `extract` never returns data that fails validation, never loops past its retry budget, and every refusal reaches the caller unmodified.

## Interview questions

> [!interview] What are the differences between asking for JSON in the prompt, JSON mode and Structured Outputs?

<details>
<summary>What a strong answer covers</summary>

Prompt-only has no guarantee and fails in familiar ways (chatter, fences, truncation). JSON mode guarantees syntactically valid JSON for a finished response, needs an explicit instruction mentioning JSON, and says nothing about shape. Structured Outputs guarantee adherence to a supplied schema within the supported subset, using `strict: true` and a schema with `additionalProperties: false` and all fields required. A strong answer also mentions that the same capability exists for function calling and for response formats, and that you still handle refusals and incomplete output.

</details>

> [!interview] If Structured Outputs guarantees the schema, why does your service still validate?

<details>
<summary>What a strong answer covers</summary>

Because the guarantee has preconditions (a finished, non-refused response from a model and endpoint where strict mode is actually on), covers shape rather than truth (valid enum, wrong value; hallucination on unrelated input), cannot express cross-field or database rules, and can be silently absent when the model, provider or strictness setting changes. Validation is cheap, makes failures visible and gives a single place for business rules. Bonus: SDK helpers keep schema and types in sync.

</details>

> [!interview] How can a decoder guarantee that output follows a JSON Schema?

<details>
<summary>What a strong answer covers</summary>

By constraining sampling: compile the schema into an automaton or grammar, and at every step set the logits of tokens that cannot continue a valid output to minus infinity before softmax, so they have zero probability. The guarantee is of validity, conditional on the generation finishing, not of correctness of content, and masking changes the sampling distribution slightly. A good answer says plainly that a given provider's internal mechanism may not be documented.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| 400 error naming your schema | Outside the subset: missing `additionalProperties: false`, a property not in `required`, an unsupported keyword, a root `anyOf`, or limits exceeded. Run a linter like block 2, then read the error |
| JSON mode request errors about the word "JSON" | The conversation never says "JSON"; add an instruction that does |
| JSON mode request runs long and returns whitespace | No explicit JSON instruction (the guide's "unending stream of whitespace"); fix the prompt and set an output-token limit |
| `json.loads` fails on a "structured" response | Truncated (`incomplete`/`length`), or a refusal text, or not actually at level 3. Check status and refusal fields before parsing |
| A field is always `null` or always `"unknown"` | The escape hatch is too attractive: sharpen the `description` of when to use it, add examples, or make the field non-nullable |
| Pydantic model rejected | It uses features outside the subset (root union, unsupported keyword). Print the generated schema and lint it |
| Validator disagrees with the API about `null` | `type` allows `null` but `enum` does not list it. Add `null` to the enum |

## Further reading & sources

- [Structured model outputs | OpenAI API](https://developers.openai.com/api/docs/guides/structured-outputs) - the official guide: the three forms, the supported-schema rules quoted here, refusals, edge cases and the SDK helpers.
- [Function calling | OpenAI API](https://developers.openai.com/api/docs/guides/function-calling) - strict mode for function tools, and the advice on designing parameters.
- [openai/openai-openapi](https://github.com/openai/openai-openapi) - the OpenAPI description used for the exact `response_format` and `text.format` shapes and the `x-openai-structured-output-limits` block.
- [Structured Outputs Parsing Helpers | openai-python](https://github.com/openai/openai-python/blob/main/helpers.md) - the Python SDK's `parse()` methods, `pydantic_function_tool` and the exceptions they raise.
- [JSON Schema: Validation vocabulary (2020-12)](https://json-schema.org/draft/2020-12/json-schema-validation) - the definition of `type`, `enum`, `pattern` (including that patterns are not implicitly anchored), `multipleOf` and the other keywords the validator implements.
- [RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259) - what "valid JSON" means, the baseline for JSON mode.
- [Efficient Guided Generation for Large Language Models (Willard and Louf, 2023)](https://arxiv.org/abs/2307.09702) - a published formulation of constrained decoding as transitions of a finite-state machine over the vocabulary; cited as background for the toy, not as a description of OpenAI's implementation.
- [jsonschema documentation | python-jsonschema](https://python-jsonschema.readthedocs.io/en/stable/) - the validator to use in real projects instead of the teaching version in block 3.

## Next

[Module 08: The Embeddings API](../08-the-embeddings-api/README.md)
