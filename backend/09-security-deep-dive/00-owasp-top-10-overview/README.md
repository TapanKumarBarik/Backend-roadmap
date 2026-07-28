# Module 00: The OWASP Top 10 as a Way of Thinking

## Why this matters

Track 03 taught you to answer *who is this caller* and *what may they do*. This
track answers a harder, adjacent question: **assuming your auth is perfect, how
does an attacker get in anyway?** They don't. They attack the code *around* the
auth — the query that trusts a URL parameter, the template that echoes a
comment unescaped, the endpoint that fetches a URL the user supplied, the
password reset with no rate limit. Correct authentication (track 03) is
necessary and nowhere near sufficient.

The **OWASP Top 10** is the industry's shared vocabulary for those attacks — a
periodically-updated, data-driven list of the ten categories of web-application
security risk that show up most in real breaches. Nearly every job that touches
a backend will, at some point, expect you to know what "A03: Injection" or
"broken access control" means and roughly how to defend it. But the Top 10 is
routinely misused as a checklist you tick once and forget. That misses the
point. The value isn't the list; it's the **mental model** underneath it —
every item is a specific failure of one idea: *you trusted something you
shouldn't have.* This module installs that model so the rest of the track (each
module a deep dive into one or two categories) hangs off a single mental
skeleton instead of feeling like ten unrelated tricks.

## Concepts

### What the OWASP Top 10 is — and what it is not

OWASP (the Open Worldwide Application Security Project) is a nonprofit that
publishes free security guidance. Its flagship document, the **Top 10**, is a
*ranked awareness document*: OWASP gathers vulnerability data from hundreds of
organizations, groups the findings into categories, and ranks them by how
prevalent and impactful they are. The current edition (the 2021 list, with a
2025 refresh in progress) is the reference this track uses.

Crucially, it is **not**:

- **Not a standard or a certification.** "OWASP Top 10 compliant" is not a
  thing you can be. It's an awareness list, not a spec. (The real OWASP
  *standard* for that is the **ASVS** — Application Security Verification
  Standard — which is far more detailed.)
- **Not exhaustive.** Ten categories cannot cover every risk. Something absent
  from the Top 10 (say, a business-logic flaw) can still ruin you.
- **Not a checklist you complete once.** Security is not a state you reach; it's
  a property you continuously maintain as code and dependencies change. Treating
  the Top 10 as a one-time audit is the single most common way engineers misuse
  it.

Think of it as the *ten questions worth asking about every feature you ship*,
not ten boxes to tick before launch.

### The 2021 categories, walked through as a backend engineer

You don't need to memorize the exact ranking, but you should recognize each
category and know which are *your* problem as a backend engineer (most of them
are — the Top 10 is overwhelmingly a server-side list):

- **A01 Broken Access Control** — the #1 risk. A caller does something they
  shouldn't: reading another user's order by changing an ID in the URL (IDOR),
  hitting an admin route with no role check, editing a field they don't own.
  This is track 03's authorization material (RBAC/ABAC, the centralized
  permission layer, stopping IDOR) — the reason this track *depends on* track
  03 rather than re-teaching it.
- **A02 Cryptographic Failures** — sensitive data exposed because crypto was
  missing or wrong: plaintext passwords, no TLS, weak hashing, secrets in the
  clear. Track 03's password hashing lives here; this track's secrets-management
  module (05) extends it.
- **A03 Injection** — untrusted input interpreted as *code*: SQL, OS commands,
  NoSQL queries, and (OWASP folds it in here) XSS. **Module 01** and **02**.
- **A04 Insecure Design** — the flaw is in the *design*, not a bug in the code:
  a password reset with no rate limit, a "transfer money" flow with no
  confirmation, missing threat modeling. Can't be patched after the fact; has to
  be designed out. This is the "secure-by-design" theme running through the
  whole track.
- **A05 Security Misconfiguration** — default passwords, verbose error pages in
  production, unnecessary features enabled, **missing security headers**.
  **Module 06**.
- **A06 Vulnerable and Outdated Components** — you shipped a dependency with a
  known CVE. **Module 06** (dependency scanning).
- **A07 Identification and Authentication Failures** — weak login: no MFA,
  credential stuffing allowed, session fixation, guessable tokens. This is
  track 03's core; **module 04** (rate limiting) hardens it further.
- **A08 Software and Data Integrity Failures** — trusting code/data you
  shouldn't: insecure deserialization (Python `pickle`!), unsigned updates, a
  CI pipeline that runs untrusted code. **Module 03**.
- **A09 Security Logging and Monitoring Failures** — you got breached and
  *didn't notice*, or can't reconstruct what happened. Track 03's audit logging
  and track 08's observability.
- **A10 Server-Side Request Forgery (SSRF)** — you made your server fetch a URL
  the attacker chose, and it reached somewhere it shouldn't (internal services,
  cloud metadata). **Module 03**.

Notice how many collapse into one sentence: *the server trusted input it
shouldn't have.*

### The unifying model: trust boundaries and untrusted input

Here is the idea the whole list reduces to. Draw your system as regions
separated by **trust boundaries** — lines where data crosses from a place you
*don't* control into a place you *do*. The browser, the query string, request
headers, an uploaded file, a webhook body, a third-party API's response, even a
value you read back out of your own database that a user put there earlier — all
of it is **untrusted input** the moment it crosses into your code.

```
  UNTRUSTED (you don't control)     TRUST BOUNDARY      TRUSTED (your app)
  browser / query string / headers ──────┐
  uploaded file / webhook body ──────────┤   ┌─► SQL interpreter    (A03 injection)
  a third-party API's response ──────────┼───┼─► browser HTML parser (A03 XSS)
  a value a user stored earlier ─────────┘   ├─► HTTP client         (A10 SSRF)
                                             └─► deserializer        (A08 integrity)
       every Top 10 category = one crossing where "untrusted" wasn't enforced
```

Almost every Top 10 category is a specific failure to treat untrusted input as
untrusted at a specific boundary:

- Injection (A03): untrusted input crosses into a **SQL/shell/query
  interpreter** and gets treated as code.
- XSS (A03): untrusted input crosses into a **browser's HTML/JS parser** and
  gets treated as markup.
- SSRF (A10): an untrusted **URL** crosses into your **HTTP client** and gets
  treated as a legitimate destination.
- Deserialization (A08): untrusted **bytes** cross into a **deserializer** and
  get treated as trusted objects/code.
- Broken access control (A01): an untrusted **identifier** crosses into a data
  lookup and is trusted to be one the caller owns.

So the defensive reflex the whole track trains is a single habit: **at every
trust boundary, identify what's untrusted, and neutralize it for the specific
interpreter it's about to reach.** "Neutralize" is context-specific —
parameterize for SQL, escape for HTML, allowlist for URLs, `safe_load` for
data — which is exactly why there are ten categories and not one fix. But the
*question* is always the same.

### Attacker mindset vs the checklist mindset

The checklist mindset asks "did I add input validation?" and ticks the box. The
attacker mindset asks a different, more productive question: **"if I wanted to
abuse this endpoint, what would I try?"** That reframing is the actual skill.
For any feature, run through it:

- What does this trust? (The user id in the token? A field in the body? A
  header? A filename?)
- What's the worst thing that happens if that trusted thing is a lie?
- Can the caller reach something they shouldn't by changing an input?
- What am I *assuming* the client will send, that a `curl` command need not
  respect?

That last one is the crux: your frontend is a *convenience*, not a *control*.
Every constraint enforced only in JavaScript — the dropdown that limits choices,
the disabled button, the client-side length check — is trivially bypassed by an
attacker who talks to your API directly. **All security controls must live on
the server.** A huge fraction of real breaches are just someone `curl`-ing the
endpoint the UI never intended them to reach.

```
  What the UI lets a user do:   dropdown ─► [3 valid choices] ─► POST ─► server
  What curl can actually send:  anything ──────────────────────► POST ─► server
                                     ▲ the JS constraint never reaches the boundary
   the attacker mindset: find the boundary the frontend "guards" but the server doesn't
```

### Defense in depth and secure-by-design

Two principles that recur in every remaining module:

- **Defense in depth** — never rely on a single control. `SameSite` cookies
  *and* CSRF tokens; input validation *and* parameterized queries *and* least-
  privilege DB accounts. If one layer fails, the next still holds. The Top 10
  categories overlap on purpose; so should your defenses.
- **Secure by design (A04)** — the cheapest vulnerability to fix is the one you
  designed out before writing code. Rate limiting isn't a feature you bolt on
  after a brute-force incident; a "delete account" flow that requires
  re-authentication isn't a nice-to-have. Security decisions belong in the
  design phase, threat-modeled up front — because A04-class flaws (missing a
  control entirely) can't be patched, only redesigned. This is why every module
  in this track leads with *why the attack works* before *how to defend*: you
  can't design against a threat you don't understand.

## Command reference

There's no single tool for "the Top 10" — that's the point. This table maps
each category to the module and the core defensive reflex; treat it as the map
for the rest of the track.

| Category | Core failure | Primary defense | Covered in |
|---|---|---|---|
| A01 Broken Access Control | trusting an identifier/role | centralized authZ checks, deny by default | track 03 (m06/07) |
| A02 Cryptographic Failures | secrets/data in the clear | TLS, argon2, encrypt at rest | track 03 (m05), this m05 |
| A03 Injection (SQL/cmd/NoSQL) | input treated as code | parameterize / separate code from data | m01 |
| A03 Injection (XSS) | input treated as HTML/JS | output-encode, CSP | m02 |
| A04 Insecure Design | control missing by design | threat model, secure-by-design | whole track |
| A05 Security Misconfiguration | unsafe defaults, no headers | harden config, security headers | m06 |
| A06 Vulnerable Components | known-CVE dependency | scan + patch dependencies | m06 |
| A07 AuthN Failures | weak login | MFA, rate limit, lockout | track 03, m04 |
| A08 Integrity Failures | trusting untrusted code/data | no `pickle`, sign artifacts | m03 |
| A09 Logging/Monitoring | can't detect/investigate | audit log, alerting | track 03, track 08 |
| A10 SSRF | fetching an attacker's URL | allowlist egress, block metadata | m03 |

A minimal "what does this endpoint trust?" annotation habit, in code — a comment
discipline you can adopt today:

```python
from fastapi import APIRouter, Depends, Request
router = APIRouter()

@router.get("/orders/{order_id}")
def get_order(order_id: int, user=Depends(current_user)):
    # TRUST BOUNDARY: order_id comes from the URL — UNTRUSTED.
    #   Risk: A01 (IDOR) — caller may pass an order_id they don't own.
    #   Defense: scope the lookup to the authenticated user, never trust
    #   the id alone. `user` came from a verified token (track 03) — trusted.
    order = orders.get(id=order_id, owner_id=user.id)   # not orders.get(id=order_id)
    if order is None:
        raise HTTPException(404)      # 404 not 403 — don't confirm the row exists
    return order
```

## Hands-on exercises

You'll build/keep a small FastAPI app across this whole track — call it
`sec-track`. Reuse the `auth-track` you built in track 03 if you still have it;
these attacks are far more instructive against an app that actually has auth,
sessions, and a database. This first module is mostly analysis — you're building
the *lens* the later hands-on modules use.

### 1. Inventory your trust boundaries

Take `auth-track` (or any FastAPI app you have). List every place external data
enters: path/query params, request bodies, headers, cookies, uploaded files,
values read from the DB that a user wrote. For each, write one line: *what is
this, and what interpreter does it eventually reach* (SQL? HTML? shell? an HTTP
client?). Expected: a one-page map of untrusted inputs — this is a threat model
in miniature.

### 2. Map your endpoints to the Top 10

For each endpoint in your app, note which Top 10 categories it could plausibly
fall to. A `/search?q=` that hits the DB → A03. A `/orders/{id}` → A01. A
profile page rendering a user's bio → A03/XSS. Expected: you'll find most
endpoints expose two or three categories at once — that's normal, and it's why
defense in depth matters.

### 3. Rank your own risks

Given your map, rank *your* app's top three risks by likelihood × impact — not
by OWASP's global ranking. OWASP ranks by what's common *across all apps*; your
app's real risk order depends on what it does. Expected: a personalized top-3
that may look nothing like A01/A02/A03, and a written justification for each.

### 4. Frontend-is-not-a-control audit

Find one constraint your app (or `auth-track`) enforces only client-side — a
max length, a hidden field, a role-gated button, a dropdown of allowed values.
Reproduce a request that violates it with `curl` or the interactive docs,
bypassing the UI entirely. Expected: the "impossible" request succeeds,
viscerally proving that client-side constraints are cosmetic.

### 5. Attacker-mindset pass on one feature

Pick your most sensitive endpoint (login, password reset, or a money/data-
changing action). Write down five things an attacker would *try* against it —
not defenses, *attacks*. Then note which Top 10 category each maps to. Expected:
a threat list per feature — the input to designing defenses, and a preview of
modules 01-06.

### 6. Defense-in-depth for one input

Take a single untrusted input from exercise 1 and design *three independent*
controls that would each independently blunt its worst-case abuse. Expected: you
can articulate why any one alone is insufficient (what breaks if it's the only
layer) — the definition of defense in depth.

### 7. Diagnose and fix: read the incident like an analyst

You're handed this endpoint and a one-line incident report: *"a user reported
seeing someone else's invoice, and our logs show a spike of requests to
`/invoices/` with sequential ids."* Name the Top 10 category, explain the
attack in one sentence, and give the fix.

```python
@app.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int, user=Depends(current_user)):
    # auth (track 03) is correct: `user` is a verified, logged-in caller
    return db.query(Invoice).filter(Invoice.id == invoice_id).first()
```

<details>
<summary>Solution</summary>

Category: **A01 Broken Access Control** — specifically an **IDOR** (Insecure
Direct Object Reference). The attack: the caller is genuinely authenticated
(auth is fine), but the lookup trusts `invoice_id` alone and never checks that
the invoice *belongs to* the caller — so incrementing the id in the URL walks
straight through everyone's invoices. The "logs show sequential ids" is the
signature of exactly this enumeration. Fix: scope every object lookup to the
authenticated principal —
`db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.owner_id == user.id).first()`
— and return `404` (not `403`) on a miss so you don't even confirm the row
exists. Note that no amount of *authentication* hardening (track 03) fixes this;
it's an *authorization* failure, which is why A01 sits atop a list that assumes
your login already works.

</details>

## Independent challenge

No code given. Produce a **one-page threat model** for `auth-track` (or your
own FastAPI app). Enumerate its trust boundaries (exercise 1), list every
endpoint with the Top 10 categories it's exposed to (exercise 2), and for your
top three risks specify the *primary* defense and one *secondary* defense each
(defense in depth). Then write a short paragraph identifying one **A04 Insecure
Design** flaw — a control that's missing *by design*, not a code bug — and
explain why it can't simply be patched later. Reach back to **track 03's
authorization material** (RBAC and the centralized permission layer): show where
in your model the A01 defenses live, and why "we authenticate every request" is
not an answer to A01.

<details>
<summary>Hint</summary>

The trap in this exercise is treating "we have login" as covering A01 — it
doesn't. Authentication tells you *who*; A01 is entirely about *what they may
do once identified*, so its defenses are authorization checks scoped to the
resource, applied consistently and deny-by-default at a central chokepoint (not
sprinkled per-handler where one will inevitably be forgotten). For the A04
flaw, look for a control whose *absence* is the vulnerability — no rate limit on
login, no re-auth before a destructive action, no cap on password-reset
requests. You can't "fix the code" for these because there's no buggy line;
the design simply never included the control, so the fix is a design change.

</details>

## Common mistakes & troubleshooting

- **Treating the Top 10 as a checklist you complete once.** It's an awareness
  document, not a certification or a done-state. Security is maintained
  continuously as code and dependencies change.
- **Thinking "we have authentication, so we're secure."** AuthN (track 03) is
  necessary and nowhere near sufficient — A01 (authZ), A03 (injection), and most
  of the list assume your login already works and attack everything else.
- **Enforcing controls only in the frontend.** Client-side validation is UX,
  not security; every control must be re-enforced server-side because an
  attacker talks to your API directly.
- **Relying on a single control.** One defense will eventually fail or be
  bypassed; layer independent controls so a single failure isn't fatal.
- **Confusing the list's global ranking with your app's risk.** OWASP ranks by
  cross-industry prevalence; your actual top risks depend on what your app does
  — rank them yourself.
- **Ignoring A04 (Insecure Design).** The cheapest, most dangerous flaws are the
  controls you never designed in. Threat-model before you build, not after the
  incident.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the OWASP Top 10, and name two things it is *not*.
2. State the single mental model that unifies most of the Top 10 categories, and
   apply it to injection and to SSRF.
3. Why is "we authenticate every request" not a defense against A01 Broken
   Access Control?
4. What does "the frontend is not a security control" mean in practice, and how
   would you prove it about a specific constraint?
5. Give an example of an A04 Insecure Design flaw and explain why it can't be
   patched after the fact.
6. What is defense in depth, and why do the Top 10 categories deliberately
   overlap?

<details>
<summary>Answers</summary>

1. A ranked, data-driven *awareness document* of the ten most prevalent/
   impactful categories of web-app security risk, maintained by OWASP. It is
   *not* a standard/certification (you can't be "Top 10 compliant"), *not*
   exhaustive, and *not* a one-time checklist.
2. **Untrusted input crossing a trust boundary into an interpreter that treats
   it as more than data.** Injection: user input crosses into a SQL/shell
   interpreter and is executed as code. SSRF: an attacker-chosen URL crosses
   into your HTTP client and is fetched as a legitimate destination.
3. Because authentication only establishes *who* the caller is; A01 is about
   *what an already-identified caller is allowed to do*. A logged-in user
   changing an id in the URL to read someone else's record is fully
   authenticated — the failure is a missing authorization check scoped to the
   resource.
4. Any constraint enforced only in JavaScript (length limits, hidden fields,
   disabled buttons, dropdown choices) is trivially bypassed by talking to the
   API directly, so all controls must be re-enforced server-side. Prove it by
   reproducing a UI-forbidden request with `curl`/the docs and watching it
   succeed.
5. E.g. a password-reset or login endpoint with no rate limit, or a destructive
   action with no re-authentication. There's no buggy line to patch — the
   control was simply never part of the design — so the fix is a design change,
   not a code fix.
6. Layering multiple independent controls so that if one fails or is bypassed,
   another still holds (e.g. `SameSite` cookies *and* CSRF tokens). The
   categories overlap because real attacks chain across them, so your defenses
   should overlap too — no single control covers everything.

</details>

## Further reading & sources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - the canonical awareness document this whole module and track are built around.
- [OWASP Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/) - the detailed, testable *standard* the Top 10 is often mistaken for.
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) - practical, per-topic defensive guidance you'll return to for every later module.
- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling) - how to systematically find trust boundaries and enumerate what crosses them.
- [CWE - Common Weakness Enumeration](https://cwe.mitre.org/) - MITRE's catalog of specific weakness classes each Top 10 category maps onto.

## Next

[01-injection-attacks](../01-injection-attacks/README.md) — with the
trust-boundary lens installed, we start at the top of the injection family
(A03): SQL, command, and NoSQL injection. You'll write the vulnerable version,
exploit it yourself, then apply the one fix that kills the entire class —
separating code from data — with parameterized queries and ORMs.
