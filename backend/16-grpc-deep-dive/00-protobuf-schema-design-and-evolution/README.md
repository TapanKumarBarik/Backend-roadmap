# Module 00: Protobuf Schema Design and Evolution

## Why this matters

Track 11 taught you protobuf syntax well enough to define a service and
generate stubs. That works perfectly right up until the first time you need
to *change* a `.proto` that other teams have already deployed against. At
that point protobuf stops being a serialization format and becomes a
contract with compatibility rules — rules that are mostly invisible,
because breaking them usually doesn't raise an error. It silently
misinterprets bytes.

The failure mode is specific and nasty: a client encodes field number 3 as
an `int64`, the server has redefined field 3 as a `string`, and instead of
crashing, the decoder reads whatever those bytes happen to mean. A REST API
that breaks gives you a 400. A protobuf schema that breaks gives you
corrupted data and a green dashboard. This module is the discipline that
prevents that.

## Concepts

### The wire format is field *numbers*, not field names

This is the single fact everything else follows from. When protobuf encodes
a message, it writes pairs of `(field_number, wire_type)` followed by the
value. Field *names* are never transmitted — they exist only in the `.proto`
and the generated code.

```
message User { string email = 2; }

on the wire:  [field 2, wire type 2 (length-delimited)] [len] [bytes...]
                      ^ this is all the decoder sees
```

Two direct consequences, both of which surprise people:

- **Renaming a field is wire-compatible.** `string email = 2;` →
  `string email_address = 2;` changes nothing on the wire. Old and new
  binaries interoperate fine. (It *does* break generated-code call sites and
  the protobuf-JSON mapping, so it isn't free — just not a wire break.)
- **Reusing a field number is catastrophic**, even with a different name.
  The decoder has no idea the meaning changed.

### Wire types: what "compatible type change" actually means

There are only a handful of wire types, and compatibility is governed by
them, not by how similar two types look in the `.proto`:

| Wire type | Used by |
|---|---|
| `0` varint | `int32`, `int64`, `uint32`, `uint64`, `bool`, `enum`, `sint32`, `sint64` |
| `1` 64-bit | `fixed64`, `sfixed64`, `double` |
| `2` length-delimited | `string`, `bytes`, embedded messages, packed repeated fields |
| `5` 32-bit | `fixed32`, `sfixed32`, `float` |

Rules that follow from this table:

- **Safe:** `int32` ↔ `int64` ↔ `uint32` ↔ `uint64` ↔ `bool` ↔ `enum` — all
  varint. Caveat: values that don't fit the narrower type are truncated, and
  a negative `int32` read as `int64` behaves as expected only because
  negative varints are always encoded in 10 bytes.
- **Not safe, despite looking similar:** `int32` ↔ `sint32`. Both are varint,
  but `sint32` uses zigzag encoding, so the *bits* mean different numbers.
  `-1` as `sint32` decodes as `1` if read as `int32`. Silent corruption.
- **Safe:** `string` ↔ `bytes`, provided the bytes are always valid UTF-8.
- **Safe:** a single field ↔ a `repeated` field of the same type, in the
  narrow sense that the decoder tolerates it (for length-delimited/packed
  types the last value wins on the singular side). Treat this as a
  last-resort migration, not a routine change.
- **Never safe:** anything that crosses wire types — `int32` → `string`,
  `float` → `int32`, message → scalar.

### `reserved`: the mechanism that makes deletion safe

When you delete a field, its number becomes free — and someone will reuse it
a year later, having never seen the old schema. `reserved` makes the
compiler stop them:

```proto
message User {
  reserved 3, 7, 9 to 11;
  reserved "legacy_role", "internal_flag";

  string id    = 1;
  string email = 2;
  string name  = 4;
}
```

Reserve **both** the numbers and the names: the numbers protect the wire
format, the names protect anyone relying on protobuf-JSON or reflection.
Reserving on deletion is not optional politeness — it is the only thing
standing between you and a future silent corruption bug.

### proto3 presence: the `optional` you probably need

In proto3, a plain scalar field has **implicit presence**: it is
indistinguishable from its default. A server receiving `int32 retry_count = 5;`
with value `0` cannot tell "the client sent 0" from "the client didn't set
it at all" — both decode as `0`, and `0` is not even written to the wire.

That matters enormously for partial updates. Marking a field `optional`
(re-introduced for proto3 in protobuf 3.15) gives it **explicit presence**
and a `HasField` check:

```proto
message UpdateUserRequest {
  string id = 1;
  optional string name  = 2;   // absent  != ""
  optional int32  age   = 3;   // absent  != 0
}
```

```python
# server side
if request.HasField("name"):        # only valid because the field is `optional`
    user.name = request.name        # "" is now a legitimate value to set
if request.HasField("age"):
    user.age = request.age          # 0 is now a legitimate value to set
```

Without `optional`, "clear this user's name" is unexpressible — you cannot
distinguish it from "don't touch the name." Adding `optional` to an existing
field is wire-compatible (it does not change the encoding of a set field),
so this is a safe retrofit.

Note that message-typed fields, `oneof` members, and `optional` fields all
have explicit presence; `repeated` and `map` fields never do (empty and
absent are the same thing for them, always).

### `FieldMask` for partial updates at scale

`optional` per-field works fine for small messages. For a large resource, the
convention is `google.protobuf.FieldMask` — the client states which paths it
intends to modify:

```proto
import "google/protobuf/field_mask.proto";

message UpdateUserRequest {
  User user = 1;
  google.protobuf.FieldMask update_mask = 2;   // e.g. paths: ["name", "profile.bio"]
}
```

This is more explicit than presence checks, survives nested fields, and is
what Google's own APIs use. The tradeoff is that you must implement mask
application yourself — the runtime gives you the mask, not the merge.

### `oneof`: the rules people get wrong

`oneof` gives you a tagged union — at most one member set at a time.

```proto
message Notification {
  string id = 1;
  oneof channel {
    EmailPayload email = 2;
    SmsPayload   sms   = 3;
    PushPayload  push  = 4;
  }
}
```

Evolution rules, which are narrower than they look:

- **Safe:** adding a *new* field to an existing `oneof`.
- **Safe:** moving a single existing field *into* a new `oneof` (it keeps its
  number, and a lone field in a oneof is wire-identical to a plain field).
- **Not safe:** moving *multiple* existing fields into one `oneof`. On the
  wire nothing stops an old client sending two of them; the new decoder
  keeps only the last, silently dropping data.
- **Not safe:** moving a field out of a oneof into another oneof, or
  splitting/merging oneofs.

### Enums are open, and must have a zero value

proto3 requires the first enum value to be `0`, and it should mean
"unspecified" rather than a real state:

```proto
enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;   // required zero; means "not set"
  ORDER_STATUS_PENDING     = 1;
  ORDER_STATUS_SHIPPED     = 2;
  ORDER_STATUS_DELIVERED   = 3;
}
```

Two reasons the `UNSPECIFIED` convention matters. First, because of implicit
presence, an unset enum field decodes as `0` — so if `0` meant `PENDING`,
every message that forgot to set status would claim to be pending. Second,
proto3 enums are **open**: a value the receiver's schema doesn't know is
preserved rather than rejected, so an old client receiving a newly-added
`ORDER_STATUS_CANCELLED = 4` sees the raw number `4`, and any
`if status == SHIPPED ... else ...` branch will quietly take the wrong path.
Handle unknown enum values explicitly.

The prefixed naming (`ORDER_STATUS_PENDING`, not `PENDING`) isn't stylistic
fussiness — enum value names share a C++-style scope with their *enclosing*
namespace, so two enums in one package both declaring `PENDING` collide.

### Package and directory layout: version in the path

The convention that makes breaking changes possible at all is versioning the
*package*, so v1 and v2 can coexist during a migration:

```
proto/
  shop/
    v1/
      order.proto        package shop.v1;
      payment.proto      package shop.v1;
    v2/
      order.proto        package shop.v2;
```

```proto
syntax = "proto3";
package shop.v1;
option go_package = "github.com/you/shop/gen/shop/v1;shopv1";
```

A gRPC method's full path on the wire is `/<package>.<Service>/<Method>` —
so `shop.v1.OrderService/GetOrder` and `shop.v2.OrderService/GetOrder` are
genuinely different endpoints that can be served by the same process. That
is the escape hatch for changes that *cannot* be made compatibly: don't
break v1, publish v2 alongside it, migrate clients, then retire v1.

### Well-known types: don't reinvent these

| Instead of | Use | Why |
|---|---|---|
| `int64 created_at_millis` | `google.protobuf.Timestamp` | Unambiguous epoch semantics, JSON maps to RFC 3339 |
| `int64 timeout_ms` | `google.protobuf.Duration` | Same reason, and self-documenting |
| `optional`-per-field sprawl | `google.protobuf.FieldMask` | Explicit partial-update paths |
| `string json_blob` | `google.protobuf.Struct` | Real structured data, still schemaless |
| Untyped payload | `google.protobuf.Any` | Typed dynamic payloads (use sparingly) |

### The design checklist

1. Field numbers 1-15 encode in one byte — spend them on your hottest,
   most-repeated fields, not on `id` out of habit.
2. Never reuse a number; always `reserved` on delete (numbers *and* names).
3. Use `optional` wherever "absent" and "zero" mean different things.
4. Every enum starts at `0` with an `UNSPECIFIED` member, prefixed.
5. Version the package (`shop.v1`), and mirror it in the directory path.
6. Wrap request/response per RPC (`GetOrderRequest`/`GetOrderResponse`) even
   when they'd be empty — you can add fields later without changing the
   method signature.
7. Prefer well-known types over hand-rolled timestamps and durations.

## Command reference

| Concern | Command / syntax |
|---|---|
| Generate Python stubs | `python -m grpc_tools.protoc -I proto --python_out=gen --grpc_python_out=gen --pyi_out=gen proto/shop/v1/order.proto` |
| Reserve on delete | `reserved 3, 7, 9 to 11;` and `reserved "old_name";` |
| Explicit presence | `optional string name = 2;` + `msg.HasField("name")` |
| Encode a descriptor set (for diffing) | `protoc -I proto --descriptor_set_out=schema.pb --include_imports proto/**/*.proto` |
| Inspect raw wire bytes (no schema needed) | `python -m grpc_tools.protoc --decode_raw < payload.bin` |
| Lint / breaking-change check | `buf lint` and `buf breaking --against '.git#branch=main'` |

`protoc --decode_raw` is the tool that makes the wire format concrete — it
decodes bytes with *no* schema at all, showing you the field numbers and
wire types that are genuinely present.

## Hands-on exercises

```bash
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install grpcio grpcio-tools protobuf
mkdir -p proto/shop/v1 gen
```

### 1. See that names don't exist on the wire

`proto/shop/v1/order.proto`:

```proto
syntax = "proto3";
package shop.v1;

message Order {
  string id = 1;
  int32 quantity = 2;
}
```

```bash
python -m grpc_tools.protoc -I proto --python_out=gen proto/shop/v1/order.proto
touch gen/__init__.py gen/shop/__init__.py gen/shop/v1/__init__.py
```

```python
import sys; sys.path.insert(0, "gen")
from shop.v1 import order_pb2

o = order_pb2.Order(id="A-1", quantity=7)
raw = o.SerializeToString()
print(raw)          # b'\n\x03A-1\x10\x07'
open("payload.bin","wb").write(raw)
```

```bash
python -m grpc_tools.protoc --decode_raw < payload.bin
```

Expected output — note there are **no field names anywhere**:

```
1: "A-1"
2: 7
```

Now rename `id` to `order_id` in the `.proto`, regenerate, and decode the
*same* `payload.bin` with the new schema. It still parses correctly into
`order_id`. That is the "renaming is wire-compatible" rule, proven.

### 2. Prove that reusing a field number corrupts data

Serialize with the original schema (`int32 quantity = 2`), then change field
2 to `string quantity` and parse the old bytes with the new schema.

```python
# with NEW schema (string quantity = 2), parse OLD bytes
from shop.v1 import order_pb2
o = order_pb2.Order()
o.ParseFromString(open("payload.bin","rb").read())
print(repr(o))
print(o.SerializeToString() == open("payload.bin","rb").read())
```

Expected — and this is worse than an error:

```
id: "A-1"
True
```

**No exception, and `quantity` is simply gone.** The old bytes encoded field
2 as a varint; the new schema expects field 2 to be length-delimited. Because
the wire types don't match, the decoder can't treat it as field 2 at all, so
it files it away as an *unknown field* — which is why it silently vanishes
from the typed view yet still round-trips byte-for-byte on re-serialization.

Your server now sees an `Order` with no quantity and no indication anything
was lost. No schema registry stopped you; in a distributed system these two
versions are just two running processes.

### 3. Prove `int32` ↔ `sint32` is silent corruption

Define `message T { int32 v = 1; }`, serialize `v = -1`. Then redefine as
`sint32 v = 1;`, regenerate, and parse those same bytes.

```python
raw = A.T(v=-1).SerializeToString()
print(raw, len(raw))        # b'\x08\xff\xff\xff\xff\xff\xff\xff\xff\xff\x01'  11
r = B.T(); r.ParseFromString(raw)
print(r.v)
```

Expected:

```
b'\x08\xff\xff\xff\xff\xff\xff\xff\xff\xff\x01' 11
-2147483648
```

`-1` became `-2147483648`, with **no error at all**. Both types are varints,
so the wire types match perfectly and the decoder happily reads the value —
it just applies zigzag decoding to bits that were never zigzag-encoded.
(A negative `int32` is always written as a full 10-byte varint, hence 11
bytes including the tag.)

Contrast with exercise 2: there a wire-type *mismatch* meant the field was
quietly dropped; here the wire types *agree*, so you get a confident, wrong
number instead. This is the most dangerous class of schema change.

### 4. Demonstrate implicit presence, then fix it with `optional`

```proto
message UpdateUserRequest {
  string id = 1;
  string name = 2;            // implicit presence
  optional string bio = 3;    // explicit presence
}
```

```python
r = user_pb2.UpdateUserRequest(id="u1", name="", bio="")
print(r.SerializeToString())
print(r.HasField("bio"))
r.HasField("name")
```

Expected:

```
b'\n\x02u1\x1a\x00'
True
ValueError: Field p.UpdateUserRequest.name does not have presence.
```

Read those bytes carefully: `\n\x02u1` is field 1 (`id`), `\x1a\x00` is
field 3 (`bio`) with length zero — **`name` is absent from the wire
entirely**, even though you explicitly set it to `""`. The empty `bio`, by
contrast, is transmitted, because `optional` gives it explicit presence.

Then write one sentence on why "clear the user's bio" is expressible but
"clear the user's name" is not.

### 5. Reserve a deleted field and watch the compiler defend you

Delete `quantity = 2` and add `reserved 2; reserved "quantity";`. Now try to
add a *new* field reusing number 2:

```proto
message Order {
  reserved 2;
  reserved "quantity";
  string id = 1;
  string sku = 2;   // <-- deliberately reuse the reserved number
}
```

```bash
python -m grpc_tools.protoc -I proto --python_out=gen proto/shop/v1/order.proto
```

Expected — a hard compile error, with a helpful suggestion:

```
proto/shop/v1/order.proto:4:12: Field "sku" uses reserved number 2.
proto/shop/v1/order.proto:4:12: Suggested field numbers for shop.v1.Order: 3
```

Now prove the *name* half works too: drop `reserved 2;`, keep
`reserved "quantity";`, and declare `string quantity = 3;`:

```
proto/shop/v1/order.proto:6:10: Field name "quantity" is reserved.
```

This is the whole point — the error you *want*, at build time, instead of
corruption at runtime.

### 6. Add a field and prove forward compatibility

Serialize an `Order` with a new schema that has an extra field
(`string customer_id = 5;`). Parse those bytes with the **old** generated
code (regenerate into a separate directory first so you keep both). Confirm
it parses fine and the unknown field is preserved on re-serialization:

```python
old = old_pb2.Order(); old.ParseFromString(new_bytes)
assert old.SerializeToString() == new_bytes   # unknown fields round-trip intact
```

Expected: the assertion holds. proto3 has preserved unknown fields since
3.5, which is what makes "add a field" a safe, non-coordinated change.

### 7. Handle an unknown enum value

Define `OrderStatus` with values 0-3, serialize a message carrying status
`4` (write the raw int — protobuf will accept it, enums are open), and parse
it with a schema that only knows 0-3.

Expected: the value survives as `4`. Now write the correct server-side
branch: an explicit `else` that treats unknown status as "cannot handle,"
rather than an `if/else` that silently lumps it in with a known state.

### 8. Diagnose and fix: the compatible-looking change

Two teams share `shop.v1.Order`. The orders team needs `quantity` to support
values above 2 billion, so they change `int32 quantity = 2;` to
`int64 quantity = 2;`, reason that both are varints, deploy, and nothing
breaks. Six months later they need `price` to be exact, so they change
`float price = 6;` to `double price = 6;` by the same reasoning — and the
payments service starts reading garbage prices.

<details>
<summary>Solution</summary>

The first change was genuinely safe: `int32` and `int64` are both wire type
`0` (varint), so the bytes mean the same thing to both schemas. The team
then generalized "widening a number type is safe," which is false. `float`
is wire type `5` (fixed 32-bit) and `double` is wire type `1` (fixed
64-bit) — they are *different wire types*, so a decoder expecting 8 bytes
reads 4 bytes of value plus 4 bytes of whatever field followed it. The
result parses and produces a number, which is why it reached production.

The fix is procedural, not just technical: add a new field
(`double price_exact = 12;`), populate both during a migration window,
migrate readers, then `reserved 6` the old one. And gate the repo with
`buf breaking` in CI so the rule is enforced by a tool rather than by
whoever reviews the PR remembering the wire-type table.

</details>

## Independent challenge

No solution given. You own `shop.v1.Order`, consumed by four services you
don't control. You need to make all of these changes:

1. `status` is currently `string` (values `"pending"`, `"shipped"`) and
   should become a proper enum.
2. `address` is currently three flat string fields and should become a
   nested `Address` message.
3. `discount_percent` (an `int32`) must start supporting `0` as a
   *deliberately set* value, distinct from "not specified."
4. A new `cancelled` state must be added that old clients will never
   understand.

For each, decide: is it wire-compatible, achievable via an additive
migration, or does it require `shop.v2`? Write the exact `.proto` diff for
each change you can make compatibly, the migration sequence (what deploys in
what order), and for anything requiring v2, what the coexistence period
looks like. Then state which of the four is the most dangerous *because it
looks safe*, and why.

<details>
<summary>Stuck? One hint</summary>

Only one of the four is a genuine wire break; two are additive migrations
(add new field, dual-write, migrate readers, reserve the old); and one is
safe on the wire but still requires every consumer to change its code
because of open-enum semantics. The dangerous-because-it-looks-safe one is
the change where both old and new schemas parse the bytes without error but
disagree about what they *mean* — reread the wire-type table and ask which
change crosses a wire type while looking like a simple type widening.

</details>

## Common mistakes & troubleshooting

- **Reusing a field number after deleting a field.** The corruption is
  silent. Always `reserved` the number *and* the name on deletion.
- **Assuming similar types are compatible.** `int32`→`sint32` and
  `float`→`double` both look like widenings and are both wire breaks.
  Compatibility is decided by the wire-type table, not by intuition.
- **Relying on default values to mean "unset."** Without `optional`, `0`,
  `""` and `false` are indistinguishable from absent — which makes partial
  updates and "clear this field" impossible to express.
- **Enums whose zero value is a real state.** Every message that forgets to
  set the field silently claims that state. Reserve `0` for `UNSPECIFIED`.
- **Treating proto3 enums as closed.** Unknown values are preserved, not
  rejected — an `if/else` over known values will mis-handle them. Branch on
  unknown explicitly.
- **No version in the package name.** Without `shop.v1`, there is no way to
  ever ship a breaking change, because there's nowhere for v2 to live
  alongside it.
- **Not enforcing any of this in CI.** All of the above are exactly the kind
  of rule humans forget under deadline pressure — `buf breaking` against the
  main branch turns them into a failing build.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why is renaming a protobuf field wire-compatible, while reusing a field
   number is dangerous?
2. `int32` → `int64` is a safe change but `int32` → `sint32` is not, even
   though all three are varints. Why?
3. What does `optional` give you in proto3 that a plain scalar field
   doesn't, and what does it let you express that you otherwise couldn't?
4. Why must a proto3 enum's zero value mean "unspecified" rather than a real
   state? Give both reasons.
5. What does `reserved` protect against, and why should you reserve names as
   well as numbers?
6. Which `oneof` evolution is safe: adding a new field to an existing
   `oneof`, or moving two existing top-level fields into a new `oneof`? Why?
7. Why does versioning live in the protobuf *package* name, and what does
   that let you do that you otherwise couldn't?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because field names are never transmitted — the wire format carries only
   `(field number, wire type)` pairs and values. Renaming changes only the
   generated code, so both sides still agree about what field 2 means.
   Reusing a number does the opposite: the wire stays identical while the
   *meaning* changes, so a decoder confidently misinterprets old bytes with
   no error raised.
2. Because compatibility is determined by wire type *and* encoding, not by
   the declared type. `int32` and `int64` are both plain varints and encode
   the same values the same way. `sint32` is also a varint but uses zigzag
   encoding, so identical bytes represent different numbers — `-1` written
   as `int32` reads back as a large positive value under `sint32`, silently.
3. `optional` gives the field explicit presence and a working `HasField`
   check, so "absent" is distinguishable from the type's default value.
   Without it you cannot express "set this field to zero/empty on purpose"
   as distinct from "don't modify this field" — which makes correct partial
   updates impossible.
4. First, because scalar fields have implicit presence: an unset enum field
   decodes as `0`, so if `0` were a real state, every message that omitted
   the field would falsely claim that state. Second, `UNSPECIFIED` gives
   servers an unambiguous way to detect and reject "caller didn't set this"
   instead of silently defaulting.
5. `reserved` stops a future author from reusing a deleted field's number
   (which would cause silent wire-level corruption) by turning it into a
   compile error. Reserving the *name* as well protects consumers that
   address fields by name rather than number — protobuf-JSON mappings, text
   format, and reflection-based tooling.
6. Adding a new field to an existing `oneof` is safe. Moving two existing
   top-level fields into a new `oneof` is not: nothing on the wire prevents
   an old client from setting both, and the new decoder will keep only the
   last one it sees, silently discarding the other. (Moving a *single*
   existing field into a new oneof is safe, since one field in a oneof is
   wire-identical to a plain field.)
7. Because a gRPC method's wire path is `/<package>.<Service>/<Method>`, so
   `shop.v1.OrderService` and `shop.v2.OrderService` are distinct endpoints
   that one process can serve simultaneously. That's what makes a genuinely
   breaking change possible at all: publish v2 alongside v1, migrate clients
   at their own pace, then retire v1 — instead of needing every consumer to
   redeploy in lockstep.

</details>

## Further reading & sources

- [Protocol Buffers: Proto3 language guide](https://protobuf.dev/programming-guides/proto3/) - the authoritative reference for syntax, presence, and enum semantics.
- [Protocol Buffers: Encoding](https://protobuf.dev/programming-guides/encoding/) - the wire-type table and varint/zigzag details this module's compatibility rules derive from.
- [Protocol Buffers: Field presence](https://protobuf.dev/programming-guides/field-presence/) - the precise semantics of implicit vs explicit presence in proto3.
- [Buf: Breaking change detection](https://buf.build/docs/breaking/overview) - the CI tooling that enforces these rules automatically.
- [Google API Improvement Proposals (AIPs)](https://google.aip.dev/) - the versioning, `FieldMask`, and resource-naming conventions this module follows.

## Next

[01-security-tls-mtls-and-auth](../01-security-tls-mtls-and-auth/README.md) —
with a schema that can survive change, module 01 makes the channel carrying
it secure: TLS, mutual TLS, and per-call identity.
