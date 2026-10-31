# Module 06: GraphQL Errors, Nullability and Partial Results

## Why this matters

GraphQL always returns **HTTP 200**, even when everything failed. There is no
404, no 401, no 500 to branch on — errors live in the response body, and a
response can be *partially* successful in a way REST has no equivalent for.

Most teams meet this by throwing exceptions from resolvers and hoping for the
best. The result is an API where a single failing field can blank out an
entire page, where clients can't distinguish "this user doesn't exist" from
"the database is down", and where the fix — adding `!` to make types stricter
— actively makes things worse. Nullability in GraphQL isn't a typing
preference; it's an **error-propagation policy**, and module 05 already
showed you can't take it back once you've committed.

## Concepts

### The response envelope

```json
{
  "data":   { "user": { "name": "Ada", "posts": null } },
  "errors": [
    {
      "message": "Post service unavailable",
      "path": ["user", "posts"],
      "locations": [{ "line": 3, "column": 5 }],
      "extensions": { "code": "SERVICE_UNAVAILABLE" }
    }
  ]
}
```

Both keys can be present simultaneously — that's a **partial result**, and
it's the shape GraphQL is designed around. `data` carries what succeeded;
`errors[]` explains what didn't, with `path` pinpointing exactly which field.

Client rule that follows: **never treat a 200 as success.** Check `errors`,
and check it *per path*, because some of `data` may be perfectly usable.

### Null propagation: the mechanic everything else depends on

When a resolver for a **non-null** field fails or returns null, the error
cannot be represented there — so GraphQL nulls the **parent**. If the parent
is also non-null, it bubbles again, and so on up to `data` itself.

```graphql
type Query { user: User }           # nullable
type User  {
  name: String!                     # non-null
  posts: [Post!]!                   # non-null list of non-null posts
}
```

```
posts resolver throws
   → posts is [Post!]!  (non-null) → can't be null → bubble up
   → user is User       (nullable) → user becomes null   ✓ stops here

data: { "user": null }      ← the entire user is gone because posts failed
```

Now make `user` non-null too (`user: User!`):

```
   → user is User! → can't be null → bubble up
   → data itself becomes null

data: null                  ← the whole response is empty
```

**A single failing leaf field just destroyed the entire response.** That's
the cost of `!`, and it's why over-using non-null is the most common
self-inflicted GraphQL wound.

### The `!` heuristic

Ask: *"if this field alone fails, should everything containing it disappear?"*

| Field | `!`? | Reasoning |
|---|---|---|
| `id: ID!` | Yes | An object without an identity is meaningless |
| `name: String!` | Usually | Comes from the same row as the id; if it fails the object is broken anyway |
| `posts: [Post!]!` | **No** — use `[Post!]` | Separate service/table; a failure here shouldn't erase the user |
| `recommendations: [Item!]` | No | Enrichment; degrade gracefully |
| `email: String` | No | May be genuinely absent |

The pattern: **non-null within a data-fetch boundary, nullable across one.**
Fields resolved from the same source as their parent can be `!`; fields
requiring a separate call should be nullable so their failure is contained.

Note `[Post!]!` vs `[Post!]` vs `[Post]!` are three different promises: the
inner `!` is about elements, the outer about the list itself. `[Post!]` says
"the list may be absent, but if present contains no nulls" — usually what you
want for a fetched collection.

### Errors as data: the result-union pattern

The `errors[]` array is for **exceptional** failures — the database is down,
a bug threw. It's a poor fit for **expected** outcomes like "email already
taken" or "insufficient funds", because those aren't errors in the system
sense, they're business results the client must handle deliberately.

Model expected failures in the schema instead:

```graphql
type Mutation {
  registerUser(input: RegisterInput!): RegisterUserResult!
}

union RegisterUserResult = RegisterUserSuccess | EmailTaken | WeakPassword

type RegisterUserSuccess { user: User! }
type EmailTaken         { existingUserId: ID!, message: String! }
type WeakPassword       { requirements: [String!]!, message: String! }
```

```graphql
mutation {
  registerUser(input: { email: "a@b.com", password: "x" }) {
    __typename
    ... on RegisterUserSuccess { user { id name } }
    ... on EmailTaken          { existingUserId message }
    ... on WeakPassword        { requirements message }
  }
}
```

What this buys you: the failure modes are **typed and discoverable** in the
schema, the client is *forced* by the compiler to handle each case, and the
result stays in `data` where partial-result semantics don't apply. Compare
with a thrown error, which is untyped, invisible in the schema, and nulls the
field.

The tradeoff is verbosity — every mutation grows a union and several types.
The usual line: use result unions for mutations and any query with meaningful
business failure modes; let genuine infrastructure failures throw.

### `extensions.code`: the machine-readable part

`message` is for humans and must never be branched on. `extensions` is where
you put the contract:

```python
from graphql import GraphQLError

raise GraphQLError(
    "You do not have permission to view this order",
    extensions={"code": "FORBIDDEN", "orderId": order_id},
)
```

Conventional codes — `UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`,
`NOT_FOUND`, `INTERNAL_SERVER_ERROR` — mirror the HTTP semantics you lost by
always returning 200. Keep them stable; clients branch on them.

### Never leak internals

By default many servers serialise the exception message and stack trace
straight into `errors[]`, which happily ships your SQL and file paths to the
internet.

```python
import logging, uuid
from strawberry.extensions import SchemaExtension

log = logging.getLogger(__name__)

def mask_errors(errors):
    safe = []
    for err in errors:
        original = getattr(err, "original_error", None)
        if original and not isinstance(original, ExpectedError):
            ref = uuid.uuid4().hex[:12]
            log.exception("graphql error ref=%s path=%s", ref, err.path,
                          exc_info=original)
            err.message = "Internal server error"
            err.extensions = {"code": "INTERNAL_SERVER_ERROR", "ref": ref}
        safe.append(err)
    return safe
```

The `ref` is the important detail: the client gets an opaque id, your logs get
the full trace keyed by the same id, and support can join them without ever
exposing internals.

### Errors inside lists

A failing element in a list is where nullability bites hardest:

```
[Post!]!   one bad post → list can't hold null → bubble to parent → user lost
[Post!]    one bad post → list itself becomes null → all posts lost
[Post]     one bad post → that element is null → the other 49 survive  ✓
```

For a collection assembled from independently-fetchable items, `[Post]` gives
per-item degradation. It costs the client a null check per element, which is
usually the right trade for a feed or search result.

## Command reference

| Concern | Syntax / API |
|---|---|
| Partial result | `{"data": {...}, "errors": [...]}` — both present |
| Which field failed | `errors[].path` |
| Machine-readable code | `errors[].extensions.code` |
| Raise a typed error | `raise GraphQLError(msg, extensions={"code": "..."})` |
| Contain a failure | make the field nullable |
| Per-element degradation | `[Post]` rather than `[Post!]!` |
| Expected business failure | result union + `__typename` |
| Client branches on type | `... on EmailTaken { ... }` |
| Mask internals | error-processing hook + log reference id |
| Strawberry hook | `SchemaExtension` / `process_errors` |

## Hands-on exercises

Continue from module 03/04's Strawberry + FastAPI setup.

### 1. Produce a partial result

Give `User` a `posts` field whose resolver raises. Make `posts` **nullable**
(`[Post!]`).

Expected:

```json
{"data": {"user": {"name": "Ada", "posts": null}},
 "errors": [{"path": ["user", "posts"], ...}]}
```

`name` survives. Note that HTTP status is **200** — confirm with `curl -i`.

### 2. Watch the null bubble up

Change `posts` to `[Post!]!` and re-run.

Expected: `user` is now `null` entirely — the name you could have shown is
gone. Then make `user: User!` as well.

Expected: `"data": null`. Three schema characters erased the whole response.
Record all three outputs side by side; this progression is the module's core
lesson.

### 3. Contain a failure with per-element nulls

Return 50 posts where one resolver raises. Compare `[Post!]!`, `[Post!]` and
`[Post]`.

Expected: 0 posts, 0 posts, and **49 posts plus one null** respectively. Note
which one you'd want for a feed.

### 4. Branch on `extensions.code`, not `message`

Raise `GraphQLError("Not allowed", extensions={"code": "FORBIDDEN"})`. Write a
client that branches on the code. Then change the message text only.

Expected: the client still works. Now make it branch on `message` instead and
change the wording — it breaks. That's why `message` is not a contract.

### 5. Build a result union

Implement `registerUser` returning `RegisterUserSuccess | EmailTaken |
WeakPassword`. Query it with `__typename` and inline fragments.

Expected: each outcome arrives in `data` with no `errors[]` entry at all.
Then implement the same thing by throwing, and compare what the client has to
write in each case.

### 6. Prove the schema documents the failures

Introspect the union:

```graphql
{ __type(name: "RegisterUserResult") { possibleTypes { name } } }
```

Expected: all three outcomes are discoverable from the schema. Contrast with
the thrown-error version, where the possible failures appear nowhere in the
schema and a client author has to read your source.

### 7. Mask an internal error

Make a resolver raise `ValueError("connection to 10.0.3.4:5432 refused:
password authentication failed for user 'admin'")`. Observe the default
response, then add the masking hook.

Expected: before, credentials and internal IPs are in the HTTP response;
after, `"Internal server error"` plus a `ref`, with the full detail only in
your logs under that same ref. Verify you can find the log line from the ref.

### 8. Diagnose and fix: the dashboard that goes blank

A dashboard shows a user's profile, orders, and recommendations. When the
recommendations service (a flaky third party) is down, **the entire dashboard
renders empty** — not just the recommendations panel. The schema:

```graphql
type Query { dashboard(userId: ID!): Dashboard! }
type Dashboard {
  user: User!
  orders: [Order!]!
  recommendations: [Item!]!
}
```

The client shows a generic "Something went wrong" page whenever `errors` is
non-empty.

<details>
<summary>Solution</summary>

Two independent causes, and both must be fixed.

**Server: non-null bubbling.** `recommendations: [Item!]!` cannot be null, so
its failure bubbles to `Dashboard`, which is `Dashboard!` on the `dashboard`
field, so that bubbles to `data` — the whole response becomes `null`. The
profile and orders were fetched successfully and are discarded on the way
out. Fix: make `recommendations: [Item!]` (nullable), applying the heuristic
that a field crossing a service boundary should be nullable so its failure is
contained. `user` and `orders` can keep their `!` if they come from your own
datastore.

**Client: treating any error as total failure.** Even with the server fixed,
a client that blanks the page whenever `errors` is non-empty still shows
nothing useful. GraphQL's partial-result model requires the client to render
`data` and degrade only the paths named in `errors[]` — here, showing the
profile and orders while the recommendations panel displays a fallback.

Worth noting the diagnostic order: the client bug is invisible until the
server bug is fixed, because right now `data` genuinely is null. Fix the
schema first, then the client's error handling, then verify by failing the
recommendations service on purpose.

</details>

## Independent challenge

No solution given. Design the error handling for a checkout mutation that
can fail in these ways: the cart is empty; an item went out of stock while
the user was checking out; the payment card was declined; the payment
provider timed out (you don't know if it succeeded); and the order database
is down.

For each, decide whether it belongs in `errors[]` or in the schema as a
result type, and justify it. Then design the full `CheckoutResult` union and
specify the nullability of every field on the success type. Finally, address
the hard one: the payment-provider timeout is genuinely ambiguous — the
charge may or may not have happened — so what does the client see, and what
must the *server* have done beforehand for any answer here to be safe?

<details>
<summary>Stuck? One hint</summary>

The clean split is that the first three are expected business outcomes the
client must handle deliberately (result union members), while the database
outage is a genuine system failure (`errors[]` with
`INTERNAL_SERVER_ERROR`). The timeout is the interesting one and it isn't
really an error-modelling problem at all — no response shape makes an
ambiguous charge safe. It's an idempotency problem: the server must have sent
a deterministic idempotency key with the payment request (track 10) so the
operation can be safely retried or queried, and only then can it return
something honest like a `CheckoutPending` type carrying a reference the
client can poll.

</details>

## Common mistakes & troubleshooting

- **Treating HTTP 200 as success.** GraphQL returns 200 for almost
  everything; the client must inspect `errors[]`.
- **Marking everything non-null.** Each `!` is a promise that a failure
  destroys the parent — the most common cause of blank pages.
- **`[Item!]!` for a collection from another service.** One bad element or
  one failed call erases the whole parent.
- **Branching on `error.message`.** It's human-facing prose; use
  `extensions.code`.
- **Using `errors[]` for expected business outcomes.** They're untyped,
  undiscoverable in the schema, and null the field. Model them as result
  types.
- **Leaking exception text and stack traces.** Mask them and return an opaque
  reference id instead.
- **Clients that blank the page on any error.** Defeats the entire
  partial-result design.
- **Forgetting `__typename` when querying a union.** The client can't tell
  which member it received.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. What HTTP status does a failed GraphQL query return, and what must the
   client check instead?
2. Explain null propagation, and what happens when every field in the chain
   is non-null.
3. What's the heuristic for deciding whether a field should be non-null?
4. What's the difference between `[Post!]!`, `[Post!]` and `[Post]` when one
   element fails?
5. When should a failure be a result-union member rather than an entry in
   `errors[]`?
6. Why must clients branch on `extensions.code` rather than `message`?
7. What's the risk of default error serialisation, and what's the fix that
   still lets support debug the issue?
8. Why is a "partial result" impossible in REST but normal in GraphQL?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. **200**, in almost all cases — including when the query failed entirely.
   The client must inspect the `errors[]` array, and inspect it per `path`,
   since `data` may still contain usable fields alongside the errors.
2. When a non-null field's resolver fails or returns null, GraphQL cannot
   represent null there, so it nulls the **parent** instead; if the parent is
   also non-null it bubbles further up. If every field in the chain is
   non-null, it bubbles all the way to the root and `data` itself becomes
   `null` — one failing leaf destroys the whole response.
3. Ask whether everything containing the field should disappear if that field
   alone fails. In practice: non-null **within** a data-fetch boundary
   (fields from the same row/source as their parent), nullable **across** one
   (fields requiring a separate service or query), so a remote failure is
   contained rather than bubbling.
4. `[Post!]!` — the list can't be null and can't hold nulls, so a bad element
   bubbles up and destroys the parent. `[Post!]` — the list itself becomes
   null, losing every post. `[Post]` — only the failing element is null and
   the remaining posts survive, which is usually what you want for a fetched
   collection.
5. When the failure is an **expected business outcome** the client must
   handle deliberately — email already taken, insufficient funds, out of
   stock. Result unions make those outcomes typed, discoverable in the
   schema, and enforceable by the client's compiler, and they keep the result
   inside `data`. Genuine system failures (a database outage, an unhandled
   bug) belong in `errors[]`.
6. Because `message` is human-facing prose that can be reworded, localised or
   improved at any time, which would silently break any client branching on
   it. `extensions.code` is a stable machine-readable contract intended
   exactly for that purpose.
7. Many servers serialise the raw exception message and stack trace into the
   response, leaking internal hostnames, credentials, SQL and file paths to
   any caller. The fix is to mask unexpected errors to a generic message
   while attaching an opaque reference id, and log the full detail under that
   same id — so support can join the client's report to the server logs
   without exposing anything.
8. Because a REST endpoint returns one resource with one status code — it
   either succeeded or it didn't. A GraphQL query resolves many independent
   fields, each with its own resolver that can succeed or fail separately, so
   the response naturally carries both the fields that worked and errors for
   the ones that didn't.

</details>

## Further reading & sources

- [GraphQL spec: Errors](https://spec.graphql.org/draft/#sec-Errors) - the response format, `path`, and the error-propagation rules for non-null fields.
- [GraphQL spec: Non-Null](https://spec.graphql.org/draft/#sec-Non-Null) - the exact bubbling semantics demonstrated in exercise 2.
- [Sasha Solomon: 200 OK! Error Handling in GraphQL](https://sachee.medium.com/200-ok-error-handling-in-graphql-7ec869aec9bc) - the canonical argument for result unions over thrown errors.
- [Apollo: Error handling](https://www.apollographql.com/docs/apollo-server/data/errors/) - conventional `extensions.code` values and masking unexpected errors.
- [Strawberry: Schema extensions](https://strawberry.rocks/docs/guides/custom-extensions) - the hook used for error masking and field instrumentation.

## Next

[07-graphql-security-caching-and-observability](../07-graphql-security-caching-and-observability/README.md) —
your API now fails gracefully. Module 07 covers keeping it fast and stopping
people from weaponising the flexibility that makes GraphQL useful.
