# Module 05: GraphQL Schema Evolution and Deprecation

## Why this matters

REST has `/v1/` and `/v2/`. gRPC has `shop.v1` and `shop.v2` packages
(track 16, module 00). GraphQL has **neither**, and this is deliberate: the
spec has no versioning mechanism at all, and the community position is that
you should never version a GraphQL API.

That sounds like a problem and is actually a constraint that forces a better
discipline — but only if you understand what replaces versioning. What
replaces it is: **additive-only change, plus deprecation, plus actually
knowing which clients use which fields.** Skip the third part and the first
two don't save you, because you can never prove it's safe to remove
anything.

## Concepts

### Why GraphQL doesn't version

In REST, `GET /users/42` returns a fixed payload, so changing that payload
breaks every client at once — hence `/v2/`. In GraphQL, the client declares
exactly what it wants:

```graphql
query { user(id: "42") { name email } }
```

A client that never requested `phoneNumber` cannot be broken by adding it,
and cannot be broken by removing it either. **The blast radius of a change is
scoped to the clients that actually select the changed field** — which means
change is safe *per field*, not per endpoint. Versioning the whole schema to
protect one field would be enormously over-broad.

The consequence: your unit of compatibility is the field, and your job is to
know who selects it.

### What is and isn't a breaking change

| Change | Safe? | Why |
|---|---|---|
| Add a field to a type | Yes | Nobody selects it yet |
| Add an **optional** argument | Yes | Existing calls omit it |
| Add a **required** argument | **No** | Every existing call becomes invalid |
| Add a value to an enum | **Careful** | Clients switching on it may not handle it |
| Add a type to a union | **Careful** | Same reason |
| Remove a field | **No** | Any client selecting it breaks |
| Rename a field | **No** | Remove + add |
| `String` → `String!` (nullable → non-null) | Yes, for **output** | Client expecting maybe-null gets never-null |
| `String!` → `String` (non-null → nullable) | **No**, for output | Client not handling null now receives it |
| `String` → `String!` on an **input** | **No** | Callers omitting it now fail |
| `String!` → `String` on an **input** | Yes | Relaxing a requirement |

The nullability rules invert between input and output positions, and that's
the one people consistently get wrong. The general principle: **you may
strengthen what you promise to return, and relax what you demand to receive.**

The enum case is the subtle one. Adding an enum value is technically
non-breaking at the schema level — the query still validates — but a client
with `switch (status) { case ACTIVE: ... case CLOSED: ... }` and no default
now silently mishandles the new value. It's the same open-enum hazard as
protobuf (track 16, module 00): the wire accepts it, the client logic
doesn't.

### `@deprecated` is the versioning mechanism

```graphql
type User {
  id: ID!
  name: String!

  fullName: String! @deprecated(reason: "Use `name`. Removal after 2026-12-01.")

  email: String! @deprecated(
    reason: "Use `contact.email`, which supports multiple addresses. Removal after 2027-01-15."
  )

  contact: ContactInfo!
}

enum OrderStatus {
  PENDING
  SHIPPED
  DELIVERED
  IN_TRANSIT @deprecated(reason: "Use SHIPPED.")
}
```

A deprecated field still works — this is a *label*, not a behaviour change.
It's excluded from introspection by default (so tooling and autocomplete stop
suggesting it) and it makes the intent discoverable.

Write reasons that are actionable. `@deprecated(reason: "deprecated")` is
worthless; a good reason states **what to use instead** and **when it will
disappear**.

Note the spec allows `@deprecated` on output fields, enum values, arguments
and input fields — argument/input-field deprecation is newer, so check your
server library supports it before relying on it.

### The field lifecycle

```
1. ADD the replacement            contact: ContactInfo!
2. DUAL-WRITE / dual-serve        both email and contact.email resolve
3. DEPRECATE the old field        email @deprecated(reason: "...")
4. MEASURE usage                  per-field, per-client, over time
5. NOTIFY remaining consumers     you know exactly who they are from step 4
6. REMOVE once usage is zero      and has been zero for a full client cycle
```

Step 4 is the one teams skip, and it's the one that makes the rest work.
Without usage data you can never justify step 6, so deprecated fields
accumulate forever and the schema becomes a museum.

"A full client cycle" matters for mobile: a native app version can stay
installed for a year or more. Zero usage for a week means nothing if your
p99 client upgrade time is six months.

### Measuring per-field usage

The server sees every field of every query, so this is a tracing-extension
concern, not guesswork:

```python
# Strawberry example — an extension that records which fields were resolved
import strawberry
from strawberry.extensions import SchemaExtension

class FieldUsage(SchemaExtension):
    def resolve(self, _next, root, info, *args, **kwargs):
        parent = info.parent_type.name
        client = self.execution_context.context["request"].headers.get(
            "x-client-name", "unknown")
        metrics.increment("graphql_field_used",
                          tags={"field": f"{parent}.{info.field_name}", "client": client})
        return _next(root, info, *args, **kwargs)

schema = strawberry.Schema(query=Query, extensions=[FieldUsage])
```

Two details that make this usable rather than merely present:

- **Require a client identifier.** An `x-client-name` header (or an API key
  mapped to a client) is what turns "12 requests still use `email`" into "the
  iOS app still uses `email`" — the second is actionable, the first isn't.
- **Tag by `ParentType.field`, not just `field`.** `id` appears on every
  type; without the parent you can't tell which one is in use.

### Schema checks in CI

Deprecation policy is exactly the kind of rule humans forget under deadline
pressure, so it belongs in a pipeline — the same argument as `buf breaking`
for protobuf (track 16) and Schema Registry compatibility checks for Kafka
(track 17).

```bash
# GraphQL Inspector: diff the PR's schema against main
npx graphql-inspector diff main:schema.graphql schema.graphql

# Apollo Rover: check against real traffic from the last N days
rover graph check my-graph@current --schema ./schema.graphql
```

The distinction between those two is worth internalising:

- **A schema diff** tells you a change is *theoretically* breaking.
- **A traffic-aware check** tells you whether any client has *actually* used
  the field recently — so removing a field nobody has queried in 90 days can
  pass, while removing a heavily-used one fails.

The second is far more useful, and it only exists because of the usage data
from step 4.

### Nullability as an evolution tool

A subtle point that pays off later: making an output field non-null (`!`) is
a promise you can never weaken, because relaxing it back is breaking.

So when adding a new output field, **start it nullable** unless you're
certain it can always be resolved. `String` → `String!` is a safe change you
can make later once you're confident; `String!` → `String` is a breaking one
you'll be stuck with. Module 06 covers why over-using `!` also makes
partial-failure behaviour much worse.

## Command reference

| Concern | Syntax / command |
|---|---|
| Deprecate a field | `field: String @deprecated(reason: "Use X. Removal after DATE.")` |
| Deprecate an enum value | `LEGACY @deprecated(reason: "Use NEW.")` |
| Include deprecated in introspection | `__type(name:"User"){ fields(includeDeprecated:true){ name isDeprecated deprecationReason } }` |
| Diff two schemas | `npx graphql-inspector diff old.graphql new.graphql` |
| Traffic-aware check | `rover graph check <graph>@<variant> --schema ./schema.graphql` |
| Print the SDL (Strawberry) | `strawberry export-schema app:schema > schema.graphql` |
| Per-field usage | a `SchemaExtension` hooking `resolve` |
| Safe output change | nullable → non-null (`String` → `String!`) |
| Safe input change | non-null → nullable, or add an optional argument |

## Hands-on exercises

Continue from module 03/04's Strawberry + FastAPI setup.

```bash
pip install "strawberry-graphql[fastapi]" uvicorn
```

### 1. Prove additive change is invisible to existing clients

Add a `phoneNumber: String` field to `User`. Re-run module 03's original
query unchanged.

Expected: identical response, byte for byte. This is why GraphQL doesn't need
`/v2/` — write one sentence contrasting it with what adding a field to a REST
payload does to a strict client.

### 2. Deprecate a field and see it vanish from introspection

```python
@strawberry.type
class User:
    name: str
    full_name: str = strawberry.field(
        deprecation_reason="Use `name`. Removal after 2026-12-01.")
```

Then introspect twice:

```graphql
{ __type(name: "User") { fields { name } } }
{ __type(name: "User") { fields(includeDeprecated: true) { name isDeprecated deprecationReason } } }
```

Expected: `fullName` is absent from the first and present in the second.
Confirm that **querying it still works** — deprecation is a label, not an
enforcement.

### 3. Break it four ways, deliberately

Make each of these changes and run an existing client query against it:

1. Remove a selected field
2. Rename a selected field
3. Add a **required** argument to a queried field
4. Change an output field from `String!` to `String`

Expected: 1-3 fail validation immediately with a clear error; 4 *validates
fine* but can now return `null` where the client's type system said it never
could. Note which failure mode is more dangerous and why.

### 4. Confirm the input/output nullability inversion

Change an **input** field from `String` to `String!` and re-run a call that
omitted it. Then change an **output** field from `String` to `String!` and
re-run a client that read it.

Expected: the input change breaks the caller; the output change doesn't.
Write the general rule in your own words.

### 5. Add the enum trap

Add a new value to an existing enum. Write a client that switches on the enum
with no default branch and feed it the new value.

Expected: the query validates and succeeds, but the client mishandles it
silently. Then add a `default` branch and confirm the fix. This is a client
discipline problem the schema cannot solve for you.

### 6. Measure per-field usage

Implement the `FieldUsage` extension. Run a mix of queries from two different
`x-client-name` values.

Expected: counts keyed by `ParentType.field` **and** client. Then remove the
client tag and observe how much less actionable the data becomes — that's the
difference between "12 requests" and "the iOS app".

### 7. Wire up a schema diff in CI

Export the SDL, commit it, make a breaking change, and run:

```bash
npx graphql-inspector diff schema-main.graphql schema.graphql
```

Expected: it exits non-zero and names the breaking change. Add it as a
pre-commit hook or CI step and confirm a safe additive change passes.

### 8. Diagnose and fix: the field nobody could remove

A team has 340 fields in their schema, 60 of them deprecated — some for three
years. Nobody will remove any of them, because nobody can prove they're
unused. Their deprecation reasons read `@deprecated(reason: "deprecated")`.
They have no per-field metrics, and clients send no identifying header.

Explain what specifically blocks removal, and design the smallest change that
unblocks it within one quarter.

<details>
<summary>Solution</summary>

**The blocker is missing evidence, not missing process.** Every step of the
lifecycle is in place except measurement — and without usage data, removal is
an unbounded risk, so the rational choice for any individual engineer is
always "don't touch it." That's why the count only ever grows.

Compounding it: the deprecation reasons carry no information. A consumer
reading `reason: "deprecated"` learns neither what to migrate to nor when the
field disappears, so even a motivated client team can't act.

Smallest unblocking change, in order:

1. **Add field-usage tracing** with a `ParentType.field` tag — one extension,
   deployed once, and the data starts accumulating immediately.
2. **Require an `x-client-name` header** (or map API keys to clients) so
   usage is attributable. Without this you learn a field is used but not by
   whom, which doesn't let you contact anyone.
3. **Rewrite the reasons** to name the replacement and a removal date. This
   is a mechanical schema edit, not a migration.
4. **Wait one full client-upgrade cycle** — for a mobile client that's
   months, not weeks — then remove fields with zero usage, starting with the
   oldest.

Note what *doesn't* need to happen: no versioning, no breaking release, no
big-bang migration. The fields with genuinely zero traffic can be deleted
silently, and only the ones with real usage need a conversation — which is
exactly the outcome the per-field blast radius was supposed to give them all
along.

</details>

## Independent challenge

No solution given. You own a GraphQL API used by a web app (deploys daily), an
iOS app (users upgrade over ~6 months), and three partner integrations you
contact by email. You must make these changes:

1. `User.email: String!` becomes a list — users can have several addresses
2. `Order.status` gains a `PARTIALLY_REFUNDED` value
3. `search(term: String!)` must become `search(term: String!, filters: SearchFilters)`, and you'd like `filters` to eventually be required
4. `Product.legacyId: Int!` must go away entirely

For each: is it breaking, what's the migration sequence, and how long does
each phase last given the iOS upgrade curve? Then answer the strategic
question — one of these cannot be completed within a year no matter what you
do, so how do you sequence the work so that constraint doesn't block the
other three?

<details>
<summary>Stuck? One hint</summary>

Change 3 has a hidden trap: adding an optional argument is safe, but your
stated goal of eventually making `filters` **required** is breaking, and
there is no deprecation mechanism that forces callers to start supplying an
argument. The usual resolution is to never make it required — instead give it
a default that preserves current behaviour, and treat "all clients pass
filters" as a measurement target rather than a schema constraint. Change 4 is
the one gated entirely by the iOS curve, and the key insight is that it
blocks nothing else: fields are independent, so you can complete 1, 2 and 3
while `legacyId` sits deprecated and awaiting its removal window.

</details>

## Common mistakes & troubleshooting

- **Versioning a GraphQL API** (`/graphql/v2`, or a `v2` field prefix). It
  discards the per-field blast radius that makes GraphQL evolvable and gives
  you two schemas to maintain.
- **Deprecating without measuring.** Deprecated fields then accumulate
  forever because removal can never be justified.
- **Useless deprecation reasons.** State the replacement and the removal
  date, or consumers can't act on it.
- **Confusing input and output nullability rules.** You may strengthen
  outputs (`String` → `String!`) and relax inputs (`String!` → `String`) —
  the reverse of each is breaking.
- **Marking new output fields non-null by default.** You can tighten later;
  you can't loosen. Start nullable when in doubt.
- **Adding a required argument.** Always breaking, and unlike a field there's
  no deprecation path to force adoption.
- **Assuming enum additions are free.** They validate, but clients switching
  without a default branch mishandle them silently.
- **Removing a field after a week of zero usage.** Meaningless if your
  clients are mobile apps that upgrade over months.
- **No CI schema check.** These rules are exactly what gets missed under
  deadline pressure.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why does GraphQL have no versioning mechanism, and what replaces it?
2. What is the unit of compatibility in GraphQL, and why does that follow
   from how clients query?
3. Give the nullability rule for output fields and for input fields, and
   explain why they're opposites.
4. Why is adding an enum value risky even though it doesn't break schema
   validation?
5. What are the six steps of the field lifecycle, and which one do teams
   usually skip?
6. What's the difference between a schema diff and a traffic-aware schema
   check?
7. Why should a new output field usually start nullable?
8. Why can't a required argument be introduced through deprecation?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because the client selects exactly which fields it wants, so a change only
   affects clients that actually reference the changed field — versioning the
   entire schema to protect one field would be far too coarse. What replaces
   it is additive-only change, `@deprecated` to signal intent, and per-field
   usage measurement to prove when removal is safe.
2. The individual **field**, rather than the endpoint or the whole schema.
   Because a query names each field explicitly, a client that never selects a
   field is unaffected by anything that happens to it — so the blast radius
   of a change is precisely the set of clients selecting it.
3. For **output** fields you may go nullable → non-null (`String` →
   `String!`) but not the reverse; for **input** fields you may go non-null →
   nullable but not the reverse. They're opposites because you can safely
   strengthen what you *promise to return* and safely relax what you *demand
   to receive* — in both cases the existing client's assumptions remain
   valid.
4. Because the query still validates and succeeds, so nothing fails visibly —
   but a client that switches on the enum without a default branch receives a
   value its logic doesn't handle and misbehaves silently. It's a client-side
   hazard the schema can't prevent.
5. Add the replacement; dual-serve both; deprecate the old field; measure
   per-field usage; notify the remaining consumers; remove once usage has
   been zero for a full client-upgrade cycle. Teams usually skip
   **measurement**, which makes the final removal step permanently
   unjustifiable.
6. A schema diff compares two schema documents and reports changes that are
   *theoretically* breaking. A traffic-aware check additionally consults real
   recent usage, so removing a field no client has queried in 90 days can
   pass while removing a heavily-used one fails — a far more useful signal,
   and one that depends on having per-field usage data.
7. Because tightening it later (`String` → `String!`) is a safe, non-breaking
   change, whereas loosening it (`String!` → `String`) is breaking — so
   starting nullable preserves your options, while starting non-null commits
   you permanently to always being able to resolve that field.
8. Because deprecation only labels something as discouraged; it has no
   mechanism to compel callers to start *supplying* something they currently
   omit. Any existing query that doesn't pass the argument becomes invalid
   the moment it's required, so the change is breaking regardless of how long
   it's been signposted. The usual workaround is to keep it optional with a
   behaviour-preserving default.

</details>

## Further reading & sources

- [GraphQL spec: Type system — deprecation](https://spec.graphql.org/draft/#sec-Deprecation) - where `@deprecated` is defined and what it may be applied to.
- [GraphQL.org: Best practices — versioning](https://graphql.org/learn/best-practices/#versioning) - the official argument against versioning a GraphQL API.
- [Apollo: Schema checks](https://www.apollographql.com/docs/graphos/delivery/schema-checks) - traffic-aware checking against real operation data.
- [GraphQL Inspector](https://the-guild.dev/graphql/inspector) - open-source schema diffing and breaking-change detection for CI.
- [Track 16, module 00](../../16-grpc-deep-dive/00-protobuf-schema-design-and-evolution/README.md) - the same evolution problem in protobuf, where versioning *is* the escape hatch.

## Next

[06-graphql-errors-nullability-and-partial-results](../06-graphql-errors-nullability-and-partial-results/README.md) —
nullability turned out to be an evolution decision. Module 06 shows it's also
the single biggest factor in how your API behaves when something fails.
