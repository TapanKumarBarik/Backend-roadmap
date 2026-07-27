# Module 00: Validation Fundamentals

## Why this matters

In track 01 you learned how a request travels from a client to your server:
the method, the path, the headers, the body, and how the body gets
deserialized from JSON into Python objects. This track picks up at the exact
moment that request lands inside your application, and the very first thing
that has to happen — before a single line of business logic runs — is
**validation**. A request is just bytes a stranger sent you. Until you've
checked those bytes, you don't actually know that the "email" field is an
email, that "age" is a number and not the string `"twelve"`, or that the
"date_of_birth" isn't set to the year 3000.

Here's the mental model that matters most and that beginners get wrong:
**validation is a security boundary, not a convenience feature.** A web page
might have a slick form that turns the submit button red when you type a bad
email — that's client-side validation, and it exists purely for *user
experience*. It is trivially bypassed. Anyone can open a terminal and
`curl` your endpoint directly, skipping your JavaScript entirely, sending
whatever bytes they like. So the rule is absolute: **client-side validation
is UX; server-side validation is the gate that actually protects your
business logic and your database.** Even if a field is validated perfectly in
the browser, you re-validate it on the server, every time, no exceptions.

Validation also has a *shape*. There isn't one kind of "is this valid"
check — there are at least three, and conflating them is where bugs live.
**Type validation** asks "is this even the right kind of thing?" (is `age`
an integer at all). **Syntactic validation** asks "is it the right format?"
(does this string look like an email — `user@host.tld`). **Semantic
validation** asks "does it make sense in the real world?" (a date of birth
in the future is a perfectly well-formatted date that is nonetheless
impossible). A value can pass one and fail the next: `"3000-01-01"` is a
syntactically valid date and a semantically invalid birth date.

Get this layer right and everything downstream — your database, your
services, your responses — can *assume* it's working with clean, well-typed,
sensible data. Get it wrong and you've invited garbage (or an attacker) past
the front door.

## Concepts

### The three layers of validation

Think of a nightclub bouncer checking IDs. **Type validation** is "is this
even an ID card, or did you hand me a coffee-shop loyalty card?" —
structurally the wrong kind of object. **Syntactic validation** is "this is
an ID card, but the date field reads `13/45/2020`, which isn't a real
date format." **Semantic validation** is "this is a perfectly formatted ID,
and the date on it says you were born tomorrow." Each check only makes sense
once the previous one has passed — you can't ask whether a birth date is in
the future until you're sure it *is* a date.

- **Type validation** — is the value the correct primitive/structured type?
  Integer vs. string vs. array vs. object. `{"age": "25"}` sends a string;
  do you accept it, coerce it, or reject it? (Transformation, module 01,
  covers coercion; this module is about the check itself.)
- **Syntactic validation** — is the value's *format* correct? Email matches
  `local@domain`, phone matches an expected pattern, a date string parses
  as `YYYY-MM-DD`, a UUID has the right shape.
- **Semantic validation** — is the value *meaningful* given real-world
  rules and often given *other* fields? Date of birth not in the future,
  age within `0..150`, `end_date` after `start_date`. This is the layer
  Pydantic can't fully do for you out of the box — you write it.

### Client-side vs. server-side, and why the server is the real boundary

Client-side validation runs in the user's browser (or mobile app). It's
fast, gives instant feedback, and reduces pointless round-trips — genuinely
good for UX. But it runs on a machine *you do not control*. The user can
disable JavaScript, edit the DOM, replay the request with modified data, or
skip the UI entirely and hit your API with `curl`, Postman, or a script.

```bash
# Your beautiful React form validated this to death. The attacker does not care.
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email", "age": -5, "role": "superadmin"}'
```

Therefore: **the server treats every incoming request as hostile until
validated.** Server-side validation is the last line before your data
reaches business logic and persistence. It is not optional even when
client-side validation exists — the two serve different purposes and the
server's is the one that provides *security*, not politeness.

### Where Pydantic fits (type + syntactic, mostly automatic)

FastAPI uses **Pydantic** models to declare the expected shape of a request
body, and it validates automatically. You declare types; Pydantic enforces
them and returns a structured `422 Unprocessable Entity` on failure —
before your handler function even runs.

```python
from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr                     # syntactic: must look like an email
    age: int = Field(ge=0, le=150)      # type: int; semantic bounds via ge/le
    display_name: str = Field(min_length=1, max_length=50)
```

`EmailStr` handles email syntax. `int` handles type. `Field(ge=0, le=150)`
handles simple numeric bounds. You did *not* write a single `if`. That's the
power of declarative validation: the schema *is* the validator.

### Semantic validation you have to write yourself

Pydantic can't know that a birth date must be in the past — that's a
domain rule. You express it with a **field validator**:

```python
from datetime import date
from pydantic import BaseModel, field_validator

class Person(BaseModel):
    date_of_birth: date

    @field_validator("date_of_birth")
    @classmethod
    def not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return v
```

A validator's contract is simple: it receives the already-type-checked
value, and it either **returns a (possibly transformed) value** or **raises
`ValueError`** to reject it. Raising a plain `ValueError` is the idiom —
Pydantic catches it and folds it into the structured `422` response.

### Failing fast: return early, reject at the edge

The cleanest validation strategy is to **reject invalid input as early as
possible and return immediately**, before any expensive or irreversible
work. This is "fail fast." With Pydantic + FastAPI you get it almost for
free: if the body doesn't match the model, FastAPI returns `422` and your
handler *never runs*. When you do write manual checks, structure them the
same way — check preconditions at the top of the function and `raise`/return
before touching a database or calling another service.

```python
from fastapi import HTTPException

def transfer(amount: int, balance: int):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    if amount > balance:
        raise HTTPException(status_code=400, detail="insufficient funds")
    # ...only now, with all preconditions guaranteed, do the real work
```

The opposite — validating in the middle of business logic, or after a
partial write — leaves you cleaning up half-finished state. Validate at the
edge; keep the core clean.

## Command reference

This track is Python/FastAPI. The "commands" are code patterns you'll reuse
constantly.

| Pattern | What it does | Example |
|---|---|---|
| `class M(BaseModel)` | Declares a validated request/response schema | `class UserCreate(BaseModel): email: EmailStr` |
| `field: int` | Type validation (rejects non-int with 422) | `age: int` |
| `EmailStr` | Syntactic email validation | `email: EmailStr` |
| `Field(ge=, le=, gt=, lt=)` | Numeric bounds (semantic) | `age: int = Field(ge=0, le=150)` |
| `Field(min_length=, max_length=)` | String/collection length bounds | `name: str = Field(min_length=1, max_length=50)` |
| `Field(pattern=r"...")` | Regex/syntactic format check | `code: str = Field(pattern=r"^[A-Z]{3}$")` |
| `@field_validator("f")` | Custom per-field semantic validation | see below |
| `raise ValueError("msg")` | Reject a value inside a validator → 422 | inside a `@field_validator` |
| `raise HTTPException(status_code=400, detail=...)` | Reject inside a handler with a chosen status | in a route function |
| `def route(body: M)` | Binds + validates the body before the handler runs | `async def create(body: UserCreate):` |

**`EmailStr` needs an extra dependency.** It relies on the
`email-validator` package: `pip install "pydantic[email]"`. Without it,
importing `EmailStr` raises an `ImportError`.

**`Field(...)` vs. `field_validator`.** Reach for `Field` constraints first
— they're declarative, self-documenting, and show up in your OpenAPI schema
(module 09) automatically. Drop to `@field_validator` only when the rule
needs logic a constraint can't express (comparing to `date.today()`,
cross-referencing another field, custom parsing).

**The validator signature.** `@field_validator("name")` must decorate a
`@classmethod`. It receives `cls` and the field value `v`, returns `v` (or a
transformed version), and raises `ValueError`/`TypeError`/`AssertionError`
to reject. Do **not** raise `HTTPException` inside a Pydantic validator —
Pydantic won't translate it into a clean `422`; use `ValueError`.

## Hands-on exercises

You'll build one FastAPI project across this whole track. Set it up now.

```bash
mkdir api-layer && cd api-layer
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1   |  bash/WSL: source .venv/bin/activate
pip install "fastapi[standard]" "pydantic[email]"
```

Create `main.py` as you go, and run the dev server with:

```bash
fastapi dev main.py     # serves on http://127.0.0.1:8000, docs at /docs
```

### 1. A model that type-validates for free

```python
# main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class SignupBody(BaseModel):
    username: str
    age: int

@app.post("/signup")
async def signup(body: SignupBody):
    return {"username": body.username, "age": body.age}
```

Send a good request and a bad one:

```bash
curl -X POST localhost:8000/signup -H "Content-Type: application/json" \
  -d '{"username": "ada", "age": 36}'
curl -X POST localhost:8000/signup -H "Content-Type: application/json" \
  -d '{"username": "ada", "age": "thirty-six"}'
```

Expected: the first returns `200` with the echoed data; the second returns
`422` with a body pointing at `age` and an `int_parsing` error type — and
your handler never ran. That's type validation, automatic.

### 2. Add syntactic validation with `EmailStr` and a pattern

```python
from pydantic import BaseModel, EmailStr, Field

class SignupBody(BaseModel):
    username: str = Field(min_length=3, max_length=20, pattern=r"^[a-z0-9_]+$")
    email: EmailStr
    age: int
```

Try `{"username": "Ada Lovelace", "email": "ada@", "age": 36}`.

Expected: `422` with *two* errors — `username` fails the pattern (spaces and
capitals aren't allowed) and `email` fails email syntax. Note Pydantic
reports **all** the failures it found, not just the first.

### 3. Add semantic bounds with `Field`

```python
    age: int = Field(ge=13, le=150)
```

Try `age: 5`, `age: 200`, `age: 30`.

Expected: `5` → `422` (`greater_than_equal`), `200` → `422`
(`less_than_equal`), `30` → `200`. You expressed a real-world rule ("must be
13+, can't be older than 150") declaratively.

### 4. Write your first semantic field validator

Add a birth date that can't be in the future:

```python
from datetime import date
from pydantic import BaseModel, EmailStr, Field, field_validator

class SignupBody(BaseModel):
    username: str = Field(min_length=3, max_length=20, pattern=r"^[a-z0-9_]+$")
    email: EmailStr
    date_of_birth: date

    @field_validator("date_of_birth")
    @classmethod
    def dob_not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return v
```

Try `"date_of_birth": "3000-01-01"` and `"date_of_birth": "1990-05-02"`.

Expected: the future date → `422` with your message; the past date → `200`.
Also try `"date_of_birth": "not-a-date"` — note it fails *before* your
validator runs, with a date-parsing error. That's the type/syntactic layer
gating the semantic layer, exactly as designed.

### 5. Derive and validate age from the birth date

Add a rule: the person must be at least 18. Compute age from
`date_of_birth`:

```python
    @field_validator("date_of_birth")
    @classmethod
    def dob_valid(cls, v: date) -> date:
        today = date.today()
        if v > today:
            raise ValueError("date_of_birth cannot be in the future")
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 18:
            raise ValueError("must be at least 18 years old")
        return v
```

Expected: a birth date making the person 17 → `422`; one making them 25 →
`200`. You're now doing real semantic validation that no `Field` constraint
could express.

### 6. Fail fast in a handler with `HTTPException`

Validation isn't only about the request *body*. Add an endpoint that checks
a precondition and returns early:

```python
from fastapi import FastAPI, HTTPException

BALANCES = {"ada": 100}

@app.post("/withdraw")
async def withdraw(user: str, amount: int):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    balance = BALANCES.get(user)
    if balance is None:
        raise HTTPException(status_code=404, detail="user not found")
    if amount > balance:
        raise HTTPException(status_code=400, detail="insufficient funds")
    BALANCES[user] -= amount
    return {"user": user, "new_balance": BALANCES[user]}
```

Try `?user=ada&amount=-5`, `?user=nobody&amount=10`, `?user=ada&amount=500`,
`?user=ada&amount=30`. Expected: `400`, `404`, `400`, then `200`. Notice
every rejection happens *before* the balance is mutated — nothing is half
done. That's failing fast in action.

### 7. Diagnose and fix

This endpoint is supposed to reject future birth dates and ages under 18,
but it accepts a two-year-old and rejects a valid adult. Find and fix the
bugs — there are two.

```python
from datetime import date
from pydantic import BaseModel, field_validator
from fastapi import FastAPI

app = FastAPI()

class Applicant(BaseModel):
    date_of_birth: date

    @field_validator("date_of_birth")
    def check_dob(cls, v):
        today = date.today()
        if v < today:
            raise ValueError("date_of_birth cannot be in the future")
        age = today.year - v.year
        if age > 18:
            raise ValueError("must be at least 18 years old")
        return v

@app.post("/apply")
async def apply(body: Applicant):
    return {"ok": True}
```

<details>
<summary>Solution</summary>

Two inverted comparisons:

1. `if v < today` rejects *past* dates (every valid birth date) and accepts
   future ones. It must be `if v > today`.
2. `if age > 18` rejects everyone *over* 18. The rule is "at least 18," so
   it must reject `age < 18`.

Bonus correctness: `age = today.year - v.year` overstates age near a
birthday; use the tuple-comparison form from exercise 5. And add
`@classmethod` under `@field_validator` — in Pydantic v2 the validator
should be a classmethod (it works without it via an implicit wrap, but the
decorator order `@field_validator` then `@classmethod` is the documented,
warning-free form).

```python
    @field_validator("date_of_birth")
    @classmethod
    def check_dob(cls, v: date) -> date:
        today = date.today()
        if v > today:
            raise ValueError("date_of_birth cannot be in the future")
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 18:
            raise ValueError("must be at least 18 years old")
        return v
```

</details>

### 8. Prove the server is the real boundary

Add trivial "client-side" validation in your head (pretend the form only
allows `age >= 18`). Now bypass it entirely with `curl`, sending
`{"date_of_birth": "2015-01-01"}` (a child) directly to `/apply` (fixed
version). Expected: the server still returns `422`. The lesson: your
server's rules held even though no browser form was involved. If the *only*
check had been in the browser, this request would have sailed through.

## Independent challenge

No code given. Build a `POST /events` endpoint that accepts an event with a
`title`, a `starts_at` datetime, an `ends_at` datetime, and a `capacity`
integer. Enforce, using the right layer for each rule: `title` is 1–100
characters; `capacity` is between 1 and 10,000; `starts_at` is not in the
past; and `ends_at` is strictly after `starts_at`. Decide deliberately which
rules are **type**, which are **syntactic**, and which are **semantic**, and
which of them a plain `Field(...)` constraint can enforce versus which need a
validator. Make sure that when a client sends multiple bad fields at once,
your API reports *all* the problems in one response, not just the first —
using the **failing-fast** idea from this module, but noting where "fail on
first error" and "report every error" pull in different directions.

<details>
<summary>Hint</summary>

`starts_at`/`ends_at` are individually type+syntactic (Pydantic's
`datetime` handles that) but the "past" and "after" rules are semantic. The
"after" rule compares *two* fields, so a per-field `@field_validator` can't
see both — you'll need a *model*-level validator (`@model_validator`),
which you'll meet properly in module 02. For now, get the single-field rules
right with `Field` + `@field_validator`, and note in a comment where the
cross-field rule would go.

</details>

## Common mistakes & troubleshooting

- **Trusting client-side validation.** If your browser form checks it, the
  server checks it again. Always. The browser is not your security boundary.
- **Confusing the three layers.** A future birth date passes type and
  syntactic validation and still must be rejected. "It parsed" ≠ "it's
  valid."
- **Raising `HTTPException` inside a Pydantic validator.** Validators must
  raise `ValueError` (or `TypeError`/`AssertionError`). Pydantic catches
  those and builds the `422`. `HTTPException` raised there won't be
  translated cleanly.
- **`ImportError` on `EmailStr`.** You need `pip install "pydantic[email]"`
  — the `email-validator` package isn't pulled in by default.
- **Forgetting `@classmethod` under `@field_validator`.** In Pydantic v2 the
  decorated function should be a classmethod, with `@field_validator` on top
  and `@classmethod` directly below it.
- **Validating too late.** Checking a precondition after you've already
  written to the database leaves you with half-committed state. Check at the
  top of the handler and return early.
- **Assuming Pydantic stops at the first error.** It aggregates — one bad
  request can return many errors. This is a feature (module 02 leans on it),
  not a bug.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three layers of validation and give an example value that
   passes the first two but fails the third.
2. A colleague says "the React form already validates the email, so the API
   doesn't need to." What's wrong with this, in one sentence?
3. Which failures does declaring `age: int = Field(ge=0, le=150)` catch, and
   which real-world rule would still need a custom validator?
4. Inside a Pydantic `@field_validator`, what do you `raise` to reject a
   value, and what happens if you `raise HTTPException` instead?
5. What does "fail fast" mean for a handler that moves money, and what goes
   wrong if you validate in the middle instead of at the top?
6. Why does a request with three bad fields typically come back with three
   errors rather than one?

<details>
<summary>Answers</summary>

1. **Type** (right kind of thing — is `age` an integer), **syntactic**
   (right format — does the string look like an email/date), **semantic**
   (meaningful in the real world — a date of birth not in the future).
   `"3000-01-01"` passes type and syntactic (it's a well-formed date) but
   fails semantic as a birth date.
2. The React form runs on the user's machine and is trivially bypassed
   (curl/Postman/disabled JS), so it provides UX, not security — the server
   is the only real boundary.
3. It catches type errors (non-integers) and the numeric bounds `0..150`.
   It does *not* know domain rules like "must be 18+ computed from a birth
   date" — that needs a `@field_validator`.
4. Raise `ValueError` (also `TypeError`/`AssertionError`); Pydantic catches
   it and produces a structured `422`. Raising `HTTPException` there is
   wrong — it isn't translated into the clean validation-error response.
5. Check every precondition (positive amount, user exists, sufficient
   funds) *before* mutating the balance, and return/raise on the first
   failure. Validating mid-way risks a partial write — money moved but a
   later check fails — leaving inconsistent state.
6. Pydantic aggregates all validation failures for the request into one
   error list rather than stopping at the first, so each invalid field
   produces its own entry.

</details>

## Next

[01-transformation-and-normalization](../01-transformation-and-normalization/README.md)
— validation tells you the data is acceptable; now you'll clean, coerce, and
normalize it into the canonical form your business logic actually wants.
