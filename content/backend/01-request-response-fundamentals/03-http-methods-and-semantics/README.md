# Module 03: HTTP Methods and Semantics

## Why this matters

The method is the verb of an HTTP request — the single token at the start
of the request line (module 01) that declares *what you want done* to the
resource named by the path. `GET /users` means "give me users."
`DELETE /users/42` means "remove user 42." It reads like plain English,
and that's exactly the trap: because the words are familiar, engineers
assume the *semantics* are obvious and skip the two properties that
actually matter — **safety** and **idempotency**. Those two properties
are why a browser will happily retry a `GET` but warns you before
resubmitting a `POST`, why a proxy may cache one method and never another,
and why a flaky network can silently create three users from what you
thought was one request.

Getting methods right is what separates an API that behaves predictably
under retries, caches, and concurrent clients from one that corrupts data
the first time a mobile client's connection blips mid-request. This is
also the bedrock of REST (track 02) and of routing (module 10, where the
same path with different methods maps to different handlers). Nail the
semantics here and "RESTful design" later becomes mostly common sense.

## Concepts

### The methods and what each is for

- **`GET`** — retrieve a representation of a resource. Read-only. No body
  should influence the server. `GET /users`, `GET /users/42`.
- **`POST`** — submit data to be processed, typically *creating* a new
  subordinate resource or triggering an action. `POST /users` with a JSON
  body creates a user. POST is the catch-all "do something with this
  payload" method.
- **`PUT`** — *replace* the resource at a known URL entirely with the
  supplied representation (or create it there if it doesn't exist). `PUT
  /users/42` with a full user object replaces user 42 wholesale.
- **`PATCH`** — *partially* modify a resource; the body describes the
  changes, not the whole new state. `PATCH /users/42` with
  `{"email": "new@x.com"}` changes only the email.
- **`DELETE`** — remove the resource. `DELETE /users/42`.
- **`HEAD`** — like `GET` but the server returns only headers, no body
  (module 02). For cheap existence/metadata checks.
- **`OPTIONS`** — ask what the server permits for a resource; also the
  method browsers use for CORS preflight (module 04).

The pair that trips people is **PUT vs. POST vs. PATCH**: PUT replaces the
*entire* resource at a *specific, client-known* URL; POST creates
something *new* whose URL the *server* decides (returned in `Location`);
PATCH edits *part* of an existing resource. If you send a full object to
`PUT /users/42`, user 42 becomes exactly that object — any field you omit
is erased. That "omitted = erased" behavior is the classic PUT surprise.

### Safety: does it change anything?

A method is **safe** if it is not *intended* to change server state — it's
a pure read. `GET`, `HEAD`, and `OPTIONS` are safe. `POST`, `PUT`,
`PATCH`, `DELETE` are unsafe (they mutate).

Safety is a *contract*, not a guarantee about your code: a `GET` handler
*can* technically write to a database, but if it does, you've violated the
contract and everything that relies on it (caches, prefetchers, crawlers,
retry logic) can now corrupt your data. Search engines and browsers
freely issue `GET`s to prefetch links — if your `GET /delete-account?id=42`
actually deletes accounts, a crawler will delete accounts. Safe methods
must be genuinely side-effect-free.

### Idempotency: does doing it twice equal doing it once?

A method is **idempotent** if making the request N times has the same
effect on server state as making it once. This is about the *end state*,
not the response bytes.

- **`GET`, `HEAD`, `OPTIONS`** — idempotent (and safe): reading twice
  leaves the world unchanged.
- **`PUT`** — idempotent: `PUT /users/42` with the same body twice leaves
  user 42 in exactly the same final state as doing it once.
- **`DELETE`** — idempotent: deleting user 42 twice leaves user 42 gone.
  (The *second* response may be `404`, but the *state* — "42 is gone" — is
  identical. Idempotency is about state, not status code.)
- **`POST`** — **not** idempotent: `POST /users` twice creates *two*
  users. This is why browsers warn "resubmit form?" on refresh after a
  POST.
- **`PATCH`** — **not guaranteed** idempotent: it depends on the patch.
  `PATCH {"email": "x"}` is idempotent (same result twice), but
  `PATCH {"visits": "+1"}`-style relative changes are not.

Why this matters concretely: networks fail *after* the server acted but
*before* the response arrived. A client that retries on timeout will
re-send the request. If the method is idempotent, the retry is safe — the
end state is correct. If it's `POST`, the retry may double-create. This is
the root of the "I clicked once but got charged twice" class of bugs, and
the reason real systems add **idempotency keys** (a client-supplied unique
header the server uses to deduplicate retried POSTs — you'll build toward
this idea in later tracks).

### The safety/idempotency matrix

| Method | Safe? | Idempotent? | Typical use |
|---|---|---|---|
| GET | Yes | Yes | Read a resource |
| HEAD | Yes | Yes | Read headers only |
| OPTIONS | Yes | Yes | Discover allowed methods / CORS preflight |
| PUT | No | Yes | Replace a resource at a known URL |
| DELETE | No | Yes | Remove a resource |
| PATCH | No | Not necessarily | Partially update a resource |
| POST | No | No | Create / trigger a process |

Memorize this table. Almost every "should this be PUT or POST?" and "is it
safe to retry?" question is answered by reading a row. The same facts as a
2×2 grid — safe implies idempotent, but not the reverse:

```
                      IDEMPOTENT                    NOT IDEMPOTENT
                ┌───────────────────────┬───────────────────────┐
      SAFE      │  GET   HEAD  OPTIONS  │       (empty —         │
   (read-only)  │  reading never mutates│   safe ⇒ idempotent)   │
                ├───────────────────────┼───────────────────────┤
     UNSAFE     │  PUT      DELETE      │  POST                  │
    (mutates)   │  retry = same state   │  PATCH (usually)       │
                │                       │  retry may double-act  │
                └───────────────────────┴───────────────────────┘
```

Anything in the right-hand "not idempotent" column is unsafe to blindly
retry — that column is where idempotency keys earn their keep.

### Request bodies and methods

`GET` and `HEAD` requests conventionally have *no* body — many servers,
proxies, and caches ignore or reject a body on a GET, and it breaks
caching (the body isn't part of the cache key). If you need to send
complex data to *read* something, that's still debated (some APIs abuse
POST for search); the pragmatic rule: don't put a body on GET. `POST`,
`PUT`, `PATCH` carry bodies. `DELETE` usually has no body.

### Method + status code pairings (a preview)

Methods have conventional response codes (module 05 makes these precise):

- `GET` success → `200 OK` with the body.
- `POST` that creates → `201 Created` with a `Location` header pointing at
  the new resource.
- `PUT`/`PATCH` success → `200 OK` (with body) or `204 No Content`.
- `DELETE` success → `204 No Content` (nothing left to return).
- Any method on a missing resource → `404 Not Found`.
- A method the resource doesn't support → `405 Method Not Allowed`, with
  an `Allow` header listing what *is* supported.

## Command reference

| Command | What it does |
|---|---|
| `curl URL` | A `GET` (the default) |
| `curl -I URL` | A `HEAD` request |
| `curl -X OPTIONS -i URL` | An `OPTIONS` request; check the `Allow` header |
| `curl -X POST -H 'Content-Type: application/json' -d '{...}' URL` | Create via POST |
| `curl -X PUT -H 'Content-Type: application/json' -d '{...}' URL` | Replace via PUT |
| `curl -X PATCH -H 'Content-Type: application/json' -d '{...}' URL` | Partial update |
| `curl -X DELETE URL` | Delete |
| `curl -i URL` | Include the response status line + headers in output |

Notes:

- **`-X <METHOD>`** overrides the method. Without it, curl uses `GET`, or
  `POST` if you pass `-d`.
- **`-d '<data>'`** sends a request body (and defaults the method to POST
  and `Content-Type` to `application/x-www-form-urlencoded` unless you set
  it — always add `-H 'Content-Type: application/json'` for JSON).
- **`-i`** prints the response's status line and headers before the body —
  essential for seeing `201`/`204`/`405` and the `Location`/`Allow`
  headers.
- **`-X OPTIONS`** with `-i` reveals the `Allow` header on well-behaved
  servers: the list of methods that resource supports.

A FastAPI app exposing all the methods (used in exercises):

```python
from fastapi import FastAPI, HTTPException, Response, status

app = FastAPI()
USERS = {1: {"id": 1, "name": "Ada", "email": "ada@x.com"}}
_next_id = 2

@app.get("/users")
def list_users():
    return list(USERS.values())

@app.get("/users/{uid}")
def get_user(uid: int):
    if uid not in USERS:
        raise HTTPException(status_code=404, detail="not found")
    return USERS[uid]

@app.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(user: dict, response: Response):
    global _next_id
    uid = _next_id
    _next_id += 1
    USERS[uid] = {"id": uid, **user}
    response.headers["Location"] = f"/users/{uid}"
    return USERS[uid]

@app.put("/users/{uid}")
def replace_user(uid: int, user: dict):
    USERS[uid] = {"id": uid, **user}     # full replace
    return USERS[uid]

@app.patch("/users/{uid}")
def update_user(uid: int, changes: dict):
    if uid not in USERS:
        raise HTTPException(status_code=404, detail="not found")
    USERS[uid].update(changes)           # partial
    return USERS[uid]

@app.delete("/users/{uid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(uid: int):
    USERS.pop(uid, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

## Hands-on exercises

Run the app above with `uvicorn app:app --reload`.

### 1. GET is safe and idempotent

```bash
curl -s http://127.0.0.1:8000/users
curl -s http://127.0.0.1:8000/users
```

Expected: identical output both times, and the user list is unchanged.
Reading twice changed nothing — safe and idempotent.

### 2. POST is not idempotent — prove it

```bash
curl -s -i -X POST -H 'Content-Type: application/json' \
     -d '{"name": "Lin", "email": "lin@x.com"}' http://127.0.0.1:8000/users
curl -s -i -X POST -H 'Content-Type: application/json' \
     -d '{"name": "Lin", "email": "lin@x.com"}' http://127.0.0.1:8000/users
curl -s http://127.0.0.1:8000/users
```

Expected: each POST returns `201 Created` with a **different** `Location`
(`/users/2`, then `/users/3`), and the final list has *two* Lins. Same
request, sent twice, created two resources — the definition of
non-idempotent.

### 3. PUT is idempotent — prove it

```bash
curl -s -X PUT -H 'Content-Type: application/json' \
     -d '{"name": "Ada Lovelace", "email": "ada@x.com"}' http://127.0.0.1:8000/users/1
curl -s -X PUT -H 'Content-Type: application/json' \
     -d '{"name": "Ada Lovelace", "email": "ada@x.com"}' http://127.0.0.1:8000/users/1
curl -s http://127.0.0.1:8000/users/1
```

Expected: after both PUTs, user 1 is in exactly the same state as after
one. Sending it twice = sending it once.

### 4. Watch PUT erase an omitted field

```bash
curl -s http://127.0.0.1:8000/users/1          # has name AND email
curl -s -X PUT -H 'Content-Type: application/json' \
     -d '{"name": "Ada Only"}' http://127.0.0.1:8000/users/1
curl -s http://127.0.0.1:8000/users/1          # email is GONE
```

Expected: the second GET shows user 1 with `name` but **no** `email` —
PUT replaced the *whole* resource, and you omitted `email`, so it was
erased. This is the #1 PUT gotcha.

### 5. PATCH changes only what you send

```bash
curl -s -X PATCH -H 'Content-Type: application/json' \
     -d '{"email": "ada@newdomain.com"}' http://127.0.0.1:8000/users/1
curl -s http://127.0.0.1:8000/users/1
```

Expected: `email` updated, `name` untouched. Contrast with exercise 4:
PATCH is surgical, PUT is wholesale.

### 6. DELETE is idempotent (state-wise)

```bash
curl -s -i -X DELETE http://127.0.0.1:8000/users/1
curl -s -i -X DELETE http://127.0.0.1:8000/users/1
curl -s -i http://127.0.0.1:8000/users/1
```

Expected: first DELETE → `204 No Content`; second DELETE → still `204`
(this app deletes idempotently); the GET → `404`. Whether the second
DELETE returns `204` or `404`, the *state* ("user 1 is gone") is the same
both times — that's idempotency.

### 7. OPTIONS and the 405 path

```bash
curl -s -i -X OPTIONS http://127.0.0.1:8000/users
```

Now try a method the route doesn't define, e.g. DELETE on the collection:

```bash
curl -s -i -X DELETE http://127.0.0.1:8000/users
```

Expected: the `DELETE /users` returns `405 Method Not Allowed` (there's no
collection-level delete handler) — and a well-behaved response includes an
`Allow` header listing the methods that *are* supported (`GET, POST`).
`405` means "the resource exists but not with that verb," distinct from
`404` ("no such resource").

### 8. Diagnose and fix: a dangerous "safe" method

Here's a broken endpoint. Add it and see the problem:

```python
# BUG: a GET that mutates state
DELETED = []

@app.get("/users/{uid}/delete")
def delete_via_get(uid: int):
    USERS.pop(uid, None)
    DELETED.append(uid)
    return {"deleted": uid}
```

```bash
curl -s http://127.0.0.1:8000/users/2/delete
curl -s http://127.0.0.1:8000/users
```

Expected: the GET *deleted* a user. **Diagnose:** this violates safety —
a `GET` must not change state. Any prefetcher, crawler, browser
link-preview, or accidental retry will silently delete users. This is a
real historical bug class (a web accelerator once deleted a company's
content by prefetching "delete" links). **Fix:** make deletion a
`DELETE` on `/users/{uid}` (as the app already does) and remove the GET
variant. Re-verify that reads never mutate. Lesson: the *method* is a
contract with every intermediary on the internet — honor safety.

### 9. Idempotency under a simulated retry

Reason and test: a client sends `POST /users`, the server creates the
user, but the response is lost, so the client retries. Simulate by just
running the POST twice (exercise 2). Now imagine the endpoint were `PUT
/users/lin` instead (client-chosen ID). Run a PUT to a fixed ID twice.

Expected understanding: the POST retry double-created (bad under retry);
the PUT retry did not. This is *why* payment and "create order" endpoints
either use PUT with a client-generated ID or add an idempotency key to a
POST — to make retries safe.

## Independent challenge

No code given.

**Task:** Design (and implement in FastAPI) a `/notes` API where creating
a note is *safe to retry* even though creation is conceptually a POST-like
operation. The client must be able to send the same "create this note"
request twice — because its network blipped and it retried — and end up
with exactly **one** note, not two. Prove it: send the identical create
request twice and show the collection contains a single note, then send a
genuinely different create and show it adds a second. You may not rely on
the server guessing "these look similar"; the client must give you
something to deduplicate on. Reference the idempotency property from this
module and the `Location`/`201` conventions by name.

<details>
<summary>Hint</summary>

Either (a) let the client choose the note's ID and use `PUT /notes/{id}`
(idempotent by construction), or (b) keep `POST /notes` but require the
client to send an `Idempotency-Key` header; store which keys you've seen
and, on a repeat key, return the *already-created* note instead of making
a new one. Both turn a non-idempotent create into a retry-safe one.

</details>

## Common mistakes & troubleshooting

- **Using GET for actions that mutate.** Breaks safety; crawlers,
  prefetchers, and retries will trigger the side effect. Use POST/PUT/
  PATCH/DELETE.
- **Confusing PUT and PATCH.** PUT replaces the whole resource (omitted
  fields vanish); PATCH edits part of it. Choosing PUT when you meant
  PATCH silently deletes data.
- **Assuming POST is retry-safe.** It isn't idempotent — retries
  double-create. Add an idempotency key or use PUT with a client-chosen ID
  for retry safety.
- **Returning 200 with no `Location` after a create.** A create should be
  `201 Created` with `Location` pointing at the new resource so the client
  knows its URL.
- **Confusing 404 and 405.** `404` = no such resource; `405` = resource
  exists but not for that method (include an `Allow` header).
- **Putting a body on GET.** Many intermediaries ignore or reject it, and
  it breaks caching. Don't.
- **Thinking idempotency is about the response.** It's about *server
  state* after N calls. A second DELETE returning `404` is still
  idempotent because the state ("gone") is unchanged.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define "safe" and "idempotent" and give one method that is both, one
   that is idempotent but not safe, and one that is neither.
2. You `PUT /users/42` a body with only `{"name": "X"}`, but user 42 also
   had an email. What happens to the email, and why?
3. A mobile client sends `POST /orders`, times out, and retries. What can
   go wrong, and name two ways to make this safe.
4. What's the difference between a `404` and a `405` response, and what
   header should accompany a `405`?
5. Is `DELETE` idempotent even though the second call might return `404`?
   Explain in terms of *state*.
6. Why is it dangerous to implement account deletion as
   `GET /account/delete`?
7. When creating a resource, what status code and what header should the
   server return, and what does that header contain?

<details>
<summary>Answers</summary>

1. Safe = not intended to change server state; idempotent = N calls have
   the same effect as one call. Both: `GET` (also HEAD/OPTIONS).
   Idempotent but not safe: `PUT` (or `DELETE`). Neither: `POST`.
2. The email is erased. PUT replaces the *entire* resource with the body
   you sent; any field you omit is gone. (PATCH would have preserved it.)
3. The retry may create a second order (POST isn't idempotent). Fixes: use
   `PUT` with a client-chosen order ID, or require an `Idempotency-Key`
   header the server deduplicates on.
4. `404` = the resource doesn't exist; `405` = it exists but doesn't
   support that method. A `405` should include an `Allow` header listing
   the supported methods.
5. Yes. Idempotency is about the resulting *state*, not the status code.
   After one DELETE or ten, user 42 is gone — same state. The `404` on the
   second call just reports "already gone."
6. `GET` must be safe, but this one mutates. Crawlers, browser
   link-prefetch, and accidental retries all issue GETs freely, so they'd
   silently delete accounts.
7. `201 Created`, with a `Location` header containing the URL of the newly
   created resource.

</details>

## Cumulative review

Closed-book. These pull from modules 00-03. Write each answer before
expanding.

1. (00 + 01) Trace what happens between typing `https://api.example.com/users`
   and your route handler running, then name which single line of the raw
   HTTP request tells the server *which method and path* you want.
2. (01 + 02) In a raw HTTP request, what separates headers from the body,
   and which header category does `Content-Type` belong to?
3. (02 + 03) A `POST /users` returns `201`. Which response header tells the
   client the new resource's URL, and which header *category* is it?
4. (00 + 03) Why does statelessness (module 01) combined with idempotency
   (module 03) make it safe for a load balancer to retry a `GET` against a
   different backend?
5. (02 + 03) You see `Allow: GET, POST` on a `405` response to
   `DELETE /users`. Explain what happened and what the header is telling
   you.
6. (00 + 06 preview) DNS TTL and HTTP `Cache-Control: max-age` share a
   core idea. State it in one sentence.

<details>
<summary>Answers</summary>

1. Browser parses the URL → DNS resolves the host to an IP → TCP handshake
   → TLS handshake → HTTP request sent → routed through LB/proxy → your
   handler runs. The **request line** (`GET /users HTTP/1.1`) carries the
   method and path.
2. A blank line (`\r\n\r\n`) separates headers from body. `Content-Type`
   is a *representation* header (it describes the body).
3. The `Location` header carries the new resource's URL; it's a *response*
   header.
4. Because no backend holds session state (stateless) and a `GET` is
   idempotent+safe, any backend can serve the retry with the same result
   and no side effects — so retrying elsewhere is harmless.
5. `DELETE` isn't supported on the `/users` collection, so the server
   returned `405 Method Not Allowed`; the `Allow` header lists the methods
   that *are* supported there (`GET`, `POST`).
6. Both specify "how long may I reuse a previously fetched answer before I
   must ask again" — a time-to-live on cached data.

</details>

## Further reading & sources

- [MDN: HTTP request methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods) - the per-method reference with safe/idempotent/cacheable annotations.
- [RFC 9110 §9: Methods](https://www.rfc-editor.org/rfc/rfc9110#name-methods) - the authoritative definitions, including the formal safe and idempotent properties.
- [MDN: Safe (HTTP methods)](https://developer.mozilla.org/en-US/docs/Glossary/Safe/HTTP) and [Idempotent](https://developer.mozilla.org/en-US/docs/Glossary/Idempotent) - concise glossary entries for the two properties this module hinges on.
- [MDN: 405 Method Not Allowed](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/405) - the status and its `Allow` header, from exercise 7.
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) - a real-world idempotency-key design for making POST retries safe.

## Next

[04-cors-and-preflight-requests](../04-cors-and-preflight-requests/README.md)
— now that you know methods and the `Origin` header, we can explain why
browsers sometimes send a mysterious extra `OPTIONS` request before the
real one.
