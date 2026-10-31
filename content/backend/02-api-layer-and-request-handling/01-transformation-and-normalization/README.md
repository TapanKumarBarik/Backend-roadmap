# Module 01: Transformation and Normalization

## Why this matters

Validation (module 00) answered "is this data acceptable?" Transformation
answers a different question: "the data is acceptable, but is it in the
*canonical form* my business logic and database actually want?" These are
distinct steps, and a huge class of real-world bugs comes from skipping the
second one. Two users sign up as `Ada@Example.com` and `ada@example.com`.
Both are valid emails. But if you store them verbatim, you now have two
accounts for one human, and your "email must be unique" constraint didn't
save you — because to a raw string comparison, those are different strings.
The fix isn't more validation; it's **normalization**: lowercase the email
before you ever compare or store it.

Transformation shows up everywhere at the API edge. A query parameter
arrives as the string `"25"` and your code wants the integer `25`. A user
pastes `"  ada@example.com  "` with stray whitespace. A phone number comes
in as `"(555) 123-4567"` but your SMS provider wants `+15551234567`. A date
arrives as `"07/24/2026"` from a US form but your database column is a
proper `date`. In every case the raw input is *acceptable* but not yet
*usable* — it needs casting, trimming, reformatting, or reshaping into one
consistent representation. If you don't do this centrally at the edge, every
downstream function ends up re-implementing it slightly differently, and the
inconsistencies become bugs.

There's a security dimension too. Some transformation *is* defense.
Sanitizing user-submitted strings — and, more importantly, using
parameterized queries so those strings can never be interpreted as code —
is how you stop SQL injection. Beginners often think "sanitization" means
"strip out bad characters." That helps for display concerns, but the real
protection against injection is *never mixing untrusted data into a command
string in the first place*. This module makes the distinction concrete so
you don't build a false sense of safety.

The order matters, and it's the mirror of a common instinct. You **normalize
before you validate the normalized form**, and you **validate before you
trust**. Trim and lowercase the email, *then* check uniqueness against the
canonical value. Cast the string to an int, *then* bounds-check the int.
Getting this pipeline in the right order is most of the skill.

## Concepts

### Type casting from string-typed inputs

Path and query parameters arrive as **strings**, always — they came off a
URL. `GET /items?page=2&limit=50` gives you `"2"` and `"50"` as text.
FastAPI casts them for you when you annotate the types, and rejects
un-castable values with a `422`:

```python
@app.get("/items")
async def list_items(page: int = 1, limit: int = 20):
    # page and limit are real ints here; "abc" would have been rejected as 422
    return {"page": page, "limit": limit}
```

This is transformation *and* validation fused: FastAPI parses the string,
and if it can't produce an `int`, that's a validation error. Same for
`bool` (`"true"`/`"1"`/`"yes"` → `True`), `float`, `UUID`, `date`, and
`datetime` — all castable directly from the incoming string.

### Normalization: one canonical form

Normalization collapses many equivalent inputs into a single canonical
representation so comparisons and storage behave. The classic trio at the
API edge:

- **Lowercasing** case-insensitive identifiers: emails, usernames (if
  case-insensitive), tags. `Ada@Example.COM` → `ada@example.com`.
- **Trimming** leading/trailing whitespace users didn't mean to type.
  `"  ada  "` → `"ada"`. Copy-paste and mobile keyboards add this constantly.
- **Canonicalizing** formats: collapsing internal whitespace, standardizing
  separators, adding a default country code to a bare phone number.

```
   many equivalent inputs                    one canonical form
   ┌─────────────────────┐
   │ "Ada@Example.COM"   │ ─┐
   │ "  ada@example.com "  │ ├─► trim → lower ─► "ada@example.com"
   │ "ADA@EXAMPLE.COM"     │ ─┘                   (compare & store this)
   └─────────────────────┘
```

In Pydantic v2 you do this with a validator (they both validate *and*
transform — same tool) or, for the common trim/lower cases, with a reusable
annotated type:

```python
from pydantic import BaseModel, EmailStr, field_validator

class Signup(BaseModel):
    email: EmailStr
    username: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()      # trim THEN lower — order matters

    @field_validator("username")
    @classmethod
    def trim_username(cls, v: str) -> str:
        return v.strip()
```

Because a validator returns the transformed value, `body.email` downstream is
*already* canonical. You never sprinkle `.lower()` across the codebase.

### `EmailStr` already normalizes case for the domain — but not the whole story

A subtle real-world point: email *domains* are case-insensitive, but the
*local part* (before the `@`) technically isn't, per spec. In practice
almost everyone treats the whole address case-insensitively for login, and
lowercasing the whole thing is the pragmatic, widely-used choice. Just be
deliberate: decide your normalization rule once and apply it everywhere the
email is compared.

### Date and phone reformatting

Users and upstream systems send dates in many formats. Accept what they
send, convert to one internal type (`datetime.date`) as early as possible,
and let the rest of your code work with the real type — never juggle date
*strings*.

```python
from datetime import datetime, date
from pydantic import BaseModel, field_validator

class Booking(BaseModel):
    day: date        # Pydantic parses ISO "2026-07-24" for free

    @field_validator("day", mode="before")
    @classmethod
    def parse_us_format(cls, v):
        # accept US "MM/DD/YYYY" too, before Pydantic's own date parsing
        if isinstance(v, str) and "/" in v:
            return datetime.strptime(v, "%m/%d/%Y").date()
        return v
```

`mode="before"` runs your function on the *raw* input before Pydantic's own
type coercion — the hook for accepting alternative input formats. Phone
normalization follows the same shape: strip non-digits, add a country code
if missing, store one canonical `+E.164` string.

```python
import re

@field_validator("phone")
@classmethod
def to_e164(cls, v: str) -> str:
    digits = re.sub(r"\D", "", v)          # keep only digits
    if len(digits) == 10:                  # bare US number
        digits = "1" + digits
    if len(digits) != 11:
        raise ValueError("phone must be a valid US number")
    return "+" + digits                    # +15551234567
```

Notice this is transformation *and* validation together: it reshapes the
input and rejects what can't be reshaped.

### Sanitization vs. real injection defense

"Sanitization" gets used loosely. Two different jobs hide under the word:

1. **Rendering safety** (output encoding): when you later put user data into
   HTML, escape it so `<script>` can't execute (XSS). This is an *output*
   concern — you encode at the moment of rendering, per context.
2. **Injection safety** for databases: the real defense against **SQL
   injection** is **parameterized queries** — you never build a SQL string
   by concatenating user input. The database driver keeps data and code
   strictly separate.

```python
# WRONG — string interpolation lets input become SQL. Classic injection hole.
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")
# email = "x'; DROP TABLE users; --" is now catastrophic.

# RIGHT — parameterized: the driver binds `email` as data, never as code.
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

Trimming and lowercasing an email does **not** make it injection-safe — a
lowercase string can still carry a SQL payload. Parameterization is the
protection; normalization is about correctness, not injection defense. Keep
those goals separate in your head so you don't build a false sense of
security. (You'll go deep on injection in track 09; here the point is which
technique actually does the job.)

### The pipeline order

At the edge, run: **cast → normalize → validate → use.** Cast the string to
the target type, normalize it to canonical form, validate the canonical
value against your rules, then hand clean data to business logic. In
Pydantic, `mode="before"` validators do casting/parsing of raw input,
default (`mode="after"`) validators normalize and validate the typed value,
and `Field` constraints add declarative bounds — they compose into exactly
this pipeline.

```
  raw "  25 "     ┌───────┐   ┌───────────┐   ┌──────────┐   clean
  from URL/body ─►│ CAST  │──►│ NORMALIZE │──►│ VALIDATE │──► int 25 → use
                  │(before│   │ trim/lower│   │  bounds  │
                  │  → type)   └───────────┘   │  & rules │
                  └───────┘    (after)         └──────────┘
     coercion         ▲            ▲                ▲
     failure → 422 ───┘            │        rule fail → 422
                          Field constraints + @field_validator
```

## Command reference

| Pattern | What it does | Example |
|---|---|---|
| `page: int = 1` | Casts a query/path string to `int` (422 if not castable) | `async def f(page: int = 1)` |
| `flag: bool` | Casts `"true"/"1"/"yes"` → `True` | `async def f(active: bool)` |
| `day: date` | Parses ISO date string → `datetime.date` | `class M: day: date` |
| `@field_validator("f")` (after) | Normalize/validate the already-typed value | `return v.strip().lower()` |
| `@field_validator("f", mode="before")` | Transform the *raw* input before Pydantic's coercion | accept `MM/DD/YYYY` |
| `re.sub(r"\D", "", v)` | Strip non-digits (phone normalization) | → `"5551234567"` |
| `datetime.strptime(v, fmt).date()` | Parse a nonstandard date string | `strptime(v, "%m/%d/%Y")` |
| `Annotated[str, BeforeValidator(f)]` | Reusable transform attachable to many fields | see below |
| `cursor.execute(sql, params)` | Parameterized query — the real injection defense | `execute("... = %s", (email,))` |

**`mode="before"` vs. default (`mode="after"`).** A `before` validator sees
the raw incoming value (often a `str`) *before* Pydantic coerces it to the
declared type — use it to accept alternative formats or pre-clean input. An
`after` validator sees the value *after* coercion (already the declared
type) — use it to normalize and enforce domain rules. Order in the pipeline:
before → coercion → after.

**Reusable transforms with `Annotated`.** When ten fields all need trimming,
don't copy a validator ten times. Attach one:

```python
from typing import Annotated
from pydantic import BaseModel, BeforeValidator

def _trim(v):
    return v.strip() if isinstance(v, str) else v

TrimmedStr = Annotated[str, BeforeValidator(_trim)]

class Profile(BaseModel):
    first_name: TrimmedStr
    last_name: TrimmedStr
    bio: TrimmedStr
```

Now `TrimmedStr` is a self-documenting, reusable transformation. This is the
DRY way to normalize consistently across a large schema.

**Casting failures return 422, not 500.** If `?page=abc` can't become an
`int`, FastAPI produces a `422` validation error automatically. You don't
`try/except` around the cast — the framework handles the failure as a
client error, which is correct: bad input is the client's fault, not a
server crash.

## Hands-on exercises

Continue in the `api-layer` project from module 00.

### 1. Casting query parameters

```python
@app.get("/search")
async def search(q: str, page: int = 1, per_page: int = 20, exact: bool = False):
    return {"q": q, "page": page, "per_page": per_page, "exact": exact}
```

Try `GET /search?q=cats&page=2&per_page=50&exact=true` and then
`GET /search?q=cats&page=abc`.

Expected: the first returns real typed values (`page` is the int `2`,
`exact` is the bool `True`); the second returns `422` because `"abc"` can't
be cast to `int`. You wrote no parsing code.

### 2. Normalize an email (trim then lowercase)

```python
from pydantic import BaseModel, EmailStr, field_validator

class Signup(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

@app.post("/normalize-signup")
async def normalize_signup(body: Signup):
    return {"stored_as": body.email}
```

Send `{"email": "  Ada@Example.COM  "}`. Expected: `stored_as` is
`ada@example.com`. Change the order to `.lower().strip()` and confirm it
still works here — then reason about *why* order can matter when the
transform is, say, "strip then validate length": stripping first changes
what length you measure.

### 3. Prove why normalization matters for uniqueness

Keep a tiny in-memory set of seen emails and reject duplicates:

```python
SEEN_EMAILS: set[str] = set()

@app.post("/register")
async def register(body: Signup):     # Signup already normalizes
    if body.email in SEEN_EMAILS:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="email already registered")
    SEEN_EMAILS.add(body.email)
    return {"registered": body.email}
```

Register `Ada@Example.com`, then try `ada@EXAMPLE.com`. Expected: the second
is rejected `409` — because both normalized to the same canonical string.
Now temporarily remove the normalizing validator and repeat: both succeed,
creating a duplicate. That's the bug normalization prevents.

### 4. Phone number to E.164

```python
import re
from pydantic import BaseModel, field_validator

class Contact(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def to_e164(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 10:
            digits = "1" + digits
        if len(digits) != 11:
            raise ValueError("phone must be a valid US number")
        return "+" + digits

@app.post("/contact")
async def add_contact(body: Contact):
    return {"phone": body.phone}
```

Try `"(555) 123-4567"`, `"555.123.4567"`, `"15551234567"`, and `"123"`.
Expected: the first three all normalize to `+15551234567`; the last returns
`422`. One canonical output from many input formats.

### 5. Accept a second date format with `mode="before"`

```python
from datetime import datetime, date
from pydantic import BaseModel, field_validator

class Booking(BaseModel):
    day: date

    @field_validator("day", mode="before")
    @classmethod
    def parse_us(cls, v):
        if isinstance(v, str) and "/" in v:
            return datetime.strptime(v, "%m/%d/%Y").date()
        return v

@app.post("/book")
async def book(body: Booking):
    return {"day": body.day.isoformat()}
```

Try `{"day": "2026-07-24"}` and `{"day": "07/24/2026"}`. Expected: both
yield `"2026-07-24"`. Now try `{"day": "24/07/2026"}` — it raises because
`%m/%d/%Y` can't parse month 24. Note how the failure is a clean `422`.

### 6. Build a reusable `TrimmedStr`

```python
from typing import Annotated
from pydantic import BaseModel, BeforeValidator

TrimmedStr = Annotated[str, BeforeValidator(lambda v: v.strip() if isinstance(v, str) else v)]

class Profile(BaseModel):
    first_name: TrimmedStr
    last_name: TrimmedStr

@app.post("/profile")
async def profile(body: Profile):
    return {"first": body.first_name, "last": body.last_name}
```

Send `{"first_name": "  Ada ", "last_name": " Lovelace  "}`. Expected:
trimmed values. Confirm you only wrote the transform once but applied it to
two fields — that's the DRY win.

### 7. See the injection hole, then close it (safely, in memory)

You won't wire a real database yet, but you can *see* the difference. Given
`email = "x' OR '1'='1"`, look at what an interpolated query string becomes:

```python
email = "x' OR '1'='1"
bad_sql = f"SELECT * FROM users WHERE email = '{email}'"
print(bad_sql)
# SELECT * FROM users WHERE email = 'x' OR '1'='1'  -> matches EVERY row
```

Now write the parameterized form as a string and confirm the payload stays
*data*:

```python
good_sql = "SELECT * FROM users WHERE email = %s"
params = (email,)   # the driver binds this as a value; it can never become SQL
print(good_sql, params)
```

Expected takeaway: normalizing (`.lower()`, trimming) the malicious string
would **not** have neutralized `bad_sql` — only parameterization does.
Write that sentence down; it's the whole point.

### 8. Diagnose and fix

This endpoint is supposed to store a normalized, trimmed, lowercased tag and
reject empty tags — but `"  "` (spaces only) sneaks through as an empty tag,
and `"URGENT"` is stored with different casing than `"urgent"`. Find and fix
the ordering bug.

```python
from pydantic import BaseModel, Field, field_validator

class Tag(BaseModel):
    name: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def clean(cls, v: str) -> str:
        v = v.lower()
        return v.strip()
```

<details>
<summary>Solution</summary>

Two problems, both about **order**:

1. `Field(min_length=1)` runs on the *raw* value, before the `after`
   validator trims it. So `"  "` has length 2 and passes the length check,
   then gets trimmed to `""` — an empty tag slips through. The length check
   must run on the *trimmed* value. Move the emptiness check into the
   validator (after trimming), or use `mode="before"` to trim before
   Pydantic applies `min_length`.
2. The normalization order is fine for casing, but the real fix ties both
   together — trim first, then check non-empty, then lower:

```python
class Tag(BaseModel):
    name: str

    @field_validator("name", mode="before")
    @classmethod
    def clean(cls, v):
        if not isinstance(v, str):
            return v
        v = v.strip().lower()
        if not v:
            raise ValueError("tag cannot be empty")
        return v
```

Lesson: `Field` constraints and `after` validators see the value at
*different points* in the pipeline. When a constraint must apply to the
*cleaned* value, do the cleaning in a `before` validator (or check inside
the validator), not with a `Field` constraint that runs too early.

</details>

## Independent challenge

No code given. Extend the `POST /register` endpoint you built to accept a
`country` field that arrives inconsistently — users type `"usa"`, `"USA"`,
`"United States"`, `"us"` — and normalize all of them to the ISO 3166
two-letter code `"US"` before storage, rejecting anything you can't map.
Then make the endpoint reuse the same **normalization** you applied to email
in this module so that two registrations differing only in country casing or
email casing are correctly detected as the same user. Reach back to module
00's idea of the three **validation layers** and state, for each field
(email, phone, country), which layer each of your checks belongs to.

<details>
<summary>Hint</summary>

Build a small dict mapping every accepted spelling (lowercased, trimmed) to
its canonical code, and drive a `mode="before"` validator off it — normalize
the input first, look it up, raise `ValueError` on a miss. The normalization
(lower/trim) is transformation; the "is it a country we support" lookup is
semantic validation. Note that you normalize *before* you validate the
normalized value — the same cast→normalize→validate order from this module.

</details>

## Common mistakes & troubleshooting

- **Storing un-normalized identifiers.** Emails/usernames stored with mixed
  case or stray whitespace defeat uniqueness constraints and cause
  "duplicate" accounts. Normalize before comparing or storing.
- **Wrong pipeline order.** Validating length before trimming (or lowercasing
  before validating a case-sensitive rule) gives wrong results. Decide
  cast→normalize→validate and place each step at the right `mode`.
- **Thinking normalization prevents injection.** Trimming/lowercasing is
  about correctness, not security. Parameterized queries are the injection
  defense; a lowercase string can still carry a payload.
- **Manually parsing query params.** Don't `int(request.query_params["page"])`
  and `try/except` it — annotate the type and let FastAPI cast and return
  `422` on failure.
- **Juggling date strings.** Convert to `datetime.date`/`datetime` at the
  edge and pass the real type around; formatting back to a string is a
  presentation concern for the response only.
- **Copy-pasting the same transform across many fields.** Use an
  `Annotated[...]` reusable type (`TrimmedStr`) so normalization is defined
  once and stays consistent.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why do path and query parameters always start as strings, and what does
   FastAPI do when a value can't be cast to the annotated type?
2. Two users register as `Bob@Site.com` and `bob@site.com`. What breaks if
   you don't normalize, and what's the one-line fix?
3. What's the difference between a `mode="before"` and a default
   (`mode="after"`) field validator, and when do you reach for each?
4. Does lowercasing and trimming a user-submitted string protect you from
   SQL injection? What actually does?
5. In what order should you cast, normalize, and validate — and give one
   concrete bug that appears if you validate length before trimming.
6. You need to trim whitespace on twelve string fields. What's the DRY way
   to do it in Pydantic without twelve copies of the same validator?

<details>
<summary>Answers</summary>

1. They're parsed out of a URL, which is text. FastAPI casts them to the
   annotated type and returns a `422` validation error if the string can't
   be cast (e.g. `?page=abc` for an `int`) — a client error, not a crash.
2. Without normalization they're two different strings, so a uniqueness
   check treats them as distinct and you get two accounts for one person.
   Fix: normalize with `.strip().lower()` in a field validator before
   comparing/storing.
3. `before` runs on the raw input *before* Pydantic coerces it to the
   declared type — use it to accept alternative formats / pre-clean.
   `after` runs on the already-typed value — use it to normalize and enforce
   domain rules on the correct type.
4. No — a lowercased/trimmed string can still contain a SQL payload.
   Parameterized queries (binding input as data, never concatenating it into
   the SQL text) are the actual defense.
5. cast → normalize → validate → use. If you validate length before
   trimming, `"  "` (two spaces) passes `min_length=1` but becomes empty
   after trimming, so an "empty" value slips through.
6. Define one reusable annotated type, e.g.
   `TrimmedStr = Annotated[str, BeforeValidator(trim)]`, and annotate all
   twelve fields with it — the transform is written once and applied
   consistently.

</details>

## Further reading & sources

- [Pydantic — Validators](https://docs.pydantic.dev/latest/concepts/validators/) - covers `mode="before"` vs `mode="after"` and how a validator both transforms and validates in one step.
- [Pydantic — Custom types with `Annotated`](https://docs.pydantic.dev/latest/concepts/types/#using-the-annotated-pattern) - the reusable `Annotated[str, BeforeValidator(...)]` pattern behind `TrimmedStr`.
- [FastAPI — Query Parameters and String Validations](https://fastapi.tiangolo.com/tutorial/query-params-str-validations/) - how query/path strings are cast to typed values and constrained.
- [OWASP — SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) - why parameterized queries, not string sanitization, are the real injection defense.
- [OWASP — Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) - the output-encoding side of "sanitization" and why it is a rendering concern.
- [Wikipedia — E.164](https://en.wikipedia.org/wiki/E.164) - the international phone-number format your normalization canonicalizes toward.

## Next

[02-complex-validation-logic](../02-complex-validation-logic/README.md) —
single-field rules only get you so far; next you'll validate *relationships
between* fields, handle conditional requirements, aggregate errors, and
avoid leaking sensitive information in your error messages.
