# Module 02: Complex Validation Logic

## Why this matters

The validators in modules 00 and 01 all looked at **one field at a time**.
Real forms aren't like that. "New password" is only valid if it *matches*
"confirm password" — a rule that needs to see two fields at once. "Partner's
name is required" — but only if `married` is `true`. "The discount code is
required for orders over $500." These are **cross-field**, **conditional**,
and **chained** rules, and no per-field validator can express them, because a
per-field validator structurally cannot see the other fields. You need a
different tool: the **model validator**, which runs after all the individual
fields are parsed and can see the whole object.

The second half of this module is about the *response* side of validation:
error handling. Getting a rejection *right* is a craft. A good validation
error tells the client exactly what's wrong and where (`"age must be >= 18"`,
pointing at the `age` field) so they can fix it — and it reports *all* the
problems at once, not one per round-trip. But some errors must go the
opposite way and reveal *less*: a login endpoint should say `"invalid
credentials"` whether the email was unknown or the password was wrong.
Saying `"no account with that email"` versus `"wrong password"` hands an
attacker an **enumeration oracle** — they can now discover which emails have
accounts. Knowing when to be maximally specific (help the honest user) and
when to be deliberately vague (starve the attacker) is a security judgment,
not a UX one.

Finally, transformations can *fail* — a client sends malformed JSON, or a
date that won't parse, or a number where you expected an object. Your API has
to degrade gracefully into a clean `4xx` with a helpful message, never a bare
`500` stack trace. And all of this has a performance angle: validation isn't
free, so you order checks to fail fast and avoid redundant or expensive work
on input that's already doomed.

## Concepts

### Model validators: seeing the whole object

A `@model_validator` runs on the *whole model*, after each field has been
individually parsed and validated. That's what lets it compare fields to each
other. Use `mode="after"` to get a fully-built model instance (fields already
typed):

```python
from pydantic import BaseModel, model_validator

class PasswordReset(BaseModel):
    password: str
    confirm_password: str

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("password and confirm_password do not match")
        return self
```

```
  @field_validator("password")      @model_validator(mode="after")
  sees ONE field:                   sees the WHOLE object:
   ┌───────────┐                     ┌──────────────────────────────┐
   │ password  │ ✓                   │ password ─┐                  │
   └───────────┘                     │           ├─ compare ✓/✗     │
   confirm_password  ✗ (invisible)   │ confirm ──┘                  │
   can't reach it                    └──────────────────────────────┘
```

`mode="after"` receives `self` (the built instance) and returns `self`.
`mode="before"` receives the raw dict *before* field parsing — useful when
the very shape depends on some field, but you lose type safety, so prefer
`after` unless you specifically need the raw data.

### Conditional validation: required-if

A field that's required only under a condition can't be modeled with a plain
`Optional` type — the *conditionality* is a cross-field rule. Model
validators handle it:

```python
from pydantic import BaseModel, model_validator

class Profile(BaseModel):
    married: bool
    partner_name: str | None = None

    @model_validator(mode="after")
    def partner_required_if_married(self):
        if self.married and not self.partner_name:
            raise ValueError("partner_name is required when married is true")
        return self
```

The field is declared `Optional` (because sometimes it legitimately isn't
there), and the *rule* enforcing when it must be present lives in the model
validator. This pattern — optional type + conditional model validator — is
the canonical shape for "required if."

### Chained validation: order and short-circuiting

Some rules are a *pipeline*: lowercase → strip disallowed characters → check
resulting length. Each step feeds the next, and a failure early should stop
the chain (why check length of something that already failed the character
rule?). You express a chain inside one validator by ordering the steps and
returning early / raising as soon as a step fails:

```python
from pydantic import BaseModel, field_validator

class Username(BaseModel):
    value: str

    @field_validator("value")
    @classmethod
    def clean_and_check(cls, v: str) -> str:
        v = v.strip().lower()                      # step 1: normalize
        v = "".join(c for c in v if c.isalnum())   # step 2: strip specials
        if not (3 <= len(v) <= 20):                # step 3: length of RESULT
            raise ValueError("username must be 3-20 alphanumeric characters")
        return v
```

The order is deliberate: you check the length of the *cleaned* value, not
the raw one, so `"a b!!"` (which cleans to `"ab"`) is correctly rejected as
too short.

### Aggregating errors vs. failing fast — the real tension

Two goals pull against each other. **Fail fast** (module 00) says: reject
ASAP, do no needless work. **Aggregate errors** says: tell the client *every*
problem at once so they don't fix-and-resubmit five times. Which wins depends
on *who benefits*.

- For **validating a request body**, aggregation wins for UX: Pydantic
  already collects every field error into one `422`. A user fixing a form
  wants all the errors at once.
- For **expensive or security-sensitive checks**, fail fast wins: don't run a
  database uniqueness query if the email is already syntactically invalid;
  don't reveal *which* credential was wrong.

```
  FAIL FAST                         AGGREGATE
  check A ─✗─► stop, return         check A ─✗─┐
  (B, C never run)                  check B ─✗─┼─► collect → one 422
   best for: cost, security         check C ─✓─┘   [A failed, B failed]
                                     best for: form UX (fix all at once)
```

Pydantic gives you aggregation for free across field validators. Within a
single validator (or across manual checks in a handler), *you* choose. When
you want to collect multiple manual errors, gather them into a list and raise
once:

```python
def validate_order(order) -> None:
    errors = []
    if order.quantity <= 0:
        errors.append("quantity must be positive")
    if order.total < 0:
        errors.append("total cannot be negative")
    if errors:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail={"errors": errors})
```

### Obscuring sensitive errors: don't build an enumeration oracle

A validation error should help the *legitimate* user, but for
authentication-adjacent flows, specificity helps *attackers*. The rule:

- **Login**: return one generic message — `"invalid email or password"` —
  regardless of whether the email exists or the password was wrong. If you
  say "no such user" for unknown emails and "wrong password" for known ones,
  an attacker learns your entire user list by probing.
- **Password reset / signup**: don't reveal whether an email is registered.
  Respond identically ("if that email exists, we've sent a link") whether or
  not it does.
- **Timing matters too** (advanced, track 09): even if messages match,
  responding faster for unknown users leaks the same info. The concept to
  internalize now: *the error message is part of your attack surface.*

Contrast with a normal validation error, where being specific is exactly
right: `"age must be >= 18"` helps the user and tells the attacker nothing
useful.

### Gracefully handling failed transformations

When JSON is malformed, a date won't parse, or a required field is missing,
the client made an error — respond with a `4xx` and a clear message, never a
`500`. FastAPI already turns Pydantic parse failures into `422`
automatically. For raw-body or manual parsing you catch the failure yourself:

```python
import json
from fastapi import Request, HTTPException

@app.post("/raw")
async def raw(request: Request):
    body = await request.body()
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="request body is not valid JSON")
    return {"received": data}
```

A malformed-JSON request is the client's fault (`400`), not a server bug
(`500`). The distinction matters for monitoring: `5xx` should mean *your*
code broke; `4xx` means the client sent something wrong.

### Performance tradeoffs

Validation costs CPU. Cheap checks (type, length, regex) are negligible;
expensive checks (a database uniqueness lookup, a call to an external
service, hashing) are not. So: **order checks cheap-to-expensive and fail
fast**, and **don't validate the same thing twice.** Verify format before
you spend a database round-trip confirming uniqueness. If a value was
validated at the edge, downstream layers can trust it — re-validating in
every service function is wasted work and a sign the layer boundaries (module
06) are muddy.

## Command reference

| Pattern | What it does | Example |
|---|---|---|
| `@model_validator(mode="after")` | Whole-object validation; can compare fields | `def f(self): ...; return self` |
| `@model_validator(mode="before")` | Runs on raw dict before field parsing | `def f(cls, data): ...; return data` |
| `field: T \| None = None` | Optional field for conditional (required-if) rules | `partner_name: str \| None = None` |
| chained steps in one `@field_validator` | normalize → sanitize → check in order | `v.strip().lower()` then length |
| `raise HTTPException(422, detail={...})` | Manual aggregated error response | `detail={"errors": [...]}` |
| generic auth message | Prevent enumeration | `"invalid email or password"` |
| `json.JSONDecodeError` catch | Turn malformed JSON into a clean `400` | `try: json.loads(...)` |
| `@app.exception_handler(RequestValidationError)` | Customize the global 422 shape | see below |

**`mode="after"` returns `self`; `mode="before"` returns the data.** An
`after` model validator gets the constructed instance and must return it (or
raise). A `before` model validator gets the raw input (usually a dict), can
reshape it, and returns the (possibly modified) data for field parsing.

**Customizing the global validation error shape.** By default FastAPI's
`422` has a `detail` array of Pydantic errors. To standardize your API's
error envelope (you'll formalize this in module 06), override the handler:

```python
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": "validation_failed", "fields": exc.errors()},
    )
```

This catches *every* request-validation failure app-wide and reshapes it —
one place, consistent for all clients.

**Never leak internals in messages.** `exc.errors()` is safe (it's about the
client's input). Never put a raw exception string, SQL, or stack frame into a
response body — that's an information leak. Log the detail server-side;
return a generic message to the client.

## Hands-on exercises

Continue in the `api-layer` project.

### 1. Cross-field: password confirmation

```python
from pydantic import BaseModel, model_validator, Field

class PasswordReset(BaseModel):
    password: str = Field(min_length=8)
    confirm_password: str

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("password and confirm_password do not match")
        return self

@app.post("/reset-password")
async def reset(body: PasswordReset):
    return {"ok": True}
```

Try mismatched passwords, then matching ones under 8 chars, then a valid
pair. Expected: mismatch → `422` (your message); short → `422`
(`min_length`); valid → `200`. Note the field-level and model-level errors
coexist.

### 2. Conditional: required-if

```python
from pydantic import BaseModel, model_validator

class MaritalInfo(BaseModel):
    married: bool
    partner_name: str | None = None

    @model_validator(mode="after")
    def partner_required(self):
        if self.married and not self.partner_name:
            raise ValueError("partner_name is required when married is true")
        return self

@app.post("/marital")
async def marital(body: MaritalInfo):
    return {"married": body.married, "partner": body.partner_name}
```

Try `{"married": true}` (no partner), `{"married": true, "partner_name": "Sam"}`,
and `{"married": false}`. Expected: first → `422`, other two → `200`. The
field is optional, but the *rule* makes it required under a condition.

### 3. Chained validation with result-based length

```python
from pydantic import BaseModel, field_validator

class Handle(BaseModel):
    value: str

    @field_validator("value")
    @classmethod
    def clean(cls, v: str) -> str:
        v = v.strip().lower()
        v = "".join(c for c in v if c.isalnum())
        if not (3 <= len(v) <= 20):
            raise ValueError("handle must be 3-20 alphanumeric characters")
        return v

@app.post("/handle")
async def handle(body: Handle):
    return {"handle": body.value}
```

Try `"  Ada!! "` (cleans to `"ada"`, valid), `"a b!!"` (cleans to `"ab"`,
too short → `422`), and `"Ada_Lovelace_99"` (underscores stripped). Expected
outputs confirm length is checked on the *cleaned* value.

### 4. Aggregate manual errors into one response

```python
from fastapi import HTTPException
from pydantic import BaseModel

class Order(BaseModel):
    quantity: int
    total: float
    coupon: str | None = None

@app.post("/order")
async def order(body: Order):
    errors = []
    if body.quantity <= 0:
        errors.append("quantity must be positive")
    if body.total < 0:
        errors.append("total cannot be negative")
    if body.total > 500 and not body.coupon:
        errors.append("coupon is required for orders over 500")
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    return {"ok": True}
```

Send `{"quantity": 0, "total": -5}`. Expected: one `422` listing *both*
errors — the client fixes everything in one pass. Then send
`{"quantity": 1, "total": 600}` and confirm the coupon rule fires.

### 5. Obscure a sensitive error (prevent enumeration)

```python
from fastapi import HTTPException
from pydantic import BaseModel

USERS = {"ada@example.com": "hunter2"}   # pretend-hashed for the exercise

class Login(BaseModel):
    email: str
    password: str

@app.post("/login")
async def login(body: Login):
    stored = USERS.get(body.email.strip().lower())
    if stored is None or stored != body.password:
        # SAME message whether the email is unknown or the password is wrong
        raise HTTPException(status_code=401, detail="invalid email or password")
    return {"token": "fake-jwt-for-now"}
```

Try an unknown email and a known email with the wrong password. Expected:
*identical* `401` and message for both. Now imagine returning `"no such
user"` vs `"wrong password"` — write down how an attacker would use that to
enumerate accounts.

### 6. Turn malformed JSON into a clean 400

```python
import json
from fastapi import Request, HTTPException

@app.post("/ingest")
async def ingest(request: Request):
    raw = await request.body()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="request body is not valid JSON")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="body must be a JSON object")
    return {"keys": list(data.keys())}
```

Send `-d '{not json'` and then `-d '[1,2,3]'`. Expected: both return `400`
with clear messages, not a `500`. Malformed input is the client's fault and
should be reported as such.

### 7. Standardize the global validation error shape

Add the `RequestValidationError` handler from the command reference. Then
resend any earlier bad request (e.g. exercise 1's mismatch). Expected: the
`422` body is now your custom envelope (`{"error": "validation_failed",
"fields": [...]}`) instead of the default. One handler reshaped every
validation error in the app.

### 8. Diagnose and fix

This registration endpoint is meant to (a) require `company_name` only for
`account_type == "business"`, (b) reject mismatched passwords, and (c)
return all problems at once. Instead it crashes with a `500` on some inputs
and leaks which emails exist. Find and fix three problems.

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, model_validator

app = FastAPI()
EXISTING = {"ada@example.com"}

class Register(BaseModel):
    email: str
    account_type: str
    company_name: str = None          # (A)
    password: str
    confirm_password: str

    @model_validator(mode="after")
    def check(self):
        if self.account_type == "business":
            if self.company_name is None:
                raise ValueError("company_name required")
        if self.password != self.confirm_password:
            raise ValueError("passwords do not match")
        return self

@app.post("/register")
async def register(body: Register):
    if body.email in EXISTING:
        raise HTTPException(status_code=409, detail=f"email {body.email} already exists")
    return {"ok": True}
```

<details>
<summary>Solution</summary>

1. **`company_name: str = None` is a type error.** The declared type is
   `str` but the default is `None`, which Pydantic v2 rejects (or forces to
   fail on validation). It must be `company_name: str | None = None`. That's
   the `500`/parse crash.
2. **Enumeration leak.** `detail=f"email {body.email} already exists"`
   confirms which emails are registered. For signup, respond generically —
   e.g. return `200` with "if that email is new, we've created it / we've
   sent a confirmation," or at minimum a `409` that doesn't echo the address
   back as proof. Don't hand attackers a membership oracle.
3. **Not aggregating.** The model validator raises on the *first* failing
   rule, so a request with both a missing company name and mismatched
   passwords only reports one. Collect into a list and raise once:

```python
class Register(BaseModel):
    email: str
    account_type: str
    company_name: str | None = None
    password: str
    confirm_password: str

    @model_validator(mode="after")
    def check(self):
        errors = []
        if self.account_type == "business" and not self.company_name:
            errors.append("company_name is required for business accounts")
        if self.password != self.confirm_password:
            errors.append("passwords do not match")
        if errors:
            raise ValueError("; ".join(errors))
        return self
```

</details>

## Independent challenge

No code given. Build a `POST /checkout` endpoint. The body has `items` (a
non-empty list), a `payment_method` (`"card"` or `"invoice"`), a
`card_token` (required only when `payment_method == "card"`), a
`purchase_order` (required only when `payment_method == "invoice"`), and a
`shipping` object with `country` and `postal_code`. Enforce: postal code
format depends on country (US = 5 digits, UK = alphanumeric); the correct
payment field is present for the chosen method; and the response reports
*every* violation at once. Reuse the **normalization** idea from module 01 to
canonicalize the country before you branch on it, and apply module 00's
distinction between **syntactic** and **semantic** validation when you decide
which postal-code checks are format versus real-world. Make sure a failed
transformation (e.g. `items` sent as a string instead of a list) comes back
as a clean `4xx`, never a `500`.

<details>
<summary>Hint</summary>

The country-dependent postal rule and the method-dependent required field
are both cross-field — they belong in a single `@model_validator(mode="after")`
that gathers a list of error strings and raises once at the end. Normalize
`country` (upper/trim) *before* you pick which postal regex to apply, so
`"us"`, `"US"`, and `" us "` all take the same branch.

</details>

## Common mistakes & troubleshooting

- **Using a field validator for a cross-field rule.** A `@field_validator`
  can't see other fields. Password-match, required-if, and end-after-start
  all need `@model_validator`.
- **Forgetting to return `self`/the data.** A `mode="after"` model validator
  must `return self`; a `mode="before"` one must return the data. Returning
  `None` silently wipes your model.
- **Leaking which account exists.** Login/reset/signup errors that
  distinguish "unknown email" from "wrong password" create an enumeration
  oracle. Use one generic message.
- **Returning `500` for bad client input.** Malformed JSON, unparseable
  dates, wrong types are `4xx`. Reserve `5xx` for *your* bugs, so monitoring
  stays meaningful.
- **Checking length before cleaning.** In a chain, run normalize/sanitize
  first and validate the *result*, or `"a b!!"` passes a length check it
  should fail.
- **Redundant re-validation everywhere.** Validate once at the edge; let
  inner layers trust the data. Re-validating in every service function wastes
  CPU and signals blurred layer boundaries.
- **Putting exception internals in responses.** Never echo a raw exception,
  SQL, or stack trace to the client. Log it; return a generic message.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why can't a `@field_validator` enforce "confirm_password must equal
   password," and what's the right tool?
2. What must a `mode="after"` model validator return, and what happens if you
   forget?
3. Describe the canonical shape for a "required-if" field (e.g. partner_name
   required only when married is true).
4. When does aggregating all errors beat failing fast, and when does the
   reverse hold?
5. Your login endpoint says "no such email" for unknown emails and "wrong
   password" for known ones. What attack does this enable, and what's the fix?
6. A client posts malformed JSON. What status code should you return, and why
   is a `500` the wrong choice?
7. In a chained validator (normalize → strip specials → check length), why
   must the length check run on the *result* and not the raw input?

<details>
<summary>Answers</summary>

1. A field validator only receives its own field's value, so it can't compare
   two fields. Use `@model_validator(mode="after")`, which sees the whole
   built instance.
2. It must `return self`. Forgetting to return (returning `None`) silently
   replaces the model with `None` and breaks everything downstream.
3. Declare the field as `Optional` (`str | None = None`) and put the
   conditional requirement in a `@model_validator(mode="after")` that raises
   when the trigger field is set but the dependent field is missing.
4. Aggregation wins for request-body/form UX — report every field error in one
   response so the user fixes them all at once (Pydantic does this for free).
   Fail fast wins for expensive or security-sensitive checks — skip a DB
   uniqueness query on already-invalid input; don't reveal which credential
   failed.
5. An enumeration oracle: an attacker probes emails and learns which have
   accounts, building a user/target list. Fix: return one generic message
   ("invalid email or password") for both cases, ideally with matched timing.
6. `400` (or `422`) — malformed JSON is a client error. A `500` implies a
   server fault, which pollutes monitoring and can leak stack traces; bad
   input is the client's fault, not a crash.
7. Because the rule is about the *cleaned* value. `"a b!!"` cleans to `"ab"`
   (length 2); checking length on the raw 5-character string would wrongly
   accept it. Validate what you'll actually store.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–02 while attempting these — the point is
to find out what actually stuck.

1. A birth date of `"3000-01-01"` and a birth date of `"not-a-date"` both get
   rejected, but by *different* validation layers and at different points.
   Explain which layer catches each and why the ordering matters (module 00).
2. You store emails verbatim and later add a "one account per email"
   constraint, yet duplicates still appear. Name the missing step from module
   01, and explain why validation alone wouldn't have prevented it.
3. Why can't a `@field_validator` enforce "confirm_password must equal
   password," and what's the correct tool — including what that tool must
   return (module 02)?
4. Give one rule that should be enforced with a declarative `Field(...)`
   constraint and one that *must* be a custom validator, and say what makes
   the difference (modules 00 & 02).
5. Your login endpoint currently returns `"no user with that email"` for
   unknown emails and `"incorrect password"` for known ones. Describe the
   exact attack this enables and the fix (module 02).
6. A client sends `?page=abc` and, separately, a request body that is
   malformed JSON. What status code should each produce, and why is it wrong
   to let either become a `500` (modules 01 & 02)?
7. You have a chain: lowercase → strip non-alphanumerics → enforce length
   3–20. A username `"J. D."` arrives. Walk through each step and give the
   final outcome, and explain why checking length first would give the wrong
   answer (module 02).
8. Explain the tension between "fail fast" (module 00) and "aggregate all
   errors" (module 02): when does each win, and why does Pydantic give you
   aggregation for free across fields but leave the choice to you inside a
   single validator?

<details>
<summary>Answers</summary>

1. `"not-a-date"` fails **type/syntactic** parsing — Pydantic can't build a
   `date` from it, so it's rejected *before* any semantic validator runs.
   `"3000-01-01"` parses fine (valid type and format) and is only rejected by
   the **semantic** `@field_validator` comparing to `date.today()`. Ordering
   matters because the semantic check assumes it's already a real date — you
   can't ask "is this date in the future" until you have a date.
2. Normalization (trim + lowercase) before comparing/storing. Validation only
   checks a value is *acceptable*; it doesn't make `Bob@x.com` and `bob@x.com`
   equal. Without collapsing them to one canonical form, the uniqueness check
   sees two different strings.
3. A field validator only receives its own field's value, not the others, so
   it can't compare the two. Use `@model_validator(mode="after")`, which sees
   the whole instance; it must `return self`.
4. Declarative: e.g. `age: int = Field(ge=0, le=150)` or `min_length` — a
   bound expressible as a simple constraint. Custom validator: e.g.
   "date_of_birth not in the future" or "password == confirm_password" —
   needs logic (comparison to `today()`, another field) a constraint can't
   express. The difference is whether the rule is a static constraint or
   requires computation/cross-referencing.
5. It's an enumeration oracle: an attacker submits many emails; "no user"
   vs "incorrect password" reveals which addresses have accounts, building a
   user list (and a target list for password attacks). Fix: one generic
   `"invalid email or password"` for both cases (ideally with matched
   timing).
6. Both should be `4xx` — `?page=abc` is a `422` (uncastable param);
   malformed JSON is a `400`. Both are client errors. Letting them become
   `500` pollutes error monitoring (which should flag *server* bugs) and can
   leak stack traces.
7. lowercase → `"j. d."`; strip non-alphanumerics → `"jd"`; length of `"jd"`
   is 2, which fails 3–20 → rejected. Checking length first would measure the
   raw `"J. D."` (length 5, passes) and wrongly accept an input that's only 2
   usable characters.
8. Fail fast wins for expensive/security-sensitive checks (skip a DB lookup
   if the format's already invalid; don't reveal which credential failed).
   Aggregate wins for form UX (report every field error in one response).
   Pydantic runs all field validators and collects their errors, so
   aggregation across fields is automatic; inside one validator you're
   writing imperative code, so you decide whether to stop at the first
   problem or gather several.

</details>

## Further reading & sources

- [Pydantic — Model validators](https://docs.pydantic.dev/latest/concepts/validators/#model-validators) - the reference for `@model_validator`, its `before`/`after` modes, and what each must return.
- [FastAPI — Handling Errors](https://fastapi.tiangolo.com/tutorial/handling-errors/) - custom exception handlers and overriding `RequestValidationError` to standardize your error envelope.
- [OWASP — Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) - why login/reset errors must be generic to avoid an account-enumeration oracle.
- [OWASP — WSTG: Testing for Account Enumeration](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account) - how attackers exploit message and timing differences to enumerate users.
- [MDN — 422 Unprocessable Content](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/422) - the status code FastAPI returns for semantic validation failures, and how it differs from 400.
- [MDN — 400 Bad Request](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400) - the right response for malformed JSON and other client-side syntax errors, versus a 500.

## Next

[03-middleware-fundamentals](../03-middleware-fundamentals/README.md) —
you've mastered validating and shaping the request body; now step back to the
layer that wraps *every* request before and after your handler runs:
middleware.
