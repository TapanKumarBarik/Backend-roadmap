# Module 07: GraphQL Security, Caching and Observability

## Why this matters

Module 04 gave you depth and complexity limits, which stop the obvious
attack: a deeply nested query that explodes into millions of resolver calls.
They do **not** stop the two attacks that actually get used, because both
stay comfortably within any depth or complexity budget you'd realistically
set.

Caching has a similar shape. Everything you know about HTTP caching assumes
`GET` with a cacheable URL — and GraphQL is a `POST` to a single endpoint
with the query in the body, which is uncacheable by every CDN and browser
cache in existence. You don't get HTTP caching back by wishing; you get it
back with a specific mechanism.

And observability: `POST /graphql` in your access logs tells you nothing.
Every request looks identical. Without deliberate instrumentation you cannot
answer "which query is slow" — the single most common production question.

## Concepts

### Attack 1: aliases

A depth limit counts nesting. Aliases don't nest:

```graphql
query {
  a1: user(id: "1") { name }
  a2: user(id: "2") { name }
  a3: user(id: "3") { name }
  # ... repeated 10,000 times
}
```

Depth: 2. Complexity, under a naive per-field scorer: fine. Actual cost:
10,000 database lookups from one HTTP request. This is a straightforward
amplification attack and it defeats depth limiting entirely.

Defences, in order of effectiveness:

```python
# 1. Cap total field count / aliases in the document
MAX_ALIASES = 50

# 2. Make complexity scoring multiply by list size, not just count fields
#    users(first: 100) { posts(first: 100) { comments(first: 100) } }
#    = 100 x 100 x 100 = 1,000,000 — a depth of 3
```

The second point is the important one. **Complexity must account for
pagination arguments**, or a three-level query with `first: 100` at each
level scores as 3 and costs a million. Any complexity implementation that
ignores `first`/`last` is decorative.

### Attack 2: batching

Most servers accept an array of operations in one request:

```json
[ {"query":"{ user(id:1){name} }"},
  {"query":"{ user(id:2){name} }"},
  ... 5000 more ]
```

Limits are typically applied **per operation**, so 5,000 individually-legal
queries sail through while costing 5,000 queries' worth of work — and rate
limiting counted one HTTP request.

Fixes: cap the batch size (10 is generous), apply complexity limits to the
**sum** across the batch, and rate-limit by total complexity rather than
request count. If you don't need batching, disable it.

### Rate limiting must be cost-based

Counting requests is meaningless when one request can be a thousand times
more expensive than another. Rate limit on **complexity points consumed**:

```python
cost = estimate_complexity(document, variables)   # before execution
if not bucket.consume(client_id, cost):           # token bucket on points
    raise GraphQLError("Rate limit exceeded",
                       extensions={"code": "RATE_LIMITED", "cost": cost})
```

This is the same token-bucket mechanism from track 09, keyed by client and
denominated in query cost rather than request count.

### Introspection in production

Introspection publishes your entire schema, including deprecated fields and
internal-sounding type names. Whether to disable it in production is a real
tradeoff, not a settled question:

- **Disable it** if the API is internet-facing with known clients — it
  removes a reconnaissance step and breaks nothing for clients who already
  have the schema.
- **Keep it** for internal/partner APIs where tooling depends on it.

Treat it as defence in depth, not a security control: disabling introspection
does not hide fields from anyone willing to guess, and field-suggestion
messages ("Did you mean `passwordHash`?") leak schema detail anyway — disable
those too.

**Persisted queries make this moot**, which is the better answer.

### Persisted queries: the real fix

Instead of accepting arbitrary queries, accept only queries you've seen
before:

```
Build time:  client's queries extracted → hashed → registry
Runtime:     client sends { "id": "sha256:abc123", "variables": {...} }
             server looks up the query by hash; unknown hash → reject
```

This eliminates the entire attack surface: no arbitrary query, therefore no
alias bomb, no complexity attack, no introspection concern. It also shrinks
requests substantially.

**Automatic Persisted Queries (APQ)** are the lighter variant, and are about
bandwidth rather than security:

```
1. Client sends hash only
2. Server: "PersistedQueryNotFound"
3. Client retries with hash + full query
4. Server caches it; all future clients send only the hash
```

Note APQ in its default form still accepts arbitrary queries on the second
round trip — so it is **not** a security control unless you run it in
registry-only mode where unregistered hashes are rejected outright. Teams
routinely conflate the two.

### Caching a POST endpoint

```
GET /users/42        →  cacheable by URL, everywhere, for free
POST /graphql        →  cacheable by nobody
```

Three layers, and you need different mechanisms at each:

**1. CDN / HTTP layer.** Requires GET requests, which requires persisted
queries (the query is now a short hash that fits in a URL):

```
GET /graphql?id=sha256:abc123&variables={"userId":"42"}
Cache-Control: max-age=60
```

**2. Response-level cache hints.** The server computes a cache policy from
the *most restrictive* field in the query:

```graphql
type User @cacheControl(maxAge: 300) {
  id: ID!
  name: String!
  lastSeen: DateTime @cacheControl(maxAge: 10)   # forces the whole response to 10
  ssn: String @cacheControl(scope: PRIVATE)      # forces PRIVATE
}
```

The "most restrictive wins" rule is what makes this safe and also what makes
it disappointing: one volatile or private field drags the entire response's
cacheability down. Design types with that in mind — splitting volatile fields
onto a separate type is often worth it.

**3. Object-level cache.** Cache resolver results by entity id (Redis),
independent of query shape. This is the layer that actually delivers most of
the benefit for authenticated APIs, where HTTP caching is largely
unavailable. It composes naturally with DataLoader from module 03 — the
loader batches within a request, the cache serves across requests.

### Observability: one span per resolver

`POST /graphql` is a useless log line. What you need:

```python
class TracingExtension(SchemaExtension):
    def on_operation(self):
        ctx = self.execution_context
        start = time.perf_counter()
        yield                                    # operation runs
        duration = time.perf_counter() - start
        metrics.histogram("graphql_operation_seconds", duration,
                          tags={"operation": ctx.operation_name or "anonymous",
                                "client": client_name()})

    def resolve(self, _next, root, info, *args, **kwargs):
        field = f"{info.parent_type.name}.{info.field_name}"
        with tracer.start_as_current_span(field):
            start = time.perf_counter()
            try:
                return _next(root, info, *args, **kwargs)
            finally:
                metrics.histogram("graphql_resolver_seconds",
                                  time.perf_counter() - start, tags={"field": field})
```

Three things to record, and the third is the one teams miss:

- **Operation name**, so you can group. Require clients to name every
  operation — anonymous queries are unattributable, and you should reject
  them.
- **Per-resolver duration**, so "the query is slow" becomes "`User.posts`
  is slow".
- **Resolver call *count* per operation.** A resolver that takes 2 ms is fine
  until it's called 500 times — that's the N+1 signature (module 03), and
  duration alone will never show it. Alert on calls-per-operation, not just
  latency.

## Command reference

| Concern | Approach |
|---|---|
| Alias amplification | cap total fields/aliases per document |
| Complexity that counts | multiply by `first`/`last` pagination args |
| Batching attack | cap batch size; sum complexity across the batch |
| Rate limiting | token bucket on **complexity points**, not requests |
| Disable introspection | server config; also disable field suggestions |
| Lock the query surface | persisted queries in registry-only mode |
| Bandwidth only | APQ (**not** a security control by default) |
| CDN caching | persisted queries over `GET` + `Cache-Control` |
| Response cache policy | `@cacheControl(maxAge:, scope:)`, most restrictive wins |
| Cross-request entity cache | Redis keyed by entity id, alongside DataLoader |
| Find the slow field | per-resolver spans + duration histogram |
| Detect N+1 | resolver **call count** per operation |
| Attribute traffic | require named operations + a client header |

## Hands-on exercises

Continue from module 03/04's Strawberry + FastAPI setup.

### 1. Defeat your own depth limit with aliases

With module 04's depth limit active, send a query with 1,000 aliased
`user(id:)` fields.

Expected: it passes validation and executes 1,000 lookups. Time it. Then add
a total-field cap and confirm it's rejected.

### 2. Show naive complexity ignores pagination

Score `users(first:100){ posts(first:100){ comments(first:100){ id } } }` with
a per-field scorer, then with one that multiplies by `first`.

Expected: roughly 4 versus 1,000,000. Set a limit that permits the first
scoring and confirm the query is admitted — then re-run with multiplicative
scoring and watch it be rejected.

### 3. Run a batching attack

Send an array of 2,000 individually-trivial operations.

Expected: all execute; per-operation limits never trigger. Add a batch cap of
10 and a summed complexity budget, then confirm rejection.

### 4. Rate limit by cost

Implement a token bucket denominated in complexity points. Send one expensive
query and many cheap ones.

Expected: the expensive query consumes a large share of the budget while
cheap ones barely register — unlike request counting, which treats them
identically. Verify the `extensions.code` is `RATE_LIMITED` (module 06).

### 5. Leak the schema without introspection

Disable introspection, then send a query with a misspelled field
(`{ user { emial } }`).

Expected: the error suggests `email` — leaking the schema anyway. Disable
field suggestions and confirm the message becomes generic. Write one sentence
on why disabling introspection alone is defence in depth rather than a
control.

### 6. Implement persisted queries

Build a hash → query registry, accept `{"id": "<sha256>", "variables": {...}}`,
and reject unknown hashes.

Expected: known hashes execute; an arbitrary query is rejected outright.
Confirm that your alias bomb from exercise 1 is now *impossible to send*.

### 7. Cache over GET with a CDN

Serve persisted queries via `GET /graphql?id=...&variables=...` with
`Cache-Control: max-age=60`. Put any caching proxy (or Varnish/nginx) in
front.

Expected: the second identical request never reaches your server. Then add a
`@cacheControl(maxAge: 5)` field to the query and confirm the whole
response's TTL drops to 5 — the most-restrictive-wins rule, observed.

### 8. Instrument and find the slow resolver

Add the tracing extension. Make `User.posts` sleep 200 ms. Run a query
selecting 20 users.

Expected: operation duration ~4 s, and the per-resolver histogram shows
`User.posts` called **20 times** at 200 ms each — the N+1 signature. Add a
DataLoader (module 03) and confirm the call count drops to 1 while the
duration collapses. Note that the *count* metric, not the duration metric, is
what identified the problem.

### 9. Diagnose and fix: the API that fell over

A public GraphQL API has a depth limit of 10, a complexity limit of 1,000
(one point per field), rate limiting of 100 requests/minute per API key, and
introspection disabled. It was taken down by a single client using one API
key, well within the request limit. Logs show `POST /graphql` 94 times in the
minute it fell over.

<details>
<summary>Solution</summary>

Every control was bypassed, because each measures the wrong thing.

**The complexity limit ignores pagination.** One point per field means
`users(first:1000){ posts(first:1000){ id } }` scores about 3 while
requesting a million rows. The limit of 1,000 was never reached.

**Aliases defeat the depth limit.** Depth 10 constrains nesting, not breadth;
several hundred aliased root fields in one document have a depth of 2.

**Batching multiplies everything.** If the server accepts arrays, each of
those 94 requests could carry hundreds of operations, each individually under
every per-operation limit.

**Rate limiting counts requests.** 94 requests is under 100, so it never
fired — while those 94 requests did the work of hundreds of thousands.

Introspection being disabled contributed nothing either way; the attacker
didn't need the schema, and disabling it is not a control.

Fixes, in order of impact: make complexity multiplicative over
`first`/`last`; cap total fields/aliases per document; cap batch size and sum
complexity across a batch; and switch rate limiting to complexity points
rather than request count. The durable fix is persisted queries — with a
fixed set of known operations, none of these attacks are expressible at all.

</details>

## Independent challenge

No solution given. Design the full protection and caching strategy for a
public GraphQL API serving three consumer classes: a first-party web app
(you control its queries, deploys daily), a first-party mobile app (you
control its queries, upgrades over months), and public third-party developers
(arbitrary queries, ~2,000 registered keys).

Specify the limits, rate-limiting scheme, caching layers and observability
for each class. Then resolve the central tension: persisted queries solve
nearly every problem but are impossible for third-party developers who by
definition write their own queries — so what do you do for that tier, and how
do you keep it from being the weak point that takes down the other two?

<details>
<summary>Stuck? One hint</summary>

The standard resolution is to stop treating it as one API: first-party
clients go through a persisted-query-only path (locked down, cacheable, no
arbitrary queries), while third-party developers get a separate endpoint with
arbitrary queries permitted but much tighter multiplicative complexity
budgets, smaller pagination caps, cost-based rate limits per key, and — the
part that protects the other two tiers — separate infrastructure or at least
separate resource pools, so third-party load cannot exhaust capacity serving
your own apps. That last point is the noisy-neighbour argument from track 15,
applied at the API tier.

</details>

## Common mistakes & troubleshooting

- **Relying on depth limits alone.** Aliases are flat and defeat them
  entirely.
- **Complexity scoring that ignores `first`/`last`.** A depth-3 query can
  request a million rows and score 3.
- **Per-operation limits with batching enabled.** Thousands of legal
  operations arrive as one request.
- **Rate limiting by request count.** One request can cost a thousand times
  another.
- **Treating disabled introspection as a security control.** Field
  suggestions leak the schema anyway; it's defence in depth at best.
- **Assuming APQ is a security feature.** By default it still accepts
  arbitrary queries on the miss path — only registry-only mode locks it down.
- **Expecting CDN caching over POST.** It requires GET, which requires
  persisted queries.
- **Ignoring most-restrictive-wins in cache hints.** One volatile field
  collapses the whole response's TTL.
- **Allowing anonymous operations.** Unattributable in metrics and traces;
  require operation names.
- **Monitoring resolver duration but not call count.** N+1 is a *count*
  problem and stays invisible in latency alone.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. How does an alias-based attack defeat a depth limit?
2. What must a complexity score account for beyond field count, and why?
3. How does query batching bypass per-operation limits?
4. Why should rate limiting be denominated in complexity points?
5. Why is disabling introspection not a real security control?
6. What's the difference between persisted queries and APQ, security-wise?
7. Why can't a CDN cache a normal GraphQL request, and what makes it
   possible?
8. Why does the most-restrictive-wins rule limit cache-hint usefulness?
9. Which metric reveals N+1, and why isn't resolver latency enough?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because aliases let a client request the same field many times *at the
   same level* rather than nesting — 10,000 aliased root fields have a depth
   of 2. A depth limit constrains nesting only, so the query passes
   validation while costing 10,000 resolver executions.
2. Pagination arguments (`first`/`last`), because the real cost is
   multiplicative: `users(first:100){posts(first:100){comments(first:100)}}`
   is three levels deep but requests up to a million records. Any scorer that
   counts fields without multiplying by requested list sizes will admit
   enormously expensive queries.
3. Because servers typically validate and score each operation in the batch
   independently, so thousands of individually-legal operations all pass —
   while collectively costing thousands of queries' worth of work, and
   counting as a single request for rate-limiting purposes.
4. Because request count is meaningless when one request can be a thousand
   times more expensive than another. Denominating the budget in complexity
   points makes the limit proportional to the work actually requested, which
   is what you're trying to protect.
5. Because it doesn't actually hide anything from a determined caller —
   fields can be guessed, and field-suggestion error messages ("Did you mean
   `email`?") leak schema detail regardless. It removes a convenience for
   reconnaissance, which makes it defence in depth rather than a control.
6. Persisted queries in registry-only mode reject any operation not
   pre-registered, eliminating arbitrary queries and therefore the whole
   class of query-shape attacks. APQ by default still accepts arbitrary
   queries — on a hash miss the client simply sends the full query, which the
   server then caches — so it's a bandwidth optimisation, not a security
   boundary, unless explicitly run in registry-only mode.
7. Because GraphQL is normally a `POST` to a single endpoint with the query
   in the body, and HTTP caches key on method and URL — every request looks
   identical and POST is not cacheable. Persisted queries make it possible:
   the query becomes a short hash that fits in a `GET` URL alongside
   variables, which is cacheable normally.
8. Because the response's cache policy is the most restrictive policy of any
   field in the query, so a single volatile field (`maxAge: 10`) or private
   field (`scope: PRIVATE`) drags the entire response down to that policy —
   meaning one field can make an otherwise highly cacheable query
   effectively uncacheable.
9. Resolver **call count per operation**. A resolver taking 2 ms looks
   perfectly healthy in a latency histogram; the problem is that it was
   invoked 500 times in one operation. Latency measures each call in
   isolation and can never reveal that, whereas call count makes the N+1
   pattern immediately visible.

</details>

## Further reading & sources

- [OWASP: GraphQL Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html) - alias and batching attacks, introspection, and limit design.
- [Apollo: Automatic persisted queries](https://www.apollographql.com/docs/apollo-server/performance/apq/) - the APQ handshake and its registry-only variant.
- [Apollo: Caching with `@cacheControl`](https://www.apollographql.com/docs/apollo-server/performance/caching/) - cache hints and the most-restrictive-wins rule.
- [GraphQL spec: Introspection](https://spec.graphql.org/draft/#sec-Introspection) - what introspection exposes.
- [Strawberry: Schema extensions](https://strawberry.rocks/docs/guides/custom-extensions) - the hooks used for tracing and cost analysis.

## Next

[08-webhooks-vs-polling-vs-websockets-tradeoffs](../08-webhooks-vs-polling-vs-websockets-tradeoffs/README.md) —
GraphQL is now production-ready end to end. The track returns to the broader
question of how clients receive updates at all.
